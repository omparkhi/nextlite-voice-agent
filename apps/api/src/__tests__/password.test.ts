import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../lib/password';

describe('Password Library', () => {
  const testPassword = 'SecurePassword123!';

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const hash = await hashPassword(testPassword);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(testPassword);
      expect(hash.startsWith('$2b$')).toBe(true);
    });

    it('should generate different hashes for same password', async () => {
      const hash1 = await hashPassword(testPassword);
      const hash2 = await hashPassword(testPassword);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      const hash = await hashPassword(testPassword);
      const result = await comparePassword(testPassword, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const hash = await hashPassword(testPassword);
      const result = await comparePassword('WrongPassword', hash);
      expect(result).toBe(false);
    });
  });
});
