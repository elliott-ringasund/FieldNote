/**
 * Standalone dev harness for the map core — no router, no auth, no backend.
 *
 * Mounts <MapCanvas> with the extracted layer modules against mock positions,
 * so the refactored core can be verified visually in isolation. Served at
 * /gis-harness.html by Vite in dev. Not part of the app bundle.
 */
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Map as MapLibreMap } from "maplibre-gl";

import MapCanvas from "../app/gis/core/MapCanvas";
import { SitesLayer } from "../app/gis/layers/SitesLayer";
import { VesselsLayer } from "../app/gis/layers/VesselsLayer";
import { HeatmapLayer } from "../app/gis/layers/HeatmapLayer";
import { TrailsLayer } from "../app/gis/layers/TrailsLayer";
import { BathymetryLayer } from "../app/gis/layers/BathymetryLayer";
import {
  ClientSitesLayer,
  NytekMooringsLayer,
  RegisterSitesLayer,
} from "../app/gis/layers/RegisterLayers";
import { CLIENT_OPERATORS, clientLayerId } from "../app/gis/clients";
import { useSiteSearch } from "../app/gis/useSiteSearch";
import { MapSelection } from "../app/gis/layers/MapSelection";
import { parseLatLng } from "../app/gis/create/geo";
import { CoordinateReadout } from "../app/gis/core/CoordinateReadout";
import { BasemapSwitcher } from "../app/gis/core/BasemapSwitcher";
import { MapSearch } from "../app/gis/core/MapSearch";
import { ModeSwitcher } from "../app/gis/core/ModeSwitcher";
import { FeatureHoverCard } from "../app/gis/core/FeatureHoverCard";
import { ToolBar } from "../app/gis/core/ToolBar";
import { LayerBrowser } from "../app/gis/core/LayerBrowser";
import { LayerPanel } from "../app/gis/core/LayerPanel";
import { useWorkspace } from "../app/gis/core/useWorkspace";
import { useDraggable } from "../app/gis/core/useDraggable";
import { useSurvey } from "../app/gis/create/useSurvey";
import { SurveyLayer } from "../app/gis/create/SurveyLayer";
import { CreateWorkspace } from "../app/gis/create/CreateWorkspace";
import { PreviewPane, type PreviewKind } from "../app/gis/create/PreviewPane";
import { defaultReportConfig, type ReportConfig } from "../app/gis/create/reportExport";
import { surveyBounds } from "../app/gis/create/mudMap";
import { type MapModeId } from "../app/gis/modes";
import {
  CATALOG_GROUPS,
  GROUP_LABELS,
  LAYER_CATALOG,
  catalogLayer,
  type CatalogLayerId,
} from "../app/gis/layerCatalog";
import { type ToolId } from "../app/gis/tools";
import {
  LYR_SITE_POINT,
  LYR_VESSEL_POINT,
  toFeatureCollection,
  trailsToFeatureCollection,
} from "../app/gis/gisLayers";
import type { BasemapId } from "../app/maps/basemaps";
import type { TrackedAssetPosition } from "../api/maps";
import "../app/gis/GisMapPage.css";

const NOW = new Date().toISOString();

function site(
  assetId: number,
  name: string,
  latitude: number,
  longitude: number,
  extra: Partial<TrackedAssetPosition> = {}
): TrackedAssetPosition {
  return {
    assetId,
    type: "Location",
    name,
    latitude,
    longitude,
    sourceTimestamp: NOW,
    updatedAt: NOW,
    colorHex: "#36a2ef",
    companyName: "Hardingsmolt",
    ...extra,
  };
}

function vessel(
  assetId: number,
  name: string,
  latitude: number,
  longitude: number,
  extra: Partial<TrackedAssetPosition> = {}
): TrackedAssetPosition {
  return {
    assetId,
    type: "Boat",
    name,
    latitude,
    longitude,
    sourceTimestamp: NOW,
    updatedAt: NOW,
    colorHex: "#3a8fb7",
    headingDegrees: 210,
    speedKnots: 7.4,
    ...extra,
  };
}

// A little cluster of sites off the Bergen/Bømlo coast, plus two vessels.
const SITES: TrackedAssetPosition[] = [
  site(1, "Koløy N", 59.79, 5.05, { externalId: "12345" }),
  site(2, "Espevær V", 59.58, 5.13, {
    externalId: "23456",
    fishHealth: { summary: "ILA suspected", hasDisease: true },
  }),
  site(3, "Bømlo Ø", 59.76, 5.22),
  site(4, "Stord S", 59.72, 5.28),
  site(5, "Fitjar N", 59.92, 5.31),
  site(6, "Rubbestadneset", 59.78, 5.10),
  site(7, "Sveio", 59.55, 5.35),
];

const VESSELS: TrackedAssetPosition[] = [
  vessel(101, "RGS Barentshav", 59.74, 5.15),
  vessel(102, "RGS Nordsjø", 59.66, 5.20, { headingDegrees: 90, speedKnots: 0.3 }),
];

