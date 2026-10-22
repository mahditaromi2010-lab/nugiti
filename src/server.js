require('dotenv').config();
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.resolve(ROOT, process.env.UPLOAD_DIR || 'uploads');
const COVERS_DIR = path.join(UPLOAD_DIR, 'covers');
const PRIVATE_DIR = path.join(UPLOAD_DIR, 'private');
const IS_PROD = process.env.NODE_ENV === 'production';
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
let settingsCache = { site_name: 'Nogiti', site_tagline: 'ابزارهای مهندسی و آموزش تخصصی تأسیسات' };

for (const dir of [UPLOAD_DIR, COVERS_DIR, PRIVATE_DIR]) fs.mkdirSync(dir, { recursive: true });
if (IS_PROD && (!process.env.APP_SECRET || process.env.APP_SECRET.length < 32 || /^(replace|change|your)[-_]/i.test(process.env.APP_SECRET))) {
  throw new Error('در محیط production باید APP_SECRET تصادفی و حداقل ۳۲ نویسه باشد.');
}
if (!process.env.DATABASE_URL) console.warn('هشدار: DATABASE_URL تنظیم نشده است؛ سرور بدون اتصال به دیتابیس کار نخواهد کرد.');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_POOL_SIZE || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: IS_PROD ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '256kb' }));
app.use('/public', express.static(path.join(ROOT, 'public'), { maxAge: IS_PROD ? '7d' : 0 }));
app.use('/media/covers', express.static(COVERS_DIR, { maxAge: IS_PROD ? '1d' : 0, index: false, dotfiles: 'deny' }));
app.use(session({
  store: new PgSession({ pool, tableName: 'web_sessions', createTableIfMissing: true }),
  name: 'nugas.sid',
  secret: process.env.APP_SECRET || 'local-development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, secure: IS_PROD && APP_URL.startsWith('https://'), sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const digitsEnglish = value => String(value || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const slugBase = text => String(text || '').trim().toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 160) || `item-${Date.now()}`;
const money = value => `${new Intl.NumberFormat('fa-IR').format(Number(value || 0))} تومان`;
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
const isWebUrl = s => { try { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol); } catch { return false; } };
const setFlash = (req, type, message) => { req.session.flash = { type, message }; };
const csrfGuard = (req, res, next) => {
  if (req.method !== 'POST' || req.is('multipart/form-data')) return next();
  if (!safeEqual(req.session.csrfToken, req.body?._csrf)) return res.status(403).render('error', { title: 'درخواست نامعتبر', message: 'اعتبار فرم منقضی شده است. صفحه را تازه‌سازی کنید و دوباره تلاش کنید.' });
  next();
};
app.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.money = money;
  res.locals.siteName = settingsCache.site_name || 'Nogiti';
  res.locals.siteTagline = settingsCache.site_tagline || 'مهندسی با اطمینان';
  res.locals.currentUser = null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});
app.use(csrfGuard);
app.use(asyncRoute(async (req, res, next) => {
  if (req.session.userId) {
    const u = await pool.query('SELECT id, phone, first_name, last_name, role, branch, field, is_active FROM users WHERE id=$1', [req.session.userId]);
    if (!u.rowCount || !u.rows[0].is_active) {
      req.session.userId = null;
      req.session.role = null;
    } else {
      req.user = u.rows[0];
      res.locals.currentUser = req.user;
    }
  }
  next();
}));

const rateOptions = (limit, windowMs = 15 * 60 * 1000) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).render('error', { title: 'درخواست‌های زیاد', message: 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره امتحان کنید.' })
});
const adminLoginLimiter = rateOptions(8);
const verifyCodeLimiter = rateOptions(8);
const otpLimiter = rateOptions(3, 10 * 60 * 1000);
const requireAuth = (req, res, next) => {
  if (!req.user) { setFlash(req, 'info', 'برای ادامه ابتدا وارد حساب کاربری شوید.'); return req.session.save(() => res.redirect('/login')); }
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    if (req.method === 'GET') return res.status(403).render('error', { title: 'دسترسی مجاز نیست', message: 'این بخش فقط برای مدیران مجاز است.' });
    return res.status(403).send('Forbidden');
  }
  next();
};

