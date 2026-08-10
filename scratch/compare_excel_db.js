import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import XLSX from 'xlsx'

const envPath = path.resolve(process.cwd(), '.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const envLines = envContent.split('\n')

let supabaseUrl = ''
let supabaseKey = ''

for (const line of envLines) {
  if (line.startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim()
  }
  if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    supabaseKey = line.split('=')[1].trim()
  }
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function compare() {
  // Read Excel
  const filePath = '/Users/anselmusmediarigestawan/Downloads/Program_Sekolah_2026-2027 (3).xlsx'
  const wb = XLSX.readFile(filePath)
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const excelData = XLSX.utils.sheet_to_json(ws, { defval: '' })

  // Read DB
  const { data: dbData } = await supabase.from('program_sekolah').select('id, nama, tanggal_mulai')

  const dbIds = new Set(dbData.map(d => d.id))
  const dbNames = new Set(dbData.map(d => d.nama.toLowerCase().trim()))

  console.log('Comparing Excel to DB...')
  let missingCount = 0
  excelData.forEach((row, i) => {
    const name = String(row['Nama Program / Kegiatan'] || row['nama'] || '').trim()
    const id = row['ID Kegiatan'] || row['id']
    const date = row['Tanggal Mulai (YYYY-MM-DD)'] || row['tanggal_mulai']
    
    if (!name || !date) return

    const inDbById = dbIds.has(id)
    const inDbByName = dbNames.has(name.toLowerCase().trim())

    if (!inDbById && !inDbByName) {
      missingCount++
      console.log(`Row ${i+2} is MISSING from DB: "${name}" (${date}) ID: ${id}`)
    }
  })

  console.log('Total missing programs:', missingCount)
}

compare()
