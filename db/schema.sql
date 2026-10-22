CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL DEFAULT '',
  last_name VARCHAR(100) NOT NULL DEFAULT '',
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  branch VARCHAR(80) NOT NULL DEFAULT '',
  field VARCHAR(100) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS otp_codes (
  id BIGSERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS otp_codes_phone_created_idx ON otp_codes(phone, created_at DESC);
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(180) UNIQUE NOT NULL,
  title VARCHAR(180) NOT NULL,
  subtitle VARCHAR(240) NOT NULL DEFAULT '',
  product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('course','plugin')),
  category VARCHAR(100) NOT NULL DEFAULT '',
  short_description VARCHAR(500) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price_toman BIGINT NOT NULL DEFAULT 0 CHECK (price_toman >= 0),
  cover_image VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_status_type_idx ON products(status, product_type, created_at DESC);
CREATE TABLE IF NOT EXISTS product_assets (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  asset_kind VARCHAR(20) NOT NULL CHECK (asset_kind IN ('video','pdf','download','link')),
  file_key VARCHAR(255) NOT NULL DEFAULT '',
  external_url TEXT NOT NULL DEFAULT '',
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS product_assets_product_idx ON product_assets(product_id, sort_order, id);
CREATE TABLE IF NOT EXISTS articles (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(180) UNIQUE NOT NULL,
  title VARCHAR(220) NOT NULL,
  excerpt VARCHAR(600) NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  category VARCHAR(100) NOT NULL DEFAULT 'مقالات تخصصی',
  cover_image VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS articles_status_date_idx ON articles(status, published_at DESC NULLS LAST);
CREATE TABLE IF NOT EXISTS article_images (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  image_path VARCHAR(500) NOT NULL,
  alt_text VARCHAR(180) NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS article_images_article_idx ON article_images(article_id, sort_order, id);
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  total_toman BIGINT NOT NULL CHECK (total_toman >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  gateway VARCHAR(30) NOT NULL DEFAULT 'zarinpal',
  authority VARCHAR(100) UNIQUE,
  ref_id VARCHAR(100) NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  title_snapshot VARCHAR(180) NOT NULL,
  price_toman BIGINT NOT NULL CHECK (price_toman >= 0),
  UNIQUE(order_id, product_id)
);
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO site_settings(setting_key, setting_value) VALUES
 ('site_name','Nogiti'),
 ('site_tagline','ابزارهای مهندسی، آموزش تخصصی و منابع تأسیسات'),
 ('contact_email','nugasbnd@gmail.com'),
 ('contact_phone','09033998344'),
 ('instagram','@nugas_bnd'),
 ('about_text','Nogiti بستری برای دسترسی به ابزارهای تخصصی تأسیسات، آموزش مهندسی و منابع کاربردی است.')
ON CONFLICT (setting_key) DO NOTHING;
CREATE TABLE IF NOT EXISTS admin_credentials (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
