import bcrypt from 'bcryptjs'

const publicHash = "$2b$10$jEplPy0C.SJ1vI70hbpNDeB7C6aELnGskQNhXC3y6I2wlrJxUd2aG"

const candidates = [
  "123456",
  "YOKC44",
  "yokc44",
  "0124636493",
  "abigail.weisly",
  "abigail.weisly@gmail.com",
  "abigail"
]

for (const c of candidates) {
  const isMatch = bcrypt.compareSync(c, publicHash)
  if (isMatch) {
    console.log(`MATCH FOUND! The password is: "${c}"`)
    process.exit(0)
  }
}

console.log("No match found for candidates.")
