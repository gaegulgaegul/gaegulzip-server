/**
 * OAuth 제공자별 사용자 정보 (정규화된 형태)
 */
export interface OAuthUserInfo {
  providerId: string;
  email: string | null;
  nickname: string | null;
  profileImage: string | null;
}

/**
 * JWT 페이로드 인터페이스 (최소화)
 */
export interface JWTPayload {
  sub: number;              // users.id (JWT 표준)
  appId: number;
  email: string | null;
  nickname: string | null;
  iat?: number;
  exp?: number;
}

/**
 * 카카오 API 응답 타입
 */
export interface KakaoTokenInfo {
  id: number;
  expires_in: number;
  app_id: number;
}

/**
 * 카카오 사용자 정보 응답 타입
 */
export interface KakaoUserInfo {
  id: number;
  kakao_account?: {
    email?: string;
  };
  properties?: {
    nickname?: string;
    profile_image?: string;
  };
}
