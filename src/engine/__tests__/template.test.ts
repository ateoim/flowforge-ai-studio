import { describe, expect, it } from 'vitest';
import {
  evaluateCondition,
  extractVariables,
  getPathValue,
  resolveTemplate,
} from '../template';

describe('Template interpolation & condition evaluation (template.ts)', () => {
  const sampleContext = {
    trigger: {
      ticketId: 'SUP-4821',
      customer: {
        email: 'elena@meridianfin.io',
        tier: 'Enterprise',
      },
      tags: ['billing', 'urgent'],
    },
    classifier: {
      priority: 'P1',
      score: 92,
      isCritical: true,
    },
  };

  it('resolves simple and nested dot-path variables', () => {
    const result = resolveTemplate(
      'Ticket {{trigger.ticketId}} from {{trigger.customer.email}} ({{classifier.priority}})',
      sampleContext,
    );
    expect(result.resolved).toBe(
      'Ticket SUP-4821 from elena@meridianfin.io (P1)',
    );
    expect(result.missingVariables).toEqual([]);
  });

  it('resolves array indices inside dot paths', () => {
    expect(getPathValue(sampleContext, 'trigger.tags.0')).toBe('billing');
    expect(getPathValue(sampleContext, 'trigger.tags.1')).toBe('urgent');
    expect(getPathValue(sampleContext, 'trigger.tags.5')).toBeUndefined();
  });

  it('supports fallback defaults with | and ?? operators', () => {
    const result = resolveTemplate(
      'Owner: {{classifier.owner | "unassigned"}}, Region: {{trigger.region ?? "ap-southeast-2"}}',
      sampleContext,
    );
    expect(result.resolved).toBe('Owner: unassigned, Region: ap-southeast-2');
    expect(result.missingVariables).toEqual([]);
  });

  it('blocks prototype pollution paths safely', () => {
    expect(getPathValue(sampleContext, '__proto__.polluted')).toBeUndefined();
    expect(getPathValue(sampleContext, 'trigger.constructor.name')).toBeUndefined();
    expect(getPathValue(sampleContext, 'trigger.prototype')).toBeUndefined();
  });

  it('tracks missing variables without throwing', () => {
    const result = resolveTemplate(
      'Missing {{unknown.field}} and {{trigger.ticketId}}',
      sampleContext,
    );
    expect(result.resolved).toBe('Missing {{unknown.field}} and SUP-4821');
    expect(result.missingVariables).toEqual(['unknown.field']);
  });

  it('extracts unique variable paths from templates', () => {
    const vars = extractVariables(
      '{{trigger.ticketId}} -> {{classifier.priority | "P3"}} ({{trigger.ticketId}})',
    );
    expect(vars).toEqual(['trigger.ticketId', 'classifier.priority']);
  });

  it('evaluates equals, contains, numeric comparisons, and truthy conditions', () => {
    expect(
      evaluateCondition(
        {
          conditionField: 'classifier.priority',
          conditionOperator: 'equals',
          conditionValue: 'p1',
        },
        sampleContext,
      ).matched,
    ).toBe(true);

    expect(
      evaluateCondition(
        {
          conditionField: 'classifier.score',
          conditionOperator: 'gte',
          conditionValue: '80',
        },
        sampleContext,
      ).matched,
    ).toBe(true);

    expect(
      evaluateCondition(
        {
          conditionField: 'trigger.customer.email',
          conditionOperator: 'contains',
          conditionValue: 'meridianfin',
        },
        sampleContext,
      ).matched,
    ).toBe(true);

    expect(
      evaluateCondition(
        {
          conditionField: 'classifier.isCritical',
          conditionOperator: 'truthy',
        },
        sampleContext,
      ).matched,
    ).toBe(true);

    expect(
      evaluateCondition(
        {
          conditionField: 'classifier.score',
          conditionOperator: 'lt',
          conditionValue: '50',
        },
        sampleContext,
      ).matched,
    ).toBe(false);
  });
});
