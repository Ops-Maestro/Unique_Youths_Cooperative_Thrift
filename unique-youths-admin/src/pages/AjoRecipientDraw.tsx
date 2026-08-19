import {
  useEffect,
  useRef,
  useState
} from "react";
import {
  Shuffle,
  RotateCcw,
  Dices,
  Trophy,
  Clock3
} from "lucide-react";
import { api } from "../lib/api";
import {
  PageHeader,
  Banner
} from "../components/ui";

type Member = {
  user:
    | {
        _id: string;
        firstName: string;
        lastName: string;
        username?: string;
      }
    | string;

  numericId: number;

  /*
   * Backend meaning:
   *
   * drawExcluded / disbursed means the member has already
   * been selected and locked out of future draws in this cycle.
   *
   * It does NOT automatically mean the money was transferred.
   * Actual payment state comes from Payout.status.
   */
  drawExcluded: boolean;

  disbursed: boolean;

  disbursedAt?: string;
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

type Circle = {
  _id: string;

  name: string;

  cycleNumber: number;

  baselineSize: number;

  recipientCount: 1 | 2;

  completed: boolean;

  active: boolean;

  members: Member[];

  draw?: {
    status:
      | "idle"
      | "rolling"
      | "completed";

    startedAt?: string | null;

    completedAt?: string | null;

    selectedMembers?: string[];

    recipientCount?: number;

    payout?: PayoutSummary | null;

    history?: any[];
  };
};

type DrawRecipient = {
  userId: string;

  firstName: string;

  lastName: string;

  username?: string;

  numericId: number | null;

  status: string;

  payoutId?: string | null;

  grossAmount?: number;

  maintenanceFee?: number;

  netAmount?: number;

  paidAt?: string | null;

  paymentReference?: string | null;
};

type DrawStatusResponse = {
  draw: {
    status:
      | "idle"
      | "rolling"
      | "completed";

    startedAt?: string | null;

    completedAt?: string | null;

    durationMs: number;

    recipientCount?: number;
  };

  recipients: DrawRecipient[];

  cycleCompleted: boolean;

  eligibleCount: number;

  paidMemberCount?: number;

  payout?: PayoutSummary | null;
};

type PayoutStatus =
  | "pending"
  | "paid"
  | "reversed";

type CirclePayout = {
  _id: string;

  circle: string;

  cycleNumber: number;

  drawNumber: number;

  user:
    | {
        _id: string;
        firstName: string;
        lastName: string;
        username?: string;
      }
    | string;

  numericId: number;

  circleSize: number;

  paidMemberCount: number;

  recipientCount: number;

  savingsPot: number;

  partyFund: number;

  grossAmount: number;

  maintenanceFee: number;

  netAmount: number;

  status: PayoutStatus;

  paidAt?: string | null;

  paymentReference?: string | null;

  confirmedBy?: any;

  reversedAt?: string | null;

  reversedBy?: any;

  reversalReason?: string | null;

  note?: string | null;

  createdAt?: string;
};

type CirclePayoutResponse = {
  circle: {
    id: string;
    name: string;
    cycleNumber: number;
    completed: boolean;
  };

  payouts: CirclePayout[];
};

const DRAW_POLL_INTERVAL_MS =
  500;

function getRemainingRollingMs(
  startedAt?: string | null,
  durationMs = 5000
) {
  if (!startedAt) {
    return durationMs;
  }

  const elapsed =
    Date.now() -
    new Date(
      startedAt
    ).getTime();

  return Math.max(
    0,
    durationMs - elapsed
  );
}

function formatNaira(
  value: number | null | undefined
) {
  return `₦${Number(
    value || 0
  ).toLocaleString()}`;
}

function getPayoutUserId(
  payout: CirclePayout
) {
  return typeof payout.user ===
    "object"
    ? payout.user._id
    : payout.user;
}

function getPayoutDisplayStatus(
  payout?: CirclePayout | null
) {
  if (!payout) {
    return "Selected - Payment Pending";
  }

  if (
    payout.status ===
    "paid"
  ) {
    return "Disbursed/Collected";
  }

  if (
    payout.status ===
    "reversed"
  ) {
    return "Payment Reversed";
  }

  return "Selected - Payment Pending";
}

function getPayoutStatusClass(
  payout?: CirclePayout | null
) {
  if (
    payout?.status ===
    "paid"
  ) {
    return "text-green-700 dark:text-green-300";
  }

  if (
    payout?.status ===
    "reversed"
  ) {
    return "text-red-700 dark:text-red-300";
  }

  return "text-amber-700 dark:text-amber-300";
}

function RollingDice() {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-32 h-32 rounded-full bg-red-100 dark:bg-red-950/40 animate-ping opacity-40" />

        <div className="relative w-28 h-28 rounded-3xl bg-red-600 text-white shadow-xl flex items-center justify-center animate-[diceRoll_0.7s_ease-in-out_infinite]">
          <Dices
            size={62}
            strokeWidth={1.7}
          />
        </div>
      </div>

      <p className="mt-7 text-xl font-black text-slate-900 dark:text-white uppercase tracking-wide">
        Rolling the dice...
      </p>

      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm">
        Selecting eligible members using
        secure random selection.
        Assigned slot numbers are never
        used as the random input.
      </p>
    </div>
  );
}

