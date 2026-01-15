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
