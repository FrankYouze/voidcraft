// Shared types for the canvas app

export type Point = { x: number; y: number };

export type Tool = "select" | "rectangle" | "ellipse" | "diamond" | "arrow" | "line" | "brush" | "text" | "pan" | "table";

export type DrawingElement = {
  id: string;
  type: "rectangle" | "ellipse" | "diamond" | "arrow" | "line" | "brush" | "text" | "image";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Quadratic curve control point for a bent arrow. */
  bend?: Point;
  /** Freehand brush path in canvas coordinates. */
  points?: Point[];
  stroke: string;
  fill: string;
  strokeWidth: number;
  text?: string;
  fontSize?: number;
  opacity?: number;
  cornerRadius?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  src?: string;
};

// DBML parsed structures

export type DbmlColumn = {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
  unique?: boolean;
  notNull?: boolean;
  notes?: string;
  // resolved reference target
  refTable?: string;
  refColumn?: string;
};

export type DbmlTable = {
  name: string;
  alias?: string;
  note?: string;
  columns: DbmlColumn[];
  headerColor?: string;
};

export type DbmlRelationship = {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
};

export type DbmlSchema = {
  tables: DbmlTable[];
  relationships: DbmlRelationship[];
};

export type TablePosition = { x: number; y: number };

export type Canvas = {
  id: string;
  title: string;
  drawing_elements: DrawingElement[];
  dbml_source: string;
  table_positions: Record<string, TablePosition>;
  relationship_routes?: Record<string, number>;
  created_at: string;
  updated_at: string;
};
