import fs from 'fs'

const data = JSON.parse(fs.readFileSync('scratch/db_dump.json', 'utf8'))
console.log("Keys of data in db_dump.json:", Object.keys(data))

if (data.akun_pengguna) {
  console.log("Number of accounts in akun_pengguna:", data.akun_pengguna.length)
  console.log("First account in akun_pengguna:", data.akun_pengguna[0])
}

const ervanAkun = data.akun_pengguna.filter(a => a.username.toLowerCase().includes('ervan'))
console.log("Ervan accounts in akun_pengguna:", ervanAkun)
