self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || "Patrimo";
  const options = {
    body: data.body || "Une information importante concernant tes finances.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag || "patrimo",
    data: { url: data.url || "/" },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const client of list) if (client.url.startsWith(self.location.origin) && "focus" in client) { client.navigate(target); return client.focus(); }
    return clients.openWindow(target);
  }));
});
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
