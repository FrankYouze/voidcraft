import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Plus, Layers, Save, Check, Loader2, Pencil, Focus } from "lucide-react";
import {
  deleteCanvas as removeCanvas,
  listCanvases,
  makeCanvas,
  saveCanvas as persistCanvas,
} from "./lib/storage";
import {
  parseCanvasFile,
  parseDrawingClipboard,
  serializeCanvasFile,
  serializeDrawingClipboard,
} from "./lib/canvasFile";
import { commentOutDbmlTable, parseDbml, DEFAULT_DBML } from "./dbml";
import type {
  Canvas,
  DrawingElement,
  Tool,
  Point,
  TablePosition,
  DbmlSchema,
} from "./types";

// Demo drawing elements: two rectangles connected by an arrow with text labels
const DEMO_ELEMENTS: DrawingElement[] = [
  {
    id: "demo-rect-1",
    type: "rectangle",
    x1: 50,
    y1: 920,
    x2: 270,
    y2: 1010,
    stroke: "#a1a1aa",
    fill: "#27272a",
    strokeWidth: 2,
  },
  {
    id: "demo-rect-2",
    type: "rectangle",
    x1: 500,
    y1: 920,
    x2: 720,
    y2: 1010,
    stroke: "#a1a1aa",
    fill: "#27272a",
    strokeWidth: 2,
  },
  {
    id: "demo-arrow-1",
    type: "arrow",
    x1: 270,
    y1: 965,
    x2: 500,
    y2: 965,
    stroke: "#52525b",
    fill: "transparent",
    strokeWidth: 2,
  },
  {
    id: "demo-text-1",
    type: "text",
    x1: 90,
    y1: 975,
    x2: 90,
    y2: 975,
    stroke: "#fafafa",
    fill: "transparent",
    strokeWidth: 1,
    text: "Frontend",
    fontSize: 20,
  },
  {
    id: "demo-text-2",
    type: "text",
    x1: 540,
    y1: 975,
    x2: 540,
    y2: 975,
    stroke: "#fafafa",
    fill: "transparent",
    strokeWidth: 1,
    text: "Backend",
    fontSize: 20,
  },
  {
    id: "demo-text-3",
    type: "text",
    x1: 330,
    y1: 945,
    x2: 330,
    y2: 945,
    stroke: "#a1a1aa",
    fill: "transparent",
    strokeWidth: 1,
    text: "API call",
    fontSize: 14,
  },
  {
    id: "demo-text-sample",
    type: "text",
    x1: 940,
    y1: 420,
    x2: 940,
    y2: 420,
    stroke: "#d4d4d8",
    fill: "transparent",
    strokeWidth: 1,
    text: "Double-click to edit text",
    fontSize: 20,
  },
];

type CanvasSnapshot = {
  title: string;
  elements: DrawingElement[];
  dbmlSource: string;
  tablePositions: Record<string, TablePosition>;
  relationshipRoutes: Record<string, number>;
};
import DrawingCanvas from "./components/DrawingCanvas";
import TableCard from "./components/TableCard";
import { TABLE_WIDTH, tableHeight } from "./components/TableCard";
import RelationshipLines from "./components/RelationshipLines";
import Toolbar from "./components/Toolbar";
import DbmlPanel from "./components/DbmlPanel";
import CanvasSidebar from "./components/CanvasSidebar";
import StylePanel from "./components/StylePanel";

