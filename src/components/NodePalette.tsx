import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Cpu,
  GitBranch,
  Globe,
  Plus,
  Sliders,
  Zap,
} from 'lucide-react';
import type { GraphValidationResult } from '../engine/dag';
import type { NodeType, WorkflowGraph } from '../engine/types';
import { NODE_TYPE_LIST, NODE_TYPE_META } from '../utils/nodeMeta';

interface NodePaletteProps {
  workflow: WorkflowGraph;
  validation: GraphValidationResult;
  onAddNode: (type: NodeType) => void;
}

export function renderNodeTypeIcon(type: NodeType, className = 'h-3.5 w-3.5') {
  switch (type) {
    case 'trigger':
      return <Zap className={className} />;
    case 'llm':
      return <Cpu className={className} />;
    case 'http':
      return <Globe className={className} />;
    case 'condition':
      return <GitBranch className={className} />;
    case 'transform':
      return <Sliders className={className} />;
    case 'action':
      return <Bell className={className} />;
  }
}

export function NodePalette({
  workflow,
  validation,
  onAddNode,
}: NodePaletteProps) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[#1E2534] bg-[#0F131C]">
      <div className="border-b border-[#1E2534] px-3.5 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Node Palette
          </h2>
          <span className="font-mono text-[10px] text-slate-500">Click to add</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {NODE_TYPE_LIST.map((type) => {
            const meta = NODE_TYPE_META[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => onAddNode(type)}
                className="group flex items-center justify-between rounded-md border border-[#1E2534] bg-[#151922] px-2.5 py-2 text-left transition hover:border-slate-600 hover:bg-[#1A202C]"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${meta.accentBg} ${meta.accentBorder} ${meta.accentText}`}
                  >
                    {renderNodeTypeIcon(type)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-slate-200">
                      {meta.label}
                    </div>
                    <div className="truncate text-[10px] text-slate-500">
                      {meta.shortLabel}
                    </div>
                  </div>
                </div>
                <Plus className="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-hover:text-cyan-400" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3">
        <h2 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          DAG Telemetry
        </h2>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-[#1E2534] bg-[#151922] px-2.5 py-2">
            <div className="text-[10px] text-slate-500">Nodes</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100">
              {workflow.nodes.length}
            </div>
          </div>
          <div className="rounded-md border border-[#1E2534] bg-[#151922] px-2.5 py-2">
            <div className="text-[10px] text-slate-500">Edges</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100">
              {workflow.edges.length}
            </div>
          </div>
        </div>

        <div className="mt-2.5 rounded-md border border-[#1E2534] bg-[#151922] p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {validation.valid ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300">Acyclic DAG Valid</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                <span className="text-rose-300">Cycle Detected</span>
              </>
            )}
          </div>
          {validation.warnings.length > 0 && (
            <p className="mt-1.5 text-[11px] leading-snug text-amber-300/90">
              {validation.warnings[0]}
            </p>
          )}
          {validation.order.length > 0 && (
            <div className="mt-2.5 border-t border-[#1E2534] pt-2">
              <div className="text-[10px] font-medium text-slate-500 uppercase">
                Topological Order
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {validation.order.map((nodeId, idx) => (
                  <span
                    key={nodeId}
                    className="rounded border border-[#252D3F] bg-[#0B0E14] px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                  >
                    {idx + 1}.{nodeId}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-md border border-[#1E2534]/80 bg-[#0B0E14]/70 p-2.5 text-[11px] leading-relaxed text-slate-400">
          <div className="font-medium text-slate-300">Canvas Controls</div>
          <ul className="mt-1 space-y-1 text-[10.5px]">
            <li>• Drag cards to reposition nodes</li>
            <li>• Drag from right port to left port to connect</li>
            <li>• Click any edge midpoint to delete</li>
            <li>• Drag background to pan canvas</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}
