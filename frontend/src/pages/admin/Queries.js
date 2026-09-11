import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, RefreshCw, Loader2, CheckCircle2, Clock, PhoneCall, MessageCircle, StickyNote, CalendarClock, Flag,
  Inbox, Users, History, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, errMsg } from "@/lib/api";
import { AppAccessBanner, useCanWrite } from "@/components/admin/AppAccessBanner";
import { toast } from "sonner";

const okBadge = "border-emerald-200 bg-emerald-50 text-emerald-700";
const warnBadge = "border-amber-200 bg-amber-50 text-amber-700";
const infoBadge = "border-sky-200 bg-sky-50 text-sky-800";
const mutedBadge = "border-slate-200 bg-slate-50 text-slate-600";
const badBadge = "border-red-200 bg-red-50 text-[#C21F2B]";

const STATUS = {
  pending: { t: "Pending", c: warnBadge }, in_progress: { t: "In progress", c: infoBadge }, completed: { t: "Completed", c: okBadge },
  cancelled: { t: "Cancelled", c: mutedBadge }, open: { t: "Open", c: warnBadge }, resolved: { t: "Resolved", c: okBadge },
};
const REQUEST_STATUSES = ["pending", "in_progress", "completed", "cancelled"];
const LEAD = { new: infoBadge, contacted: warnBadge, interested: okBadge, not_interested: mutedBadge, converted: okBadge, follow_up: warnBadge };
const ACTIONS = [
  { v: "call", l: "Phone call", I: PhoneCall }, { v: "whatsapp", l: "WhatsApp", I: MessageCircle }, { v: "note", l: "Note", I: StickyNote },
  { v: "follow_up", l: "Schedule follow-up", I: CalendarClock }, { v: "status_change", l: "Change status", I: Flag },
];
const titleCase = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const fmt = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const StatusBadge = ({ s, testId }) => { const m = STATUS[s] || { t: titleCase(s || "unknown"), c: mutedBadge }; return <Badge variant="outline" className={`${m.c} text-[10px]`} data-testid={testId}>{m.t}</Badge>; };
// The app's request/customer objects may nest the customer; read defensively.
const custName = (r) => r.customer_name || r.customer?.name || r.name || "—";
const custPhone = (r) => r.customer_phone || r.customer?.phone || r.phone || "";

