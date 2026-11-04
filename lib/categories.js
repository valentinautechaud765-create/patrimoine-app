// Catégories : icône au trait + couleur de pastille (cohérentes partout dans l'appli).
export const CATEGORIES = {
  Logement: { icon: "home", color: "#7fa8ff" },
  Énergie: { icon: "zap", color: "#ffd45c" },
  Courses: { icon: "cart", color: "#2ee59d" },
  Transport: { icon: "car", color: "#ffb454" },
  Restaurants: { icon: "utensils", color: "#ff8a5c" },
  Loisirs: { icon: "game", color: "#b38cff" },
  Shopping: { icon: "shirt", color: "#ff7ab6" },
  Abonnements: { icon: "phone", color: "#5ad1e6" },
  Santé: { icon: "heart", color: "#ff6b7a" },
  Assurances: { icon: "shield", color: "#7fd1ff" },
  Animaux: { icon: "paw", color: "#d9a066" },
  Enfants: { icon: "baby", color: "#ffa3c4" },
  Éducation: { icon: "book", color: "#8fa8ff" },
  Sport: { icon: "dumbbell", color: "#4fd1a5" },
  Voyages: { icon: "plane", color: "#5ab8ff" },
  Cadeaux: { icon: "gift", color: "#ff7a9c" },
  Beauté: { icon: "sparkles", color: "#e19cff" },
  "Impôts et taxes": { icon: "bank", color: "#c9a96a" },
  Épargne: { icon: "piggy", color: "#3d7cff" },
  Salaire: { icon: "briefcase", color: "#2ee59d" },
  Primes: { icon: "star", color: "#ffd45c" },
  Indépendant: { icon: "laptop", color: "#5ad1e6" },
  Ventes: { icon: "tag", color: "#ff9f5c" },
  "Aides et allocations": { icon: "checkCircle", color: "#7fa8ff" },
  "Loyers perçus": { icon: "home", color: "#b38cff" },
  "Dividendes et intérêts": { icon: "trending", color: "#2ee59d" },
  Remboursement: { icon: "receipt", color: "#9aa3b2" },
  "Virement interne": { icon: "repeat", color: "#8b94a5" },
  Dette: { icon: "coins", color: "#ff8a5c" },
  Autre: { icon: "more", color: "#9aa3b2" },
};
export const INCOME_CATEGORIES = ["Salaire", "Primes", "Indépendant", "Ventes", "Aides et allocations", "Loyers perçus", "Dividendes et intérêts", "Cadeaux", "Remboursement", "Autre"];
const INCOME_ONLY = INCOME_CATEGORIES.filter((c) => !["Cadeaux", "Autre"].includes(c));
export const EXPENSE_CATEGORIES = Object.keys(CATEGORIES).filter((c) => !INCOME_ONLY.includes(c) && c !== "Virement interne");

