/**
 * AdminPanel - Full admin functionality with users, analytics, and activity logs
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Admin components
import { CreditAnalytics } from '@/components/admin/CreditAnalytics';
import { ServiceBreakdownChart } from '@/components/admin/ServiceBreakdownChart';
import { TopUsersChart } from '@/components/admin/TopUsersChart';
import { CreditManagementDialog } from '@/components/admin/CreditManagementDialog';
import { EfficiencyMetrics } from '@/components/admin/EfficiencyMetrics';
import { ApiUsageChart } from '@/components/admin/ApiUsageChart';
import { UserOutboundTable } from '@/components/admin/UserOutboundTable';

interface UserWithDetails {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  onboarded: boolean | null;
  created_at: string | null;
  isApproved: boolean;
  icpProfile?: {
    what_you_sell: string | null;
    who_is_it_for: string | null;
    problem_solved: string | null;
    ideal_customer: string | null;
    who_to_avoid: string | null;
    tone: number | null;
    success_definition: string | null;
  } | null;
}

interface ActivityLog {
  id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: any;
  created_at: string;
}

interface RunGroup {
  jobId: string;
  startLog: ActivityLog | null;
  completionLog: ActivityLog | null;
  failureLog: ActivityLog | null;
  stepLogs: ActivityLog[];
  summary: {
    status: 'completed' | 'failed' | 'running';
    duration?: number;
    prospects?: number;
    emails?: number;
    drafts?: number;
    sent?: number;
    conversations?: number;
  };
  cost?: {
    total: number;
    breakdown: {
      apollo?: number;
      clado?: number;
      hunter?: number;
      ai_generation?: number;
      composio?: number;
    };
  };
}

// API Pricing
const API_PRICING = {
  apollo: { credit_cost: 0.0016, person_search: 1 },
  clado: { search: 0.01, enrichment: 0.04 },
  hunter: { email_finder: 0.0199 },
  ai_generation: { email: 0.02 },
  composio: { email_send: 0.000249 },
};

export function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithDetails | null>(null);
  const [userLogs, setUserLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [creditManagementUser, setCreditManagementUser] = useState<UserWithDetails | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: approvedUsers, error: approvedError } = await supabase
        .from('approved_users')
        .select('email');

      if (approvedError) throw approvedError;

      const { data: icpProfiles, error: icpError } = await supabase
        .from('icp_profiles')
        .select('*');

      if (icpError) throw icpError;

      const approvedEmails = new Set(
        approvedUsers?.map((u) => u.email.toLowerCase()) || []
      );

      const usersWithDetails: UserWithDetails[] = (profiles || []).map((profile) => {
        const icpProfile = icpProfiles?.find((icp) => icp.user_id === profile.user_id);
        return {
          id: profile.id,
          user_id: profile.user_id,
          email: profile.email,
          full_name: profile.full_name,
          company_name: profile.company_name,
          onboarded: profile.onboarded,
          created_at: profile.created_at,
          isApproved: profile.email ? approvedEmails.has(profile.email.toLowerCase()) : false,
          icpProfile: icpProfile
            ? {
                what_you_sell: icpProfile.what_you_sell,
                who_is_it_for: icpProfile.who_is_it_for,
                problem_solved: icpProfile.problem_solved,
                ideal_customer: icpProfile.ideal_customer,
                who_to_avoid: icpProfile.who_to_avoid,
                tone: icpProfile.tone,
                success_definition: icpProfile.success_definition,
              }
            : null,
        };
      });

      setUsers(usersWithDetails);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleApprove = async (email: string, id: string) => {
    setActionLoading(id);
    try {
      const { error } = await supabase
        .from('approved_users')
        .insert({ email: email.toLowerCase() });

      if (error) throw error;
      toast.success('User approved successfully');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (email: string, id: string) => {
    setActionLoading(id);
    try {
      const { error } = await supabase
        .from('approved_users')
        .delete()
        .ilike('email', email);

      if (error) throw error;
      toast.success('User removed from approved list');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewUser = async (userItem: UserWithDetails) => {
    setSelectedUser(userItem);
    setLoadingLogs(true);
    try {
      const { data: logs, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userItem.user_id)
        .in('type', ['auto_run_started', 'auto_run_step', 'auto_run_completed', 'auto_run_failed'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUserLogs(logs || []);
    } catch (error) {
      toast.error('Failed to load user logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  const groupLogsByRun = (logs: ActivityLog[]): RunGroup[] => {
    const runs = new Map<string, RunGroup>();

    logs.forEach((log) => {
      const jobId = log.metadata?.job_id || 'unknown';
      if (!runs.has(jobId)) {
        runs.set(jobId, {
          jobId,
          startLog: null,
          completionLog: null,
          failureLog: null,
          stepLogs: [],
          summary: { status: 'running' },
        });
      }

      const run = runs.get(jobId)!;

      if (log.type === 'auto_run_started') {
        run.startLog = log;
      } else if (log.type === 'auto_run_completed') {
        run.completionLog = log;
        run.summary.status = 'completed';
        run.summary.duration = log.metadata?.duration_seconds;
        run.summary.prospects = log.metadata?.total_prospects_found;
        run.summary.emails = log.metadata?.total_emails_found;
        run.summary.drafts = log.metadata?.total_drafts_generated;
        run.summary.sent = log.metadata?.total_emails_sent;
      } else if (log.type === 'auto_run_failed') {
        run.failureLog = log;
        run.summary.status = 'failed';
        run.summary.duration = log.metadata?.duration_seconds;
      } else if (log.type === 'auto_run_step') {
        run.stepLogs.push(log);
      }
    });

    const runsWithCosts = Array.from(runs.values()).map((run) => {
      run.cost = calculateRunCost(run);
      return run;
    });

    return runsWithCosts.sort((a, b) => {
      const aTime = a.startLog?.created_at || a.completionLog?.created_at || '';
      const bTime = b.startLog?.created_at || b.completionLog?.created_at || '';
      return bTime.localeCompare(aTime);
    });
  };

  const calculateRunCost = (run: RunGroup): RunGroup['cost'] => {
    if (run.completionLog?.metadata?.cost_dollars !== undefined) {
      return {
        total: parseFloat(run.completionLog.metadata.cost_dollars) || 0,
        breakdown: run.completionLog.metadata.cost_breakdown || {},
      };
    }

    const breakdown: RunGroup['cost']['breakdown'] = {};
    let total = 0;

    run.stepLogs.forEach((stepLog) => {
      const metadata = stepLog.metadata || {};
      const step = metadata.step;

      if (step === 'search') {
        const apolloProspects = metadata.apollo_prospects_found || 0;
        const cladoProspects = metadata.clado_prospects_found || 0;
        if (apolloProspects > 0) {
          const cost = apolloProspects * API_PRICING.apollo.person_search * API_PRICING.apollo.credit_cost;
          breakdown.apollo = (breakdown.apollo || 0) + cost;
          total += cost;
        }
        if (cladoProspects > 0) {
          const cost = cladoProspects * API_PRICING.clado.search;
          breakdown.clado = (breakdown.clado || 0) + cost;
          total += cost;
        }
      }

      if (step === 'enrich') {
        const cladoEmails = metadata.clado_emails || 0;
        const enrichmentAttempts = metadata.enrichment_attempts || 0;
        if (cladoEmails > 0) {
          const cost = cladoEmails * API_PRICING.clado.enrichment;
          breakdown.clado = (breakdown.clado || 0) + cost;
          total += cost;
        }
        if (enrichmentAttempts > 0) {
          const cost = enrichmentAttempts * API_PRICING.hunter.email_finder;
          breakdown.hunter = (breakdown.hunter || 0) + cost;
          total += cost;
        }
      }

      if (step === 'draft') {
        const drafts = metadata.total_drafts_generated || 0;
        if (drafts > 0) {
          const cost = drafts * API_PRICING.ai_generation.email;
          breakdown.ai_generation = (breakdown.ai_generation || 0) + cost;
          total += cost;
        }
      }

      if (step === 'send') {
        const sends = metadata.successful_sends || 0;
        if (sends > 0) {
          const cost = sends * API_PRICING.composio.email_send;
          breakdown.composio = (breakdown.composio || 0) + cost;
          total += cost;
        }
      }
    });

    return { total: Math.round(total * 100) / 100, breakdown };
  };

  const getToneLabel = (tone: number | null) => {
    if (tone === null) return 'Not set';
    if (tone < 33) return 'Reserved';
    if (tone < 66) return 'Confident';
    return 'Bold';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const toggleRunExpansion = (jobId: string) => {
    const newExpanded = new Set(expandedRuns);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedRuns(newExpanded);
  };

  const getRunSummary = (run: RunGroup): string => {
    if (run.summary.status === 'failed') {
      return `Failed after ${run.summary.duration || 0}s`;
    }
    if (run.summary.status === 'completed') {
      return `${run.summary.duration || 0}s • ${run.summary.prospects || 0} prospects • ${run.summary.sent || 0} sent`;
    }
    return 'Running...';
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.company_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const approvedCount = users.filter((u) => u.isApproved).length;
  const pendingCount = users.filter((u) => !u.isApproved).length;
  const onboardedCount = users.filter((u) => u.onboarded).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border/50 shrink-0">
        <h1 className="text-lg font-bold">Admin Dashboard</h1>
        <p className="text-xs text-muted-foreground">Manage users, credits, and view analytics</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-2 shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="users" className="text-xs h-7 px-3">
              <i className="fa-solid fa-users mr-1.5 text-[10px]" />
              Users
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs h-7 px-3">
              <i className="fa-solid fa-chart-simple mr-1.5 text-[10px]" />
              Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Users Tab */}
        <TabsContent value="users" className="flex-1 flex flex-col min-h-0 mt-0 p-4 pt-3">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4 shrink-0">
            <div className="p-3 rounded-lg bg-card border border-border/50">
              <div className="text-xl font-bold">{users.length}</div>
              <div className="text-[10px] text-muted-foreground">Total Users</div>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border/50">
              <div className="text-xl font-bold text-green-600">{approvedCount}</div>
              <div className="text-[10px] text-muted-foreground">Approved</div>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border/50">
              <div className="text-xl font-bold text-yellow-600">{pendingCount}</div>
              <div className="text-[10px] text-muted-foreground">Pending</div>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border/50">
              <div className="text-xl font-bold text-blue-600">{onboardedCount}</div>
              <div className="text-[10px] text-muted-foreground">Onboarded</div>
            </div>
          </div>

          {/* Search */}
          <div className="flex gap-2 mb-3 shrink-0">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="flex-1 h-8 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsers}
              disabled={isLoading}
              className="h-8 w-8 p-0"
            >
              <i className={cn('fa-solid fa-rotate-right text-xs', isLoading && 'animate-spin')} />
            </Button>
          </div>

          {/* User Table */}
          <div className="flex-1 overflow-auto rounded-lg border border-border/50">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <i className="fa-solid fa-users text-3xl mb-2 opacity-20" />
                <p className="text-xs">No users found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-8 h-8"></TableHead>
                    <TableHead className="h-8">Email</TableHead>
                    <TableHead className="h-8">Name</TableHead>
                    <TableHead className="h-8">Company</TableHead>
                    <TableHead className="h-8">Status</TableHead>
                    <TableHead className="h-8">Joined</TableHead>
                    <TableHead className="h-8 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((userItem) => (
                    <Collapsible key={userItem.id} asChild>
                      <>
                        <TableRow className="text-xs hover:bg-muted/30">
                          <TableCell className="p-2">
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => toggleRow(userItem.id)}
                              >
                                <i
                                  className={cn(
                                    'fa-solid text-[8px]',
                                    expandedRows.has(userItem.id) ? 'fa-chevron-up' : 'fa-chevron-down'
                                  )}
                                />
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell
                            className="font-medium cursor-pointer hover:text-primary p-2"
                            onClick={() => handleViewUser(userItem)}
                          >
                            {userItem.email || '—'}
                          </TableCell>
                          <TableCell className="p-2">{userItem.full_name || '—'}</TableCell>
                          <TableCell className="p-2">{userItem.company_name || '—'}</TableCell>
                          <TableCell className="p-2">
                            <div className="flex gap-1">
                              {userItem.isApproved ? (
                                <Badge className="bg-green-500/20 text-green-600 text-[10px] h-4 px-1">
                                  Approved
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                  Pending
                                </Badge>
                              )}
                              {userItem.onboarded && (
                                <Badge className="bg-blue-500/20 text-blue-600 text-[10px] h-4 px-1">
                                  Onboarded
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="p-2">{formatDate(userItem.created_at)}</TableCell>
                          <TableCell className="p-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                onClick={() => setCreditManagementUser(userItem)}
                              >
                                <i className="fa-solid fa-coins mr-1" />
                                Credits
                              </Button>
                              {userItem.isApproved ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[10px] px-2 text-red-600 hover:bg-red-50"
                                  onClick={() => userItem.email && handleRemove(userItem.email, userItem.id)}
                                  disabled={actionLoading === userItem.id}
                                >
                                  Revoke
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[10px] px-2 text-green-600 hover:bg-green-50"
                                  onClick={() => userItem.email && handleApprove(userItem.email, userItem.id)}
                                  disabled={actionLoading === userItem.id}
                                >
                                  Approve
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/20">
                            <TableCell colSpan={7} className="p-0">
                              {expandedRows.has(userItem.id) && (
                                <div className="p-4 space-y-3">
                                  <h4 className="font-medium text-xs">ICP Profile</h4>
                                  {userItem.icpProfile ? (
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                      <div>
                                        <p className="text-[10px] text-muted-foreground">What do you sell?</p>
                                        <p>{userItem.icpProfile.what_you_sell || '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-muted-foreground">Who is it for?</p>
                                        <p>{userItem.icpProfile.who_is_it_for || '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-muted-foreground">Problem solved?</p>
                                        <p>{userItem.icpProfile.problem_solved || '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-muted-foreground">Ideal customer</p>
                                        <p>{userItem.icpProfile.ideal_customer || '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-muted-foreground">Who to avoid?</p>
                                        <p>{userItem.icpProfile.who_to_avoid || '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-muted-foreground">Tone</p>
                                        <p>{getToneLabel(userItem.icpProfile.tone)}</p>
                                      </div>
                                      <div className="col-span-2">
                                        <p className="text-[10px] text-muted-foreground">Success definition</p>
                                        <p>{userItem.icpProfile.success_definition || '—'}</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground italic">
                                      {userItem.onboarded ? 'No ICP profile found' : 'User has not completed onboarding'}
                                    </p>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-6">
              {/* Efficiency Metrics */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Platform Efficiency</h3>
                <EfficiencyMetrics />
              </div>

              {/* API Usage */}
              <ApiUsageChart />

              {/* Credit Analytics */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Credit Usage</h3>
                <CreditAnalytics />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ServiceBreakdownChart />
                <TopUsersChart />
              </div>

              {/* User Outbound Table */}
              <UserOutboundTable />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">User Details & Activity</DialogTitle>
            <DialogDescription className="text-xs">
              View user information and activity logs
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              {/* User Info */}
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedUser.email || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Name</p>
                      <p className="font-medium">{selectedUser.full_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Company</p>
                      <p className="font-medium">{selectedUser.company_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Joined</p>
                      <p className="font-medium">{formatDateTime(selectedUser.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Status</p>
                      <div className="flex gap-1 mt-0.5">
                        {selectedUser.isApproved ? (
                          <Badge className="bg-green-500/20 text-green-600 text-[10px] h-4 px-1">Approved</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">Pending</Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total Cost</p>
                      {(() => {
                        const runs = groupLogsByRun(userLogs);
                        const totalCost = runs.reduce((sum, run) => sum + (run.cost?.total || 0), 0);
                        return (
                          <p className="text-lg font-bold text-amber-600">${totalCost.toFixed(2)}</p>
                        );
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Activity Logs */}
              <Card className="border-border/50">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs">Activity Logs</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {loadingLogs ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : userLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">
                      No activity logs found
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {groupLogsByRun(userLogs).map((run) => (
                        <div key={run.jobId} className="p-3 rounded-lg border border-border/50 bg-card">
                          <Collapsible>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {run.summary.status === 'completed' && (
                                  <i className="fa-solid fa-circle-check text-green-500 text-xs" />
                                )}
                                {run.summary.status === 'failed' && (
                                  <i className="fa-solid fa-circle-xmark text-red-500 text-xs" />
                                )}
                                {run.summary.status === 'running' && (
                                  <i className="fa-solid fa-spinner fa-spin text-blue-500 text-xs" />
                                )}
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-xs">Run {run.jobId.slice(0, 8)}...</p>
                                    {run.cost && run.cost.total > 0 && (
                                      <Badge variant="outline" className="text-[10px] h-4 px-1 text-amber-600 border-amber-300">
                                        ${run.cost.total.toFixed(2)}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">
                                    {formatDateTime(run.startLog?.created_at)} • {getRunSummary(run)}
                                  </p>
                                </div>
                              </div>
                              <CollapsibleTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px]"
                                  onClick={() => toggleRunExpansion(run.jobId)}
                                >
                                  {expandedRuns.has(run.jobId) ? 'Collapse' : 'Expand'}
                                </Button>
                              </CollapsibleTrigger>
                            </div>

                            <CollapsibleContent>
                              <Separator className="my-2" />
                              <div className="space-y-2 text-xs">
                                {/* Cost Breakdown */}
                                {run.cost && run.cost.total > 0 && (
                                  <div className="p-2 bg-amber-500/10 rounded border border-amber-500/20">
                                    <p className="font-medium text-[10px] text-amber-600 mb-1">Cost Breakdown</p>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(run.cost.breakdown)
                                        .filter(([_, v]) => v > 0)
                                        .map(([api, cost]) => (
                                          <span key={api} className="text-[10px]">
                                            {api}: ${cost.toFixed(2)}
                                          </span>
                                        ))}
                                    </div>
                                  </div>
                                )}

                                {/* Start Log */}
                                {run.startLog && (
                                  <div className="p-2 bg-blue-500/10 rounded">
                                    <p className="font-medium text-[10px]">{run.startLog.title}</p>
                                    <p className="text-[10px] text-muted-foreground">{run.startLog.description}</p>
                                  </div>
                                )}

                                {/* Step Logs */}
                                {run.stepLogs
                                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                  .map((stepLog) => (
                                    <div key={stepLog.id} className="p-2 bg-muted/30 rounded">
                                      <p className="font-medium text-[10px]">{stepLog.title}</p>
                                      {stepLog.metadata && (
                                        <pre className="text-[9px] mt-1 p-1 bg-background rounded overflow-x-auto">
                                          {JSON.stringify(stepLog.metadata, null, 2)}
                                        </pre>
                                      )}
                                    </div>
                                  ))}

                                {/* Completion/Failure */}
                                {run.completionLog && (
                                  <div className="p-2 bg-green-500/10 rounded">
                                    <p className="font-medium text-[10px] text-green-600">{run.completionLog.title}</p>
                                    <p className="text-[10px] text-muted-foreground">{run.completionLog.description}</p>
                                  </div>
                                )}
                                {run.failureLog && (
                                  <div className="p-2 bg-red-500/10 rounded">
                                    <p className="font-medium text-[10px] text-red-600">{run.failureLog.title}</p>
                                    <p className="text-[10px] text-muted-foreground">{run.failureLog.description}</p>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Credit Management Dialog */}
      <CreditManagementDialog
        user={creditManagementUser}
        open={!!creditManagementUser}
        onOpenChange={(open) => !open && setCreditManagementUser(null)}
        onSuccess={() => fetchUsers()}
        adminEmail={user?.email || undefined}
      />
    </div>
  );
}

export default AdminPanel;
