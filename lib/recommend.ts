// 메인 '이번 달 밀어야 할 과일 TOP N' 추천 — 네이버 실데이터 기반.
// 각 과일의 3개년 트렌드를 받아(6시간 캐시) '현재 검색지수'(자기 시즌 대비 현재 수준)로
// 정렬한다. 자기 시즌 정점에 가까운 과일일수록 위로 → "이번 달 밀어야 할" 신호.
// 키 없음/전부 실패 시 샘플(이번 달 지수)로 폴백.

import { FRUITS, recommendForMonth, type Fruit } from './fruits';
import { fetchSearchTrend, hasNaverKeys } from './naver';
import { computePeakForecast, computeYoyTrend, gradeFromTrend, type Grade, type TrendPoint } from './grade';

export interface Rec {
  id: string;
  name: string;
  emoji: string;
  index: number; // 현재 검색지수(0~100)
  grade: Grade | null;
  dday: number | null; // 예상 피크까지 남은 일수
  source: 'naver' | 'sample';
}

export interface RecResult {
  source: 'naver' | 'sample';
  items: Rec[];
}

async function evalFruit(f: Fruit, now: Date): Promise<Rec | null> {
  try {
    const trend = await fetchSearchTrend(f.name);
    if (!trend || trend.length === 0) return null;
    const real: TrendPoint[] = trend.map((t) => ({ period: t.period, ratio: t.ratio }));
    const yoy = computeYoyTrend(real);
    const grade = gradeFromTrend(real, now);
    const fc = computePeakForecast(real, now);
    return {
      id: f.id,
      name: f.name,
      emoji: f.emoji,
      index: yoy.current,
      grade: grade.grade,
      dday: fc.dday,
      source: 'naver',
    };
  } catch {
    return null;
  }
}

export async function getRecommendations(now: Date = new Date(), limit = 3): Promise<RecResult> {
  if (hasNaverKeys()) {
    const results = await Promise.all(FRUITS.map((f) => evalFruit(f, now)));
    const ok = results.filter((r): r is Rec => r !== null);
    if (ok.length > 0) {
      ok.sort((a, b) => b.index - a.index);
      return { source: 'naver', items: ok.slice(0, limit) };
    }
  }
  // 폴백: 샘플(이번 달 지수)
  const items: Rec[] = recommendForMonth(now.getMonth(), limit).map((r) => ({
    id: r.fruit.id,
    name: r.fruit.name,
    emoji: r.fruit.emoji,
    index: r.score,
    grade: null,
    dday: null,
    source: 'sample',
  }));
  return { source: 'sample', items };
}
