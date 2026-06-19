// 인기검색어 스냅샷 정규화(C안) 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSnapshot } from './popular';

test('normalizeSnapshot: ranks 재번호 + 중복 제거 + asOf/related', () => {
  const snap = normalizeSnapshot({
    asOf: '2026-06-19',
    ranks: [
      { rank: 9, keyword: '수박' }, // 잘못된 rank → 1로 재번호
      { rank: 9, keyword: '참외' }, // → 2
      { keyword: '수박' }, // 중복 제거
      { keyword: '  ' }, // 공백 제거
    ],
    related: {
      수박: [{ keyword: '꿀수박' }, { keyword: '씨없는수박' }],
      참외: [], // 빈 연관 → 제외
    },
  });
  assert.ok(snap);
  assert.equal(snap.asOf, '2026-06-19');
  assert.deepEqual(snap.ranks, [
    { rank: 1, keyword: '수박' },
    { rank: 2, keyword: '참외' },
  ]);
  assert.deepEqual(snap.related, { 수박: [{ rank: 1, keyword: '꿀수박' }, { rank: 2, keyword: '씨없는수박' }] });
});

test('normalizeSnapshot: ranks 비면 null', () => {
  assert.equal(normalizeSnapshot({ ranks: [] }), null);
  assert.equal(normalizeSnapshot({}), null);
  assert.equal(normalizeSnapshot(null), null);
  assert.equal(normalizeSnapshot('nope'), null);
});

test('normalizeSnapshot: related 없으면 null related, ranks 만', () => {
  const snap = normalizeSnapshot({ ranks: [{ keyword: '사과' }] });
  assert.ok(snap);
  assert.equal(snap.related, null);
  assert.equal(snap.asOf, null);
  assert.deepEqual(snap.ranks, [{ rank: 1, keyword: '사과' }]);
});
