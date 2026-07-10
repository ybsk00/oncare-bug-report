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

### D1. 그룹웨어 DB를 쓰지 않는다 — 새 Supabase 프로젝트

요구사항 1이 곧 **인증 없는 공개 쓰기 엔드포인트**를 뜻한다. 그룹웨어 Supabase에는
환자 4,600여 명의 이름·차트번호·진단명·연락처가 있다. 여기에 공개 엔드포인트를 붙이면
RLS 설정 실수나 인젝션 하나로 환자 정보 전체가 노출된다. 앱스토어에 오른 앱과 연결된
링크라 URL이 외부로 새는 것도 시간문제다.

→ **새 Supabase 프로젝트 `oncocare-bugs`** 를 파고 물리적으로 격리한다. 무료 티어로 충분하다.

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
Vercel (Next.js 14 App Router)
  │   서버 라우트에서만 DB 접근. service_role 키는 브라우저로 절대 내려가지 않는다.
  │
  └── Supabase 프로젝트 `oncocare-bugs`      ★ 그룹웨어 DB 와 완전 무관
        ├─ public.bug_reports      RLS ON, 정책 없음 (= anon/authenticated 전면 차단)
        └─ storage: bug-images     private 버킷, 60초 signed URL

그룹웨어 Sidebar → [🐞 앱 버그 신고] 외부 링크 (영상판독AI 배너와 같은 자리, 다른 색)
```

**RLS를 "정책 없음"으로 두는 이유**: 클라이언트가 `anon` 키로 테이블에 닿을 수 있으면
비번 검증이 무의미해진다. 모든 읽기·쓰기는 서버 라우트를 거친다.

## 데이터 모델

```sql
create table public.bug_reports (
  id            uuid primary key default gen_random_uuid(),
  seq           bigserial unique,              -- 목록 번호
  department    text not null,
  reporter_name text not null,
  title         text not null,
  body          text not null,
  password_hash text not null,                 -- bcrypt. 평문 저장 금지
  images        text[] not null,               -- storage 경로. 최소 1장
  app_version   text,
  platform      text check (platform in ('iOS','Android')),
  device_model  text,
  status        text not null default '접수'
                check (status in ('접수','확인중','수정완료','재현불가')),
  admin_note    text,
  created_ip    inet,                          -- 레이트리밋·남용 추적
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.bug_reports enable row level security;
-- 정책을 만들지 않는다 → anon/authenticated 전면 차단, service_role 만 통과

create table public.rate_limit (                -- IP 기반 제출/열람 제한
  ip     inet not null,
  action text not null,                        -- 'submit' | 'unlock'
  at     timestamptz not null default now()
);
create index on public.rate_limit (ip, action, at desc);
```

## 화면

| 경로 | 내용 |
|---|---|
| `/` | 목록 — 번호·부서·이름·제목·상태·날짜. `[+ 버그 신고]` 버튼. |
| `/new` | 작성 — 부서·이름·제목·내용·**비번**·이미지(1~3장 필수) + 앱버전·OS·기기(선택) |
| `/report/[id]` | 열람 — 비번 입력 → 서버에서 bcrypt 비교 → 본문·이미지·관리자 답변 |
| `/admin` | 관리자 비번 1개로 전체 열람, 상태 변경, 답변 작성 |

## 서버 라우트

| 라우트 | 하는 일 |
|---|---|
| `POST /api/reports` | 검증 → 이미지 업로드 → bcrypt 해시 → insert. 레이트리밋 적용 |
| `GET  /api/reports` | 목록(본문·이미지 제외). 누구나 |
| `POST /api/reports/[id]/unlock` | 비번 검증 → 본문 + 60초 signed URL 반환. 레이트리밋 적용 |
| `POST /api/admin/login` | 관리자 비번 검증 → HttpOnly 세션 쿠키 |
| `PATCH /api/admin/reports/[id]` | 상태·답변 수정 (쿠키 필요) |

## 보안·남용 방지

공개 링크이므로 실질적으로 가장 중요한 부분이다.

- **비번**: bcrypt(cost 10). 열람 시도 **IP당 분당 5회** 제한 → 무차별 대입 차단.
- **이미지**: jpg/png/webp, **5MB 이하, 3장까지**. 서버에서 **매직바이트로 실제 타입 검증**
  (확장자만 믿지 않는다). 파일명은 UUID로 새로 짓는다.
- **스토리지**: private 버킷 + 만료 **60초** signed URL. 공개 버킷이면 URL 아는 사람 누구나 본다.
- **제출**: IP당 **10분에 3건**. honeypot 필드로 단순 봇 차단.
- **관리자**: `ADMIN_PASSWORD` 환경변수 + HttpOnly·Secure·SameSite=Lax 세션 쿠키.
- **오답 응답**: 비번이 틀리면 `"비밀번호가 일치하지 않습니다"` 만 반환한다. 글의 존재 여부나
  작성자를 추가로 흘리지 않는다.
- `robots.txt` 로 전체 색인 차단.

## 환경변수

| 이름 | 용도 | 노출 |
|---|---|---|
| `SUPABASE_URL` | 프로젝트 URL | 서버 전용 |
| `SUPABASE_SERVICE_ROLE_KEY` | DB 전권 | **서버 전용. 절대 `NEXT_PUBLIC_` 금지** |
| `ADMIN_PASSWORD` | 관리자 로그인 | 서버 전용 |
| `SESSION_SECRET` | 쿠키 서명 | 서버 전용 |

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
