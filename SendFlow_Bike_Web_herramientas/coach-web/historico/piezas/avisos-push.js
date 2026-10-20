/* SendFlow · avisos push (11/10/2026) — el mismo archivo en sendflow.coach y sendflow.bike.
   SFAvisos.configurar(sb, "coach" | "bike")   cliente de Supabase con sesión y qué sitio es
   SFAvisos.estado()      → "no-soportado" | "iphone" | "bloqueado" | "activo" | "inactivo" | "sin-servidor"
   SFAvisos.activar()     pide permiso, se suscribe y guarda la suscripción en la cuenta
   SFAvisos.desactivar()  la borra de la cuenta y del navegador
   SFAvisos.sincronizar() si este navegador ya estaba suscripto, lo vuelve a asociar a la cuenta con sesión
   SFAvisos.fila()        un renglón listo para poner en pantalla: "Avisos en este dispositivo [Activar]"
   Las notificaciones las muestra /sw.js. La clave pública VAPID se pide a la función avisos-coach. */
(function () {
  "use strict";
  var sb = null, sitio = "coach", clavePub = null, reg = null;
  var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var instalada = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  function soportado() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function b64(s) { var p = "=".repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  function registrar() { if (reg) return Promise.resolve(reg); return navigator.serviceWorker.register("/sw.js").then(function (r) { reg = r; return navigator.serviceWorker.ready.then(function () { return r; }); }); }
  function pedirClave() {
    if (clavePub) return Promise.resolve(clavePub);
    return sb.functions.invoke("avisos-coach", { body: { accion: "clave" } }).then(function (r) {
      if (r.error) throw new Error("No se pudo hablar con el servidor de avisos.");
      if (!r.data || !r.data.clave) { var e = new Error("Los avisos push todavía no están configurados en el servidor."); e.sinServidor = true; throw e; }
      clavePub = r.data.clave; return clavePub;
    });
  }
  function suscripcion() { if (!soportado()) return Promise.resolve(null); return registrar().then(function (r) { return r.pushManager.getSubscription(); }); }
  function guardar(sub) {
    var j = sub.toJSON();
    return sb.rpc("push_guardar", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_sitio: sitio }).then(function (r) { if (r.error) throw new Error(r.error.message || "No se pudo guardar."); });
  }
  var api = {
    configurar: function (cliente, s) { sb = cliente; sitio = s === "bike" ? "bike" : "coach"; },
    estado: function () {
      if (!soportado()) return Promise.resolve(esIOS && !instalada ? "iphone" : "no-soportado");
      if (Notification.permission === "denied") return Promise.resolve("bloqueado");
      return suscripcion().then(function (s) { return s && Notification.permission === "granted" ? "activo" : "inactivo"; }).catch(function () { return "no-soportado"; });
    },
    activar: function () {
      if (!soportado()) return Promise.reject(new Error(esIOS ? "En iPhone, primero agregá este sitio a la pantalla de inicio (Compartir → Agregar a inicio) y abrilo desde ahí." : "Este navegador no permite avisos."));
      return Notification.requestPermission().then(function (p) {
        if (p !== "granted") throw new Error(p === "denied" ? "Los avisos quedaron bloqueados: habilitalos en la configuración del navegador para este sitio." : "No se dio permiso para los avisos.");
        return Promise.all([registrar(), pedirClave()]);
      }).then(function (r) {
        return r[0].pushManager.getSubscription().then(function (s) { return s || r[0].pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(r[1]) }); });
      }).then(guardar);
    },
    desactivar: function () {
      return suscripcion().then(function (s) {
        if (!s) return;
        return sb.rpc("push_borrar", { p_endpoint: s.endpoint }).then(function () { return s.unsubscribe(); });
      });
    },
    sincronizar: function () {
      if (!soportado() || Notification.permission !== "granted") return Promise.resolve();
      return suscripcion().then(function (s) { if (s) return guardar(s); }).catch(function () {});
    },
    fila: function () {
      var el = document.createElement("div"); el.className = "sf-avisos";
      var txt = document.createElement("div"); txt.className = "sf-avisos-txt";
      var t = document.createElement("b"); t.textContent = "Avisos en este dispositivo";
      var s = document.createElement("span");
      txt.appendChild(t); txt.appendChild(s); el.appendChild(txt);
      var b = document.createElement("button"); b.type = "button"; b.className = "btn chico"; el.appendChild(b);
      function pintar(est) {
        el.dataset.estado = est; b.hidden = false; b.disabled = false;
        if (est === "activo") { s.textContent = "Te llega una notificación cuando hay devoluciones, respuestas o envíos nuevos."; b.textContent = "Desactivar"; }
        else if (est === "inactivo") { s.textContent = "Recibí una notificación aunque tengas la página cerrada."; b.textContent = "Activar"; b.className = "btn chico primario"; }
        else if (est === "bloqueado") { s.textContent = "Están bloqueados para este sitio: habilitalos en la configuración del navegador."; b.hidden = true; }
        else if (est === "iphone") { s.textContent = "En iPhone: Compartir → «Agregar a inicio» y abrí SendFlow desde ese ícono para activarlos."; b.hidden = true; }
        else if (est === "sin-servidor") { s.textContent = "Todavía no están configurados en el servidor."; b.hidden = true; }
        else { s.textContent = "Este navegador no permite avisos."; b.hidden = true; }
        if (est !== "inactivo") b.className = "btn chico";
      }
      b.addEventListener("click", function () {
        var activo = el.dataset.estado === "activo";
        b.disabled = true; b.textContent = activo ? "Desactivando…" : "Activando…";
        (activo ? api.desactivar() : api.activar()).then(function () { return api.estado(); }).then(pintar).catch(function (e) {
          if (e && e.sinServidor) return pintar("sin-servidor");
          var msg = (e && e.message) || "No se pudo.";
          if (/push service|Registration failed|AbortError/i.test(msg)) msg = "El navegador no pudo registrarse en su servicio de avisos. Probá de nuevo en un rato.";
          api.estado().then(function (est) { pintar(est); s.textContent = msg; });
        });
      });
      api.estado().then(pintar);
      return el;
    }
  };
  window.SFAvisos = api;
})();
