import fs from 'fs'

const data = JSON.parse(fs.readFileSync('scratch/db_dump.json', 'utf8'))
const students = data.akun_pengguna.filter(a => a.role === 'murid')

console.log("Total students in akun_pengguna:", students.length)

const gmailCount = students.filter(s => s.username.endsWith('@gmail.com')).length
const localCount = students.filter(s => s.username.endsWith('@ebudimulia.local')).length
const noDomainCount = students.filter(s => !s.username.includes('@')).length

console.log(`With @gmail.com: ${gmailCount}`)
console.log(`With @ebudimulia.local: ${localCount}`)
console.log(`No domain: ${noDomainCount}`)

console.log("\nSome student usernames:")
console.log(students.slice(0, 20).map(s => s.username))
