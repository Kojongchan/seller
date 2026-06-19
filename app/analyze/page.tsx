'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { coupangSearchUrl, representativeKeyword, suggestSubcategories } from '@/lib/keywords';
import type { Grade, PeakForecast, YoyTrend } from '@/lib/grade';

interface SeriesPoint {
  period: string; // 'YYYY-MM-DD'(일별) 또는 'YYYY-MM'(월별)
  ratio: number | null; // 실측(과거~오늘)
  forecast: number | null; // 예측(오늘~연말)
  monthIndex: number;
}

interface TrendResponse {
  query: string;
  name: string;
  source: 'naver' | 'sample' | 'none';
  message?: string;
  granularity?: 'daily' | 'monthly';
  series: SeriesPoint[];
  peakMonths: string[];
  forecastPeakPoint: { period: string; ratio: number } | null;
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
        <Metric label="현재 검색지수" value={`${summary.currentIndex}`} sub="최근 월 평균(0~100)" />
        <Metric
          label="예상 피크"
          value={forecast ? forecast.peakDateLabel : '—'}
          sub={
            forecast
              ? `예상 피크지수 ${forecast.projectedPeakRatio ?? forecast.peakRatio}`
              : ''
          }
        />
        <Metric
          label="피크까지"
          value={forecast ? (forecast.dday === 0 ? '오늘/지금' : `D-${forecast.dday}`) : '—'}
          sub={forecast ? `${forecast.forecastPeak} 예상` : ''}
        />
        <Metric
          label="작년 대비 추세"
          value={yoyArrow(summary.yoy)}
          sub={summary.yoy.deltaPct == null ? '비교 데이터 부족' : `전년 동월 ${summary.yoy.deltaPct > 0 ? '+' : ''}${summary.yoy.deltaPct}%`}
        />
      </section>

      {/* 3. 3개년 추이 차트 (재작년·작년·올해 1~12월, 미래는 예측) */}
      <section>
        <h2 className="section-title">📈 3개년 검색 추이 {data.granularity === 'daily' ? '(일별)' : '(월별·샘플)'}</h2>
        <div className="card">
          <TrendChart data={data} />
          <p className="hint">
            <span className="dot slate" /> 재작년 &nbsp;
            <span className="dot indigo" /> 작년 &nbsp;
            <span className="dot white-box" /> 올해(현재+예측) &nbsp;
            <span className="dot red" /> 성수기 &nbsp;
            <span className="dot green-line" /> 예측·예상 피크 &nbsp;· 실선=실측, 점선=예측, 상대지수(최댓값=100)
          </p>
        </div>
      </section>

