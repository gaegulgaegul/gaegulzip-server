import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findAppByCode,
  upsertUser,
  generateJWT,
  generateRefreshToken,
  storeRefreshToken,
  findRefreshTokenByJti,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshTokenById,
  revokeRefreshTokensByUserId,
  revokeRefreshTokenFamily,
} from '../../../src/modules/auth/services';
import { db } from '../../../src/config/database';
import { UnauthorizedException } from '../../../src/utils/errors';

vi.mock('../../../src/config/database', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('../../../src/modules/auth/refresh-token.utils', () => ({
  hashRefreshToken: vi.fn((token: string) => Promise.resolve(`hashed_${token}`)),
  compareRefreshToken: vi.fn((token: string, hash: string) => Promise.resolve(hash === `hashed_${token}`)),
  parseExpiresIn: vi.fn((expiresIn: string) => {
    if (expiresIn === '30m') return 1800;
    if (expiresIn === '14d') return 1209600;
    return 0;
  }),
  calculateExpiresAt: vi.fn((expiresIn: string) => new Date(Date.now() + 1209600 * 1000)),
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

  describe('Refresh Token Services', () => {
    describe('generateRefreshToken', () => {
      it('should generate refresh token with jti and tokenFamily', async () => {
        const user = { id: 1 };
        const app = { id: 1, jwtSecret: 'test-secret', refreshTokenExpiresIn: '14d' };

        const result = await generateRefreshToken(user, app);

        expect(result).toHaveProperty('refreshToken');
        expect(result).toHaveProperty('jti');
        expect(result).toHaveProperty('tokenFamily');
        expect(result.jti).toMatch(/^[0-9a-f-]{36}$/); // UUID v4
        expect(result.tokenFamily).toMatch(/^[0-9a-f-]{36}$/);
      });

      it('should include correct JWT payload', async () => {
        const user = { id: 1 };
        const app = { id: 1, jwtSecret: 'test-secret', refreshTokenExpiresIn: '14d' };

        const result = await generateRefreshToken(user, app);

        // JWT 검증 (디코딩하여 확인)
        const payload = JSON.parse(Buffer.from(result.refreshToken.split('.')[1], 'base64').toString());
        expect(payload.sub).toBe(1);
        expect(payload.appId).toBe(1);
        expect(payload.jti).toBe(result.jti);
        expect(payload.tokenFamily).toBe(result.tokenFamily);
      });
    });

    describe('storeRefreshToken', () => {
      it('should store refresh token in database', async () => {
        const tokenData = {
          tokenHash: 'bcrypt-hash',
          userId: 1,
          appId: 1,
          jti: 'uuid-jti',
          tokenFamily: 'uuid-family',
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        };

        vi.mocked(db.insert).mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        } as any);

        await storeRefreshToken(tokenData);

        expect(db.insert).toHaveBeenCalled();
      });
    });

    describe('findRefreshTokenByJti', () => {
      it('should find refresh token by jti', async () => {
        const mockToken = { id: 1, jti: 'uuid-jti', userId: 1 };

        vi.mocked(db.select).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockToken]),
            }),
          }),
        } as any);

        const result = await findRefreshTokenByJti('uuid-jti');

        expect(result).toEqual(mockToken);
      });

      it('should return null if token not found', async () => {
        vi.mocked(db.select).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        } as any);

        const result = await findRefreshTokenByJti('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('verifyRefreshToken', () => {
      it('should verify refresh token JWT and return payload', async () => {
        const user = { id: 1 };
        const app = { id: 1, jwtSecret: 'test-secret', refreshTokenExpiresIn: '14d' };

        // 먼저 토큰 생성
        const { refreshToken } = await generateRefreshToken(user, app);

        // 검증
        const result = await verifyRefreshToken(refreshToken, app);

        expect(result.sub).toBe(1);
        expect(result.appId).toBe(1);
        expect(result.jti).toBeDefined();
        expect(result.tokenFamily).toBeDefined();
      });

      it('should throw UnauthorizedException for invalid token', async () => {
        const app = { jwtSecret: 'test-secret' };

        await expect(verifyRefreshToken('invalid-token', app))
          .rejects.toThrow(UnauthorizedException);
      });
    });

    describe('rotateRefreshToken', () => {
      it('should rotate refresh token atomically', async () => {
        const oldToken = { id: 1, jti: 'old-jti', tokenFamily: 'family-1', userId: 1 };
        const user = { id: 1, email: 'test@example.com', nickname: 'Test' };
        const app = {
          id: 1,
          jwtSecret: 'test-secret',
          jwtExpiresIn: '30m',
          accessTokenExpiresIn: '30m',
          refreshTokenExpiresIn: '14d'
        };

        // Mock transaction
        vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
          const txMock = {
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockResolvedValue(undefined),
            }),
          };
          return callback(txMock);
        });

        const result = await rotateRefreshToken({ oldToken, user, app });

        expect(result).toHaveProperty('newAccessToken');
        expect(result).toHaveProperty('newRefreshToken');
        expect(result).toHaveProperty('newJti');
        expect(db.transaction).toHaveBeenCalled();
      });

      it('should use same tokenFamily for new token', async () => {
        const oldToken = { id: 1, tokenFamily: 'original-family', userId: 1, jti: 'old-jti' };
        const user = { id: 1, email: 'test@example.com', nickname: 'Test' };
        const app = {
          id: 1,
          jwtSecret: 'test-secret',
          jwtExpiresIn: '30m',
          accessTokenExpiresIn: '30m',
          refreshTokenExpiresIn: '14d'
        };

        vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
          const txMock = {
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockResolvedValue(undefined),
            }),
          };
          return callback(txMock);
        });

        const result = await rotateRefreshToken({ oldToken, user, app });

        // 새 토큰의 tokenFamily 확인
        const payload = JSON.parse(Buffer.from(result.newRefreshToken.split('.')[1], 'base64').toString());
        expect(payload.tokenFamily).toBe('original-family');
      });
    });

    describe('revokeRefreshTokenById', () => {
      it('should revoke refresh token by id', async () => {
        vi.mocked(db.update).mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        } as any);

        await revokeRefreshTokenById(1);

        expect(db.update).toHaveBeenCalled();
      });
    });

    describe('revokeRefreshTokensByUserId', () => {
      it('should revoke all refresh tokens for user', async () => {
        vi.mocked(db.update).mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        } as any);

        await revokeRefreshTokensByUserId(1);

        expect(db.update).toHaveBeenCalled();
      });
    });

    describe('revokeRefreshTokenFamily', () => {
      it('should revoke all tokens in family', async () => {
        vi.mocked(db.update).mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        } as any);

        await revokeRefreshTokenFamily('family-uuid');

        expect(db.update).toHaveBeenCalled();
      });
    });
  });
});
