/* Coach v51 (16/10/2026): conecta SFEntrenadores (entrenadores-libres.js) y SFBienvenida (bienvenida-nueva.js) — los mismos
   archivos de sendflow.bike — con Coach: sesión (API.sb), avisos (UI.aviso) y navegación (irA). La bienvenida espera a que
   termine la pantalla de entrada (entrada.js). */
(function () {
  "use strict";
  if (!window.API) return;
  function ir(r) { if (window.irA) window.irA(r); else location.href = r; }
  if (window.SFEntrenadores) SFEntrenadores.iniciar({
    sb: API.sb,
    aviso: function (t, tipo) { UI.aviso(t, tipo === "error" ? "error" : "oro"); },
    alVincular: function () {}
  });
  if (window.SFAgendaChat) SFAgendaChat.iniciar({ sb: API.sb, aviso: function (t, tipo) { UI.aviso(t, tipo === "error" ? "error" : "oro"); } });   // v52: «Agregar al calendario» en el chat
  if (window.SFBienvenida) SFBienvenida.iniciar({ sb: API.sb, irAPerfil: function () { ir("/perfil"); }, irABicis: function () { ir("/perfil#bicis"); } });
  var revisada = false;
  window.CoachLibres = {
    // se llama al entrar (con login o con la sesión guardada)
    bienvenida: function () {
      if (revisada || !window.SFBienvenida) return; revisada = true;
      (function esperar() { if (document.querySelector(".entrada-sf")) setTimeout(esperar, 300); else SFBienvenida.revisar(); })();
    },
    olvidar: function () { revisada = false; }
  };
})();
