// Notifications web push de Patrimo — sobres, utiles et cohérentes avec l'identité visuelle.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  const rawTitle = String(data.title || "").trim();
  const rawBody = String(data.body || "").trim();
  const isTestNotice = /^(patrimo|patrimoine)$/i.test(rawTitle)
    && /notifications sont bien activées/i.test(rawBody);

  // Évite le titre générique « Patrimo » pour le message de confirmation d'activation.
  const title = isTestNotice
    ? "Notifications activées"
    : rawTitle || "Votre patrimoine";

  const body = isTestNotice
    ? "Tout est prêt. Vous recevrez ici vos alertes importantes."
    : rawBody || "Une information importante concernant votre patrimoine.";

  const options = {
    body,
    icon: "/icon.svg",
    badge: "/notification-badge.svg",
    tag: data.tag || (isTestNotice ? "patrimo-notifications-enabled" : "patrimo"),
    data: { url: data.url || "/" },
    lang: "fr-FR",
    dir: "auto",
    renotify: false,
    timestamp: Number(data.timestamp) || Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  }));
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
