import axios from 'axios';
import { IOAuthProvider } from './base';
import { OAuthUserInfo, NaverUserInfo } from '../types';
import {
  UnauthorizedException,
  ExternalApiException,
  ErrorCode
} from '../../../utils/errors';

/**
 * 네이버 OAuth Provider 구현체
 */
export class NaverProvider implements IOAuthProvider {
  readonly name = 'naver';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  /**
   * 네이버 토큰 유효성 검증
   * @param accessToken - 검증할 네이버 액세스 토큰
   * @throws UnauthorizedException 토큰이 유효하지 않은 경우
   * @throws ExternalApiException 네이버 API 호출 실패 시
   */
  async verifyToken(accessToken: string): Promise<void> {
    try {
      const response = await axios.get<NaverUserInfo>(
        'https://openapi.naver.com/v1/nid/me',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      // resultcode가 "00"이면 성공
      if (response.data.resultcode !== '00') {
        throw new UnauthorizedException(ErrorCode.INVALID_ACCESS_TOKEN);
      }
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new ExternalApiException('naver', error);
    }
  }

  /**
   * 네이버 사용자 정보 조회 및 정규화
   * @param accessToken - 네이버 액세스 토큰
   * @returns 정규화된 사용자 정보
   * @throws ExternalApiException 네이버 API 호출 실패 시
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await axios.get<NaverUserInfo>(
        'https://openapi.naver.com/v1/nid/me',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      const { response: userInfo } = response.data;

      return {
        providerId: userInfo.id,
        email: userInfo.email ?? null,
        nickname: userInfo.nickname ?? null,
        profileImage: userInfo.profile_image ?? null,
      };
    } catch (error: any) {
      throw new ExternalApiException('naver', error);
    }
  }
}
