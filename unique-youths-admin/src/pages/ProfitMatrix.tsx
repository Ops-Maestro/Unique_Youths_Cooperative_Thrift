import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader, Banner, naira } from "../components/ui";

type Metrics = {
  activeUsers: number;
  disbursedCount: number;
  owambeFund: number;
  globalSavingsPool: number;
  totalPenalties: number;
};

export default function ProfitMatrix({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/admin/metrics", { headers: { Authorization: `Bearer ${token}` } })
      .then(setMetrics)
      .catch(e => setErr(e.message));
  }, [token, refreshKey]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <PageHeader
          title="Circle Overview"
          subtitle={`Auto-calculated from ${metrics?.activeUsers ?? 0} active members. ${metrics?.disbursedCount ?? 0} payouts made so far.`}
        />
        <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-5 py-3 text-right">
          <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">Payout per recipient</p>
          <b className="text-xl text-red-700 dark:text-red-400">₦95,000</b>
          <p className="text-[11px] text-red-500 dark:text-red-400/80 mt-0.5">Net, per the accepted rules</p>
        </div>
      </div>

      {err && <Banner tone="error" message={err} />}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5 shadow-sm bg-blue-800 text-white">
          <p className="text-blue-200 text-sm font-semibold">Global Savings Pool</p>
          <b className="text-2xl block mt-1">{naira(metrics?.globalSavingsPool ?? 0)}</b>
          <p className="text-blue-200 text-xs mt-3 border-t border-blue-600 pt-3">
            ₦10,000 × every confirmed monthly contribution — this is the pot recipients are paid from.
          </p>
        </div>

        <div className="rounded-2xl p-5 shadow-sm bg-white dark:bg-slate-900 border-2 border-red-600">
          <p className="text-red-600 text-sm font-semibold">Owambe / Get-Together Fund</p>
          <b className="text-2xl block mt-1 text-slate-900 dark:text-slate-100">{naira(metrics?.owambeFund ?? 0)}</b>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-3 border-t dark:border-slate-700 pt-3">₦1,000 × confirmed monthly contributions</p>
        </div>

        <div className="rounded-2xl p-5 shadow-sm bg-white dark:bg-slate-900">
          <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold">Late Penalties Collected</p>
          <b className="text-2xl block mt-1 text-slate-900 dark:text-slate-100">{naira(metrics?.totalPenalties ?? 0)}</b>
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-3 border-t dark:border-slate-700 pt-3">₦4,000 per late contribution</p>
        </div>
      </div>
    </div>
  );
}
