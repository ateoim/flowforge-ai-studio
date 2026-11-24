import { useState } from 'react';
import { Flame, Link2, Trash2 } from 'lucide-react';
import { getAllUpstreamNodes } from '../engine/dag';
import type {
  ConditionOperator,
  EdgeCondition,
  FailureMode,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '../engine/types';
import { NODE_TYPE_META } from '../utils/nodeMeta';

interface NodeInspectorProps {
  workflow: WorkflowGraph;
  selectedNode: WorkflowNode | null;
  onUpdateNode: (nodeId: string, updater: (node: WorkflowNode) => WorkflowNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onUpdateEdge: (edgeId: string, condition: EdgeCondition) => void;
  onDeleteEdge: (edgeId: string) => void;
}

const OPERATORS: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'equals', label: 'equals (==)' },
  { value: 'not_equals', label: 'not equals (!=)' },
  { value: 'contains', label: 'contains' },
  { value: 'gte', label: 'greater or equal (>=)' },
  { value: 'gt', label: 'greater than (>)' },
  { value: 'lte', label: 'less or equal (<=)' },
  { value: 'lt', label: 'less than (<)' },
  { value: 'truthy', label: 'is truthy' },
];

export function NodeInspector({
  workflow,
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onUpdateEdge,
  onDeleteEdge,
}: NodeInspectorProps) {
  const [payloadError, setPayloadError] = useState<string | null>(null);

  if (!selectedNode) {
    return (
      <aside className="flex w-84 shrink-0 flex-col border-l border-[#1E2534] bg-[#0F131C] p-4">
        <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Workflow Overview
        </div>
        <h3 className="mt-2 text-sm font-semibold text-slate-100">
          {workflow.name}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
          {workflow.description}
        </p>

        <div className="mt-5 rounded-lg border border-[#1E2534] bg-[#151922] p-3.5 text-xs text-slate-400">
          <div className="font-medium text-slate-200">Inspect & Configure</div>
          <p className="mt-1 leading-relaxed">
            Select any node on the canvas to edit its prompt or expression template
            using <code className="text-cyan-300">{'{{nodeId.field}}'}</code>{' '}
            interpolation, tune retry backoff policies, or toggle{' '}
            <span className="text-rose-300">Simulate Failure</span> to test
            resilience live.
          </p>
        </div>
      </aside>
    );
  }

  const meta = NODE_TYPE_META[selectedNode.type];
  const upstreamIds = getAllUpstreamNodes(selectedNode.id, workflow.edges);
  const outgoingEdges = workflow.edges.filter((e) => e.source === selectedNode.id);

  // Build clickable variable chips from upstream nodes' sample/simulated outputs
  const variableChips: string[] = [];
  for (const upId of upstreamIds) {
    const upNode = workflow.nodes.find((n) => n.id === upId);
    if (!upNode) continue;
    const sampleObj = upNode.config.samplePayload ?? upNode.config.simulatedOutput ?? {};
    for (const key of Object.keys(sampleObj).slice(0, 4)) {
      variableChips.push(`{{${upId}.${key}}}`);
    }
  }

  const insertVariable = (token: string) => {
    onUpdateNode(selectedNode.id, (n) => ({
      ...n,
      config: {
        ...n.config,
        template: `${n.config.template ?? ''}${n.config.template ? ' ' : ''}${token}`,
      },
    }));
  };

  return (
    <aside className="flex w-84 shrink-0 flex-col overflow-y-auto border-l border-[#1E2534] bg-[#0F131C]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1E2534] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${meta.accentBg} ${meta.accentBorder} ${meta.accentText}`}
            >
              {meta.shortLabel}
            </span>
            <span className="font-mono text-xs text-slate-400">
              {selectedNode.id}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDeleteNode(selectedNode.id)}
          title="Delete node"
          className="flex h-7 w-7 items-center justify-center rounded border border-[#252D3F] bg-[#151922] text-slate-400 transition hover:border-rose-500/50 hover:text-rose-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Identity */}
        <div className="space-y-2.5">
          <div>
            <label className="block text-[11px] font-medium text-slate-400">
              Node Label
            </label>
            <input
              type="text"
              value={selectedNode.label}
              onChange={(e) =>
                onUpdateNode(selectedNode.id, (n) => ({
                  ...n,
                  label: e.target.value,
                }))
              }
              className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#151922] px-2.5 text-xs text-slate-100 outline-none focus:border-cyan-500/60"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400">
              Subtitle
            </label>
            <input
              type="text"
              value={selectedNode.subtitle ?? ''}
              onChange={(e) =>
                onUpdateNode(selectedNode.id, (n) => ({
                  ...n,
                  subtitle: e.target.value,
                }))
              }
              className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#151922] px-2.5 text-xs text-slate-300 outline-none focus:border-cyan-500/60"
            />
          </div>
        </div>

        {/* Type-specific Configuration */}
        {selectedNode.type === 'trigger' && (
          <div>
            <label className="block text-[11px] font-medium text-slate-400">
              Sample Trigger Payload (JSON)
            </label>
            <textarea
              rows={6}
              defaultValue={JSON.stringify(
                selectedNode.config.samplePayload ?? {},
                null,
                2,
              )}
              key={selectedNode.id}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value) as Record<string, unknown>;
                  setPayloadError(null);
                  onUpdateNode(selectedNode.id, (n) => ({
                    ...n,
                    config: { ...n.config, samplePayload: parsed },
                  }));
                } catch {
                  setPayloadError('Invalid JSON payload');
                }
              }}
              className="mt-1 w-full rounded-md border border-[#252D3F] bg-[#0B0E14] p-2.5 font-mono text-[11px] text-slate-200 outline-none focus:border-cyan-500/60"
            />
            {payloadError && (
              <p className="mt-1 text-[11px] text-rose-400">{payloadError}</p>
            )}
          </div>
        )}

        {selectedNode.type === 'condition' && (
          <div className="space-y-2.5 rounded-md border border-[#1E2534] bg-[#151922] p-3">
            <div className="text-[11px] font-semibold text-amber-300">
              Branch Condition
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">
                Field Path (e.g. classifier.priority)
              </label>
              <input
                type="text"
                value={selectedNode.config.conditionField ?? ''}
                onChange={(e) =>
                  onUpdateNode(selectedNode.id, (n) => ({
                    ...n,
                    config: { ...n.config, conditionField: e.target.value },
                  }))
                }
                className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#0B0E14] px-2.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500/60"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400">Operator</label>
              <select
                value={selectedNode.config.conditionOperator ?? 'equals'}
                onChange={(e) =>
                  onUpdateNode(selectedNode.id, (n) => ({
                    ...n,
                    config: {
                      ...n.config,
                      conditionOperator: e.target.value as ConditionOperator,
                    },
                  }))
                }
                className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#0B0E14] px-2 text-xs text-slate-100 outline-none focus:border-cyan-500/60"
              >
                {OPERATORS.map((op) => (
                  <option key={op.value} value={op.value} className="bg-[#0B0E14]">
                    {op.label}
                  </option>
                ))}
              </select>
            </div>
            {selectedNode.config.conditionOperator !== 'truthy' && (
              <div>
                <label className="block text-[11px] text-slate-400">
                  Expected Value
                </label>
                <input
                  type="text"
                  value={selectedNode.config.conditionValue ?? ''}
                  onChange={(e) =>
                    onUpdateNode(selectedNode.id, (n) => ({
                      ...n,
                      config: { ...n.config, conditionValue: e.target.value },
                    }))
                  }
                  className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#0B0E14] px-2.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500/60"
                />
              </div>
            )}
          </div>
        )}

        {selectedNode.type === 'http' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400">Method</label>
                <select
                  value={selectedNode.config.method ?? 'POST'}
                  onChange={(e) =>
                    onUpdateNode(selectedNode.id, (n) => ({
                      ...n,
                      config: {
                        ...n.config,
                        method: e.target.value as 'GET' | 'POST' | 'PUT' | 'PATCH',
                      },
                    }))
                  }
                  className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#151922] px-2 font-mono text-xs text-slate-100"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-slate-400">Endpoint</label>
                <input
                  type="text"
                  value={selectedNode.config.endpoint ?? ''}
                  onChange={(e) =>
                    onUpdateNode(selectedNode.id, (n) => ({
                      ...n,
                      config: { ...n.config, endpoint: e.target.value },
                    }))
                  }
                  className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#151922] px-2.5 font-mono text-[11px] text-slate-100 outline-none focus:border-cyan-500/60"
                />
              </div>
            </div>
          </div>
        )}

        {(selectedNode.type === 'llm' ||
          selectedNode.type === 'http' ||
          selectedNode.type === 'transform' ||
          selectedNode.type === 'action') && (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-400">
                {selectedNode.type === 'llm'
                  ? 'Prompt Template'
                  : selectedNode.type === 'http'
                    ? 'Payload Template'
                    : 'Expression / Message Template'}
              </label>
              <span className="font-mono text-[10px] text-cyan-400">
                {'{{node.field}}'}
              </span>
            </div>
            <textarea
              rows={4}
              value={selectedNode.config.template ?? ''}
              onChange={(e) =>
                onUpdateNode(selectedNode.id, (n) => ({
                  ...n,
                  config: { ...n.config, template: e.target.value },
                }))
              }
              className="mt-1 w-full rounded-md border border-[#252D3F] bg-[#0B0E14] p-2.5 font-mono text-[11px] leading-relaxed text-slate-200 outline-none focus:border-cyan-500/60"
            />

            {variableChips.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] text-slate-500">
                  Upstream variables (click to insert)
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {variableChips.slice(0, 8).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => insertVariable(chip)}
                      className="rounded border border-[#252D3F] bg-[#151922] px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 transition hover:border-cyan-500/50 hover:bg-cyan-500/10"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Retry Policy */}
        <div className="rounded-md border border-[#1E2534] bg-[#151922] p-3">
          <div className="text-[11px] font-semibold text-slate-300">
            Retry Policy
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] text-slate-400">
                Max Retries
              </label>
              <input
                type="number"
                min={0}
                max={5}
                value={selectedNode.retryPolicy.maxRetries}
                onChange={(e) =>
                  onUpdateNode(selectedNode.id, (n) => ({
                    ...n,
                    retryPolicy: {
                      ...n.retryPolicy,
                      maxRetries: Math.max(0, Math.min(5, Number(e.target.value) || 0)),
                    },
                  }))
                }
                className="mt-1 h-8 w-full rounded border border-[#252D3F] bg-[#0B0E14] px-2 font-mono text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400">
                Backoff (ms)
              </label>
              <input
                type="number"
                min={50}
                max={3000}
                step={50}
                value={selectedNode.retryPolicy.backoffMs}
                onChange={(e) =>
                  onUpdateNode(selectedNode.id, (n) => ({
                    ...n,
                    retryPolicy: {
                      ...n.retryPolicy,
                      backoffMs: Math.max(50, Math.min(3000, Number(e.target.value) || 200)),
                    },
                  }))
                }
                className="mt-1 h-8 w-full rounded border border-[#252D3F] bg-[#0B0E14] px-2 font-mono text-xs text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Fault Injection */}
        <div className="rounded-md border border-rose-500/25 bg-rose-500/5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-200">
              <Flame className="h-3.5 w-3.5 text-rose-400" />
              Simulate Failure
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={selectedNode.simulateFailure}
              onClick={() =>
                onUpdateNode(selectedNode.id, (n) => ({
                  ...n,
                  simulateFailure: !n.simulateFailure,
                  failureMode: !n.simulateFailure
                    ? n.failureMode && n.failureMode !== 'none'
                      ? n.failureMode
                      : 'fail_once'
                    : 'none',
                }))
              }
              className={`relative h-5 w-9 rounded-full transition ${
                selectedNode.simulateFailure ? 'bg-rose-500' : 'bg-[#252D3F]'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  selectedNode.simulateFailure ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
            Inject a fault into this node to verify retries, backoff timing, and
            dead-letter capture.
          </p>

          {selectedNode.simulateFailure && (
            <div className="mt-2.5">
              <label className="block text-[10px] text-rose-300/90">
                Fault Mode
              </label>
              <select
                value={selectedNode.failureMode ?? 'fail_once'}
                onChange={(e) =>
                  onUpdateNode(selectedNode.id, (n) => ({
                    ...n,
                    failureMode: e.target.value as FailureMode,
                  }))
                }
                className="mt-1 h-8 w-full rounded border border-rose-500/35 bg-[#0B0E14] px-2 text-xs text-rose-100"
              >
                <option value="fail_once">
                  Transient (Fail Attempt 1 → Retry Succeeds)
                </option>
                <option value="always_fail">
                  Persistent (Exhaust Retries → Dead-Letter)
                </option>
              </select>
            </div>
          )}
        </div>

        {/* Outgoing Edges */}
        {outgoingEdges.length > 0 && (
          <div className="rounded-md border border-[#1E2534] bg-[#151922] p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              <Link2 className="h-3.5 w-3.5 text-cyan-400" />
              Outgoing Edges ({outgoingEdges.length})
            </div>
            <div className="mt-2 space-y-2">
              {outgoingEdges.map((edge: WorkflowEdge) => {
                const targetNode = workflow.nodes.find((n) => n.id === edge.target);
                return (
                  <div
                    key={edge.id}
                    className="flex items-center justify-between gap-2 rounded border border-[#1E2534] bg-[#0B0E14] px-2 py-1.5"
                  >
                    <span className="truncate font-mono text-[11px] text-slate-300">
                      → {targetNode?.label ?? edge.target}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={edge.condition ?? 'always'}
                        onChange={(e) =>
                          onUpdateEdge(edge.id, e.target.value as EdgeCondition)
                        }
                        className="h-6 rounded border border-[#252D3F] bg-[#151922] px-1.5 font-mono text-[10px] text-slate-200"
                      >
                        <option value="always">always</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                        <option value="error">error</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => onDeleteEdge(edge.id)}
                        className="text-slate-500 hover:text-rose-400"
                        title="Remove edge"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
