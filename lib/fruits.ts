// 과일 위탁판매 품목 정의 + 샘플 시즌 데이터.
// 네이버 데이터랩 쇼핑인사이트의 카테고리 분류를 따릅니다.
// (식품 > 농산물 > 과일). 필요 시 cat 코드만 바꾸면 됩니다.

export interface Fruit {
  id: string;
  name: string;
  emoji: string;
  // 네이버 쇼핑인사이트 카테고리 코드 (식품>농산물>과일 하위)
  // 정확한 코드는 데이터랩 화면에서 카테고리 선택 시 URL로 확인 가능.
  category: string;
  // 샘플용: 1~12월 상대 검색 지수(0~100). 실제 운영 시 API 값으로 대체됩니다.
  sample: number[];
}

// 대표적인 위탁판매 과일과 통념적 성수기를 반영한 샘플 곡선.
export const FRUITS: Fruit[] = [
  { id: 'watermelon', name: '수박',       emoji: '🍉', category: '50000159', sample: [8, 8, 12, 25, 60, 92, 100, 85, 35, 12, 8, 6] },
  { id: 'strawberry', name: '딸기',       emoji: '🍓', category: '50000159', sample: [95, 100, 88, 55, 25, 10, 6, 5, 8, 20, 45, 80] },
  { id: 'mandarin',   name: '감귤',       emoji: '🍊', category: '50000159', sample: [70, 55, 30, 15, 8, 6, 5, 6, 12, 40, 85, 100] },
  { id: 'shine',      name: '샤인머스캣', emoji: '🍇', category: '50000159', sample: [20, 15, 12, 14, 18, 25, 45, 80, 100, 90, 55, 35] },
  { id: 'apple',      name: '사과',       emoji: '🍎', category: '50000159', sample: [55, 45, 38, 35, 33, 32, 35, 40, 60, 88, 100, 75] },
  { id: 'peach',      name: '복숭아',     emoji: '🍑', category: '50000159', sample: [6, 6, 8, 12, 25, 65, 100, 95, 40, 12, 8, 6] },
  { id: 'melon',      name: '참외',       emoji: '🍈', category: '50000159', sample: [8, 10, 18, 40, 80, 100, 88, 55, 22, 10, 8, 7] },
  { id: 'grape',      name: '포도',       emoji: '🍇', category: '50000159', sample: [15, 12, 12, 14, 18, 28, 50, 85, 100, 80, 40, 25] },
  { id: 'pear',       name: '배',         emoji: '🍐', category: '50000159', sample: [40, 32, 28, 25, 24, 24, 26, 35, 70, 92, 100, 78] },
  { id: 'sweetpersimmon', name: '단감',   emoji: '🟠', category: '50000159', sample: [12, 10, 8, 8, 8, 8, 10, 15, 45, 90, 100, 60] },
  { id: 'plum',       name: '자두',       emoji: '🟣', category: '50000159', sample: [6, 6, 8, 10, 18, 55, 95, 100, 45, 12, 7, 6] },
  { id: 'hallabong',  name: '한라봉',     emoji: '🍊', category: '50000159', sample: [85, 92, 100, 70, 35, 15, 8, 7, 9, 20, 45, 75] },
  { id: 'blueberry',  name: '블루베리',   emoji: '🫐', category: '50000159', sample: [30, 28, 28, 32, 45, 75, 100, 90, 55, 38, 32, 30] },
  { id: 'kiwi',       name: '키위',       emoji: '🥝', category: '50000159', sample: [60, 55, 48, 40, 32, 28, 28, 30, 38, 60, 85, 100] },
  { id: 'fig',        name: '무화과',     emoji: '🟤', category: '50000159', sample: [6, 6, 6, 7, 9, 14, 30, 70, 100, 75, 25, 8] },
  { id: 'tangerine',  name: '천혜향',     emoji: '🍊', category: '50000159', sample: [70, 95, 100, 80, 40, 15, 8, 7, 8, 15, 35, 55] },
];

export const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export function getFruit(id: string): Fruit | undefined {
  return FRUITS.find((f) => f.id === id);
}

// 검색 지수 배열에서 성수기(피크 구간)를 자동 추출.
// 최댓값의 70% 이상인 연속/비연속 월을 성수기로 본다.
export function detectPeakMonths(values: number[]): number[] {
  const max = Math.max(...values);
  const threshold = max * 0.7;
  return values
    .map((v, i) => (v >= threshold ? i : -1))
    .filter((i) => i >= 0);
}

export interface Recommendation {
  fruit: Fruit;
  score: number; // 해당 월의 검색 지수(0~100)
}

// 특정 월(0~11)에 검색 지수가 높은 과일 순으로 정렬해 추천한다.
// 위탁판매 셀러가 "이번 달 뭘 밀어야 하나"를 한눈에 보기 위한 용도.
export function recommendForMonth(monthIndex: number, limit = 3): Recommendation[] {
  return FRUITS.map((fruit) => ({ fruit, score: fruit.sample[monthIndex] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
