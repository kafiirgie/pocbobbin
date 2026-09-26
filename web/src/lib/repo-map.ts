import { MarkerType, type Node } from "@xyflow/react";
import {
  layoutNested, type FolderFlowNode, type PortPlacement, type TooltipFlowEdge,
} from "@/lib/nested-layout";
import { ReportError, type Tier } from "@/lib/review-report";

// Mirrors `RepoMap` in app/repo_map.py (schema "map-0.1").

export interface LastCommit {
  sha: string;
  date: string;
  subject: string;
  pr: number | null;
}

export interface MapModule {
  path: string;
  language: string;
  tier: Tier;
  last_commit: LastCommit | null;
}

export interface RepoMap {
  schema_version: string;
  repo: string;
  sha: string;
  generated_at: string;
  modules: MapModule[];
  edges: { from: string; to: string; kind: string; line: number }[];
  unknowns: { path: string; line: number; expression: string; reason: string }[];
  limits: string[];
}

export function parseRepoMap(value: unknown): RepoMap {
  const map = value as Partial<RepoMap> | null;
  if (!map || typeof map !== "object" || !String(map.schema_version ?? "").startsWith("map-")) {
    throw new ReportError("repo_map.json is not a behavior-review repo map.");
  }
  if (!Array.isArray(map.modules) || !Array.isArray(map.edges)) {
    throw new ReportError("repo_map.json has no modules or edges.");
  }
  return { ...(map as RepoMap), unknowns: map.unknowns ?? [], limits: map.limits ?? [] };
}

// Module box, in React Flow's canvas units.
export const MODULE_WIDTH = 280;
export const MODULE_HEIGHT = 72;

export type ModuleFlowNode = Node<{ module: MapModule; touched: boolean; ports: PortPlacement[] }, "module">;
export type RepoMapNode = ModuleFlowNode | FolderFlowNode;

const moduleId = (path: string) => `module:${path}`;
const dirname = (path: string) => path.split("/").slice(0, -1).join("/");

/** Files as boxes inside nested folder blocks, import edges between them; `touched` = changed in the PR. */
export async function buildRepoMap(
  map: RepoMap,
  changedFiles: ReadonlySet<string>,
): Promise<{ nodes: RepoMapNode[]; edges: TooltipFlowEdge[] }> {
  const known = new Set(map.modules.map((m) => m.path));
  const edges: TooltipFlowEdge[] = map.edges
    .filter((e) => known.has(e.from) && known.has(e.to))
    .map((e) => ({
      id: `import:${e.from}->${e.to}`,
      source: moduleId(e.from),
      target: moduleId(e.to),
      type: "call",
      markerEnd: { type: MarkerType.ArrowClosed },
      ariaLabel: `${e.from} imports ${e.to} at line ${e.line}`,
      data: { tooltip: `${e.from} imports ${e.to} · line ${e.line}` },
    }));
  const layout = await layoutNested(
    map.modules.map((m) => ({ id: moduleId(m.path), width: MODULE_WIDTH, height: MODULE_HEIGHT, folder: dirname(m.path) })),
    edges,
  );
  const folders: FolderFlowNode[] = layout.groups.map((group) => ({
    id: group.id,
    type: "folder",
    position: { x: group.x, y: group.y },
    parentId: group.parentId,
    extent: group.parentId ? "parent" : undefined,
    width: group.width,
    height: group.height,
    selectable: false,
    focusable: false,
    data: { label: group.label, path: group.path },
  }));
  const modules: ModuleFlowNode[] = map.modules.map((module) => {
    const spot = layout.leaves.get(moduleId(module.path))!;
    return {
      id: moduleId(module.path),
      type: "module",
      position: { x: spot.x, y: spot.y },
      parentId: spot.parentId,
      extent: spot.parentId ? "parent" : undefined,
      focusable: false,
      data: { module, touched: changedFiles.has(module.path), ports: spot.ports },
    };
  });
  return { nodes: [...folders, ...modules], edges: edges.map((e) => ({ ...e, ...layout.handles.get(e.id) })) };
}