/* ---------------------------------- Requests ---------------------------------- */
function RequestsTab({ canWrite, onSummaryChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("");
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [history, setHistory] = useState(null);
  const [upd, setUpd] = useState({ status: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api.get("/portal/requests", { params: { status: status !== "all" ? status : undefined, request_type: type || undefined, city: city || undefined } });
      const list = Array.isArray(r.data) ? r.data : r.data.requests || r.data.items || [];
      setRows(list);
    } catch (e) { setErr(errMsg(e, "Could not load requests")); setRows([]); } finally { setLoading(false); }
  }, [status, type, city]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? rows.filter((r) => [custName(r), custPhone(r), r.request_type, r.notes, r.category].some((v) => String(v || "").toLowerCase().includes(n))) : rows;
  }, [rows, q]);
  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.request_type).filter(Boolean))), [rows]);

  const openReq = async (r) => {
    setSel(r); setUpd({ status: r.status || "pending", notes: "" }); setHistory(null);
    try { const h = await api.get(`/portal/requests/${r.id}/history`); setHistory(Array.isArray(h.data) ? h.data : h.data.history || []); } catch { setHistory([]); }
  };

  const submit = async (forceStatus) => {
    const payload = { status: forceStatus || upd.status, notes: upd.notes };
    setSaving(true);
    try {
      const r = await api.patch(`/portal/requests/${sel.id}`, payload);
      const updated = { ...sel, ...(r.data || {}), status: payload.status };
      setRows((rs) => rs.map((x) => (x.id === sel.id ? updated : x)));
      setSel(updated); setUpd({ status: payload.status, notes: "" });
      toast.success(payload.status === "completed" ? "Marked as completed" : "Request updated", { description: "Recorded in the Yash Trade App under your name." });
      try { const h = await api.get(`/portal/requests/${sel.id}/history`); setHistory(Array.isArray(h.data) ? h.data : h.data.history || []); } catch { /* noop */ }
      onSummaryChange?.();
    } catch (e) { toast.error(errMsg(e, "Could not update request")); } finally { setSaving(false); }
  };

  return (
    <>
      <Card className="rounded-xl border-slate-200">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_170px_170px_170px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, phone, type or notes…" className="h-10 pl-10" data-testid="queries-requests-search" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10" data-testid="queries-requests-filter-status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem>{REQUEST_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS[s].t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={type || "all"} onValueChange={(v) => setType(v === "all" ? "" : v)}>
            <SelectTrigger className="h-10" data-testid="queries-requests-filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All types</SelectItem>{types.map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-10" data-testid="queries-requests-filter-city" />
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table data-testid="queries-requests-table">
            <TableHeader><TableRow className="bg-slate-50">
              {["Customer", "Phone", "Type", "Category", "Notes", "Status", "Created", ""].map((h) => <TableHead key={h} className="text-[11px] font-bold uppercase">{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {loading ? [0, 1, 2].map((i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
                : err ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm"><p className="font-medium text-[#C21F2B]" data-testid="queries-requests-error">{err}</p><Button variant="outline" size="sm" onClick={load} className="mt-3 gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></TableCell></TableRow>
                : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-sm text-slate-400" data-testid="queries-requests-empty"><Inbox className="mx-auto mb-2 h-7 w-7 text-slate-300" /> No requests match.</TableCell></TableRow>
                : filtered.map((r) => (
                  <TableRow key={r.id} onClick={() => openReq(r)} className="cursor-pointer admin-row-hover" data-testid={`queries-request-row-${r.id}`}>
                    <TableCell className="text-sm font-semibold text-[#0B1F3B]">{custName(r)}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{custPhone(r)}</TableCell>
                    <TableCell className="text-xs">{titleCase(r.request_type)}</TableCell>
                    <TableCell className="text-xs">{titleCase(r.category) || "—"}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs text-slate-600" title={r.notes}>{r.notes || "—"}</TableCell>
                    <TableCell><StatusBadge s={r.status} testId={`queries-request-status-${r.id}`} /></TableCell>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {r.status !== "completed" && (
                        <Button size="sm" variant="outline" disabled={!canWrite || saving} onClick={(e) => { e.stopPropagation(); submitQuick(r); }} className="h-7 gap-1 text-xs" data-testid={`queries-request-complete-${r.id}`}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Sheet open={!!sel} onOpenChange={(o) => { if (!o) setSel(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="queries-request-sheet">
          {sel && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="font-heading text-[#0B1F3B]">{titleCase(sel.request_type)} — {custName(sel)}</SheetTitle>
                <SheetDescription><span className="font-mono-nums">{custPhone(sel)}</span>{sel.city ? ` · ${sel.city}` : ""} · created {fmt(sel.created_at)}</SheetDescription>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 p-3"><p className="text-[11px] font-bold uppercase text-slate-500">Status</p><div className="mt-1"><StatusBadge s={sel.status} /></div></div>
                <div className="rounded-lg border border-slate-200 p-3"><p className="text-[11px] font-bold uppercase text-slate-500">Preferred time</p><p className="mt-1 font-medium">{sel.preferred_time || "—"}</p></div>
                <div className="col-span-2 rounded-lg border border-slate-200 p-3"><p className="text-[11px] font-bold uppercase text-slate-500">Customer notes</p><p className="mt-1 whitespace-pre-wrap text-slate-700">{sel.notes || "—"}</p></div>
              </div>

              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-[#0B1F3B]">Update request</h3>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">New status</Label>
                  <Select value={upd.status} onValueChange={(v) => setUpd((u) => ({ ...u, status: v }))} disabled={!canWrite}>
                    <SelectTrigger className="h-10" data-testid="queries-request-update-status"><SelectValue /></SelectTrigger>
                    <SelectContent>{REQUEST_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS[s].t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Notes for this update</Label>
                  <Textarea value={upd.notes} onChange={(e) => setUpd((u) => ({ ...u, notes: e.target.value }))} rows={3} placeholder="What did you do / agree with the customer?" disabled={!canWrite} data-testid="queries-request-update-notes" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => submit()} disabled={!canWrite || saving} className="gap-1.5 bg-[#0B1F3B] hover:bg-[#081a31] font-semibold" data-testid="queries-request-update-save">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save update"}</Button>
                  {sel.status !== "completed" && <Button variant="outline" onClick={() => submit("completed")} disabled={!canWrite || saving} className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" data-testid="queries-request-mark-complete"><CheckCircle2 className="h-4 w-4" /> Mark completed</Button>}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#0B1F3B]"><History className="h-4 w-4" /> History</h3>
                {history === null ? <Skeleton className="h-16 w-full" /> : history.length === 0 ? <p className="text-xs text-slate-400">No history recorded yet.</p> : (
                  <ol className="space-y-2 border-l-2 border-slate-200 pl-4" data-testid="queries-request-history">
                    {history.map((h, i) => (
                      <li key={h.id || i} className="relative text-xs">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[#0B1F3B]" />
                        <div className="flex flex-wrap items-center gap-2"><StatusBadge s={h.status || h.new_status} /><span className="text-slate-500">{fmt(h.at || h.created_at || h.timestamp)}</span>{(h.by || h.by_name || h.handled_by) && <span className="text-slate-400">by {h.by_name || h.by || h.handled_by}</span>}</div>
                        {(h.notes || h.note) && <p className="mt-0.5 text-slate-700">{h.notes || h.note}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );

  // quick "Complete" from the table row (kept outside JSX for readability)
  async function submitQuick(r) {
    setSaving(true);
    try {
      const res = await api.patch(`/portal/requests/${r.id}`, { status: "completed", notes: "" });
      const updated = { ...r, ...(res.data || {}), status: "completed" };
      setRows((rs) => rs.map((x) => (x.id === r.id ? updated : x)));
      if (sel?.id === r.id) setSel(updated);
      toast.success("Marked as completed", { description: "Recorded in the Yash Trade App under your name." });
      onSummaryChange?.();
    } catch (e) { toast.error(errMsg(e, "Could not complete request")); } finally { setSaving(false); }
  }
}

/* ---------------------------------- Customers ---------------------------------- */
function CustomersTab({ canWrite, onSummaryChange }) {
  const [data, setData] = useState({ customers: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [lead, setLead] = useState("all");
  const [sel, setSel] = useState(null);
  const [activity, setActivity] = useState(null);
  const [act, setAct] = useState({ action: "call", new_status: "", notes: "", follow_up_at: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await api.get("/portal/telecaller/customers", { params: { page, limit: 25, search: q || undefined, lead_status: lead !== "all" ? lead : undefined } });
      const d = r.data || {};
      setData({ customers: Array.isArray(d) ? d : d.customers || d.items || [], total: d.total ?? (d.customers || []).length, page: d.page || page, pages: d.pages || 1 });
    } catch (e) { setErr(errMsg(e, "Could not load customers")); } finally { setLoading(false); }
  }, [page, q, lead]);
  useEffect(() => { load(); }, [load]);

  const openCust = async (c) => {
    setSel(c); setAct({ action: "call", new_status: "", notes: "", follow_up_at: "" }); setActivity(null);
    try { const a = await api.get(`/portal/telecaller/customers/${c.id}/activity`); setActivity(Array.isArray(a.data) ? a.data : a.data.activity || []); if (a.data.customer) setSel((s) => ({ ...s, ...a.data.customer })); } catch { setActivity([]); }
  };

  const logAction = async () => {
    if (act.action === "follow_up" && !act.follow_up_at) return toast.error("Pick a follow-up date and time");
    if (act.action === "status_change" && !act.new_status) return toast.error("Choose the new status");
    setSaving(true);
    try {
      const payload = { action: act.action, new_status: act.new_status, notes: act.notes, follow_up_at: act.follow_up_at ? new Date(act.follow_up_at).toISOString() : "" };
      const r = await api.post(`/portal/telecaller/customers/${sel.id}/action`, payload);
      const c = r.data?.customer || {};
      setSel((s) => ({ ...s, ...c }));
      setData((d) => ({ ...d, customers: d.customers.map((x) => (x.id === sel.id ? { ...x, ...c } : x)) }));
      toast.success("Logged in the Yash Trade App");
      setAct({ action: "call", new_status: "", notes: "", follow_up_at: "" });
      try { const a = await api.get(`/portal/telecaller/customers/${sel.id}/activity`); setActivity(Array.isArray(a.data) ? a.data : a.data.activity || []); } catch { /* noop */ }
      onSummaryChange?.();
    } catch (e) { toast.error(errMsg(e, "Could not log this action")); } finally { setSaving(false); }
  };

  const leadStatuses = Object.keys(LEAD);
  return (
    <>
      <Card className="rounded-xl border-slate-200">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or shop…" className="h-10 pl-10" data-testid="queries-customers-search" />
          </div>
          <Select value={lead} onValueChange={(v) => { setLead(v); setPage(1); }}>
            <SelectTrigger className="h-10" data-testid="queries-customers-filter-lead"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All lead statuses</SelectItem>{leadStatuses.map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table data-testid="queries-customers-table">
            <TableHeader><TableRow className="bg-slate-50">
              {["Customer", "Phone", "Shop", "City", "Lead status", "Last contact", "Follow-up"].map((h) => <TableHead key={h} className="text-[11px] font-bold uppercase">{h}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {loading ? [0, 1, 2].map((i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>)
                : err ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm"><p className="font-medium text-[#C21F2B]" data-testid="queries-customers-error">{err}</p><Button variant="outline" size="sm" onClick={load} className="mt-3 gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></TableCell></TableRow>
                : data.customers.length === 0 ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm text-slate-400" data-testid="queries-customers-empty"><Users className="mx-auto mb-2 h-7 w-7 text-slate-300" /> No customers match.</TableCell></TableRow>
                : data.customers.map((c) => (
                  <TableRow key={c.id} onClick={() => openCust(c)} className="cursor-pointer admin-row-hover" data-testid={`queries-customer-row-${c.id}`}>
                    <TableCell className="text-sm font-semibold text-[#0B1F3B]">{c.name}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{c.phone}</TableCell>
                    <TableCell className="text-xs">{c.shop_name || "—"}</TableCell>
                    <TableCell className="text-xs">{c.city || c.location || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={`${LEAD[c.lead_status] || mutedBadge} text-[10px]`} data-testid={`queries-customer-lead-${c.id}`}>{titleCase(c.lead_status || "new")}</Badge></TableCell>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">{fmt(c.last_contacted_at)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{c.follow_up_at ? <span className={new Date(c.follow_up_at) < new Date() ? "font-semibold text-[#C21F2B]" : "text-slate-700"}>{fmt(c.follow_up_at)}</span> : "—"}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
        {data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">Page {data.page} of {data.pages} · {data.total} customers</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="gap-1"><ChevronLeft className="h-3.5 w-3.5" /> Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="gap-1">Next <ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </Card>

      <Sheet open={!!sel} onOpenChange={(o) => { if (!o) setSel(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="queries-customer-sheet">
          {sel && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="font-heading text-[#0B1F3B]">{sel.name}</SheetTitle>
                <SheetDescription><span className="font-mono-nums">{sel.phone}</span>{sel.shop_name ? ` · ${sel.shop_name}` : ""}{sel.city ? ` · ${sel.city}` : ""}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className={`${LEAD[sel.lead_status] || mutedBadge}`}>{titleCase(sel.lead_status || "new")}</Badge>
                {sel.follow_up_at && <Badge variant="outline" className={`${warnBadge} gap-1`}><CalendarClock className="h-3 w-3" /> Follow-up {fmt(sel.follow_up_at)}</Badge>}
                <Button asChild size="sm" variant="outline" className="ml-auto gap-1.5"><a href={`tel:+91${sel.phone}`}><PhoneCall className="h-3.5 w-3.5" /> Call</a></Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5"><a href={`https://wa.me/91${sel.phone}`} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a></Button>
              </div>

              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-[#0B1F3B]">Log an action</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Action</Label>
                    <Select value={act.action} onValueChange={(v) => setAct((a) => ({ ...a, action: v }))} disabled={!canWrite}>
                      <SelectTrigger className="h-10" data-testid="queries-customer-action-type"><SelectValue /></SelectTrigger>
                      <SelectContent>{ACTIONS.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">New lead status <span className="font-normal text-slate-400">(optional)</span></Label>
                    <Select value={act.new_status || "__keep"} onValueChange={(v) => setAct((a) => ({ ...a, new_status: v === "__keep" ? "" : v }))} disabled={!canWrite}>
                      <SelectTrigger className="h-10" data-testid="queries-customer-action-status"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="__keep">Keep current</SelectItem>{leadStatuses.map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Follow-up on <span className="font-normal text-slate-400">(optional)</span></Label>
                  <Input type="datetime-local" value={act.follow_up_at} onChange={(e) => setAct((a) => ({ ...a, follow_up_at: e.target.value }))} disabled={!canWrite} className="h-10" data-testid="queries-customer-action-followup" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Notes</Label>
                  <Textarea value={act.notes} onChange={(e) => setAct((a) => ({ ...a, notes: e.target.value }))} rows={3} placeholder="Outcome of the call, what the customer wants…" disabled={!canWrite} data-testid="queries-customer-action-notes" />
                </div>
                <Button onClick={logAction} disabled={!canWrite || saving} className="gap-1.5 bg-[#0B1F3B] hover:bg-[#081a31] font-semibold" data-testid="queries-customer-action-save">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save to app"}</Button>
              </section>

              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#0B1F3B]"><History className="h-4 w-4" /> Activity</h3>
                {activity === null ? <Skeleton className="h-16 w-full" /> : activity.length === 0 ? <p className="text-xs text-slate-400">No activity yet.</p> : (
                  <ol className="space-y-2 border-l-2 border-slate-200 pl-4" data-testid="queries-customer-activity">
                    {activity.map((a, i) => {
                      const A = ACTIONS.find((x) => x.v === (a.action || a.type)) || { l: titleCase(a.action || a.type || "note"), I: StickyNote };
                      return (
                        <li key={a.id || i} className="relative text-xs">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[#0B1F3B]" />
                          <div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-1 font-semibold text-slate-700"><A.I className="h-3 w-3" /> {A.l}</span>{a.new_status && <Badge variant="outline" className={`${LEAD[a.new_status] || mutedBadge} text-[10px]`}>{titleCase(a.new_status)}</Badge>}<span className="text-slate-500">{fmt(a.at || a.created_at)}</span>{(a.by || a.by_name) && <span className="text-slate-400">by {a.by_name || a.by}</span>}</div>
                          {(a.notes || a.note) && <p className="mt-0.5 text-slate-700">{a.notes || a.note}</p>}
                          {a.follow_up_at && <p className="mt-0.5 flex items-center gap-1 text-amber-700"><Clock className="h-3 w-3" /> Follow-up {fmt(a.follow_up_at)}</p>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ---------------------------------- Page ---------------------------------- */
export default function QueriesPage() {
  const canWrite = useCanWrite();
  const [tab, setTab] = useState("requests");
  const [summary, setSummary] = useState(null);
  const loadSummary = useCallback(async () => {
    try { const r = await api.get("/portal/telecaller/summary"); setSummary(r.data || {}); } catch { setSummary({}); }
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const cards = useMemo(() => {
    if (!summary) return [];
    const flat = Object.entries(summary).filter(([, v]) => typeof v === "number");
    return flat.slice(0, 5).map(([k, v]) => ({ k, v }));
  }, [summary]);

  return (
    <div className="space-y-5" data-testid="queries-page">
      <div>
        <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">Queries</h1>
        <p className="text-sm text-slate-500">Customer requests and your calling list — the same work you do in the Yash Trade App, handled here.</p>
      </div>
      <AppAccessBanner readOnlyHint="Requests and customers appear as soon as the app enables access." />
      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map(({ k, v }) => (
            <Card key={k} className="rounded-xl border-slate-200"><CardContent className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{titleCase(k)}</p>
              <p className="font-heading text-2xl font-bold text-[#0B1F3B]" data-testid={`queries-summary-${k}`}>{v}</p>
            </CardContent></Card>
          ))}
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9">
          <TabsTrigger value="requests" className="gap-1.5 text-xs" data-testid="queries-tab-requests"><Inbox className="h-3.5 w-3.5" /> Requests</TabsTrigger>
          <TabsTrigger value="customers" className="gap-1.5 text-xs" data-testid="queries-tab-customers"><Users className="h-3.5 w-3.5" /> Customers</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "requests" ? <RequestsTab canWrite={canWrite} onSummaryChange={loadSummary} /> : <CustomersTab canWrite={canWrite} onSummaryChange={loadSummary} />}
    </div>
  );
}
