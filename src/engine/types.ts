export type NodeType =
  | 'trigger'
  | 'llm'
  | 'http'
  | 'condition'
  | 'transform'
  | 'action';

export type EdgeCondition = 'always' | 'true' | 'false' | 'error';

export type FailureMode = 'none' | 'fail_once' | 'always_fail';

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'truthy';

export interface WorkflowNodeConfig {
  template?: string;
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  conditionField?: string;
  conditionOperator?: ConditionOperator;
  conditionValue?: string;
  samplePayload?: Record<string, unknown>;
  simulatedOutput?: Record<string, unknown>;
  model?: string;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  subtitle?: string;
  position: { x: number; y: number };
  config: WorkflowNodeConfig;
  retryPolicy: RetryPolicy;
  simulateFailure: boolean;
  failureMode?: FailureMode;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: EdgeCondition;
  label?: string;
}

export interface WorkflowGraph {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type NodeExecutionStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'retrying'
  | 'success'
  | 'error'
  | 'skipped';

export interface NodeExecutionRecord {
  nodeId: string;
  nodeLabel: string;
  nodeType: NodeType;
  status: NodeExecutionStatus;
  attempts: number;
  maxAttempts: number;
  startedAt?: string;
  completedAt?: string;
  durationMs: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  resolvedTemplate?: string;
  error?: string;
  branchResult?: boolean;
  skipReason?: string;
}

export interface DeadLetterEntry {
  nodeId: string;
  nodeLabel: string;
  error: string;
  attempts: number;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface ExecutionRun {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  totalDurationMs: number;
  steps: NodeExecutionRecord[];
  deadLetters: DeadLetterEntry[];
  executionOrder: string[];
}

export interface LLMSettings {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
  stepDelayMs: number;
}
