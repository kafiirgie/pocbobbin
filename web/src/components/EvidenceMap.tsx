import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, getBezierPath, Handle, MiniMap, Panel, Position,
  ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type EdgeProps, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CircleAlert, FileCode, FlaskConical, Folder, PanelRightOpen, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge, STATUS_META, TONE_CLASSES } from "@/components/StatusBadge";
import { TierBadge } from "@/components/TierBadge";
import { STATUS_PRIORITY } from "@/lib/evidence";
import {
  buildEvidenceMap, UNKNOWN_EDGE_DASH,
  type CallFlowEdge, type EvidenceFlowNode, type GroupFlowNode, type MapNode, type TestsFlowNode,
} from "@/lib/evidence-map";
import type { PortPlacement } from "@/lib/nested-layout";
import type { ReviewReport } from "@/lib/review-report";
import { cn } from "@/lib/utils";

interface EvidenceMapProps {
  report: ReviewReport;
  onSelect: (key: string) => void;
}

const MINIMAP_FROM_NODES = 8;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One handle per ELK port, so each edge enters or leaves at its own point instead of one trunk. */
function PortHandles({ ports }: { ports: PortPlacement[] }) {
  return ports.map((port) => (
    <Handle
      key={port.id}
      id={port.id}
      type={port.side === "left" ? "target" : "source"}
      position={port.side === "left" ? Position.Left : Position.Right}
      className="opacity-0"
      style={{ top: port.offset }}
    />
  ));
}

function EvidenceNodeCard({ data }: NodeProps<EvidenceFlowNode>) {
  const { node } = data;
  const tone = STATUS_META[node.status].tone;
  const others = node.statuses.filter((status) => status !== node.status);
  const label = `${node.ref.symbol} in ${node.ref.path}: ${node.statuses.map((s) => STATUS_META[s].label).join(", ")}`;
  return (
    <Card className={cn("h-24 w-60 gap-1 border-2 p-2 shadow-sm", TONE_CLASSES[tone])}>
      <PortHandles ports={data.ports} />
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-foreground">{node.ref.symbol}</span>
        <Button variant="ghost" size="icon-xs" className="nodrag" aria-label={`${label}. Open details`}>
          <PanelRightOpen aria-hidden="true" />
        </Button>
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {node.ref.path}{node.line ? `:${node.line}` : ""}{node.isTest ? " · test" : ""}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <StatusBadge status={node.status} />
        {others.length ? <span className="text-xs text-muted-foreground">+{others.length}</span> : null}
      </span>
    </Card>
  );
}

function TestsNodeCard({ data }: NodeProps<TestsFlowNode>) {
  const count = data.tests.length;
  return (
    <Card className={cn("h-24 w-60 gap-1 border-2 border-dashed p-2 shadow-sm", TONE_CLASSES.neutral)}>
      <PortHandles ports={data.ports} />
      <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
        <FlaskConical aria-hidden="true" className="size-4" />
        {count} test{count === 1 ? "" : "s"} call <span className="truncate font-mono">{data.target.symbol}</span>
      </span>
      <Button variant="outline" size="xs" className="nodrag w-fit" aria-label={`Show the ${count} test callers of ${data.target.symbol}`}>
        Show tests
      </Button>
    </Card>
  );
}

function FolderGroup({ data }: NodeProps<GroupFlowNode>) {
  return (
    <div className="size-full rounded-lg bg-muted/60" aria-label={`Folder ${data.path}`}>
      <span className="flex items-center gap-1 px-3 pt-2 text-xs font-medium text-muted-foreground">
        <Folder aria-hidden="true" className="size-3.5" />
        {data.label}
      </span>
    </div>
  );
}

function FileGroup({ data }: NodeProps<GroupFlowNode>) {
  return (
    <div className="size-full rounded-md border bg-card/80" aria-label={`File ${data.path}`}>
      <span className="flex items-center gap-2 px-3 pt-2 text-xs font-medium">
        <FileCode aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <span className="truncate">{data.label}</span>
        {data.support ? <TierBadge support={data.support} /> : null}
      </span>
    </div>
  );
}

function CallEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected, data }: EdgeProps<CallFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={data?.unknown ? { strokeDasharray: UNKNOWN_EDGE_DASH } : undefined} />
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} />
      <EdgeLabelRenderer>
        <Tooltip open={hovered || selected}>
          <TooltipTrigger asChild>
            <span aria-hidden="true" className="pointer-events-none absolute size-px" style={{ transform: `translate(${labelX}px, ${labelY}px)` }} />
          </TooltipTrigger>
          <TooltipContent>{data?.tooltip}</TooltipContent>
        </Tooltip>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { evidence: EvidenceNodeCard, tests: TestsNodeCard, folder: FolderGroup, file: FileGroup };
const edgeTypes = { call: CallEdge };

function Legend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-2">
      {STATUS_PRIORITY.map((status) => <li key={status}><StatusBadge status={status} /></li>)}
      {[["Resolved call", undefined], ["Unknown edge", UNKNOWN_EDGE_DASH]].map(([label, dash]) => (
        <li key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
          <svg aria-hidden="true" className="h-2 w-8" viewBox="0 0 32 8">
            <line x1="0" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={dash} />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

function Canvas({ report, onSelect }: EvidenceMapProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [layoutRun, setLayoutRun] = useState(0);
  const [error, setError] = useState<string>();
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CallFlowEdge>([]);
  const { fitView } = useReactFlow();

  useEffect(() => {
    let current = true;
    buildEvidenceMap(report, expanded)
      .then((layout) => {
        if (!current) return;
        setNodes(layout.nodes);
        setEdges(layout.edges);
        requestAnimationFrame(() => fitView({ padding: 0.15, maxZoom: 1, duration: reducedMotion() ? 0 : 200 }));
      })
      .catch((err: unknown) => current && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      current = false;
    };
  }, [report, expanded, layoutRun, setNodes, setEdges, fitView]);
  const resetLayout = useCallback(() => setLayoutRun((run) => run + 1), []);
  const leafCount = useMemo(() => nodes.filter((n) => n.type === "evidence" || n.type === "tests").length, [nodes]);

  if (error) {
    return (
      <Alert variant="destructive" className="m-4 w-auto">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>The map could not be laid out</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const toggleTests = (targetKey: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(targetKey)) next.add(targetKey);
      return next;
    });

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => {
        if (node.type === "tests") toggleTests(node.data.targetKey);
        else if (node.type === "evidence") onSelect(node.id);
      }}
      nodesConnectable={false}
      minZoom={0.1}
      defaultEdgeOptions={{ style: { strokeWidth: 2 }, zIndex: 1 }}
    >
      <Background />
      <Controls showInteractive={false} />
      {leafCount >= MINIMAP_FROM_NODES ? <MiniMap pannable zoomable ariaLabel="Map overview" /> : null}
      <Panel position="top-right" className="flex gap-2">
        {expanded.size ? (
          <Button variant="outline" size="sm" onClick={() => setExpanded(new Set())}>
            <FlaskConical aria-hidden="true" />Group test callers
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={resetLayout}>
          <RotateCcw aria-hidden="true" />Reset layout
        </Button>
      </Panel>
    </ReactFlow>
  );
}

export default function EvidenceMap({ report, onSelect }: EvidenceMapProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 id="map-heading" className="text-lg font-semibold">Evidence map</h2></CardTitle>
        <CardDescription>
          Callers on the left, the changed code on the right, each colored by what execution showed. Drag boxes to
          rearrange; select one for details; hover an arrow for its call site.
        </CardDescription>
        <Legend />
      </CardHeader>
      <CardContent>
        {report.impact.paths.length || report.impact.changed_symbols.length ? (
          <div role="group" aria-labelledby="map-heading" className="h-96 w-full overflow-hidden rounded-md border bg-background sm:h-128">
            <ReactFlowProvider>
              <Canvas report={report} onSelect={onSelect} />
            </ReactFlowProvider>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This report has no impact paths or changed symbols to map.</p>
        )}
      </CardContent>
    </Card>
  );
}
