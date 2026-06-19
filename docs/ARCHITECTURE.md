# 🏗️ 아키텍처 (ARCHITECTURE)

> 이 문서는 **아키텍처 창**이 관리합니다. 최초 작성: 2026-06-18

---

## 1. 기술 스택

| 영역 | 기술 | 비고 |
|---|---|---|
| 프레임워크 | **Next.js (App Router) + TypeScript** | 풀스택 (React 화면 + `app/api` 서버 라우트) |
| 차트 | **Recharts** | |
| 배포 | **Vercel** | `main` 푸시 시 자동 프로덕션 배포 |
| 데이터 소스 | **네이버 데이터랩 API** | 검색어트렌드 + 쇼핑인사이트 |
| 스타일 | 순수 CSS (`app/globals.css`) | 디자인 창에서 토큰화/컴포넌트화 검토 |
| 데이터 저장 | (현재 없음) | E2부터 경량 DB 도입 검토 (Vercel Postgres/KV 등) |

---

## 2. 저장소 구조

```
seller/
├─ app/
│  ├─ page.tsx          # 메인 화면 (과일 선택 + 트렌드 차트 + 추천 카드)
│  ├─ globals.css       # 전역 스타일
│  └─ api/
│     └─ trend/route.ts # GET /api/trend?fruit=...&debug=1
├─ lib/
│  ├─ fruits.ts         # 과일 16종 정의 + 샘플 시즌데이터 + recommendForMonth()
│  └─ naver.ts          # 네이버 데이터랩 검색어트렌드 API 클라이언트
└─ docs/                # ← 기획/설계 문서 (단일 진실 공급원)
```

---

## 3. 외부 연동

### 네이버 데이터랩 (연동 완료)
- **앱:** `chan-seller` (developers.naver.com), 사용 API: **데이터랩(검색어트렌드)** + **데이터랩(쇼핑인사이트)**
- **인증:** 헤더 `X-Naver-Client-Id`, `X-Naver-Client-Secret`
  - 환경변수: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (Vercel: Production+Preview)
  - ⚠️ 두 값을 **자리 바꿔 넣으면** 401 `errorCode 024` 발생 → 진단은 `?debug=1`로 `keyInfo`(길이/공백) 확인
- **현재 사용 엔드포인트:** `POST /v1/datalab/search` (검색어트렌드, 카테고리 불필요)
  - `lib/naver.ts:fetchSearchTrend(keyword)` — 최근 12개월 월별 상대지수(0~100) 반환, 6시간 캐시
- **E1 확장 후보:**
  - `POST /v1/datalab/shopping/categories` 등 쇼핑인사이트 (분야별/기기별/성별/연령별 트렌드)
  - ⚠️ **인기검색어 TOP500은 데이터랩 웹 UI 기능 — 공식 Open API 미제공 확정**(§7-C). 대안: 검색광고 키워드도구(§7-B) 월간검색수 기반 자체 순위 권고.
  - 🆕 **검색광고 '키워드도구'(`keywordstool`)** — 데이터랩과 별개 시스템(`api.naver.com`, HMAC). 연관키워드+월간검색수+경쟁정도. E1-2 롱테일/모음집 연료. 설계·키 발급 가이드: §7-B

### 쿠팡 판매자(Wing) API (미연동, E2~E4 핵심 엔진)
- **베이스:** `https://api-gateway.coupang.com` · 경로 `/v2/providers/seller_api/...`
- **인증:** Wing > 오픈API 키(**Access Key / Secret Key**) + **vendorId**, 요청마다 **HMAC(CEA) 서명**
  - 예정 env: `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`, `COUPANG_VENDOR_ID`
- **API 그룹 → Epic 매핑:**
  | API 그룹 | 용도 | Epic |
  |---|---|---|
  | 주문/발주서(OrderSheet), 배송(송장) | 주문 자동수집 → 발주서 → 송장 업로드 | E2 |
  | 상품(Product) 생성·수정, 카테고리 | 상품 자동 등록 | E3 |
  | 고객문의(CS)·반품·교환 | 문의 조회/응대 | E4 |
- **⚠️ 한계:** 판매자 API는 **내(vendor) 데이터만** 반환.
  - `seller-products/inflow-status` → 내 등록상품수/한도(registeredCount/permittedCount)
  - `seller-products` 목록/구간 조회 → 내 상품 목록
  - → **키워드 시장 경쟁상품수(전체) 측정 불가.** 그건 E1에서 크롤링/파트너스로 별도 해결.

