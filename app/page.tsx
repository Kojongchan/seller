'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FRUITS, MONTHS, recommendForMonth } from '@/lib/fruits';

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const now = new Date();
  const monthIndex = now.getMonth(); // 0~11
  const monthLabel = MONTHS[monthIndex];

  // 이번 달 밀어야 할 과일 TOP 3 (샘플 시즌 데이터 기준 미리보기)
  const recs = useMemo(() => recommendForMonth(monthIndex, 3), [monthIndex]);

  const goAnalyze = (q: string) => {
    const k = q.trim();
    if (!k) return;
    router.push(`/analyze?q=${encodeURIComponent(k)}`);
  };

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <h1>🍉 과일 키워드 분석기</h1>
          <p>아무 과일·키워드나 검색하면 2년 추이·시즌 피크·등급을 한 화면에서.</p>
          <span className="today">{now.getFullYear()}년 {monthLabel} 기준</span>

          {/* 큰 검색창 — 진입점 */}
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              goAnalyze(query);
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: 샤인머스캣, 청송사과, 햇사과…"
              aria-label="키워드 검색"
            />
            <button type="submit">분석</button>
          </form>

          {/* 빠른-예시 칩 (16종) */}
          <div className="quick-chips">
            {FRUITS.map((f) => (
              <button key={f.id} className="quick-chip" onClick={() => goAnalyze(f.name)}>
                {f.emoji} {f.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="wrap">
        {/* 이번 달 추천 미리보기 */}
        <section>
          <h2 className="section-title">📅 이번 달({monthLabel}) 밀어야 할 과일 TOP 3</h2>
          <div className="rec-grid">
            {recs.map((r, i) => (
              <button
                key={r.fruit.id}
                className="rec-card"
                onClick={() => goAnalyze(r.fruit.name)}
                title={`${r.fruit.name} 분석 보기`}
              >
                <span className="rank">{i + 1}</span>
                <span className="rec-emoji">{r.fruit.emoji}</span>
                <span className="rec-name">{r.fruit.name}</span>
                <span className="rec-score">검색지수 {r.score}</span>
              </button>
            ))}
          </div>
          <p className="hint">※ 통념적 시즌성(샘플) 기준 미리보기. 카드를 누르면 상세 분석으로 이동합니다.</p>
        </section>
      </div>
    </main>
  );
}
