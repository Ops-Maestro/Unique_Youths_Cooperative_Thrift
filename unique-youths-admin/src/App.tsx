import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  LayoutGrid,
  Shuffle,
  Grid3x3,
  Banknote,
  ShieldCheck,
  Megaphone,
  Users,
  LogOut,
  RefreshCw,
  Wallet,
  History,
  Menu,
  X
} from "lucide-react";
import { api } from "./lib/api";
import { ThemeToggle, applyTheme, type Theme } from "./components/ui";
import ProfitMatrix from "./pages/ProfitMatrix";
import AjoRecipientDraw from "./pages/AjoRecipientDraw";
import MemberSlotGrid from "./pages/MemberSlotGrid";
import MonthlyDisbursals from "./pages/MonthlyDisbursals";
import GuarantorPortal from "./pages/GuarantorPortal";
import BroadcastEngine from "./pages/BroadcastEngine";
import ContributionsTracker from "./pages/ContributionsTracker";
import ActivityLog from "./pages/ActivityLog";
import Members from "./pages/Members";

type LoginState = { username: string; password: string };

const TABS = [
  { id: "profit", label: "Circle Overview", icon: LayoutGrid },
  { id: "members", label: "Members", icon: Users },
  { id: "contributions", label: "Contributions Tracker", icon: Wallet },
  { id: "draw", label: "Ajo Recipient Draw", icon: Shuffle },
  { id: "slots", label: "Member Slot Grid", icon: Grid3x3 },
  { id: "disbursals", label: "Monthly Disbursals", icon: Banknote },
  { id: "guarantors", label: "Guarantor Portal", icon: ShieldCheck },
  { id: "broadcast", label: "Broadcast Engine", icon: Megaphone },
  { id: "activity", label: "Activity Log", icon: History }
] as const;

type TabId = (typeof TABS)[number]["id"];

// The admin token lives in sessionStorage (unique per browser tab), not
// localStorage (shared across every tab). Two admins can now each keep
// their own session open in separate tabs of the same browser without one
// overwriting the other.
const TOKEN_KEY = "adminToken";
const APP_VERSION = "1.1.0";

