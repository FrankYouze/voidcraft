import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { DrawingElement, Point, Tool } from "../types";

type PanState = {
  isPanning: boolean;
  start: Point;
  offsetStart: Point;
};
type ResizeHandle = "nw" | "ne" | "sw" | "se";

type Props = {
  tool: Tool;
  setTool: (tool: Tool) => void;
  elements: DrawingElement[];
  setElements: (els: DrawingElement[]) => void;
  zoom: number;
  offset: Point;
  setOffset: (p: Point) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  panState: React.RefObject<PanState | null>;
};

export default function DrawingCanvas({
  tool,
  setTool,
  elements,
  setElements,
  zoom,
  offset,
  setOffset,
  selectedIds,
  setSelectedIds,
  strokeColor,
  fillColor,
  strokeWidth,
  opacity,
  cornerRadius,
  strokeStyle,
  panState,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draft, setDraft] = useState<DrawingElement | null>(null);
  const [draggingIds, setDraggingIds] = useState<Set<string> | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [resizing, setResizing] = useState<{ id: string; handle: ResizeHandle; initial: DrawingElement } | null>(null);
  const [draggingArrowBend, setDraggingArrowBend] = useState<{ id: string; start: Point; initialBend: Point } | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [editingText, setEditingText] = useState<{ x: number; y: number; screenX: number; screenY: number; value: string; elementId?: string } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const textFinalizedRef = useRef(false);

  const dragStart = useRef<Point>({ x: 0, y: 0 });
  const elemStarts = useRef<Map<string, DrawingElement>>(new Map());
  const panStart = useRef<{ x: number; y: number; offX: number; offY: number }>({
    x: 0, y: 0, offX: 0, offY: 0,
  });

  const textEditorOpen = editingText !== null;
  useEffect(() => {
    if (!textEditorOpen) return;
    // Placement creates the portal during mousedown. Wait until the browser
    // finishes that click sequence before focusing, or its native focus cycle
    // immediately blurs and commits the new editor.
    const focusTimer = window.setTimeout(() => {
      textInputRef.current?.focus();
      textInputRef.current?.setSelectionRange(0, 0);
    }, 80);
    return () => window.clearTimeout(focusTimer);
  }, [textEditorOpen]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const x = (clientX - rect.left - offset.x) / zoom;
      const y = (clientY - rect.top - offset.y) / zoom;
      return { x, y };
    },
    [offset, zoom]
  );

  const shouldPan = (e: React.MouseEvent): boolean => {
    return (
      tool === "pan" ||
      e.button === 1 ||
      e.button === 2 ||
      (e.button === 0 && e.altKey)
    );
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (editingText) {
      e.preventDefault();
      e.stopPropagation();
      commitText();
      return;
    }
    if (shouldPan(e)) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, offX: offset.x, offY: offset.y };
      if (panState.current) panState.current.isPanning = true;
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const world = screenToWorld(e.clientX, e.clientY);

    if (tool === "select") {
      if (selectedIds.size === 1) {
        const selected = elements.find((element) => selectedIds.has(element.id));
        if (selected?.type === "arrow") {
          const handle = arrowBendHandlePoint(selected);
          if (Math.hypot(world.x - handle.x, world.y - handle.y) <= 10 / zoom) {
            e.preventDefault();
            const midpoint = { x: (selected.x1 + selected.x2) / 2, y: (selected.y1 + selected.y2) / 2 };
            setDraggingArrowBend({ id: selected.id, start: world, initialBend: selected.bend ?? midpoint });
            return;
          }
        }
      }
      if (selectedIds.size === 1) {
        const selected = elements.find((element) => selectedIds.has(element.id));
        const handle = selected ? hitResizeHandle(selected, world, 10 / zoom) : null;
        if (selected && handle) {
          e.preventDefault();
          setResizing({ id: selected.id, handle, initial: { ...selected } });
          return;
        }
      }
      const hit = hitTest(elements, world);
      if (hit) {
        if (e.shiftKey) {
          const next = new Set(selectedIds);
          if (next.has(hit.id)) next.delete(hit.id);
          else next.add(hit.id);
          setSelectedIds(next);
        } else {
          if (!selectedIds.has(hit.id)) {
            setSelectedIds(new Set([hit.id]));
          }
        }
        // Start dragging all selected elements
        const ids = e.shiftKey ? new Set(selectedIds) : (selectedIds.has(hit.id) ? selectedIds : new Set([hit.id]));
        if (!e.shiftKey && !selectedIds.has(hit.id)) {
          setSelectedIds(ids);
        }
        setDraggingIds(ids);
        dragStart.current = world;
        elemStarts.current = new Map();
        for (const el of elements) {
          if (ids.has(el.id)) elemStarts.current.set(el.id, { ...el });
        }
      } else {
        if (!e.shiftKey) setSelectedIds(new Set());
        // Start marquee selection
        setMarquee({ x1: world.x, y1: world.y, x2: world.x, y2: world.y });
      }
      return;
    }

    if (tool === "text") {
      textFinalizedRef.current = false;
      setEditingText({ x: world.x, y: world.y, screenX: e.clientX, screenY: e.clientY, value: "" });
      return;
    }

    if (tool === "brush") {
      setIsDrawing(true);
      setDraft({
        id: crypto.randomUUID(), type: "brush",
        x1: world.x, y1: world.y, x2: world.x, y2: world.y,
        points: [world], stroke: strokeColor, fill: "transparent", strokeWidth, opacity, strokeStyle,
      });
      return;
    }

    if (tool === "rectangle" || tool === "ellipse" || tool === "diamond" || tool === "arrow" || tool === "line") {
      setIsDrawing(true);
      const newEl: DrawingElement = {
        id: crypto.randomUUID(),
        type: tool,
        x1: world.x, y1: world.y, x2: world.x, y2: world.y,
        stroke: strokeColor,
        fill: tool === "line" || tool === "arrow" ? "transparent" : fillColor,
        strokeWidth,
        opacity,
        strokeStyle,
        cornerRadius: tool === "rectangle" ? cornerRadius : undefined,
      };
      setDraft(newEl);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setOffset({ x: panStart.current.offX + dx, y: panStart.current.offY + dy });
      return;
    }

    const world = screenToWorld(e.clientX, e.clientY);

    if (draggingArrowBend) {
      // The visible handle sits halfway between the quadratic control point
      // and the endpoints, so moving it by D requires moving the control by 2D.
      const dx = (world.x - draggingArrowBend.start.x) * 2;
      const dy = (world.y - draggingArrowBend.start.y) * 2;
      const bend = { x: draggingArrowBend.initialBend.x + dx, y: draggingArrowBend.initialBend.y + dy };
      setElements(elements.map((element) => element.id === draggingArrowBend.id ? { ...element, bend } : element));
      return;
    }

    if (resizing) {
      const initial = resizing.initial;
      if (initial.type === "text") {
        const fontSize = initial.fontSize || 20;
        const metrics = getTextMetrics(initial);
        const width = metrics.width;
        const height = metrics.height;
        const left = initial.x1;
        const right = left + width;
        const top = metrics.top;
        const bottom = metrics.bottom;
        let scale = 1;
        if (resizing.handle === "nw") scale = Math.max((right - world.x) / width, (bottom - world.y) / height);
        if (resizing.handle === "ne") scale = Math.max((world.x - left) / width, (bottom - world.y) / height);
        if (resizing.handle === "sw") scale = Math.max((right - world.x) / width, (world.y - top) / height);
        if (resizing.handle === "se") scale = Math.max((world.x - left) / width, (world.y - top) / height);
        const nextFontSize = Math.max(6, Math.min(240, fontSize * scale));
        const nextWidth = width * (nextFontSize / fontSize);
        const nextHeight = height * (nextFontSize / fontSize);
        const nextLineHeight = nextFontSize * 1.2;
        let x1 = left;
        let y1 = top + nextLineHeight;
        if (resizing.handle === "nw" || resizing.handle === "sw") x1 = right - nextWidth;
        if (resizing.handle === "nw" || resizing.handle === "ne") y1 = bottom - nextHeight + nextLineHeight;
        setElements(elements.map((element) => element.id === resizing.id ? { ...element, x1, y1, x2: x1, y2: y1, fontSize: nextFontSize } : element));
        return;
      }
      const left = Math.min(initial.x1, initial.x2);
      const right = Math.max(initial.x1, initial.x2);
      const top = Math.min(initial.y1, initial.y2);
      const bottom = Math.max(initial.y1, initial.y2);
      const minSize = 4 / zoom;
      let x1 = left; let x2 = right; let y1 = top; let y2 = bottom;
      if (initial.type === "image") {
        const width = Math.max(right - left, minSize);
        const height = Math.max(bottom - top, minSize);
        const aspectRatio = width / height;
        const sx = resizing.handle === "nw" || resizing.handle === "sw" ? -1 : 1;
        const sy = resizing.handle === "nw" || resizing.handle === "ne" ? -1 : 1;
        const anchorX = sx < 0 ? right : left;
        const anchorY = sy < 0 ? bottom : top;
        const pointerWidth = Math.max(0, sx * (world.x - anchorX));
        const pointerHeight = Math.max(0, sy * (world.y - anchorY));
        // Project the pointer onto the image's aspect-locked resize diagonal.
        const scale = Math.max(
          minSize / width,
          minSize / height,
          (width * pointerWidth + height * pointerHeight) / (width * width + height * height),
        );
        const resizedWidth = width * scale;
        const resizedHeight = height * scale;
        x1 = sx < 0 ? anchorX - resizedWidth : anchorX;
        x2 = sx < 0 ? anchorX : anchorX + resizedWidth;
        y1 = sy < 0 ? anchorY - resizedHeight : anchorY;
        y2 = sy < 0 ? anchorY : anchorY + resizedHeight;
        setElements(elements.map((element) => element.id === resizing.id ? { ...element, x1, y1, x2, y2 } : element));
        return;
      }
      if (resizing.handle === "nw") { x1 = Math.min(world.x, right - minSize); y1 = Math.min(world.y, bottom - minSize); }
      if (resizing.handle === "ne") { x2 = Math.max(world.x, left + minSize); y1 = Math.min(world.y, bottom - minSize); }
      if (resizing.handle === "sw") { x1 = Math.min(world.x, right - minSize); y2 = Math.max(world.y, top + minSize); }
      if (resizing.handle === "se") { x2 = Math.max(world.x, left + minSize); y2 = Math.max(world.y, top + minSize); }
      setElements(elements.map((element) => element.id === resizing.id ? { ...element, x1, y1, x2, y2 } : element));
      return;
    }

    if (tool === "select" && selectedIds.size === 1) {
      const selected = elements.find((element) => selectedIds.has(element.id));
      if (selected?.type === "arrow") {
        const handle = arrowBendHandlePoint(selected);
        const svg = e.currentTarget as SVGSVGElement;
        svg.style.cursor = Math.hypot(world.x - handle.x, world.y - handle.y) <= 10 / zoom ? "grab" : "default";
      }
      const handle = selected ? hitResizeHandle(selected, world, 10 / zoom) : null;
      const svg = e.currentTarget as SVGSVGElement;
      if (handle) svg.style.cursor = handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize";
    }

    if (isDrawing && draft) {
      if (draft.type === "brush") {
        const points = draft.points ?? [];
        const last = points[points.length - 1];
        if (!last || Math.hypot(world.x - last.x, world.y - last.y) >= 1 / zoom) {
          setDraft({ ...draft, x1: Math.min(draft.x1, world.x), y1: Math.min(draft.y1, world.y), x2: Math.max(draft.x2, world.x), y2: Math.max(draft.y2, world.y), points: [...points, world] });
        }
      } else {
        setDraft({ ...draft, x2: world.x, y2: world.y });
      }
      return;
    }

    if (marquee) {
      setMarquee({ ...marquee, x2: world.x, y2: world.y });
      return;
    }

    if (draggingIds && draggingIds.size > 0) {
      const dx = world.x - dragStart.current.x;
      const dy = world.y - dragStart.current.y;
      const updated = elements.map((el) => {
        const start = elemStarts.current.get(el.id);
        if (!start) return el;
        return {
          ...start,
          x1: start.x1 + dx, y1: start.y1 + dy,
          x2: start.x2 + dx, y2: start.y2 + dy,
          ...(start.bend ? { bend: { x: start.bend.x + dx, y: start.bend.y + dy } } : {}),
          ...(start.points ? { points: start.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) } : {}),
        };
      });
      setElements(updated);
    }
  };

  const handleMouseUp = () => {
    setResizing(null);
    setDraggingArrowBend(null);
    if (isPanning) {
      setIsPanning(false);
      if (panState.current) panState.current.isPanning = false;
    }
    if (isDrawing && draft) {
      const w = Math.abs(draft.x2 - draft.x1);
      const h = Math.abs(draft.y2 - draft.y1);
      if ((draft.type === "brush" && (draft.points?.length ?? 0) > 0) || w > 3 || h > 3) {
        setElements([...elements, draft]);
      }
      setIsDrawing(false);
      setDraft(null);
    }
    if (marquee) {
      const x1 = Math.min(marquee.x1, marquee.x2);
      const y1 = Math.min(marquee.y1, marquee.y2);
      const x2 = Math.max(marquee.x1, marquee.x2);
      const y2 = Math.max(marquee.y1, marquee.y2);
      if (x2 - x1 > 3 || y2 - y1 > 3) {
        const hits = elements.filter((el) => isInBox(el, x1, y1, x2, y2));
        setSelectedIds(new Set(hits.map((h) => h.id)));
      }
      setMarquee(null);
    }
    setDraggingIds(null);
    elemStarts.current.clear();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (tool !== "select") return;
    const world = screenToWorld(e.clientX, e.clientY);
    const hit = hitTest(elements, world);
    if (hit && hit.type === "text") {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      textFinalizedRef.current = false;
      setEditingText({
        x: hit.x1, y: hit.y1,
        screenX: rect.left + offset.x + hit.x1 * zoom,
        screenY: rect.top + offset.y + hit.y1 * zoom,
        value: hit.text || "", elementId: hit.id,
      });
      setSelectedIds(new Set([hit.id]));
    }
  };

  const commitText = () => {
    if (textFinalizedRef.current) return;
    textFinalizedRef.current = true;
    if (editingText?.value.trim()) {
      if (editingText.elementId) {
        setElements(elements.map((element) => element.id === editingText.elementId ? { ...element, text: editingText.value } : element));
      } else {
        const newEl: DrawingElement = {
          id: crypto.randomUUID(), type: "text",
          x1: editingText.x, y1: editingText.y, x2: editingText.x, y2: editingText.y,
          stroke: strokeColor, fill: "transparent", strokeWidth: 1,
          text: editingText.value, fontSize: 20, opacity,
        };
        setElements([...elements, newEl]);
      }
    }
    setEditingText(null);
    setTool("select");
  };

  return (
    <>
    <div className="absolute inset-0 pointer-events-none">
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      style={{
        cursor: isPanning
          ? "grabbing"
          : tool === "pan"
          ? "grab"
          : tool === "table"
          ? "default"
          : tool === "select"
          ? "default"
          : "crosshair",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`}>
        {elements.map((el) => (
          <DrawingShape key={el.id} el={el} selected={selectedIds.has(el.id)} zoom={zoom} />
        ))}
        {draft && <DrawingShape el={draft} selected={false} zoom={zoom} />}
        {marquee && (
          <rect
            x={Math.min(marquee.x1, marquee.x2)}
            y={Math.min(marquee.y1, marquee.y2)}
            width={Math.abs(marquee.x2 - marquee.x1)}
            height={Math.abs(marquee.y2 - marquee.y1)}
            fill="rgba(255, 255, 255, 0.04)"
            stroke="#d4d4d8"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}
      </g>
    </svg>
    </div>
    {editingText && createPortal(
      <textarea
        ref={textInputRef}
        value={editingText.value}
        onChange={(event) => setEditingText({ ...editingText, value: event.target.value })}
        onBlur={commitText}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); textFinalizedRef.current = true; setEditingText(null); setTool("select"); }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); textInputRef.current?.blur(); }
        }}
        data-canvas-chrome="true"
        className="resize-none overflow-hidden border border-ink-500/60 bg-ink-950/90 px-1 py-0.5 text-white outline-none shadow-lg"
        style={{
          position: "fixed",
          zIndex: 10000,
          left: editingText.screenX,
          top: editingText.screenY - 20,
          width: Math.min(520, Math.max(280, Math.max(...editingText.value.split("\n").map((line) => line.length), 0) * 10 + 24)),
          height: Math.min(480, Math.max(120, editingText.value.split("\n").reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 48)), 0) * 24 + 16)),
          fontSize: 20,
          lineHeight: 1.2,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      />,
      document.body,
    )}
    </>
  );
}

function DrawingShape({ el, selected, zoom }: { el: DrawingElement; selected: boolean; zoom: number }) {
  const x = Math.min(el.x1, el.x2);
  const y = Math.min(el.y1, el.y2);
  const w = Math.abs(el.x2 - el.x1);
  const h = Math.abs(el.y2 - el.y1);

  const common = {
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    fill: el.fill,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    opacity: (el.opacity ?? 100) / 100,
    strokeDasharray: el.strokeStyle === "dashed" ? "8 6" : el.strokeStyle === "dotted" ? "2 5" : undefined,
  };

  let shape: React.ReactNode = null;

  if (el.type === "image" && el.src) {
    shape = <image href={el.src} x={x} y={y} width={w} height={h} opacity={(el.opacity ?? 100) / 100} preserveAspectRatio="none" />;
  } else if (el.type === "rectangle") {
    shape = <rect x={x} y={y} width={w} height={h} rx={el.cornerRadius ?? 12} {...common} />;
  } else if (el.type === "ellipse") {
    shape = <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />;
  } else if (el.type === "diamond") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    shape = (
      <polygon points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`} {...common} />
    );
  } else if (el.type === "line") {
    shape = <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} {...common} />;
  } else if (el.type === "brush") {
    const points = el.points ?? [{ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }];
    shape = points.length === 1
      ? <circle cx={points[0].x} cy={points[0].y} r={Math.max(0.5, el.strokeWidth / 2)} fill={el.stroke} opacity={(el.opacity ?? 100) / 100} />
      : <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} {...common} fill="none" />;
  } else if (el.type === "arrow") {
    const control = el.bend ?? { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 };
    const angle = Math.atan2(el.y2 - control.y, el.x2 - control.x);
    const arrowLen = Math.min(15, Math.hypot(el.x2 - control.x, el.y2 - control.y) * 0.3);
    const ax = el.x2 - arrowLen * Math.cos(angle - Math.PI / 6);
    const ay = el.y2 - arrowLen * Math.sin(angle - Math.PI / 6);
    const bx = el.x2 - arrowLen * Math.cos(angle + Math.PI / 6);
    const by = el.y2 - arrowLen * Math.sin(angle + Math.PI / 6);
    shape = (
      <>
        <path d={`M ${el.x1} ${el.y1} Q ${control.x} ${control.y} ${el.x2} ${el.y2}`} {...common} fill="none" />
        <polyline points={`${ax},${ay} ${el.x2},${el.y2} ${bx},${by}`} {...common} fill="none" />
      </>
    );
  } else if (el.type === "text") {
    const fontSize = el.fontSize || 20;
    const lines = (el.text ?? "").split("\n");
    shape = (
      <text
        x={el.x1} y={el.y1} fill={el.stroke}
        fontSize={fontSize}
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        opacity={(el.opacity ?? 100) / 100}
        style={{ userSelect: "none" }}
      >
        {lines.map((line, index) => (
          <tspan key={index} x={el.x1} y={el.y1 + index * fontSize * 1.2}>
            {line || "\u00a0"}
          </tspan>
        ))}
      </text>
    );
  }

  const textMetrics = getTextMetrics(el);
  const textWidth = textMetrics.width;
  const textHeight = textMetrics.height;
  const showSelectionBox = el.type !== "line" && el.type !== "arrow";
  const selectionPadding = el.type === "image" ? 2 : 4;
  const selectionX = el.type === "text" ? el.x1 : x;
  const selectionY = el.type === "text" ? textMetrics.top : y;
  const selectionWidth = el.type === "text" ? textWidth : w;
  const selectionHeight = el.type === "text" ? textHeight : h;

  return (
    <g>
      {shape}
      {selected && showSelectionBox && (
        <rect
          x={selectionX - selectionPadding}
          y={selectionY - selectionPadding}
          width={selectionWidth + selectionPadding * 2}
          height={selectionHeight + selectionPadding * 2}
          fill="none"
          stroke="#fafafa"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
      )}
      {selected && (el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond" || el.type === "image" || el.type === "text") && (
        <>
          {([[selectionX, selectionY], [selectionX + selectionWidth, selectionY], [selectionX, selectionY + selectionHeight], [selectionX + selectionWidth, selectionY + selectionHeight]] as const).map(([cx, cy], index) => (
            <circle key={index} cx={cx} cy={cy} r={5 / zoom} fill="#fafafa" stroke="#27272a" strokeWidth={1.5 / zoom} />
          ))}
        </>
      )}
      {selected && (el.type === "line" || el.type === "arrow") && (
        <>
          <circle cx={el.x1} cy={el.y1} r={4} fill="#fafafa" />
          <circle cx={el.x2} cy={el.y2} r={4} fill="#fafafa" />
        </>
      )}
      {selected && el.type === "arrow" && (() => {
        const handle = arrowBendHandlePoint(el);
        return <circle cx={handle.x} cy={handle.y} r={5 / zoom} fill="#fafafa" stroke="#2563eb" strokeWidth={2 / zoom} style={{ cursor: "grab" }} />;
      })()}
      {selected && el.type === "text" && (
        <circle cx={el.x1} cy={el.y1} r={4} fill="#fafafa" />
      )}
    </g>
  );
}

