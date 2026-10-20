import { JetBrains_Mono, Manrope } from "next/font/google";

export const sans = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-app-sans",
});

export const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-app-mono",
});
