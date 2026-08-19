import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle, Trash2, AlertTriangle, Download } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner, naira } from "../components/ui";

type LateFee = { id: string; amount: number; status: "owed" | "paid" };

type PaymentClaim = {
  _id: string;
  monthKey: string;
  amount: number;
  status:
    | "reported"
    | "confirmed"
    | "rejected";
  reportedAt: string;
  rejectionReason?: string | null;
  paymentReference?: string | null;
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    username: string;
    email?: string;
    primaryPhone?: string;
    avatarDataUrl?: string;
  };
  circle:
    | {
        id: string;
        name: string;
        cycleNumber: number;
        numericId: number;
      }
    | null;
};

type Member = {
  numericId: number;
  user: { _id: string; firstName: string; lastName: string; username: string; avatarDataUrl?: string } | string | null;
  status: "onTime" | "unpaid" | "reported" | "rejected";
  savingsAmount: number;
  partyAmount: number;
  paidAt: string | null;
  ledgerId: string | null;
  paymentClaim: {
    id: string;
    status: "reported" | "confirmed" | "rejected";
    reportedAt: string;
    rejectionReason?: string | null;
  } | null;
  lateFee: LateFee | null;
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
  reported: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
  rejected: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
  unpaid: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
};

function StatusBadge({
  m
}: {
  m: Member
}) {
  if (
    m.status ===
    "onTime"
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold text-sm">
        <CheckCircle2
          size={15}
        />{" "}
        Paid{" "}
        {naira(
          m.savingsAmount +
            m.partyAmount
        )}
      </span>
    );
  }

  if (
    m.status ===
    "reported"
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold text-sm">
        <Clock
          size={15}
        />{" "}
        Payment reported — awaiting confirmation
      </span>
    );
  }

  if (
    m.status ===
    "rejected"
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-semibold text-sm">
        <XCircle
          size={15}
        />{" "}
        Payment report rejected
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 font-semibold text-sm">
      <XCircle
        size={15}
      />{" "}
      Not paid yet this month
    </span>
  );
}

