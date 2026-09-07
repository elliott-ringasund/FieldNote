/**
 * The map's two top-level modes.
 *
 *   View   — the working map: add layers, inspect feature data, run tools.
 *            (Merges the old Operate + Explore — "live" vs "history" is a filter,
 *             not a mode; the historical data is just feature attributes.)
 *   Create — author deliverables (draw / attach photos / export). A different
 *            paradigm: editing, not viewing.
 *
 * Layers no longer belong to a mode — in View they come from the user's
 * workspace (see layerCatalog.ts). The mode is just View vs Create.
 */
export type MapModeId = "view" | "create";

export type MapMode = {
  id: MapModeId;
  label: string;
  icon: string;
  tagline: string;
};

export const MAP_MODES: MapMode[] = [
  { id: "view", label: "View", icon: "◎", tagline: "Layers, data & tools" },
  { id: "create", label: "Create", icon: "✎", tagline: "Author maps & reports" },
];

export const DEFAULT_MODE: MapModeId = "view";

export function getMode(id: MapModeId): MapMode {
  return MAP_MODES.find((m) => m.id === id) ?? MAP_MODES[0];
}