// Mock tracks (the real hook needs a backend). Ends at each vessel's position.
const TRAIL_DATA = trailsToFeatureCollection([
  {
    assetId: 101,
    color: "#ffd166",
    segments: [
      [
        [5.02, 59.82],
        [5.06, 59.8],
        [5.09, 59.78],
        [5.12, 59.76],
        [5.15, 59.74],
      ],
    ],
  },
  {
    assetId: 102,
    color: "#ef8a54",
    segments: [
      [
        [5.31, 59.6],
        [5.27, 59.62],
        [5.23, 59.64],
        [5.2, 59.66],
      ],
    ],
  },
]);

// A weighted "activity" blob for Explore mode (the real hook needs a backend).
// Golden-angle spiral so it fills evenly without needing Math.random.
const HEAT_DATA: GeoJSON.FeatureCollection<GeoJSON.Point> = {
  type: "FeatureCollection",
  features: Array.from({ length: 70 }, (_, i) => {
    const r = 0.03 * Math.sqrt(i / 70);
    const a = i * 2.399963; // golden angle (radians)
    return {
      type: "Feature",
      properties: { weight: 15 + (i % 45) },
      geometry: {
        type: "Point",
        coordinates: [5.16 + r * Math.cos(a), 59.74 + r * Math.sin(a)],
      },
    };
  }),
};

