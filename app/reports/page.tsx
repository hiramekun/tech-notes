import type { Metadata } from "next";

import { ReportIndex } from "@/components/report-index";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "全てのノート | Tech Notes",
  description: "GitHub Issueから生まれた技術ノートの一覧。",
};

export default function ReportsPage() {
  return (
    <main className="app-shell">
      <SiteHeader />
      <ReportIndex />

      <footer className="app-footer index-footer">
        <span>ISSUES → NOTES → REPORTS</span>
        <span>Built from closed GitHub issues.</span>
      </footer>
    </main>
  );
}
