import { useState } from "react";

import { GROUP_PALETTE, LINE_STYLES, SYMBOLS, type Survey, type SurveyGroup } from "./useSurvey";
import "./GroupsPanel.css";

type Props = { survey: Survey };

/**
 * Feature groups — the symbology layer of the editor.
 *
 * A group owns colour, opacity, width and label settings; its features inherit
 * them. That's what makes "show the flåte lines in red and fade the buoy lines
 * back" a two-click job instead of thirty edits.
 */
export function GroupsPanel({ survey }: Props) {
  const {
    groups,
    points,
    paths,
    createGroup,
    updateGroup,
    deleteGroup,
    assignToGroup,
    selectedId,
    setSelectedId,
  } = survey;

  const [openStyle, setOpenStyle] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const features = [...paths, ...points];
  const inGroup = (g: SurveyGroup) => features.filter((f) => f.groupId === g.id);
  const ungrouped = features.filter((f) => !f.groupId || !groups.some((g) => g.id === f.groupId));

  const move = (featureId: string, groupId: string | undefined) => assignToGroup(featureId, groupId);

  const featureRow = (f: (typeof features)[number], groupId?: string) => (
    <div
      key={f.id}
      className={`gp-feature${f.id === selectedId ? " sel" : ""}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", f.id)}
      onClick={() => setSelectedId(f.id === selectedId ? null : f.id)}
    >
      <span className="gp-fgrip">⠿</span>
      <span className="gp-fname">{f.name}</span>
      <select
        className="gp-fmove"
        value={groupId ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => move(f.id, e.target.value || undefined)}
        aria-label={`Group for ${f.name}`}
      >
        <option value="">— none —</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="gp">
      <div className="gp-head">
        <span>Groups</span>
        <button className="gp-new" onClick={() => createGroup()}>
          ＋ Group
        </button>
      </div>

      {groups.length === 0 && (
        <div className="gp-empty">
          Make a group to colour a set of features together — e.g. “Flåte lines”, “Buoy lines”.
        </div>
      )}

      {groups.map((g) => {
        const members = inGroup(g);
        const styling = openStyle === g.id;
        return (
          <div
            key={g.id}
            className="gp-group"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) move(id, g.id);
            }}
          >
            <div className="gp-grow">
              <button
                className="gp-vis"
                onClick={() => updateGroup(g.id, { visible: !g.visible })}
                aria-label={g.visible ? `Hide ${g.name}` : `Show ${g.name}`}
                style={{ color: g.visible ? "#6fe0cd" : "#7a939b" }}
              >
                {g.visible ? "◉" : "○"}
              </button>

              <button
                className="gp-swatch"
                style={{ background: g.colorMode === "fixed" ? g.color : "transparent" }}
                onClick={() => setOpenStyle(styling ? null : g.id)}
                aria-label={`Style ${g.name}`}
                title="Style"
              >
                {g.colorMode === "status" ? "◐" : ""}
              </button>

              {renaming === g.id ? (
                <input
                  className="gp-rename"
                  autoFocus
                  defaultValue={g.name}
                  onBlur={(e) => {
                    updateGroup(g.id, { name: e.target.value.trim() || g.name });
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <span
                  className="gp-gname"
                  onDoubleClick={() => setRenaming(g.id)}
                  title="Double-click to rename"
                >
                  {g.name}
                </span>
              )}

              <span className="gp-count">{members.length}</span>
              <button
                className="gp-btn"
                onClick={() => setOpenStyle(styling ? null : g.id)}
                aria-label={`Toggle style for ${g.name}`}
              >
                {styling ? "▾" : "▸"}
              </button>
              <button
                className="gp-btn"
                onClick={() => deleteGroup(g.id)}
                aria-label={`Delete ${g.name}`}
                title="Delete group (features are kept)"
              >
                ✕
              </button>
            </div>

            {styling && (
              <div className="gp-style">
                <div className="gp-swatches">
                  {GROUP_PALETTE.map((c) => (
                    <button
                      key={c}
                      className={`gp-chip${g.color === c && g.colorMode === "fixed" ? " on" : ""}`}
                      style={{ background: c }}
                      onClick={() => updateGroup(g.id, { color: c, colorMode: "fixed" })}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                  <button
                    className={`gp-chip status${g.colorMode === "status" ? " on" : ""}`}
                    onClick={() => updateGroup(g.id, { colorMode: "status" })}
                    title="Colour by OK / Attention / Fail"
                    aria-label="Colour by status"
                  >
                    ◐
                  </button>
                </div>

                <label className="gp-slider">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={g.opacity}
                    onChange={(e) => updateGroup(g.id, { opacity: Number(e.target.value) })}
                  />
                  <b>{g.opacity}%</b>
                </label>

                <label className="gp-slider">
                  <span>Width</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={g.width}
                    onChange={(e) => updateGroup(g.id, { width: Number(e.target.value) })}
                  />
                  <b>{g.width}px</b>
                </label>

                <div className="gp-symrow">
                  <span>Symbol</span>
                  {SYMBOLS.map((s) => (
                    <button
                      key={s.id}
                      className={`gp-sym${(g.symbol ?? "circle") === s.id ? " on" : ""}`}
                      onClick={() => updateGroup(g.id, { symbol: s.id })}
                      title={s.id}
                      aria-label={`Symbol ${s.id}`}
                    >
                      {s.glyph}
                    </button>
                  ))}
                </div>

                <div className="gp-symrow">
                  <span>Line</span>
                  {LINE_STYLES.map((s) => (
                    <button
                      key={s.id}
                      className={`gp-sym wide${(g.lineStyle ?? "solid") === s.id ? " on" : ""}`}
                      onClick={() => updateGroup(g.id, { lineStyle: s.id })}
                      title={s.id}
                      aria-label={`Line style ${s.id}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <label className="gp-obs">
                  <span>Observations — becomes this group’s section in the report</span>
                  <textarea
                    rows={2}
                    value={g.description}
                    placeholder="e.g. All flåte anchor lines inspected; tension within spec except L4."
                    onChange={(e) => updateGroup(g.id, { description: e.target.value })}
                  />
                </label>

                <label className="gp-slider">
                  <span>Labels</span>
                  <input
                    type="checkbox"
                    checked={g.labels}
                    onChange={(e) => updateGroup(g.id, { labels: e.target.checked })}
                  />
                  <input
                    type="range"
                    min={8}
                    max={20}
                    value={g.labelSize}
                    disabled={!g.labels}
                    onChange={(e) => updateGroup(g.id, { labelSize: Number(e.target.value) })}
                  />
                  <b>{g.labelSize}px</b>
                </label>
              </div>
            )}

            {members.length === 0 ? (
              <div className="gp-drop">Drag features here</div>
            ) : (
              members.map((f) => featureRow(f, g.id))
            )}
          </div>
        );
      })}

      {ungrouped.length > 0 && (
        <div
          className="gp-group is-ungrouped"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (id) move(id, undefined);
          }}
        >
          <div className="gp-grow">
            <span className="gp-gname muted">Ungrouped</span>
            <span className="gp-count">{ungrouped.length}</span>
          </div>
          {ungrouped.map((f) => featureRow(f, undefined))}
        </div>
      )}
    </div>
  );
}
