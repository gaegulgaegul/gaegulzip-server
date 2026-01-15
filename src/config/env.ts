import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET_FALLBACK: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
});

/**
 * 환경 변수 검증 및 타입 안전한 객체
 */
export const env = envSchema.parse(process.env);
