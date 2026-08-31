import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Download, FilterX, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { api, API_BASE } from "@/lib/api";
import { toast } from "sonner";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }); } catch { return iso; }
};

const emptyFilters = { q: "", login_status: "all", account_status: "all", location: "", shop_name: "", reg_from: "", reg_to: "", login_from: "", login_to: "" };

export default function UsersPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(emptyFilters);
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const buildParams = useCallback((extra = {}) => {
    const p = { page, page_size: 20, ...extra };
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== "all") p[k] = v;
    });
    return p;
  }, [filters, page]);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/customers", { params: buildParams() })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Failed to load customers"))
      .finally(() => setLoading(false));
  }, [buildParams]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") params.set(k, v); });
      const res = await fetch(`${API_BASE}/admin/customers/export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yash-customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch {
      toast.error("CSV export failed");
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = Object.entries(filters).some(([, v]) => v && v !== "all");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">Customers</h1>
          <p className="text-sm text-slate-500">{data.total} enrolled customer{data.total === 1 ? "" : "s"}</p>
        </div>
        <Button onClick={exportCsv} disabled={exporting} variant="outline" className="gap-1.5 font-semibold" data-testid="admin-users-export-csv-button">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
        </Button>
      </div>

      <Card className="rounded-xl border-slate-200">
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={filters.q}
              onChange={(e) => set("q")(e.target.value)}
              placeholder="Search by name, phone, shop or location…"
              className="h-10 pl-10"
              data-testid="admin-users-search-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500">Login status</Label>
              <Select value={filters.login_status} onValueChange={set("login_status")}>
                <SelectTrigger className="h-9" data-testid="admin-users-filter-login-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="logged_in">Logged in</SelectItem>
                  <SelectItem value="never">Never logged in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500">Account status</Label>
              <Select value={filters.account_status} onValueChange={set("account_status")}>
                <SelectTrigger className="h-9" data-testid="admin-users-filter-account-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500">Location</Label>
              <Input value={filters.location} onChange={(e) => set("location")(e.target.value)} placeholder="e.g. Pune" className="h-9" data-testid="admin-users-filter-location" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500">Shop name</Label>
              <Input value={filters.shop_name} onChange={(e) => set("shop_name")(e.target.value)} placeholder="e.g. Kumar" className="h-9" data-testid="admin-users-filter-shop" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500">Registered from</Label>
              <Input type="date" value={filters.reg_from} onChange={(e) => set("reg_from")(e.target.value)} className="h-9" data-testid="admin-users-filter-reg-from" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500">Registered to</Label>
              <Input type="date" value={filters.reg_to} onChange={(e) => set("reg_to")(e.target.value)} className="h-9" data-testid="admin-users-filter-reg-to" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500">Last login from</Label>
              <Input type="date" value={filters.login_from} onChange={(e) => set("login_from")(e.target.value)} className="h-9" data-testid="admin-users-filter-login-from" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500">Last login to</Label>
              <Input type="date" value={filters.login_to} onChange={(e) => set("login_to")(e.target.value)} className="h-9" data-testid="admin-users-filter-login-to" />
            </div>
            {hasFilters && (
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={() => { setFilters(emptyFilters); setPage(1); }} className="gap-1 text-xs text-slate-500" data-testid="admin-users-clear-filters">
                  <FilterX className="h-3.5 w-3.5" /> Clear filters
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table data-testid="admin-users-table">
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-12 text-[11px] font-bold uppercase">#</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Name</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Phone</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Shop</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Location</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Enrollment</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Login</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Status</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Registered</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">First login</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Last login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="py-12 text-center text-sm text-slate-400">Loading…</TableCell></TableRow>
              ) : data.items.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="py-12 text-center text-sm text-slate-400" data-testid="admin-users-empty">No customers match these filters</TableCell></TableRow>
              ) : (
                data.items.map((c) => (
                  <TableRow
                    key={c.id}
                    onClick={() => navigate(`/admin/users/${c.id}`)}
                    className="cursor-pointer admin-row-hover"
                    data-testid={`admin-users-row-${c.phone}`}
                  >
                    <TableCell className="font-mono-nums text-xs text-slate-500">{c.serial}</TableCell>
                    <TableCell className="text-sm font-semibold text-[#0B1F3B]">{c.name}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{c.phone}</TableCell>
                    <TableCell className="text-xs">{c.shop_name}</TableCell>
                    <TableCell className="text-xs">{c.location}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]">
                        {c.onboarding_status === "registered" ? "Registered" : c.onboarding_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={c.has_logged_in ? "border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]" : "border-slate-200 bg-slate-50 text-slate-500 text-[10px]"}>
                        {c.has_logged_in ? "Logged in" : "Never"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={c.account_status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]" : "border-red-200 bg-red-50 text-red-700 text-[10px]"}>
                        {c.account_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{fmtDate(c.registered_at)}</TableCell>
                    <TableCell className="text-xs text-slate-500">{fmtDate(c.first_login_at)}</TableCell>
                    <TableCell className="text-xs text-slate-500">{fmtDate(c.last_login_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">Page {data.page} of {data.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="gap-1" data-testid="admin-users-prev-page">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="gap-1" data-testid="admin-users-next-page">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
