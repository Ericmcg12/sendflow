// ============================================================================
// fecha-dmy.js — todos los campos de fecha de el sitio se escriben y se ven dd/mm/aaaa (v64).
// El navegador decide el formato de <input type="date"> según su idioma (un navegador en inglés muestra mm/dd/aaaa) y la página no lo puede cambiar.
// Este módulo deja el campo original (con el valor AAAA-MM-DD, para que el resto del código siga igual) escondido, y muestra al lado un campo de texto
// dd/mm/aaaa con máscara y un botón de calendario. Se aplica solo a cada campo de fecha que aparezca (ventanas, formularios).
// ============================================================================
(function () {
  "use strict";
  const iso = (d, m, a) => {
    const f = new Date(a, m - 1, d);
    return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d ? `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
  };
  const aVista = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  const mascara = (t) => { const s = String(t).replace(/\D/g, "").slice(0, 8); return s.length > 4 ? `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4)}` : s.length > 2 ? `${s.slice(0, 2)}/${s.slice(2)}` : s; };
  const aviso = (el, v) => { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };

  function mejorar(real) {
    if (real.dataset.dmy) return;
    real.dataset.dmy = "1";
    const caja = document.createElement("span"); caja.className = "fecha-dmy";
    const txt = document.createElement("input"); txt.type = "text"; txt.className = (real.className || "input") + " fecha-dmy-txt"; txt.inputMode = "numeric"; txt.autocomplete = "off";
    txt.placeholder = "dd/mm/aaaa"; txt.maxLength = 10; txt.value = aVista(real.value);
    if (real.disabled) txt.disabled = true;
    if (real.getAttribute("aria-label")) txt.setAttribute("aria-label", real.getAttribute("aria-label"));
    const cal = document.createElement("button"); cal.type = "button"; cal.className = "fecha-dmy-cal"; cal.setAttribute("aria-label", "Elegir en el calendario"); cal.title = "Calendario"; cal.textContent = "📅";
    real.classList.add("fecha-dmy-real"); real.tabIndex = -1; real.setAttribute("aria-hidden", "true");
    real.parentNode.insertBefore(caja, real); caja.appendChild(txt); caja.appendChild(cal); caja.appendChild(real);
    const fuera = (v) => (real.min && v < real.min) || (real.max && v > real.max);
    const aplicar = () => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(txt.value);
      const v = m ? iso(+m[1], +m[2], +m[3]) : "";
      const ok = txt.value === "" || (v && !fuera(v));
      txt.classList.toggle("invalido", !ok); txt.setAttribute("aria-invalid", ok ? "false" : "true");
      const nuevo = ok ? v : "";
      if (real.value !== nuevo) { real.value = nuevo; aviso(real); }
    };
    txt.addEventListener("input", () => { txt.value = mascara(txt.value); if (txt.value.length === 10 || txt.value === "") aplicar(); else if (real.value) { real.value = ""; aviso(real); } });
    txt.addEventListener("blur", () => { if (txt.value && txt.value.length < 10) { txt.classList.add("invalido"); txt.setAttribute("aria-invalid", "true"); } });
    txt.addEventListener("focus", () => { const s = aVista(real.value); if (s && txt.value !== s) txt.value = s; });
    cal.addEventListener("click", () => { try { if (real.showPicker) { real.showPicker(); return; } } catch (e) { /* sin selector nativo */ } real.focus(); real.click(); });
    real.addEventListener("change", () => { const s = aVista(real.value); if (s && txt.value !== s) { txt.value = s; txt.classList.remove("invalido"); } });   // elegido en el calendario
    const refresco = new MutationObserver(() => { txt.disabled = real.disabled; });
    refresco.observe(real, { attributes: true, attributeFilter: ["disabled"] });
  }
  function barrer(raiz) { if (raiz.matches && raiz.matches('input[type="date"]')) mejorar(raiz); (raiz.querySelectorAll ? raiz.querySelectorAll('input[type="date"]') : []).forEach(mejorar); }
  function iniciar() {
    barrer(document);
    new MutationObserver((ms) => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) barrer(n); }))).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
