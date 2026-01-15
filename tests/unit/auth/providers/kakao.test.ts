import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KakaoProvider } from '../../../../src/modules/auth/providers/kakao';
import { UnauthorizedException, ExternalApiException } from '../../../../src/utils/errors';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('KakaoProvider', () => {
  let provider: KakaoProvider;

  beforeEach(() => {
    provider = new KakaoProvider('123456', 'test-secret');
    vi.clearAllMocks();
  });

  describe('verifyToken', () => {
    it('should verify token successfully when valid', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 123, app_id: 123456, expires_in: 3600 },
      });

      await expect(provider.verifyToken('valid-token')).resolves.not.toThrow();
    });

    it('should throw UnauthorizedException when app_id mismatch', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 123, app_id: 999999, expires_in: 3600 },
      });

      await expect(provider.verifyToken('valid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should wrap axios error in ExternalApiException', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(ExternalApiException);
    });
  });

  describe('getUserInfo', () => {
    it('should return normalized user info when valid token', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 123,
          kakao_account: { email: 'test@example.com' },
          properties: { nickname: '홍길동', profile_image: 'https://example.com/image.jpg' },
        },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '123',
        email: 'test@example.com',
        nickname: '홍길동',
        profileImage: 'https://example.com/image.jpg',
      });
    });

    it('should handle optional fields as null', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 123 },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '123',
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
