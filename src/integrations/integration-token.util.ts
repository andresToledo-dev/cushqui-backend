import * as crypto from 'crypto';

/** 32 random bytes as hex: shown once to the user, only its hash is stored. */
export function generateIntegrationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * SHA256 is enough for a random 256-bit token (no brute force or dictionary possible) and, unlike bcrypt,
 * is deterministic: the guard finds the integration with one unique-index lookup instead of comparing
 * the token against every active integration.
 */
export function hashIntegrationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
