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
  const esCoach = () => USUARIO && USUARIO.modo === "coach";

  const ICONO_NAV = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    pilotos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.6c2.3.3 3.9 1.9 4.5 4.4"/></svg>',
    analisis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="M16.5 10l5-3v10l-5-3"/><path d="M6 15l3-4 2 2.5 2-2.5"/></svg>',
    bajadas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 4-7 5 5"/><path d="M3 21h18"/></svg>',
    perfil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/></svg>'
  };

  // ================================================================ Arranque y sesión
  async function arrancar() {
    API.alVencerSesion(() => { USUARIO = null; aviso("Tu sesión venció. Ingresá de nuevo.", "oro"); pantallaIngreso(); });
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
    document.body.classList.remove("sin-sesion");
    construirNav();
    if (saludar) aviso(`Hola, ${usuario.nombre.split(" ")[0]}.`);
    if (!location.hash || location.hash === "#/ingreso") location.hash = "#/inicio"; else navegar();
  }
  async function salir() {
    try { await API.post("logout"); } catch (e) {}
    API.guardarToken(null); USUARIO = null;
    pantallaIngreso();
  }

  function construirNav() {
    const items = esCoach()
      ? [["inicio", "Inicio"], ["pilotos", "Pilotos"], ["analisis", "Análisis"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]]
      : [["inicio", "Inicio"], ["analisis", "Mis análisis"], ["bajadas", "Bajadas"], ["perfil", "Perfil"]];
    $(".nav-items").innerHTML = items.map(([r, t]) => `<a class="nav-item" href="#/${r}" data-ruta="${r}">${ICONO_NAV[r]}<span>${t}</span></a>`).join("");
    $(".nav-pie").innerHTML = `<b>${esc(USUARIO.nombre)}</b><br>${esCoach() ? "Modo entrenador" : "Modo piloto"} · <a href="#/perfil" style="color:var(--cian);text-decoration:none">cambiar</a>`;
  }

  // ================================================================ Pantalla de ingreso
  function pantallaIngreso(error) {
    document.body.classList.add("sin-sesion");
    if (window.Estudio) Estudio.cerrar();
    rutaActual = "ingreso";
    if (location.hash !== "#/ingreso") history.replaceState(null, "", "#/ingreso");
    const v = vista();
    v.innerHTML = "";
    let modoReg = "coach", pestana = "entrar";
    const el = html(`<div class="ingreso">
      <div class="ingreso-lado">
        <svg class="ingreso-zigzag" viewBox="0 0 200 120" aria-hidden="true"><path d="M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100" fill="none" stroke="#4fe3c2" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="85" cy="28" r="8" fill="#fff"/></svg>
        <div class="marca-txt" style="font-size:40px">Send<span class="flow">Flow</span></div>
        <span class="marca-coach" style="font-size:12px">COACH</span>
        <p class="prosa" style="max-width:420px;margin-top:20px">Análisis de video para entrenar pilotos de MTB. El entrenador marca, etiqueta y explica; el piloto lo ve desde su celular. Con los datos del Sender, todo explicado con números.</p>
      </div>
      <div class="ingreso-caja tarjeta">
        <div class="tipo-tag" role="tablist">
          <button class="btn chico sel" data-p="entrar">Ingresar</button>
          <button class="btn chico" data-p="crear">Crear cuenta</button>
        </div>
        <form class="form-grilla" style="grid-template-columns:1fr" novalidate>
          <div class="campo solo-crear oculto"><label>Nombre y apellido</label><input class="input" name="nombre" autocomplete="name" maxlength="120"></div>
          <div class="campo"><label>Email</label><input class="input" name="email" type="email" autocomplete="email" maxlength="190"></div>
          <div class="campo"><label>Contraseña</label><input class="input" name="clave" type="password" autocomplete="current-password" maxlength="200"></div>
          <div class="campo solo-crear oculto"><label>Voy a usar la app como</label>
            <div class="modos">
              <button type="button" class="modo sel" data-modo="coach"><b>Entrenador</b><span>Cargo pilotos, analizo sus videos y les grabo comentarios.</span></button>
              <button type="button" class="modo" data-modo="piloto"><b>Piloto</b><span>Veo los análisis que me hacen y subo mis bajadas del Sender.</span></button>
            </div>
            <small style="color:var(--ink-dim);font-size:11px">Se puede cambiar después en tu perfil.</small></div>
          <div class="error-form oculto"></div>
          <button class="btn primario" type="submit" style="width:100%">Ingresar</button>
        </form>
      </div></div>`);
    v.appendChild(el);
    dibujarTrazos($(".ingreso-zigzag", el), 1500);
    const form = $("form", el), err = $(".error-form", el), boton = $("[type=submit]", el);
    const mostrarError = (t) => { err.textContent = t; err.classList.toggle("oculto", !t); };
    if (error) mostrarError(error);
    $$("[data-p]", el).forEach(b => b.addEventListener("click", () => {
      pestana = b.dataset.p;
      $$("[data-p]", el).forEach(x => x.classList.toggle("sel", x === b));
      $$(".solo-crear", el).forEach(x => x.classList.toggle("oculto", pestana !== "crear"));
      boton.textContent = pestana === "crear" ? "Crear cuenta" : "Ingresar";
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
        const r = pestana === "crear"
          ? await API.post("registro", { nombre: val("nombre"), email: val("email"), clave: $("[name=clave]", form).value, modo: modoReg, cliente: "coach" })
          : await API.post("login", { email: val("email"), clave: $("[name=clave]", form).value, cliente: "coach" });
        API.guardarToken(r.token);
        entrar(r.usuario, true);
      } catch (ex) { mostrarError(ex.message); boton.disabled = false; }
    });
    UI.animar(el, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
    setTimeout(() => $("[name=email]", el).focus(), 100);
  }

  // ================================================================ Router
  let rutaActual = "";
  async function navegar() {
    if (!USUARIO) return;
    const hash = location.hash.replace(/^#\/?/, "") || "inicio";
    const [seccion, id] = hash.split("/");
    if (seccion === "ingreso") { location.hash = "#/inicio"; return; }
    if (window.Estudio && rutaActual.startsWith("analisis/") && hash !== rutaActual) Estudio.cerrar();
    rutaActual = hash;
    $$(".nav-item").forEach(a => a.classList.toggle("sel", a.dataset.ruta === seccion || (seccion === "piloto" && a.dataset.ruta === "pilotos")));
    const v = vista();
    const salida = UI.animar(v, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(6px)" }], { duration: 120, fill: "forwards" });
    if (salida) await salida.finished.catch(() => {});
    v.innerHTML = "";
    window.scrollTo(0, 0);
    try {
      if (seccion === "inicio") await (esCoach() ? inicioCoach(v) : inicioPiloto(v));
      else if (seccion === "pilotos" && esCoach()) await pantallaPilotos(v);
      else if (seccion === "piloto" && id && esCoach()) await pantallaPiloto(v, id);
      else if (seccion === "analisis" && id) await Estudio.abrir(v, id, USUARIO);
      else if (seccion === "analisis") await pantallaAnalisis(v);
      else if (seccion === "bajadas") await pantallaBajadas(v);
      else if (seccion === "perfil") await pantallaPerfil(v);
      else { location.hash = "#/inicio"; return; }
    } catch (e) {
      console.error(e);
      if (USUARIO) v.innerHTML = `<div class="vacio">No se pudo abrir esta pantalla: ${esc(e.message || e)}</div>`;
    }
    if (salida) salida.cancel();
    UI.animar(v, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
    entradaEscalonada(v, 55);
  }
  window.addEventListener("hashchange", navegar);

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
    const el = html(`<article class="tarjeta click t-analisis entra" tabindex="0">
      <div class="mini" style="${a.miniatura ? `background-image:url('${a.miniatura}')` : ""}">
        <div class="play"><span>${ICONOS.play}</span></div>
        ${a.conSender ? `<span class="chip cian sender">DATOS DEL SENDER</span>` : ""}
        <span class="dur">${tiempo(a.duracion || 0, false)}</span>
      </div>
      <div class="cuerpo">
        <div class="tit">${esc(a.titulo || "Sin título")}</div>
        <div class="meta">${esc(quien)}${a.pista ? " · " + esc(a.pista) : ""} · ${fecha(a.fecha || a.creado)}</div>
        <div class="cuenta"><span><b style="color:var(--cian)">${a.nBien || 0}</b> bien</span><span><b style="color:var(--rojo)">${a.nMejorar || 0}</b> a mejorar</span><span><b>${a.nAnotaciones || 0}</b> dibujos</span></div>
      </div></article>`);
    const ir = () => { location.hash = "#/analisis/" + a.id; };
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
    const ir = () => { location.hash = "#/piloto/" + p.id; };
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
        <span class="etiqueta" style="color:var(--oro)">${esCoach() ? "Modo entrenador" : "Modo piloto"} · ${esc(USUARIO.nombre)}</span>
        <h1 style="margin-top:10px">${titulo}</h1>
        <p>${texto}</p>
        <div class="acciones">${acciones || ""}</div>
      </section>`;
  }
  function animarHero(v) {
    $$("[data-n]", v).forEach(el => contar(el, +el.dataset.n));
    dibujarTrazos($(".hero-zigzag", v), 1600);
    const punto = $(".hero-punto", v);
    if (punto && punto.animate && !UI.sinMovimiento()) punto.animate([{ opacity: 0, r: 2 }, { opacity: 1, r: 9 }, { opacity: 1, r: 5 }], { duration: 700, delay: 900, fill: "forwards", easing: "cubic-bezier(.34,1.56,.64,1)" });
    else if (punto) punto.setAttribute("opacity", 1);
  }

  // ================================================================ Inicio (entrenador)
  async function inicioCoach(v) {
    const { pilotos, analisis, porId } = await cargarCoach();
    const nEtiq = analisis.reduce((s, a) => s + (a.nEtiquetas || 0), 0);
    const nSender = analisis.filter(a => a.conSender).length;
    v.appendChild(html(`<div>
      ${hero('Lo que ves en el video, <span class="acento">explicado con datos.</span>',
        "Analizá cada bajada cuadro a cuadro, dibujá sobre el video, etiquetá lo que hay que corregir y grabá tu comentario. Si el piloto bajó con el Sender, sumá velocidad, recorrido de suspensión e impactos sobre la imagen.",
        `<button class="btn primario" data-accion="nuevo-analisis">${ICONOS.video}Nuevo análisis</button><button class="btn" data-accion="nuevo-piloto">${ICONOS.mas}Agregar piloto</button>`)}
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
    if (analisis.length) {
      const cont = $("#inicioRecientes", v);
      cont.appendChild(html(`<div class="titulo-seccion entra">Últimos análisis</div>`));
      const g = html(`<div class="grilla g3"></div>`);
      analisis.slice(0, 6).forEach(a => g.appendChild(tarjetaAnalisis(a, porId[a.pilotoId])));
      cont.appendChild(g);
    }
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
      ${hero('Tus bajadas, <span class="acento">vistas por tu entrenador.</span>',
        "Acá aparecen los análisis que te hacen: el video con sus marcas, lo que hacés bien, lo que tenés que mejorar y sus comentarios grabados. Subí tus bajadas del Sender desde SendFlow para que las vea con datos.",
        `<a class="btn primario" href="#/analisis">${ICONOS.video}Ver mis análisis</a><a class="btn" href="#/bajadas">${ICONOS.subir}Mis bajadas</a>`)}
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
    if (analisis.length) {
      cont.appendChild(html(`<div class="titulo-seccion entra">Últimos análisis</div>`));
      const g = html(`<div class="grilla g3"></div>`);
      analisis.slice(0, 6).forEach(a => g.appendChild(tarjetaAnalisis(a)));
      cont.appendChild(g);
    } else {
      cont.appendChild(html(`<div class="vacio entra" style="margin-top:20px">${entrenadores.length ? "Todavía no te hicieron análisis." : `Todavía no tenés entrenador. Pedile que te cargue como piloto con tu email: <b>${esc(USUARIO.email)}</b>.`}</div>`));
    }
    $$(".nivel-barra i", v).forEach((b, i) => UI.animar(b, [{ width: "0%" }, { width: b.style.width }], { duration: 800, delay: 300 + i * 90, easing: "cubic-bezier(.2,.8,.2,1)" }));
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
      <a class="btn fantasma chico entra" href="#/pilotos" style="margin-bottom:16px">${ICONOS.volver}Volver</a>
      <section class="tarjeta entra"><div class="ficha-cab">${avatar(p, true)}
        <div class="info"><h1>${esc(p.nombre)}</h1>
          <div class="chips" style="margin-top:6px">${p.vinculado ? `<span class="chip cian">Con cuenta · ${esc(p.email)}</span>` : (p.email ? `<span class="chip">Sin cuenta aún · ${esc(p.email)}</span>` : `<span class="chip">Sin email: no ve sus análisis</span>`)}</div>
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
          <button class="btn icono peligro" data-accion="borrar" aria-label="Borrar piloto" title="Borrar piloto">${ICONOS.basura}</button>
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
    $("[data-accion=borrar]", v).addEventListener("click", async () => {
      if (!(await confirmar(`¿Borrar a ${p.nombre} y sus ${lista.length} análisis? No se puede deshacer.`, "Borrar"))) return;
      try { await API.borrar("pilotos/" + id); aviso("Piloto borrado."); location.hash = "#/pilotos"; } catch (e) { aviso(e.message, "error"); }
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
          aviso(nuevo ? "Piloto agregado." : "Cambios guardados.");
          if (r.piloto.email && !r.piloto.vinculado) aviso(`Cuando ${r.piloto.nombre} cree su cuenta con ${r.piloto.email}, va a ver sus análisis.`, "oro");
          if (nuevo && !location.hash.startsWith("#/analisis")) location.hash = "#/piloto/" + r.piloto.id; else if (!location.hash.startsWith("#/analisis")) navegar();
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
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">${esCoach() ? "Análisis" : "Mis análisis"}</h1><div class="sub-pagina">${analisis.length ? analisis.length + " análisis de video" : (esCoach() ? "Todavía no hay análisis." : "Todavía no te hicieron análisis.")}</div></div>
        ${esCoach() ? `<button class="btn primario" data-accion="nuevo">${ICONOS.video}Nuevo análisis</button>` : ""}</div>
      ${analisis.length ? `<div class="form-grilla entra" style="margin-bottom:18px">
        ${esCoach() ? `<div class="campo"><label>Piloto</label><select class="input" id="filtroPiloto"><option value="">Todos</option>${pilotos.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</select></div>` : ""}
        <div class="campo ${esCoach() ? "" : "ancho"}"><label>Buscar</label><input class="input" id="filtroTexto" placeholder="Título o pista"></div></div>` : ""}
      <div class="grilla g3" id="listaAnalisis"></div></div>`));
    if (esCoach()) $("[data-accion=nuevo]", v).addEventListener("click", () => nuevoAnalisis());
    const g = $("#listaAnalisis", v);
    const pintar = () => {
      const fp = $("#filtroPiloto", v) ? $("#filtroPiloto", v).value : "";
      const ft = $("#filtroTexto", v) ? $("#filtroTexto", v).value.trim().toLowerCase() : "";
      g.innerHTML = "";
      const vis = analisis.filter(a => (!fp || a.pilotoId === fp) && (!ft || (a.titulo + " " + (a.pista || "")).toLowerCase().includes(ft)));
      vis.forEach(a => g.appendChild(tarjetaAnalisis(a, porId[a.pilotoId])));
      if (!analisis.length) g.innerHTML = `<div class="vacio" style="grid-column:1/-1">${esCoach() ? "Subí un video para hacer el primer análisis." : "Cuando tu entrenador te haga un análisis, aparece acá."}</div>`;
      else if (!vis.length) g.innerHTML = `<div class="vacio" style="grid-column:1/-1">Ningún análisis coincide con el filtro.</div>`;
      entradaEscalonada(g, 40);
    };
    if ($("#filtroTexto", v)) { $("#filtroTexto", v).addEventListener("input", pintar); if ($("#filtroPiloto", v)) $("#filtroPiloto", v).addEventListener("change", pintar); }
    pintar();
  }

  // ================================================================ Nuevo análisis
  async function nuevoAnalisis(pilotoId) {
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
      <div class="campo ancho"><div class="soltar" tabindex="0">${ICONOS.subir}<div><b style="color:var(--ink)">Elegí el video</b> o arrastralo acá</div><div style="font-size:12px;margin-top:4px">MP4, MOV o WebM. Mejor de menos de un minuto y en 1080p.</div><div class="archivo"></div></div></div>
      <div class="campo"><label>Piloto</label><select class="input" name="piloto">${pilotos.map(p => `<option value="${p.id}" ${p.id === pilotoId ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select></div>
      <div class="campo"><label>Fecha</label><input class="input" type="date" name="fecha" value="${hoy}"></div>
      <div class="campo"><label>Título</label><input class="input" name="titulo" placeholder="Curva del bosque, salto final…" maxlength="160"></div>
      <div class="campo"><label>Pista</label><input class="input" name="pista" maxlength="120"></div>
      <div class="campo ancho progreso-subida oculto"><label>Subiendo el video</label><div class="barra-progreso"><i></i></div><small class="txt-progreso"></small></div>
    </div>`);
    const zona = $(".soltar", cuerpo);
    const tomar = (f) => {
      if (!f) return;
      if (!/^video\//.test(f.type) && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) { aviso("Ese archivo no es un video.", "error"); return; }
      archivo = f; $(".archivo", zona).textContent = f.name + " · " + (f.size / 1048576).toFixed(0) + " MB";
      const t = $("[name=titulo]", cuerpo);
      if (!t.value) t.value = f.name.replace(/\.[^.]+$/, "");
    };
    zona.addEventListener("click", async () => tomar(await UI.elegirArchivo("video/*")));
    zona.addEventListener("keydown", async (e) => { if (e.key === "Enter") tomar(await UI.elegirArchivo("video/*")); });
    zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("encima"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
    zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("encima"); tomar(e.dataTransfer.files[0]); });
    await abrirModal({
      titulo: "Nuevo análisis", cuerpo,
      acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Subir y crear", clase: "primario", alHacer: async (c) => {
        if (!archivo) { aviso("Elegí el video.", "error"); return false; }
        const boton = $(".modal-pie .primario", c.parentElement);
        boton.disabled = true; boton.textContent = "Preparando…";
        const prog = $(".progreso-subida", c), barra = $(".barra-progreso i", c), txt = $(".txt-progreso", c);
        try {
          const info = await leerVideo(archivo);
          prog.classList.remove("oculto");
          boton.textContent = "Subiendo…";
          const t0 = performance.now();
          const videoId = await API.subirArchivo(archivo, "video", archivo.name, (f) => {
            barra.style.width = (f * 100).toFixed(1) + "%";
            const seg = (performance.now() - t0) / 1000, resta = f > 0.02 ? seg / f * (1 - f) : 0;
            txt.textContent = `${(f * 100).toFixed(0)} % · ${(archivo.size * f / 1048576).toFixed(0)} de ${(archivo.size / 1048576).toFixed(0)} MB${resta > 2 ? ` · faltan ~${Math.ceil(resta)} s` : ""}`;
          });
          const r = await API.post("analisis", {
            pilotoId: $("[name=piloto]", c).value, titulo: $("[name=titulo]", c).value.trim() || archivo.name,
            pista: $("[name=pista]", c).value.trim(), fecha: $("[name=fecha]", c).value || hoy, videoId,
            duracion: info.duracion, ancho: info.ancho, alto: info.alto, miniatura: info.miniatura,
            recorte: { ini: 0, fin: info.duracion }, anotaciones: [], etiquetas: [], notas: { fortalezas: "", mejorar: "", observaciones: "" }, sender: null
          });
          location.hash = "#/analisis/" + r.analisis.id;
          return r.analisis;
        } catch (e) {
          aviso(e.message || "No se pudo subir el video.", "error");
          boton.disabled = false; boton.textContent = "Subir y crear";
          return false;
        }
      } }]
    });
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
        <div class="sub-pagina">${esCoach() ? "Las tuyas y las que suben tus pilotos desde SendFlow." : "Las que mandás desde SendFlow o subís acá. Tus entrenadores las pueden usar en tus análisis."}</div></div>
        <button class="btn primario" data-accion="subir">${ICONOS.subir}Subir bajada</button></div>
      <div class="grilla g3" id="listaBajadas"></div></div>`));
    $("[data-accion=subir]", v).addEventListener("click", subirBajada);
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
    const pil = USUARIO.piloto || {};
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Perfil</h1><div class="sub-pagina">${esc(USUARIO.email)}</div></div>
        <button class="btn" data-accion="salir">Cerrar sesión</button></div>
      <div class="titulo-seccion entra">Cómo usás la app</div>
      <div class="modos grande entra">
        <button class="modo ${esCoach() ? "sel" : ""}" data-modo="coach"><b>Entrenador</b><span>Pilotos, análisis de video, etiquetas, comentarios grabados y las bajadas de tus pilotos.</span></button>
        <button class="modo ${!esCoach() ? "sel" : ""}" data-modo="piloto"><b>Piloto</b><span>Tus análisis, lo que hacés bien y lo que tenés que mejorar, tus entrenadores y tus bajadas.</span></button>
      </div>
      <div class="grilla g2" style="margin-top:16px">
        <section class="tarjeta entra"><div class="etiqueta" style="margin-bottom:12px">Tus datos</div>
          <div class="form-grilla">
            <div class="campo ancho"><label>Nombre y apellido</label><input class="input" name="nombre" value="${esc(USUARIO.nombre)}" maxlength="120"></div>
            <div class="campo"><label>Disciplina</label><select class="input" name="disciplina"><option value="">—</option>${DISCIPLINAS.map(d => `<option ${d === pil.disciplina ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
            <div class="campo"><label>Nivel</label><select class="input" name="nivel"><option value="">—</option>${NIVELES.map(d => `<option ${d === pil.nivel ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
            <div class="campo"><label>Categoría</label><input class="input" name="categoria" value="${esc(pil.categoria || "")}" maxlength="40"></div>
            <div class="campo"><label>Peso (kg)</label><input class="input" name="peso" inputmode="decimal" value="${esc(pil.peso || "")}" maxlength="6"></div>
            <div class="campo ancho"><label>Bici</label><input class="input" name="bici" value="${esc(pil.bici || "")}" maxlength="80"></div>
          </div>
          <button class="btn primario" data-accion="guardar" style="margin-top:14px">Guardar</button></section>
        <section class="tarjeta entra"><div class="etiqueta" style="margin-bottom:12px">Contraseña</div>
          <div class="form-grilla" style="grid-template-columns:1fr">
            <div class="campo"><label>Actual</label><input class="input" type="password" name="actual" autocomplete="current-password"></div>
            <div class="campo"><label>Nueva (8 o más)</label><input class="input" type="password" name="nueva" autocomplete="new-password"></div>
          </div>
          <button class="btn" data-accion="clave" style="margin-top:14px">Cambiar contraseña</button>
          <p class="ayuda" style="margin:12px 0 0">Al cambiarla se cierran las otras sesiones (incluida SendFlow, que te va a pedir ingresar de nuevo).</p></section>
      </div>
      <div id="perfEntrenadores"></div>
      <div class="titulo-seccion entra">Perfiles de SendFlow</div>
      <p class="ayuda entra">Los perfiles de piloto y bici (peso, recorridos, presiones) que mandás desde SendFlow: Configuración → SendFlow Coach → <b>Enviar perfiles</b>. Desde ahí también los traés a otro celular.${esCoach() ? " También ves los de tus pilotos con cuenta." : ""}</p>
      <div class="grilla g3" id="listaPerfiles"></div></div>`));
    $("[data-accion=salir]", v).addEventListener("click", salir);
    $$("[data-modo]", v).forEach(b => b.addEventListener("click", async () => {
      if (b.dataset.modo === USUARIO.modo) return;
      try {
        const r = await API.put("yo", { modo: b.dataset.modo });
        USUARIO = r.usuario; construirNav();
        aviso(esCoach() ? "Ahora estás en modo entrenador." : "Ahora estás en modo piloto.");
        navegar();
      } catch (e) { aviso(e.message, "error"); }
    }));
    $("[data-accion=guardar]", v).addEventListener("click", async () => {
      const val = (n) => $(`[name=${n}]`, v).value.trim();
      try {
        const r = await API.put("yo", { nombre: val("nombre"), piloto: { disciplina: val("disciplina"), nivel: val("nivel"), categoria: val("categoria"), peso: val("peso"), bici: val("bici") } });
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

  window.CoachApp = { navegar, nuevoAnalisis, editarPiloto, leerVideo, get usuario() { return USUARIO; } };
  arrancar();
})();
