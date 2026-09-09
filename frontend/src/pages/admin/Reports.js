import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileClock, Trash2, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

const fmt = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
};

const actionTone = (a) => {
  if (a.includes("failed") || a.includes("deactivated")) return "border-red-200 bg-red-50 text-red-700";
  if (a.includes("success") || a.includes("activated")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

export default function Reports() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(null);

  const loadDeletions = () => api.get("/admin/deletion-requests", { params: { page_size: 50 } }).then((r) => setDel(r.data)).catch(() => setDel({ items: [], total: 0, pending: 0, overdue: 0 }));

  useEffect(() => { loadDeletions(); }, []);

  useEffect(() => {
    setLoading(true);
    api.get("/admin/audit-logs", { params: { page, page_size: 25 } })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [page]);

  const completeDeletion = async (id) => {
    setDelBusy(id);
    try {
      await api.post(`/admin/deletion-requests/${id}/complete`);
      toast.success("Marked as completed - phone number purged from the request");
      loadDeletions();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDelBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <FileClock className="h-6 w-6 text-[#0B1F3B]" />
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">Reports &amp; Audit Log</h1>
          <p className="text-sm text-slate-500">Every sensitive administrative action is recorded here</p>
        </div>
      </div>

      {/* Account deletion requests (Google Play / App Store compliance) */}
      <Card className={`rounded-xl overflow-hidden ${del?.overdue ? "border-red-300" : del?.pending ? "border-amber-300" : "border-slate-200"}`} data-testid="admin-deletion-requests-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-[#0B1F3B]" />
            <h2 className="text-sm font-bold text-[#0B1F3B]">Account deletion requests</h2>
            {del && (
              <>
                <Badge variant="outline" className={del.pending ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"} data-testid="admin-deletion-pending-badge">{del.pending} pending</Badge>
                {del.overdue > 0 && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700" data-testid="admin-deletion-overdue-badge">{del.overdue} overdue</Badge>}
              </>
            )}
          </div>
          <p className="text-xs text-slate-500 hidden sm:block">Customers request deletion at /delete-account. Remove the record from the Yash Trade App backend, then mark completed within {del?.sla_days ?? 30} days.</p>
        </div>
        {del && del.items.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500" data-testid="admin-deletion-empty">No deletion requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="admin-deletion-table">
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Requested</TableHead>
                  <TableHead className="text-xs">Phone</TableHead>
                  <TableHead className="text-xs">Website data</TableHead>
                  <TableHead className="text-xs">App backend</TableHead>
                  <TableHead className="text-xs">Due by</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs w-36"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(del?.items || []).map((r) => (
                  <TableRow key={r.id} data-testid="admin-deletion-row">
                    <TableCell className="font-mono-nums text-xs font-semibold">{r.reference}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmt(r.requested_at)}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{r.status === "completed" ? r.phone_masked : (r.phone || r.phone_masked)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700">{r.website_deleted ? "Deleted" : "n/a"}</Badge></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${r.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : r.live_status === "anonymized" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                        {r.status === "completed" ? "Deleted" : r.live_status === "anonymized" ? "De-identified · removal pending" : "Removal pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-xs whitespace-nowrap ${r.status !== "completed" && r.due_by < new Date().toISOString() ? "text-red-700 font-semibold" : ""}`}>{fmt(r.due_by)}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={r.reason}>{r.reason || "—"}</TableCell>
                    <TableCell>
                      {r.status !== "completed" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={delBusy === r.id} onClick={() => completeDeletion(r.id)} data-testid="admin-deletion-complete-button">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Mark completed
                        </Button>
                      ) : (
                        <span className="text-[11px] text-slate-500">Done {fmt(r.completed_at)}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="rounded-xl border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table data-testid="admin-audit-table">
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-[11px] font-bold uppercase">When</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Actor</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Role</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Action</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Target</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-slate-400">Loading…</TableCell></TableRow>
              ) : data.items.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-slate-400">No audit entries yet</TableCell></TableRow>
              ) : (
                data.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">{fmt(log.created_at)}</TableCell>
                    <TableCell className="font-mono-nums text-xs">{log.actor}</TableCell>
                    <TableCell className="text-xs">{log.actor_role}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${actionTone(log.action)}`}>{log.action.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="font-mono-nums text-[10px] text-slate-400">{log.target ? `${log.target.slice(0, 8)}…` : "—"}</TableCell>
                    <TableCell className="text-[11px] text-slate-500 max-w-[280px] truncate">{JSON.stringify(log.details)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">Page {data.page} of {data.pages} · {data.total} entries</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="gap-1"><ChevronLeft className="h-3.5 w-3.5" /> Prev</Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="gap-1">Next <ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
