import XLSX from 'xlsx'
import fs from 'fs'

const excelPath = '/Users/anselmusmediarigestawan/Downloads/Export_Data_Murid (2).xlsx'

function readExcel() {
  if (!fs.existsSync(excelPath)) {
    console.error("Excel file does not exist at:", excelPath)
    return
  }

  console.log("Reading new excel file...")
  const workbook = XLSX.readFile(excelPath)
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet)

  console.log("Total rows in new Excel:", rows.length)
  console.log("Rows data:")
  console.log(JSON.stringify(rows, null, 2))
}

readExcel()