const coverExtensionByType = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const coverStorage = multer.diskStorage({ destination: (_req, _file, cb) => cb(null, COVERS_DIR), filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${coverExtensionByType[file.mimetype] || '.img'}`) });
const privateStorage = multer.diskStorage({ destination: (_req, _file, cb) => cb(null, PRIVATE_DIR), filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) });
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const allowedAssetMimesByExtension = {
  '.pdf': new Set(['application/pdf', 'application/octet-stream']),
  '.mp4': new Set(['video/mp4', 'application/octet-stream']),
  '.webm': new Set(['video/webm', 'application/octet-stream']),
  '.zip': new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream'])
};
const maxFileSize = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 100)) * 1024 * 1024;
const coverUpload = multer({ storage: coverStorage, limits: { fileSize: 8 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => cb(allowedImageTypes.has(file.mimetype) ? null : new Error('File type rejected'), allowedImageTypes.has(file.mimetype)) });
const articleUpload = multer({ storage: coverStorage, limits: { fileSize: 8 * 1024 * 1024, files: 11 }, fileFilter: (_req, file, cb) => cb(allowedImageTypes.has(file.mimetype) ? null : new Error('File type rejected'), allowedImageTypes.has(file.mimetype)) }).fields([{ name: 'cover', maxCount: 1 }, { name: 'inline_images', maxCount: 10 }]);
const assetUpload = multer({ storage: privateStorage, limits: { fileSize: maxFileSize, files: 1 }, fileFilter: (_req, file, cb) => { const ext = path.extname(file.originalname).toLowerCase(); const ok = !!allowedAssetMimesByExtension[ext]?.has(file.mimetype); cb(ok ? null : new Error('File type rejected'), ok); } });
const assetCsrf = (req, res, next) => {
  if (!safeEqual(req.session.csrfToken, req.body?._csrf)) return res.status(403).render('error', { title: 'درخواست نامعتبر', message: 'اعتبار فرم منقضی شده است. صفحه را تازه‌سازی کنید و دوباره تلاش کنید.' });
  next();
};

async function getSettings() {
  try {
    const r = await pool.query('SELECT setting_key, setting_value FROM site_settings');
    settingsCache = { ...settingsCache, ...Object.fromEntries(r.rows.map(x => [x.setting_key, x.setting_value])) };
  } catch { /* Keep the last known public settings when storage is temporarily unavailable. */ }
  return { ...settingsCache };
}
async function uniqueSlug(table, title, id = null) {
  if (!['products', 'articles'].includes(table)) throw new Error('Invalid table');
  const base = slugBase(title);
  let slug = base;
  let i = 2;
  while (true) {
    const args = id ? [slug, id] : [slug];
    const q = id ? `SELECT 1 FROM ${table} WHERE slug=$1 AND id<>$2 LIMIT 1` : `SELECT 1 FROM ${table} WHERE slug=$1 LIMIT 1`;
    const found = await pool.query(q, args);
    if (!found.rowCount) return slug;
    slug = `${base}-${i++}`;
  }
}
function acceptableCoverValue(file, value) {
  if (file) return `/media/covers/${file.filename}`;
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.startsWith('/media/covers/')) return v;
  try { return new URL(v).protocol === 'https:' ? v : ''; } catch { return ''; }
}
function normalizeText(value, max = 10000) { return String(value || '').trim().slice(0, max); }
function htmlParagraphs(value, articleImages = []) {
  const imageMap = new Map(articleImages.map(image => [String(image.id), image]));
  return String(value || '').split(/\r?\n/).map(line => {
    const text = line.trim();
    if (!text) return '';
    const marker = text.match(/^\[\[image:(\d+)\]\]$/i);
    if (marker) {
      const image = imageMap.get(marker[1]);
      if (!image) return '';
      return `<figure class="inline-article-image"><img src="${escapeHtml(image.image_path)}" alt="${escapeHtml(image.alt_text || '')}" loading="lazy"><figcaption>${escapeHtml(image.alt_text || '')}</figcaption></figure>`;
    }
    return `<p>${escapeHtml(text)}</p>`;
  }).join('');
}
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }

// Public pages
app.get('/', asyncRoute(async (req, res) => {
  const [settings, products, articles] = await Promise.all([
    getSettings(),
    pool.query("SELECT * FROM products WHERE status='published' ORDER BY featured DESC, created_at DESC LIMIT 3"),
    pool.query("SELECT * FROM articles WHERE status='published' ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 3")
  ]);
  res.render('home', { title: 'خانه', settings, products: products.rows, articles: articles.rows });
}));
app.get('/shop', asyncRoute(async (req, res) => {
  const type = ['course', 'plugin'].includes(req.query.type) ? req.query.type : '';
  const q = normalizeText(req.query.q, 100);
  const params = [];
  let where = "status='published'";
  if (type) { params.push(type); where += ` AND product_type=$${params.length}`; }
  if (q) { params.push(`%${q}%`); where += ` AND (title ILIKE $${params.length} OR short_description ILIKE $${params.length} OR category ILIKE $${params.length})`; }
  const products = await pool.query(`SELECT * FROM products WHERE ${where} ORDER BY featured DESC, created_at DESC`, params);
  res.render('shop', { title: 'فروشگاه', products: products.rows, type, q });
}));
app.get('/shop/:slug', asyncRoute(async (req, res) => {
  const p = await pool.query("SELECT * FROM products WHERE slug=$1 AND status='published'", [req.params.slug]);
  if (!p.rowCount) return res.status(404).render('error', { title: 'محصول پیدا نشد', message: 'این محصول وجود ندارد یا در حال حاضر منتشر نشده است.' });
  const product = p.rows[0];
  let owned = false;
  if (req.user) {
    const own = await pool.query("SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=$1 AND o.status='paid' AND oi.product_id=$2 LIMIT 1", [req.user.id, product.id]);
    owned = !!own.rowCount;
  }
  const assets = await pool.query('SELECT id,title,asset_kind,is_preview,sort_order FROM product_assets WHERE product_id=$1 ORDER BY sort_order,id', [product.id]);
  res.render('product', { title: product.title, product, assets: assets.rows, owned });
}));
app.get('/articles', asyncRoute(async (req, res) => {
  const q = normalizeText(req.query.q, 100);
  const params = [];
  let sql = "SELECT * FROM articles WHERE status='published'";
  if (q) { params.push(`%${q}%`); sql += ` AND (title ILIKE $1 OR excerpt ILIKE $1 OR category ILIKE $1)`; }
  sql += ' ORDER BY published_at DESC NULLS LAST, created_at DESC';
  const articles = await pool.query(sql, params);
  res.render('articles', { title: 'مقالات تخصصی', articles: articles.rows, q });
}));
app.get('/articles/:slug', asyncRoute(async (req, res) => {
  const r = await pool.query("SELECT * FROM articles WHERE slug=$1 AND status='published'", [req.params.slug]);
  if (!r.rowCount) return res.status(404).render('error', { title: 'مقاله پیدا نشد', message: 'این مقاله وجود ندارد یا منتشر نشده است.' });
  const article = r.rows[0];
  const images = await pool.query('SELECT id,image_path,alt_text,sort_order FROM article_images WHERE article_id=$1 ORDER BY sort_order,id', [article.id]);
  res.render('article', { title: article.title, article, contentHtml: htmlParagraphs(article.content, images.rows) });
}));
app.get('/about', asyncRoute(async (req, res) => res.render('about', { title: 'درباره Nogiti', settings: await getSettings() })));
app.get('/tools', (_req, res) => res.render('tools', { title: 'ابزارهای تأسیسات' }));

// OTP authentication
app.get('/login', (req, res) => res.render('login', { title: 'ورود به حساب', step: req.query.step === 'code' ? 'code' : 'phone', devOtp: !IS_PROD && process.env.SHOW_DEV_OTP === 'true' ? req.session.devOtp : null }));
app.post('/auth/request-code', otpLimiter, asyncRoute(async (req, res) => {
  const phone = digitsEnglish(req.body.phone).replace(/[\s-]/g, '');
  const firstName = normalizeText(req.body.firstName, 100);
  const lastName = normalizeText(req.body.lastName, 100);
  if (!/^09\d{9}$/.test(phone)) { setFlash(req, 'error', 'شمارهٔ موبایل معتبر نیست؛ قالب درست 09xxxxxxxxx است.'); return res.redirect('/login'); }
  const recent = await pool.query("SELECT 1 FROM otp_codes WHERE phone=$1 AND created_at > NOW() - INTERVAL '60 seconds' AND consumed_at IS NULL LIMIT 1", [phone]);
  if (recent.rowCount) { setFlash(req, 'info', 'برای این شماره اخیراً کد صادر شده است؛ یک دقیقه صبر کنید.'); return res.redirect('/login'); }
  const code = String(crypto.randomInt(100000, 1000000));
  const hash = crypto.createHash('sha256').update(`${phone}:${code}:${process.env.APP_SECRET || 'dev'}`).digest('hex');
  await pool.query('INSERT INTO otp_codes(phone,code_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL \'5 minutes\')', [phone, hash]);
  const message = `کد ورود Nogiti: ${code}\nاعتبار: ۵ دقیقه`;
  if (process.env.KAVENEGAR_API_KEY) {
    try {
      const body = new URLSearchParams({ receptor: phone, message });
      if (process.env.KAVENEGAR_SENDER) body.set('sender', process.env.KAVENEGAR_SENDER);
      const response = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(process.env.KAVENEGAR_API_KEY)}/sms/send.json`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(8000) });
      const result = await response.json();
      if (!response.ok || result?.return?.status !== 200) throw new Error('SMS provider rejected request');
      req.session.devOtp = null;
    } catch (err) {
      console.error('Kavenegar request failed:', err.message);
      setFlash(req, 'error', 'ارسال پیامک ناموفق بود. تنظیمات سرویس پیامک را بررسی کنید.');
      return res.redirect('/login');
    }
  } else if (IS_PROD) {
    setFlash(req, 'error', 'سرویس پیامک هنوز پیکربندی نشده است. با مدیر سایت تماس بگیرید.');
    return res.redirect('/login');
  } else {
    console.log(`[Nogiti DEV OTP] ${phone}: ${code}`);
    req.session.devOtp = process.env.SHOW_DEV_OTP === 'true' ? code : null;
  }
  req.session.loginDraft = { phone, firstName, lastName };
  setFlash(req, 'success', 'کد تأیید ارسال شد. کد تا ۵ دقیقه معتبر است.');
  res.redirect('/login?step=code');
}));
app.post('/auth/verify-code', verifyCodeLimiter, asyncRoute(async (req, res) => {
  const code = digitsEnglish(req.body.code).trim();
  const draft = req.session.loginDraft;
  if (!draft || !/^\d{6}$/.test(code)) { setFlash(req, 'error', 'درخواست ورود نامعتبر است؛ دوباره کد بگیرید.'); return res.redirect('/login'); }
  const q = await pool.query('SELECT * FROM otp_codes WHERE phone=$1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1', [draft.phone]);
  if (!q.rowCount || new Date(q.rows[0].expires_at) < new Date() || q.rows[0].attempts >= 5) {
    setFlash(req, 'error', 'کد منقضی شده یا تعداد تلاش‌ها بیش از حد مجاز است.'); return res.redirect('/login');
  }
  const actual = crypto.createHash('sha256').update(`${draft.phone}:${code}:${process.env.APP_SECRET || 'dev'}`).digest('hex');
  await pool.query('UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1', [q.rows[0].id]);
  if (!safeEqual(actual, q.rows[0].code_hash)) { setFlash(req, 'error', 'کد واردشده درست نیست.'); return res.redirect('/login?step=code'); }
  await pool.query('UPDATE otp_codes SET consumed_at=NOW() WHERE id=$1', [q.rows[0].id]);
  const userRes = await pool.query(`INSERT INTO users(phone,first_name,last_name) VALUES($1,$2,$3)
    ON CONFLICT(phone) DO UPDATE SET first_name=CASE WHEN EXCLUDED.first_name<>'' THEN EXCLUDED.first_name ELSE users.first_name END,
    last_name=CASE WHEN EXCLUDED.last_name<>'' THEN EXCLUDED.last_name ELSE users.last_name END,updated_at=NOW() RETURNING id,role`, [draft.phone, draft.firstName, draft.lastName]);
  if (userRes.rows[0].role === 'admin') {
    req.session.loginDraft = null;
    req.session.devOtp = null;
    setFlash(req, 'info', 'برای ورود به بخش مدیریت، لطفاً با شماره مدیر و گذرواژه وارد شوید.');
    return res.redirect('/admin/login');
  }
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = userRes.rows[0].id;
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  setFlash(req, 'success', 'با موفقیت وارد حساب کاربری شدید.');
  res.redirect('/account');
}));
app.post('/logout', (req, res) => req.session.destroy(() => { res.clearCookie('nugas.sid'); res.redirect('/'); }));

