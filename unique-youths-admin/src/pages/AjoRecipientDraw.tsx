import { useEffect, useState } from "react";
import { Shuffle, RotateCcw } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner } from "../components/ui";

type Member = {
  user: { _id: string; firstName: string; lastName: string } | string;
  numericId: number;
  drawExcluded: boolean;
  disbursed: boolean;
};

type Circle = {
  _id: string;
  name: string;
  cycleNumber: number;
  baselineSize: number;
  completed: boolean;
  members: Member[];
};

export default function AjoRecipientDraw({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [activeId, setActiveId] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCycleSize, setNewCycleSize] = useState("20");

  const load = async () => {
    try {
      setErr("");
      const data: Circle[] = await api("/api/admin/circles", { headers: { Authorization: `Bearer ${token}` } });
      setCircles(data);
      if (!activeId && data.length) setActiveId(data[0]._id);
      if (data.length) setNewCycleSize(String(data[0].baselineSize));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [token, refreshKey]);

  const active = circles.find(c => c._id === activeId);
  const eligible = active ? active.members.filter(m => !m.drawExcluded && !m.disbursed) : [];
  const recipients = active ? active.members.filter(m => m.disbursed) : [];

  const trigger = async () => {
    if (!active) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const data = await api(`/api/admin/circles/${active._id}/random-disbursal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const positions = data.recipients?.map((r: any) => r.numericId).join(" and ");
      setMsg(
        data.cycleCompleted
          ? `Selected positions: ${positions}. Cycle ${active.cycleNumber} is now complete — every member has collected their payout.`
          : `Selected positions: ${positions}.`
      );
      await load();
    } catch (e: any) {
      setErr(e.message || "Random selection failed");
    } finally {
      setBusy(false);
    }
  };

  const startNewCycle = async () => {
    setErr("");
    setMsg("");
    const size = Number(newCycleSize);
    if (!Number.isInteger(size) || size < 2) {
      setErr("Cycle size must be a whole number of 2 or more.");
      return;
    }
    try {
      const data = await api("/api/admin/circles/start-new-cycle", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ baselineSize: size })
      });
      setMsg(data.message);
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Ajo Monthly Recipient Draw"
        subtitle="Random Selection Engine — draws exactly two active, un-disbursed slot holders."
      />

      {err && <Banner tone="error" message={err} />}
      {msg && <Banner tone="success" message={msg} />}

      <div className="flex flex-wrap gap-2 mb-4">
        {circles.map(c => (
          <button
            key={c._id}
            onClick={() => setActiveId(c._id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
              c._id === activeId
                ? "bg-blue-800 text-white border-blue-800"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300"
            }`}
          >
            {c.name} · Cycle {c.cycleNumber}
            {c.completed ? " (Completed)" : ""}
          </button>
        ))}
        {circles.length === 0 && <p className="text-slate-500 dark:text-slate-400">No circles yet.</p>}
      </div>

      {active && (
        <div className="border-2 border-red-600 rounded-2xl p-5 bg-white dark:bg-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex gap-3">
              {eligible.slice(0, 2).map(m => (
                <div key={m.numericId} className="bg-blue-800 text-white rounded-xl w-16 h-16 flex items-center justify-center text-2xl font-black">
                  {m.numericId}
                </div>
              ))}
              {eligible.length === 0 && recipients.length > 0 && (
                <p className="text-slate-500 dark:text-slate-400 self-center">All members in this cycle have been disbursed.</p>
              )}
            </div>

            <div className="text-sm text-slate-500 dark:text-slate-400 sm:text-right">
              Eligible pool this cycle: <b>{eligible.length}</b> of {active.baselineSize} slots
              <br />
              ({recipients.length} already Disbursed/Collected, excluded from future rolls)
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-5">
            <button
              disabled={busy || eligible.length < 2 || active.completed}
              onClick={trigger}
              className="inline-flex items-center gap-2 bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white px-5 py-3 rounded-lg font-semibold"
            >
              <Shuffle size={18} /> Trigger Random Selection Roll
            </button>

            <button
              onClick={startNewCycle}
              className="inline-flex items-center gap-2 border border-slate-300 dark:border-slate-600 px-5 py-3 rounded-lg font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <RotateCcw size={18} /> Start new cycle
            </button>

            <label className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              with
              <input
                type="number"
                min={2}
                value={newCycleSize}
                onChange={e => setNewCycleSize(e.target.value)}
                className="w-16 border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-2 text-center"
              />
              slots
            </label>
          </div>

          {recipients.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              {recipients.map(m => {
                const u = typeof m.user === "object" ? m.user : null;
                return (
                  <div key={m.numericId} className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-xl p-4">
                    <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">Lump-Sum Recipient · Slot #{m.numericId}</p>
                    <b className="block text-lg text-slate-900 dark:text-slate-100 mt-1">{u ? `${u.firstName} ${u.lastName}` : "Member"}</b>
                    <p className="text-red-600 font-semibold text-sm mt-1">Status: Disbursed / Collected</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
