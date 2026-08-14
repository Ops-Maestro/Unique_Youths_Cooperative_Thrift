import { useEffect, useState } from "react";
import { Megaphone, Trash2, Timer } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, Banner } from "../components/ui";

type Announcement = {
  _id: string;
  type: "payment_received" | "payment_missed" | "general_update" | "party_banner" | "app_update";
  description: string;
  venue?: string | null;
  eventDate?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  circle?: { name: string; cycleNumber: number } | null;
  user?: { firstName: string; lastName: string; username: string } | null;
};

const TYPE_STYLES: Record<Announcement["type"], string> = {
  payment_received: "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950",
  payment_missed: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950",
  general_update: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950",
  party_banner: "text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950",
  app_update: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950"
};

export default function BroadcastEngine({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [type, setType] = useState<Announcement["type"]>("general_update");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [venue, setVenue] = useState("");
  const [eventDate, setEventDate] = useState("");

  const load = async () => {
    try {
      setErr("");
      setItems(await api("/api/admin/announcements", { headers: { Authorization: `Bearer ${token}` } }));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [token, refreshKey]);

  const send = async () => {
    if (!description.trim()) {
      setErr("Write a message first.");
      return;
    }
    setErr("");
    setMsg("");
    try {
      await api("/api/admin/announcements", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type,
          description,
          ...(type === "party_banner" ? { venue: venue || undefined, eventDate: eventDate || undefined } : {})
        })
      });
      setDescription("");
      setVenue("");
      setEventDate("");
      setMsg(
        type === "party_banner"
          ? "Party banner posted — every member will see it on their dashboard until you take it down."
          : type === "app_update"
          ? "App update notification pushed — members will see the update banner with your link."
          : "Announcement pushed to every member's feed. It stays until you delete it."
      );
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const remove = async (id: string) => {
    setErr("");
    setMsg("");
    setDeletingId(id);
    try {
      await api(`/api/admin/announcements/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setMsg("Announcement deleted.");
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div>
      <PageHeader title="Broadcast Engine" subtitle="Push a card to every member's dashboard feed — every member sees it, regardless of their circle." />

      {err && <Banner tone="error" message={err} />}
      {msg && <Banner tone="success" message={msg} />}

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-5 mb-6">
        <div className="flex flex-wrap gap-2 mb-3">
          {(["general_update", "payment_received", "payment_missed", "party_banner", "app_update"] as const).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                type === t ? "bg-blue-800 text-white border-blue-800" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
            >
              {t.replace("_", " ")}
            </button>
          ))}
        </div>
        {type === "party_banner" && (
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <input
              className="border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-2.5 text-sm"
              placeholder="Venue (e.g. Community Hall, Ikeja)"
              value={venue}
              onChange={e => setVenue(e.target.value)}
            />
            <input
              type="datetime-local"
              className="border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-2.5 text-sm"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
            />
          </div>
        )}
        <textarea
          className="w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3 min-h-24"
          placeholder={
            type === "party_banner"
              ? "e.g. Our quarterly get-together is coming up! Join us to celebrate..."
              : type === "app_update"
              ? "e.g. Version 1.1.0 is available! Download the new APK here: https://..."
              : "Write the announcement members will see..."
          }
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <button
          onClick={send}
          className="mt-3 inline-flex items-center gap-2 bg-red-600 text-white px-5 py-3 rounded-lg font-semibold"
        >
          <Megaphone size={18} /> {type === "party_banner" ? "Post party banner" : type === "app_update" ? "Publish app update" : "Push to member feed"}
        </button>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          {type === "party_banner"
            ? "Shows as a dedicated banner (app logo + name) on every member's dashboard, separate from the ticker. Stays up until you take it down below."
            : type === "app_update"
            ? "Appears as a prominent top update banner for all members with automatic clickable link formatting for your APK URL."
            : "Sent to all members' dashboards and their scrolling ticker. Stays visible until you delete it below — it doesn't auto-expire like system notices (welcomes, join announcements) do."}
        </p>
      </div>

      <div className="space-y-2">
        {items.map(a => (
          <div key={a._id} className={`rounded-xl p-4 flex items-start justify-between gap-3 ${TYPE_STYLES[a.type]}`}>
            <div>
              <p className="font-medium">{a.description}</p>
              <p className="text-xs mt-1 opacity-70 flex flex-wrap items-center gap-1">
                {a.user ? `Private to ${a.user.firstName} ${a.user.lastName} · ` : a.circle ? `${a.circle.name} · Cycle ${a.circle.cycleNumber} · ` : "All members · "}
                {new Date(a.createdAt).toLocaleString()}
                {a.expiresAt && (
                  <span className="inline-flex items-center gap-1">
                    <Timer size={11} /> auto-clears {new Date(a.expiresAt).toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => remove(a._id)}
              disabled={deletingId === a._id}
              title="Delete announcement"
              className="shrink-0 p-2 rounded-lg text-current opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="text-slate-400 dark:text-slate-500 text-center py-8">No announcements yet.</p>}
      </div>
    </div>
  );
}