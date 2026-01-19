import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { AppleProvider } from '../../../../src/modules/auth/providers/apple';
import { UnauthorizedException, ExternalApiException } from '../../../../src/utils/errors';

vi.mock('jsonwebtoken');
const mockedJwt = vi.mocked(jwt);

describe('AppleProvider', () => {
  let provider: AppleProvider;
  const clientId = 'com.example.app';
  const teamId = 'TEAM123';
  const keyId = 'KEY123';
  const privateKey = 'private-key';

  beforeEach(() => {
    provider = new AppleProvider(clientId, teamId, keyId, privateKey);
    vi.clearAllMocks();
  });

  describe('verifyToken', () => {
    it('should verify token successfully when valid', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockedJwt.decode.mockReturnValueOnce({
        header: { alg: 'RS256', kid: 'KEY123' },
        payload: {
          iss: 'https://appleid.apple.com',
          aud: clientId,
          exp: now + 3600,
          iat: now,
          sub: 'apple-user-id',
          email: 'test@icloud.com',
        },
        signature: 'signature',
      });

      await expect(provider.verifyToken('valid-token')).resolves.not.toThrow();
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockedJwt.decode.mockReturnValueOnce({
        header: { alg: 'RS256', kid: 'KEY123' },
        payload: {
          iss: 'https://appleid.apple.com',
          aud: clientId,
          exp: now - 3600, // Expired
          iat: now - 7200,
          sub: 'apple-user-id',
        },
        signature: 'signature',
      });

      await expect(provider.verifyToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when audience does not match', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockedJwt.decode.mockReturnValueOnce({
        header: { alg: 'RS256', kid: 'KEY123' },
        payload: {
          iss: 'https://appleid.apple.com',
          aud: 'com.different.app', // Different clientId
          exp: now + 3600,
          iat: now,
          sub: 'apple-user-id',
        },
        signature: 'signature',
      });

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when issuer is invalid', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockedJwt.decode.mockReturnValueOnce({
        header: { alg: 'RS256', kid: 'KEY123' },
        payload: {
          iss: 'https://fake-issuer.com', // Invalid issuer
          aud: clientId,
          exp: now + 3600,
          iat: now,
          sub: 'apple-user-id',
        },
        signature: 'signature',
      });

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token cannot be decoded', async () => {
      mockedJwt.decode.mockReturnValueOnce(null);

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should wrap other errors in ExternalApiException', async () => {
      mockedJwt.decode.mockImplementationOnce(() => {
        throw new Error('Decoding error');
      });

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(ExternalApiException);
    });
  });

  describe('getUserInfo', () => {
    it('should return normalized user info when valid token', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockedJwt.decode.mockReturnValueOnce({
        header: { alg: 'RS256', kid: 'KEY123' },
        payload: {
          iss: 'https://appleid.apple.com',
          aud: clientId,
          exp: now + 3600,
          iat: now,
          sub: 'apple-user-id',
          email: 'test@icloud.com',
          email_verified: true,
        },
        signature: 'signature',
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: 'apple-user-id',
        email: 'test@icloud.com',
        nickname: null, // Apple does not provide nickname in ID token
        profileImage: null, // Apple does not provide profile image
      });
    });

    it('should handle optional email as null', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockedJwt.decode.mockReturnValueOnce({
        header: { alg: 'RS256', kid: 'KEY123' },
        payload: {
          iss: 'https://appleid.apple.com',
          aud: clientId,
          exp: now + 3600,
          iat: now,
          sub: 'apple-user-id',
        },
        signature: 'signature',
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: 'apple-user-id',
        email: null,
        nickname: null,
        profileImage: null,
      });
    });

    it('should throw ExternalApiException when token cannot be decoded', async () => {
      mockedJwt.decode.mockReturnValueOnce(null);

      await expect(provider.getUserInfo('invalid-token')).rejects.toThrow(ExternalApiException);
    });

    it('should wrap decoding errors in ExternalApiException', async () => {
      mockedJwt.decode.mockImplementationOnce(() => {
        throw new Error('Decoding error');
      });

      await expect(provider.getUserInfo('invalid-token')).rejects.toThrow(ExternalApiException);
    });
  });
});
