import { runParser } from '../lib/parser'

async function main() {
  console.log('Starting parser...')
  await runParser()
  console.log('Parser finished')
  process.exit(0)
}

main().catch(error => {
  console.error('Parser error:', error)
  process.exit(1)
})
