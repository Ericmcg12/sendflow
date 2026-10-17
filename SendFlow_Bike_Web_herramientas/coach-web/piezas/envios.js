  // ================================================================ Envíos: el piloto manda videos a su entrenador
  const ESTADO_ENVIO = { nuevo: ["Enviado", "oro"], visto: ["Visto", ""], analizado: ["Con devolución", "cian"] };
  function tarjetaEnvio(e, comoCoach) {
    const [txt, cls] = ESTADO_ENVIO[e.estado] || ["", ""];
    const quien = comoCoach ? e.pilotoNombre : ("Para: " + (e.coachNombre || "—"));
    const el = html(`<article class="tarjeta click t-analisis entra" tabindex="0">
      <div class="mini" style="${e.miniatura ? `background-image:url('${e.miniatura}')` : ""}">
        <div class="play"><span>${ICONOS.play}</span></div>
        <span class="chip ${cls} sender">${esc(comoCoach ? ({ nuevo: "NUEVO", visto: "VISTO", analizado: "ANALIZADO" })[e.estado] : txt.toUpperCase())}</span>
        <span class="dur">${tiempo(e.duracion || 0, false)}</span>
      </div>
      <div class="cuerpo">
        <div class="tit">${esc(e.titulo || "Sin título")}</div>
        <div class="meta">${esc(quien)}${e.pista ? " · " + esc(e.pista) : ""} · ${fecha(e.fecha || e.creado)}</div>
        ${e.nota ? `<div class="meta" style="margin-top:6px;font-style:italic">“${esc(e.nota.length > 90 ? e.nota.slice(0, 90) + "…" : e.nota)}”</div>` : ""}
      </div></article>`);
    const ir = () => { location.hash = comoCoach ? "#/recibido/" + e.id : (e.estado === "analizado" && e.analisisId ? "#/analisis/" + e.analisisId : "#/enviar"); };
    el.addEventListener("click", ir);
    el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ir(); });
    return el;
  }

  // Entrenador: bandeja de lo que le mandaron sus pilotos
  async function pantallaRecibidos(v) {
    const { recibidos, sinVer } = await API.get("envios");
    v.appendChild(html(`<div>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">Recibidos</h1>
        <div class="sub-pagina">${recibidos.length ? (sinVer ? sinVer + (sinVer === 1 ? " video nuevo" : " videos nuevos") + " de tus pilotos." : "Todo al día.") : "Los videos que te manden tus pilotos aparecen acá."}</div></div></div>
      <div class="grilla g3" id="listaRecibidos"></div></div>`));
    const g = $("#listaRecibidos", v);
    if (!recibidos.length) g.replaceWith(html(`<div class="vacio entra">Todavía no te mandaron videos.<br>Tus pilotos los envían desde su cuenta, en la sección <b>Enviar</b>. Para que puedan hacerlo tienen que haber aceptado tu invitación (Perfil → Mis alumnos).</div>`));
    else recibidos.forEach(e => g.appendChild(tarjetaEnvio(e, true)));
    actualizarInsignia(sinVer);
  }
  async function pantallaRecibido(v, id) {
    const { envio: e } = await API.get("envios/" + id);
    v.appendChild(html(`<div>
      <a class="btn fantasma chico entra" href="#/recibidos" style="margin-bottom:16px">${ICONOS.volver}Volver</a>
      <div class="cab-pagina entra"><div><h1 class="titulo-pagina">${esc(e.titulo)}</h1>
        <div class="sub-pagina">${esc(e.pilotoNombre)}${e.pista ? " · " + esc(e.pista) : ""} · ${fecha(e.fecha || e.creado)}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" data-accion="analizar">${ICONOS.video}${e.estado === "analizado" ? "Abrir análisis" : "Analizar este video"}</button></div></div>
      ${e.nota ? `<div class="tarjeta entra" style="margin-bottom:16px"><div class="etiqueta" style="margin-bottom:8px">Lo que dice ${esc(e.pilotoNombre)}</div><p class="prosa" style="margin:0">${esc(e.nota)}</p></div>` : ""}
      <div class="tarjeta entra"><video id="vidEnvio" controls playsinline preload="metadata" style="width:100%;max-height:70vh;background:#000;border-radius:10px"></video></div></div>`));
    if (e.videoUrl) $("#vidEnvio", v).src = e.videoUrl; else $("#vidEnvio", v).replaceWith(html(`<div class="vacio">No se pudo cargar el video.</div>`));
    $("[data-accion=analizar]", v).addEventListener("click", async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { const r = await API.post("envios/" + id + "/analisis"); location.hash = "#/analisis/" + r.analisis.id; }
      catch (er) { aviso(er.message, "error"); b.disabled = false; }
    });
    actualizarInsignia();
  }
  async function actualizarInsignia(n) {
    try {
      if (n == null) n = (await API.get("envios")).sinVer;
      const a = $('.nav-item[data-ruta="recibidos"]');
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
        <div class="sub-pagina">${entrenadores.length ? "Mandale un video a tu entrenador y recibí su devolución: dibujos, notas escritas, comentarios grabados." : "Tu entrenador tiene que invitarte primero."}</div></div>
        ${entrenadores.length ? `<button class="btn primario" data-accion="enviar">${ICONOS.subir}Enviar un video</button>` : ""}</div>
      <div class="grilla g3" id="listaEnvios"></div></div>`));
    const g = $("#listaEnvios", v);
    if (!entrenadores.length) g.replaceWith(html(`<div class="vacio entra">Todavía no tenés un entrenador vinculado.<br>Pedile que te invite con tu email (<b>${esc(USUARIO.email)}</b>) y aceptá la invitación al entrar a sendflow.bike.</div>`));
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
    if (be) be.addEventListener("click", () => enviarVideo(entrenadores));
  }
  async function enviarVideo(entrenadores) {
    const hoy = new Date().toISOString().slice(0, 10);
    let archivo = null;
    const cuerpo = html(`<div class="form-grilla">
      <div class="campo ancho"><div class="soltar" tabindex="0">${ICONOS.subir}<div><b style="color:var(--ink)">Elegí el video</b> o arrastralo acá</div><div style="font-size:12px;margin-top:4px">MP4, MOV o WebM. Mejor de menos de un minuto y en 1080p.</div><div class="archivo"></div></div></div>
      ${entrenadores.length > 1 ? `<div class="campo ancho"><label>Para</label><select class="input" name="coach">${entrenadores.map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("")}</select></div>` : ""}
      <div class="campo"><label>Título</label><input class="input" name="titulo" placeholder="Curva del bosque, salto final…" maxlength="160"></div>
      <div class="campo"><label>Fecha</label><input class="input" type="date" name="fecha" value="${hoy}"></div>
      <div class="campo ancho"><label>Pista</label><input class="input" name="pista" maxlength="120"></div>
      <div class="campo ancho"><label>Qué querés que mire</label><textarea class="input" name="nota" maxlength="2000" placeholder="No me sale la curva, frené tarde…"></textarea></div>
      <div class="campo ancho progreso-subida oculto"><label>Subiendo el video</label><div class="barra-progreso"><i></i></div><small class="txt-progreso"></small></div>
    </div>`);
    const zona = $(".soltar", cuerpo);
    const tomar = (f) => {
      if (!f) return;
      if (!/^video\//.test(f.type) && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) { aviso("Ese archivo no es un video.", "error"); return; }
      archivo = f; $(".archivo", zona).textContent = f.name + " · " + (f.size / 1048576).toFixed(0) + " MB";
      const t = $("[name=titulo]", cuerpo); if (!t.value) t.value = f.name.replace(/\.[^.]+$/, "");
    };
    zona.addEventListener("click", async () => tomar(await UI.elegirArchivo("video/*")));
    zona.addEventListener("keydown", async (e) => { if (e.key === "Enter") tomar(await UI.elegirArchivo("video/*")); });
    zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("encima"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
    zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("encima"); tomar(e.dataTransfer.files[0]); });
    await abrirModal({
      titulo: "Enviar un video", cuerpo,
      acciones: [{ texto: "Volver", clase: "fantasma", valor: null }, { texto: "Subir y enviar", clase: "primario", alHacer: async (c) => {
        if (!archivo) { aviso("Elegí el video.", "error"); return false; }
        const boton = $(".modal-pie .primario", c.parentElement);
        boton.disabled = true; boton.textContent = "Preparando…";
        const prog = $(".progreso-subida", c), barra = $(".barra-progreso i", c), txt = $(".txt-progreso", c);
        try {
          const info = await leerVideo(archivo);
          prog.classList.remove("oculto"); boton.textContent = "Subiendo…";
          const t0 = performance.now();
          const archivoId = await API.subirArchivo(archivo, "envio", archivo.name, (f) => {
            barra.style.width = (f * 100).toFixed(1) + "%";
            const seg = (performance.now() - t0) / 1000, resta = f > 0.02 ? seg / f * (1 - f) : 0;
            txt.textContent = `${(f * 100).toFixed(0)} % · ${(archivo.size * f / 1048576).toFixed(0)} de ${(archivo.size / 1048576).toFixed(0)} MB${resta > 2 ? ` · faltan ~${Math.ceil(resta)} s` : ""}`;
          });
          const sel = $("[name=coach]", c);
          await API.post("envios", { coachId: sel ? sel.value : entrenadores[0].id, archivoId,
            titulo: $("[name=titulo]", c).value.trim() || archivo.name, pista: $("[name=pista]", c).value.trim(), fecha: $("[name=fecha]", c).value || hoy,
            nota: $("[name=nota]", c).value.trim(), duracion: info.duracion, ancho: info.ancho, alto: info.alto, miniatura: info.miniatura });
          aviso("Video enviado a tu entrenador.");
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

