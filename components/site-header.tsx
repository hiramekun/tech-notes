import { GitBranch } from "lucide-react";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="top-app-bar">
      <Link className="brand" href="/reports" aria-label="すべての記事を見る">
        {/* eslint-disable-next-line @next/next/no-img-element -- 静的エクスポートのため next/image は使わない */}
        <img
          className="brand-mark"
          src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/avatar.png`}
          alt=""
          width={40}
          height={40}
        />
        <span>
          <strong>Tech Notes</strong>
          <small>Report archive</small>
        </span>
      </Link>

      <a
        className="md-button md-button--text repository-link"
        href="https://github.com/hiramekun/tech-notes"
        target="_blank"
        rel="noreferrer"
      >
        <GitBranch aria-hidden="true" size={18} />
        <span className="repository-label">Repository</span>
      </a>
    </header>
  );
}
