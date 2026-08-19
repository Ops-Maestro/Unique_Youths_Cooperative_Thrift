import { useEffect, useState } from "react";
import { Trash2, Trophy, Clock3 } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner, naira } from "../components/ui";

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
  baselineSize: number;
  members: Member[];
};

type PayoutSummary = {
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
};

type PayoutRecord = {
  _id: string;
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    username?: string;
  } | string;
  numericId: number;
  grossAmount: number;
  maintenanceFee: number;
  netAmount: number;
  status: "pending" | "paid" | "reversed";
  paidAt?: string | null;
  paymentReference?: string | null;
  reversalReason?: string | null;
  createdAt: string;
};

type CirclePayoutResponse = {
  circle: {
    id: string;
    name: string;
    cycleNumber: number;
    completed: boolean;
    baselineSize: number;
  };
  payouts: PayoutRecord[];
  summary: PayoutSummary | null;
};

export default function MonthlyDisbursals({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [payoutData, setPayoutData] = useState<Map<string, CirclePayoutResponse>>(new Map());
  const [activeCircleId, setActiveCircleId] = useState<string>("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const loadCircles = async () => {
    try {
      setErr("");
      const data: Circle[] = await api("/api/admin/circles", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCircles(data);

      // Set first non-completed circle or first circle as active
      if (data.length > 0) {
        const active = data.find(c => !c.completed) || data[0];
        setActiveCircleId(active._id);
        await loadPayoutData(active._id);
      }
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const loadPayoutData = async (circleId: string) => {
    if (!circleId) return;
    setLoading(true);
    try {
      const data: CirclePayoutResponse = await api(
        `/api/admin/circles/${circleId}/payouts`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPayoutData(prev => new Map(prev).set(circleId, data));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCircles();
  }, [token, refreshKey]);

  useEffect(() => {
    if (activeCircleId) {
      loadPayoutData(activeCircleId);
    }
  }, [activeCircleId]);

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
      await loadPayoutData(circleId);
      await loadCircles();
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
      setPayoutData(prev => {
        const newMap = new Map(prev);
        newMap.delete(circleId);
        return newMap;
      });
      await loadCircles();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₦${amount.toLocaleString()}`;
  };

  const getFeeScaleDisplay = (circleSize: number) => {
    const fee = 500 * Math.ceil(circleSize / 2);
    return `${circleSize} members: ${formatCurrency(fee)} per winner`;
  };

  // Get all disbursed members across all circles
  const allDisbursed = circles.flatMap(c =>
    c.members
      .filter(m => m.disbursed)
      .map(m => ({ circle: c, member: m }))
  );

  // Get the active circle's payout data
  const activePayoutData = activeCircleId ? payoutData.get(activeCircleId) : null;
  const activeCircle = circles.find(c => c._id === activeCircleId);

  // Calculate total paid to date from all payouts
  let totalPaidToDate = 0;
  let totalMembersPaid = 0;
  let totalMaintenanceCollected = 0;

  payoutData.forEach((data) => {
    data.payouts.forEach((payout) => {
      if (payout.status === "paid") {
        totalPaidToDate += payout.netAmount;
        totalMaintenanceCollected += payout.maintenanceFee;
        totalMembersPaid++;
      }
    });
  });

  return (
    <div>
      <PageHeader
        title="Monthly Disbursals"
        subtitle="Track payout records for each circle. All amounts are calculated dynamically based on actual monthly contributions and circle size."
      />

      {err && <Banner tone="error" message={err} />}
      {msg && <Banner tone="success" message={msg} />}

      {/* Circle Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {circles.map(circle => (
          <button
            key={circle._id}
            onClick={() => setActiveCircleId(circle._id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
              circle._id === activeCircleId
                ? "bg-blue-800 text-white border-blue-800"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300"
            }`}
          >
            {circle.name} · Cycle {circle.cycleNumber}
            {circle.completed ? " (Completed)" : ""}
          </button>
        ))}
        {circles.length === 0 && (
          <p className="text-slate-500 dark:text-slate-400">No circles yet.</p>
        )}
      </div>

      {/* Delete Completed Circle Button */}
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

      {/* Payout Summary Cards */}
      {activeCircle && activePayoutData && (
        <div className="mb-6">
          {/* Fee Scale Display */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  Fee Scale for {activeCircle.name}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  {getFeeScaleDisplay(activeCircle.baselineSize)}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Formula: ₦500 × max(3, ceil(circle size ÷ 2)) × 2 = {formatCurrency(500 * Math.ceil(activeCircle.baselineSize / 2))}
                </p>
              </div>
              {activePayoutData.summary && (
                <div className="text-right">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    Savings Pot: <span className="font-bold">{formatCurrency(activePayoutData.summary.savingsPot)}</span>
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    {activePayoutData.summary.paidMemberCount} paid members × ₦10,000
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Payout Summary if available */}
          {activePayoutData.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white dark:bg-slate-900 border rounded-lg p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Gross Payout</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {formatCurrency(activePayoutData.summary.grossPayoutPerRecipient)}
                </p>
                <p className="text-xs text-slate-400">per recipient</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border rounded-lg p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Maintenance Fee</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(activePayoutData.summary.maintenanceFeePerRecipient)}
                </p>
                <p className="text-xs text-slate-400">per recipient</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border rounded-lg p-3 border-green-200 dark:border-green-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Net Payout</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">
                  {formatCurrency(activePayoutData.summary.netPayoutPerRecipient)}
                </p>
                <p className="text-xs text-slate-400">per recipient</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border rounded-lg p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Net Payout</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                  {formatCurrency(activePayoutData.summary.totalNetPayout)}
                </p>
                <p className="text-xs text-slate-400">
                  {activePayoutData.summary.recipientCount} recipient{activePayoutData.summary.recipientCount > 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )}

          {/* Total Stats */}
          {totalMembersPaid > 0 && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-green-700 dark:text-green-400">Total Members Paid</p>
                  <p className="text-xl font-bold text-green-800 dark:text-green-300">{totalMembersPaid}</p>
                </div>
                <div>
                  <p className="text-xs text-green-700 dark:text-green-400">Total Paid Out</p>
                  <p className="text-xl font-bold text-green-800 dark:text-green-300">{formatCurrency(totalPaidToDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-green-700 dark:text-green-400">Total Maintenance Collected</p>
                  <p className="text-xl font-bold text-green-800 dark:text-green-300">{formatCurrency(totalMaintenanceCollected)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disbursal Records Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-left">
            <tr>
              <th className="p-3">Circle / Cycle</th>
              <th className="p-3">Slot</th>
              <th className="p-3">Member</th>
              <th className="p-3">Bank</th>
              <th className="p-3">Payout Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Disbursed at</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {allDisbursed.map(({ circle, member }) => {
              const u = typeof member.user === "object" ? member.user : null;
              // Find matching payout record
              const circlePayouts = payoutData.get(circle._id);
              let payoutRecord = null;
              if (circlePayouts) {
                const userId = u?._id || (typeof member.user === "string" ? member.user : "");
                payoutRecord = circlePayouts.payouts.find(p => {
                  const pUserId = typeof p.user === "object" ? p.user._id : p.user;
                  return pUserId === userId && p.numericId === member.numericId;
                });
              }

              return (
                <tr key={`${circle._id}-${member.numericId}`} className="border-t dark:border-slate-700">
                  <td className="p-3 text-slate-900 dark:text-slate-100">{circle.name} · Cycle {circle.cycleNumber}</td>
                  <td className="p-3 font-bold text-slate-900 dark:text-slate-100">#{member.numericId}</td>
                  <td className="p-3 text-slate-900 dark:text-slate-100">{u ? `${u.firstName} ${u.lastName}` : "—"}</td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">
                    {u?.bank ? `${u.bank.bankName} · ${u.bank.accountNumber}` : "—"}
                  </td>
                  <td className="p-3">
                    {payoutRecord ? (
                      <div>
                        <p className="font-semibold text-green-600 dark:text-green-400">
                          {formatCurrency(payoutRecord.netAmount)}
                        </p>
                        <p className="text-xs text-slate-400">
                          Gross: {formatCurrency(payoutRecord.grossAmount)}
                          <br />
                          Fee: -{formatCurrency(payoutRecord.maintenanceFee)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {payoutRecord ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                        payoutRecord.status === "paid"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : payoutRecord.status === "reversed"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}>
                        {payoutRecord.status === "paid" ? "✅ Paid" :
                         payoutRecord.status === "reversed" ? "⚠️ Reversed" :
                         "⏳ Pending"}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold text-xs">Disbursed / Collected</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">
                    {member.disbursedAt ? new Date(member.disbursedAt).toLocaleDateString() : "—"}
                  </td>
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
            {allDisbursed.length === 0 && (
              <tr>
                <td colSpan={8} className="p-5 text-center text-slate-400 dark:text-slate-500">
                  No disbursals recorded yet.
                  {activeCircle && activePayoutData?.summary && (
                    <div className="mt-2 text-sm">
                      <p className="text-slate-500">The next draw will pay out based on:</p>
                      <p className="text-xs text-slate-400">
                        {activePayoutData.summary.paidMemberCount} paid members × ₦10,000 = {formatCurrency(activePayoutData.summary.savingsPot)} pot
                      </p>
                      <p className="text-xs text-slate-400">
                        Fee: {getFeeScaleDisplay(activeCircle.baselineSize)}
                      </p>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="text-center py-4 text-slate-500">
          Loading payout data...
        </div>
      )}
    </div>
  );
}