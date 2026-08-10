const XLSX = require('xlsx')

const filePath = '/Users/anselmusmediarigestawan/Downloads/Program_Sekolah_2026-2027 (3).xlsx'

try {
  const wb = XLSX.readFile(filePath)
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

  console.log(`Successfully read Excel file. Total rows: ${data.length}`)
  if (data.length > 0) {
    const ids = data.map(r => r['ID Kegiatan'] || r['id'] || '').filter(Boolean)
    const uniqIds = [...new Set(ids)]
    console.log('Total non-empty IDs in Excel:', ids.length)
    console.log('Unique IDs in Excel:', uniqIds.length)

    // Find duplicates
    const idCounts = {}
    ids.forEach(id => idCounts[id] = (idCounts[id] || 0) + 1)
    const duplicates = Object.keys(idCounts).filter(id => idCounts[id] > 1)
    console.log('Duplicate IDs found in Excel:', duplicates)
    if (duplicates.length > 0) {
      console.log('First duplicate ID details:')
      const dupId = duplicates[0]
      const dupRows = data.filter(r => (r['ID Kegiatan'] || r['id']) === dupId)
      console.log(dupRows)
    }

    // Check categories and locations list
    const categories = [...new Set(data.map(r => String(r['Kategori'] || '').trim()).filter(Boolean))]
    const locations = [...new Set(data.map(r => String(r['Lokasi'] || '').trim()).filter(Boolean))]
    console.log('Unique categories in file:', categories)
    console.log('Unique locations in file:', locations)
  }
} catch (err) {
  console.error('Error reading Excel file:', err.message)
}
