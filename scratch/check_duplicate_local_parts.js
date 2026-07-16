import fs from 'fs'

const data = JSON.parse(fs.readFileSync('scratch/db_dump.json', 'utf8'))
const students = data.akun_pengguna.filter(a => a.role === 'murid')

const localParts = students.map(s => s.username.split('@')[0].toLowerCase())
const duplicates = localParts.filter((item, index) => localParts.indexOf(item) !== index)

console.log("Duplicate local parts:", duplicates)
