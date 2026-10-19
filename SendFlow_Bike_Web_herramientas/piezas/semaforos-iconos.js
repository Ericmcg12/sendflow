/* SendFlow Bike Web · iconos de "qué hacer" de los semáforos: perilla (horario cierra, antihorario abre), presión, token y resorte.
   Los usa el popup (semaforos-popup.js) y la página de animación (semaforo-anim.js). Lo agrega aplicar_semaforos_popup.py; no está en la app. */
(function () {
  "use strict";
  function pol(cx, cy, r, deg){ var q = deg*Math.PI/180; return [cx + r*Math.cos(q), cy + r*Math.sin(q)]; }
  function f1(n){ return n.toFixed(1); }
  /* perilla: horario cierra (o suma precarga), antihorario abre. clicks: 1 o 2; fijo para precarga */
  function knobSVG(dir, clicks, label, sub, col){
    var cx = 24, cy = 24, R = 19, c = col || (clicks > 1 ? "var(--bad)" : "var(--oro)");
    var h = '<circle cx="'+cx+'" cy="'+cy+'" r="12" fill="var(--panel)" stroke="var(--line)" stroke-width="1.4"/>';
    for (var i = 0; i < 12; i++){ var p1 = pol(cx, cy, 14.8, i*30 - 90), p2 = pol(cx, cy, 17.2, i*30 - 90); h += '<line x1="'+f1(p1[0])+'" y1="'+f1(p1[1])+'" x2="'+f1(p2[0])+'" y2="'+f1(p2[1])+'" class="tk"/>'; }
    var sg = dir === "cw" ? 1 : -1, th = clicks > 1 ? 130 : 70, a0 = -90, a1 = a0 + sg*th, s0 = pol(cx, cy, R, a0), s1 = pol(cx, cy, R, a1);
    h += '<path d="M'+f1(s0[0])+' '+f1(s0[1])+' A'+R+' '+R+' 0 0 '+(dir === "cw" ? 1 : 0)+' '+f1(s1[0])+' '+f1(s1[1])+'" fill="none" stroke="'+c+'" stroke-width="2.6" stroke-linecap="round"/>';
    var t = (a1 + sg*90)*Math.PI/180, r = a1*Math.PI/180, tip = [s1[0] + 7*Math.cos(t), s1[1] + 7*Math.sin(t)], b1 = [s1[0] + 4.6*Math.cos(r), s1[1] + 4.6*Math.sin(r)], b2 = [s1[0] - 4.6*Math.cos(r), s1[1] - 4.6*Math.sin(r)];
    h += '<polygon points="'+f1(tip[0])+','+f1(tip[1])+' '+f1(b1[0])+','+f1(b1[1])+' '+f1(b2[0])+','+f1(b2[1])+'" fill="'+c+'"/>';
    h += '<text x="54" y="21" style="font-size:11px;font-weight:600;fill:'+c+'">'+label+'</text><text x="54" y="35" style="font-size:9.5px;fill:var(--dim)">'+sub+'</text>';
    return h;
  }
  /* manómetro con flecha: subir o bajar presión */
  function psiSVG(dir, label, sub, col){
    var cx = 24, cy = 36, c = col || "var(--oro)";
    var h = '<path d="M4 36 A20 20 0 0 1 44 36" fill="none" stroke="var(--line)" stroke-width="1.4"/>';
    for (var i = 0; i <= 6; i++){ var a = 180 + i*30, p1 = pol(cx, cy, 15, a), p2 = pol(cx, cy, 18, a); h += '<line x1="'+f1(p1[0])+'" y1="'+f1(p1[1])+'" x2="'+f1(p2[0])+'" y2="'+f1(p2[1])+'" class="tk"/>'; }
    h += '<text x="24" y="33" text-anchor="middle" style="font-size:9px;fill:var(--dim)">psi</text>';
    h += dir === "up" ? '<path d="M54 40V12M47 19L54 11L61 19" fill="none" stroke="'+c+'" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' : '<path d="M54 12V40M47 33L54 41L61 33" fill="none" stroke="'+c+'" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
    return h + '<text x="70" y="21" style="font-size:11px;font-weight:600;fill:'+c+'">'+label+'</text><text x="70" y="35" style="font-size:9.5px;fill:var(--dim)">'+sub+'</text>';
  }
  /* token: bloque que ocupa volumen en la cámara de aire */
  function tokSVG(label, sub, col){
    var c = col || "var(--oro)";
    return '<rect x="8" y="8" width="32" height="32" rx="4" fill="none" stroke="var(--line)" stroke-width="1.4"/><rect x="14" y="14" width="20" height="14" rx="2" fill="none" stroke="'+c+'" stroke-width="2"/><path d="M24 31V37M21 34H27" stroke="'+c+'" stroke-width="2.4" stroke-linecap="round"/>' +
      '<text x="54" y="21" style="font-size:11px;font-weight:600;fill:'+c+'">'+label+'</text><text x="54" y="35" style="font-size:9.5px;fill:var(--dim)">'+sub+'</text>';
  }
  /* resorte espiral más duro: más lbs */
  function lbsSVG(label, sub, col){
    var c = col || "var(--oro)", pts = "";
    for (var i = 0; i <= 8; i++) pts += (i ? " " : "") + (i % 2 ? 36 : 12) + "," + (6 + i*4.5);
    return '<polyline points="'+pts+'" fill="none" stroke="'+c+'" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 2V6M24 42V46" stroke="var(--line)" stroke-width="1.4"/>' +
      '<text x="54" y="21" style="font-size:11px;font-weight:600;fill:'+c+'">'+label+'</text><text x="54" y="35" style="font-size:9.5px;fill:var(--dim)">'+sub+'</text>';
  }
  function barSVG(dev){
    var w = 260, m = 10, au = w - m*2, c = m + au/2, x = c + Math.max(-1, Math.min(1, dev))*au/2, ok = Math.abs(dev) < .02;
    var col = ok ? "var(--cian)" : (Math.abs(dev) > .55 ? "var(--bad)" : "var(--oro)"), h = '<line x1="'+m+'" y1="12" x2="'+(w-m)+'" y2="12" class="tk"/>';
    for (var i = 0; i < 5; i++) h += '<circle cx="'+(m + i/4*au)+'" cy="12" r="'+(i === 2 ? 3 : 2.2)+'" class="tk"/>';
    return h + '<line x1="'+c+'" y1="12" x2="'+x+'" y2="12" style="stroke:'+col+';stroke-opacity:.7;stroke-width:2.5"/><circle cx="'+x+'" cy="12" r="5" style="fill:'+col+';stroke:var(--bg);stroke-width:1.2"/>';
  }
  window.SFIconos = { pol: pol, f1: f1, knobSVG: knobSVG, psiSVG: psiSVG, tokSVG: tokSVG, lbsSVG: lbsSVG, barSVG: barSVG };
})();