// Customer account and learning library
app.get('/account', requireAuth, asyncRoute(async (req, res) => {
  const [orders, library] = await Promise.all([
    pool.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [req.user.id]),
    pool.query("SELECT p.*, MAX(o.paid_at) AS paid_at, COALESCE((SELECT json_agg(json_build_object('id',a.id,'title',a.title,'asset_kind',a.asset_kind) ORDER BY a.sort_order,a.id) FROM product_assets a WHERE a.product_id=p.id),'[]'::json) AS assets FROM products p JOIN order_items oi ON oi.product_id=p.id JOIN orders o ON o.id=oi.order_id WHERE o.user_id=$1 AND o.status='paid' GROUP BY p.id ORDER BY MAX(o.paid_at) DESC", [req.user.id])
  ]);
  res.render('account', { title: 'حساب کاربری', orders: orders.rows, library: library.rows });
}));
app.post('/account/profile', requireAuth, asyncRoute(async (req, res) => {
  const firstName = normalizeText(req.body.firstName, 100);
  const lastName = normalizeText(req.body.lastName, 100);
  const branch = normalizeText(req.body.branch, 80);
  const field = normalizeText(req.body.field, 100);
  if (!firstName || !lastName) { setFlash(req, 'error', 'نام و نام خانوادگی الزامی است.'); return res.redirect('/account'); }
  await pool.query('UPDATE users SET first_name=$1,last_name=$2,branch=$3,field=$4,updated_at=NOW() WHERE id=$5', [firstName, lastName, branch, field, req.user.id]);
  setFlash(req, 'success', 'پروفایل به‌روزرسانی شد.'); res.redirect('/account');
}));

