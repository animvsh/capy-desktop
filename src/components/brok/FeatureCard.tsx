import { cn } from "@/lib/utils";

type ColorVariant = "terracotta" | "forest" | "sand" | "clay" | "sage" | "rust" | "neutral";

interface FeatureCardProps {
  variant?: ColorVariant;
  icon: string;
  number?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

// Premium icon gradients
const iconGradients: Record<ColorVariant, string> = {
  terracotta: "bg-gradient-to-br from-orange-500/20 to-orange-600/10 text-orange-500 group-hover:from-orange-500/30 group-hover:to-orange-600/20",
  forest: "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 text-emerald-500 group-hover:from-emerald-500/30 group-hover:to-emerald-600/20",
  sand: "bg-gradient-to-br from-amber-500/20 to-amber-600/10 text-amber-500 group-hover:from-amber-500/30 group-hover:to-amber-600/20",
  clay: "bg-gradient-to-br from-rose-500/20 to-rose-600/10 text-rose-500 group-hover:from-rose-500/30 group-hover:to-rose-600/20",
  sage: "bg-gradient-to-br from-teal-500/20 to-teal-600/10 text-teal-500 group-hover:from-teal-500/30 group-hover:to-teal-600/20",
  rust: "bg-gradient-to-br from-red-500/20 to-red-600/10 text-red-500 group-hover:from-red-500/30 group-hover:to-red-600/20",
  neutral: "bg-muted/50 text-muted-foreground group-hover:bg-muted",
};

// Border accent colors on hover
const borderAccents: Record<ColorVariant, string> = {
  terracotta: "hover:border-orange-500/20",
  forest: "hover:border-emerald-500/20",
  sand: "hover:border-amber-500/20",
  clay: "hover:border-rose-500/20",
  sage: "hover:border-teal-500/20",
  rust: "hover:border-red-500/20",
  neutral: "hover:border-border/50",
};

export function FeatureCard({
  variant = "neutral",
  icon,
  number,
  title,
  description,
  actionLabel = "View",
  onAction,
  className,
}: FeatureCardProps) {
  return (
    <div 
      className={cn(
        "group relative p-4 rounded-xl",
        "bg-card/60 backdrop-blur-sm",
        "border border-border/30",
        "transition-all duration-300 ease-out cursor-pointer",
        "hover:bg-card hover:shadow-lg hover:shadow-black/5",
        "hover:-translate-y-0.5",
        borderAccents[variant],
        className
      )}
      onClick={onAction}
    >
      {/* Subtle background gradient on hover */}
      <div className={cn(
        "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
        variant === "terracotta" && "bg-gradient-to-br from-orange-500/3 to-transparent",
        variant === "forest" && "bg-gradient-to-br from-emerald-500/3 to-transparent",
        variant === "sand" && "bg-gradient-to-br from-amber-500/3 to-transparent",
        variant === "clay" && "bg-gradient-to-br from-rose-500/3 to-transparent",
        variant === "sage" && "bg-gradient-to-br from-teal-500/3 to-transparent",
        variant === "rust" && "bg-gradient-to-br from-red-500/3 to-transparent",
        variant === "neutral" && "bg-gradient-to-br from-foreground/3 to-transparent"
      )} />

      {/* Content */}
      <div className="relative flex items-start gap-3">
        {/* Icon - premium gradient container */}
        <div className={cn(
          "shrink-0 p-2.5 rounded-lg transition-all duration-300",
          "group-hover:scale-110",
          iconGradients[variant]
        )}>
          <i className={cn(icon, "text-base")} />
        </div>
        
        <div className="flex-1 min-w-0 pt-0.5">
          {/* Title with optional number */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-foreground group-hover:text-foreground truncate transition-colors">
              {title}
            </h3>
            {number && (
              <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums">
                {number}
              </span>
            )}
          </div>
          
          {/* Description */}
          <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">
            {description}
          </p>
        </div>
        
        {/* Action indicator */}
        <div className="shrink-0 flex items-center gap-1.5 self-center">
          <span className={cn(
            "text-[10px] font-medium uppercase tracking-wide",
            "opacity-0 group-hover:opacity-100 transition-all duration-300",
            "translate-x-2 group-hover:translate-x-0",
            "text-muted-foreground"
          )}>
            {actionLabel}
          </span>
          <div className={cn(
            "flex items-center justify-center w-6 h-6 rounded-full",
            "bg-muted/50 group-hover:bg-muted",
            "transition-all duration-300",
            "group-hover:translate-x-0.5"
          )}>
            <i className="fa-solid fa-arrow-right text-[10px] text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
}
