import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface MessageBubbleProps {
  content: string;
  direction: "outbound" | "inbound";
  sentAt: string;
}

export function MessageBubble({ content, direction, sentAt }: MessageBubbleProps) {
  const isOutbound = direction === "outbound";
  
  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 space-y-2",
          isOutbound
            ? "bg-forest text-white rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md border-2 border-border"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{content}</p>
        <p
          className={cn(
            "text-xs",
            isOutbound ? "text-white/70" : "text-muted-foreground"
          )}
        >
          {formatDistanceToNow(new Date(sentAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
