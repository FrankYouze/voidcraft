import { memo } from "react";
import { Download, FileText, Layers, Plus, Trash2, Upload } from "lucide-react";
import type { Canvas } from "../types";

type Props = {
  open: boolean;
  canvases: Canvas[];
  currentId: string | null;
  onCreate: () => void;
  onSelect: (canvas: Canvas) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
  onExport: () => void;
};

function CanvasSidebar({ open, canvases, currentId, onCreate, onSelect, onDelete, onImport, onExport }: Props) {
  return (
    <aside className={`relative z-[100] ${open ? "w-64 border-r border-white/5" : "w-0 border-r-0"} transition-[width] duration-200 bg-ink-900 flex flex-col shrink-0 overflow-hidden`}>
      <div className="px-4 py-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-ink-800 flex items-center justify-center border border-white/10">
            <Layers size={18} className="text-ink-200" />
          </div>
          <h1 className="text-ink-50 font-semibold text-sm tracking-tight">Voidcraft</h1>
        </div>
        <button onClick={onCreate} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-ink-50 hover:bg-white text-ink-990 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> New Canvas
        </button>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button onClick={onImport} title="Import a .vcraft canvas" className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-ink-850 px-2 py-2 text-xs text-ink-200 transition-colors hover:bg-ink-800">
            <Upload size={14} /> Import
          </button>
          <button onClick={onExport} disabled={!currentId} title="Export current canvas as .vcraft" className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-ink-850 px-2 py-2 text-xs text-ink-200 transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40">
            <Download size={14} /> Export
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {canvases.map((canvas) => (
          <div key={canvas.id} onClick={() => onSelect(canvas)} className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${canvas.id === currentId ? "bg-ink-800 text-ink-50" : "text-ink-400 hover:bg-ink-850"}`}>
            <FileText size={15} className="shrink-0" />
            <span className="text-sm truncate flex-1">{canvas.title}</span>
            <button onClick={(event) => { event.stopPropagation(); onDelete(canvas.id); }} title="Delete canvas" className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-red-400 transition-all">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-white/5">
        <p className="text-[10px] text-ink-500">Freeform drawing + DBML schema design</p>
      </div>
    </aside>
  );
}

export default memo(CanvasSidebar);
