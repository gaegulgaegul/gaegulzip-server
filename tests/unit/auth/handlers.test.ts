import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { oauthLogin } from '../../../src/modules/auth/handlers';
import { oauthLoginSchema } from '../../../src/modules/auth/validators';
import { findAppByCode, upsertUser, generateJWT } from '../../../src/modules/auth/services';
import { createOAuthProvider } from '../../../src/modules/auth/providers';
import * as authProbe from '../../../src/modules/auth/auth.probe';
import { NotFoundException, ValidationException } from '../../../src/utils/errors';

// Mock all dependencies
vi.mock('../../../src/modules/auth/validators', () => ({
  oauthLoginSchema: {
    parse: vi.fn(),
  },
}));

vi.mock('../../../src/modules/auth/services', () => ({
  findAppByCode: vi.fn(),
  upsertUser: vi.fn(),
  generateJWT: vi.fn(),
}));

vi.mock('../../../src/modules/auth/providers', () => ({
  createOAuthProvider: vi.fn(),
}));

vi.mock('../../../src/modules/auth/auth.probe', () => ({
  loginSuccess: vi.fn(),
  loginFailed: vi.fn(),
  userRegistered: vi.fn(),
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

  it('should return token and user on successful login', async () => {
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

    await oauthLogin(req as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'mock-jwt-token',
        user: expect.objectContaining({
          id: 1,
          provider: 'kakao',
        }),
      })
    );

    expect(authProbe.loginSuccess).toHaveBeenCalledWith({
      userId: 1,
      provider: 'kakao',
      appCode: 'test-app',
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
