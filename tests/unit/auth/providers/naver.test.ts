import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { NaverProvider } from '../../../../src/modules/auth/providers/naver';
import { UnauthorizedException, ExternalApiException } from '../../../../src/utils/errors';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('NaverProvider', () => {
  let provider: NaverProvider;

  beforeEach(() => {
    provider = new NaverProvider('naver-client-id', 'naver-client-secret');
    vi.clearAllMocks();
  });

  describe('verifyToken', () => {
    it('should verify token successfully when valid', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          resultcode: '00',
          message: 'success',
          response: {
            id: 'naver-user-id',
            email: 'test@naver.com',
          },
        },
      });

      await expect(provider.verifyToken('valid-token')).resolves.not.toThrow();
    });

    it('should throw UnauthorizedException when resultcode is not 00', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          resultcode: '401',
          message: 'Invalid token',
          response: null,
        },
      });

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
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
          resultcode: '00',
          message: 'success',
          response: {
            id: 'naver-user-id',
            email: 'test@naver.com',
            nickname: '홍길동',
            profile_image: 'https://example.com/image.jpg',
          },
        },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: 'naver-user-id',
        email: 'test@naver.com',
        nickname: '홍길동',
        profileImage: 'https://example.com/image.jpg',
      });
    });

    it('should handle optional fields as null', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          resultcode: '00',
          message: 'success',
          response: {
            id: 'naver-user-id',
          },
        },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: 'naver-user-id',
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
