// 황금키워드 엔진 (순수함수 — 출처 무관 동일 규칙, 오프라인 단위테스트 가능).
//
// 입력: 메인 키워드(예: '사과') + 인기검색어 후보들(순위 포함).
// 출력: '황금키워드' 후보 — 경쟁 대비 검색의도가 뚜렷한 롱테일/연관 키워드.
//
// 선별 규칙 (PLAN.md E1-2, 2026-06-19 확정):
//   ① 메인 키워드명 자체는 배제 (예: '사과')
//   ② 중량/수량 변형 배제 (예: '사과 5kg', '10kg')
//   ③ 변형이 메인명을 '반복/포함'하면 (롱테일) = 최고 황금
//        (예: 매실 → 청매실/황매실/깐매실, 사과 → 꿀사과/청송사과)
//   ④ 종류(품종)가 다르면 인기검색어 상위순위를 우선
//        (예: 사과의 연관 중 '부사', '시나노골드' 같은 다른 품종)

import type { RankedKeyword } from './datalab';

export type GoldenType = 'longtail' | 'related';

export interface GoldenKeyword {
  keyword: string;
  rank: number; // 원본 인기검색어 순위
  type: GoldenType; // longtail=메인명 반복(최고 황금) / related=다른 품종·종류
  score: number; // 정렬용(내림차순). longtail 그룹이 항상 위.
  reason: string; // 사람이 읽는 근거
}

// 중량/수량 변형 판별. 숫자 + 단위(혹은 'kg' 등)면 수량형으로 본다.
// '세트'(선물세트)는 가치 있는 변형이라 수량으로 보지 않는다.
const QUANTITY_RE =
  /\d+(?:\.\d+)?\s*(?:kg|g|ml|l|리터|키로|킬로|박스|개입|개|입|미|통|봉지|봉|팩|과|구|호|단|포기|말|되|알|송이|줄|망|묶음|인분|들이)/i;

export function isQuantityKeyword(keyword: string): boolean {
  const kw = (keyword ?? '').trim();
  if (!kw) return false;
  if (/^\d+(?:\.\d+)?$/.test(kw)) return true; // 순수 숫자
  return QUANTITY_RE.test(kw);
}

// longtail 은 related 보다 항상 위. 같은 그룹 안에서는 인기순위(작을수록 위).
function scoreOf(type: GoldenType, rank: number): number {
  const groupBase = type === 'longtail' ? 1_000_000 : 0;
  return groupBase + (10_000 - rank);
}

function reasonOf(main: string, type: GoldenType, rank: number): string {
  return type === 'longtail'
    ? `「${main}」 포함 롱테일 — 검색의도 일치(최고 황금)`
    : `인기 ${rank}위 · 다른 품종/종류`;
}

// 메인 키워드 + 후보 인기검색어 → 황금키워드(정렬·중복제거).
// limit 을 주면 상위 N개만.
export function pickGoldenKeywords(
  main: string,
  candidates: RankedKeyword[],
  limit?: number,
): GoldenKeyword[] {
  const m = (main ?? '').trim();
  if (!m) return [];

  const seen = new Set<string>();
  const out: GoldenKeyword[] = [];

  for (const c of candidates) {
    const kw = (c.keyword ?? '').trim();
    if (!kw || kw === m) continue; // ① 메인명 자체 배제
    if (seen.has(kw)) continue;
    if (isQuantityKeyword(kw)) continue; // ② 중량/수량 배제
    seen.add(kw);

    // ③ 메인명 반복(포함) = 롱테일(최고 황금) / ④ 아니면 다른 종류(인기순)
    const type: GoldenType = kw.includes(m) ? 'longtail' : 'related';
    out.push({
      keyword: kw,
      rank: c.rank,
      type,
      score: scoreOf(type, c.rank),
      reason: reasonOf(m, type, c.rank),
    });
  }

  out.sort((a, b) => b.score - a.score);
  return typeof limit === 'number' ? out.slice(0, limit) : out;
}
