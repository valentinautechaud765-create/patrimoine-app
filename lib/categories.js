// Catégories : icône au trait + couleur de pastille (cohérentes partout dans l'appli).
export const CATEGORIES = {
  Logement: { icon: "home", color: "#7fa8ff" },
  Courses: { icon: "cart", color: "#2ee59d" },
  Transport: { icon: "car", color: "#ffb454" },
  Restaurants: { icon: "utensils", color: "#ff8a5c" },
  Loisirs: { icon: "game", color: "#b38cff" },
  Shopping: { icon: "shirt", color: "#ff7ab6" },
  Abonnements: { icon: "phone", color: "#5ad1e6" },
  Santé: { icon: "heart", color: "#ff6b7a" },
  Épargne: { icon: "piggy", color: "#3d7cff" },
  Salaire: { icon: "briefcase", color: "#2ee59d" },
  Remboursement: { icon: "receipt", color: "#9aa3b2" },
  Autre: { icon: "more", color: "#9aa3b2" },
};
export const cat = (name) => CATEGORIES[name] || CATEGORIES.Autre;
export const EXPENSE_CATEGORIES = Object.keys(CATEGORIES).filter((c) => !["Salaire", "Remboursement"].includes(c));
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
