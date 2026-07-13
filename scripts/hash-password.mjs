// Genera un hash bcrypt para super_admins.password_hash
// Uso: node scripts/hash-password.mjs <contraseña>
import bcrypt from 'bcryptjs'

const pwd = process.argv[2]
if (!pwd) {
  console.error('Uso: node scripts/hash-password.mjs <contraseña>')
  process.exit(1)
}
console.log(bcrypt.hashSync(pwd, 10))
