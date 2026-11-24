import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Inbox,
  Play,
  SkipForward,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { ExecutionRun, NodeExecutionRecord } from '../engine/types';

interface ExecutionDrawerProps {
  isOpen: boolean;
  currentRun: ExecutionRun | null;
  liveSteps: NodeExecutionRecord[];
  runHistory: ExecutionRun[];
  selectedStepNodeId: string | null;
  onSelectStep: (nodeId: string) => void;
  onReplayRun: (run: ExecutionRun) => void;
  onExportRun: (run: ExecutionRun) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

type DrawerTab = 'trace' | 'dlq' | 'history';

export function ExecutionDrawer({
  isOpen,
  currentRun,
  liveSteps,
  runHistory,
  selectedStepNodeId,
  onSelectStep,
  onReplayRun,
  onExportRun,
  onClearHistory,
  onClose,
}: ExecutionDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('trace');

  if (!isOpen) return null;

  const steps = liveSteps.length > 0 ? liveSteps : (currentRun?.steps ?? []);
  const deadLetters = currentRun?.deadLetters ?? [];
  const activeStep =
    steps.find((s) => s.nodeId === selectedStepNodeId) ?? steps[0] ?? null;

  return (
    <section className="flex h-72 shrink-0 flex-col border-t border-[#1E2534] bg-[#0F131C]">
      {/* Drawer Tab Bar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#1E2534] px-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('trace')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              activeTab === 'trace'
                ? 'bg-[#151922] text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            Step Trace & Payload Diff
            {steps.length > 0 && (
              <span className="rounded bg-[#0B0E14] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                {steps.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dlq')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              activeTab === 'dlq'
                ? 'bg-[#151922] text-rose-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            Dead-Letter Queue
            {deadLetters.length > 0 && (
              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[10px] text-rose-300">
                {deadLetters.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              activeTab === 'history'
                ? 'bg-[#151922] text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Run History ({runHistory.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {currentRun && (
            <button
              type="button"
              onClick={() => onExportRun(currentRun)}
              className="flex items-center gap-1 rounded border border-[#252D3F] bg-[#151922] px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500 hover:text-white"
            >
              <Download className="h-3 w-3" />
              Export Run JSON
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Collapse drawer"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-[#151922] hover:text-white"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'trace' && (
          <div className="grid h-full grid-cols-12">
            {/* Step List */}
            <div className="col-span-4 overflow-y-auto border-r border-[#1E2534] p-2.5">
              {steps.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Click &ldquo;Run Workflow&rdquo; to inspect step telemetry.
                </div>
              ) : (
                <div className="space-y-1">
                  {steps.map((step) => {
                    const isSelected = activeStep?.nodeId === step.nodeId;
                    return (
                      <button
                        key={step.nodeId}
                        type="button"
                        onClick={() => onSelectStep(step.nodeId)}
                        className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left transition ${
                          isSelected
                            ? 'border-cyan-500/50 bg-cyan-500/10'
                            : 'border-transparent bg-[#151922]/70 hover:border-[#252D3F]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {step.status === 'success' && (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          )}
                          {step.status === 'error' && (
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                          )}
                          {step.status === 'skipped' && (
                            <SkipForward className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                          )}
                          {(step.status === 'running' || step.status === 'retrying') && (
                            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-slate-200">
                              {step.nodeLabel}
                            </div>
                            <div className="truncate font-mono text-[10px] text-slate-500">
                              {step.status === 'skipped'
                                ? step.skipReason
                                : step.branchResult !== undefined
                                  ? `branch: ${step.branchResult ? 'TRUE' : 'FALSE'}`
                                  : `attempts: ${step.attempts}/${step.maxAttempts}`}
                            </div>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-slate-400">
                          {step.durationMs}ms
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Structured Input vs Output JSON Inspector */}
            <div className="col-span-8 flex h-full flex-col overflow-hidden p-3">
              {!activeStep ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Select a step to inspect its input/output JSON diff.
                </div>
              ) : (
                <div className="flex h-full flex-col gap-2.5 overflow-hidden">
                  {activeStep.resolvedTemplate && (
                    <div className="shrink-0 rounded border border-[#1E2534] bg-[#0B0E14] px-2.5 py-1.5">
                      <span className="font-mono text-[10px] font-semibold text-cyan-400 uppercase">
                        Resolved Template:{' '}
                      </span>
                      <span className="font-mono text-[11px] text-slate-300">
                        {activeStep.resolvedTemplate}
                      </span>
                    </div>
                  )}

                  {activeStep.error && (
                    <div className="shrink-0 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 font-mono text-[11px] text-rose-200">
                      {activeStep.error}
                    </div>
                  )}

                  <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                    <div className="flex min-h-0 flex-col rounded-md border border-[#1E2534] bg-[#0B0E14]">
                      <div className="border-b border-[#1E2534] px-2.5 py-1 font-mono text-[10px] font-semibold text-slate-400 uppercase">
                        Input Context
                      </div>
                      <pre className="flex-1 overflow-auto p-2.5 font-mono text-[11px] leading-relaxed text-sky-200/90">
                        {JSON.stringify(activeStep.input, null, 2)}
                      </pre>
                    </div>

                    <div className="flex min-h-0 flex-col rounded-md border border-[#1E2534] bg-[#0B0E14]">
                      <div className="border-b border-[#1E2534] px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-400 uppercase">
                        Output Payload
                      </div>
                      <pre className="flex-1 overflow-auto p-2.5 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                        {activeStep.output
                          ? JSON.stringify(activeStep.output, null, 2)
                          : activeStep.status === 'skipped'
                            ? `// Skipped: ${activeStep.skipReason}`
                            : '// No output produced'}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'dlq' && (
          <div className="h-full overflow-y-auto p-3.5">
            {deadLetters.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                No dead-letter events captured in this run. Toggle &ldquo;Simulate
                Failure&rdquo; on any node to test dead-letter capture.
              </div>
            ) : (
              <div className="space-y-2.5">
                {deadLetters.map((entry, idx) => (
                  <div
                    key={`${entry.nodeId}-${idx}`}
                    className="rounded-md border border-rose-500/35 bg-rose-500/5 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-rose-200">
                        {entry.nodeLabel} ({entry.nodeId})
                      </span>
                      <span className="font-mono text-[10px] text-rose-300">
                        Exhausted after {entry.attempts} attempts · {entry.timestamp}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-rose-300">
                      {entry.error}
                    </p>
                    <pre className="mt-2 max-h-24 overflow-auto rounded bg-[#0B0E14] p-2 font-mono text-[10px] text-slate-300">
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex h-full flex-col p-3">
            {runHistory.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                No execution runs recorded yet.
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    Stored locally in browser storage (latest 25 runs)
                  </span>
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear History
                  </button>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto">
                  {runHistory.map((run) => (
                    <div
                      key={run.runId}
                      className="flex items-center justify-between rounded-md border border-[#1E2534] bg-[#151922] px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                            run.status === 'completed'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {run.status}
                        </span>
                        <div>
                          <div className="text-xs font-medium text-slate-200">
                            {run.workflowName}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {run.runId} · {new Date(run.startedAt).toLocaleTimeString()} ·{' '}
                            {run.totalDurationMs}ms · {run.steps.length} steps
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onReplayRun(run);
                            setActiveTab('trace');
                          }}
                          className="flex items-center gap-1 rounded border border-[#252D3F] bg-[#0B0E14] px-2 py-1 text-[11px] text-cyan-300 hover:border-cyan-500/50"
                        >
                          <Play className="h-3 w-3" />
                          Inspect
                        </button>
                        <button
                          type="button"
                          onClick={() => onExportRun(run)}
                          className="flex items-center gap-1 rounded border border-[#252D3F] bg-[#0B0E14] px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500"
                        >
                          <Download className="h-3 w-3" />
                          JSON
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
