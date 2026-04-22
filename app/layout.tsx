import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "ochibohiroi - 大学生のためのAI学習サポートアプリ",
  description: "時間割の読み取りから板書の自動整理、東大生クオリティのAIノート生成まで。大学生の学習を丸ごとサポート。",
  keywords: ["大学生", "学習", "AI", "ノート", "時間割", "板書"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
