"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Price } from "@/components/shared/price";
import type { TableWithOrder } from "@/actions/orders";

interface TableCard3DProps {
  table: TableWithOrder;
}

export function TableCard3D({ table }: TableCard3DProps) {
  const router = useRouter();
  const hasOrder = !!table.active_order_id;
  const isAvailable = table.status === "AVAILABLE";

  function handleClick() {
    if (hasOrder && table.active_order_id) {
      router.push(`/admin/orders/${table.active_order_id}`);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!hasOrder}
      className={cn(
        "group relative flex flex-col items-center rounded-2xl border p-4 transition-all duration-300",
        hasOrder
          ? "border-primary/20 bg-card cursor-pointer hover:-translate-y-1 hover:shadow-lg"
          : "border-border/50 bg-card/50",
        !hasOrder && "cursor-default",
      )}
    >
      {/* Table image */}
      <div className="relative mb-3 h-28 w-full flex items-center justify-center">
        {/* Status glow ring */}
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-500",
            hasOrder ? "opacity-100" : "opacity-70",
          )}
          style={{
            width: "100px",
            height: "100px",
            background: hasOrder
              ? "radial-gradient(circle, rgba(220,38,38,0.12) 0%, transparent 65%)"
              : "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 65%)",
          }}
        />

        <Image
          src="/images/dining.png"
          alt="Dining table"
          width={120}
          height={120}
          className={cn(
            "relative transition-transform duration-500 ease-out",
            hasOrder && "group-hover:scale-110",
          )}
          style={{
            filter: hasOrder
              ? "drop-shadow(0 4px 8px rgba(220,38,38,0.15))"
              : "drop-shadow(0 4px 8px rgba(0,0,0,0.1))",
          }}
          priority
        />

        {/* Subtle status tint overlay */}
        {!hasOrder && (
          <div
            className="pointer-events-none absolute inset-0 rounded-lg"
            style={{
              background:
                "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, transparent 60%)",
            }}
          />
        )}
      </div>

      {/* Table name */}
      <p className="text-sm font-bold text-foreground">{table.name}</p>

      {/* Status badge */}
      <span
        className={cn(
          "mt-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
          hasOrder
            ? "bg-primary/10 text-primary"
            : "bg-emerald-500/10 text-emerald-600",
        )}
      >
        {hasOrder ? "Active Order" : "Available"}
      </span>

      {/* Order summary (if active) */}
      {hasOrder && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{table.active_order_item_count} items</span>
          <span>·</span>
          <Price
            cents={table.active_order_total_cents ?? 0}
            className="font-semibold text-foreground"
          />
        </div>
      )}
    </button>
  );
}
