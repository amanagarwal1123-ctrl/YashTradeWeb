import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2, RefreshCw, Plus, Pencil, Trash2, History, IndianRupee, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, errMsg } from "@/lib/api";
import { AppAccessBanner, useCanWrite } from "@/components/admin/AppAccessBanner";
import { toast } from "sonner";

const okBadge = "border-emerald-200 bg-emerald-50 text-emerald-700";
const badBadge = "border-red-200 bg-red-50 text-[#C21F2B]";
const mutedBadge = "border-slate-200 bg-slate-50 text-slate-600";
const MOVE = { up: { I: TrendingUp, c: okBadge, t: "Up" }, down: { I: TrendingDown, c: badBadge, t: "Down" }, stable: { I: Minus, c: mutedBadge, t: "Stable" } };
const METALS = [{ v: "silver", l: "Silver", unit: "₹ / kg" }, { v: "gold", l: "Gold", unit: "₹ / 10 g" }];
const fmt = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v));
const titleCase = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

const RATE_KEYS = (m) => ({ dollar: `${m}_dollar_rate`, mcx: `${m}_mcx_rate`, physical: `${m}_physical_rate`, mode: `${m}_physical_mode`, premium: `${m}_physical_premium`, base: `${m}_physical_base`, movement: `${m}_movement` });

