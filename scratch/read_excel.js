import XLSX from 'xlsx'
import fs from 'fs'

const excelPath = '/Users/anselmusmediarigestawan/Downloads/Export_Data_Murid.xlsx'

function readExcel() {
  if (!fs.existsSync(excelPath)) {
    console.error("Excel file does not exist at:", excelPath)
    return
  }

  console.log("Reading excel file...")
  const workbook = XLSX.readFile(excelPath)
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet)

  console.log("Total rows in Excel:", rows.length)
  if (rows.length > 0) {
    console.log("Headers detected:", Object.keys(rows[0]))
  }

  // Count per class
  const counts = {}
  rows.forEach(r => {
    // Find class column
    const classVal = r['Kelas'] || r['kelas'] || r['KELAS'] || r['nama_kelas'] || ''
    if (classVal) {
      counts[classVal] = (counts[classVal] || 0) + 1
    }
  })

  console.log("Counts per class in Excel:", counts)

  // Print first 5 rows
  console.log("First 5 rows in Excel:")
  console.log(rows.slice(0, 5))

  // Find class 7 students
  const class7 = rows.filter(r => {
    const classVal = String(r['Kelas'] || r['kelas'] || r['KELAS'] || '')
    return classVal.startsWith('7')
  })

  console.log("\nTotal class 7 students in Excel:", class7.length)
  
  // Sort class 7 by class and name
  class7.sort((a, b) => {
    const classA = String(a['Kelas'] || a['kelas'] || '')
    const classB = String(b['Kelas'] || b['kelas'] || '')
    if (classA !== classB) return classA.localeCompare(classB)
    const nameA = String(a['Nama Lengkap'] || a['Nama'] || a['nama_lengkap'] || '')
    const nameB = String(b['Nama Lengkap'] || b['Nama'] || b['nama_lengkap'] || '')
    return nameA.localeCompare(nameB)
  })

  // Group by class and print list of names at the end of each class
  const grouped = {}
  class7.forEach(r => {
    const cls = String(r['Kelas'] || r['kelas'] || '')
    if (!grouped[cls]) grouped[cls] = []
    grouped[cls].push(r)
  })

  Object.keys(grouped).sort().forEach(cls => {
    const list = grouped[cls]
    console.log(`\nClass ${cls} - Total: ${list.length}`)
    console.log("First 3:", list.slice(0, 3).map(r => r['Nama Lengkap'] || r['Nama'] || r['nama_lengkap']))
    console.log("Last 5:", list.slice(-5).map(r => r['Nama Lengkap'] || r['Nama'] || r['nama_lengkap']))
  })
}

readExcel()