### 쿠팡 (판매 채널, 미연동 - 그 외)
- 초기엔 **딥링크(쿠팡 검색 바로가기)** 병행
- 경쟁상품수: **조사 완료(§7-A) — 크롤링 불가(Akamai/서버리스)·파트너스 API 부적합 → 직접 확보 경로 없음. 1a 신호 폴백 유지, 1b 보류.**

---

## 4. 배포 & 환경변수

- **프로덕션 브랜치:** `main` (GitHub 기본 브랜치 = `main`)
- **흐름:** `main`에 머지 → Vercel 자동 프로덕션 배포 → https://chan-seller.vercel.app
- **Preview:** PR마다 Vercel Preview URL 자동 생성 (머지 전 확인용)
- **환경변수 변경 시:** 반드시 **재배포해야 반영**됨 (빈 커밋 푸시 또는 Vercel Redeploy)
- **필수 env:** `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (로컬은 `.env.local`)

---

## 5. 코딩 컨벤션

- 주변 코드 스타일/주석 밀도에 맞춤. 한글 주석 OK.
- API 라우트는 실패 시 **샘플로 폴백**하고, `?debug=1`로 원인 노출(키 값은 미노출).
- 외부 API 호출은 캐시(`next.revalidate`)로 한도 보호.
- 비밀값은 코드/문서/커밋에 절대 넣지 않음.

---

## 6. 기술 리스크 / 조사 필요 (Backlog)

- [x] **경쟁상품수 출처** — 조사 완료(2026-06-19). **크롤링 불가(서버리스)·파트너스 API 부적합 → 1a 신호 폴백 확정.** 상세: §7-A
- [x] 네이버 쇼핑인사이트 "인기검색어 TOP500" API 제공 여부/한도 — **공식 Open API 미제공(웹 UI 전용) → 대안 권고.** 상세: §7-C
- [x] **네이버 검색광고 키워드도구(keywordstool) API 연동** — 연동 가능, 서명 유틸+클라이언트 설계+키 발급 가이드 완료(키는 운영자). 상세: §7-B
- [ ] **쿠팡 판매자(Wing) API 인증(HMAC) 구현** — 키 발급 후 서명 유틸 작성 *(E2~, [B]와 서명 패턴 유사)*
- [ ] E2 진입 시 DB 선택 (Vercel Postgres vs KV vs 외부)
- [ ] 네이버 API 일일 호출 한도(쿼터) 대비 캐싱 전략

---

## 7. E1 외부 연동 조사 결과 (A/B/C, 2026-06-19)

> PM '🔬 아키텍처 창 조사 의뢰서'(E1 잠금 해제용)에 대한 회신. 우선순위 A→B→C. 각 항목 독립.
> 결론만: **A = 직접 확보 불가(1a 폴백 유지, 1b 보류)** · **B = 연동 가능(설계 완료, 키는 운영자)** · **C = 공식 API 미제공(B로 자체 순위 권고)**.

### [A] 쿠팡 경쟁상품수 확보 — 우선순위 1 · 판정: ❌ 직접 확보 불가 → **1a 신호 폴백 확정, 1b 무기한 보류**

**1) 크롤링 가/부: 불가 (Vercel 서버리스 기준).**
- 쿠팡은 **Akamai Bot Manager**(5계층 탐지: TLS/JA3 핑거프린트·헤더 순서·JS 챌린지·행위·IP 평판)를 사용. Cloudflare보다 우회 난도 높음으로 알려짐.
- 실측: 이 조사 환경(데이터센터 IP)에서 `https://www.coupang.com/robots.txt`조차 **HTTP 403** 반환. 검색결과 페이지는 더 강하게 차단.
- **Vercel 서버리스 = AWS 데이터센터 IP + 단명 함수(브라우저 세션 유지 불가) + 짧은 타임아웃** → Akamai JS 챌린지(메인 진입 후 ~20초 유지)를 풀 수 없음. 우회하려면 *헤드리스 브라우저 + 주거용(residential) 프록시 로테이션*이 필요한데 서버리스에서 비현실적(비용·불안정·약관 위반 소지).
- **결과수 파싱 자체는** HTML/`productCount`류 필드에서 가능하나, **접근(차단 통과)이 막혀 무의미.**

