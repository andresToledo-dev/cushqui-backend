import {
  generateInvitationCode,
  hashInvitationCode,
  invitationExpiry,
  invitationStatus,
  normalizeInvitationCode,
} from './invitation-code.util';

describe('invitation-code.util', () => {
  it('should generate codes like XXXX-XXXX-XXXX without ambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateInvitationCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
    expect(new Set(Array.from({ length: 50 }, generateInvitationCode)).size).toBe(50);
  });

  it('should hash the same code regardless of case, spaces and dashes', () => {
    expect(normalizeInvitationCode(' k7qf-m2xh 9rtb ')).toBe('K7QFM2XH9RTB');
    expect(hashInvitationCode('k7qf-m2xh-9rtb')).toBe(hashInvitationCode('K7QFM2XH9RTB'));
    expect(hashInvitationCode('K7QF-M2XH-9RTB')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationCode('K7QF-M2XH-9RTC')).not.toBe(hashInvitationCode('K7QF-M2XH-9RTB'));
  });

  it('should expire 7 days after creation by default', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(invitationExpiry(undefined, from).toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(invitationExpiry(2, from).toISOString()).toBe('2026-01-03T00:00:00.000Z');
  });

  it('should compute the status (used wins over revoked and expired)', () => {
    const now = new Date('2026-01-05T00:00:00.000Z');
    const future = new Date('2026-01-08T00:00:00.000Z');
    const past = new Date('2026-01-04T00:00:00.000Z');
    const base = { usedAt: null, revokedAt: null, expiresAt: future };

    expect(invitationStatus(base, now)).toBe('PENDING');
    expect(invitationStatus({ ...base, expiresAt: past }, now)).toBe('EXPIRED');
    expect(invitationStatus({ ...base, revokedAt: past }, now)).toBe('REVOKED');
    expect(invitationStatus({ ...base, usedAt: past, expiresAt: past }, now)).toBe('USED');
  });
});
