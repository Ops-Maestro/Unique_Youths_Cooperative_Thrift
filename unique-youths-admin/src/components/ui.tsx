export function StatCard({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-2xl border-2 border-red-600 bg-white dark:bg-slate-900 p-5 shadow-sm"
          : "rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm"
      }
    >
      <p className={highlight ? "text-red-600 text-sm font-semibold" : "text-slate-500 dark:text-slate-400 text-sm font-semibold"}>
        {label}
      </p>
      <b className="text-2xl block mt-1 text-slate-900 dark:text-slate-100">{value}</b>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}

export function Banner({ tone, message }: { tone: "error" | "success"; message: string }) {
  return (
    <div
      className={
        tone === "error"
          ? "mb-4 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-3 text-sm"
          : "mb-4 rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 p-3 text-sm"
      }
    >
      {message}
    </div>
  );
}

export function naira(value: number) {
  return `₦${Number(value || 0).toLocaleString()}`;
}

export type Theme = "light" | "dark" | "system";

export function applyTheme(theme: Theme) {
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const options: { id: Theme; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "system", label: "Auto" },
    { id: "dark", label: "Dark" }
  ];
  return (
    <div className="inline-flex rounded-lg border border-white/30 overflow-hidden text-xs">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => setTheme(o.id)}
          className={`px-2.5 py-1.5 font-semibold ${
            theme === o.id ? "bg-white text-blue-900" : "text-blue-100 hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
