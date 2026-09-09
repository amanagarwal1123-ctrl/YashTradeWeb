import React, { useCallback, useEffect, useState } from "react";
import {
  Settings as SettingsIcon, Server, MessageSquareText, Link2, ShieldCheck, RefreshCw, Send, Loader2,
  CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errMsg } from "@/lib/api";
import { useAdmin } from "@/components/admin/AdminLayout";
import { toast } from "sonner";

const okBadge = "border-emerald-200 bg-emerald-50 text-emerald-700";
const warnBadge = "border-amber-200 bg-amber-50 text-amber-700";
const badBadge = "border-red-200 bg-red-50 text-[#C21F2B]";

const StatusBadge = ({ ok, okText = "OK", badText = "Problem", pending, testId }) => {
  if (pending) return <Badge variant="outline" className={warnBadge} data-testid={testId}>Checking…</Badge>;
  return (
    <Badge variant="outline" className={ok ? okBadge : badBadge} data-testid={testId}>
      {ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
      {ok ? okText : badText}
    </Badge>
  );
};

const Row = ({ label, children, last }) => (
  <div className={`flex items-start justify-between gap-4 py-1.5 ${last ? "" : "border-b border-slate-50"}`}>
    <span className="text-slate-500 shrink-0">{label}</span>
    <span className="text-right font-medium break-all">{children}</span>
  </div>
);

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

const PENDING = ["pending", "submitted", "queued", "sent", "scheduled", "processing"];

const DeliveryBadge = ({ log }) => {
  if (!log.sent) return <span className="text-xs text-slate-400">—</span>;
  const s = String(log.delivery_status || "").toLowerCase();
  if (!s || s === "check_error") return <Badge variant="outline" className={`text-[10px] ${warnBadge}`}>Checking…</Badge>;
  if (s === "delivered") return <Badge variant="outline" className={`text-[10px] ${okBadge}`}>Delivered</Badge>;
  if (s === "not_logged") return <Badge variant="outline" className={`text-[10px] ${badBadge}`}>Dropped by MSG91</Badge>;
  if (PENDING.includes(s)) return <Badge variant="outline" className={`text-[10px] ${warnBadge}`}>{log.delivery_status}</Badge>;
  return <Badge variant="outline" className={`text-[10px] ${badBadge}`}>{log.delivery_status}</Badge>;
};

export default function Settings() {
  const { me } = useAdmin() || {};
  const [config, setConfig] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null);
  const [diag, setDiag] = useState(null);
  const [diagLoading, setDiagLoading] = useState(true);
  const [diagError, setDiagError] = useState("");
  const [logs, setLogs] = useState(null);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const loadDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    setDiagError("");
    try {
      const [d, l] = await Promise.all([api.get("/admin/sms/diagnostics"), api.get("/admin/sms/logs", { params: { page_size: 10 } })]);
      setDiag(d.data);
      setLogs(l.data.items || []);
    } catch (err) {
      setDiagError(errMsg(err, "Could not load SMS diagnostics"));
    } finally {
      setDiagLoading(false);
    }
  }, []);

  const [liveHealth, setLiveHealth] = useState(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    try {
      const r = await api.get("/admin/live/health");
      setLiveHealth(r.data);
    } catch {
      setLiveHealth(null);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get("/public/config").then((r) => setConfig(r.data)).catch(() => {});
    api.get("/admin/live/status").then((r) => setLiveStatus(r.data)).catch(() => {});
    loadDiagnostics();
    loadLive();
  }, [loadDiagnostics, loadLive]);

  const sendTest = async (e) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(testPhone)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post("/admin/sms/test", { phone: testPhone });
      setTestResult(res.data);
      if (res.data.sent) {
        toast.success("MSG91 accepted the test SMS — checking delivery…");
        setTimeout(loadDiagnostics, 9000);
      } else {
        toast.error(res.data.message || "Test SMS failed", { duration: 8000 });
      }
      loadDiagnostics();
    } catch (err) {
      const msg = errMsg(err, "Test SMS failed");
      setTestResult({ sent: false, message: msg });
      toast.error(msg, { duration: 8000 });
    } finally {
      setTesting(false);
    }
  };

  const [refreshingId, setRefreshingId] = useState(null);
  const refreshRow = async (id) => {
    setRefreshingId(id);
    try {
      const res = await api.post(`/admin/sms/logs/${id}/refresh`);
      setLogs((ls) => (ls || []).map((l) => (l.id === id ? res.data : l)));
    } catch (err) {
      toast.error(errMsg(err, "Could not fetch delivery status"));
    } finally {
      setRefreshingId(null);
    }
  };

  const pc = diag?.provider_check;
  const cfg = diag?.config;
  const healthy = !!pc?.healthy;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-[#0B1F3B]" />
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">Application Settings</h1>
          <p className="text-sm text-slate-500">Environment, integrations and connection status</p>
        </div>
      </div>

      <Card className="rounded-xl border-slate-200">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><Server className="h-4 w-4" /> Environment</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm" data-testid="admin-settings-environment">
          <Row label="Mode">
            <Badge variant="outline" className={config?.environment === "production" ? okBadge : warnBadge}>
              {config?.environment || "…"}
            </Badge>
          </Row>
          <Row label="Backend build">
            <span className="font-mono-nums text-xs" data-testid="admin-settings-build">{config?.build || "…"}</span>
          </Row>
          <Row label="Demo OTP (1234)">Permanently disabled — real MSG91 OTPs only</Row>
          <Row label="Admin session" last>
            <span className="font-mono-nums text-xs">expires {me?.expires_at ? new Date(me.expires_at).toLocaleString("en-IN") : "…"}</span>
          </Row>
        </CardContent>
      </Card>

      {/* ---------------- SMS provider diagnostics ---------------- */}
      <Card className="rounded-xl border-slate-200" data-testid="admin-settings-sms-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><MessageSquareText className="h-4 w-4" /> SMS Provider (MSG91) — Live Diagnostics</CardTitle>
            <div className="flex items-center gap-2">
              {!diagLoading && !diagError && (
                <StatusBadge ok={healthy} okText="Healthy" badText="Needs attention" testId="admin-sms-overall-status" />
              )}
              <Button variant="outline" size="sm" onClick={loadDiagnostics} disabled={diagLoading} className="gap-1.5" data-testid="admin-sms-recheck-button">
                <RefreshCw className={`h-3.5 w-3.5 ${diagLoading ? "animate-spin" : ""}`} /> Re-check
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500">These checks run from the server this admin panel is deployed on — so they reflect the live environment, not the development preview.</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {diagLoading && !diag ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-3/4" />
            </div>
          ) : diagError ? (
            <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-[#C21F2B]" data-testid="admin-sms-diag-error">{diagError}</p>
          ) : (
            <>
              <div className="space-y-1">
                <Row label="Auth key on server">
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono-nums text-xs text-slate-500">{cfg?.authkey_hint || "not set"}</span>
                    <StatusBadge ok={!!cfg?.authkey_configured} okText="Configured" badText="Missing" testId="admin-sms-authkey-status" />
                  </span>
                </Row>
                <Row label="Auth key accepted by MSG91">
                  <StatusBadge ok={pc?.authkey_valid === true} okText="Valid" badText={pc?.authkey_valid === false ? "Rejected" : "Unknown"} testId="admin-sms-authkey-valid" />
                </Row>
                <Row label="Flow template on server">
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono-nums text-xs text-slate-500">{cfg?.template_id || "not set"}</span>
                    <StatusBadge ok={!!cfg?.template_configured} okText="Configured" badText="Missing" testId="admin-sms-template-status" />
                  </span>
                </Row>
                {pc?.template && (
                  <>
                    <Row label="Template (from MSG91)">
                      <span>{pc.template.name} · sender <span className="font-mono-nums">{pc.template.sender_id}</span></span>
                    </Row>
                    <Row label="DLT approval">
                      <span className="inline-flex items-center gap-2">
                        <span className="font-mono-nums text-xs text-slate-500">{pc.template.dlt_template_id}</span>
                        <StatusBadge ok={String(pc.template.status).toLowerCase() === "approved" && String(pc.template.state).toLowerCase() === "enabled"}
                          okText={`${pc.template.status} · ${pc.template.state}`} badText={`${pc.template.status} · ${pc.template.state}`} testId="admin-sms-template-dlt" />
                      </span>
                    </Row>
                  </>
                )}
                <Row label="Send endpoint"><span className="font-mono-nums text-xs">{cfg?.primary_endpoint}</span></Row>
                <Row label="Last 24 hours" last>
                  <span className="inline-flex flex-wrap justify-end items-center gap-1.5">
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600" data-testid="admin-sms-sent-24h">{diag?.last_24h?.sent ?? 0} accepted</Badge>
                    <Badge variant="outline" className={okBadge} data-testid="admin-sms-delivered-24h">{diag?.last_24h?.delivered ?? 0} delivered</Badge>
                    <Badge variant="outline" className={(diag?.last_24h?.dropped_by_provider ?? 0) > 0 ? badBadge : "border-slate-200 bg-slate-50 text-slate-600"} data-testid="admin-sms-dropped-24h">{diag?.last_24h?.dropped_by_provider ?? 0} dropped</Badge>
                    <Badge variant="outline" className={(diag?.last_24h?.failed ?? 0) > 0 ? badBadge : "border-slate-200 bg-slate-50 text-slate-600"} data-testid="admin-sms-failed-24h">{diag?.last_24h?.failed ?? 0} rejected</Badge>
                  </span>
                </Row>
              </div>

              {pc?.error && (
                <p className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-[#C21F2B]" data-testid="admin-sms-provider-error">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span><span className="font-semibold">MSG91 says:</span> {pc.error}</span>
                </p>
              )}
              {pc?.warning && (
                <p className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800" data-testid="admin-sms-provider-warning">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span>{pc.warning}</span>
                </p>
              )}
              {!pc?.error && !pc?.warning && diag?.last_failure && (
                <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800" data-testid="admin-sms-last-failure">
                  Last failed send: {fmtTime(diag.last_failure.created_at)} to ******{String(diag.last_failure.phone || "").slice(-4)} — {diag.last_failure.error_detail || diag.last_failure.error}
                </p>
              )}

              {/* Test send */}
              <form onSubmit={sendTest} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-[#0B1F3B]">Send a test OTP SMS from this server</p>
                <div className="flex gap-2">
                  <div className="flex flex-1">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-[hsl(var(--input))] bg-white px-2.5 text-xs font-semibold text-slate-600 font-mono-nums">+91</span>
                    <Input
                      type="tel" inputMode="numeric" maxLength={10} value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit mobile number" className="h-9 rounded-l-none font-mono-nums bg-white"
                      data-testid="admin-sms-test-phone-input"
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={testing || testPhone.length !== 10} className="h-9 gap-1.5 bg-[#0B1F3B] hover:bg-[#081a31]" data-testid="admin-sms-test-send-button">
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test
                  </Button>
                </div>
                {testResult && (
                  <p className={`rounded-md px-3 py-2 text-xs ${testResult.sent ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-[#C21F2B]"}`} data-testid="admin-sms-test-result">
                    {testResult.message}
                  </p>
                )}
                <p className="text-[11px] text-slate-500">The test code is not stored and cannot be used to log in. "Accepted" only means MSG91 took the request — the Delivery column below shows what the operator actually reported.</p>
              </form>

              {/* Recent log */}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[#0B1F3B]">Recent SMS attempts</p>
                {logs && logs.length === 0 ? (
                  <p className="text-xs text-slate-500" data-testid="admin-sms-logs-empty">No SMS attempts recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <Table data-testid="admin-sms-logs-table">
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="text-xs">Time</TableHead>
                          <TableHead className="text-xs">Phone</TableHead>
                          <TableHead className="text-xs">Purpose</TableHead>
                          <TableHead className="text-xs">MSG91</TableHead>
                          <TableHead className="text-xs">Delivery</TableHead>
                          <TableHead className="text-xs">Request ID / Reason</TableHead>
                          <TableHead className="text-xs w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(logs || []).map((l) => (
                          <TableRow key={l.id} data-testid="admin-sms-log-row">
                            <TableCell className="text-xs whitespace-nowrap">{fmtTime(l.created_at)}</TableCell>
                            <TableCell className="text-xs font-mono-nums">{l.phone}</TableCell>
                            <TableCell className="text-xs">{l.purpose}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${l.sent ? okBadge : badBadge}`}>{l.sent ? "Accepted" : "Rejected"}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <DeliveryBadge log={l} />
                                {l.delivered_at && <span className="text-[10px] text-slate-500 whitespace-nowrap">{l.delivered_at}</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono-nums break-all max-w-[220px]">
                              {l.sent ? l.request_id : (l.error_detail || l.error)}
                              {l.failure_reason && <span className="block text-[10px] text-[#C21F2B] font-sans">{l.failure_reason}</span>}
                            </TableCell>
                            <TableCell>
                              {l.sent && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refreshRow(l.id)} disabled={refreshingId === l.id} title="Re-check delivery status" data-testid="admin-sms-log-refresh">
                                  <RefreshCw className={`h-3.5 w-3.5 ${refreshingId === l.id ? "animate-spin" : ""}`} />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200" data-testid="admin-settings-live-backend">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><Link2 className="h-4 w-4" /> Shared Yash Trade App Backend — Data Sharing Check</CardTitle>
            <div className="flex items-center gap-2">
              {liveHealth && (
                <StatusBadge ok={!!liveHealth.health?.reachable && !liveHealth.warnings?.length} okText="Healthy" badText={liveHealth.health?.reachable ? "Attention" : "Unreachable"} testId="admin-live-overall-status" />
              )}
              <Button variant="outline" size="sm" onClick={loadLive} disabled={liveLoading} className="gap-1.5" data-testid="admin-live-recheck-button">
                <RefreshCw className={`h-3.5 w-3.5 ${liveLoading ? "animate-spin" : ""}`} /> Re-check
              </Button>
            </div>
          </div>
          <p className="text-xs text-slate-500">Reads the app backend's own health endpoint and summarises how website enrollments are landing there.</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {liveLoading && !liveHealth ? (
            <div className="space-y-2"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-3/4" /></div>
          ) : liveHealth ? (
            <>
              <div className="space-y-1">
                <Row label="Backend URL"><span className="font-mono-nums text-xs">{liveHealth.live_backend || liveStatus?.live_backend || "…"}</span></Row>
                <Row label="Reachable"><StatusBadge ok={!!liveHealth.health?.reachable} okText="Yes" badText="No" testId="admin-live-reachable" /></Row>
                {liveHealth.health?.build && <Row label="App backend build"><span className="font-mono-nums text-xs">{liveHealth.health.build}</span></Row>}
                <Row label="App OTP mode">
                  <Badge variant="outline" className={liveHealth.health?.demo_mode ? warnBadge : okBadge} data-testid="admin-live-demo-mode">
                    {liveHealth.health?.demo_mode ? "DEMO (1234, no SMS)" : liveHealth.health?.demo_mode === false ? "Real OTPs" : "unknown"}
                  </Badge>
                </Row>
                <Row label="Sync method">
                  <span className="text-xs">{liveHealth.sync_method === "integration_key" ? "Server-to-server integration key" : "Customer OTP login (demo-mode dependent)"}</span>
                </Row>
                <Row label="Website enrollments" last>
                  <span className="inline-flex flex-wrap justify-end items-center gap-1.5">
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600" data-testid="admin-live-total">{liveHealth.stats?.total ?? 0} total</Badge>
                    <Badge variant="outline" className={okBadge} data-testid="admin-live-synced">{liveHealth.stats?.synced_ok ?? 0} synced</Badge>
                    <Badge variant="outline" className={(liveHealth.stats?.partial ?? 0) > 0 ? warnBadge : "border-slate-200 bg-slate-50 text-slate-600"} data-testid="admin-live-partial">{liveHealth.stats?.partial ?? 0} partial</Badge>
                    <Badge variant="outline" className={(liveHealth.stats?.failed_or_pending ?? 0) > 0 ? badBadge : "border-slate-200 bg-slate-50 text-slate-600"} data-testid="admin-live-failed">{liveHealth.stats?.failed_or_pending ?? 0} failed</Badge>
                  </span>
                </Row>
              </div>
              {(liveHealth.warnings || []).map((w, i) => (
                <p key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800" data-testid="admin-live-warning">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span>{w}</span>
                </p>
              ))}
              <p className="text-[11px] text-slate-500">To verify one customer field-by-field, open the customer and press "Verify on app backend".</p>
            </>
          ) : (
            <p className="text-xs text-[#C21F2B]">Could not load the shared backend status.</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><ShieldCheck className="h-4 w-4" /> Security</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-xs text-slate-600">
          <p>• OTPs are stored hashed and expire after 10 minutes; max 5 verification attempts and 3 resends.</p>
          <p>• An OTP request only succeeds when MSG91 has genuinely accepted the SMS — otherwise the customer sees a clear error instead of a false "OTP sent".</p>
          <p>• Admin sessions use HTTP-only secure cookies with 12-hour expiry and 2-hour idle timeout.</p>
          <p>• Failed admin logins are rate-limited (lockout after 5 failures in 15 minutes) and audit-logged.</p>
          <p>• Customers and telecallers receive 403 Forbidden on all admin routes.</p>
        </CardContent>
      </Card>
    </div>
  );
}
