/**
 * The catalog of layers a user can add to their View workspace.
 *
 * A layer is a dataset; its features carry their data as attributes (a farm
 * brings its reports / images / history). Two sources:
 *   personal — our own data (sites, ships, trails, notes, reference points)
 *   public   — free public datasets relevant to us (BarentsWatch, MET, EMODnet…)
 *
 * `ready` marks the ones wired to real (mock, in the harness) data today; the
 * rest are catalogued but not yet backed. `legend` drives the per-layer legend.
 */
import { CLIENT_OPERATORS, clientLayerId } from "./clients";

export type CatalogLayerId =
  | "farms"
  | "ships"
  | "trails"
  | "activity"
  | "notes"
  | "ports"
  | "water"
  | "diesel"
  | "bw-sites"
  | "nytek"
  | "ais"
  | "disease"
  | "weather"
  | "bathymetry"
  /** Per-client filtered views of the register — see clients.ts. */
  | `client:${string}`;

export type CatalogGroup = "clients" | "operations" | "reference" | "annotations" | "public";

export type LegendItem = {
  /** Any CSS background — a colour or a gradient. */
  swatch: string;
  label: string;
};

export type CatalogLayer = {
  id: CatalogLayerId;
  label: string;
  icon: string;
  group: CatalogGroup;
  source: "personal" | "public";
  provider?: string;
  /** Backed by data today (vs catalogued-but-empty). */
  ready: boolean;
  hint?: string;
  legend: LegendItem[];
  /** Optional sub-components of a dataset you can pick when adding it. */
  components?: string[];
};

/** One layer per client operator — their sites, pulled live from the register. */
const CLIENT_LAYERS: CatalogLayer[] = CLIENT_OPERATORS.map((c) => ({
  id: clientLayerId(c),
  label: `${c.label} sites`,
  icon: "◆",
  group: "clients",
  source: "public",
  provider: "Fiskeridirektoratet register",
  ready: true,
  hint: `Live — localities held by ${c.label}`,
  legend: [{ swatch: c.color, label: `${c.label} locality (active)` }],
}));

export const LAYER_CATALOG: CatalogLayer[] = [
  ...CLIENT_LAYERS,
  {
    id: "farms",
    label: "Farm locations",
    icon: "◆",
    group: "operations",
    source: "personal",
    ready: true,
    legend: [
      { swatch: "#2a9d8f", label: "Registered site" },
      { swatch: "#e53935", label: "Disease reported" },
    ],
    components: ["Cages", "Moorings", "Sensors"],
  },
  {
    id: "ships",
    label: "Ships",
    icon: "➤",
    group: "operations",
    source: "personal",
    ready: true,
    legend: [{ swatch: "#3a8fb7", label: "Vessel (arrow = heading)" }],
  },
  {
    id: "trails",
    label: "Vessel trails",
    icon: "⤳",
    group: "operations",
    source: "personal",
    ready: true,
    legend: [{ swatch: "linear-gradient(90deg,#ffd166,#ef8a54)", label: "Recent track" }],
  },
  {
    id: "activity",
    label: "Activity heatmap",
    icon: "▦",
    group: "operations",
    source: "personal",
    ready: true,
    legend: [
      {
        swatch: "linear-gradient(90deg,#3a8fb7,#2a9d8f,#e9c46a,#e76f51,#c62828)",
        label: "Time spent — low → high",
      },
    ],
  },
  {
    id: "notes",
    label: "Notes",
    icon: "✎",
    group: "annotations",
    source: "personal",
    ready: false,
    hint: "Crew notes — coming soon",
    legend: [{ swatch: "#f4a261", label: "Crew note" }],
  },
  {
    id: "ports",
    label: "Ports",
    icon: "⚓",
    group: "reference",
    source: "personal",
    ready: false,
    hint: "No data yet",
    legend: [{ swatch: "#9aa7ab", label: "Port" }],
  },
  {
    id: "water",
    label: "Water stops",
    icon: "≈",
    group: "reference",
    source: "personal",
    ready: false,
    hint: "No data yet",
    legend: [{ swatch: "#4aa3df", label: "Fresh-water stop" }],
  },
  {
    id: "diesel",
    label: "Diesel stops",
    icon: "⛽",
    group: "reference",
    source: "personal",
    ready: false,
    hint: "No data yet",
    legend: [{ swatch: "#c98a3a", label: "Diesel stop" }],
  },
  {
    id: "bw-sites",
    label: "Aquaculture register (all sites)",
    icon: "◇",
    group: "public",
    source: "public",
    provider: "Fiskeridirektoratet",
    ready: true,
    hint: "Live — official locality register",
    legend: [{ swatch: "#6fae6f", label: "Registered locality (loknr)" }],
  },
  {
    id: "nytek",
    label: "NYTEK moorings",
    icon: "⌇",
    group: "public",
    source: "public",
    provider: "Fiskeridirektoratet",
    ready: true,
    hint: "Live — certified mooring lines",
    legend: [{ swatch: "#b39ddb", label: "Certified mooring line" }],
  },
  {
    id: "ais",
    label: "AIS vessel traffic",
    icon: "➤",
    group: "public",
    source: "public",
    provider: "BarentsWatch",
    ready: false,
    hint: "Public AIS — coming soon",
    legend: [{ swatch: "#b39ddb", label: "AIS vessel" }],
  },
  {
    id: "disease",
    label: "Lice / disease zones",
    icon: "◉",
    group: "public",
    source: "public",
    provider: "BarentsWatch",
    ready: false,
    hint: "Public zones — coming soon",
    legend: [{ swatch: "rgba(229,57,53,0.5)", label: "Control / disease zone" }],
  },
  {
    id: "weather",
    label: "Weather & waves",
    icon: "☁",
    group: "public",
    source: "public",
    provider: "MET Norway",
    ready: false,
    hint: "Public forecast — coming soon",
    legend: [{ swatch: "linear-gradient(90deg,#cfe8ff,#6aa9e0,#2c5f8f)", label: "Wind / wave" }],
    components: ["Wind", "Waves", "Current"],
  },
  {
    id: "bathymetry",
    label: "Seabed depth",
    icon: "▧",
    group: "public",
    source: "public",
    provider: "EMODnet",
    ready: true,
    hint: "Live — EMODnet mean depth",
    legend: [
      {
        swatch: "linear-gradient(90deg,#d9f0a3,#78c679,#238443,#0868ac,#08306b)",
        label: "Shallow → deep",
      },
    ],
  },
];

export const CATALOG_GROUPS: CatalogGroup[] = [
  "clients",
  "operations",
  "reference",
  "annotations",
  "public",
];

export const GROUP_LABELS: Record<CatalogGroup, string> = {
  clients: "Clients",
  operations: "Operations",
  reference: "Reference",
  annotations: "Annotations",
  public: "Public datasets",
};

export function catalogLayer(id: CatalogLayerId): CatalogLayer {
  return LAYER_CATALOG.find((l) => l.id === id) ?? LAYER_CATALOG[0];
}
