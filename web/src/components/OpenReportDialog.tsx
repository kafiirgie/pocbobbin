import { useCallback, useRef, useState, type DragEvent } from "react";
import { CircleAlert, CircleCheck, FileUp, FolderOpen, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { TONE_CLASSES } from "@/components/StatusBadge";
import { mapMismatch, readRepoMapFile, readReportFile, type OpenedReport } from "@/lib/open-report";
import type { RepoMap } from "@/lib/repo-map";
import { shortSha, type ReviewReport } from "@/lib/review-report";
import { cn } from "@/lib/utils";

type Slot<T> =
  | { status: "empty" }
  | { status: "reading"; name: string }
  | { status: "ready"; name: string; value: T }
  | { status: "error"; name: string; message: string };

function useFileSlot<T>(read: (file: File) => Promise<T>) {
  const [slot, setSlot] = useState<Slot<T>>({ status: "empty" });
  const latest = useRef(0);
  const pick = useCallback(
    (file: File | null) => {
      const id = ++latest.current;
      if (!file) return setSlot({ status: "empty" });
      setSlot({ status: "reading", name: file.name });
      // Only the most recent pick may land; a slower earlier read is dropped.
      read(file).then(
        (value) => id === latest.current && setSlot({ status: "ready", name: file.name, value }),
        (error: unknown) =>
          id === latest.current &&
          setSlot({ status: "error", name: file.name, message: error instanceof Error ? error.message : "The file could not be read." }),
      );
    },
    [read],
  );
  return [slot, pick] as const;
}

interface ZoneSpec {
  id: string;
  title: string;
  file: string;
  command: string;
  optional?: boolean;
}

type ZoneView = { tone: "empty" } | { tone: "reading" | "ok" | "error"; name: string; text: string };

function viewOf<T>(slot: Slot<T>, summarize: (value: T) => string, problem?: string): ZoneView {
  if (slot.status === "empty") return { tone: "empty" };
  if (slot.status === "reading") return { tone: "reading", name: slot.name, text: "Reading…" };
  if (slot.status === "error") return { tone: "error", name: slot.name, text: slot.message };
  return problem ? { tone: "error", name: slot.name, text: problem } : { tone: "ok", name: slot.name, text: summarize(slot.value) };
}

const ZONE_ICON = { empty: FileUp, reading: LoaderCircle, ok: CircleCheck, error: CircleAlert };

function ZoneContent({ spec, view }: { spec: ZoneSpec; view: ZoneView }) {
  const Icon = ZONE_ICON[view.tone];
  const iconClass = cn("size-5", view.tone === "ok" && "text-success", view.tone === "error" && "text-danger", view.tone === "reading" && "animate-spin");
  return (
    <>
      <Icon aria-hidden="true" className={iconClass} />
      {view.tone === "empty" ? (
        <span>Drop <code>{spec.file}</code> here, or click to choose</span>
      ) : (
        <span id={`${spec.id}-status`} className="space-y-1">
          <span className="block font-mono text-foreground break-all">{view.name}</span>
          <span className="block">{view.text}</span>
        </span>
      )}
    </>
  );
}

function FileZone({ spec, view, onPick }: { spec: ZoneSpec; view: ZoneView; onPick: (file: File | null) => void }) {
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    onPick(event.dataTransfer.files[0] ?? null);
  };
  return (
    <div className="space-y-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <p id={`${spec.id}-title`} className="text-sm font-medium">
          {spec.title} <span className="font-normal text-muted-foreground">({spec.optional ? "optional" : "required"})</span>
        </p>
        {view.tone === "empty" ? null : <Button variant="ghost" size="xs" onClick={() => onPick(null)}>Remove</Button>}
      </div>
      <label
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-4 text-center text-sm text-muted-foreground",
          "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
          view.tone === "error" && TONE_CLASSES.danger,
          view.tone === "ok" && TONE_CLASSES.success,
          over && "border-primary bg-muted",
        )}
      >
        <input
          type="file" accept=".json,application/json" className="sr-only"
          aria-labelledby={`${spec.id}-title`} aria-describedby={view.tone === "empty" ? `${spec.id}-hint` : `${spec.id}-status`}
          // Cleared so choosing the same file again still fires a change.
          onChange={(event) => { onPick(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }}
        />
        <ZoneContent spec={spec} view={view} />
      </label>
      <p id={`${spec.id}-hint`} className="text-xs text-muted-foreground">Made by <code>{spec.command}</code></p>
    </div>
  );
}

const REPORT_ZONE: ZoneSpec = { id: "open-report", title: "Report", file: "report.json", command: "behavior-review --base main --head HEAD --json report.json" };
const MAP_ZONE: ZoneSpec = { id: "open-map", title: "Repo map", file: "repo_map.json", command: "behavior-review map --ref HEAD --out repo_map.json", optional: true };

const summarizeReport = (r: ReviewReport) =>
  `${r.revisions.base_ref} → ${r.revisions.head_ref} (${shortSha(r.revisions.base_sha)}..${shortSha(r.revisions.head_sha)}), ${r.impact.paths.length} impact paths`;
const summarizeMap = (m: RepoMap) => `${m.modules.length} files at ${shortSha(m.sha)}`;

export function OpenReportDialog({ onOpen }: { onOpen: (opened: OpenedReport) => void }) {
  const [open, setOpen] = useState(false);
  const [report, pickReport] = useFileSlot(readReportFile);
  const [map, pickMap] = useFileSlot(readRepoMapFile);
  const mismatch = report.status === "ready" && map.status === "ready" ? mapMismatch(report.value, map.value) : undefined;
  const mapUsable = map.status === "empty" || (map.status === "ready" && !mismatch);

  const submit = () => {
    if (report.status !== "ready" || !mapUsable) return;
    const opened = map.status === "ready" ? { map: map.value, names: [report.name, map.name] } : { map: null, names: [report.name] };
    onOpen({ report: report.value, ...opened });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><FolderOpen aria-hidden="true" />Open report…</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a behavior-review run</DialogTitle>
          <DialogDescription>Files are read in this browser and never uploaded. Reloading returns to the shipped report.</DialogDescription>
        </DialogHeader>
        <FileZone spec={REPORT_ZONE} view={viewOf(report, summarizeReport)} onPick={pickReport} />
        <FileZone spec={MAP_ZONE} view={viewOf(map, summarizeMap, mismatch)} onPick={pickMap} />
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={submit} disabled={report.status !== "ready" || !mapUsable}>Open</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
