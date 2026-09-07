import type { StyleSpecification } from "maplibre-gl";

/**
 * Base maps available on the live map.
 *
 * All sources here are open and keyless. Kartverket is the Norwegian national
 * mapping authority: its nautical raster charts are the same charts the crews
 * already use on the bridge, which makes them the most useful backdrop for
 * marine operations. Esri World Imagery gives recent satellite coverage.
 *
 * NOTE: these hosts must be present in `img-src` in the production CSP
 * (see docs/csp.md) or the tiles will be blocked outside local development.
 */

export type BasemapId =
  | "satellite"
  | "hybrid"
  | "nautical"
  | "topo"
  | "light"
  | "dark";

export type BasemapDefinition = {
  id: BasemapId;
  /** i18n key suffix under `maps.basemap.` */
  labelKey: string;
  /** Whether labels/markers need light text on a dark backdrop. */
  dark: boolean;
  style: StyleSpecification;
};

const ESRI_IMAGERY =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_REFERENCE =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const KARTVERKET = (layer: string) =>
  `https://cache.kartverket.no/v1/wmts/1.0.0/${layer}/default/webmercator/{z}/{y}/{x}.png`;

const ESRI_ATTRIBUTION =
  "Esri, Maxar, Earthstar Geographics";
const KARTVERKET_ATTRIBUTION =
  '<a href="https://www.kartverket.no/">Kartverket</a>';

/** A style built from one or more raster tile layers. */
function rasterStyle(
  layers: { id: string; tiles: string; attribution: string; maxzoom?: number; opacity?: number }[]
): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  for (const layer of layers) {
    sources[layer.id] = {
      type: "raster",
      tiles: [layer.tiles],
      tileSize: 256,
      maxzoom: layer.maxzoom ?? 19,
      attribution: layer.attribution,
    };
  }

  return {
    version: 8,
    // Glyphs are required for any symbol layer added on top of the base style.
    // NOTE: must be Carto's font host (not the old positron-gl-style path, which
    // now 404s) — that outage silently kills every map label, since MapLibre
    // needs the glyph PBF before it can draw any text.
    glyphs: "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf",
    sources,
    layers: layers.map((layer) => ({
      id: `${layer.id}-layer`,
      type: "raster" as const,
      source: layer.id,
      paint: layer.opacity === undefined ? {} : { "raster-opacity": layer.opacity },
    })),
  };
}

/** A hosted vector style referenced by URL. */
function vectorStyle(url: string): StyleSpecification {
  // MapLibre accepts a URL string, but keeping one shape simplifies the caller.
  return url as unknown as StyleSpecification;
}

export const BASEMAPS: BasemapDefinition[] = [
  {
    id: "satellite",
    labelKey: "satellite",
    dark: true,
    style: rasterStyle([
      { id: "esri-imagery", tiles: ESRI_IMAGERY, attribution: ESRI_ATTRIBUTION, maxzoom: 19 },
    ]),
  },
  {
    id: "hybrid",
    labelKey: "hybrid",
    dark: true,
    style: rasterStyle([
      { id: "esri-imagery", tiles: ESRI_IMAGERY, attribution: ESRI_ATTRIBUTION, maxzoom: 19 },
      {
        id: "esri-reference",
        tiles: ESRI_REFERENCE,
        attribution: ESRI_ATTRIBUTION,
        maxzoom: 19,
      },
    ]),
  },
  {
    id: "nautical",
    labelKey: "nautical",
    dark: false,
    style: rasterStyle([
      {
        id: "kartverket-sjokart",
        tiles: KARTVERKET("sjokartraster"),
        attribution: KARTVERKET_ATTRIBUTION,
        maxzoom: 18,
      },
    ]),
  },
  {
    id: "topo",
    labelKey: "topo",
    dark: false,
    style: rasterStyle([
      {
        id: "kartverket-topo",
        tiles: KARTVERKET("topo"),
        attribution: KARTVERKET_ATTRIBUTION,
        maxzoom: 18,
      },
    ]),
  },
  {
    id: "light",
    labelKey: "light",
    dark: false,
    style: vectorStyle("https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"),
  },
  {
    id: "dark",
    labelKey: "dark",
    dark: true,
    style: vectorStyle("https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"),
  },
];

export const DEFAULT_BASEMAP: BasemapId = "hybrid";

export function getBasemap(id: BasemapId): BasemapDefinition {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
}

/**
 * A single representative tile per basemap, used as a preview swatch in the
 * basemap picker. Framed over Bergen (z10) so every thumbnail sits over land —
 * terrain, streets, chart detail and harbour all read clearly, rather than open
 * sea. Loaded as a plain <img>, so cross-origin restrictions on the vector
 * styles don't apply here.
 */
export function getBasemapThumbnail(id: BasemapId): string {
  const z = 10;
  const x = 527;
  const y = 295;
  switch (id) {
    case "satellite":
    case "hybrid":
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    case "nautical":
      return `https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/${z}/${y}/${x}.png`;
    case "topo":
      return `https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/${z}/${y}/${x}.png`;
    case "dark":
      return `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
    case "light":
    default:
      return `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
  }
}

/** Short display label for a basemap, for pickers and chrome. */
export function basemapLabel(id: BasemapId): string {
  switch (id) {
    case "satellite":
      return "Satellite";
    case "hybrid":
      return "Satellite";
    case "nautical":
      return "Nautical";
    case "topo":
      return "Topo";
    case "dark":
      return "Dark";
    case "light":
    default:
      return "Street";
  }
}

const STORAGE_KEY = "fo.map.basemap";

export function readStoredBasemap(): BasemapId {
  if (typeof window === "undefined") return DEFAULT_BASEMAP;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && BASEMAPS.some((b) => b.id === stored)) {
    return stored as BasemapId;
  }
  return DEFAULT_BASEMAP;
}

export function storeBasemap(id: BasemapId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable - fall back to session-only selection */
  }
}
