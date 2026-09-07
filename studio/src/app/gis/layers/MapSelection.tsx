import { useEffect } from "react";
import type { MapMouseEvent } from "maplibre-gl";

import type { TrackedAssetPosition } from "../../../api/maps";
import { useMapContext } from "../core/MapContext";
import { LYR_SITE_CLUSTER, LYR_SITE_POINT, LYR_VESSEL_POINT, SRC_SITES } from "../gisLayers";

type Props = {
  /** Everything selectable — used to resolve a clicked feature back to its record. */
  assets: TrackedAssetPosition[];
  onSelect: (asset: TrackedAssetPosition | null) => void;
};

/**
 * Click-to-select, with cluster expansion.
 *
 * Clicking a cluster zooms into it; clicking a single site or vessel resolves
 * the feature's `assetId` back to the full record and hands it up. Kept apart
 * from the layers so selection behaviour is defined in one place regardless of
 * how many point layers are on the map.
 */
export function MapSelection({ assets, onSelect }: Props) {
  const { map, ready, styleEpoch } = useMapContext();

  useEffect(() => {
    if (!map || !ready) return;

    const pick = async (e: MapMouseEvent) => {
      const clusters = map.getLayer(LYR_SITE_CLUSTER)
        ? map.queryRenderedFeatures(e.point, { layers: [LYR_SITE_CLUSTER] })
        : [];
      if (clusters.length > 0) {
        const source = map.getSource(SRC_SITES) as any;
        const zoom = await source.getClusterExpansionZoom(clusters[0].properties?.cluster_id);
        map.easeTo({ center: (clusters[0].geometry as any).coordinates, zoom });
        return;
      }

      const hits = map.queryRenderedFeatures(e.point, {
        layers: [LYR_SITE_POINT, LYR_VESSEL_POINT].filter((id) => map.getLayer(id)),
      });
      if (hits.length === 0) {
        onSelect(null);
        return;
      }
      const id = hits[0].properties?.assetId;
      const match = assets.find((p) => p.assetId === id);
      if (match) onSelect(match);
    };

    const enter = () => (map.getCanvas().style.cursor = "pointer");
    const leave = () => (map.getCanvas().style.cursor = "");
    const pointLayers = [LYR_SITE_POINT, LYR_VESSEL_POINT, LYR_SITE_CLUSTER];

    map.on("click", pick);
    for (const id of pointLayers) {
      map.on("mouseenter", id, enter);
      map.on("mouseleave", id, leave);
    }
    return () => {
      map.off("click", pick);
      for (const id of pointLayers) {
        map.off("mouseenter", id, enter);
        map.off("mouseleave", id, leave);
      }
    };
  }, [map, ready, assets, onSelect, styleEpoch]);

  return null;
}
