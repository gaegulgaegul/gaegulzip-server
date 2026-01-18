import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { oauthLogin, refreshToken, logout } from '../../../src/modules/auth/handlers';
import { oauthLoginSchema, refreshTokenSchema, logoutSchema } from '../../../src/modules/auth/validators';
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
import { createOAuthProvider } from '../../../src/modules/auth/providers';
import * as authProbe from '../../../src/modules/auth/auth.probe';
import { NotFoundException, ValidationException, UnauthorizedException } from '../../../src/utils/errors';

// Mock all dependencies
vi.mock('../../../src/modules/auth/validators', () => ({
  oauthLoginSchema: {
    parse: vi.fn(),
  },
  refreshTokenSchema: {
    parse: vi.fn(),
  },
  logoutSchema: {
    parse: vi.fn(),
  },
}));

vi.mock('../../../src/modules/auth/services', () => ({
  findAppByCode: vi.fn(),
  upsertUser: vi.fn(),
  generateJWT: vi.fn(),
  generateRefreshToken: vi.fn(),
  storeRefreshToken: vi.fn(),
  findRefreshTokenByJti: vi.fn(),
  verifyRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshTokenById: vi.fn(),
  revokeRefreshTokensByUserId: vi.fn(),
  revokeRefreshTokenFamily: vi.fn(),
}));

vi.mock('../../../src/modules/auth/refresh-token.utils', () => ({
  hashRefreshToken: vi.fn((token: string) => Promise.resolve(`hashed_${token}`)),
  parseExpiresIn: vi.fn((expiresIn: string) => {
    if (expiresIn === '30m') return 1800;
    if (expiresIn === '14d') return 1209600;
    return 0;
  }),
  calculateExpiresAt: vi.fn(() => new Date(Date.now() + 1209600 * 1000)),
}));

vi.mock('jsonwebtoken', async () => {
  const actual = await vi.importActual('jsonwebtoken');
  return {
    ...actual,
    default: {
      ...(actual as any).default,
      decode: vi.fn((token: string) => {
        // Mock JWT decode - returns a payload with appId
        return {
          sub: 1,
          appId: 1,
          jti: 'old-jti',
          tokenFamily: 'family-1',
        };
      }),
    },
  };
});

vi.mock('../../../src/modules/auth/providers', () => ({
  createOAuthProvider: vi.fn(),
}));

vi.mock('../../../src/modules/auth/auth.probe', () => ({
  loginSuccess: vi.fn(),
  loginFailed: vi.fn(),
  userRegistered: vi.fn(),
  refreshTokenIssued: vi.fn(),
  refreshTokenRotated: vi.fn(),
  refreshTokenRevoked: vi.fn(),
  refreshTokenReuseDetected: vi.fn(),
}));

