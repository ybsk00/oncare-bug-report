# 온코케어 앱 버그 리포트 — 설계 (2026-07-10)

## 왜 만드는가

`온코케어 AI` 앱이 앱스토어·플레이스토어에 올라갔고 내부 직원 테스트가 진행 중이다.
직원이 버그를 자유롭게 올릴 창구가 필요하다. 버그헌팅 이벤트도 예정되어 있어 제보량이
적지 않을 것으로 본다.

**요구사항 (대표님, 7/10)**

1. 링크를 아는 사람은 **누구나 접속·업로드**할 수 있다 (로그인 없음).
2. 올린 게시물은 **작성자 본인과 시스템 관리자만** 본문을 볼 수 있다.
3. 업로드 항목: **부서명 · 이름 · 제목 · 비번 · 첨부 이미지**(필수).
4. 그룹웨어와 **별도 시스템**. Vercel에 배포하고 그룹웨어 사이드바에 외부 링크를 단다.

## 결정 사항

### D1. 그룹웨어 DB를 쓰지 않는다 — Convex 별도 프로젝트

요구사항 1이 곧 **인증 없는 공개 쓰기 엔드포인트**를 뜻한다. 그룹웨어 Supabase에는
환자 4,600여 명의 이름·차트번호·진단명·연락처가 있다. 여기에 공개 엔드포인트를 붙이면
RLS 설정 실수나 인젝션 하나로 환자 정보 전체가 노출된다. 앱스토어에 오른 앱과 연결된
링크라 URL이 외부로 새는 것도 시간문제다.

→ **Convex 프로젝트 `oncocare-bug-report`**(team `royrosa`)를 새로 파고 물리적으로 격리한다.

**왜 Supabase가 아니라 Convex인가** (대표님 지시 — 임시 DB에 Supabase를 쓰지 않는다)

- DB·파일 저장·서버 함수가 한 서비스에 있다. SQL 마이그레이션도, RLS 정책 언어도 없다.
- **RLS/보안 규칙이라는 사고 표면 자체가 없다.** 임시 도구에서 가장 흔한 사고가 그 설정 누락이다.
- 접을 때 프로젝트 하나만 지우면 끝난다.

### D1-a. Convex 함수는 전부 `public`이되 서버 시크릿으로 잠근다

`fetchQuery`/`fetchMutation`(`convex/nextjs`)은 **public 함수만** 부를 수 있다.
그런데 배포 URL을 아는 사람은 누구나 public 함수를 부를 수 있다.

→ 모든 함수의 첫 인자로 `secret: string`을 받고, Convex 환경변수 `SERVER_SECRET`과
다르면 **즉시 throw** 한다. 이 시크릿은 Next.js 서버 환경변수에만 있고 브라우저로 내려가지 않는다.

### D1-b. 이미지는 프록시로 서빙한다 (signed URL 아님)

Convex의 `ctx.storage.getUrl()`이 돌려주는 URL은 **공개이며 만료가 없다.**
그 URL을 브라우저에 그대로 주면, 한 번 새어나간 링크가 영원히 산다.

→ `GET /api/image/[reportId]/[index]` 를 Next.js에 두고, **서버가** Convex URL로 바이트를
받아 스트리밍한다. 요청마다 열람 권한(비번 세션 쿠키 또는 관리자 쿠키)을 확인한다.
**이미지 URL은 브라우저에 한 번도 노출되지 않는다.** signed URL보다 강하다.

`?download=1` 이면 `Content-Disposition: attachment` 로 내려 **웹에서 바로 다운로드**된다
(대표님 요청).

### D2. 레포·도메인 분리

`oncocare.co.kr` 은 공개 마케팅 사이트다. 여기에 넣지 않는다.

- 이 도구는 `service_role` 키(DB 전권)를 서버에서 쓴다 → 마케팅 사이트 프로젝트에 그 키를 두면 사고 반경이 커진다.
- 배포 주기가 다르다.
- 검색엔진이 색인한다.

→ **별도 레포 + 별도 Vercel 프로젝트 + 서브도메인 `bugs.oncocare.co.kr`** (DNS CNAME 1줄).
`robots.txt` 로 색인 차단.

### D3. 인증은 게시글 비번 (bcrypt)

로그인이 없으므로 **글마다 비번**을 받아 작성자를 식별한다. 익명 게시판의 고전 방식이고,
대표님 요구사항의 "비번" 필드가 바로 이것이다.

- 비번은 **bcrypt 해시로만** 저장한다. 평문 저장 시 직원이 다른 곳에서 쓰는 비번을 재사용하면
  이 DB가 뚫릴 때 그쪽까지 털린다.
- 화면에 **"이 게시글 전용 비번입니다. 평소 쓰는 비번을 넣지 마세요"** 를 명시한다.
- 비번은 복구할 수 없다(해시). 작성 직후 그 사실을 한 번 확인시킨다. 잊어도 관리자가 볼 수 있으므로 실무는 막히지 않는다.