      {/* 4. 시즌 피크 예측 (형태×수준 예측 곡선 기준) */}
      {forecast && (
        <section>
          <h2 className="section-title">🗓️ 시즌 피크 예측</h2>
          <div className="card peak-card">
            <div className="peak-line">
              <b>예상 피크일</b>
              <span>{forecast.peakDateLabel} ({forecast.forecastPeak}) · D-{forecast.dday}</span>
            </div>
            <div className="peak-line">
              <b>올해 예상 피크지수</b>
              <span>{forecast.projectedPeakRatio ?? forecast.peakRatio}</span>
            </div>
            <div className="peak-line">
              <b>작년 대비 관측</b>
              <span>{momentumText(forecast)}</span>
            </div>
            <div className="peak-line">
              <b>피크 시점 추이</b>
              <span>{shiftText(forecast)}</span>
            </div>
            <div className="peak-line">
              <b>작년 피크</b>
              <span>{forecast.lastYearPeak ? `${forecast.lastYearPeak.dateLabel} (지수 ${forecast.lastYearPeak.ratio})` : '데이터 부족'}</span>
            </div>
            <div className="peak-line">
              <b>재작년 피크</b>
              <span>{forecast.prevYearPeak ? `${forecast.prevYearPeak.dateLabel} (지수 ${forecast.prevYearPeak.ratio})` : '데이터 부족'}</span>
            </div>
          </div>
          <p className="hint">{BASIS_NOTE[forecast.basis]}</p>
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

// 예측 근거별 신뢰도 안내(시즌 피크 예측 카드 하단).
const BASIS_NOTE: Record<PeakForecast['basis'], string> = {
  yoy: '※ 예측 = 과거 2년 시즌 형태(작년 0.6 + 재작년 0.4)에 올해 현재 수준을 반영(형태×수준). 단일 피크 이상치에 휘둘리지 않습니다.',
  lastyear: '※ 작년 1년치만 있어 작년 형태에 올해 현재 수준만 반영했습니다. 2년치가 쌓이면 형태가 더 안정됩니다.',
  profile: '※ 일자 단위 데이터가 부족해 시즌 평균(피크월)으로 추정한 값입니다.',
};

// 관측 정보: "재작년 60 → 작년 90 (+50%)" (예측 산식이 아니라 실제 관측 변화)
function momentumText(fc: PeakForecast): string {
  if (fc.yoyGrowthPct == null || !fc.prevYearPeak || !fc.lastYearPeak) return '비교 데이터 부족 (2년치 필요)';
  const sign = fc.yoyGrowthPct > 0 ? '+' : '';
  return `재작년 피크 ${fc.prevYearPeak.ratio} → 작년 피크 ${fc.lastYearPeak.ratio} (${sign}${fc.yoyGrowthPct}%)`;
}

// "작년 피크가 재작년보다 10일 늦어짐"
function shiftText(fc: PeakForecast): string {
  if (fc.peakShiftDays == null) return '비교 데이터 부족 (2년치 필요)';
  if (fc.peakShiftDays === 0) return '작년·재작년 피크 시점 동일';
  const dir = fc.peakShiftDays > 0 ? '늦어짐' : '빨라짐';
  return `작년 피크가 재작년보다 ${Math.abs(fc.peakShiftDays)}일 ${dir}`;
}

// 성수기(피크 달력월) 연속 구간을 차트 ReferenceArea 범위로 변환.
function seasonSpans(series: SeriesPoint[], peakSet: Set<string>): { x1: string; x2: string }[] {
  const spans: { x1: string; x2: string }[] = [];
  let start: string | null = null;
  let prev: string | null = null;
  for (const p of series) {
    const inPeak = peakSet.has(`${p.monthIndex + 1}월`);
    if (inPeak) {
      if (start === null) start = p.period;
      prev = p.period;
    } else if (start !== null) {
      spans.push({ x1: start, x2: prev! });
      start = null;
    }
  }
  if (start !== null) spans.push({ x1: start, x2: prev! });
  return spans;
}

// 1월은 연도(예: '25), 나머지는 월 숫자만 → 1개월 단위 눈금을 빽빽하지 않게.
function monthTick(period: string): string {
  const m = Number(period.slice(5, 7));
  if (m === 1) return `'${period.slice(2, 4)}`;
  return `${m}`;
}

// 시리즈에서 달(YYYY-MM)별 첫 포인트만 골라 X축 눈금으로 → 1개월 단위로 표시.
function monthlyTicks(series: SeriesPoint[]): string[] {
  const seen = new Set<string>();
  const ticks: string[] = [];
  for (const p of series) {
    const key = p.period.slice(0, 7);
    if (!seen.has(key)) {
      seen.add(key);
      ticks.push(p.period);
    }
  }
  return ticks;
}

// 특정 달력연도(year)가 차지하는 X축 구간(첫·끝 period). 없으면 null.
function yearBand(series: SeriesPoint[], year: number): { x1: string; x2: string } | null {
  const inYear = series.filter((p) => Number(p.period.slice(0, 4)) === year);
  if (inYear.length === 0) return null;
  return { x1: inYear[0].period, x2: inYear[inYear.length - 1].period };
}

function TrendChart({ data }: { data: TrendResponse }) {
  const peakSet = useMemo(() => new Set(data.peakMonths), [data.peakMonths]);
  const spans = useMemo(() => seasonSpans(data.series, peakSet), [data.series, peakSet]);
  const ticks = useMemo(() => monthlyTicks(data.series), [data.series]);
  const fc = data.forecast;
  // 올해 = 시리즈에 존재하는 가장 큰 연도(예측이 연말까지 채움).
  const thisYear = useMemo(
    () => Math.max(...data.series.map((p) => Number(p.period.slice(0, 4)))),
    [data.series],
  );
  const prevBand = useMemo(() => yearBand(data.series, thisYear - 2), [data.series, thisYear]);
  const lastBand = useMemo(() => yearBand(data.series, thisYear - 1), [data.series, thisYear]);
  const peakPt = data.forecastPeakPoint;

  return (
    <div className="chart">
      <ResponsiveContainer>
        <LineChart data={data.series} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="period" ticks={ticks} interval={0} tickFormatter={monthTick} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
          <Tooltip
            formatter={(v: number, name) => [`${v}`, name === 'forecast' ? '예상 지수' : '검색지수']}
            labelFormatter={(p) => `${p}`}
            cursor={{ stroke: 'rgba(37,99,235,0.3)' }}
          />
          {/* 연도 배경: 재작년·작년만 음영, 올해(현재+미래)는 흰색 */}
          {prevBand && <ReferenceArea x1={prevBand.x1} x2={prevBand.x2} fill="#eef1f5" fillOpacity={0.9} ifOverflow="extendDomain" />}
          {lastBand && <ReferenceArea x1={lastBand.x1} x2={lastBand.x2} fill="#e8edff" fillOpacity={0.9} ifOverflow="extendDomain" />}
          {/* 성수기 구간(연도별 반복) */}
          {spans.map((s) => (
            <ReferenceArea key={s.x1} x1={s.x1} x2={s.x2} fill="#fecaca" fillOpacity={0.4} ifOverflow="extendDomain" />
          ))}
          {fc?.prevYearPeak && (
            <ReferenceLine
              x={fc.prevYearPeak.period}
              stroke="#f59e0b"
              strokeDasharray="4 2"
              label={{ value: '재작년', fontSize: 10, fill: '#f59e0b', position: 'top' }}
            />
          )}
          {fc?.lastYearPeak && (
            <ReferenceLine
              x={fc.lastYearPeak.period}
              stroke="#1d4ed8"
              strokeDasharray="4 2"
              label={{ value: '작년 피크', fontSize: 10, fill: '#1d4ed8', position: 'top' }}
            />
          )}
          {peakPt && (
            <ReferenceLine
              x={peakPt.period}
              stroke="#16a34a"
              strokeDasharray="4 2"
              label={{ value: '예상 피크', fontSize: 10, fill: '#16a34a', position: 'top' }}
            />
          )}
          {peakPt && <ReferenceDot x={peakPt.period} y={peakPt.ratio} r={4} fill="#16a34a" stroke="#fff" strokeWidth={1.5} />}
          {/* 실측(실선) + 예측(점선) */}
          <Line type="linear" dataKey="ratio" stroke="#2563eb" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="linear" dataKey="forecast" stroke="#16a34a" strokeWidth={1.8} strokeDasharray="5 3" dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
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