function Harness() {
  const [mode, setMode] = useState<MapModeId>("view");
  const [basemap, setBasemap] = useState<BasemapId>("hybrid");
  const [selected, setSelected] = useState<TrackedAssetPosition | null>(null);
  const [query, setQuery] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const ws = useWorkspace(["farms", "ships", "trails"]);
  const { isVisible, addLayer } = ws;
  const available = LAYER_CATALOG.filter((l) => !ws.layers.includes(l.id));

  // Export a layer's data as GeoJSON. Stub layers export an empty collection.
  const exportLayer = (id: CatalogLayerId) => {
    const data: GeoJSON.FeatureCollection =
      id === "farms"
        ? toFeatureCollection(SITES)
        : id === "ships"
          ? toFeatureCollection(VESSELS)
          : id === "trails"
            ? TRAIL_DATA
            : id === "activity"
              ? HEAT_DATA
              : { type: "FeatureCollection", features: [] };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const layersDrag = useDraggable({ x: 12, y: 62 });
  const toolsDrag = useDraggable({
    x: (typeof window !== "undefined" ? window.innerWidth : 1280) - 60,
    y: 240,
  });
  const survey = useSurvey();
  // Paper space: the live deliverable docked beside the map (model space).
  const [preview, setPreview] = useState<PreviewKind | null>(null);
  const [previewWidth, setPreviewWidth] = useState(560);
  const [report, setReport] = useState<ReportConfig>(defaultReportConfig);
  const authoredBounds = useMemo(
    () => surveyBounds(survey.points, survey.paths),
    [survey.paths, survey.points]
  );

  const allAssets = useMemo(() => [...VESSELS, ...SITES], []);
  // Live hits from the official register — so you can find a site by name or
  // locality number without having loaded any layer first.
  const registerHits = useSiteSearch(query);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Typed a coordinate? Offer a direct "go to" — handy for jumping to a job site.
    const coord = parseLatLng(query);
    if (coord) {
      const [lng, lat] = coord;
      const goto: TrackedAssetPosition = {
        assetId: -1,
        type: "Location",
        name: `→ Go to ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        latitude: lat,
        longitude: lng,
        sourceTimestamp: NOW,
        updatedAt: NOW,
      };
      return [goto];
    }
    const local = allAssets.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.externalId ?? "").toLowerCase().includes(q)
    );
    return [...local, ...registerHits].slice(0, 10);
  }, [query, allAssets, registerHits]);

  const flyTo = (p: TrackedAssetPosition) => {
    mapRef.current?.flyTo({ center: [p.longitude, p.latitude], zoom: 12, duration: 800 });
    setSelected(p);
    setQuery("");
  };

  const panelBase: CSSProperties = {
    position: "absolute",
    zIndex: 10,
    background: "rgba(10,20,26,0.9)",
    color: "#e6eef0",
    border: "1px solid #1d363f",
    borderRadius: 10,
    font: "13px/1.45 ui-sans-serif, system-ui, sans-serif",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  };
  const sectionHead: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 10,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    color: "#7a939b",
    margin: "0 0 6px",
  };

  return (
    <div className="gis">
      <MapCanvas
        basemapId={basemap}
        center={[5.2, 59.72]}
        zoom={9}
        rightInset={mode === "create" && preview ? previewWidth : 0}
        contentBounds={authoredBounds}
        viewStorageKey="fleo.gis.harness.last-view"
        onReady={(m) => {
          mapRef.current = m;
        }}
      >
        <SitesLayer data={SITES} visible={isVisible("farms")} opacity={100} labels />
        <VesselsLayer data={VESSELS} visible={isVisible("ships")} opacity={100} labels />
        <HeatmapLayer
          data={isVisible("activity") ? HEAT_DATA : null}
          enabled={isVisible("activity")}
          opacity={100}
        />
        <TrailsLayer
          data={isVisible("trails") ? TRAIL_DATA : null}
          enabled={isVisible("trails")}
          opacity={100}
        />
        <BathymetryLayer enabled={isVisible("bathymetry")} opacity={75} />
        <RegisterSitesLayer visible={isVisible("bw-sites")} />
        <NytekMooringsLayer visible={isVisible("nytek")} />
        {CLIENT_OPERATORS.map((c) => (
          <ClientSitesLayer key={c.id} client={c} visible={isVisible(clientLayerId(c))} />
        ))}
        {mode === "create" && (
          <SurveyLayer
            points={survey.points}
            paths={survey.paths}
            groups={survey.groups}
            drawMode={survey.drawMode}
            selectedId={survey.selectedId}
            selectedIds={survey.selectedIds}
            onAddPoint={survey.addPoint}
            onAddVertex={survey.addVertex}
            onFinishPath={survey.finishPath}
            onSelect={survey.setSelectedId}
            onMoveVertex={survey.moveVertex}
          />
        )}
        <MapSelection assets={allAssets} onSelect={setSelected} />
        <FeatureHoverCard
          assets={allAssets}
          layerIds={[LYR_SITE_POINT, LYR_VESSEL_POINT]}
          onViewDetails={setSelected}
        />
        <CoordinateReadout />
        <BasemapSwitcher value={basemap} onChange={setBasemap} />
      </MapCanvas>

      <ModeSwitcher value={mode} onChange={setMode} />
      <MapSearch value={query} onChange={setQuery} results={results} onSelect={flyTo} />
      {mode === "view" && (
        <ToolBar
          active={activeTool}
          onToggle={(id) => setActiveTool((cur) => (cur === id ? null : id))}
          pos={toolsDrag.pos}
          dragRef={toolsDrag.elRef}
          onGripDown={toolsDrag.onDragStart}
        />
      )}

      {/* ---- left: layers workspace (View mode only), draggable ---- */}
      {mode === "view" && (
        <div
          ref={layersDrag.elRef}
          style={{
            ...panelBase,
            left: layersDrag.pos.x,
            top: layersDrag.pos.y,
            width: 272,
            padding: 12,
            maxHeight: "calc(100% - 140px)",
            overflowY: "auto",
          }}
        >
          <div
            onMouseDown={layersDrag.onDragStart}
            title="Drag to move"
            aria-label="Move layers panel"
            style={{
              height: 14,
              margin: "-4px -6px 6px",
              display: "grid",
              placeItems: "center",
              color: "#5f767d",
              cursor: "grab",
              fontSize: 12,
            }}
          >
            ⠿
          </div>
          <LayerPanel
            workspace={ws}
            onAddLayers={() => setCatalogOpen(true)}
            onExportLayer={exportLayer}
          />
        </div>
      )}

      {mode === "create" && (
        <CreateWorkspace
          survey={survey}
          report={report}
          setReport={setReport}
          preview={preview}
          onPreview={setPreview}
        />
      )}

      {mode === "create" && preview && (
        <PreviewPane
          survey={survey}
          report={report}
          kind={preview}
          onKind={setPreview}
          onClose={() => setPreview(null)}
          width={previewWidth}
          onWidth={setPreviewWidth}
        />
      )}

      {/* ---- right: feature inspector (data-as-attributes) ---- */}
      {selected && (
        <div
          style={{
            ...panelBase,
            top: 12,
            right: 72,
            width: 236,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  opacity: 0.6,
                }}
              >
                {selected.type === "Location" ? "Farm site" : "Vessel"}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{selected.name}</div>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              style={{
                border: "none",
                background: "transparent",
                color: "#8aa1a8",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
            {selected.externalId ? ` · NO ${selected.externalId}` : ""}
            {selected.fishHealth?.hasDisease ? " · ⚠ disease" : ""}
          </div>
          <div style={{ borderTop: "1px solid #1d363f", paddingTop: 8 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity: 0.55,
                marginBottom: 6,
              }}
            >
              Attached data
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              <div>📄 Reports · <span style={{ opacity: 0.6 }}>3</span></div>
              <div>🖼 Images · <span style={{ opacity: 0.6 }}>12</span></div>
              <div>⏱ History · <span style={{ opacity: 0.6 }}>net wash, inspection…</span></div>
            </div>
            <div style={{ fontSize: 10, opacity: 0.5, marginTop: 8 }}>
              Stub — this is where a feature's attributes (the whole data warehouse) open.
            </div>
          </div>
        </div>
      )}

      <LayerBrowser
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        available={available}
        onAdd={addLayer}
      />
    </div>
  );
}

const container = document.getElementById("harness");
if (container) {
  const harnessGlobal = globalThis as typeof globalThis & {
    __fleoGisHarnessRoot?: ReturnType<typeof createRoot>;
  };
  const root = harnessGlobal.__fleoGisHarnessRoot ?? createRoot(container);
  harnessGlobal.__fleoGisHarnessRoot = root;
  root.render(<Harness />);
}
