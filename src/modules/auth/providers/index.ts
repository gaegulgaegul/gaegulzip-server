import { IOAuthProvider } from './base';
import { KakaoProvider } from './kakao';
import { NaverProvider } from './naver';
import { GoogleProvider } from './google';
import { AppleProvider } from './apple';
import { ValidationException } from '../../../utils/errors';

/**
 * Provider별 크레덴셜 인터페이스
 */
interface ProviderCredentials {
  kakao?: {
    restApiKey: string;
    clientSecret: string;
  };
  naver?: {
    clientId: string;
    clientSecret: string;
  };
  google?: {
    clientId: string;
    clientSecret: string;
  };
  apple?: {
    clientId: string;
    teamId: string;
    keyId: string;
    privateKey: string;
  };
}

/**
 * Provider 인스턴스 생성 팩토리
 * @param provider - OAuth 제공자 이름 ('kakao', 'naver', 'google', 'apple')
 * @param credentials - Provider별 크레덴셜 객체
 * @returns IOAuthProvider 인터페이스를 구현한 Provider 인스턴스
 * @throws ValidationException Provider가 지원되지 않거나 크레덴셜이 없는 경우
 */
export function createOAuthProvider(
  provider: string,
  credentials: ProviderCredentials
): IOAuthProvider {
  switch (provider) {
    case 'kakao':
      if (!credentials.kakao) {
        throw new ValidationException('Kakao credentials not configured');
      }
      return new KakaoProvider(
        credentials.kakao.restApiKey,
        credentials.kakao.clientSecret
      );

    case 'naver':
      if (!credentials.naver) {
        throw new ValidationException('Naver credentials not configured');
      }
      return new NaverProvider(
        credentials.naver.clientId,
        credentials.naver.clientSecret
      );

    case 'google':
      if (!credentials.google) {
        throw new ValidationException('Google credentials not configured');
      }
      return new GoogleProvider(
        credentials.google.clientId,
        credentials.google.clientSecret
      );

    case 'apple':
      if (!credentials.apple) {
        throw new ValidationException('Apple credentials not configured');
      }
      return new AppleProvider(
        credentials.apple.clientId,
        credentials.apple.teamId,
        credentials.apple.keyId,
        credentials.apple.privateKey
      );

    default:
      throw new ValidationException(`Unsupported provider: ${provider}`);
  }
}
