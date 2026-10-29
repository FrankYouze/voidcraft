import type { Canvas, DrawingElement, TablePosition } from "../types";
import type { CanvasInput } from "./storage";

const FILE_FORMAT = "voidcraft-canvas";
const FILE_VERSION = 1;
const CLIPBOARD_PREFIX = "VOIDCRAFT_COMPONENTS_V1:";

type CanvasFile = {
  format: typeof FILE_FORMAT;
  version: typeof FILE_VERSION;
  exported_at: string;
  canvas: Pick<Canvas, "title" | "drawing_elements" | "dbml_source" | "table_positions" | "relationship_routes">;
};

export function serializeCanvasFile(canvas: Canvas): string {
  const file: CanvasFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exported_at: new Date().toISOString(),
    canvas: {
      title: canvas.title,
      drawing_elements: canvas.drawing_elements,
      dbml_source: canvas.dbml_source,
      table_positions: canvas.table_positions,
      relationship_routes: canvas.relationship_routes ?? {},
    },
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseCanvasFile(contents: string): CanvasInput {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("This file is not valid Voidcraft canvas JSON.");
  }

  if (!isRecord(value) || value.format !== FILE_FORMAT) {
    throw new Error("This is not a Voidcraft canvas file.");
  }
  if (value.version !== FILE_VERSION) {
    throw new Error(`Unsupported canvas file version: ${String(value.version)}.`);
  }
  const canvas = value.canvas;
  if (!isRecord(canvas) || typeof canvas.title !== "string" || typeof canvas.dbml_source !== "string") {
    throw new Error("The canvas file is missing its title or schema.");
  }
  if (!Array.isArray(canvas.drawing_elements) || !canvas.drawing_elements.every(isDrawingElement)) {
    throw new Error("The canvas file contains invalid drawing elements.");
  }
  if (!isRecord(canvas.table_positions) || !Object.values(canvas.table_positions).every(isTablePosition)) {
    throw new Error("The canvas file contains invalid table positions.");
  }
  const routes = canvas.relationship_routes ?? {};
  if (!isRecord(routes) || !Object.values(routes).every((route) => typeof route === "number" && Number.isFinite(route))) {
    throw new Error("The canvas file contains invalid relationship routes.");
  }

  return {
    title: canvas.title,
    drawing_elements: canvas.drawing_elements,
    dbml_source: canvas.dbml_source,
    table_positions: canvas.table_positions as Record<string, TablePosition>,
    relationship_routes: routes as Record<string, number>,
  };
}

export function serializeDrawingClipboard(elements: DrawingElement[]): string {
  return `${CLIPBOARD_PREFIX}${JSON.stringify({ elements })}`;
}

export function parseDrawingClipboard(contents: string): DrawingElement[] | null {
  if (!contents.startsWith(CLIPBOARD_PREFIX)) return null;
  let value: unknown;
  try {
    value = JSON.parse(contents.slice(CLIPBOARD_PREFIX.length));
  } catch {
    throw new Error("The copied Voidcraft components could not be read.");
  }
  if (!isRecord(value) || !Array.isArray(value.elements) || !value.elements.every(isDrawingElement)) {
    throw new Error("The clipboard does not contain valid Voidcraft components.");
  }
  return value.elements;
}

function isDrawingElement(value: unknown): value is DrawingElement {
  if (!isRecord(value)) return false;
  const types = ["rectangle", "ellipse", "diamond", "arrow", "line", "text", "image"];
  return typeof value.id === "string"
    && types.includes(String(value.type))
    && [value.x1, value.y1, value.x2, value.y2, value.strokeWidth].every((number) => typeof number === "number" && Number.isFinite(number))
    && typeof value.stroke === "string"
    && typeof value.fill === "string"
    && (value.text === undefined || typeof value.text === "string")
    && (value.src === undefined || typeof value.src === "string")
    && (value.bend === undefined || isPoint(value.bend));
}

function isTablePosition(value: unknown): value is TablePosition {
  return isPoint(value);
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return isRecord(value)
    && typeof value.x === "number" && Number.isFinite(value.x)
    && typeof value.y === "number" && Number.isFinite(value.y);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
