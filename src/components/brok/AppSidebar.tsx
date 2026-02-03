import { useState, useEffect, useCallback } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

// Route prefetching map - disabled, pages not used
const routePrefetchMap: Record<string, () => Promise<any>> = {};

const prefetchRoute = (url: string) => {
  const prefetchFn = routePrefetchMap[url];
  if (prefetchFn) {
    prefetchFn().catch(() => {
      // Silently fail if prefetch fails
    });
  }
};

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { calculateTotalSpendingFromLogs } from "@/lib/calculateSpending";
import capyLogo from "@/assets/capy-logo.png";

interface NavItem {
  title: string;
  url: string;
  icon: string;
  color: string;
  children?: NavItem[];
}

const mainNavItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: "fa-solid fa-table-columns", color: "terracotta" },
  { title: "Email Leads", url: "/leads", icon: "fa-solid fa-envelope", color: "forest" },
  { title: "LinkedIn", url: "/linkedin", icon: "fa-brands fa-linkedin", color: "blue" },
  { title: "Billing", url: "/billing", icon: "fa-solid fa-credit-card", color: "sage" },
];

// Premium color configurations with gradients
const colorClasses: Record<string, { 
  gradient: string; 
  text: string; 
  activeBg: string;
  activeGlow: string;
  iconBg: string;
}> = {
  terracotta: { 
    gradient: "from-orange-500 to-orange-600",
    text: "text-orange-500", 
    activeBg: "bg-orange-500/10",
    activeGlow: "shadow-orange-500/20",
    iconBg: "bg-gradient-to-br from-orange-500/20 to-orange-600/10"
  },
  emerald: { 
    gradient: "from-emerald-500 to-emerald-600",
    text: "text-emerald-500", 
    activeBg: "bg-emerald-500/10",
    activeGlow: "shadow-emerald-500/20",
    iconBg: "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10"
  },
  forest: { 
    gradient: "from-emerald-600 to-emerald-700",
    text: "text-emerald-600", 
    activeBg: "bg-emerald-500/10",
    activeGlow: "shadow-emerald-500/20",
    iconBg: "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10"
  },
  clay: { 
    gradient: "from-rose-500 to-rose-600",
    text: "text-rose-500", 
    activeBg: "bg-rose-500/10",
    activeGlow: "shadow-rose-500/20",
    iconBg: "bg-gradient-to-br from-rose-500/20 to-rose-600/10"
  },
  sage: { 
    gradient: "from-teal-500 to-teal-600",
    text: "text-teal-500", 
    activeBg: "bg-teal-500/10",
    activeGlow: "shadow-teal-500/20",
    iconBg: "bg-gradient-to-br from-teal-500/20 to-teal-600/10"
  },
  sand: { 
    gradient: "from-amber-500 to-amber-600",
    text: "text-amber-500", 
    activeBg: "bg-amber-500/10",
    activeGlow: "shadow-amber-500/20",
    iconBg: "bg-gradient-to-br from-amber-500/20 to-amber-600/10"
  },
  rust: { 
    gradient: "from-red-500 to-red-600",
    text: "text-red-500", 
    activeBg: "bg-red-500/10",
    activeGlow: "shadow-red-500/20",
    iconBg: "bg-gradient-to-br from-red-500/20 to-red-600/10"
  },
  purple: { 
    gradient: "from-purple-500 to-purple-600",
    text: "text-purple-500", 
    activeBg: "bg-purple-500/10",
    activeGlow: "shadow-purple-500/20",
    iconBg: "bg-gradient-to-br from-purple-500/20 to-purple-600/10"
  },
  violet: { 
    gradient: "from-violet-500 to-violet-600",
    text: "text-violet-500", 
    activeBg: "bg-violet-500/10",
    activeGlow: "shadow-violet-500/20",
    iconBg: "bg-gradient-to-br from-violet-500/20 to-violet-600/10"
  },
  amber: { 
    gradient: "from-amber-500 to-amber-600",
    text: "text-amber-500", 
    activeBg: "bg-amber-500/10",
    activeGlow: "shadow-amber-500/20",
    iconBg: "bg-gradient-to-br from-amber-500/20 to-amber-600/10"
  },
  blue: { 
    gradient: "from-blue-500 to-blue-600",
    text: "text-blue-500", 
    activeBg: "bg-blue-500/10",
    activeGlow: "shadow-blue-500/20",
    iconBg: "bg-gradient-to-br from-blue-500/20 to-blue-600/10"
  },
  teal: { 
    gradient: "from-teal-500 to-teal-600",
    text: "text-teal-500", 
    activeBg: "bg-teal-500/10",
    activeGlow: "shadow-teal-500/20",
    iconBg: "bg-gradient-to-br from-teal-500/20 to-teal-600/10"
  },
};

