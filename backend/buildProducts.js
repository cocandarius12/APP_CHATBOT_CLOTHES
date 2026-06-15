'use strict'
// Regenerează backend/data/products.json din snapshot-ul brut.
// Rulează local când se actualizează unified_data_snapshot.json:
//   UNIFIED_DATA_PATH=/cale/unified_data_snapshot.json npm run build:data
require('dotenv').config({ path: require('path').join(__dirname, '.env') })
const { generateProductsFile } = require('./dataAdapter')

try {
  const { dest, count, source } = generateProductsFile()
  console.log(`✓ Generat ${dest} (${count} produse) din ${source}`)
} catch (e) {
  console.error('✗ Nu am putut genera products.json:', e.message)
  console.error('  Setează UNIFIED_DATA_PATH către snapshot-ul brut în backend/.env')
  process.exit(1)
}
