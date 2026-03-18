
import { query } from '../src/lib/db'

async function addSourceFields() {
  console.log('Adding source_url and source_anchor columns...')
  try {
    // raw_posts
    await query(`
      ALTER TABLE raw_posts 
      ADD COLUMN IF NOT EXISTS source_url TEXT,
      ADD COLUMN IF NOT EXISTS source_anchor TEXT;
    `)
    console.log('Added to raw_posts')

    // generated_variants
    await query(`
      ALTER TABLE generated_variants 
      ADD COLUMN IF NOT EXISTS source_url TEXT,
      ADD COLUMN IF NOT EXISTS source_anchor TEXT;
    `)
    console.log('Added to generated_variants')

    // scheduled_posts
    await query(`
      ALTER TABLE scheduled_posts 
      ADD COLUMN IF NOT EXISTS source_url TEXT,
      ADD COLUMN IF NOT EXISTS source_anchor TEXT;
    `)
    console.log('Added to scheduled_posts')

    console.log('Database migration completed successfully.')
  } catch (err) {
    console.error('Error during database migration:', err)
  } finally {
    process.exit(0)
  }
}

addSourceFields()
