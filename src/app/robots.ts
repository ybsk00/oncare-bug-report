import type { MetadataRoute } from 'next';

// 직원 전용 도구다. 검색엔진이 긁어가면 안 된다.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
