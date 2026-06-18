'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { coupangSearchUrl, representativeKeyword, suggestSubcategories } from '@/lib/keywords';
import type { Grade, PeakForecast, YoyTrend } from '@/lib/grade';

interface SeriesPoint {
  period: string;
  label: string;
  ratio: number;
  monthIndex: number;
}

interface TrendResponse {
  query: string;
  name: string;
  source: 'naver' | 'sample' | 'none';
  message?: string;
  series: SeriesPoint[];
  peakMonths: string[];
  summary: {
    currentIndex: number;
    currentPeriod: string | null;
    yoy: YoyTrend;
  };
  forecast: PeakForecast | null;
  grade: {
    grade: Grade;
    score: number;
    intensity: number;
    seasonSignal: number;
    peakProximity: number;
    yoyMomentum: number;
  } | null;
}

const GRADE_DESC: Record<Grade, string> = {
  S: '최상위 기회',
  A: '우량',
  B: '양호',
  C: '보통',
  D: '약함',
};

function fetchTrend(q: string): Promise<TrendResponse> {
  return fetch(`/api/trend?q=${encodeURIComponent(q)}`).then((r) => r.json());
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={<div className="wrap"><p className="hint">불러오는 중…</p></div>}>
      <AnalyzeInner />
    </Suspense>
  );
}

function AnalyzeInner() {
  const params = useSearchParams();
  const q = (params.get('q') ?? '').trim();

  const [data, setData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) {
      setData(null);
      return;
    }
    setLoading(true);
    fetchTrend(q)
      .then(setData)
      .finally(() => setLoading(false));
  }, [q]);

  if (!q) {
    return (
      <main>
        <TopBar />
        <div className="wrap">
          <div className="card empty-card">
            <p>분석할 키워드가 없습니다.</p>
            <Link className="btn-primary" href="/">메인에서 검색하기</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <TopBar />
      <div className="wrap" style={{ opacity: loading ? 0.5 : 1 }}>
        {!data && <p className="hint">「{q}」 분석 중…</p>}
        {data && data.source === 'none' && <NoData data={data} />}
        {data && data.source !== 'none' && <Analysis data={data} />}
      </div>
    </main>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="back-link">← 키워드 분석기</Link>
      </div>
    </header>
  );
}

function NoData({ data }: { data: TrendResponse }) {
  return (
    <div className="card empty-card">
      <h2>「{data.query}」</h2>
      <span className="badge none">● 데이터 없음</span>
      <p className="hint" style={{ marginTop: 12 }}>{data.message}</p>
      <div className="action-row" style={{ marginTop: 16 }}>
        <a className="btn-coupang" href={coupangSearchUrl(data.query)} target="_blank" rel="noreferrer">
          🛒 쿠팡에서 「{data.query}」 검색
        </a>
      </div>
    </div>
  );
}

