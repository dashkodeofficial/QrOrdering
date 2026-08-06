"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { LayoutGrid, Plus } from "lucide-react";
import { getTablesForOrdersGrid, type TableWithOrder } from "@/actions/orders";
import { createClient } from "@/lib/supabase/client";
import { playOrderSound } from "@/lib/sound";
import { TableCard3D } from "@/components/dashboard/table-card-3d";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function OrdersPage() {
  const [tables, setTables] = useState<TableWithOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await getTablesForOrdersGrid();
    if (res.ok) {
      setTables(res.data);
    } else {
      toast.error(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: refresh grid when orders or tables change
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-tables-grid-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            playOrderSound();
            toast.info("New order received", {
              description: "A table has placed a new order",
            });
          }
          load();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tables" },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const activeCount = tables.filter((t) => t.active_order_id).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
            <LayoutGrid className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Tables</h1>
            <p className="text-xs text-muted-foreground">
              {tables.length} table{tables.length !== 1 ? "s" : ""} · {activeCount} active order{activeCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button size="sm" className="h-8" asChild>
          <Link href="/admin/orders/new">
            <Plus className="size-4 mr-1" /> Create Order
          </Link>
        </Button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-border/50 bg-card"
            />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <EmptyState
          icon="🪑"
          title="No tables yet"
          description="Create tables in the Tables page to see them here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tables.map((table) => (
            <TableCard3D key={table.id} table={table} />
          ))}
        </div>
      )}

      {/* Legend */}
      {!loading && tables.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" />
            Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary" />
            Active Order — click to view details
          </span>
        </div>
      )}
    </div>
  );
}
