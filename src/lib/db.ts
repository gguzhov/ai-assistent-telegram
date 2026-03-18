import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
})

pool.on('error', (err) => {
  console.error('Database pool error:', err)
})

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now()
  try {
    const res = await pool.query<T>(text, params)
    const duration = Date.now() - start
    console.log('Executed query', { text: text.substring(0, 50).trim().replace(/\n/g, ' '), duration, rows: res.rowCount })
    return res
  } catch (err: any) {
    const duration = Date.now() - start
    console.error('Database query error:', {
      text: text.substring(0, 500),
      params,
      error: err.message,
      detail: err.detail,
      duration
    })
    throw err
  }
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect()
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export default pool
