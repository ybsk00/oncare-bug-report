# 배포 — 온코케어 앱 버그 리포트

Vercel(웹) + Convex(DB·이미지) 두 곳에 올린다. 대표님이 직접 하실 일만 적었다.

> **왜 두 곳인가**: Convex 는 DB 와 파일 저장소, Vercel 은 Next.js 웹 서버다.
> Vercel 빌드가 돌 때 Convex 함수(`convex/*.ts`)도 같이 배포되도록 아래처럼 빌드 명령을 잡는다.

---

## 0. 지금 상태 (2026-07-10 배포 완료)

| | 값 |
|---|---|
| Convex 팀/프로젝트 | `royrosa` / `oncocare-bug-report` |
| 개발 deployment | `dev:abundant-retriever-951` (테스트 글 6건 있음) |
| **운영 deployment** | `prod:fantastic-robin-429` → `https://fantastic-robin-429.convex.cloud` |
| 레포 | https://github.com/ybsk00/oncare-bug-report (그룹웨어와 **별도**) |
| 레포 공개범위 | **public** — 비밀값은 전부 환경변수라 코드가 공개돼도 뚫리지 않지만, 굳이 공개할 이유가 없으면 private 권장 |
| Vercel 프로젝트 | `bsyoo1974-2166s-projects/oncare-bug-report` |
| **운영 주소** | https://oncare-bug-report.vercel.app |

아래 1~3 단계는 **이미 끝났다.** 4단계(도메인)부터 하면 된다.
다시 처음부터 세울 일이 생겼을 때를 위해 절차를 남겨 둔다.

> ★ 운영 deployment 는 개발과 **완전히 다른 DB** 다. 개발 쪽 테스트 글은 넘어오지 않는다.

`dev` deployment 에는 테스트 글 6건이 들어 있다. **운영(prod) deployment 는 완전히 다른 DB 라 테스트 글이 넘어가지 않는다.**

---

## 1. Convex 운영 배포 키 발급

1. https://dashboard.convex.dev/t/royrosa/oncocare-bug-report 접속
2. 좌하단 deployment 선택기에서 **Production** 선택
3. **Settings → URL & Deploy Key → Generate Production Deploy Key**
4. 나온 키를 복사해 둔다 → 3단계에서 `CONVEX_DEPLOY_KEY` 로 쓴다

---

## 2. Convex 운영 환경변수

같은 화면에서 **Production** 을 선택한 채로 **Settings → Environment Variables**:

| 이름 | 값 |
|---|---|
| `SERVER_SECRET` | 아무 긴 무작위 문자열 (아래 명령으로 생성) |

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

> ★ **이 값은 3단계 Vercel 의 `SERVER_SECRET` 과 반드시 같아야 한다.** Convex 함수는 이 값이 맞지 않으면
> 전부 거절한다(`convex/guard.ts` `assertServer`). 개발용 값과 달라도 상관없다 — 오히려 다른 게 낫다.
>
> 이 값이 Convex 쪽에 없으면 모든 요청이 500 으로 죽는다. 조용히 통과하지 않는다.

---

## 3. Vercel 프로젝트

1. https://vercel.com → **Add New → Project** → `ybsk00/oncare-bug-report` import
   (그룹웨어 `ybsk00/hospital-ops-suit` 과 **다른 레포**다)
2. **Root Directory**: 그대로 둔다 (`./`). 레포 루트가 곧 프로젝트 루트다.
3. **Build Command** 는 레포의 `vercel.json` 에 이미 박혀 있다. 대시보드에서 건드리지 않는다.

```
npx convex deploy --cmd-url-env-var-name CONVEX_URL --cmd 'npm run build'
```

> 이러면 Vercel 이 빌드할 때 ① Convex 함수를 운영에 배포하고 ② `next build` 를 돌린다.
>
> ★ `--cmd-url-env-var-name CONVEX_URL` 은 **빌드 서브프로세스에만** 그 변수를 넣는다.
> 우리 API 라우트는 요청이 올 때 `process.env.CONVEX_URL` 을 읽으므로,
> **`CONVEX_URL` 을 아래 환경변수에 따로 등록하지 않으면 런타임에 값이 없어 첫 요청부터 500 이 난다.**
> (이 플래그를 쓰는 이유는 기본값인 `NEXT_PUBLIC_CONVEX_URL` 주입을 막기 위해서다 — 브라우저는 Convex 주소를 알 필요가 없다.)

