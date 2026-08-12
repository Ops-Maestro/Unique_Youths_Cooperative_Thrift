/// <reference types="vite/client" />
const API = import.meta.env.VITE_API_BASE_URL || "https://unique-youths-cooperative-thrift-backend.onrender.com";

export async function api(path: string, options: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || "Request failed");
  return d;
}