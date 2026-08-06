"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Ticket,
  Plus,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Download,
  Printer,
} from "lucide-react";
import { getVouchers, generateVouchers, deleteVoucher } from "@/actions/spin-win";
import { getSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Voucher, ExpiryType } from "@/lib/types/db";

type VoucherStatus = "active" | "used" | "expired";
type TabFilter = "active" | "expired" | "used";

export default function VoucherSettingsPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<TabFilter>("active");
  const [restaurantName, setRestaurantName] = useState("Restaurant");

  // Form state
  const [count, setCount] = useState(10);
  const [expiryType, setExpiryType] = useState<ExpiryType>("WEEKLY");
  const [customDate, setCustomDate] = useState("");

  useEffect(() => {
    async function load() {
      const [vouchersRes, settingsRes] = await Promise.all([
        getVouchers(),
        getSettings(),
      ]);
      if (vouchersRes.ok) setVouchers(vouchersRes.data);
      else toast.error(vouchersRes.error);
      if (settingsRes.ok) setRestaurantName(settingsRes.data.name);
      setLoading(false);
    }
    load();
  }, []);

  async function handleGenerate() {
    if (expiryType === "CUSTOM" && !customDate) {
      toast.error("Please select a custom expiry date.");
      return;
    }
    setGenerating(true);
    const res = await generateVouchers(count, expiryType, customDate);
    if (res.ok) {
      setVouchers((prev) => [...res.data, ...prev]);
      toast.success(`Generated ${res.data.length} voucher${res.data.length !== 1 ? "s" : ""}`);
    } else {
      toast.error(res.error);
    }
    setGenerating(false);
  }

  async function handleDelete(id: string) {
    const res = await deleteVoucher(id);
    if (res.ok) {
      setVouchers((prev) => prev.filter((v) => v.id !== id));
      toast.success("Voucher deleted");
    } else {
      toast.error(res.error);
    }
  }

  function getVoucherStatus(v: Voucher): VoucherStatus {
    if (v.used_at) return "used";
    if (new Date(v.expires_at) < new Date()) return "expired";
    return "active";
  }

  const filtered = useMemo(() => {
    return vouchers.filter((v) => getVoucherStatus(v) === activeTab);
  }, [vouchers, activeTab]);

  const batches = useMemo(() => {
    const map = new Map<number, Voucher[]>();
    for (const v of filtered) {
      const list = map.get(v.batch_number) ?? [];
      list.push(v);
      map.set(v.batch_number, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const counts = useMemo(() => {
    let active = 0, expired = 0, used = 0;
    for (const v of vouchers) {
      const s = getVoucherStatus(v);
      if (s === "active") active++;
      else if (s === "expired") expired++;
      else used++;
    }
    return { active, expired, used };
  }, [vouchers]);

  const TABS: { value: TabFilter; label: string; count: number }[] = [
    { value: "active", label: "Active", count: counts.active },
    { value: "expired", label: "Expired", count: counts.expired },
    { value: "used", label: "Used", count: counts.used },
  ];

  function handlePrintBatch(batchVouchers: Voucher[]) {
    if (batchVouchers.length === 0) {
      toast.error("No vouchers to print.");
      return;
    }

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const dashed = '<div class="dashed">----------------------------------------------</div>';

    const voucherHTML = batchVouchers.map((v, i) => {
      const expiryDate = new Date(v.expires_at).toLocaleDateString("en-PK", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const isLast = i === batchVouchers.length - 1;
      return `<div class="voucher${isLast ? " last" : ""}">
  <div class="center">
    <div class="restaurant-name">${esc(restaurantName)}</div>
    <div class="voucher-label">SPIN & WIN VOUCHER</div>
  </div>
  ${dashed}
  <div class="code">${esc(v.code)}</div>
  ${dashed}
  <div class="meta">
    <div class="meta-row"><span>Expires</span><span>${expiryDate}</span></div>
    <div class="meta-row"><span>Type</span><span>${v.expiry_type.charAt(0) + v.expiry_type.slice(1).toLowerCase()}</span></div>
  </div>
  ${dashed}
  <div class="center footer">Present this code at the Spin & Win wheel</div>
</div>`;
    }).join("");

    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) {
      toast.error("Please allow popups to print vouchers.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Vouchers - Print</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Courier New", "Consolas", monospace;
    font-size: 12px;
    color: #000;
    background: #fff;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .voucher {
    width: 80mm;
    max-width: 80mm;
    padding: 4mm 3mm;
    margin: 0 auto;
    page-break-after: always;
    break-after: page;
  }
  .voucher.last { page-break-after: auto; break-after: auto; }
  .center { text-align: center; }
  .restaurant-name { font-size: 16px; font-weight: bold; }
  .voucher-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
  .dashed { text-align: center; font-size: 11px; letter-spacing: -1px; margin: 4px 0; }
  .code {
    font-family: "Courier New", monospace;
    font-size: 24px;
    font-weight: bold;
    letter-spacing: 4px;
    text-align: center;
    padding: 8px 0;
  }
  .meta { font-size: 11px; }
  .meta-row { display: flex; justify-content: space-between; }
  .footer { font-size: 11px; }
  @media print {
    body { width: 80mm; }
    .voucher { width: 80mm; padding: 2mm 2mm; }
  }
</style>
</head>
<body>
${voucherHTML}
</body>
</html>`);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  }

  function downloadVoucherPNG(voucher: Voucher) {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 200);
    bgGrad.addColorStop(0, "#ffffff");
    bgGrad.addColorStop(1, "#fafafa");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 400, 200);

    // Border
    ctx.strokeStyle = "#e23744";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(10, 10, 380, 180);
    ctx.setLineDash([]);

    // Ticket notches (left + right)
    ctx.fillStyle = "#f5f5f5";
    ctx.beginPath();
    ctx.arc(10, 100, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(390, 100, 8, 0, 2 * Math.PI);
    ctx.fill();

    // Header
    ctx.fillStyle = "#e23744";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${restaurantName.toUpperCase()} VOUCHER`, 25, 35);

    // Divider
    ctx.strokeStyle = "#eee";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(25, 45);
    ctx.lineTo(375, 45);
    ctx.stroke();
    ctx.setLineDash([]);

    // Code
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 32px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(voucher.code, 200, 95);

    // Expiry
    const expiryDate = new Date(voucher.expires_at).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
    ctx.fillStyle = "#666";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(`Expires: ${expiryDate}  |  ${voucher.expiry_type.charAt(0) + voucher.expiry_type.slice(1).toLowerCase()}`, 200, 125);

    // Status badge
    const status = getVoucherStatus(voucher);
    const statusColors: Record<VoucherStatus, { bg: string; fg: string }> = {
      active: { bg: "#d1fae5", fg: "#065f46" },
      used: { bg: "#dbeafe", fg: "#1e40af" },
      expired: { bg: "#fee2e2", fg: "#991b1b" },
    };
    const sc = statusColors[status];
    ctx.fillStyle = sc.bg;
    ctx.beginPath();
    ctx.roundRect(160, 145, 80, 22, 11);
    ctx.fill();
    ctx.fillStyle = sc.fg;
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(status.toUpperCase(), 200, 160);

    // Footer
    ctx.fillStyle = "#999";
    ctx.font = "9px system-ui, sans-serif";
    ctx.fillText("Present this code at the Spin & Win wheel", 200, 180);

    // Download
    const link = document.createElement("a");
    link.download = `voucher-${voucher.code}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Voucher downloaded");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
          <Ticket className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Voucher Settings</h1>
          <p className="text-xs text-muted-foreground">
            Generate and manage spin wheel voucher codes
          </p>
        </div>
      </div>

      {/* Generate form */}
      <Card className="border-border/50">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-bold">Generate Vouchers</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Quantity</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Expiry Type</Label>
              <select
                value={expiryType}
                onChange={(e) => setExpiryType(e.target.value as ExpiryType)}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="WEEKLY">Weekly (7 days)</option>
                <option value="MONTHLY">Monthly (30 days)</option>
                <option value="CUSTOM">Custom Date</option>
              </select>
            </div>

            {expiryType === "CUSTOM" && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Custom Expiry Date</Label>
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="rounded-lg"
                />
              </div>
            )}
          </div>

          <Button onClick={handleGenerate} disabled={generating} className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" />
            {generating ? "Generating..." : `Generate ${count} Voucher${count !== 1 ? "s" : ""}`}
          </Button>
        </CardContent>
      </Card>

      {/* Voucher list with sub-tabs */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : vouchers.length === 0 ? (
        <EmptyState icon="🎟️" title="No vouchers yet" description="Generate vouchers to distribute to customers." />
      ) : (
        <div className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTab === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {tab.label}
                <span className={cn(
                  "ml-1.5 inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
                  activeTab === tab.value ? "bg-primary-foreground/20" : "bg-background",
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="📭" title={`No ${activeTab} vouchers`} description={`There are no ${activeTab} vouchers at the moment.`} />
          ) : (
            <div className="space-y-6">
              {batches.map(([batchNum, batchVouchers]) => (
                <div key={batchNum} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      Batch {batchNum}
                      <span className="ml-2 text-xs text-muted-foreground/70">({batchVouchers.length} voucher{batchVouchers.length !== 1 ? "s" : ""})</span>
                    </h3>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handlePrintBatch(batchVouchers)}>
                      <Printer className="mr-1.5 size-3" /> Print Batch
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {batchVouchers.map((v) => {
                      const status = getVoucherStatus(v);
                      return (
                        <VoucherCard
                          key={v.id}
                          voucher={v}
                          status={status}
                          onDelete={() => handleDelete(v.id)}
                          onDownload={() => downloadVoucherPNG(v)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VoucherCard({
  voucher,
  status,
  onDelete,
  onDownload,
}: {
  voucher: Voucher;
  status: VoucherStatus;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const statusConfig = {
    active: {
      label: "Active",
      icon: <CheckCircle2 className="size-3" />,
      className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400",
      border: "border-l-emerald-500",
    },
    used: {
      label: "Used",
      icon: <CheckCircle2 className="size-3" />,
      className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400",
      border: "border-l-blue-500",
    },
    expired: {
      label: "Expired",
      icon: <XCircle className="size-3" />,
      className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400",
      border: "border-l-red-500",
    },
  };

  const cfg = statusConfig[status];

  return (
    <Card className={cn("overflow-hidden border-border/50 border-l-4", cfg.border)}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-primary" />
            <span className="font-mono text-lg font-bold tracking-wider">
              {voucher.code}
            </span>
          </div>
          <Badge variant="outline" className={cn("gap-1 text-[10px]", cfg.className)}>
            {cfg.icon}
            {cfg.label}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            Expires: {new Date(voucher.expires_at).toLocaleDateString("en-PK", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {voucher.expiry_type.charAt(0) + voucher.expiry_type.slice(1).toLowerCase()}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={onDownload}
          >
            <Download className="mr-1 size-3" /> Download
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