// Orders and verified ZarinPal checkout; no access is granted from the callback query alone.
app.post('/checkout/:id', requireAuth, asyncRoute(async (req, res) => {
  const productRes = await pool.query("SELECT * FROM products WHERE id=$1 AND status='published'", [req.params.id]);
  if (!productRes.rowCount) { setFlash(req, 'error', 'محصول در دسترس نیست.'); return res.redirect('/shop'); }
  const product = productRes.rows[0];
  const already = await pool.query("SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=$1 AND o.status='paid' AND oi.product_id=$2", [req.user.id, product.id]);
  if (already.rowCount) { setFlash(req, 'info', 'این محصول قبلاً در کتابخانهٔ شما فعال شده است.'); return res.redirect('/account'); }
  if (!process.env.ZARINPAL_MERCHANT_ID) { setFlash(req, 'error', 'درگاه پرداخت هنوز تنظیم نشده است؛ لطفاً بعداً مراجعه کنید.'); return res.redirect(`/shop/${product.slug}`); }
  const client = await pool.connect();
  let orderId;
  try {
    await client.query('BEGIN');
    const o = await client.query("INSERT INTO orders(user_id,total_toman,status) VALUES($1,$2,'pending') RETURNING id", [req.user.id, product.price_toman]);
    orderId = o.rows[0].id;
    await client.query('INSERT INTO order_items(order_id,product_id,title_snapshot,price_toman) VALUES($1,$2,$3,$4)', [orderId, product.id, product.title, product.price_toman]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  try {
    const amountRial = Number(product.price_toman) * 10;
    if (!Number.isSafeInteger(amountRial) || amountRial < 1000) throw new Error('مبلغ محصول باید معتبر و حداقل قابل پذیرش درگاه باشد.');
    const callback = `${APP_URL}/payments/zarinpal/callback?orderId=${encodeURIComponent(orderId)}`;
    const base = process.env.ZARINPAL_SANDBOX === 'false' ? 'https://api.zarinpal.com' : 'https://sandbox.zarinpal.com';
    const response = await fetch(`${base}/pg/v4/payment/request.json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ merchant_id: process.env.ZARINPAL_MERCHANT_ID, amount: amountRial, currency: 'IRR', description: `خرید ${product.title}`.slice(0, 240), callback_url: callback, metadata: { mobile: req.user.phone } }), signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok || data?.data?.code !== 100 || !data.data.authority) throw new Error(`ZarinPal request failed: ${data?.errors?.message || data?.data?.message || response.status}`);
    await pool.query('UPDATE orders SET authority=$1,updated_at=NOW() WHERE id=$2 AND status=\'pending\'', [data.data.authority, orderId]);
    const gateway = process.env.ZARINPAL_SANDBOX === 'false' ? 'https://www.zarinpal.com' : 'https://sandbox.zarinpal.com';
    return res.redirect(`${gateway}/pg/StartPay/${encodeURIComponent(data.data.authority)}`);
  } catch (err) {
    console.error(err.message);
    await pool.query("UPDATE orders SET status='failed',updated_at=NOW() WHERE id=$1 AND status='pending'", [orderId]);
    setFlash(req, 'error', 'ایجاد تراکنش ناموفق بود. تنظیمات درگاه و واحد پول را بررسی کنید.');
    res.redirect(`/shop/${product.slug}`);
  }
}));
app.get('/payments/zarinpal/callback', asyncRoute(async (req, res) => {
  const orderId = digitsEnglish(req.query.orderId).trim();
  const authority = String(req.query.Authority || '').trim();
  const status = String(req.query.Status || '').toUpperCase();
  if (!/^\d+$/.test(orderId) || !authority) return res.status(400).render('payment-result', { title: 'پرداخت نامعتبر', ok: false, message: 'اطلاعات بازگشت از درگاه کامل نیست.' });
  const found = await pool.query('SELECT * FROM orders WHERE id=$1 AND authority=$2', [orderId, authority]);
  if (!found.rowCount) return res.status(404).render('payment-result', { title: 'سفارش پیدا نشد', ok: false, message: 'سفارش متناظر با این پرداخت پیدا نشد.' });
  const order = found.rows[0];
  if (order.status === 'paid') return res.render('payment-result', { title: 'پرداخت موفق', ok: true, message: 'پرداخت قبلاً تأیید شده و محصول در کتابخانهٔ شما فعال است.' });
  if (status !== 'OK' || order.status !== 'pending') {
    await pool.query("UPDATE orders SET status='failed',updated_at=NOW() WHERE id=$1 AND status='pending'", [order.id]);
    return res.render('payment-result', { title: 'پرداخت انجام نشد', ok: false, message: 'پرداخت لغو شد یا توسط درگاه تأیید نشد. در صورت کسر وجه با پشتیبانی درگاه تماس بگیرید.' });
  }
  try {
    const amountRial = Number(order.total_toman) * 10;
    const base = process.env.ZARINPAL_SANDBOX === 'false' ? 'https://api.zarinpal.com' : 'https://sandbox.zarinpal.com';
    const response = await fetch(`${base}/pg/v4/payment/verify.json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ merchant_id: process.env.ZARINPAL_MERCHANT_ID, amount: amountRial, authority }), signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    const code = Number(data?.data?.code);
    if (!response.ok || ![100, 101].includes(code) || !data?.data?.ref_id) throw new Error(`ZarinPal verification rejected: ${data?.errors?.message || data?.data?.message || code}`);
    const ref = String(data.data.ref_id);
    const changed = await pool.query("UPDATE orders SET status='paid',ref_id=$1,paid_at=NOW(),updated_at=NOW() WHERE id=$2 AND status='pending' AND authority=$3 RETURNING id", [ref, order.id, authority]);
    if (!changed.rowCount) {
      const fresh = await pool.query('SELECT status FROM orders WHERE id=$1', [order.id]);
      if (fresh.rows[0]?.status !== 'paid') throw new Error('Order state changed during verification');
    }
    return res.render('payment-result', { title: 'پرداخت موفق', ok: true, message: `پرداخت تأیید شد. کد پیگیری: ${ref}. محصول در حساب کاربری فعال شده است.` });
  } catch (err) {
    console.error(err.message);
    return res.status(502).render('payment-result', { title: 'تأیید پرداخت ناموفق', ok: false, message: 'در حال حاضر تأیید پرداخت از درگاه ممکن نشد. از تکرار پرداخت خودداری کنید و با پشتیبانی تماس بگیرید.' });
  }
}));

// Gated course/plugin files. Private uploads are never exposed through express.static.
app.get('/secure-assets/:id', asyncRoute(async (req, res) => {
  const result = await pool.query(`SELECT a.*,p.id AS parent_product_id,p.slug AS product_slug,p.title AS product_title,p.status AS product_status
    FROM product_assets a JOIN products p ON p.id=a.product_id WHERE a.id=$1`, [req.params.id]);
  if (!result.rowCount) return res.status(404).render('error', { title: 'فایل پیدا نشد', message: 'این فایل در دسترس نیست.' });
  const asset = result.rows[0];
  let allowed = !!(req.user && req.user.role === 'admin') || (asset.is_preview && asset.product_status === 'published');
  if (!allowed && req.user) {
    const paid = await pool.query("SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=$1 AND o.status='paid' AND oi.product_id=$2 LIMIT 1", [req.user.id, asset.parent_product_id]);
    allowed = !!paid.rowCount;
  }
  if (!allowed && !req.user) { setFlash(req, 'info', 'برای دسترسی به محتوای کامل ابتدا وارد حساب شوید.'); return req.session.save(() => res.redirect('/login')); }
  if (!allowed && asset.product_status !== 'published') return res.status(404).render('error', { title: 'محتوا در دسترس نیست', message: 'این محتوا اکنون منتشر نشده است.' });
  if (!allowed) { setFlash(req, 'info', 'برای دسترسی به این محتوا ابتدا محصول را خریداری کنید.'); return req.session.save(() => res.redirect(`/shop/${asset.product_slug}`)); }
  if (asset.external_url) return res.redirect(asset.external_url);
  if (!asset.file_key) return res.status(404).render('error', { title: 'فایل موجود نیست', message: 'فایل هنوز بارگذاری نشده است.' });
  const filePath = path.join(PRIVATE_DIR, path.basename(asset.file_key));
  if (!fs.existsSync(filePath)) return res.status(404).render('error', { title: 'فایل موجود نیست', message: 'فایل از فضای ذخیره‌سازی پیدا نشد.' });
  if (asset.asset_kind === 'video') res.setHeader('Content-Type', asset.file_key.endsWith('.webm') ? 'video/webm' : 'video/mp4');
  else if (asset.asset_kind === 'pdf') res.setHeader('Content-Type', 'application/pdf');
  else res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(asset.file_key))}`);
  res.sendFile(filePath);
}));

// Admin area (every route checks the server-side role).
app.get('/admin/login', (req, res) => res.render('admin/login', { title: 'ورود مدیر' }));
app.post('/admin/login', adminLoginLimiter, asyncRoute(async (req, res) => {
  const phone = digitsEnglish(req.body.phone).trim();
  const password = String(req.body.password || '');
  const row = await pool.query(`SELECT u.id,u.role,u.is_active,c.password_hash FROM users u JOIN admin_credentials c ON c.user_id=u.id WHERE u.phone=$1`, [phone]);
  if (!row.rowCount || row.rows[0].role !== 'admin' || !row.rows[0].is_active || !(await bcrypt.compare(password, row.rows[0].password_hash))) {
    setFlash(req, 'error', 'شماره یا گذرواژه مدیر صحیح نیست.'); return res.redirect('/admin/login');
  }
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = row.rows[0].id;
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  setFlash(req, 'success', 'ورود مدیر موفق بود.'); res.redirect('/admin');
}));
app.get('/admin', requireAdmin, asyncRoute(async (req, res) => {
  const stats = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role='user'"),
    pool.query("SELECT COUNT(*)::int AS n FROM products WHERE status='published'"),
    pool.query("SELECT COUNT(*)::int AS n FROM articles WHERE status='published'"),
    pool.query("SELECT COUNT(*)::int AS n FROM orders WHERE status='paid'"),
    pool.query("SELECT COALESCE(SUM(total_toman),0)::bigint AS n FROM orders WHERE status='paid'"),
    pool.query('SELECT o.*,u.phone,u.first_name,u.last_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 8')
  ]);
  res.render('admin/dashboard', { title: 'مدیریت سایت', stats: stats.slice(0,5).map(x => x.rows[0].n), orders: stats[5].rows });
}));
app.get('/admin/products', requireAdmin, asyncRoute(async (req, res) => {
  const r = await pool.query('SELECT p.*, (SELECT COUNT(*)::int FROM product_assets a WHERE a.product_id=p.id) AS asset_count FROM products p ORDER BY p.updated_at DESC');
  res.render('admin/products', { title: 'مدیریت محصولات', products: r.rows });
}));
app.get('/admin/products/new', requireAdmin, (_req, res) => res.render('admin/product-form', { title: 'محصول جدید', product: null, assets: [] }));
app.post('/admin/products', requireAdmin, coverUpload.single('cover'), assetCsrf, asyncRoute(async (req, res) => {
  const title = normalizeText(req.body.title, 180);
  const type = ['course', 'plugin'].includes(req.body.product_type) ? req.body.product_type : 'course';
  const price = Number(digitsEnglish(req.body.price_toman));
  if (!title || !Number.isSafeInteger(price) || price < 100) { setFlash(req, 'error', 'عنوان و قیمت معتبر الزامی است.'); return res.redirect('/admin/products/new'); }
  const slug = await uniqueSlug('products', normalizeText(req.body.slug, 160) || title);
  const cover = acceptableCoverValue(req.file, req.body.cover_url);
  const saved = await pool.query(`INSERT INTO products(slug,title,subtitle,product_type,category,short_description,description,price_toman,cover_image,status,featured)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [slug, title, normalizeText(req.body.subtitle, 240), type, normalizeText(req.body.category, 100), normalizeText(req.body.short_description, 500), normalizeText(req.body.description, 20000), price, cover, ['draft','published','archived'].includes(req.body.status) ? req.body.status : 'draft', req.body.featured === 'on']);
  setFlash(req, 'success', 'محصول ساخته شد. حالا می‌توانید محتوا و فایل‌هایش را اضافه کنید.'); res.redirect(`/admin/products/${saved.rows[0].id}/edit`);
}));
app.get('/admin/products/:id/edit', requireAdmin, asyncRoute(async (req, res) => {
  const [p, a] = await Promise.all([pool.query('SELECT * FROM products WHERE id=$1', [req.params.id]), pool.query('SELECT * FROM product_assets WHERE product_id=$1 ORDER BY sort_order,id', [req.params.id])]);
  if (!p.rowCount) return res.status(404).render('error', { title: 'محصول پیدا نشد', message: 'این محصول وجود ندارد.' });
  res.render('admin/product-form', { title: 'ویرایش محصول', product: p.rows[0], assets: a.rows });
}));
app.post('/admin/products/:id/edit', requireAdmin, coverUpload.single('cover'), assetCsrf, asyncRoute(async (req, res) => {
  const existing = await pool.query('SELECT * FROM products WHERE id=$1', [req.params.id]);
  if (!existing.rowCount) return res.status(404).send('Not found');
  const title = normalizeText(req.body.title, 180);
  const price = Number(digitsEnglish(req.body.price_toman));
  const type = ['course', 'plugin'].includes(req.body.product_type) ? req.body.product_type : existing.rows[0].product_type;
  if (!title || !Number.isSafeInteger(price) || price < 100) { setFlash(req, 'error', 'عنوان و قیمت معتبر الزامی است.'); return res.redirect(`/admin/products/${req.params.id}/edit`); }
  const slug = await uniqueSlug('products', normalizeText(req.body.slug, 160) || title, req.params.id);
  const cover = acceptableCoverValue(req.file, req.body.cover_url) || existing.rows[0].cover_image;
  await pool.query(`UPDATE products SET slug=$1,title=$2,subtitle=$3,product_type=$4,category=$5,short_description=$6,description=$7,price_toman=$8,cover_image=$9,status=$10,featured=$11,updated_at=NOW() WHERE id=$12`, [slug,title,normalizeText(req.body.subtitle,240),type,normalizeText(req.body.category,100),normalizeText(req.body.short_description,500),normalizeText(req.body.description,20000),price,cover,['draft','published','archived'].includes(req.body.status)?req.body.status:'draft',req.body.featured==='on',req.params.id]);
  setFlash(req, 'success', 'محصول به‌روزرسانی شد.'); res.redirect(`/admin/products/${req.params.id}/edit`);
}));
app.post('/admin/products/:id/assets', requireAdmin, assetUpload.single('assetFile'), assetCsrf, asyncRoute(async (req, res) => {
  const product = await pool.query('SELECT id FROM products WHERE id=$1', [req.params.id]);
  if (!product.rowCount) return res.status(404).send('Not found');
  const title = normalizeText(req.body.asset_title, 180);
  const kind = ['video','pdf','download','link'].includes(req.body.asset_kind) ? req.body.asset_kind : 'download';
  const uploadedExt = req.file ? path.extname(req.file.originalname).toLowerCase() : '';
  const kindAllowed = { video: ['.mp4','.webm'], pdf: ['.pdf'], download: ['.zip','.pdf'], link: [] };
  if (req.file && !kindAllowed[kind].includes(uploadedExt)) { fs.rmSync(path.join(PRIVATE_DIR, req.file.filename), { force: true }); setFlash(req, 'error', 'پسوند فایل با نوع محتوای انتخاب‌شده سازگار نیست.'); return res.redirect(`/admin/products/${req.params.id}/edit`); }
  const externalUrl = normalizeText(req.body.external_url, 1000);
  if (!title || (!req.file && !isWebUrl(externalUrl))) {
    if (req.file) fs.rmSync(path.join(PRIVATE_DIR, req.file.filename), { force: true });
    setFlash(req, 'error', 'نام محتوا و یک فایل یا نشانی معتبر HTTPS لازم است.'); return res.redirect(`/admin/products/${req.params.id}/edit`);
  }
  if (!req.file && new URL(externalUrl).protocol !== 'https:') { setFlash(req, 'error', 'فقط پیوندهای HTTPS پذیرفته می‌شوند.'); return res.redirect(`/admin/products/${req.params.id}/edit`); }
  await pool.query('INSERT INTO product_assets(product_id,title,asset_kind,file_key,external_url,is_preview,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7)', [req.params.id,title,kind,req.file?.filename || '',req.file ? '' : externalUrl,req.body.is_preview==='on',Number(req.body.sort_order || 0)]);
  setFlash(req, 'success', 'محتوا به محصول اضافه شد.'); res.redirect(`/admin/products/${req.params.id}/edit`);
}));
app.post('/admin/assets/:id/delete', requireAdmin, asyncRoute(async (req, res) => {
  const r = await pool.query('DELETE FROM product_assets WHERE id=$1 RETURNING product_id,file_key', [req.params.id]);
  if (r.rowCount && r.rows[0].file_key) fs.rmSync(path.join(PRIVATE_DIR, path.basename(r.rows[0].file_key)), { force: true });
  setFlash(req, 'success', 'محتوا حذف شد.'); res.redirect(r.rowCount ? `/admin/products/${r.rows[0].product_id}/edit` : '/admin/products');
}));
app.post('/admin/products/:id/delete', requireAdmin, asyncRoute(async (req, res) => {
  await pool.query("UPDATE products SET status='archived',updated_at=NOW() WHERE id=$1", [req.params.id]);
  setFlash(req, 'success', 'محصول آرشیو شد. برای حفظ سوابق سفارش‌ها، حذف فیزیکی انجام نشد.'); res.redirect('/admin/products');
}));

