
# v41 (15/10/2026): en lo que se baja o se graba con video (exportar video, snapshot y comentario grabado) los valores del
# Sender van en una franja DEBAJO del video, no encima. En la bajada sin video quedan como estaban.
parchar(f"{OUT}/js/estudio.js", [
 # ---- ayudantes: alto de la franja y dibujo
 ('''  function dibujarHudEn(ctx, W, H, t) {''', '''  // v41: franja de valores debajo del video (solo con video y con datos del Sender)
  const fsFranja = (W, H) => Math.max(12, Math.round(Math.min(H, W * 0.5625) * 0.034));
  function franjaHud(W, H) {
    if (!E.a.sender || E.soloDatos) return 0;
    const fs = fsFranja(W, H);
    return Math.round(fs * 3.2 / 2) * 2;
  }
  function partesHudExport(t) {
    const s = E.a.sender, td = t + s.desfase, out = [];
    const f = (k, dec) => { const v = SenderDatos.valorEn(s, k, td); return Number.isFinite(v) ? v.toFixed(dec) : "—"; };
    if (s.canales.v) out.push(["KM/H", f("v", 0), "#4a9eff"]);
    if (s.canales.h) out.push(["HORQUILLA %", f("h", 0), "#4fe3c2"]);
    if (s.canales.s) out.push(["SHOCK %", f("s", 0), "#ffbd00"]);
    if (s.canales.i) out.push(["IMPACTO G", f("i", 1), "#e0483f"]);
    else if (s.canales.a) out.push(["ACEL. G", f("a", 1), "#e0483f"]);
    if (s.lento && window.DatosPista) {
      const L = (k) => DatosPista.valor(s, k, td);
      if (s.canales.f) { const fv = L("f"); out.push(["FRENADA G", Number.isFinite(fv) ? fv.toFixed(2) : "—", fv >= 0.25 ? "#ff3b30" : "#ff8a4a"]); }
      if (s.canales.r) { const rv = L("r"); out.push([s.canales.rMedida ? "INCLINACIÓN" : "INCLIN. EST.", Number.isFinite(rv) ? Math.abs(rv).toFixed(0) + "°" + (Math.abs(rv) >= 3 ? (rv > 0 ? " D" : " I") : "") : "—", "#f28fd8"]); }
      if (s.canales.fc) { const cv = L("fc"); out.push(["PULSO", Number.isFinite(cv) ? cv.toFixed(0) : "—", "#ffffff"]); }
    }
    return out;
  }
  function dibujarHudFranja(ctx, W, y0, FR, t) {
    const items = partesHudExport(t), n = items.length;
    ctx.fillStyle = "#0b1214"; ctx.fillRect(0, y0, W, FR);
    ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(0, y0, W, 1);
    if (!n) return;
    const fs = fsFranja(W, y0), gap = fs * 0.35, bh = fs * 2.3;
    const bw = Math.min(fs * 5.4, (W - fs - gap * (n - 1)) / n);
    let x = (W - (bw * n + gap * (n - 1))) / 2;
    const y = y0 + (FR - bh) / 2;
    for (const [k, v, col] of items) {
      ctx.fillStyle = "#18262a"; redondeado(ctx, x, y, bw, bh, 6); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, bw, bh); ctx.clip();
      ctx.textAlign = "center";
      ctx.font = `600 ${Math.round(fs * 0.46)}px Roboto Mono, monospace`; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillText(k, x + bw / 2, y + fs * 0.75);
      ctx.font = `500 ${fs}px Roboto Mono, monospace`; ctx.fillStyle = col; ctx.fillText(v, x + bw / 2, y + fs * 1.85);
      ctx.restore();
      x += bw + gap;
    }
  }
  function dibujarHudEn(ctx, W, H, t) {'''),
 # ---- exportar video
 ('''    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const ctx = lienzo.getContext("2d");
    const W = lienzo.width, H = lienzo.height;
    const componer = () => {
      const t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else { try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {} }
      dibujarCapa(null, t, true, ctx, W, H);
      if (a.sender) dibujarHudEn(ctx, W, H, t);''', '''    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const FR = franjaHud(lienzo.width, lienzo.height); lienzo.height += FR;
    const ctx = lienzo.getContext("2d");
    const W = lienzo.width, H = lienzo.height - FR;
    const componer = () => {
      const t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H + FR);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else { try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {} }
      dibujarCapa(null, t, true, ctx, W, H);
      if (a.sender) { if (FR) dibujarHudFranja(ctx, W, H, FR, t); else dibujarHudEn(ctx, W, H, t); }'''),
 # ---- snapshot
 ('''    const c = document.createElement("canvas"); c.width = Math.round(vw * k); c.height = Math.round(vh * k);
    const ctx = c.getContext("2d"), W = c.width, H = c.height;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else ctx.drawImage(v, 0, 0, W, H);
    if (conAnot) { dibujarCapa(null, t, true, ctx, W, H); if (a.sender) dibujarHudEn(ctx, W, H, t); }''', '''    const c = document.createElement("canvas"); c.width = Math.round(vw * k); c.height = Math.round(vh * k);
    const FR = conAnot ? franjaHud(c.width, c.height) : 0; c.height += FR;
    const ctx = c.getContext("2d"), W = c.width, H = c.height - FR;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H + FR);
    if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else ctx.drawImage(v, 0, 0, W, H);
    if (conAnot) { dibujarCapa(null, t, true, ctx, W, H); if (a.sender) { if (FR) dibujarHudFranja(ctx, W, H, FR, t); else dibujarHudEn(ctx, W, H, t); } }'''),
 # ---- comentario grabado (voz y cámara)
 ('''    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const ctx = lienzo.getContext("2d");
    let camVid = null;''', '''    lienzo.width = Math.round(vw * esc_ / 2) * 2; lienzo.height = Math.round(vh * esc_ / 2) * 2;
    const FR = franjaHud(lienzo.width, lienzo.height); lienzo.height += FR;
    const ctx = lienzo.getContext("2d");
    let camVid = null;'''),
 ('''      const W = lienzo.width, H = lienzo.height, t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {}
      dibujarCapa(null, t, true, ctx, W, H);
      if (E.a.sender) dibujarHudEn(ctx, W, H, t);''', '''      const W = lienzo.width, H = lienzo.height - FR, t = E.vid.currentTime;
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H + FR);
      if (E.soloDatos) dibujarEscenarioDatos(ctx, W, H, t); else try { ctx.drawImage(E.vid, 0, 0, W, H); } catch (e) {}
      dibujarCapa(null, t, true, ctx, W, H);
      if (E.a.sender) { if (FR) dibujarHudFranja(ctx, W, H, FR, t); else dibujarHudEn(ctx, W, H, t); }'''),
])
