// 키워드 해석 + 세분류(지역/품종) 자동추천 휴리스틱 (1a).
// 분석 대상은 임의의 과일·키워드 전체. 16종은 빠른-예시 + 샘플 폴백용일 뿐.

import { FRUITS, getFruit, type Fruit } from './fruits';

// q(키워드 또는 과일 id)를 분석용 키워드 + (있으면) 매칭된 과일로 해석.
// - 과일 id면 이름으로 매핑
// - 과일 이름 정확/부분 매칭이면 폴백 후보 과일 연결
// - 그 외 임의 키워드는 그대로 사용
export function resolveKeyword(q: string): { keyword: string; fruit: Fruit | null } {
  const raw = (q ?? '').trim();
  if (!raw) return { keyword: '', fruit: null };

  const byId = getFruit(raw);
  if (byId) return { keyword: byId.name, fruit: byId };

  const byName = FRUITS.find((f) => f.name === raw);
  if (byName) return { keyword: byName.name, fruit: byName };

  // 임의 키워드: 이름이 포함된 과일을 샘플 폴백 후보로 연결 (예: '청송사과' → 사과)
  const contained = FRUITS.find((f) => raw.includes(f.name));
  return { keyword: raw, fruit: contained ?? null };
}

// 세분류의 상위 대표키워드(과일명). 입력 자체가 대표면 null.
// 예: '청송사과' → '사과', '샤인머스캣' → '포도'(매핑), '사과' → null
const REPRESENTATIVE_MAP: Record<string, string> = {
  샤인머스캣: '포도',
  거봉: '포도',
  캠벨포도: '포도',
};

export function representativeKeyword(keyword: string): string | null {
  const kw = (keyword ?? '').trim();
  if (REPRESENTATIVE_MAP[kw]) return REPRESENTATIVE_MAP[kw];
  const f = FRUITS.find((fr) => kw !== fr.name && kw.includes(fr.name));
  return f ? f.name : null;
}

// 과일별 대표 세분류(지역/품종) — 1a 간단 휴리스틱.
const SUBCATEGORY_MAP: Record<string, string[]> = {
  apple: ['청송사과', '부사사과', '꿀사과'],
  grape: ['샤인머스캣', '캠벨포도', '거봉'],
  shine: ['샤인머스캣 선물세트', '경산 샤인머스캣', '김천 샤인머스캣'],
  mandarin: ['제주감귤', '하우스감귤', '꿀감귤'],
  watermelon: ['꿀수박', '씨없는수박', '복수박'],
  strawberry: ['설향딸기', '죽향딸기', '논산딸기'],
  peach: ['백도복숭아', '황도복숭아', '신비복숭아'],
  pear: ['신고배', '나주배', '햇배'],
  plum: ['추희자두', '대석자두', '포도자두'],
  hallabong: ['제주한라봉', '꿀한라봉', '한라봉 선물세트'],
  blueberry: ['생블루베리', '냉동블루베리', '국산블루베리'],
  kiwi: ['참다래', '골드키위', '제주키위'],
  fig: ['생무화과', '국산무화과', '냉동무화과'],
  tangerine: ['제주천혜향', '꿀천혜향', '천혜향 선물세트'],
  melon: ['성주참외', '꿀참외', '햇참외'],
  sweetpersimmon: ['청도반시', '단감 선물세트', '진영단감'],
};

// 세분류 자동추천 (대표키워드와 막대 비교용). 입력 키워드는 제외.
export function suggestSubcategories(keyword: string): string[] {
  const { fruit } = resolveKeyword(keyword);
  const kw = (keyword ?? '').trim();
  if (fruit && SUBCATEGORY_MAP[fruit.id]) {
    return SUBCATEGORY_MAP[fruit.id].filter((s) => s !== kw).slice(0, 3);
  }
  // 임의 키워드: 일반 수식어 프리픽스로 롱테일 후보 생성
  return [`햇${kw}`, `프리미엄 ${kw}`, `선물용 ${kw}`];
}

// 쿠팡 검색 딥링크
export function coupangSearchUrl(keyword: string): string {
  return `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}`;
}
