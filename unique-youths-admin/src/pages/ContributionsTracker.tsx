import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner, naira } from "../components/ui";

type Member = {
  numericId: number;
  user: { _id: string; firstName: string; lastName: string; username: string; avatarDataUrl?: string } | string | null;
  status: "onTime" | "late" | "unpaid";
  savingsAmount: number;
  partyAmount: number;
  latePenalty: number;
  paidAt: string | null;
  ledgerId: string | null;
};

type Circle = {
  _id: string;
  name: string;
  cycleNumber: number;
  target: number;
  collected: number;
  paidCount: number;
  memberCount: number;
  percentage: number;
  met: boolean;
  members: Member[];
};

const STATUS_STYLES: Record<Member["status"], string> = {
  onTime: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
  late: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
  unpaid: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
};

function StatusBadge({ m }: { m: Member }) {
  if (m.status === "onTime") {
    return (
      <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold text-sm">
        <CheckCircle2 size={15} /> Paid {naira(m.savingsAmount + m.partyAmount)}
      </span>
    );
  }
  if (m.status === "late") {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold text-sm">
        <Clock size={15} /> Paid late (+{naira(m.latePenalty)} fine)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 font-semibold text-sm">
      <XCircle size={15} /> Not paid yet this month
    </span>
  );
}

export default function ContributionsTracker({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = () => {
    api("/api/admin/contributions", { headers: { Authorization: `Bearer ${token}` } })
      .then(setCircles)
      .catch(e => setErr(e.message));
  };

  useEffect(load, [token, refreshKey]);

  const markPaid = async (userId: string, late?: boolean) => {
    setErr("");
    setMsg("");
    setBusyId(userId);
    try {
      await api("/api/admin/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, late })
      });
      setMsg("Payment recorded.");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId("");
    }
  };

  const undoPayment = async (ledgerId: string) => {
    setErr("");
    setMsg("");
    setBusyId(ledgerId);
    try {
      await api(`/api/admin/payments/${ledgerId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg("Payment record deleted.");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div>
      <PageHeader
        title="Contributions Tracker"
        subtitle="This calendar month's ₦11,000-per-member target (₦10,000 pot + ₦1,000 Owambe), broken down per member. Confirm a payment once you've checked the proof in the WhatsApp community."
      />

      {err && <Banner tone="error" message={err} />}
      {msg && <Banner tone="success" message={msg} />}

      <div className="space-y-8">
        {circles.map(c => (
          <div key={c._id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                {c.name} · Cycle {c.cycleNumber}
              </h3>
              <p className={`text-sm font-semibold ${c.met ? "text-green-600" : "text-slate-500 dark:text-slate-400"}`}>
                {naira(c.collected)} of {naira(c.target)} collected this month · {c.paidCount}/{c.memberCount} members paid
                {c.met ? " · Target met! 🎉" : ""}
              </p>
            </div>

            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all ${c.met ? "bg-green-600" : "bg-blue-700"}`}
                style={{ width: `${c.percentage}%` }}
              />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
              {c.members.map(m => {
                const u = typeof m.user === "object" && m.user ? m.user : null;
                const uid = u?._id;
                return (
                  <div key={m.numericId} className={`border rounded-xl p-3 flex items-center gap-3 ${STATUS_STYLES[m.status]}`}>
                    {u?.avatarDataUrl ? (
                      <img src={u.avatarDataUrl} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-800 text-white flex items-center justify-center text-sm font-bold shrink-0">
                        {u?.firstName?.[0] || m.numericId}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                        #{m.numericId} · {u ? `${u.firstName} ${u.lastName}` : "Empty slot"}
                      </p>
                      <StatusBadge m={m} />
                      {uid && m.status === "unpaid" && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => markPaid(uid)}
                            disabled={busyId === uid}
                            className="text-xs font-semibold bg-green-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50"
                          >
                            Mark paid
                          </button>
                          <button
                            onClick={() => markPaid(uid, true)}
                            disabled={busyId === uid}
                            className="text-xs font-semibold bg-amber-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50"
                          >
                            Mark paid (late)
                          </button>
                        </div>
                      )}
                      {m.ledgerId && (
                        <button
                          onClick={() => undoPayment(m.ledgerId!)}
                          disabled={busyId === m.ledgerId}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 opacity-70 hover:opacity-100 disabled:opacity-30"
                          title="Undo this payment record"
                        >
                          <Trash2 size={12} /> Undo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {c.members.length === 0 && <p className="text-slate-400 text-sm">No members assigned to this circle yet.</p>}
            </div>
          </div>
        ))}
        {circles.length === 0 && !err && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-8 text-center text-slate-400">
            No circles yet.
          </div>
        )}
      </div>
    </div>
  );
}