// Catégories créées par l'utilisateur (enregistrées dans son compte) : { name, type: "in" | "out", icon, color }
export const CUSTOM_ICONS = ["tag", "star", "gift", "heart", "home", "car", "plane", "game", "music", "coffee", "book", "paw", "baby", "dumbbell", "wrench", "laptop", "phone", "shirt", "cart", "zap", "coins", "briefcase", "target", "sparkles"];
// Couleurs des catégories personnelles : vives et bien différentes de celles de base
export const CUSTOM_COLORS = ["#f97316", "#a3e635", "#14b8a6", "#f43f5e", "#8b5cf6", "#06b6d4", "#eab308", "#ec4899", "#22c55e", "#0ea5e9", "#d946ef", "#fb923c", "#2dd4bf", "#facc15", "#60a5fa", "#c084fc"];
// Palette de secours pour que deux parts d'un même graphique n'aient jamais la même couleur
const DISTINCT = ["#3d7cff", "#2ee59d", "#ffb454", "#ff7ab6", "#b38cff", "#5ad1e6", "#ff6b7a", "#ffd45c", "#d9a066", "#7fa8ff", ...CUSTOM_COLORS, "#9aa3b2"];
const hash = (t) => { let h = 0; for (const ch of String(t)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
let CUSTOM = [];
export function setCustomCategories(list) {
  CUSTOM = (Array.isArray(list) ? list : []).filter((c) => c && typeof c.name === "string" && c.name.trim()).slice(0, 60);
}
export const customCategories = () => CUSTOM;
// Catégorie inconnue (ancienne, importée…) : une couleur à elle, toujours la même, au lieu du gris « Autre »
export const cat = (name) => CATEGORIES[name] || (() => {
  const c = CUSTOM.find((x) => x.name === name);
  if (c) return { icon: CUSTOM_ICONS.includes(c.icon) ? c.icon : "tag", color: c.color || "#9aa3b2" };
  return name && name !== "Autre" ? { icon: "tag", color: CUSTOM_COLORS[hash(name) % CUSTOM_COLORS.length] } : CATEGORIES.Autre;
})();
// Couleurs d'un graphique : chaque catégorie garde la sienne, sauf si elle est déjà prise par une autre part.
export function distinctColors(names) {
  const used = new Set(), out = {};
  for (const n of names) {
    let c = cat(n).color;
    if (used.has(c.toLowerCase())) c = DISTINCT.find((x) => !used.has(x.toLowerCase())) || c;
    used.add(c.toLowerCase()); out[n] = c;
  }
  return out;
}
// Couleurs encore libres pour une nouvelle catégorie personnelle
export const freeCustomColors = () => { const free = CUSTOM_COLORS.filter((c) => !CUSTOM.some((x) => String(x.color).toLowerCase() === c)); return free.length ? free : CUSTOM_COLORS; };
// Liste proposée dans les formulaires : catégories de base (sans « Autre »), puis les siennes, puis « Autre ».
export function categoriesFor(type) {
  const base = (type === "in" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).filter((c) => c !== "Autre");
  const mine = CUSTOM.filter((c) => (c.type === "in") === (type === "in") && !base.includes(c.name)).map((c) => c.name);
  return [...base, ...mine, "Autre"];
}
// Mouvements entre ses propres comptes : ni dépense, ni revenu.
export const NEUTRAL = new Set(["Épargne", "Virement interne"]);
export const ASSET_COLORS = { ETF: "#3d7cff", Action: "#7fa8ff", Crypto: "#ffb454", Fonds: "#b38cff", Obligations: "#2ee59d" };

// Catégorie devinée d'après le libellé bancaire (opérations importées de la banque).
const RULES = [
  ["Salaire", /salaire|paie|\bpay\b|remuneration|rémunération/i, 1],
  ["Remboursement", /rembours|avoir|refund/i, 1],
  ["Épargne", /livret|epargne|épargne|\bldds\b|\bpel\b|\bpea\b|assurance.?vie/i, 0],
  ["Logement", /loyer|edf|engie|totalenergies electricite|veolia|suez|eau de|assurance habitation|syndic|taxe fonciere|foncia|nexity/i, -1],
  ["Courses", /carrefour|leclerc|auchan|lidl|intermarch|monoprix|franprix|casino|super u|hyper u|\bu express|aldi|netto|picard|grand frais|biocoop|naturalia|boulanger(ie)?\b/i, -1],
  ["Restaurants", /restaurant|resto|mcdo|mc donald|burger|kfc|deliveroo|uber ?eats|just ?eat|sushi|pizza|brasserie|cafe|café|starbucks|o'tacos/i, -1],
  ["Transport", /uber|bolt|sncf|ratp|\bnavigo|blablacar|total(?!energies electricite)|esso|\bbp\b|shell|avia|peage|péage|parking|indigo|vinci|essence|carburant|transavia|easyjet|air france|ryanair/i, -1],
  ["Abonnements", /netflix|spotify|deezer|disney|canal\+|amazon prime|apple\.com|icloud|google|youtube|free mobile|free telecom|orange|sfr|bouygues|sosh|red by|basic.?fit|fitness|abonnement/i, -1],
  ["Santé", /pharmacie|doctolib|medecin|médecin|dentiste|opticien|mutuelle|hopital|hôpital|laboratoire|kine/i, -1],
  ["Shopping", /amazon|zara|h&m|\bhm\b|fnac|darty|decathlon|ikea|kiabi|primark|vinted|leboncoin|cdiscount|sephora|action\b|shein|zalando/i, -1],
  ["Loisirs", /cinema|cinéma|ugc|pathe|pathé|steam|playstation|xbox|nintendo|concert|ticketmaster|fnac spectacles|bowling|musee|musée/i, -1],
];
export function guessCategory(label, amount) {
  const text = String(label || "");
  for (const [name, re, sign] of RULES) if (re.test(text) && (sign === 0 || (sign > 0) === (amount > 0))) return name;
  return amount > 0 ? "Autre" : "Autre";
}
