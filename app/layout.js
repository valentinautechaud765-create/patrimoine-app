import "./globals.css";
import { BRAND } from "../lib/config.js";

export const metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: "Comptes bancaires, épargne, actions et ETF réunis dans une seule appli. Courbe du patrimoine, budgets et analyse automatique. Formule gratuite, essai Plus 14 jours.",
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
};
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#084B7B" };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon" type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/apple-icon" />
        <meta name="theme-color" content="#084B7B" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
