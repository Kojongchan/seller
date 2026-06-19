// 황금키워드 엔진 단위 테스트 (Node 내장 test runner).
// 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isQuantityKeyword, pickGoldenKeywords } from './golden';
import type { RankedKeyword } from './datalab';

test('isQuantityKeyword: 중량/수량 변형만 true', () => {
  // 중량/수량 → 배제 대상
  assert.equal(isQuantityKeyword('사과 5kg'), true);
  assert.equal(isQuantityKeyword('10kg'), true);
  assert.equal(isQuantityKeyword('샤인머스캣 2kg'), true);
  assert.equal(isQuantityKeyword('복숭아 4.5kg'), true);
  assert.equal(isQuantityKeyword('사과 3개'), true);
  assert.equal(isQuantityKeyword('5'), true); // 순수 숫자
  // 품종/롱테일 → 유지
  assert.equal(isQuantityKeyword('꿀사과'), false);
  assert.equal(isQuantityKeyword('청송사과'), false);
  assert.equal(isQuantityKeyword('샤인머스캣 선물세트'), false); // 세트는 가치 변형
});

// 사과 연관 인기검색어 샘플(순위 포함).
function appleCandidates(): RankedKeyword[] {
  return [
    { rank: 1, keyword: '사과' }, // 메인명 자체 → 배제
    { rank: 2, keyword: '꿀사과' }, // 롱테일(최고 황금)
    { rank: 3, keyword: '청송사과' }, // 롱테일(최고 황금)
    { rank: 4, keyword: '사과 5kg' }, // 중량 → 배제
    { rank: 5, keyword: '부사' }, // 다른 품종(연관, 인기순)
    { rank: 6, keyword: '시나노골드' }, // 다른 품종(연관, 인기순)
  ];
}

test('pickGoldenKeywords: 메인명·중량 배제 + 롱테일 우선, 연관은 인기순', () => {
  const out = pickGoldenKeywords('사과', appleCandidates());
  // 메인명('사과')·중량('사과 5kg') 제외, 롱테일 먼저(순위 asc) → 다른 품종(순위 asc)
  assert.deepEqual(
    out.map((g) => g.keyword),
    ['꿀사과', '청송사과', '부사', '시나노골드'],
  );
  assert.equal(out[0].type, 'longtail');
  assert.equal(out[1].type, 'longtail');
  assert.equal(out[2].type, 'related');
  assert.equal(out[3].type, 'related');
  // 롱테일은 related 보다 항상 score 가 높다.
  assert.ok(out[1].score > out[2].score);
});

test('pickGoldenKeywords: 롱테일은 인기순위가 낮아도 다른 품종보다 위', () => {
  const cands: RankedKeyword[] = [
    { rank: 1, keyword: '거봉' }, // 다른 품종(연관) — 1위지만 롱테일 아님
    { rank: 9, keyword: '김천 샤인머스캣' }, // 롱테일 — 9위지만 최고 황금
  ];
  const out = pickGoldenKeywords('샤인머스캣', cands);
  assert.equal(out[0].keyword, '김천 샤인머스캣');
  assert.equal(out[0].type, 'longtail');
  assert.equal(out[1].keyword, '거봉');
});

test('pickGoldenKeywords: limit + 중복 제거', () => {
  const cands: RankedKeyword[] = [
    { rank: 2, keyword: '청매실' },
    { rank: 3, keyword: '황매실' },
    { rank: 4, keyword: '청매실' }, // 중복
    { rank: 5, keyword: '깐매실' },
  ];
  const out = pickGoldenKeywords('매실', cands, 2);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((g) => g.keyword),
    ['청매실', '황매실'],
  );
});

test('pickGoldenKeywords: 빈 메인이면 빈 배열', () => {
  assert.deepEqual(pickGoldenKeywords('', appleCandidates()), []);
});
