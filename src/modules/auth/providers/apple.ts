import jwt from 'jsonwebtoken';
import { IOAuthProvider } from './base';
import { OAuthUserInfo, AppleIdToken } from '../types';
import {
  UnauthorizedException,
  ExternalApiException,
  ErrorCode
} from '../../../utils/errors';

/**
 * 애플 OAuth Provider 구현체
 */
export class AppleProvider implements IOAuthProvider {
  readonly name = 'apple';

  constructor(
    private readonly clientId: string,
    private readonly teamId: string,
    private readonly keyId: string,
    private readonly privateKey: string
  ) {}

  /**
   * 애플 ID Token 유효성 검증
   * @param accessToken - 검증할 애플 ID Token (JWT)
   * @throws UnauthorizedException 토큰이 유효하지 않은 경우
   * @throws ExternalApiException 토큰 파싱 실패 시
   */
  async verifyToken(accessToken: string): Promise<void> {
    try {
      // TODO: 향후 개선 - 애플 공개키를 다운로드하여 서명 검증
      // 현재는 기본 JWT 디코딩 및 만료 시간 검증만 수행
      const decoded = jwt.decode(accessToken, { complete: true });

      if (!decoded || typeof decoded === 'string') {
        throw new UnauthorizedException(ErrorCode.INVALID_ACCESS_TOKEN);
      }

      const payload = decoded.payload as AppleIdToken;

      // 만료 시간 검증
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new UnauthorizedException(ErrorCode.INVALID_ACCESS_TOKEN);
      }

      // Audience 검증 (clientId와 일치해야 함)
      if (payload.aud !== this.clientId) {
        throw new UnauthorizedException(ErrorCode.INVALID_ACCESS_TOKEN);
      }

      // Issuer 검증
      if (payload.iss !== 'https://appleid.apple.com') {
        throw new UnauthorizedException(ErrorCode.INVALID_ACCESS_TOKEN);
      }
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new ExternalApiException('apple', error);
    }
  }

  /**
   * 애플 사용자 정보 조회 및 정규화
   * @param accessToken - 애플 ID Token (JWT)
   * @returns 정규화된 사용자 정보
   * @throws ExternalApiException 토큰 파싱 실패 시
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const decoded = jwt.decode(accessToken, { complete: true });

      if (!decoded || typeof decoded === 'string') {
        throw new ExternalApiException('apple', new Error('Invalid JWT token'));
      }

      const payload = decoded.payload as AppleIdToken;

      return {
        providerId: payload.sub,
        email: payload.email ?? null,
        // 애플은 이름을 최초 로그인 시에만 제공하며, ID Token에는 포함되지 않음
        nickname: null,
        // 애플은 프로필 이미지를 제공하지 않음
        profileImage: null,
      };
    } catch (error: any) {
      throw new ExternalApiException('apple', error);
    }
  }
}
