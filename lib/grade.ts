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

// 'YYYY-MM' → 그 달 1일, 'YYYY-MM-DD' → 해당 일자.
function periodToDate(period: string): Date {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1;
  const d = period.length >= 10 ? Number(period.slice(8, 10)) : 1;
  return new Date(y, m, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sortByPeriod(series: TrendPoint[]): TrendPoint[] {
  return [...series].sort((a, b) => a.period.localeCompare(b.period));
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

// 날짜 윈도우로 [from, to) 구간의 포인트만 추출.
function windowOf(series: TrendPoint[], from: Date, to: Date): TrendPoint[] {
  return series.filter((p) => {
    const d = periodToDate(p.period);
    return d >= from && d < to;
  });
}

export interface PeakForecast {
  peakMonthIndex: number; // 0~11
  peakMonthLabel: string;
  peakRatio: number; // 시즌 프로파일상 피크월 평균 지수
  peakDateLabel: string; // 예상 피크 '월·일' (예: '9월 14일') — 일별 데이터 기반
  forecastPeak: string; // 예상 피크 일자 'YYYY-MM-DD'
  dday: number; // 예상 피크 일자까지 남은 일수 (0 = 오늘이 피크, 음수 없음)
  isInPeak: boolean; // 이번 달이 시즌 피크월인지
  lastYearPeak: PeakInfo | null; // 최근 12개월 윈도우 최고점(일자)
  prevYearPeak: PeakInfo | null; // 그 이전 12개월 윈도우 최고점(일자)
}

// 예상 피크월·피크지수·피크 일자·D-day·작년/재작년 피크 비교.
export function computePeakForecast(series: TrendPoint[], now: Date = new Date()): PeakForecast {
  const profile = seasonalProfile(series);
  let peakMonthIndex = 0;
  for (let i = 1; i < 12; i++) {
    if (profile[i] > profile[peakMonthIndex]) peakMonthIndex = i;
  }
  const peakRatio = Math.round(profile[peakMonthIndex]);

  const today0 = startOfDay(now);
  const oneYearAgo = new Date(today0.getTime() - 365 * DAY);
  const twoYearsAgo = new Date(today0.getTime() - 730 * DAY);
  const lastYearPeak = peakInfoOf(windowOf(series, oneYearAgo, new Date(today0.getTime() + DAY)));
  const prevYearPeak = peakInfoOf(windowOf(series, twoYearsAgo, oneYearAgo));

  // 예상 피크 일자: 가장 최근 연도의 피크 '월·일'을 올해/내년으로 투영.
  const basePeak = lastYearPeak ?? prevYearPeak;
  let peakMonth = peakMonthIndex;
  let peakDay = 1;
  if (basePeak) {
    peakMonth = monthIndexOf(basePeak.period);
    peakDay = basePeak.period.length >= 10 ? Number(basePeak.period.slice(8, 10)) : 1;
  }
  let forecast = new Date(now.getFullYear(), peakMonth, peakDay);
  if (startOfDay(forecast) < today0) {
    forecast = new Date(now.getFullYear() + 1, peakMonth, peakDay);
  }
  const dday = Math.max(0, Math.round((startOfDay(forecast).getTime() - today0.getTime()) / DAY));
  const isInPeak = now.getMonth() === peakMonthIndex;

  const fy = forecast.getFullYear();
  const fm = String(forecast.getMonth() + 1).padStart(2, '0');
  const fd = String(forecast.getDate()).padStart(2, '0');

  return {
    peakMonthIndex,
    peakMonthLabel: MONTH_LABELS[peakMonthIndex],
    peakRatio,
    peakDateLabel: `${MONTH_LABELS[peakMonth]} ${peakDay}일`,
    forecastPeak: `${fy}-${fm}-${fd}`,
    dday,
    isInPeak,
    lastYearPeak,
    prevYearPeak,
  };
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