### D4. 목록은 보이되 본문은 잠근다

세 안 중 선택 (대표님 승인).

| 안 | 내용 | 판단 |
|---|---|---|
| ㉮ 목록 없음 | 폼 + '내 신고 조회' 탭만 | 가장 안전하나 중복 제보가 쌓인다 |
| **㉯ 목록 노출, 본문 잠금** | 번호·부서·이름·제목·상태·날짜 노출. 클릭 시 비번 | **채택** — 중복 제보를 줄인다 |
| ㉰ 목록 마스킹 | 제목까지 가림 | 중복 방지 효과가 사라져 실익 없음 |

㉯의 대가: **제목이 그대로 공개된다.** 그래서 제목 입력란에
**"환자 이름·차트번호를 쓰지 마세요"** 경고를 붙인다.

### D5. 앱 버전·OS·기기 (선택 입력)

앱스토어 배포본이라 재현 정보가 없으면 "저는 되는데요"가 반복된다.
`app_version` · `platform`(iOS/Android) · `device_model` 을 **선택 입력**으로 받는다.
필수로 하면 제보 자체가 줄어든다.

### D6. 상태와 관리자 답변

`접수 → 확인중 → 수정완료 / 재현불가`. 관리자가 상태와 답변을 남기면 **작성자가 자기 글에서**
볼 수 있다. "내 제보 어떻게 됐나요" 문의를 없앤다.

---

## 아키텍처

```
브라우저
   │  (Convex 를 직접 부르지 않는다. 배포 URL 도 모른다.)
   ▼
Vercel (Next.js 14 App Router)   ── 모든 로직·검증·권한 확인
   │  fetchQuery/fetchMutation + secret
   ▼
Convex 프로젝트 oncocare-bug-report      ★ 그룹웨어 DB 와 완전 무관
   ├─ bugReports 테이블
   ├─ rateLimit 테이블
   └─ 파일 저장소 (이미지)

그룹웨어 Sidebar → [🐞 app버그 신고] 외부 링크 (영상판독AI 배너와 같은 자리, 다른 색)
```

`NEXT_PUBLIC_CONVEX_URL` 을 쓰지 않는다. **`CONVEX_URL` 로만** 둔다 — 브라우저가 Convex를
직접 부를 이유가 없다.

## 데이터 모델 (`convex/schema.ts`)

```ts
bugReports: defineTable({
  seq: v.number(),                 // 목록 번호 (단조 증가)
  department: v.string(),
  reporterName: v.string(),
  title: v.string(),
  body: v.string(),
  passwordHash: v.string(),        // bcrypt. 평문 저장 금지
  imageIds: v.array(v.id('_storage')),  // 최소 1장
  appVersion: v.optional(v.string()),
  platform: v.optional(v.union(v.literal('iOS'), v.literal('Android'))),
  deviceModel: v.optional(v.string()),
  status: v.union(v.literal('접수'), v.literal('확인중'),
                  v.literal('수정완료'), v.literal('재현불가')),
  adminNote: v.optional(v.string()),
  createdIp: v.optional(v.string()),
}).index('by_seq', ['seq'])

rateLimit: defineTable({
  ip: v.string(),
  action: v.union(v.literal('submit'), v.literal('unlock')),
  at: v.number(),                  // epoch ms
}).index('by_ip_action', ['ip', 'action'])
```

## 열람 권한을 어떻게 유지하는가

비번을 한 번 맞히면, 서버가 **그 게시글 전용 단기 쿠키**(`unlock_<id>`, 10분, HttpOnly, JWT
서명)를 심는다. 이미지 프록시는 요청마다 이 쿠키(또는 관리자 쿠키)를 확인한다.

쿠키가 없으면 이미지도 못 받는다. 그래서 **이미지 URL 하나만 유출돼도 아무 소용이 없다.**

## 화면

| 경로 | 내용 |
|---|---|
| `/` | 목록 — 번호·부서·이름·제목·상태·날짜. `[+ 버그 신고]` 버튼. |
| `/new` | 작성 — 부서·이름·제목·내용·**비번**·이미지(1~3장 필수) + 앱버전·OS·기기(선택) |
| `/report/[id]` | 열람 — 비번 입력 → bcrypt 비교 → 본문·이미지·관리자 답변 + **이미지 다운로드** |
| `/admin` | 관리자 비번 1개로 전체 열람, 상태 변경, 답변 작성, **이미지 다운로드** |

## 서버 라우트