function Analysis({ data }: { data: TrendResponse }) {
  const { summary, forecast, grade } = data;

  return (
    <>
      {/* 1. 헤더 */}
      <section className="an-header">
        <div className="an-title">
          <h1>{data.name}</h1>
          <span className={`badge ${data.source}`}>
            {data.source === 'naver' ? '● 네이버 실데이터' : '● 샘플 데이터'}
          </span>
        </div>
        {grade && (
          <div className="grade-wrap">
            <div className={`grade-badge grade-${grade.grade}`}>{grade.grade}</div>
            <div className="grade-meta">
              <span className="grade-desc">{GRADE_DESC[grade.grade]}</span>
              <span className="grade-tag">경쟁 반영 전 · 임시등급(1a)</span>
            </div>
          </div>
        )}
      </section>

      {/* 2. 핵심 4지표 카드 */}
      <section className="metric-grid">
        <Metric label="현재 검색지수" value={`${summary.currentIndex}`} sub="기간 내 상대값(0~100)" />
        <Metric
          label="예상 피크월"
          value={forecast ? forecast.peakMonthLabel : '—'}
          sub={forecast ? `피크지수 ${forecast.peakRatio}` : ''}
        />
        <Metric
          label="피크까지"
          value={forecast ? (forecast.isInPeak ? '지금 성수기' : `D-${forecast.dday}`) : '—'}
          sub={forecast && !forecast.isInPeak ? `${forecast.peakMonthLabel} 1일까지` : ''}
        />
        <Metric
          label="작년 대비 추세"
          value={yoyArrow(summary.yoy)}
          sub={summary.yoy.deltaPct == null ? '비교 데이터 부족' : `전년 동월 ${summary.yoy.deltaPct > 0 ? '+' : ''}${summary.yoy.deltaPct}%`}
        />
      </section>

      {/* 3. 2년 추이 차트 */}
      <section>
        <h2 className="section-title">📈 2년 검색 추이</h2>
        <div className="card">
          <TrendChart data={data} />
          <p className="hint">
            <span className="dot red" /> 성수기 &nbsp;
            <span className="dot blue-out" /> 이번 달 &nbsp;
            <span className="dot amber-out" /> 작년·재작년 동월 &nbsp;· 좌(과거)→우(최근), 상대지수(최댓값=100)
          </p>
        </div>
      </section>

      {/* 4. 시즌 피크 예측 */}
      {forecast && (
        <section>
          <h2 className="section-title">🗓️ 시즌 피크 예측</h2>
          <div className="card peak-card">
            <div className="peak-line">
              <b>예상 피크월</b>
              <span>{forecast.peakMonthLabel} (피크지수 {forecast.peakRatio})</span>
            </div>
            <div className="peak-line">
              <b>피크까지</b>
              <span>{forecast.isInPeak ? '이번 달이 성수기입니다' : `D-${forecast.dday}`}</span>
            </div>
            <div className="peak-line">
              <b>작년 피크</b>
              <span>{forecast.lastYearPeak ? `${forecast.lastYearPeak.monthLabel} (지수 ${forecast.lastYearPeak.ratio})` : '데이터 부족'}</span>
            </div>
            <div className="peak-line">
              <b>재작년 피크</b>
              <span>{forecast.prevYearPeak ? `${forecast.prevYearPeak.monthLabel} (지수 ${forecast.prevYearPeak.ratio})` : '데이터 부족'}</span>
            </div>
          </div>
        </section>
      )}

      {/* 5. 등급 근거 */}
      {grade && (
        <section>
          <h2 className="section-title">🎯 등급 근거</h2>
          <div className="card">
            <p className="formula">
              점수 = <b>0.6 × 검색지수강도({grade.intensity})</b> + <b>0.4 × 시즌신호({grade.seasonSignal})</b> = <b className="score">{grade.score}점</b> → <b className={`grade-text grade-${grade.grade}`}>{grade.grade}</b>
            </p>
            <ul className="grade-breakdown">
              <li>검색지수강도 {grade.intensity} — 최근·전체 검색지수 수준</li>
              <li>시즌신호 {grade.seasonSignal} = 피크 임박도 {grade.peakProximity} + 전년 대비 상승세 {grade.yoyMomentum}</li>
              <li className="muted">경쟁상품수: 집계 전 (1b에서 쿠팡 경쟁수 반영 예정)</li>
            </ul>
            <p className="hint">※ 1a 임시 산식(검색지수×0.6 + 시즌×0.4). 경쟁 대비 기회 등급은 1b에서 고도화됩니다.</p>
          </div>
        </section>
      )}

      {/* 6. 세분류 비교 */}
      <section>
        <h2 className="section-title">🔬 세분류 비교</h2>
        <div className="card">
          <SubcategoryCompare keyword={data.query} />
        </div>
      </section>

      {/* 7. 액션 */}
      <section>
        <h2 className="section-title">🛒 액션</h2>
        <div className="card action-card">
          <a className="btn-coupang" href={coupangSearchUrl(data.query)} target="_blank" rel="noreferrer">
            🛒 쿠팡에서 「{data.query}」 검색
          </a>
          <span className="hint">쿠팡 검색결과로 이동합니다. (경쟁상품수 자동 집계는 1b 예정)</span>
        </div>
      </section>
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}

function yoyArrow(yoy: YoyTrend): string {
  if (yoy.direction === 'up') return '↑ 상승';
  if (yoy.direction === 'down') return '↓ 하락';
  return '→ 보합';
}

function TrendChart({ data }: { data: TrendResponse }) {
  const peakSet = useMemo(() => new Set(data.peakMonths), [data.peakMonths]);
  const curMonthIndex = data.summary.currentPeriod
    ? Number(data.summary.currentPeriod.slice(5, 7)) - 1
    : -1;
  const curPeriod = data.summary.currentPeriod;

  return (
    <div className="chart">
      <ResponsiveContainer>
        <BarChart data={data.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} />
          <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
          <Tooltip
            formatter={(v: number) => [`${v}`, '검색지수']}
            labelFormatter={(l) => `20${l}`}
            cursor={{ fill: 'rgba(37,99,235,0.06)' }}
          />
          <Bar dataKey="ratio" radius={[3, 3, 0, 0]}>
            {data.series.map((d) => {
              const isCurrent = d.period === curPeriod;
              const isSameMonthPrior = !isCurrent && d.monthIndex === curMonthIndex;
              const stroke = isCurrent ? '#1d4ed8' : isSameMonthPrior ? '#f59e0b' : 'none';
              return (
                <Cell
                  key={d.period}
                  fill={peakSet.has(`${d.monthIndex + 1}월`) ? '#dc2626' : '#93c5fd'}
                  stroke={stroke}
                  strokeWidth={stroke === 'none' ? 0 : 2}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CompareItem {
  keyword: string;
  index: number | null;
  source: string;
}

function SubcategoryCompare({ keyword }: { keyword: string }) {
  const rep = useMemo(() => representativeKeyword(keyword), [keyword]);
  const autoKeywords = useMemo(() => {
    const subs = suggestSubcategories(keyword);
    const base = rep ?? keyword;
    // 대표키워드 + 입력 키워드 + 자동 세분류 (중복 제거)
    return Array.from(new Set([base, keyword, ...subs]));
  }, [keyword, rep]);

  const [auto, setAuto] = useState<CompareItem[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setAutoLoading(true);
    Promise.all(autoKeywords.map(loadIndex)).then((items) => {
      if (alive) {
        setAuto(items);
        setAutoLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [autoKeywords]);

  // 수동 A vs B
  const [a, setA] = useState(rep ?? keyword);
  const [b, setB] = useState(keyword);
  const [manual, setManual] = useState<CompareItem[] | null>(null);
  const [manualLoading, setManualLoading] = useState(false);

  const runManual = () => {
    setManualLoading(true);
    Promise.all([loadIndex(a), loadIndex(b)]).then((items) => {
      setManual(items);
      setManualLoading(false);
    });
  };

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        대표키워드 <b>{rep ?? keyword}</b> vs 세분류 — 세분류가 더 높으면 우량(롱테일) 신호.
      </p>
      <CompareBars items={auto} loading={autoLoading} highlight={keyword} />

      <div className="manual-compare">
        <h3 className="sub-h">직접 비교 (A vs B)</h3>
        <div className="manual-row">
          <input value={a} onChange={(e) => setA(e.target.value)} placeholder="키워드 A" />
          <span className="vs">vs</span>
          <input value={b} onChange={(e) => setB(e.target.value)} placeholder="키워드 B" />
          <button className="btn-primary" onClick={runManual} disabled={manualLoading}>
            {manualLoading ? '비교 중…' : '비교'}
          </button>
        </div>
        {manual && <CompareBars items={manual} loading={false} highlight={b} />}
      </div>
    </div>
  );
}

function loadIndex(keyword: string): Promise<CompareItem> {
  return fetchTrend(keyword)
    .then((r) => ({
      keyword,
      index: r.source === 'none' ? null : r.summary.currentIndex,
      source: r.source,
    }))
    .catch(() => ({ keyword, index: null, source: 'error' }));
}

function CompareBars({ items, loading, highlight }: { items: CompareItem[]; loading: boolean; highlight: string }) {
  if (loading) return <p className="hint">비교 데이터 불러오는 중…</p>;
  if (items.length === 0) return null;
  const max = Math.max(1, ...items.map((i) => i.index ?? 0));
  return (
    <div className="compare-bars">
      {items.map((it) => (
        <div className={`cbar-row ${it.keyword === highlight ? 'is-target' : ''}`} key={it.keyword}>
          <span className="cbar-label">{it.keyword}</span>
          <div className="cbar-track">
            <div className="cbar-fill" style={{ width: `${it.index == null ? 0 : (it.index / max) * 100}%` }} />
          </div>
          <span className="cbar-value">{it.index == null ? '데이터 없음' : it.index}</span>
        </div>
      ))}
    </div>
  );
}
