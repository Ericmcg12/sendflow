/* SendFlow · nube (pantalla). Panel único para la app y la web de análisis.
   SFNubeUI.abrir({ modo: "app" | "web", foco: "bajadas" | "perfiles" })
   - app: sube las bajadas guardadas y manda/trae perfiles.
   - web: trae las bajadas de la cuenta a este navegador y manda/trae perfiles. */
(function () {
  "use strict";
  var CSS = "\
.sfn{position:fixed;inset:0;z-index:9999;background:rgba(7,11,12,.94);backdrop-filter:blur(10px);overflow:auto;padding:22px 16px 60px;font-family:'Roboto Mono',ui-monospace,Menlo,Consolas,monospace;color:#f2f5f4;}\
.sfn *{box-sizing:border-box;}\
.sfn.directo{background:#070b0c;backdrop-filter:none;}\
.sfn-caja{max-width:760px;margin:0 auto;}\
.sfn-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;}\
.sfn h2{margin:0;font:700 22px/1.1 -apple-system,'Segoe UI',system-ui,sans-serif;letter-spacing:.2px;}\
.sfn h2 span{color:#4fe3c2;}\
.sfn-sub{color:#8b9a98;font:13.5px/1.55 'IBM Plex Sans',system-ui,sans-serif;margin:6px 0 18px;}\
.sfn-sec{border:1px solid #232b2c;border-radius:8px;background:linear-gradient(180deg,rgba(21,27,28,.95),rgba(17,23,26,.95));padding:16px;margin-bottom:14px;}\
.sfn-tit{display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#4fe3c2;font-weight:600;margin:0 0 12px;}\
.sfn-tit::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#2e393a,transparent);}\
.sfn label{display:block;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8b9a98;font-weight:600;margin:10px 0 5px;}\
.sfn input{width:100%;padding:11px 12px;font:14px 'Roboto Mono',monospace;color:#f2f5f4;background:#070b0c;border:1px solid #2e393a;border-radius:2px;}\
.sfn input:focus{outline:none;border-color:#4fe3c2;box-shadow:0 0 0 3px rgba(79,227,194,.15);}\
.sfn-clave{position:relative;}.sfn-clave input{padding-right:44px;}\
.sfn-ojo{position:absolute;right:3px;top:50%;transform:translateY(-50%);width:36px;height:36px;display:grid;place-items:center;background:none;border:0;border-radius:2px;color:#8b9a98;cursor:pointer;}\
.sfn-ojo:hover{color:#ffbd00;}.sfn-ojo[aria-pressed=true]{color:#4fe3c2;}\
.sfn-b{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 14px;border-radius:2px;border:1px solid #2e393a;background:#151b1c;color:#f2f5f4;cursor:pointer;font:600 11px/1 'Roboto Mono',monospace;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;transition:border-color .2s,color .2s,transform .15s;}\
.sfn-b:hover{border-color:rgba(255,189,0,.5);color:#ffbd00;}\
.sfn-b:active{transform:scale(.97);}\
.sfn-b.p{background:linear-gradient(135deg,#4fe3c2,#2bb89a);color:#04211c;border-color:transparent;box-shadow:0 6px 24px rgba(79,227,194,.35);}\
.sfn-b.p:hover{color:#04211c;filter:brightness(1.08);}\
.sfn-b.c{height:30px;padding:0 10px;font-size:10px;}\
.sfn-b.r:hover{border-color:#e0483f;color:#e0483f;}\
.sfn-b[disabled]{opacity:.45;pointer-events:none;}\
.sfn-fila{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}\
.sfn-lista{display:flex;flex-direction:column;gap:8px;margin-top:10px;}\
.sfn-item{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid #232b2c;border-left:3px solid #4fe3c2;border-radius:0 6px 6px 0;background:rgba(7,11,12,.55);}\
.sfn-item b{font-weight:600;font-size:13px;}\
.sfn-item small{display:block;color:#8b9a98;font:12px 'IBM Plex Sans',system-ui,sans-serif;margin-top:2px;}\
.sfn-ok{color:#4fe3c2;font-size:11px;letter-spacing:.08em;}\
.sfn-aviso{margin-top:12px;padding:10px 12px;border-radius:4px;background:#151b1c;border:1px solid #2e393a;font:13.5px/1.5 'IBM Plex Sans',system-ui,sans-serif;}\
.sfn-aviso.e{border-color:#e0483f;color:#ffb4ae;}\
.sfn-aviso.ok{border-color:#4fe3c2;color:#4fe3c2;}\
.sfn-vacio{color:#8b9a98;font:13.5px/1.6 'IBM Plex Sans',system-ui,sans-serif;padding:10px 0;}\
.sfn-onda{position:absolute;border-radius:50%;transform:scale(0);background:rgba(255,255,255,.35);pointer-events:none;animation:sfn-onda .6s ease-out forwards;}\
@keyframes sfn-onda{to{transform:scale(4);opacity:0;}}\
@keyframes sfn-entra{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}\
.sfn-caja>*{animation:sfn-entra .45s cubic-bezier(.2,.8,.2,1) both;}\
.sfn-caja>*:nth-child(2){animation-delay:.05s}.sfn-caja>*:nth-child(3){animation-delay:.1s}.sfn-caja>*:nth-child(4){animation-delay:.15s}.sfn-caja>*:nth-child(5){animation-delay:.2s}\
@media (prefers-reduced-motion:reduce){.sfn *{animation:none !important;transition:none !important;}}";

  var panel = null, modo = "web", usuario = null, directo = false;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, cls, fn) {
    var b = el("button", "sfn-b " + (cls || ""), txt); b.type = "button";
    b.addEventListener("click", function (ev) {
      var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height), o = el("span", "sfn-onda");
      o.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (ev.clientX - r.left - d / 2) + "px;top:" + (ev.clientY - r.top - d / 2) + "px";
      b.appendChild(o); setTimeout(function () { o.remove(); }, 650);
      fn(b);
    });
    return b;
  }
  function aviso(cont, txt, tipo) {
    var a = cont.querySelector(".sfn-aviso"); if (!a) { a = el("div", "sfn-aviso"); cont.appendChild(a); }
    a.className = "sfn-aviso" + (tipo ? " " + tipo : ""); a.textContent = txt; a.hidden = !txt;
  }
  function tam(b) { if (!b) return ""; return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function fechaTxt(f) { try { return new Date(f).toLocaleString("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return f || ""; } }
  function refrescarListas() {
    try { if (typeof renderizarListaPerfiles === "function") renderizarListaPerfiles(); } catch (e) {}
    try { if (typeof renderizarListaGuardados === "function") renderizarListaGuardados(); } catch (e) {}
  }
  function cerrar() { if (panel) { panel.remove(); panel = null; refrescarListas(); } }
  function salirDirecto() { (window.top || window).location.href = "/"; }
  function sinConexion() { return navigator.onLine === false; }

  /* ---------- importar una bajada de la nube a este navegador (usa el importador de la app) ---------- */
  function importarEnWeb(blob, nombre) {
    return new Promise(function (ok, mal) {
      var inp = document.getElementById("inputImportarBase"), av = document.getElementById("avisoRespaldo");
      if (!inp || !av) { mal(new Error("No se encontró el importador de la app.")); return; }
      av.textContent = "";
      var fin = false, mo = new MutationObserver(function () {
        var t = av.textContent || "";
        if (/^Importado/.test(t)) { fin = true; mo.disconnect(); ok(t); }
        else if (/^No se pudo importar/.test(t)) { fin = true; mo.disconnect(); mal(new Error(t)); }
      });
      mo.observe(av, { childList: true, characterData: true, subtree: true });
      var dt = new DataTransfer(); dt.items.add(new File([blob], nombre || "bajada.sfdb"));
      inp.files = dt.files;
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      setTimeout(function () { if (!fin) { mo.disconnect(); mal(new Error("La importación tardó demasiado.")); } }, 120000);
    });
  }

  /* ---------- secciones ---------- */
  function seccionCuenta(cont, alCambiar) {
    var s = el("div", "sfn-sec"); s.appendChild(el("p", "sfn-tit", "Tu cuenta"));
    if (usuario) {
      var f = el("div", "sfn-fila");
      f.appendChild(el("span", "sfn-ok", "● " + usuario.email));
      f.appendChild(btn("Salir", "c r", function () { window.SFNube.salir().then(function () { usuario = null; alCambiar(); }); }));
      s.appendChild(f);
    } else {
      s.appendChild(el("p", "sfn-sub", "Entrá con la misma cuenta de sendflow.bike. Sin sesión todo sigue funcionando; la nube es opcional."));
      var le = el("label", "", "Email"), ie = el("input"); ie.type = "email"; ie.autocomplete = "email";
      var lc = el("label", "", "Contraseña"), ic = el("input"); ic.type = "password"; ic.autocomplete = "current-password";
      var cc = el("div", "sfn-clave"), ojo = el("button", "sfn-ojo"), OA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>', OC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A10.7 10.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
      ojo.type = "button";
      var ver = function (v) { ic.type = v ? "text" : "password"; ojo.innerHTML = v ? OC : OA; ojo.setAttribute("aria-pressed", v ? "true" : "false"); ojo.setAttribute("aria-label", v ? "Ocultar contraseña" : "Mostrar contraseña"); ojo.title = ojo.getAttribute("aria-label"); };
      ver(false); ojo.addEventListener("click", function () { ver(ic.type === "password"); ic.focus(); });
      cc.appendChild(ic); cc.appendChild(ojo);
      s.appendChild(le); s.appendChild(ie); s.appendChild(lc); s.appendChild(cc);
      var fb = el("div", "sfn-fila"); fb.style.marginTop = "14px";
      var go = function (b) {
        if (sinConexion()) { aviso(s, "Sin conexión: la cuenta se usa solo cuando hay señal.", "e"); return; }
        b.disabled = true; aviso(s, "Entrando…");
        window.SFNube.entrar(ie.value.trim(), ic.value).then(function (se) { usuario = se.user; alCambiar(); },
          function (e) { b.disabled = false; aviso(s, window.SFNube.msg(e), "e"); });
      };
      fb.appendChild(btn("Entrar", "p", go));
      ic.addEventListener("keydown", function (e) { if (e.key === "Enter") go(fb.firstChild); });
      s.appendChild(fb);
    }
    cont.appendChild(s);
  }

  function seccionPerfiles(cont) {
    var s = el("div", "sfn-sec"); s.appendChild(el("p", "sfn-tit", "Perfiles de piloto y bici"));
    s.appendChild(el("p", "sfn-sub", "Cada combinación piloto + bici es un perfil. Se mandan y se traen en los dos sentidos; si hay dos versiones, gana la última edición."));
    var f = el("div", "sfn-fila");
    var accion = function (txt, fn) {
      return btn(txt, txt.indexOf("Traer") === 0 ? "p" : "", function (b) {
        if (sinConexion()) { aviso(s, "Sin conexión: probá de nuevo cuando tengas señal.", "e"); return; }
        b.disabled = true; aviso(s, "Un momento…");
        fn().then(function (m) { b.disabled = false; aviso(s, m, "ok"); }, function (e) { b.disabled = false; aviso(s, window.SFNube.msg(e), "e"); });
      });
    };
    f.appendChild(accion("Traer de mi cuenta", function () {
      return window.SFNube.traerPerfiles().then(function (r) {
        return r.total ? "Listo: " + r.nuevos + " nuevo(s), " + r.actualizados + " actualizado(s), " + (r.total - r.nuevos - r.actualizados) + " ya estaban al día." : "Tu cuenta todavía no tiene perfiles. Subilos desde la app.";
      });
    }));
    f.appendChild(accion("Enviar a mi cuenta", function () {
      return window.SFNube.enviarPerfiles().then(function (r) {
        return r.enviados ? r.enviados + " perfil(es) enviado(s). La app los trae con «Traer de mi cuenta»." : (r.total ? "Tu cuenta ya tiene la última versión de todos los perfiles." : "No hay perfiles en este dispositivo para enviar.");
      });
    }));
    s.appendChild(f); cont.appendChild(s);
  }

  function seccionBajadasWeb(cont) {
    var s = el("div", "sfn-sec"); s.appendChild(el("p", "sfn-tit", "Bajadas en tu cuenta"));
    s.appendChild(el("p", "sfn-sub", "Las que subió la app cuando tuvo señal. «Traer» las copia a este navegador y quedan en IMPORTAR BAJADA › Guardadas."));
    var lista = el("div", "sfn-lista"); s.appendChild(lista); cont.appendChild(s);
    lista.appendChild(el("div", "sfn-vacio", "Buscando…"));
    Promise.all([window.SFNube.bajadasNube(), window.SFNube.bajadasLocales()]).then(function (r) {
      var nube = r[0], locales = {}; r[1].forEach(function (b) { locales[b.nombre + "|" + b.fecha] = 1; });
      lista.textContent = "";
      if (!nube.length) { lista.appendChild(el("div", "sfn-vacio", "Todavía no hay bajadas en tu cuenta. En la app, abrí «SendFlow nube» y tocá «Subir».")); return; }
      nube.forEach(function (fila) {
        var nombre = (fila.metadatos && fila.metadatos.nombre) || "Bajada";
        var it = el("div", "sfn-item"), txt = el("div"), b = el("b", "", nombre), sm = el("small", "",
          fechaTxt(fila.fecha) + (fila.pista ? " · " + fila.pista : "") + " · " + tam(fila.tamano_bytes));
        txt.appendChild(b); txt.appendChild(sm); it.appendChild(txt);
        var acc = el("div", "sfn-fila");
        var ya = !!locales[nombre + "|" + new Date(fila.fecha).toISOString()];
        if (ya) acc.appendChild(el("span", "sfn-ok", "✓ ya está acá"));
        else acc.appendChild(btn("Traer", "c p", function (bt) {
          if (sinConexion()) { aviso(s, "Sin conexión.", "e"); return; }
          bt.disabled = true; aviso(s, "Bajando «" + nombre + "»…");
          window.SFNube.bajarBajada(fila).then(function (blob) { return importarEnWeb(blob, nombre + ".sfdb"); })
            .then(function () { aviso(s, "«" + nombre + "» quedó en Guardadas.", "ok"); acc.textContent = ""; acc.appendChild(el("span", "sfn-ok", "✓ ya está acá")); },
              function (e) { bt.disabled = false; aviso(s, window.SFNube.msg(e), "e"); });
        }));
        var pend = false;
        acc.appendChild(btn("Quitar de la nube", "c r", function (bt) {
          if (!pend) { pend = true; bt.textContent = "¿Seguro? Tocá de nuevo"; setTimeout(function () { pend = false; bt.textContent = "Quitar de la nube"; }, 4000); return; }
          bt.disabled = true;
          window.SFNube.borrarBajadaNube(fila).then(function () { it.remove(); aviso(s, "Quitada de la nube (la copia que tengas en la app no se toca).", "ok"); },
            function (e) { bt.disabled = false; aviso(s, window.SFNube.msg(e), "e"); });
        }));
        it.appendChild(acc); lista.appendChild(it);
      });
    }, function (e) { lista.textContent = ""; aviso(s, window.SFNube.msg(e), "e"); });
  }

  function seccionBajadasApp(cont) {
    var s = el("div", "sfn-sec"); s.appendChild(el("p", "sfn-tit", "Bajadas guardadas en esta app"));
    s.appendChild(el("p", "sfn-sub", "Elegí cuáles subir a tu cuenta (hace falta señal). Las que ya están arriba no se duplican."));
    var lista = el("div", "sfn-lista"); s.appendChild(lista); cont.appendChild(s);
    lista.appendChild(el("div", "sfn-vacio", "Buscando…"));
    Promise.all([window.SFNube.bajadasLocales(), sinConexion() ? Promise.resolve(null) : window.SFNube.bajadasNube().catch(function () { return null; })]).then(function (r) {
      var locales = r[0], nube = r[1], arriba = {};
      if (nube) nube.forEach(function (f) { arriba[(f.metadatos && f.metadatos.nombre || "") + "|" + new Date(f.fecha).toISOString()] = 1; });
      lista.textContent = "";
      if (!locales.length) { lista.appendChild(el("div", "sfn-vacio", "No hay bajadas guardadas en la app.")); return; }
      var pendientes = [];
      locales.sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); }).forEach(function (b) {
        var it = el("div", "sfn-item"), txt = el("div");
        txt.appendChild(el("b", "", b.nombre || "Bajada")); txt.appendChild(el("small", "", fechaTxt(b.fecha) + (b.pista ? " · " + b.pista : "")));
        it.appendChild(txt);
        var acc = el("div", "sfn-fila"), ya = !!arriba[(b.nombre || "") + "|" + new Date(b.fecha).toISOString()];
        var subir = function (bt) {
          if (sinConexion()) { aviso(s, "Sin conexión: subí cuando tengas señal.", "e"); return Promise.resolve(); }
          if (bt) bt.disabled = true; aviso(s, "Subiendo «" + b.nombre + "»…");
          return window.SFNube.subirBajada(b.id, function (t) { aviso(s, "«" + b.nombre + "»: " + t); }).then(function (r) { acc.textContent = ""; acc.appendChild(el("span", "sfn-ok", "✓ en la nube")); aviso(s, "«" + b.nombre + "» subida (" + r.mb.toFixed(1) + " MB · preparar " + r.prepararS.toFixed(1) + " s · enviar " + r.subirS.toFixed(1) + " s).", "ok"); },
            function (e) { if (bt) bt.disabled = false; aviso(s, window.SFNube.msg(e), "e"); });
        };
        if (ya) acc.appendChild(el("span", "sfn-ok", "✓ en la nube"));
        else { acc.appendChild(btn("Subir", "c p", subir)); pendientes.push(function () { return subir(null); }); }
        it.appendChild(acc); lista.appendChild(it);
      });
      if (pendientes.length > 1) {
        var todas = btn("Subir todas las nuevas (" + pendientes.length + ")", "", function (bt) {
          bt.disabled = true;
          pendientes.reduce(function (c, f) { return c.then(f); }, Promise.resolve()).then(function () { bt.remove(); });
        });
        todas.style.marginTop = "10px"; s.insertBefore(todas, lista);
      }
    });
  }


  function seccionAjustes(cont) {
    var s = el("div", "sfn-sec"); s.appendChild(el("p", "sfn-tit", "Ajustes de la app"));
    s.appendChild(el("p", "sfn-sub", "Configuración del Sender y del mapa. La contraseña WiFi del Sender no se sube. Al traerlos, reiniciá la app para que se apliquen."));
    var f = el("div", "sfn-fila");
    var accion = function (txt, p, fn) {
      return btn(txt, p, function (b) {
        if (sinConexion()) { aviso(s, "Sin conexión: probá de nuevo cuando tengas señal.", "e"); return; }
        b.disabled = true; aviso(s, "Un momento…");
        fn().then(function (m) { b.disabled = false; aviso(s, m, "ok"); }, function (e) { b.disabled = false; aviso(s, window.SFNube.msg(e), "e"); });
      });
    };
    f.appendChild(accion("Enviar a mi cuenta", "", function () {
      return window.SFNube.enviarAjustes().then(function (n) { return n ? "Ajustes enviados." : "No hay ajustes guardados para enviar."; });
    }));
    f.appendChild(accion("Traer de mi cuenta", "", function () {
      return window.SFNube.traerAjustes().then(function (n) { return n ? "Ajustes traídos. Reiniciá la app para aplicarlos." : "Tu cuenta todavía no tiene ajustes guardados."; });
    }));
    s.appendChild(f); cont.appendChild(s);
  }

  function dibujar() {
    panel.textContent = "";
    var caja = el("div", "sfn-caja"); panel.appendChild(caja);
    var cab = el("div", "sfn-cab"), h = el("h2"); h.innerHTML = "Send<span>Flow</span> · nube"; cab.appendChild(h);
    var bcab = el("div", "sfn-fila");
    if (directo) {
      bcab.appendChild(btn("Ir al análisis", "c", function () { document.documentElement.classList.remove("sf-directo"); cerrar(); }));
      bcab.appendChild(btn("← Volver a SendFlow", "c", salirDirecto));
    } else bcab.appendChild(btn("Cerrar", "c", cerrar));
    cab.appendChild(bcab); caja.appendChild(cab);
    caja.appendChild(el("p", "sfn-sub", modo === "app"
      ? "Tus datos siguen en este dispositivo. Acá los subís a tu cuenta, solo cuando vos lo pedís."
      : "Los datos que la app subió a tu cuenta, para verlos en pantalla grande. Acá no hay conexión con el Sender."));
    seccionCuenta(caja, dibujar);
    if (!usuario) return;
    if (modo === "app") { seccionBajadasApp(caja); seccionPerfiles(caja); seccionAjustes(caja); } else { seccionBajadasWeb(caja); seccionPerfiles(caja); }
    if (window.__sfnFoco) { var t = caja.querySelectorAll(".sfn-sec")[window.__sfnFoco === "perfiles" ? 2 : 1]; if (t) t.scrollIntoView({ block: "start" }); window.__sfnFoco = null; }
  }

  function abrir(op) {
    op = op || {}; modo = op.modo || "web"; window.__sfnFoco = op.foco || null; directo = !!op.directo;
    if (!document.getElementById("sfn-css")) { var st = el("style"); st.id = "sfn-css"; st.textContent = CSS; document.head.appendChild(st); }
    cerrar(); panel = el("div", "sfn" + (directo ? " directo" : "")); panel.setAttribute("role", "dialog"); document.body.appendChild(panel);
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { document.removeEventListener("keydown", esc); if (directo) salirDirecto(); else cerrar(); } });
    panel.textContent = "Cargando…";
    window.SFNube.sesion().then(function (se) { usuario = se ? se.user : null; dibujar(); }, function () { usuario = null; dibujar(); });
  }
  window.SFNubeUI = { abrir: abrir, cerrar: cerrar };
})();
