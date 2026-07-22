import type { Metadata } from "next";

import { ReportIndex } from "@/components/report-index";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "全てのノート | Tech Notes",
  description: "GitHub Issueから生まれた技術ノートの一覧。",
};

export default function ReportsPage() {
  return (
    <main className="site-shell index-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <SiteHeader />
      <ReportIndex />

      <footer className="site-footer index-footer">
        <span>ISSUES → NOTES → REPORTS</span>
        <span>Built from closed GitHub issues.</span>
      </footer>
    </main>
  );
}
