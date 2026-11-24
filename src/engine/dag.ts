import type { WorkflowEdge, WorkflowNode } from './types';

export interface TopologicalSortResult {
  order: string[];
  hasCycle: boolean;
  cycleNodes: string[];
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  order: string[];
}

/**
 * Computes a deterministic topological ordering of the workflow DAG using Kahn's algorithm.
 * Nodes with equal in-degree are ordered by canvas X coordinate, then Y coordinate, then ID.
 */
export function topologicalSort(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): TopologicalSortResult {
  const nodeMap = new Map<string, WorkflowNode>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      continue;
    }
    adjacency.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const compareNodes = (aId: string, bId: string): number => {
    const a = nodeMap.get(aId)!;
    const b = nodeMap.get(bId)!;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    return a.id.localeCompare(b.id);
  };

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  queue.sort(compareNodes);

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const next of neighbors) {
      const nextDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
        queue.sort(compareNodes);
      }
    }
  }

  const hasCycle = order.length !== nodes.length;
  const visitedSet = new Set(order);
  const cycleNodes = hasCycle
    ? nodes.filter((n) => !visitedSet.has(n.id)).map((n) => n.id)
    : [];

  return { order, hasCycle, cycleNodes };
}

/**
 * Detects whether the given graph contains at least one directed cycle.
 */
export function detectCycle(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): { hasCycle: boolean; cycleNodes: string[] } {
  const { hasCycle, cycleNodes } = topologicalSort(nodes, edges);
  return { hasCycle, cycleNodes };
}

/**
 * Checks whether adding a directed edge (sourceId -> targetId) would introduce a cycle.
 */
export function wouldCreateCycle(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  sourceId: string,
  targetId: string,
): boolean {
  if (sourceId === targetId) return true;
  const candidateEdges: WorkflowEdge[] = [
    ...edges,
    { id: '__candidate__', source: sourceId, target: targetId },
  ];
  return detectCycle(nodes, candidateEdges).hasCycle;
}

/**
 * Returns direct upstream parent node IDs for a given node.
 */
export function getUpstreamNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
  const parents = new Set<string>();
  for (const edge of edges) {
    if (edge.target === nodeId) {
      parents.add(edge.source);
    }
  }
  return Array.from(parents);
}

/**
 * Returns all transitive upstream ancestor node IDs for a given node.
 */
export function getAllUpstreamNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
  const visited = new Set<string>();
  const stack = getUpstreamNodes(nodeId, edges);

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const parent of getUpstreamNodes(current, edges)) {
      if (!visited.has(parent)) {
        stack.push(parent);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Returns direct downstream child node IDs for a given node.
 */
export function getDownstreamNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
  const children = new Set<string>();
  for (const edge of edges) {
    if (edge.source === nodeId) {
      children.add(edge.target);
    }
  }
  return Array.from(children);
}

/**
 * Returns all node IDs reachable from trigger nodes (or zero-indegree root nodes if no trigger exists).
 */
export function getReachableNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Set<string> {
  const triggers = nodes.filter((n) => n.type === 'trigger').map((n) => n.id);
  const inDegree = new Map<string, number>();
  for (const n of nodes) inDegree.set(n.id, 0);
  for (const e of edges) {
    if (inDegree.has(e.target)) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
  }

  const roots =
    triggers.length > 0
      ? triggers
      : nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);

  const reachable = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const child of getDownstreamNodes(current, edges)) {
      if (!reachable.has(child)) {
        queue.push(child);
      }
    }
  }

  return reachable;
}

/**
 * Validates graph acyclicity, root presence, and reachability.
 */
export function validateGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): GraphValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (nodes.length === 0) {
    errors.push('Workflow must contain at least one node.');
    return { valid: false, errors, warnings, order: [] };
  }

  const { order, hasCycle, cycleNodes } = topologicalSort(nodes, edges);
  if (hasCycle) {
    errors.push(`Cycle detected involving nodes: ${cycleNodes.join(', ')}`);
  }

  const triggers = nodes.filter((n) => n.type === 'trigger');
  if (triggers.length === 0) {
    warnings.push('No Trigger node found. Execution will start from zero-indegree nodes.');
  }

  const reachable = getReachableNodes(nodes, edges);
  const unreachable = nodes.filter((n) => !reachable.has(n.id));
  if (unreachable.length > 0) {
    warnings.push(
      `Unreachable nodes from entry trigger: ${unreachable.map((n) => n.label).join(', ')}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    order,
  };
}