**2) 보조: 쿠팡 파트너스 검색 API — 부적합.**
- 엔드포인트: `GET /v2/providers/affiliate_open_api/apis/openapi/v1/products/search` (HMAC 서명, 판매자 API와 동형).
- **가입 조건:** 파트너스(제휴) 승인 필요 — 최소 매출(약 15만 원 상당) 등 활동 요건. 단순 조회용으론 진입장벽.
- **치명적 한계:** **호출당 최대 10개 상품 반환 · 시간당 10회 제한 · "전체 경쟁상품수(총 노출 건수)"를 제공하지 않음.** → 경쟁상품수 지표로 사용 불가.

**3) 쿠팡 판매자(Wing) API:** §3 기재대로 **내(vendor) 데이터만** 반환 → 시장 경쟁수 측정 불가.

**판정 & 폴백(확정):** 경쟁상품수를 **안정적으로 직접 확보할 경로 없음.** → 1b '경쟁 대비 기회' 등급의 분모(`검색지수÷경쟁상품수`)를 **직접 채울 수 없으므로 1b는 보류**, 등급은 **1a식(`검색지수×0.6 + 시즌×0.4`)으로 계속 운영**(PLAN의 단계별 분리식 폴백 그대로). 헤드라인 기능을 1b→1a 유지로 조정 필요(→ PM).

**미래 옵션(필요 시에만, 비용/안정성 트레이드오프):** 외부 안티봇 스크래핑 SaaS(Zyte/ScraperAPI/Bright Data 등 residential+JS렌더) 경유, 또는 **상시 서버(헤드리스 브라우저)에서 수집→캐시→우리 API가 읽기**. 둘 다 인프라/비용 추가. 도입 시 인터페이스(보류):
```ts
// lib/competition.ts — 외부 스크래핑 경유로 결정될 때만 구현
export type CompetitionResult = {
  keyword: string;
  productCount: number | null;      // 실패 시 null → grade가 1a식으로 자동 폴백
  source: 'coupang-scrape' | 'unavailable';
  fetchedAt: string;
};
export async function fetchCompetitionCount(keyword: string): Promise<CompetitionResult>;
// 캐시 24h, 실패/차단 시 productCount=null. 절대 빌드/요청 블로킹 금지(폴백 우선).
```

### [B] 네이버 검색광고 '키워드도구' API — 우선순위 2 · 판정: ✅ 연동 가능 (설계 완료, 키 발급은 운영자)

**기본:**
- **Base URL:** `https://api.naver.com` (데이터랩과 별개 시스템 — 검색광고 API)
- **엔드포인트:** `GET /keywordstool?hintKeywords=<쉼표구분 최대5개>&showDetail=1`
- **인증 헤더 4종:** `X-Timestamp`(ms 단위 현재시각), `X-API-KEY`(액세스 라이선스), `X-Customer`(고객 ID, 숫자), `X-Signature`.
- **서명:** `base64( HMAC-SHA256( secretKey, `${timestamp}.${method}.${uri}` ) )` — **uri는 쿼리스트링 제외 경로**(`/keywordstool`). (네이버 공식 `signaturehelper` 샘플로 검증.)

**서명 유틸 설계 (TS, Node `crypto`):**
```ts
// lib/searchad.ts
import crypto from 'crypto';

function sign(ts: string, method: string, uri: string, secret: string): string {
  const msg = `${ts}.${method}.${uri}`;            // uri = '/keywordstool' (쿼리 제외)
  return crypto.createHmac('sha256', secret).update(msg).digest('base64');
}

function authHeaders(method: string, uri: string) {
  const ts = String(Date.now());
  return {
    'X-Timestamp': ts,
    'X-API-KEY': process.env.NAVER_AD_API_KEY!,
    'X-Customer': process.env.NAVER_AD_CUSTOMER_ID!,
    'X-Signature': sign(ts, method, uri, process.env.NAVER_AD_SECRET!),
  };
}
```

**클라이언트 함수 설계:**
```ts
export type RelKeyword = {
  relKeyword: string;
  pc: number;        // monthlyPcQcCnt   ("< 10"은 5로 환산)
  mobile: number;    // monthlyMobileQcCnt
  total: number;     // pc + mobile (자체 인기순위 정렬키)
  compIdx: '높음' | '중간' | '낮음';  // 경쟁정도
};
// 시드(최대 5개) → 연관키워드 목록. 24h 캐시(next.revalidate). 실패 시 수동 시드 사전 폴백.
export async function fetchRelatedKeywords(hints: string[]): Promise<RelKeyword[]>;
```

