import { useEffect, useState, type DragEvent, type MouseEvent } from "react";

import { statusColor } from "./deliverable";
import { fmtLength, pathLengthM } from "./geo";
import { SYMBOLS, type Survey, type SurveyGroup } from "./useSurvey";
import "./SurveyTree.css";

/** Small eyelid toggle — open when shown, lidded when hidden. */
function Eye({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      {on ? (
        <>
          <path
            d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <circle cx="8" cy="8" r="1.9" fill="currentColor" />
        </>
      ) : (
        <path
          d="M1.5 6.4S4 10 8 10s6.5-3.6 6.5-3.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

type Props = {
  survey: Survey;
  /** Open the styling panel for a group. */
  onEditGroup: (id: string) => void;
  onEditFeature: (id: string) => void;
  onEditSelection: () => void;
  onOpenTable: (groupId: string | null) => void;
};

type Menu = { x: number; y: number; groupId: string | null; featureId?: string } | null;

/**
 * The layers tree — groups and their features together, QGIS-style.
 *
 * One tree instead of a separate groups tab: a group is a folder holding the
 * lines and points drawn into it. New groups come from the button or a
 * right-click, features are dragged between groups, and a group's row carries
 * its colour key, visibility and count.
 */
export function SurveyTree({ survey, onEditGroup, onEditFeature, onEditSelection, onOpenTable }: Props) {
  const {
    groups,
    points,
    paths,
    selectedId,
    selectedIds,
    setSelectedId,
    toggleSelected,
    createGroup,
    updateGroup,
    deleteGroup,
    assignToGroup,
    updatePoint,
    updatePath,
    removePoint,
    removePath,
    updateFeature,
    collapsed,
    toggleCollapsed,
  } = survey;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const featuresOf = (groupId: string | null) => ({
    paths: paths.filter((p) => (p.groupId ?? null) === groupId),
    points: points.filter((p) => (p.groupId ?? null) === groupId),
  });

  const onContext = (e: MouseEvent, groupId: string | null, featureId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, groupId, featureId });
  };

  const drop = (e: DragEvent, groupId: string | null) => {
    e.preventDefault();
    const id = dragId ?? e.dataTransfer.getData("text/plain");
    if (id) assignToGroup(id, groupId ?? undefined);
    setDragId(null);
    setDropGroup(null);
  };

  const featureRow = (
    f: { id: string; name: string; status: string; groupId?: string; visible?: boolean },
    kind: "line" | "area" | "point",
    meta: string
  ) => {
    const sel = selectedIds.includes(f.id);
    const isPoint = kind === "point";
    return (
      <div
        key={f.id}
        className={`st-feat${sel ? " sel" : ""}${dragId === f.id ? " dragging" : ""}`}
        draggable
        onDragStart={(e) => {
          setDragId(f.id);
          e.dataTransfer.setData("text/plain", f.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragId(null);
          setDropGroup(null);
        }}
        onClick={(e) => {
          // Ctrl/⌘-click adds to the selection; a plain click replaces it.
          if (e.ctrlKey || e.metaKey) toggleSelected(f.id);
          else setSelectedId(sel && selectedIds.length === 1 ? null : f.id);
        }}
        onContextMenu={(e) => onContext(e, f.groupId ?? null, f.id)}
      >
        <button
          className="st-fvis"
          aria-label={f.visible === false ? `Show ${f.name}` : `Hide ${f.name}`}
          title={f.visible === false ? "Show" : "Hide"}
          onClick={(e) => {
            e.stopPropagation();
            updateFeature(f.id, { visible: f.visible === false });
          }}
          style={{ color: f.visible === false ? "#5f767d" : "#8fd3ff" }}
        >
          <Eye on={f.visible !== false} />
        </button>
        <span className="st-dot" style={{ background: statusColor(f.status as never) }} />
        <span className="st-kind">{isPoint ? "●" : kind === "line" ? "⟋" : "▱"}</span>
        <input
          className="st-name"
          value={f.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            isPoint
              ? updatePoint(f.id, { name: e.target.value })
              : updatePath(f.id, { name: e.target.value })
          }
        />
        <span className="st-meta">{meta}</span>
        <button
          className="st-x"
          aria-label={`Delete ${f.name}`}
          onClick={(e) => {
            e.stopPropagation();
            isPoint ? removePoint(f.id) : removePath(f.id);
          }}
        >
          ✕
        </button>
      </div>
    );
  };

  const section = (group: SurveyGroup | null) => {
    const id = group?.id ?? "__ungrouped";
    const set = featuresOf(group?.id ?? null);
    const count = set.paths.length + set.points.length;
    if (!group && count === 0) return null;
    const isCollapsed = collapsed.includes(id);

    return (
      <div
        key={id}
        className={`st-group${dropGroup === id ? " drop" : ""}`}
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          setDropGroup(id);
        }}
        onDragLeave={() => setDropGroup((d) => (d === id ? null : d))}
        onDrop={(e) => drop(e, group?.id ?? null)}
        onContextMenu={(e) => onContext(e, group?.id ?? null)}
      >
        <div className="st-ghead">
          <button
            className="st-chev"
            onClick={() => toggleCollapsed(id)}
            aria-label={isCollapsed ? `Expand ${group?.name ?? "Ungrouped"}` : `Collapse ${group?.name ?? "Ungrouped"}`}
          >
            {isCollapsed ? "▸" : "▾"}
          </button>

          {group ? (
            <button
              className="st-key"
              style={{
                background: group.colorMode === "fixed" ? group.color : "transparent",
                borderColor: group.color,
              }}
              onClick={() => onEditGroup(group.id)}
              title="Symbology"
              aria-label={`Symbology for ${group.name}`}
            >
              {SYMBOLS.find((s) => s.id === (group.symbol ?? "circle"))?.glyph}
            </button>
          ) : (
            <span className="st-key ghost" />
          )}

          {group && renaming === group.id ? (
            <input
              className="st-rename"
              autoFocus
              defaultValue={group.name}
              onBlur={(e) => {
                updateGroup(group.id, { name: e.target.value.trim() || group.name });
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <span
              className="st-gname"
              onDoubleClick={() => group && setRenaming(group.id)}
              title={group ? "Double-click to rename · right-click for more" : undefined}
            >
              {group?.name ?? "Ungrouped"}
            </span>
          )}

          <span className="st-count">{count}</span>

          {group && (
            <button
              className="st-vis"
              onClick={() => updateGroup(group.id, { visible: !group.visible })}
              aria-label={group.visible ? `Hide ${group.name}` : `Show ${group.name}`}
              style={{ color: group.visible ? "#8fd3ff" : "#7a939b" }}
            >
              <Eye on={group.visible} />
            </button>
          )}
        </div>

        {!isCollapsed && (
          <div className="st-feats">
            {count === 0 && <div className="st-empty">Drag features here</div>}
            {set.paths.map((p) =>
              featureRow(p, p.kind, fmtLength(pathLengthM(p.vertices, p.kind === "area")))
            )}
            {set.points.map((p) =>
              featureRow(p, "point", `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="st" onContextMenu={(e) => onContext(e, null)}>
      <div className="st-head">
        <span>Layers{selectedIds.length > 1 ? ` · ${selectedIds.length} selected` : ""}</span>
        <button className="st-newgroup" onClick={() => createGroup()}>
          ＋ Group
        </button>
      </div>

      {groups.length === 0 && points.length + paths.length === 0 && (
        <div className="st-empty">Draw or import features, then group them.</div>
      )}

      {groups.map((g) => section(g))}
      {section(null)}

      {menu && (
        <div
          className="st-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              createGroup();
              setMenu(null);
            }}
          >
            ＋ New group
          </button>
          {menu.featureId && (
            <>
              <button
                onClick={() => {
                  onEditFeature(menu.featureId!);
                  setMenu(null);
                }}
              >
                ◐ Feature symbology…
              </button>
              {selectedIds.length > 1 && (
                <button
                  onClick={() => {
                    onEditSelection();
                    setMenu(null);
                  }}
                >
                  ◑ Style {selectedIds.length} selected…
                </button>
              )}
            </>
          )}
          <button
            onClick={() => {
              onOpenTable(menu.groupId);
              setMenu(null);
            }}
          >
            ▦ Open attribute table
          </button>
          {menu.groupId && (
            <>
              <button
                onClick={() => {
                  setRenaming(menu.groupId);
                  setMenu(null);
                }}
              >
                ✎ Rename group
              </button>
              <button
                onClick={() => {
                  onEditGroup(menu.groupId!);
                  setMenu(null);
                }}
              >
                ◐ Symbology…
              </button>
              <button
                className="danger"
                onClick={() => {
                  deleteGroup(menu.groupId!);
                  setMenu(null);
                }}
              >
                ✕ Delete group
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
