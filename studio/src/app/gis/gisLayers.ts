import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type { TrackedAssetPosition } from "../../api/maps";

/**
 * Source and layer definitions for the GIS map.
 *
 * Kept apart from the React component so layer styling can be reasoned about
 * (and changed) without touching component state.
 */

export const SRC_SITES = "gis-sites";
export const SRC_VESSELS = "gis-vessels";
export const SRC_HEAT = "gis-heat";
export const SRC_TRAILS = "gis-trails";
export const SRC_BATHY = "gis-bathy";

export const LYR_SITE_CLUSTER = "gis-site-cluster";
export const LYR_SITE_CLUSTER_COUNT = "gis-site-cluster-count";
export const LYR_SITE_POINT = "gis-site-point";
export const LYR_SITE_LABEL = "gis-site-label";
export const LYR_VESSEL_POINT = "gis-vessel-point";
export const LYR_VESSEL_ARROW = "gis-vessel-arrow";
export const LYR_VESSEL_LABEL = "gis-vessel-label";
export const LYR_HEAT = "gis-heat-layer";
export const LYR_TRAILS = "gis-trails-layer";
export const LYR_BATHY = "gis-bathy-layer";

// Order roughly bottom-to-top. Bathymetry is a seabed raster and sits under all
// the overlays; markers stay on top.
export const ALL_LAYERS = [
  LYR_BATHY,
  LYR_HEAT,
  LYR_TRAILS,
  LYR_SITE_CLUSTER,
  LYR_SITE_CLUSTER_COUNT,
  LYR_SITE_POINT,
  LYR_SITE_LABEL,
  LYR_VESSEL_POINT,
  LYR_VESSEL_ARROW,
  LYR_VESSEL_LABEL,
];

export const ALL_SOURCES = [SRC_SITES, SRC_VESSELS, SRC_HEAT, SRC_TRAILS, SRC_BATHY];

export type PositionFeature = GeoJSON.Feature<GeoJSON.Point, Record<string, any>>;

export function toFeatureCollection(
  positions: TrackedAssetPosition[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: positions
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .map((p) => ({
        type: "Feature",
        id: p.assetId,
        properties: {
          assetId: p.assetId,
          name: p.name,
          type: p.type,
          externalId: p.externalId ?? "",
          color: p.colorHex ?? (p.type === "Location" ? "#2a9d8f" : "#3a8fb7"),
          heading: p.headingDegrees ?? 0,
          speed: p.speedKnots ?? 0,
          hasDisease: p.fishHealth?.hasDisease ? 1 : 0,
          company: p.companyName ?? "",
          updatedAt: p.sourceTimestamp,
        },
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
      })),
  };
}

/** Remove everything this module owns, in dependency order. */
export function teardown(map: MapLibreMap) {
  for (const id of ALL_LAYERS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of ALL_SOURCES) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

function setOrAdd(
  map: MapLibreMap,
  id: string,
  data: GeoJSON.FeatureCollection<GeoJSON.Geometry>,
  options: { cluster?: boolean } = {}
) {
  const existing = map.getSource(id) as GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data as any);
    return false;
  }
  map.addSource(id, {
    type: "geojson",
    data: data as any,
    cluster: options.cluster ?? false,
    clusterRadius: 46,
    clusterMaxZoom: 11,
  });
  return true;
}

