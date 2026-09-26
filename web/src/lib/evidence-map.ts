import { Graph, layout } from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { evidenceNodes, type EvidenceNode } from "@/lib/evidence";
import { symbolKey, type ReviewReport } from "@/lib/review-report";

// Layout box per node, in React Flow's canvas units (not CSS pixels on the page).
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 96;
/** SVG dash pattern that marks an unknown (unresolved) edge; the legend uses the same value. */
export const UNKNOWN_EDGE_DASH = "6 4";

export type EvidenceFlowNode = Node<{ node: EvidenceNode; onSelect?: (key: string) => void }, "evidence">;

export interface EvidenceMapData {
  nodes: EvidenceFlowNode[];
  edges: Edge[];
  /** Test callers left out of the map when `showTests` is off; the UI always states this count. */
  hiddenTests: number;
}

/** Callers → changed symbols, left to right; unknown references are dashed and never dropped. */
export function buildEvidenceMap(report: ReviewReport, showTests: boolean): EvidenceMapData {
  const all = evidenceNodes(report);
  const hidden = showTests ? [] : [...all.values()].filter((node) => node.isTest);
  const hiddenKeys = new Set(hidden.map((node) => node.key));
  const evidence = new Map([...all].filter(([key]) => !hiddenKeys.has(key)));
  const edges: Edge[] = report.impact.edges
    .filter((edge) => evidence.has(symbolKey(edge.caller)) && evidence.has(symbolKey(edge.callee)))
    .map((edge) => ({
      id: `call:${symbolKey(edge.caller)}->${symbolKey(edge.callee)}`,
      source: symbolKey(edge.caller),
      target: symbolKey(edge.callee),
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      ariaLabel: `${edge.caller.symbol} calls ${edge.callee.symbol} at line ${edge.line}`,
    }));
  report.impact.unknowns.forEach((unknown, index) => {
    const source = symbolKey({ path: unknown.path, symbol: unknown.symbol });
    if (!evidence.has(source)) return;
    unknown.may_reach
      .filter((target) => evidence.has(target))
      .forEach((target) =>
        edges.push({
          id: `unknown:${index}:${target}`,
          source,
          target,
          label: "unknown",
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeDasharray: UNKNOWN_EDGE_DASH },
          ariaLabel: `Unknown edge from ${unknown.symbol}: ${unknown.reason}`,
        }),
      );
  });

  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const shown = [...evidence.values()].filter((node) => connected.has(node.key) || node.statuses.includes("changed"));

  const graph = new Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 96 });
  graph.setDefaultEdgeLabel(() => ({}));
  shown.forEach((node) => graph.setNode(node.key, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  layout(graph);

  const nodes: EvidenceFlowNode[] = shown.map((node) => {
    const { x, y } = graph.node(node.key);
    return {
      id: node.key,
      type: "evidence",
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
      data: { node },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      focusable: false,
      draggable: false,
    };
  });
  return { nodes, edges, hiddenTests: hidden.length };
}
