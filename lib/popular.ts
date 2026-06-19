// 메인 인기검색어 TOP + 황금키워드.
//
//  · ranks  : 과일 카테고리 인기검색어 TOP (메인 화면 노출용)
//  · golden : 상위 인기검색어에서 뽑은 황금키워드(롱테일·연관 품종)
//
// 데이터 소스 우선순위(3단):
//   1) datalab  — 라이브 크롤(egress 허용 환경: 프로덕션 Vercel 등)
//   2) snapshot — data/popular.json (egress 막힌 곳에서 사용자가 PC에서 뽑아 넣은 실데이터)
//   3) sample   — 통념 샘플(최후 폴백)
// 어떤 환경(egress 차단 샌드박스 포함)에서도 화면은 항상 동작한다.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchCategoryKeywordRank, type RankedKeyword } from './datalab';
import { pickGoldenKeywords, type GoldenKeyword } from './golden';

export type PopularSource = 'datalab' | 'snapshot' | 'sample';

export interface GoldenPick extends GoldenKeyword {
  parent: string; // 어떤 인기검색어(메인)에서 파생됐는지
}

export interface PopularInsights {
  source: PopularSource;
  asOf: string | null; // 스냅샷 기준일(있으면)
  ranks: RankedKeyword[];
  golden: GoldenPick[];
}

// 사용자가 PC에서 뽑아 넣는 스냅샷(C안). related 는 선택.
export interface PopularSnapshot {
  asOf: string | null;
  ranks: RankedKeyword[];
  related: Record<string, RankedKeyword[]> | null;
}

// 스냅샷 JSON 파일 경로(레포 루트 기준). 없으면 무시(→ 샘플).
const SNAPSHOT_PATH = 'data/popular.json';

// 과일 카테고리 인기검색어 샘플(6월 기준 통념) — 크롤 실패/차단 시 폴백.
const SAMPLE_RANKS: RankedKeyword[] = [
  { rank: 1, keyword: '수박' },
  { rank: 2, keyword: '참외' },
  { rank: 3, keyword: '복숭아' },
  { rank: 4, keyword: '샤인머스캣' },
  { rank: 5, keyword: '자두' },
  { rank: 6, keyword: '체리' },
  { rank: 7, keyword: '망고' },
  { rank: 8, keyword: '블루베리' },
  { rank: 9, keyword: '멜론' },
  { rank: 10, keyword: '토마토' },
  { rank: 11, keyword: '사과' },
  { rank: 12, keyword: '바나나' },
  { rank: 13, keyword: '아보카도' },
  { rank: 14, keyword: '포도' },
  { rank: 15, keyword: '키위' },
  { rank: 16, keyword: '오렌지' },
  { rank: 17, keyword: '레몬' },
  { rank: 18, keyword: '한라봉' },
  { rank: 19, keyword: '무화과' },
  { rank: 20, keyword: '두리안' },
];

// 메인 키워드별 연관 인기검색어 샘플(황금키워드 엔진 데모/폴백용).
// 실데이터 환경에서는 서브카테고리 cid 크롤로 대체 예정(후속).
const SAMPLE_RELATED: Record<string, RankedKeyword[]> = {
  수박: [
    { rank: 1, keyword: '수박' },
    { rank: 2, keyword: '꿀수박' },
    { rank: 3, keyword: '씨없는수박' },
    { rank: 4, keyword: '수박 5kg' },
    { rank: 5, keyword: '복수박' },
    { rank: 6, keyword: '애플수박' },
    { rank: 7, keyword: '망고' },
  ],
  참외: [
    { rank: 1, keyword: '참외' },
    { rank: 2, keyword: '성주참외' },
    { rank: 3, keyword: '꿀참외' },
    { rank: 4, keyword: '참외 5kg' },
    { rank: 5, keyword: '햇참외' },
    { rank: 6, keyword: '백참외' },
  ],
  복숭아: [
    { rank: 1, keyword: '복숭아' },
    { rank: 2, keyword: '백도복숭아' },
    { rank: 3, keyword: '황도복숭아' },
    { rank: 4, keyword: '복숭아 4.5kg' },
    { rank: 5, keyword: '신비복숭아' },
    { rank: 6, keyword: '천도복숭아' },
  ],
  샤인머스캣: [
    { rank: 1, keyword: '샤인머스캣' },
    { rank: 2, keyword: '김천 샤인머스캣' },
    { rank: 3, keyword: '경산 샤인머스캣' },
    { rank: 4, keyword: '샤인머스캣 2kg' },
    { rank: 5, keyword: '샤인머스캣 선물세트' },
    { rank: 6, keyword: '거봉' },
  ],
};

