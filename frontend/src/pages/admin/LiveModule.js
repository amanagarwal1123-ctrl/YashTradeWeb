import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Lock, RefreshCcw, Loader2, Ban } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errMsg } from "@/lib/api";
import { useAdmin, LIVE_MODULES } from "@/components/admin/AdminLayout";
import { toast } from "sonner";

const MODULE_META = {
  products: { title: "Products & Collections", desc: "Product catalogue, gold and silver collection categorization from the Yash Trade App." },
  banners: { title: "Banners & Stories", desc: "Homepage banners and story content shown inside the Yash Trade App." },
  orders: { title: "Orders & Enquiries", desc: "Customer requests, orders and enquiries raised in the Yash Trade App." },
  appointments: { title: "Appointments", desc: "Customer appointment bookings." },
  notifications: { title: "Notifications", desc: "Push and in-app notification management." },
  telecallers: { title: "Telecallers", desc: "Telecaller / sales executive management and performance." },
};

export default function LiveModule() {
  const { moduleKey } = useParams();
  const { me } = useAdmin() || {};
  const meta = MODULE_META[moduleKey] || { title: moduleKey, desc: "" };
  const mod = LIVE_MODULES.find((m) => m.key === moduleKey);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);

  const unlocked = !!me?.live_admin_unlocked;
  const available = !!mod?.livePath;

  const load = () => {
    if (!unlocked || !available) return;
    setLoading(true);
    api.get(`/admin/live/${mod.livePath}`)
      .then((r) => {
        const d = r.data;
        const list = Array.isArray(d) ? d : d.items || d.products || d.requests || d.executives || d.stories || [];
        setItems(list);
      })
      .catch((e) => toast.error(errMsg(e, "Failed to load live data")))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [moduleKey, unlocked]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">{meta.title}</h1>
        <p className="text-sm text-slate-500">{meta.desc}</p>
      </div>

      {!available ? (
        <Card className="rounded-xl border-slate-200">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center" data-testid="admin-module-unavailable">
            <Ban className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">Not available on the connected live backend</p>
            <p className="max-w-md text-xs text-slate-400">
              The current Yash Trade App backend does not expose a {meta.title.toLowerCase()} API. This module will activate automatically once the app backend adds support for it.
            </p>
          </CardContent>
        </Card>
      ) : !unlocked ? (
        <Card className="rounded-xl border-amber-200 bg-amber-50/40">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center" data-testid="admin-module-locked">
            <Lock className="h-10 w-10 text-amber-400" />
            <p className="text-sm font-semibold text-slate-700">Live app admin access pending</p>
            <p className="max-w-md text-xs text-slate-500">
              Your phone is connected to the live Yash Trade App backend but does not yet have the <strong>admin</strong> role there.
              Ask the Yash Trade App team to grant role "admin" to your registered phone, then log out and log in again — this module will unlock automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl border-slate-200">
          <CardContent className="p-4">
            <div className="mb-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5" data-testid="admin-module-refresh">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Refresh
              </Button>
            </div>
            {loading && !items ? (
              <p className="py-10 text-center text-sm text-slate-400">Loading live data…</p>
            ) : !items || items.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400" data-testid="admin-module-empty">No records found in the live backend</p>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="admin-module-table">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      {Object.keys(items[0]).filter((k) => typeof items[0][k] !== "object").slice(0, 7).map((k) => (
                        <TableHead key={k} className="text-[11px] font-bold uppercase">{k.replace(/_/g, " ")}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.slice(0, 50).map((row, i) => (
                      <TableRow key={row.id || i}>
                        {Object.keys(items[0]).filter((k) => typeof items[0][k] !== "object").slice(0, 7).map((k) => (
                          <TableCell key={k} className="text-xs">{String(row[k] ?? "—").slice(0, 60)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