export default function ContributionsTracker({
  token,
  refreshKey
}: {
  token: string;
  refreshKey?: number;
}) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  const [month, setMonth] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setErr("");

    try {
      const [contributionData, claimData] =
        await Promise.all([
          api("/api/admin/contributions", {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }),

          api("/api/admin/payment-claims/current", {
            headers: {
              Authorization: `Bearer ${token}`
            }
          })
        ]);

      setCircles(
        contributionData
      );

      setClaims(
        claimData.claims ||
          []
      );

      setMonth(
        claimData.month ||
          ""
      );
    } catch (e: any) {
      setErr(
        e.message
      );
    }
  };

  useEffect(() => {
    load();
  }, [token, refreshKey]);

  const confirmPaymentReport = async (
    claimId: string
  ) => {
    setErr("");
    setMsg("");
    setBusyId(
      claimId
    );

    try {
      await api(
        `/api/admin/payment-claims/${claimId}/confirm`,
        {
          method:
            "POST",
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      );

      setMsg(
        "Payment report confirmed."
      );

      await load();
    } catch (e: any) {
      setErr(
        e.message
      );
    } finally {
      setBusyId("");
    }
  };

  const rejectPaymentReport = async (
    claimId: string
  ) => {
    const reason =
      window.prompt(
        "Reason for rejecting this payment report:",
        "Payment proof could not be verified."
      );

    if (
      reason ===
      null
    ) {
      return;
    }

    setErr("");
    setMsg("");
    setBusyId(
      claimId
    );

    try {
      await api(
        `/api/admin/payment-claims/${claimId}/reject`,
        {
          method:
            "POST",
          headers: {
            Authorization:
              `Bearer ${token}`,
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              reason
            })
        }
      );

      setMsg(
        "Payment report rejected."
      );

      await load();
    } catch (e: any) {
      setErr(
        e.message
      );
    } finally {
      setBusyId("");
    }
  };

  // NEW: Delete (remove) a reported claim entirely
  const deleteReportedClaim = async (claimId: string) => {
    if (!window.confirm("Delete this reported payment claim? This will remove it from the system and allow the member to report again.")) return;
    setErr("");
    setMsg("");
    setBusyId(claimId);

    try {
      await api(`/api/admin/payment-claims/${claimId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg("Claim deleted.");
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId("");
    }
  };

  const markPaid = async (userId: string) => {
    setErr("");
    setMsg("");
    setBusyId(userId);

    try {
      await api("/api/admin/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId })
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

      setMsg("Payment reversed. The original payment notice has been preserved in the audit history.");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId("");
    }
  };

  const imposeLateFee = async (userId: string) => {
    setErr("");
    setMsg("");
    setBusyId(userId);

    try {
      await api("/api/admin/late-fees", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId })
      });

      setMsg("Late fee imposed.");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId("");
    }
  };

  const markLateFeePaid = async (feeId: string) => {
    setErr("");
    setMsg("");
    setBusyId(feeId);

    try {
      await api(`/api/admin/late-fees/${feeId}/mark-paid`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      setMsg("Late fee marked as paid.");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId("");
    }
  };

  const removeLateFee = async (feeId: string) => {
    setErr("");
    setMsg("");
    setBusyId(feeId);

    try {
      await api(`/api/admin/late-fees/${feeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      setMsg("Late fee removed.");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId("");
    }
  };

  const exportCsv = async () => {
    setErr("");

    try {
      const base =
        (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:3000";

      const r = await fetch(`${base}/api/admin/contributions/export.csv`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!r.ok) throw new Error("Export failed");

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `contributions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e.message || "Export failed");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Contributions Tracker"
          subtitle="This calendar month's ₦11,000-per-member target (₦10,000 pot + ₦1,000 Owambe), broken down per member. Confirm a payment once you've checked the proof in the WhatsApp community."
        />

        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-semibold text-sm shrink-0"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      {err && <Banner tone="error" message={err} />}
      {msg && <Banner tone="success" message={msg} />}

      {claims.filter(
        claim =>
          claim.status ===
          "reported"
      ).length > 0 && (
        <section className="mt-5 mb-6 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5">
          <h2 className="font-bold text-xl text-amber-900 dark:text-amber-300">
            Payment reports awaiting confirmation
          </h2>

          <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
            Members have reported that their{" "}
            {month ||
              "current month"} contribution was paid.
            Verify the proof sent through WhatsApp before
            confirming the payment.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
            {claims
              .filter(
                claim =>
                  claim.status ===
                  "reported"
              )
              .map(
                claim => (
                  <div
                    key={
                      claim._id
                    }
                    className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 rounded-xl p-4 relative"
                  >
                    {/* Delete button (X) */}
                    <button
                      onClick={() => deleteReportedClaim(claim._id)}
                      disabled={busyId === claim._id}
                      className="absolute top-3 right-3 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition disabled:opacity-30"
                      title="Delete this report"
                    >
                      ✕
                    </button>

                    <p className="font-bold text-slate-900 dark:text-slate-100 pr-6">
                      {claim.user.firstName}{" "}
                      {claim.user.lastName}
                    </p>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      @{claim.user.username}
                      {claim.circle
                        ? ` · Slot ${claim.circle.numericId}`
                        : " · Awaiting circle assignment"}
                    </p>

                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-3">
                      ₦
                      {Number(
                        claim.amount
                      ).toLocaleString()}{" "}
                      monthly contribution reported
                    </p>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Reported{" "}
                      {new Date(
                        claim.reportedAt
                      ).toLocaleString()}
                    </p>

                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() =>
                          confirmPaymentReport(
                            claim._id
                          )
                        }
                        disabled={
                          busyId ===
                          claim._id
                        }
                        className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                      >
                        Confirm
                      </button>

                      <button
                        onClick={() =>
                          rejectPaymentReport(
                            claim._id
                          )
                        }
                        disabled={
                          busyId ===
                          claim._id
                        }
                        className="flex-1 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )
              )}
          </div>
        </section>
      )}

      <div className="space-y-8">
        {circles.map(c => (
          <div
            key={c._id}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                {c.name} · Cycle {c.cycleNumber}
              </h3>

              <p
                className={`text-sm font-semibold ${
                  c.met
                    ? "text-green-600"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {naira(c.collected)} of {naira(c.target)} collected this month ·{" "}
                {c.paidCount}/{c.memberCount} members paid
                {c.met ? " · Target met! 🎉" : ""}
              </p>
            </div>

            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all ${
                  c.met ? "bg-green-600" : "bg-blue-700"
                }`}
                style={{ width: `${c.percentage}%` }}
              />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
              {c.members.map(m => {
                const u =
                  typeof m.user === "object" && m.user ? m.user : null;

                const uid =
                  u?._id;

                const claim =
                  claims.find(
                    item =>
                      item.user?._id ===
                      uid &&
                      item.monthKey ===
                        new Date().toISOString().slice(0, 7)
                  );

                const effectiveStatus =
                  m.status ===
                    "onTime"
                    ? "onTime"
                    : claim?.status ===
                        "reported"
                    ? "reported"
                    : claim?.status ===
                        "rejected"
                    ? "rejected"
                    : m.status;

                return (
                  <div
                    key={m.numericId}
                    className={`border rounded-xl p-3 flex items-center gap-3 ${
                      STATUS_STYLES[
                        effectiveStatus
                      ]
                    }`}
                  >
                    {u?.avatarDataUrl ? (
                      <img
                        src={u.avatarDataUrl}
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                        alt=""
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-800 text-white flex items-center justify-center text-sm font-bold shrink-0">
                        {u?.firstName?.[0] || m.numericId}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                        #{m.numericId} ·{" "}
                        {u ? `${u.firstName} ${u.lastName}` : "Empty slot"}
                      </p>

                      <StatusBadge
                        m={{
                          ...m,
                          status:
                            effectiveStatus,
                          paymentClaim:
                            claim
                              ? {
                                  id:
                                    claim._id,
                                  status:
                                    claim.status,
                                  reportedAt:
                                    claim.reportedAt,
                                  rejectionReason:
                                    claim.rejectionReason
                                }
                              : m.paymentClaim
                        }}
                      />

                      {effectiveStatus ===
                        "reported" &&
                        claim && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() =>
                              confirmPaymentReport(
                                claim._id
                              )
                            }
                            disabled={
                              busyId ===
                              claim._id
                            }
                            className="text-xs font-semibold bg-green-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50"
                          >
                            Confirm
                          </button>

                          <button
                            onClick={() =>
                              rejectPaymentReport(
                                claim._id
                              )
                            }
                            disabled={
                              busyId ===
                              claim._id
                            }
                            className="text-xs font-semibold bg-red-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}

                      {effectiveStatus ===
                        "rejected" &&
                        claim?.rejectionReason && (
                        <p className="text-xs text-red-700 dark:text-red-300 mt-2">
                          {claim.rejectionReason}
                        </p>
                      )}


                      {uid &&
                        effectiveStatus ===
                          "unpaid" && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => markPaid(uid)}
                            disabled={busyId === uid}
                            className="text-xs font-semibold bg-green-600 text-white px-2.5 py-1.5 rounded-md disabled:opacity-50"
                          >
                            Mark paid
                          </button>
                        </div>
                      )}

                      {m.ledgerId && (
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                "Undo this monthly contribution payment?"
                              )
                            ) {
                              undoPayment(m.ledgerId!);
                            }
                          }}
                          disabled={busyId === m.ledgerId}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 opacity-70 hover:opacity-100 disabled:opacity-30"
                          title="Undo this payment record"
                        >
                          <Trash2 size={12} /> Undo
                        </button>
                      )}

                      {/* Late fee - always a separate transaction from the
                          monthly contribution above, imposed and paid on
                          the admin's own schedule. */}
                      {uid && !m.lateFee && (
                        <button
                          onClick={() => imposeLateFee(uid)}
                          disabled={busyId === uid}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 opacity-80 hover:opacity-100 disabled:opacity-30"
                        >
                          <AlertTriangle size={12} /> Impose late fee
                        </button>
                      )}

                      {m.lateFee?.status === "owed" && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                            <Clock size={12} /> {naira(m.lateFee.amount)} late fee owed
                          </span>

                          <button
                            onClick={() =>
                              markLateFeePaid(m.lateFee!.id)
                            }
                            disabled={busyId === m.lateFee.id}
                            className="text-xs font-semibold bg-amber-600 text-white px-2 py-1 rounded-md disabled:opacity-50"
                          >
                            Mark fee paid
                          </button>

                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove this ₦${m.lateFee!.amount.toLocaleString()} late fee?`
                                )
                              ) {
                                removeLateFee(m.lateFee!.id);
                              }
                            }}
                            disabled={busyId === m.lateFee.id}
                            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30"
                            title="Waive/remove this fee"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}

                      {m.lateFee?.status === "paid" && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400">
                            <CheckCircle2 size={12} />{" "}
                            {naira(m.lateFee.amount)} late fee paid
                          </span>

                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Undo this ₦${m.lateFee!.amount.toLocaleString()} late fee payment?`
                                )
                              ) {
                                removeLateFee(m.lateFee!.id);
                              }
                            }}
                            disabled={busyId === m.lateFee.id}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 disabled:opacity-30"
                            title="Undo/remove this late fee payment"
                          >
                            <Trash2 size={12} /> Undo
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {c.members.length === 0 && (
                <p className="text-slate-400 text-sm">
                  No members assigned to this circle yet.
                </p>
              )}
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