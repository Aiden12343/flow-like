"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  Connection,
  Controls,
  Edge,
  IsValidConnection,
  MiniMap,
  Node,
  OnConnect,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";

type GraphNodeType = "trigger" | "input" | "transform" | "condition" | "aggregation" | "output";

type TaskBuilderNodeData = {
  label: string;
  subtitle: string;
  kind: GraphNodeType;
  dataType: string;
  config?: Record<string, unknown>;
};

type HostTheme = {
  accent?: {
    buttonPrimary?: string;
    brandText?: string;
  };
  text?: {
    strong?: string;
    body?: string;
  };
} | null;

type TaskDefinition = {
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
    kind: "manual" | "schedule" | "event";
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
    frequency?: "hourly" | "daily" | "weekly" | "monthly" | "event-driven";
    cron?: string | null;
    time?: string | null;
    timezone?: string | null;
    active?: boolean;
  } | null;
  policies?: {
    verificationMode?: "strict" | "standard";
    maxRuntimeSeconds?: number;
    allowNotifications?: boolean;
  } | null;
  ui?: {
    graph?: {
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data?: Record<string, unknown>;
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        sourceHandle?: string;
        targetHandle?: string;
        data?: Record<string, unknown>;
      }>;
      viewport?: { x: number; y: number; zoom: number } | null;
    } | null;
  } | null;
};

type TaskListItem = {
  taskId: string;
  taskSlug: string;
  name: string;
  description?: string;
  templateId?: string | null;
  latestVersion?: number;
  latestHash?: string | null;
  lastVerifiedAt?: string | null;
  lastDeployedAt?: string | null;
  lastRunId?: string | null;
  draftDefinition?: TaskDefinition;
};

type RunRecord = {
  runId: string;
  taskId: string;
  status: string;
  queuedAt: string;
  completedAt: string | null;
  logs: Array<{ timestamp: string; stream: string; message: string }>;
  stageUpdates: Array<{ id: string; status: string; message: string; timestamp: string }>;
  nodeExecutionMap: Array<{ nodeId: string; stepId?: string; status: string; message: string }>;
};

type ValidateResponse = {
  valid: boolean;
  normalizedTaskId: string;
  normalizedTaskSlug: string;
  diagnostics: Array<{ severity: string; message: string; source?: string; code?: string }>;
  generatedSource: string | null;
  contentHash: string | null;
  stageUpdates: Array<{ id: string; status: string; message: string; timestamp: string }>;
};

type VerifyResponse = ValidateResponse & {
  verified: boolean;
  verifiedAt: string | null;
  verifiedHash: string | null;
};

type DeployResponse = {
  deploymentId: string;
  taskId: string;
  version: number;
  contentHash: string;
  deployedAt: string;
  status: string;
  verifiedAt: string | null;
};

const INITIAL_NODES: Node<TaskBuilderNodeData>[] = [
  {
    id: "trigger-1",
    type: "default",
    position: { x: 40, y: 120 },
    data: {
      label: "Schedule Trigger",
      subtitle: "Daily 02:00 UTC",
      kind: "trigger",
      dataType: "trigger",
      config: { kind: "schedule", cron: "0 2 * * *", frequency: "daily", time: "02:00", timezone: "UTC" },
    },
  },
  {
    id: "input-1",
    type: "default",
    position: { x: 290, y: 120 },
    data: {
      label: "Portfolio Snapshots",
      subtitle: "positions, invested, instrument_id",
      kind: "input",
      dataType: "dataset",
      config: { key: "positions", dataSource: "portfolio_snapshots", fields: ["user_id", "instrument_id", "invested"] },
    },
  },
  {
    id: "transform-1",
    type: "default",
    position: { x: 580, y: 120 },
    data: {
      label: "Score Position Change",
      subtitle: "Transform investment deltas",
      kind: "transform",
      dataType: "records",
      config: { operation: "position-change-score" },
    },
  },
  {
    id: "output-1",
    type: "default",
    position: { x: 880, y: 120 },
    data: {
      label: "Emit Alert Records",
      subtitle: "Persist BigQuery output",
      kind: "output",
      dataType: "result",
      config: { target: "bigquery.alerts" },
    },
  },
];

const INITIAL_EDGES: Edge[] = [
  { id: "edge-trigger-input", source: "trigger-1", target: "input-1" },
  { id: "edge-input-transform", source: "input-1", target: "transform-1" },
  { id: "edge-transform-output", source: "transform-1", target: "output-1" },
];

