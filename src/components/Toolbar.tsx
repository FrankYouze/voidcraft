import { cloneElement, memo } from "react";
import type { Tool } from "../types";
import { ArrowRight, Brush, Circle, Database, Diamond, Grid3x3, Hand, ImagePlus, Maximize2, Minus, MousePointer2, Plus, Route, Square, Trash2, Type, ZoomOut } from "lucide-react";

type Props = {
  tool: Tool; setTool: (tool: Tool) => void; onDelete: () => void;
  zoom: number; onZoomIn: () => void; onZoomOut: () => void; onResetView: () => void;
  showDbml: boolean; setShowDbml: (value: boolean) => void;
  showGrid: boolean; setShowGrid: (value: boolean) => void; onImportImage: () => void;
  relationshipRouting: "curved" | "orthogonal"; setRelationshipRouting: (value: "curved" | "orthogonal") => void;
};

const tools: { id: Tool; icon: React.ReactNode; label: string; shortcut: string }[] = [
  { id: "select", icon: <MousePointer2 size={17} />, label: "Select", shortcut: "V" },
  { id: "table", icon: <Database size={17} />, label: "Move tables", shortcut: "T" },
  { id: "rectangle", icon: <Square size={17} />, label: "Rectangle", shortcut: "R" },
  { id: "ellipse", icon: <Circle size={17} />, label: "Ellipse", shortcut: "O" },
  { id: "diamond", icon: <Diamond size={17} />, label: "Diamond", shortcut: "D" },
  { id: "arrow", icon: <ArrowRight size={17} />, label: "Arrow", shortcut: "A" },
  { id: "line", icon: <Minus size={17} />, label: "Line", shortcut: "L" },
  { id: "brush", icon: <Brush size={17} />, label: "Brush", shortcut: "P" },
  { id: "text", icon: <Type size={17} />, label: "Text", shortcut: "X" },
  { id: "pan", icon: <Hand size={17} />, label: "Pan", shortcut: "H" },
];

function Toolbar({ tool, setTool, onDelete, zoom, onZoomIn, onZoomOut, onResetView, showDbml, setShowDbml, showGrid, setShowGrid, onImportImage, relationshipRouting, setRelationshipRouting }: Props) {
  return (
    <div data-canvas-chrome="true" className="toolbar-row contents">
      <div className="toolbar-tools glass col-start-2 justify-self-center p-0.5 flex items-center gap-2 pointer-events-auto" style={{ borderRadius: 8 }}>
        {tools.map((item) => <button key={item.id} onClick={() => setTool(item.id)} title={`${item.label} (${item.shortcut})`} aria-label={`${item.label}, shortcut ${item.shortcut}`} className={`tool-button relative flex items-center justify-center rounded-md transition-colors ${tool === item.id ? "bg-ink-50 text-ink-990" : "text-ink-400 hover:text-ink-100 hover:bg-white/5"}`}>{cloneElement(item.icon as React.ReactElement<{ size: number }>, { size: 17 })}<span className={`absolute right-0.5 bottom-0.5 leading-none font-mono ${tool === item.id ? "text-ink-600" : "text-ink-500"}`}>{item.shortcut}</span></button>)}
        <button onClick={onImportImage} title="Import image (I)" aria-label="Import image, shortcut I" className="tool-button relative flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/5"><ImagePlus size={16} /><span className="absolute right-0.5 bottom-0.5 leading-none font-mono text-ink-500">I</span></button>
        <span className="w-px h-6 bg-white/10 mx-1" />
        <button onClick={onDelete} title="Delete selected (Delete / Backspace)" aria-label="Delete selected, shortcut Delete or Backspace" className="tool-button relative flex items-center justify-center rounded-lg text-ink-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 size={16} /><span className="absolute right-0.5 bottom-0.5 text-[7px] leading-none font-mono text-ink-500">Del</span></button>
      </div>
      <div className="toolbar-view-controls glass col-start-3 justify-self-end p-0.5 flex items-center gap-0 pointer-events-auto" style={{ borderRadius: 8 }}>
        <button onClick={onZoomOut} title="Zoom out" className="view-control-button flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/5"><ZoomOut size={17} /></button>
        <span className="text-center text-ink-300 font-mono px-1">{Math.round(zoom * 100)}%</span>
        <button onClick={onZoomIn} title="Zoom in" className="view-control-button flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/5"><Plus size={17} /></button>
        <button onClick={onResetView} title="Reset view" className="view-control-button flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-100 hover:bg-white/5"><Maximize2 size={17} /></button>
        {/* <span className="w-px h-6 bg-white/10 mx-1" /> */}
        <button onClick={() => setShowGrid(!showGrid)} title="Toggle grid (G)" className={`view-control-button flex items-center justify-center rounded-lg ${showGrid ? "bg-ink-50 text-ink-990" : "text-ink-400 hover:text-ink-100 hover:bg-white/5"}`}><Grid3x3 size={17} /></button>
        <button onClick={() => setShowDbml(!showDbml)} title="Toggle schema editor (B)" aria-label="Toggle schema editor, shortcut B" className={`view-control-button flex items-center justify-center rounded-lg ${showDbml ? "bg-ink-50 text-ink-990" : "text-ink-400 hover:text-ink-100 hover:bg-white/5"}`}><Database size={17} /></button>
        <button onClick={() => setRelationshipRouting(relationshipRouting === "curved" ? "orthogonal" : "curved")} title={`Relationship routing: ${relationshipRouting}. Click to switch`} aria-label={`Relationship routing ${relationshipRouting}; toggle routing style`} className={`view-control-button flex items-center justify-center rounded-lg ${relationshipRouting === "orthogonal" ? "bg-ink-50 text-ink-990" : "text-ink-400 hover:text-ink-100 hover:bg-white/5"}`}><Route size={17} /></button>
      </div>
    </div>
  );
}

export default memo(Toolbar);
