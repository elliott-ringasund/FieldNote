import { useEffect, useRef, useState, type ReactNode } from "react";
import maplibregl, {
  type LngLatBoundsLike,
  type Map as MapLibreMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { getBasemap, type BasemapId } from "../../maps/basemaps";
import { MapContext } from "./MapContext";

type Props = {
  /** Which basemap style to show. Changing it swaps the style in place. */
  basemapId: BasemapId;
  center?: [number, number];
  zoom?: number;
  /** Called once, when the map has finished its first load. */
  onReady?: (map: MapLibreMap) => void;
  /**
   * Space to leave on the right — for a docked preview pane (paper space).
   * The canvas resizes without changing the operator's chosen extent.
   */
  rightInset?: number;
  /** Bounds used by the explicit zoom-to-extent button. Never applied automatically. */
  contentBounds?: LngLatBoundsLike | null;
  /** Persist the last manually chosen camera for this workspace. */
  viewStorageKey?: string;
  /** Layers and overlays. They read the map through `useMapContext()`. */
  children?: ReactNode;
};

/**
 * The map, and nothing about any particular screen.
 *
 * Owns the MapLibre instance: creation, basemap switching, the scale and
 * attribution controls, zoom buttons, and teardown. Everything screen-specific
 * — which layers, which panels — is composed in by the page that mounts this.
 *
 * Imperative page actions (fly-to a search result) use the map handed back by
 * `onReady`; declarative overlays consume the same map through context. Two
 * doors to one map: the ref for "do this now", the context for "draw this".
 */
export default function MapCanvas({
  basemapId,
  center = [5.3, 60.0],
  zoom = 8,
  onReady,
  rightInset = 0,
  contentBounds = null,
  viewStorageKey = "fleo.gis.last-view",
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [styleEpoch, setStyleEpoch] = useState(0);
  const [locating, setLocating] = useState(false);

  // The basemap the map is created with. Later changes go through setStyle
  // below rather than rebuilding the map, so this is only read once.
  const initialBasemap = useRef(basemapId);

  // ---------------------------------------------------------------- init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let savedView: { center: [number, number]; zoom: number; bearing?: number; pitch?: number } | null = null;
    try {
      const raw = window.localStorage.getItem(viewStorageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (
        parsed && Array.isArray(parsed.center) && parsed.center.length === 2 &&
        parsed.center.every(Number.isFinite) && Number.isFinite(parsed.zoom)
      ) {
        savedView = parsed;
      }
    } catch {
      savedView = null;
    }

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: getBasemap(initialBasemap.current).style as any,
      center: savedView?.center ?? center,
      zoom: savedView?.zoom ?? zoom,
      bearing: savedView?.bearing ?? 0,
      pitch: savedView?.pitch ?? 0,
      minZoom: 3,
      maxZoom: 18,
      attributionControl: false,
    });

    // Scale + attribution both bottom-right, leaving the bottom-left corner for
    // the basemap switcher (Google-Maps style) and bottom-centre for coords.
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 130, unit: "metric" }), "bottom-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    m.once("load", () => {
      setReady(true);
      onReadyRef.current?.(m);
    });
    const rememberView = () => {
      const current = m.getCenter();
      try {
        window.localStorage.setItem(
          viewStorageKey,
          JSON.stringify({
            center: [current.lng, current.lat],
            zoom: m.getZoom(),
            bearing: m.getBearing(),
            pitch: m.getPitch(),
          })
        );
      } catch {
        // A private/locked-down browser can reject storage; the map still works.
      }
    };
    m.on("moveend", rememberView);

    mapRef.current = m;
    setMap(m);

    return () => {
      m.off("moveend", rememberView);
      m.remove();
      mapRef.current = null;
      setMap(null);
      setReady(false);
    };
    // Created once; center/zoom are initial values captured at construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------ basemap style swap
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;

    // setStyle drops every custom source/layer; bump the epoch once the new
    // style has settled so overlays know to re-add themselves.
    const onStyle = () => {
      setStyleEpoch((n) => n + 1);
      m.off("styledata", onStyle);
    };
    m.on("styledata", onStyle);
    m.setStyle(getBasemap(basemapId).style as any);
    // `ready` deliberately excluded: the map is created with the initial style
    // already applied, so this must run only on subsequent basemap changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemapId]);

  // MapLibre sizes its canvas from the container, so it must be told when the
  // container changes — docking a pane beside it would otherwise clip the view.
  useEffect(() => {
    const el = containerRef.current;
    const m = mapRef.current;
    if (!el || !m) return;
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);

  return (
    <>
      <div ref={containerRef} className="gis-canvas" style={{ right: rightInset }} />

      <div className="gis-zoom">
        <button onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">
          −
        </button>
        <button
          onClick={() => {
            if (contentBounds) mapRef.current?.fitBounds(contentBounds, { padding: 60, duration: 500 });
          }}
          aria-label="Zoom to survey extent"
          title="Zoom to survey extent"
          disabled={!contentBounds}
        >
          ⛶
        </button>
        <button
          onClick={() => {
            if (!navigator.geolocation || locating) return;
            setLocating(true);
            navigator.geolocation.getCurrentPosition(
              ({ coords }) => {
                mapRef.current?.flyTo({ center: [coords.longitude, coords.latitude], zoom: Math.max(14, mapRef.current?.getZoom() ?? 14), duration: 700 });
                setLocating(false);
              },
              () => setLocating(false),
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
            );
          }}
          aria-label="Go to my current position"
          title="Go to my current position"
          disabled={locating}
        >
          {locating ? "…" : "◎"}
        </button>
      </div>

      <MapContext.Provider value={{ map, ready, styleEpoch }}>{children}</MapContext.Provider>
    </>
  );
}
