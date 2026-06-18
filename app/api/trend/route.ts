import { NextResponse } from 'next/server';
import { getFruit, MONTHS, detectPeakMonths } from '@/lib/fruits';
import { fetchSearchTrend, hasNaverKeys } from '@/lib/naver';

// GET /api/trend?fruit=watermelon[&debug=1]
// 응답: { name, source, peakMonths, series: [{ month, ratio }], debug? }
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fruitId = searchParams.get('fruit') ?? 'watermelon';
  const debug = searchParams.get('debug');
  const fruit = getFruit(fruitId);

  if (!fruit) {
    return NextResponse.json({ error: 'unknown fruit' }, { status: 400 });
  }

  let ratios = fruit.sample;
  let source: 'naver' | 'sample' = 'sample';
  let apiNote: string | null = null;

  if (hasNaverKeys()) {
    try {
      const trend = await fetchSearchTrend(fruit.name);
      if (trend && trend.length > 0) {
        // 검색어 트렌드는 월 순서대로 데이터를 주므로 ratio만 추출.
        // 라벨은 응답의 period(YYYY-MM)에서 월을 뽑아 맞춘다.
        const series = trend.map((t) => ({
          month: `${Number(t.month.slice(5, 7))}월`,
          ratio: Math.round(t.ratio),
        }));
        const peakMonths = detectPeakMonths(series.map((s) => s.ratio)).map(
          (i) => series[i].month,
        );
        return NextResponse.json({
          name: fruit.name,
          source: 'naver',
          peakMonths,
          series,
          ...(debug ? { debug: { hasKeys: true, apiNote: 'ok' } } : {}),
        });
      }
      apiNote = 'naver returned empty data';
    } catch (e) {
      // API 실패 시 샘플로 폴백 (키 만료/한도초과/요청오류 대비)
      apiNote = e instanceof Error ? e.message : String(e);
      console.error('[trend] naver fallback:', apiNote);
    }
  } else {
    apiNote = 'no naver keys in this environment';
  }

  const series = MONTHS.map((m, i) => ({ month: m, ratio: ratios[i] }));
  const peakMonths = detectPeakMonths(ratios).map((i) => MONTHS[i]);
  return NextResponse.json({
    name: fruit.name,
    source,
    peakMonths,
    series,
    ...(debug ? { debug: { hasKeys: hasNaverKeys(), apiNote, keyInfo: keyDiagnostics() } } : {}),
  });
}

// 키 값 자체는 노출하지 않고, 길이/공백 여부만 진단용으로 반환.
function keyDiagnostics() {
  const id = process.env.NAVER_CLIENT_ID ?? '';
  const secret = process.env.NAVER_CLIENT_SECRET ?? '';
  return {
    idLen: id.length,
    secretLen: secret.length,
    idHasWhitespace: id !== id.trim(),
    secretHasWhitespace: secret !== secret.trim(),
    idHead: id.slice(0, 2),
    secretHead: secret.slice(0, 2),
  };
}
