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

// 카테고리(cid) 인기검색어 TOP 을 크롤한다. 실패/차단/빈응답이면 null.
// count: 가져올 순위 수(데이터랩은 페이지당 최대 20). page=1 고정(메인 TOP 용).
export async function fetchCategoryKeywordRank(
  cid: string = FRUIT_CATEGORY_CID,
  count = 20,
): Promise<RankedKeyword[] | null> {
  if (!isDatalabCrawlEnabled()) return null;

  const { startDate, endDate } = recentRange();
  const params = new URLSearchParams({
    cid,
    timeUnit: 'date',
    startDate,
    endDate,
    age: '',
    gender: '',
    device: '',
    page: '1',
    count: String(Math.min(Math.max(count, 1), 20)),
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
      console.error(`[datalab] rank ${res.status}`);
      return null;
    }
    const json: unknown = await res.json();
    return parseRanks(json);
  } catch (e) {
    console.error('[datalab] rank fetch failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
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
