'use client';

import { useEffect, useState } from 'react';
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
import { FRUITS } from '@/lib/fruits';

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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/trend?fruit=${fruitId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [fruitId]);

  const peakSet = new Set(data?.peakMonths ?? []);

  return (
    <main className="wrap">
      <h1 className="title">🍉 과일 시즌 키워드</h1>
      <p className="subtitle">
        과일을 선택하면 최근 1년 월별 검색 트렌드와 성수기를 자동으로 보여줍니다.
      </p>

      <div className="chips">
        {FRUITS.map((f) => (
          <button
            key={f.id}
            className={`chip ${f.id === fruitId ? 'active' : ''}`}
            onClick={() => setFruitId(f.id)}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className="card">
        {data && (
          <div className="peak">
            <span>
              <b>{data.name}</b> 성수기:{' '}
              <b>{data.peakMonths.join(', ') || '—'}</b>
            </span>
            <span className={`badge ${data.source}`}>
              {data.source === 'naver' ? '네이버 실데이터' : '샘플 데이터'}
            </span>
          </div>
        )}

        <div style={{ width: '100%', height: 320, opacity: loading ? 0.4 : 1 }}>
          <ResponsiveContainer>
            <BarChart data={data?.series ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip
                formatter={(v: number) => [`${v}`, '검색지수']}
                cursor={{ fill: 'rgba(37,99,235,0.06)' }}
              />
              <Bar dataKey="ratio" radius={[4, 4, 0, 0]}>
                {(data?.series ?? []).map((d) => (
                  <Cell key={d.month} fill={peakSet.has(d.month) ? '#dc2626' : '#93c5fd'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="subtitle" style={{ marginTop: 16 }}>
        ※ 검색지수는 기간 내 최댓값을 100으로 한 상대값입니다(네이버 데이터랩 방식). 빨간 막대가 성수기 구간이에요.
      </p>
    </main>
  );
}
