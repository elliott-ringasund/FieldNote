import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { buildHtmlMap, downloadHtmlMap } from "./htmlMapExport";
import { buildReport, openReport, type ReportConfig } from "./reportExport";
import type { Survey } from "./useSurvey";
import "./PreviewPane.css";

export type PreviewKind = "report" | "map";

type Props = {
  survey: Survey;
  report: ReportConfig;
  kind: PreviewKind;
  onKind: (k: PreviewKind) => void;
  onClose: () => void;
  width: number;
  onWidth: (w: number) => void;
};

/**
 * Paper space — the deliverable, live, beside the map you're drafting on.
 *
 * AutoCAD's model/paper split: the map is the model, this is the sheet that
 * gets issued. It re-renders from the same survey the map draws, so a status
 * change or a restyle shows up in the document without leaving the map.
 *
 * Rendered into an iframe via srcDoc: the deliverables are standalone HTML
 * documents with their own styles (and the map one loads Leaflet), so they need
 * a document of their own rather than being grafted into this page.
 */
export function PreviewPane({ survey, report, kind, onKind, onClose, width, onWidth }: Props) {
  const { meta, points, paths, groups } = survey;
  const [stale, setStale] = useState(false);
  const [doc, setDoc] = useState("");
  const dragging = useRef(false);

  // Rebuilding on every keystroke would be wasteful (and the map deliverable
  // re-downloads Leaflet), so settle briefly after the last edit.
  useEffect(() => {
    setStale(true);
    const timer = window.setTimeout(() => {
      const html =
        kind === "report"
          ? buildReport(meta, points, paths, report, groups).replace(
              /<script>[\s\S]*?<\/script>/,
              "" // strip the auto-print call: this is a preview, not a print job
            )
          : buildHtmlMap(meta, points, paths, groups);
      setDoc(html);
      setStale(false);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [kind, meta, points, paths, groups, report]);

  // Drag the splitter on the pane's left edge.
  const onSplitDown = (e: MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const move = (ev: globalThis.MouseEvent) => {
      if (!dragging.current) return;
      onWidth(Math.min(Math.max(320, window.innerWidth - ev.clientX), window.innerWidth - 360));
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const counts = useMemo(
    () => `${paths.length} lines · ${points.length} points`,
    [paths.length, points.length]
  );

  return (
    <div className="pv" style={{ width }}>
      <div className="pv-split" onMouseDown={onSplitDown} title="Drag to resize" />

      <div className="pv-head">
        <div className="pv-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={kind === "report"}
            className={kind === "report" ? "on" : ""}
            onClick={() => onKind("report")}
          >
            📄 Report
          </button>
          <button
            role="tab"
            aria-selected={kind === "map"}
            className={kind === "map" ? "on" : ""}
            onClick={() => onKind("map")}
          >
            🗺 Map
          </button>
        </div>

        <span className={`pv-state${stale ? " stale" : ""}`}>{stale ? "updating…" : "live"}</span>

        <button
          className="pv-btn"
          title={kind === "report" ? "Open print dialog" : "Download the .html"}
          onClick={() =>
            kind === "report"
              ? openReport(meta, points, paths, report, groups)
              : downloadHtmlMap(meta, points, paths, groups)
          }
        >
          {kind === "report" ? "🖨" : "⭳"}
        </button>
        <button className="pv-btn" onClick={onClose} aria-label="Close preview">
          ✕
        </button>
      </div>

      <div className="pv-body">
        {points.length + paths.length === 0 ? (
          <div className="pv-empty">Draw or import features to see the deliverable here.</div>
        ) : (
          <iframe
            className="pv-frame"
            title={kind === "report" ? "Report preview" : "Map deliverable preview"}
            srcDoc={doc}
          />
        )}
      </div>

      <div className="pv-foot">
        {meta.reference || "no ref"} · {counts}
      </div>
    </div>
  );
}
