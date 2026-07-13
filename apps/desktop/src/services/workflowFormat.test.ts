import { describe, expect, it } from 'vitest';
import {
  compilerToPreviewFlow,
  formatCanvasIncompatibilities,
  getCanvasIncompatibilities,
  isCanvasCompatible,
} from '../services/workflowFormat';

describe('workflowFormat', () => {
  it('marks linear workflows as canvas compatible', () => {
    const workflow = {
      nodes: [
        { id: 'n1', type: 'agent_task' },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'n1' },
        { id: 'e2', source: 'n1', target: 'end' },
      ],
    };
    expect(isCanvasCompatible(workflow)).toBe(true);
    expect(getCanvasIncompatibilities(workflow)).toEqual([]);
  });

  it('marks empty start-to-end workflows as canvas compatible', () => {
    const workflow = {
      nodes: [{ id: 'end', type: 'end' }],
      edges: [{ id: 'e1', source: 'start', target: 'end' }],
    };
    expect(isCanvasCompatible(workflow)).toBe(true);
  });

  it('lists human_gate and conditional edges as canvas incompatibilities (#55)', () => {
    const workflow = {
      nodes: [
        { id: 'builder', type: 'agent_task' },
        { id: 'review-gate', type: 'human_gate' },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'builder' },
        { id: 'e2', source: 'builder', target: 'review-gate' },
        { id: 'e4', source: 'review-gate', target: 'end', data: { when: 'approve' } },
        { id: 'e5', source: 'review-gate', target: 'builder', data: { when: 'reject' } },
      ],
    };
    const reasons = getCanvasIncompatibilities(workflow);
    expect(isCanvasCompatible(workflow)).toBe(false);
    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'unsupported_node_type',
          nodeId: 'review-gate',
          nodeType: 'human_gate',
        }),
        expect.objectContaining({
          kind: 'conditional_edge',
          edgeId: 'e5',
          when: 'reject',
        }),
        expect.objectContaining({
          kind: 'branching_node',
          nodeId: 'review-gate',
        }),
      ]),
    );
    const summary = formatCanvasIncompatibilities(reasons);
    expect(summary).toContain('review-gate');
    expect(summary).toContain('human_gate');
    expect(summary).toContain('e5');
  });

  it('lists check nodes as unsupported for canvas', () => {
    const workflow = {
      nodes: [
        { id: 'n1', type: 'agent_task' },
        { id: 'verify', type: 'check' },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'n1' },
        { id: 'e2', source: 'n1', target: 'verify' },
        { id: 'e3', source: 'verify', target: 'end', data: { when: 'passed' } },
      ],
    };
    const reasons = getCanvasIncompatibilities(workflow);
    expect(reasons.some((r) => r.kind === 'unsupported_node_type' && r.nodeId === 'verify')).toBe(
      true,
    );
  });

  it('builds a read-only preview flow with synthetic start and styled back edges', () => {
    const workflow = {
      id: 'wf',
      name: 'wf',
      version: 1,
      nodes: [
        { id: 'ba', type: 'agent_task', position: { x: 100, y: 120 }, data: { label: 'BA', agent: 'BA' } },
        { id: 'gate', type: 'check', data: { label: 'Gate', checks: [{ type: 'file_exists', path: 'a.md' }] } },
        { id: 'review', type: 'human_gate', data: { label: 'Review' } },
        { id: 'end', type: 'end', data: { label: 'Done' } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'ba' },
        { id: 'e2', source: 'ba', target: 'gate' },
        { id: 'e3', source: 'gate', target: 'review', data: { when: 'passed' } },
        { id: 'e4', source: 'gate', target: 'ba', data: { when: 'failed' } },
        { id: 'e5', source: 'review', target: 'end', data: { when: 'approve' } },
      ],
    };
    const { nodes, edges } = compilerToPreviewFlow(workflow);
    expect(nodes.map((n) => n.id)).toEqual(['start', 'ba', 'gate', 'review', 'end']);
    expect(nodes[0].position.y).toBeLessThan(nodes[1].position.y);
    expect(nodes.find((n) => n.id === 'gate')?.data.sub).toContain('a.md');
    const back = edges.find((e) => e.id === 'e4');
    expect(back?.label).toBe('failed');
    expect(back?.style.strokeDasharray).toBe('5 3');
    expect(edges.find((e) => e.id === 'e3')?.label).toBe('passed');
  });
});
