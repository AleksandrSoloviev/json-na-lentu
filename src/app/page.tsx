import { PrintStudio } from "@/components/print-studio";
import { mono } from "@/lib/fonts";

export default function Home() {
  return <PrintStudio monoFamily={mono.style.fontFamily} />;
}
