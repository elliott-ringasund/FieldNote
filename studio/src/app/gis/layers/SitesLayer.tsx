import { useEffect } from "react";

import type { TrackedAssetPosition } from "../../../api/maps";
import { useMapContext } from "../core/MapContext";
import {
  LYR_SITE_CLUSTER,
  LYR_SITE_CLUSTER_COUNT,
  LYR_SITE_LABEL,
  LYR_SITE_POINT,
  renderSites,
  setLayerOpacity,
  setLayerVisible,
  toFeatureCollection,
} from "../gisLayers";

const SITE_LAYERS = [LYR_SITE_CLUSTER, LYR_SITE_CLUSTER_COUNT, LYR_SITE_POINT, LYR_SITE_LABEL];

type Props = {
  data: TrackedAssetPosition[];
  visible: boolean;
  /** 0–100. */
  opacity: number;
  labels: boolean;
};

/**
 * Farm sites / registered assets, clustered, with a red ring on disease.
 *
 * Renders nothing of its own — it drives MapLibre layers on the shared map and
 * cleans up by re-adding on style swaps (see `styleEpoch`).
 */
export function SitesLayer({ data, visible, opacity, labels }: Props) {
  const { map, ready, styleEpoch } = useMapContext();

  useEffect(() => {
    if (!map || !ready) return;
    renderSites(map, toFeatureCollection(data));
  }, [map, ready, data, styleEpoch]);

  useEffect(() => {
    if (!map || !ready) return;
    setLayerVisible(map, SITE_LAYERS, visible);
    setLayerVisible(map, [LYR_SITE_LABEL], visible && labels);
    setLayerOpacity(map, LYR_SITE_POINT, "circle", opacity / 100);
    setLayerOpacity(map, LYR_SITE_CLUSTER, "circle", opacity / 100);
  }, [map, ready, visible, labels, opacity, data, styleEpoch]);

  return null;
}