export default function App() {
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState("Untitled Canvas");
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [dbmlSource, setDbmlSource] = useState(DEFAULT_DBML);
  const [tablePositions, setTablePositions] = useState<
    Record<string, TablePosition>
  >({});
  const [relationshipRoutes, setRelationshipRoutes] = useState<
    Record<string, number>
  >({});
  const [relationshipRouting, setRelationshipRouting] = useState<
    "curved" | "orthogonal"
  >("curved");

  const [tool, setTool] = useState<Tool>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [strokeColor, setStrokeColor] = useState("#a1a1aa");
  const [fillColor, setFillColor] = useState("#27272a");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokeStyle, setStrokeStyle] = useState<"solid" | "dashed" | "dotted">(
    "solid",
  );
  const [opacity, setOpacity] = useState(100);
  const [cornerRadius, setCornerRadius] = useState(12);
  const [showDbml, setShowDbml] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasFileInputRef = useRef<HTMLInputElement>(null);
  const pendingVcfImports = useRef<string[]>([]);
  const pasteSequence = useRef(0);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [contentOutOfView, setContentOutOfView] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const history = useRef<{
    canvasId: string | null;
    past: CanvasSnapshot[];
    future: CanvasSnapshot[];
    last: CanvasSnapshot | null;
    restoring: boolean;
  }>({
    canvasId: null,
    past: [],
    future: [],
    last: null,
    restoring: false,
  });

  const canvasRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{
    isPanning: boolean;
    start: Point;
    offsetStart: Point;
  }>({
    isPanning: false,
    start: { x: 0, y: 0 },
    offsetStart: { x: 0, y: 0 },
  });

  // Parse DBML
  const schema: DbmlSchema = useMemo(() => parseDbml(dbmlSource), [dbmlSource]);

  // Auto-layout default positions for tables (grid layout)
  const defaultPositions = useMemo(() => {
    const positions: Record<string, Point> = {};
    const cols = 3;
    const gapX = 300;
    const gapY = 280;
    schema.tables.forEach((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions[t.name] = { x: 80 + col * gapX, y: 80 + row * gapY };
    });
    return positions;
  }, [schema.tables]);

  const contentRects = useMemo(() => {
    const rects: { left: number; top: number; right: number; bottom: number }[] = [];
    for (const element of elements) {
      const fontSize = element.fontSize ?? 20;
      const lines = (element.text ?? "").split("\n");
      const textWidth = Math.max(fontSize * 0.55, lines.reduce((longest, line) => Math.max(longest, line.length), 0) * fontSize * 0.55);
      const lineHeight = fontSize * 1.2;
      const textHeight = lines.length * lineHeight;
      const rect = element.type === "text"
        ? { left: element.x1, top: element.y1 - lineHeight, right: element.x1 + textWidth, bottom: element.y1 - lineHeight + textHeight }
        : {
            left: Math.min(element.x1, element.x2),
            top: Math.min(element.y1, element.y2),
            right: Math.max(element.x1, element.x2),
            bottom: Math.max(element.y1, element.y2),
          };
      if (element.type === "arrow" && element.bend) {
        rect.left = Math.min(rect.left, element.bend.x);
        rect.top = Math.min(rect.top, element.bend.y);
        rect.right = Math.max(rect.right, element.bend.x);
        rect.bottom = Math.max(rect.bottom, element.bend.y);
      }
      rects.push(rect);
    }
    for (const table of schema.tables) {
      const position = tablePositions[table.name] ?? defaultPositions[table.name];
      if (position) {
        rects.push({ left: position.x, top: position.y, right: position.x + TABLE_WIDTH, bottom: position.y + tableHeight(table) });
      }
    }
    return rects;
  }, [elements, schema.tables, tablePositions, defaultPositions]);

  const contentBounds = useMemo(() => {
    if (contentRects.length === 0) return null;
    return contentRects.reduce((bounds, rect) => ({
      left: Math.min(bounds.left, rect.left),
      top: Math.min(bounds.top, rect.top),
      right: Math.max(bounds.right, rect.right),
      bottom: Math.max(bounds.bottom, rect.bottom),
    }), { ...contentRects[0] });
  }, [contentRects]);

  useEffect(() => {
    const updateContentVisibility = () => {
      const viewport = canvasRef.current;
      if (!viewport || contentRects.length === 0) {
        setContentOutOfView(false);
        return;
      }
      const margin = 140;
      const hasNearbyContent = contentRects.some((rect) =>
        rect.right * zoom + offset.x >= -margin
        && rect.left * zoom + offset.x <= viewport.clientWidth + margin
        && rect.bottom * zoom + offset.y >= -margin
        && rect.top * zoom + offset.y <= viewport.clientHeight + margin
      );
      setContentOutOfView(!hasNearbyContent);
    };

    updateContentVisibility();
    const viewport = canvasRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateContentVisibility);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [contentRects, offset, zoom]);

  useEffect(() => {
    const snapshot: CanvasSnapshot = {
      title,
      elements,
      dbmlSource,
      tablePositions,
      relationshipRoutes,
    };
    const stack = history.current;
    if (stack.canvasId !== currentId) {
      stack.canvasId = currentId;
      stack.past = [];
      stack.future = [];
      stack.last = snapshot;
      stack.restoring = false;
      return;
    }
    if (stack.restoring) {
      stack.last = snapshot;
      stack.restoring = false;
      return;
    }
    if (stack.last && JSON.stringify(stack.last) !== JSON.stringify(snapshot)) {
      stack.past.push(stack.last);
      if (stack.past.length > 100) stack.past.shift();
      stack.future = [];
    }
    stack.last = snapshot;
  }, [
    currentId,
    title,
    elements,
    dbmlSource,
    tablePositions,
    relationshipRoutes,
  ]);

  const restoreSnapshot = useCallback((snapshot: CanvasSnapshot) => {
    history.current.restoring = true;
    history.current.last = snapshot;
    setTitle(snapshot.title);
    setElements(snapshot.elements);
    setDbmlSource(snapshot.dbmlSource);
    setTablePositions(snapshot.tablePositions);
    setRelationshipRoutes(snapshot.relationshipRoutes);
  }, []);
  const undo = useCallback(() => {
    const stack = history.current;
    const previous = stack.past.pop();
    if (!previous) return;
    stack.future.push({
      title,
      elements,
      dbmlSource,
      tablePositions,
      relationshipRoutes,
    });
    restoreSnapshot(previous);
  }, [
    title,
    elements,
    dbmlSource,
    tablePositions,
    relationshipRoutes,
    restoreSnapshot,
  ]);
  const redo = useCallback(() => {
    const stack = history.current;
    const next = stack.future.pop();
    if (!next) return;
    stack.past.push({
      title,
      elements,
      dbmlSource,
      tablePositions,
      relationshipRoutes,
    });
    restoreSnapshot(next);
  }, [
    title,
    elements,
    dbmlSource,
    tablePositions,
    relationshipRoutes,
    restoreSnapshot,
  ]);

  const loadCanvases = async () => {
    setLoading(true);
    try {
      const data = await listCanvases();
      if (data.length > 0) {
        setCanvases(data);
        selectCanvas(data[0]);
      } else {
        const first = makeCanvas({
          title: "Untitled Canvas",
          drawing_elements: DEMO_ELEMENTS,
          dbml_source: DEFAULT_DBML,
          table_positions: {},
        });
        await persistCanvas(first);
        setCanvases([first]);
        selectCanvas(first);
      }
    } catch (error) {
      console.error("Could not load local canvases", error);
      const first = makeCanvas({
        title: "Untitled Canvas",
        drawing_elements: DEMO_ELEMENTS,
        dbml_source: DEFAULT_DBML,
        table_positions: {},
      });
      setCanvases([first]);
      selectCanvas(first);
    }
    setLoading(false);
  };

  // Load canvases on mount.
  useEffect(() => {
    void loadCanvases();
    // This effect intentionally runs once for the initial local workspace load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCanvas = useCallback((c: Canvas) => {
    setCurrentId(c.id);
    setTitle(c.title);
    setElements(c.drawing_elements || []);
    setDbmlSource(c.dbml_source || "");
    setTablePositions(c.table_positions || {});
    setRelationshipRoutes(c.relationship_routes || {});
    setSelectedIds(new Set());
    setSelectedTable(null);
  }, []);

  const createCanvas = useCallback(async () => {
    const newCanvas = makeCanvas({
      title: "Untitled Canvas",
      drawing_elements: DEMO_ELEMENTS,
      dbml_source: DEFAULT_DBML,
      table_positions: {},
    });
    setCanvases((prev) => [newCanvas, ...prev]);
    selectCanvas(newCanvas);
    try {
      await persistCanvas(newCanvas);
      setStorageError(null);
    } catch (error) {
      console.error("Could not create canvas", error);
      const detail = error instanceof Error ? error.message : String(error);
      setStorageError(`Could not save this canvas: ${detail}`);
    }
  }, [selectCanvas]);

  const saveCanvas = async () => {
    if (!currentId) return;
    setSaving(true);
    const existing = canvases.find((canvas) => canvas.id === currentId);
    const updated = makeCanvas(
      {
        title,
        drawing_elements: elements,
        dbml_source: dbmlSource,
        table_positions: tablePositions,
        relationship_routes: relationshipRoutes,
      },
      currentId,
      existing?.created_at,
    );
    try {
      await persistCanvas(updated);
      setSavedAt(new Date());
      setCanvases((prev) =>
        prev.map((canvas) => (canvas.id === currentId ? updated : canvas)),
      );
    } catch (error) {
      console.error("Could not save canvas", error);
    } finally {
      setSaving(false);
    }
  };

  const deleteCanvas = useCallback(
    async (id: string) => {
      try {
        await removeCanvas(id);
        const remaining = canvases.filter((c) => c.id !== id);
        setCanvases(remaining);
        if (currentId === id) {
          if (remaining.length > 0) {
            selectCanvas(remaining[0]);
          } else {
            createCanvas();
          }
        }
      } catch (error) {
        console.error("Could not delete canvas", error);
      }
    },
    [canvases, currentId, createCanvas, selectCanvas],
  );

  // Auto-save with debounce
  useEffect(() => {
    if (!currentId || loading) return;
    const timer = setTimeout(() => {
      saveCanvas();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, elements, dbmlSource, tablePositions, relationshipRoutes]);

  // Pan / Zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    // This is a fixed canvas workspace: never let trackpad inertia scroll the
    // document underneath the sidebar, editor, or tool chrome.
    e.preventDefault();
    if ((e.target as HTMLElement).closest("[data-canvas-chrome='true']"))
      return;
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(0.2, Math.min(4, zoom + delta));
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const worldX = (cx - offset.x) / zoom;
        const worldY = (cy - offset.y) / zoom;
        const newOffset = {
          x: cx - worldX * newZoom,
          y: cy - worldY * newZoom,
        };
        setOffset(newOffset);
      }
      setZoom(newZoom);
    } else {
      setOffset({ x: offset.x - e.deltaX, y: offset.y - e.deltaY });
    }
  };

  const handleTableDrag = useCallback((name: string, pos: TablePosition) => {
    setTablePositions((prev) => ({ ...prev, [name]: pos }));
  }, []);
  const handleRelationshipRoute = useCallback((id: string, x: number) => {
    setRelationshipRoutes((current) => ({ ...current, [id]: x }));
  }, []);

  // Keyboard shortcuts for tool switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      const map: Record<string, Tool> = {
        v: "select",
        t: "table",
        r: "rectangle",
        o: "ellipse",
        d: "diamond",
        a: "arrow",
        l: "line",
        x: "text",
        h: "pan",
      };
      if (map[key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setTool(map[key]);
      }
      if (key === "b" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowDbml((s) => !s);
      }
      if (key === "i" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleImportImage();
      }
      if (key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowGrid((s) => !s);
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        (selectedIds.size > 0 || selectedTable)
      ) {
        e.preventDefault();
        handleDeleteSelected();
      }
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setSelectedTable(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedTable, elements, undo, redo]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 300;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = w * ratio;
          h = h * ratio;
        }
        const cx = (100 - offset.x) / zoom;
        const cy = (100 - offset.y) / zoom;
        const newEl: DrawingElement = {
          id: crypto.randomUUID(),
          type: "image",
          x1: cx,
          y1: cy,
          x2: cx + w,
          y2: cy + h,
          stroke: "transparent",
          fill: "transparent",
          strokeWidth: 0,
          opacity,
          src,
        };
        setElements([...elements, newEl]);
        setTool("select");
        setSelectedIds(new Set([newEl.id]));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleZoomIn = useCallback(
    () => setZoom((z) => Math.min(10, z + 0.1)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setZoom((z) => Math.max(0.1, z - 0.1)),
    [],
  );
  const handleResetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);
  const handleBackToContent = useCallback(() => {
    const viewport = canvasRef.current;
    if (!viewport || !contentBounds) return;
    const width = Math.max(contentBounds.right - contentBounds.left, 1);
    const height = Math.max(contentBounds.bottom - contentBounds.top, 1);
    const padding = 120;
    const nextZoom = Math.max(0.1, Math.min(1.5,
      (viewport.clientWidth - padding * 2) / width,
      (viewport.clientHeight - padding * 2) / height,
    ));
    const centerX = (contentBounds.left + contentBounds.right) / 2;
    const centerY = (contentBounds.top + contentBounds.bottom) / 2;
    setZoom(nextZoom);
    setOffset({
      x: viewport.clientWidth / 2 - centerX * nextZoom,
      y: viewport.clientHeight / 2 - centerY * nextZoom,
    });
  }, [contentBounds]);
  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size > 0) {
      setElements((current) =>
        current.filter((element) => !selectedIds.has(element.id)),
      );
      setSelectedIds(new Set());
    }
    if (selectedTable) {
      setDbmlSource((source) => commentOutDbmlTable(source, selectedTable));
      setSelectedTable(null);
    }
  }, [selectedIds, selectedTable]);
  const handleImportImage = useCallback(
    () => fileInputRef.current?.click(),
    [],
  );
  const handleImportCanvas = useCallback(
    () => canvasFileInputRef.current?.click(),
    [],
  );
  const pasteDrawingComponents = useCallback((source: DrawingElement[]) => {
    if (!source.length) return;
    const viewport = canvasRef.current;
    const points = source.flatMap((element) => [
      { x: element.x1, y: element.y1 },
      { x: element.x2, y: element.y2 },
      ...(element.bend ? [element.bend] : []),
    ]);
    const bounds = points.reduce((current, point) => ({
      left: Math.min(current.left, point.x),
      top: Math.min(current.top, point.y),
      right: Math.max(current.right, point.x),
      bottom: Math.max(current.bottom, point.y),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const sourceCenter = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    const targetCenter = viewport
      ? { x: (viewport.clientWidth / 2 - offset.x) / zoom, y: (viewport.clientHeight / 2 - offset.y) / zoom }
      : sourceCenter;
    const repeatOffset = (pasteSequence.current++ * 24) / zoom;
    const dx = targetCenter.x - sourceCenter.x + repeatOffset;
    const dy = targetCenter.y - sourceCenter.y + repeatOffset;
    const pasted = source.map((element) => ({
      ...element,
      id: crypto.randomUUID(),
      x1: element.x1 + dx,
      y1: element.y1 + dy,
      x2: element.x2 + dx,
      y2: element.y2 + dy,
      ...(element.bend ? { bend: { x: element.bend.x + dx, y: element.bend.y + dy } } : {}),
    }));
    setElements((current) => [...current, ...pasted]);
    setSelectedIds(new Set(pasted.map((element) => element.id)));
    setSelectedTable(null);
    setTool("select");
  }, [offset, zoom]);
  const insertClipboardImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onerror = () => setStorageError("Could not read the image from the clipboard.");
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : null;
      if (!src) return;
      const image = new Image();
      image.onerror = () => setStorageError("The clipboard image could not be decoded.");
      image.onload = () => {
        const maxDim = 600;
        const scale = Math.min(1, maxDim / image.width, maxDim / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const viewport = canvasRef.current;
        const center = viewport
          ? { x: (viewport.clientWidth / 2 - offset.x) / zoom, y: (viewport.clientHeight / 2 - offset.y) / zoom }
          : { x: 100, y: 100 };
        const element: DrawingElement = {
          id: crypto.randomUUID(),
          type: "image",
          x1: center.x - width / 2,
          y1: center.y - height / 2,
          x2: center.x + width / 2,
          y2: center.y + height / 2,
          stroke: "transparent",
          fill: "transparent",
          strokeWidth: 0,
          opacity,
          src,
        };
        setElements((current) => [...current, element]);
        setSelectedIds(new Set([element.id]));
        setSelectedTable(null);
        setTool("select");
        setStorageError(null);
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  }, [offset, opacity, zoom]);
  const handleClipboardCopy = useCallback((event: ClipboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    const selected = elements.filter((element) => selectedIds.has(element.id));
    if (!selected.length || !event.clipboardData) return;
    event.clipboardData.setData("text/plain", serializeDrawingClipboard(selected));
    event.preventDefault();
    pasteSequence.current = 0;
  }, [elements, selectedIds]);
  const handleClipboardPaste = useCallback((event: ClipboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.kind === "file" && item.type.startsWith("image/"));
    const imageFile = imageItem?.getAsFile();
    if (imageFile) {
      event.preventDefault();
      insertClipboardImage(imageFile);
      pasteSequence.current = 0;
      return;
    }
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text.startsWith("VOIDCRAFT_COMPONENTS_V1:")) return;
    event.preventDefault();
    try {
      const components = parseDrawingClipboard(text);
      if (components) pasteDrawingComponents(components);
      setStorageError(null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStorageError(`Could not paste components: ${detail}`);
    }
  }, [insertClipboardImage, pasteDrawingComponents]);
  useEffect(() => {
    window.addEventListener("copy", handleClipboardCopy);
    window.addEventListener("paste", handleClipboardPaste);
    return () => {
      window.removeEventListener("copy", handleClipboardCopy);
      window.removeEventListener("paste", handleClipboardPaste);
    };
  }, [handleClipboardCopy, handleClipboardPaste]);
  const importCanvasContents = useCallback(
    async (contents: string) => {
      if (loading) {
        pendingVcfImports.current.push(contents);
        return;
      }
      try {
        const imported = makeCanvas(parseCanvasFile(contents));
        await persistCanvas(imported);
        setCanvases((current) => [imported, ...current]);
        selectCanvas(imported);
        setStorageError(null);
      } catch (error) {
        console.error("Could not import canvas", error);
        const detail = error instanceof Error ? error.message : String(error);
        setStorageError(`Could not import canvas: ${detail}`);
      }
    },
    [loading, selectCanvas],
  );
  const handleCanvasFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (!/\.(vcraft|vcf)$/i.test(file.name))
          throw new Error("Choose a .vcraft canvas file.");
        await importCanvasContents(await file.text());
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        setStorageError(`Could not import canvas: ${detail}`);
      } finally {
        input.value = "";
      }
    },
    [importCanvasContents],
  );
  useEffect(() => {
    if (loading || pendingVcfImports.current.length === 0) return;
    const queued = pendingVcfImports.current.splice(0);
    void (async () => {
      for (const contents of queued) await importCanvasContents(contents);
    })();
  }, [loading, importCanvasContents]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const drainOpenedFiles = async () => {
      try {
        const contents = await invoke<string[]>("take_opened_canvas_files");
        for (const content of contents) await importCanvasContents(content);
      } catch (error) {
        console.error("Could not receive opened canvas file", error);
      }
    };
    void listen("vcraft-opened", () => {
      void drainOpenedFiles();
    }).then((stopListening) => {
      if (disposed) stopListening();
      else {
        unlisten = stopListening;
        void drainOpenedFiles();
      }
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [importCanvasContents]);
  const handleExportCanvas = useCallback(() => {
    if (!currentId) return;
    try {
      const existing = canvases.find((canvas) => canvas.id === currentId);
      const current = makeCanvas(
        {
          title,
          drawing_elements: elements,
          dbml_source: dbmlSource,
          table_positions: tablePositions,
          relationship_routes: relationshipRoutes,
        },
        currentId,
        existing?.created_at,
      );
      const blob = new Blob([serializeCanvasFile(current)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle =
        title
          .trim()
          .replace(/[^a-z0-9-_]+/gi, "-")
          .replace(/^-+|-+$/g, "") || "canvas";
      anchor.href = url;
      anchor.download = `${safeTitle}.vcraft`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStorageError(null);
    } catch (error) {
      console.error("Could not export canvas", error);
      const detail = error instanceof Error ? error.message : String(error);
      setStorageError(`Could not export canvas: ${detail}`);
    }
  }, [
    currentId,
    canvases,
    title,
    elements,
    dbmlSource,
    tablePositions,
    relationshipRoutes,
  ]);
  const closeDbml = useCallback(() => setShowDbml(false), []);
  const updateSelectedStyle = useCallback(
    (patch: Partial<DrawingElement>) => {
      if (!selectedIds.size) return;
      setElements((current) =>
        current.map((element) =>
          selectedIds.has(element.id) ? { ...element, ...patch } : element,
        ),
      );
    },
    [selectedIds],
  );
  const changeStrokeColor = useCallback(
    (value: string) => {
      setStrokeColor(value);
      updateSelectedStyle({ stroke: value });
    },
    [updateSelectedStyle],
  );
  const changeFillColor = useCallback(
    (value: string) => {
      setFillColor(value);
      updateSelectedStyle({ fill: value });
    },
    [updateSelectedStyle],
  );
  const changeStrokeWidth = useCallback(
    (value: number) => {
      setStrokeWidth(value);
      updateSelectedStyle({ strokeWidth: value });
    },
    [updateSelectedStyle],
  );
  const changeStrokeStyle = useCallback(
    (value: "solid" | "dashed" | "dotted") => {
      setStrokeStyle(value);
      updateSelectedStyle({ strokeStyle: value });
    },
    [updateSelectedStyle],
  );
  const changeOpacity = useCallback(
    (value: number) => {
      setOpacity(value);
      updateSelectedStyle({ opacity: value });
    },
    [updateSelectedStyle],
  );
  const changeCornerRadius = useCallback(
    (value: number) => {
      setCornerRadius(value);
      updateSelectedStyle({ cornerRadius: value });
    },
    [updateSelectedStyle],
  );
  const bringForward = useCallback(() => {
    setElements((current) => [
      ...current.filter((element) => !selectedIds.has(element.id)),
      ...current.filter((element) => selectedIds.has(element.id)),
    ]);
  }, [selectedIds]);
  const sendBackward = useCallback(() => {
    setElements((current) => [
      ...current.filter((element) => selectedIds.has(element.id)),
      ...current.filter((element) => !selectedIds.has(element.id)),
    ]);
  }, [selectedIds]);

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-990 flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink-400">
          <Loader2 className="animate-spin" size={24} />
          <span className="text-sm font-medium">Loading canvas...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-ink-990 font-sans">
      {/* Sidebar - Canvas list */}
      <CanvasSidebar
        open={sidebarOpen}
        canvases={canvases}
        currentId={currentId}
        onCreate={createCanvas}
        onSelect={selectCanvas}
        onDelete={deleteCanvas}
        onImport={handleImportCanvas}
        onExport={handleExportCanvas}
      />

      {/* Main canvas area */}
      <div
        className="flex-1 relative overflow-hidden"
        ref={canvasRef}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Top bar */}
        <div
          data-canvas-chrome="true"
          className="topbar-controls absolute top-0 left-0 right-0 z-20 flex items-center gap-1.5 px-3 py-3 pointer-events-none"
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="topbar-icon-button pointer-events-auto glass p-1.5 text-ink-300 hover:text-ink-50 transition-colors"
            style={{ borderRadius: 12 }}
          >
            <Layers size={18} />
          </button>
          <button
            onClick={() => void createCanvas()}
            title="New canvas"
            className="topbar-icon-button pointer-events-auto glass p-1.5 text-ink-300 hover:text-ink-50 transition-colors"
            style={{ borderRadius: 12 }}
          >
            <Plus size={18} />
          </button>

          <div
            className="topbar-title-box pointer-events-auto glass px-2 py-2 flex items-center gap-1.5 cursor-text w-[120px] shrink-0 overflow-hidden"
            style={{ borderRadius: 12 }}
            onClick={() => setEditingTitle(true)}
          >
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
                className="font-semibold text-ink-50 text-sm bg-transparent outline-none border-b border-ink-400 min-w-0 w-full"
              />
            ) : (
              <div className="flex min-w-0 w-full items-center gap-2">
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-ink-50 text-sm tracking-tight">
                  {title}
                </span>
                <Pencil size={13} className="shrink-0 text-ink-500" />
              </div>
            )}
          </div>
        </div>

        {storageError && (
          <div className="absolute top-28 left-4 z-40 max-w-sm rounded-lg border border-red-500/30 bg-red-950/90 px-3 py-2 text-xs text-red-200 shadow-xl">
            {storageError}
          </div>
        )}

        {/* Save indicator — bottom-right floating badge */}
        <div
          data-canvas-chrome="true"
          className="absolute bottom-4 right-4 z-20 glass px-3 py-2 flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin text-ink-400" />
              <span className="text-xs text-ink-400 font-medium">
                Saving...
              </span>
            </>
          ) : savedAt ? (
            <>
              <Check size={14} className="text-ink-300" />
              <span className="text-xs text-ink-400 font-medium">Saved</span>
            </>
          ) : (
            <Save size={14} className="text-ink-500" />
          )}
        </div>

        {/* Active tool hint — bottom-left floating badge */}
        <div
          data-canvas-chrome="true"
          className="absolute bottom-4 left-4 z-20 glass px-3 py-1.5 flex items-center gap-2 text-xs"
        >
          <span className="font-medium text-ink-100 capitalize">
            {tool === "table" ? "Move Tables" : tool}
          </span>
          {tool === "table" && (
            <span className="text-ink-400">drag table cards freely</span>
          )}
        </div>

        {contentOutOfView && (
          <button
            data-canvas-chrome="true"
            type="button"
            onClick={handleBackToContent}
            className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 glass flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-100 shadow-xl transition-colors hover:bg-ink-800"
            aria-label="Center the view on canvas content"
          >
            <Focus size={16} />
            Back to content
          </button>
        )}

        {/* Dot grid background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: "#0a0a0a",
            ...(showGrid
              ? {
                  backgroundImage: `radial-gradient(circle, rgb(255 255 255 / 0.06) 1px, transparent 1px)`,
                  backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
                  backgroundPosition: `${offset.x}px ${offset.y}px`,
                }
              : {}),
          }}
        />

        <StylePanel
          open={[
            "rectangle",
            "ellipse",
            "diamond",
            "arrow",
            "line",
            "text",
          ].includes(tool)}
          sidebarOpen={sidebarOpen}
          tool={tool}
          strokeColor={strokeColor}
          onStrokeColor={changeStrokeColor}
          fillColor={fillColor}
          onFillColor={changeFillColor}
          strokeWidth={strokeWidth}
          onStrokeWidth={changeStrokeWidth}
          strokeStyle={strokeStyle}
          onStrokeStyle={changeStrokeStyle}
          opacity={opacity}
          onOpacity={changeOpacity}
          cornerRadius={cornerRadius}
          onCornerRadius={changeCornerRadius}
          hasSelection={selectedIds.size > 0}
          onBringForward={bringForward}
          onSendBackward={sendBackward}
        />

        {/* Drawing canvas (handles drawing + panning) */}
        <div
          className="absolute inset-0"
          style={{ pointerEvents: tool === "table" ? "none" : "auto" }}
        >
          <DrawingCanvas
            tool={tool}
            setTool={setTool}
            elements={elements}
            setElements={setElements}
            zoom={zoom}
            offset={offset}
            setOffset={setOffset}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            strokeColor={strokeColor}
            fillColor={fillColor}
            strokeWidth={strokeWidth}
            strokeStyle={strokeStyle}
            opacity={opacity}
            cornerRadius={cornerRadius}
            panState={panState}
          />
        </div>

        {/* Relationship lines (rendered behind table cards but above drawings) */}
        <RelationshipLines
          schema={schema}
          positions={tablePositions}
          defaultPositions={defaultPositions}
          zoom={zoom}
          offset={offset}
          routing={relationshipRouting}
          routes={relationshipRoutes}
          onRouteChange={handleRelationshipRoute}
        />

        {/* Table cards */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            pointerEvents: tool === "table" ? "auto" : "none",
          }}
        >
          {schema.tables.map((table) => (
            <TableCard
              key={table.name}
              table={table}
              position={tablePositions[table.name]}
              defaultPosition={
                defaultPositions[table.name] || { x: 100, y: 100 }
              }
              zoom={zoom}
              offset={offset}
              selected={selectedTable === table.name}
              draggable={tool === "table"}
              onSelect={(name) => {
                setSelectedTable(name);
                setSelectedIds(new Set());
              }}
              onDrag={handleTableDrag}
            />
          ))}
        </div>

        {/* Toolbar */}
        <Toolbar
          tool={tool}
          setTool={setTool}
          relationshipRouting={relationshipRouting}
          setRelationshipRouting={setRelationshipRouting}
          onDelete={handleDeleteSelected}
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetView={handleResetView}
          showDbml={showDbml}
          setShowDbml={setShowDbml}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          onImportImage={handleImportImage}
        />

        {/* Hidden file input for image import */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={canvasFileInputRef}
          type="file"
          accept=".vcraft,.vcf,application/json"
          onChange={handleCanvasFileChange}
          className="hidden"
        />

        {/* DBML Editor Panel */}
        <DbmlPanel
          open={showDbml}
          onClose={closeDbml}
          dbmlSource={dbmlSource}
          onChange={setDbmlSource}
          schema={schema}
        />
      </div>
    </div>
  );
}
