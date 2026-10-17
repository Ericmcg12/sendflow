/* SendFlow (app): botón «SendFlow nube» en Configuración + clave de mapas desde la nube. */
(function () {
  "use strict";
  // Clave que traía la app de fábrica antes de moverla a la nube: se reemplaza sola.
  var CLAVE_DE_FABRICA_ANTERIOR = "S4kmsJljrshgd2yPJv8e";
  function listo(f) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", f); else f(); }
  listo(function () {
    var b = document.getElementById("btnConfigNube");
    if (b) b.addEventListener("click", function () { window.SFNubeUI.abrir({ modo: "app", foco: "bajadas" }); });

    // Al entrar a «Mapa offline» (que es cuando hace falta internet para bajar mapas) se busca la clave en la nube,
    // se guarda en el dispositivo y después todo sigue funcionando sin conexión. Sin señal o sin clave: no pasa nada,
    // se usa la que ya estaba guardada.
    var m = document.getElementById("btnConfigMapaOffline");
    if (m) m.addEventListener("click", function () {
      if (!navigator.onLine || !window.SFNube) return;
      window.SFNube.sincronizarClaveMapas(CLAVE_DE_FABRICA_ANTERIOR).then(function (r) {
        var inp = document.getElementById("mapTilerApiKeyInput");
        if (inp && r && r.clave) inp.value = r.clave;
      }, function () { /* sin clave en la nube o sin red: se queda con la que haya */ });
    }, true);
  });
})();
