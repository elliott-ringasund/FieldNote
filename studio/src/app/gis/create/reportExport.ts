import { categoryLabel, statusColor, type DeliverableMeta } from "./deliverable";
import { bearingDeg, fmtBearing, fmtLength, pathLengthM, toDdm } from "./geo";
import {
  boundsForMudMapSheet,
  formatScale,
  mudMapSheetFromBounds,
  surveyBounds,
  type MudMapSheet,
} from "./mudMap";
import type { SurveyGroup, SurveyPath, SurveyPoint } from "./useSurvey";

/** Union of attribute keys across features, in first-seen order. */
function attrKeys(features: { attrs?: Record<string, string | number> }[]): string[] {
  const keys: string[] = [];
  for (const f of features) {
    for (const k of Object.keys(f.attrs ?? {})) if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** Compact DDM for table cells: "60° 37.757′ N / 5° 0.091′ E". */
function ddmCell(v: [number, number]): string {
  return `${toDdm(v[1], "lat")}<br>${toDdm(v[0], "lng")}`;
}

/**
 * Report block definitions — QGIS-print-layout thinking: a report is assembled
 * from standard blocks, so every document the team produces has the same bones.
 */
export type ReportBlockId =
  | "cover"
  | "project"
  | "disclaimer"
  | "introduction"
  | "methodology"
  | "maps"
  | "lines"
  | "findings"
  | "photos"
  | "signoff";

export type ReportBlock = {
  id: ReportBlockId;
  label: string;
  /** Editable body text (where applicable). */
  editable: boolean;
  defaultText?: string;
};

export const REPORT_BLOCKS: ReportBlock[] = [
  { id: "cover", label: "Cover & title block", editable: false },
  { id: "project", label: "Project details & document control", editable: false },
  {
    id: "disclaimer",
    label: "Disclaimer",
    editable: true,
    defaultText:
      "This document has been prepared for the exclusive use of the client named herein. " +
      "Observations reflect conditions at the time of survey only. No liability is accepted " +
      "for use of this document, in whole or in part, by any other party or for any other purpose.",
  },
  {
    id: "introduction",
    label: "Introduction",
    editable: true,
    defaultText:
      "This report presents the findings of the survey described below. Positions are given in " +
      "WGS84, degrees and decimal minutes. Statuses are classified as OK, Attention, or Fail.",
  },
  {
    id: "methodology",
    label: "Methodology",
    editable: true,
    defaultText:
      "The survey was carried out from the vessel stated in the title block. Positions were " +
      "recorded with the vessel's positioning system. Each line is defined by its start and end " +
      "position; bearing (° true) and length are derived from those positions. Photographs were " +
      "taken at the locations indicated.",
  },
  { id: "maps", label: "Mud-map sheets", editable: false },
  { id: "lines", label: "Line schedule", editable: false },
  { id: "findings", label: "Findings table", editable: false },
  { id: "photos", label: "Photo appendix", editable: false },
  { id: "signoff", label: "Sign-off", editable: false },
];

export type ReportConfig = {
  /** Enabled blocks, in order. */
  blocks: ReportBlockId[];
  /** Custom text per editable block (falls back to defaultText). */
  texts: Partial<Record<ReportBlockId, string>>;
  /** Sheet orientation. A4 portrait is the default issue format. */
  orientation: "portrait" | "landscape";
  /** Individually controlled drawing sheets for large jobs. */
  mapSheets: MudMapSheet[];
};

export function defaultReportConfig(): ReportConfig {
  return {
    blocks: REPORT_BLOCKS.map((b) => b.id),
    texts: {},
    orientation: "portrait",
    mapSheets: [],
  };
}

function mapSheetHtml(
  sheet: MudMapSheet,
  index: number,
  total: number,
  meta: DeliverableMeta,
  points: SurveyPoint[],
  paths: SurveyPath[],
  groups: SurveyGroup[]
): string {
  const [west, south, east, north] = boundsForMudMapSheet(sheet);
  const width = sheet.orientation === "landscape" ? 1000 : 760;
  const height = sheet.orientation === "landscape" ? 565 : 865;
  const x = (lng: number) => ((lng - west) / (east - west)) * width;
  const y = (lat: number) => height - ((lat - south) / (north - south)) * height;
  const inFrame = (lng: number, lat: number) => lng >= west && lng <= east && lat >= south && lat <= north;
  const groupFor = (id?: string) => groups.find((group) => group.id === id);
  const featureColor = (status: string, groupId?: string, own?: { color?: string }) => {
    if (own?.color) return own.color;
    const group = groupFor(groupId);
    return group?.colorMode === "fixed" ? group.color : statusColor(status as never);
  };
  const pathSvg = paths
    .filter((path) => path.visible !== false && path.vertices.length >= 2)
    .map((path) => {
      const coords = path.vertices.map(([lng, lat]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join(" ");
      const color = featureColor(path.status, path.groupId, path.style);
      const group = groupFor(path.groupId);
      const dash = (path.style?.lineStyle ?? group?.lineStyle) === "dashed" ? "12 8" :
        (path.style?.lineStyle ?? group?.lineStyle) === "dotted" ? "3 7" : "";
      const mid = path.vertices[Math.floor(path.vertices.length / 2)];
      const label = inFrame(mid[0], mid[1])
        ? `<text x="${x(mid[0]).toFixed(1)}" y="${(y(mid[1]) - 7).toFixed(1)}" class="map-label">${esc(path.name)}</text>`
        : "";
      if (path.kind === "area") {
        return `<polygon points="${coords}" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-width="4"${dash ? ` stroke-dasharray="${dash}"` : ""}/>${label}`;
      }
      return `<polyline points="${coords}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>${label}`;
    })
    .join("");
  const pointSvg = points
    .filter((point) => point.visible !== false && inFrame(point.lng, point.lat))
    .map((point) => {
      const color = featureColor(point.status, point.groupId, point.style);
      return `<g><circle cx="${x(point.lng).toFixed(1)}" cy="${y(point.lat).toFixed(1)}" r="7" fill="${color}" stroke="#fff" stroke-width="2"/><text x="${(x(point.lng) + 11).toFixed(1)}" y="${(y(point.lat) + 4).toFixed(1)}" class="map-label point-label">${esc(point.name)}</text></g>`;
    })
    .join("");
  const grid = [0.25, 0.5, 0.75]
    .map((fraction) => {
      const gx = width * fraction;
      const gy = height * fraction;
      return `<line x1="${gx}" y1="0" x2="${gx}" y2="${height}" class="map-grid"/><line x1="0" y1="${gy}" x2="${width}" y2="${gy}" class="map-grid"/>`;
    })
    .join("");
  const groundScaleMetres = sheet.scale * 0.05;
  const scaleLabel = groundScaleMetres >= 1000
    ? `${(groundScaleMetres / 1000).toFixed(groundScaleMetres % 1000 === 0 ? 0 : 1)} km`
    : `${Math.round(groundScaleMetres)} m`;

  return `<section class="map-sheet ${sheet.orientation}">
    <div class="map-sheet-heading">
      <div><span>Drawing</span><strong>${esc(sheet.title || `Map sheet ${index + 1}`)}</strong></div>
      <div><span>Sheet</span><strong>${index + 1} / ${total}</strong></div>
    </div>
    <div class="map-frame">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(sheet.title)}">
        <defs><clipPath id="map-clip-${esc(sheet.id)}"><rect width="${width}" height="${height}"/></clipPath></defs>
        <rect width="${width}" height="${height}" class="map-bg"/>
        ${grid}
        <g clip-path="url(#map-clip-${esc(sheet.id)})">${pathSvg}${pointSvg}</g>
        <g class="north"><path d="M ${width - 45} 54 L ${width - 29} 94 L ${width - 45} 84 L ${width - 61} 94 Z"/><text x="${width - 45}" y="42">N</text></g>
        <g class="scale-bar" transform="translate(28 ${height - 36})"><path d="M0 0V-10M0 -5H${(width * 0.05 / (sheet.orientation === "landscape" ? 0.257 : 0.18)).toFixed(1)}M${(width * 0.05 / (sheet.orientation === "landscape" ? 0.257 : 0.18)).toFixed(1)} 0V-10"/><text x="0" y="18">0</text><text x="${(width * 0.05 / (sheet.orientation === "landscape" ? 0.257 : 0.18)).toFixed(1)}" y="18" text-anchor="end">${scaleLabel}</text></g>
      </svg>
    </div>
    <table class="map-titleblock"><tbody><tr>
      <td><span>Project</span>${esc(meta.title || "Survey")}</td>
      <td><span>Site</span>${esc(meta.site || "—")}</td>
      <td><span>Reference</span>${esc(meta.reference || "—")}</td>
      <td><span>Scale</span>${formatScale(sheet.scale)}</td>
    </tr><tr>
      <td><span>Prepared by</span>${esc(meta.author || "—")}</td>
      <td><span>Date</span>${esc(meta.date || "—")}</td>
      <td><span>Revision</span>${esc(meta.revision || "—")}</td>
      <td><span>CRS</span>WGS 84</td>
    </tr></tbody></table>
    <div class="map-coords">Extent: ${south.toFixed(5)}°N, ${west.toFixed(5)}°E — ${north.toFixed(5)}°N, ${east.toFixed(5)}°E</div>
  </section>`;
}

/**
 * Builds the print-ready report HTML. Opened in a new window; the browser's
 * print dialog is the PDF engine. The CAD-style title block is the consistency
 * anchor; the line schedule mirrors how mooring layouts are actually specified
 * (start · bearing · length); photos land in a captioned appendix.
 */
export function buildReport(
  meta: DeliverableMeta,
  points: SurveyPoint[],
  paths: SurveyPath[],
  config: ReportConfig,
  groups: SurveyGroup[] = []
): string {
  const text = (id: ReportBlockId) =>
    config.texts[id] ?? REPORT_BLOCKS.find((b) => b.id === id)?.defaultText ?? "";

  const allStatuses = [...points.map((p) => p.status), ...paths.map((p) => p.status)];
  const counts = {
    ok: allStatuses.filter((s) => s === "ok").length,
    attention: allStatuses.filter((s) => s === "attention").length,
    fail: allStatuses.filter((s) => s === "fail").length,
  };

  const logoBar =
    meta.contractorLogo || meta.clientLogo
      ? `<div class="logos">
          ${meta.contractorLogo ? `<img class="logo" src="${meta.contractorLogo}" alt="">` : "<span></span>"}
          ${meta.clientLogo ? `<img class="logo client" src="${meta.clientLogo}" alt="">` : ""}
        </div>`
      : "";

  const titleBlock = `
  ${logoBar}
  <table class="tb">
    <tr>
      <td class="tb-title" colspan="4">
        <div class="tb-doc">${esc(meta.title || "Survey report")}</div>
        <div class="tb-ref">${esc(meta.reference || "—")}</div>
      </td>
    </tr>
    <tr>
      <td><span>Site</span>${esc(meta.site || "—")}</td>
      <td><span>Vessel</span>${esc(meta.vessel || "—")}</td>
      <td><span>Surveyed by</span>${esc(meta.author || "—")}</td>
      <td><span>Date</span>${esc(meta.date)} · Rev ${esc(meta.revision)}</td>
    </tr>
  </table>`;

  const statusCell = (s: string) =>
    `<span class="dot" style="background:${statusColor(s as never)}"></span>${s.toUpperCase()}`;

  const sections: string[] = [];
  for (const id of config.blocks) {
    if (id === "cover") {
      sections.push(`
        <header class="cover">
          <div class="cover-kicker">Inspection &amp; survey deliverable</div>
          <h1>${esc(meta.title || "Survey report")}</h1>
          <p class="cover-site">${esc(meta.site || "Site not specified")}</p>
          ${titleBlock}
          <div class="summary">
            <div class="pill" style="--c:#2a9d8f">${counts.ok} OK</div>
            <div class="pill" style="--c:#b8860b">${counts.attention} Attention</div>
            <div class="pill" style="--c:#e63946">${counts.fail} Fail</div>
            <div class="pill" style="--c:#456">${points.length} points · ${paths.length} lines/areas</div>
          </div>
          <div class="cover-note">
            <b>Issue record</b>
            <span>Reference ${esc(meta.reference || "—")} · Revision ${esc(meta.revision || "—")} · ${esc(meta.date || "—")}</span>
            <span>Prepared by ${esc(meta.author || "—")} aboard ${esc(meta.vessel || "—")}</span>
          </div>
        </header>`);
    } else if (id === "project") {
      const detailRows = [
        ["Client", meta.client || "—", "Site / locality", [meta.site, meta.siteNumber].filter(Boolean).join(" · ") || "—"],
        ["Vessel", meta.vessel || "—", "Survey personnel", meta.operators || meta.author || "—"],
        ["Software / positioning", meta.software || "—", "Source files", meta.sourceFiles || "—"],
        ["Prepared by", meta.author || "—", "Checked by", meta.checkedBy || "—"],
      ];
      sections.push(`<section class="project-details"><h2>Project details</h2><table><tbody>${detailRows.map((row) => `<tr><th>${row[0]}</th><td>${esc(row[1])}</td><th>${row[2]}</th><td>${esc(row[3])}</td></tr>`).join("")}</tbody></table><p class="gps-note"><b>Positioning note.</b> Coordinates are reported in WGS 84. Field GPS positions may vary with equipment, satellite geometry, sea state, and operating conditions; confirm critical positions independently.</p></section>`);
    } else if (id === "disclaimer") {
      sections.push(`<section><h2>Disclaimer</h2><p class="fine">${esc(text("disclaimer"))}</p></section>`);
    } else if (id === "introduction") {
      sections.push(`<section><h2>Introduction</h2><p>${esc(text("introduction"))}</p></section>`);
    } else if (id === "methodology") {
      sections.push(`<section><h2>Methodology</h2><p>${esc(text("methodology"))}</p></section>`);
    } else if (id === "maps") {
      const overallBounds = surveyBounds(points, paths);
      const sheets = config.mapSheets?.length
        ? config.mapSheets
        : overallBounds
          ? [mudMapSheetFromBounds("map-overview", "Survey overview", overallBounds)]
          : [];
      if (sheets.length > 0) {
        sections.push(
          sheets.map((sheet, index) => mapSheetHtml(sheet, index, sheets.length, meta, points, paths, groups)).join("")
        );
      }
    } else if (id === "lines") {
      const keys = attrKeys(paths);
      const attrHeads0 = keys.map((k) => `<th>${esc(k)}</th>`).join("");
      const cols0 = 8 + keys.length;

      /** One table body for a set of lines, numbered from 1 within its group. */
      const bodyFor = (set: SurveyPath[]) =>
        set
          .filter((p) => p.vertices.length >= 2)
          .map((p, i) => {
            const start = p.vertices[0];
            const end = p.vertices[p.vertices.length - 1];
            const initial = bearingDeg(start, p.vertices[1]);
            const attrCells = keys
              .map((k) => `<td class="mono">${esc(p.attrs?.[k] ?? "")}</td>`)
              .join("");
            return `
        <tr>
          <td>${i + 1}</td>
          <td><b>${esc(p.name)}</b></td>
          <td>${statusCell(p.status)}</td>
          <td class="mono ddm">${ddmCell(start)}</td>
          <td class="mono ddm">${ddmCell(end)}</td>
          <td class="mono">${fmtBearing(initial)}</td>
          <td class="mono">${fmtLength(pathLengthM(p.vertices, p.kind === "area"))}</td>
          ${attrCells}
          <td>${esc(p.note || "")}</td>
        </tr>`;
          })
          .join("");

      const table = (body: string) => `
          <table class="findings schedule">
            <thead><tr><th>#</th><th>Line</th><th>Status</th><th>Start</th><th>End</th><th>Brg</th><th>Length</th>${attrHeads0}<th>Notes</th></tr></thead>
            <tbody>${body || `<tr><td colspan="${cols0}" class="empty">No lines recorded.</td></tr>`}</tbody>
          </table>`;

      // Groups are the modular unit: each gets its own heading, key, its
      // observations, and its own schedule — so a reader can take one group's
      // story on its own.
      const used = groups.filter((g) => paths.some((p) => p.groupId === g.id));
      if (used.length > 0) {
        const ungrouped = paths.filter((p) => !groups.some((g) => g.id === p.groupId));
        const sectionsHtml = used
          .map((g) => {
            const set = paths.filter((p) => p.groupId === g.id);
            const counts = {
              ok: set.filter((p) => p.status === "ok").length,
              attention: set.filter((p) => p.status === "attention").length,
              fail: set.filter((p) => p.status === "fail").length,
            };
            return `
        <section class="groupsec">
          <h3><span class="key" style="background:${g.colorMode === "fixed" ? g.color : "#888"}"></span>${esc(g.name)}
            <span class="gcount">${set.length} line${set.length === 1 ? "" : "s"} · ${counts.ok} OK · ${counts.attention} attention · ${counts.fail} fail</span>
          </h3>
          ${g.description ? `<p>${esc(g.description)}</p>` : ""}
          ${table(bodyFor(set))}
        </section>`;
          })
          .join("");
        sections.push(`
        <section>
          <h2>Line schedule</h2>
          ${sectionsHtml}
          ${
            ungrouped.length > 0
              ? `<section class="groupsec"><h3><span class="key" style="background:#888"></span>Ungrouped
                   <span class="gcount">${ungrouped.length} lines</span></h3>${table(bodyFor(ungrouped))}</section>`
              : ""
          }
        </section>`);
      } else {
        sections.push(`
        <section>
          <h2>Line schedule</h2>
          ${table(bodyFor(paths))}
        </section>`);
      }
    } else if (id === "findings") {
      const rows = points
        .map(
          (p, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(p.name)}</td>
          <td>${esc(categoryLabel(p.category))}</td>
          <td>${statusCell(p.status)}</td>
          <td class="mono">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</td>
          <td>${esc(p.note || "")}</td>
        </tr>`
        )
        .join("");
      sections.push(`
        <section>
          <h2>Findings</h2>
          <table class="findings">
            <thead><tr><th>#</th><th>Name</th><th>Type</th><th>Status</th><th>Position (WGS84)</th><th>Notes</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="6" class="empty">No survey points recorded.</td></tr>`}</tbody>
          </table>
        </section>`);
    } else if (id === "photos") {
      let n = 0;
      const figs = [...points, ...paths]
        .flatMap((f) =>
          f.photos.map((src) => {
            n += 1;
            return `
          <figure>
            <img src="${src}" alt="">
            <figcaption><b>Figure ${n}</b> — ${esc(f.name)}${f.note ? `: ${esc(f.note)}` : ""}</figcaption>
          </figure>`;
          })
        )
        .join("");
      if (figs) {
        sections.push(`
        <section class="photos">
          <h2>Photographs</h2>
          <div class="figgrid">${figs}</div>
        </section>`);
      }
    } else if (id === "signoff") {
      sections.push(`
        <section class="signoff">
          <h2>Sign-off</h2>
          <div class="sig-row">
            <div class="sig"><div class="line"></div>Surveyed by · ${esc(meta.author || "")}</div>
            <div class="sig"><div class="line"></div>Checked by · ${esc(meta.checkedBy || "")}</div>
            <div class="sig"><div class="line"></div>Client</div>
          </div>
        </section>`);
    }
  }

  // A4 portrait is the default issue format; landscape is opt-in for when a
  // line schedule has too many measured columns to sit on a portrait sheet.
  const wide = config.orientation === "landscape";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(meta.reference || meta.title || "Report")}</title>
<style>
  * { box-sizing: border-box; }
  :root { --ink:#14252d; --muted:#53656d; --brand:#176f64; --brand-soft:#e8f2f0; --rule:#ccd8dc; }
  body { margin: 0; font: 12.5px/1.55 "Segoe UI", system-ui, sans-serif; color: var(--ink); background:#fff; }
  .page { max-width: ${wide ? '1120px' : '800px'}; margin: 0 auto; padding: 34px 40px 60px; }
  h1 { margin:0; font-size:32px; line-height:1.08; letter-spacing:-.025em; color:var(--ink); }
  h2 { font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;
       color: var(--brand); border-bottom: 2px solid var(--brand); padding-bottom: 5px; margin: 30px 0 12px; }
  p { margin: 6px 0; }
  .fine { font-size: 10.5px; color: #4a5a62; }
  .mono { font-family: Consolas, monospace; font-size: 11px; white-space: nowrap; }

  .logos { display: flex; align-items: center; justify-content: space-between;
    gap: 20px; margin-bottom: 12px; }
  .logos .logo { max-height: 46px; max-width: 210px; object-fit: contain; }
  .logos .logo.client { max-height: 42px; }

  .cover { min-height: 245mm; display:flex; flex-direction:column; page-break-after:always; }
  .cover-kicker { margin-top:18mm; color:var(--brand); font-size:10px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }
  .cover-site { margin:8px 0 28mm; font-size:18px; color:var(--muted); }
  .cover .tb { margin-top:auto; }
  .cover-note { margin-top:18px; border-left:3px solid var(--brand); background:var(--brand-soft); padding:12px 14px; display:grid; gap:3px; color:var(--muted); }
  .cover-note b { color:var(--ink); text-transform:uppercase; font-size:9px; letter-spacing:.1em; }

  .tb { width: 100%; border-collapse: collapse; border: 2px solid #16242c; }
  .tb td { border: 1px solid #16242c; padding: 7px 10px; font-size: 11.5px; }
  .tb td span { display: block; font-size: 8.5px; letter-spacing: 0.08em;
    text-transform: uppercase; color: #667; margin-bottom: 1px; }
  .tb-title { background: #eef4f3; }
  .tb-doc { font-size: 17px; font-weight: 700; }
  .tb-ref { font-family: Consolas, monospace; font-size: 12px; color: #1f6f63; margin-top: 2px; }

  .summary { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .pill { border: 1.5px solid var(--c); color: var(--c); border-radius: 20px;
    padding: 3px 12px; font-size: 11px; font-weight: 600; }

  .findings { width: 100%; border-collapse: collapse; }
  .findings th { text-align: left; font-size: 9.5px; letter-spacing: 0.07em; text-transform: uppercase;
    color: #556; border-bottom: 1.5px solid #16242c; padding: 5px 8px; }
  .findings td { border-bottom: 1px solid #d8e0e3; padding: 6px 8px; vertical-align: top; }
  .findings tbody tr:nth-child(even) { background:#f6f9fa; }
  .findings .empty { color: #889; font-style: italic; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }

  .figgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  figure { margin: 0; page-break-inside: avoid; }
  figure img { width: 100%; border-radius: 4px; border: 1px solid #ccd5d9; }
  figcaption { font-size: 10px; color: #4a5a62; margin-top: 4px; }

  .signoff { page-break-inside: avoid; }
  .sig-row { display: flex; gap: 26px; margin-top: 34px; }
  .sig { flex: 1; font-size: 10.5px; color: #4a5a62; }
  .sig .line { border-bottom: 1px solid #16242c; height: 34px; margin-bottom: 5px; }

  .groupsec { margin: 18px 0 22px; page-break-inside: avoid; }
  .groupsec h3 { font-size: 12.5px; margin: 0 0 5px; display: flex; align-items: center; gap: 8px; }
  .groupsec .key { width: 22px; height: 8px; border-radius: 2px; display: inline-block;
    border: 1px solid rgba(0,0,0,0.25); flex: none; }
  .groupsec .gcount { font-weight: 400; font-size: 10px; color: #667; margin-left: auto; }
  .groupsec p { font-size: 11.5px; color: #33454e; margin: 0 0 8px; }

  .schedule { font-size: 9.5px; }
  .schedule th, .schedule td { padding: 4px 5px; }
  .schedule .ddm { font-size: 8.5px; line-height: 1.3; }
  .project-details table { width:100%; border-collapse:collapse; table-layout:fixed; }
  .project-details th { width:17%; padding:7px 8px; text-align:left; background:var(--brand-soft); color:var(--brand); font-size:9px; text-transform:uppercase; letter-spacing:.06em; border:1px solid var(--rule); }
  .project-details td { width:33%; padding:7px 9px; border:1px solid var(--rule); }
  .gps-note { margin-top:12px; padding:10px 12px; border-left:3px solid #d39a2c; background:#fff8e8; color:#4f4a3c; font-size:10.5px; }

  .map-sheet { page-break-before:always; page-break-after:always; break-before:page; break-after:page; }
  .map-sheet.landscape { page:map-landscape; }
  .map-sheet.portrait { page:map-portrait; }
  .map-sheet-heading { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid var(--brand); margin-bottom:8px; padding-bottom:7px; }
  .map-sheet-heading div { display:grid; gap:1px; }
  .map-sheet-heading span, .map-titleblock span { display:block; color:var(--muted); text-transform:uppercase; font-size:8px; letter-spacing:.09em; }
  .map-sheet-heading strong { font-size:17px; }
  .map-frame { border:1.5px solid var(--ink); background:#f4f7f4; overflow:hidden; }
  .map-frame svg { width:100%; height:auto; display:block; }
  .map-bg { fill:#edf2ed; }
  .map-grid { stroke:#9fb1aa; stroke-width:1; stroke-dasharray:5 7; opacity:.65; }
  .map-label { font:700 15px "Segoe UI",sans-serif; fill:#10242c; paint-order:stroke; stroke:#fff; stroke-width:5px; stroke-linejoin:round; }
  .point-label { font-size:13px; }
  .north path { fill:var(--ink); }
  .north text { text-anchor:middle; font:700 21px "Segoe UI",sans-serif; fill:var(--ink); }
  .scale-bar path { stroke:var(--ink); stroke-width:2.5; fill:none; }
  .scale-bar text { font:12px "Segoe UI",sans-serif; fill:var(--ink); }
  .map-titleblock { width:100%; border-collapse:collapse; border:1.5px solid var(--ink); border-top:0; table-layout:fixed; }
  .map-titleblock td { border:1px solid #82939a; padding:5px 7px; font-size:10px; }
  .map-coords { text-align:right; color:var(--muted); font:8.5px Consolas,monospace; margin-top:4px; }

  @media print {
    .page { padding: 10mm 0; max-width: none; }
    @page { size: ${wide ? "A4 landscape" : "A4 portrait"}; margin: 16mm 14mm; }
    @page map-landscape { size:A4 landscape; margin:10mm; }
    @page map-portrait { size:A4 portrait; margin:10mm; }
  }
</style>
</head>
<body>
  <div class="page">
    ${sections.join("\n")}
  </div>
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 300));<\/script>
</body>
</html>`;
}

function esc(s: string | number): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Open the report in a new window; the browser print dialog produces the PDF. */
export function openReport(
  meta: DeliverableMeta,
  points: SurveyPoint[],
  paths: SurveyPath[],
  config: ReportConfig,
  groups: SurveyGroup[] = []
) {
  const html = buildReport(meta, points, paths, config, groups);
  const w = window.open("", "_blank");
  if (!w) {
    downloadReportHtml(meta, points, paths, config, groups);
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

/** Downloadable print-ready fallback for browsers that block report popups. */
export function downloadReportHtml(
  meta: DeliverableMeta,
  points: SurveyPoint[],
  paths: SurveyPath[],
  config: ReportConfig,
  groups: SurveyGroup[] = []
) {
  const html = buildReport(meta, points, paths, config, groups);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${String(meta.reference || meta.title || "inspection-report").replace(/[^\w-]+/g, "_")}.html`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