describe('oauthLogin handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let mockProvider: any;

  beforeEach(() => {
    req = {
      body: {
        code: 'test-app',
        provider: 'kakao',
        accessToken: 'valid-token',
      },
    };

    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    mockProvider = {
      verifyToken: vi.fn(),
      getUserInfo: vi.fn(),
    };

    vi.clearAllMocks();
  });

  it('should return access token, refresh token and user on successful login', async () => {
    // Setup mocks
    vi.mocked(oauthLoginSchema.parse).mockReturnValue({
      code: 'test-app',
      provider: 'kakao',
      accessToken: 'valid-token',
    });

    vi.mocked(findAppByCode).mockResolvedValue({
      id: 1,
      code: 'test-app',
      name: 'Test App',
      kakaoRestApiKey: 'kakao-key',
      kakaoClientSecret: 'kakao-secret',
      jwtSecret: 'jwt-secret',
      jwtExpiresIn: '7d',
      accessTokenExpiresIn: '30m',
      refreshTokenExpiresIn: '14d',
    } as any);

    vi.mocked(createOAuthProvider).mockReturnValue(mockProvider);

    mockProvider.verifyToken.mockResolvedValue(undefined);
    mockProvider.getUserInfo.mockResolvedValue({
      providerId: '123',
      email: 'test@example.com',
      nickname: '홍길동',
      profileImage: 'https://example.com/image.jpg',
    });

    vi.mocked(upsertUser).mockResolvedValue({
      id: 1,
      appId: 1,
      provider: 'kakao',
      providerId: '123',
      email: 'test@example.com',
      nickname: '홍길동',
      profileImage: 'https://example.com/image.jpg',
      lastLoginAt: new Date(),
    } as any);

    vi.mocked(generateJWT).mockReturnValue('mock-jwt-token');
    vi.mocked(generateRefreshToken).mockResolvedValue({
      refreshToken: 'mock-refresh-token',
      jti: 'refresh-jti-123',
      tokenFamily: 'family-123',
    });

    await oauthLogin(req as Request, res as Response);

    // Refresh Token 저장 확인
    expect(storeRefreshToken).toHaveBeenCalledWith({
      tokenHash: 'hashed_mock-refresh-token',
      userId: 1,
      appId: 1,
      jti: 'refresh-jti-123',
      tokenFamily: 'family-123',
      expiresAt: expect.any(Date),
    });

    // 응답 형식 확인
    expect(res.json).toHaveBeenCalledWith({
      accessToken: 'mock-jwt-token',
      refreshToken: 'mock-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 1800, // 30분
      user: expect.objectContaining({
        id: 1,
        provider: 'kakao',
      }),
      token: 'mock-jwt-token', // Deprecated (하위 호환성)
    });

    expect(authProbe.loginSuccess).toHaveBeenCalledWith({
      userId: 1,
      provider: 'kakao',
      appCode: 'test-app',
    });

    expect(authProbe.refreshTokenIssued).toHaveBeenCalledWith({
      userId: 1,
      jti: 'refresh-jti-123',
      tokenFamily: 'family-123',
    });
  });

  it('should throw NotFoundException when app not found', async () => {
    vi.mocked(oauthLoginSchema.parse).mockReturnValue({
      code: 'test-app',
      provider: 'kakao',
      accessToken: 'valid-token',
    });

    vi.mocked(findAppByCode).mockResolvedValue(null);

    await expect(oauthLogin(req as Request, res as Response)).rejects.toThrow(NotFoundException);
  });

  it('should throw ValidationException when provider not configured', async () => {
    vi.mocked(oauthLoginSchema.parse).mockReturnValue({
      code: 'test-app',
      provider: 'kakao',
      accessToken: 'valid-token',
    });

    vi.mocked(findAppByCode).mockResolvedValue({
      id: 1,
      code: 'test-app',
      name: 'Test App',
      kakaoRestApiKey: null, // Not configured
      kakaoClientSecret: null,
      jwtSecret: 'jwt-secret',
      jwtExpiresIn: '7d',
    } as any);

    await expect(oauthLogin(req as Request, res as Response)).rejects.toThrow(ValidationException);
  });

  it('should call loginFailed probe when error occurs', async () => {
    vi.mocked(oauthLoginSchema.parse).mockReturnValue({
      code: 'test-app',
      provider: 'kakao',
      accessToken: 'valid-token',
    });

    vi.mocked(findAppByCode).mockResolvedValue({
      id: 1,
      code: 'test-app',
      name: 'Test App',
      kakaoRestApiKey: 'kakao-key',
      kakaoClientSecret: 'kakao-secret',
      jwtSecret: 'jwt-secret',
      jwtExpiresIn: '7d',
    } as any);

    vi.mocked(createOAuthProvider).mockReturnValue(mockProvider);

    const testError = new Error('Token verification failed');
    mockProvider.verifyToken.mockRejectedValue(testError);

    await expect(oauthLogin(req as Request, res as Response)).rejects.toThrow();

    expect(authProbe.loginFailed).toHaveBeenCalledWith({
      provider: 'kakao',
      appCode: 'test-app',
      reason: 'Token verification failed',
    });
  });
});