const GOLDEN_PARENTS = 4; // 상위 몇 개 인기검색어에서 황금키워드를 뽑을지
const GOLDEN_PER_PARENT = 2; // 메인 하나당 황금키워드 수

// 임의 JSON → 안전한 RankedKeyword[](형식 오류는 버림, 전역 순위 재번호).
function normalizeRanks(raw: unknown): RankedKeyword[] {
  if (!Array.isArray(raw)) return [];
  const out: RankedKeyword[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const keyword = typeof (item as { keyword?: unknown })?.keyword === 'string'
      ? (item as { keyword: string }).keyword.trim()
      : '';
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    out.push({ rank: out.length + 1, keyword });
  }
  return out;
}

// 스냅샷 JSON(임의 형태) → PopularSnapshot. ranks 가 비면 null(→ 샘플).
// 순수함수 — 파일 IO 없이 단위테스트 가능.
export function normalizeSnapshot(json: unknown): PopularSnapshot | null {
  const obj = json as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object') return null;
  const ranks = normalizeRanks(obj.ranks);
  if (ranks.length === 0) return null;

  let related: Record<string, RankedKeyword[]> | null = null;
  if (obj.related && typeof obj.related === 'object') {
    related = {};
    for (const [k, v] of Object.entries(obj.related as Record<string, unknown>)) {
      const list = normalizeRanks(v);
      if (list.length > 0) related[k] = list;
    }
    if (Object.keys(related).length === 0) related = null;
  }
  const asOf = typeof obj.asOf === 'string' ? obj.asOf : null;
  return { asOf, ranks, related };
}

// data/popular.json 을 읽어 스냅샷으로. 없거나 깨지면 null(조용히 폴백).
function loadSnapshot(): PopularSnapshot | null {
  try {
    const raw = readFileSync(join(process.cwd(), SNAPSHOT_PATH), 'utf8');
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

// 인기검색어 목록(+선택적 연관맵)에서 황금키워드를 뽑는다.
// related 가 있으면 메인별 연관(롱테일+다른품종)에서, 없으면 목록 내 롱테일만.
function buildGolden(
  ranks: RankedKeyword[],
  related: Record<string, RankedKeyword[]> | null,
): GoldenPick[] {
  const golden: GoldenPick[] = [];
  const seen = new Set<string>();
  for (const parent of ranks.slice(0, GOLDEN_PARENTS)) {
    const rel = related?.[parent.keyword];
    const picks = rel
      ? pickGoldenKeywords(parent.keyword, rel, GOLDEN_PER_PARENT)
      : // 혼합 카테고리 목록에서 '다른 과일'을 연관으로 오인하지 않도록 롱테일 한정.
        pickGoldenKeywords(parent.keyword, ranks.filter((c) => c.keyword !== parent.keyword))
          .filter((g) => g.type === 'longtail')
          .slice(0, GOLDEN_PER_PARENT);
    for (const g of picks) {
      if (seen.has(g.keyword)) continue;
      seen.add(g.keyword);
      golden.push({ ...g, parent: parent.keyword });
    }
  }
  // 롱테일(최고 황금) 먼저, 그다음 점수순.
  golden.sort((a, b) => b.score - a.score);
  return golden;
}

// 인기검색어 TOP + 황금키워드. topN=노출 순위 수(데이터랩 상한 500까지 크롤).
// 소스: 라이브 크롤 → 스냅샷(data/popular.json) → 샘플.
export async function getPopularInsights(topN = 10): Promise<PopularInsights> {
  // 1) 라이브 크롤(egress 허용 환경). 최소 20위 확보(황금키워드 추출용).
  const crawled = await fetchCategoryKeywordRank(undefined, Math.max(topN, 20));
  if (crawled) {
    return { source: 'datalab', asOf: null, ranks: crawled.slice(0, topN), golden: buildGolden(crawled, null) };
  }

  // 2) 스냅샷(사용자가 PC에서 뽑아 넣은 실데이터).
  const snap = loadSnapshot();
  if (snap) {
    return { source: 'snapshot', asOf: snap.asOf, ranks: snap.ranks.slice(0, topN), golden: buildGolden(snap.ranks, snap.related) };
  }

  // 3) 샘플(최후 폴백).
  return { source: 'sample', asOf: null, ranks: SAMPLE_RANKS.slice(0, topN), golden: buildGolden(SAMPLE_RANKS, SAMPLE_RELATED) };
}