export function renderSites(
  map: MapLibreMap,
  data: GeoJSON.FeatureCollection<GeoJSON.Point>
) {
  const isNew = setOrAdd(map, SRC_SITES, data, { cluster: true });
  if (!isNew) return;

  // Clusters: one clear circle with a count, sized by how much it contains.
  map.addLayer({
    id: LYR_SITE_CLUSTER,
    type: "circle",
    source: SRC_SITES,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#1d6f63",
      "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 30, 26],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 0.92,
    },
  });

  map.addLayer({
    id: LYR_SITE_CLUSTER_COUNT,
    type: "symbol",
    source: SRC_SITES,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 12,
    },
    paint: { "text-color": "#ffffff" },
  });

  // Individual sites. Red ring when disease is reported, so it reads instantly.
  map.addLayer({
    id: LYR_SITE_POINT,
    type: "circle",
    source: SRC_SITES,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 9],
      "circle-stroke-width": ["case", ["==", ["get", "hasDisease"], 1], 3, 2],
      "circle-stroke-color": [
        "case",
        ["==", ["get", "hasDisease"], 1],
        "#e53935",
        "#ffffff",
      ],
    },
  });

  map.addLayer({
    id: LYR_SITE_LABEL,
    type: "symbol",
    source: SRC_SITES,
    filter: ["!", ["has", "point_count"]],
    minzoom: 10.5,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-size": 11,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
      "text-allow-overlap": false,
    },
    paint: {
      // Halo rather than a background: keeps labels legible over both
      // satellite imagery and pale nautical charts.
      "text-color": "#0f1b2b",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.8,
    },
  });
}

const VESSEL_ICON = "gis-vessel-heading";

/**
 * A north-pointing arrowhead, white with a dark keyline so it reads on any
 * basemap. `icon-rotate` spins it to each vessel's heading. Built once from a
 * canvas and cached; re-registered after a style swap wipes the image cache.
 */
let vesselIconData: ImageData | null = null;
function getVesselIcon(): ImageData | null {
  if (vesselIconData) return vesselIconData;
  if (typeof document === "undefined") return null;
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.translate(size / 2, size / 2);
  ctx.beginPath();
  ctx.moveTo(0, -8.5); // tip (north)
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 3.5); // notch
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(9, 18, 26, 0.9)";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  vesselIconData = ctx.getImageData(0, 0, size, size);
  return vesselIconData;
}

function ensureVesselIcon(map: MapLibreMap) {
  if (map.hasImage(VESSEL_ICON)) return;
  const icon = getVesselIcon();
  if (icon) map.addImage(VESSEL_ICON, icon, { pixelRatio: 2 });
}

export function renderVessels(
  map: MapLibreMap,
  data: GeoJSON.FeatureCollection<GeoJSON.Point>
) {
  const isNew = setOrAdd(map, SRC_VESSELS, data);
  if (!isNew) return;

  ensureVesselIcon(map);

  map.addLayer({
    id: LYR_VESSEL_POINT,
    type: "circle",
    source: SRC_VESSELS,
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5.5, 14, 9],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  // The heading arrow sits on top of the coloured dot: identity from the colour,
  // direction from the arrow. Sized to overhang the dot so the bearing reads at
  // a glance, AIS-style.
  map.addLayer({
    id: LYR_VESSEL_ARROW,
    type: "symbol",
    source: SRC_VESSELS,
    layout: {
      "icon-image": VESSEL_ICON,
      "icon-rotate": ["coalesce", ["get", "heading"], 0],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 14, 1.5],
    },
  });

  map.addLayer({
    id: LYR_VESSEL_LABEL,
    type: "symbol",
    source: SRC_VESSELS,
    minzoom: 8.5,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 12,
      "text-offset": [0, 1.3],
      "text-anchor": "top",
    },
    paint: {
      "text-color": "#0b1420",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });
}

export function renderHeatmap(
  map: MapLibreMap,
  data: GeoJSON.FeatureCollection<GeoJSON.Point>
) {
  const isNew = setOrAdd(map, SRC_HEAT, data);
  if (!isNew) return;

  map.addLayer(
    {
      id: LYR_HEAT,
      type: "heatmap",
      source: SRC_HEAT,
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 60, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 14, 3],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 10, 24, 16, 44],
        "heatmap-opacity": 0.72,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(0,0,0,0)",
          0.2, "rgba(58,143,183,0.5)",
          0.4, "rgba(42,157,143,0.68)",
          0.6, "rgba(233,196,106,0.8)",
          0.8, "rgba(231,111,81,0.88)",
          1, "rgba(198,40,40,0.95)",
        ],
      },
    },
    // Always beneath the markers.
    map.getLayer(LYR_SITE_CLUSTER) ? LYR_SITE_CLUSTER : undefined
  );
}

