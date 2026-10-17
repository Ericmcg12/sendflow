/* Coach v50 (16/10/2026): conecta SFCuenta (piezas/ciclo-cuenta.js, el mismo archivo de sendflow.bike) con Coach:
   sesión de Coach (API.sb), avisos de Coach (UI.aviso) y, al cerrar la cuenta, salida a la bienvenida de sendflow.bike. */
(function () {
  "use strict";
  if (!window.SFCuenta || !window.API) return;
  var C = window.SENDFLOW_CONFIG;
  SFCuenta.iniciar({
    sb: API.sb, urlFunciones: C.supabaseUrl + "/functions/v1/", anonKey: C.supabaseAnonKey,
    aviso: function (t, tipo) { UI.aviso(t, tipo === "error" ? "error" : "oro"); },
    alCerrarCuenta: function () {
      var listo = false;
      function fin() {
        if (listo) return; listo = true;
        try { SFPuente.borrarSesion(); } catch (e) {}
        try { API.guardarToken(null); } catch (e) {}
        try { if (window.CoachEntrada) CoachEntrada.olvidar(); } catch (e) {}
        location.replace(SFPuente.BIKE + "?salir=1&cuenta=cerrada");
      }
      try { API.sb.auth.signOut({ scope: "local" }).then(fin, fin); } catch (e) { fin(); }
      setTimeout(fin, 1500);
    }
  });
})();
