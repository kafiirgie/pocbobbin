import { Graph, layout } from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { evidenceNodes, type EvidenceNode } from "@/lib/evidence";
import { symbolKey, type ReviewReport, type SymbolRef } from "@/lib/review-report";

// Layout box per node, in React Flow's canvas units (not CSS pixels on the page).
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 96;
/** SVG dash pattern that marks an unknown (unresolved) edge; the legend uses the same value. */
export const UNKNOWN_EDGE_DASH = "6 4";

export type EvidenceFlowNode = Node<{ node: EvidenceNode }, "evidence">;
export type TestsFlowNode = Node<{ targetKey: string; target: SymbolRef; tests: EvidenceNode[] }, "tests">;
export type MapNode = EvidenceFlowNode | TestsFlowNode;
export type CallFlowEdge = Edge<{ tooltip: string; unknown: boolean }, "call">;

export interface EvidenceMapData {
  nodes: MapNode[];
  edges: CallFlowEdge[];
}

const testsId = (targetKey: string) => `tests:${targetKey}`;

function callEdge(source: string, target: string, tooltip: string, unknown = false): CallFlowEdge {
  return {
    id: `${unknown ? "unknown" : "call"}:${source}->${target}`,
    source,
    target,
    type: "call",
    markerEnd: { type: MarkerType.ArrowClosed },
    ariaLabel: tooltip,
    data: { tooltip, unknown },
  };
}

/**
 * Callers → changed symbols, left to right. Test callers of one symbol collapse into a single
 * "N tests call X" node unless that symbol is in `expandedTests`; unknown references stay as edges.
 */
export function buildEvidenceMap(report: ReviewReport, expandedTests: ReadonlySet<string>): EvidenceMapData {
  const all = evidenceNodes(report);
  const edges: CallFlowEdge[] = [];
  const testsByTarget = new Map<string, EvidenceNode[]>();
  const shown = new Set<string>();

  for (const edge of report.impact.edges) {
    const caller = all.get(symbolKey(edge.caller));
    const targetKey = symbolKey(edge.callee);
    if (!caller || !all.has(targetKey)) continue;
    shown.add(targetKey);
    if (caller.isTest && !expandedTests.has(targetKey)) {
      testsByTarget.set(targetKey, [...(testsByTarget.get(targetKey) ?? []), caller]);
      continue;
    }
    shown.add(caller.key);
    edges.push(callEdge(caller.key, targetKey, `${edge.caller.symbol} → ${edge.callee.symbol} · call at ${edge.caller.path}:${edge.line}`));
  }
  for (const [targetKey, tests] of testsByTarget) {
    const target = all.get(targetKey)!.ref;
    edges.push(callEdge(testsId(targetKey), targetKey, `${tests.length} test${tests.length === 1 ? "" : "s"} call ${target.symbol}`));
  }
  report.impact.unknowns.forEach((unknown) => {
    const source = symbolKey({ path: unknown.path, symbol: unknown.symbol });
    unknown.may_reach.filter((target) => all.has(target)).forEach((target) => {
      shown.add(source);
      shown.add(target);
      edges.push(callEdge(source, target, `Unknown edge: ${unknown.reason} · ${unknown.expression} at ${unknown.path}:${unknown.line}`, true));
    });
  });
  all.forEach((node) => node.statuses.includes("changed") && shown.add(node.key));

  const nodes: MapNode[] = [
    ...[...shown].flatMap((key): EvidenceFlowNode[] => {
      const node = all.get(key);
      return node ? [{ id: key, type: "evidence", position: { x: 0, y: 0 }, data: { node } }] : [];
    }),
    ...[...testsByTarget].map(([targetKey, tests]): TestsFlowNode => ({
      id: testsId(targetKey), type: "tests", position: { x: 0, y: 0 },
      data: { targetKey, target: all.get(targetKey)!.ref, tests },
    })),
  ];
  return { nodes: layoutNodes(nodes, edges), edges };
}

function layoutNodes(nodes: MapNode[], edges: CallFlowEdge[]): MapNode[] {
  const graph = new Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 120 });
  graph.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((node) => graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  layout(graph);
  return nodes.map((node) => {
    const { x, y } = graph.node(node.id);
    return { ...node, position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 } };
  });
}