function PayoutSummaryCard({
  payout
}: {
  payout:
    | PayoutSummary
    | null
    | undefined;
}) {
  if (!payout) {
    return null;
  }

  return (
    <div className="mt-5 rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-black text-lg text-slate-900 dark:text-white">
          Monthly payout calculation
        </h3>

        <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full">
          {payout.paidMemberCount} paid member
          {payout.paidMemberCount ===
          1
            ? ""
            : "s"}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        <div className="rounded-xl bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Savings pot
          </p>

          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {formatNaira(
              payout.savingsPot
            )}
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Recipients
          </p>

          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {payout.recipientCount}
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gross per recipient
          </p>

          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {formatNaira(
              payout.grossPayoutPerRecipient
            )}
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Maintenance per recipient
          </p>

          <p className="text-xl font-black text-red-600 dark:text-red-400 mt-1">
            {formatNaira(
              payout.maintenanceFeePerRecipient
            )}
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Net per recipient
          </p>

          <p className="text-xl font-black text-green-700 dark:text-green-400 mt-1">
            {formatNaira(
              payout.netPayoutPerRecipient
            )}
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total maintenance
          </p>

          <p className="text-xl font-black text-red-600 dark:text-red-400 mt-1">
            {formatNaira(
              payout.totalMaintenanceFees
            )}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
        Maintenance fee follows the circle-size rule:
        ₦500 × max(3, ceil(circle size ÷ 2)) × 2.
      </p>
    </div>
  );
}

function RecipientCard({
  recipient,
  payout,
  actualPayout
}: {
  recipient: DrawRecipient;

  payout?:
    | PayoutSummary
    | null;

  actualPayout?:
    | CirclePayout
    | null;
}) {
  const status =
    actualPayout
      ? getPayoutDisplayStatus(
          actualPayout
        )
      : recipient.status;

  const statusClass =
    getPayoutStatusClass(
      actualPayout
    );

  return (
    <div className="rounded-2xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-green-700 dark:text-green-300">
            Lump-Sum Recipient
          </p>

          <h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">
            {recipient.firstName}{" "}
            {recipient.lastName}
          </h3>

          {recipient.username && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              @{recipient.username}
            </p>
          )}
        </div>

        <div className="shrink-0 rounded-xl bg-blue-800 text-white px-4 py-3 text-center">
          <p className="text-[10px] uppercase font-bold text-blue-200">
            Assigned slot
          </p>

          <p className="text-2xl font-black">
            #{recipient.numericId ??
              "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold text-sm">
        <Trophy size={16} />

        Selected for this month's
        {payout
          ? ` ${formatNaira(
              payout.netPayoutPerRecipient
            )}`
          : " payout"}
      </div>

      <div className="mt-3">
        <p
          className={`text-sm font-bold ${statusClass}`}
        >
          Status: {status}
        </p>
      </div>

      {actualPayout?.status ===
        "reversed" &&
        actualPayout.reversalReason && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-300">
            Reversal reason:{" "}
            {actualPayout.reversalReason}
          </p>
        )}

      {actualPayout?.status ===
        "paid" &&
        actualPayout.paymentReference && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            Payment reference:{" "}
            <b>
              {
                actualPayout.paymentReference
              }
            </b>
          </p>
        )}

      {payout && (
        <div className="mt-4 text-sm space-y-1 text-slate-600 dark:text-slate-300">
          <p>
            Gross payout:{" "}
            <b className="text-slate-900 dark:text-white">
              {formatNaira(
                payout.grossPayoutPerRecipient
              )}
            </b>
          </p>

          <p>
            Maintenance fee:{" "}
            <b className="text-red-600 dark:text-red-400">
              {formatNaira(
                payout.maintenanceFeePerRecipient
              )}
            </b>
          </p>

          <p>
            Net payout:{" "}
            <b className="text-green-700 dark:text-green-400">
              {formatNaira(
                payout.netPayoutPerRecipient
              )}
            </b>
          </p>
        </div>
      )}
    </div>
  );
}