describe('refreshToken handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: {
        refreshToken: 'valid-refresh-token',
      },
      ip: '127.0.0.1',
    };

    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    vi.clearAllMocks();
  });

  it('should rotate refresh token successfully', async () => {
    const mockStoredToken = {
      id: 1,
      jti: 'old-jti',
      tokenFamily: 'family-1',
      userId: 1,
      appId: 1,
      revoked: false,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    };

    const mockUser = { id: 1, email: 'test@example.com', nickname: 'Test' };
    const mockApp = {
      id: 1,
      jwtSecret: 'test-secret',
      accessTokenExpiresIn: '30m',
      refreshTokenExpiresIn: '14d',
    };

    vi.mocked(refreshTokenSchema.parse).mockReturnValue({
      refreshToken: 'valid-refresh-token',
    });

    vi.mocked(verifyRefreshToken).mockResolvedValue({
      sub: 1,
      appId: 1,
      jti: 'old-jti',
      tokenFamily: 'family-1',
    });

    vi.mocked(findRefreshTokenByJti).mockResolvedValue(mockStoredToken);
    vi.mocked(findAppByCode).mockResolvedValue(mockApp as any);
    vi.mocked(upsertUser).mockResolvedValue(mockUser as any);

    vi.mocked(rotateRefreshToken).mockResolvedValue({
      newAccessToken: 'new-access-token',
      newRefreshToken: 'new-refresh-token',
      newJti: 'new-jti',
    });

    await refreshToken(req as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 1800,
    });

    expect(authProbe.refreshTokenRotated).toHaveBeenCalledWith({
      userId: 1,
      oldJti: 'old-jti',
      newJti: 'new-jti',
      tokenFamily: 'family-1',
    });
  });

  it('should detect refresh token reuse and revoke all tokens', async () => {
    const mockStoredToken = {
      id: 1,
      jti: 'old-jti',
      tokenFamily: 'family-1',
      userId: 1,
      revoked: true,
      revokedAt: new Date(Date.now() - 10000), // 10초 전 (Grace Period 초과)
    };

    vi.mocked(refreshTokenSchema.parse).mockReturnValue({
      refreshToken: 'valid-refresh-token',
    });

    vi.mocked(verifyRefreshToken).mockResolvedValue({
      sub: 1,
      appId: 1,
      jti: 'old-jti',
      tokenFamily: 'family-1',
    });

    vi.mocked(findRefreshTokenByJti).mockResolvedValue(mockStoredToken);

    await expect(refreshToken(req as Request, res as Response)).rejects.toThrow(UnauthorizedException);

    expect(revokeRefreshTokenFamily).toHaveBeenCalledWith('family-1');
    expect(authProbe.refreshTokenReuseDetected).toHaveBeenCalledWith({
      userId: 1,
      jti: 'old-jti',
      tokenFamily: 'family-1',
      ip: '127.0.0.1',
    });
  });

  it('should allow retry within grace period', async () => {
    const mockStoredToken = {
      id: 1,
      jti: 'old-jti',
      tokenFamily: 'family-1',
      userId: 1,
      revoked: true,
      revokedAt: new Date(Date.now() - 3000), // 3초 전 (Grace Period 내)
    };

    vi.mocked(refreshTokenSchema.parse).mockReturnValue({
      refreshToken: 'valid-refresh-token',
    });

    vi.mocked(verifyRefreshToken).mockResolvedValue({
      sub: 1,
      appId: 1,
      jti: 'old-jti',
      tokenFamily: 'family-1',
    });

    vi.mocked(findRefreshTokenByJti).mockResolvedValue(mockStoredToken);

    await expect(refreshToken(req as Request, res as Response)).rejects.toThrow(UnauthorizedException);

    expect(revokeRefreshTokenFamily).not.toHaveBeenCalled();
  });

  it('should reject expired refresh token', async () => {
    const mockStoredToken = {
      id: 1,
      jti: 'old-jti',
      userId: 1,
      revoked: false,
      expiresAt: new Date(Date.now() - 1000), // 1초 전 만료
    };

    vi.mocked(refreshTokenSchema.parse).mockReturnValue({
      refreshToken: 'valid-refresh-token',
    });

    vi.mocked(verifyRefreshToken).mockResolvedValue({
      sub: 1,
      appId: 1,
      jti: 'old-jti',
      tokenFamily: 'family-1',
    });

    vi.mocked(findRefreshTokenByJti).mockResolvedValue(mockStoredToken);

    await expect(refreshToken(req as Request, res as Response)).rejects.toThrow(UnauthorizedException);
  });
});

describe('logout handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: {
        refreshToken: 'valid-refresh-token',
        revokeAll: false,
      },
    };

    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    vi.clearAllMocks();
  });

  it('should revoke single refresh token', async () => {
    const mockStoredToken = { id: 1, userId: 1, jti: 'jti-1', revoked: false };

    vi.mocked(logoutSchema.parse).mockReturnValue({
      refreshToken: 'valid-refresh-token',
      revokeAll: false,
    });

    vi.mocked(verifyRefreshToken).mockResolvedValue({
      sub: 1,
      appId: 1,
      jti: 'jti-1',
      tokenFamily: 'family-1',
    });

    vi.mocked(findRefreshTokenByJti).mockResolvedValue(mockStoredToken);

    await logout(req as Request, res as Response);

    expect(revokeRefreshTokenById).toHaveBeenCalledWith(1);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();

    expect(authProbe.refreshTokenRevoked).toHaveBeenCalledWith({
      userId: 1,
      jti: 'jti-1',
      revokeAll: false,
    });
  });

  it('should revoke all refresh tokens for user', async () => {
    const mockStoredToken = { id: 1, userId: 1, jti: 'jti-1', revoked: false };

    vi.mocked(logoutSchema.parse).mockReturnValue({
      refreshToken: 'valid-refresh-token',
      revokeAll: true,
    });

    vi.mocked(verifyRefreshToken).mockResolvedValue({
      sub: 1,
      appId: 1,
      jti: 'jti-1',
      tokenFamily: 'family-1',
    });

    vi.mocked(findRefreshTokenByJti).mockResolvedValue(mockStoredToken);

    await logout(req as Request, res as Response);

    expect(revokeRefreshTokensByUserId).toHaveBeenCalledWith(1);
    expect(res.status).toHaveBeenCalledWith(204);

    expect(authProbe.refreshTokenRevoked).toHaveBeenCalledWith({
      userId: 1,
      jti: 'jti-1',
      revokeAll: true,
    });
  });

  it('should return 204 for already revoked token (idempotent)', async () => {
    const mockStoredToken = { id: 1, userId: 1, jti: 'jti-1', revoked: true };

    vi.mocked(logoutSchema.parse).mockReturnValue({
      refreshToken: 'valid-refresh-token',
      revokeAll: false,
    });

    vi.mocked(verifyRefreshToken).mockResolvedValue({
      sub: 1,
      appId: 1,
      jti: 'jti-1',
      tokenFamily: 'family-1',
    });

    vi.mocked(findRefreshTokenByJti).mockResolvedValue(mockStoredToken);

    await logout(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(204);
  });
});
