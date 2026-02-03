/**
 * HomePanel - Unified home view combining metrics and conversations
 *
 * Layout:
 * - Top: Compact MetricsBar with key stats and Capy status
 * - Below: Full email/conversations interface
 */

import { MetricsBar } from '@/components/home/MetricsBar';
import { ConversationsContent } from '@/components/conversations/ConversationsContent';

export function HomePanel() {
  return (
    <div className="flex flex-col h-full">
      {/* Compact Metrics Bar */}
      <MetricsBar />

      {/* Conversations (rest of the space) */}
      <div className="flex-1 min-h-0">
        <ConversationsContent showHeader={false} />
      </div>
    </div>
  );
}

export default HomePanel;
