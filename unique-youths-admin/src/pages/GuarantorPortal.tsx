import { useEffect, useState } from "react";
import { ShieldCheck, ShieldX, KeyRound } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner } from "../components/ui";

type PendingUser = {
  _id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  primaryPhone: string;
  guarantorName: string;
  guarantorPhone: string;
  rulesAcceptedAt: string;
};

type StuckUser = {
  _id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  createdAt: string;
};

export default function GuarantorPortal({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [stuck, setStuck] = useState<StuckUser[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [revealedOtp, setRevealedOtp] = useState<{ userId: string; otp: string; expiresAt: string } | null>(null);
  const [revealingId, setRevealingId] = useState("");

  const load = async () => {
    try {
      setErr("");
      const [p, s] = await Promise.all([
        api("/api/admin/guarantors/pending", { headers: { Authorization: `Bearer ${token}` } }),
        api("/api/admin/members/pending-otp", { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setPending(p);
      setStuck(s);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [token, refreshKey]);

  const verify = async (userId: string) => {
    setErr("");
    setMsg("");
    try {
      await api(`/api/admin/guarantors/${userId}/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg("Guarantor verified. Member is ready for slot assignment.");
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const reject = async (userId: string) => {
    const reason = window.prompt("Reason for rejecting this guarantor (shown to the member):", "Guarantor could not be reached");
    if (reason === null) return;
    setErr("");
    setMsg("");
    try {
      await api(`/api/admin/guarantors/${userId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason })
      });
      setMsg("Guarantor rejected.");
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const revealOtp = async (userId: string) => {
    setErr("");
    setMsg("");
    setRevealedOtp(null);
    setRevealingId(userId);
    try {
      const data = await api(`/api/admin/members/${userId}/reveal-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      setRevealedOtp({ userId, otp: data.otp, expiresAt: data.expiresAt });
      setMsg(data.message);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setRevealingId("");
    }
  };

  return (
    <div>
      <PageHeader
        title="Guarantor Portal"
        subtitle="Manual review only — call or message the nominated guarantor directly to confirm before approving."
      />

      {err && <Banner tone="error" message={err} />}
      {msg && <Banner tone="success" message={msg} />}

      {stuck.length > 0 && (
        <div className="mb-8">
          <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-2 text-sm uppercase tracking-wide">
            Stuck at email verification ({stuck.length})
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            Registered but never confirmed their OTP — likely never received the email. Generate a fresh code and read it out to them directly.
          </p>
          <div className="space-y-2">
            {stuck.map(u => (
              <div key={u._id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <b className="text-slate-900 dark:text-slate-100">{u.firstName} {u.lastName}</b>
                  <span className="text-slate-400 dark:text-slate-500 text-sm"> · @{u.username}</span>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{u.email}</p>
                  {revealedOtp?.userId === u._id && (
                    <p className="mt-2 text-sm bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-lg px-3 py-2 inline-block">
                      Code: <b className="text-lg tracking-widest">{revealedOtp.otp}</b> — expires {new Date(revealedOtp.expiresAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => revealOtp(u._id)}
                  disabled={revealingId === u._id}
                  className="inline-flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50 shrink-0"
                >
                  <KeyRound size={16} /> {revealingId === u._id ? "Generating..." : "Generate & reveal OTP"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-2 text-sm uppercase tracking-wide">
        Awaiting guarantor review ({pending.length})
      </h3>
      <div className="space-y-3">
        {pending.map(u => (
          <div key={u._id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <b className="text-slate-900 dark:text-slate-100">{u.firstName} {u.lastName}</b>
              <span className="text-slate-400 dark:text-slate-500 text-sm"> · @{u.username}</span>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{u.email} · {u.primaryPhone}</p>
              <p className="text-sm mt-2">
                Guarantor: <b>{u.guarantorName}</b> · {u.guarantorPhone}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Rules accepted {u.rulesAcceptedAt ? new Date(u.rulesAcceptedAt).toLocaleDateString() : "—"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => verify(u._id)}
                className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-semibold"
              >
                <ShieldCheck size={16} /> Verify
              </button>
              <button
                onClick={() => reject(u._id)}
                className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold"
              >
                <ShieldX size={16} /> Reject
              </button>
            </div>
          </div>
        ))}
        {pending.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-8 text-center text-slate-400 dark:text-slate-500">
            No members are currently awaiting guarantor review.
          </div>
        )}
      </div>
    </div>
  );
}