interface CreditData {
  credits: number;
  totalSpent: number;
  purchased: number;
  adjustment: number;
}

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const collapsed = state === "collapsed";

  // Track expanded sections
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const [creditData, setCreditData] = useState<CreditData | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!user) return;
    setLoadingCredits(true);
    try {
      // Get purchased_credits from user_settings
      const { data: settings, error: settingsError } = await supabase
        .from("user_settings")
        .select("purchased_credits, admin_credit_adjustment")
        .eq("user_id", user.id)
        .maybeSingle();

      if (settingsError) {
        console.error("Error fetching settings:", settingsError);
      }

      const purchased = settings?.purchased_credits || 0;
      const adjustment = settings?.admin_credit_adjustment || 0;

      // Calculate total spending from logs (same as Store and Admin panel)
      const totalSpending = await calculateTotalSpendingFromLogs(user.id);

      // Calculate credits: 500 + purchased_credits + adjustment - (total_spending * 100)
      const totalSpentCredits = Math.ceil(totalSpending * 100);
      const credits = 500 + purchased + adjustment - totalSpentCredits;

      setCreditData({
        credits: Math.max(0, credits),
        totalSpent: totalSpentCredits,
        purchased,
        adjustment,
      });
    } catch (error) {
      console.error("Error fetching credits:", error);
      setCreditData({ credits: 500, totalSpent: 0, purchased: 0, adjustment: 0 });
    } finally {
      setLoadingCredits(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchCredits();

      // Subscribe to real-time credit updates
      const channel = supabase
        .channel('sidebar_credits')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'activity_logs',
            filter: `user_id=eq.${user.id}`,
          },
          () => fetchCredits()
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'activity_logs',
            filter: `user_id=eq.${user.id}`,
          },
          () => fetchCredits()
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_settings',
            filter: `user_id=eq.${user.id}`,
          },
          () => fetchCredits()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchCredits]);

  // Calculate progress percentage (total available = base + purchased + adjustment)
  const totalAvailable = creditData ? 500 + creditData.purchased + creditData.adjustment : 500;
  const progressPercent = creditData ? Math.min(100, (creditData.credits / totalAvailable) * 100) : 100;

  return (
    <Sidebar
      className="border-r border-border/50 bg-card/50 backdrop-blur-xl"
      collapsible="icon"
    >
      <SidebarHeader className={cn(
        "border-b border-border/50",
        collapsed ? "p-2.5" : "p-4"
      )}>
        <NavLink to="/dashboard" className="flex items-center gap-3 group">
          <div className="relative">
            <div className={cn(
              "absolute inset-0 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 blur-lg",
              "opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            )} />
            <img src={capyLogo} alt="Capy" className={cn(
              "relative transition-all duration-300",
              collapsed ? "h-8 w-8" : "h-9 w-9",
              "group-hover:scale-105"
            )} />
            <span className={cn(
              "absolute -top-0.5 -right-0.5",
              "w-2.5 h-2.5 rounded-full",
              "bg-gradient-to-br from-amber-400 to-amber-500",
              "animate-pulse shadow-lg shadow-amber-500/30"
            )} />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-base font-bold text-foreground tracking-tight">Capy</span>
              <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">AI Outreach</span>
            </div>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent className={cn(
        "py-3",
        collapsed ? "px-2" : "px-3"
      )}>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {mainNavItems.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const isExpanded = expandedSections.includes(item.title);
                const isChildActive = hasChildren && item.children?.some(child => location.pathname === child.url);
                const isActive = location.pathname === item.url || isChildActive;
                const colors = colorClasses[item.color];

                const toggleExpand = () => {
                  setExpandedSections(prev =>
                    prev.includes(item.title)
                      ? prev.filter(s => s !== item.title)
                      : [...prev, item.title]
                  );
                };

                return (
                  <SidebarMenuItem key={item.title}>
                    {hasChildren ? (
                      <>
                        <SidebarMenuButton
                          tooltip={item.title}
                          className="h-auto p-0"
                          onClick={toggleExpand}
                        >
                          <div
                            className={cn(
                              "flex items-center gap-2.5 rounded-xl px-2.5 py-2 w-full cursor-pointer",
                              "transition-all duration-200 ease-out",
                              collapsed && "justify-center px-2",
                              isActive
                                ? cn(colors.activeBg, colors.text, "shadow-sm", colors.activeGlow)
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                          >
                            <div className={cn(
                              "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200",
                              isActive ? cn("bg-gradient-to-br", colors.gradient, "text-white shadow-lg", colors.activeGlow) : colors.iconBg
                            )}>
                              <i className={cn(item.icon, "text-xs", !isActive && colors.text)} />
                            </div>
                            {!collapsed && (
                              <>
                                <span className="flex-1 text-sm font-medium">{item.title}</span>
                                <i className={cn(
                                  "fa-solid fa-chevron-down text-[10px] text-muted-foreground/50",
                                  "transition-transform duration-200",
                                  isExpanded && "rotate-180"
                                )} />
                              </>
                            )}
                          </div>
                        </SidebarMenuButton>
                        {/* Children */}
                        {isExpanded && !collapsed && (
                          <div className="ml-4 mt-1 space-y-0.5 border-l border-border/50 pl-3">
                            {item.children?.map((child) => {
                              const childActive = location.pathname === child.url;
                              const childColors = colorClasses[child.color];
                              return (
                                <NavLink
                                  key={child.title}
                                  to={child.url}
                                  onMouseEnter={() => prefetchRoute(child.url)}
                                  className={cn(
                                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium",
                                    "transition-all duration-200",
                                    childActive
                                      ? cn(childColors.activeBg, childColors.text)
                                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                  )}
                                >
                                  <i className={cn(child.icon, "text-[10px]", childActive && childColors.text)} />
                                  <span>{child.title}</span>
                                </NavLink>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className="h-auto p-0"
                      >
                        <NavLink
                          to={item.url}
                          onMouseEnter={() => prefetchRoute(item.url)}
                          onFocus={() => prefetchRoute(item.url)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-2.5 py-2 group/item",
                            "transition-all duration-200 ease-out",
                            collapsed && "justify-center px-2",
                            isActive
                              ? cn(colors.activeBg, colors.text, "shadow-sm", colors.activeGlow)
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          )}
                        >
                          <div className={cn(
                            "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200",
                            "group-hover/item:scale-105",
                            isActive ? cn("bg-gradient-to-br", colors.gradient, "text-white shadow-lg", colors.activeGlow) : colors.iconBg
                          )}>
                            <i className={cn(item.icon, "text-xs", !isActive && colors.text)} />
                          </div>
                          {!collapsed && <span className="text-sm font-medium">{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={cn(
        "border-t border-border/50",
        collapsed ? "p-2" : "p-3"
      )}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full gap-2.5 rounded-xl transition-all duration-200 h-auto py-2.5",
                "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent",
                "hover:from-amber-500/15 hover:via-amber-500/10 hover:to-amber-500/5",
                "border border-amber-500/20 hover:border-amber-500/30",
                "text-amber-600 dark:text-amber-400",
                "shadow-sm hover:shadow-md hover:shadow-amber-500/10",
                collapsed ? "justify-center px-2" : "justify-between px-3"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-lg",
                  "bg-gradient-to-br from-amber-500/30 to-amber-600/20"
                )}>
                  <i className="fa-solid fa-coins text-xs text-amber-500" />
                </div>
                {!collapsed && (
                  <span className="text-sm font-semibold tabular-nums">
                    {loadingCredits ? "..." : creditData?.credits.toLocaleString() ?? "500"}
                  </span>
                )}
              </div>
              {!collapsed && <i className="fa-solid fa-chevron-up text-[10px] opacity-50" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className={cn(
              "w-72 p-5",
              "bg-card/95 backdrop-blur-xl",
              "border border-border/50",
              "shadow-xl shadow-black/10 rounded-xl"
            )}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground">Credit Balance</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchCredits}
                  className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg"
                >
                  <i className="fa-solid fa-rotate-right text-[10px] mr-1.5" />
                  Refresh
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-semibold text-amber-500 tabular-nums">
                    {creditData?.credits.toLocaleString() ?? 500} credits
                  </span>
                </div>
                <div className="relative">
                  <Progress
                    value={progressPercent}
                    className="h-2.5 bg-muted/50 rounded-full overflow-hidden"
                  />
                  <div 
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground/60 text-right">
                  {progressPercent.toFixed(0)}% remaining
                </p>
              </div>

              {/* Credit Breakdown */}
              <div className="space-y-2 pt-3 border-t border-border/50">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Base credits</span>
                  <span className="tabular-nums">500</span>
                </div>
                {creditData && creditData.purchased > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Purchased</span>
                    <span className="text-emerald-500 tabular-nums">+{creditData.purchased.toLocaleString()}</span>
                  </div>
                )}
                {creditData && creditData.adjustment !== 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Adjustments</span>
                    <span className={cn(
                      "tabular-nums",
                      creditData.adjustment > 0 ? "text-emerald-500" : "text-red-500"
                    )}>
                      {creditData.adjustment > 0 ? "+" : ""}{creditData.adjustment.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Used</span>
                  <span className="text-red-500 tabular-nums">-{creditData?.totalSpent.toLocaleString() ?? 0}</span>
                </div>
              </div>

              {/* Buy More Credits Button */}
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-full gap-2 rounded-xl",
                  "border-amber-500/30 text-amber-600 dark:text-amber-400",
                  "hover:bg-amber-500/10 hover:border-amber-500/50",
                  "transition-all duration-200"
                )}
                onClick={() => navigate("/billing")}
              >
                <i className="fa-solid fa-credit-card text-xs" />
                Buy Credits
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </SidebarFooter>
    </Sidebar>
  );
}
