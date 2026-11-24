import type { ConditionOperator, WorkflowNodeConfig } from './types';

export interface TemplateResolutionResult {
  resolved: string;
  missingVariables: string[];
  resolvedVariables: Record<string, unknown>;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MUSTACHE_REGEX = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Safely resolves a dot-delimited path (e.g. "trigger.customer.email" or "items.0.amount")
 * against a nested object context without risking prototype pollution.
 */
export function getPathValue(
  context: Record<string, unknown>,
  path: string,
): unknown {
  const segments = path
    .trim()
    .split('.')
    .filter((segment) => segment.length > 0);

  let current: unknown = context;
  for (const segment of segments) {
    if (FORBIDDEN_KEYS.has(segment)) {
      return undefined;
    }
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const idx = Number(segment);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        return undefined;
      }
      current = current[idx];
    } else if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, segment)) {
        return undefined;
      }
      current = record[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

function stripQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

/**
 * Resolves mustache-style placeholders such as:
 * - `{{trigger.customerEmail}}`
 * - `{{classifier.priority | "P3"}}`
 * - `{{classifier.priority ?? "P3"}}`
 */
export function resolveTemplate(
  template: string,
  context: Record<string, unknown>,
): TemplateResolutionResult {
  const missingVariables: string[] = [];
  const resolvedVariables: Record<string, unknown> = {};

  const resolved = template.replace(MUSTACHE_REGEX, (_match, rawExpr: string) => {
    let pathExpr = rawExpr.trim();
    let fallback: string | undefined;

    const pipeIndex = pathExpr.indexOf('|');
    const nullishIndex = pathExpr.indexOf('??');

    if (nullishIndex !== -1) {
      fallback = stripQuotes(pathExpr.slice(nullishIndex + 2));
      pathExpr = pathExpr.slice(0, nullishIndex).trim();
    } else if (pipeIndex !== -1) {
      fallback = stripQuotes(pathExpr.slice(pipeIndex + 1));
      pathExpr = pathExpr.slice(0, pipeIndex).trim();
    }

    const value = getPathValue(context, pathExpr);
    if (value !== undefined && value !== null && value !== '') {
      resolvedVariables[pathExpr] = value;
      return formatValue(value);
    }

    if (fallback !== undefined) {
      resolvedVariables[pathExpr] = fallback;
      return fallback;
    }

    missingVariables.push(pathExpr);
    return `{{${pathExpr}}}`;
  });

  return { resolved, missingVariables, resolvedVariables };
}

/**
 * Extracts all variable paths referenced inside a mustache template string.
 */
export function extractVariables(template: string): string[] {
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(MUSTACHE_REGEX.source, 'g');

  while ((match = regex.exec(template)) !== null) {
    const expr = match[1].trim();
    const clean = expr.split(/\?\?|\|/)[0].trim();
    if (clean) vars.add(clean);
  }

  return Array.from(vars);
}

export interface ConditionEvaluationResult {
  matched: boolean;
  leftValue: unknown;
  operator: ConditionOperator;
  rightValue: string;
  summary: string;
}

/**
 * Evaluates a Condition / Router node configuration against the current execution context.
 */
export function evaluateCondition(
  config: WorkflowNodeConfig,
  context: Record<string, unknown>,
): ConditionEvaluationResult {
  const fieldExpr = config.conditionField ?? '';
  const operator: ConditionOperator = config.conditionOperator ?? 'equals';
  const rawRight = config.conditionValue ?? '';

  const resolvedRight = resolveTemplate(rawRight, context).resolved;

  let leftValue: unknown;
  if (fieldExpr.includes('{{')) {
    leftValue = resolveTemplate(fieldExpr, context).resolved;
  } else {
    leftValue = getPathValue(context, fieldExpr);
  }

  const leftStr = leftValue === undefined || leftValue === null ? '' : String(leftValue);
  const leftNum = Number(leftValue);
  const rightNum = Number(resolvedRight);

  let matched = false;
  switch (operator) {
    case 'equals':
      matched = leftStr.toLowerCase() === resolvedRight.toLowerCase();
      break;
    case 'not_equals':
      matched = leftStr.toLowerCase() !== resolvedRight.toLowerCase();
      break;
    case 'contains':
      matched = leftStr.toLowerCase().includes(resolvedRight.toLowerCase());
      break;
    case 'gt':
      matched = !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && leftNum > rightNum;
      break;
    case 'gte':
      matched = !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && leftNum >= rightNum;
      break;
    case 'lt':
      matched = !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && leftNum < rightNum;
      break;
    case 'lte':
      matched = !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && leftNum <= rightNum;
      break;
    case 'truthy':
      matched =
        Boolean(leftValue) &&
        leftStr.toLowerCase() !== 'false' &&
        leftStr !== '0';
      break;
  }

  return {
    matched,
    leftValue,
    operator,
    rightValue: resolvedRight,
    summary: `${fieldExpr || 'value'} (${leftStr || 'undefined'}) ${operator} ${resolvedRight || '(truthy)'} => ${matched}`,
  };
}
