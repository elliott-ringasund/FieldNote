import { useState } from "react";

import {
  CATALOG_GROUPS,
  GROUP_LABELS,
  type CatalogLayer,
  type CatalogLayerId,
} from "../layerCatalog";
import "./LayerBrowser.css";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Layers not already in the workspace. */
  available: CatalogLayer[];
  onAdd: (id: CatalogLayerId, components?: string[]) => void;
};

/**
 * The "add layers" window — a searchable browser over the whole catalog.
 *
 * Searches label / provider / components, groups by source, and where a dataset
 * has sub-components lets you pick which ones to bring in (all selected by
 * default) — component-level adds.
 */
export function LayerBrowser({ open, onClose, available, onAdd }: Props) {
  const [q, setQ] = useState("");
  // Per-layer component selection; absent = "all".
  const [sel, setSel] = useState<Record<string, string[]>>({});
  if (!open) return null;

  const query = q.trim().toLowerCase();
  const match = (l: CatalogLayer) =>
    !query ||
    l.label.toLowerCase().includes(query) ||
    (l.provider ?? "").toLowerCase().includes(query) ||
    (l.components ?? []).some((c) => c.toLowerCase().includes(query));
  const filtered = available.filter(match);

  const selectedFor = (l: CatalogLayer) => sel[l.id] ?? l.components ?? [];
  const toggleComp = (l: CatalogLayer, c: string) => {
    const cur = selectedFor(l);
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
    setSel((s) => ({ ...s, [l.id]: next }));
  };

  return (
    <div className="lb-backdrop" onClick={onClose}>
      <div
        className="lb-window"
        role="dialog"
        aria-label="Add layers"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lb-head">
          <div className="lb-title">Add layers</div>
          <button className="lb-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="lb-search">
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search layers, providers, components…"
            aria-label="Search layers"
          />
        </div>

        <div className="lb-body">
          {filtered.length === 0 && <div className="lb-empty">No layers match “{q}”.</div>}
          {CATALOG_GROUPS.map((g) => {
            const items = filtered.filter((l) => l.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} className="lb-group">
                <div className="lb-group-label">{GROUP_LABELS[g]}</div>
                {items.map((l) => {
                  const selected = selectedFor(l);
                  return (
                    <div key={l.id} className="lb-row">
                      <span className="lb-ico">{l.icon}</span>
                      <div className="lb-meta">
                        <div className="lb-name">
                          {l.label}
                          {!l.ready && <span className="lb-soon">soon</span>}
                        </div>
                        {l.provider && <div className="lb-prov">{l.provider}</div>}
                        {l.components && (
                          <div className="lb-comps">
                            {l.components.map((c) => {
                              const on = selected.includes(c);
                              return (
                                <button
                                  key={c}
                                  className={`lb-comp${on ? " on" : ""}`}
                                  aria-pressed={on}
                                  onClick={() => toggleComp(l, c)}
                                >
                                  {on ? "✓ " : ""}
                                  {c}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button
                        className="lb-add"
                        disabled={l.components && selected.length === 0}
                        onClick={() => onAdd(l.id, l.components ? selected : undefined)}
                      >
                        Add
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
