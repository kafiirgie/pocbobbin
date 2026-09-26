import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";

// Folder → (file →) leaf layout with ELK, shared by the evidence map (leaves are functions inside
// file boxes) and the repo map (leaves are the files themselves). Dagre is not used because it
// mis-lays sub-flows whose nodes connect outside their group, which is the cross-folder story here.

export interface LayoutLeaf {
  id: string;
  width: number;
  height: number;
  /** Put the leaf inside this file's box… */
  file?: string;
  /** …or directly inside this folder (e.g. a group spanning several files). */
  folder?: string;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}

export interface PortPlacement {
  id: string;
  side: "left" | "right";
  /** Offset from the leaf's top edge, in canvas units. */
  offset: number;
}

export interface PlacedGroup {
  id: string;
  kind: "folder" | "file";
  path: string;
  label: string;
  parentId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedLeaf {
  id: string;
  parentId?: string;
  x: number;
  y: number;
  ports: PortPlacement[];
}

export interface NestedLayout {
  /** Parents always come before their children, as React Flow sub-flows require. */
  groups: PlacedGroup[];
  leaves: Map<string, PlacedLeaf>;
  handles: Map<string, { sourceHandle: string; targetHandle: string }>;
}

interface FolderTree {
  path: string;
  label: string;
  folders: Map<string, FolderTree>;
  files: Map<string, LayoutLeaf[]>;
  leaves: LayoutLeaf[];
}

const GROUP_PADDING = "[top=40,left=16,bottom=16,right=16]";
const elk = new ELK();

const newFolder = (path: string, label: string): FolderTree => ({ path, label, folders: new Map(), files: new Map(), leaves: [] });

function folderFor(root: FolderTree, dir: string): FolderTree {
  let node = root;
  for (const part of dir.split("/").filter(Boolean)) {
    const path = node.path ? `${node.path}/${part}` : part;
    if (!node.folders.has(part)) node.folders.set(part, newFolder(path, part));
    node = node.folders.get(part)!;
  }
  return node;
}

const dirname = (path: string) => path.split("/").slice(0, -1).join("/");
const basename = (path: string) => path.split("/").pop() ?? path;

function buildTree(leaves: LayoutLeaf[]): FolderTree {
  const root = newFolder("", "");
  for (const leaf of leaves) {
    if (leaf.file) {
      const folder = folderFor(root, dirname(leaf.file));
      folder.files.set(leaf.file, [...(folder.files.get(leaf.file) ?? []), leaf]);
    } else {
      folderFor(root, leaf.folder ?? "").leaves.push(leaf);
    }
  }
  return root;
}

/** A folder holding only one sub-folder reads better as one block: "sample_project/pricing". */
function compress(folder: FolderTree): FolderTree {
  folder.folders.forEach((child, key) => folder.folders.set(key, compress(child)));
  if (folder.path && folder.folders.size === 1 && !folder.files.size && !folder.leaves.length) {
    const [child] = folder.folders.values();
    return { ...child, label: `${folder.label}/${child.label}` };
  }
  return folder;
}

function leafNode(leaf: LayoutLeaf, edges: LayoutEdge[]): ElkNode {
  const ports = [
    ...edges.filter((e) => e.target === leaf.id).map((e) => ({ id: `${e.id}:in`, width: 1, height: 1, layoutOptions: { "elk.port.side": "WEST" } })),
    ...edges.filter((e) => e.source === leaf.id).map((e) => ({ id: `${e.id}:out`, width: 1, height: 1, layoutOptions: { "elk.port.side": "EAST" } })),
  ];
  return { id: leaf.id, width: leaf.width, height: leaf.height, ports, layoutOptions: { "elk.portConstraints": "FIXED_SIDE" } };
}

function folderNode(folder: FolderTree, edges: LayoutEdge[]): ElkNode[] {
  const children = [
    ...[...folder.folders.values()].map((child) => ({
      id: `folder:${child.path}`, layoutOptions: { "elk.padding": GROUP_PADDING }, children: folderNode(child, edges),
    })),
    ...[...folder.files].map(([file, leaves]) => ({
      id: `file:${file}`, layoutOptions: { "elk.padding": GROUP_PADDING }, children: leaves.map((leaf) => leafNode(leaf, edges)),
    })),
    ...folder.leaves.map((leaf) => leafNode(leaf, edges)),
  ];
  return children;
}

function collect(node: ElkNode, labels: Map<string, string>, parentId: string | undefined, out: NestedLayout) {
  for (const child of node.children ?? []) {
    const kind = child.id.startsWith("folder:") ? "folder" : child.id.startsWith("file:") ? "file" : undefined;
    const box = { x: child.x ?? 0, y: child.y ?? 0 };
    if (kind) {
      const path = child.id.slice(kind.length + 1);
      out.groups.push({ id: child.id, kind, path, label: labels.get(child.id) ?? basename(path), parentId, ...box, width: child.width ?? 0, height: child.height ?? 0 });
      collect(child, labels, child.id, out);
    } else {
      const ports = (child.ports ?? []).map((port) => ({
        id: port.id, side: port.id.endsWith(":in") ? "left" as const : "right" as const, offset: (port.y ?? 0) + (port.height ?? 0) / 2,
      }));
      out.leaves.set(child.id, { id: child.id, parentId, ...box, ports });
    }
  }
}

function folderLabels(folder: FolderTree, labels: Map<string, string>) {
  folder.folders.forEach((child) => {
    labels.set(`folder:${child.path}`, child.label);
    folderLabels(child, labels);
  });
  return labels;
}

export async function layoutNested(leaves: LayoutLeaf[], edges: LayoutEdge[]): Promise<NestedLayout> {
  const tree = compress(buildTree(leaves));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
      "elk.spacing.nodeNode": "32",
    },
    children: folderNode(tree, edges),
    edges: edges.map((e): ElkExtendedEdge => ({ id: e.id, sources: [`${e.id}:out`], targets: [`${e.id}:in`] })),
  };
  const result = await elk.layout(graph);
  const layout: NestedLayout = { groups: [], leaves: new Map(), handles: new Map() };
  collect(result, folderLabels(tree, new Map()), undefined, layout);
  edges.forEach((e) => layout.handles.set(e.id, { sourceHandle: `${e.id}:out`, targetHandle: `${e.id}:in` }));
  return layout;
}
