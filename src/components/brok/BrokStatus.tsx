import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useState } from "react";

interface CapyStatusProps {
  isRunning: boolean;
  onToggle: () => void;
  onStop?: () => void;
  className?: string;
}

export function BrokStatus({ isRunning, onToggle, onStop, className }: CapyStatusProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      await onToggle();
    } finally {
      // Small delay for visual feedback
      setTimeout(() => setIsLoading(false), 300);
    }
  };

  const handleStop = async () => {
    if (!onStop) return;
    setIsStopping(true);
    try {
      await onStop();
    } finally {
      // Small delay for visual feedback
      setTimeout(() => setIsStopping(false), 300);
    }
  };

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-xl",
      "bg-card/60 backdrop-blur-sm border border-border/30",
      "transition-all duration-300",
      className
    )}>
      {/* Status indicator with glow effect */}
      <div className="flex items-center gap-2.5">
        <div className="relative">
          {/* Glow ring */}
          <span className={cn(
            "absolute inset-0 rounded-full blur-sm transition-all duration-500",
            isRunning ? "bg-emerald-500/50 animate-pulse" : "bg-amber-500/30"
          )} />
          {/* Main dot */}
          <span className={cn(
            "relative block w-2.5 h-2.5 rounded-full transition-all duration-300",
            isRunning 
              ? "bg-emerald-500 shadow-lg shadow-emerald-500/50" 
              : "bg-amber-500 shadow-lg shadow-amber-500/30"
          )} />
        </div>
        <span className={cn(
          "text-sm font-medium transition-colors duration-300",
          isRunning ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
        )}>
          {isRunning ? "Running" : "Paused"}
        </span>
      </div>
      
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        disabled={isLoading || isStopping}
        className={cn(
          "h-8 px-3 text-xs font-medium rounded-lg transition-all duration-300",
          "border border-transparent",
          (isLoading || isStopping) && "opacity-70",
          isRunning
            ? "text-muted-foreground hover:text-foreground hover:bg-muted/80"
            : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 hover:border-emerald-500/20"
        )}
      >
        {isLoading ? (
          <i className="fa-solid fa-spinner fa-spin text-[10px]" />
        ) : isRunning ? (
          <>
            <i className="fa-solid fa-pause mr-1.5 text-[10px]" />
            Pause
          </>
        ) : (
          <>
            <i className="fa-solid fa-play mr-1.5 text-[10px]" />
            Resume
          </>
        )}
      </Button>

      {/* Stop button */}
      {onStop && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleStop}
          disabled={isLoading || isStopping}
          className={cn(
            "h-8 px-3 text-xs font-medium rounded-lg transition-all duration-300",
            "border border-transparent",
            (isLoading || isStopping) && "opacity-70",
            "text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20"
          )}
        >
          {isStopping ? (
            <i className="fa-solid fa-spinner fa-spin text-[10px]" />
          ) : (
            <>
              <i className="fa-solid fa-stop mr-1.5 text-[10px]" />
              Stop
            </>
          )}
        </Button>
      )}
    </div>
  );
}
