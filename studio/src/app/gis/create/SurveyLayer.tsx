import { useEffect } from "react";
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent } from "maplibre-gl";

import { useMapContext } from "../core/MapContext";
import { statusColor } from "./deliverable";
import { bearingDeg, fmtBearing, fmtLength, pathLengthM, type LngLat } from "./geo";
import {
  LINE_STYLES,
  type DrawMode,
  type FeatureStyle,
  type SurveyGroup,
  type SurveyPath,
  type SurveyPoint,
} from "./useSurvey";

/** Build a line's label text from the group's chosen field. */
function labelFor(p: SurveyPath, field: string): string {
  const len = fmtLength(pathLengthM(p.vertices, p.kind === "area"));
  switch (field) {
    case "name":
      return p.name;
    case "name-length":
      return `${p.name} · ${len}`;
    case "length":
      return len;
    case "bearing-length":
      return p.vertices.length >= 2
        ? `${fmtBearing(bearingDeg(p.vertices[0], p.vertices[1]))} · ${len}`
        : len;
    case "status":
      return p.status.toUpperCase();
    default:
      return "";
  }
}

/** Resolve a feature's drawn style from its group (falling back to status). */
function styleOf(
  feature: {
    status: SurveyPoint["status"];
    groupId?: string;
    visible?: boolean;
    style?: FeatureStyle;
  },
  groups: SurveyGroup[]
) {
  const group = groups.find((g) => g.id === feature.groupId);
  const own = feature.style ?? {};
  // Cascade: the feature's own override wins, then its group, then defaults.
  const base = group
    ? {
        color: group.colorMode === "fixed" ? group.color : statusColor(feature.status),
        opacity: group.opacity / 100,
        width: group.width,
        visible: group.visible,
        labels: group.labels,
        labelSize: group.labelSize,
        labelField: group.labelField ?? ("name" as const),
        symbol: group.symbol ?? ("circle" as const),
        lineStyle: group.lineStyle ?? ("solid" as const),
      }
    : {
        color: statusColor(feature.status),
        opacity: 1,
        width: 2.5,
        visible: true,
        labels: true,
        labelSize: 11,
        labelField: "name" as const,
        symbol: "circle" as const,
        lineStyle: "solid" as const,
      };
  return {
    ...base,
    color: own.color ?? base.color,
    width: own.width ?? base.width,
    symbol: own.symbol ?? base.symbol,
    lineStyle: own.lineStyle ?? base.lineStyle,
    // A feature can be hidden on its own, but a hidden group hides everything.
    visible: base.visible && feature.visible !== false,
  };
}

/**
 * Marker shapes as canvas-drawn images.
 *
 * MapLibre can only vary a circle layer's radius, not its shape, so anything
 * other than a dot has to be an icon. White fill + dark keyline keeps them
 * legible over both imagery and chart, and `icon-color` tints them per feature.
 */
const SHAPE_PATHS: Record<string, (ctx: CanvasRenderingContext2D, r: number) => void> = {
  circle: (c, r) => c.arc(0, 0, r, 0, Math.PI * 2),
  square: (c, r) => c.rect(-r, -r, r * 2, r * 2),
  triangle: (c, r) => {
    c.moveTo(0, -r * 1.15);
    c.lineTo(r, r * 0.8);
    c.lineTo(-r, r * 0.8);
    c.closePath();
  },
  diamond: (c, r) => {
    c.moveTo(0, -r * 1.2);
    c.lineTo(r * 1.1, 0);
    c.lineTo(0, r * 1.2);
    c.lineTo(-r * 1.1, 0);
    c.closePath();
  },
};

function ensureShapeIcons(map: maplibregl.Map) {
  for (const [name, draw] of Object.entries(SHAPE_PATHS)) {
    const id = `survey-${name}`;
    if (map.hasImage(id)) continue;
    const size = 26;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    draw(ctx, 8);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(9,18,26,0.85)";
    ctx.stroke();
    map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: 2, sdf: true });
  }
}

const SRC_PTS = "survey-points";
const LYR_PTS = "survey-points-layer";
const LYR_PTS_LABEL = "survey-points-label";
const SRC_PATHS = "survey-paths";
const LYR_AREA_FILL = "survey-area-fill";
const LYR_PATH_LINE = "survey-path-line";
const SRC_SEGLABELS = "survey-seglabels";
const LYR_SEGLABELS = "survey-seglabels-layer";
const SRC_VERTS = "survey-verts";
const LYR_VERTS = "survey-verts-layer";

