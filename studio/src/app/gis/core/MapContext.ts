import { createContext, useContext } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * The live map instance, shared with everything drawn on top of it.
 *
 * `<MapCanvas>` owns the MapLibre map and publishes it here; layers and other
 * overlays consume it with `useMapContext()` instead of each reaching for the
 * map through their own ref. That inversion is what lets the same map carry
 * different sets of layers per app (Passage / Atlas / Fieldwork) without any of
 * them re-implementing map setup.
 *
 * `styleEpoch` bumps every time the basemap style is swapped. A style swap
 * wipes all custom sources and layers, so overlays watch this value and re-add
 * themselves when it changes.
 */
export type MapContextValue = {
  map: MapLibreMap | null;
  ready: boolean;
  styleEpoch: number;
};

export const MapContext = createContext<MapContextValue>({
  map: null,
  ready: false,
  styleEpoch: 0,
});

export function useMapContext(): MapContextValue {
  return useContext(MapContext);
}
