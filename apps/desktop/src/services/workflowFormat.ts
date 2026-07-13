/** Canvas ↔ compiler JSON mapping (D9). Simple linear agent_task chains only. */

import type { WorkflowDef, WorkflowStep } from '../types';

export interface CompilerNode {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface CompilerEdge {
  id: string;
  source: string;
  target: string;
  data?: { when?: string };
}

export interface CompilerWorkflow {
  id: string;
  name: string;
  version: number;
  nodes: CompilerNode[];
  edges: CompilerEdge[];
  icon?: string;
  description?: string;
}

export type CanvasIncompatibility =
  | { kind: 'multiple_end_nodes'; count: number }
  | { kind: 'unsupported_node_type'; nodeId: string; nodeType: string }
  | { kind: 'conditional_edge'; edgeId: string; source: string; target: string; when: string }
  | { kind: 'invalid_start'; outDegree: number }
  | { kind: 'invalid_end'; nodeId: string; inDegree: number }
  | { kind: 'branching_node'; nodeId: string; outDegree: number }
  | { kind: 'merge_or_cycle'; nodeId: string; inDegree: number }
  | { kind: 'isolated_node'; nodeId: string };

function slugId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `step-${Date.now()}`;
}

/** Collect every reason the canvas editor cannot host this workflow (D9). */
export function getCanvasIncompatibilities(
  workflow: Pick<CompilerWorkflow, 'nodes' | 'edges'>,
): CanvasIncompatibility[] {
  const reasons: CanvasIncompatibility[] = [];
  const endNodes = workflow.nodes.filter((n) => n.type === 'end');
  if (endNodes.length !== 1) {
    reasons.push({ kind: 'multiple_end_nodes', count: endNodes.length });
  }

  for (const node of workflow.nodes) {
    if (node.type !== 'agent_task' && node.type !== 'end') {
      reasons.push({
        kind: 'unsupported_node_type',
        nodeId: node.id,
        nodeType: node.type,
      });
    }
  }

  for (const edge of workflow.edges) {
    if (edge.data?.when) {
      reasons.push({
        kind: 'conditional_edge',
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
        when: String(edge.data.when),
      });
    }
  }

  const outCount: Record<string, number> = {};
  const inCount: Record<string, number> = {};
  for (const edge of workflow.edges) {
    outCount[edge.source] = (outCount[edge.source] ?? 0) + 1;
    inCount[edge.target] = (inCount[edge.target] ?? 0) + 1;
  }

  const startOut = outCount.start ?? 0;
  if (startOut !== 1) {
    reasons.push({ kind: 'invalid_start', outDegree: startOut });
  }

  const agentNodes = workflow.nodes.filter((n) => n.type === 'agent_task');
  if (agentNodes.length === 0 && endNodes.length === 1) {
    const endId = endNodes[0].id;
    const endIn = inCount[endId] ?? 0;
    const hasStartToEnd = workflow.edges.some((e) => e.source === 'start' && e.target === endId);
    if (!(endIn === 1 && hasStartToEnd)) {
      reasons.push({ kind: 'invalid_end', nodeId: endId, inDegree: endIn });
    }
    return reasons;
  }

  for (const node of workflow.nodes) {
    if (node.type === 'end') {
      const endIn = inCount[node.id] ?? 0;
      if (endIn !== 1) {
        reasons.push({ kind: 'invalid_end', nodeId: node.id, inDegree: endIn });
      }
      continue;
    }
    const out = outCount[node.id] ?? 0;
    const inc = inCount[node.id] ?? 0;
    if (out > 1) {
      reasons.push({ kind: 'branching_node', nodeId: node.id, outDegree: out });
    }
    if (inc > 1) {
      reasons.push({ kind: 'merge_or_cycle', nodeId: node.id, inDegree: inc });
    }
    if (out === 0 && inc === 0) {
      reasons.push({ kind: 'isolated_node', nodeId: node.id });
    }
  }

  return reasons;
}

/** Human-readable summary for the JSON-mode banner (#55). */
export function formatCanvasIncompatibilities(reasons: CanvasIncompatibility[]): string {
  return reasons
    .map((r) => {
      switch (r.kind) {
        case 'multiple_end_nodes':
          return `end nodes: ${r.count} (need 1)`;
        case 'unsupported_node_type':
          return `node ${r.nodeId} (${r.nodeType})`;
        case 'conditional_edge':
          return `edge ${r.edgeId} ${r.source}→${r.target} (when:${r.when})`;
        case 'invalid_start':
          return `start out-degree ${r.outDegree} (need 1)`;
        case 'invalid_end':
          return `end ${r.nodeId} in-degree ${r.inDegree} (need 1)`;
        case 'branching_node':
          return `node ${r.nodeId} branches (out:${r.outDegree})`;
        case 'merge_or_cycle':
          return `node ${r.nodeId} merge/cycle (in:${r.inDegree})`;
        case 'isolated_node':
          return `node ${r.nodeId} isolated`;
        default:
          return 'unknown';
      }
    })
    .join('; ');
}

