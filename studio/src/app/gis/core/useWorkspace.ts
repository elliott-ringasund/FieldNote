import { useCallback, useMemo, useState } from "react";

import { CATALOG_GROUPS, catalogLayer, type CatalogLayerId } from "../layerCatalog";

/**
 * A user-made folder of layers — "Lines", "Moorings", "Reference"…
 *
 * The catalog's own groups (Clients, Operations, Public…) describe where a
 * layer *comes from*; these describe how *this user* wants their map organised,
 * which is a different thing and has to be theirs to define.
 */
export type LayerGroup = {
  id: string;
  name: string;
  layers: CatalogLayerId[];
};

/** A rendered section of the panel: either a user group or a catalog group. */
export type PanelSection = {
  kind: "user" | "catalog";
  id: string;
  name: string;
  layers: CatalogLayerId[];
};

export type Workspace = ReturnType<typeof useWorkspace>;

export function useWorkspace(initial: CatalogLayerId[] = []) {
  const [layers, setLayers] = useState<CatalogLayerId[]>(initial);
  const [groups, setGroups] = useState<LayerGroup[]>([]);
  const [hidden, setHidden] = useState<CatalogLayerId[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [openLegend, setOpenLegend] = useState<CatalogLayerId[]>([]);
  const [components, setComponents] = useState<Partial<Record<CatalogLayerId, string[]>>>({});
  const [groupSeq, setGroupSeq] = useState(1);

  const has = useCallback((id: CatalogLayerId) => layers.includes(id), [layers]);

  /** A layer is drawn when it's in the workspace and neither it nor its group is hidden. */
  const isVisible = useCallback(
    (id: CatalogLayerId) => {
      if (!layers.includes(id) || hidden.includes(id)) return false;
      const group = groups.find((g) => g.layers.includes(id));
      return !group || !hidden.includes(group.id as CatalogLayerId);
    },
    [layers, hidden, groups]
  );

  const addLayer = useCallback((id: CatalogLayerId, comps?: string[]) => {
    setLayers((w) => (w.includes(id) ? w : [...w, id]));
    if (comps) setComponents((c) => ({ ...c, [id]: comps }));
  }, []);

  const removeLayer = useCallback((id: CatalogLayerId) => {
    setLayers((w) => w.filter((x) => x !== id));
    setHidden((h) => h.filter((x) => x !== id));
    setOpenLegend((o) => o.filter((x) => x !== id));
    setGroups((gs) => gs.map((g) => ({ ...g, layers: g.layers.filter((x) => x !== id) })));
    setComponents((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
  }, []);

  const toggleHidden = useCallback((id: string) => {
    setHidden((h) =>
      h.includes(id as CatalogLayerId)
        ? h.filter((x) => x !== id)
        : [...h, id as CatalogLayerId]
    );
  }, []);

  const toggleLegend = useCallback((id: CatalogLayerId) => {
    setOpenLegend((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }, []);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }, []);

  // ------------------------------------------------------------------ groups
  const createGroup = useCallback(
    (name?: string) => {
      const id = `grp${groupSeq}`;
      setGroupSeq((n) => n + 1);
      setGroups((gs) => [...gs, { id, name: name ?? `Group ${gs.length + 1}`, layers: [] }]);
      return id;
    },
    [groupSeq]
  );

  const renameGroup = useCallback((id: string, name: string) => {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, name } : g)));
  }, []);

  /** Dissolving a group returns its layers to their catalog sections. */
  const deleteGroup = useCallback((id: string) => {
    setGroups((gs) => gs.filter((g) => g.id !== id));
    setHidden((h) => h.filter((x) => x !== id));
  }, []);

  /** Move a layer into a group, or out of all groups when groupId is null. */
  const moveToGroup = useCallback((layerId: CatalogLayerId, groupId: string | null) => {
    setGroups((gs) =>
      gs.map((g) => {
        const without = g.layers.filter((x) => x !== layerId);
        return g.id === groupId ? { ...g, layers: [...without, layerId] } : { ...g, layers: without };
      })
    );
  }, []);

  /**
   * Panel layout: user groups first (they were made deliberately), then
   * whatever is left, still bucketed by where it came from.
   */
  const sections = useMemo<PanelSection[]>(() => {
    const grouped = new Set(groups.flatMap((g) => g.layers));
    const userSections: PanelSection[] = groups.map((g) => ({
      kind: "user",
      id: g.id,
      name: g.name,
      layers: g.layers.filter((id) => layers.includes(id)),
    }));
    const catalogSections: PanelSection[] = CATALOG_GROUPS.map((group) => ({
      kind: "catalog" as const,
      id: group,
      name: group,
      layers: layers.filter((id) => !grouped.has(id) && catalogLayer(id).group === group),
    })).filter((s) => s.layers.length > 0);
    return [...userSections, ...catalogSections];
  }, [groups, layers]);

  return {
    layers,
    groups,
    hidden,
    collapsed,
    openLegend,
    components,
    sections,
    has,
    isVisible,
    addLayer,
    removeLayer,
    toggleHidden,
    toggleLegend,
    toggleCollapsed,
    createGroup,
    renameGroup,
    deleteGroup,
    moveToGroup,
  };
}
