import { useEffect, useRef, useState } from "react";
import {
  Shuffle,
  RotateCcw,
  Dices,
  Trophy,
  Clock3
} from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner } from "../components/ui";

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
  drawExcluded: boolean;
  disbursed: boolean;
  disbursedAt?: string;
};

type Circle = {
  _id: string;
  name: string;
  cycleNumber: number;
  baselineSize: number;
  completed: boolean;
  active: boolean;
  members: Member[];
  draw?: {
    status: "idle" | "rolling" | "completed";
    startedAt?: string | null;
    completedAt?: string | null;
    selectedMembers?: string[];
  };
};

type DrawRecipient = {
  userId: string;
  firstName: string;
  lastName: string;
  username?: string;
  numericId: number | null;
  status: string;
};

type DrawStatusResponse = {
  draw: {
    status: "idle" | "rolling" | "completed";
    startedAt?: string | null;
    completedAt?: string | null;
    durationMs: number;
  };
  recipients: DrawRecipient[];
  cycleCompleted: boolean;
  eligibleCount: number;
};

const DRAW_POLL_INTERVAL_MS = 500;
const DRAW_ANIMATION_CYCLE_MS = 700;

function getRemainingRollingMs(
  startedAt?: string | null,
  durationMs = 5000
) {
  if (!startedAt) return durationMs;

  const elapsed =
    Date.now() - new Date(startedAt).getTime();

  return Math.max(
    0,
    durationMs - elapsed
  );
}

function getAnimationDelay(
  startedAt?: string | null
) {
  if (!startedAt) return "0s";

  const elapsed =
    Math.max(
      0,
      Date.now() -
        new Date(startedAt).getTime()
    );

  const offset =
    elapsed %
    DRAW_ANIMATION_CYCLE_MS;

  return `-${offset}ms`;
}

function RollingDice({
  startedAt
}: {
  startedAt?: string | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-32 h-32 rounded-full bg-red-100 dark:bg-red-950/40 animate-ping opacity-40" />

        <div
          className="relative w-28 h-28 rounded-3xl bg-red-600 text-white shadow-xl flex items-center justify-center animate-[diceRoll_0.7s_ease-in-out_infinite]"
          style={{
            animationDelay:
              getAnimationDelay(
                startedAt
              )
          }}
        >
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
        Selecting two eligible members from the circle.
        Their assigned slot numbers are not used to determine
        the random result.
      </p>
    </div>
  );
}

