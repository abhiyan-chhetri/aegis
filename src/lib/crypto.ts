import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'fallback-dev-key-do-not-use-in-production-change-me';

// Ensure key is 32 bytes for AES-256
function getEncryptionKey(): Buffer {
  let key = ENCRYPTION_KEY;
  if (key.length < 32) {
    // Pad the key if it's shorter
    key = key.padEnd(32, '0');
  }
  return Buffer.from(key.substring(0, 32), 'utf-8');
}

export function encryptValue(plaintext: string): string {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    // Combine IV + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('[encryptValue error]', error);
    throw error;
  }
}

export function decryptValue(encryptedData: string): string {
  try {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch (error) {
    console.error('[decryptValue error]', error);
    throw error;
  }
}

// List of sensitive keys that should not be returned to client
export const SENSITIVE_KEYS = ['teamsWebhookUrl', 'apiKey', 'secretKey', 'token', 'password'];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()));
}

export function maskSensitiveValue(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '***';
  return value.substring(0, 4) + '***';
}
