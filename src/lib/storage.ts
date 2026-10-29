import { isTauri } from "@tauri-apps/api/core";
import type { Canvas } from "../types";

const STORAGE_KEY = "voidcraft.canvases.v1";
type CanvasInput = Pick<Canvas, "title" | "drawing_elements" | "dbml_source" | "table_positions"> & { relationship_routes?: Record<string, number> };

let databasePromise: Promise<import("@tauri-apps/plugin-sql").default> | null = null;
async function database() {
  if (!isTauri()) return null;
  databasePromise ??= import("@tauri-apps/plugin-sql").then(async ({ default: Database }) => {
    const db = await Database.load("sqlite:voidcraft.db");
    await db.execute(`CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, drawing_elements TEXT NOT NULL,
      dbml_source TEXT NOT NULL, table_positions TEXT NOT NULL,
      relationship_routes TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    const columns = await db.select<Array<{ name: string }>>("PRAGMA table_info(canvases)");
    if (!columns.some((column) => column.name === "relationship_routes")) {
      await db.execute("ALTER TABLE canvases ADD COLUMN relationship_routes TEXT NOT NULL DEFAULT '{}' ");
    }
    return db;
  });
  return databasePromise;
}

function readBrowser(): Canvas[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Canvas[]; }
  catch { return []; }
}
function writeBrowser(canvases: Canvas[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(canvases)); }
function decode(row: Record<string, unknown>): Canvas {
  return {
    ...row,
    drawing_elements: typeof row.drawing_elements === "string" ? JSON.parse(row.drawing_elements) : row.drawing_elements,
    table_positions: typeof row.table_positions === "string" ? JSON.parse(row.table_positions) : row.table_positions,
    relationship_routes: typeof row.relationship_routes === "string" ? JSON.parse(row.relationship_routes) : (row.relationship_routes ?? {}),
  } as Canvas;
}

export async function listCanvases(): Promise<Canvas[]> {
  const db = await database();
  if (!db) return readBrowser().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const rows = await db.select<Record<string, unknown>[]>("SELECT * FROM canvases ORDER BY updated_at DESC");
  return rows.map(decode);
}

export async function saveCanvas(canvas: Canvas): Promise<void> {
  const db = await database();
  if (!db) {
    const canvases = readBrowser();
    writeBrowser([canvas, ...canvases.filter((item) => item.id !== canvas.id)]);
    return;
  }
  await db.execute(`INSERT INTO canvases (id,title,drawing_elements,dbml_source,table_positions,relationship_routes,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET title=$2,drawing_elements=$3,dbml_source=$4,table_positions=$5,relationship_routes=$6,updated_at=$8`, [
    canvas.id, canvas.title, JSON.stringify(canvas.drawing_elements), canvas.dbml_source,
    JSON.stringify(canvas.table_positions), JSON.stringify(canvas.relationship_routes ?? {}), canvas.created_at, canvas.updated_at,
  ]);
}

export async function deleteCanvas(id: string): Promise<void> {
  const db = await database();
  if (!db) { writeBrowser(readBrowser().filter((item) => item.id !== id)); return; }
  await db.execute("DELETE FROM canvases WHERE id = $1", [id]);
}

export function makeCanvas(input: CanvasInput, id: string = crypto.randomUUID(), createdAt = new Date().toISOString()): Canvas {
  return { ...input, relationship_routes: input.relationship_routes ?? {}, id, created_at: createdAt, updated_at: new Date().toISOString() };
}

export type { CanvasInput };
