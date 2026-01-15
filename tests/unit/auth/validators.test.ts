import { describe, it, expect } from 'vitest';
import { oauthLoginSchema } from '../../../src/modules/auth/validators';

describe('oauthLoginSchema', () => {
  it('should validate valid request', () => {
    const data = {
      code: 'test-app',
      provider: 'kakao',
      accessToken: 'valid-token',
    };
    expect(() => oauthLoginSchema.parse(data)).not.toThrow();
  });

  it('should throw on missing code', () => {
    const data = { provider: 'kakao', accessToken: 'token' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should throw on missing provider', () => {
    const data = { code: 'test-app', accessToken: 'token' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should throw on missing accessToken', () => {
    const data = { code: 'test-app', provider: 'kakao' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should throw on invalid code format', () => {
    const data = { code: 'INVALID_CODE', provider: 'kakao', accessToken: 'token' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should throw on invalid provider', () => {
    const data = { code: 'test-app', provider: 'facebook', accessToken: 'token' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should accept all valid providers', () => {
    const providers = ['kakao', 'naver', 'google', 'apple'];
    providers.forEach(provider => {
      const data = { code: 'test-app', provider, accessToken: 'token' };
      expect(() => oauthLoginSchema.parse(data)).not.toThrow();
    });
  });
});
