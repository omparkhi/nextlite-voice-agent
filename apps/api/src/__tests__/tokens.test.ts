import { describe, it, expect } from 'vitest';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  generateTokenPair,
  getRefreshTokenExpiry,
} from '../lib/tokens';

describe('Token Library', () => {
  const testPayload = {
    userId: 'test-user-id',
    tenantId: 'test-tenant-id',
    role: 'ADMIN' as const,
  };

  describe('generateAccessToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateAccessToken(testPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify and decode a valid token', () => {
      const token = generateAccessToken(testPayload);
      const decoded = verifyAccessToken(token);
      
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.tenantId).toBe(testPayload.tenantId);
      expect(decoded.role).toBe(testPayload.role);
    });

    it('should throw on invalid token', () => {
      expect(() => verifyAccessToken('invalid-token')).toThrow();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a UUID', () => {
      const token = generateRefreshToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('generateTokenPair', () => {
    it('should generate both access and refresh tokens', () => {
      const tokens = generateTokenPair(testPayload);
      
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBeDefined();
      
      const decoded = verifyAccessToken(tokens.accessToken);
      expect(decoded.userId).toBe(testPayload.userId);
    });
  });

  describe('getRefreshTokenExpiry', () => {
    it('should return a future date', () => {
      const expiry = getRefreshTokenExpiry();
      expect(expiry).toBeInstanceOf(Date);
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
