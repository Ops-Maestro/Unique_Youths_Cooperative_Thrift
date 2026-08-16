import { useEffect, useState } from "react";
import {
  Megaphone,
  Trash2,
  Timer,
  PartyPopper,
  Smartphone
} from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner } from "../components/ui";

type Announcement = {
  _id: string;

  type:
    | "payment_received"
    | "payment_missed"
    | "general_update"
    | "party_banner"
    | "app_update";

  description: string;

  venue?: string | null;

  eventDate?: string | null;

  createdAt: string;

  expiresAt?: string | null;

  circle?: {
    name: string;
    cycleNumber: number;
  } | null;

  user?: {
    firstName: string;
    lastName: string;
    username: string;
  } | null;
};

const TYPE_STYLES: Record<
  Announcement["type"],
  string
> = {
  payment_received:
    "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950",

  payment_missed:
    "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950",

  general_update:
    "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950",

  party_banner:
    "text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950",

  app_update:
    "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950"
};

type MemberFeedType =
  | "general_update"
  | "payment_received"
  | "payment_missed";

export default function BroadcastEngine({
  token,
  refreshKey
}: {
  token: string;
  refreshKey?: number;
}) {
  const [
    items,
    setItems
  ] = useState<Announcement[]>([]);

  /*
   * These three types intentionally remain in the same
   * member-feed composer as before.
   */
  const [
    memberFeedType,
    setMemberFeedType
  ] =
    useState<MemberFeedType>(
      "general_update"
    );

  const [
    memberFeedDescription,
    setMemberFeedDescription
  ] = useState("");

  /*
   * Party Banner has its own dedicated composer.
   */
  const [
    partyDescription,
    setPartyDescription
  ] = useState("");

  const [
    venue,
    setVenue
  ] = useState("");

  const [
    eventDate,
    setEventDate
  ] = useState("");

  /*
   * App Update has its own dedicated composer.
   */
  const [
    appUpdateDescription,
    setAppUpdateDescription
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
    deletingId,
    setDeletingId
  ] = useState("");

  const load = async () => {
    try {
      setErr("");

      const data =
        await api(
          "/api/admin/announcements",
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      setItems(data);
    } catch (
      e: any
    ) {
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

  /*
   * ============================================================
   * MEMBER FEED BROADCAST
   *
   * General Update
   * Payment Received
   * Payment Missed
   *
   * These remain exactly part of the normal member feed/ticker
   * broadcast flow.
   * ============================================================
   */
  const sendMemberFeedAnnouncement =
    async () => {
      if (
        !memberFeedDescription.trim()
      ) {
        setErr(
          "Write a message first."
        );

        return;
      }

      setErr("");
      setMsg("");

      try {
        await api(
          "/api/admin/announcements",
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
                type:
                  memberFeedType,

                description:
                  memberFeedDescription
              })
          }
        );

        setMemberFeedDescription("");

        setMsg(
          "Announcement pushed to every member's feed and scrolling ticker."
        );

        await load();
      } catch (
        e: any
      ) {
        setErr(
          e.message
        );
      }
    };

  /*
   * ============================================================
   * PARTY BANNER
   *
   * This is now completely separate from the normal member-feed
   * composer.
   * ============================================================
   */
  const sendPartyBanner =
    async () => {
      if (
        !partyDescription.trim()
      ) {
        setErr(
          "Write the party banner message first."
        );

        return;
      }

      setErr("");
      setMsg("");

      try {
        await api(
          "/api/admin/announcements",
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
                type:
                  "party_banner",

                description:
                  partyDescription,

                ...(venue.trim()
                  ? {
                      venue:
                        venue.trim()
                    }
                  : {}),

                ...(eventDate
                  ? {
                      eventDate
                    }
                  : {})
              })
          }
        );

        setPartyDescription("");
        setVenue("");
        setEventDate("");

        setMsg(
          "Party banner posted. Members will see it in the dedicated party banner area."
        );

        await load();
      } catch (
        e: any
      ) {
        setErr(
          e.message
        );
      }
    };

  /*
   * ============================================================
   * APP UPDATE
   *
   * This is now completely separate from the normal member-feed
   * composer and Party Banner composer.
   * ============================================================
   */
  const sendAppUpdate =
    async () => {
      if (
        !appUpdateDescription.trim()
      ) {
        setErr(
          "Write the app update message first."
        );

        return;
      }

      setErr("");
      setMsg("");

      try {
        await api(
          "/api/admin/announcements",
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
                type:
                  "app_update",

                description:
                  appUpdateDescription
              })
          }
        );

        setAppUpdateDescription("");

        setMsg(
          "App update notification published. Members will see it in the dedicated app-update banner."
        );

        await load();
      } catch (
        e: any
      ) {
        setErr(
          e.message
        );
      }
    };

  const remove =
    async (
      id: string
    ) => {
      setErr("");
      setMsg("");
      setDeletingId(id);

      try {
        await api(
          `/api/admin/announcements/${id}`,
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
          "Announcement deleted."
        );

        await load();
      } catch (
        e: any
      ) {
        setErr(
          e.message
        );
      } finally {
        setDeletingId("");
      }
    };

  return (
    <div className="min-w-0">
      <PageHeader
        title="Broadcast Engine"
        subtitle="Send member-feed announcements, party banners, and app updates from their dedicated publishing areas."
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

      {/* ========================================================
          MEMBER FEED BROADCAST
          ======================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-5 mb-6 min-w-0">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 flex items-center justify-center shrink-0">
            <Megaphone
              size={21}
            />
          </div>

          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              Member Feed Broadcast
            </h2>

            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              General updates, payment received notices,
              and payment missed notices continue to use
              the normal member feed and scrolling ticker.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {(
            [
              "general_update",
              "payment_received",
              "payment_missed"
            ] as const
          ).map(
            type => (
              <button
                key={type}
                type="button"
                onClick={() =>
                  setMemberFeedType(
                    type
                  )
                }
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                  memberFeedType ===
                  type
                    ? "bg-blue-800 text-white border-blue-800"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                {type.replace(
                  "_",
                  " "
                )}
              </button>
            )
          )}
        </div>

        <textarea
          className="w-full min-w-0 max-w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3 min-h-24 resize-y"
          placeholder="Write the announcement members will see..."
          value={
            memberFeedDescription
          }
          onChange={e =>
            setMemberFeedDescription(
              e.target.value
            )
          }
        />

        <button
          type="button"
          onClick={
            sendMemberFeedAnnouncement
          }
          className="mt-3 inline-flex items-center gap-2 bg-red-600 text-white px-5 py-3 rounded-lg font-semibold"
        >
          <Megaphone
            size={18}
          />

          Push to member feed
        </button>

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          These announcements are sent to all members'
          dashboards and remain part of the normal
          scrolling ticker until deleted.
        </p>
      </div>

      {/* ========================================================
          PARTY BANNER
          ======================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-5 mb-6 min-w-0 border border-purple-100 dark:border-purple-900/50">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 flex items-center justify-center shrink-0">
            <PartyPopper
              size={21}
            />
          </div>

          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              Party Banner
            </h2>

            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Dedicated party announcement shown separately
              from the normal member feed and scrolling ticker.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input
            className="w-full min-w-0 border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-2.5 text-sm"
            placeholder="Venue (e.g. Community Hall, Ikeja)"
            value={
              venue
            }
            onChange={e =>
              setVenue(
                e.target.value
              )
            }
          />

          <input
            type="datetime-local"
            className="w-full min-w-0 border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-2.5 text-sm"
            value={
              eventDate
            }
            onChange={e =>
              setEventDate(
                e.target.value
              )
            }
          />
        </div>

        <textarea
          className="w-full min-w-0 max-w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3 min-h-24 resize-y"
          placeholder="e.g. Our quarterly get-together is coming up! Join us to celebrate..."
          value={
            partyDescription
          }
          onChange={e =>
            setPartyDescription(
              e.target.value
            )
          }
        />

        <button
          type="button"
          onClick={
            sendPartyBanner
          }
          className="mt-3 inline-flex items-center gap-2 bg-purple-700 text-white px-5 py-3 rounded-lg font-semibold hover:bg-purple-800"
        >
          <PartyPopper
            size={18}
          />

          Post party banner
        </button>

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          This creates a dedicated Party Time banner for
          members. It does not get treated as a normal
          member-feed announcement.
        </p>
      </div>

      {/* ========================================================
          APP UPDATE
          ======================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-5 mb-6 min-w-0 border border-amber-100 dark:border-amber-900/50">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Smartphone
              size={21}
            />
          </div>

          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              App Update
            </h2>

            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Dedicated app-update notification shown in
              the prominent application update banner.
            </p>
          </div>
        </div>

        <textarea
          className="w-full min-w-0 max-w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3 min-h-24 resize-y"
          placeholder="e.g. Version 1.1.0 is available! Download the new APK here: https://..."
          value={
            appUpdateDescription
          }
          onChange={e =>
            setAppUpdateDescription(
              e.target.value
            )
          }
        />

        <button
          type="button"
          onClick={
            sendAppUpdate
          }
          className="mt-3 inline-flex items-center gap-2 bg-amber-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-amber-700"
        >
          <Smartphone
            size={18}
          />

          Publish app update
        </button>

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          This creates a dedicated App Update banner.
          Automatic clickable URL formatting remains
          supported by the member dashboard.
        </p>
      </div>

      {/* ========================================================
          ANNOUNCEMENT HISTORY
          ======================================================== */}
      <div className="space-y-2 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            Broadcast History
          </h2>

          <span className="text-xs text-slate-400 dark:text-slate-500">
            {items.length} item
            {items.length === 1
              ? ""
              : "s"}
          </span>
        </div>

        {items.map(
          announcement => (
            <div
              key={
                announcement._id
              }
              className={`rounded-xl p-4 flex items-start gap-3 min-w-0 max-w-full ${
                TYPE_STYLES[
                  announcement.type
                ]
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-[11px] font-black uppercase tracking-wide opacity-70">
                    {announcement.type.replace(
                      "_",
                      " "
                    )}
                  </span>
                </div>

                <p className="font-medium break-words [overflow-wrap:anywhere]">
                  {
                    announcement.description
                  }
                </p>

                <p className="text-xs mt-1 opacity-70 flex flex-wrap items-center gap-1 break-words">
                  {announcement.user
                    ? `Private to ${announcement.user.firstName} ${announcement.user.lastName} · `
                    : announcement.circle
                    ? `${announcement.circle.name} · Cycle ${announcement.circle.cycleNumber} · `
                    : "All members · "}

                  <span className="break-words">
                    {new Date(
                      announcement.createdAt
                    ).toLocaleString()}
                  </span>

                  {announcement.expiresAt && (
                    <span className="inline-flex items-center gap-1 break-words">
                      <Timer
                        size={
                          11
                        }
                      />

                      auto-clears{" "}
                      {new Date(
                        announcement.expiresAt
                      ).toLocaleTimeString()}
                    </span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  remove(
                    announcement._id
                  )
                }
                disabled={
                  deletingId ===
                  announcement._id
                }
                title="Delete announcement"
                className="shrink-0 p-2 rounded-lg text-current opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
              >
                <Trash2
                  size={16}
                />
              </button>
            </div>
          )
        )}

        {items.length ===
          0 && (
          <p className="text-slate-400 dark:text-slate-500 text-center py-8">
            No announcements yet.
          </p>
        )}
      </div>
    </div>
  );
}