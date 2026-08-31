import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, PencilLine, Power, RefreshCcw, StickyNote, Loader2, PhoneCall, ShieldAlert, Store, MapPin, CircleCheck, CircleX, Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

const fmt = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
};

const timelineIcon = { registered: CircleCheck, sync: RefreshCcw, login: PhoneCall, admin: ShieldAlert };

export default function UserDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({});
  const [note, setNote] = useState("");
  const [phoneChangeOpen, setPhoneChangeOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/customers/${id}`)
      .then((r) => { setData(r.data); setEdit({ name: r.data.customer.name, shop_name: r.data.customer.shop_name, location: r.data.customer.location, city: r.data.customer.city }); })
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#0B1F3B]" /></div>;
  }
  if (!data) return null;
  const c = data.customer;

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.patch(`/admin/customers/${id}`, edit);
      toast.success("Customer details updated and pushed to the app backend");
      setEditOpen(false);
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const toggleStatus = async () => {
    setBusy(true);
    const next = c.account_status === "active" ? "inactive" : "active";
    try {
      await api.post(`/admin/customers/${id}/status`, { account_status: next, reason: `Changed via admin portal` });
      toast.success(next === "inactive" ? "Account deactivated" : "Account activated");
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/customers/${id}/notes`, { note });
      setNote("");
      toast.success("Note added");
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const retrySync = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/admin/customers/${id}/retry-sync`);
      r.data.success ? toast.success("Synced to Yash Trade App backend") : toast.error(r.data.error || "Sync failed");
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const initPhoneChange = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/admin/customers/${id}/phone-change/init`, { new_phone: newPhone });
      toast.success(r.data.message);
      setPhoneOtpSent(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const verifyPhoneChange = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/customers/${id}/phone-change/verify`, { otp: phoneOtp });
      toast.success("Phone number changed and re-verified");
      setPhoneChangeOpen(false);
      setPhoneOtpSent(false);
      setNewPhone("");
      setPhoneOtp("");
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-[#0B1F3B]" data-testid="admin-user-detail-back">
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </Link>

      <Card className="rounded-xl border-slate-200">
        <CardContent className="p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]" data-testid="admin-user-detail-name">{c.name}</h1>
              <Badge variant="outline" className={c.account_status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"} data-testid="admin-user-detail-status-badge">
                {c.account_status}
              </Badge>
              <Badge variant="outline" className={c.live_sync_status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                {c.live_sync_status === "ok" ? "Synced to app backend" : "Sync pending / failed"}
              </Badge>
            </div>
            <p className="font-mono-nums text-sm text-slate-600" data-testid="admin-user-detail-phone">+91 {c.phone}</p>
            <p className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" /> {c.shop_name}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {c.location}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" data-testid="admin-user-detail-edit-button"><PencilLine className="h-3.5 w-3.5" /> Edit details</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit customer details</DialogTitle>
                  <DialogDescription>Changes are also pushed to the shared Yash Trade App backend. Phone number cannot be edited here.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  {["name", "shop_name", "location", "city"].map((k) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs font-semibold capitalize">{k.replace("_", " ")}</Label>
                      <Input value={edit[k] || ""} onChange={(e) => setEdit((x) => ({ ...x, [k]: e.target.value }))} data-testid={`admin-user-edit-${k.replace("_", "-")}-input`} />
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button onClick={saveEdit} disabled={busy} className="bg-[#0B1F3B]" data-testid="admin-user-edit-save-button">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={phoneChangeOpen} onOpenChange={(v) => { setPhoneChangeOpen(v); if (!v) { setPhoneOtpSent(false); setNewPhone(""); setPhoneOtp(""); } }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" data-testid="admin-user-phone-change-button"><PhoneCall className="h-3.5 w-3.5" /> Change phone</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Protected phone change</DialogTitle>
                  <DialogDescription>
                    The verified phone number is the customer's login identity. Changing it requires OTP re-verification on the new number.
                  </DialogDescription>
                </DialogHeader>
                {!phoneOtpSent ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">New phone number</Label>
                      <Input value={newPhone} maxLength={10} inputMode="numeric" onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" className="font-mono-nums" data-testid="admin-phone-change-input" />
                    </div>
                    <Button onClick={initPhoneChange} disabled={busy || newPhone.length !== 10} className="w-full bg-[#0B1F3B]" data-testid="admin-phone-change-send-otp">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send verification OTP"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">Enter the OTP sent to <span className="font-mono-nums font-semibold">+91 {newPhone}</span></p>
                    <div className="flex justify-center" data-testid="admin-phone-change-otp-input">
                      <InputOTP maxLength={4} value={phoneOtp} onChange={setPhoneOtp}>
                        <InputOTPGroup className="gap-2">
                          {[0, 1, 2, 3].map((i) => <InputOTPSlot key={i} index={i} className="h-11 w-11 rounded-lg border border-slate-300 first:rounded-l-lg last:rounded-r-lg" />)}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <Button onClick={verifyPhoneChange} disabled={busy || phoneOtp.length !== 4} className="w-full bg-[#0B1F3B]" data-testid="admin-phone-change-verify">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & change number"}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {c.live_sync_status !== "ok" && (
              <Button variant="outline" size="sm" onClick={retrySync} disabled={busy} className="gap-1.5 border-amber-300 text-amber-700" data-testid="admin-user-retry-sync-button">
                <RefreshCcw className="h-3.5 w-3.5" /> Retry app sync
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant={c.account_status === "active" ? "destructive" : "default"} size="sm" className={`gap-1.5 ${c.account_status !== "active" ? "bg-[#0F766E] hover:bg-[#0c5f58]" : ""}`} data-testid="admin-user-detail-activate-toggle">
                  <Power className="h-3.5 w-3.5" /> {c.account_status === "active" ? "Deactivate" : "Activate"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{c.account_status === "active" ? "Deactivate this customer?" : "Activate this customer?"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {c.account_status === "active"
                      ? "The customer will be blocked from enrolling again and flagged inactive. This action is recorded in the audit log."
                      : "The customer will regain access. This action is recorded in the audit log."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="admin-user-status-cancel">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={toggleStatus} className={c.account_status === "active" ? "bg-[#C21F2B] hover:bg-[#a01a24]" : "bg-[#0F766E] hover:bg-[#0c5f58]"} data-testid="admin-user-status-confirm">
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Registered", value: fmt(c.registered_at) },
          { label: "First app login", value: fmt(c.first_login_at) },
          { label: "Last app login", value: fmt(c.last_login_at) },
          { label: "Login status", value: c.has_logged_in ? "Logged in" : "Never logged in" },
        ].map((s) => (
          <Card key={s.label} className="rounded-xl border-slate-200">
            <CardContent className="p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{s.label}</p>
              <p className="mt-1 text-sm font-semibold text-[#0B1F3B]">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="admin-user-tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="activity" data-testid="admin-user-tab-activity">Activity Timeline</TabsTrigger>
          <TabsTrigger value="notes" data-testid="admin-user-tab-notes">Internal Notes ({data.notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="rounded-xl border-slate-200">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-bold text-[#0B1F3B]">Enrollment data (submitted on website)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
              {[
                ["Customer name", c.name], ["Phone", c.phone], ["Shop name", c.shop_name], ["Location", c.location],
                ["City", c.city], ["Role", c.role], ["Phone verified", c.phone_verified ? "Yes" : "No"],
                ["Onboarding status", c.onboarding_status], ["Registration source", c.registration_source],
                ["Account status", c.account_status], ["Consents", c.consent_terms && c.consent_privacy ? "Terms + Privacy accepted" : "Incomplete"],
                ["Live sync", c.live_sync_status === "ok" ? `OK (app user ${c.live_user_id?.slice(0, 8)}…)` : (c.live_sync_error || c.live_sync_status)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-50 py-1.5">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-medium text-[#0B1F3B] text-right">{String(v ?? "—")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          {data.live_profile && (
            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-bold text-[#0B1F3B]">Yash Trade App profile (shared backend record)</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 text-sm" data-testid="admin-user-live-profile">
                {Object.entries(data.live_profile).filter(([k]) => !["category_interests"].includes(k)).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-slate-50 py-1.5">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-medium text-[#0B1F3B] text-right break-all">{String(v ?? "—")}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <Card className="rounded-xl border-slate-200">
            <CardContent className="p-5" data-testid="admin-user-timeline">
              {data.timeline.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No activity yet</p>
              ) : (
                <ol className="relative space-y-5 border-l border-slate-200 pl-6">
                  {data.timeline.map((e, i) => {
                    const Icon = timelineIcon[e.type] || Clock3;
                    return (
                      <li key={i} className="relative">
                        <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full bg-white border border-slate-200">
                          <Icon className="h-3 w-3 text-[#0B1F3B]" />
                        </span>
                        <p className="text-sm font-semibold text-[#0B1F3B]">{e.title}</p>
                        {e.detail && <p className="text-xs text-slate-500">{e.detail}</p>}
                        <p className="text-[10px] text-slate-400 mt-0.5">{fmt(e.at)}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="rounded-xl border-slate-200">
            <CardContent className="p-5 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Add internal note</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to admins only…" rows={3} data-testid="admin-user-note-input" />
                <Button onClick={addNote} disabled={busy || !note.trim()} size="sm" className="bg-[#0B1F3B] gap-1.5" data-testid="admin-user-note-add-button">
                  <StickyNote className="h-3.5 w-3.5" /> Add note
                </Button>
              </div>
              <div className="space-y-3" data-testid="admin-user-notes-list">
                {data.notes.length === 0 && <p className="text-sm text-slate-400">No notes yet</p>}
                {data.notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.note}</p>
                    <p className="mt-1.5 text-[10px] text-slate-400">By <span className="font-mono-nums">{n.author}</span> · {fmt(n.created_at)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
