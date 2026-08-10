import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader, Banner } from "../components/ui";

type Member = {
  _id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  registrationStatus: string;
  avatarDataUrl?: string;
  lastSeenAt?: string | null;
  online: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  pending_otp: "Verifying email",
  awaiting_guarantor_review: "Awaiting guarantor review",
  awaiting_slot_assignment: "Awaiting slot assignment",
  active: "Active"
};

// Small pulsing dot - green + a soft ping animation while online, solid red
// while offline. Real-time in the sense that it's driven by the member's
// actual lastSeenAt from the backend, refreshed on a short interval below -
// not just recalculated locally.
function PresenceDot({ online }: { online: boolean }) {
  return (
    <span className="relative inline-flex w-3 h-3 shrink-0">
      {online && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
      <span className={`relative inline-flex rounded-full w-3 h-3 ${online ? "bg-green-500" : "bg-red-500"}`} />
    </span>
  );
}

export default function Members({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const data = await api("/api/admin/members", { headers: { Authorization: `Bearer ${token}` } });
      setMembers(data);
      setErr("");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [token, refreshKey]);

  // This page specifically re-polls itself every few seconds regardless of
  // the shared manual "Refresh" button in the sidebar - presence is the one
  // thing on this dashboard that's genuinely meant to be real-time.
  useEffect(() => {
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [token]);

  const onlineCount = members.filter(m => m.online).length;

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle={`${members.length} registered · ${onlineCount} online right now. Updates automatically every few seconds.`}
      />

      {err && <Banner tone="error" message={err} />}

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm divide-y dark:divide-slate-800">
        {members.map(m => (
          <div key={m._id} className="p-4 flex items-center gap-3">
            <PresenceDot online={m.online} />
            {m.avatarDataUrl ? (
              <img src={m.avatarDataUrl} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-800 text-white flex items-center justify-center text-sm font-bold shrink-0">
                {m.firstName?.[0]}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                {m.firstName} {m.lastName} <span className="font-normal text-slate-400 dark:text-slate-500">· @{m.username}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{m.email}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-xs font-semibold ${m.online ? "text-green-600 dark:text-green-400" : "text-slate-400 dark:text-slate-500"}`}>
                {m.online ? "Online now" : "Offline"}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{STATUS_LABEL[m.registrationStatus] || m.registrationStatus}</p>
            </div>
          </div>
        ))}
        {members.length === 0 && !err && (
          <p className="text-slate-400 dark:text-slate-500 text-center py-8">No members registered yet.</p>
        )}
      </div>
    </div>
  );
}