type Props = {
  points: SurveyPoint[];
  paths: SurveyPath[];
  groups: SurveyGroup[];
  drawMode: DrawMode;
  selectedId: string | null;
  selectedIds?: string[];
  onAddPoint: (lng: number, lat: number) => void;
  onAddVertex: (v: LngLat) => void;
  onFinishPath: () => void;
  onSelect: (id: string) => void;
  onMoveVertex: (id: string, index: number, v: LngLat) => void;
};

/**
 * Renders the authored survey (points, lines, areas) with GIS-style segment
 * labels (bearing · length), handles draw clicks per mode, and — when a path
 * is selected — shows draggable vertex handles for manual fix-ups.
 */
export function SurveyLayer({
  points,
  paths,
  groups,
  drawMode,
  selectedId,
  selectedIds,
  onAddPoint,
  onAddVertex,
  onFinishPath,
  onSelect,
  onMoveVertex,
}: Props) {
  const { map, ready, styleEpoch } = useMapContext();

  // ------------------------------------------------------------- render data
  useEffect(() => {
    if (!map || !ready) return;

    const ptsFc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: points
        .filter((p) => styleOf(p, groups).visible)
        .map((p) => {
          const s = styleOf(p, groups);
          return {
            type: "Feature",
            properties: {
              id: p.id,
              name: s.labels ? p.name : "",
              sel: (selectedIds ?? []).includes(p.id) || p.id === selectedId ? 1 : 0,
              color: s.color,
              opacity: s.opacity,
              labelSize: s.labelSize,
              icon: `survey-${s.symbol}`,
            },
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          };
        }),
    };

    const pathsFc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: paths
        .filter((p) => p.vertices.length >= 2 && styleOf(p, groups).visible)
        .map((p) => {
          const s = styleOf(p, groups);
          return {
            type: "Feature",
            properties: {
              id: p.id,
              kind: p.kind,
              sel: (selectedIds ?? []).includes(p.id) || p.id === selectedId ? 1 : 0,
              color: s.color,
              opacity: s.opacity,
              width: s.width,
              style: s.lineStyle,
            },
            geometry:
              p.kind === "area" && p.vertices.length >= 3
                ? { type: "Polygon", coordinates: [[...p.vertices, p.vertices[0]]] }
                : { type: "LineString", coordinates: p.vertices },
          };
        }),
    };

    // One label per line, drawn along it. Labelling every leg with a bearing
    // turns a mooring spread into noise; QGIS labels the feature, not the leg.
    const segFeatures: GeoJSON.Feature[] = [];
    for (const p of paths) {
      const s = styleOf(p, groups);
      if (!s.visible || !s.labels || s.labelField === "none" || p.vertices.length < 2) continue;
      const label = labelFor(p, s.labelField);
      if (!label) continue;
      segFeatures.push({
        type: "Feature",
        properties: { label, labelSize: s.labelSize },
        geometry: { type: "LineString", coordinates: p.vertices },
      });
    }
    const segFc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: segFeatures };

    // Vertex handles for the selected path.
    const selPath = paths.find((p) => p.id === selectedId);
    const vertsFc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (selPath?.vertices ?? []).map((v, i) => ({
        type: "Feature",
        properties: { pathId: selPath!.id, index: i },
        geometry: { type: "Point", coordinates: v },
      })),
    };

    const setOr = (id: string, fc: GeoJSON.FeatureCollection) => {
      const src = map.getSource(id) as GeoJSONSource | undefined;
      if (src) src.setData(fc);
      return !src;
    };

    if (setOr(SRC_PATHS, pathsFc)) {
      map.addSource(SRC_PATHS, { type: "geojson", data: pathsFc });
      map.addLayer({
        id: LYR_AREA_FILL,
        type: "fill",
        source: SRC_PATHS,
        filter: ["==", ["get", "kind"], "area"],
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["*", ["get", "opacity"], 0.16],
        },
      });
      // line-dasharray can't be data-driven, so each dash pattern is its own
      // layer, filtered by the feature's style.
      for (const s of LINE_STYLES) {
        map.addLayer({
          id: s.id === "solid" ? LYR_PATH_LINE : `${LYR_PATH_LINE}-${s.id}`,
          type: "line",
          source: SRC_PATHS,
          filter: ["==", ["get", "style"], s.id],
          layout: { "line-join": "round", "line-cap": s.dash ? "butt" : "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": [
              "case",
              ["==", ["get", "sel"], 1],
              ["+", ["get", "width"], 1.5],
              ["get", "width"],
            ],
            "line-opacity": ["get", "opacity"],
            ...(s.dash ? { "line-dasharray": s.dash } : {}),
          },
        });
      }
    }
    if (setOr(SRC_SEGLABELS, segFc)) {
      map.addSource(SRC_SEGLABELS, { type: "geojson", data: segFc });
      map.addLayer({
        id: LYR_SEGLABELS,
        type: "symbol",
        source: SRC_SEGLABELS,
        layout: {
          "text-field": ["get", "label"],
          "text-size": ["coalesce", ["get", "labelSize"], 11],
          "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
          // Ride along the line and let MapLibre drop colliding labels —
          // that decluttering is what keeps a dense spread readable.
          "symbol-placement": "line-center",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-padding": 3,
        },
        paint: { "text-color": "#ffffff", "text-halo-color": "#0b1420", "text-halo-width": 1.8 },
      });
    }
    if (setOr(SRC_PTS, ptsFc)) {
      map.addSource(SRC_PTS, { type: "geojson", data: ptsFc });
      ensureShapeIcons(map);
      map.addLayer({
        id: LYR_PTS,
        type: "symbol",
        source: SRC_PTS,
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": ["case", ["==", ["get", "sel"], 1], 0.85, 0.65],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-color": ["get", "color"],
          "icon-opacity": ["get", "opacity"],
          "icon-halo-color": "#ffffff",
          "icon-halo-width": 1.4,
        },
      });
      map.addLayer({
        id: LYR_PTS_LABEL,
        type: "symbol",
        source: SRC_PTS,
        layout: {
          "text-field": ["get", "name"],
          "text-size": ["get", "labelSize"],
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff", "text-halo-color": "#0b1420", "text-halo-width": 1.6 },
      });
    }
    if (setOr(SRC_VERTS, vertsFc)) {
      map.addSource(SRC_VERTS, { type: "geojson", data: vertsFc });
      map.addLayer({
        id: LYR_VERTS,
        type: "circle",
        source: SRC_VERTS,
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": 5,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#e76f51",
        },
      });
    }
  }, [map, ready, points, paths, groups, selectedId, selectedIds, styleEpoch]);

  // ------------------------------------------------- click: draw or select
  useEffect(() => {
    if (!map || !ready) return;
    const onClick = (e: MapMouseEvent) => {
      if (drawMode === "point") {
        onAddPoint(e.lngLat.lng, e.lngLat.lat);
        return;
      }
      if (drawMode === "line" || drawMode === "area") {
        onAddVertex([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      const layers = [LYR_PTS, LYR_PATH_LINE, LYR_AREA_FILL].filter((l) => map.getLayer(l));
      const hits = map.queryRenderedFeatures(e.point, { layers });
      if (hits.length > 0) onSelect(String(hits[0].properties?.id));
    };
    map.on("click", onClick);
    const onDoubleClick = (event: MapMouseEvent) => {
      if (drawMode !== "line" && drawMode !== "area") return;
      event.preventDefault();
      onFinishPath();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (drawMode !== "line" && drawMode !== "area") return;
      if (event.key === "Enter" || event.key === "Escape") onFinishPath();
    };
    if (drawMode === "line" || drawMode === "area") map.doubleClickZoom.disable();
    map.on("dblclick", onDoubleClick);
    window.addEventListener("keydown", onKeyDown);
    map.getCanvas().style.cursor = drawMode ? "crosshair" : "";
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDoubleClick);
      window.removeEventListener("keydown", onKeyDown);
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    };
  }, [map, ready, drawMode, onAddPoint, onAddVertex, onFinishPath, onSelect]);

  // ---------------------------------------------- vertex dragging (fix-ups)
  useEffect(() => {
    if (!map || !ready) return;
    let dragging: { pathId: string; index: number } | null = null;

    const onDown = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      dragging = { pathId: String(f.properties?.pathId), index: Number(f.properties?.index) };
      map.dragPan.disable();
      e.preventDefault();
    };
    const onMove = (e: MapMouseEvent) => {
      if (!dragging) return;
      onMoveVertex(dragging.pathId, dragging.index, [e.lngLat.lng, e.lngLat.lat]);
    };
    const onUp = () => {
      dragging = null;
      map.dragPan.enable();
    };
    const enter = () => {
      if (!drawMode) map.getCanvas().style.cursor = "move";
    };
    const leave = () => {
      if (!drawMode) map.getCanvas().style.cursor = "";
    };

    map.on("mousedown", LYR_VERTS, onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);
    map.on("mouseenter", LYR_VERTS, enter);
    map.on("mouseleave", LYR_VERTS, leave);
    return () => {
      map.off("mousedown", LYR_VERTS, onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      map.off("mouseenter", LYR_VERTS, enter);
      map.off("mouseleave", LYR_VERTS, leave);
    };
  }, [map, ready, drawMode, onMoveVertex]);

  return null;
}
