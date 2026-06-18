// 등급·시즌 피크 산식 (순수함수). 외부 의존 없음 → 단위 테스트 용이.
//
// 1a 임시등급(네이버 검색지수만): 점수 = 0.6 × 검색지수강도 + 0.4 × 시즌신호.
// 경쟁상품수가 들어오는 1b에서는 이 식이 폴백으로 재사용된다.

export interface TrendPoint {
  period: string; // 'YYYY-MM' (또는 'YYYY-MM-DD' — 앞 7자리만 사용)
  ratio: number; // 네이버 상대 검색지수 0~100
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export const MONTH_LABELS = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
];

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function monthIndexOf(period: string): number {
  return Number(period.slice(5, 7)) - 1; // 0~11
}

function sortByPeriod(series: TrendPoint[]): TrendPoint[] {
  return [...series].sort((a, b) => a.period.localeCompare(b.period));
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
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
  period: string;
  monthLabel: string;
  ratio: number;
}

export interface PeakForecast {
  peakMonthIndex: number; // 0~11
  peakMonthLabel: string;
  peakRatio: number; // 시즌 프로파일상 피크월 평균 지수
  dday: number; // 다음 피크월 1일까지 남은 일수 (0 = 이번 달이 피크)
  isInPeak: boolean;
  lastYearPeak: PeakInfo | null; // 최근 12개월 윈도우 최고점
  prevYearPeak: PeakInfo | null; // 그 이전 12개월 윈도우 최고점
}

function peakInfoOf(arr: TrendPoint[]): PeakInfo | null {
  if (arr.length === 0) return null;
  const top = arr.reduce((m, p) => (p.ratio > m.ratio ? p : m));
  return {
    period: top.period.slice(0, 7),
    monthLabel: MONTH_LABELS[monthIndexOf(top.period)],
    ratio: Math.round(top.ratio),
  };
}

// 예상 피크월·피크지수·D-day·작년/재작년 피크 비교.
export function computePeakForecast(series: TrendPoint[], now: Date = new Date()): PeakForecast {
  const profile = seasonalProfile(series);
  let peakMonthIndex = 0;
  for (let i = 1; i < 12; i++) {
    if (profile[i] > profile[peakMonthIndex]) peakMonthIndex = i;
  }
  const peakRatio = Math.round(profile[peakMonthIndex]);

  const curMonth = now.getMonth();
  const isInPeak = curMonth === peakMonthIndex;

  // 다음 피크월 1일까지의 D-day
  let year = now.getFullYear();
  if (peakMonthIndex < curMonth) year += 1; // 올해 피크월이 이미 지났으면 내년
  const nextPeak = new Date(year, peakMonthIndex, 1);
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dday = isInPeak
    ? 0
    : Math.max(0, Math.round((nextPeak.getTime() - today0.getTime()) / 86_400_000));

  const sorted = sortByPeriod(series);
  const lastYearPeak = peakInfoOf(sorted.slice(-12));
  const prevYearPeak = peakInfoOf(sorted.slice(-24, -12));

  return {
    peakMonthIndex,
    peakMonthLabel: MONTH_LABELS[peakMonthIndex],
    peakRatio,
    dday,
    isInPeak,
    lastYearPeak,
    prevYearPeak,
  };
}

export interface YoyTrend {
  direction: 'up' | 'down' | 'flat';
  current: number; // 최신 월 지수
  lastYear: number | null; // 작년 동월 지수
  deltaPct: number | null; // 전년 동월 대비 증감률(%)
}

// 최신 월 vs 작년 동월 비교 (작년 대비 추세 ↑/↓/→).
export function computeYoyTrend(series: TrendPoint[]): YoyTrend {
  const sorted = sortByPeriod(series);
  if (sorted.length === 0) {
    return { direction: 'flat', current: 0, lastYear: null, deltaPct: null };
  }
  const latest = sorted[sorted.length - 1];
  const current = Math.round(latest.ratio);

  // 작년 동월(YYYY-1 - MM) 찾기
  const ly = Number(latest.period.slice(0, 4)) - 1;
  const mm = latest.period.slice(5, 7);
  const lastYearPeriod = `${ly}-${mm}`;
  const lastYearPoint = sorted.find((p) => p.period.slice(0, 7) === lastYearPeriod);

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
  const sorted = sortByPeriod(series);
  const ratios = sorted.map((p) => p.ratio);

  // 검색지수강도 = 최근 수준(최근 3개월)과 전체 수준의 혼합.
  const recentLevel = avg(sorted.slice(-3).map((p) => p.ratio));
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
