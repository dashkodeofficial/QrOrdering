"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  History,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Receipt,
  Calendar,
  Hash,
} from "lucide-react";
import { getAllOrders, searchOrders, type OrderHistoryItem } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/shared/price";
import { ORDER_STATUS_LABEL, formatDate } from "@/lib/format";
import { statusColor } from "@/lib/theme/colors";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE_SIZE = 20;
const CACHE_PAGES = 3;

type TabKey = "PLACED" | "COMPLETED" | "CANCELLED";

interface CachedData {
  orders: OrderHistoryItem[];
  total: number;
  loadedPages: number;
}

export function OrderHistory() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("COMPLETED");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OrderHistoryItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cache, setCache] = useState<Record<TabKey, CachedData>>({
    PLACED: { orders: [], total: 0, loadedPages: 0 },
    COMPLETED: { orders: [], total: 0, loadedPages: 0 },
    CANCELLED: { orders: [], total: 0, loadedPages: 0 },
  });

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTab = useCallback(async (tab: TabKey) => {
    setLoading(true);
    const res = await getAllOrders(1, PAGE_SIZE * CACHE_PAGES, tab);
    if (res.ok) {
      setCache((prev) => ({
        ...prev,
        [tab]: {
          orders: res.data.orders,
          total: res.data.total,
          loadedPages: CACHE_PAGES,
        },
      }));
    } else {
      toast.error(res.error);
    }
    setLoading(false);
  }, []);

  const loadMore = useCallback(async (tab: TabKey, neededPage: number) => {
    const cached = cache[tab];
    const pagesNeeded = Math.ceil(neededPage / CACHE_PAGES) * CACHE_PAGES;
    if (pagesNeeded <= cached.loadedPages) return;

    const res = await getAllOrders(
      cached.loadedPages + 1,
      PAGE_SIZE * (pagesNeeded - cached.loadedPages),
      tab,
    );
    if (res.ok) {
      setCache((prev) => ({
        ...prev,
        [tab]: {
          orders: [...prev[tab].orders, ...res.data.orders],
          total: res.data.total,
          loadedPages: pagesNeeded,
        },
      }));
    }
  }, [cache]);

  useEffect(() => {
    if (cache[activeTab].loadedPages === 0) {
      loadTab(activeTab);
    } else {
      setLoading(false);
    }
  }, [activeTab, cache, loadTab]);

  function handlePageChange(page: number) {
    const cached = cache[activeTab];
    const maxCachedPage = Math.ceil(cached.orders.length / PAGE_SIZE);
    if (page > maxCachedPage && cached.orders.length < cached.total) {
      loadMore(activeTab, page);
    }
    setCurrentPage(page);
  }

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchQuery.trim().length === 0) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const res = await searchOrders(searchQuery, activeTab);
      if (res.ok) {
        setSearchResults(res.data);
      } else {
        toast.error(res.error);
      }
      setSearching(false);
    }, 300);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, activeTab]);

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchQuery("");
    setSearchResults(null);
  }

  const cached = cache[activeTab];
  const displayOrders: OrderHistoryItem[] = searchResults ?? cached.orders;
  const isSearchMode = searchResults !== null;

  const paginatedOrders = isSearchMode
    ? displayOrders
    : displayOrders.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      );

  const totalPages = isSearchMode
    ? 1
    : Math.max(1, Math.ceil(cached.total / PAGE_SIZE));

  const tabConfig = {
    PLACED: {
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-500",
      lightBg: "bg-amber-50",
    },
    COMPLETED: {
      icon: CheckCircle2,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500",
      lightBg: "bg-emerald-50",
    },
    CANCELLED: {
      icon: XCircle,
      color: "text-red-600",
      bgColor: "bg-red-500",
      lightBg: "bg-red-50",
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
          <History className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Order History</h1>
          <p className="text-xs text-muted-foreground">
            Browse and search pending, completed, or cancelled orders
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["PLACED", "COMPLETED", "CANCELLED"] as const).map((tab) => {
          const cfg = tabConfig[tab];
          const Icon = cfg.icon;
          const labels: Record<TabKey, string> = {
            PLACED: "Pending Orders",
            COMPLETED: "Completed Orders",
            CANCELLED: "Cancelled Orders",
          };
          return (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
                activeTab === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              {labels[tab]}
              {cache[tab].total > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    activeTab === tab
                      ? "bg-primary-foreground/20"
                      : "bg-muted",
                  )}
                >
                  {cache[tab].total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by Order ID..."
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
        {searching && (
          <div className="absolute right-9 top-1/2 -translate-y-1/2">
            <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>

      {/* Orders table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg border border-border/50 bg-card"
            />
          ))}
        </div>
      ) : paginatedOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-20 text-center">
          {isSearchMode ? (
            <>
              <Search className="size-10 text-muted-foreground/30 mb-4" />
              <p className="text-sm font-semibold">No orders found</p>
              <p className="text-xs text-muted-foreground mt-1">
                No orders match Order ID "{searchQuery}"
              </p>
            </>
          ) : (
            <>
              <History className="size-10 text-muted-foreground/30 mb-4" />
              <p className="text-sm font-semibold">
                No {activeTab === "PLACED" ? "pending" : activeTab.toLowerCase()} orders
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {activeTab === "PLACED"
                  ? "Pending orders will appear here"
                  : activeTab === "COMPLETED"
                    ? "Completed orders will appear here after marking them as paid"
                    : "Cancelled orders will appear here"}
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Table header (desktop) */}
          <div className="hidden sm:grid grid-cols-[120px_1fr_80px_120px_100px] gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Order ID</span>
            <span>Table</span>
            <span className="text-center">Items</span>
            <span>Date</span>
            <span className="text-right">Total</span>
          </div>

          {/* Order rows */}
          <div className="space-y-1.5">
            {paginatedOrders.map((order) => {
              const color = statusColor(order.status);
              const cfg = tabConfig[activeTab];
              return (
                <button
                  key={order.id}
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
                  className="group grid sm:grid-cols-[120px_1fr_80px_120px_100px] gap-3 items-center w-full rounded-lg border border-border/50 bg-card px-4 py-3 text-left transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm"
                >
                  {/* Order ID */}
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                        cfg.lightBg,
                        cfg.color,
                      )}
                    >
                      <Hash className="size-3.5" />
                    </div>
                    <span className="text-sm font-bold font-mono">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>

                  {/* Table name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <Receipt className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">
                      {order.table_name ?? "Takeaway"}
                    </span>
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-[10px] hidden sm:inline-flex"
                      style={{
                        backgroundColor: color + "18",
                        color,
                        borderColor: color + "30",
                      }}
                    >
                      {ORDER_STATUS_LABEL[order.status] ?? order.status}
                    </Badge>
                  </div>

                  {/* Items */}
                  <span className="text-sm text-muted-foreground text-center hidden sm:block">
                    {order.item_count} {order.item_count !== 1 ? "items" : "item"}
                  </span>

                  {/* Date */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3 shrink-0" />
                    <span className="truncate">{formatDate(order.created_at)}</span>
                  </div>

                  {/* Total */}
                  <Price
                    cents={order.total_cents}
                    className="text-sm font-bold text-right shrink-0"
                  />
                </button>
              );
            })}
          </div>

          {/* Pagination */}
          {!isSearchMode && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Page <span className="font-semibold">{currentPage}</span> of{" "}
                <span className="font-semibold">{totalPages}</span> ·{" "}
                <span className="font-semibold">{cached.total}</span> total orders
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={currentPage === 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                >
                  <ChevronLeft className="size-4" />
                  <span className="ml-1">Prev</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                >
                  <span className="mr-1">Next</span>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Search results count */}
          {isSearchMode && (
            <p className="text-xs text-muted-foreground pt-1">
              Found{" "}
              <span className="font-semibold">{searchResults?.length ?? 0}</span>{" "}
              order{(searchResults?.length ?? 0) !== 1 ? "s" : ""} matching "
              {searchQuery}"
            </p>
          )}
        </>
      )}
    </div>
  );
}