export default function AjoRecipientDraw({
  token,
  refreshKey
}: {
  token: string;
  refreshKey?: number;
}) {
  const [
    circles,
    setCircles
  ] = useState<Circle[]>(
    []
  );

  const [
    circlePayouts,
    setCirclePayouts
  ] = useState<
    CirclePayout[]
  >([]);

  const [
    activeId,
    setActiveId
  ] = useState("");

  const [
    msg,
    setMsg
  ] = useState("");

  const [
    err,
    setErr
  ] = useState("");

  const [
    busy,
    setBusy
  ] = useState(false);

  const [
    drawRolling,
    setDrawRolling
  ] = useState(false);

  const [
    drawStatus,
    setDrawStatus
  ] = useState<
    "idle" |
      "rolling" |
      "completed"
  >("idle");

  const [
    drawRecipients,
    setDrawRecipients
  ] = useState<
    DrawRecipient[]
  >([]);

  const [
    drawCountdown,
    setDrawCountdown
  ] = useState(0);

  const [
    recipientCount,
    setRecipientCount
  ] = useState<
    1 | 2
  >(2);

  const [
    drawPayout,
    setDrawPayout
  ] = useState<
    PayoutSummary | null
  >(null);

  const [
    paidMemberCount,
    setPaidMemberCount
  ] = useState(0);

  const pollTimerRef =
    useRef<number | null>(
      null
    );

  const countdownTimerRef =
    useRef<number | null>(
      null
    );

  const activeIdRef =
    useRef(activeId);

  useEffect(() => {
    activeIdRef.current =
      activeId;
  }, [
    activeId
  ]);

  const clearTimers =
    () => {
      if (
        pollTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          pollTimerRef.current
        );

        pollTimerRef.current =
          null;
      }

      if (
        countdownTimerRef.current !==
        null
      ) {
        window.clearInterval(
          countdownTimerRef.current
        );

        countdownTimerRef.current =
          null;
      }
    };

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  /*
   * Load the actual Payout records for a circle.
   *
   * This is intentionally separate from Circle.member.disbursed.
   *
   * Circle.member.disbursed
   *   = selected/locked for the cycle
   *
   * Payout.status
   *   = actual financial payment state
   */
  const loadCirclePayouts =
    async (
      circleId: string
    ) => {
      const data: CirclePayoutResponse =
        await api(
          `/api/admin/circles/${circleId}/payouts`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      setCirclePayouts(
        data.payouts || []
      );

      return data.payouts || [];
    };

  const load = async (
    preferredId?: string
  ) => {
    try {
      setErr("");

      const data: Circle[] =
        await api(
          "/api/admin/circles",
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      const normalized =
        data.map(
          circle => ({
            ...circle,

            recipientCount:
              circle.recipientCount ===
              1
                ? 1
                : 2
          })
        );

      setCircles(
        normalized
      );

      const nextActiveId =
        preferredId ||
        activeIdRef.current ||
        normalized[0]?._id ||
        "";

      if (
        nextActiveId &&
        normalized.some(
          circle =>
            circle._id ===
            nextActiveId
        )
      ) {
        setActiveId(
          nextActiveId
        );
      } else if (
        normalized.length
      ) {
        setActiveId(
          normalized[0]._id
        );
      }

      const selected =
        normalized.find(
          circle =>
            circle._id ===
            nextActiveId
        ) ||
        normalized[0];

      if (!selected) {
        setCirclePayouts([]);
        return;
      }

      setRecipientCount(
        selected.recipientCount ===
          1
          ? 1
          : 2
      );

      /*
       * Always reload actual payout records for the selected circle.
       */
      await loadCirclePayouts(
        selected._id
      );

      if (
        selected.draw?.payout
      ) {
        setDrawPayout(
          selected.draw.payout
        );
      }

      if (
        selected.draw
          ?.status ===
        "completed"
      ) {
        setDrawStatus(
          "completed"
        );
      } else if (
        selected.draw
          ?.status ===
        "rolling"
      ) {
        setDrawStatus(
          "rolling"
        );
      } else if (
        selected.draw
          ?.status ===
          "idle" &&
        !drawRolling
      ) {
        setDrawStatus(
          "idle"
        );

        setDrawRecipients(
          []
        );

        setDrawPayout(
          null
        );
      }
    } catch (e: any) {
      setErr(
        e.message ||
          "Unable to load circles"
      );
    }
  };

  useEffect(() => {
    load();
  }, [
    token,
    refreshKey
  ]);

  const active =
    circles.find(
      circle =>
        circle._id ===
        activeId
    );

  /*
   * IMPORTANT:
   *
   * This is only the member-selection lock state.
   *
   * The backend still remains authoritative about whether a member
   * actually paid this month.
   */
  const eligible =
    active
      ? active.members.filter(
          member =>
            !member.drawExcluded &&
            !member.disbursed
        )
      : [];

  /*
   * Members selected during this cycle.
   *
   * These are NOT automatically displayed as "Disbursed/Collected".
   * Their actual status comes from the matching Payout record.
   */
  const selectedMembers =
    active
      ? active.members.filter(
          member =>
            member.disbursed
        )
      : [];

  const payoutByUserId =
    new Map(
      circlePayouts.map(
        payout => [
          getPayoutUserId(
            payout
          ),

          payout
        ]
      )
    );

  const selectedMemberCards =
    selectedMembers.map(
      member => {
        const user =
          typeof member.user ===
          "object"
            ? member.user
            : null;

        const userId =
          user?._id ||
          (typeof member.user ===
          "string"
            ? member.user
            : "");

        const actualPayout =
          userId
            ? payoutByUserId.get(
                userId
              )
            : undefined;

        return {
          userId,

          firstName:
            user?.firstName ||
            "",

          lastName:
            user?.lastName ||
            "",

          username:
            user?.username ||
            "",

          numericId:
            member.numericId,

          payout:
            actualPayout || null,

          status:
            getPayoutDisplayStatus(
              actualPayout
            )
        };
      }
    );

  const paidSelectedCount =
    circlePayouts.filter(
      payout =>
        payout.status ===
        "paid"
    ).length;

  const pendingSelectedCount =
    circlePayouts.filter(
      payout =>
        payout.status ===
        "pending"
    ).length;

  const reversedSelectedCount =
    circlePayouts.filter(
      payout =>
        payout.status ===
        "reversed"
    ).length;

  const beginCountdown =
    (
      startedAt: string,
      durationMs: number
    ) => {
      if (
        countdownTimerRef.current !==
        null
      ) {
        window.clearInterval(
          countdownTimerRef.current
        );
      }

      const update =
        () => {
          const remaining =
            getRemainingRollingMs(
              startedAt,
              durationMs
            );

          setDrawCountdown(
            Math.ceil(
              remaining /
                1000
            )
          );

          if (
            remaining <=
            0
          ) {
            if (
              countdownTimerRef.current !==
              null
            ) {
              window.clearInterval(
                countdownTimerRef.current
              );

              countdownTimerRef.current =
                null;
            }

            setDrawCountdown(
              0
            );
          }
        };

      update();

      countdownTimerRef.current =
        window.setInterval(
          update,
          100
        );
    };

  const pollDrawStatus =
    async (
      circleId: string
    ) => {
      try {
        const data: DrawStatusResponse =
          await api(
            `/api/admin/circles/${circleId}/draw-status`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        setDrawStatus(
          data.draw.status
        );

        if (
          data.paidMemberCount !==
          undefined
        ) {
          setPaidMemberCount(
            data.paidMemberCount
          );
        }

        if (
          data.draw
            .recipientCount
        ) {
          setRecipientCount(
            data.draw
              .recipientCount ===
              1
              ? 1
              : 2
          );
        }

        if (
          data.payout
        ) {
          setDrawPayout(
            data.payout
          );
        }

        if (
          data.draw.status ===
          "rolling"
        ) {
          setDrawRolling(
            true
          );

          if (
            data.draw.startedAt
          ) {
            beginCountdown(
              data.draw
                .startedAt,
              data.draw
                .durationMs
            );
          }

          pollTimerRef.current =
            window.setTimeout(
              () =>
                pollDrawStatus(
                  circleId
                ),
              DRAW_POLL_INTERVAL_MS
            );

          return;
        }

        if (
          data.draw.status ===
          "completed"
        ) {
          clearTimers();

          setDrawRolling(
            false
          );

          setDrawCountdown(
            0
          );

          setDrawRecipients(
            data.recipients ||
              []
          );

          setDrawPayout(
            data.payout ||
              null
          );

          /*
           * Reload the actual Payout records immediately after
           * completion so the UI can correctly show:
           *
           * Selected - Payment Pending
           * Disbursed/Collected
           * Payment Reversed
           */
          await loadCirclePayouts(
            circleId
          );

          setMsg(
            data.cycleCompleted
              ? "The draw is complete. The selected recipient(s) have been recorded. Their payout status is shown separately from selection."
              : `The draw is complete. ${data.recipients?.length || recipientCount} recipient${
                  (data.recipients?.length ||
                    recipientCount) ===
                  1
                    ? ""
                    : "s"
                } were randomly selected.`
          );

          await load(
            circleId
          );

          return;
        }

        setDrawRolling(
          false
        );

        setDrawRecipients(
          []
        );

        setDrawCountdown(
          0
        );
      } catch (e: any) {
        clearTimers();

        setDrawRolling(
          false
        );

        setErr(
          e.message ||
            "Unable to read draw status"
        );
      }
    };

  const trigger =
    async () => {
      if (!active) {
        return;
      }

      /*
       * The frontend can only determine the selection state locally.
       *
       * Actual payment eligibility is still validated by the backend
       * against the current month's confirmed ledger records.
       */
      if (
        eligible.length <
        recipientCount
      ) {
        setErr(
          `At least ${recipientCount} unselected member${
            recipientCount ===
            1
              ? ""
              : "s"
          } are required for this draw. The backend will also verify that the selected members have actually paid this month.`
        );

        return;
      }

      if (
        active.completed ||
        !active.active
      ) {
        setErr(
          "This circle is no longer active."
        );

        return;
      }

      clearTimers();

      setBusy(true);

      setErr("");
      setMsg("");

      setDrawRecipients(
        []
      );

      setDrawPayout(
        null
      );

      setDrawCountdown(
        0
      );

      try {
        const data =
          await api(
            `/api/admin/circles/${active._id}/random-disbursal`,
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
                  recipientCount
                })
            }
          );

        setDrawRolling(
          true
        );

        setDrawStatus(
          data.draw.status
        );

        if (
          data.paidMemberCount !==
          undefined
        ) {
          setPaidMemberCount(
            data.paidMemberCount
          );
        }

        if (
          data.draw
            .recipientCount
        ) {
          setRecipientCount(
            data.draw
              .recipientCount ===
              1
              ? 1
              : 2
          );
        }

        if (
          data.payout
        ) {
          setDrawPayout(
            data.payout
          );
        }

        if (
          data.draw
            .startedAt
        ) {
          beginCountdown(
            data.draw
              .startedAt,
            data.draw
              .durationMs
          );
        }

        /*
         * The POST deliberately does not reveal the selected users.
         * draw-status reveals them after the rolling period.
         */
        pollDrawStatus(
          active._id
        );
      } catch (e: any) {
        setDrawRolling(
          false
        );

        setErr(
          e.message ||
            "Random selection could not be started."
        );
      } finally {
        setBusy(
          false
        );
      }
    };

  /*
   * If the admin refreshes the page while another draw is already
   * rolling, reconnect to that existing draw.
   */
  useEffect(() => {
    if (!active) {
      return;
    }

    if (
      active.draw?.status ===
      "rolling"
    ) {
      setDrawRolling(
        true
      );

      setDrawStatus(
        "rolling"
      );

      if (
        active.draw
          .recipientCount
      ) {
        setRecipientCount(
          active.draw
            .recipientCount ===
            1
            ? 1
            : 2
        );
      }

      const startedAt =
        active.draw
          .startedAt;

      if (
        startedAt
      ) {
        const elapsed =
          Date.now() -
          new Date(
            startedAt
          ).getTime();

        const remaining =
          Math.max(
            0,
            5000 -
              elapsed
          );

        setDrawCountdown(
          Math.ceil(
            remaining /
              1000
          )
        );
      }

      pollDrawStatus(
        active._id
      );
    }
  }, [
    active?._id
  ]);

  const startNewCycle =
    async () => {
      setErr("");
      setMsg("");

      try {
        const readyMembers =
          await api(
            "/api/admin/unlocked-members",
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        const baselineSize =
          Array.isArray(
            readyMembers
          )
            ? readyMembers.length
            : 0;

        if (
          baselineSize <
          2
        ) {
          setErr(
            "At least two members must be ready for slot assignment before a new circle can be started."
          );

          return;
        }

        const data =
          await api(
            "/api/admin/circles/start-new-cycle",
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
                  baselineSize,
                  recipientCount
                })
            }
          );

        setMsg(
          data.message
        );

        setDrawStatus(
          "idle"
        );

        setDrawRecipients(
          []
        );

        setDrawPayout(
          null
        );

        setDrawRolling(
          false
        );

        setCirclePayouts(
          []
        );

        clearTimers();

        await load(
          data.circle?._id
        );
      } catch (e: any) {
        setErr(
          e.message ||
            "Unable to start a new cycle"
        );
      }
    };

  return (
    <div>
      <PageHeader
        title="Ajo Monthly Recipient Draw"
        subtitle="Securely select 1 or 2 eligible paid members from the current circle. Slot numbers never determine who wins."
      />

      {err && (
        <Banner
          tone="error"
          message={err}
        />
      )}

      {msg &&
        !drawRolling && (
          <Banner
            tone="success"
            message={msg}
          />
        )}

      <div className="flex flex-wrap gap-2 mb-4">
        {circles.map(
          circle => (
            <button
              key={
                circle._id
              }
              onClick={() => {
                clearTimers();

                setActiveId(
                  circle._id
                );

                setDrawRecipients(
                  []
                );

                setDrawPayout(
                  circle.draw
                    ?.payout ||
                    null
                );

                setDrawRolling(
                  circle.draw
                    ?.status ===
                    "rolling"
                );

                setDrawCountdown(
                  0
                );

                setRecipientCount(
                  circle.recipientCount ===
                    1
                    ? 1
                    : 2
                );

                if (
                  circle.draw
                    ?.status ===
                  "rolling"
                ) {
                  setDrawStatus(
                    "rolling"
                  );
                } else {
                  setDrawStatus(
                    circle.draw
                      ?.status ||
                      "idle"
                  );
                }

                /*
                 * Load actual payout states for the newly selected
                 * circle.
                 */
                loadCirclePayouts(
                  circle._id
                ).catch(
                  (error: any) =>
                    setErr(
                      error.message ||
                        "Unable to load payout records"
                    )
                );
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                circle._id ===
                activeId
                  ? "bg-blue-800 text-white border-blue-800"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300"
              }`}
            >
              {circle.name} · Cycle{" "}
              {circle.cycleNumber}

              {circle.completed
                ? " (Completed)"
                : ""}
            </button>
          )
        )}

        {circles.length ===
          0 && (
          <p className="text-slate-500 dark:text-slate-400">
            No circles yet.
          </p>
        )}
      </div>

      {active && (
        <div className="border-2 border-red-600 rounded-2xl p-5 bg-white dark:bg-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {active.name}
              </h2>

              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Cycle{" "}
                {active.cycleNumber}
                {" · "}
                {active.members.length}
                /
                {active.baselineSize}
                {" members assigned"}
              </p>

              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Monthly recipients:
                {" "}
                {active.recipientCount}
              </p>
            </div>

            <div className="text-sm text-slate-500 dark:text-slate-400 sm:text-right">
              Members not yet selected:{" "}
              <b className="text-slate-900 dark:text-white">
                {eligible.length}
              </b>
              {" / "}
              {active.members.length}

              <br />

              {selectedMembers.length} selected
              this cycle

              {paidSelectedCount >
                0 && (
                <>
                  <br />
                  <span className="text-green-600 dark:text-green-400">
                    {paidSelectedCount} payout
                    {paidSelectedCount ===
                    1
                      ? ""
                      : "s"} confirmed
                    paid
                  </span>
                </>
              )}

              {pendingSelectedCount >
                0 && (
                <>
                  <br />
                  <span className="text-amber-600 dark:text-amber-400">
                    {pendingSelectedCount} payout
                    {pendingSelectedCount ===
                    1
                      ? ""
                      : "s"} payment pending
                  </span>
                </>
              )}

              {reversedSelectedCount >
                0 && (
                <>
                  <br />
                  <span className="text-red-600 dark:text-red-400">
                    {reversedSelectedCount} payout
                    {reversedSelectedCount ===
                    1
                      ? ""
                      : "s"} reversed
                  </span>
                </>
              )}

              {paidMemberCount >
                0 && (
                <>
                  <br />
                  <span className="text-blue-600 dark:text-blue-400">
                    {paidMemberCount} paid
                    this month
                  </span>
                </>
              )}
            </div>
          </div>

          {/* =====================================================
              DRAW SETTINGS
              ===================================================== */}
          {!drawRolling && (
            <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    Monthly draw settings
                  </p>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    The monthly savings pot comes
                    from members whose contribution
                    was actually confirmed this month.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Recipients
                  </label>

                  <select
                    value={
                      recipientCount
                    }
                    onChange={e =>
                      setRecipientCount(
                        Number(
                          e.target.value
                        ) ===
                          1
                          ? 1
                          : 2
                      )
                    }
                    disabled={
                      busy ||
                      drawRolling
                    }
                    className="border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 font-semibold"
                  >
                    <option value="1">
                      1 recipient
                    </option>

                    <option value="2">
                      2 recipients
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <div className="bg-white dark:bg-slate-900 rounded-xl p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Circle size
                  </p>

                  <p className="text-lg font-black text-slate-900 dark:text-white mt-1">
                    {
                      active.baselineSize
                    }
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Recipient maintenance fee
                  </p>

                  <p className="text-lg font-black text-red-600 dark:text-red-400 mt-1">
                    {formatNaira(
                      500 *
                        Math.max(
                          3,
                          Math.ceil(active.baselineSize / 2)
                        ) *
                        2
                    )}
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Draw pool
                  </p>

                  <p className="text-lg font-black text-slate-900 dark:text-white mt-1">
                    {eligible.length}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================
              ACTIVE ROLL
              ===================================================== */}
          {drawRolling && (
            <div className="mt-6 rounded-2xl border-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
              <RollingDice />

              <div className="pb-6 text-center">
                <div className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 shadow-sm">
                  <Clock3 size={15} />

                  {drawCountdown >
                  0
                    ? `Revealing result in ${drawCountdown}s`
                    : "Revealing result..."}
                </div>
              </div>
            </div>
          )}

          {/* =====================================================
              COMPLETED DRAW RESULT
              ===================================================== */}
          {!drawRolling &&
            drawStatus ===
              "completed" &&
            drawRecipients.length >
              0 && (
              <div className="mt-6">
                <div className="rounded-2xl bg-green-600 text-white p-5 mb-4">
                  <div className="flex items-center gap-3">
                    <Trophy
                      size={28}
                    />

                    <div>
                      <h2 className="font-black text-xl">
                        Draw Complete
                      </h2>

                      <p className="text-green-100 text-sm mt-1">
                        {drawRecipients.length} recipient
                        {drawRecipients.length ===
                        1
                          ? ""
                          : "s"} were selected
                        for this month's
                        lump-sum payout.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {drawRecipients.map(
                    recipient => (
                      <RecipientCard
                        key={
                          recipient.userId
                        }
                        recipient={
                          recipient
                        }
                        payout={
                          drawPayout
                        }
                        actualPayout={circlePayouts.find(
                          payout =>
                            getPayoutUserId(
                              payout
                            ) ===
                            recipient.userId
                        )}
                      />
                    )
                  )}
                </div>

                <PayoutSummaryCard
                  payout={
                    drawPayout
                  }
                />
              </div>
            )}

          {/* =====================================================
              NORMAL IDLE DRAW PANEL
              ===================================================== */}
          {!drawRolling &&
            !(
              drawStatus ===
                "completed" &&
              drawRecipients.length >
                0
            ) && (
              <div className="mt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Ready for the monthly
                      random selection
                    </p>

                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xl">
                      The backend selects{" "}
                      {recipientCount} paid,
                      still-eligible member
                      {recipientCount ===
                      1
                        ? ""
                        : "s"} securely at
                      random. Slot numbers are
                      never used as random input.
                    </p>
                  </div>

                  <button
                    disabled={
                      busy ||
                      eligible.length <
                        recipientCount ||
                      active.completed ||
                      !active.active
                    }
                    onClick={
                      trigger
                    }
                    className="inline-flex items-center justify-center gap-2 bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white px-5 py-3 rounded-lg font-semibold"
                  >
                    <Shuffle
                      size={18}
                    />

                    {busy
                      ? "Starting draw..."
                      : "Trigger Random Selection Roll"}
                  </button>
                </div>

                {eligible.length <
                  recipientCount && (
                  <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4 text-sm text-amber-700 dark:text-amber-300">
                    There are currently{" "}
                    {eligible.length} unselected
                    member
                    {eligible.length ===
                    1
                      ? ""
                      : "s"} in the circle.
                    However, the monthly draw
                    requires{" "}
                    {recipientCount} eligible
                    member
                    {recipientCount ===
                    1
                      ? ""
                      : "s"} that have actually
                    paid this month.
                  </div>
                )}
              </div>
            )}

          {/* =====================================================
              EXISTING SELECTED MEMBERS
              ===================================================== */}
          {selectedMemberCards.length >
            0 && (
            <div className="mt-7">
              <h3 className="font-black text-slate-900 dark:text-white mb-3">
                Members already selected
                this cycle
              </h3>

              <div className="grid sm:grid-cols-2 gap-3">
                {selectedMemberCards.map(
                  recipient => (
                    <div
                      key={`${recipient.userId}-${recipient.numericId}`}
                      className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-xl p-4"
                    >
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">
                        Lump-Sum Recipient · Slot #
                        {
                          recipient.numericId
                        }
                      </p>

                      <b className="block text-lg text-slate-900 dark:text-slate-100 mt-1">
                        {
                          recipient.firstName
                        }{" "}
                        {
                          recipient.lastName
                        }
                      </b>

                      <p
                        className={`font-semibold text-sm mt-1 ${getPayoutStatusClass(
                          recipient.payout
                        )}`}
                      >
                        Status:{" "}
                        {
                          recipient.status
                        }
                      </p>

                      {recipient.payout
                        ?.status ===
                        "paid" && (
                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                          {recipient.payout
                            .paidAt && (
                            <p>
                              Paid:{" "}
                              {new Date(
                                recipient
                                  .payout
                                  .paidAt
                              ).toLocaleString()}
                            </p>
                          )}

                          {recipient.payout
                            .paymentReference && (
                            <p>
                              Reference:{" "}
                              {
                                recipient
                                  .payout
                                  .paymentReference
                              }
                            </p>
                          )}
                        </div>
                      )}

                      {recipient.payout
                        ?.status ===
                        "pending" && (
                        <p className="text-xs text-amber-600 dark:text-amber-300 mt-2">
                          Selection is complete, but
                          the money transfer has not
                          yet been confirmed.
                        </p>
                      )}

                      {recipient.payout
                        ?.status ===
                        "reversed" && (
                        <p className="text-xs text-red-600 dark:text-red-300 mt-2">
                          This payout was reversed.
                          {recipient.payout
                            .reversalReason
                            ? ` ${recipient.payout.reversalReason}`
                            : ""}
                        </p>
                      )}

                      {!recipient.payout && (
                        <p className="text-xs text-amber-600 dark:text-amber-300 mt-2">
                          Selected and locked for this
                          cycle. Payout record is still
                          being created.
                        </p>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* =====================================================
              START NEW CYCLE
              ===================================================== */}
          <div className="mt-7 pt-5 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Need to create another circle?
                </p>

                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  A new circle uses the number of
                  members currently ready for slot
                  assignment. The circle can therefore
                  contain 4, 5, 20, 25 or another
                  appropriate number of members.
                </p>
              </div>

              <button
                disabled={
                  drawRolling
                }
                onClick={
                  startNewCycle
                }
                className="inline-flex items-center gap-2 border border-slate-300 dark:border-slate-600 px-5 py-3 rounded-lg font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <RotateCcw
                  size={18}
                />

                Start new cycle
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes diceRoll {
          0% {
            transform: rotate(0deg) translateY(0) scale(1);
          }

          20% {
            transform: rotate(72deg) translateY(-8px) scale(1.05);
          }

          40% {
            transform: rotate(144deg) translateY(0) scale(0.98);
          }

          60% {
            transform: rotate(216deg) translateY(-8px) scale(1.05);
          }

          80% {
            transform: rotate(288deg) translateY(0) scale(0.98);
          }

          100% {
            transform: rotate(360deg) translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}