import type { NodeType, WorkflowNode } from '../engine/types';

export interface NodeTypeMeta {
  type: NodeType;
  label: string;
  shortLabel: string;
  description: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  dotColor: string;
}

export const NODE_TYPE_META: Record<NodeType, NodeTypeMeta> = {
  trigger: {
    type: 'trigger',
    label: 'Trigger',
    shortLabel: 'TRIGGER',
    description: 'Webhook, form, or document entry point',
    accentText: 'text-cyan-300',
    accentBg: 'bg-cyan-500/10',
    accentBorder: 'border-cyan-500/30',
    dotColor: '#06B6D4',
  },
  llm: {
    type: 'llm',
    label: 'AI Classifier / LLM',
    shortLabel: 'LLM',
    description: 'Structured reasoning, extraction, or scoring',
    accentText: 'text-violet-300',
    accentBg: 'bg-violet-500/10',
    accentBorder: 'border-violet-500/30',
    dotColor: '#8B5CF6',
  },
  http: {
    type: 'http',
    label: 'HTTP / Webhook',
    shortLabel: 'HTTP',
    description: 'Outbound REST API call or ERP sync',
    accentText: 'text-sky-300',
    accentBg: 'bg-sky-500/10',
    accentBorder: 'border-sky-500/30',
    dotColor: '#38BDF8',
  },
  condition: {
    type: 'condition',
    label: 'Condition / Router',
    shortLabel: 'ROUTER',
    description: 'Deterministic true / false branch gate',
    accentText: 'text-amber-300',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-500/30',
    dotColor: '#F59E0B',
  },
  transform: {
    type: 'transform',
    label: 'Data Transform',
    shortLabel: 'TRANSFORM',
    description: 'Validation, parsing, and schema mapping',
    accentText: 'text-teal-300',
    accentBg: 'bg-teal-500/10',
    accentBorder: 'border-teal-500/30',
    dotColor: '#14B8A6',
  },
  action: {
    type: 'action',
    label: 'Action / Notify',
    shortLabel: 'ACTION',
    description: 'Slack, Jira, PagerDuty, CRM, or email',
    accentText: 'text-emerald-300',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-500/30',
    dotColor: '#10B981',
  },
};

export const NODE_TYPE_LIST: NodeType[] = [
  'trigger',
  'llm',
  'http',
  'condition',
  'transform',
  'action',
];

export function createDefaultNode(
  type: NodeType,
  existingIds: Set<string>,
  position: { x: number; y: number },
): WorkflowNode {
  let index = 1;
  let id = `${type}_${index}`;
  while (existingIds.has(id)) {
    index += 1;
    id = `${type}_${index}`;
  }

  const base: WorkflowNode = {
    id,
    type,
    label: NODE_TYPE_META[type].label,
    subtitle: NODE_TYPE_META[type].description,
    position,
    retryPolicy: {
      maxRetries: type === 'trigger' || type === 'condition' ? 0 : 2,
      backoffMs: 300,
    },
    simulateFailure: false,
    config: {},
  };

  switch (type) {
    case 'trigger':
      base.config = {
        samplePayload: { eventId: `EVT-${1000 + index}`, source: 'webhook' },
      };
      break;
    case 'llm':
      base.config = {
        model: 'gpt-4o-mini',
        template: 'Analyze upstream payload: {{trigger.eventId | "unknown"}}',
        simulatedOutput: { classification: 'processed', confidence: 0.93 },
      };
      break;
    case 'http':
      base.config = {
        method: 'POST',
        endpoint: 'https://api.internal/v1/dispatch',
        template: '{"eventId":"{{trigger.eventId | "unknown"}}"}',
        simulatedOutput: { statusCode: 200, ok: true },
      };
      break;
    case 'condition':
      base.config = {
        conditionField: 'classifier.priority',
        conditionOperator: 'equals',
        conditionValue: 'P1',
      };
      break;
    case 'transform':
      base.config = {
        template: 'Normalize payload fields for downstream steps',
        simulatedOutput: { normalized: true, valid: true },
      };
      break;
    case 'action':
      base.config = {
        template: 'Notify team: workflow step completed for {{trigger.eventId | "event"}}',
        simulatedOutput: { delivered: true },
      };
      break;
  }

  return base;
}
