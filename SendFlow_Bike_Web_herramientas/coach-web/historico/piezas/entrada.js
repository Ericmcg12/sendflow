// ============================================================================
// entrada.js (Coach v47, 16/10/2026) — pantalla de entrada.
// La bienvenida grande que estaba arriba del Inicio pasa a ser una pantalla que aparece una sola vez por sesión del
// navegador (sessionStorage) al entrar o al abrir Coach con la sesión iniciada: el zigzag del logo se dibuja, aparece el
// texto y a los ~3 s se va sola. Un toque (o cualquier tecla) la saltea. Con "reducir movimiento" no hay animación.
// ============================================================================
(function () {
  "use strict";
  const CLAVE = "sfc-entrada-vista";
  const quieto = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TEXTOS = {
    coach: ['Lo que ves en el video, <span class="acento">explicado con datos.</span>',
      "Analizá cada bajada cuadro a cuadro, dibujá sobre el video, etiquetá lo que hay que corregir y grabá tu comentario. Si el piloto bajó con el Sender, sumá velocidad, recorrido de suspensión e impactos sobre la imagen."],
    piloto: ['Tus bajadas, <span class="acento">vistas por tu entrenador.</span>',
      "Acá aparecen los análisis que te hacen: el video con sus marcas, lo que hacés bien, lo que tenés que mejorar y sus comentarios grabados. Subí tus bajadas del Sender desde SendFlow para que las vea con datos."]
  };
  const ZIG = "M10,100 L40,60 L60,85 L85,28 L110,80 L130,55 L160,95 L190,100";

  function yaVista() { try { return sessionStorage.getItem(CLAVE) === "1"; } catch (e) { return false; } }
  function olvidar() { try { sessionStorage.removeItem(CLAVE); } catch (e) {} }

  function mostrar(usuario, esCoach) {
    if (yaVista() || document.querySelector(".entrada-sf")) return;
    try { sessionStorage.setItem(CLAVE, "1"); } catch (e) {}
    const [titulo, texto] = TEXTOS[esCoach ? "coach" : "piloto"];
    const el = document.createElement("div");
    el.className = "entrada-sf" + (quieto() ? " quieta" : "");
    el.innerHTML = `<div class="ent-caja">
        <svg class="ent-zigzag" viewBox="0 0 200 120" aria-hidden="true">
          <defs><linearGradient id="entGz" x1="0" x2="1"><stop offset="0" stop-color="#4fe3c2" stop-opacity=".35"/><stop offset=".5" stop-color="#4fe3c2"/><stop offset="1" stop-color="#4a9eff"/></linearGradient></defs>
          <path class="ent-brillo" pathLength="1" d="${ZIG}" fill="none" stroke="url(#entGz)" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
          <path class="ent-trazo" pathLength="1" d="${ZIG}" fill="none" stroke="url(#entGz)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
          <circle class="ent-punto" cx="85" cy="28" r="7" fill="#fff"/>
        </svg>
        <div class="ent-txt">
          <span class="etiqueta">${esCoach ? "Entrenador" : "Piloto"} · ${esc(usuario && usuario.nombre)}</span>
          <h1>${titulo}</h1>
          <p>${texto}</p>
        </div>
      </div>
      <span class="ent-saltear">Tocá para seguir</span>`;
    document.body.appendChild(el);
    document.body.classList.add("con-entrada");
    let fuera = false, reloj = 0;
    const cerrar = () => {
      if (fuera) return; fuera = true; clearTimeout(reloj);
      document.removeEventListener("keydown", cerrar, true);
      document.body.classList.remove("con-entrada");
      if (quieto()) { el.remove(); return; }
      el.classList.add("saliendo");            // fundido por CSS; se saca con un reloj (no depende de que haya cuadros)
      setTimeout(() => el.remove(), 300);
    };
    el.addEventListener("pointerdown", cerrar);
    document.addEventListener("keydown", cerrar, true);
    reloj = setTimeout(cerrar, quieto() ? 2500 : 3000);   // el texto queda ~2 s a la vista (aparece a los ~1,1 s)
  }

  window.CoachEntrada = { mostrar, olvidar };
})();