/** True when workflow is a simple linear agent_task pipeline (canvas-safe). */
export function isCanvasCompatible(workflow: Pick<CompilerWorkflow, 'nodes' | 'edges'>): boolean {
  return getCanvasIncompatibilities(workflow).length === 0;
}

export interface PreviewFlowNode {
  id: string;
  type: 'preview';
  position: { x: number; y: number };
  data: { label: string; kind: string; sub: string };
}

export interface PreviewFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  style: Record<string, unknown>;
  labelStyle: Record<string, unknown>;
  markerEnd: { type: string; color: string };
}

/** One-way compiler JSON → React Flow props for the read-only preview of
 * canvas-incompatible workflows (check / human_gate / conditional edges / cycles). */
export function compilerToPreviewFlow(workflow: CompilerWorkflow): {
  nodes: PreviewFlowNode[];
  edges: PreviewFlowEdge[];
} {
  const nodes: PreviewFlowNode[] = workflow.nodes.map((node, idx) => {
    const data = node.data as {
      label?: string;
      agent?: string;
      checks?: Array<{ type?: string; path?: string; command?: unknown }>;
    };
    let sub = '';
    if (node.type === 'agent_task') sub = data.agent ?? '';
    else if (node.type === 'check')
      sub = (data.checks ?? [])
        .map((c) => (c.type === 'file_exists' ? `file: ${c.path ?? ''}` : c.type ?? ''))
        .join(' · ');
    else if (node.type === 'human_gate') sub = 'Approve / Reject';
    return {
      id: node.id,
      type: 'preview',
      position: node.position ?? { x: 120, y: 140 + idx * 130 },
      data: { label: data.label ?? node.id, kind: node.type, sub },
    };
  });
  if (!nodes.some((n) => n.id === 'start')) {
    const firstTarget = workflow.edges.find((e) => e.source === 'start')?.target;
    const anchor = nodes.find((n) => n.id === firstTarget);
    nodes.unshift({
      id: 'start',
      type: 'preview',
      position: anchor
        ? { x: anchor.position.x, y: anchor.position.y - 110 }
        : { x: 120, y: 10 },
      data: { label: 'start', kind: 'start', sub: '' },
    });
  }
  const edges: PreviewFlowEdge[] = workflow.edges.map((edge) => {
    const when = edge.data?.when;
    const isBack = when === 'failed' || when === 'reject';
    const color = isBack ? '#dc2626' : '#64748b';
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: when,
      animated: isBack,
      style: isBack ? { stroke: color, strokeDasharray: '5 3' } : { stroke: color },
      labelStyle: { fill: isBack ? '#dc2626' : '#16a34a', fontWeight: 600 },
      markerEnd: { type: 'arrowclosed', color },
    };
  });
  return { nodes, edges };
}

const BACK_WHENS = new Set(['failed', 'reject']);

/** Agent-altitude preview: only agents + start/end survive as nodes; check and
 * human_gate nodes collapse into the edges that pass through them. */
export function compilerToAgentPreviewFlow(workflow: CompilerWorkflow): {
  nodes: PreviewFlowNode[];
  edges: PreviewFlowEdge[];
} {
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
  const isTerminal = (id: string): boolean =>
    id === 'start' || ['agent_task', 'end'].includes(byId.get(id)?.type ?? '');
  const previewId = (id: string): string => {
    const node = byId.get(id);
    if (node?.type === 'agent_task')
      return `agent:${String((node.data as { agent?: string }).agent || node.id)}`;
    return id;
  };

  const nodes: PreviewFlowNode[] = [];
  const seen = new Set<string>();
  const pushNode = (id: string, kind: string, label: string, sub: string, position: { x: number; y: number }) => {
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({ id, type: 'preview', position, data: { label, kind, sub } });
  };
  pushNode('start', 'start', 'start', '', { x: 120, y: 10 });
  workflow.nodes.forEach((node, idx) => {
    const position = node.position ?? { x: 120, y: 140 + idx * 130 };
    const data = node.data as { label?: string; agent?: string };
    if (node.type === 'agent_task')
      pushNode(previewId(node.id), 'agent_task', String(data.agent || data.label || node.id), data.label ?? '', position);
    else if (node.type === 'end') pushNode(node.id, 'end', data.label ?? 'end', '', position);
  });
  const firstAgent = nodes.find((n) => n.data.kind === 'agent_task');
  if (firstAgent) nodes[0].position = { x: firstAgent.position.x, y: firstAgent.position.y - 110 };

  // Collapse paths through non-terminal nodes; merge parallel edges by direction.
  const merged = new Map<string, { source: string; target: string; segments: string[][]; isBack: boolean }>();
  const sources = ['start', ...workflow.nodes.filter((n) => n.type === 'agent_task').map((n) => n.id)];
  for (const origin of sources) {
    const walk = (current: string, segments: string[], visited: Set<string>) => {
      for (const edge of workflow.edges.filter((e) => e.source === current)) {
        const hop = [...segments];
        const when = edge.data?.when;
        if (when) hop.push(when);
        const target = byId.get(edge.target);
        if (isTerminal(edge.target)) {
          const isBack = hop.some((s) => BACK_WHENS.has(s));
          const source = previewId(origin);
          const to = previewId(edge.target);
          const key = `${source} ${to} ${isBack}`;
          const entry = merged.get(key) ?? { source, target: to, segments: [], isBack };
          entry.segments.push(hop);
          merged.set(key, entry);
        } else if (target && !visited.has(target.id)) {
          const data = target.data as { label?: string };
          const glyph = target.type === 'human_gate' ? '✋' : '✓';
          walk(target.id, [...hop, `${glyph} ${data.label ?? target.id}`], new Set(visited).add(target.id));
        }
      }
    };
    walk(origin, [], new Set());
  }

  const edges: PreviewFlowEdge[] = [...merged.values()].map((entry, idx) => {
    const { source, target } = entry;
    const color = entry.isBack ? '#dc2626' : '#64748b';
    const label = entry.segments
      .map((seg) => seg.join(' · '))
      .filter(Boolean)
      .join(' ／ ');
    return {
      id: `ae${idx}`,
      source,
      target,
      label: label || undefined,
      animated: entry.isBack,
      style: entry.isBack ? { stroke: color, strokeDasharray: '5 3' } : { stroke: color },
      labelStyle: { fill: entry.isBack ? '#dc2626' : '#334155', fontWeight: 600 },
      markerEnd: { type: 'arrowclosed', color },
    };
  });
  return { nodes, edges };
}

