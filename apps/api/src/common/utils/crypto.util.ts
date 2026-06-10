import * as crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'prismalytics-default-enc-key-32byt';

export function encryptValue(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptValue(encryptedData: string): string {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return encryptedData; // plain text (legacy / not yet encrypted)
    const iv  = Buffer.from(parts[0] ?? '', 'hex');
    const tag = Buffer.from(parts[1] ?? '', 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(Buffer.from(parts[2] ?? '', 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    return encryptedData;
  }
}
