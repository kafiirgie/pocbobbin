import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false); // Clipboard can be blocked (insecure origin, permissions); the value stays selectable.
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : `Copy ${label}`}</TooltipContent>
      <span role="status" className="sr-only">{copied ? `${label} copied` : ""}</span>
    </Tooltip>
  );
}
