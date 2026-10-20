// puente.js — SendFlow Coach (11/10/2026). Se carga PRIMERO, en <head>, antes que todo lo demás.
//  1) Llegada desde sendflow.bike: la dirección trae "#sf_pase=…" (pase de un solo uso de la función
//     "puente-coach"). Se guarda en sessionStorage y se borra de la dirección enseguida (no queda en
//     el historial ni lo ve ningún script de terceros). api.js lo canjea por una sesión propia de Coach.
//  2) "/salir?volver=bike": cierre de sesión pedido por Bike. Borra la sesión de Coach en este
//     navegador y vuelve a sendflow.bike. Así "Salir" cierra los dos sitios.
(function () {
  "use strict";
  var BIKE = "https://sendflow.bike/";
  function borrarSesion() {
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (/^sb-|supabase|^sendflow-coach-auth|^sf-desde-bike$/i.test(k)) localStorage.removeItem(k);
      });
      sessionStorage.removeItem("sf-pase");
    } catch (e) {}
  }
  window.SFPuente = { BIKE: BIKE, borrarSesion: borrarSesion };
  if (location.pathname === "/salir") {
    borrarSesion();
    var q = new URLSearchParams(location.search);
    location.replace(q.get("volver") === "bike" ? BIKE : "/ingreso");
    return;
  }
  // Bike no pudo conseguir el pase: dice por qué, para mostrarlo en el ingreso (v21)
  var sp = /(?:^#|&)sf_sinpase=([^&]+)/.exec(location.hash);
  if (sp) {
    try { sessionStorage.setItem("sf-sinpase", decodeURIComponent(sp[1])); localStorage.setItem("sf-desde-bike", "1"); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
  }
  var m = /(?:^#|&)sf_pase=([^&]+)/.exec(location.hash);
  if (m) {
    try { sessionStorage.setItem("sf-pase", decodeURIComponent(m[1])); localStorage.setItem("sf-desde-bike", "1"); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
  }
})();