app.get('/admin/articles', requireAdmin, asyncRoute(async (_req, res) => {
  const r = await pool.query('SELECT * FROM articles ORDER BY updated_at DESC');
  res.render('admin/articles', { title: 'مدیریت مقالات', articles: r.rows });
}));
app.get('/admin/articles/new', requireAdmin, (_req, res) => res.render('admin/article-form', { title: 'مقاله جدید', article: null, articleImages: [] }));
app.post('/admin/articles', requireAdmin, articleUpload, assetCsrf, asyncRoute(async (req, res) => {
  const title = normalizeText(req.body.title, 220);
  const files = req.files || {};
  if (!title) {
    for (const f of Object.values(files).flat()) fs.rmSync(path.join(COVERS_DIR, f.filename), { force: true });
    setFlash(req, 'error', 'عنوان مقاله الزامی است.'); return res.redirect('/admin/articles/new');
  }
  const slug = await uniqueSlug('articles', normalizeText(req.body.slug,160) || title);
  const status = ['draft','published','archived'].includes(req.body.status) ? req.body.status : 'draft';
  const cover = acceptableCoverValue(files.cover?.[0], req.body.cover_url);
  const created = await pool.query(`INSERT INTO articles(slug,title,excerpt,content,category,cover_image,status,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7='published' THEN NOW() ELSE NULL END) RETURNING id`, [slug,title,normalizeText(req.body.excerpt,600),normalizeText(req.body.content,50000),normalizeText(req.body.category,100)||'مقالات تخصصی',cover,status]);
  for (const [i, f] of (files.inline_images || []).entries()) await pool.query('INSERT INTO article_images(article_id,image_path,alt_text,sort_order) VALUES($1,$2,$3,$4)', [created.rows[0].id, `/media/covers/${f.filename}`, normalizeText(req.body.inline_alt,180), i]);
  setFlash(req, 'success', 'مقاله ذخیره شد. اکنون کد تصاویر داخل متن را می‌توانید از همین صفحه بردارید.'); res.redirect(`/admin/articles/${created.rows[0].id}/edit`);
}));
app.get('/admin/articles/:id/edit', requireAdmin, asyncRoute(async (req, res) => {
  const [r, images] = await Promise.all([pool.query('SELECT * FROM articles WHERE id=$1', [req.params.id]), pool.query('SELECT * FROM article_images WHERE article_id=$1 ORDER BY sort_order,id', [req.params.id])]);
  if (!r.rowCount) return res.status(404).render('error', { title: 'مقاله پیدا نشد', message: 'این مقاله وجود ندارد.' });
  res.render('admin/article-form', { title: 'ویرایش مقاله', article: r.rows[0], articleImages: images.rows });
}));
app.post('/admin/articles/:id/edit', requireAdmin, articleUpload, assetCsrf, asyncRoute(async (req, res) => {
  const old = await pool.query('SELECT * FROM articles WHERE id=$1', [req.params.id]);
  const files = req.files || {};
  if (!old.rowCount) {
    for (const f of Object.values(files).flat()) fs.rmSync(path.join(COVERS_DIR, f.filename), { force: true });
    return res.status(404).send('Not found');
  }
  const title = normalizeText(req.body.title,220);
  if (!title) {
    for (const f of Object.values(files).flat()) fs.rmSync(path.join(COVERS_DIR, f.filename), { force: true });
    setFlash(req, 'error', 'عنوان مقاله الزامی است.'); return res.redirect(`/admin/articles/${req.params.id}/edit`);
  }
  const slug = await uniqueSlug('articles', normalizeText(req.body.slug,160)||title, req.params.id);
  const status = ['draft','published','archived'].includes(req.body.status) ? req.body.status : 'draft';
  const cover = acceptableCoverValue(files.cover?.[0], req.body.cover_url) || old.rows[0].cover_image;
  await pool.query(`UPDATE articles SET slug=$1,title=$2,excerpt=$3,content=$4,category=$5,cover_image=$6,status=$7,published_at=CASE WHEN $7='published' THEN COALESCE(published_at,NOW()) ELSE NULL END,updated_at=NOW() WHERE id=$8`, [slug,title,normalizeText(req.body.excerpt,600),normalizeText(req.body.content,50000),normalizeText(req.body.category,100)||'مقالات تخصصی',cover,status,req.params.id]);
  for (const [i, f] of (files.inline_images || []).entries()) await pool.query('INSERT INTO article_images(article_id,image_path,alt_text,sort_order) VALUES($1,$2,$3,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM article_images WHERE article_id=$1))', [req.params.id, `/media/covers/${f.filename}`, normalizeText(req.body.inline_alt,180)]);
  setFlash(req, 'success', 'مقاله به‌روزرسانی شد.'); res.redirect(`/admin/articles/${req.params.id}/edit`);
}));
app.post('/admin/article-images/:id/delete', requireAdmin, asyncRoute(async (req, res) => {
  const r = await pool.query('DELETE FROM article_images WHERE id=$1 RETURNING article_id,image_path', [req.params.id]);
  if (r.rowCount && r.rows[0].image_path.startsWith('/media/covers/')) fs.rmSync(path.join(COVERS_DIR, path.basename(r.rows[0].image_path)), { force: true });
  setFlash(req, 'success', 'تصویر مقاله حذف شد.'); res.redirect(r.rowCount ? `/admin/articles/${r.rows[0].article_id}/edit` : '/admin/articles');
}));
app.post('/admin/articles/:id/delete', requireAdmin, asyncRoute(async (req, res) => { await pool.query("UPDATE articles SET status='archived',updated_at=NOW() WHERE id=$1", [req.params.id]); setFlash(req, 'success', 'مقاله آرشیو شد.'); res.redirect('/admin/articles'); }));

