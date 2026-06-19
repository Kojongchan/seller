import Link from 'next/link';
import { Suspense } from 'react';
import { FRUITS, MONTHS } from '@/lib/fruits';
import { getRecommendations } from '@/lib/recommend';
import { getPopularInsights } from '@/lib/popular';
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
        {/* 인기검색어 TOP + 황금키워드 — 데이터랩 크롤(폴백: 샘플) */}
        <Suspense fallback={<PopularSkeleton />}>
          <PopularInsights />
        </Suspense>

        {/* 이번 달 추천 + 준비 리스트 — 네이버 실데이터(폴백: 샘플) */}
        <Suspense fallback={<RecSkeleton monthLabel={monthLabel} />}>
          <Recommendations now={now} monthLabel={monthLabel} />
        </Suspense>
      </div>
    </main>
  );
}

async function PopularInsights() {
  const { source, ranks, golden } = await getPopularInsights(10);
  return (
    <>
      <section>
        <h2 className="section-title">🔥 인기검색어 TOP</h2>
        <ol className="popular-list">
          {ranks.map((r) => (
            <li key={r.keyword}>
              <Link className="popular-row" href={`/analyze?q=${encodeURIComponent(r.keyword)}`} title={`${r.keyword} 분석 보기`}>
                <span className={`pop-rank${r.rank <= 3 ? ' top' : ''}`}>{r.rank}</span>
                <span className="pop-kw">{r.keyword}</span>
                <span className="pop-go">분석 →</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="hint">
          {source === 'datalab'
            ? '※ 네이버 데이터랩 쇼핑인사이트(과일) 인기검색어 — 최근 30일 기준.'
            : '※ 통념 기반 샘플 미리보기. 데이터랩 크롤이 가능한 환경에서 실데이터로 전환됩니다.'}
        </p>
      </section>

      {golden.length > 0 && (
        <section>
          <h2 className="section-title">💎 황금키워드</h2>
          <div className="golden-grid">
            {golden.map((g) => (
              <Link
                key={g.keyword}
                className={`golden-card golden-${g.type}`}
                href={`/analyze?q=${encodeURIComponent(g.keyword)}`}
                title={`${g.keyword} 분석 보기`}
              >
                <span className="golden-head">
                  <span className="golden-kw">{g.keyword}</span>
                  {g.type === 'longtail' && <span className="golden-tag">롱테일</span>}
                </span>
                <span className="golden-parent">🔗 {g.parent} 연관</span>
                <span className="golden-reason">{g.reason}</span>
              </Link>
            ))}
          </div>
          <p className="hint">
            ※ 인기검색어에서 ① 메인명 자체 · ② 중량/수량(10kg 등) 제외 → ③ 메인명을 반복하는 롱테일=최고 황금 · ④ 다른 품종은 인기순.
            경쟁이 낮고 구매의도가 뚜렷한 키워드입니다.
          </p>
        </section>
      )}
    </>
  );
}

function PopularSkeleton() {
  return (
    <section>
      <h2 className="section-title">🔥 인기검색어 TOP</h2>
      <ol className="popular-list">
        {[1, 2, 3, 4, 5].map((i) => (
          <li key={i}>
            <div className="popular-row rec-skeleton" aria-hidden>
              <span className="pop-rank">{i}</span>
              <span className="pop-kw">불러오는 중…</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

async function Recommendations({ now, monthLabel }: { now: Date; monthLabel: string }) {
  const { source, push, prep } = await getRecommendations(now, 3, 6);
  return (
    <>
      <section>
        <h2 className="section-title">📅 이번 달({monthLabel}) 밀어야 할 과일 TOP 3</h2>
        <div className="rec-grid">
          {push.map((r, i) => (
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
            ? '※ 네이버 실데이터 기준 — 지금 자기 시즌 정점에 가까운(현재 검색지수 높은) 순.'
            : '※ 통념적 시즌성(샘플) 기준 미리보기. 네이버 키 연결 시 실데이터로 전환됩니다.'}
        </p>
      </section>

      {prep.length > 0 && (
        <section>
          <h2 className="section-title">🌱 준비해야 할 과일 (지금~곧 진입 적기)</h2>
          <div className="rec-grid">
            {prep.map((r) => (
              <Link key={r.id} className="rec-card prep-card" href={`/analyze?q=${encodeURIComponent(r.name)}`} title={`${r.name} 분석 보기`}>
                <span className="rec-emoji">{r.emoji}</span>
                <span className="rec-name">{r.name}</span>
                <span className="rec-score">
                  {r.entryDday && r.entryDday > 0 ? `진입 D-${r.entryDday}` : '진입 적기'}
                  {r.peakMonthLabel ? ` · 피크 ${r.peakMonthLabel}` : ''}
                </span>
              </Link>
            ))}
          </div>
          <p className="hint">※ 아직 시즌 전이지만 곧 초입 진입 구간에 드는 과일 — 미리 소싱·상세페이지를 준비하면 피크 경쟁 전에 선점.</p>
        </section>
      )}
    </>
  );
}

function RecSkeleton({ monthLabel }: { monthLabel: string }) {
  return (
    <section>
      <h2 className="section-title">📅 이번 달({monthLabel}) 밀어야 할 과일 TOP 3</h2>
      <div className="rec-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rec-card rec-skeleton" aria-hidden>
            <span className="rec-emoji">⏳</span>
            <span className="rec-name">불러오는 중…</span>
          </div>
        ))}
      </div>
    </section>
  );
}
