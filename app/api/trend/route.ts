import { NextResponse } from 'next/server';
import { getFruit, type Fruit } from '@/lib/fruits';
import { fetchSearchTrend, hasNaverKeys } from '@/lib/naver';
import { resolveKeyword } from '@/lib/keywords';
import {
  computePeakForecast,
  computeYoyTrend,
  gradeFromTrend,
  seasonalProfile,
  type TrendPoint,
} from '@/lib/grade';

// GET /api/trend?q=<키워드>            (권장: 임의 키워드 분석)
// GET /api/trend?fruit=<id>            (구버전 호환: 과일 id)
//     &debug=1
//
// 응답:
// { query, name, source: 'naver'|'sample'|'none', message?,
//   granularity: 'daily'|'monthly',
//   series: [{ period, ratio, monthIndex }],   // naver=일별, sample=월별
//   peakMonths: string[], summary, forecast, grade, debug? }

const MONTH_LABELS = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
];

// 차트/분석 공용 시리즈 포인트. period 는 일별('YYYY-MM-DD') 또는 월별('YYYY-MM').
interface SeriesPoint {
  period: string;
  ratio: number; // 0~100
  monthIndex: number; // 0~11
}

function toSeriesPoint(period: string, ratio: number): SeriesPoint {
  return {
    period,
    ratio: Math.round(ratio),
    monthIndex: Number(period.slice(5, 7)) - 1,
  };
}

// 이번 달 포함, 최근 count개월의 'YYYY-MM' 목록(오름차순).
function recentMonths(count: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// 샘플(달력 12값) → 최근 24개월 period 시리즈로 확장.
function sampleSeries(fruit: Fruit, now = new Date()): SeriesPoint[] {
  return recentMonths(24, now).map((period) => {
    const monthIndex = Number(period.slice(5, 7)) - 1;
    return toSeriesPoint(period, fruit.sample[monthIndex]);
  });
}

// 시즌 프로파일에서 피크(최댓값의 70% 이상) 달력월 라벨 추출.
function peakMonthLabels(series: SeriesPoint[]): string[] {
  const profile = seasonalProfile(series as TrendPoint[]);
  const max = Math.max(...profile);
  if (max <= 0) return [];
  const threshold = max * 0.7;
  return profile
    .map((v, i) => (v >= threshold ? MONTH_LABELS[i] : null))
    .filter((v): v is string => v !== null);
}

function analysisPayload(series: SeriesPoint[], now: Date, granularity: 'daily' | 'monthly') {
  const points = series as TrendPoint[];
  const forecast = computePeakForecast(points, now);
  const yoy = computeYoyTrend(points);
  const grade = gradeFromTrend(points, now);
  const current = series.length ? series[series.length - 1] : null;
  return {
    granularity,
    series,
    peakMonths: peakMonthLabels(series),
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
        const series = trend.map((t) => toSeriesPoint(t.period, t.ratio));
        return NextResponse.json({
          query: keyword,
          name: keyword,
          source: 'naver',
          ...analysisPayload(series, now, 'daily'),
          ...(debug ? { debug: { hasKeys: true, apiNote: 'ok', points: series.length } } : {}),
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
    const series = sampleSeries(fruit, now);
    return NextResponse.json({
      query: keyword,
      name: fruit.name,
      source: 'sample',
      ...analysisPayload(series, now, 'monthly'),
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
