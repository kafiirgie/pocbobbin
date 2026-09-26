import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Theme } from "@/lib/use-theme";

export function AppHeader({ theme, onToggleTheme, children }: { theme: Theme; onToggleTheme: () => void; children?: ReactNode }) {
  const next = theme === "light" ? "dark" : "light";
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <p className="font-semibold">Behavior Review</p>
        <p className="hidden text-sm text-muted-foreground md:block">AI proposes. Algorithms verify. Humans decide.</p>
        <div className="ml-auto flex items-center gap-2">
          {children}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onToggleTheme} aria-label={`Switch to ${next} theme`}>
                {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Switch to {next} theme</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
