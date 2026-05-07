// Sensitive keys that should be masked when returned to the frontend
// Values are stored as plain text in the DB, but never exposed raw to the client
export const SENSITIVE_KEYS = ['teamsWebhookUrl', 'apiKey', 'secretKey', 'token', 'password'];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()));
}

export function maskSensitiveValue(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '***';
  return value.substring(0, 4) + '***';
}
