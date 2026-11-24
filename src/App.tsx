import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { DagCanvas } from './components/DagCanvas';
import { ExecutionDrawer } from './components/ExecutionDrawer';
import { NodeInspector } from './components/NodeInspector';
import { NodePalette } from './components/NodePalette';
import { SettingsModal } from './components/SettingsModal';
import { TopBar } from './components/TopBar';
import { validateGraph, wouldCreateCycle } from './engine/dag';
import { executeWorkflow } from './engine/executor';
import { cloneWorkflowGraph, WORKFLOW_TEMPLATES } from './engine/templates';
import type {
  EdgeCondition,
  ExecutionRun,
  LLMSettings,
  NodeExecutionRecord,
  NodeType,
  WorkflowGraph,
  WorkflowNode,
} from './engine/types';
import { createDefaultNode } from './utils/nodeMeta';
import {
  loadLLMSettings,
  loadRunHistory,
  saveLLMSettings,
  saveRunHistory,
} from './utils/storage';

interface ToastState {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [workflow, setWorkflow] = useState<WorkflowGraph>(() =>
    cloneWorkflowGraph(WORKFLOW_TEMPLATES[0]),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    WORKFLOW_TEMPLATES[0].nodes[1]?.id ?? null,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [stepRecords, setStepRecords] = useState<Record<string, NodeExecutionRecord>>({});
  const [liveSteps, setLiveSteps] = useState<NodeExecutionRecord[]>([]);
  const [activeEdgeIds, setActiveEdgeIds] = useState<Set<string>>(new Set());
  const [currentRun, setCurrentRun] = useState<ExecutionRun | null>(null);
  const [selectedStepNodeId, setSelectedStepNodeId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [llmSettings, setLlmSettings] = useState<LLMSettings>(() => loadLLMSettings());
  const [runHistory, setRunHistory] = useState<ExecutionRun[]>(() => loadRunHistory());
  const [toast, setToast] = useState<ToastState | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((kind: ToastState['kind'], message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ id: Date.now(), kind, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3600);
  }, []);

  const validation = useMemo(
    () => validateGraph(workflow.nodes, workflow.edges),
    [workflow.nodes, workflow.edges],
  );

  const selectedNode = useMemo(
    () => workflow.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [workflow.nodes, selectedNodeId],
  );

  const clearTrace = useCallback(() => {
    setStepRecords({});
    setLiveSteps([]);
    setActiveEdgeIds(new Set());
    setCurrentRun(null);
    setSelectedStepNodeId(null);
  }, []);

  const handleSelectTemplate = (templateId: string) => {
    const found = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!found) return;
    setWorkflow(cloneWorkflowGraph(found));
    setSelectedNodeId(found.nodes[1]?.id ?? found.nodes[0]?.id ?? null);
    clearTrace();
    showToast('info', `Loaded template: ${found.name}`);
  };

  const handleResetTemplate = () => {
    const found =
      WORKFLOW_TEMPLATES.find((t) => t.id === workflow.id) ?? WORKFLOW_TEMPLATES[0];
    setWorkflow(cloneWorkflowGraph(found));
    setSelectedNodeId(found.nodes[0]?.id ?? null);
    clearTrace();
    showToast('info', 'Workflow graph reset to template defaults');
  };

  const handleAddNode = (type: NodeType) => {
    const existingIds = new Set(workflow.nodes.map((n) => n.id));
    const maxX = workflow.nodes.reduce(
      (acc, n) => Math.max(acc, n.position.x),
      40,
    );
    const offsetY = 120 + ((workflow.nodes.length * 48) % 240);
    const nextNode = createDefaultNode(type, existingIds, {
      x: Math.min(maxX + 80, 1280),
      y: offsetY,
    });

    setWorkflow((prev) => ({
      ...prev,
      nodes: [...prev.nodes, nextNode],
    }));
    setSelectedNodeId(nextNode.id);
    showToast('info', `Added ${nextNode.label} (${nextNode.id})`);
  };

