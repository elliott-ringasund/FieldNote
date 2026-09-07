import { type MouseEvent as ReactMouseEvent, type RefObject } from "react";

import { MAP_TOOLS, type ToolId } from "../tools";
import type { Point } from "./useDraggable";
import "./ToolBar.css";

type Props = {
  active: ToolId | null;
  onToggle: (id: ToolId) => void;
  /** Drag: position, the panel ref, and the grip's mouse-down. */
  pos: Point;
  dragRef: RefObject<HTMLDivElement>;
  onGripDown: (e: ReactMouseEvent) => void;
};

/**
 * The tools toolbar — a draggable vertical strip of actions.
 *
 * Tools are things you *do* (route, measure, note, filter, export), kept apart
 * from the layers panel. Drag it by the grip; selecting a tool opens a flyout to
 * its left. Flyouts are stubs until each tool is built.
 */
export function ToolBar({ active, onToggle, pos, dragRef, onGripDown }: Props) {
  const activeTool = MAP_TOOLS.find((t) => t.id === active) ?? null;

  return (
    <div
      ref={dragRef}
      className="toolbar"
      style={{ left: pos.x, top: pos.y }}
      role="toolbar"
      aria-label="Map tools"
    >
      <div className="toolbar-strip">
        <div
          className="toolbar-grip"
          onMouseDown={onGripDown}
          title="Drag to move"
          aria-label="Move toolbar"
        >
          ⠿
        </div>
        {MAP_TOOLS.map((t) => (
          <button
            key={t.id}
            className={`toolbar-btn${active === t.id ? " active" : ""}`}
            onClick={() => onToggle(t.id)}
            aria-pressed={active === t.id}
            aria-label={t.label}
            title={`${t.label} — ${t.hint}`}
          >
            <span className="toolbar-ico" aria-hidden="true">
              {t.icon}
            </span>
          </button>
        ))}
      </div>

      {activeTool && (
        <div className="toolbar-flyout">
          <div className="toolbar-flyout-title">
            <span aria-hidden="true">{activeTool.icon}</span> {activeTool.label}
          </div>
          <div className="toolbar-flyout-hint">{activeTool.hint}</div>
          <div className="toolbar-flyout-stub">Not built yet — stub.</div>
        </div>
      )}
    </div>
  );
}
