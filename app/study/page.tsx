import { SiteHeader } from "@/components/site-header";
import { StudyDeck } from "@/components/study-deck";

export const metadata = {
  title: "Tech Notes 暗記",
};

export default function StudyPage() {
  return (
    <main className="app-shell">
      <SiteHeader />

      <StudyDeck />

      <footer className="app-footer">
        <span>RECALL → GRADE → SCHEDULE</span>
        <span>覚えていれば右、思い出せなければ左。</span>
      </footer>
    </main>
  );
}