export function compilerToCanvas(workflow: CompilerWorkflow, icon = 'account_tree'): WorkflowDef {
  const agentNodes = workflow.nodes.filter((n) => n.type === 'agent_task');

  const steps: WorkflowStep[] = agentNodes.map((node) => {
    const data = node.data as {
      label?: string;
      agent?: string;
      tool?: string;
      instruction?: string;
    };
    const incoming = workflow.edges.filter((e) => e.target === node.id);
    const outgoing = workflow.edges.filter((e) => e.source === node.id);
    return {
      id: node.id,
      name: data.label ?? node.id,
      agent: data.agent ?? '',
      aiTool: data.tool,
      description: data.instruction ?? '',
      nextSteps: outgoing.map((e) => e.target).filter((t) => t !== 'end'),
      position: node.position,
      fromSteps: incoming.map((e) => e.source).filter((s) => s !== 'start'),
    } as WorkflowStep & { fromSteps?: string[] };
  });

  return {
    id: workflow.id,
    name: workflow.name,
    lastDeployed: '—',
    isActive: false,
    icon: workflow.icon ?? icon,
    description: workflow.description ?? '',
    steps,
  };
}

export function canvasToCompiler(
  canvas: WorkflowDef,
  base?: Partial<CompilerWorkflow>,
): CompilerWorkflow {
  const agentNodes: CompilerNode[] = canvas.steps.map((step, idx) => ({
    id: String(step.id),
    type: 'agent_task',
    position: step.position ?? { x: 250, y: idx * 120 + 80 },
    data: {
      label: step.name,
      agent: step.agent,
      ...(step.aiTool ? { tool: step.aiTool } : {}),
      instruction: step.description || step.name,
    },
  }));

  const endNode: CompilerNode = {
    id: 'end',
    type: 'end',
    position: { x: 250, y: canvas.steps.length * 120 + 80 },
    data: { label: 'Finish' },
  };

  const edges: CompilerEdge[] = [];
  let edgeIdx = 1;

  if (canvas.steps.length === 0) {
    edges.push({
      id: `e${edgeIdx++}`,
      source: 'start',
      target: 'end',
    });
  } else {
    edges.push({
      id: `e${edgeIdx++}`,
      source: 'start',
      target: String(canvas.steps[0].id),
    });
  }

  for (const step of canvas.steps) {
    const targets = step.nextSteps?.length
      ? step.nextSteps
      : canvas.steps.findIndex((s) => s.id === step.id) === canvas.steps.length - 1
        ? ['end']
        : [];
    for (const target of targets) {
      edges.push({
        id: `e${edgeIdx++}`,
        source: String(step.id),
        target: target === 'end' ? 'end' : String(target),
      });
    }
  }

  if (!edges.some((e) => e.target === 'end') && canvas.steps.length > 0) {
    const last = canvas.steps[canvas.steps.length - 1];
    edges.push({
      id: `e${edgeIdx++}`,
      source: String(last.id),
      target: 'end',
    });
  }

  const rawId = canvas.id || slugId(canvas.name);
  const id = rawId.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) ? rawId : slugId(canvas.name);

  return {
    id,
    name: canvas.name,
    version: base?.version ?? 1,
    nodes: [...agentNodes, endNode],
    edges,
    icon: canvas.icon,
    description: canvas.description,
  };
}

export function parseCompilerJson(text: string): CompilerWorkflow {
  const parsed = JSON.parse(text) as CompilerWorkflow;
  if (!parsed?.id || !parsed?.nodes || !parsed?.edges) {
    throw new Error('JSON must contain id, nodes, and edges fields');
  }
  return parsed;
}

export function formatCompilerJson(workflow: CompilerWorkflow): string {
  return `${JSON.stringify(workflow, null, 2)}\n`;
}
