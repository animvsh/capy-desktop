import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";

export interface Message {
  id: string;
  content: string;
  direction: string;
  sent_at: string;
}

interface ConversationThreadProps {
  messages: Message[];
  loading: boolean;
}

export function ConversationThread({ messages, loading }: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
          <i className="fa-solid fa-comment h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No messages yet</h3>
        <p className="text-sm text-muted-foreground">Messages will appear here once the conversation starts</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          content={message.content}
          direction={message.direction as "outbound" | "inbound"}
          sentAt={message.sent_at}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
