const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const migrations = [
  `CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    channel_id VARCHAR(255) NOT NULL UNIQUE,
    channel_name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    notes TEXT,
    subscribers INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    last_parsed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  
  `CREATE TABLE IF NOT EXISTS raw_posts (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
    external_id VARCHAR(255) NOT NULL,
    original_text TEXT NOT NULL,
    original_image_url TEXT,
    original_video_url TEXT,
    views INTEGER DEFAULT 0,
    reactions INTEGER DEFAULT 0,
    arr_score DECIMAL(10,4) DEFAULT 0,
    original_date TIMESTAMP,
    parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'new',
    UNIQUE(source_id, external_id)
  )`,
  
  `CREATE INDEX IF NOT EXISTS idx_raw_posts_status ON raw_posts(status)`,
  `CREATE INDEX IF NOT EXISTS idx_raw_posts_source ON raw_posts(source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_raw_posts_arr ON raw_posts(arr_score DESC)`,
  
  `ALTER TABLE sources ADD COLUMN IF NOT EXISTS subscribers INTEGER DEFAULT 0`,
  `ALTER TABLE raw_posts ADD COLUMN IF NOT EXISTS reactions INTEGER DEFAULT 0`,
  `ALTER TABLE raw_posts ADD COLUMN IF NOT EXISTS arr_score DECIMAL(10,4) DEFAULT 0`,
  
  `CREATE TABLE IF NOT EXISTS generated_variants (
    id SERIAL PRIMARY KEY,
    raw_post_id INTEGER REFERENCES raw_posts(id) ON DELETE CASCADE,
    variant_number INTEGER NOT NULL,
    generated_text TEXT NOT NULL,
    generated_image_url TEXT,
    title_for_cover TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(raw_post_id, variant_number)
  )`,
  
  `CREATE TABLE IF NOT EXISTS scheduled_posts (
    id SERIAL PRIMARY KEY,
    raw_post_id INTEGER REFERENCES raw_posts(id) ON DELETE CASCADE UNIQUE,
    selected_text_variant INTEGER DEFAULT 1,
    selected_image_variant INTEGER DEFAULT 1,
    final_text TEXT NOT NULL,
    final_image_url TEXT,
    scheduled_at TIMESTAMP NOT NULL,
    published_at TIMESTAMP,
    is_auto_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  
  `CREATE INDEX IF NOT EXISTS idx_scheduled_posts_date ON scheduled_posts(scheduled_at)`,
  
  `CREATE TABLE IF NOT EXISTS admin_activity (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  
  `CREATE INDEX IF NOT EXISTS idx_admin_activity_date ON admin_activity(created_at)`,
  
  `CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  
  `INSERT INTO settings (key, value) VALUES 
    ('morning_window_start', '09:00'),
    ('morning_window_end', '12:00'),
    ('auto_publish_delay_hours', '3'),
    ('posts_per_day', '3')
  ON CONFLICT (key) DO NOTHING`,

  // Phase: ERR filters
  `ALTER TABLE raw_posts ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0`,
  `ALTER TABLE raw_posts ADD COLUMN IF NOT EXISTS forwards INTEGER DEFAULT 0`,
  `ALTER TABLE raw_posts ADD COLUMN IF NOT EXISTS err_score DECIMAL(10,4) DEFAULT 0`,
  `ALTER TABLE sources ADD COLUMN IF NOT EXISTS min_err DECIMAL(5,2) DEFAULT 0`,
  `INSERT INTO settings (key, value) VALUES ('default_min_err', '0') ON CONFLICT (key) DO NOTHING`
];

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('Starting database migration...');
    
    for (const sql of migrations) {
      console.log('Executing:', sql.substring(0, 50) + '...');
      await client.query(sql);
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
