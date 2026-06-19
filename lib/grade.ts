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
  projectedPeakRatio: number | null; // 올해 예상 피크 지수 (모멘텀 투영)
  peakShiftDays: number | null; // 피크 시점 변화(작년-재작년, 일). 양수=늦어짐
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
// 핵심: '작년 그대로'가 아니라 재작년→작년의 실제 변화(지수 성장·피크 시점 이동)를
//       올해로 한 번 더 투영해 예상치를 만든다.
export function computePeakForecast(series: TrendPoint[], now: Date = new Date()): PeakForecast {
  const profile = seasonalProfile(series);
  let peakMonthIndex = 0;
  for (let i = 1; i < 12; i++) {
    if (profile[i] > profile[peakMonthIndex]) peakMonthIndex = i;
  }
  const peakRatio = Math.round(profile[peakMonthIndex]);

  const today0 = startOfDay(now);
  // 작년/재작년 = 달력연도(1~12월) 기준. 차트의 연도 밴드와 일치시킨다.
  const thisYear = now.getFullYear();
  const lastYearPeak = peakInfoOf(series.filter((p) => yearOf(p.period) === thisYear - 1));
  const prevYearPeak = peakInfoOf(series.filter((p) => yearOf(p.period) === thisYear - 2));

  // 1) 예측 근거 판정
  const hasBoth = Boolean(lastYearPeak && prevYearPeak);
  const basis: ForecastBasis = hasBoth ? 'yoy' : lastYearPeak ? 'lastyear' : 'profile';

  // 2) 지수 모멘텀: 재작년 대비 작년 피크 변화율 → 올해 예상 피크 지수.
  let yoyGrowthPct: number | null = null;
  let projectedPeakRatio: number | null = lastYearPeak ? lastYearPeak.ratio : null;
  if (hasBoth && prevYearPeak!.ratio >= MIN_PREV_PEAK) {
    const growth = lastYearPeak!.ratio / prevYearPeak!.ratio;
    yoyGrowthPct = Math.round((growth - 1) * 100);
    // 같은 비율로 올해를 한 번 더 투영. 검색지수는 0~100 정규화 값이므로 상한 100.
    // (관측 성장률 yoyGrowthPct는 캡과 무관하게 그대로 보존.)
    projectedPeakRatio = Math.round(clamp(lastYearPeak!.ratio * growth, 0, 100));
  }

  // 3) 시점 모멘텀: 작년 피크가 재작년보다 얼마나 빨라/늦어졌는지 → 올해 반영.
  let peakShiftDays: number | null = null;
  if (hasBoth) {
    const raw = dayOfYearOf(lastYearPeak!.period) - dayOfYearOf(prevYearPeak!.period);
    peakShiftDays = Math.max(-MAX_SHIFT_DAYS, Math.min(MAX_SHIFT_DAYS, raw));
  }

  // 4) 예상 피크 일자: 작년 피크 '월·일'을 기준으로 시점 모멘텀만큼 이동해 올해/내년에 투영.
  const basePeak = lastYearPeak ?? prevYearPeak;
  let peakMonth = peakMonthIndex;
  let peakDay = 1;
  if (basePeak) {
    peakMonth = monthIndexOf(basePeak.period);
    peakDay = basePeak.period.length >= 10 ? Number(basePeak.period.slice(8, 10)) : 1;
  }
  // 날짜 오버플로는 JS Date가 정규화(예: 9월 35일 → 10월 5일).
  let forecast = new Date(now.getFullYear(), peakMonth, peakDay + (peakShiftDays ?? 0));
  if (startOfDay(forecast) < today0) {
    forecast = new Date(now.getFullYear() + 1, peakMonth, peakDay + (peakShiftDays ?? 0));
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
    peakDateLabel: `${MONTH_LABELS[forecast.getMonth()]} ${forecast.getDate()}일`,
    forecastPeak: `${fy}-${fm}-${fd}`,
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

// 성장률은 노이즈(아주 작은 재작년 피크)로 과도해지지 않게 0.5~2.0배로 제한.
const GROWTH_LO = 0.5;
const GROWTH_HI = 2.0;
// 이음새 보정 기간(일): 오늘 실측값에 맞춘 뒤 이 기간에 걸쳐 순수 모멘텀으로 수렴.
const ANCHOR_DAYS = 30;

// 올해 '오늘 이후 ~ 12월 말'의 예측 일별/월별 시리즈.
// 방법(확정): 작년 같은 시기 곡선을 (재작년 대비 작년 피크) 성장률로 보정 + 피크 시점
//   이동(±21일) 반영 → 최대 100 클램프. 단, 오늘 실측값과 자연스럽게 이어지도록
//   이음새(약 30일)는 실측 최근 수준에 맞춰 보정 후 순수 모멘텀으로 수렴시킨다.
export function buildForecastSeries(series: TrendPoint[], now: Date = new Date()): ForecastPoint[] {
  if (series.length === 0) return [];
  const daily = series[0].period.length >= 10;
  const thisYear = now.getFullYear();
  const lastNum = thisYear - 1;
  const prevNum = thisYear - 2;

  const lastPeak = peakInfoOf(series.filter((p) => yearOf(p.period) === lastNum));
  const prevPeak = peakInfoOf(series.filter((p) => yearOf(p.period) === prevNum));

  // 재작년→작년 피크 성장률(보정 배율).
  let growth = 1;
  if (lastPeak && prevPeak && prevPeak.ratio >= MIN_PREV_PEAK) {
    growth = clamp(lastPeak.ratio / prevPeak.ratio, GROWTH_LO, GROWTH_HI);
  }
  // 피크 시점 이동(일별만).
  let shift = 0;
  if (daily && lastPeak && prevPeak) {
    const raw = dayOfYearOf(lastPeak.period) - dayOfYearOf(prevPeak.period);
    shift = Math.max(-MAX_SHIFT_DAYS, Math.min(MAX_SHIFT_DAYS, raw));
  }

  // 보정 기준 곡선: 작년(없으면 재작년) 값을 'MM-DD'/'MM' 키로 조회.
  const key = (period: string) => (daily ? period.slice(5, 10) : period.slice(5, 7));
  const lastMap = new Map<string, number>();
  const prevMap = new Map<string, number>();
  for (const p of series) {
    const y = yearOf(p.period);
    if (y === lastNum) lastMap.set(key(p.period), p.ratio);
    else if (y === prevNum) prevMap.set(key(p.period), p.ratio);
  }
  const lookup = (k: string): number | undefined => lastMap.get(k) ?? prevMap.get(k);

  const today0 = startOfDay(now);
  const recentReal = avg(sortByPeriod(series).slice(daily ? -7 : -1).map((p) => p.ratio));

  // 1) 미래 구간의 원시 예측(성장률·시점이동만 반영).
  const raw: ForecastPoint[] = [];
  if (daily) {
    const end = new Date(thisYear, 11, 31);
    for (let t = today0.getTime() + DAY; t <= end.getTime(); t += DAY) {
      const d = new Date(t);
      const src = new Date(t - shift * DAY); // 시점 이동: 작년의 (오늘-이동)일 값을 가져옴
      const base = lookup(`${String(src.getMonth() + 1).padStart(2, '0')}-${String(src.getDate()).padStart(2, '0')}`);
      if (base == null) continue;
      raw.push({ period: fmtDay(d), ratio: base * growth });
    }
  } else {
    for (let m = now.getMonth() + 1; m <= 11; m++) {
      const base = lookup(String(m + 1).padStart(2, '0'));
      if (base == null) continue;
      raw.push({ period: `${thisYear}-${String(m + 1).padStart(2, '0')}`, ratio: base * growth });
    }
  }
  if (raw.length === 0) return [];

  // 2) 이음새 보정(일별만): 첫 예측점을 오늘 실측 수준에 맞추고 ANCHOR_DAYS에 걸쳐
  //    1배로 수렴. 월별(샘플 데모)은 보정 없이 순수 모멘텀(피크가 첫 달이어도 안 눌림).
  const anchor = daily && raw[0].ratio > 0 ? recentReal / raw[0].ratio : 1;
  const span = daily ? ANCHOR_DAYS : 1;
  return raw.map((p, i) => {
    const f = 1 + (anchor - 1) * Math.max(0, 1 - i / span);
    return { period: p.period, ratio: Math.round(clamp(p.ratio * f, 0, 100)) };
  });
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
