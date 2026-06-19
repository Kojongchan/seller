import { NextResponse } from 'next/server';
import { type Fruit } from '@/lib/fruits';
import { fetchSearchTrend, hasNaverKeys } from '@/lib/naver';
import { resolveKeyword } from '@/lib/keywords';
import {
  buildForecastSeries,
  computeEntrySignal,
  computePeakForecast,
  computeYoyTrend,
  gradeFromTrend,
  seasonalProfile,
  type ForecastPoint,
  type TrendPoint,
} from '@/lib/grade';

// GET /api/trend?q=<키워드>            (권장: 임의 키워드 분석)
// GET /api/trend?fruit=<id>            (구버전 호환: 과일 id)
//     &debug=1
//
// 응답:
// { query, name, source: 'naver'|'sample'|'none', message?,
//   granularity: 'daily'|'monthly',
//   series: [{ period, ratio, forecast, monthIndex }],  // ratio=실측, forecast=예측
//   peakMonths: string[], forecastPeakPoint, summary, forecast, grade, debug? }
//
// 차트 기준: 재작년·작년·올해(1~12월) 3개 달력연도. 실측은 재작년 1/1~오늘,
// 올해 오늘 이후 ~ 12월 말은 재작년→작년 모멘텀으로 보정한 예측선.

const MONTH_LABELS = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
];

// 차트 포인트. period 는 일별('YYYY-MM-DD') 또는 월별('YYYY-MM').
// ratio=실측(과거~오늘), forecast=예측(오늘~연말). 이음새 1점은 둘 다 채워 연결.
interface ChartPoint {
  period: string;
  ratio: number | null;
  forecast: number | null;
  monthIndex: number; // 0~11
}

function monthIndexOfPeriod(period: string): number {
  return Number(period.slice(5, 7)) - 1;
}

// 실측 + 예측을 하나의 시리즈로 합친다(기간 오름차순).
function buildChartSeries(real: TrendPoint[], fc: ForecastPoint[]): ChartPoint[] {
  const pts: ChartPoint[] = real.map((t) => ({
    period: t.period,
    ratio: Math.round(t.ratio),
    forecast: null,
    monthIndex: monthIndexOfPeriod(t.period),
  }));
  // 이음새: 마지막 실측점에 forecast=실측값을 넣어 실선↔점선을 연결.
  if (pts.length && fc.length) pts[pts.length - 1].forecast = pts[pts.length - 1].ratio;
  for (const f of fc) {
    pts.push({ period: f.period, ratio: null, forecast: f.ratio, monthIndex: monthIndexOfPeriod(f.period) });
  }
  pts.sort((a, b) => a.period.localeCompare(b.period));
  return pts;
}

// 시즌 프로파일에서 피크(최댓값의 70% 이상) 달력월 라벨 추출. (실측+예측 합산 기준)
function peakMonthLabels(series: TrendPoint[]): string[] {
  const profile = seasonalProfile(series);
  const max = Math.max(...profile);
  if (max <= 0) return [];
  const threshold = max * 0.7;
  return profile
    .map((v, i) => (v >= threshold ? MONTH_LABELS[i] : null))
    .filter((v): v is string => v !== null);
}

// 올해 3개 달력연도 월별 실측 시리즈(재작년·작년 전체 + 올해 이번 달까지)를 샘플로 합성.
function sampleRealSeries(fruit: Fruit, now: Date): TrendPoint[] {
  const thisYear = now.getFullYear();
  const out: TrendPoint[] = [];
  for (let y = thisYear - 2; y <= thisYear; y++) {
    const lastMonth = y < thisYear ? 11 : now.getMonth(); // 올해는 이번 달까지만 실측
    for (let m = 0; m <= lastMonth; m++) {
      out.push({ period: `${y}-${String(m + 1).padStart(2, '0')}`, ratio: fruit.sample[m] });
    }
  }
  return out;
}

