import Link from 'next/link';
import { Suspense } from 'react';
import { FRUITS, MONTHS } from '@/lib/fruits';
import { getRecommendations } from '@/lib/recommend';
import SearchBox from './SearchBox';

// 추천(16종 실데이터 평가)은 무거우니 6시간 ISR 캐시. 검색·차트는 영향 없음.
export const revalidate = 21600;

export default function Home() {
  const now = new Date();
  const monthLabel = MONTHS[now.getMonth()];

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <h1>🍉 과일 키워드 분석기</h1>
          <p>아무 과일·키워드나 검색하면 3개년 추이·시즌 피크·등급을 한 화면에서.</p>
          <span className="today">{now.getFullYear()}년 {monthLabel} 기준</span>

          {/* 큰 검색창 — 진입점 */}
          <SearchBox />

          {/* 빠른-예시 칩 (16종) */}
          <div className="quick-chips">
            {FRUITS.map((f) => (
              <Link key={f.id} className="quick-chip" href={`/analyze?q=${encodeURIComponent(f.name)}`}>
                {f.emoji} {f.name}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="wrap">
        {/* 이번 달 추천 — 네이버 실데이터(폴백: 샘플) */}
        <section>
          <h2 className="section-title">📅 이번 달({monthLabel}) 밀어야 할 과일 TOP 3</h2>
          <Suspense fallback={<RecSkeleton />}>
            <Recommendations now={now} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

async function Recommendations({ now }: { now: Date }) {
  const { source, items } = await getRecommendations(now, 3);
  return (
    <>
      <div className="rec-grid">
        {items.map((r, i) => (
          <Link key={r.id} className="rec-card" href={`/analyze?q=${encodeURIComponent(r.name)}`} title={`${r.name} 분석 보기`}>
            <span className="rank">{i + 1}</span>
            <span className="rec-emoji">{r.emoji}</span>
            <span className="rec-name">{r.name}</span>
            <span className="rec-score">
              현재지수 {r.index}
              {r.grade ? ` · ${r.grade}등급` : ''}
            </span>
          </Link>
        ))}
      </div>
      <p className="hint">
        {source === 'naver'
          ? '※ 네이버 실데이터 기준 — 지금 자기 시즌 정점에 가까운(현재 검색지수 높은) 순. 카드를 누르면 상세 분석으로.'
          : '※ 통념적 시즌성(샘플) 기준 미리보기. 네이버 키 연결 시 실데이터로 전환됩니다.'}
      </p>
    </>
  );
}

function RecSkeleton() {
  return (
    <div className="rec-grid">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rec-card rec-skeleton" aria-hidden>
          <span className="rec-emoji">⏳</span>
          <span className="rec-name">불러오는 중…</span>
        </div>
      ))}
    </div>
  );
}
