import fs from 'fs'

const data = JSON.parse(fs.readFileSync('scratch/db_dump.json', 'utf8'))
const students = data.akun_pengguna.filter(a => a.role === 'murid')

const nonGmailNonClean = students.filter(s => s.username.includes('@') && !s.username.endsWith('@gmail.com'))
console.log("Non-Gmail students with '@':", nonGmailNonClean)
