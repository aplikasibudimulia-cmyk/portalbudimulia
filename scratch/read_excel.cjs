const XLSX = require('xlsx')

const filePath = '/Users/anselmusmediarigestawan/Downloads/Program_Sekolah_2026-2027 (3).xlsx'

try {
  const wb = XLSX.readFile(filePath)
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

  console.log(`Successfully read Excel file. Total rows: ${data.length}`)
  if (data.length > 0) {
    console.log('Columns found:', Object.keys(data[0]))
    console.log('First 5 rows:')
    console.log(data.slice(0, 5))
    
    // Check categories and locations list
    const categories = [...new Set(data.map(r => String(r['Kategori'] || '').trim()).filter(Boolean))]
    const locations = [...new Set(data.map(r => String(r['Lokasi'] || '').trim()).filter(Boolean))]
    console.log('Unique categories in file:', categories)
    console.log('Unique locations in file:', locations)
  }
} catch (err) {
  console.error('Error reading Excel file:', err.message)
}
