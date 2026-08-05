"use client";

import { useEffect, useState } from "react";
import {
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Printer,
  Download,
  Eye,
  Filter,
  Calendar,
  UtensilsCrossed,
} from "lucide-react";
import { getAllOrders, getOrderInvoice, type OrderHistoryItem } from "@/actions/orders";
import { downloadInvoicePDF } from "@/lib/pdf";
import { buildReceiptHTML, printReceipt } from "@/lib/receipt-template";
import { playOrderSound } from "@/lib/sound";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Price } from "@/components/shared/price";
import { ORDER_STATUS_LABEL, formatDate } from "@/lib/format";
import { statusColor } from "@/lib/theme/colors";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "All Orders" },
  { value: "PLACED", label: "Placed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [detailOrder, setDetailOrder] = useState<OrderHistoryItem | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Reset to page 1 when the status filter changes — handled in the click
  // handler instead of a separate effect to avoid synchronous setState in
  // an effect body (react-hooks/set-state-in-effect).
  function changeStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await getAllOrders(page, PAGE_SIZE, statusFilter);
      if (res.ok) {
        setOrders(res.data.orders);
        setTotal(res.data.total);
      } else {
        toast.error(res.error);
      }
      setLoading(false);
    }
    load();
  }, [page, statusFilter]);

  // Realtime: subscribe to orders table for instant updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-orders-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new as OrderHistoryItem;
          playOrderSound();

          // Only prepend if it matches the current filter
          if (statusFilter === "ALL" || statusFilter === newOrder.status) {
            setOrders((prev) => {
              if (prev.some((o) => o.id === newOrder.id)) return prev;
              return [newOrder, ...prev];
            });
            setTotal((prev) => prev + 1);
          }

          toast.info("New order received", {
            description: `Order #${newOrder.id.slice(0, 8).toUpperCase()}`,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updated = payload.new as OrderHistoryItem;
          setOrders((prev) =>
            prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter]);

  async function handlePrintInvoice(orderId: string) {
    const res = await getOrderInvoice(orderId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    printReceipt(res.data);
  }

  async function handleDownloadInvoice(orderId: string) {
    const res = await getOrderInvoice(orderId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const html = buildReceiptHTML(res.data);
    await downloadInvoicePDF(html, `invoice-${orderId.slice(0, 8)}.pdf`);
    toast.success("Invoice downloaded");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
          <ShoppingBag className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Orders</h1>
          <p className="text-xs text-muted-foreground">
            {total} order{total !== 1 ? "s" : ""} total
          </p>
        </div>
      </div>

      {/* Status filter bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="size-4 shrink-0 text-muted-foreground" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => changeStatusFilter(f.value)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              statusFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState icon="📦" title="No orders found" description="Orders will appear here once they are placed." />
      ) : (
        <>
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onView={() => setDetailOrder(order)}
                onPrint={() => handlePrintInvoice(order.id)}
                onDownload={() => handleDownloadInvoice(order.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Order detail dialog */}
      <OrderDetailDialog
        order={detailOrder}
        onClose={() => setDetailOrder(null)}
        onPrint={() => detailOrder && handlePrintInvoice(detailOrder.id)}
        onDownload={() => detailOrder && handleDownloadInvoice(detailOrder.id)}
      />
    </div>
  );
}

function OrderRow({
  order,
  onView,
  onPrint,
  onDownload,
}: {
  order: OrderHistoryItem;
  onView: () => void;
  onPrint: () => void;
  onDownload: () => void;
}) {
  const color = statusColor(order.status);

  return (
    <Card className="overflow-hidden border-border/50 transition-all hover:shadow-md">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: color + "18", color }}
          >
            <Receipt className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm truncate">
                #{order.id.slice(0, 8).toUpperCase()}
              </p>
              <Badge
                variant="secondary"
                className="text-[10px] shrink-0"
                style={{
                  backgroundColor: color + "18",
                  color: color,
                  borderColor: color + "30",
                }}
              >
                {ORDER_STATUS_LABEL[order.status] ?? order.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <UtensilsCrossed className="size-3" />
                {order.table_name ?? "Table"}
              </span>
              <span className="flex items-center gap-1">
                <ShoppingBag className="size-3" />
                {order.item_count} item{order.item_count !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="size-3" />
                {formatDate(order.created_at)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Price cents={order.total_cents} className="text-base font-bold text-primary" />
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={onView} title="View details">
              <Eye className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={onPrint} title="Print invoice">
              <Printer className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={onDownload} title="Download invoice">
              <Download className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrderDetailDialog({
  order,
  onClose,
  onPrint,
  onDownload,
}: {
  order: OrderHistoryItem | null;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
}) {
  if (!order) return null;
  const color = statusColor(order.status);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            Order #{order.id.slice(0, 8).toUpperCase()}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge
                variant="secondary"
                className="mt-1"
                style={{
                  backgroundColor: color + "18",
                  color: color,
                  borderColor: color + "30",
                }}
              >
                {ORDER_STATUS_LABEL[order.status] ?? order.status}
              </Badge>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Table</p>
              <p className="font-bold text-sm">{order.table_name ?? "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="font-medium text-sm">{formatDate(order.created_at)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Items</span>
              <span className="font-bold">{order.item_count}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <Price cents={order.total_cents} className="text-lg font-bold text-primary" />
            </div>
            {order.notes && (
              <div className="mt-3 rounded-md bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm mt-0.5">{order.notes}</p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onPrint}>
              <Printer className="mr-2 size-4" /> Print
            </Button>
            <Button variant="outline" className="flex-1" onClick={onDownload}>
              <Download className="mr-2 size-4" /> Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
