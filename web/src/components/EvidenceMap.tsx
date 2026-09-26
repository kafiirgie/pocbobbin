import { useMemo, useState } from "react";
import { Background, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CircleAlert, FileCode, FlaskConical, PanelRightOpen, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FolderGroup, LineSwatch, MINIMAP_FROM_NODES, PortHandles, TooltipEdge, UNKNOWN_EDGE_DASH, useAsyncLayout, useFlowColorMode,
} from "@/components/map-parts";
import { StatusBadge, STATUS_META, TONE_CLASSES } from "@/components/StatusBadge";
import { TierBadge, TierLegend } from "@/components/TierBadge";
import { evidenceNodes, languageOf, STATUS_PRIORITY } from "@/lib/evidence";
import {
  buildEvidenceMap, type CallFlowEdge, type EvidenceFlowNode, type GroupFlowNode, type MapNode, type TestsFlowNode,
} from "@/lib/evidence-map";
import type { ReviewReport, Tier } from "@/lib/review-report";
import { cn } from "@/lib/utils";

interface EvidenceMapProps {
  report: ReviewReport;
  onSelect: (key: string) => void;
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
        {/* No onClick: the click bubbles to the node, which opens the details Sheet. */}
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

const nodeTypes = { evidence: EvidenceNodeCard, tests: TestsNodeCard, folder: FolderGroup, file: FileGroup };
const edgeTypes = { call: TooltipEdge };

function Legend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-2">
      {STATUS_PRIORITY.map((status) => <li key={status}><StatusBadge status={status} /></li>)}
      <LineSwatch label="Resolved call" />
      <LineSwatch label="Unknown edge" dash={UNKNOWN_EDGE_DASH} />
    </ul>
  );
}

/** Tiers of the files the map draws (its file-box badges), not every language the report lists. */
function mapTiers(report: ReviewReport): Tier[] {
  const files = new Set([...evidenceNodes(report).values()].map((node) => node.ref.path));
  return [...files].flatMap((file) => languageOf(report, file)?.tier ?? []);
}

function Canvas({ report, onSelect }: EvidenceMapProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const { nodes, edges, onNodesChange, onEdgesChange, error, reset } = useAsyncLayout<MapNode, CallFlowEdge>(
    () => buildEvidenceMap(report, expanded),
    [report, expanded],
  );
  const colorMode = useFlowColorMode();
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
      colorMode={colorMode}
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
      {leafCount >= MINIMAP_FROM_NODES ? <MiniMap className="hidden sm:block" pannable zoomable ariaLabel="Map overview" /> : null}
      <Panel position="top-right" className="flex gap-2">
        {expanded.size ? (
          <Button variant="outline" size="sm" onClick={() => setExpanded(new Set())}>
            <FlaskConical aria-hidden="true" />Group test callers
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={reset}>
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
        <TierLegend tiers={mapTiers(report)} />
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
