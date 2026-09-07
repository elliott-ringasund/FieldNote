import { createPortal } from "react-dom";
import { useMemo, useState } from "react";

import { useMapContext } from "../core/MapContext";
import {
  boundsForMudMapSheet,
  estimateScaleFromBounds,
  formatScale,
  mudMapSheetFromBounds,
  surveyBounds,
  tileMudMapSheets,
  type GeoBounds,
  type MudMapOrientation,
  type MudMapSheet,
} from "./mudMap";
import type { ReportConfig } from "./reportExport";
import type { SurveyPath, SurveyPoint } from "./useSurvey";
import "./MudMapLayoutDialog.css";

type Props = {
  open: boolean;
  onClose: () => void;
  points: SurveyPoint[];
  paths: SurveyPath[];
  report: ReportConfig;
  setReport: (updater: (report: ReportConfig) => ReportConfig) => void;
};

const SCALE_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 2500, 5000, 7500, 10000];

function mapBounds(map: ReturnType<typeof useMapContext>["map"]): GeoBounds | null {
  if (!map) return null;
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

export function MudMapLayoutDialog({ open, onClose, points, paths, report, setReport }: Props) {
  const { map } = useMapContext();
  const [generationScale, setGenerationScale] = useState(1000);
  const [generationOrientation, setGenerationOrientation] = useState<MudMapOrientation>("landscape");
  const [generationError, setGenerationError] = useState("");
  const sheets = report.mapSheets ?? [];
  const dataBounds = useMemo(() => surveyBounds(points, paths), [points, paths]);

  if (!open || typeof document === "undefined") return null;

  const updateSheet = (id: string, patch: Partial<MudMapSheet>) =>
    setReport((current) => ({
      ...current,
      mapSheets: (current.mapSheets ?? []).map((sheet) =>
        sheet.id === id ? { ...sheet, ...patch } : sheet
      ),
    }));

  const addCurrentView = () => {
    const bounds = mapBounds(map) ?? dataBounds;
    if (!bounds) return;
    const next = mudMapSheetFromBounds(
      `map-${Date.now()}`,
      `Mud map ${sheets.length + 1}`,
      bounds,
      generationOrientation
    );
    setReport((current) => ({ ...current, mapSheets: [...(current.mapSheets ?? []), next] }));
  };

  const generateSet = () => {
    if (!dataBounds) return;
    let generated: MudMapSheet[];
    try {
      generated = tileMudMapSheets(dataBounds, generationScale, generationOrientation);
      setGenerationError("");
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Unable to generate the map-page set.");
      return;
    }
    setReport((current) => ({ ...current, mapSheets: generated }));
    const first = generated[0];
    if (first && map) map.fitBounds(boundsForMudMapSheet(first), { padding: 50, duration: 500 });
  };

  return createPortal(
    <div className="mud-layout-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="mud-layout-window" role="dialog" aria-modal="true" aria-labelledby="mud-layout-title">
        <header className="mud-layout-head">
          <div>
            <span>Report drawing set</span>
            <h2 id="mud-layout-title">Mud-map page extents</h2>
          </div>
          <button onClick={onClose} aria-label="Close map-sheet layout">×</button>
        </header>

        <div className="mud-layout-toolbar">
          <label>
            Sheet scale
            <select value={generationScale} onChange={(event) => setGenerationScale(Number(event.target.value))}>
              {SCALE_OPTIONS.map((scale) => <option key={scale} value={scale}>{formatScale(scale)}</option>)}
            </select>
          </label>
          <label>
            Orientation
            <select value={generationOrientation} onChange={(event) => setGenerationOrientation(event.target.value as MudMapOrientation)}>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <button className="primary" onClick={generateSet} disabled={!dataBounds}>Generate pages for job</button>
          <button onClick={addCurrentView} disabled={!map && !dataBounds}>＋ Add current map view</button>
        </div>

        <p className="mud-layout-help">
          Pan and zoom the map, then add its current view—or generate an overlapping page set for the entire survey. Pages print at their stated scale.
        </p>
        {generationError && <p className="mud-layout-error" role="alert">{generationError}</p>}

        <div className="mud-layout-list">
          {sheets.length === 0 && <div className="mud-layout-empty">No map pages configured yet.</div>}
          {sheets.map((sheet, index) => {
            const bounds = boundsForMudMapSheet(sheet);
            return (
              <article key={sheet.id} className="mud-layout-sheet">
                <div className="mud-layout-number">{index + 1}</div>
                <div className="mud-layout-fields">
                  <input
                    className="mud-layout-title"
                    value={sheet.title}
                    aria-label={`Map page ${index + 1} title`}
                    onChange={(event) => updateSheet(sheet.id, { title: event.target.value })}
                  />
                  <div className="mud-layout-row">
                    <label>Centre latitude<input type="number" step="0.00001" value={sheet.center[1]} onChange={(event) => updateSheet(sheet.id, { center: [sheet.center[0], Number(event.target.value)] })}/></label>
                    <label>Centre longitude<input type="number" step="0.00001" value={sheet.center[0]} onChange={(event) => updateSheet(sheet.id, { center: [Number(event.target.value), sheet.center[1]] })}/></label>
                    <label>Scale 1:<input type="number" min="100" step="50" value={sheet.scale} onChange={(event) => updateSheet(sheet.id, { scale: Math.max(100, Number(event.target.value) || 100) })}/></label>
                    <label>Page<select value={sheet.orientation} onChange={(event) => updateSheet(sheet.id, { orientation: event.target.value as MudMapOrientation })}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
                  </div>
                  <div className="mud-layout-extent">{bounds.map((value) => value.toFixed(5)).join(" · ")}</div>
                </div>
                <div className="mud-layout-actions">
                  <button onClick={() => map?.fitBounds(bounds, { padding: 60, duration: 500 })}>Show</button>
                  <button onClick={() => {
                    const current = mapBounds(map);
                    if (!current) return;
                    updateSheet(sheet.id, {
                      center: [(current[0] + current[2]) / 2, (current[1] + current[3]) / 2],
                      scale: estimateScaleFromBounds(current, sheet.orientation),
                    });
                  }} disabled={!map}>Use current view</button>
                  <button className="danger" onClick={() => setReport((current) => ({ ...current, mapSheets: (current.mapSheets ?? []).filter((item) => item.id !== sheet.id) }))}>Remove</button>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="mud-layout-foot">
          <span>{sheets.length} map page{sheets.length === 1 ? "" : "s"}</span>
          <button className="primary" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
