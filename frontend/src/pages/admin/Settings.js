import React, { useEffect, useState } from "react";
import { Settings as SettingsIcon, Server, MessageSquareText, Link2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAdmin } from "@/components/admin/AdminLayout";

export default function Settings() {
  const { me } = useAdmin() || {};
  const [config, setConfig] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null);

  useEffect(() => {
    api.get("/public/config").then((r) => setConfig(r.data)).catch(() => {});
    api.get("/admin/live/status").then((r) => setLiveStatus(r.data)).catch(() => {});
  }, []);

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
          <div className="flex justify-between border-b border-slate-50 py-1.5">
            <span className="text-slate-500">Mode</span>
            <Badge variant="outline" className={config?.environment === "production" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
              {config?.environment || "…"}
            </Badge>
          </div>
          <div className="flex justify-between border-b border-slate-50 py-1.5">
            <span className="text-slate-500">Demo OTP (1234)</span>
            <span className="font-medium">{config?.dev_otp_enabled ? "Enabled (dev/staging only)" : "Disabled"}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-500">Admin session</span>
            <span className="font-mono-nums text-xs">expires {me?.expires_at ? new Date(me.expires_at).toLocaleString("en-IN") : "…"}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><MessageSquareText className="h-4 w-4" /> SMS Provider (MSG91)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-slate-50 py-1.5">
            <span className="text-slate-500">Provider</span><span className="font-medium">MSG91 OTP API</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-500">Auth key</span><span className="font-mono-nums text-xs">configured via environment (hidden)</span>
          </div>
          <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            Note: SMS delivery requires credit balance on the MSG91 account. If customers report missing OTPs, check the MSG91 dashboard balance and DLT template mapping.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><Link2 className="h-4 w-4" /> Shared Yash Trade App Backend</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm" data-testid="admin-settings-live-backend">
          <div className="flex justify-between border-b border-slate-50 py-1.5">
            <span className="text-slate-500">Backend URL</span><span className="font-mono-nums text-xs break-all">{liveStatus?.live_backend || "…"}</span>
          </div>
          <div className="flex justify-between border-b border-slate-50 py-1.5">
            <span className="text-slate-500">Customer sync</span>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Connected</Badge>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-500">Live admin modules</span>
            <Badge variant="outline" className={liveStatus?.live_admin_unlocked ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
              {liveStatus?.live_admin_unlocked ? "Unlocked" : "Pending admin role"}
            </Badge>
          </div>
          {liveStatus?.note && (
            <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{liveStatus.note}</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-bold text-[#0B1F3B]"><ShieldCheck className="h-4 w-4" /> Security</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-xs text-slate-600">
          <p>• OTPs are stored hashed and expire after 5 minutes; max 5 verification attempts and 3 resends.</p>
          <p>• Admin sessions use HTTP-only secure cookies with 12-hour expiry and 2-hour idle timeout.</p>
          <p>• Failed admin logins are rate-limited (lockout after 5 failures in 15 minutes) and audit-logged.</p>
          <p>• Customers and telecallers receive 403 Forbidden on all admin routes.</p>
        </CardContent>
      </Card>
    </div>
  );
}
