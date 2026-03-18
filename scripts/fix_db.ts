
import { query } from '../src/lib/db'

async function fixDb() {
  console.log('Adding missing columns to database...')
  try {
    // Add subscribers to sources if it doesn't exist
    await query(`
      ALTER TABLE sources 
      ADD COLUMN IF NOT EXISTS subscribers INTEGER DEFAULT 0;
    `)
    console.log('Column "subscribers" added to table "sources"')

    // Add reactions to raw_posts if it doesn't exist
    await query(`
      ALTER TABLE raw_posts 
      ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]';
    `)
    console.log('Column "reactions" added to table "raw_posts"')

    // Add arr_score to raw_posts if it doesn't exist
    await query(`
      ALTER TABLE raw_posts 
      ADD COLUMN IF NOT EXISTS arr_score DOUBLE PRECISION DEFAULT 0;
    `)
    console.log('Column "arr_score" added to table "raw_posts"')

    console.log('Database migration completed successfully.')
  } catch (err) {
    console.error('Error during database migration:', err)
  } finally {
    process.exit(0)
  }
}

fixDb()
