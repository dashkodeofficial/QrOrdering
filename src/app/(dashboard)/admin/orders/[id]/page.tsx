"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Receipt,
  Printer,
  Download,
  Plus,
  Minus,
  Trash2,
  XCircle,
  CheckCircle2,
  UtensilsCrossed,
  Calendar,
} from "lucide-react";
import {
  getAdminOrderDetails,
  getOrderInvoice,
  cancelOrder,
  updateOrderItem,
  removeOrderItem,
  markBillPaid,
  type AdminOrderDetails,
} from "@/actions/orders";
import { downloadInvoicePDF } from "@/lib/pdf";
import { buildReceiptHTML, printReceipt } from "@/lib/receipt-template";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Price } from "@/components/shared/price";
import { ORDER_STATUS_LABEL, formatDate } from "@/lib/format";
import { statusColor } from "@/lib/theme/colors";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminOrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<AdminOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getAdminOrderDetails(id);
    if (res.ok) {
      setOrder(res.data);
    } else {
      toast.error(res.error);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: update items and order when changes occur
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-order-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  async function handlePrint() {
    const res = await getOrderInvoice(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    printReceipt(res.data);
  }

  async function handleDownload() {
    const res = await getOrderInvoice(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const html = buildReceiptHTML(res.data);
    await downloadInvoicePDF(html, `invoice-${id.slice(0, 8)}.pdf`);
    toast.success("Invoice downloaded");
  }

  async function handleCancel() {
    setBusy("cancel");
    const res = await cancelOrder(id);
    if (res.ok) {
      toast.success("Order cancelled");
      router.push("/admin/orders");
    } else {
      toast.error(res.error);
    }
    setBusy(null);
  }

  async function handleMarkPaid() {
    setBusy("paid");
    const res = await markBillPaid(id);
    if (res.ok) {
      toast.success("Bill marked as paid. Table is now available.");
      router.push("/admin/orders");
    } else {
      toast.error(res.error);
    }
    setBusy(null);
  }

  async function handleQtyChange(itemId: string, currentQty: number, delta: number) {
    const newQty = currentQty + delta;
    if (newQty < 1) return;
    setBusy(`qty-${itemId}`);
    const res = await updateOrderItem(itemId, newQty);
    if (!res.ok) toast.error(res.error);
    setBusy(null);
  }

  async function handleRemoveItem(itemId: string) {
    setBusy(`rm-${itemId}`);
    const res = await removeOrderItem(itemId);
    if (!res.ok) toast.error(res.error);
    setBusy(null);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-card" />
        <div className="h-64 animate-pulse rounded-xl bg-card" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Receipt className="size-12 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-semibold">Order not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/orders")}>
          Back to Orders
        </Button>
      </div>
    );
  }

  const color = statusColor(order.status);
  const isCancelled = order.status === "CANCELLED";
  const isPlaced = order.status === "PLACED";

  // Group items by created_at batch (rounded to the second for grouping)
  const batches: { key: string; items: typeof order.items; label: string }[] = [];
  const batchMap = new Map<string, typeof order.items>();
  for (const item of order.items) {
    const batchKey = item.created_at;
    if (!batchMap.has(batchKey)) {
      batchMap.set(batchKey, []);
    }
    batchMap.get(batchKey)!.push(item);
  }
  for (const [key, items] of batchMap) {
    batches.push({ key, items, label: formatDate(key) });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push("/admin/orders")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
          <Receipt className="size-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-xs text-muted-foreground">
            {order.table_name ? `Table ${order.table_name}` : "Unknown table"} · {formatDate(order.created_at)}
          </p>
        </div>
        <Badge
          variant="secondary"
          className="shrink-0"
          style={{ backgroundColor: color + "18", color, borderColor: color + "30" }}
        >
          {ORDER_STATUS_LABEL[order.status] ?? order.status}
        </Badge>
      </div>

      {/* Order info card */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Table</p>
              <p className="font-bold text-sm">{order.table_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Items</p>
              <p className="font-bold text-sm">{order.items.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="font-medium text-sm flex items-center gap-1">
                <Calendar className="size-3" />
                {formatDate(order.created_at)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-bold text-sm" style={{ color }}>
                {ORDER_STATUS_LABEL[order.status] ?? order.status}
              </p>
            </div>
          </div>
          {order.notes && (
            <div className="mt-3 rounded-md bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Order Notes</p>
              <p className="text-sm mt-0.5">{order.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items grouped by batch */}
      <div className="space-y-4">
        {batches.map((batch, batchIdx) => (
          <div key={batch.key}>
            {batches.length > 1 && (
              <div className="mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground">
                  {batchIdx === 0 ? "Original Order" : "Added Later"} · {batch.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <Card className="border-border/50 overflow-hidden">
              <div className="divide-y divide-border/50">
                {batch.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <UtensilsCrossed className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Price cents={item.unit_price_cents} className="text-xs text-muted-foreground" />
                        {item.notes && (
                          <span className="text-xs text-muted-foreground/70 italic truncate">
                            · {item.notes}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity controls (only for PLACED orders) */}
                    {isPlaced ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={busy === `qty-${item.id}`}
                          onClick={() => handleQtyChange(item.id, item.quantity, -1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={busy === `qty-${item.id}`}
                          onClick={() => handleQtyChange(item.id, item.quantity, 1)}
                        >
                          <Plus className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          disabled={busy === `rm-${item.id}`}
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm font-bold w-8 text-center">{item.quantity}×</span>
                    )}

                    <Price
                      cents={item.unit_price_cents * item.quantity}
                      className="text-sm font-bold w-20 text-right"
                    />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))}
      </div>

      {/* Totals */}
      <Card className="border-border/50">
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <Price cents={order.subtotalCents} />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax ({order.taxRatePercent}%)</span>
            <Price cents={order.taxCents} />
          </div>
          {order.serviceChargeCents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Service Charge</span>
              <Price cents={order.serviceChargeCents} />
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2">
            <span className="font-bold">Total</span>
            <Price cents={order.total_cents} className="text-lg font-bold text-primary" />
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="flex-1" onClick={handlePrint}>
          <Printer className="mr-2 size-4" /> Print
        </Button>
        <Button variant="outline" className="flex-1" onClick={handleDownload}>
          <Download className="mr-2 size-4" /> Download
        </Button>
        {isPlaced && (
          <>
            <Button
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive"
              disabled={busy === "cancel"}
              onClick={handleCancel}
            >
              {busy === "cancel" ? (
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <XCircle className="mr-2 size-4" />
              )}
              Cancel Order
            </Button>
            <Button
              variant="default"
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={busy === "paid"}
              onClick={handleMarkPaid}
            >
              {busy === "paid" ? (
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <CheckCircle2 className="mr-2 size-4" />
              )}
              Mark as Paid
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