function getTextMetrics(element: DrawingElement) {
  const fontSize = element.fontSize || 20;
  const lines = (element.text ?? "").split("\n");
  const lineHeight = fontSize * 1.2;
  const longestLine = lines.reduce((longest, line) => Math.max(longest, line.length), 0);
  const height = lines.length * lineHeight;
  const top = element.y1 - lineHeight;
  return {
    width: Math.max(fontSize * 0.55, longestLine * fontSize * 0.55),
    height,
    top,
    bottom: top + height,
  };
}

function hitTest(elements: DrawingElement[], point: Point): DrawingElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === "text") {
      const metrics = getTextMetrics(el);
      if (point.x >= el.x1 && point.x <= el.x1 + metrics.width && point.y >= metrics.top && point.y <= metrics.bottom) {
        return el;
      }
      continue;
    }
    if (el.type === "brush") {
      const points = el.points ?? [];
      if (points.length === 1 && Math.hypot(point.x - points[0].x, point.y - points[0].y) < 8) return el;
      if (points.some((current, index) => index > 0 && pointToLineDist(point, points[index - 1], current) < 8)) return el;
      continue;
    }
    if (el.type === "line" || el.type === "arrow") {
      const dist = el.type === "arrow" && el.bend
        ? pointToQuadraticDist(point, { x: el.x1, y: el.y1 }, el.bend, { x: el.x2, y: el.y2 })
        : pointToLineDist(point, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 });
      if (dist < 8) return el;
      continue;
    }
    const x = Math.min(el.x1, el.x2);
    const y = Math.min(el.y1, el.y2);
    const w = Math.abs(el.x2 - el.x1);
    const h = Math.abs(el.y2 - el.y1);
    if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) {
      return el;
    }
  }
  return null;
}

