import { useEffect } from "react";

import type { TrackedAssetPosition } from "../../../api/maps";
import { useMapContext } from "../core/MapContext";
import {
  LYR_VESSEL_ARROW,
  LYR_VESSEL_LABEL,
  LYR_VESSEL_POINT,
  renderVessels,
  setLayerOpacity,
  setLayerVisible,
  toFeatureCollection,
} from "../gisLayers";

type Props = {
  data: TrackedAssetPosition[];
  visible: boolean;
  /** 0–100. */
  opacity: number;
  labels: boolean;
};

/** Fleet vessels (and vehicles) as live points, labelled when zoomed in. */
export function VesselsLayer({ data, visible, opacity, labels }: Props) {
  const { map, ready, styleEpoch } = useMapContext();

  useEffect(() => {
    if (!map || !ready) return;
    renderVessels(map, toFeatureCollection(data));
  }, [map, ready, data, styleEpoch]);

  useEffect(() => {
    if (!map || !ready) return;
    setLayerVisible(map, [LYR_VESSEL_POINT, LYR_VESSEL_ARROW], visible);
    setLayerVisible(map, [LYR_VESSEL_LABEL], visible && labels);
    setLayerOpacity(map, LYR_VESSEL_POINT, "circle", opacity / 100);
  }, [map, ready, visible, labels, opacity, data, styleEpoch]);

  return null;
}
