import { type MouseEvent as ReactMouseEvent, useCallback, useRef, useState } from "react";

export type Point = { x: number; y: number };

/**
 * Minimal drag-to-move for an absolutely-positioned panel.
 *
 * Returns the current position, a ref for the moving element, and an
 * `onDragStart` to put on the drag handle. Position is clamped to the parent so
 * a panel can't be dragged fully off-screen. Uses mouse events (desktop ops
 * tool). Deliberately tiny — full docking / snapping ("joinable") is a later,
 * library-backed step.
 */
export function useDraggable(initial: Point) {
  const [pos, setPos] = useState<Point>(initial);
  const elRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!drag.current) return;
    const el = elRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? window.innerWidth;
    const ph = parent?.clientHeight ?? window.innerHeight;
    const ew = el?.offsetWidth ?? 0;
    const eh = el?.offsetHeight ?? 0;
    const x = Math.min(Math.max(0, e.clientX - drag.current.dx), Math.max(0, pw - ew));
    const y = Math.min(Math.max(0, e.clientY - drag.current.dy), Math.max(0, ph - eh));
    setPos({ x, y });
  }, []);

  const onMouseUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const onDragStart = useCallback(
    (e: ReactMouseEvent) => {
      const el = elRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    },
    [onMouseMove, onMouseUp]
  );

  return { pos, elRef, onDragStart };
}
