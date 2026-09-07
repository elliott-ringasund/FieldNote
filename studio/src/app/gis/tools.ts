/**
 * Tools — things you *do* on the map, orthogonal to layers.
 *
 * A tool acts on whatever layers/features are present. Note that "notes" is the
 * *creation* half of the notes feature (the viewing half is a layer in the
 * catalog); and time lives inside "filter", not as a global control.
 */
export type ToolId = "route" | "measure" | "notes" | "filter" | "export";

export type MapTool = {
  id: ToolId;
  label: string;
  icon: string;
  hint: string;
  /** Implemented today (all stubs for now). */
  ready: boolean;
};

export const MAP_TOOLS: MapTool[] = [
  { id: "route", label: "Route", icon: "➜", hint: "Plan a passage — distance, ETA, fuel", ready: false },
  { id: "measure", label: "Measure", icon: "📏", hint: "Distance & area", ready: false },
  { id: "notes", label: "Notes", icon: "✎", hint: "Drop a note on the map", ready: false },
  {
    id: "filter",
    label: "Filter",
    icon: "≣",
    hint: "Filter features & records — time lives here",
    ready: false,
  },
  { id: "export", label: "Export", icon: "⭳", hint: "Export the current view", ready: false },
];
