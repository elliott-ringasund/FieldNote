import { useCallback, useEffect, useRef, useState } from "react";

import {
  defaultMeta,
  type DeliverableMeta,
  type PointCategory,
  type PointStatus,
} from "./deliverable";
import { destination, type LngLat } from "./geo";

/** Autosave key — a real job must survive a reload or crash. */
const STORAGE_KEY = "fleo.gis.survey.draft";

type Persisted = {
  meta: DeliverableMeta;
  collapsed?: string[];
  points: SurveyPoint[];
  paths: SurveyPath[];
  groups?: SurveyGroup[];
  counter: number;
};

function loadDraft(): Persisted | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Persisted;
    if (!d || !Array.isArray(d.points) || !Array.isArray(d.paths)) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Free-form attributes carried by a feature — the GIS attribute-table idea.
 *
 * Keeps domain columns (HDN, line tightness, bottom sediment, depth, chain
 * length…) out of the core model, so a different job type can carry entirely
 * different fields and every export still renders them generically.
 */
export type Attrs = Record<string, string | number>;

/**
 * A group of drawn features that owns its symbology — the QGIS "layer" idea.
 *
 * Style lives on the group, not the feature, so "make the flåte lines red and
 * fade the buoy lines back" is one change rather than thirty. `colorMode`
 * decides whether a feature is drawn in the group's colour or by its own
 * OK/Attention/Fail status, so emphasis and inspection meaning can coexist.
 */
export type SurveyGroup = {
  id: string;
  name: string;
  /** The group's observations — becomes its section text in the report. */
  description: string;
  color: string;
  colorMode: "status" | "fixed";
  /** 0–100. */
  opacity: number;
  width: number;
  /** Point marker shape. */
  symbol: SymbolShape;
  /** Line dash pattern. */
  lineStyle: LineStyle;
  visible: boolean;
  labels: boolean;
  labelSize: number;
  /** What the label says — QGIS's "label with this field". */
  labelField: LabelField;
};

/**
 * Label content options.
 *
 * One label per feature, not per segment: a 35-line mooring spread with a
 * bearing on every leg is unreadable, which is exactly what the first cut
 * looked like.
 */
export type LabelField =
  | "name"
  | "name-length"
  | "length"
  | "bearing-length"
  | "status"
  | "none";

export const LABEL_FIELDS: { id: LabelField; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "name-length", label: "Name + length" },
  { id: "length", label: "Length" },
  { id: "bearing-length", label: "Bearing + length" },
  { id: "status", label: "Status" },
  { id: "none", label: "No label" },
];

export type SymbolShape = "circle" | "square" | "triangle" | "diamond";
export type LineStyle = "solid" | "dashed" | "dotted";

export const SYMBOLS: { id: SymbolShape; glyph: string }[] = [
  { id: "circle", glyph: "●" },
  { id: "square", glyph: "■" },
  { id: "triangle", glyph: "▲" },
  { id: "diamond", glyph: "◆" },
];

export const LINE_STYLES: { id: LineStyle; label: string; dash: number[] | null }[] = [
  { id: "solid", label: "───", dash: null },
  { id: "dashed", label: "╌╌╌", dash: [2, 1] },
  { id: "dotted", label: "┈┈┈", dash: [0.5, 1.5] },
];

export function dashFor(style: LineStyle): number[] | null {
  return LINE_STYLES.find((s) => s.id === style)?.dash ?? null;
}

export const GROUP_PALETTE = [
  "#e63946",
  "#f4a261",
  "#e9c46a",
  "#2a9d8f",
  "#4ea8de",
  "#c77dff",
  "#80ed99",
  "#ffffff",
];

export function makeGroup(id: string, name: string, color: string): SurveyGroup {
  return {
    id,
    name,
    description: "",
    color,
    colorMode: "fixed",
    opacity: 100,
    width: 3,
    symbol: "circle",
    lineStyle: "solid",
    visible: true,
    labels: true,
    labelSize: 11,
    labelField: "name",
  };
}

