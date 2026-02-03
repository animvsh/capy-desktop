/**
 * LinkedInPanel - LinkedIn content wrapper
 * Shows Coming Soon status for LinkedIn integration
 */

import { Badge } from '@/components/ui/badge';

export function LinkedInPanel() {
  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6">
        {/* Header with Coming Soon badge */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">LinkedIn Outreach</h1>
              <Badge className="bg-blue-500 text-white border-0 px-3 py-1 text-xs font-medium">
                Coming Soon
              </Badge>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Manage your LinkedIn connections and outreach</p>
          </div>
        </div>

        {/* Coming Soon Card */}
        <div className="relative rounded-2xl border border-dashed border-[#0A66C2]/30 p-8 text-center overflow-hidden">
          {/* Coming Soon Overlay */}
          <div className="absolute top-4 right-4">
            <div className="bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-full">
              🚀 Coming Soon
            </div>
          </div>
          
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-[#0A66C2]/10 mb-4 relative">
            <i className="fa-brands fa-linkedin text-3xl text-[#0A66C2]" />
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
              <i className="fa-solid fa-clock text-white text-[8px]" />
            </div>
          </div>
          <h2 className="text-xl font-bold mb-2">LinkedIn Integration</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            We're working on LinkedIn automation! Soon you'll be able to connect your LinkedIn account to manage outreach, track connections, and automate follow-ups.
          </p>
          
          {/* What's coming */}
          <div className="inline-flex flex-col gap-2 text-left bg-card/50 rounded-xl p-4 border border-border/50">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">What's Coming:</div>
            <div className="flex items-center gap-2 text-sm">
              <i className="fa-solid fa-check text-emerald-500 text-xs" />
              <span>Automated connection requests</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <i className="fa-solid fa-check text-emerald-500 text-xs" />
              <span>Personalized message sequences</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <i className="fa-solid fa-check text-emerald-500 text-xs" />
              <span>Lead import from LinkedIn</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <i className="fa-solid fa-check text-emerald-500 text-xs" />
              <span>Analytics & tracking</span>
            </div>
          </div>
        </div>

        {/* Feature cards - with disabled/coming soon style */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 opacity-60">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A66C2]/10 text-[#0A66C2]">
                <i className="fa-solid fa-user-plus" />
              </div>
              <div>
                <h3 className="font-semibold">Connection Requests</h3>
                <span className="text-[10px] text-purple-500 font-medium">Coming Soon</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Send personalized connection requests to prospects matching your ICP.
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/50 p-4 opacity-60">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A66C2]/10 text-[#0A66C2]">
                <i className="fa-solid fa-message" />
              </div>
              <div>
                <h3 className="font-semibold">Message Sequences</h3>
                <span className="text-[10px] text-purple-500 font-medium">Coming Soon</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Automate follow-up messages with personalized templates.
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/50 p-4 opacity-60">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A66C2]/10 text-[#0A66C2]">
                <i className="fa-solid fa-chart-simple" />
              </div>
              <div>
                <h3 className="font-semibold">Analytics</h3>
                <span className="text-[10px] text-purple-500 font-medium">Coming Soon</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Track acceptance rates, response rates, and conversion metrics.
            </p>
          </div>
        </div>

        {/* Notify me section */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Want to be notified when LinkedIn integration launches?
          </p>
          <p className="text-xs text-muted-foreground/70">
            Stay tuned - we'll announce it in the app! 🔔
          </p>
        </div>
      </div>
    </div>
  );
}

export default LinkedInPanel;
