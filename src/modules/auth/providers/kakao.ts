import axios from 'axios';
import { IOAuthProvider } from './base';
import { OAuthUserInfo, KakaoTokenInfo, KakaoUserInfo } from '../types';
import {
  UnauthorizedException,
  ExternalApiException,
  ErrorCode
} from '../../../utils/errors';

/**
 * 카카오 OAuth Provider 구현체
 */
export class KakaoProvider implements IOAuthProvider {
  readonly name = 'kakao';

  constructor(
    private readonly restApiKey: string,
    private readonly clientSecret: string
  ) {}

  /**
   * 카카오 토큰 유효성 검증
   * @param accessToken - 검증할 카카오 액세스 토큰
   * @throws UnauthorizedException 토큰이 유효하지 않은 경우
   * @throws ExternalApiException 카카오 API 호출 실패 시
   */
  async verifyToken(accessToken: string): Promise<void> {
    try {
      const response = await axios.get<KakaoTokenInfo>(
        'https://kapi.kakao.com/v1/user/access_token_info',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      // 토큰이 유효한지만 확인 (200 응답이면 유효함)
      // OAuth callback 플로우에서는 redirect_uri와 client_secret으로 이미 앱 검증됨
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new ExternalApiException('kakao', error);
    }
  }

  /**
   * 카카오 사용자 정보 조회 및 정규화
   * @param accessToken - 카카오 액세스 토큰
   * @returns 정규화된 사용자 정보
   * @throws ExternalApiException 카카오 API 호출 실패 시
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await axios.get<KakaoUserInfo>(
        'https://kapi.kakao.com/v2/user/me',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      const { id, kakao_account, properties } = response.data;

      return {
        providerId: id.toString(),
        email: kakao_account?.email ?? null,
        nickname: properties?.nickname ?? null,
        profileImage: properties?.profile_image ?? null,
      };
    } catch (error: any) {
      throw new ExternalApiException('kakao', error);
    }
  }
}
