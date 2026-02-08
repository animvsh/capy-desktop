import { ReactNode, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, isApproved, checkingApproval, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }

    // Redirect to waitlist if not approved
    if (!loading && !checkingApproval && user && !isApproved) {
      navigate("/waitlist");
    }
  }, [user, loading, isApproved, checkingApproval, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (loading || checkingApproval) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-muted-foreground/20" />
            <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          </div>
          <span className="text-sm text-muted-foreground animate-pulse">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user || !isApproved) {
    return null;
  }

  // Get user initials for avatar
  const userEmail = user.email || "";
  const userInitial = userEmail.charAt(0).toUpperCase();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto min-w-0">
          {/* Premium Header */}
          <header className={cn(
            "sticky top-0 z-20",
            "flex h-14 items-center justify-between gap-4",
            "border-b border-border/50 bg-background/80 backdrop-blur-xl",
            "px-4 md:px-6",
            "transition-all duration-300"
          )}>
            <div className="flex items-center gap-3">
              <SidebarTrigger className={cn(
                "-ml-2 p-2 rounded-lg",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-muted/80",
                "transition-all duration-200"
              )} />
              
              {/* Breadcrumb hint - subtle */}
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <span className="text-muted-foreground/50">/</span>
                <span className="text-muted-foreground font-medium">Overview</span>
              </div>
            </div>

            {/* Profile Dropdown - Premium styling */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center gap-2.5 h-10 px-2.5 rounded-xl",
                    "hover:bg-muted/80",
                    "transition-all duration-200",
                    "group"
                  )}
                >
                  <Avatar className={cn(
                    "h-8 w-8 rounded-lg",
                    "ring-2 ring-border/50 ring-offset-2 ring-offset-background",
                    "transition-all duration-200",
                    "group-hover:ring-primary/30"
                  )}>
                    <AvatarFallback className={cn(
                      "rounded-lg",
                      "bg-gradient-to-br from-primary/80 to-primary",
                      "text-primary-foreground text-sm font-semibold"
                    )}>
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <i className={cn(
                    "fa-solid fa-chevron-down text-[10px]",
                    "text-muted-foreground/60 group-hover:text-muted-foreground",
                    "transition-all duration-200",
                    "group-data-[state=open]:rotate-180"
                  )} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end" 
                className={cn(
                  "w-60 p-1.5",
                  "bg-card/95 backdrop-blur-xl",
                  "border border-border/50",
                  "rounded-xl shadow-xl shadow-black/10"
                )}
                sideOffset={8}
              >
                <DropdownMenuLabel className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 rounded-lg ring-1 ring-border/30">
                      <AvatarFallback className="rounded-lg bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-sm font-semibold">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col space-y-0.5 min-w-0">
                      <p className="text-sm font-medium text-foreground">Account</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {userEmail}
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1.5 bg-border/50" />
                <DropdownMenuItem
                  onClick={() => navigate("/settings")}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 mx-1 rounded-lg cursor-pointer",
                    "text-sm font-medium",
                    "hover:bg-muted/80 focus:bg-muted/80",
                    "transition-colors duration-150"
                  )}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/50">
                    <i className="fa-solid fa-gear text-xs text-muted-foreground" />
                  </div>
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1.5 bg-border/50" />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 mx-1 rounded-lg cursor-pointer",
                    "text-sm font-medium",
                    "text-red-500 hover:text-red-600",
                    "hover:bg-red-500/10 focus:bg-red-500/10",
                    "transition-colors duration-150"
                  )}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-red-500/10">
                    <i className="fa-solid fa-right-from-bracket text-xs text-red-500" />
                  </div>
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          
          {/* Main Content Area */}
          <div className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
