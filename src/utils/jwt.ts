import jwt from 'jsonwebtoken';

/**
 * JWT 토큰 생성
 * @param payload - JWT 페이로드 객체
 * @param secret - 서명에 사용할 시크릿 키
 * @param expiresIn - 만료 시간 (예: '7d', '1h')
 * @returns 생성된 JWT 토큰 문자열
 */
export function signToken(payload: object, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

/**
 * JWT 토큰 검증
 * @param token - 검증할 JWT 토큰 문자열
 * @param secret - 검증에 사용할 시크릿 키
 * @returns 디코딩된 페이로드
 */
export function verifyToken(token: string, secret: string): any {
  return jwt.verify(token, secret);
}
