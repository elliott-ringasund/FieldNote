import { useRef, useState, type ChangeEvent } from "react";

import { CATEGORIES, STATUSES } from "./deliverable";
import { fmtLength, formatDdmPair, parseLatLng, pathLengthM } from "./geo";
import { ImportDialog } from "./ImportDialog";
import { SurveyTree } from "./SurveyTree";
import { AttributeTable } from "./AttributeTable";
import { SymbologyDialog, type SymbologyTarget } from "./SymbologyDialog";
import { MudMapLayoutDialog } from "./MudMapLayoutDialog";
import { downloadHtmlMap, previewHtmlMap } from "./htmlMapExport";
import {
  REPORT_BLOCKS,
  defaultReportConfig,
  downloadReportHtml,
  openReport,
  type ReportBlockId,
  type ReportConfig,
} from "./reportExport";
import type { Survey, SurveyPath, SurveyPoint } from "./useSurvey";
import "./CreateWorkspace.css";

type CreateTab = "survey" | "export";

const TABS: { id: CreateTab; label: string }[] = [
  { id: "survey", label: "Survey" },
  { id: "export", label: "Export" },
];

function download(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/** Read chosen image files as data URLs (embedded into exports, Koløy-style). */
function readFilesAsDataUrls(files: FileList): Promise<string[]> {
  return Promise.all(
    Array.from(files).map(
      (f) =>
        new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(f);
        })
    )
  );
}

/**
 * The Create workspace: one survey, rendered as several deliverable tabs.
 *
 * Survey = author the title block + the real data: points, and lines/areas
 * entered GIS-style (click, typed start coordinate, or bearing + length) with
 * vertex-level fix-ups afterwards. Photos and notes attach to any feature.
 */