function MetalRateCard({ metal, form, setForm, disabled }) {
  const k = RATE_KEYS(metal.v);
  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));
  const mv = MOVE[form[k.movement]] || MOVE.stable;
  return (
    <Card className="rounded-xl border-slate-200" data-testid={`rates-card-${metal.v}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-heading text-lg text-[#0B1F3B]">{metal.l} <span className="text-xs font-normal text-slate-400">{metal.unit}</span></CardTitle>
          <Badge variant="outline" className={`${mv.c} gap-1 text-[10px]`}><mv.I className="h-3 w-3" /> {mv.t}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-lg bg-[#0B1F3B]/[0.04] p-3">
          <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Physical rate (shown to customers)</Label>
          <Input type="number" inputMode="decimal" step="0.01" value={form[k.physical] ?? ""} onChange={(e) => set(k.physical)(e.target.value)} disabled={disabled} className="mt-1 h-12 font-mono-nums text-xl font-bold" data-testid={`rates-${metal.v}-physical`} />
        </div>
        <div className="space-y-1"><Label className="text-xs font-semibold">MCX rate</Label><Input type="number" inputMode="decimal" step="0.01" value={form[k.mcx] ?? ""} onChange={(e) => set(k.mcx)(e.target.value)} disabled={disabled} className="h-10 font-mono-nums" data-testid={`rates-${metal.v}-mcx`} /></div>
        <div className="space-y-1"><Label className="text-xs font-semibold">Dollar rate</Label><Input type="number" inputMode="decimal" step="0.01" value={form[k.dollar] ?? ""} onChange={(e) => set(k.dollar)(e.target.value)} disabled={disabled} className="h-10 font-mono-nums" data-testid={`rates-${metal.v}-dollar`} /></div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Physical mode</Label>
          <Select value={form[k.mode] || "manual"} onValueChange={set(k.mode)} disabled={disabled}>
            <SelectTrigger className="h-10" data-testid={`rates-${metal.v}-mode`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="auto">Auto (base + premium)</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Movement</Label>
          <Select value={form[k.movement] || "stable"} onValueChange={set(k.movement)} disabled={disabled}>
            <SelectTrigger className="h-10" data-testid={`rates-${metal.v}-movement`}><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(MOVE).map(([v, m]) => <SelectItem key={v} value={v}>{m.t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {form[k.mode] === "auto" && (
          <>
            <div className="space-y-1"><Label className="text-xs font-semibold">Premium</Label><Input type="number" inputMode="decimal" step="0.01" value={form[k.premium] ?? ""} onChange={(e) => set(k.premium)(e.target.value)} disabled={disabled} className="h-10 font-mono-nums" data-testid={`rates-${metal.v}-premium`} /></div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Base</Label>
              <Select value={form[k.base] || "mcx"} onValueChange={set(k.base)} disabled={disabled}>
                <SelectTrigger className="h-10" data-testid={`rates-${metal.v}-base`}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="mcx">MCX</SelectItem><SelectItem value="dollar">Dollar</SelectItem></SelectContent>
              </Select>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const emptySlab = { metal_type: "silver", item_name: "", category: "", subcategory: "", purity: "", wastage: "", labour_kg: "", order: 0 };

export default function RatesPage() {
  const canWrite = useCanWrite();
  const [latest, setLatest] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [history, setHistory] = useState(null);
  const [days, setDays] = useState("30");
  const [metal, setMetal] = useState("silver");
  const [slabs, setSlabs] = useState(null);
  const [slabErr, setSlabErr] = useState("");
  const [slabForm, setSlabForm] = useState(emptySlab);
  const [slabOpen, setSlabOpen] = useState(false);
  const [editingSlab, setEditingSlab] = useState(null);
  const [deletingSlab, setDeletingSlab] = useState(null);
  const [slabSaving, setSlabSaving] = useState(false);

  const loadLatest = useCallback(async () => {
    setLoading(true); setErr("");
    try { const r = await api.get("/portal/rates/latest"); setLatest(r.data); setForm(r.data || {}); }
    catch (e) { setErr(errMsg(e, "Could not load rates from the app")); } finally { setLoading(false); }
  }, []);
  const loadHistory = useCallback(async () => {
    setHistory(null);
    try { const r = await api.get("/portal/rates/history", { params: { days } }); setHistory(Array.isArray(r.data) ? r.data : r.data.history || r.data.rates || []); } catch { setHistory([]); }
  }, [days]);
  const loadSlabs = useCallback(async () => {
    setSlabs(null); setSlabErr("");
    try { const r = await api.get("/portal/rate-list", { params: { metal_type: metal } }); setSlabs(Array.isArray(r.data) ? r.data : r.data.slabs || []); }
    catch (e) { setSlabErr(errMsg(e, "Could not load the rate list")); setSlabs([]); }
  }, [metal]);
  useEffect(() => { loadLatest(); }, [loadLatest]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { loadSlabs(); }, [loadSlabs]);

  const dirty = useMemo(() => latest && Object.keys(form).some((k) => String(form[k] ?? "") !== String(latest[k] ?? "")), [form, latest]);

  const publish = async () => {
    const payload = {};
    for (const m of METALS) {
      const k = RATE_KEYS(m.v);
      payload[k.dollar] = num(form[k.dollar]); payload[k.mcx] = num(form[k.mcx]); payload[k.physical] = num(form[k.physical]);
      payload[k.premium] = num(form[k.premium]); payload[k.mode] = form[k.mode] || "manual"; payload[k.base] = form[k.base] || "mcx"; payload[k.movement] = form[k.movement] || "stable";
    }
    payload.market_summary = form.market_summary || "";
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    if (!payload.silver_physical_rate && !payload.gold_physical_rate) return toast.error("Enter at least one physical rate");
    setPublishing(true);
    try {
      const r = await api.post("/portal/rates", payload);
      setLatest(r.data); setForm(r.data || form);
      toast.success("Rates published to the Yash Trade App", { description: "Customers now see the new rates." });
      loadHistory();
    } catch (e) { toast.error(errMsg(e, "Could not publish rates")); } finally { setPublishing(false); }
  };

  const openSlab = (s) => { setEditingSlab(s); setSlabForm(s ? { ...emptySlab, ...s } : { ...emptySlab, metal_type: metal, order: (slabs?.length || 0) + 1 }); setSlabOpen(true); };
  const saveSlab = async (e) => {
    e.preventDefault();
    if (!slabForm.item_name.trim()) return toast.error("Enter the item name");
    setSlabSaving(true);
    try {
      const body = { ...slabForm, order: Number(slabForm.order) || 0 };
      if (editingSlab) { await api.put(`/portal/rate-list/${editingSlab.id}`, body); toast.success("Rate slab updated"); }
      else { await api.post("/portal/rate-list", body); toast.success("Rate slab added"); }
      setSlabOpen(false); loadSlabs();
    } catch (e2) { toast.error(errMsg(e2, "Could not save slab")); } finally { setSlabSaving(false); }
  };
  const removeSlab = async () => {
    setSlabSaving(true);
    try { await api.delete(`/portal/rate-list/${deletingSlab.id}`); toast.success("Rate slab removed"); setDeletingSlab(null); loadSlabs(); }
    catch (e) { toast.error(errMsg(e, "Could not remove slab")); } finally { setSlabSaving(false); }
  };

  return (
    <div className="space-y-5" data-testid="rates-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">Rates</h1>
          <p className="text-sm text-slate-500">Today's metal rates and the item-wise rate list shown in the Yash Trade App.{latest?.created_at ? ` Last published ${fmt(latest.created_at)}.` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { loadLatest(); loadHistory(); loadSlabs(); }} className="gap-1.5" data-testid="rates-refresh"><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <Button onClick={publish} disabled={!canWrite || publishing || loading} className="gap-1.5 bg-[#0B1F3B] hover:bg-[#081a31] font-semibold min-w-[150px]" data-testid="rates-publish-button">{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Publish rates</>}</Button>
        </div>
      </div>
      <AppAccessBanner readOnlyHint="Rates are visible now; publishing switches on automatically once the app enables access." />
      {dirty && canWrite && <p className="text-xs font-medium text-amber-700" data-testid="rates-unsaved">You have unpublished changes.</p>}

      {err ? (
        <Card className="rounded-xl border-red-200"><CardContent className="p-8 text-center space-y-3"><p className="text-sm font-medium text-[#C21F2B]" data-testid="rates-error">{err}</p><Button variant="outline" size="sm" onClick={loadLatest} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></CardContent></Card>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {METALS.map((m) => <MetalRateCard key={m.v} metal={m} form={form} setForm={setForm} disabled={!canWrite} />)}
          </div>
          <Card className="rounded-xl border-slate-200"><CardContent className="p-4 space-y-1.5">
            <Label className="text-sm font-semibold">Market summary <span className="font-normal text-slate-400">(shown under the rates in the app)</span></Label>
            <Textarea value={form.market_summary || ""} onChange={(e) => setForm((f) => ({ ...f, market_summary: e.target.value }))} rows={2} disabled={!canWrite} placeholder="e.g. Silver firm on strong industrial demand; gold steady ahead of Fed." data-testid="rates-market-summary" />
          </CardContent></Card>
        </>
      )}

      <Card className="rounded-xl border-slate-200 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><History className="h-4 w-4" /> Rate history</CardTitle>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="rates-history-days"><SelectValue /></SelectTrigger>
              <SelectContent>{["7", "30", "90"].map((d) => <SelectItem key={d} value={d}>Last {d} days</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table data-testid="rates-history-table">
            <TableHeader><TableRow className="bg-slate-50">{["Published", "Silver", "Gold", "Silver MCX", "Gold MCX", "Summary"].map((h) => <TableHead key={h} className="text-[11px] font-bold uppercase">{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {history === null ? [0, 1].map((i) => <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
                : history.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-xs text-slate-400">No rate changes in this period.</TableCell></TableRow>
                : history.slice(0, 50).map((h, i) => (
                  <TableRow key={h.id || i}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">{fmt(h.created_at || h.updated_at)}</TableCell>
                    <TableCell className="font-mono-nums text-sm font-semibold">{h.silver_rate ?? h.silver_physical_rate ?? "—"}</TableCell>
                    <TableCell className="font-mono-nums text-sm font-semibold">{h.gold_rate ?? h.gold_physical_rate ?? "—"}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{h.silver_mcx_rate ?? "—"}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{h.gold_mcx_rate ?? "—"}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-xs text-slate-600" title={h.market_summary}>{h.market_summary || "—"}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="rounded-xl border-slate-200 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><IndianRupee className="h-4 w-4" /> Rate list (item-wise)</CardTitle>
            <div className="flex items-center gap-2">
              <Tabs value={metal} onValueChange={setMetal}><TabsList className="h-8">{METALS.map((m) => <TabsTrigger key={m.v} value={m.v} className="text-xs" data-testid={`rates-slabs-tab-${m.v}`}>{m.l}</TabsTrigger>)}</TabsList></Tabs>
              <Button size="sm" onClick={() => openSlab(null)} disabled={!canWrite} className="gap-1.5 bg-[#0B1F3B] hover:bg-[#081a31]" data-testid="rates-slab-add-button"><Plus className="h-3.5 w-3.5" /> Add item</Button>
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table data-testid="rates-slabs-table">
            <TableHeader><TableRow className="bg-slate-50">{["#", "Item", "Category", "Sub-category", "Purity", "Wastage", "Labour / kg", ""].map((h) => <TableHead key={h} className="text-[11px] font-bold uppercase">{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {slabs === null ? [0, 1, 2].map((i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
                : slabErr ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-[#C21F2B]">{slabErr}</TableCell></TableRow>
                : slabs.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-xs text-slate-400" data-testid="rates-slabs-empty">No {metal} items yet. Add the first one.</TableCell></TableRow>
                : slabs.map((s) => (
                  <TableRow key={s.id} data-testid={`rates-slab-row-${s.id}`}>
                    <TableCell className="font-mono-nums text-xs text-slate-500">{s.order}</TableCell>
                    <TableCell className="text-sm font-semibold text-[#0B1F3B]">{s.item_name || "—"}</TableCell>
                    <TableCell className="text-xs">{titleCase(s.category) || "—"}</TableCell>
                    <TableCell className="text-xs">{titleCase(s.subcategory) || "—"}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{s.purity || "—"}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{s.wastage || "—"}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{s.labour_kg || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-[#0B1F3B]" disabled={!canWrite} onClick={() => openSlab(s)} aria-label="Edit" data-testid={`rates-slab-edit-${s.id}`}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-[#C21F2B]" disabled={!canWrite} onClick={() => setDeletingSlab(s)} aria-label="Remove" data-testid={`rates-slab-delete-${s.id}`}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={slabOpen} onOpenChange={setSlabOpen}>
        <DialogContent className="sm:max-w-md" data-testid="rates-slab-dialog">
          <DialogHeader><DialogTitle className="font-heading text-[#0B1F3B]">{editingSlab ? "Edit rate item" : "Add rate item"}</DialogTitle><DialogDescription>Appears in the rate list inside the Yash Trade App.</DialogDescription></DialogHeader>
          <form onSubmit={saveSlab} className="space-y-3" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-sm font-semibold">Metal</Label>
                <Select value={slabForm.metal_type} onValueChange={(v) => setSlabForm((f) => ({ ...f, metal_type: v }))}><SelectTrigger className="h-10" data-testid="rates-slab-form-metal"><SelectValue /></SelectTrigger><SelectContent>{METALS.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label className="text-sm font-semibold">Order</Label><Input type="number" value={slabForm.order} onChange={(e) => setSlabForm((f) => ({ ...f, order: e.target.value }))} className="h-10 font-mono-nums" data-testid="rates-slab-form-order" /></div>
            </div>
            <div className="space-y-1"><Label className="text-sm font-semibold">Item name</Label><Input value={slabForm.item_name} onChange={(e) => setSlabForm((f) => ({ ...f, item_name: e.target.value }))} placeholder="e.g. Bhakti payal" className="h-10" data-testid="rates-slab-form-item" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-sm font-semibold">Category</Label><Input value={slabForm.category} onChange={(e) => setSlabForm((f) => ({ ...f, category: e.target.value }))} className="h-10" data-testid="rates-slab-form-category" /></div>
              <div className="space-y-1"><Label className="text-sm font-semibold">Sub-category</Label><Input value={slabForm.subcategory} onChange={(e) => setSlabForm((f) => ({ ...f, subcategory: e.target.value }))} className="h-10" data-testid="rates-slab-form-subcategory" /></div>
              <div className="space-y-1"><Label className="text-sm font-semibold">Purity</Label><Input value={slabForm.purity} onChange={(e) => setSlabForm((f) => ({ ...f, purity: e.target.value }))} placeholder="e.g. 38" className="h-10 font-mono-nums" data-testid="rates-slab-form-purity" /></div>
              <div className="space-y-1"><Label className="text-sm font-semibold">Wastage</Label><Input value={slabForm.wastage} onChange={(e) => setSlabForm((f) => ({ ...f, wastage: e.target.value }))} placeholder="e.g. 7" className="h-10 font-mono-nums" data-testid="rates-slab-form-wastage" /></div>
              <div className="space-y-1"><Label className="text-sm font-semibold">Labour / kg</Label><Input value={slabForm.labour_kg} onChange={(e) => setSlabForm((f) => ({ ...f, labour_kg: e.target.value }))} className="h-10 font-mono-nums" data-testid="rates-slab-form-labour" /></div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setSlabOpen(false)} disabled={slabSaving} data-testid="rates-slab-form-cancel">Cancel</Button>
              <Button type="submit" disabled={slabSaving} className="bg-[#0B1F3B] hover:bg-[#081a31] font-semibold min-w-[110px]" data-testid="rates-slab-form-submit">{slabSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingSlab ? "Save" : "Add item"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingSlab} onOpenChange={(o) => { if (!o) setDeletingSlab(null); }}>
        <AlertDialogContent data-testid="rates-slab-delete-dialog">
          <AlertDialogHeader><AlertDialogTitle className="font-heading text-[#0B1F3B]">Remove "{deletingSlab?.item_name}"?</AlertDialogTitle><AlertDialogDescription>It disappears from the rate list in the app immediately.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="rates-slab-delete-cancel">Keep</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); removeSlab(); }} disabled={slabSaving} className="bg-[#C21F2B] hover:bg-[#a51a24] font-semibold" data-testid="rates-slab-delete-confirm">{slabSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
