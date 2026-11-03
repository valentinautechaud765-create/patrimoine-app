const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const EUR0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const money = (n, cur = "EUR") => cur === "EUR" ? EUR.format(Number(n) || 0) : new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur }).format(Number(n) || 0);
export const money0 = (n) => EUR0.format(Number(n) || 0);
export const signed = (n) => (n >= 0 ? "+" : "−") + money(Math.abs(n));
export const pct = (n, d = 2) => (n >= 0 ? "+" : "−") + Math.abs(Number(n) || 0).toFixed(d).replace(".", ",") + " %";
export const todayISO = () => new Date().toISOString().slice(0, 10);
const DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const DAYLONG = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
export const dayLabel = (iso) => DAY.format(new Date(iso + "T12:00:00"));
export const dayTitle = (iso) => {
  const t = todayISO(), y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (iso === t) return "Aujourd’hui";
  if (iso === y) return "Hier";
  const s = DAYLONG.format(new Date(iso + "T12:00:00"));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const monthLabel = (ym) => { const s = MONTH.format(new Date(ym + "-15T12:00:00")); return s.charAt(0).toUpperCase() + s.slice(1); };
// Montant découpé pour l'affichage « 12 345,67 € » avec centimes plus petits
export const splitMoney = (n) => { const t = money(n), i = t.lastIndexOf(","); return i < 0 ? [t, ""] : [t.slice(0, i), t.slice(i)]; };
