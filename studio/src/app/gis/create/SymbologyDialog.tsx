import { createPortal } from "react-dom";

import {
  GROUP_PALETTE,
  LABEL_FIELDS,
  LINE_STYLES,
  SYMBOLS,
  type Survey,
  type SymbolShape,
  type LineStyle,
} from "./useSurvey";
import "./SymbologyDialog.css";

export type SymbologyTarget = { kind: "group" | "feature" | "selection"; id: string } | null;

type Props = {
  survey: Survey;
  target: SymbologyTarget;
  onClose: () => void;
};

/**
 * Symbology window — for a whole group, or one feature overriding its group.
 *
 * A centred window rather than a cramped inline panel: styling is a deliberate
 * act you do occasionally, not something to fiddle with in a 260px sidebar.
 * Feature overrides show an explicit "inherit" state so it's clear what is the
 * group's doing and what has been overridden.
 */
export function SymbologyDialog({ survey, target, onClose }: Props) {
  const { groups, points, paths, selectedIds, updateGroup, updateFeature, updateMany } = survey;
  if (!target) return null;

  const bulk = target.kind === "selection";
  const group = target.kind === "group" ? groups.find((g) => g.id === target.id) : null;
  const feature =
    target.kind === "feature"
      ? [...paths, ...points].find((f) => f.id === target.id) ?? null
      : null;
  if (!group && !feature && !bulk) return null;
  if (bulk && selectedIds.length === 0) return null;

  const parent = feature ? groups.find((g) => g.id === feature.groupId) : null;
  const own = feature?.style ?? {};

  // Bulk edits merge the patch into each selected feature's own override.
  const setOwn = (patch: Record<string, unknown>) => {
    if (bulk) {
      const all = [...paths, ...points];
      for (const id of selectedIds) {
        const f = all.find((x) => x.id === id);
        updateFeature(id, { style: { ...(f?.style ?? {}), ...patch } });
      }
      return;
    }
    if (feature) updateFeature(feature.id, { style: { ...own, ...patch } });
  };

  const title = group ? group.name : bulk ? `${selectedIds.length} features` : feature!.name;
  const kicker = group
    ? "Group symbology"
    : bulk
      ? "Bulk symbology · selection"
      : `Feature symbology${parent ? ` · in ${parent.name}` : ""}`;

  return createPortal(
    <div className="sy-backdrop" onClick={onClose}>
      <div className="sy-window" role="dialog" aria-label="Symbology" onClick={(e) => e.stopPropagation()}>
        <div className="sy-head">
          <div>
            <div className="sy-kicker">{kicker}</div>
            <div className="sy-title">{title}</div>
          </div>
          <button className="sy-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="sy-body">
          {/* ---- colour ---- */}
          <div className="sy-field">
            <span className="sy-label">Colour</span>
            <div className="sy-swatches">
              {(feature || bulk) && (
                <button
                  className={`sy-sw inherit${own.color === undefined ? " on" : ""}`}
                  onClick={() => setOwn({ color: undefined })}
                  title="Inherit from group"
                >
                  ↺
                </button>
              )}
              {GROUP_PALETTE.map((c) => {
                const active = group ? group.color === c : own.color === c;
                return (
                  <button
                    key={c}
                    className={`sy-sw${active ? " on" : ""}`}
                    style={{ background: c }}
                    onClick={() => (group ? updateGroup(group.id, { color: c }) : setOwn({ color: c }))}
                    aria-label={`Colour ${c}`}
                  />
                );
              })}
            </div>
          </div>

          {group && (
            <div className="sy-field">
              <span className="sy-label">Colour by</span>
              <div className="sy-seg">
                <button
                  className={group.colorMode === "fixed" ? "on" : ""}
                  onClick={() => updateGroup(group.id, { colorMode: "fixed" })}
                >
                  Group colour
                </button>
                <button
                  className={group.colorMode === "status" ? "on" : ""}
                  onClick={() => updateGroup(group.id, { colorMode: "status" })}
                >
                  Status
                </button>
              </div>
            </div>
          )}

          {/* ---- symbol ---- */}
          <div className="sy-field">
            <span className="sy-label">Point symbol</span>
            <div className="sy-seg">
              {(feature || bulk) && (
                <button className={own.symbol === undefined ? "on" : ""} onClick={() => setOwn({ symbol: undefined })}>
                  ↺
                </button>
              )}
              {SYMBOLS.map((s) => {
                const active = group ? (group.symbol ?? "circle") === s.id : own.symbol === s.id;
                return (
                  <button
                    key={s.id}
                    className={active ? "on" : ""}
                    onClick={() =>
                      group
                        ? updateGroup(group.id, { symbol: s.id as SymbolShape })
                        : setOwn({ symbol: s.id })
                    }
                    title={s.id}
                  >
                    {s.glyph}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- line style ---- */}
          <div className="sy-field">
            <span className="sy-label">Line style</span>
            <div className="sy-seg">
              {(feature || bulk) && (
                <button
                  className={own.lineStyle === undefined ? "on" : ""}
                  onClick={() => setOwn({ lineStyle: undefined })}
                >
                  ↺
                </button>
              )}
              {LINE_STYLES.map((s) => {
                const active = group ? (group.lineStyle ?? "solid") === s.id : own.lineStyle === s.id;
                return (
                  <button
                    key={s.id}
                    className={active ? "on" : ""}
                    onClick={() =>
                      group
                        ? updateGroup(group.id, { lineStyle: s.id as LineStyle })
                        : setOwn({ lineStyle: s.id })
                    }
                    title={s.id}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- width ---- */}
          <div className="sy-field">
            <span className="sy-label">Width</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={group ? group.width : (own.width ?? parent?.width ?? 3)}
              onChange={(e) =>
                group
                  ? updateGroup(group.id, { width: Number(e.target.value) })
                  : setOwn({ width: Number(e.target.value) })
              }
            />
            <span className="sy-val">{group ? group.width : (own.width ?? parent?.width ?? 3)}</span>
          </div>

          {group && (
            <>
              <div className="sy-field">
                <span className="sy-label">Opacity</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={group.opacity}
                  onChange={(e) => updateGroup(group.id, { opacity: Number(e.target.value) })}
                />
                <span className="sy-val">{group.opacity}%</span>
              </div>

              <div className="sy-field">
                <span className="sy-label">Label with</span>
                <select
                  className="sy-select"
                  value={group.labelField ?? "name"}
                  onChange={(e) => updateGroup(group.id, { labelField: e.target.value as never })}
                >
                  {LABEL_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sy-field">
                <span className="sy-label">Labels</span>
                <label className="sy-check">
                  <input
                    type="checkbox"
                    checked={group.labels}
                    onChange={(e) => updateGroup(group.id, { labels: e.target.checked })}
                  />
                  Show
                </label>
                <input
                  type="range"
                  min={8}
                  max={20}
                  value={group.labelSize}
                  disabled={!group.labels}
                  onChange={(e) => updateGroup(group.id, { labelSize: Number(e.target.value) })}
                />
                <span className="sy-val">{group.labelSize}px</span>
              </div>

              <label className="sy-obs">
                <span className="sy-label">Observations — this group’s section in the report</span>
                <textarea
                  rows={3}
                  value={group.description}
                  placeholder="e.g. All flåte anchor lines; tension within spec except L4."
                  onChange={(e) => updateGroup(group.id, { description: e.target.value })}
                />
              </label>
            </>
          )}

          {(feature || bulk) && (
            <div className="sy-note">
              {bulk
                ? `Applies to all ${selectedIds.length} selected features. ↺ clears the override so they inherit their group again.`
                : `Blank / ↺ means “inherit from ${parent ? parent.name : "the default style"}”.`}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