function arrowBendHandlePoint(element: DrawingElement): Point {
  const midpoint = { x: (element.x1 + element.x2) / 2, y: (element.y1 + element.y2) / 2 };
  if (!element.bend) return midpoint;
  // Place the editable handle on the visible center of the quadratic curve.
  return {
    x: (element.x1 + 2 * element.bend.x + element.x2) / 4,
    y: (element.y1 + 2 * element.bend.y + element.y2) / 4,
  };
}

function pointToQuadraticDist(point: Point, start: Point, control: Point, end: Point): number {
  let minDistance = Infinity;
  let previous = start;
  for (let index = 1; index <= 24; index++) {
    const t = index / 24;
    const inverse = 1 - t;
    const current = {
      x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    };
    minDistance = Math.min(minDistance, pointToLineDist(point, previous, current));
    previous = current;
  }
  return minDistance;
}

function hitResizeHandle(element: DrawingElement, point: Point, tolerance: number): ResizeHandle | null {
  if (!["rectangle", "ellipse", "diamond", "image", "text"].includes(element.type)) return null;
  const textMetrics = element.type === "text" ? getTextMetrics(element) : null;
  const left = element.type === "text" ? element.x1 : Math.min(element.x1, element.x2);
  const right = textMetrics ? left + textMetrics.width : Math.max(element.x1, element.x2);
  const top = textMetrics ? textMetrics.top : Math.min(element.y1, element.y2);
  const bottom = textMetrics ? textMetrics.bottom : Math.max(element.y1, element.y2);
  const handles: { id: ResizeHandle; x: number; y: number }[] = [
    { id: "nw", x: left, y: top },
    { id: "ne", x: right, y: top },
    { id: "sw", x: left, y: bottom },
    { id: "se", x: right, y: bottom },
  ];
  const hit = handles.find((handle) => Math.hypot(point.x - handle.x, point.y - handle.y) <= tolerance);
  return hit?.id ?? null;
}

function isInBox(el: DrawingElement, x1: number, y1: number, x2: number, y2: number): boolean {
  const ex1 = Math.min(el.x1, el.x2);
  const ey1 = Math.min(el.y1, el.y2);
  const ex2 = Math.max(el.x1, el.x2);
  const ey2 = Math.max(el.y1, el.y2);
  if (el.type === "text") {
    const metrics = getTextMetrics(el);
    return el.x1 < x2 && el.x1 + metrics.width > x1 && metrics.top < y2 && metrics.bottom > y1;
  }
  if (el.type === "brush") {
    const points = el.points ?? [];
    return points.some((point) => point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2);
  }
  if (el.type === "line" || el.type === "arrow") {
    // Check if either endpoint is inside the box
    return (el.x1 >= x1 && el.x1 <= x2 && el.y1 >= y1 && el.y1 <= y2) ||
           (el.x2 >= x1 && el.x2 <= x2 && el.y2 >= y1 && el.y2 <= y2);
  }
  return ex1 < x2 && ex2 > x1 && ey1 < y2 && ey2 > y1;
}

function pointToLineDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2);
}
