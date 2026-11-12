import crypto from 'node:crypto'

/** Install an authenticator only in the disposable schemas used by browser tests. */
export async function seedTestAuthenticator(db, userId, key) {
  const secret = crypto.randomBytes(20)
  const nonce = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'base64url'), nonce)
  cipher.setAAD(Buffer.from(userId))
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()])
  const payload = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url')
  await db`insert into staff_mfa (user_id,encrypted_secret,last_step) values (${userId},${payload},-1)`
  return () => {
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
    const mac = crypto.createHmac('sha1', secret).update(counter).digest()
    return String((mac.readUInt32BE(mac[19] & 15) & 0x7fff_ffff) % 1_000_000).padStart(6, '0')
  }
}