const TEMPLATES = [
  {
    id: "price-alert",
    name: "Price Alert",
    description: "Monitor a symbol feed and raise a typed threshold alert.",
    nodes: [
      {
        id: "trigger-1",
        type: "default",
        position: { x: 40, y: 120 },
        data: { label: "Market Trigger", subtitle: "Manual or event-driven", kind: "trigger", dataType: "trigger", config: { kind: "event" } },
      },
      {
        id: "input-1",
        type: "default",
        position: { x: 300, y: 120 },
        data: { label: "Price Stream", subtitle: "symbol, price, timestamp", kind: "input", dataType: "dataset", config: { key: "prices", dataSource: "market_prices", fields: ["symbol", "price", "timestamp"] } },
      },
      {
        id: "condition-1",
        type: "default",
        position: { x: 600, y: 120 },
        data: { label: "Threshold Rule", subtitle: "Trigger above target", kind: "condition", dataType: "records", config: { comparator: "gt", value: 100 } },
      },
      {
        id: "output-1",
        type: "default",
        position: { x: 900, y: 120 },
        data: { label: "Alert Sink", subtitle: "Notification payload", kind: "output", dataType: "result", config: { target: "notification.alerts" } },
      },
    ],
    edges: [
      { id: "t1", source: "trigger-1", target: "input-1" },
      { id: "t2", source: "input-1", target: "condition-1" },
      { id: "t3", source: "condition-1", target: "output-1" },
    ] as Edge[],
  },
  {
    id: "scheduled-aggregation",
    name: "Scheduled Aggregation",
    description: "Aggregate investor metrics on a recurring schedule.",
    nodes: INITIAL_NODES,
    edges: INITIAL_EDGES,
  },
];

