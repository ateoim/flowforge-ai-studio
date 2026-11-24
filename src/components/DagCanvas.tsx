import { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Flame,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  SkipForward,
  Trash2,
} from 'lucide-react';
import type {
  EdgeCondition,
  NodeExecutionRecord,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '../engine/types';
import { NODE_TYPE_META } from '../utils/nodeMeta';
import { renderNodeTypeIcon } from './NodePalette';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 114;

interface DagCanvasProps {
  workflow: WorkflowGraph;
  selectedNodeId: string | null;
  stepRecords: Record<string, NodeExecutionRecord>;
  activeEdgeIds: Set<string>;
  onSelectNode: (nodeId: string | null) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectEdge: (sourceId: string, targetId: string, condition: EdgeCondition) => void;
  onDeleteEdge: (edgeId: string) => void;
}

interface ConnectionDraft {
  sourceId: string;
  condition: EdgeCondition;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function getOutputPortPosition(
  node: WorkflowNode,
  condition: EdgeCondition = 'always',
): { x: number; y: number } {
  const x = node.position.x + NODE_WIDTH;
  if (node.type === 'condition') {
    if (condition === 'true') return { x, y: node.position.y + 38 };
    if (condition === 'false') return { x, y: node.position.y + 78 };
  }
  return { x, y: node.position.y + NODE_HEIGHT / 2 };
}

function getInputPortPosition(node: WorkflowNode): { x: number; y: number } {
  return { x: node.position.x, y: node.position.y + NODE_HEIGHT / 2 };
}

function buildCubicPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(64, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function DagCanvas({
  workflow,
  selectedNodeId,
  stepRecords,
  activeEdgeIds,
  onSelectNode,
  onMoveNode,
  onConnectEdge,
  onDeleteEdge,
}: DagCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ x: 36, y: 40, zoom: 0.92 });
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [draftEdge, setDraftEdge] = useState<ConnectionDraft | null>(null);

  const dragNodeRef = useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const panRef = useRef<{
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    onSelectNode(null);
    panRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragNodeRef.current) {
      const { nodeId, startClientX, startClientY, originX, originY } = dragNodeRef.current;
      const dx = (e.clientX - startClientX) / viewport.zoom;
      const dy = (e.clientY - startClientY) / viewport.zoom;
      onMoveNode(nodeId, {
        x: Math.round(originX + dx),
        y: Math.round(originY + dy),
      });
      return;
    }

    if (draftEdge) {
      const world = screenToWorld(e.clientX, e.clientY);
      setDraftEdge((prev) =>
        prev ? { ...prev, currentX: world.x, currentY: world.y } : null,
      );
      return;
    }

    if (panRef.current) {
      const { startClientX, startClientY, originX, originY } = panRef.current;
      setViewport((prev) => ({
        ...prev,
        x: originX + (e.clientX - startClientX),
        y: originY + (e.clientY - startClientY),
      }));
    }
  };

  const handleCanvasPointerUp = () => {
    dragNodeRef.current = null;
    panRef.current = null;
    if (draftEdge) {
      setDraftEdge(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.07 : 0.07;
    setViewport((prev) => ({
      ...prev,
      zoom: Math.min(1.5, Math.max(0.45, Number((prev.zoom + delta).toFixed(2)))),
    }));
  };

  const startNodeDrag = (e: React.PointerEvent, node: WorkflowNode) => {
    e.stopPropagation();
    onSelectNode(node.id);
    dragNodeRef.current = {
      nodeId: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: node.position.x,
      originY: node.position.y,
    };
  };

  const startConnection = (
    e: React.PointerEvent,
    node: WorkflowNode,
    condition: EdgeCondition,
  ) => {
    e.stopPropagation();
    const start = getOutputPortPosition(node, condition);
    setDraftEdge({
      sourceId: node.id,
      condition,
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
    });
  };

  const finishConnectionOnNode = (e: React.PointerEvent, targetNodeId: string) => {
    if (!draftEdge) return;
    e.stopPropagation();
    onConnectEdge(draftEdge.sourceId, targetNodeId, draftEdge.condition);
    setDraftEdge(null);
  };

  const resetView = () => {
    setViewport({ x: 36, y: 40, zoom: 0.92 });
  };

  const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]));

  return (
    <div
      ref={containerRef}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onWheel={handleWheel}
      className="bg-dot-grid relative flex-1 cursor-grab overflow-hidden select-none active:cursor-grabbing"
    >
      {/* Transformed world layer */}
      <div
        className="pointer-events-none absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {/* SVG Edge Layer */}
        <svg
          className="pointer-events-none overflow-visible"
          width="1"
          height="1"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <defs>
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#475569" />
            </marker>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#06B6D4" />
            </marker>
            <marker
              id="arrow-error"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#F43F5E" />
            </marker>
          </defs>

          {workflow.edges.map((edge: WorkflowEdge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;

            const start = getOutputPortPosition(source, edge.condition ?? 'always');
            const end = getInputPortPosition(target);
            const pathD = buildCubicPath(start.x, start.y, end.x, end.y);

            const isActive = activeEdgeIds.has(edge.id);
            const isHovered = hoveredEdgeId === edge.id;
            const isErrorEdge = edge.condition === 'error';

            const strokeColor = isActive
              ? '#06B6D4'
              : isErrorEdge
                ? '#F43F5E'
                : isHovered
                  ? '#94A3B8'
                  : '#334155';

            const marker = isActive
              ? 'url(#arrow-active)'
              : isErrorEdge
                ? 'url(#arrow-error)'
                : 'url(#arrow-default)';

            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;

            return (
              <g
                key={edge.id}
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHoveredEdgeId(edge.id)}
                onMouseLeave={() => setHoveredEdgeId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEdge(edge.id);
                }}
              >
                {/* Invisible wider hit target */}
                <path d={pathD} fill="none" stroke="transparent" strokeWidth={18} />
                {/* Base curve */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isActive ? 2.5 : isHovered ? 2.2 : 1.75}
                  markerEnd={marker}
                  strokeDasharray={isErrorEdge ? '5 4' : undefined}
                />
                {/* Animated cyan flow overlay when active */}
                {isActive && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#22D3EE"
                    strokeWidth={2.5}
                    className="edge-flow-active"
                  />
                )}

                {/* Edge label or hover delete badge */}
                {(edge.label || isHovered || edge.condition === 'true' || edge.condition === 'false' || isErrorEdge) && (
                  <foreignObject
                    x={midX - 44}
                    y={midY - 12}
                    width={88}
                    height={24}
                    className="overflow-visible"
                  >
                    <div className="flex items-center justify-center">
                      {isHovered ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/60 bg-[#0F131C] px-2 py-0.5 text-[10px] font-medium text-rose-300 shadow">
                          <Trash2 className="h-2.5 w-2.5" />
                          Delete
                        </span>
                      ) : (
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${
                            edge.condition === 'true'
                              ? 'border-emerald-500/40 bg-[#0F131C] text-emerald-300'
                              : edge.condition === 'false'
                                ? 'border-amber-500/40 bg-[#0F131C] text-amber-300'
                                : isErrorEdge
                                  ? 'border-rose-500/40 bg-[#0F131C] text-rose-300'
                                  : 'border-[#252D3F] bg-[#0F131C] text-slate-400'
                          }`}
                        >
                          {edge.label || edge.condition?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Draft connection curve while dragging */}
          {draftEdge && (
            <path
              d={buildCubicPath(
                draftEdge.startX,
                draftEdge.startY,
                draftEdge.currentX,
                draftEdge.currentY,
              )}
              fill="none"
              stroke="#06B6D4"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
        </svg>

        {/* HTML Node Cards Layer */}
        {workflow.nodes.map((node) => {
          const meta = NODE_TYPE_META[node.type];
          const record = stepRecords[node.id];
          const isSelected = selectedNodeId === node.id;
          const status = record?.status ?? 'idle';

          const statusBorder =
            status === 'running' || status === 'retrying'
              ? 'border-amber-400/80 node-glow-running'
              : status === 'success'
                ? 'border-emerald-500/70 node-glow-success'
                : status === 'error'
                  ? 'border-rose-500/80 node-glow-error'
                  : status === 'skipped'
                    ? 'border-[#1E2534] opacity-55'
                    : isSelected
                      ? 'border-cyan-400/80 shadow-[0_0_0_1px_rgba(6,182,212,0.45)]'
                      : 'border-[#252D3F] hover:border-slate-500';

          return (
            <div
              key={node.id}
              onPointerDown={(e) => startNodeDrag(e, node)}
              onPointerUp={(e) => finishConnectionOnNode(e, node.id)}
              style={{
                width: NODE_WIDTH,
                minHeight: NODE_HEIGHT,
                transform: `translate(${node.position.x}px, ${node.position.y}px)`,
              }}
              className={`pointer-events-auto absolute top-0 left-0 cursor-pointer rounded-lg border bg-[#151922] transition-shadow ${statusBorder}`}
            >
              {/* Input Port (Left) */}
              {node.type !== 'trigger' && (
                <div
                  onPointerUp={(e) => finishConnectionOnNode(e, node.id)}
                  title="Drop connection here"
                  className="absolute top-1/2 -left-2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-[#334155] bg-[#0B0E14] transition hover:scale-125 hover:border-cyan-400"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                </div>
              )}

              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-[#1E2534] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded border ${meta.accentBg} ${meta.accentBorder} ${meta.accentText}`}
                  >
                    {renderNodeTypeIcon(node.type, 'h-3 w-3')}
                  </span>
                  <span className="font-mono text-[10px] font-semibold tracking-wide text-slate-400">
                    {meta.shortLabel}
                  </span>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-1.5">
                  {node.simulateFailure && (
                    <span
                      title="Failure injection enabled"
                      className="inline-flex items-center gap-0.5 rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9px] font-medium text-rose-300"
                    >
                      <Flame className="h-2.5 w-2.5" />
                      FAULT
                    </span>
                  )}
                  {status === 'running' && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                  )}
                  {status === 'retrying' && (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                  )}
                  {status === 'success' && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  {status === 'error' && (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                  )}
                  {status === 'skipped' && (
                    <SkipForward className="h-3.5 w-3.5 text-slate-500" />
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="px-3 py-2">
                <div className="truncate text-xs font-semibold text-slate-100">
                  {node.label}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-slate-400">
                  {node.subtitle || `id: ${node.id}`}
                </div>

                {/* Telemetry Footer */}
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[#1E2534]/70 pt-2">
                  <span className="truncate font-mono text-[10px] text-slate-500">
                    {`{{${node.id}}}`}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {record && record.attempts > 1 && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                        try {record.attempts}/{record.maxAttempts}
                      </span>
                    )}
                    {record && record.status !== 'idle' && record.status !== 'skipped' && (
                      <span className="rounded bg-[#0B0E14] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                        {record.durationMs}ms
                      </span>
                    )}
                    {record?.status === 'skipped' && (
                      <span className="rounded bg-[#0B0E14] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                        skipped
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Output Ports (Right) */}
              {node.type === 'condition' ? (
                <>
                  <button
                    type="button"
                    onPointerDown={(e) => startConnection(e, node, 'true')}
                    title="Drag from TRUE branch port"
                    style={{ top: 38 }}
                    className="absolute -right-2.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-500/60 bg-[#0B0E14] font-mono text-[9px] font-bold text-emerald-300 transition hover:scale-125 hover:bg-emerald-500/20"
                  >
                    T
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => startConnection(e, node, 'false')}
                    title="Drag from FALSE branch port"
                    style={{ top: 78 }}
                    className="absolute -right-2.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-amber-500/60 bg-[#0B0E14] font-mono text-[9px] font-bold text-amber-300 transition hover:scale-125 hover:bg-amber-500/20"
                  >
                    F
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onPointerDown={(e) => startConnection(e, node, 'always')}
                  title="Drag to connect to another node"
                  className="absolute top-1/2 -right-2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-500/50 bg-[#0B0E14] transition hover:scale-125 hover:border-cyan-300"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom-left Floating Zoom Controls */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border border-[#1E2534] bg-[#0F131C]/95 p-1 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() =>
            setViewport((v) => ({
              ...v,
              zoom: Math.max(0.45, Number((v.zoom - 0.1).toFixed(2))),
            }))
          }
          title="Zoom out"
          className="flex h-7 w-7 items-center justify-center rounded text-slate-300 transition hover:bg-[#1A202C] hover:text-white"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-11 text-center font-mono text-[11px] text-slate-300">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() =>
            setViewport((v) => ({
              ...v,
              zoom: Math.min(1.5, Number((v.zoom + 0.1).toFixed(2))),
            }))
          }
          title="Zoom in"
          className="flex h-7 w-7 items-center justify-center rounded text-slate-300 transition hover:bg-[#1A202C] hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <div className="mx-0.5 h-4 w-px bg-[#1E2534]" />
        <button
          type="button"
          onClick={resetView}
          title="Reset canvas view"
          className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-slate-300 transition hover:bg-[#1A202C] hover:text-white"
        >
          <Maximize2 className="h-3 w-3" />
          Reset
        </button>
      </div>
    </div>
  );
}
