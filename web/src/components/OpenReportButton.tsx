import { useRef } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { openReportFiles, type OpenedReport } from "@/lib/open-report";

interface OpenReportButtonProps {
  onOpen: (opened: OpenedReport) => void;
  onError: (message: string) => void;
}

export function OpenReportButton({ onOpen, onError }: OpenReportButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  const read = async (element: HTMLInputElement) => {
    const files = [...(element.files ?? [])];
    // Cleared so picking the same file again still fires a change.
    element.value = "";
    if (!files.length) return;
    try {
      onOpen(await openReportFiles(files));
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : "The files could not be read.");
    }
  };
  return (
    <>
      <input ref={input} type="file" accept=".json,application/json" multiple hidden onChange={(event) => void read(event.currentTarget)} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
            <FolderOpen aria-hidden="true" />
            Open report…
          </Button>
        </TooltipTrigger>
        <TooltipContent>Pick report.json, and optionally repo_map.json; they are read in this browser only</TooltipContent>
      </Tooltip>
    </>
  );
}