/** A single authored point — the atom of a deliverable's real data. */
export type SurveyPoint = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  category: PointCategory;
  status: PointStatus;
  note: string;
  /** Attached photos as data URLs (embedded into exports, Koløy-style). */
  photos: string[];
  attrs?: Attrs;
  groupId?: string;
  /** Hide just this feature, independent of its group. */
  visible?: boolean;
  /** Per-feature symbology, overriding the group's. */
  style?: FeatureStyle;
};

/** Overrides a group's symbology for one feature (QGIS per-feature override). */
export type FeatureStyle = {
  color?: string;
  width?: number;
  symbol?: SymbolShape;
  lineStyle?: LineStyle;
};

/** A line (mooring line, transect) or area (cage group, zone). */
export type SurveyPath = {
  id: string;
  name: string;
  kind: "line" | "area";
  status: PointStatus;
  note: string;
  photos: string[];
  /** Vertex chain, GeoJSON [lng, lat] order. */
  vertices: LngLat[];
  attrs?: Attrs;
  groupId?: string;
  visible?: boolean;
  style?: FeatureStyle;
};

export type DrawMode = "point" | "line" | "area" | null;

/**
 * The survey — the *one dataset* every Create deliverable tab renders from.
 *
 * Lines support COGO entry (surveying-style coordinate geometry): start from a
 * click or a typed coordinate, then extend by bearing + length — plus free
 * clicking, and per-vertex editing afterwards for the manual fix-ups.
 */
