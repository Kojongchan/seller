'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 메인 진입점 검색창. 서버 컴포넌트(page)에서 분리한 클라이언트 조각.
export default function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const go = (q: string) => {
    const k = q.trim();
    if (k) router.push(`/analyze?q=${encodeURIComponent(k)}`);
  };

  return (
    <form
      className="search-box"
      onSubmit={(e) => {
        e.preventDefault();
        go(query);
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
  );
}
