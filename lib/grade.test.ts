// 등급·피크 산식 단위 테스트 (Node 내장 test runner).
// 실행: npm test  (tsx 로더로 TS 직접 실행)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForecastSeries,
  computeEntrySignal,
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
  // 예상 피크는 7월 중(평활화로 피크 주변이 평탄 → 정확 일자는 ±며칠 무의미).
  assert.ok(fc.forecastPeak.startsWith('2026-07'));
  assert.ok(fc.peakDateLabel.startsWith('7월'));
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

test('computePeakForecast: 형태×수준 예측 + 관측 모멘텀 보존', () => {
  const now = new Date(2026, 5, 19); // 2026-06-19
  const series = dailyWithPeaks(
    { date: '2024-09-01', ratio: 60 }, // 재작년 피크
    { date: '2025-09-11', ratio: 90 }, // 작년 피크
  );
  const fc = computePeakForecast(series, now);
  assert.equal(fc.basis, 'yoy');
  // 관측 모멘텀(재작년→작년)은 참고 정보로 보존.
  assert.equal(fc.yoyGrowthPct, 50); // (90/60 - 1)*100
  assert.equal(fc.peakShiftDays, 10); // 9/11 - 9/1
  // 예상 피크 = 예측 곡선(형태×수준, 평활화) 최고점. 9/11 형태(삼각평활):
  // 작년 0.6*30 + 재작년 0.4*10 = 22, 수준배율 1.
  assert.equal(fc.forecastPeak, '2026-09-11');
  assert.equal(fc.peakDateLabel, '9월 11일');
  assert.equal(fc.projectedPeakRatio, 22);
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
  // 작년 단독 형태(삼각평활): 9/11 단일 90 → 30.
  assert.equal(fc.projectedPeakRatio, 30);
});

test('computePeakForecast: 오늘이 피크면 D-day 0 (오늘 실측이 앞으로의 최고점)', () => {
  const now = new Date(2025, 6, 15); // 2025-07-15 = 그해 피크 당일(실측 100)
  const fc = computePeakForecast(dailySummerSeries(), now);
  assert.equal(fc.dday, 0);
  assert.equal(fc.isInPeak, true);
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

test('buildForecastSeries: 오늘 이후~연말, 0~100, 형태×수준 피크', () => {
  const now = new Date(2026, 5, 19); // 2026-06-19
  const fc = buildForecastSeries(dailyThreeYears(), now);
  assert.ok(fc.length > 0);
  assert.equal(fc[0].period, '2026-06-20'); // 오늘 다음날부터
  assert.equal(fc[fc.length - 1].period, '2026-12-31'); // 연말까지
  assert.ok(fc.every((p) => p.ratio >= 0 && p.ratio <= 100)); // 0~100
  // 8/15 형태(삼각평활): 작년 0.6*27.5 + 재작년 0.4*17.5 = 23.5 → 24. 피크 날짜 유지.
  const peak = fc.reduce((m, p) => (p.ratio > m.ratio ? p : m));
  assert.equal(peak.period.slice(5, 7), '08');
  assert.equal(peak.period, '2026-08-15');
  assert.equal(peak.ratio, 24);
});

test('buildForecastSeries: 데이터 없으면 빈 배열', () => {
  assert.deepEqual(buildForecastSeries([], new Date(2026, 5, 19)), []);
});

// 달력월 프로파일로 3개년 일별 시리즈 생성(2024-01-01 ~ now).
function dailyFromProfile(base: number[], end: Date): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let d = new Date(2024, 0, 1); d <= end; d.setDate(d.getDate() + 1)) {
    out.push({
      period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      ratio: base[d.getMonth()],
    });
  }
  return out;
}

test('computeEntrySignal: 초입 상승(현재~25, 피크 먼 미래) → prime + 진입마감=피크-10일', () => {
  const now = new Date(2026, 5, 19); // 6월 19일
  const base = [5, 5, 8, 12, 18, 25, 60, 100, 70, 30, 12, 6]; // 8월 피크, 6월≈25
  const series = dailyFromProfile(base, now);
  const forecast = computePeakForecast(series, now);
  const e = computeEntrySignal(series, forecast, now);
  assert.equal(e.status, 'prime');
  assert.equal(e.rising, true);
  assert.ok(e.daysToPeak >= 10);
  // 진입 마감 = 예상 피크 − 10일
  const peak = new Date(Number(forecast.forecastPeak.slice(0, 4)), Number(forecast.forecastPeak.slice(5, 7)) - 1, Number(forecast.forecastPeak.slice(8, 10)));
  const end = new Date(peak.getTime() - 10 * 86_400_000);
  const expected = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  assert.equal(e.entryTo, expected);
});

test('computeEntrySignal: 봄 과일을 여름에 보면 → declining(시즌 지남)', () => {
  const now = new Date(2026, 5, 19); // 6월 19일
  const base = [40, 70, 100, 60, 30, 12, 8, 8, 10, 15, 25, 35]; // 3월 피크
  const series = dailyFromProfile(base, now);
  const forecast = computePeakForecast(series, now);
  const e = computeEntrySignal(series, forecast, now);
  assert.equal(e.status, 'declining');
  assert.equal(e.entryFrom, null);
});

test('gradeFromTrend: 점수 0~100, 등급·산식 일관성', () => {
  const now = new Date(2026, 6, 10);
  const g = gradeFromTrend(dailySummerSeries(), now);
  assert.ok(g.score >= 0 && g.score <= 100);
  assert.equal(g.grade, gradeOf(g.score));
  assert.equal(g.score, Math.round(0.6 * g.intensity + 0.4 * g.seasonSignal));
});
