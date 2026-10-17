/* SendFlow · bienvenida de primera vez (16/10/2026, coach_v23.sql). El MISMO archivo en sendflow.bike (js/bienvenida-nueva.js)
   y en Coach (piezas/bienvenida-nueva.js).
   La primera vez que alguien entra (a cualquiera de los dos sitios) ve una pantalla que le dice por dónde empezar: completar
   sus datos y cargar sus bicis, y qué puede hacer en SendFlow. Al cerrarla queda marcada en la base (bienvenida_lista) y no
   vuelve a aparecer en ningún sitio ni dispositivo. Versión piloto y versión entrenador.
   Sin estilos en línea (CSP de sendflow.bike): todo por clases sfw-*.
   Uso: SFBienvenida.iniciar({ sb, irAPerfil(), irABicis(), buscarEntrenador() }) y después SFBienvenida.revisar(). */
(function () {
  "use strict";
  var H = null, abierta = false;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function rpc(n) { return H.sb.rpc(n, {}).then(function (r) { if (r.error) throw r.error; return r.data; }); }

  var PILOTO = {
    titulo: "Bienvenido a SendFlow",
    bajada: "Antes de grabar tu primera bajada, completá tu perfil. Con tus datos y los de tu bici, el análisis y las recomendaciones de set-up salen a tu medida.",
    pasos: [
      { t: "Completá tus datos", d: "Peso, disciplina, nivel y estilo de manejo.", hecho: function (e) { return e.datosCompletos; }, ir: "perfil" },
      { t: "Cargá tu bici o tus bicis", d: "Modelo, recorridos, suspensión y su set-up base: presiones y clicks.", hecho: function (e) { return e.bicis > 0; }, ir: "bicis" }],
    puede: [
      ["Grabar con Sender", "El datalogger va en la bici y registra suspensión, velocidad y GPS en cada bajada."],
      ["Pasar las bajadas con la app", "SendFlow Bike las descarga del Sender, las guarda en el dispositivo y las sube a tu nube."],
      ["Analizar en pantalla grande", "En Análisis ves gráficos, mapa y comparaciones de tus bajadas."],
      ["Entrenar con un entrenador", "Buscalo en la lista de entrenadores o aceptá su invitación: te arma planes y devoluciones sobre tus videos."],
      ["Mensajes y calendario", "Hablá con tu entrenador sobre cada devolución y sumá tus carreras y fechas al calendario."]]
  };
  var COACH = {
    titulo: "Bienvenido a SendFlow Coach",
    bajada: "Empezá por tu perfil y después sumá a tus pilotos. Cada piloto vinculado comparte con vos sus bajadas, sus bicis y sus videos.",
    pasos: [
      { t: "Completá tu perfil", d: "Tu nombre y tu foto: es lo que ven tus pilotos.", hecho: function (e) { return !!e.nombre; }, ir: "perfil" },
      { t: "Sumá a tus pilotos", d: "Invitalos con su email desde Pilotos, o activá «Aparecer en la lista de entrenadores» en tu Perfil para que te pidan entrenar.", hecho: function () { return false; }, ir: "perfil" }],
    puede: [
      ["Planes y calendario", "Armá planes por semana; el piloto los ve y marca lo que hizo."],
      ["Devoluciones sobre video", "Dibujos, etiquetas, notas y voz sobre los videos que te mandan."],
      ["Datos del Sender junto al video", "Suspensión, velocidad y GPS sincronizados con la imagen."],
      ["Mensajes", "Conversá con cada piloto sobre cada devolución."]]
  };

  function mostrar(e) {
    if (abierta) return; abierta = true;
    var T = e.esEntrenador ? COACH : PILOTO;
    var antes = document.activeElement;
    var fondo = el("div", "sfw-fondo"), caja = el("div", "sfw-caja");
    caja.setAttribute("role", "dialog"); caja.setAttribute("aria-modal", "true");
    var h = el("h1", "sfw-titulo", T.titulo + (e.nombre ? ", " + e.nombre.split(" ")[0] : "")); h.id = "sfw-t"; caja.setAttribute("aria-labelledby", h.id);
    caja.appendChild(el("div", "sfw-etq", "Primeros pasos"));
    caja.appendChild(h);
    caja.appendChild(el("p", "sfw-bajada", T.bajada));
    var ol = el("ol", "sfw-pasos");
    T.pasos.forEach(function (p, i) {
      var li = el("li", "sfw-paso" + (p.hecho(e) ? " hecho" : ""));
      li.appendChild(el("span", "sfw-n", p.hecho(e) ? "✓" : String(i + 1)));
      var tx = el("div"); tx.appendChild(el("b", null, p.t)); tx.appendChild(el("span", null, p.d)); li.appendChild(tx);
      ol.appendChild(li);
    });
    caja.appendChild(ol);
    caja.appendChild(el("div", "sfw-sub", e.esEntrenador ? "Lo que podés hacer en Coach" : "Lo que podés hacer en SendFlow"));
    var grid = el("div", "sfw-grilla");
    T.puede.forEach(function (x) { var c = el("div", "sfw-item"); c.appendChild(el("b", null, x[0])); c.appendChild(el("span", null, x[1])); grid.appendChild(c); });
    caja.appendChild(grid);
    var pie = el("div", "sfw-pie");
    var ir = el("button", "btn primario sfw-ir", e.esEntrenador ? "Completar mi perfil" : (e.datosCompletos && !e.bicis ? "Cargar mi bici" : "Completar mi perfil")); ir.type = "button";
    var luego = el("button", "btn sfw-luego", "Ver después"); luego.type = "button";
    pie.appendChild(ir); pie.appendChild(luego); caja.appendChild(pie);
    caja.appendChild(el("p", "sfw-nota", "Esta pantalla aparece una sola vez. Tu perfil está siempre en el menú, en Perfil."));
    fondo.appendChild(caja); document.body.appendChild(fondo);
    document.documentElement.classList.add("sfw-abierta");
    function cerrar(destino) {
      fondo.remove(); abierta = false; document.documentElement.classList.remove("sfw-abierta");
      document.removeEventListener("keydown", tecla);
      rpc("bienvenida_lista").catch(function () {});
      if (destino === "bicis" && H.irABicis) H.irABicis();
      else if (destino && H.irAPerfil) H.irAPerfil();
      else if (antes && antes.focus) antes.focus();
    }
    function tecla(ev) { if (ev.key === "Escape") cerrar(null); }
    document.addEventListener("keydown", tecla);
    ir.addEventListener("click", function () { cerrar(!e.esEntrenador && e.datosCompletos && !e.bicis ? "bicis" : "perfil"); });
    luego.addEventListener("click", function () { cerrar(null); });
    try { ir.focus({ preventScroll: true }); } catch (er) { ir.focus(); }
    fondo.scrollTop = 0;
  }

  function revisar() {
    if (!H) return Promise.resolve(false);
    return rpc("bienvenida_estado").then(function (e) { if (e && e.mostrar) { mostrar(e); return true; } return false; }, function () { return false; });
  }

  window.SFBienvenida = { iniciar: function (h) { H = h; }, revisar: revisar };
})();
