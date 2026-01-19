import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { GoogleProvider } from '../../../../src/modules/auth/providers/google';
import { UnauthorizedException, ExternalApiException } from '../../../../src/utils/errors';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('GoogleProvider', () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    provider = new GoogleProvider('google-client-id', 'google-client-secret');
    vi.clearAllMocks();
  });

  describe('verifyToken', () => {
    it('should verify token successfully when valid', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          issued_to: 'google-client-id',
          audience: 'google-client-id',
          user_id: 'google-user-id',
          scope: 'email profile',
          expires_in: 3600,
        },
      });

      await expect(provider.verifyToken('valid-token')).resolves.not.toThrow();
    });

    it('should throw UnauthorizedException when token is invalid (400)', async () => {
      const error: any = new Error('Invalid token');
      error.response = { status: 400 };
      mockedAxios.get.mockRejectedValueOnce(error);

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token is invalid (401)', async () => {
      const error: any = new Error('Unauthorized');
      error.response = { status: 401 };
      mockedAxios.get.mockRejectedValueOnce(error);

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should wrap other axios errors in ExternalApiException', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(ExternalApiException);
    });
  });

  describe('getUserInfo', () => {
    it('should return normalized user info when valid token', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 'google-user-id',
          email: 'test@gmail.com',
          verified_email: true,
          name: 'Hong Gildong',
          picture: 'https://example.com/image.jpg',
        },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: 'google-user-id',
        email: 'test@gmail.com',
        nickname: 'Hong Gildong',
        profileImage: 'https://example.com/image.jpg',
      });
    });

    it('should handle optional fields as null', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 'google-user-id',
        },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: 'google-user-id',
        email: null,
        nickname: null,
        profileImage: null,
      });
    });

    it('should wrap axios error in ExternalApiException', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.getUserInfo('invalid-token')).rejects.toThrow(ExternalApiException);
    });
  });
});
