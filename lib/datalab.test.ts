// 데이터랩 인기검색어 응답 파서 단위 테스트.
// (실제 네트워크 크롤은 egress 허용 환경에서만 — 여기선 순수 파서만 검증)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRanks } from './datalab';

test('parseRanks: ranks 형태', () => {
  const out = parseRanks({
    ranks: [
      { rank: 1, keyword: '수박', linkId: 'a' },
      { rank: 2, keyword: '참외', linkId: 'b' },
    ],
  });
  assert.deepEqual(out, [
    { rank: 1, keyword: '수박' },
    { rank: 2, keyword: '참외' },
  ]);
});

test('parseRanks: results[].data 형태도 수용', () => {
  const out = parseRanks({ results: [{ data: [{ rank: 1, keyword: '사과' }] }] });
  assert.deepEqual(out, [{ rank: 1, keyword: '사과' }]);
});

test('parseRanks: rank 누락 시 인덱스로 보정 + 공백 키워드 제외', () => {
  const out = parseRanks({ ranks: [{ keyword: '포도' }, { keyword: '  ' }, { keyword: '키위' }] });
  assert.deepEqual(out, [
    { rank: 1, keyword: '포도' },
    { rank: 3, keyword: '키위' },
  ]);
});

test('parseRanks: 빈/이상 응답이면 null', () => {
  assert.equal(parseRanks(null), null);
  assert.equal(parseRanks({}), null);
  assert.equal(parseRanks({ ranks: [] }), null);
  assert.equal(parseRanks('nope'), null);
});
