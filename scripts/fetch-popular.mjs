#!/usr/bin/env node
// 데이터랩 인기검색어 스냅샷 생성기 (C안 — egress 막히지 않은 PC에서 실행).
//
// 사용법(인터넷 되는 본인 PC/서버에서):
//   node scripts/fetch-popular.mjs              # 과일 카테고리 TOP500 → stdout
//   node scripts/fetch-popular.mjs > data/popular.json
//   CID=50000159 TOP=100 node scripts/fetch-popular.mjs > data/popular.json
//
// 출력은 lib/popular.ts 가 읽는 스냅샷 형식({ asOf, cid, ranks: [{rank,keyword}] }).
// 이 파일(data/popular.json)을 커밋하면 사이트가 '실데이터(snapshot)'로 표시.
//
// ⚠️ 이 스크립트를 egress 차단 환경(이 웹 샌드박스 등)에서 돌리면 403 입니다.
//    그게 정상이며, 막히지 않은 네트워크에서 돌려야 합니다.

const ENDPOINT = 'https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver';
const REFERER = 'https://datalab.naver.com/shoppingInsight/sCategory.naver';
const CID = process.env.CID || '50000159'; // 식품>농산물>과일
const TOP = Math.min(Math.max(Number(process.env.TOP) || 500, 1), 500);
const PAGE_SIZE = 20;

function recentRange() {
  const now = new Date();
  const end = new Date(now.getTime() - 86_400_000);
  const start = new Date(end.getTime() - 29 * 86_400_000);
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function fetchPage(page, range) {
  const body = new URLSearchParams({
    cid: CID, timeUnit: 'date',
    startDate: range.startDate, endDate: range.endDate,
    age: '', gender: '', device: '', page: String(page), count: String(PAGE_SIZE),
  });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: REFERER,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (page ${page}) — ${await res.text()}`);
  const json = await res.json();
  return (json.ranks ?? json.results?.[0]?.data ?? []).map((r) => String(r.keyword)).filter(Boolean);
}

async function main() {
  const range = recentRange();
  const ranks = [];
  const seen = new Set();
  for (let p = 1; p <= Math.ceil(TOP / PAGE_SIZE); p++) {
    const page = await fetchPage(p, range);
    if (page.length === 0) break;
    for (const keyword of page) {
      if (seen.has(keyword)) continue;
      seen.add(keyword);
      ranks.push({ rank: ranks.length + 1, keyword });
      if (ranks.length >= TOP) break;
    }
    if (ranks.length >= TOP || page.length < PAGE_SIZE) break;
    await new Promise((r) => setTimeout(r, 300)); // 매너 딜레이
  }
  const out = { asOf: range.endDate, cid: CID, ranks };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.stderr.write(`✓ ${ranks.length} keywords (cid=${CID}, ${range.startDate}~${range.endDate})\n`);
}

main().catch((e) => {
  process.stderr.write(`✗ ${e.message}\n`);
  process.exit(1);
});
