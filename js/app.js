// ============================================================================
// app.js — SendFlow Coach: ingreso y registro, navegación según el modo
// (entrenador o piloto), Inicio, Pilotos, lista de Análisis, Bajadas del
// Sender y Perfil. El estudio de video está en estudio.js. Los datos viven en
// el servidor (api.js).
// ============================================================================
(function () {
  "use strict";
  const { $, $$, html, esc, tiempo, fecha, iniciales, ICONOS, aviso, abrirModal, confirmar, entradaEscalonada, contar, dibujarTrazos } = UI;

  const COLORES_PILOTO = ["#4fe3c2", "#ffbd00", "#4a9eff", "#ff8a4a", "#a35bf0", "#e0483f", "#5cc85c", "#f2f5f4"];
  const DISCIPLINAS = ["Descenso (DH)", "Enduro", "XC", "Dirt / Slopestyle", "BMX Race", "Otra"];
  const NIVELES = ["Principiante", "Intermedio", "Avanzado", "Experto", "Élite"];
  const vista = () => $("#vista");
  let USUARIO = null;
  const RECUPERACION = /type=recovery/.test(location.hash);
  const esCoach = () => USUARIO && USUARIO.modo === "coach";

  const ICONO_NAV = {
    archivos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>',
    planes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14.5l2 2 3.5-4"/></svg>',
    recibidos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 13l2-8h10l2 8v6H5z"/></svg>',
    enviar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>',
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    pilotos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.6c2.3.3 3.9 1.9 4.5 4.4"/></svg>',
    analisis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="M16.5 10l5-3v10l-5-3"/><path d="M6 15l3-4 2 2.5 2-2.5"/></svg>',
    bajadas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 4-7 5 5"/><path d="M3 21h18"/></svg>',
    mensajes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    perfil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/></svg>'
  };

  // Direcciones limpias: sendflow.coach/bajadas (antes sendflow.coach/#/bajadas)
  function irA(destino) {
    const p = "/" + String(destino || "").replace(/^#?\/?/, "");
    if (location.pathname !== p || location.hash) history.pushState(null, "", p);
    navegar();
  }
  window.irA = irA;
  // enlaces antiguos con "#/..." -> misma página sin "#"
  if (/^#\//.test(location.hash)) history.replaceState(null, "", "/" + location.hash.slice(2));
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    const href = a.getAttribute("href");
    if (!/^\/(?!\/)/.test(href) || /\.[a-z0-9]{2,4}$/i.test(href)) return;
    e.preventDefault(); irA(href);
  });

  // ================================================================ Arranque y sesión
  const desdeBike = () => { try { return localStorage.getItem("sf-desde-bike") === "1"; } catch (e) { return false; } };
  const ICONO_BIKE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l-6 6 6 6"/><path d="M4 12h16"/></svg>`;
  async function arrancar() {
    await API.listo;
    if (window.__paseFallo) aviso("No se pudo entrar directo desde Bike (" + window.__paseFallo + "). Ingresá con tu mail y contraseña.", "oro");
    let sinPase = null; try { sinPase = sessionStorage.getItem("sf-sinpase"); sessionStorage.removeItem("sf-sinpase"); } catch (e) {}
    if (sinPase && !API.token) aviso("No se pudo entrar directo desde Bike: " + sinPase + ". Ingresá con tu mail y contraseña.", "oro");
    API.alVencerSesion(() => { USUARIO = null; aviso("Tu sesión venció. Ingresá de nuevo.", "oro"); pantallaIngreso(); });
    if (RECUPERACION) { try { await API.sb.auth.getSession(); } catch (e) {} return pantallaNuevaClave(); }
    if (!API.token) return pantallaIngreso();
    try {
      const r = await API.get("yo");
      entrar(r.usuario, false);
    } catch (e) {
      if (e.status === 401) return; // alVencer ya mostró el ingreso
      pantallaIngreso(e.message);
    }
  }
  function entrar(usuario, saludar) {
    USUARIO = usuario;
    if (window.SFAvisos && API.sb) { SFAvisos.configurar(API.sb, "coach"); SFAvisos.sincronizar(); }   // v27
    document.body.classList.remove("sin-sesion");
    construirNav();
    if (window.CoachEntrada) CoachEntrada.mostrar(usuario, usuario.modo === "coach");   // v47
    if (window.CoachLibres) CoachLibres.bienvenida();   // v51: primera vez
    if (saludar) aviso(`Hola, ${usuario.nombre.split(" ")[0]}.`);
    if (location.pathname === "/" || location.pathname === "/ingreso") irA("/inicio"); else navegar();
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-accion=salir-nav],[data-accion=reinvitar]"); if (!b) return;
    if (b.dataset.accion === "salir-nav") return salir();
    const p = ((window.__pilotoActual) || {});
    const mail = b.dataset.email;
    b.disabled = true;
    let caja = b.parentElement.querySelector(".res-invitacion");
    if (!caja) { caja = document.createElement("p"); caja.className = "res-invitacion ayuda"; b.parentElement.appendChild(caja); }
    caja.textContent = "Enviando…";
    try { await API.invitar(mail); caja.textContent = "Invitación reenviada a " + mail + ". Si no le llega, que revise spam."; aviso("Invitación reenviada a " + mail + ".", "oro"); }
    catch (er) { caja.textContent = "No se pudo enviar: " + er.message; aviso("No se pudo enviar la invitación: " + er.message, "error"); }
    b.disabled = false;
  });
  function salir() {
    const aBike = desdeBike();
    let listo = false;
    const terminar = () => {
      if (listo) return; listo = true;
      SFPuente.borrarSesion(); API.guardarToken(null); USUARIO = null; if (window.CoachEntrada) CoachEntrada.olvidar();
      location.replace(aBike ? SFPuente.BIKE + "?salir=1" : "/ingreso");
    };
    try { API.sb.auth.signOut({ scope: "local" }).then(terminar, terminar); } catch (e) { terminar(); }
    setTimeout(terminar, 1500);
  }

  function construirNav() {
    const items = esCoach()
      ? [["inicio", "Inicio"], ["archivos", "Archivos"], ["pilotos", "Pilotos"], ["planes", "Planes"], ["mensajes", "Mensajes"], ["perfil", "Perfil"]]
      : [["inicio", "Inicio"], ["archivos", "Archivos"], ["planes", "Mi plan"], ["mensajes", "Mensajes"], ["perfil", "Perfil"]];
    $(".nav-items").innerHTML = items.map(([r, t]) => `<a class="nav-item" href="/${r}" data-ruta="${r}">${ICONO_NAV[r]}<span>${t}</span></a>`).join("") + (desdeBike() ? `<a class="nav-item volver-bike" href="https://sendflow.bike/">${ICONO_BIKE}<span>Volver a Bike</span></a>` : "") + `<button class="nav-item" type="button" data-accion="salir-nav"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5v16h4"/><path d="M16 8l4 4-4 4M20 12H9"/></svg><span>Salir</span></button>`;
    $(".nav-pie").innerHTML = `<b>${esc(USUARIO.nombre)}</b><br>${esCoach() ? "Entrenador" : "Piloto"}`;
    const vb = $(".barra-movil .volver-bike"); if (vb) vb.classList.toggle("oculto", !desdeBike());
    if (esCoach()) setTimeout(() => actualizarInsignia(), 0);
    setTimeout(actualizarAvisos, 0);
  }

  // ================================================================ Pantalla de ingreso
  function pantallaIngreso(error) {
    document.body.classList.add("sin-sesion");
    if (window.CoachEntrada) CoachEntrada.olvidar();   // v47: el próximo ingreso vuelve a mostrar la entrada
    if (window.CoachLibres) CoachLibres.olvidar();
    if (window.Estudio) Estudio.cerrar();
    rutaActual = "ingreso";
    if (location.pathname !== "/ingreso") history.replaceState(null, "", "/ingreso");
    const v = vista();
    v.innerHTML = "";
    let modoReg = "coach", pestana = "entrar";
    const el = html(`<div class="ingreso">
      <div class="ingreso-lado ingreso-marca"><svg class="ingreso-zigzag" viewBox="0 0 200 120" aria-hidden="true"><path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100" fill="none" stroke="#4fe3c2" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="85" cy="28" r="8" fill="#fff"/></svg><div class="marca-txt">Send<span class="flow">Flow</span></div><span class="marca-coach">COACH</span></div>
      <div class="ingreso-caja tarjeta" role="region" aria-label="Acceso">
        <div class="tipo-tag" role="tablist">
          <button class="btn chico sel" type="button" role="tab" data-p="entrar">Entrar</button>
          <button class="btn chico" type="button" role="tab" data-p="crear">Crear cuenta</button>
        </div>
        <form class="form-grilla una-col" novalidate>
          <div class="campo solo-crear oculto"><label>Nombre</label><input class="input" name="nombre" autocomplete="name" maxlength="120"></div>
          <div class="campo"><label>Email</label><input class="input" name="email" type="email" autocomplete="email" maxlength="190"></div>
          <div class="campo"><label>Contraseña <small class="solo-crear oculto">(mínimo 8 caracteres)</small></label><input class="input" name="clave" type="password" autocomplete="current-password" maxlength="200"></div>
          <div class="campo solo-crear oculto"><div id="captcha-coach" class="captcha-caja"></div>
            <small class="ayuda-chica">Tu cuenta la revisa y habilita el administrador; el tipo de cuenta (entrenador o piloto) lo asigna él. Es la misma cuenta de sendflow.bike.</small></div>
          <div class="error-form oculto"></div>
          <button class="btn primario ancho-total" type="submit">Entrar</button>
          <button class="btn-texto solo-entrar" type="button" data-accion="olvide">Olvidé mi contraseña</button>
        </form>
      </div>
      <div class="ingreso-lado ingreso-info">
        <p class="prosa">Análisis de video para entrenar pilotos de MTB: el entrenador marca, etiqueta y explica; el piloto lo ve desde su celular. Con los datos del Sender, todo explicado con números.</p>
        <ul class="familia">
          <li><strong>SendFlow Bike</strong><span>Analizá tus bajadas en la app o en la compu.</span></li>
          <li><strong>SendFlow Coach</strong><span>Planes, devoluciones y evolución con tu entrenador.</span></li>
          <li><strong>SendFlow Lab</strong><span>Suspensión en el taller, con historial de uso real.</span></li>
        </ul>
      </div></div>`);
    v.appendChild(el);
    dibujarTrazos($(".ingreso-zigzag", el), 1500);
    const form = $("form", el), err = $(".error-form", el), boton = $("[type=submit]", el);
    const mostrarError = (t) => { err.textContent = t; err.classList.toggle("oculto", !t); };
    if (error) mostrarError(error);
    $("[data-accion=olvide]", el).addEventListener("click", async () => {
      const em = $("[name=email]", form).value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { mostrarError("Escribí tu email arriba y volvé a tocar “Olvidé mi contraseña”."); return; }
      mostrarError("");
      const r = await API.sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + "/" });
      if (r.error) mostrarError(r.error.message || "No se pudo enviar el mail.");
      else aviso("Si ese email tiene cuenta, te mandamos un enlace para elegir otra contraseña.", "oro");
    });
    $$("[data-p]", el).forEach(b => b.addEventListener("click", () => {
      pestana = b.dataset.p;
      $$("[data-p]", el).forEach(x => x.classList.toggle("sel", x === b));
      $$(".solo-crear", el).forEach(x => x.classList.toggle("oculto", pestana !== "crear"));
      boton.textContent = pestana === "crear" ? "Crear cuenta" : "Entrar";
      $$(".solo-entrar", el).forEach(x => x.classList.toggle("oculto", pestana === "crear"));
      if (pestana === "crear" && window.__captchaCoach == null) {
        const montar = () => {
          const caja = $("#captcha-coach", el);
          if (!window.turnstile || !caja) return setTimeout(montar, 400);
          window.__captchaCoach = window.turnstile.render(caja, { sitekey: window.SENDFLOW_CONFIG.turnstileSiteKey, theme: "dark" });
        };
        montar();
      }
      $("[name=clave]", el).autocomplete = pestana === "crear" ? "new-password" : "current-password";
      mostrarError("");
    }));
    $$("[data-modo]", el).forEach(b => b.addEventListener("click", () => { modoReg = b.dataset.modo; $$("[data-modo]", el).forEach(x => x.classList.toggle("sel", x === b)); }));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      mostrarError("");
      const val = (n) => $(`[name=${n}]`, form).value.trim();
      boton.disabled = true;
      try {
        if (pestana === "crear") {
          const tk = window.__captchaCoach && window.turnstile ? window.turnstile.getResponse(window.__captchaCoach) : "";
          if (!tk) throw new Error("Completá la verificación anti-robots.");
          await API.post("registro", { nombre: val("nombre"), email: val("email"), clave: $("[name=clave]", form).value, captcha: tk });
          try { window.turnstile.reset(window.__captchaCoach); } catch (e2) {}
          boton.disabled = false;
          mostrarError("");
          aviso("Te mandamos un mail para confirmar tu cuenta. Después el administrador la habilita.", "oro");
          $("[data-p=entrar]", el).click();
          return;
        }
        const r = await API.post("login", { email: val("email"), clave: $("[name=clave]", form).value });
        API.guardarToken(r.token);
        entrar(r.usuario, true);
      } catch (ex) { mostrarError(ex.message); boton.disabled = false; }
    });
    UI.animar(el, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
    setTimeout(() => $("[name=email]", el).focus(), 100);
  }

  // ================================================================ Nueva contraseña (desde el mail de recuperación)
  function pantallaNuevaClave() {
    document.body.classList.add("sin-sesion");
    rutaActual = "ingreso";
    history.replaceState(null, "", "/ingreso");
    const v = vista(); v.innerHTML = "";
    const el = html(`<div class="ingreso"><div class="ingreso-lado ingreso-marca"><svg class="ingreso-zigzag" viewBox="0 0 200 120" aria-hidden="true"><path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100" fill="none" stroke="#4fe3c2" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="85" cy="28" r="8" fill="#fff"/></svg><div class="marca-txt">Send<span class="flow">Flow</span></div><span class="marca-coach">COACH</span></div>
      <div class="ingreso-caja tarjeta"><h2 class="titulo-caja">Nueva contraseña</h2>
        <form class="form-grilla una-col" novalidate>
          <div class="campo"><label>Contraseña nueva <small>(mínimo 8 caracteres)</small></label><input class="input" name="clave" type="password" autocomplete="new-password" maxlength="200"></div>
          <div class="error-form oculto"></div>
          <button class="btn primario ancho-total" type="submit">Guardar contraseña</button>
        </form></div></div>`);
    v.appendChild(el);
    const form = $("form", el), err = $(".error-form", el), boton = $("[type=submit]", el);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const clave = $("[name=clave]", form).value;
      if (clave.length < 8) { err.textContent = "La contraseña tiene que tener al menos 8 caracteres."; err.classList.remove("oculto"); return; }
      boton.disabled = true;
      const r = await API.sb.auth.updateUser({ password: clave });
      if (r.error) { err.textContent = r.error.message || "No se pudo guardar. Pedí otro enlace."; err.classList.remove("oculto"); boton.disabled = false; return; }
      aviso("Contraseña guardada.", "oro");
      try { const y = await API.get("yo"); entrar(y.usuario, true); } catch (ex) { pantallaIngreso(ex.message); }
    });
    setTimeout(() => $("[name=clave]", form).focus(), 100);
  }

  // ================================================================ Router
  let rutaActual = "";
  let navegando = false, navPendiente = false;
  async function navegar() {
    if (navegando) { navPendiente = true; return; }
    navegando = true;
    try { do { navPendiente = false; await navegarUna(); } while (navPendiente); } finally { navegando = false; }
  }
  async function navegarUna() {
    if (!USUARIO) return;
    const hash = location.pathname.replace(/^\/+|\/+$/g, "") || "inicio";
    let [seccion, id] = hash.split("/");
    // el entrenador tiene una sola biblioteca: las listas viejas llevan a ella
    if (esCoach() && (seccion === "recibidos" || (seccion === "analisis" && !id))) { seccion = "archivos"; history.replaceState(history.state, "", "/archivos"); }
    if (!esCoach() && (seccion === "enviar" || (seccion === "analisis" && !id))) { if (seccion === "enviar") window.__abrirEnviar = true; seccion = "archivos"; history.replaceState(history.state, "", "/archivos"); }
    if (seccion === "ingreso") { irA("#/inicio"); return; }
    if (window.Estudio && rutaActual.startsWith("analisis/") && hash !== rutaActual) Estudio.cerrar();
    rutaActual = hash;
    $$(".nav-item").forEach(a => a.classList.toggle("sel", a.dataset.ruta === seccion || (seccion === "plan" && a.dataset.ruta === "planes") || (seccion === "piloto" && a.dataset.ruta === "pilotos") || ((seccion === "recibido" || seccion === "comparar" || seccion === "analisis") && a.dataset.ruta === "archivos")));
    if (window.Comparar && seccion !== "comparar") Comparar.cerrar();
    if (window.CoachPerfil && seccion !== "perfil") CoachPerfil.salir();   // v49
    const v = vista();
    const salida = UI.animar(v, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(6px)" }], { duration: 120, fill: "forwards" });
    if (salida) await salida.finished.catch(() => {});
    v.innerHTML = "";
    window.scrollTo(0, 0);
    try {
      if (seccion === "inicio") { await (esCoach() ? inicioCoach(v) : inicioPiloto(v)); ofrecerAvisos(v); montarMensajes(v);
    if (esCoach() && window.SFEntrenadores) SFEntrenadores.pintarSolicitudes($("[data-slot=solicitudes]", v));   // v51
    // entrenador: tarjeta con lo que marcaron los pilotos (coach_v16.sql), arriba del saludo
    if (esCoach() && window.AtencionPilotos) AtencionPilotos.tarjeta().then(c => { const s = $("[data-slot=plan]", v); if (c && s && s.isConnected) { s.insertBefore(c, s.firstChild); entradaEscalonada(s, 0); } }).catch(() => {});   // v55: a quién mirar hoy
    if (esCoach() && window.ClasesConfirmar) ClasesConfirmar.tarjeta().then(c => { const s = $("[data-slot=plan]", v); if (c && s && s.isConnected) { s.insertBefore(c, s.firstChild); entradaEscalonada(s, 0); } }).catch(() => {});   // v57: confirmar el lugar de las clases
    if (esCoach() && window.AsistenciaClase) AsistenciaClase.tarjetaCoach().then(c => { const s = $("[data-slot=plan]", v); if (c && s && s.isConnected) { s.insertBefore(c, s.firstChild); entradaEscalonada(s, 0); } }).catch(() => {});   // v58: quién va a la clase
    if (esCoach() && window.Planes) Planes.actividad().then(c => { const s = $("[data-slot=plan]", v); if (c && s && s.isConnected) { s.appendChild(c); entradaEscalonada(s, 0); } }).catch(() => {}); }
      else if (seccion === "pilotos" && esCoach()) await pantallaPilotos(v);
      else if (seccion === "piloto" && id && esCoach()) await pantallaPiloto(v, id);
      else if (seccion === "recibidos" && esCoach()) await pantallaRecibidos(v);
      else if (seccion === "recibido" && id && esCoach()) await pantallaRecibido(v, id);
      else if (seccion === "enviar" && !esCoach()) await pantallaEnviar(v);
      else if (seccion === "analisis" && id) await Estudio.abrir(v, id, USUARIO);
      else if (seccion === "analisis") await pantallaAnalisis(v);
      else if (seccion === "comparar") await Comparar.abrir(v, new URLSearchParams(location.search));
      else if (seccion === "mensajes") await pantallaMensajes(v, id);
      else if (seccion === "bajadas") await pantallaBajadas(v);
      else if (seccion === "planes") await Planes.lista(v);
      else if (seccion === "archivos") await pantallaBiblioteca(v);
      else if (seccion === "plan" && id) await Planes.ver(v, id);
      else if (seccion === "perfil" && window.CoachPerfil && window.SFMiPerfil && window.SFEditorBici) await CoachPerfil.pintar(v, { usuario: USUARIO, esCoach: esCoach(), confirmar, aviso, alCambiarUsuario: (u) => { USUARIO = u; construirNav(); $$(".nav-item").forEach(a => a.classList.toggle("sel", a.dataset.ruta === "perfil")); } });   // v49: la ficha de Bike
      else if (seccion === "perfil" && window.SFAvisos) { await pantallaPerfil(v); const t0 = html(`<div class="tarjeta entra avisos-perfil"><div class="titulo-seccion" style="margin:0 0 10px">Avisos</div></div>`); t0.appendChild(SFAvisos.fila()); (v.firstElementChild || v).appendChild(t0); }
      else if (seccion === "perfil") await pantallaPerfil(v);
      else { irA("#/inicio"); return; }
    } catch (e) {
      console.error(e);
      if (USUARIO) v.innerHTML = `<div class="vacio">No se pudo abrir esta pantalla: ${esc(e.message || e)}</div>`;
    }
    if (salida) salida.cancel();
    UI.animar(v, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
    entradaEscalonada(v, 55);
  }
  window.addEventListener("popstate", () => { if (window.CoachPerfil && CoachPerfil.alVolver()) return; navegar(); });

  // ================================================================ Datos
  async function cargarCoach() {
    const [rp, ra] = await Promise.all([API.get("pilotos"), API.get("analisis")]);
    const pilotos = rp.pilotos, analisis = ra.analisis;
    return { pilotos, analisis, porId: Object.fromEntries(pilotos.map(p => [p.id, p])) };
  }

  // ================================================================ Piezas
  const avatar = (p, grande) => `<div class="avatar ${grande ? "grande" : ""}" style="--c:${esc((p && p.color) || "#4fe3c2")}">${esc(iniciales(p ? p.nombre : "?"))}</div>`;

  function tarjetaAnalisis(a, piloto) {
    const quien = esCoach() ? (piloto ? piloto.nombre : (a.pilotoNombre || "Sin piloto")) : ("Entrenador: " + (a.coachNombre || "—"));
    const colP = esCoach() ? ((piloto && piloto.color) || colorFijo(a.pilotoId || a.pilotoNombre)) : "";
    const el = html(`<article class="tarjeta click t-analisis entra ${colP ? "con-piloto" : ""}" tabindex="0" style="${colP ? "--cp:" + esc(colP) : ""}">
      <div class="mini ${a.soloDatos ? "datos" : ""}" style="${a.miniatura ? `background-image:url('${a.miniatura}')` : ""}">
        <div class="play"><span>${ICONOS.play}</span></div>
        ${a.soloDatos ? `<span class="chip violeta sender">SOLO DATOS</span>` : a.conSender ? `<span class="chip cian sender">DATOS DEL SENDER</span>` : ""}
        <span class="dur">${tiempo(a.duracion || 0, false)}</span>
      </div>
      <div class="cuerpo">
        ${colP ? `<div class="fila-sello">${sello(piloto ? piloto.nombre : (a.pilotoNombre || "Sin piloto"), colP)}</div>` : ""}<div class="tit">${esc(a.titulo || "Sin título")}</div>
        <div class="meta">${colP ? "" : esc(quien) + " · "}${a.pista ? esc(a.pista) + " · " : ""}${fecha(a.fecha || a.creado)}</div>
        <div class="cuenta"><span><b style="color:var(--cian)">${a.nBien || 0}</b> bien</span><span><b style="color:var(--rojo)">${a.nMejorar || 0}</b> a mejorar</span><span><b>${a.nAnotaciones || 0}</b> dibujos</span></div>${chipsConversacion(a)}
      </div></article>`);
    const ir = () => { irA("#/analisis/" + a.id); };
    el.addEventListener("click", ir);
    el.addEventListener("keydown", e => { if (e.key === "Enter") ir(); });
    return el;
  }

  function tarjetaPiloto(p, cantidad) {
    const el = html(`<article class="tarjeta click entra" tabindex="0">
      <div class="fila-piloto">${avatar(p)}<div style="min-width:0">
        <div class="nom">${esc(p.nombre)}</div>
        <div class="det">${esc([p.disciplina, p.categoria].filter(Boolean).join(" · ") || "—")}</div></div></div>
      <div class="chips" style="margin-top:14px">
        ${p.nivel ? `<span class="chip oro">${esc(p.nivel)}</span>` : ""}
        <span class="chip">${cantidad} análisis</span>
        ${p.vinculado ? `<span class="chip cian" title="Ve sus análisis con su propia cuenta">Con cuenta</span>` : (p.email ? `<span class="chip" title="Todavía no creó su cuenta con ${esc(p.email)}">Sin cuenta aún</span>` : "")}
      </div></article>`);
    const ir = () => { irA("#/piloto/" + p.id); };
    el.addEventListener("click", ir);
    el.addEventListener("keydown", e => { if (e.key === "Enter") ir(); });
    return el;
  }

  function hero(titulo, texto, acciones) {
    return `<section class="hero entra">
        <svg class="hero-zigzag" viewBox="0 0 200 120" aria-hidden="true">
          <defs><linearGradient id="gz" x1="0" x2="1"><stop offset="0" stop-color="#4fe3c2" stop-opacity=".2"/><stop offset=".5" stop-color="#4fe3c2"/><stop offset="1" stop-color="#4a9eff"/></linearGradient>
          <filter id="brz"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
          <path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100" fill="none" stroke="url(#gz)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" filter="url(#brz)" opacity=".7"/>
          <path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100" fill="none" stroke="url(#gz)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
          <circle class="hero-punto" cx="85" cy="28" r="5" fill="#fff" opacity="0"/>
        </svg>
        <span class="etiqueta" style="color:var(--oro)">${esCoach() ? "Entrenador" : "Piloto"} · ${esc(USUARIO.nombre)}</span>
        <h1 style="margin-top:10px">${titulo}</h1>
        <p>${texto}</p>
        <div class="acciones">${acciones || ""}</div>
      </section>`;
  }
  function cabInicio(acciones) {
    return `<div class="cab-pagina inicio-cab entra"><div><h1 class="titulo-pagina">Hola, <span class="saludo-nombre">${esc(String(USUARIO.nombre || "").split(" ")[0])}</span></h1><div class="sub-pagina">${esCoach() ? "Entrenador" : "Piloto"}</div></div>
        <div class="acciones-inicio">${acciones}</div></div>
      <div class="inicio-orden"><div data-slot="solicitudes" class="sfe-solicitudes" hidden></div><div data-slot="plan"></div><div data-slot="mensajes"></div></div>`;
  }
  function animarHero(v) {
    $$("[data-n]", v).forEach(el => contar(el, +el.dataset.n));
    const hz = $(".hero-zigzag", v); if (hz) dibujarTrazos(hz, 1600);
    const punto = $(".hero-punto", v);
    if (punto && punto.animate && !UI.sinMovimiento()) punto.animate([{ opacity: 0, r: 2 }, { opacity: 1, r: 9 }, { opacity: 1, r: 5 }], { duration: 700, delay: 900, fill: "forwards", easing: "cubic-bezier(.34,1.56,.64,1)" });
    else if (punto) punto.setAttribute("opacity", 1);
  }

  // v33: los mensajes, al frente en el Inicio (entrenador y piloto)
  async function montarMensajes(v) {
    if (!$("[data-slot=mensajes]", v)) return;
    let conv = []; try { conv = (await API.get("conversaciones")).conversaciones || []; } catch (e) { return; }
    const h = $("[data-slot=mensajes]", v); if (!h || !h.isConnected) return;   // se cambió de pantalla mientras cargaba
    const sin = conv.reduce((s, c) => s + (c.sinLeer || 0), 0);
    const otro = (c) => c.soyCoach ? (c.pilotoNombre || "Piloto") : (c.coachNombre || "Entrenador");
    const titulo = sin ? `${sin} mensaje${sin > 1 ? "s" : ""} sin leer` : (conv.length ? "Tus conversaciones" : (esCoach() ? "Hablá con tus pilotos" : "Hablá con tu entrenador"));
    const items = conv.slice(0, 3).map(c => `<a class="mi-item ${c.sinLeer ? "sin-leer" : ""}" href="/mensajes/${esc(c.analisisId)}"><div class="avatar" style="--c:#4fe3c2">${esc(iniciales(otro(c)))}</div><div class="mi-txt"><b>${esc(otro(c))}</b><small>${esc(c.titulo || "Sin título")}</small><span>${c.ultimoEsMio ? "Vos: " : ""}${esc(c.ultimoTexto || "")}</span></div>${c.sinLeer ? `<b class="insignia">${c.sinLeer}</b>` : `<span class="conv-hora">${haceCuanto(c.ultimo)}</span>`}</a>`).join("");
    const vacio = esCoach() ? "Las conversaciones empiezan desde un análisis, en su pestaña Mensajes. Acá vas a ver lo que te escriben tus pilotos." : "Las conversaciones empiezan desde una devolución de tu entrenador. Acá vas a ver lo que te escriba.";
    const card = html(`<section class="tarjeta entra mensajes-inicio ${sin ? "con-nuevos" : ""}">
      <div class="mi-cab"><div><span class="etiqueta" style="color:var(--oro)">Mensajes</span><h2>${titulo}</h2></div><a class="btn ${sin ? "primario" : ""}" href="/mensajes">${conv.length ? "Ver todos" : "Abrir mensajes"}</a></div>
      ${conv.length ? `<div class="mi-lista">${items}</div>` : `<p class="mi-vacio">${vacio}</p>`}</section>`);
    const cont = html(`<div class="mensajes-envoltorio"></div>`); cont.appendChild(card);
    h.innerHTML = ""; h.appendChild(cont);
    entradaEscalonada(cont, 0);
  }

  // ================================================================ Inicio (entrenador)
  async function inicioCoach(v) {
    const { pilotos, analisis, porId } = await cargarCoach();
    const nEtiq = analisis.reduce((s, a) => s + (a.nEtiquetas || 0), 0);
    const nSender = analisis.filter(a => a.conSender).length;
    v.appendChild(html(`<div>
      ${cabInicio(`<button class="btn" data-accion="nuevo-piloto">${ICONOS.mas}Agregar piloto</button><button class="btn" data-accion="nuevo-analisis" title="Para un piloto sin cuenta">${ICONOS.video}Subir video propio</button>`)}
      <div class="grilla g4" style="margin-top:16px">
        <div class="tarjeta kpi entra"><span class="etiqueta">Pilotos</span><span class="num cian" data-n="${pilotos.length}">0</span></div>
        <div class="tarjeta kpi entra"><span class="etiqueta">Análisis</span><span class="num oro" data-n="${analisis.length}">0</span></div>
        <div class="tarjeta kpi entra"><span class="etiqueta">Etiquetas</span><span class="num azul" data-n="${nEtiq}">0</span></div>
        <div class="tarjeta kpi entra"><span class="etiqueta">Con datos del Sender</span><span class="num violeta" data-n="${nSender}">0</span></div>
      </div>
      <div id="inicioRecientes"></div><div id="inicioPilotos"></div><div id="inicioPasos"></div></div>`));
    animarHero(v);
    $("[data-accion=nuevo-analisis]", v).addEventListener("click", () => nuevoAnalisis());
    $("[data-accion=nuevo-piloto]", v).addEventListener("click", () => editarPiloto());
    if (pilotos.length) {
      const cont = $("#inicioPilotos", v);
      cont.appendChild(html(`<div class="titulo-seccion entra">Pilotos</div>`));
      const g = html(`<div class="grilla g3"></div>`);
      pilotos.slice(0, 6).forEach(p => g.appendChild(tarjetaPiloto(p, analisis.filter(a => a.pilotoId === p.id).length)));
      cont.appendChild(g);
    }
    if (!analisis.length) {
      $("#inicioPasos", v).appendChild(html(`<div>
        <div class="titulo-seccion entra">Cómo se usa</div>
        <div class="grilla g3 pasos">
          <div class="tarjeta paso entra"><span class="n"></span><div><h3>Cargá tus pilotos</h3><p class="prosa" style="margin:0">Con su email: cuando el piloto cree su cuenta, ve sus análisis desde su celular.</p></div></div>
          <div class="tarjeta paso entra"><span class="n"></span><div><h3>Subí el video</h3><p class="prosa" style="margin:0">Avanzá cuadro a cuadro, dibujá, poné etiquetas de lo que está bien y lo que hay que mejorar, y grabá tu voz sobre el video.</p></div></div>
          <div class="tarjeta paso entra"><span class="n"></span><div><h3>Sumá el Sender</h3><p class="prosa" style="margin:0">Opcional: la bajada que el piloto mandó desde SendFlow, o el archivo .sfb, se ve sobre el video con saltos y frenadas marcados solos.</p></div></div>
        </div></div>`));
    }
  }

  // ================================================================ Inicio (piloto)
  async function inicioPiloto(v) {
    const [ra, re] = await Promise.all([API.get("analisis"), API.get("entrenadores")]);
    const analisis = ra.analisis, entrenadores = re.entrenadores;
    const bien = analisis.reduce((s, a) => s + (a.nBien || 0), 0), mejorar = analisis.reduce((s, a) => s + (a.nMejorar || 0), 0);
    v.appendChild(html(`<div>
      ${cabInicio(`<a class="btn primario" href="/enviar">${ICONOS.subir}Enviar video o bajada</a><a class="btn" href="/bajadas">Mis bajadas</a>`)}
      <div class="grilla g4" style="margin-top:16px">
        <div class="tarjeta kpi entra"><span class="etiqueta">Análisis</span><span class="num oro" data-n="${analisis.length}">0</span></div>
        <div class="tarjeta kpi entra"><span class="etiqueta">Lo que hacés bien</span><span class="num cian" data-n="${bien}">0</span></div>
        <div class="tarjeta kpi entra"><span class="etiqueta">A mejorar</span><span class="num" style="color:var(--rojo)" data-n="${mejorar}">0</span></div>
        <div class="tarjeta kpi entra"><span class="etiqueta">Entrenadores</span><span class="num azul" data-n="${entrenadores.length}">0</span></div>
      </div>
      <div id="inicioMejorar"></div><div id="inicioRecientes"></div></div>`));
    animarHero(v);
    const top = contarCategorias(analisis);
    if (top.length) $("#inicioMejorar", v).appendChild(html(`<div><div class="titulo-seccion entra">Lo que más se repite a mejorar</div>${barrasCategorias(top)}</div>`));
    const cont = $("#inicioRecientes", v);
    if (!analisis.length) {
      cont.appendChild(html(`<div class="vacio entra" style="margin-top:20px">${entrenadores.length ? "Todavía no te hicieron análisis." : `Todavía no tenés entrenador. Buscá uno en la lista de entrenadores, o pedile que te cargue como piloto con tu email: <b>${esc(USUARIO.email)}</b>.<br><a class="btn primario" style="margin-top:14px" href="/perfil#entrenadores">Buscar entrenador</a>`}</div>`));
    }
    $$(".nivel-barra i", v).forEach((b, i) => UI.animar(b, [{ width: "0%" }, { width: b.style.width }], { duration: 800, delay: 300 + i * 90, easing: "cubic-bezier(.2,.8,.2,1)" }));
    // v28: lo de hoy en el plan de entrenamiento
    if (window.Planes) {
      const arriba = html(`<div class="inicio-arriba"></div>`);
      const h0 = $("[data-slot=plan]", v); if (h0) h0.appendChild(arriba); else v.prepend(arriba);
      Promise.all([Planes.seguimiento().catch(() => null), Planes.tarjetaHoy(false).catch(() => null), window.AsistenciaClase ? AsistenciaClase.tarjetaPiloto().catch(() => null) : null]).then(([s, c, as]) => { if (as) arriba.appendChild(as); if (s) arriba.appendChild(s); if (c) arriba.appendChild(c); entradaEscalonada(arriba, 70); });   // v58: ¿vas a la clase?
    }
  }
  function contarCategorias(analisis) {
    const porCat = {};
    analisis.forEach(a => (a.categoriasMejorar || []).forEach(c => { porCat[c] = (porCat[c] || 0) + 1; }));
    return Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }
  function barrasCategorias(top) {
    const max = top.length ? top[0][1] : 1;
    return `<div class="tarjeta entra">${top.map(([c, n]) => `<div style="margin-top:10px;font-size:12px;display:flex;justify-content:space-between"><span>${esc(Estudio.nombreCategoria(c))}</span><b style="font-weight:500">${n}</b></div><div class="nivel-barra"><i style="width:${(n / max * 100).toFixed(0)}%"></i></div>`).join("")}</div>`;
  }

  // ================================================================ Pilotos (entrenador)
  async function pantallaPilotos(v) {
    const { pilotos, analisis } = await cargarCoach();
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Pilotos</h1><div class="sub-pagina">${pilotos.length ? pilotos.length + (pilotos.length === 1 ? " piloto" : " pilotos") : "Todavía no cargaste pilotos."}</div></div>
        <button class="btn primario" data-accion="nuevo">${ICONOS.mas}Agregar piloto</button></div>
      <div class="grilla g3" id="listaPilotos"></div></div>`));
    $("[data-accion=nuevo]", v).addEventListener("click", () => editarPiloto());
    const g = $("#listaPilotos", v);
    if (window.Grupos) Grupos.seccion($("#listaPilotos", v).parentNode).catch(() => {});   // v55: grupos de pilotos
    if (!pilotos.length) g.replaceWith(html(`<div class="vacio entra">Agregá el primer piloto para empezar a cargar sus análisis.<br>Si ponés su email, cuando cree su cuenta en SendFlow Coach va a ver sus análisis.</div>`));
    pilotos.forEach(p => g.appendChild(tarjetaPiloto(p, analisis.filter(a => a.pilotoId === p.id).length)));
  }

  async function pantallaPiloto(v, id) {
    const { pilotos, analisis } = await cargarCoach();
    const p = pilotos.find(x => x.id === id);
    if (!p) { v.innerHTML = `<div class="vacio">Ese piloto no existe.</div>`; return; }
    const lista = analisis.filter(a => a.pilotoId === id);
    const bien = lista.reduce((s, a) => s + (a.nBien || 0), 0), mejorar = lista.reduce((s, a) => s + (a.nMejorar || 0), 0);
    const top = contarCategorias(lista);
    v.appendChild(html(`<div>
      <a class="btn fantasma chico entra" href="/pilotos" style="margin-bottom:16px">${ICONOS.volver}Volver</a>
      <section class="tarjeta entra"><div class="ficha-cab">${avatar(p, true)}
        <div class="info"><h1>${esc(p.nombre)}</h1>
          <div class="chips" style="margin-top:6px">${p.vinculado ? `<span class="chip cian">Con cuenta · ${esc(p.email)}</span>` : (p.email ? `<span class="chip">Sin cuenta aún · ${esc(p.email)}</span><button type="button" class="btn chico fantasma" data-accion="reinvitar" data-email="${esc(p.email)}">Reenviar invitación</button>` : `<span class="chip">Sin email: no ve sus análisis</span>`)}</div>
          <div class="datos-fila">
            <div class="dato"><div class="etiqueta">Disciplina</div><div class="v">${esc(p.disciplina || "—")}</div></div>
            <div class="dato"><div class="etiqueta">Nivel</div><div class="v" style="color:var(--oro)">${esc(p.nivel || "—")}</div></div>
            <div class="dato"><div class="etiqueta">Categoría</div><div class="v">${esc(p.categoria || "—")}</div></div>
            <div class="dato"><div class="etiqueta">Bici</div><div class="v">${esc(p.bici || "—")}</div></div>
            <div class="dato"><div class="etiqueta">Peso</div><div class="v">${p.peso ? esc(p.peso) + " kg" : "—"}</div></div>
          </div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primario" data-accion="nuevo">${ICONOS.video}Nuevo análisis</button>
          <button class="btn icono" data-accion="editar" aria-label="Editar piloto" title="Editar piloto">${ICONOS.editar}</button>
          ${p.vinculado && p.usuarioId && window.SFCuenta ? `<button class="btn peligro cp-dejar" data-accion="dejar">Dejar de entrenar a este piloto</button>` : `<button class="btn icono peligro" data-accion="borrar" aria-label="Borrar piloto" title="Borrar piloto">${ICONOS.basura}</button>`}
        </div></div>
        ${p.notas ? `<p class="prosa" style="margin:16px 0 0">${esc(p.notas)}</p>` : ""}
      </section>
      <div class="grilla g4" style="margin-top:14px">
        <div class="tarjeta kpi entra"><span class="etiqueta">Análisis</span><span class="num oro" data-n="${lista.length}">0</span></div>
        <div class="tarjeta kpi entra"><span class="etiqueta">Lo que hace bien</span><span class="num cian" data-n="${bien}">0</span></div>
        <div class="tarjeta kpi entra"><span class="etiqueta">A mejorar</span><span class="num" style="color:var(--rojo)" data-n="${mejorar}">0</span></div>
        <div class="tarjeta entra"><span class="etiqueta">Lo que más se repite a mejorar</span>
          ${top.length ? top.map(([c, n]) => `<div style="margin-top:10px;font-size:12px;display:flex;justify-content:space-between"><span>${esc(Estudio.nombreCategoria(c))}</span><b style="font-weight:500">${n}</b></div><div class="nivel-barra"><i style="width:${(n / top[0][1] * 100).toFixed(0)}%"></i></div>`).join("") : `<div class="prosa" style="margin-top:10px;font-size:12.5px">Todavía no hay etiquetas para mejorar.</div>`}
        </div>
      </div>
      <div class="titulo-seccion entra">Análisis</div>
      <div class="grilla g3" id="listaAnalisisPiloto"></div>
      <div id="perfilesPiloto"></div></div>`));
    $$("[data-n]", v).forEach(el => contar(el, +el.dataset.n));
    $$(".nivel-barra i", v).forEach((b, i) => UI.animar(b, [{ width: "0%" }, { width: b.style.width }], { duration: 800, delay: 300 + i * 90, easing: "cubic-bezier(.2,.8,.2,1)" }));
    $("[data-accion=nuevo]", v).addEventListener("click", () => nuevoAnalisis(id));
    $("[data-accion=editar]", v).addEventListener("click", () => editarPiloto(p));
    const bDejar = $("[data-accion=dejar]", v);   // v50
    if (bDejar) bDejar.addEventListener("click", async () => {
      bDejar.disabled = true;
      const hecho = await SFCuenta.dejarPiloto({ id: p.usuarioId, nombre: p.nombre });
      bDejar.disabled = false;
      if (hecho) irA("/pilotos");
    });
    if ($("[data-accion=borrar]", v)) $("[data-accion=borrar]", v).addEventListener("click", async () => {
      if (!(await confirmar(`¿Borrar a ${p.nombre} y sus ${lista.length} análisis? No se puede deshacer.`, "Borrar"))) return;
      try { await API.borrar("pilotos/" + id); aviso("Piloto borrado."); irA("#/pilotos"); } catch (e) { aviso(e.message, "error"); }
    });
    const g = $("#listaAnalisisPiloto", v);
    if (!lista.length) g.replaceWith(html(`<div class="vacio entra">Todavía no hay análisis de <b>${esc(p.nombre)}</b>.</div>`));
    lista.forEach(a => g.appendChild(tarjetaAnalisis(a, p)));
    if (p.vinculado) {
      const r = await API.get(`pilotos/${id}/perfiles`).catch(() => ({ perfiles: [] }));
      if (r.perfiles.length) {
        const cont = $("#perfilesPiloto", v);
        cont.appendChild(html(`<div><div class="titulo-seccion">Perfiles de SendFlow de ${esc(p.nombre)}</div><div class="grilla g3">${r.perfiles.map(tarjetaPerfil).join("")}</div></div>`));
      }
    }
    if (window.CoachBicis) CoachBicis.pintar($("#perfilesPiloto", v), id, p.nombre);   // v43: bicis y set-ups (perfiles_v1.sql)
    if (p.vinculado && p.usuarioId && window.HistorialPiloto) HistorialPiloto.pintar($("#perfilesPiloto", v), p.usuarioId, p.nombre);   // v54: historial de planes y esfuerzo
  }
  function tarjetaPerfil(pf) {
    const d = pf.datos || {};
    const linea = [d.modeloBici, d.modeloSuspH, d.modeloSuspS].filter(Boolean).join(" · ");
    return `<div class="tarjeta" data-perfil="${pf.id}"><div style="display:flex;gap:8px;align-items:flex-start"><div style="flex:1;min-width:0">
      <div style="font-family:var(--sans);font-weight:600">${esc(pf.nombre)}</div>
      <div style="font-size:11px;color:var(--ink-dim);margin-top:4px">${esc(linea || "—")}</div>
      <div class="chips" style="margin-top:10px">${d.peso ? `<span class="chip">${esc(d.peso)} kg</span>` : ""}${d.presSuspH ? `<span class="chip cian">Horq. ${esc(d.presSuspH)} psi</span>` : ""}${d.presSuspS ? `<span class="chip oro">Shock ${esc(d.presSuspS)} psi</span>` : ""}${pf.propio === false ? `<span class="chip azul">${esc(pf.propietario)}</span>` : ""}</div>
      </div>${pf.propio ? `<button class="btn icono chico peligro" data-borrar-perfil="${pf.id}" title="Borrar del servidor" aria-label="Borrar perfil">${ICONOS.basura}</button>` : ""}</div>
      <div style="font-size:10.5px;color:var(--ink-mute);margin-top:10px">Subido ${fecha(pf.editado)}</div></div>`;
  }

  function editarPiloto(p) {
    const nuevo = !p;
    p = Object.assign({ nombre: "", email: "", disciplina: DISCIPLINAS[0], nivel: "", categoria: "", bici: "", peso: "", color: COLORES_PILOTO[0], notas: "" }, p || {});
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo"><label>Nombre</label><input class="input" name="nombre" value="${esc(p.nombre)}" maxlength="120" autocomplete="off"></div>
      <div class="campo"><label>Email del piloto</label><input class="input" name="email" type="email" value="${esc(p.email || "")}" maxlength="190" placeholder="Para que vea sus análisis"></div>
      <div class="campo"><label>Disciplina</label><select class="input" name="disciplina">${DISCIPLINAS.map(d => `<option ${d === p.disciplina ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
      <div class="campo"><label>Nivel</label><select class="input" name="nivel"><option value="">—</option>${NIVELES.map(d => `<option ${d === p.nivel ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
      <div class="campo"><label>Categoría</label><input class="input" name="categoria" value="${esc(p.categoria)}" placeholder="Junior, Élite, Master…" maxlength="40"></div>
      <div class="campo"><label>Peso (kg)</label><input class="input" name="peso" inputmode="decimal" value="${esc(p.peso || "")}" maxlength="6"></div>
      <div class="campo ancho"><label>Bici</label><input class="input" name="bici" value="${esc(p.bici)}" maxlength="80"></div>
      <div class="campo ancho"><label>Color</label><div class="colores">${COLORES_PILOTO.map(c => `<button type="button" style="--c:${c}" data-c="${c}" class="${c === p.color ? "sel" : ""}" aria-label="Color ${c}"></button>`).join("")}</div></div>
      <div class="campo ancho"><label>Notas</label><textarea class="input" name="notas" maxlength="2000">${esc(p.notas)}</textarea></div>
    </div>`);
    let color = p.color || COLORES_PILOTO[0];
    $$(".colores button", cuerpo).forEach(b => b.addEventListener("click", () => {
      color = b.dataset.c; $$(".colores button", cuerpo).forEach(x => x.classList.toggle("sel", x === b));
    }));
    return abrirModal({
      titulo: nuevo ? "Nuevo piloto" : "Editar piloto", cuerpo,
      acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Guardar", clase: "primario", alHacer: async (c) => {
        const val = (n) => $(`[name=${n}]`, c).value.trim();
        if (!val("nombre")) { aviso("Poné el nombre del piloto.", "error"); return false; }
        const cuerpo_ = { nombre: val("nombre"), email: val("email"), disciplina: val("disciplina"), nivel: val("nivel"), categoria: val("categoria"), bici: val("bici"), peso: val("peso"), notas: val("notas"), color };
        try {
          const r = nuevo ? await API.post("pilotos", cuerpo_) : await API.put("pilotos/" + p.id, cuerpo_);
          aviso(nuevo ? (r.piloto.yaExistia ? "Ese piloto ya estaba cargado: no se duplicó." : "Piloto agregado.") : "Cambios guardados.");
          if (r.piloto.yaExistia) { /* ya estaba cargado: no se invita de nuevo */ } else if (r.piloto.invitacionError) aviso("No se pudo enviar la invitación: " + r.piloto.invitacionError, "error");
          else if (r.piloto.invitado) aviso(`Le mandamos una invitación a ${r.piloto.email}. La ve al entrar a sendflow.bike y, cuando la acepta, empieza a ver sus análisis.`, "oro");
          else if (r.piloto.email && !r.piloto.vinculado) aviso(`${r.piloto.nombre} todavía no aceptó la invitación (${r.piloto.email}).`, "oro");
          if (nuevo && !location.pathname.startsWith("/analisis")) irA("#/piloto/" + r.piloto.id); else if (!location.pathname.startsWith("/analisis")) navegar();
          return r.piloto;
        } catch (e) { aviso(e.message, "error"); return false; }
      } }]
    });
  }

  // ================================================================ Análisis (lista)
  async function pantallaAnalisis(v) {
    let pilotos = [], porId = {}, analisis;
    if (esCoach()) ({ pilotos, analisis, porId } = await cargarCoach());
    else analisis = (await API.get("analisis")).analisis;
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">${esCoach() ? "Análisis" : "Devoluciones"}</h1><div class="sub-pagina">${analisis.length ? analisis.length + " análisis de video" : (esCoach() ? "Todavía no hay análisis." : "Todavía no te hicieron análisis.")}</div></div>
        ${esCoach() ? `<button class="btn primario" data-accion="nuevo">${ICONOS.video}Nuevo análisis</button>` : ""}</div>
      ${analisis.length ? `<div class="form-grilla entra" style="margin-bottom:18px">
        <div class="campo ancho"><label>Buscar</label><input class="input" id="filtroTexto" placeholder="Título o pista"></div></div>` : ""}
      <div class="grilla g3" id="listaAnalisis"></div></div>`));
    if (esCoach()) $("[data-accion=nuevo]", v).addEventListener("click", () => nuevoAnalisis());
    const g = $("#listaAnalisis", v);
    const pintar = () => {
      const fp = $("#filtroPiloto", v) ? $("#filtroPiloto", v).value : "";
      const ft = $("#filtroTexto", v) ? $("#filtroTexto", v).value.trim().toLowerCase() : "";
      g.innerHTML = "";
      const vis = analisis.filter(a => (!filtroPA || filtroPA.pasa(a)) && (!fp || a.pilotoId === fp) && (!ft || (a.titulo + " " + (a.pista || "")).toLowerCase().includes(ft)) && filtroA.pasa(a));
      vis.forEach(a => g.appendChild(tarjetaAnalisis(a, porId[a.pilotoId])));
      if (!analisis.length) g.innerHTML = `<div class="vacio" style="grid-column:1/-1">${esCoach() ? "Subí un video para hacer el primer análisis." : "Cuando tu entrenador te haga un análisis, aparece acá."}</div>`;
      else if (!vis.length) g.innerHTML = `<div class="vacio" style="grid-column:1/-1">Ningún análisis coincide con el filtro.</div>`;
      entradaEscalonada(g, 40);
    };
    if ($("#filtroTexto", v)) { $("#filtroTexto", v).addEventListener("input", pintar); if ($("#filtroPiloto", v)) $("#filtroPiloto", v).addEventListener("change", pintar); }
    const filtroA = barraTipos(analisis, esCoach() ? "analisis" : "devoluciones", () => pintar());
    const filtroPA = esCoach() ? barraPilotos(analisis, "analisis", a => ({ k: a.pilotoId || "?", nombre: (porId[a.pilotoId] && porId[a.pilotoId].nombre) || a.pilotoNombre || "Sin piloto", color: (porId[a.pilotoId] && porId[a.pilotoId].color) || colorFijo(a.pilotoId || a.pilotoNombre) }), () => pintar()) : null;
    if (analisis.length) { if (filtroPA) g.before(filtroPA); g.before(filtroA); }
    pintar();
  }

  // ================================================================ Nuevo análisis
  async function nuevoAnalisis(pilotoId, archivoInicial) {
    let pilotos = (await API.get("pilotos")).pilotos;
    if (!pilotos.length) {
      aviso("Primero agregá un piloto.", "oro");
      const p = await editarPiloto();
      if (!p) return;
      pilotos = [p]; pilotoId = p.id;
    }
    const hoy = new Date().toISOString().slice(0, 10);
    let archivo = null;
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo ancho"><div class="soltar" tabindex="0">${ICONOS.subir}<div><b style="color:var(--ink)">Elegí el video</b> o arrastralo acá</div><div style="font-size:12px;margin-top:4px">MP4, MOV o WebM, de cualquier largo. Se puede recortar y se achica solo antes de subir.</div><div class="archivo"></div></div></div>
      <div class="campo"><label>Piloto</label><select class="input" name="piloto">${pilotos.map(p => `<option value="${p.id}" ${p.id === pilotoId ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select></div>
      <div class="campo"><label>Fecha</label><input class="input" type="date" name="fecha" value="${hoy}"></div>
      <div class="campo"><label>Título</label><input class="input" name="titulo" placeholder="Curva del bosque, salto final…" maxlength="160"></div>
      <div class="campo"><label>Pista</label><input class="input" name="pista" maxlength="120"></div>
      <div class="campo ancho progreso-subida oculto"><label>Subiendo el video</label><div class="barra-progreso"><i></i></div><small class="txt-progreso"></small></div>
    </div>`);
    const zona = $(".soltar", cuerpo);
    const panel = panelRecorte(cuerpo);
    const tomar = (f) => {
      if (!f) return;
      if (!/^video\//.test(f.type) && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) { aviso("Ese archivo no es un video.", "error"); return; }
      archivo = f; $(".archivo", zona).textContent = f.name + " · " + (f.size / 1048576).toFixed(0) + " MB"; panel.poner(f);
      const t = $("[name=titulo]", cuerpo);
      if (!t.value) t.value = f.name.replace(/\.[^.]+$/, "");
    };
    zona.addEventListener("click", async () => tomar(await UI.elegirArchivo("video/*")));
    zona.addEventListener("keydown", async (e) => { if (e.key === "Enter") tomar(await UI.elegirArchivo("video/*")); });
    zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("encima"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
    zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("encima"); tomar(e.dataTransfer.files[0]); });
    if (archivoInicial) tomar(archivoInicial);   // viene de "Subir archivos"
    await abrirModal({
      titulo: "Nuevo análisis", cuerpo,
      acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Subir y crear", clase: "primario", alHacer: async (c) => {
        if (!archivo) { aviso("Elegí el video.", "error"); return false; }
        const boton = $(".modal-pie .primario", c.parentElement);
        boton.disabled = true; boton.textContent = "Preparando…";
        const prog = $(".progreso-subida", c), barra = $(".barra-progreso i", c), txt = $(".txt-progreso", c);
        try {
          const subir = await (async () => {
            if (panel.problema()) throw new Error(panel.problema());
            prog.classList.remove("oculto"); $("label", prog).textContent = "Preparando el video"; boton.textContent = "Preparando…";
            let frenar = null, salteado = false;
            const bSaltar = html(`<button type="button" class="btn chico fantasma saltar-compresion">Subir sin achicar</button>`);
            prog.append(bSaltar);
            try { prog.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
            bSaltar.addEventListener("click", () => { salteado = true; bSaltar.disabled = true; bSaltar.textContent = "Frenando…"; if (frenar) frenar(); });
            const t0c = performance.now();
            const resta = (f) => { if (f < 0.02) return "calculando el tiempo…"; const s = (performance.now() - t0c) / 1000 * (1 - f) / f; return s < 60 ? "falta menos de 1 min" : `faltan unos ${Math.round(s / 60)} min`; };
            let r;
            try {
              r = await prepararVideo(archivo, panel.recorte(), (f) => { barra.style.width = (f * 100).toFixed(1) + "%"; txt.textContent = `Achicando el video · ${(f * 100).toFixed(0)} % · ${resta(f)} · no cierres la página`; }, (fn) => { frenar = fn; if (salteado) fn(); });
            } catch (e) {
              if (!(e && e.cancelado)) throw e;
              r = archivo; aviso("Se sube el video original, sin achicar" + (panel.recorte() ? " ni recortar" : "") + ".", "oro");
            } finally { bSaltar.remove(); }
            if (r !== archivo) aviso(`Video listo: ${(archivo.size / 1048576).toFixed(0)} MB → ${(r.size / 1048576).toFixed(0)} MB.`, "oro");
            $("label", prog).textContent = "Subiendo el video"; barra.style.width = "0%";
            return r;
          })();
          const info = await leerVideo(subir);
          prog.classList.remove("oculto");
          boton.textContent = "Subiendo…";
          const t0 = performance.now();
          const videoId = await API.subirArchivo(subir, "video", subir.name, (f) => {
            barra.style.width = (f * 100).toFixed(1) + "%";
            const seg = (performance.now() - t0) / 1000, resta = f > 0.02 ? seg / f * (1 - f) : 0;
            txt.textContent = `${(f * 100).toFixed(0)} % · ${(subir.size * f / 1048576).toFixed(0)} de ${(subir.size / 1048576).toFixed(0)} MB${resta > 2 ? ` · faltan ~${Math.ceil(resta)} s` : ""}`;
          });
          const r = await API.post("analisis", {
            pilotoId: $("[name=piloto]", c).value, titulo: $("[name=titulo]", c).value.trim() || archivo.name,
            pista: $("[name=pista]", c).value.trim(), fecha: $("[name=fecha]", c).value || hoy, videoId,
            duracion: info.duracion, ancho: info.ancho, alto: info.alto, miniatura: info.miniatura,
            recorte: { ini: 0, fin: info.duracion }, anotaciones: [], etiquetas: [], notas: { fortalezas: "", mejorar: "", observaciones: "" }, sender: null
          });
          irA("#/analisis/" + r.analisis.id);
          return r.analisis;
        } catch (e) {
          aviso(e.message || "No se pudo subir el video.", "error");
          boton.disabled = false; boton.textContent = "Subir y crear";
          return false;
        }
      } }]
    });
  }

  // ================================================================ Video: recorte y compresión antes de subir
  function panelRecorte(cuerpo) {
    const zona = $(".soltar", cuerpo);
    const puede = !!(window.Compresor && Compresor.soportado());
    const caja = html(`<div class="campo ancho recorte-video oculto">
      <video class="vista-previa" controls playsinline muted preload="metadata"></video>
      ${puede ? `<div class="fila-recorte">
        <button type="button" class="btn chico" data-r="ini">Marcar inicio</button>
        <button type="button" class="btn chico" data-r="fin">Marcar fin</button>
        <button type="button" class="btn chico fantasma" data-r="todo">Video entero</button>
        <span class="txt-recorte"></span></div>
      <small class="ayuda-chica">Pausá en el momento justo y marcá inicio y fin para subir sólo esa parte. Antes de subir, el video se achica solo a 720p. Si es largo y en 4K, recortalo: tarda mucho menos.</small>`
      : `<small class="ayuda-chica">Este navegador no puede recortar ni achicar el video: se sube tal cual. En Chrome (PC o Android) se comprime solo.</small>`}
    </div>`);
    zona.closest(".campo").after(caja);
    const vid = $("video", caja), txt = $(".txt-recorte", caja);
    const st = { ini: 0, fin: 0, dur: 0, url: null };
    const pintar = () => { if (!txt) return; txt.textContent = (st.ini > 0.05 || st.fin < st.dur - 0.05) ? `Se sube de ${tiempo(st.ini, false)} a ${tiempo(st.fin, false)} (${tiempo(st.fin - st.ini, false)})` : `Video entero · ${tiempo(st.dur, false)}`; };
    vid.addEventListener("loadedmetadata", () => { st.dur = vid.duration || 0; st.ini = 0; st.fin = st.dur; pintar(); });
    $$("[data-r]", caja).forEach(b => b.addEventListener("click", () => {
      const t = vid.currentTime || 0;
      if (b.dataset.r === "ini") st.ini = Math.max(0, Math.min(t, st.fin - 1));
      else if (b.dataset.r === "fin") st.fin = Math.min(st.dur, Math.max(t, st.ini + 1));
      else { st.ini = 0; st.fin = st.dur; }
      pintar();
    }));
    return {
      poner(f) {
        if (st.url) URL.revokeObjectURL(st.url); st.url = URL.createObjectURL(f); vid.src = st.url; caja.classList.remove("oculto");
        st.malo = null; const prev = $(".error-formato", caja); if (prev) prev.remove();
        if (window.Compresor && Compresor.revisar) Compresor.revisar(f).then((r) => {
          if (r.ok || vid.src !== st.url) return;
          st.malo = r.motivo;
          caja.prepend(html(`<div class="error-formato">${esc(r.motivo)}</div>`));
          aviso(r.motivo, "error");
        });
      },
      problema() { return st.malo; },
      recorte() { return (st.ini > 0.05 || st.fin < st.dur - 0.05) ? { inicio: st.ini, fin: st.fin } : null; }
    };
  }
  // Enter envía (con teclado físico); Shift+Enter, otra línea. En el celular se usa el botón.
  function enterEnvia(ta, boton) {
    if (!(window.matchMedia && matchMedia("(pointer: fine)").matches)) return;
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!boton.disabled) boton.click(); }
    });
  }
  // v18: tipos de video que manda el piloto
  const TIPOS_VIDEO = {
    entrenamiento: { t: "Entrenamiento", d: "Ejercicios del plan de tu entrenador", ph: "Qué ejercicio era, cuántas pasadas, qué te costó…" },
    carrera: { t: "Carrera", d: "Ya corriste: que vea lo que hiciste", ph: "Cómo te fue, dónde sentiste que perdiste tiempo…" },
    previa: { t: "Antes de una carrera", d: "Práctica o reconocimiento: que vea tus líneas", ph: "Qué carrera es, qué líneas estás probando…" },
    otro: { t: "Otro", d: "Cualquier otra cosa", ph: "No me sale la curva, frené tarde…" }
  };
  window.TIPOS_VIDEO = TIPOS_VIDEO;
  // v59: situación de un video o bajada (qué muestra). Va aparte del motivo (para qué se grabó) y se puede marcar más de una.
  const SITUACIONES = {
    curva: "Curva", salto: "Salto", aterrizaje: "Aterrizaje", frenada: "Frenada", tecnico: "Terreno técnico",
    rapido: "Tramo rápido", pedaleo: "Pedaleo", largada: "Largada", posicion: "Posición en la bici", otra: "Otra"
  };
  window.SITUACIONES = SITUACIONES;
  const chipTipo = (k) => TIPOS_VIDEO[k] ? `<span class="chip tipo-${k}">${TIPOS_VIDEO[k].t.toUpperCase()}</span>` : "";
  // v19: filtro por tipo de video (Recibidos y Análisis)
  function barraTipos(lista, clave, alCambiar) {
    const cuenta = { "": lista.length };
    lista.forEach(x => { const k = x.tipo || "_sin"; cuenta[k] = (cuenta[k] || 0) + 1; });
    const hayTipos = lista.some(x => x.tipo);
    let valor = ""; try { valor = sessionStorage.getItem("sf-filtro-" + clave) || ""; } catch (e) {}
    if (valor && !cuenta[valor]) valor = "";
    const opciones = [["", "Todos"]].concat(Object.entries(TIPOS_VIDEO).map(([k, v]) => [k, v.t]), [["_sin", "Sin tipo"]]).filter(([k]) => k === "" || cuenta[k]);
    const el = html(`<div class="filtro-tipos entra ${hayTipos ? "" : "oculto"}" role="group" aria-label="Filtrar por tipo de video">
      ${opciones.map(([k, t]) => `<button type="button" data-f="${k}" class="${k ? "tipo-" + k : ""} ${k === valor ? "sel" : ""}">${t}<span>${cuenta[k]}</span></button>`).join("")}</div>`);
    $$("button", el).forEach(b => b.addEventListener("click", () => {
      valor = b.dataset.f; try { sessionStorage.setItem("sf-filtro-" + clave, valor); } catch (e) {}
      $$("button", el).forEach(x => x.classList.toggle("sel", x === b)); alCambiar();
    }));
    el.pasa = (x) => !valor || (valor === "_sin" ? !x.tipo : x.tipo === valor);
    return el;
  }
  // v59: filtro por situación (curva, salto, frenada…); un archivo puede tener varias
  function barraSituaciones(lista, clave, alCambiar) {
    const cuenta = { "": lista.length };
    lista.forEach(x => (x.sit || []).forEach(k => { cuenta[k] = (cuenta[k] || 0) + 1; }));
    let valor = ""; try { valor = sessionStorage.getItem("sf-sit-" + clave) || ""; } catch (e) {}
    if (valor && !cuenta[valor]) valor = "";
    const opciones = [["", "Todas las situaciones"]].concat(Object.entries(SITUACIONES).map(([k, t]) => [k, t])).filter(([k]) => k === "" || cuenta[k]);
    const el = html(`<div class="filtro-tipos entra ${opciones.length > 1 ? "" : "oculto"}" role="group" aria-label="Filtrar por situación">
      ${opciones.map(([k, t]) => `<button type="button" data-f="${k}" class="${k === valor ? "sel" : ""}">${esc(t)}<span>${cuenta[k]}</span></button>`).join("")}</div>`);
    $$("button", el).forEach(b => b.addEventListener("click", () => {
      valor = b.dataset.f; try { sessionStorage.setItem("sf-sit-" + clave, valor); } catch (e) {}
      $$("button", el).forEach(x => x.classList.toggle("sel", x === b)); alCambiar();
    }));
    el.pasa = (x) => !valor || (x.sit || []).includes(valor);
    return el;
  }
  // v24: cada piloto con su color e iniciales
  function colorFijo(k) { let h = 0; for (const ch of String(k || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORES_PILOTO[h % (COLORES_PILOTO.length - 1)]; }
  const sello = (nombre, color) => `<span class="sello-piloto" style="--c:${esc(color)}"><span class="av">${esc(iniciales(nombre || "?"))}</span><span class="nm">${esc(nombre || "Sin piloto")}</span></span>`;
  // quien(x) → { k, nombre, color }
  function barraPilotos(lista, clave, quien, alCambiar) {
    const grupos = new Map();
    lista.forEach(x => { const q = quien(x); const g = grupos.get(q.k) || Object.assign({ n: 0 }, q); g.n++; grupos.set(q.k, g); });
    let valor = ""; try { valor = sessionStorage.getItem("sf-pil-" + clave) || ""; } catch (e) {}
    if (valor && !grupos.has(valor)) valor = "";
    const orden = [...grupos.values()].sort((a, b) => b.n - a.n || String(a.nombre).localeCompare(String(b.nombre)));
    const el = html(`<div class="filtro-pilotos entra ${grupos.size > 1 ? "" : "oculto"}" role="group" aria-label="Filtrar por piloto">
      <button type="button" data-p="" class="${valor ? "" : "sel"}">Todos<span>${lista.length}</span></button>
      ${orden.map(g => `<button type="button" data-p="${esc(g.k)}" class="${g.k === valor ? "sel" : ""}" style="--c:${esc(g.color)}"><i>${esc(iniciales(g.nombre || "?"))}</i>${esc(g.nombre || "Sin piloto")}<span>${g.n}</span></button>`).join("")}</div>`);
    $$("button", el).forEach(b => b.addEventListener("click", () => {
      valor = b.dataset.p; try { sessionStorage.setItem("sf-pil-" + clave, valor); } catch (e) {}
      $$("button", el).forEach(x => x.classList.toggle("sel", x === b)); alCambiar();
    }));
    el.pasa = (x) => !valor || quien(x).k === valor;
    return el;
  }
  // v27: en Inicio, una vez, ofrecer los avisos push
  function ofrecerAvisos(v) {
    if (!window.SFAvisos) return;
    let oculto = false; try { oculto = localStorage.getItem("sf-avisos-oferta") === "no"; } catch (e) {}
    if (oculto) return;
    SFAvisos.estado().then(est => {
      if (est !== "inactivo" && est !== "iphone") return;
      const c = html(`<div class="tarjeta entra oferta-avisos"><button class="btn icono chico fantasma cerrar-oferta" title="Ahora no" aria-label="Ahora no">${ICONOS.cerrar}</button></div>`);
      c.appendChild(SFAvisos.fila());
      $(".cerrar-oferta", c).addEventListener("click", () => { try { localStorage.setItem("sf-avisos-oferta", "no"); } catch (e) {} c.remove(); });
      const ord = $(".inicio-orden", v), cab = $(".cab-pagina", v); if (ord) ord.appendChild(c); else if (cab) cab.after(c); else v.prepend(c);
    });
  }
  // ================================================================ v16: bandeja de mensajes
  let relojBandeja = 0;
  const haceCuanto = (s) => {
    const d = (Date.now() - new Date(s).getTime()) / 1000;
    if (!(d >= 0)) return "";
    if (d < 60) return "recién";
    if (d < 3600) return "hace " + Math.round(d / 60) + " min";
    if (d < 86400) return "hace " + Math.round(d / 3600) + " h";
    return new Date(s).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  async function pantallaMensajes(v, idSel) {
    clearInterval(relojBandeja);
    let conv = (await API.get("conversaciones")).conversaciones || [];
    const raiz = html(`<div class="bandeja ${idSel ? "con-sel" : ""}">
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Mensajes</h1>
        <div class="sub-pagina">${esCoach() ? "Lo que te escriben tus pilotos sobre sus análisis." : "Lo que hablás con tu entrenador sobre cada devolución."}</div></div></div>
      <div class="bandeja-cuerpo entra"><div class="bandeja-lista"></div><div class="bandeja-conv"></div></div></div>`);
    v.appendChild(raiz);
    const lista = $(".bandeja-lista", raiz), panel = $(".bandeja-conv", raiz);
    let actual = idSel || null;
    const otro = (c) => c.soyCoach ? (c.pilotoNombre || "Piloto") : (c.coachNombre || "Entrenador");
    const pintarLista = () => {
      lista.innerHTML = "";
      if (!conv.length) {
        lista.appendChild(html(`<div class="vacio">Todavía no hay mensajes.<br>Las conversaciones empiezan desde un análisis, en su pestaña <b>Mensajes</b>.</div>`));
        return;
      }
      conv.forEach(c => {
        const el = html(`<button type="button" class="conv-item ${c.analisisId === actual ? "sel" : ""} ${c.sinLeer ? "sin-leer" : ""}">
          <div class="avatar" style="--c:#4fe3c2">${esc(iniciales(otro(c)))}</div>
          <div class="conv-txt"><div class="conv-fila"><b>${esc(otro(c))}</b><span class="conv-hora">${haceCuanto(c.ultimo)}</span></div>
            <div class="conv-tit">${esc(c.titulo || "Sin título")}</div>
            <div class="conv-ult">${c.ultimoEsMio ? "Vos: " : ""}${esc(c.ultimoTexto || "")}</div></div>
          ${c.sinLeer ? `<b class="insignia">${c.sinLeer}</b>` : ""}</button>`);
        el.addEventListener("click", () => {
          if (location.pathname !== "/mensajes/" + c.analisisId) history.pushState(null, "", "/mensajes/" + c.analisisId);
          abrir(c.analisisId);
        });
        lista.appendChild(el);
      });
    };
    const pintarPanelVacio = () => {
      panel.innerHTML = conv.length ? `<div class="vacio conv-elegir">Elegí una conversación.</div>` : "";
    };
    async function abrir(id, silencioso) {
      actual = id; raiz.classList.add("con-sel");
      const c = conv.find(x => x.analisisId === id);
      if (!silencioso) {
        pintarLista();
        panel.innerHTML = `<div class="conv-cab"><button type="button" class="btn icono fantasma conv-volver" aria-label="Volver a Mensajes" title="Volver">${ICONOS.volver}</button>
          <div class="conv-cab-txt"><b>${esc(c ? otro(c) : "")}</b><span>${esc(c ? (c.titulo || "Sin título") : "")}</span></div>
          <a class="btn chico" href="/analisis/${esc(id)}">${ICONOS.video}Abrir análisis</a></div>
          <div class="msj-lista conv-mensajes"><p class="ayuda">Cargando…</p></div>
          <div class="msj-nuevo"><textarea class="input" maxlength="2000" placeholder="Escribí tu respuesta…"></textarea><small class="ayuda-enter">Enter envía · Shift+Enter, otra línea</small>
            <div class="msj-pie"><span class="ayuda-chica">${c && c.soyCoach ? "Le llega a " + esc(otro(c)) + " (y un mail de aviso)." : "Le llega a tu entrenador (y un mail de aviso)."}</span>
            <button type="button" class="btn primario chico" data-accion="responder">Enviar</button></div></div>`;
        $(".conv-volver", panel).addEventListener("click", () => { history.pushState(null, "", "/mensajes"); actual = null; raiz.classList.remove("con-sel"); pintarLista(); pintarPanelVacio(); });
        enterEnvia($("textarea", panel), $("[data-accion=responder]", panel));
        $("[data-accion=responder]", panel).addEventListener("click", async (ev) => {
          const ta = $("textarea", panel), texto = ta.value.trim(); if (!texto) { ta.focus(); return; }
          const b = ev.currentTarget; b.disabled = true; b.textContent = "Enviando…";
          try {
            await API.post("analisis/" + id + "/comentarios", { texto });
            ta.value = "";
            API.avisar(c && c.soyCoach ? "comentario" : "respuesta", id);
            await refrescar();
          } catch (e) { aviso("No se pudo enviar: " + e.message, "error"); }
          b.disabled = false; b.textContent = "Enviar";
        });
      }
      const caja = $(".conv-mensajes", panel);
      try {
        const r = await API.get("analisis/" + id + "/comentarios");
        if (actual !== id) return;
        const l = r.comentarios || [];
        const abajo = caja.scrollTop + caja.clientHeight >= caja.scrollHeight - 30;
        caja.innerHTML = l.length ? "" : `<p class="ayuda">Sin mensajes.</p>`;
        l.forEach(k => {
          caja.appendChild(html(`<div class="burbuja ${k.esMio ? "mia" : ""} ${k.deCoach ? "de-coach" : "de-piloto"}" data-ini="${esc(iniciales(k.esMio ? USUARIO.nombre : (k.autorNombre || "?")))}">
            <div class="cab"><b>${esc(k.esMio ? "Vos" : (k.autorNombre || ""))}</b><span>${haceCuanto(k.creado)}</span>
              ${k.t != null ? `<a class="ir" href="/analisis/${esc(id)}?t=${k.t}" title="Ver ese momento del video">${tiempo(k.t, false)}</a>` : ""}</div>
            ${k.archivoId ? (k.archivoClase === "documento" ? `<a class="doc-msj" data-doc="${esc(k.archivoId)}" href="#" target="_blank" rel="noopener" title="Abrir el documento"><b>${esc((k.archivoNombre || "documento").split(".").pop().toUpperCase().slice(0, 4))}</b><span>${esc(k.archivoNombre || "Documento")}</span></a>` : `<img class="snap-msj" data-arch="${esc(k.archivoId)}" alt="Captura" title="Tocá para verla grande">`) : ""}<div class="txt">${k.archivoId && (k.texto === "📷 Captura" || String(k.texto).startsWith("📎 ")) ? "" : esc(k.texto)}</div>${k.esMio && k.leido ? `<div class="leido">Leído ✓</div>` : ""}</div>`));
        });
        if (window.SFAgendaChat) SFAgendaChat.decorar(caja, l, { analisisId: id, soyCoach: !!(c && c.soyCoach), pilotoNombre: c ? c.pilotoNombre : "" });   // v52
        if (window.Archivos) Archivos.pintar(caja);
        if (!silencioso || abajo) caja.scrollTop = caja.scrollHeight;
        if (c && c.sinLeer) { c.sinLeer = 0; pintarLista(); actualizarAvisos(); }
      } catch (e) { caja.innerHTML = `<p class="ayuda">No se pudo cargar: ${esc(e.message || "")}</p>`; }
    }
    async function refrescar() {
      try { conv = (await API.get("conversaciones")).conversaciones || []; } catch (e) { return; }
      pintarLista();
      if (actual) await abrir(actual, true);
      actualizarAvisos();
    }
    pintarLista();
    if (actual) abrir(actual); else pintarPanelVacio();
    relojBandeja = setInterval(() => {
      if (!location.pathname.startsWith("/mensajes")) { clearInterval(relojBandeja); return; }
      if (document.visibilityState === "visible") refrescar();
    }, 25000);
  }

  // ================================================================ v14: marcas del piloto al enviar un video
  function panelMarcas(cuerpo) {
    const caja = $(".recorte-video", cuerpo), vid = $("video", caja);
    const bloque = html(`<div class="marcas-piloto">
      <div class="fila-recorte"><button type="button" class="btn chico" data-m="marcar">+ Marcar este momento</button>
        <span class="ayuda-chica">Pausá donde pasa algo y dejale una nota a tu entrenador.</span></div>
      <ol class="lista-marcas"></ol></div>`);
    caja.appendChild(bloque);
    const lista = $(".lista-marcas", bloque), marcas = [];
    $("[data-m=marcar]", bloque).addEventListener("click", () => {
      vid.pause();
      const m = { t: Math.round((vid.currentTime || 0) * 100) / 100 };
      const li = html(`<li><button type="button" class="t" title="Ir a este momento">${tiempo(m.t, false)}</button>
        <input class="input" maxlength="300" placeholder="¿Qué pasó acá?"><button type="button" class="quitar" aria-label="Quitar marca" title="Quitar">×</button></li>`);
      m.input = $("input", li);
      $(".t", li).addEventListener("click", () => { vid.currentTime = m.t; });
      $(".quitar", li).addEventListener("click", () => { marcas.splice(marcas.indexOf(m), 1); li.remove(); });
      marcas.push(m); lista.appendChild(li); m.input.focus();
    });
    return {
      // Marcas con texto; si el video se recortó, quedan relativas al tramo subido
      lista(recorte) {
        return marcas.filter(m => m.input.value.trim()).map(m => ({ t: m.t, texto: m.input.value.trim() }))
          .filter(m => !recorte || (m.t >= recorte.inicio && m.t <= recorte.fin))
          .map(m => ({ t: recorte ? Math.round((m.t - recorte.inicio) * 100) / 100 : m.t, texto: m.texto }))
          .sort((x, y) => x.t - y.t);
      }
    };
  }
  // Chips de la conversación en las tarjetas de análisis
  function chipsConversacion(a) {
    const ch = [];
    if (a.tipo) ch.push(chipTipo(a.tipo));
    if (a.veredicto === "aprobado") ch.push(`<span class="chip cian">APROBADO ✓</span>`);
    else if (a.veredicto === "a_corregir") ch.push(`<span class="chip oro">A CORREGIR</span>`);
    if (a.ronda > 1) ch.push(`<span class="chip">RONDA ${a.ronda}</span>`);
    if (!esCoach() && a.correccionPendiente) ch.push(`<span class="chip">CORRECCIÓN ENVIADA</span>`);
    if (esCoach()) { if (a.pilotoConCuenta && a.vistoPiloto) ch.push(`<span class="chip cian">VISTO ✓</span>`); else if (a.avisadoPiloto) ch.push(`<span class="chip">SIN VER</span>`); }
    else if (!a.vistoPiloto) ch.push(`<span class="chip oro">NUEVA</span>`);
    if (a.comentariosSinLeer) ch.push(`<span class="chip oro">${a.comentariosSinLeer} ${a.comentariosSinLeer === 1 ? "MENSAJE NUEVO" : "MENSAJES NUEVOS"}</span>`);
    if (esCoach() && a.marcasPiloto && a.marcasPiloto.length) ch.push(`<span class="chip">${a.marcasPiloto.length} ${a.marcasPiloto.length === 1 ? "MARCA" : "MARCAS"} DEL PILOTO</span>`);
    return ch.length ? `<div class="chips-conv">${ch.join("")}</div>` : "";
  }
  // Contador del menú: mensajes sin leer (+ devoluciones nuevas para el piloto)
  async function actualizarAvisos() {
    try {
      const r = await API.get("avisos");
      const poner = (ruta, n) => {
        const a = $(`.nav-item[data-ruta="${ruta}"]`); if (!a) return;
        let b = $(".insignia", a);
        if (!n) { if (b) b.remove(); return; }
        if (!b) { b = document.createElement("b"); b.className = "insignia"; a.appendChild(b); }
        b.textContent = n;
      };
      poner("mensajes", r.comentariosSinLeer || 0);
      if (!esCoach()) poner("archivos", r.devolucionesNuevas || 0);
    } catch (e) {}
  }

  // Devuelve el archivo listo para subir: recortado y comprimido si el navegador puede.
  async function prepararVideo(archivo, recorte, alAvance, alIniciar) {
    if (!window.Compresor || !Compresor.soportado()) {
      if (recorte) throw new Error("Este navegador no puede recortar el video. Probá desde Chrome.");
      return archivo;
    }
    try { return await Compresor.preparar(archivo, Object.assign({}, recorte || {}, { alProgreso: alAvance, alIniciar })); }
    catch (e) {
      if (e && (e.noLegible || e.cancelado)) throw e;
      if (recorte) throw new Error("No se pudo recortar el video: " + (e.message || e));
      aviso("No se pudo achicar el video en este navegador; se sube el original.", "oro");
      return archivo;
    }
  }

  // Duración, tamaño y miniatura de un video
  function leerVideo(blob) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      const limpiar = () => { URL.revokeObjectURL(url); v.removeAttribute("src"); v.load(); };
      const error = () => { clearTimeout(limite); limpiar(); mal(new Error("Este navegador no puede abrir ese video (probá con MP4 H.264).")); };
      const limite = setTimeout(error, 20000);
      v.addEventListener("error", error);
      v.addEventListener("loadedmetadata", () => {
        if (!Number.isFinite(v.duration) || v.duration <= 0) { error(); return; }
        v.currentTime = Math.min(v.duration * 0.15, 2);
      });
      v.addEventListener("seeked", () => {
        clearTimeout(limite);
        let miniatura = "";
        try {
          const c = document.createElement("canvas");
          const r = (v.videoWidth / v.videoHeight) || 16 / 9;
          c.width = 480; c.height = Math.round(480 / r);
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          miniatura = c.toDataURL("image/jpeg", 0.72);
        } catch (e) {}
        const res = { duracion: v.duration, ancho: v.videoWidth, alto: v.videoHeight, miniatura };
        limpiar(); ok(res);
      }, { once: true });
    });
  }

  // ================================================================ Bajadas del Sender
  async function pantallaBajadas(v) {
    const { bajadas } = await API.get("bajadas");
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Bajadas del Sender</h1>
        <div class="sub-pagina">${esCoach() ? "Las que mandan tus pilotos desde SendFlow o suben acá." : "Las que mandás desde SendFlow o subís acá. Tus entrenadores las pueden usar en tus análisis."}</div></div>
        ${esCoach() ? "" : `<button class="btn primario" data-accion="subir">${ICONOS.subir}Subir bajada</button>`}</div>
      <div class="grilla g3" id="listaBajadas"></div></div>`));
    const bSub = $("[data-accion=subir]", v); if (bSub) bSub.addEventListener("click", subirBajada);
    const g = $("#listaBajadas", v);
    if (!bajadas.length) g.replaceWith(html(`<div class="vacio entra">Todavía no hay bajadas.<br>Desde <b>SendFlow</b>: Configuración → SendFlow Coach, y en cada bajada guardada tocá <b>“Enviar a SendFlow Coach”</b>. También podés subir acá el archivo <b>.sfb</b> del Sender.</div>`));
    bajadas.forEach(b => {
      const r = b.resumen || {};
      const el = html(`<article class="tarjeta entra">
        <div style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1;min-width:0">
          <div style="font-family:var(--sans);font-weight:600;word-break:break-word">${esc(b.nombre)}</div>
          <div style="font-size:11px;color:var(--ink-dim);margin-top:4px">${fecha(b.fecha || b.creado)}${b.pista ? " · " + esc(b.pista) : ""}${b.propia ? "" : " · " + esc(b.propietario)}</div></div>
          ${b.propia ? `<button class="btn icono chico peligro" data-borrar="${b.id}" title="Borrar bajada" aria-label="Borrar bajada">${ICONOS.basura}</button>` : ""}</div>
        <div class="chips" style="margin-top:12px">
          ${r.duracion ? `<span class="chip">${tiempo(r.duracion, false)}</span>` : ""}
          ${r.velMax ? `<span class="chip azul">${r.velMax} km/h máx.</span>` : ""}
          ${r.eventos != null ? `<span class="chip" style="border-color:rgba(163,91,240,.5);color:var(--violeta)">${r.eventos} eventos</span>` : ""}
          <span class="chip ${b.origen === "sendflow" ? "cian" : ""}">${b.origen === "sendflow" ? "Desde SendFlow" : "Archivo .sfb"}</span>
        </div></article>`);
      const bb = $("[data-borrar]", el);
      if (bb) bb.addEventListener("click", async () => {
        if (!(await confirmar("¿Borrar esta bajada del servidor? Los análisis que ya la usan la conservan.", "Borrar"))) return;
        try { await API.borrar("bajadas/" + b.id); aviso("Bajada borrada."); navegar(); } catch (e) { aviso(e.message, "error"); }
      });
      g.appendChild(el);
    });
  }
  async function subirBajada() {
    const f = await UI.elegirArchivo(".sfb,.sfpb,application/octet-stream");
    if (!f) return;
    aviso("Leyendo la bajada…", "oro");
    try {
      const d = await SenderDatos.leerArchivo(f);
      const archivoId = await API.subirArchivo(f, "bajada", f.name);
      await API.post("bajadas", { archivoId, nombre: f.name.replace(/\.[^.]+$/, ""), fecha: new Date(f.lastModified || Date.now()).toISOString(), resumen: SenderDatos.resumen(d), origen: "archivo" });
      aviso("Bajada subida.");
      navegar();
    } catch (e) { aviso(e.message, "error"); }
  }

  // ================================================================ Perfil
  async function pantallaPerfil(v) {
    const [rp, re] = await Promise.all([API.get("perfiles", esCoach() ? "&incluir=pilotos" : ""), API.get("entrenadores")]);
    const pil0 = USUARIO.piloto || {};
    const NIV_APP = { principiante: "Principiante", medio: "Intermedio", avanzado: "Avanzado" };
    const ord = (rp.perfiles || []).filter(x => x.propio !== false).slice().sort((a, b) => new Date(b.editado || 0) - new Date(a.editado || 0));
    const ded = { peso: "", nivel: "", bicis: [] };
    ord.forEach(pf => { const d = pf.datos || {};
      if (!ded.peso && d.pesoPiloto) ded.peso = String(d.pesoPiloto);
      if (!ded.nivel && NIV_APP[d.nivel]) ded.nivel = NIV_APP[d.nivel];
      if (d.modeloBici && !ded.bicis.includes(d.modeloBici)) ded.bicis.push(d.modeloBici); });
    // Lo ya guardado manda; lo vacío se completa con lo de los perfiles de la app
    const pil = Object.assign({}, pil0, { nivel: pil0.nivel || ded.nivel, peso: pil0.peso || ded.peso, bici: pil0.bici || (ded.bicis.length === 1 ? ded.bicis[0] : "") });
    const bicis = ded.bicis.slice(); if (pil.bici && !bicis.includes(pil.bici)) bicis.push(pil.bici);
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Perfil</h1><div class="sub-pagina">${esc(USUARIO.email)}</div></div></div>
      <div class="grilla g2" style="margin-top:16px">
        <section class="tarjeta entra"><div class="etiqueta" style="margin-bottom:12px">Tus datos</div>
          <div class="form-grilla">
            <div class="campo ancho"><label>Nombre y apellido</label><input class="input" name="nombre" value="${esc(USUARIO.nombre)}" maxlength="120"></div>
            <div class="campo"><label>Disciplina</label><select class="input" name="disciplina"><option value="">—</option>${DISCIPLINAS.map(d => `<option ${d === pil.disciplina ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
            <div class="campo"><label>Nivel</label><select class="input" name="nivel"><option value="">—</option>${NIVELES.map(d => `<option ${d === pil.nivel ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
            <div class="campo"><label>Categoría</label><input class="input" name="categoria" value="${esc(pil.categoria || "")}" maxlength="40"></div>
            <div class="campo"><label>Peso (kg)</label><input class="input" name="peso" inputmode="decimal" value="${esc(pil.peso || "")}" maxlength="6"></div>
            <div class="campo ancho"><label>Bici</label><select class="input" name="bici"><option value="">—</option>${bicis.map(b => `<option ${b === pil.bici ? "selected" : ""}>${esc(b)}</option>`).join("")}<option value="__otra">Otra (escribir)…</option></select><input class="input oculto" name="biciOtra" placeholder="Modelo de la bici" maxlength="80" style="margin-top:8px"></div>
          </div>
          <button class="btn primario" data-accion="guardar" style="margin-top:14px">Guardar</button></section>
        <section class="tarjeta entra"><div class="etiqueta" style="margin-bottom:12px">Contraseña</div>
          <div class="form-grilla" style="grid-template-columns:1fr">
            <div class="campo"><label>Actual</label><input class="input" type="password" name="actual" autocomplete="current-password"></div>
            <div class="campo"><label>Nueva (8 o más)</label><input class="input" type="password" name="nueva" autocomplete="new-password"></div>
          </div>
          <button class="btn" data-accion="clave" style="margin-top:14px">Cambiar contraseña</button>
          <p class="ayuda" style="margin:12px 0 0">Es la misma contraseña de tu cuenta SendFlow.</p></section>
      </div>
      ${esCoach() ? `<div class="titulo-seccion entra">Mis alumnos</div>
      <section class="tarjeta entra" style="max-width:560px"><p class="ayuda" style="margin:0 0 12px">Sumá un alumno con su email. Le llega una invitación y, cuando la acepta en sendflow.bike, ve sus análisis y vos ves sus bajadas.</p>
        <div class="form-grilla"><div class="campo"><label>Nombre</label><input class="input" name="alNombre" maxlength="120"></div>
        <div class="campo"><label>Email</label><input class="input" name="alEmail" type="email" maxlength="190"></div></div>
        <button class="btn primario" data-accion="alumno" style="margin-top:14px">Enviar invitación</button></section>` : ""}
      <div id="perfEntrenadores"></div>
      <div class="titulo-seccion entra">Perfiles de SendFlow</div>
      <p class="ayuda entra">Los perfiles de piloto y bici (peso, recorridos, presiones) que mandás desde la app: Configuración → SendFlow nube → <b>Enviar perfiles</b>. Desde ahí también los traés a otro celular.${esCoach() ? " También ves los de tus pilotos con cuenta." : ""}</p>
      <div class="grilla g3" id="listaPerfiles"></div></div>`));
    $$("[data-modo]", v).forEach(b => b.addEventListener("click", async () => {
      if (b.dataset.modo === USUARIO.modo) return;
      try {
        const r = await API.put("yo", { modo: b.dataset.modo });
        USUARIO = r.usuario; construirNav();
        aviso(esCoach() ? "Ahora estás en modo entrenador." : "Ahora estás en modo piloto.");
        navegar();
      } catch (e) { aviso(e.message, "error"); }
    }));
    $("[name=bici]", v).addEventListener("change", (e) => { $("[name=biciOtra]", v).classList.toggle("oculto", e.target.value !== "__otra"); });
    const bAl = $("[data-accion=alumno]", v);
    if (bAl) bAl.addEventListener("click", async () => {
      const n = $("[name=alNombre]", v).value.trim(), em = $("[name=alEmail]", v).value.trim();
      if (!n || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { aviso("Poné el nombre y un email válido.", "error"); return; }
      bAl.disabled = true;
      try {
        const r = await API.post("pilotos", { nombre: n, email: em });
        if (r.piloto.yaExistia) { aviso("Ese alumno ya estaba cargado."); $("[name=alNombre]", v).value = ""; $("[name=alEmail]", v).value = ""; bAl.disabled = false; return; }
        if (r.piloto.invitacionError) aviso("Se agregó a " + n + " pero no se pudo enviar la invitación: " + r.piloto.invitacionError, "error");
        else aviso("Invitación enviada a " + em + ".");
        $("[name=alNombre]", v).value = ""; $("[name=alEmail]", v).value = "";
      } catch (e) { aviso(e.message, "error"); }
      bAl.disabled = false;
    });
    $("[data-accion=guardar]", v).addEventListener("click", async () => {
      const val = (n) => $(`[name=${n}]`, v).value.trim();
      try {
        const r = await API.put("yo", { nombre: val("nombre"), piloto: { disciplina: val("disciplina"), nivel: val("nivel"), categoria: val("categoria"), peso: val("peso"), bici: (val("bici") === "__otra" ? val("biciOtra") : val("bici")) } });
        USUARIO = r.usuario; construirNav(); aviso("Datos guardados.");
      } catch (e) { aviso(e.message, "error"); }
    });
    $("[data-accion=clave]", v).addEventListener("click", async () => {
      try { await API.put("yo/clave", { actual: $("[name=actual]", v).value, nueva: $("[name=nueva]", v).value }); aviso("Contraseña cambiada."); $("[name=actual]", v).value = ""; $("[name=nueva]", v).value = ""; }
      catch (e) { aviso(e.message, "error"); }
    });
    // Entrenadores (sólo tiene sentido como piloto, pero se muestran si hay)
    if (re.entrenadores.length || !esCoach()) {
      const c = $("#perfEntrenadores", v);
      c.appendChild(html(`<div><div class="titulo-seccion">Tus entrenadores</div>
        ${re.entrenadores.length ? `<div class="grilla g3">${re.entrenadores.map(e => `<div class="tarjeta"><div class="fila-piloto"><div class="avatar" style="--c:#ffbd00">${esc(iniciales(e.nombre))}</div><div style="flex:1;min-width:0"><div class="nom">${esc(e.nombre)}</div><div class="det">${esc(e.email)}</div></div>
          <button class="btn chico peligro" data-quitar="${e.id}">Quitar</button></div></div>`).join("")}</div>`
          : `<div class="vacio">Ningún entrenador te cargó todavía. Pasale tu email: <b>${esc(USUARIO.email)}</b>.</div>`}</div>`));
      $$("[data-quitar]", c).forEach(b => b.addEventListener("click", async () => {
        if (!(await confirmar("¿Dejar de compartir tus análisis y bajadas con este entrenador?", "Quitar"))) return;
        try { await API.borrar("entrenadores/" + b.dataset.quitar); aviso("Listo."); navegar(); } catch (e) { aviso(e.message, "error"); }
      }));
    }
    const lp = $("#listaPerfiles", v);
    if (!rp.perfiles.length) lp.replaceWith(html(`<div class="vacio">Todavía no hay perfiles subidos.</div>`));
    else lp.innerHTML = rp.perfiles.map(tarjetaPerfil).join("");
    $$("[data-borrar-perfil]", v).forEach(b => b.addEventListener("click", async () => {
      if (!(await confirmar("¿Borrar este perfil del servidor? En SendFlow no se borra.", "Borrar"))) return;
      try { await API.borrar("perfiles/" + b.dataset.borrarPerfil); aviso("Perfil borrado."); navegar(); } catch (e) { aviso(e.message, "error"); }
    }));
  }

  // ================================================================ Envíos: el piloto manda videos a su entrenador
  const ESTADO_ENVIO = { nuevo: ["Enviado", "oro"], visto: ["Visto", ""], analizado: ["Con devolución", "cian"] };
  function tarjetaEnvio(e, comoCoach) {
    const [txt, cls] = ESTADO_ENVIO[e.estado] || ["", ""];
    const quien = comoCoach ? e.pilotoNombre : ("Para: " + (e.coachNombre || "—"));
    const pil = comoCoach ? (e._pil || { nombre: e.pilotoNombre, color: colorFijo(e.pilotoUsuarioId || e.pilotoNombre) }) : null;
    const el = html(`<article class="tarjeta click t-analisis entra ${pil ? "con-piloto" : ""}" tabindex="0" style="${pil ? "--cp:" + esc(pil.color) : ""}">
      <div class="mini ${e.soloDatos ? "datos" : ""}" style="${e.miniatura ? `background-image:url('${e.miniatura}')` : ""}">
        <div class="play"><span>${ICONOS.play}</span></div>
        <span class="chip ${cls} sender">${esc(comoCoach ? ({ nuevo: "NUEVO", visto: "VISTO", analizado: "ANALIZADO" })[e.estado] : txt.toUpperCase())}</span>
        <span class="dur">${tiempo(e.duracion || 0, false)}</span>
      </div>
      <div class="cuerpo">
        ${pil ? `<div class="fila-sello">${sello(pil.nombre, pil.color)}</div>` : ""}<div class="tit">${esc(e.titulo || "Sin título")}</div>${e.respondeA ? `<div class="meta" style="color:var(--oro)">Corrección de “${esc(e.respondeATitulo || "")}”</div>` : ""}${e.tipo || e.bajadaId ? `<div class="chips-conv">${chipTipo(e.tipo)}${e.bajadaId ? `<span class="chip violeta">${e.soloDatos ? "SOLO DATOS · SIN VIDEO" : "CON DATOS DEL SENDER"}</span>` : ""}</div>` : ""}
        <div class="meta">${pil ? "" : esc(quien) + " · "}${e.pista ? esc(e.pista) + " · " : ""}${fecha(e.fecha || e.creado)}</div>
        ${e.nota ? `<div class="meta" style="margin-top:6px;font-style:italic">“${esc(e.nota.length > 90 ? e.nota.slice(0, 90) + "…" : e.nota)}”</div>` : ""}
      </div></article>`);
    const ir = () => { irA(comoCoach ? "#/recibido/" + e.id : (e.estado === "analizado" && e.analisisId ? "#/analisis/" + e.analisisId : "#/archivos")); };
    el.addEventListener("click", ir);
    el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ir(); });
    return el;
  }

  // v37: ARCHIVOS = una sola biblioteca (entrenador y piloto). Reemplaza Recibidos / Enviar / Análisis / Devoluciones.
  // Videos y bajadas (sin analizar), análisis (con o sin video), fotos y documentos, todo junto y ordenado por la ÚLTIMA ACTIVIDAD:
  // un envío nuevo, una devolución, un mensaje, una foto o un documento nuevos suben arriba aunque el video sea viejo.
  async function pantallaBiblioteca(v) {
    const coach = esCoach();
    const [renv, ra, rarch, rconv, rpil, rent, rtags] = await Promise.all([
      API.get("envios"), coach ? cargarCoach() : API.get("analisis").then(r => ({ analisis: r.analisis, porId: {}, pilotos: [] })),
      API.get("archivos-lista").catch(() => ({ archivos: [] })), API.get("conversaciones").catch(() => ({ conversaciones: [] })),
      coach ? API.get("pilotos").catch(() => ({ pilotos: [] })) : Promise.resolve({ pilotos: [] }),
      coach ? Promise.resolve({ entrenadores: [] }) : API.get("entrenadores").catch(() => ({ entrenadores: [] })),
      API.get("etiquetas").catch(() => ({ etiquetas: [] }))]);   // v59: sin coach_v30.sql queda vacío y todo sigue funcionando
    const { analisis, porId } = ra, fichas = rpil.pilotos || [], entrenadores = rent.entrenadores || [];
    const ultimoMsj = {}; (rconv.conversaciones || []).forEach(c => { ultimoMsj[c.analisisId] = c.ultimo; });
    const colorDe = (nombre, uid) => { const f = fichas.find(p => (uid && p.usuarioId === uid) || (nombre && p.nombre === nombre)); return (f && f.color) || colorFijo(uid || nombre); };
    const masNuevo = (...f) => f.filter(Boolean).sort().pop() || "";
    const items = [];
    analisis.forEach(a => items.push({ clase: a.soloDatos ? "datos" : "video", tipo: a.tipo, fecha: masNuevo(a.creado, a.editado, a.avisadoPiloto, a.veredictoEn, ultimoMsj[a.id]),
      nombre: coach ? ((porId[a.pilotoId] && porId[a.pilotoId].nombre) || a.pilotoNombre || "Sin piloto") : (a.coachNombre || "Entrenador"), uid: a.pilotoId, texto: (a.titulo || "") + " " + (a.pista || ""), a }));
    (coach ? renv.recibidos : renv.enviados).filter(e => e.estado !== "analizado").forEach(e => items.push({ clase: e.soloDatos ? "datos" : "video", tipo: e.tipo, fecha: e.creado || e.fecha,
      nombre: coach ? (e.pilotoNombre || "Sin piloto") : (e.coachNombre || "Entrenador"), uid: e.pilotoUsuarioId, texto: (e.titulo || "") + " " + (e.pista || ""), e }));
    (rarch.archivos || []).forEach(x => items.push({ clase: x.clase === "documento" ? "documento" : (x.clase === "envio" || x.clase === "video") ? "video" : "foto", tipo: null, fecha: x.creado,
      nombre: x.conNombre || x.pilotoNombre || (coach ? "Sin piloto" : "Entrenador"), uid: null, texto: (x.titulo || "") + " " + (x.nombre || "") + " " + (x.conNombre || ""), x }));
    // v59: motivo y situación de cada archivo (por archivo o, en una bajada sin video, por bajada)
    const etiq = {}; ((rtags && rtags.etiquetas) || []).forEach(t => { etiq[t.tipo + ":" + t.ref] = t; });
    const etiquetaDe = (archivoId, bajadaId) => (archivoId && etiq["archivo:" + archivoId]) || (bajadaId && etiq["bajada:" + bajadaId]) || null;
    items.forEach(it => {
      const t = it.a ? etiquetaDe(it.a.videoId, it.a.bajadaId) : it.e ? etiquetaDe(it.e.archivoId, it.e.bajadaId) : etiquetaDe(it.x.archivoId, null);
      if (!t) return;
      it.sit = t.situaciones || [];
      if (it.x) it.tipo = t.motivo || null;   // en la biblioteca el motivo sale de la etiqueta; en envíos y análisis ya viene en su ficha
      it.texto += " " + (t.pista || "") + " " + it.sit.map(k => SITUACIONES[k] || k).join(" ");
    });
    // pide ya los enlaces de las fotos (mientras se arma la pantalla) para que aparezcan al instante
    API.urls((rarch.archivos || []).filter(x => x.clase === "imagen").map(x => x.archivoId)).catch(() => {});
    items.forEach(it => { it._pil = { k: String(it.nombre).toLowerCase(), nombre: it.nombre, color: colorDe(it.nombre, it.uid) }; });
    items.sort((p, q) => String(q.fecha || "").localeCompare(String(p.fecha || "")));
    const sinVer = coach ? renv.sinVer : 0;
    const puedeEnviar = !coach && entrenadores.length;
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Archivos</h1>
        <div class="sub-pagina">${items.length ? (sinVer ? sinVer + (sinVer === 1 ? " envío nuevo" : " envíos nuevos") + " de tus pilotos. " : "") + "Lo último que pasó arriba: videos, bajadas sin video, análisis, fotos y documentos. Tocá uno para abrirlo, analizarlo o mandarlo por mensaje." : (coach ? "Los videos, bajadas, fotos y documentos que te manden tus pilotos aparecen acá." : "Tus videos, devoluciones, fotos y documentos aparecen acá.")}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" data-accion="subir">${ICONOS.subir}Subir archivos</button></div></div>
      ${!coach && !entrenadores.length ? `<div class="vacio entra" style="margin-bottom:16px">Todavía no tenés un entrenador vinculado.<br>Pedile que te invite con tu email (<b>${esc(USUARIO.email)}</b>) y aceptá la invitación al entrar a sendflow.bike.</div>` : ""}
      <div class="filtro-tipos entra" id="filtroClase" role="group" aria-label="Filtrar por clase de archivo"></div>
      ${items.length ? `<div class="form-grilla entra" style="margin-bottom:18px"><div class="campo ancho"><label>Buscar</label><input class="input" id="filtroTexto" placeholder="Título, pista, nombre o archivo"></div></div>` : ""}
      <div class="grilla g3" id="listaArchivos"></div></div>`));
    // v59: una sola ventana para subir cualquier cosa (video, foto, documento, o la bajada del Sender sola)
    const subirArch = async () => {
      if (!coach && !entrenadores.length) { aviso("Todavía no tenés un entrenador vinculado. Buscá uno en Perfil → Mis entrenadores, o pedile que te invite.", "oro"); return; }
      if (await subirArchivos({ coach, fichas, entrenadores })) navegar();
    };
    $("[data-accion=subir]", v).addEventListener("click", subirArch);
    const enviar = { click: () => subirArch() };   // /enviar abre directo el selector
    const g = $("#listaArchivos", v);
    if (!items.length) { g.replaceWith(html(`<div class="vacio entra">Todavía no hay archivos.</div>`)); actualizarInsignia(sinVer); if (window.__abrirEnviar) { window.__abrirEnviar = false; if (enviar) enviar.click(); } return; }
    let clase = ""; try { clase = sessionStorage.getItem("sf-filtro-clase") || ""; } catch (e) {}
    const NOMBRES = [["", "Todos"], ["video", "Videos"], ["datos", "Solo datos"], ["foto", "Fotos"], ["documento", "Documentos"]];
    const cuenta = (k) => k ? items.filter(i => i.clase === k).length : items.length;
    if (clase && !cuenta(clase)) clase = "";
    const fClase = $("#filtroClase", v);
    fClase.innerHTML = NOMBRES.filter(([k]) => k === "" || cuenta(k)).map(([k, t]) => `<button type="button" data-f="${k}" class="${k === clase ? "sel" : ""}">${t}<span>${cuenta(k)}</span></button>`).join("");
    // el entrenador usa un video como ejemplo para otro piloto (botón arriba a la derecha de la tarjeta)
    const botonCompartir = (el, archivoId, titulo, deNombre, usuarioId) => {
      const b = html(`<button type="button" class="btn chico compartir-video" title="Compartir este video con otro piloto" aria-label="Compartir este video con otro piloto">${ICONOS.subir}Compartir</button>`);
      b.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); Archivos.compartirVideo({ archivoId, titulo, deNombre, excluirUsuarioId: usuarioId, fichas }); });
      el.style.position = "relative"; el.appendChild(b);
    };
    // v59: motivo (solo biblioteca) y situaciones en la tarjeta
    const chipsEtiqueta = (el, it) => {
      const ch = [];
      if (it.x && it.tipo) ch.push(chipTipo(it.tipo));
      (it.sit || []).forEach(k => ch.push(`<span class="chip">${esc(SITUACIONES[k] || k).toUpperCase()}</span>`));
      if (ch.length) (el.querySelector(".cuerpo") || el.querySelector("figcaption") || el).appendChild(html(`<div class="chips-conv">${ch.join("")}</div>`));
    };
    const pintarA = () => {
      const ft = ($("#filtroTexto", v) ? $("#filtroTexto", v).value : "").trim().toLowerCase();
      g.innerHTML = "";
      const vis = items.filter(it => (!clase || it.clase === clase) && filtroT.pasa(it) && filtroS.pasa(it) && (!filtroP || filtroP.pasa(it)) && (!ft || (it.texto + " " + it.nombre).toLowerCase().includes(ft)));
      vis.forEach(it => {
        if (it.a) { const el = tarjetaAnalisis(it.a, porId[it.a.pilotoId]); chipsEtiqueta(el, it); g.appendChild(el); if (coach && it.a.videoId) botonCompartir(el, it.a.videoId, it.a.titulo, it._pil.nombre, (porId[it.a.pilotoId] || {}).usuarioId); }
        else if (it.e) {
          it.e._pil = it._pil; const el = tarjetaEnvio(it.e, coach); chipsEtiqueta(el, it); g.appendChild(el);
          if (coach && it.e.archivoId && !it.e.soloDatos) botonCompartir(el, it.e.archivoId, it.e.titulo, it._pil.nombre, it.e.pilotoUsuarioId);
          if (!coach) {
            const b = html(`<button class="btn icono chico peligro" title="Retirar envío" aria-label="Retirar envío" style="position:absolute;top:10px;right:10px;z-index:2">${ICONOS.basura}</button>`);
            b.addEventListener("click", async (ev) => {
              ev.stopPropagation();
              if (!(await confirmar("¿Retirar este video? Tu entrenador ya no lo va a ver.", "Retirar"))) return;
              try { await API.borrar("envios/" + it.e.id); aviso("Envío retirado."); navegar(); } catch (er) { aviso(er.message, "error"); }
            });
            el.style.position = "relative"; el.appendChild(b);
          }
        } else { const el = Archivos.tarjeta(it, { coach, fichas, entrenadores, alCambiar: () => navegar() }); chipsEtiqueta(el, it); g.appendChild(el); }
      });
      if (!vis.length) g.innerHTML = `<div class="vacio" style="grid-column:1/-1">No hay archivos con ese filtro.</div>`;
      else if (window.Archivos) Archivos.pintar(g);
      entradaEscalonada(g, 40);
    };
    const filtroT = barraTipos(items, "archivos", pintarA);
    const filtroS = barraSituaciones(items, "archivos", pintarA);
    const filtroP = coach ? barraPilotos(items, "archivos", it => it._pil, pintarA) : null;
    $$("button", fClase).forEach(b => b.addEventListener("click", () => {
      clase = b.dataset.f; try { sessionStorage.setItem("sf-filtro-clase", clase); } catch (e) {}
      $$("button", fClase).forEach(x => x.classList.toggle("sel", x === b)); pintarA();
    }));
    if ($("#filtroTexto", v)) $("#filtroTexto", v).addEventListener("input", pintarA);
    if (filtroP) g.before(filtroP);
    g.before(filtroT);
    g.before(filtroS);
    pintarA();
    actualizarInsignia(sinVer);
    if (window.__abrirEnviar) { window.__abrirEnviar = false; if (enviar) enviar.click(); }
  }

  // Entrenador: bandeja de lo que le mandaron sus pilotos (ya no está en el menú: la reemplaza Archivos)
  async function pantallaRecibidos(v) {
    const [{ recibidos, sinVer }, rpil] = await Promise.all([API.get("envios"), API.get("pilotos").catch(() => ({ pilotos: [] }))]);
    recibidos.forEach(e => {
      const f = (rpil.pilotos || []).find(p => p.usuarioId && p.usuarioId === e.pilotoUsuarioId);
      e._pil = { k: e.pilotoUsuarioId || e.pilotoNombre || "?", nombre: (f && f.nombre) || e.pilotoNombre, color: (f && f.color) || colorFijo(e.pilotoUsuarioId || e.pilotoNombre) };
    });
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Recibidos</h1>
        <div class="sub-pagina">${recibidos.length ? (sinVer ? sinVer + (sinVer === 1 ? " video nuevo" : " videos nuevos") + " de tus pilotos." : "Todo al día.") : "Los videos que te manden tus pilotos aparecen acá."}</div></div></div>
      <div class="grilla g3" id="listaRecibidos"></div></div>`));
    const g = $("#listaRecibidos", v);
    if (!recibidos.length) g.replaceWith(html(`<div class="vacio entra">Todavía no te mandaron videos.<br>Tus pilotos los envían desde su cuenta, en la sección <b>Enviar</b>. Para que puedan hacerlo tienen que haber aceptado tu invitación (Perfil → Mis alumnos).</div>`));
    else {
      const pintarR = () => {
        g.innerHTML = "";
        const vis = recibidos.filter(e => filtroR.pasa(e) && filtroPR.pasa(e));
        vis.forEach(e => g.appendChild(tarjetaEnvio(e, true)));
        if (!vis.length) g.innerHTML = `<div class="vacio" style="grid-column:1/-1">No hay envíos con ese filtro.</div>`;
        entradaEscalonada(g, 40);
      };
      const filtroR = barraTipos(recibidos, "recibidos", pintarR);
      const filtroPR = barraPilotos(recibidos, "recibidos", e => e._pil, pintarR);
      g.before(filtroPR); g.before(filtroR);
      pintarR();
    }
    actualizarInsignia(sinVer);
  }
  async function pantallaRecibido(v, id) {
    const { envio: e } = await API.get("envios/" + id);
    v.appendChild(html(`<div>
      <a class="btn fantasma chico entra" href="/archivos" style="margin-bottom:16px">${ICONOS.volver}Volver</a>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">${esc(e.titulo)}</h1>
        <div class="sub-pagina">${e.tipo && TIPOS_VIDEO[e.tipo] ? `<b class="tipo-txt tipo-${e.tipo}">${TIPOS_VIDEO[e.tipo].t}</b> · ` : ""}${esc(e.pilotoNombre)}${e.pista ? " · " + esc(e.pista) : ""} · ${fecha(e.fecha || e.creado)}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" data-accion="analizar">${e.soloDatos ? ICONOS.datos : ICONOS.video}${e.estado === "analizado" ? "Abrir análisis" : e.soloDatos ? "Analizar la bajada" : "Analizar este video"}</button></div></div>
      ${e.bajadaId && !e.soloDatos ? `<div class="tarjeta entra con-bajada"><span class="etiqueta">Datos del Sender</span><span>Mandó la bajada <b>${esc(e.bajadaNombre || "")}</b>. Al analizar el video se carga sola y se intenta sincronizar con la GoPro.</span></div>` : ""}
      ${e.respondeA ? `<a class="tarjeta entra correccion-de" href="/analisis/${esc(e.respondeA)}"><span class="etiqueta">Corrección</span><span>Es la corrección de <b>${esc(e.respondeATitulo || "tu devolución")}</b>. Al analizarla queda como la ronda siguiente del mismo entrenamiento. <u>Ver la devolución anterior</u></span></a>` : ""}
      ${e.nota ? `<div class="tarjeta entra" style="margin-bottom:16px"><div class="etiqueta" style="margin-bottom:8px">Lo que dice ${esc(e.pilotoNombre)}</div><p class="prosa" style="margin:0">${esc(e.nota)}</p></div>` : ""}
      ${(e.marcas || []).length ? `<div class="tarjeta entra" style="margin-bottom:16px"><div class="etiqueta" style="margin-bottom:8px">Momentos que marcó ${esc(e.pilotoNombre)}</div>${e.marcas.map(m => `<button type="button" class="marca-piloto" data-ir-t="${m.t}"><span class="t">${tiempo(m.t, false)}</span><span>${esc(m.texto)}</span></button>`).join("")}</div>` : ""}
      <div class="tarjeta entra"><video id="vidEnvio" controls playsinline preload="metadata" style="width:100%;max-height:70vh;background:#000;border-radius:10px"></video></div></div>`));
    const rb = e.bajadaResumen || {};
    if (e.soloDatos) $("#vidEnvio", v).closest(".tarjeta").replaceWith(html(`<div class="tarjeta entra solo-datos">
      <div class="etiqueta">Bajada del Sender · sin video</div>
      <div class="sd-nombre">${esc(e.bajadaNombre || "Bajada")}</div>
      <div class="chips">${rb.duracion ? `<span class="chip">${tiempo(rb.duracion, false)}</span>` : ""}${rb.velMax ? `<span class="chip azul">${rb.velMax} km/h máx.</span>` : ""}${rb.eventos != null ? `<span class="chip violeta">${rb.eventos} eventos</span>` : ""}</div>
      <p class="ayuda">Mandó solo los datos (suspensión, velocidad, golpes). Al analizarla la ves en el Estudio sin video: gráficos, eventos detectados, etiquetas, notas, voz y mensajes, como con un video.</p></div>`));
    else if (e.videoUrl) { const ve = $("#vidEnvio", v); ve.crossOrigin = "anonymous"; ve.addEventListener("error", () => { if (ve.crossOrigin) { ve.removeAttribute("crossorigin"); ve.src = e.videoUrl; } }); ve.src = e.videoUrl; } else $("#vidEnvio", v).replaceWith(html(`<div class="vacio">No se pudo cargar el video.</div>`));
    $$("[data-ir-t]", v).forEach(b => b.addEventListener("click", () => { const vv = $("#vidEnvio", v); if (vv && vv.tagName === "VIDEO") { vv.currentTime = +b.dataset.irT; vv.scrollIntoView({ block: "center", behavior: "smooth" }); } }));
    $("[data-accion=analizar]", v).addEventListener("click", async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { const r = await API.post("envios/" + id + "/analisis"); irA("#/analisis/" + r.analisis.id); }
      catch (er) { aviso(er.message, "error"); b.disabled = false; }
    });
    actualizarInsignia();
  }
  async function actualizarInsignia(n) {
    try {
      if (n == null) n = (await API.get("envios")).sinVer;
      const a = $('.nav-item[data-ruta="archivos"]');
      if (!a) return;
      let b = $(".insignia", a);
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("b"); b.className = "insignia"; a.appendChild(b); }
      b.textContent = n;
    } catch (e) {}
  }

  // Piloto: mis envíos y devoluciones
  async function pantallaEnviar(v) {
    const [re, rn] = await Promise.all([API.get("envios"), API.get("entrenadores")]);
    const enviados = re.enviados, entrenadores = rn.entrenadores;
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Enviar</h1>
        <div class="sub-pagina">${entrenadores.length ? "Mandale un video, una bajada del Sender o las dos cosas a tu entrenador y recibí su devolución: dibujos, notas escritas, comentarios grabados." : "Primero necesitás un entrenador: buscalo en la lista o pedile que te invite."}</div></div>
        ${entrenadores.length ? `<button class="btn primario" data-accion="enviar">${ICONOS.subir}Enviar video o bajada</button>` : ""}</div>
      <div class="grilla g3" id="listaEnvios"></div></div>`));
    const g = $("#listaEnvios", v);
    if (!entrenadores.length) g.replaceWith(html(`<div class="vacio entra">Todavía no tenés un entrenador vinculado.<br>Buscá uno en la lista de entrenadores, o pedile que te invite con tu email (<b>${esc(USUARIO.email)}</b>).<br><a class="btn primario" style="margin-top:14px" href="/perfil#entrenadores">Buscar entrenador</a></div>`));
    else if (!enviados.length) g.replaceWith(html(`<div class="vacio entra">Todavía no mandaste videos.</div>`));
    else enviados.forEach(e => {
      const el = tarjetaEnvio(e, false);
      if (e.estado !== "analizado") {
        const b = html(`<button class="btn icono chico peligro" title="Retirar envío" aria-label="Retirar envío" style="position:absolute;top:10px;right:10px;z-index:2">${ICONOS.basura}</button>`);
        b.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          if (!(await confirmar("¿Retirar este video? Tu entrenador ya no lo va a ver.", "Retirar"))) return;
          try { await API.borrar("envios/" + e.id); aviso("Envío retirado."); navegar(); } catch (er) { aviso(er.message, "error"); }
        });
        el.style.position = "relative"; el.appendChild(b);
      }
      g.appendChild(el);
    });
    const be = $("[data-accion=enviar]", v);
    if (be) be.addEventListener("click", async () => { if (await subirArchivos({ coach: false, fichas: [], entrenadores })) navegar(); });
  }
  async function enviarVideo(entrenadores, corr, archivoInicial) {
    // v17: corrección de una devolución → va al mismo entrenador y queda colgada de ella
    if (corr) entrenadores = entrenadores.filter(e => e.id === corr.coachId);
    if (corr && !entrenadores.length) { aviso("Ya no tenés vínculo con el entrenador de esta devolución.", "error"); return; }
    const hoy = new Date().toISOString().slice(0, 10);
    let archivo = null;
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo ancho"><div class="soltar" tabindex="0">${ICONOS.subir}<div><b style="color:var(--ink)">Elegí el video</b> o arrastralo acá</div><div style="font-size:12px;margin-top:4px">MP4, MOV o WebM, de cualquier largo. Se puede recortar y se achica solo antes de subir. <b>Sin video</b>: elegí solo la bajada del Sender, más abajo.</div><div class="archivo"></div></div></div>
      <div class="campo ancho"><label>¿Qué es este video?</label><div class="tipos-video" role="radiogroup" aria-label="Tipo de video">
        ${Object.entries(TIPOS_VIDEO).map(([k, v]) => `<button type="button" class="tipo-video ${corr && k === "entrenamiento" ? "sel" : ""}" data-tipo="${k}" role="radio" aria-checked="${corr && k === "entrenamiento" ? "true" : "false"}"><b>${v.t}</b><span>${v.d}</span></button>`).join("")}
      </div></div>
      <div class="campo ancho"><label>Bajada del Sender <span class="opcional">(opcional si mandás video)</span></label>
        <div class="bajada-adjunta"><select class="input" name="bajada"><option value="">Sin bajada</option></select>
          <button type="button" class="btn chico" data-b="subir">${ICONOS.subir}Subir .sfb</button></div>
        <small class="ayuda-chica">Con video, tu entrenador ve suspensión, velocidad y golpes sincronizados. Sin video, analiza solo los datos.</small></div>
      ${entrenadores.length > 1 ? `<div class="campo ancho"><label>Para</label><select class="input" name="coach">${entrenadores.map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("")}</select></div>` : ""}
      ${corr ? `<div class="campo ancho"><div class="aviso-correccion">Corrección de <b>${esc(corr.titulo)}</b> · ronda ${(corr.ronda || 1) + 1}. Tu entrenador la ve encadenada a su devolución.</div></div>` : ""}
      <div class="campo"><label>Título</label><input class="input" name="titulo" placeholder="Curva del bosque, salto final…" maxlength="160" value="${corr ? esc(("Corrección " + (corr.ronda || 1) + ": " + String(corr.titulo || "").replace(/^Corrección( \d+)?:\s*/i, "")).slice(0, 160)) : ""}"></div>
      <div class="campo"><label>Fecha</label><input class="input" type="date" name="fecha" value="${hoy}"></div>
      <div class="campo ancho"><label>Pista</label><input class="input" name="pista" maxlength="120"></div>
      <div class="campo ancho"><label>Qué querés que mire</label><textarea class="input" name="nota" maxlength="2000" placeholder="${corr ? "¿Qué cambiaste respecto del video anterior?" : "No me sale la curva, frené tarde…"}"></textarea></div>
      <div class="campo ancho progreso-subida oculto"><label>Subiendo el video</label><div class="barra-progreso"><i></i></div><small class="txt-progreso"></small></div>
    </div>`);
    const zona = $(".soltar", cuerpo);
    const panel = panelRecorte(cuerpo);
    const marcasPiloto = panelMarcas(cuerpo);
    let tipoVideo = corr ? "entrenamiento" : null;
    // v20: bajada del Sender adjunta (una de las mías, o un .sfb que se sube al enviar)
    let bajadaNueva = null;
    const selB = $("[name=bajada]", cuerpo);
    const misBajadas = {};
    API.get("bajadas").then(r => (r.bajadas || []).filter(b => b.propia !== false).forEach(b => {
      misBajadas[b.id] = b;
      const o = document.createElement("option"); o.value = b.id;
      o.textContent = b.nombre + (b.fecha ? " · " + fecha(b.fecha) : "") + (b.resumen && b.resumen.duracion ? " · " + tiempo(b.resumen.duracion, false) : "");
      selB.appendChild(o);
    })).catch(() => {});
    $("[data-b=subir]", cuerpo).addEventListener("click", async () => {
      const f = await UI.elegirArchivo(".sfb,.sfpb,application/octet-stream"); if (!f) return;
      try {
        const d = await SenderDatos.leerArchivo(f);
        bajadaNueva = { f, resumen: SenderDatos.resumen(d) };
        let o = $("option[data-nueva]", selB); if (!o) { o = document.createElement("option"); o.dataset.nueva = "1"; o.value = "__nueva"; selB.appendChild(o); }
        o.textContent = f.name + " (se sube al enviar)"; selB.value = "__nueva";
      } catch (e) { aviso("Ese archivo no es una bajada válida del Sender: " + (e.message || e), "error"); }
    });
    $$(".tipo-video", cuerpo).forEach(b => b.addEventListener("click", () => {
      tipoVideo = b.dataset.tipo;
      $$(".tipo-video", cuerpo).forEach(x => { x.classList.toggle("sel", x === b); x.setAttribute("aria-checked", x === b ? "true" : "false"); });
      const n = $("[name=nota]", cuerpo); if (n && !corr) n.placeholder = TIPOS_VIDEO[tipoVideo].ph;
    }));
    const tomar = (f) => {
      if (!f) return;
      if (!/^video\//.test(f.type) && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) { aviso("Ese archivo no es un video.", "error"); return; }
      archivo = f; $(".archivo", zona).textContent = f.name + " · " + (f.size / 1048576).toFixed(0) + " MB"; panel.poner(f);
      const t = $("[name=titulo]", cuerpo); if (!t.value) t.value = f.name.replace(/\.[^.]+$/, "");
    };
    zona.addEventListener("click", async () => tomar(await UI.elegirArchivo("video/*")));
    zona.addEventListener("keydown", async (e) => { if (e.key === "Enter") tomar(await UI.elegirArchivo("video/*")); });
    zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("encima"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
    zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("encima"); tomar(e.dataTransfer.files[0]); });
    if (archivoInicial) tomar(archivoInicial);   // viene de "Subir archivos"
    await abrirModal({
      titulo: corr ? "Mandar corrección" : "Enviar video o bajada", cuerpo,
      acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Subir y enviar", clase: "primario", alHacer: async (c) => {
        if (!archivo && !selB.value) { aviso("Elegí el video, una bajada del Sender, o las dos cosas.", "error"); return false; }
        if (!tipoVideo) { aviso("Elegí qué es el video: entrenamiento, carrera, antes de una carrera u otro.", "error"); const g = $(".tipos-video", c); if (g) g.scrollIntoView({ block: "center", behavior: "smooth" }); return false; }
        const boton = $(".modal-pie .primario", c.parentElement);
        boton.disabled = true; boton.textContent = "Preparando…";
        const prog = $(".progreso-subida", c), barra = $(".barra-progreso i", c), txt = $(".txt-progreso", c);
        try {
          const subir = !archivo ? null : await (async () => {
            if (panel.problema()) throw new Error(panel.problema());
            prog.classList.remove("oculto"); $("label", prog).textContent = "Preparando el video"; boton.textContent = "Preparando…";
            let frenar = null, salteado = false;
            const bSaltar = html(`<button type="button" class="btn chico fantasma saltar-compresion">Subir sin achicar</button>`);
            prog.append(bSaltar);
            try { prog.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
            bSaltar.addEventListener("click", () => { salteado = true; bSaltar.disabled = true; bSaltar.textContent = "Frenando…"; if (frenar) frenar(); });
            const t0c = performance.now();
            const resta = (f) => { if (f < 0.02) return "calculando el tiempo…"; const s = (performance.now() - t0c) / 1000 * (1 - f) / f; return s < 60 ? "falta menos de 1 min" : `faltan unos ${Math.round(s / 60)} min`; };
            let r;
            try {
              r = await prepararVideo(archivo, panel.recorte(), (f) => { barra.style.width = (f * 100).toFixed(1) + "%"; txt.textContent = `Achicando el video · ${(f * 100).toFixed(0)} % · ${resta(f)} · no cierres la página`; }, (fn) => { frenar = fn; if (salteado) fn(); });
            } catch (e) {
              if (!(e && e.cancelado)) throw e;
              r = archivo; aviso("Se sube el video original, sin achicar" + (panel.recorte() ? " ni recortar" : "") + ".", "oro");
            } finally { bSaltar.remove(); }
            if (r !== archivo) aviso(`Video listo: ${(archivo.size / 1048576).toFixed(0)} MB → ${(r.size / 1048576).toFixed(0)} MB.`, "oro");
            $("label", prog).textContent = "Subiendo el video"; barra.style.width = "0%";
            return r;
          })();
          const info = subir ? await leerVideo(subir) : {};
          prog.classList.remove("oculto"); boton.textContent = "Subiendo…";
          const t0 = performance.now();
          const archivoId = !subir ? null : await API.subirArchivo(subir, "envio", subir.name, (f) => {
            barra.style.width = (f * 100).toFixed(1) + "%";
            const seg = (performance.now() - t0) / 1000, resta = f > 0.02 ? seg / f * (1 - f) : 0;
            txt.textContent = `${(f * 100).toFixed(0)} % · ${(subir.size * f / 1048576).toFixed(0)} de ${(subir.size / 1048576).toFixed(0)} MB${resta > 2 ? ` · faltan ~${Math.ceil(resta)} s` : ""}`;
          });
          // v20: bajada adjunta
          let bajadaId = selB.value && selB.value !== "__nueva" ? selB.value : null;
          if (selB.value === "__nueva" && bajadaNueva) {
            $("label", prog).textContent = "Subiendo la bajada";
            const bArch = await API.subirArchivo(bajadaNueva.f, "bajada", bajadaNueva.f.name);
            const rb = await API.post("bajadas", { archivoId: bArch, nombre: bajadaNueva.f.name.replace(/\.[^.]+$/, ""), fecha: new Date(bajadaNueva.f.lastModified || Date.now()).toISOString(), resumen: bajadaNueva.resumen, origen: "archivo" });
            bajadaId = (rb && (rb.bajada && rb.bajada.id || rb.id)) || null;
          }
          // v21: sin video → envío solo con los datos (duración y título de la bajada)
          if (!subir) {
            const bInfo = misBajadas[bajadaId] || {};
            info.duracion = (bInfo.resumen && bInfo.resumen.duracion) || (bajadaNueva && bajadaNueva.resumen && bajadaNueva.resumen.duracion) || 0;
            if (!$("[name=titulo]", c).value.trim()) $("[name=titulo]", c).value = bInfo.nombre || (bajadaNueva ? bajadaNueva.f.name.replace(/\.[^.]+$/, "") : "Bajada");
          }
          const sel = $("[name=coach]", c);
          const rEnv = await API.post("envios", { coachId: sel ? sel.value : entrenadores[0].id, archivoId, respondeA: corr ? corr.id : null, tipo: tipoVideo, bajadaId,
            titulo: $("[name=titulo]", c).value.trim() || (archivo ? archivo.name : "Bajada"), pista: $("[name=pista]", c).value.trim(), fecha: $("[name=fecha]", c).value || hoy,
            nota: $("[name=nota]", c).value.trim(), marcas: subir ? marcasPiloto.lista(subir !== archivo ? panel.recorte() : null) : [], duracion: info.duracion, ancho: info.ancho, alto: info.alto, miniatura: info.miniatura });
          if (rEnv && rEnv.envio && rEnv.envio.id) API.avisar("envio", rEnv.envio.id);   // v27: push al entrenador
          aviso(corr ? "Corrección enviada a tu entrenador." : subir ? "Video enviado a tu entrenador." : "Bajada enviada a tu entrenador.");
          navegar();
          return true;
        } catch (e) {
          aviso(e.message || "No se pudo enviar el video.", "error");
          boton.disabled = false; boton.textContent = "Subir y enviar";
          return false;
        }
      } }]
    });
  }

  // ======================================================================= v59: UNA SOLA ventana para subir (coach_v30.sql)
  // Cualquier archivo (video, foto, documento o, el piloto, una bajada del Sender sola) con motivo, situación, fecha, título y pista.
  // No hay "analizarlo ahora": todo lo que sube el entrenador queda primero en su biblioteca y se analiza desde Archivos → Analizar.
  // Devuelve true si se subió algo.

  // Recorta, achica y sube un video. Devuelve { blob, info, archivoId } (blob = lo que se subió, info = duración, tamaño y miniatura).
  async function prepararYSubirVideo(archivo, panel, c, boton, clase) {
    if (panel.problema()) throw new Error(panel.problema());
    const prog = $(".progreso-subida", c), barra = $(".barra-progreso i", c), txt = $(".txt-progreso", c);
    prog.classList.remove("oculto"); $("label", prog).textContent = "Preparando el video"; boton.textContent = "Preparando…";
    let frenar = null, salteado = false;
    const bSaltar = html(`<button type="button" class="btn chico fantasma saltar-compresion">Subir sin achicar</button>`);
    prog.append(bSaltar);
    try { prog.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
    bSaltar.addEventListener("click", () => { salteado = true; bSaltar.disabled = true; bSaltar.textContent = "Frenando…"; if (frenar) frenar(); });
    const t0c = performance.now();
    const resta = (f) => { if (f < 0.02) return "calculando el tiempo…"; const s = (performance.now() - t0c) / 1000 * (1 - f) / f; return s < 60 ? "falta menos de 1 min" : `faltan unos ${Math.round(s / 60)} min`; };
    let r;
    try {
      r = await prepararVideo(archivo, panel.recorte(), (f) => { barra.style.width = (f * 100).toFixed(1) + "%"; txt.textContent = `Achicando el video · ${(f * 100).toFixed(0)} % · ${resta(f)} · no cierres la página`; }, (fn) => { frenar = fn; if (salteado) fn(); });
    } catch (e) {
      if (!(e && e.cancelado)) throw e;
      r = archivo; aviso("Se sube el video original, sin achicar" + (panel.recorte() ? " ni recortar" : "") + ".", "oro");
    } finally { bSaltar.remove(); }
    if (r !== archivo) aviso(`Video listo: ${(archivo.size / 1048576).toFixed(0)} MB → ${(r.size / 1048576).toFixed(0)} MB.`, "oro");
    $("label", prog).textContent = "Subiendo el video"; barra.style.width = "0%";
    const info = await leerVideo(r);
    boton.textContent = "Subiendo…";
    const t0 = performance.now();
    const archivoId = await API.subirArchivo(r, clase, r.name, (f) => {
      barra.style.width = (f * 100).toFixed(1) + "%";
      const seg = (performance.now() - t0) / 1000, falta = f > 0.02 ? seg / f * (1 - f) : 0;
      txt.textContent = `${(f * 100).toFixed(0)} % · ${(r.size * f / 1048576).toFixed(0)} de ${(r.size / 1048576).toFixed(0)} MB${falta > 2 ? ` · faltan ~${Math.ceil(falta)} s` : ""}`;
    });
    return { blob: r, info, archivoId };
  }

  async function subirArchivos(ctx) {
    ctx = ctx || {};
    const coach = !!ctx.coach, fichas = ctx.fichas || [], entrenadores = ctx.entrenadores || [];
    const personas = coach ? fichas.filter(p => p.usuarioId).map(p => ({ id: p.usuarioId, nombre: p.nombre })) : entrenadores.map(e => ({ id: e.id, nombre: e.nombre }));
    let convs = []; try { convs = await Archivos.conversaciones(); } catch (e) { /* sin conversaciones: solo biblioteca o persona */ }
    if (!coach && !personas.length) { aviso("Para subir archivos tenés que tener un entrenador vinculado.", "oro"); return false; }
    const hoy = new Date().toISOString().slice(0, 10);
    let archivo = null;   // { f, t, clase }
    let motivo = null; const situ = new Set();
    const opcionesDestino = (coach
      ? [`<option value="b:">Guardarlo en mi biblioteca (queda a mi nombre; lo analizás o lo usás con cualquier piloto)</option>`,
         personas.length ? `<optgroup label="Pasárselo a un piloto (queda en Archivos de los dos)">${personas.map(p => `<option value="p:${esc(p.id)}">${esc(p.nombre)}</option>`).join("")}</optgroup>` : ""]
      : [personas.length ? `<optgroup label="Enviárselo a mi entrenador">${personas.map(p => `<option value="e:${esc(p.id)}">${esc(p.nombre)}</option>`).join("")}</optgroup>` : ""])
      .concat(convs.length ? [`<optgroup label="Mandarlo por mensaje en la conversación de… (solo fotos y documentos)">${convs.map(x => `<option value="c:${esc(x.id)}">${esc(x.texto)}</option>`).join("")}</optgroup>`] : []).join("");
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo ancho"><div class="soltar" tabindex="0">${ICONOS.subir}<div><b style="color:var(--ink)">Elegí un archivo</b> o arrastralo acá</div>
        <div style="font-size:12px;margin-top:4px">Videos MP4, MOV o WebM (de cualquier largo; se pueden recortar y se achican solos). Fotos JPG, PNG o WebP (hasta 15 MB). Documentos PDF, Word, Excel o texto (hasta 25 MB).</div><div class="archivo"></div></div></div>
      ${coach ? "" : `<div class="campo ancho" data-bajada><label>Bajada del Sender <span class="opcional">(opcional con un video; sola, tu entrenador analiza solo los datos)</span></label>
        <div class="bajada-adjunta"><select class="input" name="bajada"><option value="">Sin bajada</option></select>
          <button type="button" class="btn chico" data-b="subir">${ICONOS.subir}Subir .sfb</button></div>
        <small class="ayuda-chica">Con video, tu entrenador ve suspensión, velocidad y golpes sincronizados.</small></div>`}
      <div class="campo ancho"><label>¿A dónde va este archivo?</label><select class="input" name="destino">${opcionesDestino}</select></div>
      <div class="campo ancho"><label>Motivo <span class="opcional">(opcional: para qué es)</span></label>
        <div class="filtro-tipos" data-g="motivo" role="group" aria-label="Motivo">${Object.entries(TIPOS_VIDEO).map(([k, v]) => `<button type="button" data-v="${k}" class="tipo-${k}" aria-pressed="false" title="${esc(v.d)}">${esc(v.t)}</button>`).join("")}</div></div>
      <div class="campo ancho"><label>Situación <span class="opcional">(opcional: qué muestra; podés marcar más de una)</span></label>
        <div class="filtro-tipos" data-g="situacion" role="group" aria-label="Situación">${Object.entries(SITUACIONES).map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="false">${esc(t)}</button>`).join("")}</div></div>
      <div class="campo"><label>Título <span class="opcional">(opcional)</span></label><input class="input" name="titulo" maxlength="160" placeholder="Curva del bosque, salto final…"></div>
      <div class="campo"><label>Fecha</label><input class="input" type="date" name="fecha" value="${hoy}"></div>
      <div class="campo ancho"><label>Pista <span class="opcional">(opcional)</span></label><input class="input" name="pista" maxlength="120"></div>
      <div class="campo ancho"><label data-r="nota">Mensaje <span class="opcional">(opcional)</span></label><textarea class="input" name="nota" maxlength="2000"></textarea></div>
      <div class="campo ancho progreso-subida oculto"><label>Subiendo</label><div class="barra-progreso"><i></i></div><small class="txt-progreso"></small></div></div>`);
    const zona = $(".soltar", cuerpo);
    const panel = panelRecorte(cuerpo);
    const marcasPiloto = coach ? null : panelMarcas(cuerpo);
    const cajaRecorte = $(".recorte-video", cuerpo);
    const selDest = $("[name=destino]", cuerpo), selB = $("[name=bajada]", cuerpo), nota = $("[name=nota]", cuerpo);
    // motivo: uno solo (tocar otra vez lo quita); situación: varias
    $$("[data-g=motivo] button", cuerpo).forEach(b => b.addEventListener("click", () => {
      motivo = motivo === b.dataset.v ? null : b.dataset.v;
      $$("[data-g=motivo] button", cuerpo).forEach(x => { x.classList.toggle("sel", x.dataset.v === motivo); x.setAttribute("aria-pressed", x.dataset.v === motivo ? "true" : "false"); });
      refrescar();
    }));
    $$("[data-g=situacion] button", cuerpo).forEach(b => b.addEventListener("click", () => {
      if (situ.has(b.dataset.v)) situ.delete(b.dataset.v); else situ.add(b.dataset.v);
      b.classList.toggle("sel", situ.has(b.dataset.v)); b.setAttribute("aria-pressed", situ.has(b.dataset.v) ? "true" : "false");
    }));
    // bajada del Sender (piloto): una de las suyas o un .sfb que se sube al enviar
    let bajadaNueva = null; const misBajadas = {};
    if (selB) {
      API.get("bajadas").then(r => (r.bajadas || []).filter(b => b.propia !== false).forEach(b => {
        misBajadas[b.id] = b;
        const o = document.createElement("option"); o.value = b.id;
        o.textContent = b.nombre + (b.fecha ? " · " + fecha(b.fecha) : "") + (b.resumen && b.resumen.duracion ? " · " + tiempo(b.resumen.duracion, false) : "");
        selB.appendChild(o);
      })).catch(() => {});
      selB.addEventListener("change", () => refrescar());
      $("[data-b=subir]", cuerpo).addEventListener("click", async () => {
        const f = await UI.elegirArchivo(".sfb,.sfpb,application/octet-stream"); if (!f) return;
        try {
          const d = await SenderDatos.leerArchivo(f);
          bajadaNueva = { f, resumen: SenderDatos.resumen(d) };
          let o = $("option[data-nueva]", selB); if (!o) { o = document.createElement("option"); o.dataset.nueva = "1"; o.value = "__nueva"; selB.appendChild(o); }
          o.textContent = f.name + " (se sube al enviar)"; selB.value = "__nueva"; refrescar();
        } catch (e) { aviso("Ese archivo no es una bajada válida del Sender: " + (e.message || e), "error"); }
      });
    }
    // lo que cambia según lo elegido: los mensajes solo aceptan fotos y documentos; la bajada solo va con un video o sola
    function refrescar() {
      const esVid = !!archivo && archivo.clase === "video", soloBajada = !archivo && !!(selB && selB.value);
      const wrap = $("[data-bajada]", cuerpo); if (wrap) wrap.classList.toggle("oculto", !!archivo && !esVid);
      $$("option[value^='c:']", selDest).forEach(o => { o.disabled = esVid || soloBajada; });
      if (selDest.selectedOptions[0] && selDest.selectedOptions[0].disabled) selDest.value = (coach ? "b:" : "e:" + personas[0].id);
      const aEntrenador = !coach && selDest.value.startsWith("e:");
      $("[data-r=nota]", cuerpo).innerHTML = (aEntrenador ? "Qué querés que mire tu entrenador" : coach && selDest.value.startsWith("p:") ? "Mensaje para el piloto" : "Mensaje") + ` <span class="opcional">(opcional)</span>`;
      nota.placeholder = aEntrenador ? (motivo && TIPOS_VIDEO[motivo] ? TIPOS_VIDEO[motivo].ph : "No me sale la curva, frené tarde…") : "";
    }
    selDest.addEventListener("change", refrescar);
    const tomar = (f) => {
      if (!f) return;
      const k = Archivos.clasificar(f);
      if (!k) { aviso("Ese archivo no se puede subir. Usá un video MP4, MOV o WebM, una foto JPG, PNG o WebP, o un documento PDF, Word, Excel o texto.", "error"); return; }
      const max = k.clase === "video" ? 1024 : k.clase === "imagen" ? 15 : 25;
      if (f.size > max * 1048576) { aviso(`El archivo supera el máximo de ${max} MB.`, "error"); return; }
      archivo = { f, t: k.t, clase: k.clase };
      $(".archivo", zona).textContent = f.name + " · " + Archivos.tam(f.size);
      const ti = $("[name=titulo]", cuerpo); if (!ti.value) ti.value = f.name.replace(/\.[^.]+$/, "");
      if (k.clase === "video") panel.poner(f); else cajaRecorte.classList.add("oculto");
      refrescar();
    };
    zona.addEventListener("click", async () => tomar(await UI.elegirArchivo(Archivos.ACEPTA)));
    zona.addEventListener("keydown", async (e) => { if (e.key === "Enter") tomar(await UI.elegirArchivo(Archivos.ACEPTA)); });
    zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("encima"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
    zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("encima"); tomar(e.dataTransfer.files[0]); });
    refrescar();
    return abrirModal({ titulo: "Subir archivos", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Subir", clase: "primario", alHacer: async (c) => {
      const destino = selDest.value, esVideo = !!archivo && archivo.clase === "video", soloBajada = !archivo;
      if (!archivo && !(selB && selB.value)) { aviso(coach ? "Elegí el archivo." : "Elegí un archivo o una bajada del Sender.", "error"); return false; }
      if (!destino) { aviso("Elegí a dónde va.", "error"); return false; }
      if ((esVideo || soloBajada) && destino.startsWith("c:")) { aviso("Los videos y las bajadas no se mandan por mensaje: " + (coach ? "guardalo en tu biblioteca o pasáselo a un piloto." : "mandalos a tu entrenador."), "error"); return false; }
      if (esVideo && panel.problema()) { aviso(panel.problema(), "error"); return false; }
      const titulo = $("[name=titulo]", c).value.trim(), pista = $("[name=pista]", c).value.trim(), fechaSel = $("[name=fecha]", c).value || hoy, texto = nota.value.trim();
      const datos = { motivo, situaciones: [...situ], pista, fecha: fechaSel };
      const boton = $(".modal-pie .primario", c.parentElement);
      boton.disabled = true; boton.textContent = "Preparando…";
      const prog = $(".progreso-subida", c), barra = $(".barra-progreso i", c), txt = $(".txt-progreso", c);
      const etiquetar = async (tipo, ref, extra) => {
        try { await API.post("etiquetas", { tipo, ref, datos: Object.assign({}, datos, extra || {}) }); return true; }
        catch (e) { aviso("Se subió, pero no se pudieron guardar el motivo y la situación (¿corriste coach_v30.sql en Supabase?).", "oro"); return false; }
      };
      try {
        let mensaje = "Archivo subido.";
        if (coach) {
          // ---- entrenador: todo pasa por su biblioteca ----
          let id, info = null;
          if (esVideo) { const r = await prepararYSubirVideo(archivo.f, panel, c, boton, "video"); id = r.archivoId; info = { duracion: r.info.duracion, ancho: r.info.ancho, alto: r.info.alto, miniatura: r.info.miniatura }; }
          else {
            prog.classList.remove("oculto"); boton.textContent = "Subiendo…";
            id = await API.subirArchivo(archivo.f.slice(0, archivo.f.size, archivo.t), archivo.clase, archivo.f.name, (p) => { barra.style.width = (p * 100).toFixed(0) + "%"; txt.textContent = Math.round(p * 100) + " %"; });
          }
          if (esVideo || destino === "b:") await API.post("biblioteca", { archivoId: id, titulo, nota: texto });
          if (destino.startsWith("p:")) await API.post("compartidos", { archivoId: id, paraId: destino.slice(2), titulo, nota: texto });
          else if (destino.startsWith("c:")) await API.post("analisis/" + destino.slice(2) + "/comentarios", { texto: texto || titulo, t: null, archivoId: id });
          await etiquetar("archivo", id, info ? { info } : null);
          mensaje = destino.startsWith("p:") ? "Archivo enviado: lo ve en su sección Archivos." : destino.startsWith("c:") ? "Enviado por mensaje." : esVideo ? "Guardado en tu biblioteca. Para analizarlo, abrilo desde Archivos." : "Guardado en tu biblioteca.";
        } else if (destino.startsWith("e:") && (esVideo || soloBajada)) {
          // ---- piloto: video y/o bajada → envío a su entrenador ----
          let archivoId = null, info = {}, blob = null;
          if (esVideo) { const r = await prepararYSubirVideo(archivo.f, panel, c, boton, "envio"); archivoId = r.archivoId; info = r.info; blob = r.blob; }
          prog.classList.remove("oculto"); boton.textContent = "Subiendo…";
          let bajadaId = selB.value && selB.value !== "__nueva" ? selB.value : null;
          if (selB.value === "__nueva" && bajadaNueva) {
            $("label", prog).textContent = "Subiendo la bajada";
            const bArch = await API.subirArchivo(bajadaNueva.f, "bajada", bajadaNueva.f.name);
            const rb = await API.post("bajadas", { archivoId: bArch, nombre: bajadaNueva.f.name.replace(/\.[^.]+$/, ""), fecha: new Date(bajadaNueva.f.lastModified || Date.now()).toISOString(), resumen: bajadaNueva.resumen, origen: "archivo" });
            bajadaId = (rb && (rb.bajada && rb.bajada.id || rb.id)) || null;
          }
          let tituloEnv = titulo;
          if (!esVideo) {   // sin video: el envío lleva solo los datos
            const bInfo = misBajadas[bajadaId] || {};
            info.duracion = (bInfo.resumen && bInfo.resumen.duracion) || (bajadaNueva && bajadaNueva.resumen && bajadaNueva.resumen.duracion) || 0;
            if (!tituloEnv) tituloEnv = bInfo.nombre || (bajadaNueva ? bajadaNueva.f.name.replace(/\.[^.]+$/, "") : "Bajada");
          }
          const rEnv = await API.post("envios", { coachId: destino.slice(2), archivoId, respondeA: null, tipo: motivo, bajadaId,
            titulo: tituloEnv || (archivo ? archivo.f.name : "Bajada"), pista, fecha: fechaSel, nota: texto,
            marcas: blob ? marcasPiloto.lista(blob !== archivo.f ? panel.recorte() : null) : [], duracion: info.duracion, ancho: info.ancho, alto: info.alto, miniatura: info.miniatura });
          if (rEnv && rEnv.envio && rEnv.envio.id) API.avisar("envio", rEnv.envio.id);   // push al entrenador
          if (situ.size) { if (archivoId) await etiquetar("archivo", archivoId); else if (bajadaId) await etiquetar("bajada", bajadaId); }
          mensaje = esVideo ? "Video enviado a tu entrenador." : "Bajada enviada a tu entrenador.";
        } else {
          // ---- piloto: foto o documento, a su entrenador o por mensaje ----
          if (esVideo || soloBajada) { aviso("Los videos y las bajadas se mandan a tu entrenador.", "error"); boton.disabled = false; boton.textContent = "Subir"; return false; }
          prog.classList.remove("oculto"); boton.textContent = "Subiendo…";
          const id = await API.subirArchivo(archivo.f.slice(0, archivo.f.size, archivo.t), archivo.clase, archivo.f.name, (p) => { barra.style.width = (p * 100).toFixed(0) + "%"; txt.textContent = Math.round(p * 100) + " %"; });
          if (destino.startsWith("e:")) await API.post("compartidos", { archivoId: id, paraId: destino.slice(2), titulo, nota: texto });
          else if (destino.startsWith("c:")) await API.post("analisis/" + destino.slice(2) + "/comentarios", { texto: texto || titulo, t: null, archivoId: id });
          if (motivo || situ.size || pista) await etiquetar("archivo", id);
          mensaje = destino.startsWith("c:") ? "Enviado por mensaje." : "Archivo enviado a tu entrenador: lo ve en su sección Archivos.";
        }
        aviso(mensaje, "oro");
        return true;
      } catch (e) {
        aviso(e.message || "No se pudo subir el archivo.", "error");
        prog.classList.add("oculto"); boton.disabled = false; boton.textContent = "Subir";
        return false;
      }
    } }] });
  }

  // Duración y tamaño de un video guardado, leídos del propio archivo (para videos subidos antes de coach_v30.sql)
  function metaDeUrl(url) {
    return new Promise((ok) => {
      const v = document.createElement("video"); let listo = false;
      const fin = (r) => { if (listo) return; listo = true; clearTimeout(lim); v.removeAttribute("src"); v.load(); ok(r); };
      const cero = { duracion: 0, ancho: 0, alto: 0, miniatura: "" };
      const lim = setTimeout(() => fin(cero), 15000);
      v.preload = "metadata"; v.muted = true;
      v.addEventListener("loadedmetadata", () => fin({ duracion: v.duration || 0, ancho: v.videoWidth || 0, alto: v.videoHeight || 0, miniatura: "" }));
      v.addEventListener("error", () => fin(cero));
      v.src = url;
    });
  }

  // Analizar un video de la biblioteca: crea el análisis sobre el MISMO archivo (sin copias) y abre el Estudio
  async function analizarDeBiblioteca(x) {
    let pilotos = (await API.get("pilotos")).pilotos;
    if (!pilotos.length) {
      aviso("Primero agregá un piloto.", "oro");
      const p = await editarPiloto(); if (!p) return null;
      pilotos = [p];
    }
    let et = null; try { et = ((await API.get("etiquetas")).etiquetas || []).find(t => t.tipo === "archivo" && t.ref === x.archivoId) || null; } catch (e) { /* sin etiquetas */ }
    const hoy = new Date().toISOString().slice(0, 10);
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo"><label>Piloto</label><select class="input" name="piloto">${pilotos.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</select></div>
      <div class="campo"><label>Fecha</label><input class="input" type="date" name="fecha" value="${esc((et && et.fecha) || hoy)}"></div>
      <div class="campo"><label>Título</label><input class="input" name="titulo" maxlength="160" value="${esc(x.titulo || String(x.nombre || "").replace(/\.[^.]+$/, ""))}"></div>
      <div class="campo"><label>Pista</label><input class="input" name="pista" maxlength="120" value="${esc((et && et.pista) || "")}"></div></div>`);
    return abrirModal({ titulo: "Analizar este video", cuerpo, acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Analizar", clase: "primario", alHacer: async (c) => {
      try {
        let info = null; try { info = (await API.get("etiquetas/info/" + x.archivoId)).info || null; } catch (e) { /* video anterior a coach_v30.sql */ }
        if (!info) { const u = await API.urls([x.archivoId]); info = u[x.archivoId] ? await metaDeUrl(u[x.archivoId]) : { duracion: 0, ancho: 0, alto: 0, miniatura: "" }; }
        const r = await API.post("analisis", {
          pilotoId: $("[name=piloto]", c).value, titulo: $("[name=titulo]", c).value.trim() || x.nombre || "Sin título",
          pista: $("[name=pista]", c).value.trim(), fecha: $("[name=fecha]", c).value || hoy, videoId: x.archivoId,
          duracion: info.duracion, ancho: info.ancho, alto: info.alto, miniatura: info.miniatura || "",
          recorte: { ini: 0, fin: info.duracion }, anotaciones: [], etiquetas: [], notas: { fortalezas: "", mejorar: "", observaciones: "" }, sender: null });
        if (et && et.motivo) { try { await API.put("analisis/" + r.analisis.id + "/tipo", { tipo: et.motivo }); } catch (e) { /* el motivo se puede cambiar en el Estudio */ } }
        irA("#/analisis/" + r.analisis.id);
        return r.analisis;
      } catch (e) { aviso(e.message || "No se pudo crear el análisis.", "error"); return false; }
    } }] });
  }

  const OJO_A = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OJO_C = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A10.7 10.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function ponerOjos(raiz) {
    $$('input[type="password"]', raiz).forEach(inp => {
      if (inp.dataset.ojo) return; inp.dataset.ojo = "1";
      const caja = document.createElement("div"); caja.className = "clave-caja";
      inp.parentNode.insertBefore(caja, inp); caja.appendChild(inp);
      const b = document.createElement("button"); b.type = "button"; b.className = "clave-ojo";
      const poner = (ver) => { inp.type = ver ? "text" : "password"; b.innerHTML = ver ? OJO_C : OJO_A; b.setAttribute("aria-pressed", ver ? "true" : "false"); b.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña"); b.title = b.getAttribute("aria-label"); };
      poner(false);
      b.addEventListener("click", () => { poner(inp.type === "password"); inp.focus(); });
      caja.appendChild(b);
    });
  }
  new MutationObserver(() => ponerOjos(document)).observe(document.body, { childList: true, subtree: true });

  window.CoachApp = { analizarDeBiblioteca, enviarCorreccion: async (a) => enviarVideo((await API.get("entrenadores")).entrenadores, a), actualizarAvisos, navegar, nuevoAnalisis, editarPiloto, leerVideo, get usuario() { return USUARIO; } };
  arrancar();
})();
