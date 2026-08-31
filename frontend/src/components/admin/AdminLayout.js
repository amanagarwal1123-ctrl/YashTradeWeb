import React, { useEffect, useState, createContext, useContext } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, FileClock, Settings as SettingsIcon, LogOut, Lock,
  Package, Image as ImageIcon, ClipboardList, CalendarDays, Bell, Headset, Menu, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

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

const SidebarContent = ({ me, onNavigate }) => (
  <div className="flex h-full flex-col">
    <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
      <img src="/brand/yash-mark-hd.png" alt="Yash Ornaments" className="brand-logo h-10 w-10 rounded-lg" />
      <div>
        <p className="font-heading text-sm font-bold text-[#0B1F3B] leading-tight">Yash Ornaments</p>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Admin Portal</p>
      </div>
    </div>
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      <NavItem to="/admin" icon={LayoutDashboard} label="Dashboard" end onClick={onNavigate} />
      <NavItem to="/admin/users" icon={Users} label="Customers" onClick={onNavigate} />
      <NavItem to="/admin/reports" icon={FileClock} label="Reports & Audit" onClick={onNavigate} />
      <NavItem to="/admin/settings" icon={SettingsIcon} label="Settings" onClick={onNavigate} />
      <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Yash Trade App</p>
      {LIVE_MODULES.map((m) => (
        <NavItem key={m.key} to={`/admin/modules/${m.key}`} icon={m.icon} label={m.label} locked={!me?.live_admin_unlocked} onClick={onNavigate} />
      ))}
    </nav>
    <div className="border-t border-slate-200 px-4 py-3">
      <p className="text-[10px] text-slate-400">Signed in as</p>
      <p className="font-mono-nums text-xs font-semibold text-slate-700" data-testid="admin-session-phone">+91 {me?.phone}</p>
    </div>
  </div>
);

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | forbidden

  useEffect(() => {
    api.get("/admin/auth/me")
      .then((r) => {
        if (r.data.role !== "admin") {
          setStatus("forbidden");
        } else {
          setMe(r.data);
          setStatus("ok");
        }
      })
      .catch(() => navigate("/admin/login", { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const logout = async () => {
    try { await api.post("/admin/auth/logout"); } catch (e) { /* noop */ }
    navigate("/admin/login", { replace: true });
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
          <p className="text-sm text-slate-600">Your account does not have administrator access. This portal is restricted to authorized Yash Ornaments administrators.</p>
          <Button onClick={logout} variant="outline" data-testid="admin-forbidden-logout">Sign out</Button>
        </div>
      </div>
    );
  }

  return (
    <AdminCtx.Provider value={{ me }}>
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
                <p className="text-sm font-bold text-[#0B1F3B]">Operations Console</p>
                {!me?.live_admin_unlocked && (
                  <Badge variant="outline" className="mt-0.5 text-[10px] border-amber-300 bg-amber-50 text-amber-700">
                    Live app modules pending admin role
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="gap-1.5" data-testid="admin-logout-button">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </Button>
          </header>
          <main className="flex-1 px-4 py-6 lg:px-8 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}
