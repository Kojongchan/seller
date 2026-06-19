// 네이버 데이터랩 검색어 트렌드 클라이언트 단위 테스트 (Node 내장 test runner).
// 실행: npm test
// fetch 와 환경변수를 목(mock)으로 갈아끼워 실제 네트워크 없이 동작을 검증.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSearchTrend, hasNaverKeys } from './naver';

const realFetch = globalThis.fetch;
const realId = process.env.NAVER_CLIENT_ID;
const realSecret = process.env.NAVER_CLIENT_SECRET;

function setKeys() {
  process.env.NAVER_CLIENT_ID = 'test-id';
  process.env.NAVER_CLIENT_SECRET = 'test-secret';
}

function clearKeys() {
  delete process.env.NAVER_CLIENT_ID;
  delete process.env.NAVER_CLIENT_SECRET;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realId === undefined) delete process.env.NAVER_CLIENT_ID;
  else process.env.NAVER_CLIENT_ID = realId;
  if (realSecret === undefined) delete process.env.NAVER_CLIENT_SECRET;
  else process.env.NAVER_CLIENT_SECRET = realSecret;
});

test('hasNaverKeys: 키 유무를 반영', () => {
  clearKeys();
  assert.equal(hasNaverKeys(), false);
  setKeys();
  assert.equal(hasNaverKeys(), true);
});

test('fetchSearchTrend: 키 없으면 null (네트워크 호출 안 함)', async () => {
  clearKeys();
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error('should not be called');
  }) as typeof fetch;
  const out = await fetchSearchTrend('수박');
  assert.equal(out, null);
  assert.equal(called, false);
});

test('fetchSearchTrend: 올바른 엔드포인트·헤더·바디로 POST', async () => {
  setKeys();
  let captured: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured = { url, init };
    return new Response(
      JSON.stringify({ results: [{ data: [{ period: '2024-01-01', ratio: 12.3 }] }] }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  await fetchSearchTrend('수박', 'date');

  assert.ok(captured);
  const { url, init } = captured!;
  assert.equal(url, 'https://openapi.naver.com/v1/datalab/search');
  assert.equal(init.method, 'POST');
  const headers = init.headers as Record<string, string>;
  assert.equal(headers['X-Naver-Client-Id'], 'test-id');
  assert.equal(headers['X-Naver-Client-Secret'], 'test-secret');
  assert.equal(headers['Content-Type'], 'application/json');

  const body = JSON.parse(init.body as string);
  assert.equal(body.timeUnit, 'date');
  assert.deepEqual(body.keywordGroups, [{ groupName: '수박', keywords: ['수박'] }]);
  // startDate = 재작년 1월 1일, endDate = 오늘(미래 금지).
  const now = new Date();
  assert.equal(body.startDate, `${now.getFullYear() - 2}-01-01`);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(body.endDate, fmt(now));
  assert.ok(body.endDate <= fmt(now)); // 미래가 아님
});

test('fetchSearchTrend: 응답을 {period, ratio}[] 로 매핑', async () => {
  setKeys();
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        results: [{ data: [
          { period: '2024-01-01', ratio: 10 },
          { period: '2024-01-02', ratio: 20.5 },
        ] }],
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

  const out = await fetchSearchTrend('사과');
  assert.deepEqual(out, [
    { period: '2024-01-01', ratio: 10 },
    { period: '2024-01-02', ratio: 20.5 },
  ]);
});

test('fetchSearchTrend: results 비어도 빈 배열 (throw 안 함)', async () => {
  setKeys();
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ results: [] }), { status: 200 })) as unknown as typeof fetch;
  const out = await fetchSearchTrend('없는키워드');
  assert.deepEqual(out, []);
});

test('fetchSearchTrend: 비정상 응답이면 상태코드와 함께 throw', async () => {
  setKeys();
  globalThis.fetch = (async () =>
    new Response('Bad Request', { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(fetchSearchTrend('수박'), /Naver DataLab API 400/);
});

test('fetchSearchTrend: 기본 timeUnit 은 date(일별)', async () => {
  setKeys();
  let body: any = null;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ results: [{ data: [] }] }), { status: 200 });
  }) as unknown as typeof fetch;
  await fetchSearchTrend('포도');
  assert.equal(body.timeUnit, 'date');
});
