import { useEffect, useRef, useState } from "react";
import type { DbmlTable, TablePosition, Point } from "../types";

type Props = {
  table: DbmlTable;
  position: TablePosition | undefined;
  defaultPosition: Point;
  zoom: number;
  offset: Point;
  selected: boolean;
  draggable: boolean;
  onSelect: (name: string) => void;
  onDrag: (name: string, pos: TablePosition) => void;
};

const TABLE_WIDTH = 220;
const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 36;

function tableHeight(t: DbmlTable): number {
  return HEADER_HEIGHT + t.columns.length * ROW_HEIGHT + 8;
}

export { TABLE_WIDTH, ROW_HEIGHT, HEADER_HEIGHT, tableHeight };

export default function TableCard({
  table,
  position,
  defaultPosition,
  zoom,
  offset,
  selected,
  draggable,
  onSelect,
  onDrag,
}: Props) {
  const pos = position || defaultPosition;
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<Point>({ x: 0, y: 0 });
  const posStart = useRef<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const onDragRef = useRef(onDrag);
  zoomRef.current = zoom;
  onDragRef.current = onDrag;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(table.name);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const z = zoomRef.current;
      const dx = (e.clientX - dragStart.current.x) / z;
      const dy = (e.clientY - dragStart.current.y) / z;
      onDragRef.current(table.name, { x: posStart.current.x + dx, y: posStart.current.y + dy });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, table.name]);

  const headerColor = table.headerColor || "#27272a";
  const rows = table.columns;

  return (
    <div
      className={`absolute select-none rounded-2xl border ${
        selected
          ? "border-ink-200 ring-1 ring-ink-300/30"
          : "border-white/10"
      }`}
      style={{
        left: pos.x,
        top: pos.y,
        width: TABLE_WIDTH,
        cursor: draggable ? (dragging ? "grabbing" : "grab") : "default",
        background: "#18181b",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        pointerEvents: draggable ? "auto" : "none",
      }}
      onMouseDown={draggable ? handleMouseDown : undefined}
    >
      {/* Header */}
      <div
        className="rounded-t-2xl px-3 py-2 flex items-center gap-2 border-b border-white/5"
        style={{ background: headerColor, height: HEADER_HEIGHT }}
      >
        <span className="text-ink-50 font-semibold text-sm truncate flex-1 tracking-tight">{table.name}</span>
        {table.alias && (
          <span className="text-ink-400 text-xs">({table.alias})</span>
        )}
      </div>

      {/* Columns */}
      <div className="py-1">
        {rows.map((col, idx) => (
          <div
            key={idx}
            className="flex items-center px-3 gap-2 border-b border-white/5 last:border-b-0"
            style={{ height: ROW_HEIGHT }}
          >
            {/* PK / FK badge */}
            <div className="flex items-center gap-1 shrink-0">
              {col.pk && (
                <span
                  className="text-[9px] font-bold px-1 py-0.5 rounded text-ink-990 bg-ink-200"
                  title="Primary Key"
                >
                  PK
                </span>
              )}
              {col.fk && (
                <span
                  className="text-[9px] font-bold px-1 py-0.5 rounded text-ink-990 bg-ink-400"
                  title="Foreign Key"
                >
                  FK
                </span>
              )}
            </div>
            <span className="text-sm text-ink-100 font-medium truncate flex-1 min-w-0">
              {col.name}
            </span>
            <span className="text-xs text-ink-500 font-mono truncate shrink-0 max-w-[90px]">
              {col.type}
            </span>
            {col.notNull && (
              <span className="text-ink-600 text-xs shrink-0" title="Not Null">*</span>
            )}
          </div>
        ))}
      </div>

      {table.note && (
        <div className="px-3 py-1.5 bg-white/[0.02] rounded-b-2xl border-t border-white/5">
          <p className="text-[11px] text-ink-500 italic truncate">{table.note}</p>
        </div>
      )}
    </div>
  );
}