  const handleMoveNode = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      setWorkflow((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === nodeId ? { ...n, position } : n,
        ),
      }));
    },
    [],
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, updater: (node: WorkflowNode) => WorkflowNode) => {
      setWorkflow((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? updater(n) : n)),
      }));
    },
    [],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setWorkflow((prev) => ({
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        edges: prev.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId,
        ),
      }));
      setSelectedNodeId((curr) => (curr === nodeId ? null : curr));
      showToast('info', `Removed node "${nodeId}" and connected edges`);
    },
    [showToast],
  );

  const handleConnectEdge = useCallback(
    (sourceId: string, targetId: string, condition: EdgeCondition) => {
      if (sourceId === targetId) {
        showToast('error', 'Self-loops are not allowed in a DAG.');
        return;
      }

      const duplicate = workflow.edges.some(
        (e) =>
          e.source === sourceId &&
          e.target === targetId &&
          (e.condition ?? 'always') === condition,
      );
      if (duplicate) {
        showToast('info', 'Edge already exists between these nodes.');
        return;
      }

      if (wouldCreateCycle(workflow.nodes, workflow.edges, sourceId, targetId)) {
        showToast(
          'error',
          `Cycle rejected: connecting "${sourceId}" → "${targetId}" would introduce a directed cycle.`,
        );
        return;
      }

      const newEdgeId = `e-${sourceId}-${targetId}-${Date.now().toString(36)}`;
      const label =
        condition === 'true'
          ? 'True'
          : condition === 'false'
            ? 'False'
            : condition === 'error'
              ? 'On Error'
              : undefined;

      setWorkflow((prev) => ({
        ...prev,
        edges: [
          ...prev.edges,
          { id: newEdgeId, source: sourceId, target: targetId, condition, label },
        ],
      }));
      showToast('success', `Connected ${sourceId} → ${targetId}`);
    },
    [workflow.edges, workflow.nodes, showToast],
  );

  const handleUpdateEdge = useCallback(
    (edgeId: string, condition: EdgeCondition) => {
      const label =
        condition === 'true'
          ? 'True'
          : condition === 'false'
            ? 'False'
            : condition === 'error'
              ? 'On Error'
              : undefined;

      setWorkflow((prev) => ({
        ...prev,
        edges: prev.edges.map((e) =>
          e.id === edgeId ? { ...e, condition, label } : e,
        ),
      }));
    },
    [],
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setWorkflow((prev) => ({
        ...prev,
        edges: prev.edges.filter((e) => e.id !== edgeId),
      }));
      showToast('info', 'Edge deleted');
    },
    [showToast],
  );

  const handleRunWorkflow = async () => {
    if (!validation.valid) {
      showToast('error', validation.errors[0] || 'Workflow graph is invalid.');
      return;
    }

    clearTrace();
    setDrawerOpen(true);
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const run = await executeWorkflow(workflow, {
        llmSettings,
        stepDelayMs: llmSettings.stepDelayMs,
        signal: controller.signal,
        onStepUpdate: (record, incomingActiveEdges) => {
          setStepRecords((prev) => ({ ...prev, [record.nodeId]: record }));
          setLiveSteps((prev) => {
            const exists = prev.some((s) => s.nodeId === record.nodeId);
            if (exists) {
              return prev.map((s) =>
                s.nodeId === record.nodeId ? record : s,
              );
            }
            return [...prev, record];
          });
          setSelectedStepNodeId(record.nodeId);

          if (incomingActiveEdges.length > 0) {
            setActiveEdgeIds((prev) => {
              const next = new Set(prev);
              for (const edgeId of incomingActiveEdges) next.add(edgeId);
              return next;
            });
          }
        },
      });

      setCurrentRun(run);
      const updatedHistory = [run, ...runHistory].slice(0, 25);
      setRunHistory(updatedHistory);
      saveRunHistory(updatedHistory);

      if (run.status === 'completed') {
        showToast(
          'success',
          `Workflow completed in ${run.totalDurationMs}ms (${run.steps.filter((s) => s.status === 'success').length} executed)`,
        );
      } else {
        showToast(
          'error',
          `Workflow finished with ${run.deadLetters.length} failed node(s). Check Dead-Letter Queue.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Execution interrupted';
      showToast('error', message);
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStopWorkflow = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    showToast('info', 'Workflow execution aborted');
  };

  const handleReplayRun = (run: ExecutionRun) => {
    const recordMap: Record<string, NodeExecutionRecord> = {};
    for (const step of run.steps) {
      recordMap[step.nodeId] = step;
    }
    setCurrentRun(run);
    setLiveSteps(run.steps);
    setStepRecords(recordMap);
    setSelectedStepNodeId(run.steps[0]?.nodeId ?? null);
    setActiveEdgeIds(new Set());
    showToast('info', `Loaded trace for ${run.runId}`);
  };

  const handleSaveSettings = (next: LLMSettings) => {
    setLlmSettings(next);
    saveLLMSettings(next);
    showToast(
      'success',
      next.enabled
        ? `Live LLM enabled (${next.model})`
        : 'Deterministic simulation mode active',
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0B0E14] text-slate-100">
      <TopBar
        templates={WORKFLOW_TEMPLATES}
        activeWorkflow={workflow}
        isRunning={isRunning}
        llmSettings={llmSettings}
        drawerOpen={drawerOpen}
        runHistoryCount={runHistory.length}
        onSelectTemplate={handleSelectTemplate}
        onResetTemplate={handleResetTemplate}
        onRunWorkflow={handleRunWorkflow}
        onStopWorkflow={handleStopWorkflow}
        onResetExecution={clearTrace}
        onExportWorkflow={() => {
          downloadJson(`${workflow.id}-workflow.json`, workflow);
          showToast('info', `Exported ${workflow.id}-workflow.json`);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleDrawer={() => setDrawerOpen((o) => !o)}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <NodePalette
          workflow={workflow}
          validation={validation}
          onAddNode={handleAddNode}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <DagCanvas
            workflow={workflow}
            selectedNodeId={selectedNodeId}
            stepRecords={stepRecords}
            activeEdgeIds={activeEdgeIds}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              if (id && stepRecords[id]) {
                setSelectedStepNodeId(id);
              }
            }}
            onMoveNode={handleMoveNode}
            onConnectEdge={handleConnectEdge}
            onDeleteEdge={handleDeleteEdge}
          />

          <ExecutionDrawer
            isOpen={drawerOpen}
            currentRun={currentRun}
            liveSteps={liveSteps}
            runHistory={runHistory}
            selectedStepNodeId={selectedStepNodeId}
            onSelectStep={(nodeId) => {
              setSelectedStepNodeId(nodeId);
              setSelectedNodeId(nodeId);
            }}
            onReplayRun={handleReplayRun}
            onExportRun={(run) => {
              downloadJson(`${run.runId}.json`, run);
              showToast('info', `Exported ${run.runId}.json`);
            }}
            onClearHistory={() => {
              setRunHistory([]);
              saveRunHistory([]);
              showToast('info', 'Cleared run history');
            }}
            onClose={() => setDrawerOpen(false)}
          />
        </div>

        <NodeInspector
          workflow={workflow}
          selectedNode={selectedNode}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onUpdateEdge={handleUpdateEdge}
          onDeleteEdge={handleDeleteEdge}
        />

        {/* Validation & Status Toast */}
        {toast && (
          <div
            key={toast.id}
            className={`pointer-events-none fixed top-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium shadow-xl backdrop-blur ${
              toast.kind === 'error'
                ? 'border-rose-500/60 bg-[#1B1016]/95 text-rose-200'
                : toast.kind === 'success'
                  ? 'border-emerald-500/50 bg-[#0E1B16]/95 text-emerald-200'
                  : 'border-cyan-500/40 bg-[#0F1722]/95 text-cyan-100'
            }`}
          >
            {toast.kind === 'error' && (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            )}
            {toast.kind === 'success' && (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            )}
            {toast.kind === 'info' && (
              <Info className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            )}
            <span>{toast.message}</span>
          </div>
        )}
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        settings={llmSettings}
        onSave={handleSaveSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
