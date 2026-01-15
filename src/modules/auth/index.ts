import { Router } from 'express';
import * as handlers from './handlers';

const router = Router();

/**
 * POST /auth/oauth
 * 통합 OAuth 로그인 (카카오/네이버/구글/애플)
 * Body: { code, provider, accessToken }
 */
router.post('/oauth', handlers.oauthLogin);

/**
 * GET /auth/oauth/callback
 * OAuth Callback (카카오 Authorization Code 방식)
 * Query: { code, state }
 */
router.get('/oauth/callback', handlers.oauthCallback);

export default router;
