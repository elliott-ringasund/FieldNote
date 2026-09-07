import { categoryLabel, statusColor, type DeliverableMeta } from "./deliverable";
import { bearingDeg, distanceM, fmtBearing, fmtLength, pathLengthM } from "./geo";
import { dashFor, type SurveyGroup, type SurveyPath, type SurveyPoint } from "./useSurvey";

/**
 * Generates the standalone interactive map deliverable — the Koløy-style HTML.
 *
 * Same architecture as the hand-made inspection maps the company already
 * ships: a single self-contained file, Leaflet from CDN, Esri World Imagery +
 * Kartverket sjøkart as switchable base layers, survey data (and photos, as
 * data URLs) embedded. Opens from a file share or email with no build step.
 */
export function buildHtmlMap(
  meta: DeliverableMeta,
  points: SurveyPoint[],
  paths: SurveyPath[],
  groups: SurveyGroup[] = []
): string {
  // A feature draws in its group's style; ungrouped falls back to status.
  const styleFor = (f: { status: SurveyPoint["status"]; groupId?: string }) => {
    const g = groups.find((x) => x.id === f.groupId);
    if (!g)
      return {
        color: statusColor(f.status),
        opacity: 1,
        width: 3,
        visible: true,
        group: "",
        symbol: "circle",
        dash: null as number[] | null,
      };
    return {
      color: g.colorMode === "fixed" ? g.color : statusColor(f.status),
      opacity: g.opacity / 100,
      width: g.width,
      visible: g.visible,
      group: g.name,
      symbol: g.symbol ?? "circle",
      dash: dashFor(g.lineStyle ?? "solid"),
    };
  };
  const pts = points
    .filter((p) => styleFor(p).visible)
    .map((p) => {
      const s = styleFor(p);
      return {
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        category: categoryLabel(p.category),
        status: p.status,
        color: s.color,
        opacity: s.opacity,
        group: s.group,
        symbol: s.symbol,
        note: p.note,
        photos: p.photos,
        attrs: p.attrs ?? {},
      };
    });

  const lns = paths
    .filter((p) => p.vertices.length >= 2 && styleFor(p).visible)
    .map((p) => {
      const s = styleFor(p);
      // One label per line at its midpoint, matching the editor.
      const g = groups.find((x) => x.id === p.groupId);
      const field = g?.labelField ?? "name";
      const showLabel = (g?.labels ?? true) && field !== "none";
      const total = fmtLength(pathLengthM(p.vertices, p.kind === "area"));
      const text =
        field === "name"
          ? p.name
          : field === "name-length"
            ? `${p.name} · ${total}`
            : field === "length"
              ? total
              : field === "bearing-length"
                ? `${fmtBearing(bearingDeg(p.vertices[0], p.vertices[1]))} · ${total}`
                : field === "status"
                  ? p.status.toUpperCase()
                  : "";
      const midIdx = Math.floor((p.vertices.length - 1) / 2);
      const a = p.vertices[midIdx];
      const b = p.vertices[Math.min(midIdx + 1, p.vertices.length - 1)];
      const segs =
        showLabel && text
          ? [{ mid: [(a[1] + b[1]) / 2, (a[0] + b[0]) / 2], label: text }]
          : [];
      return {
        name: p.name,
        kind: p.kind,
        status: p.status,
        color: s.color,
        opacity: s.opacity,
        width: s.width,
        dash: s.dash,
        group: s.group,
        note: p.note,
        photos: p.photos,
        attrs: p.attrs ?? {},
        latlngs: p.vertices.map((v) => [v[1], v[0]]),
        totalLabel: fmtLength(pathLengthM(p.vertices, p.kind === "area")),
        segs,
      };
    });

  const title = meta.title || "Survey map";
  const ref = meta.reference || "—";
  const all = [...points.map((p) => [p.lat, p.lng]), ...paths.flatMap((p) => p.vertices.map((v) => [v[1], v[0]]))];
  const center = all.length
    ? [all.reduce((s, a) => s + a[0], 0) / all.length, all.reduce((s, a) => s + a[1], 0) / all.length]
    : [59.8, 5.3];

  // Legend follows the groups when there are any — the reader's key to what
  // each colour on the map means. Status swatches only appear if something is
  // actually coloured by status.
  const usedGroups = groups.filter(
    (g) => g.visible && [...points, ...paths].some((f) => f.groupId === g.id)
  );
  const anyStatus =
    usedGroups.some((g) => g.colorMode === "status") ||
    [...points, ...paths].some((f) => !groups.some((g) => g.id === f.groupId));
  const legendHtml = [
    ...usedGroups
      .filter((g) => g.colorMode === "fixed")
      .map(
        (g) =>
          `<div><span class="sw" style="background:${g.color};opacity:${g.opacity / 100}"></span>${esc(g.name)}</div>`
      ),
    ...(anyStatus
      ? [
          `<div><span class="sw" style="background:#2a9d8f"></span>OK</div>`,
          `<div><span class="sw" style="background:#e9c46a"></span>Attention</div>`,
          `<div><span class="sw" style="background:#e63946"></span>Fail</div>`,
        ]
      : []),
  ].join("\n  ");

  const subtitleParts = [
    meta.site && `Site: ${meta.site}`,
    meta.vessel && `Vessel: ${meta.vessel}`,
    meta.author && `By: ${meta.author}`,
    meta.date,
    `Rev ${meta.revision}`,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(ref)}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
  html, body { margin: 0; height: 100%; }
  #map { position: absolute; inset: 0; }
  .hdr {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    z-index: 1000; background: rgba(10,20,26,0.88); color: #eef4f5;
    border-radius: 10px; padding: 10px 18px; text-align: center;
    font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    max-width: min(640px, calc(100% - 40px));
  }
  .hdr h1 { margin: 0; font-size: 17px; }
  .hdr-logos { display: flex; align-items: center; justify-content: center; gap: 16px;
    margin-bottom: 7px; }
  .hdr-logos img { max-height: 28px; max-width: 130px; object-fit: contain;
    background: rgba(255,255,255,0.92); border-radius: 4px; padding: 3px 6px; }
  .hdr .sub { font-size: 11.5px; opacity: 0.75; margin-top: 2px; }
  .legend {
    position: absolute; bottom: 24px; left: 12px; z-index: 1000;
    background: rgba(10,20,26,0.88); color: #eef4f5; border-radius: 10px;
    padding: 10px 14px; font: 12px/1.7 system-ui, sans-serif;
  }
  .legend .sw { display: inline-block; width: 11px; height: 11px; border-radius: 50%;
    margin-right: 7px; vertical-align: -1px; border: 2px solid #fff; }
  .leaflet-popup-content { font: 13px/1.5 system-ui, sans-serif; max-width: 260px; }
  .pp-name { font-weight: 700; font-size: 14px; }
  .pp-meta { color: #555; font-size: 11.5px; margin: 2px 0 6px; }
  .pp-status { display: inline-block; padding: 1px 8px; border-radius: 10px;
    color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .pp-photos img { width: 100%; border-radius: 6px; margin-top: 6px; display: block; }
  .pp-attrs { border-collapse: collapse; margin-top: 7px; width: 100%; }
  .pp-attrs th { text-align: left; font-weight: 600; color: #555; font-size: 11px;
    padding: 2px 8px 2px 0; white-space: nowrap; vertical-align: top; }
  .pp-attrs td { font-size: 11.5px; padding: 2px 0; font-variant-numeric: tabular-nums; }
  .sym { background: none; border: none; font-size: 17px; text-shadow: 0 0 3px #000, 0 1px 2px #000; line-height: 18px; text-align: center; }
  .seg-label { background: transparent; border: none; box-shadow: none;
    color: #fff; font: 600 10.5px system-ui, sans-serif;
    text-shadow: 0 1px 3px #000, 0 0 5px #000; white-space: nowrap; }
</style>
</head>
<body>
<div id="map"></div>
<div class="hdr">
  ${
    meta.contractorLogo || meta.clientLogo
      ? `<div class="hdr-logos">
      ${meta.contractorLogo ? `<img src="${meta.contractorLogo}" alt="">` : ""}
      ${meta.clientLogo ? `<img src="${meta.clientLogo}" alt="">` : ""}
    </div>`
      : ""
  }
  <h1>${esc(title)} · ${esc(ref)}</h1>
  <div class="sub">${esc(subtitleParts.join(" · "))}</div>
</div>
<div class="legend">
  ${legendHtml}
</div>
<script>
const SHAPE_GLYPH = { circle: "●", square: "■", triangle: "▲", diamond: "◆" };
const POINTS = ${JSON.stringify(pts)};
const PATHS = ${JSON.stringify(lns)};

const imagery = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19, attribution: "Esri, Maxar, Earthstar Geographics" });
const sjokart = L.tileLayer(
  "https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png",
  { maxZoom: 18, attribution: "© Kartverket" });

const map = L.map("map", { layers: [imagery] }).setView([${center[0]}, ${center[1]}], 14);
L.control.layers({ "Satellite": imagery, "Sjøkart": sjokart }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);

function popupHtml(f, extra) {
  var rows = Object.keys(f.attrs || {}).map(function (k) {
    return '<tr><th>' + k + '</th><td>' + f.attrs[k] + '</td></tr>';
  }).join('');
  return '<div class="pp-name">' + f.name + '</div>' +
    '<div class="pp-meta">' + extra + '</div>' +
    '<span class="pp-status" style="background:' + f.color + '">' + f.status + '</span>' +
    (f.note ? '<div style="margin-top:6px">' + f.note + '</div>' : '') +
    (rows ? '<table class="pp-attrs">' + rows + '</table>' : '') +
    (f.photos && f.photos.length
      ? '<div class="pp-photos">' + f.photos.map(function (s) { return '<img src="' + s + '">'; }).join('') + '</div>'
      : '');
}

const bounds = [];
for (const p of PATHS) {
  const style = { color: p.color, weight: p.width || 3, opacity: p.opacity,
    dashArray: p.dash ? p.dash.map(function(n){return n * (p.width||3);}).join(" ") : (p.kind === "line" ? null : "6 4") };
  const layer = p.kind === "area"
    ? L.polygon(p.latlngs, Object.assign({ fillOpacity: 0.15 * p.opacity }, style))
    : L.polyline(p.latlngs, style);
  const meta = (p.group ? p.group + " · " : "") + (p.kind === "area" ? "Area" : "Line") + " · total " + p.totalLabel;
  layer.addTo(map).bindPopup(popupHtml(p, meta));
  for (const s of p.segs) {
    L.marker(s.mid, { icon: L.divIcon({ className: "seg-label", html: s.label }), interactive: false }).addTo(map);
  }
  for (const ll of p.latlngs) bounds.push(ll);
}
for (const p of POINTS) {
  const m = p.symbol && p.symbol !== "circle"
    ? L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "sym",
        html: '<span style="color:' + p.color + ';opacity:' + p.opacity + '">' + SHAPE_GLYPH[p.symbol] + '</span>',
        iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map)
    : L.circleMarker([p.lat, p.lng], {
        radius: 8, color: "#ffffff", weight: 2, fillColor: p.color,
        fillOpacity: p.opacity, opacity: p.opacity,
      }).addTo(map);
  m.bindPopup(popupHtml(p, (p.group ? p.group + ' · ' : '') + p.category + ' · ' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5)));
  m.bindTooltip(p.name, { permanent: true, direction: "top", offset: [0, -8], opacity: 0.85 });
  bounds.push([p.lat, p.lng]);
}
if (bounds.length > 1) map.fitBounds(bounds, { padding: [70, 70] });
<\/script>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function downloadHtmlMap(
  meta: DeliverableMeta,
  points: SurveyPoint[],
  paths: SurveyPath[],
  groups: SurveyGroup[] = []
) {
  const html = buildHtmlMap(meta, points, paths, groups);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(meta.reference || meta.title || "survey-map").replace(/[^\w-]+/g, "_")}.html`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Open the generated map in a new tab for a quick look before download. */
export function previewHtmlMap(
  meta: DeliverableMeta,
  points: SurveyPoint[],
  paths: SurveyPath[],
  groups: SurveyGroup[] = []
) {
  const html = buildHtmlMap(meta, points, paths, groups);
  const w = window.open("", "_blank");
  if (!w) {
    downloadHtmlMap(meta, points, paths, groups);
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
