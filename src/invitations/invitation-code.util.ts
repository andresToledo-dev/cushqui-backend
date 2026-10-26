import * as crypto from 'crypto';

/** Without 0/O and 1/I so a code read aloud or typed by hand is unambiguous. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUPS = 3;
const GROUP_LENGTH = 4;

export const DEFAULT_INVITATION_DAYS = 7;

/** Random code like `K7QF-M2XH-9RTB` (~60 bits): shown once, only its hash is stored. */
export function generateInvitationCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = '';
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += ALPHABET[crypto.randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/** Case, spaces and dashes do not matter when the user types the code back. */
export function normalizeInvitationCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

/** SHA256 is enough for a random high-entropy code and allows a unique-index lookup (bcrypt would not). */
export function hashInvitationCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeInvitationCode(code)).digest('hex');
}

export function invitationExpiry(days = DEFAULT_INVITATION_DAYS, from = new Date()): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export type InvitationStatus = 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';

export function invitationStatus(
  invitation: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now = new Date(),
): InvitationStatus {
  if (invitation.usedAt) return 'USED';
  if (invitation.revokedAt) return 'REVOKED';
  if (invitation.expiresAt <= now) return 'EXPIRED';
  return 'PENDING';
}
