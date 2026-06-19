// 메인 인기검색어 TOP + 황금키워드 — 데이터랩 크롤(실데이터) → 샘플 폴백.
//
//  · ranks  : 과일 카테고리 인기검색어 TOP (메인 화면 노출용)
//  · golden : 상위 인기검색어에서 뽑은 황금키워드(롱테일·연관 품종)
//
// 데이터랩 크롤이 차단/실패하면 source='sample' 로 폴백한다.
// (egress 차단 개발 샌드박스에서도 화면이 동작하도록 — naver.ts 와 동일 패턴)

import { fetchCategoryKeywordRank, type RankedKeyword } from './datalab';
import { pickGoldenKeywords, type GoldenKeyword } from './golden';

export interface GoldenPick extends GoldenKeyword {
  parent: string; // 어떤 인기검색어(메인)에서 파생됐는지
}

export interface PopularInsights {
  source: 'datalab' | 'sample';
  ranks: RankedKeyword[];
  golden: GoldenPick[];
}

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

// 인기검색어 TOP + 황금키워드. topN=노출 순위 수.
export async function getPopularInsights(topN = 10): Promise<PopularInsights> {
  const crawled = await fetchCategoryKeywordRank();
  const source: 'datalab' | 'sample' = crawled ? 'datalab' : 'sample';
  const all = crawled ?? SAMPLE_RANKS;
  const ranks = all.slice(0, topN);

  const golden: GoldenPick[] = [];
  const seen = new Set<string>();

  for (const parent of ranks.slice(0, GOLDEN_PARENTS)) {
    const picks =
      source === 'sample' && SAMPLE_RELATED[parent.keyword]
        ? // 샘플: 메인별 연관 인기검색어로 데모(롱테일+다른 품종 모두).
          pickGoldenKeywords(parent.keyword, SAMPLE_RELATED[parent.keyword], GOLDEN_PER_PARENT)
        : // 실데이터: 카테고리 인기검색어 안에서 메인명을 포함한 롱테일만 황금으로.
          //   (혼합 카테고리 목록에서 '다른 과일'을 연관으로 오인하지 않도록 longtail 한정)
          pickGoldenKeywords(
            parent.keyword,
            all.filter((c) => c.keyword !== parent.keyword),
          )
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
  return { source, ranks, golden };
}
