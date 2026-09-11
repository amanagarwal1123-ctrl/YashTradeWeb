import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  UserPlus, Search, RefreshCw, CloudDownload, CloudUpload, Pencil, Trash2, Loader2, ShieldCheck,
  Headset, Receipt, Link2, AlertTriangle, CheckCircle2, Clock, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

const ROLES = [
  { value: "admin", label: "Admin", icon: ShieldCheck, badge: "border-[#0B1F3B]/20 bg-[#0B1F3B]/[0.06] text-[#0B1F3B]", hint: "Full access to this portal and the app's admin features." },
  { value: "telecaller", label: "Telecaller", icon: Headset, badge: "border-sky-200 bg-sky-50 text-sky-800", hint: "Calls and follows up with customers in the Yash Trade App." },
  { value: "billing_executive", label: "Billing Executive", icon: Receipt, badge: "border-violet-200 bg-violet-50 text-violet-800", hint: "Handles billing and orders in the Yash Trade App." },
];
const roleMeta = (v) => ROLES.find((r) => r.value === v) || { label: v, badge: "border-slate-200 bg-slate-50 text-slate-600", icon: Info };

const okBadge = "border-emerald-200 bg-emerald-50 text-emerald-700";
const warnBadge = "border-amber-200 bg-amber-50 text-amber-700";
const badBadge = "border-red-200 bg-red-50 text-[#C21F2B]";
const mutedBadge = "border-slate-200 bg-slate-50 text-slate-500";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
};