/** One vessel's broken-up track, ready to draw as coloured lines. */
export type VesselTrail = {
  assetId: number;
  color: string;
  /** Segments of `[lng, lat]` points, already split on impossible jumps. */
  segments: [number, number][][];
};

export function trailsToFeatureCollection(
  trails: VesselTrail[]
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const trail of trails) {
    for (const line of trail.segments) {
      if (line.length < 2) continue;
      features.push({
        type: "Feature",
        properties: { assetId: trail.assetId, color: trail.color },
        geometry: { type: "LineString", coordinates: line },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export function renderTrails(
  map: MapLibreMap,
  data: GeoJSON.FeatureCollection<GeoJSON.LineString>
) {
  const isNew = setOrAdd(map, SRC_TRAILS, data);
  if (!isNew) return;

  map.addLayer(
    {
      id: LYR_TRAILS,
      type: "line",
      source: SRC_TRAILS,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 12, 3, 16, 4.5],
        "line-opacity": 0.85,
      },
    },
    // Beneath the vessel markers, so the dot sits on top of its own trail.
    map.getLayer(LYR_VESSEL_POINT) ? LYR_VESSEL_POINT : undefined
  );
}

// EMODnet Bathymetry — the coloured mean-depth surface. Keyless, CORS-open,
// Web Mercator tiles (verified). See src/app/gis/WISHLIST.md (Olex research).
const EMODNET_BATHYMETRY_TILES =
  "https://tiles.emodnet-bathymetry.eu/latest/mean_multicolour/web_mercator/{z}/{x}/{y}.png";
const EMODNET_ATTRIBUTION =
  '<a href="https://emodnet.ec.europa.eu/en/bathymetry" target="_blank" rel="noopener">EMODnet Bathymetry</a>';

/**
 * Seabed depth as a raster underlay. Added beneath every other custom layer so
 * markers and overlays stay on top. NOTE: the EMODnet host must be in the
 * production CSP `img-src` (docs/csp.md) or tiles are blocked outside dev.
 */
export function renderBathymetry(map: MapLibreMap, opacity: number) {
  if (!map.getSource(SRC_BATHY)) {
    map.addSource(SRC_BATHY, {
      type: "raster",
      tiles: [EMODNET_BATHYMETRY_TILES],
      tileSize: 256,
      maxzoom: 12,
      attribution: EMODNET_ATTRIBUTION,
    });
  }
  if (!map.getLayer(LYR_BATHY)) {
    map.addLayer({
      id: LYR_BATHY,
      type: "raster",
      source: SRC_BATHY,
      paint: { "raster-opacity": opacity },
    });
  }
  const above = ALL_LAYERS.find((id) => id !== LYR_BATHY && map.getLayer(id));
  if (above) map.moveLayer(LYR_BATHY, above);
}

/** Opacity for a layer, using whichever paint property its type supports. */
export function setLayerOpacity(
  map: MapLibreMap,
  id: string,
  kind: "circle" | "heatmap" | "symbol" | "line" | "raster",
  opacity: number
) {
  if (!map.getLayer(id)) return;
  const prop =
    kind === "circle"
      ? "circle-opacity"
      : kind === "heatmap"
        ? "heatmap-opacity"
        : kind === "line"
          ? "line-opacity"
          : kind === "raster"
            ? "raster-opacity"
            : "text-opacity";
  map.setPaintProperty(id, prop, opacity);
  if (kind === "circle") {
    map.setPaintProperty(id, "circle-stroke-opacity", opacity);
  }
}

export function setLayerVisible(map: MapLibreMap, ids: string[], visible: boolean) {
  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }
}
