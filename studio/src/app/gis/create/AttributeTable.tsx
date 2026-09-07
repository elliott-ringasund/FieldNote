import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { statusColor, STATUSES } from "./deliverable";
import { fmtLength, pathLengthM, toDdm } from "./geo";
import type { Survey } from "./useSurvey";
import "./AttributeTable.css";

type Props = {
  survey: Survey;
  open: boolean;
  onClose: () => void;
  /** Limit to one group; null shows everything. */
  groupId: string | null;
};

/**
 * The attribute table — QGIS's grid over the drawn features.
 *
 * Every feature of a group as a row: name, status, geometry facts, and each
 * imported attribute as its own column. Editable in place, because bulk fixing
 * 35 rows is the whole point; selecting a row selects it on the map.
 */
export function AttributeTable({ survey, open, onClose, groupId }: Props) {
  const {
    points,
    paths,
    groups,
    selectedIds,
    setSelectedId,
    toggleSelected,
    selectMany,
    clearSelection,
    updateFeature,
    removeMany,
  } = survey;
  const [filter, setFilter] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows = useMemo(() => {
    const inGroup = <T extends { groupId?: string }>(f: T) =>
      groupId == null || f.groupId === groupId;
    const all = [
      ...paths.filter(inGroup).map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind as string,
        status: p.status,
        note: p.note,
        attrs: p.attrs ?? {},
        groupId: p.groupId,
        photos: p.photos.length,
        start: p.vertices[0],
        end: p.vertices[p.vertices.length - 1],
        measure: fmtLength(pathLengthM(p.vertices, p.kind === "area")),
      })),
      ...points.filter(inGroup).map((p) => ({
        id: p.id,
        name: p.name,
        kind: "point",
        status: p.status,
        note: p.note,
        attrs: p.attrs ?? {},
        groupId: p.groupId,
        photos: p.photos.length,
        start: [p.lng, p.lat] as [number, number],
        end: undefined,
        measure: "",
      })),
    ];
    const q = filter.trim().toLowerCase();
    const matched = q
      ? all.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.note.toLowerCase().includes(q) ||
            Object.values(r.attrs).some((v) => String(v).toLowerCase().includes(q))
        )
      : all;
    return onlySelected ? matched.filter((r) => selectedIds.includes(r.id)) : matched;
  }, [points, paths, groupId, filter, onlySelected, selectedIds]);

  const attrCols = useMemo(() => {
    const keys: string[] = [];
    for (const r of rows) for (const k of Object.keys(r.attrs)) if (!keys.includes(k)) keys.push(k);
    return keys;
  }, [rows]);

  if (!open) return null;
  const group = groups.find((g) => g.id === groupId);

  return createPortal(
    <div className="at-backdrop" onClick={onClose}>
      <div className="at-window" role="dialog" aria-label="Attribute table" onClick={(e) => e.stopPropagation()}>
        <div className="at-head">
          <div className="at-title">
            Attribute table
            <span className="at-sub">{group ? group.name : "All features"} · {rows.length} rows</span>
          </div>
          <input
            className="at-filter"
            value={filter}
            placeholder="Filter…"
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter rows"
          />
          <button className="at-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="at-tools">
          <button onClick={() => selectMany(rows.map((r) => r.id))} title="Select all rows shown">
            ▣ All
          </button>
          <button onClick={clearSelection} title="Clear the selection">
            ▢ None
          </button>
          <button
            onClick={() =>
              selectMany(rows.filter((r) => !selectedIds.includes(r.id)).map((r) => r.id))
            }
            title="Invert the selection"
          >
            ⧉ Invert
          </button>
          <button
            className={onlySelected ? "on" : ""}
            onClick={() => setOnlySelected((s) => !s)}
            title="Show only selected rows"
          >
            ◉ Selected only
          </button>
          <span className="at-sep" />
          <button
            className={`danger${confirmDelete ? " arm" : ""}`}
            disabled={selectedIds.length === 0}
            title="Delete the selected features"
            onClick={() => {
              if (confirmDelete) {
                removeMany(selectedIds);
                setConfirmDelete(false);
              } else {
                setConfirmDelete(true);
                window.setTimeout(() => setConfirmDelete(false), 2500);
              }
            }}
          >
            {confirmDelete ? "Sure?" : "🗑 Delete"}
          </button>
          <span className="at-selcount">
            {selectedIds.length} of {rows.length} selected
          </span>
        </div>

        <div className="at-grid">
          <table>
            <thead>
              <tr>
                <th className="at-num">#</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Start (DDM)</th>
                <th>End (DDM)</th>
                <th>Length</th>
                <th>📷</th>
                {attrCols.map((k) => (
                  <th key={k} title={k}>
                    {k}
                  </th>
                ))}
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className="at-empty" colSpan={9 + attrCols.length}>
                    No features{filter ? " match that filter" : ""}.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={selectedIds.includes(r.id) ? "sel" : ""}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) toggleSelected(r.id);
                    else setSelectedId(r.id);
                  }}
                >
                  <td className="at-num">{i + 1}</td>
                  <td>
                    <input
                      value={r.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateFeature(r.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="at-dim">{r.kind}</td>
                  <td>
                    <select
                      value={r.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateFeature(r.id, { status: e.target.value as never })}
                      style={{ color: statusColor(r.status) }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="at-mono">
                    {r.start ? `${toDdm(r.start[1], "lat")} ${toDdm(r.start[0], "lng")}` : "—"}
                  </td>
                  <td className="at-mono">
                    {r.end ? `${toDdm(r.end[1], "lat")} ${toDdm(r.end[0], "lng")}` : "—"}
                  </td>
                  <td className="at-mono">{r.measure}</td>
                  <td className="at-dim">{r.photos || ""}</td>
                  {attrCols.map((k) => (
                    <td key={k}>
                      <input
                        value={String(r.attrs[k] ?? "")}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const n = Number(raw);
                          updateFeature(r.id, {
                            attrs: {
                              ...r.attrs,
                              [k]: raw !== "" && Number.isFinite(n) && /^-?[\d.]+$/.test(raw) ? n : raw,
                            },
                          });
                        }}
                      />
                    </td>
                  ))}
                  <td>
                    <input
                      value={r.note}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateFeature(r.id, { note: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="at-foot">
          <span>Click a row to select it on the map · Ctrl-click to select several · edits save straight to the survey.</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
