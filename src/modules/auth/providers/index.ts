import { IOAuthProvider } from './base';
import { KakaoProvider } from './kakao';
import { ValidationException } from '../../../utils/errors';

/**
 * Provider별 크레덴셜 인터페이스
 */
interface ProviderCredentials {
  kakao?: {
    restApiKey: string;
    clientSecret: string;
  };
  // 향후 추가: naver, google, apple
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

    // 향후 추가: case 'naver', 'google', 'apple'

    default:
      throw new ValidationException(`Unsupported provider: ${provider}`);
  }
}
