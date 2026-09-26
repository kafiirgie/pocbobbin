import { CircleAlert, FolderOpen, RotateCw, Undo2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TONE_CLASSES } from "@/components/StatusBadge";

export function LoadingState() {
  return (
    <div role="status" aria-label="Loading the report" className="space-y-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function OpenedNotice({ names, onClose }: { names: string[]; onClose: () => void }) {
  return (
    <Alert className={TONE_CLASSES.info}>
      <FolderOpen aria-hidden="true" />
      <AlertTitle>Showing {names.join(" and ")} from your computer</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>The files were read in this browser and not uploaded. Reloading the page returns to the shipped report.</p>
        <Button variant="outline" size="sm" onClick={onClose}>
          <Undo2 aria-hidden="true" />
          Back to the shipped report
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>The evidence report could not be shown</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{message} No claims are shown until a valid report loads.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
