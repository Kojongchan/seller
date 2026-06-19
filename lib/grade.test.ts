// 등급·피크 산식 단위 테스트 (Node 내장 test runner).
// 실행: npm test  (tsx 로더로 TS 직접 실행)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
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

test('gradeFromTrend: 점수 0~100, 등급·산식 일관성', () => {
  const now = new Date(2026, 6, 10);
  const g = gradeFromTrend(dailySummerSeries(), now);
  assert.ok(g.score >= 0 && g.score <= 100);
  assert.equal(g.grade, gradeOf(g.score));
  assert.equal(g.score, Math.round(0.6 * g.intensity + 0.4 * g.seasonSignal));
});
