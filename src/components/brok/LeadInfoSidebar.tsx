import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface Lead {
  id: string;
  name: string;
  email: string;
  company: string | null;
  title: string | null;
  linkedin_url: string | null;
  icp_score: number | null;
  status: string | null;
}

interface LeadInfoSidebarProps {
  lead: Lead | null;
  onBlacklist?: () => void;
}

export function LeadInfoSidebar({ lead, onBlacklist }: LeadInfoSidebarProps) {
  if (!lead) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No lead information available
      </div>
    );
  }

  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted text-muted-foreground";
    if (score >= 80) return "bg-forest text-white";
    if (score >= 60) return "bg-sage text-white";
    if (score >= 40) return "bg-sand text-white";
    return "bg-clay text-white";
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Lead Header */}
      <div className="text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-forest text-white text-xl font-bold mb-3">
          {(lead.name || "?").charAt(0).toUpperCase()}
        </div>
        <h3 className="text-lg font-semibold text-foreground">{lead.name || "Unknown"}</h3>
        {lead.title && (
          <p className="text-sm text-muted-foreground">{lead.title}</p>
        )}
      </div>

      {/* ICP Score */}
      <div className="flex items-center justify-center gap-2">
        <i className="fa-solid fa-bullseye h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">ICP Score:</span>
        <Badge className={getScoreColor(lead.icp_score)}>
          {lead.icp_score ?? "N/A"}
        </Badge>
      </div>

      {/* Lead Details */}
      <div className="space-y-3">
        {lead.company && (
          <div className="flex items-center gap-3 text-sm">
            <i className="fa-solid fa-building h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-foreground truncate">{lead.company}</span>
          </div>
        )}
        <div className="flex items-center gap-3 text-sm">
          <i className="fa-solid fa-envelope h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-foreground truncate">{lead.email}</span>
        </div>
        {lead.linkedin_url && (
          <a
            href={lead.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-sm text-primary hover:underline"
          >
            <i className="fa-brands fa-linkedin h-4 w-4 shrink-0" />
            <span className="truncate">View LinkedIn</span>
            <i className="fa-solid fa-arrow-up-right-from-square h-3 w-3" />
          </a>
        )}
      </div>

      {/* Status Badge */}
      <div className="pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge variant="outline" className="capitalize">
            {lead.status || "Unknown"}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={onBlacklist}
        >
          <i className="fa-solid fa-ban h-4 w-4 mr-2" />
          Blacklist Company
        </Button>
      </div>
    </div>
  );
}
