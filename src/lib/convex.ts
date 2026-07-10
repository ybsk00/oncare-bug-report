import 'server-only';
import { ConvexHttpClient } from 'convex/browser';
import { readEnv } from './env';

let cached: ConvexHttpClient | null = null;

/**
 * Convex 클라이언트. **서버에서만** 만든다.
 * 브라우저는 Convex 를 직접 부르지 않으며, 배포 URL 도 알 필요가 없다.
 */
export function getConvex(): ConvexHttpClient {
  if (cached) return cached;
  cached = new ConvexHttpClient(env().convexUrl);
  return cached;
}

export function env() {
  return readEnv(process.env as Record<string, string | undefined>);
}
