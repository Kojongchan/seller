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
  - ⚠️ **인기검색어 TOP500은 데이터랩 웹 UI 기능** — API 제공 범위 조사 필요(미제공 시 대안 마련)

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
- 경쟁상품수: **쿠팡 검색결과 크롤링(1순위)** 또는 **쿠팡 파트너스 검색 API**(조사) — 아래 6번 참고

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

- [ ] **경쟁상품수 출처** — ① 쿠팡 검색결과 크롤링(차단·약관·안정성 검토) ② **쿠팡 파트너스 검색 API** 가능성(가입/한도/결과수 제공 여부) — 1순위 크롤링, 2순위 네이버 신호 폴백
- [ ] 네이버 쇼핑인사이트 "인기검색어 TOP500" API 제공 여부/한도
- [ ] **쿠팡 판매자(Wing) API 인증(HMAC) 구현** — 키 발급 후 서명 유틸 작성
- [ ] E2 진입 시 DB 선택 (Vercel Postgres vs KV vs 외부)
- [ ] 네이버 API 일일 호출 한도(쿼터) 대비 캐싱 전략
