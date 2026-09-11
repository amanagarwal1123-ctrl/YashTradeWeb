import React, { useCallback, useEffect, useState, createContext, useContext } from "react";
import { Outlet, NavLink, useNavigate, useLocation, Navigate, Link } from "react-router-dom";
import {
  LayoutDashboard, Users, UserCog, FileClock, Settings as SettingsIcon, LogOut, Lock,
  Package, Image as ImageIcon, ClipboardList, CalendarDays, Bell, Headset, Menu, ShieldAlert,
  Gem, MessageSquareText, IndianRupee, PlugZap, RefreshCw, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

export const LIVE_MODULES = [
  { key: "products", label: "Products & Collections", icon: Package, livePath: "products" },
  { key: "banners", label: "Banners & Stories", icon: ImageIcon, livePath: "stories" },
  { key: "orders", label: "Orders & Enquiries", icon: ClipboardList, livePath: "requests" },
  { key: "appointments", label: "Appointments", icon: CalendarDays, livePath: null },
  { key: "notifications", label: "Notifications", icon: Bell, livePath: null },
  { key: "telecallers", label: "Telecallers", icon: Headset, livePath: "executives" },
];

/** Where each role lands after login and which routes it may open. */
export const ROLE_HOME = { admin: "/admin", telecaller: "/admin/queries", billing_executive: "/admin/rates" };
const ROLE_ROUTES = {
  admin: null, // everything
  telecaller: ["/admin/queries"],
  billing_executive: ["/admin/rates"],
};
const ROLE_LABEL = { admin: "Admin", telecaller: "Telecaller", billing_executive: "Billing Executive" };

export const roleCanOpen = (role, pathname) => {
  const allowed = ROLE_ROUTES[role];
  if (allowed === null) return true;
  if (!allowed) return false;
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
};

const NavItem = ({ to, icon: Icon, label, end, locked, onClick }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) =>
      cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive ? "bg-[#0B1F3B] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-[#0B1F3B]"
      )
    }
    data-testid={`admin-nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
  >
    <Icon className="h-4 w-4 shrink-0" />
    <span className="flex-1 truncate">{label}</span>
    {locked && <Lock className="h-3 w-3 text-slate-400" />}
  </NavLink>
);

const SidebarContent = ({ me, onNavigate }) => {
  const role = me?.role;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
        <img src="/brand/yash-mark-hd.png" alt="Yash Ornaments" className="brand-logo h-10 w-10 rounded-lg" />
        <div>
          <p className="font-heading text-sm font-bold text-[#0B1F3B] leading-tight">Yash Ornaments</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{role === "admin" ? "Admin Portal" : "Staff Console"}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {role === "admin" && (
          <>
            <NavItem to="/admin" icon={LayoutDashboard} label="Dashboard" end onClick={onNavigate} />
            <NavItem to="/admin/users" icon={Users} label="Customers" onClick={onNavigate} />
            <NavItem to="/admin/staff" icon={UserCog} label="Manage Users" onClick={onNavigate} />
            <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Yash Trade App</p>
          </>
        )}
        {(role === "admin") && <NavItem to="/admin/products" icon={Gem} label="Products" onClick={onNavigate} />}
        {(role === "admin" || role === "telecaller") && <NavItem to="/admin/queries" icon={MessageSquareText} label="Queries" onClick={onNavigate} />}
        {(role === "admin" || role === "billing_executive") && <NavItem to="/admin/rates" icon={IndianRupee} label="Rates" onClick={onNavigate} />}
        {role === "admin" && (
          <>
            <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Administration</p>
            <NavItem to="/admin/reports" icon={FileClock} label="Reports & Audit" onClick={onNavigate} />
            <NavItem to="/admin/settings" icon={SettingsIcon} label="Settings" onClick={onNavigate} />
            <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">App modules (advanced)</p>
            {LIVE_MODULES.map((m) => (
              <NavItem key={m.key} to={`/admin/modules/${m.key}`} icon={m.icon} label={m.label} locked={!me?.live_admin_unlocked} onClick={onNavigate} />
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-slate-200 px-4 py-3">
        <p className="text-[10px] text-slate-400">Signed in as {ROLE_LABEL[role] || role}</p>
        <p className="font-mono-nums text-xs font-semibold text-slate-700" data-testid="admin-session-phone">+91 {me?.phone}</p>
      </div>
    </div>
  );
};

/** Small live indicator of whether this session can act on the Yash Trade App. */
export const AppConnectionBadge = ({ me, onReconnect, busy }) => {
  const st = me?.app_token_status;
  if (st === "disabled") return null;
  const ok = st === "ok";
  const cls = ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : st === "pending" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-[#C21F2B]";
  const text = ok ? `App connected${me?.app_user?.name ? ` as ${me.app_user.name}` : ""}` : st === "pending" ? "App access pending — read-only" : "App not connected";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={onReconnect} disabled={busy || ok} className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1F3B]/30 rounded-full" data-testid="admin-app-connection-badge">
            <Badge variant="outline" className={`${cls} gap-1 text-[10px]`}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : ok ? <PlugZap className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />} {text}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm text-xs">
          {ok ? "Every product, query or rate change you make here is recorded in the Yash Trade App under your name." : (me?.app_token_error || "Waiting for the Yash Trade App to enable website access for staff.") + (ok ? "" : " Click to retry.")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | forbidden
  const [reconnecting, setReconnecting] = useState(false);

  const refreshMe = useCallback(async () => {
    const r = await api.get("/admin/auth/me");
    setMe(r.data);
    return r.data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const load = (attempt = 0) => {
      api.get("/admin/auth/me")
        .then((r) => {
          if (cancelled) return;
          if (!ROLE_HOME[r.data.role]) {
            setStatus("forbidden");
          } else {
            setMe(r.data);
            setStatus("ok");
            // The app token for this staff member is fetched in the background right after login - poll briefly.
            if (r.data.live_unlock_pending && attempt < 5) timer = setTimeout(() => load(attempt + 1), 3000);
          }
        })
        .catch(() => { if (!cancelled) navigate("/admin/login", { replace: true }); });
    };
    load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const logout = async () => {
    try { await api.post("/admin/auth/logout"); } catch (e) { /* noop */ }
    navigate("/admin/login", { replace: true });
  };

  const reconnect = async () => {
    setReconnecting(true);
    try {
      const r = await api.post("/admin/auth/app-reconnect");
      setMe(r.data);
      if (r.data.app_token_status === "ok") toast.success("Connected to the Yash Trade App");
      else toast.warning("Still not connected", { description: r.data.app_token_error || undefined });
    } catch (e) { toast.error("Could not reach the server"); } finally { setReconnecting(false); }
  };

  if (status === "loading") {
    return (
      <div className="admin-scope min-h-screen bg-[hsl(var(--background))] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0B1F3B] border-t-transparent" />
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="admin-scope min-h-screen bg-[hsl(var(--background))] flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-4" data-testid="admin-forbidden-message">
          <ShieldAlert className="mx-auto h-12 w-12 text-[#C21F2B]" />
          <h1 className="font-heading text-2xl font-bold text-[#0B1F3B]">403 — Forbidden</h1>
          <p className="text-sm text-slate-600">Your account does not have access to this console. Ask an administrator to add you under Manage Users.</p>
          <Button onClick={logout} variant="outline" data-testid="admin-forbidden-logout">Sign out</Button>
        </div>
      </div>
    );
  }

  // Non-admin roles land on their own workspace and cannot open admin-only pages.
  if (me.role !== "admin" && location.pathname === "/admin") return <Navigate to={ROLE_HOME[me.role]} replace />;
  const allowedHere = roleCanOpen(me.role, location.pathname);

  return (
    <AdminCtx.Provider value={{ me, refreshMe, reconnect, reconnecting }}>
      <div className="admin-scope min-h-screen bg-[hsl(var(--background))] flex">
        <aside className="hidden lg:block w-[260px] shrink-0 border-r border-slate-200 bg-white">
          <SidebarContent me={me} />
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/85 backdrop-blur px-4 py-3">
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" data-testid="admin-mobile-menu-button">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0">
                  <SidebarContent me={me} />
                </SheetContent>
              </Sheet>
              <div>
                <p className="text-sm font-bold text-[#0B1F3B]">{me.role === "admin" ? "Operations Console" : `${ROLE_LABEL[me.role]} Console`}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] border-slate-200 bg-slate-50 text-slate-600" data-testid="admin-role-badge">{ROLE_LABEL[me.role]}</Badge>
                  <AppConnectionBadge me={me} onReconnect={reconnect} busy={reconnecting} />
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="gap-1.5" data-testid="admin-logout-button">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </Button>
          </header>
          <main className="flex-1 px-4 py-6 lg:px-8 overflow-x-hidden">
            {allowedHere ? <Outlet /> : (
              <div className="mx-auto max-w-md py-16 text-center space-y-4" data-testid="admin-route-forbidden">
                <ShieldAlert className="mx-auto h-10 w-10 text-[#C21F2B]" />
                <h2 className="font-heading text-xl font-bold text-[#0B1F3B]">This page is for administrators</h2>
                <p className="text-sm text-slate-600">Your {ROLE_LABEL[me.role]} account can use the {me.role === "telecaller" ? "Queries" : "Rates"} workspace.</p>
                <Button asChild className="bg-[#0B1F3B] hover:bg-[#081a31]"><Link to={ROLE_HOME[me.role]}>Go to my workspace</Link></Button>
              </div>
            )}
          </main>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}
