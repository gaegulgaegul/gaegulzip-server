import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Refresh Token을 bcrypt로 해싱한다
 * @param token - 원본 Refresh Token
 * @returns bcrypt 해시
 */
export const hashRefreshToken = async (token: string): Promise<string> => {
  return bcrypt.hash(token, SALT_ROUNDS);
};

/**
 * Refresh Token과 해시를 비교한다
 * @param token - 원본 Refresh Token
 * @param hash - bcrypt 해시
 * @returns 일치 여부
 */
export const compareRefreshToken = async (token: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(token, hash);
};

/**
 * 만료 시간 문자열을 초 단위로 변환한다
 * @param expiresIn - 만료 시간 문자열 (예: "30m", "14d", "2h")
 * @returns 초 단위 시간
 * @throws Error 잘못된 형식
 */
export const parseExpiresIn = (expiresIn: string): number => {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiresIn format: ${expiresIn}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
};

/**
 * 만료 시간 문자열을 Date 객체로 변환한다
 * @param expiresIn - 만료 시간 문자열 (예: "30m", "14d")
 * @returns 만료 시각 Date 객체
 */
export const calculateExpiresAt = (expiresIn: string): Date => {
  const seconds = parseExpiresIn(expiresIn);
  return new Date(Date.now() + seconds * 1000);
};
