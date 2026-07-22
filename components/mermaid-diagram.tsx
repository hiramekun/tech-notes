"use client";

import { useEffect, useId, useState } from "react";

type MermaidDiagramProps = {
  chart: string;
};

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const reactId = useId();
  const mermaidId = `mermaid-${reactId.replaceAll(":", "")}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "inherit",
        });
        const result = await mermaid.render(mermaidId, chart);
        if (!cancelled) setSvg(result.svg);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [chart, mermaidId]);

  if (error) {
    return (
      <pre className="diagram-fallback">
        <code>{chart}</code>
      </pre>
    );
  }

  if (!svg) return <div className="diagram-loading">図を描画しています…</div>;

  return (
    <div
      className="mermaid-diagram"
      role="img"
      aria-label="技術ノート内の構成図"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
