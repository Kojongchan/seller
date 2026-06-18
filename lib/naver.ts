// 네이버 데이터랩 쇼핑인사이트 API 클라이언트.
// 문서: https://developers.naver.com/docs/serviceapi/datalab/shopping/shopping.md
//
// 키워드별 월간 상대 검색 지수(0~100)를 반환합니다.
// NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 가 없으면 null을 반환하고,
// 호출 측에서 샘플 데이터로 폴백합니다.

const ENDPOINT = 'https://openapi.naver.com/v1/datalab/shopping/category/keywords';

export interface MonthlyTrend {
  month: string; // 'YYYY-MM-01'
  ratio: number; // 0~100
}

export function hasNaverKeys(): boolean {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

// 최근 12개월(전월까지)의 시작/종료일 문자열을 만든다.
function lastTwelveMonthsRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1); // 이번 달 1일
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

export async function fetchKeywordTrend(
  category: string,
  keyword: string,
): Promise<MonthlyTrend[] | null> {
  if (!hasNaverKeys()) return null;

  const { startDate, endDate } = lastTwelveMonthsRange();
  const body = {
    startDate,
    endDate,
    timeUnit: 'month',
    category,
    keyword: [{ name: keyword, param: [keyword] }],
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    // 데이터랩 데이터는 자주 안 바뀌므로 6시간 캐시
    next: { revalidate: 60 * 60 * 6 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Naver DataLab API ${res.status}: ${text}`);
  }

  const json = await res.json();
  const data: Array<{ period: string; ratio: number }> = json?.results?.[0]?.data ?? [];
  return data.map((d) => ({ month: d.period, ratio: d.ratio }));
}
