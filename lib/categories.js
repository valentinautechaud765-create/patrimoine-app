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
