// 등급·피크 산식 단위 테스트 (Node 내장 test runner).
// 실행: npm test  (tsx 로더로 TS 직접 실행)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePeakForecast,
  computeYoyTrend,
  gradeFromTrend,
  gradeOf,
  seasonalProfile,
  type TrendPoint,
} from './grade';

// 6월(여름)에 피크가 있는 24개월 시리즈 (수박형). 2024-07 ~ 2026-06.
function summerSeries(): TrendPoint[] {
  const calendar = [8, 8, 12, 25, 60, 92, 100, 85, 35, 12, 8, 6]; // 1~12월
  const out: TrendPoint[] = [];
  for (let i = 0; i < 24; i++) {
    const year = 2024 + Math.floor((6 + i) / 12);
    const month = ((6 + i) % 12) + 1; // 2024-07 시작
    out.push({ period: `${year}-${String(month).padStart(2, '0')}`, ratio: calendar[month - 1] });
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

test('seasonalProfile 은 달력월 평균을 돌려준다', () => {
  const profile = seasonalProfile(summerSeries());
  assert.equal(profile.length, 12);
  // 7월(index 6)이 최댓값
  const maxIdx = profile.indexOf(Math.max(...profile));
  assert.equal(maxIdx, 6);
});

test('computePeakForecast: 7월 피크 + D-day 계산', () => {
  const now = new Date(2026, 2, 15); // 3월 15일 → 피크(7월)는 미래
  const fc = computePeakForecast(summerSeries(), now);
  assert.equal(fc.peakMonthIndex, 6);
  assert.equal(fc.peakMonthLabel, '7월');
  assert.equal(fc.isInPeak, false);
  assert.ok(fc.dday > 0 && fc.dday < 366);
  assert.ok(fc.lastYearPeak && fc.lastYearPeak.monthLabel === '7월');
});

test('computePeakForecast: 피크월이면 D-day 0 + isInPeak', () => {
  const now = new Date(2026, 6, 10); // 7월
  const fc = computePeakForecast(summerSeries(), now);
  assert.equal(fc.isInPeak, true);
  assert.equal(fc.dday, 0);
});

test('computeYoyTrend: 동월 상승 감지', () => {
  const series: TrendPoint[] = [
    { period: '2025-06', ratio: 50 },
    { period: '2026-06', ratio: 80 },
  ];
  const yoy = computeYoyTrend(series);
  assert.equal(yoy.direction, 'up');
  assert.equal(yoy.current, 80);
  assert.equal(yoy.lastYear, 50);
  assert.equal(yoy.deltaPct, 60);
});

test('computeYoyTrend: 작년 동월 없으면 flat/null', () => {
  const yoy = computeYoyTrend([{ period: '2026-06', ratio: 80 }]);
  assert.equal(yoy.direction, 'flat');
  assert.equal(yoy.deltaPct, null);
});

test('gradeFromTrend: 점수 0~100, 등급 일관성', () => {
  const now = new Date(2026, 6, 10);
  const g = gradeFromTrend(summerSeries(), now);
  assert.ok(g.score >= 0 && g.score <= 100);
  assert.equal(g.grade, gradeOf(g.score));
  assert.equal(g.score, Math.round(0.6 * g.intensity + 0.4 * g.seasonSignal));
});
