import { useEffect } from "react";

import { useMapContext } from "../core/MapContext";
import { LYR_BATHY, SRC_BATHY, renderBathymetry, setLayerOpacity } from "../gisLayers";

type Props = {
  enabled: boolean;
  /** 0–100. */
  opacity: number;
};

/**
 * Seabed depth (EMODnet) — the first *public* dataset wired to real tiles.
 *
 * A raster underlay rather than a GeoJSON overlay, so it behaves a little
 * differently from the point layers: no per-feature data, just tiles beneath
 * everything else.
 */
export function BathymetryLayer({ enabled, opacity }: Props) {
  const { map, ready, styleEpoch } = useMapContext();

  useEffect(() => {
    if (!map || !ready) return;
    if (enabled) {
      renderBathymetry(map, opacity / 100);
    } else if (map.getLayer(LYR_BATHY)) {
      map.removeLayer(LYR_BATHY);
      if (map.getSource(SRC_BATHY)) map.removeSource(SRC_BATHY);
    }
  }, [map, ready, enabled, styleEpoch]);

  useEffect(() => {
    if (!map || !ready) return;
    setLayerOpacity(map, LYR_BATHY, "raster", opacity / 100);
  }, [map, ready, opacity, enabled, styleEpoch]);

  return null;
}