export function useSurvey() {
  const [restored] = useState<Persisted | null>(loadDraft);
  const [meta, setMeta] = useState<DeliverableMeta>(restored?.meta ?? defaultMeta());
  const [points, setPoints] = useState<SurveyPoint[]>(restored?.points ?? []);
  const [paths, setPaths] = useState<SurveyPath[]>(restored?.paths ?? []);
  const [groups, setGroups] = useState<SurveyGroup[]>(restored?.groups ?? []);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  /** Path currently being drawn (vertices still being appended). */
  const [draftPathId, setDraftPathId] = useState<string | null>(null);
  /**
   * Multi-selection, QGIS-style: ctrl-click adds, plain click replaces.
   * `selectedId` stays as "the one being edited" (the last one picked) so the
   * single-feature panels keep working unchanged.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIds(id ? [id] : []);
  }, []);

  /** Ctrl-click behaviour: toggle this feature in/out of the selection. */
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }, []);

  const selectMany = useCallback((ids: string[]) => setSelectedIds(ids), []);
  const clearSelection = useCallback(() => setSelectedIds([]), []);
  const [saveError, setSaveError] = useState(false);
  /** Which groups are folded shut — remembered like the QGIS layers panel. */
  const [collapsed, setCollapsed] = useState<string[]>(restored?.collapsed ?? []);
  const nextId = useRef(restored?.counter ?? 1);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }, []);

  // Autosave everything authorable. Photos are data URLs, so a big survey can
  // exceed the localStorage quota — surface that instead of failing silently.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ meta, points, paths, groups, collapsed, counter: nextId.current } satisfies Persisted)
      );
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [meta, points, paths, groups, collapsed]);

  // ------------------------------------------------------------------ groups
  const createGroup = useCallback((name?: string) => {
    const id = `g${nextId.current++}`;
    setGroups((gs) => {
      const group = makeGroup(
        id,
        name ?? `Group ${gs.length + 1}`,
        GROUP_PALETTE[gs.length % GROUP_PALETTE.length]
      );
      return [...gs, group];
    });
    return id;
  }, []);

  const updateGroup = useCallback((id: string, patch: Partial<SurveyGroup>) => {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }, []);

  /** Deleting a group keeps its features — they fall back to ungrouped. */
  const deleteGroup = useCallback((id: string) => {
    setGroups((gs) => gs.filter((g) => g.id !== id));
    setPaths((ps) => ps.map((p) => (p.groupId === id ? { ...p, groupId: undefined } : p)));
    setPoints((ps) => ps.map((p) => (p.groupId === id ? { ...p, groupId: undefined } : p)));
  }, []);

  /** Patch a feature without caring whether it's a point or a path. */
  const updateFeature = useCallback(
    (featureId: string, patch: Partial<SurveyPoint> & Partial<SurveyPath>) => {
      setPaths((ps) => ps.map((p) => (p.id === featureId ? { ...p, ...patch } : p)));
      setPoints((ps) => ps.map((p) => (p.id === featureId ? { ...p, ...patch } : p)));
    },
    []
  );

  const assignToGroup = useCallback((featureId: string, groupId: string | undefined) => {
    setPaths((ps) => ps.map((p) => (p.id === featureId ? { ...p, groupId } : p)));
    setPoints((ps) => ps.map((p) => (p.id === featureId ? { ...p, groupId } : p)));
  }, []);

  /** Bulk assign — e.g. everything just imported goes to one group. */
  const assignManyToGroup = useCallback((featureIds: string[], groupId: string | undefined) => {
    const set = new Set(featureIds);
    setPaths((ps) => ps.map((p) => (set.has(p.id) ? { ...p, groupId } : p)));
    setPoints((ps) => ps.map((p) => (set.has(p.id) ? { ...p, groupId } : p)));
  }, []);

  const clearSurvey = useCallback(() => {
    setPoints([]);
    setPaths([]);
    setGroups([]);
    setMeta(defaultMeta());
    setSelectedId(null);
    setDraftPathId(null);
    setDrawMode(null);
    nextId.current = 1;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* fine */
    }
  }, []);

  const updateMeta = useCallback((patch: Partial<DeliverableMeta>) => {
    setMeta((m) => ({ ...m, ...patch }));
  }, []);

  // ------------------------------------------------------------------ points
  const addPoint = useCallback((lng: number, lat: number) => {
    setPoints((p) => {
      const id = `pt${nextId.current++}`;
      setSelectedId(id);
      return [
        ...p,
        {
          id,
          name: `Point ${p.length + 1}`,
          lng,
          lat,
          category: "observation",
          status: "ok",
          note: "",
          photos: [],
        },
      ];
    });
  }, []);

  const updatePoint = useCallback((id: string, patch: Partial<SurveyPoint>) => {
    setPoints((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const removePoint = useCallback((id: string) => {
    setPoints((p) => p.filter((x) => x.id !== id));
    setSelectedIds((s) => s.filter((x) => x !== id));
  }, []);

  /** Delete everything currently selected — the table's bulk delete. */
  const removeMany = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setPoints((p) => p.filter((x) => !set.has(x.id)));
    setPaths((p) => p.filter((x) => !set.has(x.id)));
    setSelectedIds((s) => s.filter((x) => !set.has(x)));
  }, []);

  /** Apply one patch to many features — bulk edit from a selection. */
  const updateMany = useCallback(
    (ids: string[], patch: Partial<SurveyPoint> & Partial<SurveyPath>) => {
      const set = new Set(ids);
      setPoints((p) => p.map((x) => (set.has(x.id) ? { ...x, ...patch } : x)));
      setPaths((p) => p.map((x) => (set.has(x.id) ? { ...x, ...patch } : x)));
    },
    []
  );

  // ------------------------------------------------------------------- paths
  /** Append a vertex to the draft path, creating the path on the first vertex. */
  const addVertex = useCallback(
    (v: LngLat) => {
      setPaths((ps) => {
        if (draftPathId) {
          return ps.map((x) => {
            if (x.id !== draftPathId) return x;
            const last = x.vertices[x.vertices.length - 1];
            if (last && Math.abs(last[0] - v[0]) < 1e-8 && Math.abs(last[1] - v[1]) < 1e-8) return x;
            return { ...x, vertices: [...x.vertices, v] };
          });
        }
        const kind = drawMode === "area" ? "area" : "line";
        const id = `ln${nextId.current++}`;
        const n = ps.filter((x) => x.kind === kind).length + 1;
        setDraftPathId(id);
        setSelectedId(id);
        return [
          ...ps,
          {
            id,
            name: kind === "line" ? `Line ${n}` : `Area ${n}`,
            kind,
            status: "ok",
            note: "",
            photos: [],
            vertices: [v],
          },
        ];
      });
    },
    [draftPathId, drawMode]
  );

  /** COGO: extend the draft (or selected) path by bearing° / length m. */
  const extendByBearing = useCallback(
    (bearing: number, length: number) => {
      const targetId = draftPathId ?? selectedId;
      if (!targetId) return;
      setPaths((ps) =>
        ps.map((x) => {
          if (x.id !== targetId || x.vertices.length === 0) return x;
          const last = x.vertices[x.vertices.length - 1];
          return { ...x, vertices: [...x.vertices, destination(last, bearing, length)] };
        })
      );
    },
    [draftPathId, selectedId]
  );

  /**
   * Add a complete line in one go — the shape real survey data arrives in:
   * a start position, an end position, and a row of measured attributes.
   */
  const addLine = useCallback(
    (line: {
      name: string;
      vertices: LngLat[];
      status?: PointStatus;
      note?: string;
      attrs?: Attrs;
      kind?: "line" | "area";
    }) => {
      const id = `ln${nextId.current++}`;
      setPaths((ps) => [
        ...ps,
        {
          id,
          name: line.name,
          kind: line.kind ?? "line",
          status: line.status ?? "ok",
          note: line.note ?? "",
          photos: [],
          vertices: line.vertices,
          attrs: line.attrs,
        },
      ]);
      return id;
    },
    []
  );

  /** Bulk add — used by the spreadsheet importer, optionally into a group. */
  const addLines = useCallback((lines: Parameters<typeof addLine>[0][], groupId?: string) => {
    setPaths((ps) => [
      ...ps,
      ...lines.map((line) => ({
        id: `ln${nextId.current++}`,
        name: line.name,
        kind: line.kind ?? ("line" as const),
        status: line.status ?? ("ok" as PointStatus),
        note: line.note ?? "",
        photos: [] as string[],
        vertices: line.vertices,
        attrs: line.attrs,
        groupId,
      })),
    ]);
  }, []);

  const finishPath = useCallback(() => {
    // Drop degenerate drafts (a line needs 2+ vertices, an area 3+).
    setPaths((ps) =>
      ps.filter(
        (x) =>
          x.id !== draftPathId ||
          (x.kind === "line" ? x.vertices.length >= 2 : x.vertices.length >= 3)
      )
    );
    setDraftPathId(null);
    setDrawMode(null);
  }, [draftPathId]);

  const updatePath = useCallback((id: string, patch: Partial<SurveyPath>) => {
    setPaths((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const moveVertex = useCallback((id: string, index: number, v: LngLat) => {
    setPaths((p) =>
      p.map((x) =>
        x.id === id ? { ...x, vertices: x.vertices.map((old, i) => (i === index ? v : old)) } : x
      )
    );
  }, []);

  const removeVertex = useCallback((id: string, index: number) => {
    setPaths((p) =>
      p.map((x) => (x.id === id ? { ...x, vertices: x.vertices.filter((_, i) => i !== index) } : x))
    );
  }, []);

  const removePath = useCallback(
    (id: string) => {
      setPaths((p) => p.filter((x) => x.id !== id));
      setSelectedIds((s) => s.filter((x) => x !== id));
      if (draftPathId === id) setDraftPathId(null);
    },
    [draftPathId]
  );

  return {
    meta,
    updateMeta,
    points,
    paths,
    drawMode,
    setDrawMode,
    draftPathId,
    selectedId,
    selectedIds,
    setSelectedId,
    toggleSelected,
    selectMany,
    clearSelection,
    addPoint,
    updatePoint,
    removePoint,
    addVertex,
    addLine,
    addLines,
    extendByBearing,
    finishPath,
    updatePath,
    moveVertex,
    removeVertex,
    removePath,
    saveError,
    clearSurvey,
    groups,
    createGroup,
    updateGroup,
    deleteGroup,
    assignToGroup,
    assignManyToGroup,
    updateFeature,
    removeMany,
    updateMany,
    collapsed,
    toggleCollapsed,
  };
}

export type Survey = ReturnType<typeof useSurvey>;