export function CreateWorkspace({
  survey,
  report,
  setReport,
  preview,
  onPreview,
}: {
  survey: Survey;
  report: ReportConfig;
  setReport: (updater: (r: ReportConfig) => ReportConfig) => void;
  preview: "report" | "map" | null;
  onPreview: (k: "report" | "map" | null) => void;
}) {
  const [tab, setTab] = useState<CreateTab>("survey");
  const [metaOpen, setMetaOpen] = useState(false);
  const [startCoord, setStartCoord] = useState("");
  const [cogoBearing, setCogoBearing] = useState("");
  const [cogoLength, setCogoLength] = useState("");
  const [confirmNew, setConfirmNew] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [symbology, setSymbology] = useState<SymbologyTarget>(null);
  const [mudMapLayoutOpen, setMudMapLayoutOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [tableGroup, setTableGroup] = useState<string | null | undefined>(undefined);
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const {
    meta,
    updateMeta,
    points,
    paths,
    drawMode,
    setDrawMode,
    draftPathId,
    selectedId,
    setSelectedId,
    updatePoint,
    removePoint,
    addVertex,
    addLines,
    extendByBearing,
    finishPath,
    updatePath,
    moveVertex,
    removeVertex,
    removePath,
    saveError,
    clearSurvey,
    createGroup,
  } = survey;

  const selPoint = points.find((p) => p.id === selectedId) ?? null;
  const selPath = paths.find((p) => p.id === selectedId) ?? null;
  const drafting = drawMode === "line" || drawMode === "area";
  const draft = paths.find((p) => p.id === draftPathId) ?? null;
  const cogoTarget = draft ?? selPath;

  const toggleBlock = (id: ReportBlockId) =>
    setReport((r) => ({
      ...r,
      blocks: r.blocks.includes(id)
        ? r.blocks.filter((b) => b !== id)
        : REPORT_BLOCKS.map((b) => b.id).filter((b) => r.blocks.includes(b) || b === id),
    }));

  const applyCogo = () => {
    const b = Number(cogoBearing);
    const l = Number(cogoLength);
    if (!Number.isFinite(b) || !Number.isFinite(l) || l <= 0) return;
    if (drafting && !draft) {
      // COGO with no start yet — need a start coordinate first.
      const start = parseLatLng(startCoord);
      if (!start) return;
      addVertex(start);
      // Vertex lands via state; extend on next apply. Simplest UX: user clicks again.
      return;
    }
    extendByBearing(((b % 360) + 360) % 360, l);
  };

  const addTypedStart = () => {
    const v = parseLatLng(startCoord);
    if (v) {
      addVertex(v);
      setStartCoord("");
    }
  };

  const attachPhotos = async (e: ChangeEvent<HTMLInputElement>, f: SurveyPoint | SurveyPath) => {
    if (!e.target.files?.length) return;
    const urls = await readFilesAsDataUrls(e.target.files);
    if ("lat" in f) updatePoint(f.id, { photos: [...f.photos, ...urls] });
    else updatePath(f.id, { photos: [...f.photos, ...urls] });
    e.target.value = "";
  };

  const removePhoto = (f: SurveyPoint | SurveyPath, i: number) => {
    const photos = f.photos.filter((_, x) => x !== i);
    if ("lat" in f) updatePoint(f.id, { photos });
    else updatePath(f.id, { photos });
  };

  const exportPointsCsv = () =>
    download(
      csv([
        ["name", "category", "status", "lat", "lng", "note"],
        ...points.map((p) => [p.name, p.category, p.status, p.lat.toFixed(6), p.lng.toFixed(6), p.note]),
      ]),
      `${meta.reference || "survey"}-points.csv`,
      "text/csv"
    );

  const exportLinesCsv = () => {
    // Attribute columns come from the data itself, so an imported sheet
    // round-trips with every measured column intact.
    const keys: string[] = [];
    for (const p of paths) {
      for (const k of Object.keys(p.attrs ?? {})) if (!keys.includes(k)) keys.push(k);
    }
    download(
      csv([
        [
          "name",
          "kind",
          "status",
          "start_lat",
          "start_lng",
          "end_lat",
          "end_lng",
          "length_m",
          ...keys,
          "note",
        ],
        ...paths.map((p) => {
          const end = p.vertices[p.vertices.length - 1];
          return [
            p.name,
            p.kind,
            p.status,
            p.vertices[0]?.[1].toFixed(6) ?? "",
            p.vertices[0]?.[0].toFixed(6) ?? "",
            end?.[1].toFixed(6) ?? "",
            end?.[0].toFixed(6) ?? "",
            Math.round(pathLengthM(p.vertices, p.kind === "area")),
            ...keys.map((k) => p.attrs?.[k] ?? ""),
            p.note,
          ];
        }),
      ]),
      `${meta.reference || "survey"}-lines.csv`,
      "text/csv"
    );
  };

  const selected = selPoint ?? selPath;
  const empty = points.length + paths.length === 0;

  const exportCsv = () => {
    if (points.length > 0) exportPointsCsv();
    // Stagger the second download so the browser doesn't swallow it.
    if (paths.length > 0) window.setTimeout(exportLinesCsv, 300);
  };

  return (
    <div className="cws">
      <div className="cws-head">
        <span className="cws-kicker">Create · deliverable</span>
        <span className="cws-count">
          {saveError ? "⚠ not saved" : "✓ saved"} · {points.length} pts · {paths.length} lines
        </span>
        <button
          className={`cws-new${confirmNew ? " arm" : ""}`}
          title="Start a new survey (clears this one)"
          onClick={() => {
            if (confirmNew) {
              clearSurvey();
              setConfirmNew(false);
            } else {
              setConfirmNew(true);
              window.setTimeout(() => setConfirmNew(false), 2500);
            }
          }}
        >
          {confirmNew ? "Sure?" : "🗑 New"}
        </button>
      </div>

      <div className="cws-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`cws-tab${tab === t.id ? " on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="cws-body">
        {tab === "survey" && (
          <>
            {/* ---- title block (CAD-style consistency anchor) ---- */}
            <div className="cws-meta">
              <button className="cws-meta-head" onClick={() => setMetaOpen((o) => !o)}>
                <span>{metaOpen ? "▾" : "▸"} Title block</span>
                <span className="cws-meta-ref">{meta.reference || "no ref"}</span>
              </button>
              {metaOpen && (
                <div className="cws-meta-grid">
                  <label>
                    Title
                    <input
                      value={meta.title}
                      placeholder="Koløy N — Mooring Inspection"
                      onChange={(e) => updateMeta({ title: e.target.value })}
                    />
                  </label>
                  <label>
                    Reference
                    <input
                      value={meta.reference}
                      placeholder="RGS-HSM-001"
                      onChange={(e) => updateMeta({ reference: e.target.value })}
                    />
                  </label>
                  <label>
                    Client
                    <input
                      value={meta.client ?? ""}
                      placeholder="Client / operator"
                      onChange={(e) => updateMeta({ client: e.target.value })}
                    />
                  </label>
                  <label>
                    Site
                    <input
                      value={meta.site}
                      placeholder="Koløy N"
                      onChange={(e) => updateMeta({ site: e.target.value })}
                    />
                  </label>
                  <label>
                    Site number
                    <input
                      value={meta.siteNumber ?? ""}
                      placeholder="Locality / job number"
                      onChange={(e) => updateMeta({ siteNumber: e.target.value })}
                    />
                  </label>
                  <label>
                    Vessel
                    <input
                      value={meta.vessel}
                      placeholder="RGS ..."
                      onChange={(e) => updateMeta({ vessel: e.target.value })}
                    />
                  </label>
                  <label>
                    Surveyed by
                    <input
                      value={meta.author}
                      placeholder="Name"
                      onChange={(e) => updateMeta({ author: e.target.value })}
                    />
                  </label>
                  <label>
                    Checked by
                    <input
                      value={meta.checkedBy ?? ""}
                      placeholder="Reviewer"
                      onChange={(e) => updateMeta({ checkedBy: e.target.value })}
                    />
                  </label>
                  <label>
                    Operators
                    <input
                      value={meta.operators ?? ""}
                      placeholder="Crew / ROV operators"
                      onChange={(e) => updateMeta({ operators: e.target.value })}
                    />
                  </label>
                  <label>
                    Software
                    <input
                      value={meta.software ?? ""}
                      placeholder="Olex / Options / Kongsberg"
                      onChange={(e) => updateMeta({ software: e.target.value })}
                    />
                  </label>
                  <label>
                    Source files
                    <input
                      value={meta.sourceFiles ?? ""}
                      placeholder="Video / survey file reference"
                      onChange={(e) => updateMeta({ sourceFiles: e.target.value })}
                    />
                  </label>
                  <label>
                    Date
                    <input
                      type="date"
                      value={meta.date}
                      onChange={(e) => updateMeta({ date: e.target.value })}
                    />
                  </label>

                  {/* Logos ride on every deliverable — ours plus the client's. */}
                  <div className="cws-logos">
                    <span>Logos</span>
                    <div className="cws-logorow">
                      <div className="cws-logo" title="Ringasund AS">
                        {meta.contractorLogo ? <img src={meta.contractorLogo} alt="Ringasund AS" /> : "—"}
                      </div>
                      <button
                        className="cws-logo client"
                        onClick={() => logoInput.current?.click()}
                        title={meta.clientLogo ? "Replace the client logo" : "Add the client's logo"}
                      >
                        {meta.clientLogo ? <img src={meta.clientLogo} alt="Client" /> : "＋ Client logo"}
                      </button>
                      {meta.clientLogo && (
                        <button
                          className="cws-logo-x"
                          onClick={() => updateMeta({ clientLogo: undefined })}
                          aria-label="Remove client logo"
                        >
                          ✕
                        </button>
                      )}
                      <input
                        ref={logoInput}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const [url] = await readFilesAsDataUrls(e.target.files!);
                            updateMeta({ clientLogo: url });
                          }
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ---- draw toolbar ---- */}
            <div className="cws-drawbar">
              <button
                className={`cws-drawbtn${drawMode === "point" ? " on" : ""}`}
                onClick={() => setDrawMode(drawMode === "point" ? null : "point")}
              >
                ● Point
              </button>
              <button
                className={`cws-drawbtn${drawMode === "line" ? " on" : ""}`}
                onClick={() => setDrawMode(drawMode === "line" ? null : "line")}
              >
                ⟋ Line
              </button>
              <button
                className={`cws-drawbtn${drawMode === "area" ? " on" : ""}`}
                onClick={() => setDrawMode(drawMode === "area" ? null : "area")}
              >
                ▱ Area
              </button>
              {(drafting || draft) && (
                <button className="cws-drawbtn finish" onClick={finishPath}>
                  ✓ Finish
                </button>
              )}
            </div>

            <button className="cws-import" onClick={() => setImportOpen(true)}>
              ⊞ Import from spreadsheet
            </button>
            {drawMode && (
              <div className="cws-hint">
                {drawMode === "point"
                  ? "Click the map to place points."
                  : "Click to add vertices. Double-click, press Enter, or use Finish to complete the line."}
              </div>
            )}

            {/* ---- COGO entry (GIS-style line building) ---- */}
            {(drafting || selPath) && (
              <div className="cws-cogo">
                <div className="cws-cogo-title">
                  {cogoTarget ? `${cogoTarget.name} — extend` : "Start the line"}
                </div>
                {drafting && !draft && (
                  <div className="cws-cogo-row">
                    <input
                      value={startCoord}
                      placeholder="Start: 59.79000, 5.05000"
                      onChange={(e) => setStartCoord(e.target.value)}
                    />
                    <button onClick={addTypedStart} disabled={!parseLatLng(startCoord)}>
                      Set start
                    </button>
                  </div>
                )}
                {cogoTarget && cogoTarget.vertices.length > 0 && (
                  <div className="cws-cogo-row">
                    <input
                      value={cogoBearing}
                      placeholder="Bearing °"
                      inputMode="decimal"
                      onChange={(e) => setCogoBearing(e.target.value)}
                    />
                    <input
                      value={cogoLength}
                      placeholder="Length m"
                      inputMode="decimal"
                      onChange={(e) => setCogoLength(e.target.value)}
                    />
                    <button
                      onClick={applyCogo}
                      disabled={!Number.isFinite(Number(cogoBearing)) || !(Number(cogoLength) > 0)}
                    >
                      Add leg
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ---- layers tree: groups + their features (QGIS-style) ---- */}
            <SurveyTree
              survey={survey}
              onEditGroup={(id) => setSymbology({ kind: "group", id })}
              onEditFeature={(id) => setSymbology({ kind: "feature", id })}
              onEditSelection={() => setSymbology({ kind: "selection", id: "*" })}
              onOpenTable={(gid) => setTableGroup(gid)}
            />


            {/* ---- selected feature properties ---- */}
            {selected && (
              <div className="cws-props">
                <div className="cws-props-title">{selected.name} — properties</div>
                <div className="cws-props-row">
                  {selPoint && (
                    <label>
                      Type
                      <select
                        value={selPoint.category}
                        onChange={(e) => updatePoint(selPoint.id, { category: e.target.value as never })}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Status
                    <select
                      value={selected.status}
                      onChange={(e) => {
                        const status = e.target.value as never;
                        if (selPoint) updatePoint(selPoint.id, { status });
                        else if (selPath) updatePath(selPath.id, { status });
                      }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="cws-props-note">
                  Note
                  <textarea
                    rows={2}
                    value={selected.note}
                    placeholder="What did you observe?"
                    onChange={(e) => {
                      if (selPoint) updatePoint(selPoint.id, { note: e.target.value });
                      else if (selPath) updatePath(selPath.id, { note: e.target.value });
                    }}
                  />
                </label>

                {/* start → end in DDM, the format the sheets use */}
                {selPath && selPath.vertices.length >= 2 && (
                  <div className="cws-ends">
                    <div>
                      <span>Start</span>
                      {formatDdmPair(selPath.vertices[0])}
                    </div>
                    <div>
                      <span>End</span>
                      {formatDdmPair(selPath.vertices[selPath.vertices.length - 1])}
                    </div>
                  </div>
                )}

                {/* measured attributes carried in from the spreadsheet */}
                {selected.attrs && Object.keys(selected.attrs).length > 0 && (
                  <div className="cws-attrs">
                    <div className="cws-attrs-title">Recorded data</div>
                    {Object.entries(selected.attrs).map(([k, v]) => (
                      <div key={k} className="cws-attr">
                        <span title={k}>{k}</span>
                        <b>{String(v)}</b>
                      </div>
                    ))}
                  </div>
                )}

                {/* photos */}
                <div className="cws-photos">
                  {selected.photos.map((src, i) => (
                    <div key={i} className="cws-photo">
                      <img src={src} alt="" />
                      <button aria-label="Remove photo" onClick={() => removePhoto(selected, i)}>
                        ✕
                      </button>
                    </div>
                  ))}
                  <button className="cws-photo-add" onClick={() => photoInput.current?.click()}>
                    📷 Add photos
                  </button>
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => selected && attachPhotos(e, selected)}
                  />
                </div>

                {/* vertex editor for paths — the manual fix-ups */}
                {selPath && (
                  <div className="cws-verts">
                    <div className="cws-verts-title">
                      Vertices ({selPath.vertices.length}) — drag on map, or edit:
                    </div>
                    {selPath.vertices.map((v, i) => (
                      <div key={i} className="cws-vert">
                        <span>#{i + 1}</span>
                        <input
                          value={v[1].toFixed(6)}
                          onChange={(e) => {
                            const lat = Number(e.target.value);
                            if (Number.isFinite(lat)) moveVertex(selPath.id, i, [v[0], lat]);
                          }}
                        />
                        <input
                          value={v[0].toFixed(6)}
                          onChange={(e) => {
                            const lng = Number(e.target.value);
                            if (Number.isFinite(lng)) moveVertex(selPath.id, i, [lng, v[1]]);
                          }}
                        />
                        <button
                          aria-label={`Delete vertex ${i + 1}`}
                          onClick={() => removeVertex(selPath.id, i)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        

        {tab === "export" && (
          <>
            {/* One obvious action per deliverable; every knob lives behind
                Advanced so the common path never asks a question. */}
            {empty && (
              <p className="cws-note">Draw or import the survey first — then export it here.</p>
            )}

            <div className="cws-exp">
              <div className="cws-exp-info">
                <span className="cws-exp-icon">🗺</span>
                <div>
                  <strong>Interactive map</strong>
                  <p>One self-contained .html — every feature with its notes and photos.</p>
                </div>
              </div>
              <div className="cws-exp-actions">
                <button
                  className={`cws-secondary${preview === "map" ? " on" : ""}`}
                  disabled={empty}
                  onClick={() => onPreview(preview === "map" ? null : "map")}
                >
                  {preview === "map" ? "Hide preview" : "Preview"}
                </button>
                <button
                  className="cws-primary"
                  disabled={empty}
                  onClick={() => downloadHtmlMap(meta, points, paths, survey.groups)}
                >
                  ⭳ Export map
                </button>
              </div>
            </div>

            <div className="cws-exp">
              <div className="cws-exp-info">
                <span className="cws-exp-icon">🖨</span>
                <div>
                  <strong>Report</strong>
                  <p>Print-ready A4 issue, assembled from the standard blocks.</p>
                </div>
              </div>
              <div className="cws-exp-actions">
                <button
                  className={`cws-secondary${preview === "report" ? " on" : ""}`}
                  disabled={empty}
                  onClick={() => onPreview(preview === "report" ? null : "report")}
                >
                  {preview === "report" ? "Hide preview" : "Preview"}
                </button>
                <button
                  className="cws-primary"
                  disabled={empty}
                  onClick={() => openReport(meta, points, paths, report, survey.groups)}
                >
                  🖨 Print / PDF
                </button>
              </div>
            </div>

            <div className="cws-exp">
              <div className="cws-exp-info">
                <span className="cws-exp-icon">▦</span>
                <div>
                  <strong>Data</strong>
                  <p>Spreadsheet-ready CSV of the points and lines.</p>
                </div>
              </div>
              <div className="cws-exp-actions">
                <button className="cws-primary" disabled={empty} onClick={exportCsv}>
                  ⭳ Export CSV
                </button>
              </div>
            </div>

            <button
              className="cws-adv-head"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((o) => !o)}
            >
              <span>{advancedOpen ? "▾" : "▸"} Advanced export options</span>
              <span className="cws-adv-gear">⚙</span>
            </button>

            {advancedOpen && (
              <div className="cws-adv">
                <div className="cws-adv-sec">Map</div>
                <div className="cws-out-actions">
                  <button className="cws-secondary" onClick={() => setMudMapLayoutOpen(true)}>
                    ▤ Map pages ({report.mapSheets?.length ?? 0})
                  </button>
                  <button
                    className="cws-secondary"
                    disabled={empty}
                    onClick={() => previewHtmlMap(meta, points, paths, survey.groups)}
                  >
                    👁 Open in tab
                  </button>
                </div>

                <div className="cws-adv-sec">Report sheet</div>
                <div className="cws-orient">
                  <button
                    className={report.orientation === "portrait" ? "on" : ""}
                    onClick={() => setReport((r) => ({ ...r, orientation: "portrait" }))}
                  >
                    ▯ A4 portrait
                  </button>
                  <button
                    className={report.orientation === "landscape" ? "on" : ""}
                    onClick={() => setReport((r) => ({ ...r, orientation: "landscape" }))}
                    title="For wide line schedules"
                  >
                    ▭ A4 landscape
                  </button>
                </div>

                <div className="cws-adv-sec">Report blocks</div>
                <div className="cws-blockslist">
                  {REPORT_BLOCKS.map((b) => {
                    const on = report.blocks.includes(b.id);
                    return (
                      <div key={b.id} className="cws-blockrow">
                        <button
                          className={`cws-blocktoggle${on ? " on" : ""}`}
                          aria-pressed={on}
                          onClick={() => toggleBlock(b.id)}
                        >
                          {on ? "☑" : "☐"} {b.label}
                        </button>
                        {b.editable && on && (
                          <textarea
                            rows={2}
                            value={report.texts[b.id] ?? b.defaultText}
                            onChange={(e) =>
                              setReport((r) => ({
                                ...r,
                                texts: { ...r.texts, [b.id]: e.target.value },
                              }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="cws-out-actions">
                  <button
                    className="cws-secondary"
                    disabled={empty}
                    onClick={() => downloadReportHtml(meta, points, paths, report, survey.groups)}
                  >
                    ⭳ Report as .html
                  </button>
                </div>

                <div className="cws-adv-sec">Data</div>
                <div className="cws-out-actions">
                  <button
                    className="cws-export"
                    disabled={points.length === 0}
                    onClick={exportPointsCsv}
                  >
                    ⭳ Points CSV
                  </button>
                  <button
                    className="cws-export"
                    disabled={paths.length === 0}
                    onClick={exportLinesCsv}
                  >
                    ⭳ Lines CSV
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AttributeTable
        survey={survey}
        open={tableGroup !== undefined}
        groupId={tableGroup ?? null}
        onClose={() => setTableGroup(undefined)}
      />

      <SymbologyDialog survey={survey} target={symbology} onClose={() => setSymbology(null)} />

      <MudMapLayoutDialog
        open={mudMapLayoutOpen}
        onClose={() => setMudMapLayoutOpen(false)}
        points={points}
        paths={paths}
        report={report}
        setReport={setReport}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(lines, groupName) => {
          // Imported sets land in their own group, ready to be styled as a set.
          const groupId = createGroup(groupName || "Imported lines");
          addLines(lines, groupId);
          // Land in the tree with the new group's symbology open, ready to style.
          setSymbology({ kind: "group", id: groupId });
        }}
      />
    </div>
  );
}
