import type { Metadata } from "next";

import { mono, sans } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: "JSON на ленту",
  description:
    "Чёрно-белые кадры из JSON для детской камеры с моментальной термопечатью.",
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
