import { useEffect } from "react";

import { useMapContext } from "../core/MapContext";
import { LYR_TRAILS, SRC_TRAILS, renderTrails, setLayerOpacity } from "../gisLayers";

type Props = {
  data: GeoJSON.FeatureCollection<GeoJSON.LineString> | null;
  enabled: boolean;
  /** 0–100. */
  opacity: number;
};

/**
 * Where the fleet has been — recent vessel tracks as coloured lines.
 *
 * The first feature-layer ported from the old monolith onto the shared core.
 * Adding it was: a render fn + a data hook + this component + a toggle — the
 * whole point of the layer-module pattern.
 */
export function TrailsLayer({ data, enabled, opacity }: Props) {
  const { map, ready, styleEpoch } = useMapContext();

  useEffect(() => {
    if (!map || !ready) return;
    if (enabled && data) {
      renderTrails(map, data);
    } else if (map.getLayer(LYR_TRAILS)) {
      map.removeLayer(LYR_TRAILS);
      if (map.getSource(SRC_TRAILS)) map.removeSource(SRC_TRAILS);
    }
  }, [map, ready, enabled, data, styleEpoch]);

  useEffect(() => {
    if (!map || !ready) return;
    setLayerOpacity(map, LYR_TRAILS, "line", opacity / 100);
  }, [map, ready, opacity, enabled, data, styleEpoch]);

  return null;
}