const NODE_CATALOG: Array<{ kind: GraphNodeType; label: string; subtitle: string; dataType: string; config?: Record<string, unknown> }> = [
  { kind: "trigger", label: "Manual Trigger", subtitle: "User-launched task", dataType: "trigger", config: { kind: "manual" } },
  { kind: "trigger", label: "Schedule Trigger", subtitle: "Daily schedule", dataType: "trigger", config: { kind: "schedule", cron: "0 2 * * *", frequency: "daily", time: "02:00", timezone: "UTC" } },
  { kind: "input", label: "Dataset Input", subtitle: "Bind a typed dataset", dataType: "dataset", config: { key: "positions", dataSource: "portfolio_snapshots", fields: ["user_id", "instrument_id", "invested"] } },
  { kind: "transform", label: "Transform", subtitle: "Compute derived records", dataType: "records", config: { operation: "transform" } },
  { kind: "condition", label: "Condition", subtitle: "Filter by rule", dataType: "records", config: { comparator: "gt", value: 0 } },
  { kind: "aggregation", label: "Aggregation", subtitle: "Collapse to global result", dataType: "records", config: { mode: "global" } },
  { kind: "output", label: "Safe Output", subtitle: "Persist validated output", dataType: "result", config: { target: "bigquery.alerts" } },
];

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task";
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export default function Page() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [taskName, setTaskName] = useState("Bulltrackers Scheduled Aggregation");
  const [taskDescription, setTaskDescription] = useState("Aggregate typed investor metrics and deploy them through computation-system-v4.");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>("scheduled-aggregation");
  const [tenantCid, setTenantCid] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("Bulltrackers user");
  const [token, setToken] = useState<string>("");
  const [apiBase, setApiBase] = useState<string>("");
  const [hostTheme, setHostTheme] = useState<HostTheme>(null);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Ready to validate your task.");
  const [isClientReady, setIsClientReady] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ValidateResponse["diagnostics"]>([]);
  const [stageUpdates, setStageUpdates] = useState<ValidateResponse["stageUpdates"]>([]);
  const [generatedSource, setGeneratedSource] = useState<string>("");
  const [latestHash, setLatestHash] = useState<string>("");
  const [latestDeployment, setLatestDeployment] = useState<DeployResponse | null>(null);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
    setApiBase(params.get("apiBase") || "");
    setTenantCid(params.get("tenantCid") || "");
    setDisplayName(params.get("displayName") || "Bulltrackers user");
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== "bulltrackers-host-context") return;
      const payload = event.data.payload || {};
      setToken(payload.token || "");
      setApiBase(payload.apiBase || "");
      setTenantCid(payload.tenantCid ? String(payload.tenantCid) : "");
      setDisplayName(payload.displayName || "Bulltrackers user");
      setHostTheme(payload.theme || null);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!apiBase || !token) return;
    void refreshTasks();
  }, [apiBase, token]);

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error || response.statusText);
    }
    return (json?.data ?? json) as T;
  }

  async function refreshTasks() {
    const result = await apiFetch<{ tasks: TaskListItem[] }>("/task-builder/tasks");
    setTasks(result.tasks || []);
    if (selectedTaskId) {
      const runResult = await apiFetch<{ runs: RunRecord[] }>(`/task-builder/tasks/${selectedTaskId}/runs`).catch(() => ({ runs: [] }));
      setRuns(runResult.runs || []);
    }
  }

  function buildTaskDefinition(): TaskDefinition {
    const triggerNode = nodes.find((node) => node.data.kind === "trigger");
    const inputNodes = nodes.filter((node) => node.data.kind === "input");
    const stepNodes = nodes.filter((node) => ["transform", "condition", "aggregation"].includes(node.data.kind));
    const outputNodes = nodes.filter((node) => node.data.kind === "output");
    const inputIdByNodeId = new Map(inputNodes.map((node, index) => [node.id, `input_${index + 1}`]));
    const stepIdByNodeId = new Map(stepNodes.map((node, index) => [node.id, `step_${index + 1}`]));

    return {
      meta: {
        taskId: selectedTaskId || `task_${slugify(taskName)}`,
        taskSlug: slugify(taskName),
        name: taskName,
        description: taskDescription,
        ownerCid: tenantCid,
        templateId: selectedTemplateId,
        tags: ["bulltrackers", "flow-like", "task-builder"],
        version: 1,
      },
      trigger: {
        kind: (triggerNode?.data.config?.kind as "manual" | "schedule" | "event") || "manual",
        config: triggerNode?.data.config || {},
      },
      inputs: inputNodes.map((node, index) => ({
        id: inputIdByNodeId.get(node.id) || `input_${index + 1}`,
        nodeId: node.id,
        key: String(node.data.config?.key || `input_${index + 1}`),
        label: node.data.label,
        dataSource: String(node.data.config?.dataSource || "dataset"),
        fields: Array.isArray(node.data.config?.fields) ? (node.data.config?.fields as string[]) : [],
        required: true,
      })),
      steps: stepNodes.map((node, index) => ({
        id: stepIdByNodeId.get(node.id) || `step_${index + 1}`,
        nodeId: node.id,
        type: node.data.kind,
        name: node.data.label,
        config: node.data.config || {},
        inputs: edges
          .filter((edge) => edge.target === node.id)
          .map((edge) => ({ source: inputIdByNodeId.get(edge.source) || stepIdByNodeId.get(edge.source) || edge.source })),
        outputs: edges
          .filter((edge) => edge.source === node.id)
          .map((edge) => stepIdByNodeId.get(edge.target) || edge.target),
      })),
      outputs: outputNodes.map((node, index) => ({
        id: `output_${index + 1}`,
        nodeId: node.id,
        target: String(node.data.config?.target || "bigquery.output"),
        label: node.data.label,
      })),
      schedule: triggerNode?.data.config?.kind === "schedule"
        ? {
            frequency: (triggerNode.data.config?.frequency as "hourly" | "daily" | "weekly" | "monthly" | "event-driven" | undefined) || "daily",
            cron: String(triggerNode.data.config?.cron || "0 2 * * *"),
            time: String(triggerNode.data.config?.time || "02:00"),
            timezone: String(triggerNode.data.config?.timezone || "UTC"),
            active: true,
          }
        : null,
      policies: {
        verificationMode: "strict",
        maxRuntimeSeconds: 30,
        allowNotifications: true,
      },
      ui: {
        graph: {
          nodes: nodes.map((node) => ({ id: node.id, type: String(node.type || "default"), position: node.position, data: node.data })),
          edges: edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? undefined,
            targetHandle: edge.targetHandle ?? undefined,
            data: edge.data,
          })),
          viewport: null,
        },
      },
    };
  }

  async function runAction(action: "validate-ir" | "verify" | "test-runs" | "deploy") {
    try {
      setBusyAction(action);
      setStatusMessage(`Running ${action}...`);
      const payload = {
        taskDefinition: buildTaskDefinition(),
        taskMeta: {
          taskId: selectedTaskId || undefined,
          name: taskName,
          description: taskDescription,
          templateId: selectedTemplateId,
          version: 1,
          tags: ["bulltrackers", "flow-like"],
        },
        uiGraph: {
          nodes: nodes.map((node) => ({ id: node.id, type: String(node.type || "default"), position: node.position, data: node.data })),
          edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
          viewport: null,
        },
      };

      if (action === "test-runs") {
        const response = await apiFetch<RunRecord & { generatedSource?: string; contentHash?: string }>(`/task-builder/${action}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setRuns((current) => [response, ...current.filter((item) => item.runId !== response.runId)]);
        setStageUpdates(response.stageUpdates || []);
        setStatusMessage(`Test run ${response.runId} completed.`);
      } else if (action === "deploy") {
        const response = await apiFetch<DeployResponse>(`/task-builder/${action}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setLatestDeployment(response);
        setStatusMessage(`Deployment ${response.deploymentId} succeeded.`);
      } else {
        const response = await apiFetch<VerifyResponse>(`/task-builder/${action}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setDiagnostics(response.diagnostics || []);
        setStageUpdates(response.stageUpdates || []);
        setGeneratedSource(response.generatedSource || "");
        setLatestHash(response.contentHash || "");
        setSelectedTaskId(response.normalizedTaskId);
        setStatusMessage(action === "verify"
          ? response.verified ? "Verification passed." : "Verification returned diagnostics."
          : response.valid ? "IR validation passed." : "IR validation returned diagnostics.");
      }

      await refreshTasks();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : `Action ${action} failed.`);
    } finally {
      setBusyAction(null);
    }
  }

  const onConnect: OnConnect = (connection) => {
    setEdges((currentEdges) => addEdge({ ...connection, id: `edge_${Date.now()}` }, currentEdges));
  };

  const isValidConnection: IsValidConnection<Edge> = (connection) => {
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (!source || !target) return false;
    if (source.data.kind === "output") return false;
    if (target.data.kind === "trigger") return false;
    if (source.id === target.id) return false;
    return true;
  };

  function addCatalogNode(kind: typeof NODE_CATALOG[number]) {
    const nextId = `${kind.kind}-${Date.now()}`;
    setNodes((current) => [
      ...current,
      {
        id: nextId,
        type: "default",
        position: { x: 120 + current.length * 48, y: 320 + (current.length % 2) * 130 },
        data: {
          label: kind.label,
          subtitle: kind.subtitle,
          kind: kind.kind,
          dataType: kind.dataType,
          config: kind.config || {},
        },
      },
    ]);
  }

  function applyTemplate(templateId: string) {
    const template = TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedTemplateId(template.id);
    setTaskName(template.name);
    setTaskDescription(template.description);
    setNodes(template.nodes as Node<TaskBuilderNodeData>[]);
    setEdges(template.edges);
    setDiagnostics([]);
    setGeneratedSource("");
    setLatestHash("");
    setStatusMessage(`Loaded template '${template.name}'.`);
  }

  async function openTask(taskId: string) {
    const task = await apiFetch<TaskListItem & { draftDefinition?: TaskDefinition }>(`/task-builder/tasks/${taskId}`);
    setSelectedTaskId(task.taskId);
    setTaskName(task.name);
    setTaskDescription(task.description || "");
    setSelectedTemplateId(task.templateId || null);
    if (task.draftDefinition?.ui?.graph?.nodes?.length) {
      setNodes(task.draftDefinition.ui.graph.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: (node.data || {}) as TaskBuilderNodeData,
      })));
      setEdges(task.draftDefinition.ui.graph.edges || []);
    }
    const runResult = await apiFetch<{ runs: RunRecord[] }>(`/task-builder/tasks/${taskId}/runs`).catch(() => ({ runs: [] }));
    setRuns(runResult.runs || []);
    setStatusMessage(`Loaded task '${task.name}'.`);
  }

  const selectedTask = useMemo(
    () => tasks.find((task) => task.taskId === selectedTaskId) || null,
    [selectedTaskId, tasks],
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#18210d_0%,#090b08_55%,#050605_100%)] text-stone-100">
      <div className="mx-auto flex max-w-[1600px] gap-4 px-4 py-4">
        <aside className="w-[300px] rounded-[28px] border border-lime-200/10 bg-black/30 p-4 backdrop-blur">
          <div className="mb-4 rounded-[24px] border border-lime-200/10 bg-lime-200/5 p-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-lime-100/70">Bulltrackers task builder</div>
            <div className="mt-2 text-lg font-semibold">{displayName}</div>
            <div className="mt-1 text-xs text-stone-400">Tenant CID: {tenantCid || "unlinked"}</div>
            <div className={classNames("mt-3 text-xs", hostTheme?.text?.body || "text-stone-400")}>
              Host theme bridge active.
            </div>
          </div>

          <label className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-stone-400">Task name</label>
          <input
            value={taskName}
            onChange={(event) => setTaskName(event.target.value)}
            className="mb-3 w-full rounded-2xl border border-lime-200/10 bg-black/30 px-3 py-2 text-sm outline-none"
          />
          <label className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-stone-400">Description</label>
          <textarea
            value={taskDescription}
            onChange={(event) => setTaskDescription(event.target.value)}
            className="mb-4 min-h-[92px] w-full rounded-2xl border border-lime-200/10 bg-black/30 px-3 py-2 text-sm outline-none"
          />

          <div className="mb-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-stone-400">Templates</div>
            <div className="space-y-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template.id)}
                  className="w-full rounded-2xl border border-lime-200/10 bg-black/25 px-3 py-3 text-left transition hover:border-lime-200/20 hover:bg-lime-200/5"
                >
                  <div className="text-sm font-medium">{template.name}</div>
                  <div className="mt-1 text-xs text-stone-400">{template.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-stone-400">Node catalog</div>
            <div className="grid grid-cols-1 gap-2">
              {NODE_CATALOG.map((entry) => (
                <button
                  key={`${entry.kind}-${entry.label}`}
                  type="button"
                  onClick={() => addCatalogNode(entry)}
                  className="rounded-2xl border border-lime-200/10 bg-black/25 px-3 py-2 text-left transition hover:border-lime-200/20 hover:bg-lime-200/5"
                >
                  <div className="text-sm font-medium">{entry.label}</div>
                  <div className="text-xs text-stone-400">{entry.subtitle}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 rounded-[32px] border border-lime-200/10 bg-black/20 p-4 backdrop-blur">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-lime-100/70">Flow canvas</div>
              <h1 className="mt-2 text-2xl font-semibold">{taskName}</h1>
              <p className="mt-1 text-sm text-stone-400">{statusMessage}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busyAction}
                onClick={() => void runAction("validate-ir")}
                className="rounded-full border border-lime-200/20 bg-transparent px-4 py-2 text-sm text-stone-100 transition hover:bg-lime-200/10 disabled:opacity-50"
              >
                {busyAction === "validate-ir" ? "Validating..." : "Validate IR"}
              </button>
              <button
                type="button"
                disabled={!!busyAction}
                onClick={() => void runAction("verify")}
                className="rounded-full border border-lime-200/20 bg-transparent px-4 py-2 text-sm text-stone-100 transition hover:bg-lime-200/10 disabled:opacity-50"
              >
                {busyAction === "verify" ? "Verifying..." : "Verify"}
              </button>
              <button
                type="button"
                disabled={!!busyAction}
                onClick={() => void runAction("test-runs")}
                className="rounded-full border border-lime-200/20 bg-transparent px-4 py-2 text-sm text-stone-100 transition hover:bg-lime-200/10 disabled:opacity-50"
              >
                {busyAction === "test-runs" ? "Testing..." : "Test run"}
              </button>
              <button
                type="button"
                disabled={!!busyAction}
                onClick={() => void runAction("deploy")}
                className="rounded-full bg-lime-200 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-lime-100 disabled:opacity-50"
              >
                {busyAction === "deploy" ? "Deploying..." : "Deploy"}
              </button>
            </div>
          </div>

          <div className="h-[720px] overflow-hidden rounded-[28px] border border-lime-200/10 bg-[linear-gradient(180deg,rgba(217,249,157,0.02),rgba(0,0,0,0.24))]">
            {isClientReady ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                fitView
              >
                <Background />
                <Controls />
                <MiniMap />
              </ReactFlow>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">
                Preparing graph canvas...
              </div>
            )}
          </div>
        </section>

        <aside className="w-[360px] rounded-[28px] border border-lime-200/10 bg-black/30 p-4 backdrop-blur">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-lime-100/70">Task detail</div>
            <div className="mt-2 rounded-[24px] border border-lime-200/10 bg-black/25 p-4">
              <div className="text-sm font-medium">{selectedTask?.name || taskName}</div>
              <div className="mt-1 text-xs text-stone-400">{selectedTask?.description || taskDescription}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-stone-400">
                <div>
                  <div className="uppercase tracking-[0.18em]">Template</div>
                  <div className="mt-1 text-stone-100">{selectedTemplateId || "Custom"}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.18em]">Latest hash</div>
                  <div className="mt-1 truncate text-stone-100">{latestHash || selectedTask?.latestHash || "Not verified yet"}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.18em]">Last verified</div>
                  <div className="mt-1 text-stone-100">{selectedTask?.lastVerifiedAt || "Pending"}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.18em]">Last deployed</div>
                  <div className="mt-1 text-stone-100">{latestDeployment?.deployedAt || selectedTask?.lastDeployedAt || "Not deployed"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-stone-400">My tasks</div>
            <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
              {tasks.map((task) => (
                <button
                  key={task.taskId}
                  type="button"
                  onClick={() => void openTask(task.taskId)}
                  className={classNames(
                    "w-full rounded-2xl border px-3 py-3 text-left transition",
                    task.taskId === selectedTaskId
                      ? "border-lime-200/25 bg-lime-200/10"
                      : "border-lime-200/10 bg-black/20 hover:border-lime-200/20 hover:bg-lime-200/5",
                  )}
                >
                  <div className="text-sm font-medium">{task.name}</div>
                  <div className="mt-1 text-xs text-stone-400">{task.taskSlug}</div>
                </button>
              ))}
              {!tasks.length ? <div className="rounded-2xl border border-dashed border-lime-200/10 px-3 py-6 text-sm text-stone-400">No tasks saved yet.</div> : null}
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-stone-400">Verification diagnostics</div>
            <div className="max-h-[180px] space-y-2 overflow-auto pr-1">
              {diagnostics.map((item, index) => (
                <div
                  key={`${item.code || item.message}-${index}`}
                  className={classNames(
                    "rounded-2xl border px-3 py-3 text-sm",
                    item.severity === "error"
                      ? "border-rose-300/20 bg-rose-300/10 text-rose-100"
                      : item.severity === "warning"
                        ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                        : "border-lime-200/10 bg-black/20 text-stone-100",
                  )}
                >
                  <div className="font-medium">{item.source || "diagnostic"} {item.code ? `· ${item.code}` : ""}</div>
                  <div className="mt-1 text-xs opacity-90">{item.message}</div>
                </div>
              ))}
              {!diagnostics.length ? <div className="rounded-2xl border border-dashed border-lime-200/10 px-3 py-6 text-sm text-stone-400">No diagnostics yet.</div> : null}
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-stone-400">Execution stages</div>
            <div className="space-y-2">
              {stageUpdates.map((item) => (
                <div key={`${item.id}-${item.timestamp}`} className="rounded-2xl border border-lime-200/10 bg-black/20 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.id}</span>
                    <span className="text-xs uppercase tracking-[0.18em] text-stone-400">{item.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-stone-400">{item.message}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-stone-400">Recent runs</div>
            <div className="max-h-[180px] space-y-2 overflow-auto pr-1">
              {runs.map((run) => (
                <div key={run.runId} className="rounded-2xl border border-lime-200/10 bg-black/20 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{run.runId}</span>
                    <span className="text-xs uppercase tracking-[0.18em] text-stone-400">{run.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-stone-400">{run.completedAt || run.queuedAt}</div>
                  {(run.logs || []).slice(0, 2).map((log, index) => (
                    <div key={`${run.runId}-${index}`} className="mt-2 rounded-xl bg-black/25 px-2 py-2 text-xs text-stone-300">
                      {log.message}
                    </div>
                  ))}
                </div>
              ))}
              {!runs.length ? <div className="rounded-2xl border border-dashed border-lime-200/10 px-3 py-6 text-sm text-stone-400">No runs recorded yet.</div> : null}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-stone-400">Generated source</div>
            <pre className="max-h-[220px] overflow-auto rounded-[24px] border border-lime-200/10 bg-black/25 p-3 text-[11px] leading-6 text-stone-300">
              {generatedSource || "Source will appear after validation or verification."}
            </pre>
          </div>
        </aside>
      </div>
    </main>
  );
}
