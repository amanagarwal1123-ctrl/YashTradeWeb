import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users, UserPlus, CalendarDays, CalendarRange, LogIn, UserX, CheckCircle2, XCircle, RefreshCcw,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

const KPI = ({ icon: Icon, label, value, tone = "navy", testId }) => {
  const tones = {
    navy: "bg-[#0B1F3B]/5 text-[#0B1F3B]",
    green: "bg-[#0F766E]/10 text-[#0F766E]",
    red: "bg-[#C21F2B]/8 text-[#C21F2B]",
    gold: "bg-[#C8A96A]/15 text-[#8a6d35]",
  };
  return (
    <Card className="rounded-xl border-slate-200" data-testid={testId}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-mono-nums text-2xl font-bold text-[#0B1F3B] leading-none">{value ?? "—"}</p>
          <p className="text-[11px] font-medium text-slate-500 mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/admin/stats").then((r) => setStats(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const t = stats?.totals || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">Dashboard</h1>
          <p className="text-sm text-slate-500">Enrollment &amp; app activity overview</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors" data-testid="admin-dashboard-refresh-button">
          <RefreshCcw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loading && !stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPI icon={Users} label="Total registered customers" value={t.total_customers} testId="admin-dashboard-total-customers-card" />
            <KPI icon={UserPlus} label="Registrations today" value={t.registrations_today} tone="gold" testId="admin-dashboard-today-card" />
            <KPI icon={CalendarDays} label="This week" value={t.registrations_week} tone="gold" testId="admin-dashboard-week-card" />
            <KPI icon={CalendarRange} label="This month" value={t.registrations_month} tone="gold" testId="admin-dashboard-month-card" />
            <KPI icon={CheckCircle2} label="Completed enrollment" value={t.completed_enrollment} tone="green" testId="admin-dashboard-completed-card" />
            <KPI icon={LogIn} label="Logged in to app" value={t.logged_in} tone="green" testId="admin-dashboard-logged-in-card" />
            <KPI icon={UserX} label="Never logged in" value={t.never_logged_in} tone="red" testId="admin-dashboard-never-logged-card" />
            <KPI icon={XCircle} label="Inactive accounts" value={t.inactive} tone="red" testId="admin-dashboard-inactive-card" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Card className="rounded-xl border-slate-200 lg:col-span-8">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-[#0B1F3B]">Registration trend — last 30 days</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px] pt-0" data-testid="admin-dashboard-trend-chart">
                {stats?.trend?.some((d) => d.count > 0) ? (
                  <ResponsiveContainer width="100%" height={240} minWidth={0}>
                    <AreaChart data={stats.trend} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="regFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0B1F3B" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#0B1F3B" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} interval={4} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Area type="monotone" dataKey="count" stroke="#0B1F3B" strokeWidth={2} fill="url(#regFill)" name="Registrations" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No registrations yet</div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200 lg:col-span-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-[#0B1F3B]">Recent app logins</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-0" data-testid="admin-dashboard-recent-logins">
                {(stats?.recent_logins || []).length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-400">No app logins recorded yet</p>
                )}
                {(stats?.recent_logins || []).map((c) => (
                  <Link key={c.id} to={`/admin/users/${c.id}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3B]">{c.name}</p>
                      <p className="font-mono-nums text-xs text-slate-500">{c.phone}</p>
                    </div>
                    <span className="text-[10px] text-slate-400">{fmtDate(c.last_login_at)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-xl border-slate-200">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-[#0B1F3B]">Recent registrations</CardTitle>
              <Link to="/admin/users" className="text-xs font-semibold text-[#0B1F3B] underline underline-offset-2" data-testid="admin-dashboard-view-all-link">View all</Link>
            </CardHeader>
            <CardContent className="pt-0" data-testid="admin-dashboard-recent-registrations">
              {(stats?.recent_registrations || []).length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No registrations yet — share the enrollment page with customers</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(stats?.recent_registrations || []).map((c) => (
                    <Link key={c.id} to={`/admin/users/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-2.5 hover:bg-slate-50 transition-colors">
                      <span className="min-w-[140px] text-sm font-semibold text-[#0B1F3B]">{c.name}</span>
                      <span className="font-mono-nums text-xs text-slate-500">{c.phone}</span>
                      <span className="text-xs text-slate-500">{c.shop_name}</span>
                      <span className="text-xs text-slate-400">{c.location}</span>
                      <span className="ml-auto flex items-center gap-2">
                        <Badge variant="outline" className={c.live_sync_status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]" : "border-amber-200 bg-amber-50 text-amber-700 text-[10px]"}>
                          {c.live_sync_status === "ok" ? "Synced to app" : "Sync pending"}
                        </Badge>
                        <span className="text-[10px] text-slate-400">{fmtDate(c.registered_at)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
