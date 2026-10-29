import { memo } from "react";
import { ArrowDownToLine, ArrowUpToLine, Layers3 } from "lucide-react";
import type { Tool } from "../types";

type Props = {
  open: boolean; sidebarOpen: boolean; tool: Tool; strokeColor: string; onStrokeColor: (value: string) => void;
  fillColor: string; onFillColor: (value: string) => void;
  strokeWidth: number; onStrokeWidth: (value: number) => void;
  strokeStyle: "solid" | "dashed" | "dotted"; onStrokeStyle: (value: "solid" | "dashed" | "dotted") => void;
  opacity: number; onOpacity: (value: number) => void;
  cornerRadius: number; onCornerRadius: (value: number) => void;
  hasSelection: boolean; onBringForward: () => void; onSendBackward: () => void;
};

const strokes = ["#fafafa", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#27272a"];
const fills = ["transparent", "#1f1f23", "#27272a", "#3f3f46", "#52525b", "#71717a"];

function StylePanel(props: Props) {
  const { open, sidebarOpen, tool, strokeColor, onStrokeColor, fillColor, onFillColor, strokeWidth, onStrokeWidth, strokeStyle, onStrokeStyle, opacity, onOpacity, cornerRadius, onCornerRadius, hasSelection, onBringForward, onSendBackward } = props;
  if (!open) return null;
  return (
    <aside data-canvas-chrome="true" className="fixed top-1/2 -translate-y-1/2 z-30 w-56 glass-strong p-4 flex flex-col gap-4" style={{ left: sidebarOpen ? 272 : 16 }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-ink-100">Style</h2>
        <span className="text-[10px] text-ink-500 capitalize">{tool}</span>
      </div>
      <section>
        <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">Stroke</p>
        <div className="flex gap-2">{strokes.map((color) => <button key={color} aria-label={`Stroke ${color}`} onClick={() => onStrokeColor(color)} className={`w-6 h-6 rounded-md border ${strokeColor === color ? "border-white ring-1 ring-white/40" : "border-white/10"}`} style={{ backgroundColor: color }} />)}</div>
      </section>
      <section>
        <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">Fill</p>
        <div className="flex gap-2">{fills.map((color) => <button key={color} aria-label={`Fill ${color}`} onClick={() => onFillColor(color)} className={`w-6 h-6 rounded-md border ${fillColor === color ? "border-white ring-1 ring-white/40" : "border-white/10"}`} style={{ backgroundColor: color === "transparent" ? "#101012" : color, backgroundImage: color === "transparent" ? "linear-gradient(45deg,#27272a 25%,transparent 25%,transparent 75%,#27272a 75%)" : undefined }} />)}</div>
      </section>
      <label className="block text-[10px] uppercase tracking-wider text-ink-500">Stroke width <span className="float-right text-ink-300">{strokeWidth}px</span><input className="mt-2 w-full accent-ink-200" type="range" min="1" max="8" value={strokeWidth} onChange={(event) => onStrokeWidth(Number(event.target.value))} /></label>
      <section>
        <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">Stroke style</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/20 p-1">{(["solid", "dashed", "dotted"] as const).map((style) => <button key={style} onClick={() => onStrokeStyle(style)} className={`rounded-md py-1 text-[10px] capitalize ${strokeStyle === style ? "bg-white/10 text-white" : "text-ink-400 hover:text-white"}`}>{style}</button>)}</div>
      </section>
      <label className="block text-[10px] uppercase tracking-wider text-ink-500">Opacity <span className="float-right text-ink-300">{opacity}%</span><input className="mt-2 w-full accent-ink-200" type="range" min="10" max="100" step="5" value={opacity} onChange={(event) => onOpacity(Number(event.target.value))} /></label>
      {tool === "rectangle" && <label className="block text-[10px] uppercase tracking-wider text-ink-500">Corner radius <span className="float-right text-ink-300">{cornerRadius}px</span><input className="mt-2 w-full accent-ink-200" type="range" min="0" max="24" value={cornerRadius} onChange={(event) => onCornerRadius(Number(event.target.value))} /></label>}
      <section>
        <p className="text-[10px] uppercase tracking-wider text-ink-500 mb-2 flex items-center gap-1"><Layers3 size={12} /> Layer</p>
        <div className="flex gap-2">
          <button disabled={!hasSelection} onClick={onBringForward} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[10px] text-ink-200 hover:bg-white/10 disabled:opacity-40"><ArrowUpToLine size={13} /> Bring front</button>
          <button disabled={!hasSelection} onClick={onSendBackward} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/5 px-2 py-1.5 text-[10px] text-ink-200 hover:bg-white/10 disabled:opacity-40"><ArrowDownToLine size={13} /> Send back</button>
        </div>
      </section>
    </aside>
  );
}

export default memo(StylePanel);
