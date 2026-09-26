import { useMemo, useState } from "react";
import { Background, Controls, Handle, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge, STATUS_META, TONE_CLASSES } from "@/components/StatusBadge";
import { STATUS_PRIORITY } from "@/lib/evidence";
import { buildEvidenceMap, UNKNOWN_EDGE_DASH, type EvidenceFlowNode } from "@/lib/evidence-map";
import type { ReviewReport } from "@/lib/review-report";
import { cn } from "@/lib/utils";

interface EvidenceMapProps {
  report: ReviewReport;
  onSelect: (key: string) => void;
}

function EvidenceNodeCard({ data }: NodeProps<EvidenceFlowNode>) {
  const { node } = data;
  const primary = STATUS_META[node.status];
  const others = node.statuses.filter((status) => status !== node.status);
  return (
    <>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Button
        variant="outline"
        onClick={() => data.onSelect?.(node.key)}
        aria-label={`${node.ref.symbol} in ${node.ref.path}: ${node.statuses.map((s) => STATUS_META[s].label).join(", ")}. Open details.`}
        className={cn("nodrag h-full w-full flex-col items-start justify-start gap-1 border-2 p-2 text-left whitespace-normal", TONE_CLASSES[primary.tone])}
      >
        <span className="w-full truncate font-mono text-sm font-semibold text-foreground">{node.ref.symbol}</span>
        <span className="w-full truncate text-xs text-muted-foreground">
          {node.ref.path}{node.line ? `:${node.line}` : ""}{node.isTest ? " · test" : ""}
        </span>
        <span className="flex flex-wrap gap-1">
          <StatusBadge status={node.status} />
          {others.length ? <span className="text-xs text-muted-foreground">+{others.length}</span> : null}
        </span>
      </Button>
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </>
  );
}

const nodeTypes = { evidence: EvidenceNodeCard };

function Legend() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-2">
      {STATUS_PRIORITY.map((status) => (
        <li key={status}><StatusBadge status={status} /></li>
      ))}
      <li className="flex items-center gap-2 text-xs text-muted-foreground">
        <svg aria-hidden="true" className="h-2 w-8 text-muted-foreground" viewBox="0 0 32 8">
          <line x1="0" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2" />
        </svg>
        Resolved call
      </li>
      <li className="flex items-center gap-2 text-xs text-muted-foreground">
        <svg aria-hidden="true" className="h-2 w-8 text-muted-foreground" viewBox="0 0 32 8">
          <line x1="0" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={UNKNOWN_EDGE_DASH} />
        </svg>
        Unknown edge
      </li>
    </ul>
  );
}

export default function EvidenceMap({ report, onSelect }: EvidenceMapProps) {
  const [showTests, setShowTests] = useState(false);
  const { nodes, edges, hiddenTests } = useMemo(() => {
    const map = buildEvidenceMap(report, showTests);
    return { ...map, nodes: map.nodes.map((node) => ({ ...node, data: { ...node.data, onSelect } })) };
  }, [report, onSelect, showTests]);
  const testCount = showTests ? nodes.filter((node) => node.data.node.isTest).length : hiddenTests;

  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 id="map-heading" className="text-lg font-semibold">Evidence map</h2></CardTitle>
        <CardDescription>
          Callers on the left, the changed code on the right. Each box is colored by what execution showed. Select a box for its details.
        </CardDescription>
        <Legend />
        {testCount ? (
          <div className="flex items-center gap-2">
            <Switch id="show-test-callers" checked={showTests} onCheckedChange={setShowTests} />
            <Label htmlFor="show-test-callers">Show test callers ({testCount})</Label>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {nodes.length ? (
          <div className="h-96 w-full overflow-hidden rounded-md border bg-background sm:h-112" aria-labelledby="map-heading" role="group">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
              minZoom={0.3}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesFocusable={false}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This report has no impact paths or changed symbols to map.</p>
        )}
      </CardContent>
    </Card>
  );
}