function RecipientCard({
  recipient
}: {
  recipient: DrawRecipient;
}) {
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
            #{recipient.numericId ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold text-sm">
        <Trophy size={16} />
        Selected for this month's ₦100,000 lump-sum
      </div>
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
  const [circles, setCircles] =
    useState<Circle[]>([]);

  const [activeId, setActiveId] =
    useState("");

  const [msg, setMsg] =
    useState("");

  const [err, setErr] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [drawRolling, setDrawRolling] =
    useState(false);

  const [drawStatus, setDrawStatus] =
    useState<
      "idle" | "rolling" | "completed"
    >("idle");

  const [drawRecipients, setDrawRecipients] =
    useState<DrawRecipient[]>([]);

  const [drawCountdown, setDrawCountdown] =
    useState(0);

  const [drawStartedAt, setDrawStartedAt] =
    useState<string | null>(null);

  const [newCycleSize, setNewCycleSize] =
    useState("4");

  const pollTimerRef =
    useRef<number | null>(null);

  const countdownTimerRef =
    useRef<number | null>(null);

  const activeIdRef =
    useRef(activeId);

  useEffect(() => {
    activeIdRef.current =
      activeId;
  }, [activeId]);

  const clearTimers = () => {
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
        data.map(circle => ({
          ...circle,
          draw: {
            status:
              circle.draw?.status ||
              "idle",
            startedAt:
              circle.draw?.startedAt ||
              null,
            completedAt:
              circle.draw?.completedAt ||
              null,
            selectedMembers:
              circle.draw?.selectedMembers ||
              []
          }
        }));

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

      if (
        normalized.length
      ) {
        const selected =
          normalized.find(
            circle =>
              circle._id ===
              nextActiveId
          ) ||
          normalized[0];

        setNewCycleSize(
          String(
            selected.baselineSize
          )
        );

        if (
          selected.draw?.status ===
          "rolling"
        ) {
          setDrawRolling(
            true
          );

          setDrawStatus(
            "rolling"
          );

          setDrawStartedAt(
            selected.draw.startedAt ||
            null
          );

          if (
            selected.draw.startedAt
          ) {
            beginCountdown(
              selected.draw.startedAt,
              5000
            );
          }
        } else if (
          selected.draw?.status ===
          "completed"
        ) {
          setDrawStatus(
            "completed"
          );

          setDrawRolling(
            false
          );

          setDrawStartedAt(
            null
          );
        } else if (
          selected.draw?.status ===
          "idle" &&
          !drawRolling
        ) {
          setDrawStatus(
            "idle"
          );

          setDrawRecipients([]);

          setDrawStartedAt(
            null
          );
        }
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

  const eligible =
    active
      ? active.members.filter(
          member =>
            !member.drawExcluded &&
            !member.disbursed
        )
      : [];

  const recipients =
    active
      ? active.members.filter(
          member =>
            member.disbursed
        )
      : [];

  const recipientNamesFromMembers =
    recipients.map(
      member => {
        const user =
          typeof member.user ===
          "object"
            ? member.user
            : null;

        return {
          userId:
            user?._id || "",
          firstName:
            user?.firstName || "",
          lastName:
            user?.lastName || "",
          username:
            user?.username || "",
          numericId:
            member.numericId,
          status:
            "Disbursed/Collected"
        };
      }
    );

  const beginCountdown = (
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

    const update = () => {
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
        remaining <= 0
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
        const data:
          DrawStatusResponse =
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
          data.draw.status ===
          "rolling"
        ) {
          setDrawRolling(
            true
          );

          setDrawStartedAt(
            data.draw.startedAt ||
            null
          );

          if (
            data.draw.startedAt
          ) {
            beginCountdown(
              data.draw.startedAt,
              data.draw.durationMs
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

          setDrawStartedAt(
            null
          );

          setDrawCountdown(
            0
          );

          setDrawRecipients(
            data.recipients ||
              []
          );

          setMsg(
            data.cycleCompleted
              ? "The draw is complete. Two members were selected, and this circle has now completed its payout cycle."
              : "The draw is complete. Two members were randomly selected for this month's lump-sum."
          );

          await load(
            circleId
          );

          return;
        }

        setDrawRolling(
          false
        );

        setDrawStartedAt(
          null
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

  const trigger = async () => {
    if (!active) return;

    if (
      eligible.length < 2
    ) {
      setErr(
        "At least two eligible members are required for a random draw."
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

    setBusy(
      true
    );

    setErr("");
    setMsg("");
    setDrawRecipients([]);
    setDrawCountdown(0);

    try {
      const data =
        await api(
          `/api/admin/circles/${active._id}/random-disbursal`,
          {
            method:
              "POST",
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      setDrawRolling(
        true
      );

      setDrawStatus(
        data.draw.status
      );

      setDrawStartedAt(
        data.draw.startedAt ||
        null
      );

      if (
        data.draw.startedAt
      ) {
        beginCountdown(
          data.draw.startedAt,
          data.draw.durationMs
        );
      }

      pollDrawStatus(
        active._id
      );
    } catch (e: any) {
      setDrawRolling(
        false
      );

      setDrawStartedAt(
        null
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

  useEffect(() => {
    if (!active) return;

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

      setDrawStartedAt(
        active.draw.startedAt ||
        null
      );

      if (
        active.draw.startedAt
      ) {
        beginCountdown(
          active.draw.startedAt,
          5000
        );
      }

      clearTimers();

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

      const size =
        Number(
          newCycleSize
        );

      if (
        !Number.isInteger(
          size
        ) ||
        size < 2
      ) {
        setErr(
          "Cycle size must be a whole number of 2 or more."
        );

        return;
      }

      try {
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
                  baselineSize:
                    size
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

        setDrawRolling(
          false
        );

        setDrawStartedAt(
          null
        );

        setDrawCountdown(
          0
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
        subtitle="Cryptographically random selection of exactly two eligible members. Assigned slot numbers never determine who wins."
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

                setDrawRolling(
                  false
                );

                setDrawCountdown(
                  0
                );

                setDrawStartedAt(
                  null
                );

                if (
                  circle.draw
                    ?.status ===
                  "rolling"
                ) {
                  setDrawRolling(
                    true
                  );

                  setDrawStatus(
                    "rolling"
                  );

                  setDrawStartedAt(
                    circle.draw.startedAt ||
                    null
                  );

                  if (
                    circle.draw.startedAt
                  ) {
                    beginCountdown(
                      circle.draw.startedAt,
                      5000
                    );
                  }

                  pollDrawStatus(
                    circle._id
                  );
                } else {
                  setDrawStatus(
                    circle.draw
                      ?.status ||
                      "idle"
                  );
                }
              }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                circle._id ===
                activeId
                  ? "bg-blue-800 text-white border-blue-800"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300"
              }`}
            >
              {circle.name} · Cycle{" "}
              {
                circle.cycleNumber
              }

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
                {
                  active.cycleNumber
                }
                {" · "}
                {
                  active.members
                    .length
                }
                /
                {
                  active.baselineSize
                }
                {" members assigned"}
              </p>
            </div>

            <div className="text-sm text-slate-500 dark:text-slate-400 sm:text-right">
              Eligible for this draw:{" "}
              <b className="text-slate-900 dark:text-white">
                {
                  eligible.length
                }
              </b>
              {" / "}
              {
                active.members
                  .length
              }
              <br />
              {
                recipients.length
              } already
              Disbursed/Collected
            </div>
          </div>

          {drawRolling && (
            <div className="mt-6 rounded-2xl border-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
              <RollingDice
                startedAt={
                  drawStartedAt
                }
              />

              <div className="pb-6 text-center">
                <div className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 shadow-sm">
                  <Clock3
                    size={15}
                  />

                  {drawCountdown >
                  0
                    ? `Revealing result in ${drawCountdown}s`
                    : "Revealing result..."}
                </div>
              </div>
            </div>
          )}

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
                        Two members were
                        selected for this
                        month's lump-sum.
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
                      />
                    )
                  )}
                </div>
              </div>
            )}

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
                      The draw randomly selects
                      two eligible member
                      records. The member's slot
                      number is never used as the
                      random selection input.
                    </p>
                  </div>

                  <button
                    disabled={
                      busy ||
                      eligible.length <
                        2 ||
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
              </div>
            )}

          {recipientNamesFromMembers.length >
            0 && (
            <div className="mt-7">
              <h3 className="font-black text-slate-900 dark:text-white mb-3">
                Members already selected
                this cycle
              </h3>

              <div className="grid sm:grid-cols-2 gap-3">
                {recipientNamesFromMembers.map(
                  recipient => (
                    <div
                      key={`${recipient.userId}-${recipient.numericId}`}
                      className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-xl p-4"
                    >
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">
                        Lump-Sum Recipient ·
                        Slot #
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

                      <p className="text-red-600 font-semibold text-sm mt-1">
                        Status:
                        Disbursed /
                        Collected
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <div className="mt-7 pt-5 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-3">
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

              <label className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                with

                <input
                  type="number"
                  min={2}
                  value={
                    newCycleSize
                  }
                  onChange={e =>
                    setNewCycleSize(
                      e.target.value
                    )
                  }
                  className="w-16 border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-2 text-center"
                />

                slots
              </label>
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