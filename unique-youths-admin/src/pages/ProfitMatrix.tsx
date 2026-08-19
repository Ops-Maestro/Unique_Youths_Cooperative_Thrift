import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageHeader, Banner, naira } from "../components/ui";

type Metrics = {
  activeUsers: number;
  disbursedCount: number;
  owambeFund: number;
  globalSavingsPool: number;
  totalPenalties: number;
  circle?: {
    id: string;
    name: string;
    cycleNumber: number;
    baselineSize: number;
    recipientCount: number;
    currentMonth: {
      circleSize: number;
      paidMemberCount: number;
      recipientCount: number;
      savingsPot: number;
      partyFund: number;
      grossPayoutPerRecipient: number;
      maintenanceFeePerRecipient: number;
      totalMaintenanceFees: number;
      netPayoutPerRecipient: number;
      totalNetPayout: number;
    } | null;
  };
};

export default function ProfitMatrix({
  token,
  refreshKey
}: {
  token: string;
  refreshKey?: number;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setErr("");

      try {
        const data: Metrics = await api("/api/admin/metrics", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!cancelled) {
          setMetrics(data);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e.message || "Failed to load metrics");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  /*
   * Maintenance fee calculation
   *
   * The maintenance fee is:
   * ₦500 × max(3, ceil(circle size ÷ 2)) × 2
   *
   * The minimum fee therefore starts at ₦3,000.
   */
  const getMaintenanceFee = (circleSize: number) => {
    if (circleSize <= 0) return 0;

    return (
      500 *
      Math.max(3, Math.ceil(circleSize / 2)) *
      2
    );
  };

  const formatCurrency = (amount: number) => {
    return `₦${Math.round(amount).toLocaleString()}`;
  };

  const getFeeScaleDisplay = (circleSize: number) => {
    const fee = getMaintenanceFee(circleSize);

    return `${circleSize} members: ${formatCurrency(fee)} per winner`;
  };

  // Current month's payout data
  const payoutData = metrics?.circle?.currentMonth;

  // Prefer the actual current-month circle size.
  // Fall back to the circle's baseline size when current-month data
  // is not available yet.
  const circleSize =
    payoutData?.circleSize ||
    metrics?.circle?.baselineSize ||
    0;

  const paidCount = payoutData?.paidMemberCount || 0;

  const grossPayout =
    payoutData?.grossPayoutPerRecipient || 0;

  const maintenanceFee =
    payoutData?.maintenanceFeePerRecipient ??
    getMaintenanceFee(circleSize);

  const netPayout =
    payoutData?.netPayoutPerRecipient ??
    Math.max(0, grossPayout - maintenanceFee);

  const recipientCount =
    payoutData?.recipientCount ||
    metrics?.circle?.recipientCount ||
    2;

  const hasEnoughPaidMembers =
    paidCount >= recipientCount;

  const canCalculatePayout =
    paidCount > 0 && hasEnoughPaidMembers;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <PageHeader
          title="Circle Overview"
          subtitle={`Auto-calculated from ${
            metrics?.activeUsers ?? 0
          } active members. ${
            metrics?.disbursedCount ?? 0
          } payouts made so far.`}
        />

        {/* Dynamic Payout Card */}
        <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-5 py-3 text-right min-w-[200px]">
          <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">
            Payout per recipient
          </p>

          {loading ? (
            <div className="h-7 w-24 bg-red-200/50 dark:bg-red-800/50 animate-pulse rounded mt-1 mx-auto" />
          ) : canCalculatePayout ? (
            <>
              <b className="text-xl text-red-700 dark:text-red-400">
                {naira(Math.round(netPayout))}
              </b>

              <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5">
                Net, after maintenance fee
              </p>

              {circleSize > 0 && (
                <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                  {recipientCount} recipient
                  {recipientCount > 1 ? "s" : ""} · Fee:{" "}
                  {naira(Math.round(maintenanceFee))}
                  <br />

                  <span className="text-[9px] text-red-500/80 dark:text-red-400/70">
                    {getFeeScaleDisplay(circleSize)}
                  </span>
                </p>
              )}
            </>
          ) : paidCount === 0 ? (
            <>
              <b className="text-xl text-red-700 dark:text-red-400">
                —
              </b>

              <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5">
                No members have paid this month
              </p>

              <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                {recipientCount} recipient
                {recipientCount > 1 ? "s" : ""} required for draw
              </p>
            </>
          ) : (
            <>
              <b className="text-xl text-red-700 dark:text-red-400">
                —
              </b>

              <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5">
                Need{" "}
                {recipientCount - paidCount} more paid member
                {recipientCount - paidCount > 1 ? "s" : ""}
              </p>

              <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                {paidCount} paid · {recipientCount} required
              </p>
            </>
          )}
        </div>
      </div>

      {err && <Banner tone="error" message={err} />}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Global Savings Pool */}
        <div className="rounded-2xl p-5 shadow-sm bg-blue-800 text-white">
          <p className="text-blue-200 text-sm font-semibold">
            Global Savings Pool
          </p>

          {loading ? (
            <div className="h-8 w-32 bg-blue-600/50 animate-pulse rounded mt-1" />
          ) : (
            <b className="text-2xl block mt-1">
              {naira(metrics?.globalSavingsPool ?? 0)}
            </b>
          )}

          <p className="text-blue-200 text-xs mt-3 border-t border-blue-600 pt-3">
            ₦10,000 × {paidCount} confirmed monthly contributions
            {paidCount > 0 &&
              ` = ${naira(paidCount * 10000)}`}
          </p>
        </div>

        {/* Owambe Fund */}
        <div className="rounded-2xl p-5 shadow-sm bg-white dark:bg-slate-900 border-2 border-red-600">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">
            Owambe / Get-Together Fund
          </p>

          {loading ? (
            <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 animate-pulse rounded mt-1" />
          ) : (
            <b className="text-2xl block mt-1 text-slate-900 dark:text-slate-100">
              {naira(metrics?.owambeFund ?? 0)}
            </b>
          )}

          <p className="text-slate-600 dark:text-slate-400 text-xs mt-3 border-t dark:border-slate-700 pt-3">
            ₦1,000 × {paidCount} confirmed monthly contributions
            {paidCount > 0 &&
              ` = ${naira(paidCount * 1000)}`}
          </p>
        </div>

        {/* Late Penalties */}
        <div className="rounded-2xl p-5 shadow-sm bg-white dark:bg-slate-900">
          <p className="text-slate-700 dark:text-slate-300 text-sm font-semibold">
            Late Penalties Collected
          </p>

          {loading ? (
            <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 animate-pulse rounded mt-1" />
          ) : (
            <b className="text-2xl block mt-1 text-slate-900 dark:text-slate-100">
              {naira(metrics?.totalPenalties ?? 0)}
            </b>
          )}

          <p className="text-slate-600 dark:text-slate-400 text-xs mt-3 border-t dark:border-slate-700 pt-3">
            ₦4,000 per late contribution
          </p>
        </div>
      </div>

      {/* Fee Scale Information */}
      {circleSize > 0 && !loading && (
        <div className="mt-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                Current Fee Scale
              </p>

              <p className="text-xs text-blue-700 dark:text-blue-400">
                {getFeeScaleDisplay(circleSize)}
              </p>

              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Formula: ₦500 × max(3, ceil(circle size ÷ 2)) × 2 ={" "}
                {formatCurrency(getMaintenanceFee(circleSize))}
              </p>
            </div>

            {grossPayout > 0 && (
              <div className="text-right">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Gross: {naira(Math.round(grossPayout))}
                </p>

                <p className="text-xs text-red-600 dark:text-red-400">
                  Fee: -{naira(Math.round(maintenanceFee))}
                </p>

                <p className="text-xs font-bold text-green-700 dark:text-green-400">
                  Net: {naira(Math.round(netPayout))}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}