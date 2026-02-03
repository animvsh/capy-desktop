import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, memo } from "react";

type ColorVariant = "terracotta" | "forest" | "sand" | "clay" | "sage" | "rust" | "neutral";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: string;
  variant?: ColorVariant;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

// Premium gradient backgrounds for hover state
const gradientStyles: Record<ColorVariant, string> = {
  terracotta: "hover:bg-gradient-to-br hover:from-orange-500/5 hover:to-orange-600/10",
  forest: "hover:bg-gradient-to-br hover:from-emerald-500/5 hover:to-emerald-600/10",
  sand: "hover:bg-gradient-to-br hover:from-amber-500/5 hover:to-amber-600/10",
  clay: "hover:bg-gradient-to-br hover:from-rose-500/5 hover:to-rose-600/10",
  sage: "hover:bg-gradient-to-br hover:from-teal-500/5 hover:to-teal-600/10",
  rust: "hover:bg-gradient-to-br hover:from-red-500/5 hover:to-red-600/10",
  neutral: "hover:bg-muted/50",
};

// Icon container gradients
const iconGradients: Record<ColorVariant, string> = {
  terracotta: "bg-gradient-to-br from-orange-500/20 to-orange-600/10 text-orange-500",
  forest: "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 text-emerald-500",
  sand: "bg-gradient-to-br from-amber-500/20 to-amber-600/10 text-amber-500",
  clay: "bg-gradient-to-br from-rose-500/20 to-rose-600/10 text-rose-500",
  sage: "bg-gradient-to-br from-teal-500/20 to-teal-600/10 text-teal-500",
  rust: "bg-gradient-to-br from-red-500/20 to-red-600/10 text-red-500",
  neutral: "bg-muted/50 text-muted-foreground",
};

// Animated counter hook
function useAnimatedNumber(value: number, duration: number = 500) {
  const [displayValue, setDisplayValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const startValue = useRef(0);

  useEffect(() => {
    startValue.current = displayValue;
    startTime.current = null;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue.current + (value - startValue.current) * eased);
      
      setDisplayValue(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return displayValue;
}

// Memoized to prevent re-renders when parent state changes
export const MetricCard = memo(function MetricCard({
  title,
  value,
  icon,
  variant = "neutral",
  subtitle,
  trend,
  className
}: MetricCardProps) {
  // Parse numeric value for animation
  const numericValue = typeof value === 'number' ? value : parseInt(value.toString().replace(/[^0-9]/g, ''), 10) || 0;
  const isPercentage = typeof value === 'string' && value.includes('%');
  const animatedValue = useAnimatedNumber(numericValue);
  
  const displayValue = typeof value === 'number' 
    ? animatedValue.toLocaleString()
    : isPercentage 
      ? `${animatedValue}%` 
      : value;

  return (
    <div className={cn(
      "group relative p-4 rounded-xl bg-card/60 backdrop-blur-sm",
      "border border-transparent hover:border-border/50",
      "transition-all duration-300 ease-out",
      "hover:shadow-lg hover:shadow-black/5",
      "hover:-translate-y-0.5",
      gradientStyles[variant],
      className
    )}>
      {/* Subtle glow on hover */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className={cn(
          "absolute inset-0 rounded-xl blur-xl",
          variant === "terracotta" && "bg-orange-500/5",
          variant === "forest" && "bg-emerald-500/5",
          variant === "sand" && "bg-amber-500/5",
          variant === "clay" && "bg-rose-500/5",
          variant === "sage" && "bg-teal-500/5",
          variant === "rust" && "bg-red-500/5",
          variant === "neutral" && "bg-foreground/5"
        )} />
      </div>

      {/* Content */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          {/* Title - subtle and clean */}
          <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider truncate">
            {title}
          </p>
          
          {/* Value - prominent with nice typography */}
          <p className="text-2xl font-semibold text-foreground tracking-tight tabular-nums">
            {displayValue}
          </p>
          
          {/* Subtitle or trend */}
          {(subtitle || trend) && (
            <div className="flex items-center gap-2 pt-0.5">
              {trend && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full",
                  trend.isPositive 
                    ? "text-emerald-600 bg-emerald-500/10" 
                    : "text-red-500 bg-red-500/10"
                )}>
                  <i className={cn(
                    "text-[8px]",
                    trend.isPositive ? "fa-solid fa-arrow-up" : "fa-solid fa-arrow-down"
                  )} />
                  {Math.abs(trend.value)}%
                </span>
              )}
              {subtitle && (
                <span className="text-[11px] text-muted-foreground/60">{subtitle}</span>
              )}
            </div>
          )}
        </div>
        
        {/* Icon - premium gradient container */}
        <div className={cn(
          "shrink-0 p-2 rounded-lg transition-all duration-300",
          "group-hover:scale-110 group-hover:rotate-3",
          iconGradients[variant]
        )}>
          <i className={cn(icon, "text-sm")} />
        </div>
      </div>
    </div>
  );
});