**응답 필드(`keywordList[]`):** `relKeyword`, `monthlyPcQcCnt`, `monthlyMobileQcCnt`, `monthlyAvePcClkCnt`, `monthlyAveMobileClkCnt`, `monthlyAvePcCtr`, `monthlyAveMobileCtr`, `plAvgDepth`, `compIdx`(높음/중간/낮음).
- ⚠️ **검색수 적으면 `"< 10"` 문자열**로 반환 → 숫자 파싱 시 5(또는 0)로 정규화 필요.

**한도/캐시:** 호출당 **hintKeywords 최대 5개**, 연관키워드 **최대 약 1,000개** 반환. 계정/라이선스 기준 일일 호출 제한 존재 → **시드별 24h 캐시 필수**, 한 번에 시드 N개씩 묶음 호출.

**env (Vercel Production+Preview, 로컬 `.env.local`):**
```
NAVER_AD_API_KEY=<액세스 라이선스>
NAVER_AD_SECRET=<비밀키>
NAVER_AD_CUSTOMER_ID=<고객 ID(숫자)>
```

**🔑 운영자용 키 발급 가이드 (운영자 = 나):**
1. `searchad.naver.com` 접속 → 네이버 **검색광고** 계정 가입/로그인(기존 광고주 계정 가능). *광고 집행·충전 없이도 API 라이선스 발급 가능.*
2. 로그인 후 우상단 **내 정보**에서 **고객 ID(CUSTOMER_ID, 숫자)** 확인 → `NAVER_AD_CUSTOMER_ID`.
3. 상단 **도구 > API 사용 관리**(또는 '광고관리 API 라이선스') → **네이버 검색광고 API 라이선스 발급** → **액세스 라이선스**(`NAVER_AD_API_KEY`) + **비밀키**(`NAVER_AD_SECRET`) 확보. *비밀키는 발급 시 1회만 노출되니 즉시 보관.*
4. 위 3개 값을 **Vercel 환경변수(Production+Preview)**에 등록 → **재배포해야 반영**(§4).
5. 등록 후 알려주면 `lib/searchad.ts` PoC로 연관키워드 샘플 호출 검증.

> ⚠️ 비밀값은 코드/문서/커밋/채팅에 절대 남기지 않음(§5). 키 자체는 운영자가 Vercel에만 입력.

### [C] 네이버 쇼핑인사이트 "인기검색어 TOP500" — 우선순위 3 · 판정: ❌ 공식 Open API 미제공 → 대안 권고

- **데이터랩 쇼핑인사이트 공식 Open API**(`developers.naver.com`, `POST /v1/datalab/shopping/*`)가 제공하는 것:
  - `/shopping/categories` — 카테고리별 **클릭량 추이**
  - `/shopping/category/keywords` — **내가 제공한 키워드들**의 카테고리 내 클릭 추이
  - 기기별/성별/연령별 세분 추이
  - → 전부 **"내가 입력한" 키워드·카테고리의 추이**만 반환. **랭킹된 인기검색어 목록을 돌려주는 엔드포인트는 없음.**
- **"분야별 인기검색어 TOP500"은 `datalab.naver.com` 웹 UI 전용 기능** → 공식 API로는 확보 불가.
- **대안 권고 (우선순위순):**
  1. **(권장) [B] 키워드도구로 자체 인기순위 구성** — 시드 과일별 연관키워드 + **월간검색수(절대값)**를 받아 `total` 내림차순으로 자체 TOP 리스트 생성. **공식 경로·안정적**이라 TOP500 대체로 충분. E1-2 인기검색어/롱테일 발굴과 한 소스로 통합 가능.
  2. (회색지대) `datalab.naver.com` 비공식 AJAX(`/shoppingInsight/getCategoryKeywordRank.naver`) 크롤링 — **egress 허용 필요(현 개발환경 차단)**, 약관 회색지대, Vercel 프로덕션 동작 별도 검증 필요. *(main 라인의 데이터랩 크롤링 결정과 동일 경로 — 채택 시 [B] 폴백을 항상 병행.)*
  3. 자체 화이트리스트(과일/세분류 큐레이션) 최종 폴백.
- **결론:** TOP 리스트는 **[B] 월간검색수 기반 자체 순위로 구현**을 1순위 권고. 공식 인기검색어 API에 의존하는 설계는 폐기.