| 라우트 | 하는 일 |
|---|---|
| `POST /api/reports` | 검증 → 이미지 업로드 → bcrypt 해시 → insert. 레이트리밋 적용 |
| `GET  /api/reports` | 목록(본문·이미지 제외). 누구나 |
| `POST /api/reports/[id]/unlock` | 비번 검증 → 본문 반환 + **열람 쿠키 발급**. 레이트리밋 적용 |
| `GET /api/image/[id]/[index]` | 열람/관리자 쿠키 확인 → Convex에서 바이트 받아 스트리밍. `?download=1` 이면 첨부 다운로드 |
| `POST /api/admin/login` | 관리자 비번 검증 → HttpOnly 세션 쿠키 |
| `GET /api/admin/reports` | 전체 열람 (쿠키 필요) |
| `PATCH /api/admin/reports/[id]` | 상태·답변 수정 (쿠키 필요) |

## Convex 함수 (`convex/reports.ts`, `convex/files.ts`)

전부 `public` 이되 **첫 인자로 `secret` 을 받아 `SERVER_SECRET` 과 다르면 즉시 throw** 한다.
배포 URL을 아는 사람이 함수를 직접 호출하는 것을 막는다.

| 함수 | 종류 | 역할 |
|---|---|---|
| `files.generateUploadUrl` | mutation | 서버가 바이트를 POST 할 1회용 업로드 URL |
| `files.getUrl` | query | storageId → Convex 파일 URL (서버만 본다) |
| `reports.create` | mutation | seq 채번 + insert |
| `reports.list` | query | 목록 (본문·해시 제외) |
| `reports.getForUnlock` | query | 비번 해시 + 본문 + imageIds |
| `reports.listForAdmin` | query | 전체 |
| `reports.patch` | mutation | 상태·답변 |
| `reports.rateCheck` | mutation | 윈도 내 기록 조회 + 기록 (원자적) |

## 보안·남용 방지

공개 링크이므로 실질적으로 가장 중요한 부분이다.

- **비번**: bcrypt(cost 10). 열람 시도 **IP당 분당 5회** 제한 → 무차별 대입 차단.
- **이미지**: jpg/png/webp, **5MB 이하, 3장까지**. 서버에서 **매직바이트로 실제 타입 검증**
  (확장자만 믿지 않는다). 원본 파일명은 버린다 — 파일명에 환자 이름이 있을 수 있다.
- **이미지 서빙**: Convex `getUrl()` 은 공개·무기한이므로 **브라우저에 절대 주지 않는다.**
  Next.js가 프록시하며 요청마다 쿠키를 확인한다.
- **제출**: IP당 **10분에 3건**. honeypot 필드로 단순 봇 차단.
- **Convex 함수**: 모두 `secret` 인자 검사. 배포 URL 을 알아도 직접 호출할 수 없다.
- **관리자**: `ADMIN_PASSWORD` 환경변수 + HttpOnly·Secure·SameSite=Lax 세션 쿠키.
- **오답 응답**: 비번이 틀리면 `"비밀번호가 일치하지 않습니다"` 만 반환한다. 글의 존재 여부나
  작성자를 추가로 흘리지 않는다.
- `robots.txt` 로 전체 색인 차단.

## 환경변수 (전부 서버 전용 — `NEXT_PUBLIC_` 금지)

| 이름 | 용도 |
|---|---|
| `CONVEX_URL` | Convex 배포 URL |
| `SERVER_SECRET` | Next.js ↔ Convex 함수 호출 시크릿 (Convex 환경변수에도 같은 값) |
| `ADMIN_PASSWORD` | 관리자 로그인 |
| `SESSION_SECRET` | 쿠키 서명 (32자 이상) |

## 테스트

**단위** (순수 함수로 분리해 테스트한다)

- 비번 해시/검증
- 레이트리밋 판정 (윈도·카운트 경계)
- 이미지 검증: 매직바이트 판별, 크기·장수 한도, 확장자 위조 거부
- 입력 스키마(zod): 필수 누락, 길이 초과, 잘못된 platform 값

**배포 후 손으로 확인 (필수 3종)**

1. 남의 글을 비번 없이 열 수 없다.
2. 이미지 signed URL 을 복사해 시크릿 창에서 열면 60초 뒤 만료된다.
3. `anon` 키로 `bug_reports` 를 직접 조회하면 차단된다.

## 역할 분담

- **Claude**: 코드, SQL 마이그레이션, 환경변수 목록, `robots.txt`, 그룹웨어 사이드바 링크.
- **대표님**: (1) Supabase 프로젝트 생성 후 URL·service_role 키 전달, (2) Vercel에 레포 연결,
  (3) DNS CNAME `bugs.oncocare.co.kr`.

## 비용

Vercel Hobby + Supabase Free. 리포트 수백 건·이미지 수백 MB 수준이면 무료 한도 안이다.

## 범위 밖 (하지 않는 것)

- 로그인·계정 시스템 (요구사항에 없음)
- 이메일·카톡 알림
- 댓글
- 그룹웨어 계정과의 연동 — **의도적으로 하지 않는다.** 연동하면 D1의 격리가 깨진다.
