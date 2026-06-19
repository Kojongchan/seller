/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 스냅샷 우선 구조: lib/popular.ts 가 런타임에 data/popular.json 을 fs 로 읽는다.
  // Vercel 서버리스 번들에 이 파일이 포함되도록 file tracing 에 명시(미포함 시 폴백됨).
  experimental: {
    outputFileTracingIncludes: {
      '/': ['./data/popular.json'],
      '/api/popular': ['./data/popular.json'],
    },
  },
};

module.exports = nextConfig;
