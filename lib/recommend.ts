// 메인 추천 — 네이버 실데이터(키 없으면 샘플) 기반.
//  · push: '이번 달 밀어야 할' = 지금 자기 시즌 정점에 가까운(현재 검색지수 높은) 순.
//  · prep: '준비해야 할'     = 곧 진입 구간(초입)에 드는 과일 = 진입 D-day 가까운 순.

import { FRUITS, type Fruit } from './fruits';
import { fetchSearchTrend, hasNaverKeys } from './naver';
import {
  computeEntrySignal,
  computePeakForecast,
  computeYoyTrend,
  gradeFromTrend,
  type EntryStatus,
  type Grade,
  type TrendPoint,
} from './grade';

export interface Rec {
  id: string;
  name: string;
  emoji: string;
  index: number; // 현재 검색지수(0~100)
  grade: Grade | null;
  status: EntryStatus | null; // 진입 상태
  entryDday: number | null; // 진입 구간까지 남은 일수
  peakMonthLabel: string | null;
  source: 'naver' | 'sample';
}

export interface RecResult {
  source: 'naver' | 'sample';
  push: Rec[]; // 이번 달 밀어야 할
  prep: Rec[]; // 준비해야 할
}

const PREP_MAX_DDAY = 120; // 진입까지 이 정도 이내면 '준비' 대상

function evalSeries(f: Fruit, real: TrendPoint[], now: Date, source: 'naver' | 'sample'): Rec {
  const yoy = computeYoyTrend(real);
  const grade = gradeFromTrend(real, now);
  const fc = computePeakForecast(real, now);
  const entry = computeEntrySignal(real, fc, now);
  return {
    id: f.id,
    name: f.name,
    emoji: f.emoji,
    index: yoy.current,
    grade: grade.grade,
    status: entry.status,
    entryDday: entry.entryDday,
    peakMonthLabel: fc.peakMonthLabel,
    source,
  };
}

async function evalFruitReal(f: Fruit, now: Date): Promise<Rec | null> {
  try {
    const trend = await fetchSearchTrend(f.name);
    if (!trend || trend.length === 0) return null;
    return evalSeries(f, trend.map((t) => ({ period: t.period, ratio: t.ratio })), now, 'naver');
  } catch {
    return null;
  }
}

// 16종 3개년 월별 샘플 시리즈(폴백용).
function sampleSeries(f: Fruit, now: Date): TrendPoint[] {
  const thisYear = now.getFullYear();
  const out: TrendPoint[] = [];
  for (let y = thisYear - 2; y <= thisYear; y++) {
    const lastMonth = y < thisYear ? 11 : now.getMonth();
    for (let m = 0; m <= lastMonth; m++) {
      out.push({ period: `${y}-${String(m + 1).padStart(2, '0')}`, ratio: f.sample[m] });
    }
  }
  return out;
}

export async function getRecommendations(now: Date = new Date(), pushN = 3, prepN = 4): Promise<RecResult> {
  let recs: Rec[] = [];
  let source: 'naver' | 'sample' = 'sample';

  if (hasNaverKeys()) {
    const results = await Promise.all(FRUITS.map((f) => evalFruitReal(f, now)));
    const ok = results.filter((r): r is Rec => r !== null);
    if (ok.length > 0) {
      recs = ok;
      source = 'naver';
    }
  }
  if (recs.length === 0) {
    recs = FRUITS.map((f) => evalSeries(f, sampleSeries(f, now), now, 'sample'));
    source = 'sample';
  }

  const push = [...recs].sort((a, b) => b.index - a.index).slice(0, pushN);
  const pushIds = new Set(push.map((r) => r.id));
  // 준비 = push 제외 + 아직 시즌 전이지만 진입 구간이 곧 시작(entryDday 가까움).
  const prep = recs
    .filter(
      (r) =>
        !pushIds.has(r.id) &&
        r.status !== 'peak' &&
        r.status !== 'declining' &&
        r.status !== 'soon' &&
        r.entryDday != null &&
        r.entryDday > 0 &&
        r.entryDday <= PREP_MAX_DDAY,
    )
    .sort((a, b) => (a.entryDday ?? 0) - (b.entryDday ?? 0))
    .slice(0, prepN);

  return { source, push, prep };
}
