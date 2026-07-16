const fs = require('fs')

try {
  const data = JSON.parse(fs.readFileSync('scratch/db_dump.json', 'utf8'))
  const admins = data.akun_pengguna.filter(a => a.role === 'admin')
  console.log('Admins in akun_pengguna:', admins)
  
  const authAdmins = data.auth_users.filter(u => {
    const role = u.raw_app_meta_data?.role || u.raw_user_meta_data?.role
    return role === 'admin' || admins.some(a => a.id === u.id)
  })
  console.log('Admins in auth.users:', authAdmins)
} catch (err) {
  console.error(err)
}
