# v47 (16/10/2026): INICIO. (1) La bienvenida grande ("Lo que ves en el video…" / "Tus bajadas…") sale del Inicio y pasa a
# ser una pantalla de entrada (piezas/entrada.js) que aparece una vez por sesión del navegador, con el zigzag que se dibuja;
# se saltea con un toque y respeta "reducir movimiento". Sus accesos que no están en el menú quedan en una fila arriba del
# Inicio (entrenador: Agregar piloto, Subir video propio; piloto: Enviar video o bajada, Mis bajadas).
# (2) Orden fijo: tarjeta del plan (actividad de los pilotos / lo de hoy del piloto) → Mensajes → resto. (3) Sin
# "Últimos análisis". (4) Actividad de los pilotos: todas las de los últimos 14 días con 4 visibles y scroll dentro de la
# tarjeta; pulgar arriba para validar cada sesión hecha (coach_v20.sql); el piloto lo ve en Mi plan. Sin coach_v20.sql el
# pulgar avisa que falta correrlo y todo lo demás funciona igual.
shutil.copy("piezas/entrada.js", f"{OUT}/js/entrada.js")
parchar(f"{OUT}/index.html", [
 ('<script src="js/app.js"></script>', '<script src="js/entrada.js"></script>\n<script src="js/app.js"></script>'),
])
parchar(f"{OUT}/js/app.js", [
 # ---- pantalla de entrada: al entrar (con login o con la sesión guardada); se olvida al salir o al volver al ingreso
 ('''    construirNav();
    if (saludar) aviso(''', '''    construirNav();
    if (window.CoachEntrada) CoachEntrada.mostrar(usuario, usuario.modo === "coach");   // v47
    if (saludar) aviso('''),
 ('''  function pantallaIngreso(error) {
    document.body.classList.add("sin-sesion");''', '''  function pantallaIngreso(error) {
    document.body.classList.add("sin-sesion");
    if (window.CoachEntrada) CoachEntrada.olvidar();   // v47: el próximo ingreso vuelve a mostrar la entrada'''),
 ('''      SFPuente.borrarSesion(); API.guardarToken(null); USUARIO = null;''',
  '''      SFPuente.borrarSesion(); API.guardarToken(null); USUARIO = null; if (window.CoachEntrada) CoachEntrada.olvidar();'''),
 # ---- actividad de los pilotos: primera tarjeta del Inicio del entrenador
 ('''    if (esCoach() && window.Planes) Planes.actividad().then(c => { const h = $(".hero", v); if (c && h && h.isConnected) { const w = html(`<div class="actividad-envoltorio"></div>`); w.appendChild(c); h.before(w); entradaEscalonada(w, 0); } }).catch(() => {}); }''',
  '''    if (esCoach() && window.Planes) Planes.actividad().then(c => { const s = $("[data-slot=plan]", v); if (c && s && s.isConnected) { s.appendChild(c); entradaEscalonada(s, 0); } }).catch(() => {}); }'''),
 # ---- mensajes: siempre segunda (después del plan)
 ('''  async function montarMensajes(v) {
    if (!$(".hero", v)) return;''', '''  async function montarMensajes(v) {
    if (!$("[data-slot=mensajes]", v)) return;'''),
 ('''    const h = $(".hero", v); if (!h) return;   // se cambió de pantalla mientras cargaba''',
  '''    const h = $("[data-slot=mensajes]", v); if (!h || !h.isConnected) return;   // se cambió de pantalla mientras cargaba'''),
 ('''    if (sin) h.before(cont); else h.after(cont);
    entradaEscalonada(cont, 0);''', '''    h.innerHTML = ""; h.appendChild(cont);
    entradaEscalonada(cont, 0);'''),
 # ---- Inicio del entrenador: sin bienvenida grande ni "Últimos análisis"
 ('''      ${hero('Lo que ves en el video, <span class="acento">explicado con datos.</span>',
        "Analizá cada bajada cuadro a cuadro, dibujá sobre el video, etiquetá lo que hay que corregir y grabá tu comentario. Si el piloto bajó con el Sender, sumá velocidad, recorrido de suspensión e impactos sobre la imagen.",
        `<a class="btn primario" href="/archivos">${ICONOS.subir}Recibidos</a><button class="btn" data-accion="nuevo-piloto">${ICONOS.mas}Agregar piloto</button><button class="btn fantasma" data-accion="nuevo-analisis" title="Para un piloto sin cuenta">${ICONOS.video}Subir video propio</button>`)}''',
  '''      ${cabInicio(`<button class="btn" data-accion="nuevo-piloto">${ICONOS.mas}Agregar piloto</button><button class="btn" data-accion="nuevo-analisis" title="Para un piloto sin cuenta">${ICONOS.video}Subir video propio</button>`)}'''),
 ('''    if (analisis.length) {
      const cont = $("#inicioRecientes", v);
      cont.appendChild(html(`<div class="titulo-seccion entra">Últimos análisis</div>`));
      const g = html(`<div class="grilla g3"></div>`);
      analisis.slice(0, 6).forEach(a => g.appendChild(tarjetaAnalisis(a, porId[a.pilotoId])));
      cont.appendChild(g);
    }
''', ''),
 # ---- Inicio del piloto
 ('''      ${hero('Tus bajadas, <span class="acento">vistas por tu entrenador.</span>',
        "Acá aparecen los análisis que te hacen: el video con sus marcas, lo que hacés bien, lo que tenés que mejorar y sus comentarios grabados. Subí tus bajadas del Sender desde SendFlow para que las vea con datos.",
        `<a class="btn primario" href="/enviar">${ICONOS.subir}Enviar video o bajada</a><a class="btn" href="/analisis">${ICONOS.video}Ver devoluciones</a><a class="btn fantasma" href="/bajadas">Mis bajadas</a>`)}''',
  '''      ${cabInicio(`<a class="btn primario" href="/enviar">${ICONOS.subir}Enviar video o bajada</a><a class="btn" href="/bajadas">Mis bajadas</a>`)}'''),
 ('''    if (analisis.length) {
      cont.appendChild(html(`<div class="titulo-seccion entra">Últimos análisis</div>`));
      const g = html(`<div class="grilla g3"></div>`);
      analisis.slice(0, 6).forEach(a => g.appendChild(tarjetaAnalisis(a)));
      cont.appendChild(g);
    } else {''', '''    if (!analisis.length) {'''),
 ('''      const h0 = $(".hero", v); if (h0) h0.before(arriba); else v.prepend(arriba);''',
  '''      const h0 = $("[data-slot=plan]", v); if (h0) h0.appendChild(arriba); else v.prepend(arriba);'''),
 # ---- cabecera chica del Inicio (saludo + accesos) y lugares fijos para plan y mensajes
 ('''  function animarHero(v) {
    $$("[data-n]", v).forEach(el => contar(el, +el.dataset.n));
    dibujarTrazos($(".hero-zigzag", v), 1600);''', '''  function cabInicio(acciones) {
    return `<div class="cab-pagina inicio-cab entra"><div><h1 class="titulo-pagina">Hola, ${esc(String(USUARIO.nombre || "").split(" ")[0])}</h1><div class="sub-pagina">${esCoach() ? "Entrenador" : "Piloto"}</div></div>
        <div class="acciones-inicio">${acciones}</div></div>
      <div class="inicio-orden"><div data-slot="plan"></div><div data-slot="mensajes"></div></div>`;
  }
  function animarHero(v) {
    $$("[data-n]", v).forEach(el => contar(el, +el.dataset.n));
    const hz = $(".hero-zigzag", v); if (hz) dibujarTrazos(hz, 1600);'''),
 # ---- la oferta de avisos va después de plan y mensajes
 ('''      const cab = $(".cab-pagina", v); if (cab) cab.after(c); else v.prepend(c);''',
  '''      const ord = $(".inicio-orden", v), cab = $(".cab-pagina", v); if (ord) ord.appendChild(c); else if (cab) cab.after(c); else v.prepend(c);'''),
])
parchar(f"{OUT}/js/planes.js", [
 ('''  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];''',
  '''  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const PULGAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/></svg>`;   // v47'''),
 # ---- el piloto (y el entrenador en la semana) ven la validación
 ('''${t.estado === "hecha" ? `<span class="ok">✓${t.esfuerzo ? " " + t.esfuerzo : ""}</span>` : t.estado === "omitida"''',
  '''${t.estado === "hecha" ? `<span class="ok">✓${t.esfuerzo ? " " + t.esfuerzo : ""}</span>${t.validada ? `<span class="ses-val" title="Tu entrenador la validó" aria-label="Validada por el entrenador">${PULGAR}</span>` : ""}` : t.estado === "omitida"'''),
 ('''<span class="est">${t.estado === "hecha" ? "✓ Hecha" : t.estado === "omitida" ? "No la hice" : "Pendiente"}</span>''',
  '''<span class="est">${t.estado === "hecha" ? "✓ Hecha" : t.estado === "omitida" ? "No la hice" : "Pendiente"}${t.validada ? ` <span class="ses-val" title="Tu entrenador la validó">${PULGAR}</span>` : ""}</span>'''),
 ('''${t.intensidad ? `<span>intensidad ${t.intensidad}/10</span>` : ""}</div>
      ${t.descripcion ?''', '''${t.intensidad ? `<span>intensidad ${t.intensidad}/10</span>` : ""}</div>
      ${t.validada && t.estado === "hecha" ? `<div class="ses-validada-txt">${PULGAR}${esCoach() ? "Validaste esta sesión." : "Tu entrenador vio esta sesión y la validó."}</div>` : ""}
      ${t.descripcion ?'''),
 # ---- actividad de los pilotos: todas con scroll (4 visibles) y pulgar para validar
 ('''    const hechas = lista.filter(t => t.estado === "hecha").length, omit = lista.length - hechas;''',
  '''    const hechas = lista.filter(t => t.estado === "hecha").length, omit = lista.length - hechas;
    const nuevas = () => lista.filter(t => t.estado === "hecha" && !t.validada).length;
    const titulo = () => { const n = nuevas(); return (n ? `${n} ${n > 1 ? "sesiones hechas" : "sesión hecha"} para revisar` : hechas ? "Sesiones hechas revisadas" : "Sin sesiones hechas") + (omit ? ` · ${omit} no ${omit > 1 ? "las hicieron" : "la hizo"}` : ""); };'''),
 ('''      const col = colorPiloto(fs, t.pilotoUsuarioId), ok = t.estado === "hecha";
      const el = html(`<button type="button" class="act-fila ${ok ? "hecha" : "omitida"}" style="--cp:${esc(col)}">
        <span class="act-quien">${sello(t.pilotoNombre, col)}<small>${esc(hace(t.hechaEn))}</small></span>
        <span class="act-que"><b>${esc(t.titulo)}</b>${chipTipo(t.tipo)}<span class="act-est">${ok ? "✓ Hecha" + (t.esfuerzo ? ` · esfuerzo ${t.esfuerzo}/10` : "") : "✗ No la hizo"}</span></span>
        ${t.notaPiloto ? `<span class="act-nota">“${esc(t.notaPiloto.length > 140 ? t.notaPiloto.slice(0, 140) + "…" : t.notaPiloto)}”</span>` : ""}</button>`);
      el.addEventListener("click", () => window.irA("/plan/" + t.planId + "?semana=" + t.fecha));
      return el;''', '''      const col = colorPiloto(fs, t.pilotoUsuarioId), ok = t.estado === "hecha";
      const el = html(`<div class="act-fila ${ok ? "hecha" : "omitida"} ${ok && t.validada ? "validada" : ""}" style="--cp:${esc(col)}">
        <button type="button" class="act-ir" title="Ver en el plan">
        <span class="act-quien">${sello(t.pilotoNombre, col)}<small>${esc(hace(t.hechaEn))}</small></span>
        <span class="act-que"><b>${esc(t.titulo)}</b>${chipTipo(t.tipo)}<span class="act-est">${ok ? "✓ Hecha" + (t.esfuerzo ? ` · esfuerzo ${t.esfuerzo}/10` : "") : "✗ No la hizo"}</span></span>
        ${t.notaPiloto ? `<span class="act-nota">“${esc(t.notaPiloto.length > 140 ? t.notaPiloto.slice(0, 140) + "…" : t.notaPiloto)}”</span>` : ""}</button>
        ${ok ? `<button type="button" class="act-pulgar ${t.validada ? "sel" : ""}" aria-pressed="${t.validada ? "true" : "false"}">${PULGAR}</button>` : ""}</div>`);
      $(".act-ir", el).addEventListener("click", () => window.irA("/plan/" + t.planId + "?semana=" + t.fecha));
      const pul = $(".act-pulgar", el);
      const pintarPulgar = () => {
        const txt = t.validada ? "Validada: tocá para sacar la validación" : "Marcar como vista y validada";
        pul.classList.toggle("sel", !!t.validada); pul.setAttribute("aria-pressed", t.validada ? "true" : "false");
        pul.title = txt; pul.setAttribute("aria-label", txt + ": " + t.titulo);
        el.classList.toggle("validada", !!t.validada);
      };
      if (pul) {
        pintarPulgar();
        pul.addEventListener("click", async () => {
          pul.disabled = true;
          try {
            const r = await rpc("coach_sesion_validar", { p_id: t.id, p_valida: !t.validada });
            t.validada = !!(r && r.tarea && r.tarea.validada); pintarPulgar();
            const h2 = el.closest(".actividad-pilotos"); if (h2) $(".act-cab h2", h2).textContent = titulo();
          } catch (e) { aviso(/coach_v13|does not exist|Could not find/i.test(e.message) ? "Falta correr coach_v20.sql en Supabase (validar sesiones)." : e.message, "error"); }
          pul.disabled = false;
        });
      }
      return el;'''),
 ('''<h2>${hechas ? `${hechas} sesión${hechas > 1 ? "es" : ""} hecha${hechas > 1 ? "s" : ""}` : "Sin sesiones hechas"}${omit ? ` · ${omit} no ${omit > 1 ? "las hicieron" : "la hizo"}` : ""}</h2>''',
  '''<h2>${esc(titulo())}</h2>'''),
 ('''    lista.slice(0, 6).forEach(t => l.appendChild(fila(t)));
    if (lista.length > 6) {
      const mas = html(`<button type="button" class="btn chico fantasma act-mas">Ver las ${lista.length - 6} anteriores</button>`);
      mas.addEventListener("click", () => { lista.slice(6).forEach(t => l.appendChild(fila(t))); mas.remove(); });
      c.appendChild(mas);
    }
    return c;''', '''    lista.forEach(t => l.appendChild(fila(t)));
    // 4 visibles y el resto con scroll dentro de la tarjeta (la altura se mide porque las filas con nota son más altas)
    const medir = () => {
      const fs_ = l.children; if (fs_.length <= 4) { l.style.maxHeight = "none"; return; }
      const a = fs_[0].getBoundingClientRect(), b = fs_[3].getBoundingClientRect();
      if (b.bottom > a.top) l.style.maxHeight = Math.ceil(b.bottom - a.top + 2) + "px";
    };
    if (window.ResizeObserver) new ResizeObserver(medir).observe(l);
    return c;'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v47.css", encoding="utf-8").read())
