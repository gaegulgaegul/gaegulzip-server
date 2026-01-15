import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findAppByCode, upsertUser, generateJWT } from '../../../src/modules/auth/services';
import { db } from '../../../src/config/database';

vi.mock('../../../src/config/database', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

describe('services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAppByCode', () => {
    it('should return app when found', async () => {
      const mockApp = { id: 1, code: 'test-app', name: 'Test App' };
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockApp]),
          }),
        }),
      } as any);

      const result = await findAppByCode('test-app');
      expect(result).toEqual(mockApp);
    });

    it('should return null when not found', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const result = await findAppByCode('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('generateJWT', () => {
    it('should generate valid JWT with minimal payload', () => {
      const user = { id: 123, email: 'test@example.com', nickname: '홍길동' };
      const app = { id: 1, jwtSecret: 'test-secret-at-least-32-chars-long', jwtExpiresIn: '7d' };

      const token = generateJWT(user, app);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // JWT 디코드하여 페이로드 확인
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      expect(payload.sub).toBe(123);
      expect(payload.appId).toBe(1);
      expect(payload.email).toBe('test@example.com');
      expect(payload.nickname).toBe('홍길동');
      expect(payload).not.toHaveProperty('userId'); // 중복 제거
      expect(payload).not.toHaveProperty('appCode'); // 중복 제거
    });
  });

  describe('upsertUser', () => {
    it('should create new user when not exists', async () => {
      const newUser = {
        id: 1,
        appId: 1,
        provider: 'kakao',
        providerId: '123',
        email: 'test@example.com',
        nickname: '홍길동',
        profileImage: 'https://example.com/image.jpg',
      };

      // Existing user 조회: 없음
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      // Insert
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newUser]),
        }),
      } as any);

      const result = await upsertUser({
        appId: 1,
        provider: 'kakao',
        providerId: '123',
        email: 'test@example.com',
        nickname: '홍길동',
        profileImage: 'https://example.com/image.jpg',
      });

      expect(result).toEqual(newUser);
    });

    it('should update existing user', async () => {
      const existingUser = { id: 1, appId: 1, provider: 'kakao', providerId: '123' };
      const updatedUser = { ...existingUser, email: 'updated@example.com' };

      // Existing user 조회: 있음
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingUser]),
          }),
        }),
      } as any);

      // Update
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedUser]),
          }),
        }),
      } as any);

      const result = await upsertUser({
        appId: 1,
        provider: 'kakao',
        providerId: '123',
        email: 'updated@example.com',
        nickname: '홍길동',
        profileImage: null,
      });

      expect(result).toEqual(updatedUser);
    });
  });
});
