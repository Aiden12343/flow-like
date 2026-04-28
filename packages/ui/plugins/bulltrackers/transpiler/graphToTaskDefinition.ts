/**
 * @fileoverview Graph → TaskDefinition IR Transpiler
 *
 * Converts the visual Flow-Like node graph (nodes + edges + viewport)
 * into the TaskDefinition intermediate representation expected by
 * computation-system-v4's task-builder API routes.
 *
 * The transpiler performs a topological sort of the graph to determine
 * step execution order, resolves data dependencies via edge tracing,
 * and attaches UI metadata for node-level diagnostic mapping.
 */

import { BT_NODE_TYPES, type BtNodeType } from '../nodes';

// ─── Input Types (from Flow-Like graph) ────────────────────────

export interface FlowLikeNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowLikeEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface FlowLikeViewport {
  x: number;
  y: number;
  zoom: number;
}

// ─── Output Types (TaskDefinition IR) ──────────────────────────
// These mirror the DTOs in computation-system-v4/shared/dto/taskBuilder.ts

export interface TaskDefinitionIR {
  meta: {
    taskId?: string;
    taskSlug?: string;
    name: string;
    description?: string;
    ownerCid?: string;
    templateId?: string | null;
    tags?: string[];
    version?: number | null;
  };
  trigger: {
    kind: 'manual' | 'schedule' | 'event';
    config?: Record<string, unknown>;
  };
  inputs: Array<{
    id: string;
    nodeId?: string;
    key: string;
    label: string;
    dataSource: string;
    fields: string[];
    required?: boolean;
  }>;
  steps: Array<{
    id: string;
    nodeId?: string;
    type: string;
    name: string;
    config?: Record<string, unknown>;
    inputs?: Array<{ source: string; field?: string }>;
    outputs?: string[];
  }>;
  outputs: Array<{
    id: string;
    nodeId?: string;
    target: string;
    label?: string;
    schema?: Record<string, unknown>;
  }>;
  schedule?: {
    frequency?: string;
    cron?: string | null;
    time?: string | null;
    timezone?: string | null;
    dayOfWeek?: number | null;
    dayOfMonth?: number | null;
    active?: boolean;
  } | null;
  policies?: {
    verificationMode?: 'strict' | 'standard';
    maxRuntimeSeconds?: number;
    allowNotifications?: boolean;
  } | null;
  ui?: {
    graph?: {
      nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data?: Record<string, unknown> }>;
      edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
      viewport?: { x: number; y: number; zoom: number } | null;
    } | null;
    diagnosticsMap?: Record<string, { nodeId?: string; portId?: string; fieldPath?: string }> | null;
  } | null;
}

export interface TaskBuilderTaskMeta {
  taskId?: string;
  name: string;
  description?: string;
  templateId?: string | null;
  version?: number | null;
  tags?: string[];
}

// ─── Transpiler ────────────────────────────────────────────────

import { catalogItemRegistry } from '../catalog/libraries';

/**
 * Convert a Flow-Like visual graph into a TaskDefinition IR.
 *
 * Steps:
 * 1. Find all trigger nodes → extract trigger kind
 * 2. Find all schedule nodes → build schedule config
 * 3. Find all data input nodes → build inputs[]
 * 4. Topological sort remaining processing nodes → build steps[]
 * 5. Find all output nodes → build outputs[]
 * 6. Attach full UI graph for diagnostic mapping
 */
