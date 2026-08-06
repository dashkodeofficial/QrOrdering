"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Minus,
  ShoppingCart,
  UtensilsCrossed,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Price } from "@/components/shared/price";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { placeOrder, createTakeawayOrder } from "@/actions/orders";
import { getPublicSettings } from "@/actions/settings";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Category, MenuItem, RestaurantTable } from "@/lib/types/db";

interface CartLine {
  menu_item_id: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
  notes: string;
}

export default function CreateOrderPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEAWAY">("DINE_IN");
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderNotes, setOrderNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [taxRatePercent, setTaxRatePercent] = useState(0);
  const [serviceChargeAmount, setServiceChargeAmount] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const [catRes, itemRes, tableRes, settings] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("menu_items").select("*").eq("available", true).order("sort_order"),
        supabase.from("tables").select("*").order("name"),
        getPublicSettings(),
      ]);
      if (!active) return;
      setCategories(catRes.data ?? []);
      setMenuItems(itemRes.data ?? []);
      setTables(tableRes.data ?? []);
      setTaxRatePercent(settings.tax_rate_percent);
      setServiceChargeAmount(settings.service_charge_amount);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const filteredItems = useMemo(() => {
    let items = menuItems;
    if (activeCategory !== "all") {
      items = items.filter((i) => i.category_id === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return items;
  }, [menuItems, activeCategory, searchQuery]);

  const totalCents = useMemo(
    () => cart.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0),
    [cart],
  );
  const taxCents = Math.round(totalCents * taxRatePercent / 100);
  const grandTotalCents = totalCents + taxCents + serviceChargeAmount;

  const addToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.menu_item_id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menu_item_id === item.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          unit_price_cents: item.price_cents,
          quantity: 1,
          notes: "",
        },
      ];
    });
  }, []);

  const changeQty = useCallback((id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.menu_item_id === id ? { ...l, quantity: l.quantity + delta } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }, []);

  async function handlePlaceOrder() {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (orderType === "DINE_IN" && !selectedTableId) {
      toast.error("Please select a table");
      return;
    }
    setPlacing(true);

    const items = cart.map((l) => ({
      menu_item_id: l.menu_item_id,
      name: l.name,
      unit_price_cents: l.unit_price_cents,
      quantity: l.quantity,
      notes: l.notes,
    }));

    const result =
      orderType === "DINE_IN"
        ? await placeOrder({ items, notes: orderNotes, tableId: selectedTableId })
        : await createTakeawayOrder({ items, notes: orderNotes });

    if (!result.ok) {
      toast.error(result.error);
      setPlacing(false);
      return;
    }

    toast.success("Order created!");
    router.replace(`/admin/orders/${result.data.orderId}`);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
          <Link href="/admin/orders">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
          <Plus className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Create Order</h1>
          <p className="text-xs text-muted-foreground">
            Select items from the menu and place an order
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left: Menu */}
        <div className="space-y-4">
          {/* Order type toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setOrderType("DINE_IN")}
              className={cn(
                "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                orderType === "DINE_IN"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              Table Order
            </button>
            <button
              onClick={() => setOrderType("TAKEAWAY")}
              className={cn(
                "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                orderType === "TAKEAWAY"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              Takeaway / Delivery
            </button>
          </div>

          {/* Table selector (dine-in only) */}
          {orderType === "DINE_IN" && (
            <div className="rounded-lg border border-border/50 bg-card p-4">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Table
              </Label>
              <select
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium"
              >
                <option value="">Choose a table...</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.seat_capacity} seats)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 pl-10 pr-9 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Category filter */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Categories</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveCategory("all")}
                className={cn(
                  "shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  activeCategory === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50",
                )}
              >
                All Items
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={cn(
                    "shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                    activeCategory === c.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Menu items grid */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {filteredItems.map((item) => {
              const inCart = cart.find((l) => l.menu_item_id === item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3.5 text-left transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <UtensilsCrossed className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {item.description}
                      </p>
                    )}
                    <Price cents={item.price_cents} className="text-xs font-medium text-primary mt-1" />
                  </div>
                  {inCart && (
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {inCart.quantity}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="size-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? `No items found for "${searchQuery}"`
                  : "No items available in this category."}
              </p>
            </div>
          )}
        </div>

        {/* Right: Cart sidebar */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-border/50 bg-card">
            {/* Cart header */}
            <div className="flex items-center gap-2 border-b border-border/50 p-4">
              <ShoppingCart className="size-4 text-primary" />
              <span className="text-sm font-bold">
                Cart ({cart.reduce((s, l) => s + l.quantity, 0)})
              </span>
            </div>

            {/* Cart items */}
            <div className="max-h-[300px] overflow-y-auto p-4">
              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Add items from the menu
                </p>
              ) : (
                <div className="space-y-2">
                  {cart.map((line) => (
                    <div
                      key={line.menu_item_id}
                      className="flex items-center gap-2 rounded-lg border border-border/50 p-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{line.name}</p>
                        <Price
                          cents={line.unit_price_cents * line.quantity}
                          className="text-xs text-muted-foreground"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => changeQty(line.menu_item_id, -1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-bold">
                          {line.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => changeQty(line.menu_item_id, 1)}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            {cart.length > 0 && (
              <div className="border-t border-border/50 p-4">
                <Textarea
                  placeholder="Order notes (optional)"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={2}
                  className="rounded-lg text-sm"
                />
              </div>
            )}

            {/* Totals + Place */}
            {cart.length > 0 && (
              <div className="space-y-2.5 border-t border-border/50 p-4">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <Price cents={totalCents} />
                </div>
                {taxRatePercent > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Tax ({taxRatePercent}%)</span>
                    <Price cents={taxCents} />
                  </div>
                )}
                {serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Service Charge</span>
                    <Price cents={serviceChargeAmount} />
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-sm font-bold">
                  <span>Total</span>
                  <Price cents={grandTotalCents} className="text-primary" />
                </div>
                <Button
                  className="h-10 w-full rounded-lg text-sm font-bold"
                  disabled={
                    placing || (orderType === "DINE_IN" && !selectedTableId)
                  }
                  onClick={handlePlaceOrder}
                >
                  {placing ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    "Place Order"
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
