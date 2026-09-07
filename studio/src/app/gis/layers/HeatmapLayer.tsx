import { useEffect } from "react";

import { useMapContext } from "../core/MapContext";
import { LYR_HEAT, SRC_HEAT, renderHeatmap, setLayerOpacity } from "../gisLayers";

type Props = {
  data: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  enabled: boolean;
  /** 0–100. */
  opacity: number;
};

/**
 * Dwell-weighted vessel-activity surface. Removes itself entirely when off,
 * rather than merely hiding, so it never weighs on the map when unused.
 */
export function HeatmapLayer({ data, enabled, opacity }: Props) {
  const { map, ready, styleEpoch } = useMapContext();

  useEffect(() => {
    if (!map || !ready) return;
    if (enabled && data) {
      renderHeatmap(map, data);
    } else if (map.getLayer(LYR_HEAT)) {
      map.removeLayer(LYR_HEAT);
      if (map.getSource(SRC_HEAT)) map.removeSource(SRC_HEAT);
    }
  }, [map, ready, enabled, data, styleEpoch]);

  useEffect(() => {
    if (!map || !ready) return;
    setLayerOpacity(map, LYR_HEAT, "heatmap", opacity / 100);
  }, [map, ready, opacity, enabled, data, styleEpoch]);

  return null;
}
