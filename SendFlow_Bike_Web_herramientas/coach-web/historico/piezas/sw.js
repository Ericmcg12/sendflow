/* SendFlow · service worker de avisos push (sendflow.coach y sendflow.bike). Solo muestra las notificaciones y abre
   la página al tocarlas; no guarda nada en caché (los sitios siguen funcionando como siempre). */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "SendFlow", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "SendFlow", {
    body: d.body || "", icon: "/img/aviso-192.png", badge: "/img/aviso-badge.png", tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || "/" }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (ws) {
    var mismo = new URL(url, self.location.origin).origin === self.location.origin;
    for (var i = 0; i < ws.length; i++) {
      if (mismo && ws[i].url.indexOf(self.location.origin) === 0 && "focus" in ws[i]) {
        return ws[i].focus().then(function (w) { return w && w.navigate ? w.navigate(url) : null; }).catch(function () { return self.clients.openWindow(url); });
      }
    }
    return self.clients.openWindow(url);
  }));
});
