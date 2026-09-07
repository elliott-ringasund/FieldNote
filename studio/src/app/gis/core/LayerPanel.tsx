import { useState, type DragEvent } from "react";

import { GROUP_LABELS, catalogLayer, type CatalogGroup, type CatalogLayerId } from "../layerCatalog";
import type { Workspace } from "./useWorkspace";
import "./LayerPanel.css";

type Props = {
  workspace: Workspace;
  onAddLayers: () => void;
  onExportLayer: (id: CatalogLayerId) => void;
};

/**
 * The layers panel: add layers, organise them into your own groups, and
 * control visibility / legend / export per layer.
 *
 * Layers are dragged between sections. Dropping on a user group files the layer
 * there; dropping on a catalog section takes it back out of any group.
 */
export function LayerPanel({ workspace, onAddLayers, onExportLayer }: Props) {
  const {
    layers,
    hidden,
    collapsed,
    openLegend,
    components,
    sections,
    toggleHidden,
    toggleLegend,
    toggleCollapsed,
    removeLayer,
    createGroup,
    renameGroup,
    deleteGroup,
    moveToGroup,
  } = workspace;

  const [dragging, setDragging] = useState<CatalogLayerId | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const onDragStart = (e: DragEvent, id: CatalogLayerId) => {
    setDragging(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const onDrop = (e: DragEvent, sectionId: string, kind: "user" | "catalog") => {
    e.preventDefault();
    const id = (dragging ?? e.dataTransfer.getData("text/plain")) as CatalogLayerId;
    if (id) moveToGroup(id, kind === "user" ? sectionId : null);
    setDragging(null);
    setDropTarget(null);
  };

  const allowDrop = (e: DragEvent, sectionId: string) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(sectionId);
  };

  return (
    <div className="lp">
      <div className="lp-head">
        <span>Layers · workspace</span>
        <button className="lp-newgroup" onClick={() => createGroup()} title="New group">
          ＋ Group
        </button>
      </div>

      <button className="lp-add" onClick={onAddLayers}>
        <span className="lp-add-plus">＋</span> Add layers
      </button>

      {layers.length === 0 && <div className="lp-empty">No layers — add one.</div>}

      <div className="lp-sections">
        {sections.map((section) => {
          const isUser = section.kind === "user";
          const isCollapsed = collapsed.includes(section.id);
          const groupHidden = hidden.includes(section.id as CatalogLayerId);
          const label = isUser ? section.name : GROUP_LABELS[section.name as CatalogGroup];

          return (
            <div
              key={section.id}
              className={`lp-section${isUser ? " is-user" : ""}${
                dropTarget === section.id ? " is-drop" : ""
              }`}
              onDragOver={(e) => allowDrop(e, section.id)}
              onDragLeave={() => setDropTarget((t) => (t === section.id ? null : t))}
              onDrop={(e) => onDrop(e, section.id, section.kind)}
            >
              <div className="lp-sechead">
                <button
                  className="lp-chev"
                  onClick={() => toggleCollapsed(section.id)}
                  aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>

                {isUser && renaming === section.id ? (
                  <input
                    className="lp-rename"
                    autoFocus
                    defaultValue={section.name}
                    onBlur={(e) => {
                      renameGroup(section.id, e.target.value.trim() || section.name);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <span
                    className="lp-secname"
                    onDoubleClick={() => isUser && setRenaming(section.id)}
                    title={isUser ? "Double-click to rename" : undefined}
                  >
                    {label}
                  </span>
                )}

                <span className="lp-seccount">{section.layers.length}</span>

                {isUser && (
                  <>
                    <button
                      className="lp-secbtn"
                      onClick={() => toggleHidden(section.id)}
                      title={groupHidden ? "Show group" : "Hide group"}
                      aria-label={groupHidden ? `Show ${label}` : `Hide ${label}`}
                    >
                      {groupHidden ? "○" : "◉"}
                    </button>
                    <button
                      className="lp-secbtn"
                      onClick={() => deleteGroup(section.id)}
                      title="Dissolve group (layers are kept)"
                      aria-label={`Dissolve ${label}`}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>

              {isUser && section.layers.length === 0 && !isCollapsed && (
                <div className="lp-dropzone">Drag layers here</div>
              )}

              {!isCollapsed &&
                section.layers.map((id) => {
                  const l = catalogLayer(id);
                  const vis = !hidden.includes(id);
                  const legendOpen = openLegend.includes(id);
                  const swatch = l.legend[0]?.swatch;
                  return (
                    <div
                      key={id}
                      className={`lp-layer${dragging === id ? " is-dragging" : ""}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                    >
                      <div className="lp-row" style={{ opacity: vis ? 1 : 0.45 }}>
                        <span className="lp-grip" title="Drag to a group">
                          ⠿
                        </span>
                        <button
                          className="lp-vis"
                          onClick={() => toggleHidden(id)}
                          aria-label={vis ? `Hide ${l.label}` : `Show ${l.label}`}
                          style={{ color: vis ? "#6fe0cd" : "#7a939b" }}
                        >
                          {vis ? "◉" : "○"}
                        </button>
                        <span
                          className="lp-icon"
                          style={{ color: swatch?.startsWith("#") ? swatch : "#cfe0e4" }}
                        >
                          {l.icon}
                        </span>
                        <span className="lp-name">{l.label}</span>
                        {!l.ready && (
                          <span className="lp-soon" title={l.hint}>
                            no data
                          </span>
                        )}
                        <button
                          className="lp-btn"
                          onClick={() => toggleLegend(id)}
                          aria-label={`Legend for ${l.label}`}
                          title="Legend"
                        >
                          {legendOpen ? "▾" : "▸"}
                        </button>
                        <button
                          className="lp-btn"
                          onClick={() => onExportLayer(id)}
                          aria-label={`Export ${l.label}`}
                          title="Export GeoJSON"
                        >
                          ⭳
                        </button>
                        <button
                          className="lp-btn"
                          onClick={() => removeLayer(id)}
                          aria-label={`Remove ${l.label}`}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>

                      {components[id] && components[id]!.length > 0 && (
                        <div className="lp-comps">
                          {components[id]!.map((c) => (
                            <span key={c} className="lp-comp">
                              {c}
                            </span>
                          ))}
                        </div>
                      )}

                      {legendOpen && (
                        <div className="lp-legend">
                          {l.legend.map((li, i) => (
                            <div key={i} className="lp-legrow">
                              <span className="lp-swatch" style={{ background: li.swatch }} />
                              <span>{li.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
