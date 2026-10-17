/* SendFlow Bike Web v35 · /analisis dentro de sendflow.bike (pestaña «Análisis», sendflow.bike/bajadas).
   - Abierto solo (no dentro de Bike): pasa a sendflow.bike/bajadas, que lo muestra con el menú del sitio.
   - Dentro de Bike: avisa qué pantalla está abierta. En el inicio, la lista de bajadas y los perfiles el menú de
     Bike queda visible; al analizar una bajada (o la demo) Bike esconde el menú y el análisis ocupa toda la pantalla.
   - Los enlaces que salen de /analisis se abren en la ventana entera, no dentro del marco.
   Va en el <head>, antes que la app: no toca la lógica de la app. */
(function () {
  "use strict";
  var dentro = false;
  try { dentro = window.top !== window && window.top.location.origin === location.origin; } catch (e) {}
  if (!dentro) {
    if (window.top === window && !/^#bici=/.test(location.hash)) { location.replace("/bajadas" + location.hash); }
    return;
  }
  var H = document.documentElement;
  H.classList.add("sf-embebido");
  var INICIO = { pantallaBienvenida: 1, pantallaImportar: 1, pantallaGuardados: 1, pantallaPerfiles: 1 };
  var ultimo = null;
  function avisar() {
    var a = document.querySelector(".pantalla.activa"), id = a ? a.id : "pantallaBienvenida";
    var completa = !INICIO[id];
    if (completa === ultimo) return;
    ultimo = completa;
    try { window.top.postMessage({ sfAnalisis: "pantalla", id: id, completa: completa }, location.origin); } catch (e) {}
  }
  function mirar() {
    avisar();
    new MutationObserver(avisar).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mirar); else mirar();
  window.addEventListener("pagehide", function () { try { window.top.postMessage({ sfAnalisis: "pantalla", completa: false }, location.origin); } catch (e) {} });
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[href]");
    if (!a || a.hasAttribute("download") || (a.target && a.target !== "_self")) return;
    var u; try { u = new URL(a.href, location.href); } catch (e) { return; }
    if (u.origin === location.origin && u.pathname.indexOf("/analisis/") === 0) return;
    if (!/^https?:$/.test(u.protocol)) return;
    ev.preventDefault();
    window.top.location.href = u.href;
  }, true);
})();