const SyncBadge = ({ status, error, onRetry, busy, testId }) => {
  const map = {
    ok: { cls: okBadge, text: "Synced", Icon: CheckCircle2 },
    pending: { cls: warnBadge, text: "Pending app sync", Icon: Clock },
    failed: { cls: badBadge, text: "Sync failed", Icon: AlertTriangle },
    not_configured: { cls: mutedBadge, text: "Not configured", Icon: Info },
  };
  const m = map[status] || map.pending;
  const badge = (
    <Badge variant="outline" className={`${m.cls} gap-1 text-[10px] whitespace-nowrap`} data-testid={testId}>
      <m.Icon className="h-3 w-3" /> {m.text}
    </Badge>
  );
  return (
    <div className="flex items-center gap-1.5">
      {error ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild><span className="cursor-help">{badge}</span></TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs">{error}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : badge}
      {status !== "ok" && onRetry && (
        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-[#0B1F3B]" onClick={onRetry} disabled={busy} aria-label="Retry sync" data-testid={`${testId}-retry`}>
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
        </Button>
      )}
    </div>
  );
};

const emptyForm = { name: "", phone: "", role: "telecaller", code: "", status: "active" };

function StaffForm({ open, onOpenChange, initial, onSaved, isMe }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initial?.id ? { name: initial.name || "", phone: initial.phone || "", role: initial.role || "telecaller", code: initial.code || "", status: initial.status || "active" } : emptyForm);
      setErr("");
    }
  }, [open, initial]);

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErr(""); };

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setErr("Please enter the person's full name.");
    if (!/^[6-9]\d{9}$/.test(form.phone)) return setErr("Please enter a valid 10-digit mobile number.");
    setSaving(true);
    try {
      let res;
      if (editing) {
        const body = { name: form.name.trim(), phone: form.phone, code: form.code.trim() };
        if (!isMe) { body.role = form.role; body.status = form.status; }
        res = await api.patch(`/admin/staff/${initial.id}`, body);
      } else {
        res = await api.post("/admin/staff", { name: form.name.trim(), phone: form.phone, role: form.role, code: form.code.trim() || null });
      }
      const d = res.data;
      toast.success(editing ? "User updated" : "User added", {
        description: d.app_sync_status === "ok" ? "Also updated in the Yash Trade App." : d.app_sync_status === "pending" ? "Saved here. Will sync to the app once its staff endpoint is live." : d.app_sync_error || undefined,
      });
      onSaved(d);
      onOpenChange(false);
    } catch (e2) {
      setErr(errMsg(e2, "Could not save this user"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="admin-staff-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-[#0B1F3B]">{editing ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>
            {editing ? "Changes apply to this portal immediately and are mirrored to the Yash Trade App." : "The person can log in to the Yash Trade App with this number, and to this portal if they are an Admin."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="staff-name" className="text-sm font-semibold">Full name</Label>
            <Input id="staff-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Ravi Kumar" maxLength={100} className="h-10" data-testid="admin-staff-form-name" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="staff-phone" className="text-sm font-semibold">Mobile number</Label>
              <Input id="staff-phone" type="tel" inputMode="numeric" value={form.phone} onChange={(e) => set("phone")(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit number" className="h-10 font-mono-nums" data-testid="admin-staff-form-phone" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-code" className="text-sm font-semibold">Employee code <span className="font-normal text-slate-400">(optional)</span></Label>
              <Input id="staff-code" value={form.code} onChange={(e) => set("code")(e.target.value)} placeholder="e.g. TC-07" maxLength={30} className="h-10 font-mono-nums" data-testid="admin-staff-form-code" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Role</Label>
              <Select value={form.role} onValueChange={set("role")} disabled={isMe}>
                <SelectTrigger className="h-10" data-testid="admin-staff-form-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r.value} value={r.value} data-testid={`admin-staff-form-role-${r.value}`}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">{isMe ? "Ask another admin to change your role." : roleMeta(form.role).hint}</p>
            </div>
            {editing && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Status</Label>
                <Select value={form.status} onValueChange={set("status")} disabled={isMe}>
                  <SelectTrigger className="h-10" data-testid="admin-staff-form-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled (cannot log in)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {err && <p className="text-sm font-medium text-[#C21F2B]" role="alert" data-testid="admin-staff-form-error">{err}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving} data-testid="admin-staff-form-cancel">Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-[#0B1F3B] hover:bg-[#081a31] font-semibold min-w-[120px]" data-testid="admin-staff-form-submit">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save changes" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffPage() {
  const [data, setData] = useState({ items: [], total: 0, counts: {}, unsynced: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [roleTab, setRoleTab] = useState("all");
  const [q, setQ] = useState("");
  const [appStatus, setAppStatus] = useState(null);
  const [appChecking, setAppChecking] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [bulkBusy, setBulkBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const r = await api.get("/admin/staff");
      setData(r.data);
    } catch (e) {
      setLoadError(errMsg(e, "Could not load users"));
    } finally {
      setLoading(false);
    }
  }, []);

  const checkApp = useCallback(async () => {
    setAppChecking(true);
    try { setAppStatus((await api.get("/admin/staff/app-status")).data); } catch (e) { setAppStatus({ configured: false, detail: errMsg(e) }); } finally { setAppChecking(false); }
  }, []);

  useEffect(() => { load(); checkApp(); }, [load, checkApp]);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.items.filter((u) => (roleTab === "all" || u.role === roleTab) && (!needle || [u.name, u.phone, u.code].some((v) => String(v || "").toLowerCase().includes(needle))));
  }, [data.items, roleTab, q]);

  const upsertLocal = (doc) => setData((d) => {
    const exists = d.items.some((i) => i.id === doc.id);
    const items2 = exists ? d.items.map((i) => (i.id === doc.id ? { ...i, ...doc } : i)) : [...d.items, doc];
    return { ...d, items: items2, total: items2.length };
  });

  const retry = async (u) => {
    setBusyId(u.id);
    try {
      const r = await api.post(`/admin/staff/${u.id}/resync`);
      upsertLocal(r.data);
      if (r.data.app_sync_status === "ok") toast.success("Synced to the Yash Trade App");
      else toast.warning("Still not synced", { description: r.data.app_sync_error || undefined });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusyId(""); }
  };

  const remove = async () => {
    const u = removing;
    if (!u) return;
    setBusyId(u.id);
    try {
      const r = await api.delete(`/admin/staff/${u.id}`);
      toast.success(`${u.name} removed`, { description: r.data.app_sync_status === "ok" ? "Also disabled in the Yash Trade App." : r.data.app_sync_error || undefined });
      setRemoving(null);
      load();
    } catch (e) { toast.error(errMsg(e, "Could not remove this user")); } finally { setBusyId(""); }
  };

  const syncAll = async () => {
    setBulkBusy("sync");
    try {
      const r = await api.post("/admin/staff/sync-all");
      const d = r.data;
      if (d.ok && !d.pending && !d.failed) toast.success(`${d.ok} user${d.ok === 1 ? "" : "s"} synced to the app`);
      else if (d.pending || d.not_configured) toast.warning("App not ready yet", { description: "The Yash Trade App backend has not deployed the staff endpoints. Records stay pending." });
      else toast.warning(`Synced ${d.ok}, failed ${d.failed}`);
      load(); checkApp();
    } catch (e) { toast.error(errMsg(e)); } finally { setBulkBusy(""); }
  };

  const importFromApp = async () => {
    setBulkBusy("import");
    try {
      const r = await api.post("/admin/staff/import-from-app");
      const d = r.data;
      toast.success(`Imported ${d.imported}, linked ${d.linked}`, { description: d.skipped ? `${d.skipped} skipped (unknown role or removed here).` : `${d.app_total} users on the app.` });
      load();
    } catch (e) { toast.error(errMsg(e, "Import failed")); } finally { setBulkBusy(""); }
  };

  const appLive = appStatus?.endpoint_live === true && appStatus?.key_accepted === true;
  const appTone = !appStatus ? warnBadge : appLive ? okBadge : appStatus.endpoint_live === false || appStatus.configured === false ? warnBadge : badBadge;
  const appText = !appStatus ? "Checking…" : appLive ? "Connected" : appStatus.configured === false ? "Not configured" : appStatus.endpoint_live === false ? "Waiting for app update" : appStatus.key_accepted === false ? "Key rejected" : "Unreachable";

  return (
    <div className="space-y-5" data-testid="admin-staff-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">Manage Users</h1>
          <p className="text-sm text-slate-500">Admins, telecallers and billing executives — one list for this portal and the Yash Trade App.</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-1.5 bg-[#0B1F3B] hover:bg-[#081a31] font-semibold" data-testid="admin-staff-add-button">
          <UserPlus className="h-4 w-4" /> Add user
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r.value} className="rounded-xl border-slate-200">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-[#0B1F3B]"><r.icon className="h-5 w-5" /></div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{r.label}s</p>
                <p className="font-heading text-2xl font-bold text-[#0B1F3B]" data-testid={`admin-staff-count-${r.value}`}>{loading ? "…" : (data.counts?.[r.value] ?? 0)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-xl border-slate-200" data-testid="admin-staff-app-status-card">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><Link2 className="h-4 w-4" /> Yash Trade App — user sync</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`${appTone} text-[10px]`} data-testid="admin-staff-app-status-badge">{appText}</Badge>
              <Button variant="outline" size="sm" onClick={checkApp} disabled={appChecking} className="gap-1.5" data-testid="admin-staff-app-recheck">
                <RefreshCw className={`h-3.5 w-3.5 ${appChecking ? "animate-spin" : ""}`} /> Re-check
              </Button>
              <Button variant="outline" size="sm" onClick={importFromApp} disabled={!appLive || !!bulkBusy} className="gap-1.5" data-testid="admin-staff-import-button">
                {bulkBusy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />} Import from app
              </Button>
              <Button variant="outline" size="sm" onClick={syncAll} disabled={!!bulkBusy || !data.unsynced} className="gap-1.5" data-testid="admin-staff-sync-all-button">
                {bulkBusy === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />} Sync all{data.unsynced ? ` (${data.unsynced})` : ""}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-slate-600" data-testid="admin-staff-app-status-detail">
            {appStatus?.detail || "Checking whether the app backend exposes the staff endpoints…"}
            {appStatus?.app_user_count != null && <span className="ml-1 text-slate-400">({appStatus.app_user_count} users on the app)</span>}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 overflow-hidden">
        <CardContent className="space-y-3 p-4 pb-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs value={roleTab} onValueChange={setRoleTab}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs" data-testid="admin-staff-tab-all">All ({data.total})</TabsTrigger>
                {ROLES.map((r) => <TabsTrigger key={r.value} value={r.value} className="text-xs" data-testid={`admin-staff-tab-${r.value}`}>{r.label}s ({data.counts?.[r.value] ?? 0})</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <div className="relative md:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or code…" className="h-9 pl-9" data-testid="admin-staff-search-input" />
            </div>
          </div>
        </CardContent>
        <div className="overflow-x-auto mt-3">
          <Table data-testid="admin-staff-table">
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-[11px] font-bold uppercase">Name</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Phone</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Role</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Code</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Status</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">App sync</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Last login</TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : loadError ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm">
                  <p className="text-[#C21F2B] font-medium" data-testid="admin-staff-load-error">{loadError}</p>
                  <Button variant="outline" size="sm" onClick={load} className="mt-3 gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
                </TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-sm text-slate-400" data-testid="admin-staff-empty">
                  {q || roleTab !== "all" ? "No users match this filter." : "No users yet. Add the first one."}
                </TableCell></TableRow>
              ) : (
                items.map((u) => {
                  const rm = roleMeta(u.role);
                  return (
                    <TableRow key={u.id} className={u.status === "disabled" ? "opacity-60" : ""} data-testid={`admin-staff-row-${u.phone}`}>
                      <TableCell className="text-sm font-semibold text-[#0B1F3B]">
                        <div className="flex items-center gap-2">
                          <span>{u.name}</span>
                          {u.is_me && <Badge variant="outline" className={`${mutedBadge} text-[10px]`}>You</Badge>}
                          {u.source === "env" && u.app_sync_status !== "ok" && (
                            <TooltipProvider delayDuration={150}><Tooltip>
                              <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-slate-400" /></TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">Added from the server's admin whitelist. Edit to give this person their real name.</TooltipContent>
                            </Tooltip></TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono-nums text-xs">{u.phone}</TableCell>
                      <TableCell><Badge variant="outline" className={`${rm.badge} gap-1 text-[10px]`} data-testid={`admin-staff-role-${u.phone}`}><rm.icon className="h-3 w-3" /> {rm.label}</Badge></TableCell>
                      <TableCell className="font-mono-nums text-xs text-slate-600">{u.code || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${u.status === "active" ? okBadge : badBadge} text-[10px]`} data-testid={`admin-staff-status-${u.phone}`}>{u.status === "active" ? "Active" : "Disabled"}</Badge>
                      </TableCell>
                      <TableCell><SyncBadge status={u.app_sync_status} error={u.app_sync_error} onRetry={() => retry(u)} busy={busyId === u.id} testId={`admin-staff-sync-${u.phone}`} /></TableCell>
                      <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                        <div>{fmtDate(u.app_last_login)} <span className="text-slate-400">app</span></div>
                        {u.role === "admin" && <div>{fmtDate(u.site_last_login)} <span className="text-slate-400">portal</span></div>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-[#0B1F3B]" onClick={() => { setEditing(u); setFormOpen(true); }} aria-label={`Edit ${u.name}`} data-testid={`admin-staff-edit-${u.phone}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-[#C21F2B] disabled:opacity-30" onClick={() => setRemoving(u)} disabled={u.is_me} aria-label={`Remove ${u.name}`} data-testid={`admin-staff-remove-${u.phone}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="text-[11px] text-slate-500">Safety: you cannot remove or demote yourself, and the last active admin can never be removed. Removing a user signs them out of this portal immediately and disables them in the app.</p>
        </div>
      </Card>

      <StaffForm open={formOpen} onOpenChange={setFormOpen} initial={editing} isMe={!!editing?.is_me} onSaved={(d) => { upsertLocal({ ...d, is_me: editing?.is_me || false }); load(); }} />

      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <AlertDialogContent data-testid="admin-staff-remove-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-[#0B1F3B]">Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono-nums">{removing?.phone}</span> will lose access to this portal right away and be disabled in the Yash Trade App. Their history stays in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="admin-staff-remove-cancel">Keep user</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); remove(); }} disabled={busyId === removing?.id} className="bg-[#C21F2B] hover:bg-[#a51a24] font-semibold" data-testid="admin-staff-remove-confirm">
              {busyId === removing?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
