import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeftToLine, CircleAlert, FileQuestion, GitPullRequest, Info, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FolderGroup, LineSwatch, MINIMAP_FROM_NODES, PortHandles, TooltipEdge, useAsyncLayout, useFlowColorMode } from "@/components/map-parts";
import { TONE_CLASSES } from "@/components/StatusBadge";
import { TierBadge, TierLegend } from "@/components/TierBadge";
import type { TooltipFlowEdge } from "@/lib/nested-layout";
import { buildRepoMap, parseRepoMap, type ModuleFlowNode, type RepoMap, type RepoMapNode } from "@/lib/repo-map";
import { fetchJson, shortSha } from "@/lib/review-report";
import { cn } from "@/lib/utils";

interface RepoMapTabProps {
  changedFiles: string[];
  /** Undefined loads /data/repo_map.json; null means the opened report came without one. */
  map?: RepoMap | null;
  onShowEvidence: () => void;
}

type LoadState = { status: "loading" } | { status: "missing" } | { status: "ready"; map: RepoMap } | { status: "error"; message: string };

function ModuleNode({ data }: NodeProps<ModuleFlowNode>) {
  const { module, touched } = data;
  const name = module.path.split("/").pop();
  const commit = module.last_commit;
  return (
    <Card className={cn("h-18 w-70 gap-1 p-2 shadow-sm", touched ? cn("border-2", TONE_CLASSES.info) : "border")}>
      <PortHandles ports={data.ports} />
      <div className="flex items-center gap-1">
        {touched ? <GitPullRequest aria-label="Changed in this PR" className="size-3.5 shrink-0 text-info" /> : null}
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground">{name}</span>
        <TierBadge support={module} />
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {commit ? `${commit.pr ? `PR #${commit.pr}` : commit.sha} · ${commit.date}` : "No commit found"}
        </span>
        {commit ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="nodrag" aria-label={`Last change to ${module.path}`}>
                <Info aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {commit.subject} ({commit.sha}, {commit.date}{commit.pr ? `, PR #${commit.pr}` : ""})
            </TooltipContent>
          </Tooltip>
        ) : null}
        {touched ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="nodrag" aria-label={`Show ${module.path} in the evidence map`}>
                <ArrowLeftToLine aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show in the evidence map</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </Card>
  );
}

/** Open on the PR's files and their direct import neighbors; the fit-view control still shows everything. */
function focusOnChange(nodes: RepoMapNode[], edges: TooltipFlowEdge[]): string[] {
  const touched = new Set(nodes.filter((n) => n.type === "module" && n.data.touched).map((n) => n.id));
  const neighbors = edges.filter((e) => touched.has(e.source) || touched.has(e.target)).flatMap((e) => [e.source, e.target]);
  return [...new Set([...touched, ...neighbors])];
}

const nodeTypes = { folder: FolderGroup, module: ModuleNode };
const edgeTypes = { call: TooltipEdge };

function Canvas({ map, changedFiles, onShowEvidence }: { map: RepoMap } & RepoMapTabProps) {
  const changed = useMemo(() => new Set(changedFiles), [changedFiles]);
  const colorMode = useFlowColorMode();
  const { nodes, edges, onNodesChange, onEdgesChange, error, reset } = useAsyncLayout<RepoMapNode, TooltipFlowEdge>(
    () => buildRepoMap(map, changed),
    [map, changed],
    focusOnChange,
  );
  if (error) {
    return (
      <Alert variant="destructive" className="m-4 w-auto">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>The repo map could not be laid out</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  return (
    <ReactFlow
      colorMode={colorMode}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => node.type === "module" && node.data.touched && onShowEvidence()}
      nodesConnectable={false}
      minZoom={0.05}
      defaultEdgeOptions={{ style: { strokeWidth: 1.5 }, zIndex: 1 }}
    >
      <Background />
      <Controls showInteractive={false} />
      {map.modules.length >= MINIMAP_FROM_NODES ? <MiniMap className="hidden sm:block" pannable zoomable ariaLabel="Repo map overview" /> : null}
      <Panel position="top-right">
        <Button variant="outline" size="sm" onClick={reset}><RotateCcw aria-hidden="true" />Reset layout</Button>
      </Panel>
    </ReactFlow>
  );
}

function useRepoMap(given: RepoMap | null | undefined): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    if (given !== undefined) return;
    const controller = new AbortController();
    fetchJson("/data/repo_map.json", controller.signal)
      .then((json) => setState(json === null ? { status: "missing" } : { status: "ready", map: parseRepoMap(json) }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: error instanceof Error ? error.message : "The repo map could not be loaded." });
      });
    return () => controller.abort();
  }, [given]);
  if (given === null) return { status: "missing" };
  return given ? { status: "ready", map: given } : state;
}

export default function RepoMapTab({ changedFiles, map: given, onShowEvidence }: RepoMapTabProps) {
  const state = useRepoMap(given);
  if (state.status === "loading") return <Skeleton className="h-128 w-full" />;
  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>The repo map could not be shown</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }
  if (state.status === "missing") {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><FileQuestion aria-hidden="true" /></EmptyMedia>
          <EmptyTitle>No repo map yet</EmptyTitle>
          <EmptyDescription>
            Generate one with <code>behavior-review map --ref HEAD --out repo_map.json</code> on the report's head commit, then
            pick it together with report.json in Open report… (or put it in <code>web/public/data/</code> and reload).
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const { map } = state;
  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 id="repo-map-heading" className="text-lg font-semibold">Repo map</h2></CardTitle>
        <CardDescription>
          {map.modules.length} files and {map.edges.length} imports at <code>{shortSha(map.sha)}</code>, grouped by folder.
          It opens on the files this PR changed and their imports (the fit-view control shows the whole repo);
          hover an arrow for its import line.
        </CardDescription>
        <ul aria-label="Legend" className="flex flex-wrap items-center gap-2">
          <li><Badge variant="outline" className={TONE_CLASSES.info}><GitPullRequest aria-hidden="true" />Changed in this PR</Badge></li>
          <LineSwatch label="Import" />
        </ul>
        <TierLegend tiers={map.modules.map((module) => module.tier)} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="group" aria-labelledby="repo-map-heading" className="h-128 w-full overflow-hidden rounded-md border bg-background">
          <ReactFlowProvider>
            <Canvas map={map} changedFiles={changedFiles} onShowEvidence={onShowEvidence} />
          </ReactFlowProvider>
        </div>
        {map.unknowns.length ? (
          <section aria-label="Unknown imports" className="space-y-2">
            <h3 className="font-medium">Unknown imports ({map.unknowns.length})</h3>
            {map.unknowns.map((u) => (
              <Alert key={`${u.path}:${u.line}:${u.expression}`} className={TONE_CLASSES.warning}>
                <AlertTitle className="font-mono break-all">{u.expression} at {u.path}:{u.line}</AlertTitle>
                <AlertDescription>{u.reason}; this import is not drawn, and is not assumed to be absent.</AlertDescription>
              </Alert>
            ))}
          </section>
        ) : null}
        <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {map.limits.map((limit) => <li key={limit}>{limit}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}
