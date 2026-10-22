require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
async function main() {
  const { DATABASE_URL, ADMIN_PHONE, ADMIN_PASSWORD, ADMIN_NAME = 'مدیر NUGAS', PGSSLMODE } = process.env;
  if (!DATABASE_URL || !ADMIN_PHONE || !ADMIN_PASSWORD) throw new Error('DATABASE_URL، ADMIN_PHONE و ADMIN_PASSWORD را در محیط تنظیم کنید.');
  if (ADMIN_PASSWORD.length < 12) throw new Error('برای رمز مدیر حداقل ۱۲ نویسه انتخاب کنید.');
  const phone = ADMIN_PHONE.trim();
  if (!/^09\d{9}$/.test(phone)) throw new Error('ADMIN_PHONE باید در قالب 09xxxxxxxxx باشد.');
  const [firstName, ...rest] = ADMIN_NAME.trim().split(/\s+/);
  const lastName = rest.join(' ');
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_credentials (user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, password_hash TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const u = await client.query(`INSERT INTO users(phone, first_name, last_name, role) VALUES($1,$2,$3,'admin') ON CONFLICT(phone) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,role='admin',is_active=TRUE,updated_at=NOW() RETURNING id`, [phone, firstName || 'مدیر', lastName]);
      await client.query(`INSERT INTO admin_credentials(user_id,password_hash) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,updated_at=NOW()`, [u.rows[0].id, hash]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    console.log(`Admin account prepared for ${phone}. Remove ADMIN_PASSWORD from the environment after setup.`);
  } finally { await pool.end(); }
}
main().catch((err) => { console.error(err.message); process.exit(1); });
