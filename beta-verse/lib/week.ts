// lib/week.ts
const pad = (n: number) => String(n).padStart(2, "0");

export const toLocalISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function tueThuWindow(today = new Date()) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = base.getDay();                 // 0=Sun..6=Sat
  const backToTue = (dow - 2 + 7) % 7;       // 2 = Tue
  const start = new Date(base); start.setDate(base.getDate() - backToTue);
  const end   = new Date(start); end.setDate(start.getDate() + 2); // Thu
  return { startISO: toLocalISO(start), endISO: toLocalISO(end) };
}

export const formatRange = (startISO: string, endISO: string) => {
  const [ys, ms, ds] = startISO.split("-").map(Number);
  const [ye, me, de] = endISO.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (ys === ye && ms === me) return `${months[ms-1]} ${ds} – ${de}`;
  return `${months[ms-1]} ${ds} – ${months[me-1]} ${de}`;
};
