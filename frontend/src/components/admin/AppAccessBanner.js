import React from "react";
import { PlugZap, RefreshCw, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/components/admin/AdminLayout";

/**
 * Explains, on the workspaces that write to the Yash Trade App, whether this session
 * can act on the app yet. Renders nothing once the app token is available.
 */
export const AppAccessBanner = ({ readOnlyHint }) => {
  const { me, reconnect, reconnecting } = useAdmin();
  const st = me?.app_token_status;
  if (!st || st === "ok" || st === "disabled") return null;
  const pending = st === "pending";
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${pending ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-[#7f1d1d]"}`}
      role="status"
      data-testid="admin-app-access-banner"
    >
      <div className="flex items-start gap-2">
        {pending ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <PlugZap className="mt-0.5 h-4 w-4 shrink-0" />}
        <div>
          <p className="font-semibold">{pending ? "Read-only for now" : "Not connected to the Yash Trade App"}</p>
          <p className="text-xs opacity-90">
            {me?.app_token_error || "Waiting for the Yash Trade App to enable website access for staff."}
            {readOnlyHint ? ` ${readOnlyHint}` : ""}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={reconnect} disabled={reconnecting} className="gap-1.5 shrink-0 bg-white" data-testid="admin-app-access-reconnect">
        {reconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Reconnect
      </Button>
    </div>
  );
};

export const useCanWrite = () => {
  const { me } = useAdmin();
  return me?.app_token_status === "ok";
};
