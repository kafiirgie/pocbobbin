import { MarkerType, type Node } from "@xyflow/react";
import { evidenceNodes, languageOf, type EvidenceNode } from "@/lib/evidence";
import { layoutNested, type LayoutLeaf, type PortPlacement, type TooltipFlowEdge } from "@/lib/nested-layout";
import { symbolKey, type LanguageSupport, type ReviewReport, type SymbolRef } from "@/lib/review-report";

// Leaf box, in React Flow's canvas units (not CSS pixels on the page).
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 96;

// A type alias (not an interface) so node data satisfies React Flow's Record<string, unknown>.
type Ports = { ports: PortPlacement[] };
export type EvidenceFlowNode = Node<{ node: EvidenceNode } & Ports, "evidence">;
export type TestsFlowNode = Node<{ targetKey: string; target: SymbolRef; tests: EvidenceNode[] } & Ports, "tests">;
export type GroupFlowNode = Node<{ label: string; path: string; support?: LanguageSupport }, "folder" | "file">;
export type MapNode = EvidenceFlowNode | TestsFlowNode | GroupFlowNode;
export type CallFlowEdge = TooltipFlowEdge;

export interface EvidenceMapData {
  nodes: MapNode[];
  edges: CallFlowEdge[];
}

type Leaf = (Omit<EvidenceFlowNode, "position"> | Omit<TestsFlowNode, "position">) & Pick<LayoutLeaf, "file" | "folder">;

const testsId = (targetKey: string) => `tests:${targetKey}`;
const dirname = (path: string) => path.split("/").slice(0, -1).join("/");

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

/** Where a "N tests call X" node sits: in the tests' file, or their shared folder when they span files. */
function testsPlacement(tests: EvidenceNode[]): Pick<LayoutLeaf, "file" | "folder"> {
  const files = [...new Set(tests.map((t) => t.ref.path))];
  if (files.length === 1) return { file: files[0] };
  const parts = files.map((f) => dirname(f).split("/"));
  const common = parts[0].filter((part, i) => parts.every((p) => p[i] === part));
  return { folder: common.join("/") };
}

/**
 * Callers → changed symbols. Test callers of one symbol collapse into a single "N tests call X"
 * node unless that symbol is in `expandedTests`; unknown references stay as (dashed) edges.
 */
function evidenceModel(report: ReviewReport, expandedTests: ReadonlySet<string>): { leaves: Leaf[]; edges: CallFlowEdge[] } {
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

  const leaves: Leaf[] = [
    ...[...shown].flatMap((key): Leaf[] => {
      const node = all.get(key);
      return node ? [{ id: key, type: "evidence", file: node.ref.path, data: { node, ports: [] } }] : [];
    }),
    ...[...testsByTarget].map(([targetKey, tests]): Leaf => ({
      id: testsId(targetKey), type: "tests", ...testsPlacement(tests),
      data: { targetKey, target: all.get(targetKey)!.ref, tests, ports: [] },
    })),
  ];
  return { leaves, edges };
}

export async function buildEvidenceMap(report: ReviewReport, expandedTests: ReadonlySet<string>): Promise<EvidenceMapData> {
  const { leaves, edges } = evidenceModel(report, expandedTests);
  const layout = await layoutNested(
    leaves.map((leaf) => ({ id: leaf.id, width: NODE_WIDTH, height: NODE_HEIGHT, file: leaf.file, folder: leaf.folder })),
    edges,
  );
  const groups: GroupFlowNode[] = layout.groups.map((group) => ({
    id: group.id,
    type: group.kind,
    position: { x: group.x, y: group.y },
    parentId: group.parentId,
    extent: group.parentId ? "parent" : undefined,
    width: group.width,
    height: group.height,
    selectable: false,
    focusable: false,
    data: { label: group.label, path: group.path, support: group.kind === "file" ? languageOf(report, group.path) : undefined },
  }));
  const placed = leaves.map(({ file: _file, folder: _folder, ...leaf }) => {
    const spot = layout.leaves.get(leaf.id)!;
    return {
      ...leaf,
      position: { x: spot.x, y: spot.y },
      parentId: spot.parentId,
      extent: spot.parentId ? ("parent" as const) : undefined,
      focusable: false,
      data: { ...leaf.data, ports: spot.ports },
    } as EvidenceFlowNode | TestsFlowNode;
  });
  return {
    nodes: [...groups, ...placed],
    edges: edges.map((edge) => ({ ...edge, ...layout.handles.get(edge.id) })),
  };
}
