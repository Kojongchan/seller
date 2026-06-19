import { NextResponse } from 'next/server';
import { getPopularInsights } from '@/lib/popular';

// GET /api/popular?top=<N>   (N: 1~500, 데이터랩 인기검색어 상한)
// 응답: { source: 'datalab'|'sample', ranks: [{rank,keyword}], golden: [{keyword,parent,type,reason,...}] }
//
// 인기검색어 TOP + 황금키워드. 데이터랩 크롤 실패/차단 시 source='sample'.

// 인기검색어는 일 단위 갱신 → 6시간 ISR 캐시.
export const revalidate = 21600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const top = Math.min(Math.max(Number(searchParams.get('top')) || 20, 1), 500);
  const data = await getPopularInsights(top);
  return NextResponse.json(data);
}
