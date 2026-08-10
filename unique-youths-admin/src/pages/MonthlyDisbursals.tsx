import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner } from "../components/ui";

type Member = {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    username: string;
    bank?: { bankName: string; accountNumber: string; accountName: string };
  } | string;
  numericId: number;
  disbursed: boolean;
  disbursedAt?: string;
};

type Circle = {
  _id: string;
  name: string;
  cycleNumber: number;
  completed: boolean;
  members: Member[];
};

export default function MonthlyDisbursals({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => {
    api("/api/admin/circles", { headers: { Authorization: `Bearer ${token}` } })
      .then(setCircles)
      .catch(e => setErr(e.message));
  };

  useEffect(load, [token, refreshKey]);

  const removeOne = async (circleId: string, numericId: number) => {
    if (!window.confirm(`Remove disbursal record for slot #${numericId}? This frees the slot back up.`)) return;
    setErr("");
    setMsg("");
    try {
      await api(`/api/admin/circles/${circleId}/members/${numericId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg(`Slot ${numericId} cleared.`);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const deleteWholeCircle = async (circleId: string, name: string) => {
    if (!window.confirm(`This circle is fully complete. Delete "${name}" entirely to start fresh? Payment history is kept.`)) return;
    setErr("");
    setMsg("");
    try {
      await api(`/api/admin/circles/${circleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg("Circle deleted.");
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const rows = circles.flatMap(c =>
    c.members
      .filter(m => m.disbursed)
      .map(m => ({ circle: c, member: m }))
  );

  return (
    <div>
      <PageHeader
        title="Monthly Disbursals"
        subtitle="Members who have received their ₦95,000 payout, per the rules they accepted at registration."
      />

      {err && <Banner tone="error" message={err} />}
      {msg && <Banner tone="success" message={msg} />}

      {circles.filter(c => c.completed).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {circles.filter(c => c.completed).map(c => (
            <button
              key={c._id}
              onClick={() => deleteWholeCircle(c._id, c.name)}
              className="inline-flex items-center gap-2 text-xs font-semibold bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800"
            >
              <Trash2 size={13} /> {c.name} (Cycle {c.cycleNumber}) is complete — delete it to start fresh
            </button>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-left">
            <tr>
              <th className="p-3">Circle / Cycle</th>
              <th className="p-3">Slot</th>
              <th className="p-3">Member</th>
              <th className="p-3">Bank</th>
              <th className="p-3">Disbursed at</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ circle, member }) => {
              const u = typeof member.user === "object" ? member.user : null;
              return (
                <tr key={`${circle._id}-${member.numericId}`} className="border-t dark:border-slate-700">
                  <td className="p-3 text-slate-900 dark:text-slate-100">{circle.name} · Cycle {circle.cycleNumber}</td>
                  <td className="p-3 font-bold text-slate-900 dark:text-slate-100">#{member.numericId}</td>
                  <td className="p-3 text-slate-900 dark:text-slate-100">{u ? `${u.firstName} ${u.lastName}` : "—"}</td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">
                    {u?.bank ? `${u.bank.bankName} · ${u.bank.accountNumber}` : "—"}
                  </td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">
                    {member.disbursedAt ? new Date(member.disbursedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-red-600 dark:text-red-400 font-semibold">Disbursed / Collected</td>
                  <td className="p-3">
                    <button
                      onClick={() => removeOne(circle._id, member.numericId)}
                      title="Delete this disbursal record"
                      className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-5 text-center text-slate-400 dark:text-slate-500">
                  No disbursals recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
