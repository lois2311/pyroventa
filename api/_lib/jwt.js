import { SignJWT, jwtVerify } from 'jose'

function secret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET no configurado')
  return new TextEncoder().encode(s)
}

/** Firma un JWT HS256. expiresIn acepta formato jose: '7d', '24h', '-10s' (tests). */
export async function signToken(payload, expiresIn = '7d') {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret())
}

/** Verifica firma y expiración. Lanza si es inválido. Retorna los claims. */
export async function verifyJwt(token) {
  const { payload } = await jwtVerify(token, secret())
  return payload
}
