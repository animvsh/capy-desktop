import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";

interface BlacklistEntry {
  id: string;
  domain: string | null;
  company_name: string | null;
  reason: string | null;
  created_at: string;
}

export function BlacklistManager() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEntry, setNewEntry] = useState("");
  const [entryType, setEntryType] = useState<"domain" | "company">("domain");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchBlacklist();
    }
  }, [user]);

  const fetchBlacklist = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("blacklist")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setEntries(data);
    }
    setLoading(false);
  };

  const addEntry = async () => {
    if (!user || !newEntry.trim()) return;
    setAdding(true);

    const insertData: any = {
      user_id: user.id,
      reason: "Manually blocked",
    };

    if (entryType === "domain") {
      // Clean up domain input
      let domain = newEntry.trim().toLowerCase();
      domain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      insertData.domain = domain;
    } else {
      insertData.company_name = newEntry.trim();
    }

    const { error } = await supabase.from("blacklist").insert(insertData);

    if (error) {
      toast.error("Failed to add to blacklist");
    } else {
      toast.success("Added to blacklist");
      setNewEntry("");
      fetchBlacklist();
    }
    setAdding(false);
  };

  const removeEntry = async (id: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("blacklist").delete().eq("id", id);

    if (error) {
      toast.error("Failed to remove from blacklist");
    } else {
      toast.success("Removed from blacklist");
      setEntries(entries.filter(e => e.id !== id));
    }
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add new entry */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex rounded-xl border-2 border-border overflow-hidden">
          <button
            onClick={() => setEntryType("domain")}
            className={`px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              entryType === "domain"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
            }`}
          >
            <i className="fa-solid fa-globe h-3.5 w-3.5" />
            Domain
          </button>
          <button
            onClick={() => setEntryType("company")}
            className={`px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              entryType === "company"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
            }`}
          >
            <i className="fa-solid fa-building h-3.5 w-3.5" />
            Company
          </button>
        </div>
        <div className="flex-1 flex gap-2">
          <Input
            placeholder={entryType === "domain" ? "example.com" : "Company Name"}
            value={newEntry}
            onChange={(e) => setNewEntry(e.target.value)}
            className="rounded-xl"
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
          />
          <Button
            onClick={addEntry}
            disabled={!newEntry.trim() || adding}
            className="rounded-xl shrink-0"
          >
            {adding ? <i className="fa-solid fa-spinner fa-spin h-4 w-4" /> : <i className="fa-solid fa-plus h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div className="text-center py-8">
          <i className="fa-solid fa-building h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No blocked companies or domains</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add domains or company names to prevent Capy from contacting them
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {entries.map((entry) => {
            const getIcon = () => {
              if (entry.domain) return <i className="fa-solid fa-globe h-4 w-4 text-muted-foreground shrink-0" />;
              return <i className="fa-solid fa-building h-4 w-4 text-muted-foreground shrink-0" />;
            };

            const getLabel = () => {
              if (entry.domain) return entry.domain;
              if (entry.company_name) return entry.company_name;
              return "Unknown";
            };

            const getTypeLabel = () => {
              if (entry.domain) return "Domain";
              if (entry.company_name) return "Company";
              return "";
            };

            return (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getIcon()}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">
                      {getLabel()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getTypeLabel()}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEntry(entry.id)}
                  disabled={deletingId === entry.id}
                  className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  {deletingId === entry.id ? (
                    <i className="fa-solid fa-spinner fa-spin h-4 w-4" />
                  ) : (
                    <i className="fa-solid fa-trash h-4 w-4" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {entries.length} {entries.length === 1 ? "entry" : "entries"} blocked
      </p>
    </div>
  );
}
