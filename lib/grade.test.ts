// 등급·피크 산식 단위 테스트 (Node 내장 test runner).
// 실행: npm test  (tsx 로더로 TS 직접 실행)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForecastSeries,
  computePeakForecast,
  computeYoyTrend,
  gradeFromTrend,
  gradeOf,
  monthlyAverages,
  seasonalProfile,
  type TrendPoint,
} from './grade';

// 여름(7월) 피크 일별 시리즈 생성. 2024-07-01 ~ 2026-06-30.
// 각 해 7월 15일을 단일 최고점(100)으로 강제.
function dailySummerSeries(): TrendPoint[] {
  const base = [8, 8, 12, 25, 60, 90, 90, 85, 35, 12, 8, 6]; // 1~12월(7월=90)
  const out: TrendPoint[] = [];
  const start = new Date(2024, 6, 1);
  const end = new Date(2026, 5, 30);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const m = d.getMonth();
    const day = d.getDate();
    const ratio = m === 6 && day === 15 ? 100 : base[m];
    const period = `${d.getFullYear()}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    out.push({ period, ratio });
  }
  return out;
}

test('gradeOf 임계값 경계', () => {
  assert.equal(gradeOf(80), 'S');
  assert.equal(gradeOf(79), 'A');
  assert.equal(gradeOf(65), 'A');
  assert.equal(gradeOf(50), 'B');
  assert.equal(gradeOf(35), 'C');
  assert.equal(gradeOf(34), 'D');
});

test('monthlyAverages: 일별 → 월별 집계', () => {
  const monthly = monthlyAverages([
    { period: '2025-06-10', ratio: 40 },
    { period: '2025-06-20', ratio: 60 },
    { period: '2025-07-01', ratio: 100 },
  ]);
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].period, '2025-06');
  assert.equal(monthly[0].ratio, 50);
});

test('seasonalProfile 은 달력월 평균을 돌려준다 (7월 최대)', () => {
  const profile = seasonalProfile(dailySummerSeries());
  assert.equal(profile.length, 12);
  assert.equal(profile.indexOf(Math.max(...profile)), 6);
});

test('computePeakForecast: 7월 피크 + 예상 피크 일자/D-day (일별)', () => {
  const now = new Date(2026, 5, 19); // 6월 19일 → 7월 피크는 미래
  const fc = computePeakForecast(dailySummerSeries(), now);
  assert.equal(fc.peakMonthIndex, 6);
  assert.equal(fc.peakMonthLabel, '7월');
  assert.equal(fc.isInPeak, false);
  // 가장 최근 해 피크일(2025-07-15)을 올해로 투영 → 2026-07-15
  assert.equal(fc.forecastPeak, '2026-07-15');
  assert.equal(fc.peakDateLabel, '7월 15일');
  assert.ok(fc.dday > 0 && fc.dday < 60);
  assert.ok(fc.lastYearPeak && fc.lastYearPeak.period === '2025-07-15');
  assert.ok(fc.prevYearPeak && fc.prevYearPeak.monthLabel === '7월');
});

// 저베이스(10) 위에 두 해의 피크일만 지정해 모멘텀(지수 성장·시점 이동)을 검증.
function dailyWithPeaks(
  prevPeak: { date: string; ratio: number },
  lastPeak: { date: string; ratio: number },
): TrendPoint[] {
  const out: TrendPoint[] = [];
  const start = new Date(2024, 5, 19); // 2024-06-19
  const end = new Date(2026, 5, 19); // 2026-06-19
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let ratio = 10;
    if (period === prevPeak.date) ratio = prevPeak.ratio;
    if (period === lastPeak.date) ratio = lastPeak.ratio;
    out.push({ period, ratio });
  }
  return out;
}

test('computePeakForecast: 재작년→작년 모멘텀으로 올해 지수·시점 투영', () => {
  const now = new Date(2026, 5, 19); // 2026-06-19
  const series = dailyWithPeaks(
    { date: '2024-09-01', ratio: 60 }, // 재작년 피크
    { date: '2025-09-11', ratio: 90 }, // 작년 피크(+50%, 10일 늦어짐)
  );
  const fc = computePeakForecast(series, now);
  assert.equal(fc.basis, 'yoy');
  assert.equal(fc.yoyGrowthPct, 50); // (90/60 - 1)*100 (관측값, 캡 없음)
  assert.equal(fc.projectedPeakRatio, 100); // 90 * 1.5 = 135 → 100 상한
  assert.equal(fc.peakShiftDays, 10); // 9/11 - 9/1
  // 작년 피크(9/11)에 시점 모멘텀(+10일) 반영 → 올해 9/21 예상
  assert.equal(fc.forecastPeak, '2026-09-21');
  assert.equal(fc.peakDateLabel, '9월 21일');
});

test('computePeakForecast: 시점 이동은 ±21일로 제한', () => {
  const now = new Date(2026, 5, 19);
  const series = dailyWithPeaks(
    { date: '2024-09-01', ratio: 50 },
    { date: '2025-11-01', ratio: 70 }, // 61일 늦어짐 → 21일로 클램프
  );
  const fc = computePeakForecast(series, now);
  assert.equal(fc.peakShiftDays, 21);
});

test('computePeakForecast: 1년치만 있으면 basis=lastyear, 모멘텀 없음', () => {
  const now = new Date(2026, 5, 19);
  const series = dailyWithPeaks(
    { date: '2024-01-01', ratio: 10 }, // 재작년 윈도우 밖(피크 없음 처리용 더미)
    { date: '2025-09-11', ratio: 90 },
  ).filter((p) => p.period >= '2025-06-19'); // 작년치만 남김
  const fc = computePeakForecast(series, now);
  assert.equal(fc.basis, 'lastyear');
  assert.equal(fc.yoyGrowthPct, null);
  assert.equal(fc.peakShiftDays, null);
  assert.equal(fc.projectedPeakRatio, 90);
});

test('computePeakForecast: 피크 당일이면 D-day 0', () => {
  const now = new Date(2026, 6, 15); // 7월 15일
  const fc = computePeakForecast(dailySummerSeries(), now);
  assert.equal(fc.isInPeak, true);
  assert.equal(fc.dday, 0);
});

test('computeYoyTrend: 동월 평균 상승 감지 (일별 집계)', () => {
  const yoy = computeYoyTrend([
    { period: '2025-06-10', ratio: 40 },
    { period: '2025-06-20', ratio: 60 }, // 2025-06 avg 50
    { period: '2026-06-10', ratio: 70 },
    { period: '2026-06-20', ratio: 90 }, // 2026-06 avg 80
  ]);
  assert.equal(yoy.direction, 'up');
  assert.equal(yoy.current, 80);
  assert.equal(yoy.lastYear, 50);
  assert.equal(yoy.deltaPct, 60);
});

test('computeYoyTrend: 작년 동월 없으면 flat/null', () => {
  const yoy = computeYoyTrend([{ period: '2026-06-10', ratio: 80 }]);
  assert.equal(yoy.direction, 'flat');
  assert.equal(yoy.deltaPct, null);
});

// 2024-01-01 ~ 2026-06-19, 베이스 10 + 해마다 8/15 피크(2024=40, 2025=80).
function dailyThreeYears(): TrendPoint[] {
  const out: TrendPoint[] = [];
  const start = new Date(2024, 0, 1);
  const end = new Date(2026, 5, 19);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let ratio = 10;
    if (md === '08-15') ratio = y === 2024 ? 40 : y === 2025 ? 80 : 10;
    out.push({ period: `${y}-${md}`, ratio });
  }
  return out;
}

test('buildForecastSeries: 오늘 이후~연말, 0~100, 작년 모멘텀 반영 피크', () => {
  const now = new Date(2026, 5, 19); // 2026-06-19
  const fc = buildForecastSeries(dailyThreeYears(), now);
  assert.ok(fc.length > 0);
  assert.equal(fc[0].period, '2026-06-20'); // 오늘 다음날부터
  assert.equal(fc[fc.length - 1].period, '2026-12-31'); // 연말까지
  assert.ok(fc.every((p) => p.ratio >= 0 && p.ratio <= 100)); // 100 상한
  // 작년(80)을 재작년 대비 성장(×2, 클램프)으로 보정 → 8/15 부근 100으로 피크.
  const peak = fc.reduce((m, p) => (p.ratio > m.ratio ? p : m));
  assert.equal(peak.period.slice(5, 7), '08');
  assert.equal(peak.ratio, 100);
});

test('buildForecastSeries: 데이터 없으면 빈 배열', () => {
  assert.deepEqual(buildForecastSeries([], new Date(2026, 5, 19)), []);
});

test('gradeFromTrend: 점수 0~100, 등급·산식 일관성', () => {
  const now = new Date(2026, 6, 10);
  const g = gradeFromTrend(dailySummerSeries(), now);
  assert.ok(g.score >= 0 && g.score <= 100);
  assert.equal(g.grade, gradeOf(g.score));
  assert.equal(g.score, Math.round(0.6 * g.intensity + 0.4 * g.seasonSignal));
});
