import { describe, it, expect } from 'vitest';
import { hashRefreshToken, compareRefreshToken, parseExpiresIn, calculateExpiresAt } from '../../../src/modules/auth/refresh-token.utils';

describe('refresh-token.utils', () => {
  describe('hashRefreshToken', () => {
    it('should hash refresh token using bcrypt', async () => {
      const token = 'rt_abc123';
      const hash = await hashRefreshToken(token);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(token);
      expect(hash.startsWith('$2b$')).toBe(true); // bcrypt hash format
    });
  });

  describe('compareRefreshToken', () => {
    it('should return true for matching token and hash', async () => {
      const token = 'rt_abc123';
      const hash = await hashRefreshToken(token);

      const result = await compareRefreshToken(token, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching token and hash', async () => {
      const token = 'rt_abc123';
      const wrongToken = 'rt_wrong';
      const hash = await hashRefreshToken(token);

      const result = await compareRefreshToken(wrongToken, hash);
      expect(result).toBe(false);
    });
  });

  describe('parseExpiresIn', () => {
    it('should parse "30m" to 1800 seconds', () => {
      expect(parseExpiresIn('30m')).toBe(1800);
    });

    it('should parse "14d" to 1209600 seconds', () => {
      expect(parseExpiresIn('14d')).toBe(1209600);
    });

    it('should parse "2h" to 7200 seconds', () => {
      expect(parseExpiresIn('2h')).toBe(7200);
    });

    it('should parse "60s" to 60 seconds', () => {
      expect(parseExpiresIn('60s')).toBe(60);
    });

    it('should throw error for invalid format', () => {
      expect(() => parseExpiresIn('invalid')).toThrow();
    });
  });

  describe('calculateExpiresAt', () => {
    it('should calculate expires at date for "30m"', () => {
      const now = Date.now();
      const expiresAt = calculateExpiresAt('30m');

      const diff = expiresAt.getTime() - now;
      expect(diff).toBeGreaterThanOrEqual(1800 * 1000 - 1000); // 30분 (1초 오차 허용)
      expect(diff).toBeLessThanOrEqual(1800 * 1000 + 1000);
    });

    it('should calculate expires at date for "14d"', () => {
      const now = Date.now();
      const expiresAt = calculateExpiresAt('14d');

      const diff = expiresAt.getTime() - now;
      expect(diff).toBeGreaterThanOrEqual(1209600 * 1000 - 1000); // 14일
      expect(diff).toBeLessThanOrEqual(1209600 * 1000 + 1000);
    });
  });
});
