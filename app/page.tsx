'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { FRUITS, MONTHS, recommendForMonth } from '@/lib/fruits';

interface TrendResponse {
  name: string;
  source: 'naver' | 'sample';
  peakMonths: string[];
  series: { month: string; ratio: number }[];
}

export default function Home() {
  const [fruitId, setFruitId] = useState(FRUITS[0].id);
  const [data, setData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const now = new Date();
  const monthIndex = now.getMonth(); // 0~11
  const monthLabel = MONTHS[monthIndex];

  // 이번 달 밀어야 할 과일 TOP 3 (샘플 시즌 데이터 기준)
  const recs = useMemo(() => recommendForMonth(monthIndex, 3), [monthIndex]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/trend?fruit=${fruitId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [fruitId]);

  const peakSet = new Set(data?.peakMonths ?? []);

  return (
    <main>
      <header className="hero">
        <div className="hero-inner">
          <h1>🍉 과일 시즌 키워드</h1>
          <p>과일 위탁판매를 위한 월별·시즌별 검색 트렌드 인사이트</p>
          <span className="today">{now.getFullYear()}년 {monthLabel} 기준</span>
        </div>
      </header>

      <div className="wrap">
        {/* 이번 달 추천 */}
        <section>
          <h2 className="section-title">📅 이번 달({monthLabel}) 밀어야 할 과일 TOP 3</h2>
          <div className="rec-grid">
            {recs.map((r, i) => (
              <button
                key={r.fruit.id}
                className="rec-card"
                onClick={() => setFruitId(r.fruit.id)}
                title={`${r.fruit.name} 트렌드 보기`}
              >
                <span className="rank">{i + 1}</span>
                <span className="rec-emoji">{r.fruit.emoji}</span>
                <span className="rec-name">{r.fruit.name}</span>
                <span className="rec-score">검색지수 {r.score}</span>
              </button>
            ))}
          </div>
          <p className="hint">※ 통념적 시즌성(샘플) 기준입니다. 네이버 키 연결 시 실데이터로 고도화 예정.</p>
        </section>

        {/* 과일별 트렌드 */}
        <section>
          <h2 className="section-title">🔎 과일별 연간 검색 트렌드</h2>
          <div className="chips">
            {FRUITS.map((f) => (
              <button
                key={f.id}
                className={`chip ${f.id === fruitId ? 'active' : ''}`}
                onClick={() => setFruitId(f.id)}
              >
                {f.emoji} {f.name}
              </button>
            ))}
          </div>

          <div className="card">
            {data && (
              <div className="peak">
                <span>
                  <b>{data.name}</b> 성수기: <b className="peak-months">{data.peakMonths.join(', ') || '—'}</b>
                </span>
                <span className={`badge ${data.source}`}>
                  {data.source === 'naver' ? '● 네이버 실데이터' : '● 샘플 데이터'}
                </span>
              </div>
            )}

            <div className="chart" style={{ opacity: loading ? 0.4 : 1 }}>
              <ResponsiveContainer>
                <BarChart data={data?.series ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip
                    formatter={(v: number) => [`${v}`, '검색지수']}
                    cursor={{ fill: 'rgba(37,99,235,0.06)' }}
                  />
                  <Bar dataKey="ratio" radius={[4, 4, 0, 0]}>
                    {(data?.series ?? []).map((d) => (
                      <Cell
                        key={d.month}
                        fill={peakSet.has(d.month) ? '#dc2626' : '#93c5fd'}
                        stroke={d.month === monthLabel ? '#1d4ed8' : 'none'}
                        strokeWidth={d.month === monthLabel ? 2 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="hint">
              <span className="dot red" /> 성수기 구간 &nbsp;
              <span className="dot blue-out" /> 이번 달({monthLabel}) &nbsp;· 검색지수는 기간 내 최댓값을 100으로 한 상대값입니다.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
