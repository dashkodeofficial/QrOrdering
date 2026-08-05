"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Bell,
  Receipt,
  X,
  Check,
  ChevronRight,
  Droplets,
  UtensilsCrossed,
  HelpCircle,
  ConciergeBell,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPendingRequests, resolveRequest, type PendingRequest } from "@/actions/requests";
import { playRequestSound } from "@/lib/sound";
import { WAITER_REQUEST_LABEL } from "@/lib/format";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const REQUEST_ICONS: Record<string, React.ElementType> = {
  CALL_WAITER: ConciergeBell,
  NEED_WATER: Droplets,
  NEED_CUTLERY: UtensilsCrossed,
  NEED_ASSISTANCE: HelpCircle,
  REQUEST_BILL: Receipt,
};

export function RequestsPanel() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  const loadRequests = useCallback(async () => {
    const res = await getPendingRequests();
    if (res.ok) {
      setRequests(res.data);
      knownIds.current = new Set(res.data.map((r) => r.id));
    }
  }, []);

  useEffect(() => {
    loadRequests();

    const supabase = createClient();
    const channel = supabase
      .channel("admin-requests-panel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "waiter_requests" },
        (payload) => {
          const newReq = payload.new as PendingRequest;
          if (knownIds.current.has(newReq.id)) return;
          knownIds.current.add(newReq.id);

          playRequestSound();

          setRequests((prev) => {
            return [newReq, ...prev.filter((r) => r.id !== newReq.id)];
          });

          toast.info(`New request: ${WAITER_REQUEST_LABEL[newReq.type] ?? newReq.type}`, {
            description: newReq.table_name
              ? `Table ${newReq.table_name}`
              : "Unknown table",
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "waiter_requests" },
        (payload) => {
          const updated = payload.new as PendingRequest;
          if (updated.status === "RESOLVED") {
            knownIds.current.delete(updated.id);
            setRequests((prev) => prev.filter((r) => r.id !== updated.id));
          } else {
            setRequests((prev) =>
              prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRequests]);

  async function handleResolve(id: string) {
    setResolving(id);
    const res = await resolveRequest(id);
    if (!res.ok) {
      toast.error(res.error);
    } else {
      knownIds.current.delete(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    }
    setResolving(null);
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <>
      {/* Floating toggle button (always visible) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed right-4 top-20 z-50 flex items-center gap-2 rounded-full bg-primary px-3 py-2.5 text-primary-foreground shadow-lg transition-all hover:shadow-xl",
          open && "opacity-0 pointer-events-none",
        )}
      >
        <Bell className="size-5" />
        {pendingCount > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-80 max-w-[85vw] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <h2 className="text-sm font-bold">Customer Requests</h2>
            {pendingCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No pending requests</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                New customer requests will appear here in real time.
              </p>
            </div>
          ) : (
            requests.map((req) => {
              const Icon = REQUEST_ICONS[req.type] ?? Bell;
              return (
                <div
                  key={req.id}
                  className={cn(
                    "rounded-xl border p-3 transition-all",
                    req.status === "PENDING"
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-muted/30",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {WAITER_REQUEST_LABEL[req.type] ?? req.type}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {req.table_name ? `Table ${req.table_name}` : "Unknown table"}
                        {" · "}
                        {timeAgo(req.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleResolve(req.id)}
                    disabled={resolving === req.id}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {resolving === req.id ? (
                      <>
                        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Resolving...
                      </>
                    ) : (
                      <>
                        <Check className="size-3.5" />
                        Acknowledge
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2.5">
          <button
            onClick={() => loadRequests()}
            className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="size-3 rotate-90" />
            Refresh
          </button>
        </div>
      </div>

      {/* Backdrop on mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
