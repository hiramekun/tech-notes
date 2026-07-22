import { KnowledgeDeck } from "@/components/knowledge-deck";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <main className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <SiteHeader />

      <KnowledgeDeck />

      <footer className="site-footer">
        <span>ISSUES → NOTES → REPORTS</span>
        <span>Built from closed GitHub issues.</span>
      </footer>
    </main>
  );
}
