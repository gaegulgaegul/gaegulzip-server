import { OAuthUserInfo } from '../types';

/**
 * OAuth Provider 공통 인터페이스
 */
export interface IOAuthProvider {
  /**
   * Access Token 유효성 검증
   * @throws UnauthorizedException 토큰이 유효하지 않은 경우
   * @throws ExternalApiException 외부 API 호출 실패 시
   */
  verifyToken(accessToken: string): Promise<void>;

  /**
   * 사용자 정보 조회 (정규화된 형태로 반환)
   * @throws ExternalApiException 외부 API 호출 실패 시
   */
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;

  /**
   * Provider 이름
   */
  readonly name: string;
}
