# 온코케어 앱 버그 리포트 Implementation Plan

> ## ⚠ 이 계획서는 대체되었다 (2026-07-10)
>
> 작성 후 **저장소를 Supabase → Convex 로 바꿨다** (대표님: "임시 DB 는 슈파베이스를 안 씁니다").
> 아래 Task 4~8 의 `supabase/migrations/*.sql`·`src/lib/supabase.ts`·`service_role`·RLS·signed URL 코드는
> **구현되지 않았고 앞으로도 쓰지 않는다.** 그대로 따라가면 안 된다.
>
> 실제로 만들어진 것의 단일 소스:
> - 설계 — `docs/2026-07-10-oncocare-bug-report-design.md` (Convex 로 갱신됨)
> - 배포 — `docs/DEPLOY.md`
> - 코드 — `convex/`(schema·reports·files·guard) + `src/`
>
> **살아 있는 부분**: Global Constraints 의 보안 요구(매직바이트·bcrypt·레이트리밋·오답 응답 통일·`NEXT_PUBLIC_` 금지)와
> Task 1~3(스캐폴딩·순수 유틸)·Task 9(사이드바 링크). 저장소 관련 문장만 아래 대응표로 읽는다.
>
> | 계획서(Supabase) | 실제(Convex) |
> |---|---|
> | `service_role` 키 | `SERVER_SECRET` (Convex 함수 `assertServer()` 가 검사) |
> | RLS ON + 정책 없음 | Convex 함수가 전부 `assertServer()` — 브라우저는 Convex 를 직접 부르지 않음 |
> | private 버킷 + 60초 signed URL | Convex `_storage` + **서버 이미지 프록시** `/api/image/[id]/[index]` (URL 자체가 브라우저에 안 나감) |
> | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `CONVEX_URL` / `SERVER_SECRET` |
> | `bug_reports` 테이블 | `bugReports` 테이블 (`convex/schema.ts`) |
>
> **★ Convex 가 더 강한 지점**: `storage.getUrl()` 은 공개이며 만료가 없다. 그래서 그 URL 을 브라우저에 주지 않고
> 서버가 대신 받아 스트리밍한다 — 한 번 새어나간 링크가 영원히 사는 signed-URL 의 약점이 아예 없다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 링크를 아는 사람은 누구나 온코케어 앱 버그를 올릴 수 있고, 올린 본인과 시스템 관리자만 본문을 볼 수 있는 독립 웹앱을 만든다.

**Architecture:** Next.js 14 App Router를 Vercel에 배포한다. DB·이미지는 **그룹웨어와 완전히 분리된 새 Supabase 프로젝트**를 쓴다. 로그인이 없으므로 게시글마다 받은 비번(bcrypt 해시)으로 작성자를 식별한다. 모든 DB 접근은 서버 라우트에서 `service_role` 키로만 하고, 테이블은 RLS를 켜되 정책을 만들지 않아 브라우저에서 직접 닿을 수 없게 한다.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Storage) · `@supabase/supabase-js` · `bcryptjs` · `zod` · `jose`(쿠키 서명) · Vitest

## Global Constraints

- 프로젝트 루트: `C:\Users\유범석\개발소스코드\26_03\암요양app\oncocare-bug-report`
- **`SUPABASE_SERVICE_ROLE_KEY` 를 `NEXT_PUBLIC_` 접두사로 노출하지 않는다.** 서버 전용.
- **비번은 bcrypt 해시로만 저장한다.** 평문 저장 금지.
- `bug_reports` 테이블은 RLS ON + **정책 없음** (anon/authenticated 전면 차단).
- 스토리지 `bug-images` 버킷은 **private**. 열람 시 만료 60초 signed URL 발급.
- 이미지: `image/jpeg` · `image/png` · `image/webp` 만. **5MB 이하, 1~3장**. 확장자가 아니라 **매직바이트**로 판별.
- 레이트리밋: 제출 `IP당 10분에 3건`, 비번 열람 시도 `IP당 1분에 5회`.
- 비번 오답 응답은 `"비밀번호가 일치하지 않습니다"` 만 반환. 글 존재 여부·작성자를 흘리지 않는다.
- 상태 값은 `접수 | 확인중 | 수정완료 | 재현불가` 넷뿐.
- 브랜드: `온코케어 AI`, 카피 `근거로 돌보는 케어`. 톤은 의료/신뢰/따뜻함.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 를 붙인다.
- PowerShell 5.1에서 `git commit -m "..."` 은 큰따옴표 문제가 있으므로 **Bash 툴 + heredoc** 을 쓴다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts` | 프로젝트 설정 |
| `.env.example` | 필요한 환경변수 목록 (실제 값 없음) |
| `supabase/migrations/0001_init.sql` | 테이블·인덱스·RLS·버킷 |
| `src/lib/env.ts` | 환경변수 읽기 + 부재 시 즉시 실패 |
| `src/lib/supabase.ts` | service_role 클라이언트 (서버 전용) |
| `src/lib/password.ts` | bcrypt 해시/검증 (순수) |
| `src/lib/imageValidate.ts` | 매직바이트·크기·장수 검증 (순수) |
| `src/lib/rateLimit.ts` | 윈도 판정 (순수) + DB 기록 |
| `src/lib/schema.ts` | zod 입력 스키마 (순수) |
| `src/lib/session.ts` | 관리자 세션 쿠키 서명/검증 |
| `src/lib/ip.ts` | 요청에서 클라이언트 IP 추출 (순수) |
| `src/app/api/reports/route.ts` | `POST` 제출 · `GET` 목록 |
| `src/app/api/reports/[id]/unlock/route.ts` | 비번 검증 → 본문 + signed URL |
| `src/app/api/admin/login/route.ts` | 관리자 로그인 |
| `src/app/api/admin/reports/[id]/route.ts` | 상태·답변 수정 |
| `src/app/page.tsx` | 목록 |
| `src/app/new/page.tsx` | 작성 폼 |
| `src/app/report/[id]/page.tsx` | 비번 입력 → 열람 |
| `src/app/admin/page.tsx` | 관리자 화면 |
| `src/app/layout.tsx`, `src/app/globals.css` | 레이아웃·브랜딩 |
| `src/app/robots.ts` | 색인 차단 |
| `docs/DEPLOY.md` | 대표님이 할 일(Supabase·Vercel·DNS) |
| 그룹웨어 `apps/web/components/Sidebar.tsx` | 외부 링크 1줄 추가 |

---

### Task 1: 프로젝트 스캐폴딩 + 순수 유틸(비번·IP) TDD

의존성 없는 순수 함수부터 세운다. 이 둘이 있어야 이후 라우트를 테스트할 수 있다.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `src/lib/password.ts`, `src/lib/ip.ts`
- Test: `src/lib/password.test.ts`, `src/lib/ip.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `getClientIp(headers: Headers): string | null`

- [ ] **Step 1: 프로젝트 파일 생성**

`package.json`
```json
{
  "name": "oncocare-bug-report",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "bcryptjs": "^2.4.3",
    "jose": "^5.9.6",
    "next": "14.2.15",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.0",
    "vitest": "^2.1.9"
  }
}
```

`tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.mjs`
```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
```

`vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

`.gitignore`
```
node_modules
.next
.env
.env.local
*.tsbuildinfo
next-env.d.ts
```

`.env.example`
```
# 서버 전용. NEXT_PUBLIC_ 접두사를 절대 붙이지 말 것.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
SESSION_SECRET=
```

- [ ] **Step 2: 의존성 설치**

Run: `cd "C:/Users/유범석/개발소스코드/26_03/암요양app/oncocare-bug-report" && npm install`
Expected: `added N packages` (에러 없음)

- [ ] **Step 3: 실패하는 테스트 작성**

`src/lib/password.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('해시는 평문을 담지 않는다', async () => {
    const hash = await hashPassword('mypw1234');
    expect(hash).not.toContain('mypw1234');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('같은 평문도 매번 다른 해시 (salt)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('맞는 비번은 통과, 틀린 비번은 거부', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('correct', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('빈 비번은 해시하지 않는다', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });
});
```

`src/lib/ip.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { getClientIp } from './ip';

const h = (o: Record<string, string>) => new Headers(o);

describe('getClientIp', () => {
  it('x-forwarded-for 의 첫 IP (Vercel 프록시 체인)', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
  });

  it('공백을 제거한다', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '  5.6.7.8  ' }))).toBe('5.6.7.8');
  });

  it('x-real-ip 폴백', () => {
    expect(getClientIp(h({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('헤더가 없으면 null — 레이트리밋은 이 경우를 별도 처리한다', () => {
    expect(getClientIp(h({}))).toBeNull();
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./password"`

- [ ] **Step 5: 최소 구현**

`src/lib/password.ts`
```ts
import bcrypt from 'bcryptjs';

const COST = 10;

/** 게시글 전용 비번을 해시한다. 평문은 어디에도 저장하지 않는다. */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain) throw new Error('비밀번호가 비어 있습니다.');
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}
```

`src/lib/ip.ts`
```ts
/**
 * Vercel 은 x-forwarded-for 에 "클라이언트, 프록시1, 프록시2" 형태로 쌓는다.
 * 맨 앞이 실제 클라이언트다. 헤더가 없으면 null 을 돌려주고, 호출부가 판단한다
 * (IP 를 모른다고 조용히 통과시키면 레이트리밋이 무력해진다).
 */
export function getClientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip')?.trim();
  return real || null;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — `Tests 8 passed`

- [ ] **Step 7: 커밋**

```bash
cd "C:/Users/유범석/개발소스코드/26_03/암요양app/oncocare-bug-report"
git add package.json tsconfig.json next.config.mjs vitest.config.ts .gitignore .env.example src/lib/password.ts src/lib/password.test.ts src/lib/ip.ts src/lib/ip.test.ts package-lock.json
git commit -F - <<'EOF'
feat: 프로젝트 스캐폴딩 + 비번 해시·IP 추출

- bcrypt 해시만 저장 (평문 금지). 빈 비번은 거부.
- x-forwarded-for 첫 IP. 헤더 없으면 null 을 돌려 호출부가 판단하게 한다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: 이미지 검증 (매직바이트)

확장자는 위조된다. 실제 바이트로 판별한다.

**Files:**
- Create: `src/lib/imageValidate.ts`
- Test: `src/lib/imageValidate.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type ImageKind = 'image/jpeg' | 'image/png' | 'image/webp'`
  - `sniffImageType(bytes: Uint8Array): ImageKind | null`
  - `MAX_IMAGE_BYTES: number` (5 * 1024 * 1024)
  - `MAX_IMAGES: number` (3)
  - `validateImages(files: {bytes: Uint8Array; size: number}[]): { ok: true } | { ok: false; error: string }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/imageValidate.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { sniffImageType, validateImages, MAX_IMAGE_BYTES } from './imageValidate';

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = () => {
  const b = new Uint8Array(12);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return b;
};
const gif = () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const file = (bytes: Uint8Array, size = bytes.length) => ({ bytes, size });

describe('sniffImageType', () => {
  it('jpeg/png/webp 를 바이트로 판별', () => {
    expect(sniffImageType(jpeg())).toBe('image/jpeg');
    expect(sniffImageType(png())).toBe('image/png');
    expect(sniffImageType(webp())).toBe('image/webp');
  });

  it('허용하지 않는 타입(gif)은 null', () => {
    expect(sniffImageType(gif())).toBeNull();
  });

  it('★ .jpg 로 위장한 gif 도 거부 — 확장자를 믿지 않는다', () => {
    expect(sniffImageType(gif())).toBeNull();
  });

  it('빈 바이트는 null', () => {
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });
});

describe('validateImages', () => {
  it('이미지 1장은 통과', () => {
    expect(validateImages([file(png())])).toEqual({ ok: true });
  });

  it('★ 이미지가 0장이면 거부 — 첨부는 필수', () => {
    const r = validateImages([]);
    expect(r.ok).toBe(false);
  });

  it('3장 초과 거부', () => {
    const r = validateImages([file(png()), file(png()), file(png()), file(png())]);
    expect(r).toEqual({ ok: false, error: '이미지는 최대 3장까지 첨부할 수 있습니다.' });
  });

  it('5MB 초과 거부', () => {
    const r = validateImages([file(png(), MAX_IMAGE_BYTES + 1)]);
    expect(r).toEqual({ ok: false, error: '이미지 한 장의 크기는 5MB를 넘을 수 없습니다.' });
  });

  it('허용하지 않는 타입 거부', () => {
    const r = validateImages([file(gif())]);
    expect(r).toEqual({ ok: false, error: 'jpg, png, webp 이미지만 첨부할 수 있습니다.' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test src/lib/imageValidate.test.ts`
Expected: FAIL — `Failed to resolve import "./imageValidate"`

- [ ] **Step 3: 최소 구현**

`src/lib/imageValidate.ts`
```ts
export type ImageKind = 'image/jpeg' | 'image/png' | 'image/webp';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 3;

const startsWith = (b: Uint8Array, sig: number[], offset = 0): boolean =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

/**
 * 파일 확장자와 Content-Type 은 클라이언트가 마음대로 보낸다.
 * 실제 바이트(매직넘버)로만 판별한다.
 */
export function sniffImageType(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

export function validateImages(
  files: { bytes: Uint8Array; size: number }[],
): { ok: true } | { ok: false; error: string } {
  if (files.length === 0) return { ok: false, error: '이미지를 최소 1장 첨부해 주세요.' };
  if (files.length > MAX_IMAGES) return { ok: false, error: '이미지는 최대 3장까지 첨부할 수 있습니다.' };
  for (const f of files) {
    if (f.size > MAX_IMAGE_BYTES) return { ok: false, error: '이미지 한 장의 크기는 5MB를 넘을 수 없습니다.' };
    if (!sniffImageType(f.bytes)) return { ok: false, error: 'jpg, png, webp 이미지만 첨부할 수 있습니다.' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test src/lib/imageValidate.test.ts`
Expected: PASS — `Tests 10 passed`

- [ ] **Step 5: 커밋**

```bash
git add src/lib/imageValidate.ts src/lib/imageValidate.test.ts
git commit -F - <<'EOF'
feat: 이미지 매직바이트 검증

확장자·Content-Type 은 클라이언트가 위조할 수 있다. 실제 바이트로 jpg/png/webp 만 통과.
5MB 이하, 1~3장. 0장은 거부(첨부 필수).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: 입력 스키마 + 레이트리밋 판정

**Files:**
- Create: `src/lib/schema.ts`, `src/lib/rateLimit.ts`
- Test: `src/lib/schema.test.ts`, `src/lib/rateLimit.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `reportInputSchema` (zod) → `{ department, reporterName, title, body, password, appVersion?, platform?, deviceModel? }`
  - `type ReportInput = z.infer<typeof reportInputSchema>`
  - `RATE_RULES = { submit: { max: 3, windowMs: 600_000 }, unlock: { max: 5, windowMs: 60_000 } }`
  - `isRateLimited(recentAtMs: number[], now: number, rule: { max: number; windowMs: number }): boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/schema.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { reportInputSchema } from './schema';

const base = {
  department: '간호부',
  reporterName: '홍길동',
  title: '로그인 후 앱이 종료됩니다',
  body: '로그인 버튼을 누르면 즉시 앱이 꺼집니다.',
  password: 'pw1234',
};

describe('reportInputSchema', () => {
  it('필수 필드만 있으면 통과', () => {
    expect(reportInputSchema.safeParse(base).success).toBe(true);
  });

  it('선택 필드(앱버전·OS·기기) 허용', () => {
    const r = reportInputSchema.safeParse({ ...base, appVersion: '1.0.3', platform: 'iOS', deviceModel: 'iPhone 14' });
    expect(r.success).toBe(true);
  });

  it.each(['department', 'reporterName', 'title', 'body', 'password'])('%s 누락 시 실패', (k) => {
    const bad: Record<string, unknown> = { ...base };
    delete bad[k];
    expect(reportInputSchema.safeParse(bad).success).toBe(false);
  });

  it('비번은 4자 이상', () => {
    expect(reportInputSchema.safeParse({ ...base, password: 'abc' }).success).toBe(false);
  });

  it('platform 은 iOS/Android 만', () => {
    expect(reportInputSchema.safeParse({ ...base, platform: 'Windows' }).success).toBe(false);
  });

  it('제목 200자·본문 5000자 초과 거부', () => {
    expect(reportInputSchema.safeParse({ ...base, title: 'a'.repeat(201) }).success).toBe(false);
    expect(reportInputSchema.safeParse({ ...base, body: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('공백만 있는 이름은 거부', () => {
    expect(reportInputSchema.safeParse({ ...base, reporterName: '   ' }).success).toBe(false);
  });
});
```

`src/lib/rateLimit.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { isRateLimited, RATE_RULES } from './rateLimit';

const NOW = 1_000_000;

describe('isRateLimited', () => {
  it('기록이 없으면 통과', () => {
    expect(isRateLimited([], NOW, RATE_RULES.submit)).toBe(false);
  });

  it('윈도 안 기록이 max 미만이면 통과', () => {
    expect(isRateLimited([NOW - 1000, NOW - 2000], NOW, RATE_RULES.submit)).toBe(false);
  });

  it('윈도 안 기록이 max 에 도달하면 차단', () => {
    expect(isRateLimited([NOW - 1000, NOW - 2000, NOW - 3000], NOW, RATE_RULES.submit)).toBe(true);
  });

  it('윈도 밖 기록은 세지 않는다', () => {
    const old = NOW - RATE_RULES.submit.windowMs - 1;
    expect(isRateLimited([old, old, old], NOW, RATE_RULES.submit)).toBe(false);
  });

  it('경계: 정확히 windowMs 전 기록은 윈도 밖', () => {
    const edge = NOW - RATE_RULES.submit.windowMs;
    expect(isRateLimited([edge, edge, edge], NOW, RATE_RULES.submit)).toBe(false);
  });

  it('unlock 규칙은 1분 5회', () => {
    expect(RATE_RULES.unlock).toEqual({ max: 5, windowMs: 60_000 });
    const t = Array.from({ length: 5 }, (_, i) => NOW - i * 1000);
    expect(isRateLimited(t, NOW, RATE_RULES.unlock)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test src/lib/schema.test.ts src/lib/rateLimit.test.ts`
Expected: FAIL — `Failed to resolve import "./schema"`

- [ ] **Step 3: 최소 구현**

`src/lib/schema.ts`
```ts
import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const reportInputSchema = z.object({
  department: trimmed(50),
  reporterName: trimmed(30),
  title: trimmed(200),
  body: trimmed(5000),
  /** 게시글 전용 비번. 평소 쓰는 비번을 넣지 말라고 화면에 안내한다. */
  password: z.string().min(4).max(72), // bcrypt 는 72바이트 초과분을 버린다
  appVersion: z.string().trim().max(20).optional(),
  platform: z.enum(['iOS', 'Android']).optional(),
  deviceModel: z.string().trim().max(50).optional(),
});

export type ReportInput = z.infer<typeof reportInputSchema>;

export const adminPatchSchema = z.object({
  status: z.enum(['접수', '확인중', '수정완료', '재현불가']).optional(),
  adminNote: z.string().trim().max(2000).nullable().optional(),
});
```

`src/lib/rateLimit.ts`
```ts
export const RATE_RULES = {
  /** 제출: IP당 10분에 3건 */
  submit: { max: 3, windowMs: 600_000 },
  /** 비번 열람 시도: IP당 1분에 5회 (무차별 대입 차단) */
  unlock: { max: 5, windowMs: 60_000 },
} as const;

export type RateRule = { max: number; windowMs: number };

/**
 * 윈도 안(now - windowMs, now] 의 기록 수가 max 이상이면 차단.
 * 경계(정확히 windowMs 전)는 윈도 밖으로 본다 — 시계 오차로 영구 차단되지 않게.
 */
export function isRateLimited(recentAtMs: number[], now: number, rule: RateRule): boolean {
  const cutoff = now - rule.windowMs;
  const inWindow = recentAtMs.filter((t) => t > cutoff);
  return inWindow.length >= rule.max;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 모든 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/lib/schema.ts src/lib/schema.test.ts src/lib/rateLimit.ts src/lib/rateLimit.test.ts
git commit -F - <<'EOF'
feat: 입력 스키마(zod) + 레이트리밋 판정

- 제출 IP당 10분 3건, 비번 열람 IP당 1분 5회(무차별 대입 차단)
- 경계(정확히 windowMs 전)는 윈도 밖 — 시계 오차로 영구 차단 방지

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: DB 마이그레이션 + 서버 전용 Supabase 클라이언트

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `src/lib/env.ts`, `src/lib/supabase.ts`
- Test: `src/lib/env.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `readEnv(source: Record<string, string | undefined>): { supabaseUrl: string; serviceRoleKey: string; adminPassword: string; sessionSecret: string }`
  - `getServiceClient(): SupabaseClient` (서버 전용)
  - 테이블 `public.bug_reports`, `public.rate_limit`, 버킷 `bug-images`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/0001_init.sql`
```sql
-- 온코케어 앱 버그 리포트 (2026-07-10)
-- ★ 이 프로젝트는 그룹웨어 DB 와 완전히 분리된 별도 Supabase 프로젝트다.

create extension if not exists pgcrypto;

create table public.bug_reports (
  id            uuid primary key default gen_random_uuid(),
  seq           bigserial unique,
  department    text not null,
  reporter_name text not null,
  title         text not null,
  body          text not null,
  -- bcrypt 해시만 저장한다. 평문 저장 금지.
  password_hash text not null,
  images        text[] not null,
  app_version   text,
  platform      text check (platform in ('iOS','Android')),
  device_model  text,
  status        text not null default '접수'
                check (status in ('접수','확인중','수정완료','재현불가')),
  admin_note    text,
  created_ip    inet,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index bug_reports_created_at_idx on public.bug_reports (created_at desc);

-- ★ RLS 를 켜되 정책을 만들지 않는다 → anon/authenticated 전면 차단.
--   모든 접근은 서버 라우트의 service_role 키로만 이루어진다.
--   클라이언트가 anon 키로 테이블에 닿을 수 있으면 비번 검증이 무의미해진다.
alter table public.bug_reports enable row level security;

create table public.rate_limit (
  ip     inet not null,
  action text not null check (action in ('submit','unlock')),
  at     timestamptz not null default now()
);
create index rate_limit_lookup_idx on public.rate_limit (ip, action, at desc);
alter table public.rate_limit enable row level security;

-- private 버킷. 열람 시 60초 signed URL 을 발급한다.
insert into storage.buckets (id, name, public)
values ('bug-images', 'bug-images', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: env 실패 테스트 작성**

`src/lib/env.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { readEnv } from './env';

const full = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  ADMIN_PASSWORD: 'adminpw',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('readEnv', () => {
  it('전부 있으면 읽는다', () => {
    expect(readEnv(full).supabaseUrl).toBe('https://x.supabase.co');
  });

  it.each(Object.keys(full))('%s 누락 시 즉시 실패 — 조용히 부팅되면 안 된다', (k) => {
    const partial = { ...full } as Record<string, string | undefined>;
    delete partial[k];
    expect(() => readEnv(partial)).toThrow(new RegExp(k));
  });

  it('SESSION_SECRET 은 32자 이상', () => {
    expect(() => readEnv({ ...full, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });

  it('★ service_role 키를 NEXT_PUBLIC_ 로 두면 거부한다', () => {
    expect(() =>
      readEnv({ ...full, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'leak' } as Record<string, string>),
    ).toThrow(/NEXT_PUBLIC_/);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test src/lib/env.test.ts`
Expected: FAIL — `Failed to resolve import "./env"`

- [ ] **Step 4: 최소 구현**

`src/lib/env.ts`
```ts
export interface Env {
  supabaseUrl: string;
  serviceRoleKey: string;
  adminPassword: string;
  sessionSecret: string;
}

function required(src: Record<string, string | undefined>, key: string): string {
  const v = src[key];
  if (!v) throw new Error(`환경변수 ${key} 가 없습니다.`);
  return v;
}

export function readEnv(src: Record<string, string | undefined>): Env {
  // service_role 키가 브라우저 번들로 새어나가는 최악의 사고를 부팅 시점에 막는다.
  for (const k of Object.keys(src)) {
    if (k.startsWith('NEXT_PUBLIC_') && /SERVICE_ROLE|SESSION_SECRET|ADMIN_PASSWORD/.test(k)) {
      throw new Error(`${k} — 비밀값에 NEXT_PUBLIC_ 접두사를 붙이면 브라우저로 노출됩니다.`);
    }
  }
  const sessionSecret = required(src, 'SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('환경변수 SESSION_SECRET 은 32자 이상이어야 합니다.');
  return {
    supabaseUrl: required(src, 'SUPABASE_URL'),
    serviceRoleKey: required(src, 'SUPABASE_SERVICE_ROLE_KEY'),
    adminPassword: required(src, 'ADMIN_PASSWORD'),
    sessionSecret,
  };
}
```

`src/lib/supabase.ts`
```ts
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnv } from './env';

let cached: SupabaseClient | null = null;

/** service_role 클라이언트. 서버 라우트에서만 쓴다. */
export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const env = readEnv(process.env as Record<string, string | undefined>);
  cached = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

- [ ] **Step 5: `server-only` 설치**

Run: `npm install server-only`
Expected: `added 1 package`

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/0001_init.sql src/lib/env.ts src/lib/env.test.ts src/lib/supabase.ts package.json package-lock.json
git commit -F - <<'EOF'
feat: DB 마이그레이션 + 서버 전용 Supabase 클라이언트

- bug_reports/rate_limit: RLS ON + 정책 없음 → anon 전면 차단, service_role 만 통과
- bug-images 버킷 private
- readEnv: 필수 변수 부재 시 즉시 실패 + 비밀값에 NEXT_PUBLIC_ 붙으면 거부

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: 제출 API (`POST /api/reports`) + 목록 API (`GET /api/reports`)

**Files:**
- Create: `src/lib/rateLimitDb.ts`
- Create: `src/app/api/reports/route.ts`
- Test: `src/lib/rateLimitDb.test.ts`

**Interfaces:**
- Consumes: `getClientIp`, `hashPassword`, `validateImages`, `sniffImageType`, `reportInputSchema`, `isRateLimited`, `RATE_RULES`, `getServiceClient`
- Produces:
  - `checkAndRecord(ip: string | null, action: 'submit'|'unlock'): Promise<boolean>` — `true` 면 차단
  - `POST /api/reports` → `201 { id }` / `400 { error }` / `429 { error }`
  - `GET /api/reports` → `200 { items: { id, seq, department, reporterName, title, status, createdAt }[] }`

- [ ] **Step 1: rateLimitDb 실패 테스트 작성**

`src/lib/rateLimitDb.test.ts`
```ts
import { describe, it, expect, vi } from 'vitest';
import { buildRecentQuery, decide } from './rateLimitDb';
import { RATE_RULES } from './rateLimit';

describe('rateLimitDb', () => {
  it('★ IP 를 모르면 차단한다 — 조용히 통과시키면 레이트리밋이 무력해진다', () => {
    expect(decide(null, [], Date.now(), RATE_RULES.submit)).toBe(true);
  });

  it('IP 를 알고 기록이 적으면 통과', () => {
    expect(decide('1.2.3.4', [], Date.now(), RATE_RULES.submit)).toBe(false);
  });

  it('윈도 안 기록이 한도에 차면 차단', () => {
    const now = Date.now();
    const recent = [now - 1, now - 2, now - 3];
    expect(decide('1.2.3.4', recent, now, RATE_RULES.submit)).toBe(true);
  });

  it('조회 쿼리는 ip·action·윈도 시작시각을 담는다', () => {
    const now = 1_000_000_000;
    const q = buildRecentQuery('1.2.3.4', 'submit', now, RATE_RULES.submit);
    expect(q.ip).toBe('1.2.3.4');
    expect(q.action).toBe('submit');
    expect(q.sinceIso).toBe(new Date(now - RATE_RULES.submit.windowMs).toISOString());
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test src/lib/rateLimitDb.test.ts`
Expected: FAIL — `Failed to resolve import "./rateLimitDb"`

- [ ] **Step 3: 최소 구현**

`src/lib/rateLimitDb.ts`
```ts
import { isRateLimited, type RateRule } from './rateLimit';
import { getServiceClient } from './supabase';

export type RateAction = 'submit' | 'unlock';

export function buildRecentQuery(ip: string, action: RateAction, now: number, rule: RateRule) {
  return { ip, action, sinceIso: new Date(now - rule.windowMs).toISOString() };
}

/** true = 차단. IP 를 모르면 차단한다 — 통과시키면 레이트리밋이 무력해진다. */
export function decide(ip: string | null, recentAtMs: number[], now: number, rule: RateRule): boolean {
  if (!ip) return true;
  return isRateLimited(recentAtMs, now, rule);
}

export async function checkAndRecord(ip: string | null, action: RateAction, rule: RateRule): Promise<boolean> {
  const now = Date.now();
  if (!ip) return true;

  const sb = getServiceClient();
  const q = buildRecentQuery(ip, action, now, rule);
  const { data } = await sb
    .from('rate_limit')
    .select('at')
    .eq('ip', q.ip)
    .eq('action', q.action)
    .gt('at', q.sinceIso);

  const recent = (data ?? []).map((r: { at: string }) => new Date(r.at).getTime());
  if (decide(ip, recent, now, rule)) return true;

  await sb.from('rate_limit').insert({ ip, action });
  return false;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test src/lib/rateLimitDb.test.ts`
Expected: PASS — `Tests 4 passed`

- [ ] **Step 5: 제출·목록 라우트 구현**

`src/app/api/reports/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getServiceClient } from '@/lib/supabase';
import { getClientIp } from '@/lib/ip';
import { hashPassword } from '@/lib/password';
import { reportInputSchema } from '@/lib/schema';
import { validateImages, sniffImageType } from '@/lib/imageValidate';
import { checkAndRecord } from '@/lib/rateLimitDb';
import { RATE_RULES } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  if (await checkAndRecord(ip, 'submit', RATE_RULES.submit)) {
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요. (10분에 3건까지)' }, { status: 429 });
  }

  const form = await req.formData();

  // 봇 차단용 honeypot — 사람에겐 보이지 않는 필드. 채워져 있으면 봇이다.
  if ((form.get('website') as string | null)?.trim()) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const parsed = reportInputSchema.safeParse({
    department: form.get('department'),
    reporterName: form.get('reporterName'),
    title: form.get('title'),
    body: form.get('body'),
    password: form.get('password'),
    appVersion: form.get('appVersion') || undefined,
    platform: form.get('platform') || undefined,
    deviceModel: form.get('deviceModel') || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값을 확인해 주세요.' }, { status: 400 });
  }

  const blobs = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  const loaded = await Promise.all(
    blobs.map(async (f) => ({ file: f, bytes: new Uint8Array(await f.arrayBuffer()), size: f.size })),
  );
  const check = validateImages(loaded);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const sb = getServiceClient();
  const id = randomUUID();
  const paths: string[] = [];

  for (const [i, item] of loaded.entries()) {
    const kind = sniffImageType(item.bytes)!;
    // 파일명은 새로 짓는다 — 원본 파일명은 신뢰하지 않는다(경로 조작·PII 유출).
    const path = `${id}/${i}-${randomUUID()}.${EXT[kind]}`;
    const { error } = await sb.storage.from('bug-images').upload(path, item.bytes, { contentType: kind });
    if (error) return NextResponse.json({ error: '이미지 업로드에 실패했습니다.' }, { status: 500 });
    paths.push(path);
  }

  const { error } = await sb.from('bug_reports').insert({
    id,
    department: parsed.data.department,
    reporter_name: parsed.data.reporterName,
    title: parsed.data.title,
    body: parsed.data.body,
    password_hash: await hashPassword(parsed.data.password),
    images: paths,
    app_version: parsed.data.appVersion ?? null,
    platform: parsed.data.platform ?? null,
    device_model: parsed.data.deviceModel ?? null,
    created_ip: ip,
  });
  if (error) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });

  return NextResponse.json({ id }, { status: 201 });
}

/** 목록 — 본문·이미지·비번은 절대 내려보내지 않는다. */
export async function GET() {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('bug_reports')
    .select('id, seq, department, reporter_name, title, status, created_at')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 });

  return NextResponse.json({
    items: (data ?? []).map((r) => ({
      id: r.id,
      seq: r.seq,
      department: r.department,
      reporterName: r.reporter_name,
      title: r.title,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
}
```

- [ ] **Step 6: 타입체크**

Run: `npm run typecheck`
Expected: 출력 없음 (통과)

- [ ] **Step 7: 커밋**

```bash
git add src/lib/rateLimitDb.ts src/lib/rateLimitDb.test.ts src/app/api/reports/route.ts
git commit -F - <<'EOF'
feat: 제출/목록 API

- POST: honeypot → zod → 이미지 매직바이트 → 업로드 → bcrypt 해시 insert
- GET: 본문·이미지·비번 미노출 (목록엔 부서·이름·제목·상태·날짜만)
- IP 를 모르면 레이트리밋은 '차단' 쪽으로 판단한다
- 업로드 파일명은 UUID 로 새로 짓는다 (원본 파일명 미신뢰)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: 열람 API (`POST /api/reports/[id]/unlock`)

**Files:**
- Create: `src/app/api/reports/[id]/unlock/route.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `checkAndRecord`, `RATE_RULES`, `getServiceClient`, `getClientIp`
- Produces:
  - `POST /api/reports/:id/unlock` body `{ password }` → `200 { body, images: string[], status, adminNote, appVersion, platform, deviceModel }`
  - 실패는 항상 `401 { error: '비밀번호가 일치하지 않습니다.' }`

- [ ] **Step 1: 구현**

`src/app/api/reports/[id]/unlock/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getClientIp } from '@/lib/ip';
import { verifyPassword } from '@/lib/password';
import { checkAndRecord } from '@/lib/rateLimitDb';
import { RATE_RULES } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const SIGNED_URL_TTL_SEC = 60;

/**
 * ★ 실패 응답은 항상 동일하다. 글이 없는 경우와 비번이 틀린 경우를 구분해 주면
 *   "그 글이 존재한다"는 사실이 새어나간다.
 */
const DENY = NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = getClientIp(req.headers);
  if (await checkAndRecord(ip, 'unlock', RATE_RULES.unlock)) {
    return NextResponse.json({ error: '시도가 너무 잦습니다. 1분 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password) return DENY;

  const sb = getServiceClient();
  const { data } = await sb
    .from('bug_reports')
    .select('password_hash, body, images, status, admin_note, app_version, platform, device_model')
    .eq('id', params.id)
    .maybeSingle();

  if (!data) return DENY;
  if (!(await verifyPassword(password, data.password_hash))) return DENY;

  const signed = await Promise.all(
    (data.images as string[]).map(async (p) => {
      const { data: s } = await sb.storage.from('bug-images').createSignedUrl(p, SIGNED_URL_TTL_SEC);
      return s?.signedUrl ?? null;
    }),
  );

  return NextResponse.json({
    body: data.body,
    images: signed.filter((u): u is string => !!u),
    status: data.status,
    adminNote: data.admin_note,
    appVersion: data.app_version,
    platform: data.platform,
    deviceModel: data.device_model,
  });
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/reports/\[id\]/unlock/route.ts
git commit -F - <<'EOF'
feat: 비번 열람 API

- 글 없음/비번 틀림을 같은 401 로 응답 — 글 존재 여부를 흘리지 않는다
- 이미지 signed URL 60초 (private 버킷)
- IP당 1분 5회 제한 (무차별 대입 차단)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: 관리자 세션 + 관리자 API

**Files:**
- Create: `src/lib/session.ts`
- Create: `src/app/api/admin/login/route.ts`
- Create: `src/app/api/admin/reports/route.ts`
- Create: `src/app/api/admin/reports/[id]/route.ts`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Consumes: `readEnv`, `getServiceClient`, `adminPatchSchema`
- Produces:
  - `signAdminToken(secret: string): Promise<string>`
  - `verifyAdminToken(token: string | undefined, secret: string): Promise<boolean>`
  - `ADMIN_COOKIE = 'oncocare_admin'`
  - `POST /api/admin/login` body `{ password }` → `204` + HttpOnly 쿠키
  - `GET /api/admin/reports` → 전체(본문·이미지 signed URL 포함)
  - `PATCH /api/admin/reports/:id` body `{ status?, adminNote? }` → `204`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/session.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { signAdminToken, verifyAdminToken, ADMIN_COOKIE } from './session';

const SECRET = 'a'.repeat(32);

describe('admin session', () => {
  it('쿠키 이름이 고정되어 있다', () => {
    expect(ADMIN_COOKIE).toBe('oncocare_admin');
  });

  it('서명한 토큰은 검증을 통과', async () => {
    const t = await signAdminToken(SECRET);
    expect(await verifyAdminToken(t, SECRET)).toBe(true);
  });

  it('다른 시크릿으로는 검증 실패 — 위조 차단', async () => {
    const t = await signAdminToken(SECRET);
    expect(await verifyAdminToken(t, 'b'.repeat(32))).toBe(false);
  });

  it('토큰이 없거나 깨졌으면 실패', async () => {
    expect(await verifyAdminToken(undefined, SECRET)).toBe(false);
    expect(await verifyAdminToken('garbage', SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test src/lib/session.test.ts`
Expected: FAIL — `Failed to resolve import "./session"`

- [ ] **Step 3: 최소 구현**

`src/lib/session.ts`
```ts
import { SignJWT, jwtVerify } from 'jose';

export const ADMIN_COOKIE = 'oncocare_admin';
const TTL = '12h';

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signAdminToken(secret: string): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key(secret));
}

export async function verifyAdminToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret));
    return payload.role === 'admin';
  } catch {
    return false;
  }
}
```

`src/app/api/admin/login/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server';
import { readEnv } from '@/lib/env';
import { ADMIN_COOKIE, signAdminToken } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const env = readEnv(process.env as Record<string, string | undefined>);
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  if (!password || password !== env.adminPassword) {
    return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 });
  }

  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(ADMIN_COOKIE, await signAdminToken(env.sessionSecret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return res;
}
```

`src/app/api/admin/reports/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server';
import { readEnv } from '@/lib/env';
import { getServiceClient } from '@/lib/supabase';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const env = readEnv(process.env as Record<string, string | undefined>);
  if (!(await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value, env.sessionSecret))) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }

  const sb = getServiceClient();
  const { data, error } = await sb
    .from('bug_reports')
    .select('id, seq, department, reporter_name, title, body, images, status, admin_note, app_version, platform, device_model, created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 });

  const items = await Promise.all(
    (data ?? []).map(async (r) => {
      const signed = await Promise.all(
        (r.images as string[]).map(async (p) => {
          const { data: s } = await sb.storage.from('bug-images').createSignedUrl(p, 60);
          return s?.signedUrl ?? null;
        }),
      );
      return {
        id: r.id, seq: r.seq, department: r.department, reporterName: r.reporter_name,
        title: r.title, body: r.body, images: signed.filter((u): u is string => !!u),
        status: r.status, adminNote: r.admin_note, appVersion: r.app_version,
        platform: r.platform, deviceModel: r.device_model, createdAt: r.created_at,
      };
    }),
  );
  return NextResponse.json({ items });
}
```

`src/app/api/admin/reports/[id]/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server';
import { readEnv } from '@/lib/env';
import { getServiceClient } from '@/lib/supabase';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/session';
import { adminPatchSchema } from '@/lib/schema';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = readEnv(process.env as Record<string, string | undefined>);
  if (!(await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value, env.sessionSecret))) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }

  const parsed = adminPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: '입력값을 확인해 주세요.' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.adminNote !== undefined) patch.admin_note = parsed.data.adminNote;

  const sb = getServiceClient();
  const { error } = await sb.from('bug_reports').update(patch).eq('id', params.id);
  if (error) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: 테스트 + 타입체크**

Run: `npm test && npm run typecheck`
Expected: PASS, 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/lib/session.ts src/lib/session.test.ts src/app/api/admin
git commit -F - <<'EOF'
feat: 관리자 세션 + 관리자 API

- ADMIN_PASSWORD 검증 → HttpOnly/Secure/SameSite=Lax 쿠키 (jose HS256, 12h)
- 관리자만 전체 본문·이미지 열람, 상태·답변 수정

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: 화면 — 레이아웃 · 목록 · 작성 · 열람 · 관리자

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/app/page.tsx`, `src/app/new/page.tsx`, `src/app/report/[id]/page.tsx`, `src/app/admin/page.tsx`
- Create: `src/app/robots.ts`
- Create: `src/components/StatusBadge.tsx`

**Interfaces:**
- Consumes: `GET /api/reports`, `POST /api/reports`, `POST /api/reports/:id/unlock`, `POST /api/admin/login`, `GET /api/admin/reports`, `PATCH /api/admin/reports/:id`
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: Tailwind 설정**

`tailwind.config.ts`
```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 온코케어 AI — 의료/신뢰/따뜻함
        brand: { 50: '#eef6ff', 500: '#2563eb', 600: '#1d4ed8', 700: '#1e40af' },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`postcss.config.mjs`
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`src/app/globals.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { @apply bg-slate-50 text-slate-900; }
```

- [ ] **Step 2: 레이아웃 + robots**

`src/app/layout.tsx`
```tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '온코케어 AI — 앱 버그 신고',
  description: '온코케어 AI 앱 사용 중 발견한 버그를 신고합니다.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
            <span className="text-lg font-bold text-brand-700">온코케어 AI</span>
            <span className="text-sm text-slate-400">근거로 돌보는 케어</span>
            <span className="ml-auto rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
              앱 버그 신고
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
```

`src/app/robots.ts`
```ts
import type { MetadataRoute } from 'next';

// 직원 전용 도구다. 검색엔진이 긁어가면 안 된다.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
```

`src/components/StatusBadge.tsx`
```tsx
const STYLE: Record<string, string> = {
  접수: 'bg-slate-100 text-slate-700',
  확인중: 'bg-amber-100 text-amber-800',
  수정완료: 'bg-emerald-100 text-emerald-800',
  재현불가: 'bg-rose-100 text-rose-700',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STYLE[status] ?? STYLE.접수}`}>
      {status}
    </span>
  );
}
```

- [ ] **Step 3: 목록 화면**

`src/app/page.tsx`
```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';

interface Row {
  id: string; seq: number; department: string; reporterName: string;
  title: string; status: string; createdAt: string;
}

export default function ListPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((d) => setRows(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          제목은 모두에게 보입니다. 본문과 이미지는 <b>작성자와 관리자만</b> 볼 수 있습니다.
        </p>
        <Link href="/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          + 버그 신고
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">번호</th>
              <th className="px-3 py-2 text-left">부서</th>
              <th className="px-3 py-2 text-left">이름</th>
              <th className="px-3 py-2 text-left">제목</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">등록일</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">불러오는 중…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">아직 신고된 버그가 없습니다.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-400">{r.seq}</td>
                <td className="px-3 py-2">{r.department}</td>
                <td className="px-3 py-2">{r.reporterName}</td>
                <td className="px-3 py-2">
                  <Link href={`/report/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-slate-500">{r.createdAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 작성 화면**

`src/app/new/page.tsx`
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/reports', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '등록에 실패했습니다.');
      alert('접수되었습니다.\n비밀번호는 복구할 수 없으니 꼭 기억해 주세요.');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border bg-white p-5">
      {/* honeypot — 사람에겐 보이지 않는다 */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-slate-500">부서명</span>
          <input name="department" required maxLength={50} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">이름</span>
          <input name="reporterName" required maxLength={30} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>
      </div>

      <label className="block">
        <span className="text-xs text-slate-500">제목</span>
        <input name="title" required maxLength={200} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        <span className="mt-1 block text-[11px] text-rose-600">
          제목은 모두에게 보입니다. 환자 이름·차트번호를 쓰지 마세요.
        </span>
      </label>

      <label className="block">
        <span className="text-xs text-slate-500">내용</span>
        <textarea name="body" required maxLength={5000} rows={6} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
      </label>

      <label className="block">
        <span className="text-xs text-slate-500">비밀번호 (4자 이상)</span>
        <input name="password" type="password" required minLength={4} maxLength={72} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        <span className="mt-1 block text-[11px] text-amber-700">
          이 게시글 전용 비밀번호입니다. 평소 쓰는 비밀번호를 넣지 마세요. 복구할 수 없습니다.
        </span>
      </label>

      <label className="block">
        <span className="text-xs text-slate-500">첨부 이미지 (필수, 1~3장 · jpg/png/webp · 5MB 이하)</span>
        <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple required className="mt-1 w-full text-sm" />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs text-slate-500">앱 버전 (선택)</span>
          <input name="appVersion" maxLength={20} placeholder="1.0.3" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">OS (선택)</span>
          <select name="platform" className="mt-1 w-full rounded border px-3 py-2 text-sm">
            <option value="">선택</option>
            <option value="iOS">iOS</option>
            <option value="Android">Android</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">기기 (선택)</span>
          <input name="deviceModel" maxLength={50} placeholder="iPhone 14" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? '등록 중…' : '등록'}
      </button>
    </form>
  );
}
```

- [ ] **Step 5: 열람 화면**

`src/app/report/[id]/page.tsx`
```tsx
'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';

interface Unlocked {
  body: string; images: string[]; status: string; adminNote: string | null;
  appVersion: string | null; platform: string | null; deviceModel: string | null;
}

export default function ReportPage({ params }: { params: { id: string } }) {
  const [pw, setPw] = useState('');
  const [data, setData] = useState<Unlocked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${params.id}/unlock`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? '열람에 실패했습니다.');
      setData(d as Unlocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : '열람에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <form onSubmit={unlock} className="mx-auto max-w-sm space-y-3 rounded-lg border bg-white p-5">
        <p className="text-sm text-slate-600">작성 시 입력한 비밀번호를 입력하세요.</p>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required
               className="w-full rounded border px-3 py-2 text-sm" />
        {error && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <button disabled={busy} className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? '확인 중…' : '열람'}
        </button>
      </form>
    );
  }

  return (
    <article className="space-y-4 rounded-lg border bg-white p-5">
      <div className="flex items-center gap-2">
        <StatusBadge status={data.status} />
        <span className="text-xs text-slate-400">
          {[data.platform, data.appVersion, data.deviceModel].filter(Boolean).join(' · ') || '기기 정보 없음'}
        </span>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.body}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {data.images.map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt="첨부 이미지" className="rounded border" />
        ))}
      </div>
      <p className="text-[11px] text-slate-400">이미지 링크는 60초 후 만료됩니다. 새로고침하면 다시 발급됩니다.</p>

      {data.adminNote && (
        <div className="rounded border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <b className="text-brand-700">관리자 답변</b>
          <p className="mt-1 whitespace-pre-wrap">{data.adminNote}</p>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 6: 관리자 화면**

`src/app/admin/page.tsx`
```tsx
'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';

const STATUSES = ['접수', '확인중', '수정완료', '재현불가'] as const;

interface AdminRow {
  id: string; seq: number; department: string; reporterName: string; title: string;
  body: string; images: string[]; status: string; adminNote: string | null;
  appVersion: string | null; platform: string | null; deviceModel: string | null; createdAt: string;
}

export default function AdminPage() {
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch('/api/admin/reports');
    if (!res.ok) { setRows(null); return; }
    setRows((await res.json()).items);
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (!res.ok) { setError('비밀번호가 일치하지 않습니다.'); return; }
    await load();
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/admin/reports/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    await load();
  };

  if (!rows) {
    return (
      <form onSubmit={login} className="mx-auto max-w-sm space-y-3 rounded-lg border bg-white p-5">
        <p className="text-sm text-slate-600">관리자 비밀번호</p>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required
               className="w-full rounded border px-3 py-2 text-sm" />
        {error && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <button className="w-full rounded-lg bg-slate-800 py-2 text-sm font-semibold text-white">로그인</button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <article key={r.id} className="space-y-3 rounded-lg border bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">#{r.seq}</span>
            <b>{r.title}</b>
            <span className="text-sm text-slate-500">{r.department} · {r.reporterName}</span>
            <StatusBadge status={r.status} />
            <span className="ml-auto text-xs text-slate-400">
              {[r.platform, r.appVersion, r.deviceModel].filter(Boolean).join(' · ')}
            </span>
          </div>

          <p className="whitespace-pre-wrap text-sm">{r.body}</p>

          <div className="grid grid-cols-3 gap-2">
            {r.images.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="첨부" className="rounded border" />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => patch(r.id, { status: s })}
                      className={`rounded border px-2 py-1 text-xs ${r.status === s ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}>
                {s}
              </button>
            ))}
          </div>

          <textarea defaultValue={r.adminNote ?? ''} rows={2} placeholder="작성자에게 보일 답변"
                    onBlur={(e) => patch(r.id, { adminNote: e.target.value || null })}
                    className="w-full rounded border px-3 py-2 text-sm" />
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: 빌드 확인**

Run: `npm run typecheck && npx next build`
Expected: `✓ Compiled successfully`

- [ ] **Step 8: 커밋**

```bash
git add tailwind.config.ts postcss.config.mjs src/app src/components
git commit -F - <<'EOF'
feat: 화면 (목록·작성·열람·관리자)

- 목록엔 제목까지만 노출. 제목에 환자 정보를 쓰지 말라는 경고를 폼에 명시
- 작성 시 "게시글 전용 비번, 복구 불가" 안내
- 열람 이미지는 60초 signed URL
- robots: 전체 색인 차단 (직원 전용 도구)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: 배포 문서 + 그룹웨어 사이드바 링크

**Files:**
- Create: `docs/DEPLOY.md`
- Modify: 그룹웨어 `apps/web/components/Sidebar.tsx` (영상판독AI 배너 블록 바로 아래, 현재 341행 뒤)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 배포 문서 작성**

`docs/DEPLOY.md`
```markdown
# 배포 절차

## 대표님이 하실 일

### 1. Supabase 새 프로젝트
1. https://supabase.com → New project → 이름 `oncocare-bugs`, 리전 `Northeast Asia (Seoul)`
2. SQL Editor 에 `supabase/migrations/0001_init.sql` 전체를 붙여넣고 실행
3. Settings → API 에서 두 값을 복사
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠ `service_role` 키는 DB 전권입니다. Vercel 환경변수 외 어디에도 붙여넣지 마세요.

### 2. Vercel
1. New Project → 이 레포 연결
2. Environment Variables 에 4개 등록 (모두 **Production/Preview/Development**)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD` (관리자 로그인용, 직접 정하세요)
   - `SESSION_SECRET` (32자 이상 무작위 문자열)
3. Deploy

### 3. 도메인
Vercel → Domains → `bugs.oncocare.co.kr` 추가 → 안내된 CNAME 을 DNS 에 등록

## 배포 후 반드시 확인할 3가지

1. **남의 글을 비번 없이 열 수 없다** — 목록에서 아무 글이나 눌러 아무 비번이나 넣어본다. `비밀번호가 일치하지 않습니다` 만 떠야 한다.
2. **이미지 URL 이 만료된다** — 열람 화면에서 이미지 주소를 복사해 시크릿 창에 붙인다. 60초 뒤 접근이 거부되어야 한다.
3. **anon 키로 테이블에 닿을 수 없다** — 아래를 실행하면 빈 결과나 오류가 나야 한다.
   ```bash
   curl "https://<PROJECT>.supabase.co/rest/v1/bug_reports?select=*" \
     -H "apikey: <ANON_KEY>"
   ```
   행이 하나라도 나오면 RLS 설정이 잘못된 것이다. 즉시 중단하고 확인할 것.
```

- [ ] **Step 2: 배포 문서 커밋**

```bash
git add docs/DEPLOY.md
git commit -F - <<'EOF'
docs: 배포 절차 + 배포 후 보안 확인 3종

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 3: 그룹웨어 사이드바에 링크 추가**

`apps/web/components/Sidebar.tsx` — 영상판독AI 배너 `</div>` (341행) 바로 아래에 삽입.
`Bug` 아이콘을 `lucide-react` import 에 추가한다.

```tsx
{/* 2026-07-10 대표님 — 온코케어 AI 앱 버그 신고 (Vercel 별도 시스템, 그룹웨어 DB 무관).
    영상판독AI 배너와 같은 패턴·다른 색(에메랄드→로즈). 전 직원 표시, 새 탭. */}
<div className="px-3 py-3 border-b border-slate-700">
  <a
    href="https://bugs.oncocare.co.kr"
    target="_blank"
    rel="noopener noreferrer"
    className="w-full flex items-center gap-2.5 rounded-lg bg-gradient-to-r from-rose-600 to-orange-600 px-3 py-2.5 text-left text-sm font-semibold text-white shadow transition-opacity hover:opacity-90"
    title="온코케어 AI 앱 버그 신고 — 새 탭에서 열림"
  >
    <Bug size={16} className="shrink-0" />
    <span className="flex-1">app버그 신고</span>
    <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">신규</span>
  </a>
</div>
```

- [ ] **Step 4: 그룹웨어 타입체크·빌드**

Run:
```bash
cd "C:/Users/유범석/개발소스코드/26_02/서울온케어 그룹웨어/hospital-ops-suite/apps/web" && npx tsc --noEmit && npx next build
```
Expected: 타입 오류 없음, `✓ Compiled successfully`

- [ ] **Step 5: 그룹웨어 커밋**

```bash
cd "C:/Users/유범석/개발소스코드/26_02/서울온케어 그룹웨어/hospital-ops-suite"
git add apps/web/components/Sidebar.tsx
git commit -F - <<'EOF'
feat(sidebar): 온코케어 앱 버그 신고 외부 링크

영상판독AI 배너와 같은 패턴. Vercel 별도 시스템(bugs.oncocare.co.kr)이며
그룹웨어 DB 와 무관하다 — 공개 쓰기 엔드포인트를 환자 데이터가 든 DB 에 붙이지 않는다.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
git push origin main
```

---

## 스스로 점검한 결과

- **스펙 커버리지**: D1(별도 Supabase) → Task 4·9 / D2(레포·도메인 분리) → Task 9 / D3(bcrypt 비번) → Task 1·6 / D4(목록 노출, 본문 잠금) → Task 5·8 / D5(앱버전·OS·기기) → Task 3·5·8 / D6(상태·답변) → Task 7·8. 보안 항목(매직바이트·레이트리밋·signed URL·오답 응답·robots) → Task 2·3·5·6·8. 배포 후 확인 3종 → Task 9.
- **미해결 의존**: `bugs.oncocare.co.kr` 도메인이 붙기 전에는 사이드바 링크가 죽는다. Task 9 Step 3 은 **Vercel 배포·도메인 연결 이후**에 커밋한다.
- **타입 일관성**: `getClientIp`/`hashPassword`/`verifyPassword`/`validateImages`/`sniffImageType`/`isRateLimited`/`RATE_RULES`/`checkAndRecord`/`decide`/`buildRecentQuery`/`readEnv`/`getServiceClient`/`signAdminToken`/`verifyAdminToken`/`ADMIN_COOKIE`/`reportInputSchema`/`adminPatchSchema` — 정의부와 호출부 이름·시그니처 일치 확인.
