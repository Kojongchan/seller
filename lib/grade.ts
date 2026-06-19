// 등급·시즌 피크 산식 (순수함수). 외부 의존 없음 → 단위 테스트 용이.
//
// 1a 임시등급(네이버 검색지수만): 점수 = 0.6 × 검색지수강도 + 0.4 × 시즌신호.
// 경쟁상품수가 들어오는 1b에서는 이 식이 폴백으로 재사용된다.
//
// 입력 시리즈는 일별('YYYY-MM-DD') 또는 월별('YYYY-MM') 어느 쪽이든 동작한다.
// (네이버 실데이터=일별, 샘플 폴백=월별). 날짜 기반 윈도우로 처리.

export interface TrendPoint {
  period: string; // 'YYYY-MM-DD' 또는 'YYYY-MM'
  ratio: number; // 네이버 상대 검색지수 0~100
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export const MONTH_LABELS = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
];

const DAY = 86_400_000;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function monthIndexOf(period: string): number {
  return Number(period.slice(5, 7)) - 1; // 0~11
}

function yearOf(period: string): number {
  return Number(period.slice(0, 4));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// 'YYYY-MM' 단위로 묶어 평균낸 월별 시리즈 (일별 노이즈 평활화용).
export function monthlyAverages(series: TrendPoint[]): TrendPoint[] {
  const byMonth = new Map<string, number[]>();
  for (const p of series) {
    const key = p.period.slice(0, 7);
    const arr = byMonth.get(key) ?? [];
    arr.push(p.ratio);
    byMonth.set(key, arr);
  }
  return [...byMonth.entries()]
    .map(([period, ratios]) => ({ period, ratio: avg(ratios) }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// 달력 월(1~12)별 평균 지수 → 시즌 패턴. 2년치가 있으면 두 해를 평균.
export function seasonalProfile(series: TrendPoint[]): number[] {
  const sum = Array(12).fill(0);
  const cnt = Array(12).fill(0);
  for (const p of series) {
    const m = monthIndexOf(p.period);
    if (m < 0 || m > 11) continue;
    sum[m] += p.ratio;
    cnt[m] += 1;
  }
  return sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
}

export interface PeakInfo {
  period: string; // 최고점 일자/월 ('YYYY-MM-DD' 또는 'YYYY-MM')
  monthLabel: string; // '9월'
  dateLabel: string; // '2024-09-14' (일별) / '2024-09' (월별)
  ratio: number;
}

function peakInfoOf(arr: TrendPoint[]): PeakInfo | null {
  if (arr.length === 0) return null;
  const top = arr.reduce((m, p) => (p.ratio > m.ratio ? p : m));
  return {
    period: top.period,
    monthLabel: MONTH_LABELS[monthIndexOf(top.period)],
    dateLabel: top.period,
    ratio: Math.round(top.ratio),
  };
}

// 예측 근거(신뢰도 표기용).
//  'yoy'      = 2년치 실데이터로 재작년→작년 모멘텀까지 반영(가장 신뢰도 높음)
//  'lastyear' = 작년 1년치만 있어 작년 패턴을 그대로 투영
//  'profile'  = 일자 피크가 없어 시즌 프로파일(피크월 1일)로 추정
export type ForecastBasis = 'yoy' | 'lastyear' | 'profile';

export interface PeakForecast {
  peakMonthIndex: number; // 0~11
  peakMonthLabel: string;
  peakRatio: number; // 시즌 프로파일상 피크월 평균 지수
  peakDateLabel: string; // 예상 피크 '월·일' (예: '9월 14일') — 모멘텀 반영 후
  forecastPeak: string; // 예상 피크 일자 'YYYY-MM-DD'
  dday: number; // 예상 피크 일자까지 남은 일수 (0 = 오늘이 피크, 음수 없음)
  isInPeak: boolean; // 이번 달이 시즌 피크월인지
  lastYearPeak: PeakInfo | null; // 최근 12개월 윈도우 최고점(일자)
  prevYearPeak: PeakInfo | null; // 그 이전 12개월 윈도우 최고점(일자)
  // ── 실데이터 기반 예측(재작년 대비 작년 변화 → 올해 투영) ──
  basis: ForecastBasis; // 예측 근거/신뢰도
  yoyGrowthPct: number | null; // 재작년 대비 작년 피크 변화율(%) [관측값]
  projectedPeakRatio: number | null; // 올해 예상 피크 지수 (예측 곡선 최고점)
  peakShiftDays: number | null; // 피크 시점 변화(작년-재작년, 일). 양수=늦어짐 [관측값]
}

// 'YYYY-MM-DD'/'YYYY-MM' → 1년 안에서의 일 순서(0~365). 연도 무시, 시점 비교용.
function dayOfYearOf(period: string): number {
  const m = Number(period.slice(5, 7)) - 1;
  const d = period.length >= 10 ? Number(period.slice(8, 10)) : 1;
  return Math.round((new Date(2001, m, d).getTime() - new Date(2001, 0, 1).getTime()) / DAY);
}

// 피크 시점 이동량은 과도한 튐을 막기 위해 ±21일로 제한.
const MAX_SHIFT_DAYS = 21;
// 재작년 피크가 너무 작으면(노이즈) 모멘텀 비율이 불안정 → 최소 기준치.
const MIN_PREV_PEAK = 5;

// 예상 피크월·피크지수·피크 일자·D-day·작년/재작년 피크 비교.
// 예상 피크 = 예측 곡선(형태×수준)에서 '오늘 이후'의 최고점.
//   (재작년→작년 변화는 yoyGrowthPct/peakShiftDays로 '관측 정보'만 보존.)
export function computePeakForecast(
  series: TrendPoint[],
  now: Date = new Date(),
  fc?: ForecastPoint[],
): PeakForecast {
  const profile = seasonalProfile(series);
  let seasonPeakMonth = 0;
  for (let i = 1; i < 12; i++) {
    if (profile[i] > profile[seasonPeakMonth]) seasonPeakMonth = i;
  }

  const today0 = startOfDay(now);
  const thisYear = now.getFullYear();
  const daily = series.length > 0 && series[0].period.length >= 10;

  // 작년/재작년 = 달력연도(1~12월) 기준. 차트의 연도 밴드와 일치.
  const lastYearPeak = peakInfoOf(series.filter((p) => yearOf(p.period) === thisYear - 1));
  const prevYearPeak = peakInfoOf(series.filter((p) => yearOf(p.period) === thisYear - 2));
  const hasBoth = Boolean(lastYearPeak && prevYearPeak);
  const basis: ForecastBasis = hasBoth ? 'yoy' : lastYearPeak ? 'lastyear' : 'profile';

  // 관측 모멘텀(재작년→작년) — 참고 정보로만 보존.
  let yoyGrowthPct: number | null = null;
  if (hasBoth && prevYearPeak!.ratio >= MIN_PREV_PEAK) {
    yoyGrowthPct = Math.round((lastYearPeak!.ratio / prevYearPeak!.ratio - 1) * 100);
  }
  let peakShiftDays: number | null = null;
  if (hasBoth) {
    const raw = dayOfYearOf(lastYearPeak!.period) - dayOfYearOf(prevYearPeak!.period);
    peakShiftDays = Math.max(-MAX_SHIFT_DAYS, Math.min(MAX_SHIFT_DAYS, raw));
  }

  // 예측 곡선 기준 '오늘 이후' 최고점 = 올해 실측(오늘까지) + 예측(오늘 이후) 중 최댓값.
  const forecastSeries = fc ?? buildForecastSeries(series, now);
  const todayStr = daily ? fmtDay(today0) : `${thisYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const forward = [...series.filter((p) => yearOf(p.period) === thisYear), ...forecastSeries]
    .filter((p) => p.period >= todayStr);
  const peakPt = forward.length ? forward.reduce((m, p) => (p.ratio > m.ratio ? p : m)) : null;

  let peakMonthIndex = seasonPeakMonth;
  let peakRatio = Math.round(profile[seasonPeakMonth]);
  let projectedPeakRatio: number | null = lastYearPeak ? lastYearPeak.ratio : null;
  let forecastPeak = `${thisYear}-${String(seasonPeakMonth + 1).padStart(2, '0')}-01`;
  let peakDateLabel = MONTH_LABELS[seasonPeakMonth];
  let dday = 0;
  let isInPeak = now.getMonth() === seasonPeakMonth;

  if (peakPt) {
    const m = monthIndexOf(peakPt.period);
    const day = peakPt.period.length >= 10 ? Number(peakPt.period.slice(8, 10)) : 1;
    const pd = new Date(thisYear, m, day);
    peakMonthIndex = m;
    peakRatio = peakPt.ratio;
    projectedPeakRatio = peakPt.ratio;
    forecastPeak = peakPt.period.length >= 10 ? peakPt.period : `${peakPt.period}-01`;
    peakDateLabel = daily ? `${MONTH_LABELS[m]} ${day}일` : MONTH_LABELS[m];
    dday = Math.max(0, Math.round((startOfDay(pd).getTime() - today0.getTime()) / DAY));
    isInPeak = dday === 0 || (now.getMonth() === m && dday <= 7);
  }

  return {
    peakMonthIndex,
    peakMonthLabel: MONTH_LABELS[peakMonthIndex],
    peakRatio,
    peakDateLabel,
    forecastPeak,
    dday,
    isInPeak,
    lastYearPeak,
    prevYearPeak,
    basis,
    yoyGrowthPct,
    projectedPeakRatio,
    peakShiftDays,
  };
}

export interface ForecastPoint {
  period: string; // 'YYYY-MM-DD'(일별) / 'YYYY-MM'(월별)
  ratio: number; // 0~100 (예측치)
}

function fmtDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 시즌 형태(shape) 가중치: 작년을 더 크게.
const SHAPE_LAST_W = 0.6;
const SHAPE_PREV_W = 0.4;
// 올해 수준(level) 배율은 과도하지 않게 제한. 최근 비교 윈도우 길이.
const LEVEL_LO = 0.4;
const LEVEL_HI = 2.5;
const LEVEL_WINDOW_DAILY = 30; // 최근 30일
const LEVEL_WINDOW_MONTHLY = 2; // 최근 2개월
// 형태 평활화: 삼각 가중 7일 이동평균(중심일 가중 최대 → 진짜 피크 날짜는 유지하고
// 하루짜리 스파이크만 깎음). 일별에만 적용.
const SMOOTH_HALF = 3;

// 한 해의 일별 포인트 → (MM-DD)→평활값 맵. 삼각 가중 이동평균.
function smoothedDailyMap(yearPts: TrendPoint[]): Map<string, number> {
  const sorted = [...yearPts].sort((a, b) => a.period.localeCompare(b.period));
  const m = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    let sw = 0;
    let wsum = 0;
    for (let off = -SMOOTH_HALF; off <= SMOOTH_HALF; off++) {
      const j = i + off;
      if (j < 0 || j >= sorted.length) continue;
      const w = SMOOTH_HALF + 1 - Math.abs(off); // 4,3,2,1 삼각 가중
      sw += sorted[j].ratio * w;
      wsum += w;
    }
    m.set(sorted[i].period.slice(5, 10), wsum ? sw / wsum : sorted[i].ratio);
  }
  return m;
}

function rawMap(yearPts: TrendPoint[], keyOf: (p: string) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of yearPts) m.set(keyOf(p.period), p.ratio);
  return m;
}

// 올해 '오늘 이후 ~ 12월 말'의 예측 일별/월별 시리즈.
// 방법(확정, '형태×수준 분리'):
//   ① 형태(shape) = 과거 2년의 같은 날짜 값을 가중평균(작년 0.6 + 재작년 0.4)한
//      '전형적 시즌 패턴'. 일별은 삼각 7일 이동평균으로 평활화해 하루짜리 스파이크 제거.
//   ② 수준(level) = 올해 현재까지 실측이 같은 시기 형태 대비 몇 배인지 → 배율.
//   ③ 예측 = clamp(형태 × 배율, 0, 100). 오늘 실측 수준과 자연스럽게 이어짐.
export function buildForecastSeries(series: TrendPoint[], now: Date = new Date()): ForecastPoint[] {
  if (series.length === 0) return [];
  const daily = series[0].period.length >= 10;
  const thisYear = now.getFullYear();
  const keyOf = (period: string) => (daily ? period.slice(5, 10) : period.slice(5, 7));

  // 연도별 (MM-DD / MM) → 지수 맵. 일별은 평활화, 월별은 원값.
  const lastPts = series.filter((p) => yearOf(p.period) === thisYear - 1);
  const prevPts = series.filter((p) => yearOf(p.period) === thisYear - 2);
  const lastMap = daily ? smoothedDailyMap(lastPts) : rawMap(lastPts, keyOf);
  const prevMap = daily ? smoothedDailyMap(prevPts) : rawMap(prevPts, keyOf);
  // 형태: 작년·재작년 가중평균(둘 중 하나만 있으면 그것).
  const shapeAt = (k: string): number | null => {
    const l = lastMap.get(k);
    const pv = prevMap.get(k);
    if (l != null && pv != null) return SHAPE_LAST_W * l + SHAPE_PREV_W * pv;
    if (l != null) return l;
    if (pv != null) return pv;
    return null;
  };

  // 수준 배율: 올해 최근 실측 합 / 같은 시기 형태 합.
  const thisYearActual = series
    .filter((p) => yearOf(p.period) === thisYear)
    .sort((a, b) => a.period.localeCompare(b.period));
  const window = thisYearActual.slice(daily ? -LEVEL_WINDOW_DAILY : -LEVEL_WINDOW_MONTHLY);
  let num = 0;
  let den = 0;
  for (const p of window) {
    const s = shapeAt(keyOf(p.period));
    if (s != null) {
      num += p.ratio;
      den += s;
    }
  }
  const factor = den > 0 ? clamp(num / den, LEVEL_LO, LEVEL_HI) : 1;

  // 미래 구간 생성.
  const today0 = startOfDay(now);
  const out: ForecastPoint[] = [];
  if (daily) {
    const end = new Date(thisYear, 11, 31);
    for (let t = today0.getTime() + DAY; t <= end.getTime(); t += DAY) {
      const d = new Date(t);
      const s = shapeAt(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      if (s == null) continue;
      out.push({ period: fmtDay(d), ratio: Math.round(clamp(s * factor, 0, 100)) });
    }
  } else {
    for (let m = now.getMonth() + 1; m <= 11; m++) {
      const s = shapeAt(String(m + 1).padStart(2, '0'));
      if (s == null) continue;
      out.push({ period: `${thisYear}-${String(m + 1).padStart(2, '0')}`, ratio: Math.round(clamp(s * factor, 0, 100)) });
    }
  }
  return out;
}

export interface YoyTrend {
  direction: 'up' | 'down' | 'flat';
  current: number; // 최신 월(집계) 지수
  lastYear: number | null; // 작년 동월 지수
  deltaPct: number | null; // 전년 동월 대비 증감률(%)
}

// 최신 월 vs 작년 동월 비교 (작년 대비 추세 ↑/↓/→). 일별은 월 평균으로 집계 후 비교.
export function computeYoyTrend(series: TrendPoint[]): YoyTrend {
  const monthly = monthlyAverages(series);
  if (monthly.length === 0) {
    return { direction: 'flat', current: 0, lastYear: null, deltaPct: null };
  }
  const latest = monthly[monthly.length - 1];
  const current = Math.round(latest.ratio);

  const ly = Number(latest.period.slice(0, 4)) - 1;
  const mm = latest.period.slice(5, 7);
  const lastYearPeriod = `${ly}-${mm}`;
  const lastYearPoint = monthly.find((p) => p.period === lastYearPeriod);

  if (!lastYearPoint || lastYearPoint.ratio === 0) {
    return { direction: 'flat', current, lastYear: lastYearPoint ? Math.round(lastYearPoint.ratio) : null, deltaPct: null };
  }
  const lastYear = Math.round(lastYearPoint.ratio);
  const deltaPct = Math.round(((current - lastYear) / lastYear) * 100);
  const direction = deltaPct > 5 ? 'up' : deltaPct < -5 ? 'down' : 'flat';
  return { direction, current, lastYear, deltaPct };
}

export interface GradeResult {
  grade: Grade;
  score: number; // 0~100
  intensity: number; // 검색지수강도 0~100
  seasonSignal: number; // 시즌신호 0~100
  peakProximity: number; // 피크 임박도 0~100
  yoyMomentum: number; // 전년 대비 상승세 0~100
}

export function gradeOf(score: number): Grade {
  if (score >= 80) return 'S';
  if (score >= 65) return 'A';
  if (score >= 50) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

// 1a 임시등급: 0.6 × 검색지수강도 + 0.4 × 시즌신호.
export function gradeFromTrend(series: TrendPoint[], now: Date = new Date()): GradeResult {
  const monthly = monthlyAverages(series);
  const ratios = monthly.map((p) => p.ratio);

  // 검색지수강도 = 최근 수준(최근 3개월 평균)과 전체 수준의 혼합.
  const recentLevel = avg(monthly.slice(-3).map((p) => p.ratio));
  const meanLevel = avg(ratios);
  const intensity = clamp(0.5 * recentLevel + 0.5 * meanLevel);

  // 시즌신호 = 피크 임박도(D-day) + 전년 대비 상승세.
  const fc = computePeakForecast(series, now);
  const peakProximity = fc.isInPeak ? 100 : clamp(100 - (fc.dday / 183) * 100);

  const yoy = computeYoyTrend(series);
  // +50% 이상이면 만점, -50% 이하면 0점, 데이터 없으면 중립 50.
  const yoyMomentum = yoy.deltaPct == null ? 50 : clamp(50 + yoy.deltaPct);

  const seasonSignal = clamp(0.5 * peakProximity + 0.5 * yoyMomentum);
  const score = Math.round(0.6 * intensity + 0.4 * seasonSignal);

  return {
    grade: gradeOf(score),
    score,
    intensity: Math.round(intensity),
    seasonSignal: Math.round(seasonSignal),
    peakProximity: Math.round(peakProximity),
    yoyMomentum: Math.round(yoyMomentum),
  };
}
