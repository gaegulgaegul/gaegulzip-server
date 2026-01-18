import { z } from 'zod';

/**
 * 지원하는 OAuth 제공자 타입
 */
export const OAuthProvider = z.enum(['kakao', 'naver', 'google', 'apple']);
export type OAuthProvider = z.infer<typeof OAuthProvider>;

/**
 * OAuth 로그인 요청 스키마
 */
export const oauthLoginSchema = z.object({
  code: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Invalid app code format'),
  provider: OAuthProvider,
  accessToken: z.string().min(1, 'Access token is required'),
});

/**
 * OAuth 로그인 요청 타입
 */
export type OAuthLoginRequest = z.infer<typeof oauthLoginSchema>;

/**
 * Refresh Token 요청 스키마
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/**
 * Refresh Token 요청 타입
 */
export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;

/**
 * Logout 요청 스키마
 */
export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  revokeAll: z.boolean().optional().default(false),
});

/**
 * Logout 요청 타입
 */
export type LogoutRequest = z.infer<typeof logoutSchema>;
