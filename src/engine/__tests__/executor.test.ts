import { describe, expect, it } from 'vitest';
import { executeWorkflow } from '../executor';
import { cloneWorkflowGraph, WORKFLOW_TEMPLATES } from '../templates';
import type { NodeExecutionRecord, WorkflowGraph } from '../types';

describe('Workflow DAG Executor (executor.ts)', () => {
  it('executes Support Triage template and skips untaken false branch', async () => {
    const graph = cloneWorkflowGraph(WORKFLOW_TEMPLATES[0]);
    const run = await executeWorkflow(graph, { stepDelayMs: 0, backoffScale: 0 });

    expect(run.status).toBe('completed');
    expect(run.deadLetters).toHaveLength(0);

    const byId = new Map(run.steps.map((s) => [s.nodeId, s]));
    expect(byId.get('trigger')?.status).toBe('success');
    expect(byId.get('classifier')?.status).toBe('success');
    expect(byId.get('router')?.branchResult).toBe(true);
    expect(byId.get('jira')?.status).toBe('success');
    expect(byId.get('slack')?.status).toBe('success');
    expect(byId.get('draft_reply')?.status).toBe('skipped');
    expect(byId.get('slack')?.resolvedTemplate).toContain('INC-904');
    expect(byId.get('slack')?.resolvedTemplate).toContain('SUP-4821');
  });

  it('takes the false branch and skips downstream nodes of the untaken true branch', async () => {
    const graph = cloneWorkflowGraph(WORKFLOW_TEMPLATES[0]);
    const classifier = graph.nodes.find((n) => n.id === 'classifier')!;
    classifier.config.simulatedOutput = {
      ...classifier.config.simulatedOutput,
      priority: 'P3',
    };

    const run = await executeWorkflow(graph, { stepDelayMs: 0, backoffScale: 0 });
    const byId = new Map(run.steps.map((s) => [s.nodeId, s]));

    expect(run.status).toBe('completed');
    expect(byId.get('router')?.branchResult).toBe(false);
    expect(byId.get('jira')?.status).toBe('skipped');
    expect(byId.get('slack')?.status).toBe('skipped');
    expect(byId.get('draft_reply')?.status).toBe('success');
  });

  it('retries a transient failure and succeeds on attempt 2 (fail_once)', async () => {
    const graph = cloneWorkflowGraph(WORKFLOW_TEMPLATES[0]);
    const jira = graph.nodes.find((n) => n.id === 'jira')!;
    jira.simulateFailure = true;
    jira.failureMode = 'fail_once';
    jira.retryPolicy = { maxRetries: 2, backoffMs: 50 };

    const seenStatuses: string[] = [];
    const run = await executeWorkflow(graph, {
      stepDelayMs: 0,
      backoffScale: 0,
      onStepUpdate: (record: NodeExecutionRecord) => {
        if (record.nodeId === 'jira') {
          seenStatuses.push(`${record.status}:${record.attempts}`);
        }
      },
    });

    const jiraRecord = run.steps.find((s) => s.nodeId === 'jira')!;
    expect(run.status).toBe('completed');
    expect(jiraRecord.status).toBe('success');
    expect(jiraRecord.attempts).toBe(2);
    expect(seenStatuses).toEqual(['running:1', 'retrying:2', 'success:2']);
  });

  it('exhausts retries on persistent failure, captures dead-letter, and skips downstream nodes', async () => {
    const graph = cloneWorkflowGraph(WORKFLOW_TEMPLATES[0]);
    const jira = graph.nodes.find((n) => n.id === 'jira')!;
    jira.simulateFailure = true;
    jira.failureMode = 'always_fail';
    jira.retryPolicy = { maxRetries: 2, backoffMs: 50 };

    const run = await executeWorkflow(graph, { stepDelayMs: 0, backoffScale: 0 });
    const byId = new Map(run.steps.map((s) => [s.nodeId, s]));

    expect(run.status).toBe('failed');
    expect(byId.get('jira')?.status).toBe('error');
    expect(byId.get('jira')?.attempts).toBe(3);
    expect(byId.get('slack')?.status).toBe('skipped');
    expect(run.deadLetters).toHaveLength(1);
    expect(run.deadLetters[0].nodeId).toBe('jira');
    expect(run.deadLetters[0].attempts).toBe(3);
  });

  it('routes failed nodes along explicit error edges for dead-letter recovery', async () => {
    const graph: WorkflowGraph = {
      id: 'error-route-test',
      name: 'Error Route Test',
      description: 'Verifies explicit error edge activation',
      category: 'Test',
      nodes: [
        {
          id: 't1',
          type: 'trigger',
          label: 'Trigger',
          position: { x: 0, y: 0 },
          config: { samplePayload: { orderId: 'ORD-77' } },
          retryPolicy: { maxRetries: 0, backoffMs: 10 },
          simulateFailure: false,
        },
        {
          id: 'api',
          type: 'http',
          label: 'Flaky API',
          position: { x: 200, y: 0 },
          config: { endpoint: 'https://api.example.com/orders' },
          retryPolicy: { maxRetries: 1, backoffMs: 10 },
          simulateFailure: true,
          failureMode: 'always_fail',
        },
        {
          id: 'dlq',
          type: 'action',
          label: 'Dead Letter Alert',
          position: { x: 400, y: 100 },
          config: { template: 'Captured failure for {{t1.orderId}}' },
          retryPolicy: { maxRetries: 0, backoffMs: 10 },
          simulateFailure: false,
        },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'api', condition: 'always' },
        { id: 'e2', source: 'api', target: 'dlq', condition: 'error', label: 'On Error' },
      ],
    };

    const run = await executeWorkflow(graph, { stepDelayMs: 0, backoffScale: 0 });
    const byId = new Map(run.steps.map((s) => [s.nodeId, s]));

    expect(byId.get('api')?.status).toBe('error');
    expect(byId.get('dlq')?.status).toBe('success');
    expect(byId.get('dlq')?.resolvedTemplate).toBe('Captured failure for ORD-77');
  });

  it('rejects cyclic graphs cleanly without executing nodes', async () => {
    const cyclic: WorkflowGraph = {
      id: 'cyclic-graph',
      name: 'Cyclic Graph',
      description: 'Invalid cyclic workflow',
      category: 'Test',
      nodes: [
        {
          id: 'a',
          type: 'transform',
          label: 'Node A',
          position: { x: 0, y: 0 },
          config: {},
          retryPolicy: { maxRetries: 0, backoffMs: 10 },
          simulateFailure: false,
        },
        {
          id: 'b',
          type: 'transform',
          label: 'Node B',
          position: { x: 200, y: 0 },
          config: {},
          retryPolicy: { maxRetries: 0, backoffMs: 10 },
          simulateFailure: false,
        },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    };

    const run = await executeWorkflow(cyclic, { stepDelayMs: 0, backoffScale: 0 });
    expect(run.status).toBe('failed');
    expect(run.steps).toHaveLength(0);
    expect(run.deadLetters[0].error).toContain('cyclic');
  });

  it('executes all 4 built-in business templates cleanly with valid telemetry', async () => {
    expect(WORKFLOW_TEMPLATES).toHaveLength(4);

    for (const template of WORKFLOW_TEMPLATES) {
      const run = await executeWorkflow(cloneWorkflowGraph(template), {
        stepDelayMs: 0,
        backoffScale: 0,
      });

      expect(run.status).toBe('completed');
      expect(run.deadLetters).toHaveLength(0);
      expect(run.executionOrder).toHaveLength(template.nodes.length);
      expect(run.steps.some((s) => s.status === 'success')).toBe(true);
      expect(run.steps.some((s) => s.status === 'skipped')).toBe(true);
    }
  });
});
