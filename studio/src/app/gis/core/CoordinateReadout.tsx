import { useEffect, useRef, useState } from "react";
import type { MapMouseEvent } from "maplibre-gl";

import { useMapContext } from "./MapContext";
import "./CoordinateReadout.css";

/** Decimal degrees, 5 places ≈ ~1 m — enough to point at a mooring shackle. */
function fmt(value: number): string {
  return value.toFixed(5);
}

/**
 * Live cursor position, bottom-centre, click-to-copy.
 *
 * Shown as `lat, lng` — the order Google Maps, Olex and most chart tools expect
 * on paste. Chrome, not a layer: it reads the shared map from context and can
 * be dropped into any app that mounts <MapCanvas>.
 */
export function CoordinateReadout() {
  const { map, ready } = useMapContext();
  const [pos, setPos] = useState<{ lng: number; lat: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!map || !ready) return;
    const onMove = (e: MapMouseEvent) => setPos({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    map.on("mousemove", onMove);
    return () => {
      map.off("mousemove", onMove);
    };
  }, [map, ready]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  const text = pos ? `${fmt(pos.lat)}, ${fmt(pos.lng)}` : "—";

  const copy = async () => {
    if (!pos) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked (insecure context) — the value is still selectable.
    }
  };

  return (
    <button
      type="button"
      className="gis-coords"
      onClick={copy}
      title="Click to copy — pastes into Google Maps, Olex, etc."
      aria-label={pos ? `Coordinates ${text}, click to copy` : "Move the cursor over the map"}
    >
      <span className="gis-coords-label">LAT, LON</span>
      <span className="gis-coords-value">{text}</span>
      <span className={`gis-coords-hint${copied ? " copied" : ""}`}>{copied ? "COPIED" : "⧉"}</span>
    </button>
  );
}