function useTheme() {
  const [theme, setTheme] = useState<Theme>((localStorage.getItem("uy_admin_theme") as Theme) || "system");

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("uy_admin_theme", theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return [theme, setTheme] as const;
}

export default function App() {
  const [token, setToken] = useState(sessionStorage.getItem(TOKEN_KEY) || "");
  const [login, setLogin] = useState<LoginState>({ username: "", password: "" });
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<TabId>("profit");
  const [presence, setPresence] = useState({ totalMembers: 0, onlineNow: 0 });
  const [theme, setTheme] = useTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const signIn = async () => {
    try {
      setErr("");
      const data = await api("/api/auth/admin/login", { method: "POST", body: JSON.stringify(login) });
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
    } catch (e: any) {
      setErr(e.message || "Admin login failed");
    }
  };

  const logout = async () => {
    try {
      await api("/api/auth/admin/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // Still log out locally even if the activity-log call fails.
    }
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setTab("profit");
  };

  const refresh = () => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
    window.setTimeout(() => setRefreshing(false), 500);
  };

  useEffect(() => {
    if (!token) return;
    const loadPresence = () => {
      api("/api/admin/presence-summary", { headers: { Authorization: `Bearer ${token}` } })
        .then(setPresence)
        .catch(() => {});
    };
    // Own short interval, independent of the manual "Refresh" button and
    // the shared refreshKey - this is the one number in the sidebar that's
    // meant to be genuinely real-time.
    loadPresence();
    const id = setInterval(loadPresence, 5000);
    return () => clearInterval(id);
  }, [token]);

  if (!token) {
    return <Auth login={login} setLogin={setLogin} signIn={signIn} err={err} theme={theme} setTheme={setTheme} />;
  }

  const ActivePage = {
    profit: ProfitMatrix,
    members: Members,
    contributions: ContributionsTracker,
    draw: AjoRecipientDraw,
    slots: MemberSlotGrid,
    disbursals: MonthlyDisbursals,
    guarantors: GuarantorPortal,
    broadcast: BroadcastEngine,
    activity: ActivityLog
  }[tab];

  const currentLabel = TABS.find(t => t.id === tab)?.label || "";

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Mobile top bar - only visible below md, gives access to the nav
          via a hamburger toggle instead of a permanently fixed sidebar. */}
      <header className="md:hidden sticky top-0 z-30 bg-[#173ea5] text-white p-4 flex items-center justify-between">
        <button onClick={() => setNavOpen(true)} aria-label="Open menu" className="p-1">
          <Menu size={22} />
        </button>
        <span className="font-bold text-sm">{currentLabel}</span>
        <button onClick={refresh} aria-label="Refresh" className="p-1">
          <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
        </button>
      </header>

      {navOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setNavOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-72 md:w-64 bg-[#173ea5] text-white p-5 flex flex-col z-50 transition-transform duration-200 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="bg-white rounded-full p-1 shrink-0 flex items-center justify-center">
              <img src="/brand/logo-badge.png" alt="Unique Youth logo" className="w-9 h-9" />
            </span>
            <div>
              <h1 className="font-black text-xl leading-tight">Unique Youth</h1>
              <p className="text-blue-200 text-xs font-semibold tracking-wide uppercase">Cooperative Thrift</p>
            </div>
          </div>
          <button onClick={() => setNavOpen(false)} className="md:hidden p-1" aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <div className="mt-4">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>

        <nav className="mt-6 space-y-1 flex-1 overflow-y-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setNavOpen(false);
              }}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left text-sm font-semibold transition ${
                tab === id ? "bg-red-600 text-white" : "text-blue-100 hover:bg-blue-900/40"
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-blue-800 pt-4 text-sm">
          <p className="flex items-center gap-2 text-blue-100">
            <Users size={16} /> {presence.totalMembers} members
          </p>
          <p className="flex items-center gap-2 text-blue-100 mt-1">
            <span className="relative inline-flex w-2.5 h-2.5">
              {presence.onlineNow > 0 && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${presence.onlineNow > 0 ? "bg-green-500" : "bg-slate-400"}`} />
            </span>
            {presence.onlineNow} online now
          </p>
          <a
            href={import.meta.env.VITE_CLIENT_URL || "#"}
            target="_blank"
            rel="noreferrer"
            className="text-blue-300 hover:text-white text-xs mt-1 inline-block"
          >
            View member dashboard feed &rarr;
          </a>
          <div className="mt-4 flex gap-2">
            <button
              onClick={refresh}
              title="Reload this page's data"
              className="flex-1 flex items-center justify-center gap-2 bg-slate-900/40 hover:bg-slate-900/60 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              onClick={logout}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-900/40 hover:bg-slate-900/60 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
          <p className="text-blue-50 font-semibold text-xs mt-4 leading-relaxed">
            © {new Date().getFullYear()} Unique Youth Cooperative Thrift. All rights reserved.
            <br />v{APP_VERSION}
          </p>
        </div>
      </aside>

      <main className="md:ml-64 p-4 sm:p-6 max-w-6xl">
        <ActivePage token={token} refreshKey={refreshKey} />
      </main>
    </div>
  );
}

function Auth({
  login,
  setLogin,
  signIn,
  err,
  theme,
  setTheme
}: {
  login: LoginState;
  setLogin: Dispatch<SetStateAction<LoginState>>;
  signIn: () => Promise<void>;
  err: string;
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  return (
    <div className="min-h-screen bg-[#0f2557] flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-3">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-xl">
          <img src="/brand/logo-badge.png" alt="Unique Youth logo" className="w-14 h-14 mb-4" />
          <h1 className="font-black text-2xl text-slate-900 dark:text-white">Unique Youth</h1>
          <p className="text-slate-400 dark:text-slate-400 text-xs font-semibold tracking-wide uppercase mb-1">Cooperative Thrift</p>
          <p className="text-slate-500 dark:text-slate-300 mb-5">Authorized personnel only.</p>

          <input
            className="w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white p-3 rounded-lg mb-3"
            placeholder="Username or email"
            value={login.username}
            onChange={e => setLogin({ ...login, username: e.target.value })}
          />

          <input
            className="w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white p-3 rounded-lg mb-3"
            type="password"
            placeholder="Password"
            value={login.password}
            onChange={e => setLogin({ ...login, password: e.target.value })}
            onKeyDown={e => e.key === "Enter" && signIn()}
          />

          <button className="w-full bg-[#173ea5] text-white p-3 rounded-lg font-semibold" onClick={signIn}>
            Secure login
          </button>

          {err && <p className="text-red-600 dark:text-red-400 mt-3 text-sm">{err}</p>}
        </div>
        <p className="text-center text-blue-50 font-semibold text-xs mt-4">
          © {new Date().getFullYear()} Unique Youth Cooperative Thrift. All rights reserved. · v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
