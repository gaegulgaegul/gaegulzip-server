import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/** 데이터베이스 연결 클라이언트 */
const client = postgres(process.env.DATABASE_URL!);

/** Drizzle ORM 인스턴스 */
export const db = drizzle(client);
