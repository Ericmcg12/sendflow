// comparar.js — SendFlow Coach (11/10/2026). Dos videos sincronizados: lado a lado o superpuestos.
// Uso: /comparar?a=<análisis>&b=<análisis>. Sin "b", muestra la lista para elegir con qué comparar.
// Sincronización: se pausa cada video en el mismo momento (moviendo su barra) y "Sincronizar acá" guarda el
// desfase (B − A). Desde ahí los controles comunes mueven los dos. El desfase se recuerda en este navegador.
(function () {
  "use strict";
  const { $, $$, html, esc, tiempo, aviso, ICONOS } = UI;
  const TV = () => window.TIPOS_VIDEO || {};
  let S = null;

  function cerrar() {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    document.removeEventListener("keydown", S.teclas);
    [S.va, S.vb].forEach(v => { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {} });
    S = null;
  }

  const chips = (x) => `${x.tipo && TV()[x.tipo] ? `<span class="chip tipo-${x.tipo}">${TV()[x.tipo].t.toUpperCase()}</span>` : ""}${x.ronda > 1 ? `<span class="chip">RONDA ${x.ronda}</span>` : ""}`;
  const quien = (x) => x.pilotoNombre || x.coachNombre || "";

  async function abrir(v, q) {
    cerrar();
    const ida = q.get("a"), idb = q.get("b");
    if (!ida) { v.appendChild(html(`<div class="vacio">Abrí un análisis y tocá «Comparar».</div>`)); return; }
    if (!idb) return elegir(v, ida);
    const [ra, rb] = await Promise.all([API.get("analisis/" + ida), API.get("analisis/" + idb)]);
    const A = ra.analisis, B = rb.analisis;
    const raiz = html(`<div class="comparar">
      <div class="cab-pagina entra" style="margin-bottom:12px">
        <div style="display:flex;gap:12px;align-items:center;min-width:0">
          <a class="btn icono fantasma" href="/analisis/${esc(A.id)}" aria-label="Volver al análisis" title="Volver">${ICONOS.volver}</a>
          <div style="min-width:0"><h1 class="titulo-pagina" style="font-size:22px">Comparar</h1><div class="sub-pagina">${esc(quien(A))}${quien(B) && quien(B) !== quien(A) ? " · " + esc(quien(B)) : ""}</div></div>
        </div>
        <div class="cmp-modo" role="group" aria-label="Cómo ver los dos videos"><button type="button" data-m="lado" class="sel">Lado a lado</button><button type="button" data-m="encima">Superpuesto</button></div>
      </div>
      <div class="cmp-escena entra">
        ${["a", "b"].map(k => { const x = k === "a" ? A : B; return `<div class="cmp-panel" data-p="${k}">
          <div class="cmp-tit"><b class="cmp-letra">${k.toUpperCase()}</b><span class="cmp-nombre">${esc(x.titulo || "Sin título")}</span>${chips(x)}
            ${k === "b" ? `<a class="btn chico fantasma cmp-cambiar" href="/comparar?a=${esc(A.id)}">Cambiar</a>` : ""}</div>
          <div class="cmp-video"><video playsinline preload="auto" ${k === "b" ? "muted" : ""}></video><div class="cmp-cargando">Cargando video…</div></div>
          <div class="cmp-barra-fila"><input type="range" class="cmp-barra" min="0" step="0.01" value="0" aria-label="Posición del video ${k.toUpperCase()}"><span class="cmp-t">0:00.00</span></div>
        </div>`; }).join("")}
      </div>
      <div class="cmp-opacidad oculto"><label>Transparencia de B <input type="range" min="10" max="90" value="50" class="cmp-op"></label></div>
      <div class="cmp-controles entra">
        <button class="btn icono" data-c="atras" title="Cuadro anterior (←)" aria-label="Cuadro anterior">${ICONOS.cuadroAtras}</button>
        <button class="btn icono primario" data-c="play" title="Reproducir los dos (espacio)" aria-label="Reproducir">${ICONOS.play}</button>
        <button class="btn icono" data-c="adelante" title="Cuadro siguiente (→)" aria-label="Cuadro siguiente">${ICONOS.cuadroAdelante}</button>
        <div class="velocidades" role="group" aria-label="Velocidad">${[0.25, 0.5, 1].map(x => `<button data-vel="${x}" class="${x === 1 ? "sel" : ""}">${x}×</button>`).join("")}</div>
        <button class="btn" data-c="sync">Sincronizar acá</button>
        <span class="cmp-estado"></span>
      </div>
      <p class="ayuda cmp-ayuda">Para sincronizar: llevá cada video al mismo momento (por ejemplo, la rueda tocando el borde del salto) con su barra y tocá <b>Sincronizar acá</b>. Desde ahí se mueven juntos.</p>
    </div>`);
    v.appendChild(raiz);
    const va = $('[data-p=a] video', raiz), vb = $('[data-p=b] video', raiz);
    const clave = "sf-cmp-" + A.id + "-" + B.id;
    let off = null; try { const g = localStorage.getItem(clave); if (g !== null && g !== "") off = parseFloat(g); } catch (e) {}
    S = { va, vb, off: Number.isFinite(off) ? off : null, raf: 0, A, B, raiz, clave };
    [[va, A], [vb, B]].forEach(([vid, x]) => { const u = API.urlArchivo(x.videoUrl); vid.crossOrigin = "anonymous"; vid.addEventListener("error", () => { if (vid.crossOrigin) { vid.removeAttribute("crossorigin"); vid.src = u; } }); vid.src = u; });
    [[va, A, "a"], [vb, B, "b"]].forEach(([vid, x, k]) => {
      vid.addEventListener("loadedmetadata", () => {
        const c = $(`[data-p=${k}] .cmp-cargando`, raiz); if (c) c.remove();
        $(`[data-p=${k}] .cmp-barra`, raiz).max = vid.duration || x.duracion || 0;
        const ini = (x.recorte && x.recorte.ini) || 0;
        if (k === "a") vid.currentTime = ini;
        else vid.currentTime = S && S.off != null ? Math.max(0, (va.currentTime || ini) + S.off) : ini;
      }, { once: true });
      vid.addEventListener("error", () => { const c = $(`[data-p=${k}] .cmp-cargando`, raiz); if (c) c.textContent = "No se pudo cargar este video."; });
    });
    pintarEstado();

    // barras: A arrastra a B si están sincronizados; mover B solo los desincroniza
    $('[data-p=a] .cmp-barra', raiz).addEventListener("input", (e) => { pausar(); va.currentTime = +e.target.value; seguir(); });
    $('[data-p=b] .cmp-barra', raiz).addEventListener("input", (e) => { pausar(); vb.currentTime = +e.target.value; if (S.off != null) { S.off = null; pintarEstado("Moviste B: tocá «Sincronizar acá» cuando estén en el mismo momento."); } });
    $("[data-c=play]", raiz).addEventListener("click", alternar);
    $("[data-c=atras]", raiz).addEventListener("click", () => paso(-1));
    $("[data-c=adelante]", raiz).addEventListener("click", () => paso(1));
    $("[data-c=sync]", raiz).addEventListener("click", () => {
      pausar(); S.off = Math.round((vb.currentTime - va.currentTime) * 100) / 100;
      try { localStorage.setItem(clave, String(S.off)); } catch (e) {}
      pintarEstado(); aviso("Listo: los dos videos quedaron sincronizados.");
    });
    $$(".velocidades button", raiz).forEach(b => b.addEventListener("click", () => {
      va.playbackRate = vb.playbackRate = +b.dataset.vel;
      $$(".velocidades button", raiz).forEach(x => x.classList.toggle("sel", x === b));
    }));
    $$(".cmp-modo button", raiz).forEach(b => b.addEventListener("click", () => modo(b.dataset.m)));
    $(".cmp-op", raiz).addEventListener("input", (e) => { vb.style.opacity = (+e.target.value / 100).toFixed(2); });
    S.teclas = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "") && e.target.type !== "range") return;
      if (e.key === " ") { e.preventDefault(); alternar(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); paso(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); paso(1); }
    };
    document.addEventListener("keydown", S.teclas);
    S.raf = requestAnimationFrame(bucle);
  }

  function modo(m) {
    const raiz = S.raiz, vb = S.vb;
    $$(".cmp-modo button", raiz).forEach(x => x.classList.toggle("sel", x.dataset.m === m));
    const escena = $(".cmp-escena", raiz), contA = $('[data-p=a] .cmp-video', raiz), contB = $('[data-p=b] .cmp-video', raiz);
    if (m === "encima") { contA.appendChild(vb); vb.classList.add("cmp-encima"); vb.style.opacity = ($(".cmp-op", raiz).value / 100).toFixed(2); }
    else { contB.appendChild(vb); vb.classList.remove("cmp-encima"); vb.style.opacity = ""; }
    escena.classList.toggle("encima", m === "encima");
    $(".cmp-opacidad", raiz).classList.toggle("oculto", m !== "encima");
  }
  function pintarEstado(txt) {
    const el = $(".cmp-estado", S.raiz);
    if (txt) { el.textContent = txt; el.className = "cmp-estado oro"; return; }
    if (S.off == null) { el.textContent = "Sin sincronizar"; el.className = "cmp-estado"; return; }
    el.textContent = "Sincronizados · B " + (S.off >= 0 ? "+" : "−") + Math.abs(S.off).toFixed(2) + " s";
    el.className = "cmp-estado cian";
  }
  function pausar() { S.va.pause(); S.vb.pause(); pintarPlay(); }
  function seguir() { if (S.off != null) S.vb.currentTime = Math.max(0, Math.min((S.vb.duration || 1e9) - 0.05, S.va.currentTime + S.off)); }
  function alternar() {
    if (!S) return;
    const { va, vb } = S;
    if (va.paused) { seguir(); va.play().catch(() => {}); vb.play().catch(() => {}); }
    else pausar();
    pintarPlay();
  }
  function pintarPlay() { const b = $("[data-c=play]", S.raiz); if (b) b.innerHTML = S.va.paused ? ICONOS.play : ICONOS.pausa; }
  function paso(dir) {
    if (!S) return;
    pausar();
    const dt = dir / 30;
    S.va.currentTime = Math.max(0, S.va.currentTime + dt);
    if (S.off != null) seguir(); else S.vb.currentTime = Math.max(0, S.vb.currentTime + dt);
  }
  function bucle() {
    if (!S) return;
    const { va, vb, raiz } = S;
    if (S.off != null && !va.paused) {
      const meta = va.currentTime + S.off;
      if (meta < 0 || meta > (vb.duration || 1e9)) { if (!vb.paused) vb.pause(); }
      else { if (vb.paused) vb.play().catch(() => {}); if (Math.abs(meta - vb.currentTime) > 0.12) vb.currentTime = meta; }
    }
    if (va.ended && vb.paused) pintarPlay();
    [["a", va], ["b", vb]].forEach(([k, vid]) => {
      const barra = $(`[data-p=${k}] .cmp-barra`, raiz), t = $(`[data-p=${k}] .cmp-t`, raiz);
      if (barra && document.activeElement !== barra) barra.value = vid.currentTime || 0;
      if (t) t.textContent = tiempo(vid.currentTime || 0);
    });
    S.raf = requestAnimationFrame(bucle);
  }

  // Elegir el video B
  async function elegir(v, ida) {
    const [ra, rl] = await Promise.all([API.get("analisis/" + ida), API.get("analisis")]);
    const A = ra.analisis;
    const lista = (rl.analisis || []).filter(x => x.id !== ida)
      .sort((x, y) => (y.pilotoId === A.pilotoId) - (x.pilotoId === A.pilotoId) || String(y.fecha || y.creado).localeCompare(String(x.fecha || x.creado)));
    const raiz = html(`<div>
      <div class="cab-pagina entra"><div style="display:flex;gap:12px;align-items:center">
        <a class="btn icono fantasma" href="/analisis/${esc(A.id)}" aria-label="Volver" title="Volver">${ICONOS.volver}</a>
        <div><h1 class="titulo-pagina" style="font-size:22px">Comparar «${esc(A.titulo || "Sin título")}» con…</h1>
        <div class="sub-pagina">Elegí el otro video. Arriba, los del mismo piloto.</div></div></div></div>
      <div class="cmp-elegir entra"></div></div>`);
    v.appendChild(raiz);
    const g = $(".cmp-elegir", raiz);
    if (!lista.length) { g.appendChild(html(`<div class="vacio">No hay otro análisis para comparar todavía.</div>`)); return; }
    lista.forEach(x => {
      const b = html(`<a class="cmp-opcion" href="/comparar?a=${esc(A.id)}&b=${esc(x.id)}">
        <span class="mini" style="${x.miniatura ? `background-image:url('${x.miniatura}')` : ""}"></span>
        <span class="txt"><b>${esc(x.titulo || "Sin título")}</b><small>${esc(quien(x))}${x.pista ? " · " + esc(x.pista) : ""} · ${UI.fecha(x.fecha || x.creado)}</small><span class="chips-conv">${chips(x)}</span></span></a>`);
      g.appendChild(b);
    });
  }

  window.Comparar = { abrir, cerrar };
})();
