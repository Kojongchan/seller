import { NextResponse } from 'next/server';
import { getFruit, MONTHS, detectPeakMonths } from '@/lib/fruits';
import { fetchKeywordTrend, hasNaverKeys } from '@/lib/naver';

// GET /api/trend?fruit=watermelon
// 응답: { name, source, peakMonths, series: [{ month, ratio }] }
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fruitId = searchParams.get('fruit') ?? 'watermelon';
  const fruit = getFruit(fruitId);

  if (!fruit) {
    return NextResponse.json({ error: 'unknown fruit' }, { status: 400 });
  }

  let ratios = fruit.sample;
  let source: 'naver' | 'sample' = 'sample';

  if (hasNaverKeys()) {
    try {
      const trend = await fetchKeywordTrend(fruit.category, fruit.name);
      if (trend && trend.length > 0) {
        // 네이버는 월 순서대로 12개를 주므로 ratio만 추출.
        // 라벨은 응답의 period(YYYY-MM)에서 월을 뽑아 맞춘다.
        ratios = trend.map((t) => t.ratio);
        source = 'naver';
        const series = trend.map((t) => ({
          month: `${Number(t.month.slice(5, 7))}월`,
          ratio: Math.round(t.ratio),
        }));
        const peakMonths = detectPeakMonths(ratios).map((i) => series[i].month);
        return NextResponse.json({ name: fruit.name, source, peakMonths, series });
      }
    } catch (e) {
      // API 실패 시 샘플로 폴백 (운영 중 키 만료/한도초과 대비)
      console.error('[trend] naver fallback:', e);
    }
  }

  const series = MONTHS.map((m, i) => ({ month: m, ratio: ratios[i] }));
  const peakMonths = detectPeakMonths(ratios).map((i) => MONTHS[i]);
  return NextResponse.json({ name: fruit.name, source, peakMonths, series });
}