export function graphToTaskDefinition(
  rawNodes: FlowLikeNode[],
  edges: FlowLikeEdge[],
  viewport: FlowLikeViewport | null,
  taskMeta: TaskBuilderTaskMeta,
): TaskDefinitionIR {
  // Rehydrate nodes from custom catalog items
  const nodes = rawNodes.map((n) => {
    const catalogItem = catalogItemRegistry.get(n.type);
    if (catalogItem && catalogItem.nodeType) {
      return {
        ...n,
        type: catalogItem.nodeType,
        data: { ...catalogItem.defaultConfig, ...n.data },
      };
    }
    return n;
  });

  // ─── 1. Extract trigger ────────────────────────────────────
  const triggerNodes = nodes.filter(n => n.type === BT_NODE_TYPES.TRIGGER);
  const triggerNode = triggerNodes[0];
  const trigger = {
    kind: (triggerNode?.data?.triggerKind as 'manual' | 'schedule' | 'event') || 'manual',
    config: triggerNode?.data?.config as Record<string, unknown> | undefined,
  };

  // ─── 2. Extract schedule ───────────────────────────────────
  const scheduleNodes = nodes.filter(n => n.type === BT_NODE_TYPES.SCHEDULE);
  const scheduleNode = scheduleNodes[0];
  const schedule = scheduleNode
    ? {
        frequency: scheduleNode.data.frequency as string | undefined,
        cron: (scheduleNode.data.cron as string) || null,
        time: (scheduleNode.data.time as string) || null,
        timezone: (scheduleNode.data.timezone as string) || null,
        dayOfWeek: (scheduleNode.data.dayOfWeek as number) ?? null,
        dayOfMonth: (scheduleNode.data.dayOfMonth as number) ?? null,
        active: scheduleNode.data.active !== false,
      }
    : null;

  // ─── 3. Extract data inputs ────────────────────────────────
  const dataInputNodes = nodes.filter(n => n.type === BT_NODE_TYPES.DATA_INPUT);
  const inputs = dataInputNodes.map((node, idx) => ({
    id: `input_${idx}`,
    nodeId: node.id,
    key: (node.data.dataSource as string) || `input_${idx}`,
    label: (node.data.label as string) || (node.data.dataSource as string) || `Input ${idx + 1}`,
    dataSource: (node.data.dataSource as string) || '',
    fields: (node.data.fields as string[]) || [],
    required: node.data.required !== false,
  }));

  // ─── 4. Topological sort processing nodes ──────────────────
  const processingTypes: Set<string> = new Set([
    BT_NODE_TYPES.TRANSFORM,
    BT_NODE_TYPES.CONDITION,
    BT_NODE_TYPES.AGGREGATION,
    BT_NODE_TYPES.LOOP,
    BT_NODE_TYPES.MERGE,
  ]);
  const processingNodes = nodes.filter(n => processingTypes.has(n.type));

  // Build adjacency for topo sort
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of processingNodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);
  const sortedIds: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sortedIds.push(current);
    for (const neighbor of adjacency.get(current) || []) {
      const updated = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, updated);
      if (updated === 0) queue.push(neighbor);
    }
  }

  // Build steps from sorted nodes
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const steps = sortedIds.map((nodeId, idx) => {
    const node = nodeById.get(nodeId)!;
    const incomingEdges = edges.filter(e => e.target === nodeId);
    return {
      id: `step_${idx}`,
      nodeId: node.id,
      type: node.type,
      name: (node.data.label as string) || (node.data.functionName as string) || `Step ${idx + 1}`,
      config: node.data as Record<string, unknown>,
      inputs: incomingEdges.map(e => ({
        source: e.source,
        field: e.sourceHandle || undefined,
      })),
      outputs: edges
        .filter(e => e.source === nodeId)
        .map(e => e.target),
    };
  });

  // ─── 5. Extract outputs ────────────────────────────────────
  const outputNodes = nodes.filter(n => n.type === BT_NODE_TYPES.OUTPUT);
  const outputs = outputNodes.map((node, idx) => ({
    id: `output_${idx}`,
    nodeId: node.id,
    target: (node.data.target as string) || 'bigquery',
    label: (node.data.label as string) || `Output ${idx + 1}`,
    schema: (node.data.schema as Record<string, unknown>) || {},
  }));

  // ─── 6. Build diagnostics map ──────────────────────────────
  const diagnosticsMap: Record<string, { nodeId: string }> = {};
  for (const input of inputs) {
    diagnosticsMap[input.id] = { nodeId: input.nodeId! };
  }
  for (const step of steps) {
    diagnosticsMap[step.id] = { nodeId: step.nodeId! };
  }
  for (const output of outputs) {
    diagnosticsMap[output.id] = { nodeId: output.nodeId! };
  }

  // ─── 7. Assemble TaskDefinition ────────────────────────────
  return {
    meta: {
      taskId: taskMeta.taskId,
      name: taskMeta.name,
      description: taskMeta.description,
      templateId: taskMeta.templateId,
      tags: taskMeta.tags,
      version: taskMeta.version,
    },
    trigger,
    inputs,
    steps,
    outputs,
    schedule,
    policies: {
      verificationMode: 'strict',
      maxRuntimeSeconds: 30,
      allowNotifications: outputs.some(o => o.target === 'notification' || o.target === 'outbox_email'),
    },
    ui: {
      graph: {
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        })),
        viewport,
      },
      diagnosticsMap,
    },
  };
}