app.get('/admin/orders', requireAdmin, asyncRoute(async (_req, res) => {
  const r = await pool.query('SELECT o.*,u.phone,u.first_name,u.last_name,STRING_AGG(oi.title_snapshot, \'، \' ORDER BY oi.id) AS items FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN order_items oi ON oi.order_id=o.id GROUP BY o.id,u.phone,u.first_name,u.last_name ORDER BY o.created_at DESC LIMIT 300');
  res.render('admin/orders', { title: 'سفارش‌ها', orders: r.rows });
}));
app.get('/admin/users', requireAdmin, asyncRoute(async (_req, res) => {
  const r = await pool.query("SELECT u.*,COUNT(DISTINCT o.id) FILTER (WHERE o.status='paid')::int AS paid_orders FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.role='user' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500");
  res.render('admin/users', { title: 'کاربران', users: r.rows });
}));
app.post('/admin/users/:id/toggle', requireAdmin, asyncRoute(async (req, res) => {
  await pool.query("UPDATE users SET is_active=NOT is_active,updated_at=NOW() WHERE id=$1 AND role='user'", [req.params.id]); setFlash(req, 'success', 'وضعیت کاربر تغییر کرد.'); res.redirect('/admin/users');
}));
app.get('/admin/settings', requireAdmin, asyncRoute(async (_req, res) => res.render('admin/settings', { title: 'تنظیمات سایت', settings: await getSettings() })));
app.post('/admin/settings', requireAdmin, asyncRoute(async (req, res) => {
  const fields = { site_name: 100, site_tagline: 200, contact_email: 180, contact_phone: 40, instagram: 100, about_text: 2000 };
  for (const [key, max] of Object.entries(fields)) {
    const value = normalizeText(req.body[key], max);
    await pool.query('INSERT INTO site_settings(setting_key,setting_value) VALUES($1,$2) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()', [key, value]);
    settingsCache[key] = value;
  }
  setFlash(req, 'success', 'تنظیمات سایت ذخیره شد.'); res.redirect('/admin/settings');
}));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'nugas-platform' }));
app.use((req, res) => res.status(404).render('error', { title: 'صفحه پیدا نشد', message: 'نشانی واردشده وجود ندارد. از منوی سایت به صفحهٔ موردنظر بروید.' }));
app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const imageField = ['cover', 'inline_images'].includes(err.field);
    const limit = imageField ? 8 : Number(process.env.MAX_UPLOAD_MB || 100);
    const message = err.code === 'LIMIT_FILE_SIZE' ? `حجم فایل بیشتر از حد مجاز (${limit} مگابایت) است.` : 'بارگذاری فایل انجام نشد.';
    return res.status(400).render('error', { title: 'خطا در بارگذاری فایل', message });
  }
  if (err.message === 'File type rejected') return res.status(400).render('error', { title: 'نوع فایل مجاز نیست', message: 'نوع فایل انتخاب‌شده پشتیبانی نمی‌شود.' });
  console.error(err.stack || err);
  res.status(500).render('error', { title: 'خطای داخلی', message: IS_PROD ? 'خطایی در پردازش درخواست رخ داد. دوباره تلاش کنید.' : `خطا: ${err.message}` });
});

getSettings().catch(() => {});
pool.query('SELECT 1').then(() => console.log('Nogiti database connection ready')).catch(err => console.error('Database connection failed:', err.message));
const server = app.listen(PORT, () => console.log(`Nogiti listening on ${PORT}`));
const shutdown = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
