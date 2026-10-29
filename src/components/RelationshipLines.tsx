import { useEffect, useState } from "react";
import type { DbmlSchema, TablePosition, Point } from "../types";
import { TABLE_WIDTH, ROW_HEIGHT, HEADER_HEIGHT } from "./TableCard";

type Props = {
  schema: DbmlSchema;
  positions: Record<string, TablePosition>;
  defaultPositions: Record<string, Point>;
  zoom: number;
  offset: Point;
  routing: "curved" | "orthogonal";
  routes: Record<string, number>;
  onRouteChange: (id: string, x: number) => void;
};

const GRID_SIZE = 24;

/**
 * Renders relationship lines between table cards as SVG overlays.
 * Lines connect from the FK column to the referenced PK column.
 */
export default function RelationshipLines({
  schema,
  positions,
  defaultPositions,
  zoom,
  offset,
  routing,
  routes,
  onRouteChange,
}: Props) {
  const [dragging, setDragging] = useState<{ id: string; startClientX: number; startRouteX: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => {
      const unsnapped = dragging.startRouteX + (event.clientX - dragging.startClientX) / zoom;
      onRouteChange(dragging.id, Math.round(unsnapped / GRID_SIZE) * GRID_SIZE);
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, onRouteChange, zoom]);

  const tableMap = new Map(schema.tables.map((t) => [t.name, t]));

  const lines: React.ReactNode[] = [];

  schema.relationships.forEach((rel, idx) => {
    const fromTable = tableMap.get(rel.fromTable);
    const toTable = tableMap.get(rel.toTable);
    if (!fromTable || !toTable) return;

    const fromPos = positions[rel.fromTable] || defaultPositions[rel.fromTable];
    const toPos = positions[rel.toTable] || defaultPositions[rel.toTable];
    if (!fromPos || !toPos) return;

    const fromColIdx = fromTable.columns.findIndex((c) => c.name === rel.fromColumn);
    const toColIdx = toTable.columns.findIndex((c) => c.name === rel.toColumn);
    if (fromColIdx === -1 || toColIdx === -1) return;

    // Calculate connection points
    const fromY = fromPos.y + HEADER_HEIGHT + fromColIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const toY = toPos.y + HEADER_HEIGHT + toColIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

    const fromRight = fromPos.x + TABLE_WIDTH;
    const toRight = toPos.x + TABLE_WIDTH;

    // Decide which side to connect
    const fromOnRight = fromPos.x > toPos.x;

    let startX: number;
    let endX: number;
    if (fromOnRight) {
      // Connect from left of from table to right of to table
      startX = fromPos.x;
      endX = toRight;
    } else {
      // Connect from right of from table to left of to table
      startX = fromRight;
      endX = toPos.x;
    }

    const startY = fromY;
    const endY = toY;

    const routeId = `${rel.fromTable}.${rel.fromColumn}->${rel.toTable}.${rel.toColumn}`;
    const defaultRouteX = Math.round(((startX + endX) / 2) / GRID_SIZE) * GRID_SIZE;
    const routeX = routes[routeId] ?? defaultRouteX;
    let path: string;
    if (routing === "orthogonal") {
      path = `M ${startX} ${startY} H ${routeX} V ${endY} H ${endX}`;
    } else {
      const cpDist = Math.max(40, Math.abs(endX - startX) * 0.4);
      const cp1X = startX + (fromOnRight ? -cpDist : cpDist);
      const cp2X = endX + (fromOnRight ? cpDist : -cpDist);
      path = `M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`;
    }

    lines.push(
      <g key={`rel-${idx}`}>
        <path
          d={path}
          fill="none"
          stroke="#52525b"
          strokeWidth={2}
          opacity={0.7}
          strokeLinecap="round"
        />
        {/* Endpoint dots */}
        <circle cx={startX} cy={startY} r={3} fill="#a1a1aa" />
        <circle cx={endX} cy={endY} r={3} fill="#71717a" />
        {routing === "orthogonal" && (
          <circle
            cx={routeX}
            cy={(startY + endY) / 2}
            r={5}
            fill="#a1a1aa"
            stroke="#0a0a0a"
            strokeWidth={2}
            style={{ pointerEvents: "auto", cursor: "ew-resize" }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragging({ id: routeId, startClientX: event.clientX, startRouteX: routeX });
            }}
          />
        )}
      </g>
    );
  });

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ overflow: "visible" }}
    >
      <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`}>{lines}</g>
    </svg>
  );
}
