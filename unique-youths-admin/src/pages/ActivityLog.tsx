import { useEffect, useState } from "react";
import { LogIn, LogOut, KeyRound, Activity } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner } from "../components/ui";

type ActivityItem = {
  _id: string;
  adminName?: string;
  userName?: string;
  action: string;
  detail: string;
  createdAt: string;
};

const ICONS: Record<string, any> = {
  login: LogIn,
  logout: LogOut,
  otp_resend: KeyRound
};

export default function ActivityLog({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [tab, setTab] = useState<"admins" | "members">("admins");
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    const path = tab === "admins" ? "/api/admin/activity" : "/api/admin/member-activity";
    api(path, { headers: { Authorization: `Bearer ${token}` } })
      .then(setItems)
      .catch(e => setErr(e.message));
  }, [token, refreshKey, tab]);

  return (
    <div>
      <PageHeader
        title="Activity Log"
        subtitle="Who's logged in or out, and when — down to the second — for admins and members."
      />

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("admins")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            tab === "admins" ? "bg-blue-800 text-white border-blue-800" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
          }`}
        >
          Admins
        </button>
        <button
          onClick={() => setTab("members")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
            tab === "members" ? "bg-blue-800 text-white border-blue-800" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
          }`}
        >
          Members
        </button>
      </div>

      {err && <Banner tone="error" message={err} />}

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm divide-y dark:divide-slate-800">
        {items.map(item => {
          const Icon = ICONS[item.action] || Activity;
          const at = new Date(item.createdAt);
          const name = item.adminName || item.userName || "Unknown";
          return (
            <div key={item._id} className="p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {name} <span className="font-normal text-slate-500 dark:text-slate-400">— {item.detail}</span>
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {at.toLocaleDateString()} at {at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        {items.length === 0 && !err && (
          <p className="text-slate-400 dark:text-slate-500 text-center py-8">No activity recorded yet.</p>
        )}
      </div>
    </div>
  );
}
