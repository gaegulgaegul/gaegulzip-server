import axios from 'axios';
import { IOAuthProvider } from './base';
import { OAuthUserInfo, GoogleTokenInfo, GoogleUserInfo } from '../types';
import {
  UnauthorizedException,
  ExternalApiException,
  ErrorCode
} from '../../../utils/errors';

/**
 * 구글 OAuth Provider 구현체
 */
export class GoogleProvider implements IOAuthProvider {
  readonly name = 'google';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  /**
   * 구글 토큰 유효성 검증
   * @param accessToken - 검증할 구글 액세스 토큰
   * @throws UnauthorizedException 토큰이 유효하지 않은 경우
   * @throws ExternalApiException 구글 API 호출 실패 시
   */
  async verifyToken(accessToken: string): Promise<void> {
    try {
      await axios.get<GoogleTokenInfo>(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
      );

      // 200 응답이면 토큰이 유효함
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 401) {
        throw new UnauthorizedException(ErrorCode.INVALID_ACCESS_TOKEN);
      }
      throw new ExternalApiException('google', error);
    }
  }

  /**
   * 구글 사용자 정보 조회 및 정규화
   * @param accessToken - 구글 액세스 토큰
   * @returns 정규화된 사용자 정보
   * @throws ExternalApiException 구글 API 호출 실패 시
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await axios.get<GoogleUserInfo>(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      const { id, email, name, picture } = response.data;

      return {
        providerId: id,
        email: email ?? null,
        nickname: name ?? null,
        profileImage: picture ?? null,
      };
    } catch (error: any) {
      throw new ExternalApiException('google', error);
    }
  }
}
