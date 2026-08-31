import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";

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

  useEffect(() => {
    setLoading(true);
    api.get("/admin/audit-logs", { params: { page, page_size: 25 } })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <FileClock className="h-6 w-6 text-[#0B1F3B]" />
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">Reports &amp; Audit Log</h1>
          <p className="text-sm text-slate-500">Every sensitive administrative action is recorded here</p>
        </div>
      </div>

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
