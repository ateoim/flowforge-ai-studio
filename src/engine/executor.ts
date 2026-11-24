import { topologicalSort } from './dag';
import { evaluateCondition, resolveTemplate } from './template';
import type {
  DeadLetterEntry,
  ExecutionRun,
  LLMSettings,
  NodeExecutionRecord,
  NodeExecutionStatus,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from './types';

export interface ExecutionOptions {
  llmSettings?: LLMSettings;
  stepDelayMs?: number;
  /** Scales retry backoff waits (set to 0 in unit tests for instant runs). */
  backoffScale?: number;
  /** Optional override for trigger payload keyed by node ID. */
  triggerPayloads?: Record<string, Record<string, unknown>>;
  onStepUpdate?: (record: NodeExecutionRecord, activeEdgeIds: string[]) => void;
  signal?: AbortSignal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Execution aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Execution aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function generateRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `run_${Date.now().toString(36)}_${rand}`;
}

function getEffectiveFailureMode(node: WorkflowNode): 'none' | 'fail_once' | 'always_fail' {
  if (!node.simulateFailure) return 'none';
  return node.failureMode && node.failureMode !== 'none'
    ? node.failureMode
    : 'always_fail';
}

function isEdgeActive(
  edge: WorkflowEdge,
  sourceRecord: NodeExecutionRecord | undefined,
): boolean {
  if (!sourceRecord) return false;
  const cond = edge.condition ?? 'always';
  if (cond === 'error') {
    return sourceRecord.status === 'error';
  }
  if (sourceRecord.status !== 'success') {
    return false;
  }
  if (cond === 'true') {
    return sourceRecord.branchResult === true;
  }
  if (cond === 'false') {
    return sourceRecord.branchResult === false;
  }
  return true;
}

async function callLiveLLM(
  node: WorkflowNode,
  resolvedPrompt: string,
  settings: LLMSettings,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(settings.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: node.config.model || settings.model || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a workflow automation node. Return a concise valid JSON object matching the task.',
        },
        {
          role: 'user',
          content: resolvedPrompt,
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`LLM API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content ?? '{}';

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      ...parsed,
      _provider: 'live-api',
      _model: node.config.model || settings.model,
      _tokens: data.usage?.total_tokens ?? null,
    };
  } catch {
    return {
      text: content,
      _provider: 'live-api',
      _model: node.config.model || settings.model,
    };
  }
}

async function runNodeHandler(
  node: WorkflowNode,
  context: Record<string, unknown>,
  resolvedTemplate: string,
  attempt: number,
  options: ExecutionOptions,
): Promise<{ output: Record<string, unknown>; branchResult?: boolean }> {
  const failureMode = getEffectiveFailureMode(node);
  if (failureMode === 'always_fail') {
    throw new Error(
      `Simulated fault in "${node.label}" (attempt ${attempt}): upstream service timeout`,
    );
  }
  if (failureMode === 'fail_once' && attempt === 1) {
    throw new Error(
      `Transient fault in "${node.label}" (attempt 1): HTTP 503 Service Unavailable`,
    );
  }

  if (node.type === 'trigger') {
    const override = options.triggerPayloads?.[node.id];
    const base = override ?? node.config.samplePayload ?? { event: 'manual_trigger' };
    return {
      output: {
        ...base,
        receivedAt: new Date().toISOString(),
      },
    };
  }

  if (node.type === 'condition') {
    const evaluation = evaluateCondition(node.config, context);
    return {
      branchResult: evaluation.matched,
      output: {
        matched: evaluation.matched,
        branch: evaluation.matched ? 'true' : 'false',
        evaluatedValue: evaluation.leftValue ?? null,
        expectedValue: evaluation.rightValue,
        operator: evaluation.operator,
        summary: evaluation.summary,
      },
    };
  }

  if (
    node.type === 'llm' &&
    options.llmSettings?.enabled &&
    options.llmSettings.apiKey.trim().length > 0
  ) {
    const liveOutput = await callLiveLLM(
      node,
      resolvedTemplate,
      options.llmSettings,
      options.signal,
    );
    return { output: liveOutput };
  }

  // Deterministic realistic simulation for all node types
  const simulatedBase = node.config.simulatedOutput ?? {};
  const hydrated: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(simulatedBase)) {
    if (typeof val === 'string' && val.includes('{{')) {
      hydrated[key] = resolveTemplate(val, context).resolved;
    } else {
      hydrated[key] = val;
    }
  }

  switch (node.type) {
    case 'llm':
      return {
        output: {
          ...hydrated,
          model: node.config.model ?? 'simulated-reasoning-v1',
          promptPreview: resolvedTemplate.slice(0, 180),
          confidence: hydrated.confidence ?? 0.94,
        },
      };

    case 'http':
      return {
        output: {
          statusCode: 200,
          method: node.config.method ?? 'POST',
          endpoint: resolveTemplate(node.config.endpoint ?? 'https://api.internal/webhook', context)
            .resolved,
          ...hydrated,
        },
      };

    case 'transform':
      return {
        output: {
          transformed: true,
          expressionPreview: resolvedTemplate.slice(0, 160),
          ...hydrated,
        },
      };

    case 'action':
      return {
        output: {
          dispatched: true,
          message: resolvedTemplate || `Action "${node.label}" completed`,
          ...hydrated,
        },
      };
  }
}

/**
 * Executes a WorkflowGraph asynchronously in topological order with conditional branching,
 * retry-with-backoff, failure injection, and dead-letter error capture.
 */
export async function executeWorkflow(
  graph: WorkflowGraph,
  options: ExecutionOptions = {},
): Promise<ExecutionRun> {
  const runId = generateRunId();
  const startedAt = new Date().toISOString();
  const runStartPerf = performance.now();
  const stepDelayMs = options.stepDelayMs ?? options.llmSettings?.stepDelayMs ?? 0;
  const backoffScale = options.backoffScale ?? 1;

  const { order, hasCycle, cycleNodes } = topologicalSort(graph.nodes, graph.edges);
  if (hasCycle) {
    return {
      runId,
      workflowId: graph.id,
      workflowName: graph.name,
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      totalDurationMs: Math.round(performance.now() - runStartPerf),
      steps: [],
      deadLetters: [
        {
          nodeId: cycleNodes[0] ?? 'graph',
          nodeLabel: 'DAG Validation',
          error: `Cannot execute cyclic workflow. Cycle involves: ${cycleNodes.join(', ')}`,
          attempts: 0,
          payload: {},
          timestamp: new Date().toISOString(),
        },
      ],
      executionOrder: [],
    };
  }

  const nodeMap = new Map<string, WorkflowNode>(graph.nodes.map((n) => [n.id, n]));
  const recordMap = new Map<string, NodeExecutionRecord>();
  const context: Record<string, unknown> = {};
  const deadLetters: DeadLetterEntry[] = [];
  const steps: NodeExecutionRecord[] = [];

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)!;
    const incomingEdges = graph.edges.filter((e) => e.target === nodeId);
    const activeIncomingEdges = incomingEdges.filter((e) =>
      isEdgeActive(e, recordMap.get(e.source)),
    );

    // Build structured input payload from upstream outputs
    const nodeInput: Record<string, unknown> = {};
    for (const edge of activeIncomingEdges) {
      const parentOutput = context[edge.source];
      if (parentOutput !== undefined) {
        nodeInput[edge.source] = parentOutput;
      }
    }
    if (node.type === 'trigger') {
      nodeInput.payload = options.triggerPayloads?.[node.id] ?? node.config.samplePayload ?? {};
    }

    // Skip node if it has incoming edges and none of them are active
    if (incomingEdges.length > 0 && activeIncomingEdges.length === 0) {
      const failedParents = incomingEdges.filter(
        (e) => recordMap.get(e.source)?.status === 'error',
      );
      const skipReason =
        failedParents.length > 0
          ? `Upstream node "${nodeMap.get(failedParents[0].source)?.label ?? failedParents[0].source}" failed`
          : 'Conditional branch not taken';

      const skippedRecord: NodeExecutionRecord = {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        status: 'skipped',
        attempts: 0,
        maxAttempts: 1 + Math.max(0, node.retryPolicy.maxRetries),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        input: nodeInput,
        skipReason,
      };
      recordMap.set(node.id, skippedRecord);
      steps.push(skippedRecord);
      options.onStepUpdate?.(skippedRecord, []);
      continue;
    }

    const maxRetries = Math.max(0, node.retryPolicy.maxRetries);
    const maxAttempts = 1 + maxRetries;
    const stepStartPerf = performance.now();
    const stepStartedAt = new Date().toISOString();

    const rawTemplate = node.config.template ?? '';
    const { resolved: resolvedTemplate } = resolveTemplate(rawTemplate, context);

    let lastError: string | undefined;
    let finalStatus: NodeExecutionStatus = 'error';
    let finalOutput: Record<string, unknown> | undefined;
    let branchResult: boolean | undefined;
    let attemptsMade = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsMade = attempt;
      const inProgressRecord: NodeExecutionRecord = {
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        status: attempt === 1 ? 'running' : 'retrying',
        attempts: attempt,
        maxAttempts,
        startedAt: stepStartedAt,
        durationMs: Math.round(performance.now() - stepStartPerf),
        input: nodeInput,
        resolvedTemplate: rawTemplate ? resolvedTemplate : undefined,
        error: lastError,
      };
      options.onStepUpdate?.(
        inProgressRecord,
        activeIncomingEdges.map((e) => e.id),
      );

      if (stepDelayMs > 0) {
        await sleep(stepDelayMs, options.signal);
      }

      try {
        const result = await runNodeHandler(
          node,
          context,
          resolvedTemplate,
          attempt,
          options,
        );
        finalStatus = 'success';
        finalOutput = result.output;
        branchResult = result.branchResult;
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts) {
          const waitMs = Math.round(node.retryPolicy.backoffMs * backoffScale);
          await sleep(waitMs, options.signal);
        }
      }
    }

    const durationMs = Math.max(1, Math.round(performance.now() - stepStartPerf));
    const completedAt = new Date().toISOString();

    const finalRecord: NodeExecutionRecord = {
      nodeId: node.id,
      nodeLabel: node.label,
      nodeType: node.type,
      status: finalStatus,
      attempts: attemptsMade,
      maxAttempts,
      startedAt: stepStartedAt,
      completedAt,
      durationMs,
      input: nodeInput,
      output: finalOutput,
      resolvedTemplate: rawTemplate ? resolvedTemplate : undefined,
      error: lastError,
      branchResult,
    };

    recordMap.set(node.id, finalRecord);
    steps.push(finalRecord);

    if (finalStatus === 'success' && finalOutput) {
      context[node.id] = finalOutput;
    } else if (finalStatus === 'error') {
      deadLetters.push({
        nodeId: node.id,
        nodeLabel: node.label,
        error: lastError ?? 'Unknown node execution error',
        attempts: attemptsMade,
        payload: nodeInput,
        timestamp: completedAt,
      });
    }

    options.onStepUpdate?.(finalRecord, activeIncomingEdges.map((e) => e.id));
  }

  const hasFailures = deadLetters.length > 0;
  return {
    runId,
    workflowId: graph.id,
    workflowName: graph.name,
    status: hasFailures ? 'failed' : 'completed',
    startedAt,
    completedAt: new Date().toISOString(),
    totalDurationMs: Math.max(1, Math.round(performance.now() - runStartPerf)),
    steps,
    deadLetters,
    executionOrder: order,
  };
}
