import { Router } from 'express';
import * as handlers from './handlers';

const router = Router();

/**
 * OAuth 로그인 (카카오/네이버/구글/애플)
 * @route POST /auth/oauth
 * @body { code: string, provider: string, accessToken: string }
 * @returns 200: { token, user }
 */
router.post('/oauth', handlers.oauthLogin);

/**
 * OAuth Callback (카카오 Authorization Code 방식)
 * @route GET /auth/oauth/callback
 * @query { code: string, state?: string }
 * @returns HTML: 로그인 성공 페이지
 */
router.get('/oauth/callback', handlers.oauthCallback);

/**
 * Access Token 갱신 (Refresh Token 사용)
 * @route POST /auth/refresh
 * @body { refreshToken: string }
 * @returns 200: { accessToken, refreshToken, tokenType, expiresIn }
 * @throws 401: Refresh Token 만료/무효화/재사용 시
 */
router.post('/refresh', handlers.refreshToken);

/**
 * 로그아웃 (Refresh Token 무효화)
 * @route POST /auth/logout
 * @body { refreshToken: string, revokeAll?: boolean }
 * @returns 204: No Content
 * @throws 401: Refresh Token이 존재하지 않음
 */
router.post('/logout', handlers.logout);

export default router;
