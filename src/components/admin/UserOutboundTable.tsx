import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface UserOutboundData {
  userId: string;
  email: string;
  sent: number;
  replies: number;
  replyRate: number;
  opens: number;
  openRate: number;
  meetings: number;
  conversionRate: number;
  credits: number;
  costPerReply: number;
}

type SortField = "sent" | "replies" | "replyRate" | "opens" | "openRate" | "meetings" | "credits" | "costPerReply";
type SortDirection = "asc" | "desc";

export function UserOutboundTable() {
  const [users, setUsers] = useState<UserOutboundData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("sent");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, email");

      if (profilesError) throw profilesError;

      // Get all conversations with their user_ids
      const { data: conversations, error: convsError } = await supabase
        .from("conversations")
        .select("id, user_id");

      if (convsError) throw convsError;

      // Create a map of conversation_id to user_id
      const convToUser = new Map<string, string>();
      (conversations || []).forEach((conv) => {
        convToUser.set(conv.id, conv.user_id);
      });

      // Get all messages
      const { data: messages, error: msgsError } = await supabase
        .from("messages")
        .select("conversation_id, direction, opened_at");

      if (msgsError) throw msgsError;

      // Get all meetings
      const { data: meetings, error: meetingsError } = await supabase
        .from("meetings")
        .select("user_id");

      if (meetingsError) throw meetingsError;

      // Get all credits used
      const { data: credits, error: creditsError } = await supabase
        .from("api_cost_tracking")
        .select("user_id, credits_used");

      if (creditsError) throw creditsError;

      // Aggregate data per user
      const userMap = new Map<string, {
        email: string;
        sent: number;
        replies: number;
        opens: number;
        meetings: number;
        credits: number;
      }>();

      // Initialize all users
      (profiles || []).forEach((profile) => {
        userMap.set(profile.user_id, {
          email: profile.email || "Unknown",
          sent: 0,
          replies: 0,
          opens: 0,
          meetings: 0,
          credits: 0,
        });
      });

      // Aggregate messages
      (messages || []).forEach((msg) => {
        const userId = convToUser.get(msg.conversation_id);
        if (userId) {
          const user = userMap.get(userId);
          if (user) {
            if (msg.direction === "outbound") {
              user.sent += 1;
              if (msg.opened_at) {
                user.opens += 1;
              }
            } else if (msg.direction === "inbound") {
              user.replies += 1;
            }
          }
        }
      });

      // Aggregate meetings
      (meetings || []).forEach((meeting) => {
        const user = userMap.get(meeting.user_id);
        if (user) {
          user.meetings += 1;
        }
      });

      // Aggregate credits
      (credits || []).forEach((credit) => {
        const user = userMap.get(credit.user_id);
        if (user) {
          user.credits += credit.credits_used || 0;
        }
      });

      // Convert to array with calculated rates
      const userData: UserOutboundData[] = Array.from(userMap.entries())
        .map(([userId, data]) => ({
          userId,
          email: data.email,
          sent: data.sent,
          replies: data.replies,
          replyRate: data.sent > 0 ? Math.round((data.replies / data.sent) * 100) : 0,
          opens: data.opens,
          openRate: data.sent > 0 ? Math.round((data.opens / data.sent) * 100) : 0,
          meetings: data.meetings,
          conversionRate: data.sent > 0 ? Math.round((data.meetings / data.sent) * 100) : 0,
          credits: data.credits,
          costPerReply: data.replies > 0 ? Math.round(data.credits / data.replies) : 0,
        }))
        .filter((u) => u.sent > 0 || u.credits > 0); // Only show users with activity

      setUsers(userData);
    } catch (error) {
      console.error("Error fetching user outbound data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
  });

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === "desc" ? (
            <i className="fa-solid fa-chevron-down h-3 w-3" />
          ) : (
            <i className="fa-solid fa-chevron-up h-3 w-3" />
          )
        )}
      </div>
    </TableHead>
  );

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-users h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">User Outbound Performance</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <i className="fa-solid fa-chevron-up h-4 w-4 mr-1" />
                Collapse
              </>
            ) : (
              <>
                <i className="fa-solid fa-chevron-down h-4 w-4 mr-1" />
                Expand
              </>
            )}
          </Button>
        </div>
        {!loading && users.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {users.length} users with activity
          </p>
        )}
      </CardHeader>
      {expanded && (
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <i className="fa-solid fa-spinner fa-spin h-8 w-8 text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <i className="fa-solid fa-users h-12 w-12 mb-3 opacity-50" />
              <p className="font-medium">No user activity yet</p>
              <p className="text-sm">Data will appear as users send outreach</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <SortableHeader field="sent">
                      <i className="fa-solid fa-envelope h-3 w-3 mr-1" />
                      Sent
                    </SortableHeader>
                    <SortableHeader field="replies">
                      <i className="fa-solid fa-reply h-3 w-3 mr-1" />
                      Replies
                    </SortableHeader>
                    <SortableHeader field="replyRate">
                      Reply %
                    </SortableHeader>
                    <SortableHeader field="opens">
                      <i className="fa-solid fa-eye h-3 w-3 mr-1" />
                      Opens
                    </SortableHeader>
                    <SortableHeader field="openRate">
                      Open %
                    </SortableHeader>
                    <SortableHeader field="meetings">
                      <i className="fa-solid fa-calendar h-3 w-3 mr-1" />
                      Meetings
                    </SortableHeader>
                    <SortableHeader field="credits">
                      <i className="fa-solid fa-coins h-3 w-3 mr-1" />
                      Credits
                    </SortableHeader>
                    <SortableHeader field="costPerReply">
                      Cost/Reply
                    </SortableHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsers.map((user) => (
                    <TableRow key={user.userId}>
                      <TableCell className="font-medium">
                        <span className="truncate max-w-[180px] block" title={user.email}>
                          {user.email}
                        </span>
                      </TableCell>
                      <TableCell>{user.sent.toLocaleString()}</TableCell>
                      <TableCell>{user.replies.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            user.replyRate >= 15
                              ? "bg-forest/10 text-forest border-forest"
                              : user.replyRate >= 8
                              ? "bg-sand/10 text-sand border-sand"
                              : "bg-rust/10 text-rust border-rust"
                          )}
                        >
                          {user.replyRate}%
                        </Badge>
                      </TableCell>
                      <TableCell>{user.opens.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            user.openRate >= 40
                              ? "bg-forest/10 text-forest border-forest"
                              : user.openRate >= 20
                              ? "bg-sand/10 text-sand border-sand"
                              : "bg-rust/10 text-rust border-rust"
                          )}
                        >
                          {user.openRate}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.meetings > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-forest">{user.meetings}</span>
                            <i className="fa-solid fa-arrow-trend-up h-3 w-3 text-forest" />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>{user.credits.toLocaleString()}</TableCell>
                      <TableCell>
                        {user.costPerReply > 0 ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-medium",
                              user.costPerReply <= 20
                                ? "bg-forest/10 text-forest border-forest"
                                : user.costPerReply <= 50
                                ? "bg-sand/10 text-sand border-sand"
                                : "bg-rust/10 text-rust border-rust"
                            )}
                          >
                            {user.costPerReply} cr
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
