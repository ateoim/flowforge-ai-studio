import { describe, expect, it } from 'vitest';
import {
  detectCycle,
  getAllUpstreamNodes,
  getDownstreamNodes,
  getReachableNodes,
  getUpstreamNodes,
  topologicalSort,
  validateGraph,
  wouldCreateCycle,
} from '../dag';
import type { WorkflowEdge, WorkflowNode } from '../types';

function makeNode(
  id: string,
  x = 0,
  y = 0,
  type: WorkflowNode['type'] = 'transform',
): WorkflowNode {
  return {
    id,
    type,
    label: id,
    position: { x, y },
    config: {},
    retryPolicy: { maxRetries: 0, backoffMs: 100 },
    simulateFailure: false,
  };
}

describe('DAG algorithms (dag.ts)', () => {
  it('sorts a linear pipeline in topological order', () => {
    const nodes = [
      makeNode('c', 600, 0, 'action'),
      makeNode('a', 0, 0, 'trigger'),
      makeNode('b', 300, 0, 'llm'),
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];

    const result = topologicalSort(nodes, edges);
    expect(result.hasCycle).toBe(false);
    expect(result.order).toEqual(['a', 'b', 'c']);
  });

  it('deterministically orders a diamond DAG with tie-breaking by canvas position', () => {
    const nodes = [
      makeNode('start', 0, 100, 'trigger'),
      makeNode('branchB', 300, 200),
      makeNode('branchA', 300, 50),
      makeNode('merge', 600, 100, 'action'),
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'start', target: 'branchA' },
      { id: 'e2', source: 'start', target: 'branchB' },
      { id: 'e3', source: 'branchA', target: 'merge' },
      { id: 'e4', source: 'branchB', target: 'merge' },
    ];

    const result = topologicalSort(nodes, edges);
    expect(result.hasCycle).toBe(false);
    expect(result.order).toEqual(['start', 'branchA', 'branchB', 'merge']);
  });

  it('detects a directed 3-node cycle and identifies involved nodes', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'c', target: 'a' },
    ];

    const result = detectCycle(nodes, edges);
    expect(result.hasCycle).toBe(true);
    expect(result.cycleNodes.sort()).toEqual(['a', 'b', 'c']);
  });

  it('prevents self-loops and back-edges via wouldCreateCycle while allowing valid edges', () => {
    const nodes = [makeNode('a', 0), makeNode('b', 100), makeNode('c', 200)];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];

    expect(wouldCreateCycle(nodes, edges, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(nodes, edges, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(nodes, edges, 'c', 'b')).toBe(true);
    expect(wouldCreateCycle(nodes, edges, 'a', 'c')).toBe(false);
  });

  it('resolves direct and transitive upstream/downstream dependencies', () => {
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 't', target: 'a' },
      { id: 'e2', source: 'a', target: 'b' },
      { id: 'e3', source: 'b', target: 'c' },
      { id: 'e4', source: 'a', target: 'd' },
    ];

    expect(getUpstreamNodes('b', edges)).toEqual(['a']);
    expect(getAllUpstreamNodes('c', edges).sort()).toEqual(['a', 'b', 't']);
    expect(getDownstreamNodes('a', edges).sort()).toEqual(['b', 'd']);
  });

  it('identifies reachable nodes from trigger and flags unreachable nodes in validateGraph', () => {
    const nodes = [
      makeNode('trigger', 0, 0, 'trigger'),
      makeNode('step1', 200, 0, 'llm'),
      makeNode('orphan', 400, 200, 'action'),
    ];
    const edges: WorkflowEdge[] = [{ id: 'e1', source: 'trigger', target: 'step1' }];

    const reachable = getReachableNodes(nodes, edges);
    expect(Array.from(reachable).sort()).toEqual(['step1', 'trigger']);

    const validation = validateGraph(nodes, edges);
    expect(validation.valid).toBe(true);
    expect(validation.warnings.some((w) => w.includes('orphan'))).toBe(true);
  });
});
