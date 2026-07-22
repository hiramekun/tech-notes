"use client";

import { Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type MermaidDiagramProps = {
  chart: string;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const reactId = useId();
  const mermaidId = `mermaid-${reactId.replaceAll(":", "")}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!expanded) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((currentZoom) => Math.min(MAX_ZOOM, currentZoom + ZOOM_STEP));
      }
      if (event.key === "-") {
        event.preventDefault();
        setZoom((currentZoom) => Math.max(MIN_ZOOM, currentZoom - ZOOM_STEP));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [expanded]);

  if (error) {
    return (
      <pre className="diagram-fallback">
        <code>{chart}</code>
      </pre>
    );
  }

  if (!svg) return <div className="diagram-loading">図を描画しています…</div>;

  const expandedSvg = svg.replaceAll(mermaidId, `${mermaidId}-expanded`);

  return (
    <>
      <button
        ref={triggerRef}
        className="mermaid-diagram"
        type="button"
        aria-label="技術ノート内の構成図を拡大表示"
        onClick={() => {
          setZoom(MIN_ZOOM);
          setExpanded(true);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="diagram-zoom-label">
          <Maximize2 aria-hidden="true" size={14} /> 拡大
        </span>
        <span
          className="mermaid-diagram-image"
          role="img"
          aria-label="技術ノート内の構成図"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </button>

      {expanded &&
        createPortal(
          <div
            className="diagram-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="構成図の拡大表示"
            onMouseDown={() => setExpanded(false)}
          >
            <div className="diagram-lightbox-panel" onMouseDown={(event) => event.stopPropagation()}>
              <div className="diagram-lightbox-header">
                <div>
                  <strong>構成図</strong>
                  <span>拡大後はスクロールして図全体を確認できます</span>
                </div>
                <div className="diagram-lightbox-header-actions">
                  <div className="diagram-lightbox-controls" role="group" aria-label="図の拡大率">
                    <button
                      type="button"
                      onClick={() => setZoom((currentZoom) => Math.max(MIN_ZOOM, currentZoom - ZOOM_STEP))}
                      disabled={zoom <= MIN_ZOOM}
                      aria-label="図を縮小"
                    >
                      <ZoomOut aria-hidden="true" size={18} />
                    </button>
                    <button
                      className="diagram-zoom-reset"
                      type="button"
                      onClick={() => setZoom(MIN_ZOOM)}
                      disabled={zoom === MIN_ZOOM}
                      aria-label="図を100パーセントに戻す"
                    >
                      <RotateCcw aria-hidden="true" size={14} />
                      {Math.round(zoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom((currentZoom) => Math.min(MAX_ZOOM, currentZoom + ZOOM_STEP))}
                      disabled={zoom >= MAX_ZOOM}
                      aria-label="図を拡大"
                    >
                      <ZoomIn aria-hidden="true" size={18} />
                    </button>
                  </div>
                  <button
                    className="diagram-lightbox-close"
                    type="button"
                    autoFocus
                    onClick={() => setExpanded(false)}
                    aria-label="拡大表示を閉じる"
                  >
                    <X aria-hidden="true" size={22} />
                  </button>
                </div>
              </div>
              <div className="diagram-lightbox-body">
                <div className="diagram-lightbox-viewport">
                  <div
                    className="diagram-lightbox-figure"
                    role="img"
                    aria-label={`拡大された技術ノート内の構成図、倍率${Math.round(zoom * 100)}パーセント`}
                    style={{ width: `${zoom * 100}%`, minWidth: `${720 * zoom}px` }}
                    dangerouslySetInnerHTML={{ __html: expandedSvg }}
                  />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
