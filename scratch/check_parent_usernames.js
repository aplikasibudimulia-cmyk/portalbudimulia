import fs from 'fs'

const data = JSON.parse(fs.readFileSync('scratch/db_dump.json', 'utf8'))
const parents = data.akun_pengguna.filter(a => a.role === 'orang_tua')

console.log("Total parents in akun_pengguna:", parents.length)

const withAt = parents.filter(p => p.username.includes('@'))
console.log("Parents with '@' in username:", withAt)
