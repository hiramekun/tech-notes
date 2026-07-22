import { GitBranch } from "lucide-react";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/reports" aria-label="すべての記事を見る">
        <span className="brand-mark">T/N</span>
        <span>
          <strong>TECH NOTES</strong>
          <small>REPORT ARCHIVE</small>
        </span>
      </Link>

      <a
        className="repository-link"
        href="https://github.com/hiramekun/tech-notes"
        target="_blank"
        rel="noreferrer"
      >
        <GitBranch aria-hidden="true" size={18} />
        Repository
      </a>
    </header>
  );
}
