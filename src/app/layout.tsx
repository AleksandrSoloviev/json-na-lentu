import type { Metadata } from "next";

import { mono, sans } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: "На ленту",
  description:
    "Чёрно-белые кадры из JSON и снимков экрана для детской камеры с термопечатью.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      translate="no"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