4. **Environment Variables** (Production):

| 이름 | 값 | 비고 |
|---|---|---|
| `CONVEX_DEPLOY_KEY` | 1단계에서 복사한 키 | 빌드 때만 쓰인다 |
| `CONVEX_URL` | `https://<운영-deployment>.convex.cloud` | **런타임에 필요** |
| `SERVER_SECRET` | 2단계와 **동일한 값** | |
| `ADMIN_PASSWORD` | 관리자 화면 비번 (직접 정함) | |
| `SESSION_SECRET` | 아래 명령으로 생성한 64자 hex | 쿠키 서명용 |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ★ **어느 것에도 `NEXT_PUBLIC_` 을 붙이지 않는다.** 붙이면 브라우저 번들에 그대로 박힌다.
> 코드가 이를 막고 있다 — `src/lib/env.ts` 는 `NEXT_PUBLIC_...SECRET`·`NEXT_PUBLIC_...PASSWORD` 가 하나라도 있으면
> **API 라우트가 첫 요청에서 예외를 던진다**(빌드는 통과하니 6단계 확인을 꼭 한다).
> 브라우저는 Convex 를 직접 부르지 않으므로 `CONVEX_URL` 조차 알 필요가 없다.

5. **Deploy**

---

## 4. 도메인 연결

1. Vercel 프로젝트 → **Settings → Domains → Add** → `bugs.oncocare.co.kr`
2. `oncocare.co.kr` DNS 관리 화면에서 레코드 추가:

| 종류 | 이름 | 값 |
|---|---|---|
| CNAME | `bugs` | `cname.vercel-dns.com` |

3. 몇 분 뒤 Vercel 이 자동으로 HTTPS 인증서를 발급한다.

> 도메인을 안 붙이고 Vercel 기본 주소(`oncocare-bug-report.vercel.app`)를 그냥 써도 된다.
> 그 경우 5단계의 링크 주소를 그 주소로 바꾸면 된다.

---

## 5. 그룹웨어 사이드바에 링크 달기

**4단계가 끝난 뒤에** 그룹웨어 레포에서 `[🐞 app버그 신고]` 외부 링크를 커밋한다.
주소가 살아 있기 전에 올리면 죽은 링크가 배포된다.

---

## 6. 배포 후 확인 (3분)

`https://bugs.oncocare.co.kr` 기준.

1. `/new` 에서 글 하나 올려 본다 → 부서·이름·제목·내용·비번·이미지 1장. 접수되면 목록에 제목만 뜬다.
2. 목록에서 그 글을 눌러 **틀린 비번** → `비밀번호가 일치하지 않습니다.`
3. **맞는 비번** → 본문·이미지가 뜨고, 이미지 아래 **다운로드** 링크가 동작한다.
4. `/admin` → `ADMIN_PASSWORD` 로 로그인 → 비번 없이 전체 글·이미지가 보이고, 상태 버튼과 답변 저장이 된다.
5. 3번에서 열었던 브라우저를 **시크릿 창**으로 다시 열어 같은 글 주소로 들어가면 다시 비번을 묻는다.

넷 다 되면 끝이다. 안 되면 Vercel → 해당 배포 → **Runtime Logs** 를 본다.

---

## 알아 둘 것

- **비번은 복구할 수 없다.** bcrypt 해시만 저장한다. 작성자가 잊으면 관리자 화면에서 대신 본다.
- **레이트리밋**: 제출 IP당 10분 3건, 비번 시도 IP당 1분 5회. Convex 테이블에 기록되며 창이 지나면 스스로 지워진다.
- **이미지 URL 은 브라우저에 절대 나가지 않는다.** `/api/image/...` 프록시가 쿠키를 확인하고 서버가 대신 받아 흘려준다.
  열람 쿠키에는 그 글의 id 가 박혀 있어 **다른 글에 재사용되지 않는다**. 유효기간 10분.
- **관리자 비번을 바꾸려면** Vercel 의 `ADMIN_PASSWORD` 를 고치고 재배포한다.
- **글 삭제 기능은 없다.** 필요하면 Convex 대시보드의 Data 탭에서 직접 지운다.
- 목록에는 **제목·부서·이름·상태**만 보인다. 본문·이미지는 잠겨 있다.
  그래서 `/new` 화면이 "제목에 환자 이름·차트번호를 쓰지 마세요" 라고 경고한다.
