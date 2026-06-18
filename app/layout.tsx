import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '과일 시즌 키워드 - MVP',
  description: '과일 위탁판매를 위한 월별/시즌별 핵심 키워드 트렌드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
