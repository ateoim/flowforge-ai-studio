import {
  Download,
  History,
  Play,
  RotateCcw,
  Settings2,
  Square,
  Workflow,
} from 'lucide-react';
import type { LLMSettings, WorkflowGraph } from '../engine/types';

interface TopBarProps {
  templates: WorkflowGraph[];
  activeWorkflow: WorkflowGraph;
  isRunning: boolean;
  llmSettings: LLMSettings;
  drawerOpen: boolean;
  runHistoryCount: number;
  onSelectTemplate: (templateId: string) => void;
  onResetTemplate: () => void;
  onRunWorkflow: () => void;
  onStopWorkflow: () => void;
  onResetExecution: () => void;
  onExportWorkflow: () => void;
  onOpenSettings: () => void;
  onToggleDrawer: () => void;
}

export function TopBar({
  templates,
  activeWorkflow,
  isRunning,
  llmSettings,
  drawerOpen,
  runHistoryCount,
  onSelectTemplate,
  onResetTemplate,
  onRunWorkflow,
  onStopWorkflow,
  onResetExecution,
  onExportWorkflow,
  onOpenSettings,
  onToggleDrawer,
}: TopBarProps) {
  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-[#1E2534] bg-[#0F131C] px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/35 bg-cyan-500/10 text-cyan-400">
            <Workflow className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight text-slate-100">
              FlowForge
            </span>
            <span className="rounded border border-[#252D3F] bg-[#151922] px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
              DAG STUDIO
            </span>
          </div>
        </div>

        <div className="h-4 w-px bg-[#1E2534]" />

        <div className="flex items-center gap-2">
          <label htmlFor="template-select" className="text-xs text-slate-400">
            Workflow
          </label>
          <select
            id="template-select"
            value={activeWorkflow.id}
            onChange={(e) => onSelectTemplate(e.target.value)}
            disabled={isRunning}
            className="h-8 max-w-[310px] rounded-md border border-[#252D3F] bg-[#151922] px-2.5 text-xs font-medium text-slate-100 outline-none transition hover:border-slate-600 focus:border-cyan-500/60 disabled:opacity-60"
          >
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id} className="bg-[#151922]">
                [{tpl.category}] {tpl.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onResetTemplate}
            disabled={isRunning}
            title="Reset workflow graph to template defaults"
            className="flex h-8 items-center gap-1 rounded-md border border-[#252D3F] bg-[#151922] px-2 text-xs text-slate-300 transition hover:border-slate-600 hover:text-white disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Reset Graph</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isRunning ? (
          <button
            type="button"
            onClick={onStopWorkflow}
            className="flex h-8 items-center gap-1.5 rounded-md border border-rose-500/50 bg-rose-500/15 px-3 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop Run
          </button>
        ) : (
          <button
            type="button"
            onClick={onRunWorkflow}
            className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-200 shadow-[0_0_16px_-4px_rgba(16,185,129,0.5)] transition hover:bg-emerald-500/25"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Run Workflow
          </button>
        )}

        <button
          type="button"
          onClick={onResetExecution}
          disabled={isRunning}
          title="Clear execution highlights"
          className="flex h-8 items-center gap-1.5 rounded-md border border-[#252D3F] bg-[#151922] px-2.5 text-xs text-slate-300 transition hover:border-slate-600 hover:text-white disabled:opacity-50"
        >
          Clear Trace
        </button>

        <div className="mx-1 h-4 w-px bg-[#1E2534]" />

        <button
          type="button"
          onClick={onExportWorkflow}
          title="Export workflow definition JSON"
          className="flex h-8 items-center gap-1.5 rounded-md border border-[#252D3F] bg-[#151922] px-2.5 text-xs text-slate-300 transition hover:border-slate-600 hover:text-white"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Export</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Configure BYOK LLM endpoint & execution pace"
          className="relative flex h-8 items-center gap-1.5 rounded-md border border-[#252D3F] bg-[#151922] px-2.5 text-xs text-slate-300 transition hover:border-slate-600 hover:text-white"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">
            {llmSettings.enabled ? 'Live LLM' : 'Settings'}
          </span>
          {llmSettings.enabled && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleDrawer}
          className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition ${
            drawerOpen
              ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
              : 'border-[#252D3F] bg-[#151922] text-slate-300 hover:border-slate-600 hover:text-white'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Inspector</span>
          {runHistoryCount > 0 && (
            <span className="rounded bg-[#0B0E14] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              {runHistoryCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
