import { useState, useEffect, memo } from "react";
import { X, Code2, Check, AlertCircle } from "lucide-react";
import type { DbmlSchema } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  dbmlSource: string;
  onChange: (src: string) => void;
  schema: DbmlSchema;
};

function DbmlPanel({
  open,
  onClose,
  dbmlSource,
  onChange,
  schema,
}: Props) {
  const [localSource, setLocalSource] = useState(dbmlSource);
  const [parseError, setParseError] = useState(false);

  useEffect(() => {
    setLocalSource(dbmlSource);
  }, [dbmlSource]);

  const isDirty = localSource !== dbmlSource;

  const handleApply = () => {
    onChange(localSource);
  };

  const tableCount = schema.tables.length;
  const relCount = schema.relationships.length;

  return (
    <div
      data-canvas-chrome="true"
      className={`absolute top-0 right-0 bottom-0 z-30 bg-ink-900 border-l border-white/5 transition-transform duration-300 flex flex-col ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ width: 420 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Code2 size={20} className="text-ink-300" />
          <h2 className="text-ink-50 font-semibold text-sm tracking-tight">DBML Schema Editor</h2>
        </div>
        <button
          onClick={onClose}
          className="text-ink-400 hover:text-ink-50 transition-colors p-1 rounded hover:bg-white/5"
        >
          <X size={18} />
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
        <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-ink-300 font-medium">
          {tableCount} {tableCount === 1 ? "table" : "tables"}
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-ink-300 font-medium">
          {relCount} {relCount === 1 ? "relation" : "relations"}
        </span>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden relative">
        {parseError && (
          <div className="absolute top-2 left-2 right-2 z-10 flex items-center gap-2 bg-red-500/10 text-red-400 px-3 py-2 rounded-lg text-xs border border-red-500/20">
            <AlertCircle size={14} />
            <span>Parse error — check your DBML syntax</span>
          </div>
        )}
        <textarea
          value={localSource}
          onChange={(e) => {
            setLocalSource(e.target.value);
            setParseError(false);
          }}
          spellCheck={false}
          className="w-full h-full bg-ink-900 text-ink-200 font-mono text-[13px] leading-relaxed p-4 resize-none outline-none placeholder:text-ink-600"
          placeholder="// Write your DBML here..."
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
        <a
          href="https://dbdiagram.io/d"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-ink-500 hover:text-ink-300 transition-colors"
        >
          DBML syntax reference
        </a>
        <button
          onClick={handleApply}
          disabled={!isDirty}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isDirty
              ? "bg-ink-50 text-ink-990 hover:bg-white"
              : "bg-ink-800 text-ink-600 cursor-not-allowed"
          }`}
        >
          <Check size={16} />
          Apply
        </button>
      </div>
    </div>
  );
}

export default memo(DbmlPanel);
