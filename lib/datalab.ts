// 네이버 데이터랩 '쇼핑인사이트' 인기검색어 크롤러.
// 화면: https://datalab.naver.com/shoppingInsight/sCategory.naver
//
// ⚠️ 공식 OpenAPI(검색어트렌드)와 달리 '인기검색어 TOP'은 공개 API가 없어
//    쇼핑인사이트 화면이 내부적으로 호출하는 XHR 엔드포인트를 크롤한다.
//    (getCategoryKeywordRank.naver — POST, x-www-form-urlencoded)
//
// 차단/실패 시 항상 null 을 반환하고, 호출 측(lib/popular.ts)이 샘플로 폴백한다.
// 그래서 네트워크가 막힌 개발 샌드박스에서도 앱은 정상 동작한다.
//
// 🚧 라이브 검증 메모(2026-06-19): 현재 원격 개발 환경은 egress 정책으로
//    datalab.naver.com 을 포함한 모든 외부 도메인을 403("Blocked by egress
//    policy")으로 차단한다. 따라서 이 크롤러의 '실데이터 경로'는 egress 가
//    허용된 환경(프로덕션 Vercel 등)에서만 검증·동작한다. 로직 자체는
//    순수 파서/엔진(lib/golden.ts)으로 분리해 오프라인 단위테스트로 검증한다.

const RANK_ENDPOINT = 'https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver';
const REFERER = 'https://datalab.naver.com/shoppingInsight/sCategory.naver';

// 식품 > 농산물 > 과일 카테고리 코드(cid). 데이터랩 화면에서 과일 선택 시 확인 가능.
export const FRUIT_CATEGORY_CID = '50000159';

export interface RankedKeyword {
  rank: number;
  keyword: string;
}

// 환경변수로 크롤 시도 자체를 끌 수 있다(기본: 시도). egress 차단 환경에서
// 불필요한 외부요청·로그를 줄이고 싶을 때 DATALAB_CRAWL=off 로 설정.
export function isDatalabCrawlEnabled(): boolean {
  return (process.env.DATALAB_CRAWL ?? 'on').toLowerCase() !== 'off';
}

// 데이터랩은 보통 '어제'까지 집계 → endDate=어제, 최근 30일 구간.
function recentRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now.getTime() - 1 * 86_400_000);
  const start = new Date(end.getTime() - 29 * 86_400_000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

// 데이터랩 쇼핑인사이트는 페이지당 최대 20위 → TOP500은 25페이지 페이지네이션.
const PAGE_SIZE = 20;
export const MAX_RANK = 500;

// 카테고리(cid) 인기검색어 한 '페이지'를 크롤한다. 실패/차단/빈응답이면 null.
async function fetchRankPage(
  cid: string,
  page: number,
  range: { startDate: string; endDate: string },
): Promise<RankedKeyword[] | null> {
  const params = new URLSearchParams({
    cid,
    timeUnit: 'date',
    startDate: range.startDate,
    endDate: range.endDate,
    age: '',
    gender: '',
    device: '',
    page: String(page),
    count: String(PAGE_SIZE),
  });

  try {
    const res = await fetch(RANK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: REFERER,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      body: params.toString(),
      // 인기검색어는 일 단위로 갱신 → 6시간 캐시.
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) {
      console.error(`[datalab] rank page ${page} → ${res.status}`);
      return null;
    }
    return parseRanks(await res.json());
  } catch (e) {
    console.error(`[datalab] rank page ${page} failed:`, e instanceof Error ? e.message : String(e));
    return null;
  }
}

// 카테고리(cid) 인기검색어 TOP 을 크롤한다(최대 limit, 데이터랩 상한 500).
// 페이지(20개)를 순차로 긁어 전역 순위로 재번호 매김. 첫 페이지부터 실패/차단이면
// null(→ 샘플 폴백). 중간 페이지가 실패하거나 더 짧으면 거기까지의 부분 결과 반환.
export async function fetchCategoryKeywordRank(
  cid: string = FRUIT_CATEGORY_CID,
  limit = PAGE_SIZE,
): Promise<RankedKeyword[] | null> {
  if (!isDatalabCrawlEnabled()) return null;

  const cap = Math.min(Math.max(limit, 1), MAX_RANK);
  const lastPage = Math.ceil(cap / PAGE_SIZE);
  const range = recentRange();
  const pages: RankedKeyword[][] = [];

  for (let p = 1; p <= lastPage; p++) {
    const page = await fetchRankPage(cid, p, range);
    if (!page || page.length === 0) break; // 실패/차단/끝
    pages.push(page);
    if (page.length < PAGE_SIZE) break; // 마지막 페이지(데이터 소진)
  }

  const merged = flattenRanks(pages, cap);
  return merged.length > 0 ? merged : null;
}

// 페이지별 결과를 전역 순위(1..limit)로 합친다(순수함수 — 페이지네이션 단위테스트용).
// 데이터랩 페이지 순위는 페이지마다 1부터 다시 시작하므로 누적 위치로 재번호.
export function flattenRanks(pages: RankedKeyword[][], limit: number): RankedKeyword[] {
  const out: RankedKeyword[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const item of page) {
      const keyword = (item.keyword ?? '').trim();
      if (!keyword || seen.has(keyword)) continue;
      seen.add(keyword);
      out.push({ rank: out.length + 1, keyword });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// 데이터랩 응답 → RankedKeyword[]. 응답 형태가 흔들려도 안전하게 파싱.
// 형태: { ranks: [{ rank, keyword, linkId }, ...] } 또는
//       { results: [{ data: [{ rank, keyword }] }] } 두 케이스를 모두 수용.
export function parseRanks(json: unknown): RankedKeyword[] | null {
  const obj = json as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object') return null;

  let raw: unknown =
    (obj.ranks as unknown) ??
    ((Array.isArray(obj.results) && (obj.results[0] as Record<string, unknown>)?.data) as unknown);

  if (!Array.isArray(raw)) return null;

  const out: RankedKeyword[] = [];
  raw.forEach((item, i) => {
    const r = item as Record<string, unknown>;
    const keyword = typeof r.keyword === 'string' ? r.keyword.trim() : '';
    if (!keyword) return;
    const rank = Number.isFinite(Number(r.rank)) ? Number(r.rank) : i + 1;
    out.push({ rank, keyword });
  });
  return out.length > 0 ? out : null;
}
