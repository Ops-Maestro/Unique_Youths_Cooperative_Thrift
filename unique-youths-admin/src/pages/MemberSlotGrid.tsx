import {
  useEffect,
  useState
} from "react";
import {
  Lock,
  RotateCcw,
  Trash2,
  X
} from "lucide-react";
import { api } from "../lib/api";
import {
  PageHeader,
  Banner
} from "../components/ui";

type UnlockedMember = {
  _id: string;
  firstName: string;
  lastName: string;
  username: string;
};

type Member = {
  user:
    | {
        _id: string;
        firstName: string;
        lastName: string;
      }
    | string;
  numericId: number;
  disbursed: boolean;
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
};

export default function MemberSlotGrid({
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
    activeId,
    setActiveId
  ] = useState("");

  const [
    unlocked,
    setUnlocked
  ] = useState<
    UnlockedMember[]
  >([]);

  const [
    selectedMember,
    setSelectedMember
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
    startingCycle,
    setStartingCycle
  ] = useState(false);

  const load = async () => {
    try {
      setErr("");

      const [
        circleData,
        unlockedData
      ] =
        await Promise.all([
          api(
            "/api/admin/circles",
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          ),

          api(
            "/api/admin/unlocked-members",
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          )
        ]);

      const normalizedCircles =
        circleData.map(
          (circle: Circle) => ({
            ...circle,
            recipientCount:
              circle.recipientCount ===
              1
                ? 1
                : 2
          })
        );

      setCircles(
        normalizedCircles
      );

      setUnlocked(
        unlockedData
      );

      if (
        !activeId &&
        normalizedCircles.length
      ) {
        const open =
          normalizedCircles.find(
            (c: Circle) =>
              !c.completed
          ) ||
          normalizedCircles[0];

        setActiveId(
          open._id
        );
      }
    } catch (e: any) {
      setErr(
        e.message
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
      c =>
        c._id === activeId
    );

  const startNewCycle =
    async () => {
      setErr("");
      setMsg("");

      if (
        unlocked.length <
        2
      ) {
        setErr(
          "At least two members must be ready for slot assignment before a new circle can be started."
        );
        return;
      }

      const proposedSize =
        unlocked.length;

      setStartingCycle(
        true
      );

      try {
        const data =
          await api(
            "/api/admin/circles/start-new-cycle",
            {
              method: "POST",
              headers: {
                Authorization:
                  `Bearer ${token}`,
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify({
                  baselineSize:
                    proposedSize
                })
            }
          );

        setMsg(
          data.message
        );

        setActiveId(
          data.circle?._id ||
            ""
        );

        await load();
      } catch (e: any) {
        setErr(
          e.message
        );
      } finally {
        setStartingCycle(
          false
        );
      }
    };

  const assign = async (
    numericId: number
  ) => {
    if (
      !active ||
      !selectedMember
    ) {
      setErr(
        "Select an unlocked member first."
      );
      return;
    }

    setErr("");
    setMsg("");

    try {
      await api(
        `/api/admin/circles/${active._id}/assign-slot`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${token}`,
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              userId:
                selectedMember,
              numericId
            })
        }
      );

      setMsg(
        `Slot ${numericId} assigned.`
      );

      setSelectedMember(
        ""
      );

      await load();
    } catch (e: any) {
      setErr(
        e.message
      );
    }
  };

  const removeSlot =
    async (
      numericId: number
    ) => {
      if (!active)
        return;

      if (
        !window.confirm(
          `Clear slot ${numericId}? The member will go back to "awaiting slot assignment".`
        )
      ) {
        return;
      }

      setErr("");
      setMsg("");

      try {
        await api(
          `/api/admin/circles/${active._id}/members/${numericId}`,
          {
            method:
              "DELETE",
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

        setMsg(
          `Slot ${numericId} cleared.`
        );

        await load();
      } catch (e: any) {
        setErr(
          e.message
        );
      }
    };

  const deleteCircle =
    async () => {
      if (!active)
        return;

      const warning =
        active.completed
          ? `Delete "${active.name}" (Cycle ${active.cycleNumber})? It's fully complete — this just clears it out so you can start a fresh one.`
          : `Delete "${active.name}" (Cycle ${active.cycleNumber})? This removes the whole circle and its member roster. Payment history is kept.`;

      if (
        !window.confirm(
          warning
        )
      ) {
        return;
      }

      setErr("");
      setMsg("");

      try {
        await api(
          `/api/admin/circles/${active._id}`,
          {
            method:
              "DELETE",
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

        setMsg(
          "Circle deleted."
        );

        setActiveId(
          ""
        );

        await load();
      } catch (e: any) {
        setErr(
          e.message
        );
      }
    };

  const availableForNewCircle =
    unlocked.length;

  return (
    <div>
      <PageHeader
        title="Member Slot Grid"
        subtitle={
          active
            ? `${active.name} — each member selects and locks a unique number from 1 to ${active.baselineSize}.`
            : "Select a circle."
        }
      />

      {err && (
        <Banner
          tone="error"
          message={err}
        />
      )}

      {msg && (
        <Banner
          tone="success"
          message={msg}
        />
      )}

      <div className="flex flex-wrap gap-2 mb-5 items-center">
        {circles.map(
          c => (
            <button
              key={c._id}
              onClick={() =>
                setActiveId(
                  c._id
                )
              }
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                c._id ===
                activeId
                  ? "bg-blue-800 text-white border-blue-800"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
            >
              {c.name} · Cycle{" "}
              {c.cycleNumber}
            </button>
          )
        )}

        {circles.length ===
          0 && (
          <p className="text-slate-500 dark:text-slate-400">
            No circles yet.
          </p>
        )}

        <button
          onClick={
            startNewCycle
          }
          disabled={
            startingCycle ||
            availableForNewCircle <
              2
          }
          className="inline-flex items-center gap-2 border border-slate-300 dark:border-slate-600 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <RotateCcw
            size={16}
          />

          {circles.length ===
          0
            ? "Start first cycle"
            : "Start new cycle"}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
              Assign slot to
            </p>

            {!active &&
              unlocked.length >
                0 && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {unlocked.length} member
                  {unlocked.length ===
                  1
                    ? ""
                    : "s"} ready. A new
                  circle will open with
                  exactly that many slots.
                </p>
              )}
          </div>

          {active && (
            <button
              onClick={
                deleteCircle
              }
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              <Trash2
                size={13}
              />

              {active.completed
                ? "Delete this completed circle"
                : "Delete this circle"}
            </button>
          )}
        </div>

        <select
          className="w-full sm:w-96 border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3"
          value={
            selectedMember
          }
          onChange={e =>
            setSelectedMember(
              e.target.value
            )
          }
        >
          <option value="">
            Select an unlocked member
          </option>

          {unlocked.map(
            u => (
              <option
                key={u._id}
                value={u._id}
              >
                {u.firstName}{" "}
                {u.lastName} (@
                {u.username})
              </option>
            )
          )}
        </select>

        {unlocked.length ===
          0 && (
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-2">
            No members are currently
            unlocked. Verify a guarantor
            first.
          </p>
        )}

        {active && (
          <>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Circle capacity:{" "}
                <b className="text-slate-900 dark:text-white">
                  {active.baselineSize}
                </b>
              </span>

              <span>
                Assigned:{" "}
                <b className="text-slate-900 dark:text-white">
                  {active.members.length}
                </b>
              </span>

              <span>
                Monthly recipients:{" "}
                <b className="text-slate-900 dark:text-white">
                  {active.recipientCount}
                </b>
              </span>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 mt-5">
              {Array.from(
                {
                  length:
                    active.baselineSize
                },
                (_, i) => {
                  const position =
                    i + 1;

                  const member =
                    active.members.find(
                      m =>
                        m.numericId ===
                        position
                    );

                  if (
                    !member
                  ) {
                    return (
                      <button
                        key={
                          position
                        }
                        onClick={() =>
                          assign(
                            position
                          )
                        }
                        className="rounded p-3 text-center font-bold border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-blue-400 hover:text-blue-600"
                      >
                        {
                          position
                        }

                        <div className="text-[10px] font-normal">
                          Open
                        </div>
                      </button>
                    );
                  }

                  const className =
                    member.disbursed
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-800 text-white";

                  return (
                    <div
                      key={
                        position
                      }
                      className={`relative group rounded p-3 text-center font-bold flex flex-col items-center gap-1 ${className}`}
                    >
                      <Lock
                        size={12}
                      />

                      {
                        position
                      }

                      <button
                        onClick={() =>
                          removeSlot(
                            position
                          )
                        }
                        title={`Clear slot ${position}`}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center opacity-70 group-hover:opacity-100 transition"
                      >
                        <X
                          size={
                            11
                          }
                        />
                      </button>
                    </div>
                  );
                }
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-800 inline-block" />
            Locked &amp; eligible
          </span>

          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-100 inline-block" />
            Disbursed / Collected
          </span>

          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded border-2 border-dashed border-slate-300 dark:border-slate-600 inline-block" />
            Open slot
          </span>
        </div>
      </div>
    </div>
  );
}