function analysisPayload(real: TrendPoint[], now: Date, granularity: 'daily' | 'monthly') {
  const fc = buildForecastSeries(real, now);
  const forecast = computePeakForecast(real, now, fc);
  const yoy = computeYoyTrend(real);
  const grade = gradeFromTrend(real, now);
  const current = real.length ? real[real.length - 1] : null;
  // 차트에 찍을 '예상 피크점' = 카드와 동일한 (예측 곡선 기준) 피크.
  const forecastPeakPoint =
    forecast.projectedPeakRatio != null
      ? { period: forecast.forecastPeak, ratio: forecast.projectedPeakRatio }
      : null;
  return {
    granularity,
    series: buildChartSeries(real, fc),
    peakMonths: peakMonthLabels([...real, ...fc]),
    forecastPeakPoint,
    entry: computeEntrySignal(real, forecast, now, fc),
    summary: {
      // 일별은 노이즈가 커서 '현재 검색지수'는 최신 월 평균(yoy.current)을 사용.
      currentIndex: yoy.current,
      currentPeriod: current ? current.period : null,
      yoy,
    },
    forecast,
    grade,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const debug = searchParams.get('debug');
  const now = new Date();

  // q 우선, 없으면 구버전 fruit, 둘 다 없으면 기본값.
  const q = searchParams.get('q');
  const fruitParam = searchParams.get('fruit');
  const rawQuery = (q ?? fruitParam ?? 'watermelon').trim();

  if (!rawQuery) {
    return NextResponse.json({ error: 'empty query' }, { status: 400 });
  }

  const { keyword, fruit } = resolveKeyword(rawQuery);

  // 1) 네이버 실데이터 시도
  if (hasNaverKeys()) {
    try {
      const trend = await fetchSearchTrend(keyword);
      if (trend && trend.length > 0) {
        const real: TrendPoint[] = trend.map((t) => ({ period: t.period, ratio: t.ratio }));
        return NextResponse.json({
          query: keyword,
          name: keyword,
          source: 'naver',
          ...analysisPayload(real, now, 'daily'),
          ...(debug ? { debug: { hasKeys: true, apiNote: 'ok', points: real.length } } : {}),
        });
      }
      // 빈 응답 → 폴백으로 진행
      return fallback(keyword, fruit, now, debug, 'naver returned empty data');
    } catch (e) {
      const apiNote = e instanceof Error ? e.message : String(e);
      console.error('[trend] naver fallback:', apiNote);
      return fallback(keyword, fruit, now, debug, apiNote);
    }
  }

  return fallback(keyword, fruit, now, debug, 'no naver keys in this environment');
}

// 폴백: 16종이면 샘플, 그 외 임의 키워드는 안내 메시지.
function fallback(
  keyword: string,
  fruit: Fruit | null,
  now: Date,
  debug: string | null,
  apiNote: string,
) {
  if (fruit) {
    const real = sampleRealSeries(fruit, now);
    return NextResponse.json({
      query: keyword,
      name: fruit.name,
      source: 'sample',
      ...analysisPayload(real, now, 'monthly'),
      ...(debug ? { debug: { hasKeys: hasNaverKeys(), apiNote, keyInfo: keyDiagnostics(), sampleFruit: fruit.id } } : {}),
    });
  }

  // 샘플조차 없는 임의 키워드 → 데이터 없음 안내
  return NextResponse.json({
    query: keyword,
    name: keyword,
    source: 'none',
    message: '네이버 검색어트렌드 키가 없어 실데이터를 불러올 수 없습니다. 샘플은 16개 대표 과일에만 제공됩니다. 키 연결 시 임의 키워드도 분석됩니다.',
    granularity: 'monthly',
    series: [],
    peakMonths: [],
    forecastPeakPoint: null,
    entry: null,
    summary: { currentIndex: 0, currentPeriod: null, yoy: { direction: 'flat', current: 0, lastYear: null, deltaPct: null } },
    forecast: null,
    grade: null,
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
  };
}
