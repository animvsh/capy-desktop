import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type ColorVariant = "terracotta" | "forest" | "sand" | "clay" | "sage" | "rust";

interface MeetingCardProps {
  leadName: string;
  company: string;
  date: string;
  time: string;
  duration: string;
  status: "scheduled" | "completed";
  variant?: ColorVariant;
  onJoin?: () => void;
  className?: string;
}

const borderClasses: Record<ColorVariant, string> = {
  terracotta: "border-terracotta",
  forest: "border-forest",
  sand: "border-sand",
  clay: "border-clay",
  sage: "border-sage",
  rust: "border-rust",
};

const iconBgClasses: Record<ColorVariant, string> = {
  terracotta: "bg-terracotta text-white",
  forest: "bg-forest text-white",
  sand: "bg-sand text-white",
  clay: "bg-clay text-white",
  sage: "bg-sage text-white",
  rust: "bg-rust text-white",
};

export function MeetingCard({
  leadName,
  company,
  date,
  time,
  duration,
  status,
  variant = "forest",
  onJoin,
  className,
}: MeetingCardProps) {
  const isUpcoming = status === "scheduled";
  
  return (
    <div className={cn(
      "rounded-xl bg-card p-5",
      borderClasses[variant],
      className
    )}>
      {/* Icon */}
      <div className={cn("inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4", iconBgClasses[variant])}>
        <i className="fa-solid fa-calendar h-6 w-6" />
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm text-muted-foreground">{company}</span>
        <span className="text-muted-foreground">•</span>
        <span className="text-sm text-muted-foreground">{duration}</span>
        {isUpcoming && (
          <span className="ml-auto text-xs font-medium text-forest bg-forest/10 px-2.5 py-1 rounded-full">
            upcoming
          </span>
        )}
      </div>

      {/* Name */}
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {leadName}
      </h3>

      {/* Date/time */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
        <div className="flex items-center gap-1.5">
          <i className="fa-solid fa-calendar h-4 w-4" />
          <span>{date}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <i className="fa-solid fa-clock h-4 w-4" />
          <span>{time}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end">
        {isUpcoming ? (
          <Button size="sm" className="gap-2" onClick={onJoin}>
            <i className="fa-solid fa-video h-4 w-4" />
            Join
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">Completed</span>
        )}
      </div>
    </div>
  );
}
