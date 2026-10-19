/* SendFlow Bike Web · animación de un semáforo (horquilla o shock, con el resorte del perfil). Se abre en un iframe
   desde semaforos-popup.js con #CLAVE-H|S-resorteH-resorteS. Lo agrega aplicar_semaforos_popup.py; no está en la app. */
(function(){
  var NS = "http://www.w3.org/2000/svg";
  var $ = function(id){ return document.getElementById(id); };

  var MODES = {
    HSC: { sub:"Compresión rápida", dir:-1, speed:170, hz:1.3, amp:7, v:520, shim:"top", ports:"A", bleedN:4, portN:9, thr:true,
      what:"Un golpe fuerte empuja el vástago muy rápido. El orificio de purga ya no da abasto, la presión sube y abre las laminillas de compresión. El aceite pasa por los puertos del pistón. La rigidez del paquete de laminillas define cuánto frena.",
      when:"Piedras, escalones, raíces, aterrizajes y cualquier impacto en que el vástago se mueve rápido.",
      app:"Entre las muestras en que el vástago comprime (más de 5 mm/s), cuenta qué porcentaje superó el umbral rápido (230 mm/s en el perfil base, corregido por peso, estado de pista y estilo). Si pasa del límite del perfil, sugiere «Cerrar 1 click HSC». Si casi no lo usa pero hubo picos fuertes, sugiere «Abrir 1 click HSC»." },
    LSC: { sub:"Compresión lenta", dir:-1, speed:45, hz:.45, amp:5, v:80, shim:null, ports:null, bleedN:7, portN:0, thr:true, needle:true,
      what:"El vástago entra despacio y el aceite alcanza a pasar por el orificio de purga que regula la aguja. Las laminillas siguen cerradas. Cerrar clicks achica el orificio: más apoyo y menos hundimiento.",
      when:"Peso del piloto, frenadas, apoyo en curvas, compresiones de terreno suave y pedaleo.",
      app:"Toma las compresiones más lentas que ese umbral (necesita al menos 5) y promedia hasta dónde llegan. Si pasan del SAG objetivo más un margen del perfil, sugiere «Cerrar 1 click LSC»." },
    HSR: { sub:"Rebote rápido", dir:1, speed:170, hz:1.3, amp:7, v:480, shim:"bot", ports:"B", bleedN:4, portN:9, thr:false,
      what:"Tras un golpe grande el resorte devuelve el vástago rápido. El aceite baja por los puertos del otro lado y abre las laminillas de rebote. Muy libre: la rueda salta y el vástago pega arriba. Muy cerrado: la horquilla no recupera entre golpes seguidos y se queda comprimida (packing).",
      when:"Salida de golpes grandes, saltos, secciones rotas con impactos seguidos.",
      app:"Compara la velocidad de rebote rápida (percentil 95) con la de compresión rápida de la misma suspensión. Rebote mucho más rápido que la compresión: «Cerrar rebote». Mucho más lento: «Abrir rebote». La ventana depende del perfil y necesita al menos 20 muestras de cada una." },
    LSR: { sub:"Rebote lento", dir:1, speed:45, hz:.45, amp:5, v:70, shim:null, ports:null, bleedN:7, portN:0, thr:false, needle:true,
      what:"La horquilla vuelve despacio a su posición. El aceite baja por el orificio de purga, controlado por la aguja de rebote. Las laminillas no se abren.",
      when:"Recuperación tras la compresión de una curva, rodar sobre terreno ondulado suave.",
      app:"Compara la velocidad de rebote típica (mediana) con la de compresión (mediana) de la misma suspensión. Rebote mucho más rápido: «Cerrar rebote». Mucho más lento: «Abrir rebote». El balance entre delantera y trasera es otro semáforo." },
    SAG: { sub:"Hundimiento con el peso del piloto", dir:-1, speed:0, hz:.3, amp:0, v:0, shim:null, ports:null, bleedN:0, portN:0, thr:false,
      what:"El SAG es cuánto se hunde la suspensión con el piloto parado en posición de ataque, antes de rodar. Se ve en el o-ring: la pata lo empuja hacia arriba por el tubo hasta donde entró. Se lee como porcentaje del recorrido total.",
      when:"Siempre. Es el punto de partida de todo ajuste: define cuánto recorrido queda para absorber golpes y cuánto para extender sobre los huecos. Se mide parado (estático) y rodando (dinámico).",
      app:"No sale de la telemetría: es el SAG que se carga a mano, medido con el o-ring y el piloto parado. Se compara con el objetivo del perfil (18 % horquilla y 28 % shock en el perfil base) y está en zona si queda a menos de 2 puntos. Si no, el texto pide cambiar la presión de aire o, con resorte, la precarga." },
    TOPES: { sub:"Compresiones que llegan al fondo", dir:-1, speed:0, hz:.3, amp:0, v:0, shim:null, ports:null, bleedN:0, portN:0, thr:false,
      what:"Un tope (bottom-out) es una compresión que llega a más del 97 % del recorrido. Un golpe fuerte puede terminar el recorrido y la suspensión choca contra su final. SendFlow cuenta cuántos hubo en la bajada, por separado en la horquilla y en el shock.",
      when:"Aterrizajes largos, golpes grandes de frente y tramos rotos con la suspensión muy comprimida. Tocar fondo de vez en cuando en los golpes más grandes es normal, según el manual.",
      app:"Cero topes, o los que acepta tu perfil (0 o 1 según estilo y peso), es zona objetivo. Más que eso pide «Aumentar soporte» y el texto sugiere sumar presión de aire o un token. El manual de ajuste fino propone primero 1 click de HSC, después un token y después presión. No es lo mismo que el «tiempo en tope» del Panel, que mide el porcentaje de la bajada pasado del 97 %." },
    EQUIL: { title:"EQUILIBRIO", sub:"Recorrido y rebote de la delantera y de la trasera", dir:1, speed:0, hz:.3, amp:0, v:0, shim:null, ports:null, bleedN:0, portN:0, thr:false,
      what:"Mide si la bici trabaja pareja de punta a punta. Primero, cuánto recorrido usa cada suspensión en marcha: la trasera tiene que usar unos 10 puntos más que la delantera. Después, cuánto tarda cada una en recuperarse de un golpe: la trasera nunca debería tardar más que la delantera. Si tarda más se queda hundida (pack down) y llega sin recorrido al próximo golpe.",
      when:"Tramos rotos, saltos y golpes seguidos. Se mide en la bajada, con las dos suspensiones juntas.",
      app:"No usa los clics. 1) Recorrido en marcha: promedio del recorrido usado (en %) fuera de los saltos; la diferencia trasera menos delantera tiene que estar entre 8 y 12 puntos. Fuera de esa franja pide corregir el SAG del extremo que se salió de su rango (presión o precarga). 2) Fase de rebote: en cada golpe, tiempo que tarda cada suspensión en recuperar el 80 % desde el punto más hundido; se emparejan golpes de las dos (la trasera llega unos instantes después) y se compara. Si la trasera tarda más que la delantera por más de la tolerancia (15 ms o el 12 %), es pack down trasero y pide abrir el rebote del shock. Si recupera mucho antes, pide cerrarlo." },
    AIRE: { title:"RESORTE", sub:"Presión, tokens y curva de fuerza", dir:-1, speed:0, hz:.3, amp:0, v:0, shim:null, ports:null, bleedN:0, portN:0, thr:false,
      what:"El resorte guarda la energía del golpe y empuja la suspensión de vuelta. En aire es aire sellado: al comprimirse sube la presión y la fuerza crece cada vez más rápido (curva progresiva). En espiral crece en línea recta. La presión, o la precarga en espiral, define el SAG. Los tokens ocupan volumen y endurecen el final del recorrido, solo en aire.",
      when:"Es lo primero que se ajusta, porque condiciona todo lo demás. Presión para el SAG, en pasos de 5 PSI según el manual. Tokens para tener soporte al final del recorrido. Con más presión hace falta más rebote cerrado (+5 a 10 PSI, +1 a 2 clicks de rebote).",
      app:"En SAG compara el SAG medido con el objetivo y pide cambiar la presión de aire. Si el tipo de resorte de la suspensión es «resorte» (espiral), pide precarga. En topes sugiere sumar presión de aire o token. La curva de acá es ilustrativa, no una medición." }
  };

  var comp = "fork", spring = "aire", popup = false;
  var SHOCK_WHAT = {
    HSC: "Un golpe fuerte empuja el vástago hacia el cuerpo y desplaza aceite hacia la reserva. A esa velocidad el orificio de purga no da abasto: la presión abre las laminillas de la válvula de compresión y el aceite pasa por los puertos.",
    LSC: "El vástago entra despacio y el aceite pasa a la reserva por el orificio de purga que regula la aguja. Las laminillas siguen cerradas. Cerrar clicks achica el orificio: más apoyo y menos hundimiento.",
    HSR: "El resorte devuelve el vástago rápido. El aceite vuelve de la reserva al otro lado del pistón y abre las laminillas de rebote, en el pistón. Muy libre: la rueda salta. Muy cerrado: el shock no recupera entre golpes seguidos (packing).",
    LSR: "El shock vuelve despacio a su posición. El aceite pasa por el orificio de purga del pistón, controlado por la aguja de rebote. Las laminillas no se abren.",
    SAG: "El SAG del shock es cuánto se hunde con el piloto en posición de ataque, antes de rodar. Se mide en el vástago con el o-ring y se lee como porcentaje del recorrido.",
    TOPES: "Un tope es una compresión que llega a más del 97 % del recorrido del shock. SendFlow los cuenta por bajada. Tocar fondo de vez en cuando en los golpes más grandes es normal.",
    AIRE: "En el shock de aire el vástago entra en la carcasa de aire grande. Debajo del pistón de aire queda la cámara positiva, que se comprime al bajar el vástago; arriba queda la negativa. El piggyback va junto a la carcasa, a la altura de la cámara positiva. La presión define el SAG y los tokens endurecen el final del recorrido."
  };
  var P = {
    bC1: [[24,130],[130,130],[192,130],[202,120],[226,104]],
    bC2: [[24,310],[130,310],[192,310],[202,320],[226,336]],
    bCb: [[24,220],[130,220],[190,220],[238,220]],
    bleedUp:  [[160,330],[160,130],[176,130],[200,104]],
    bleedDown: [[200,104],[176,130],[160,130],[160,330]],
    aUp1: [[95,330],[95,192],[101,181],[118,158]],
    aUp2: [[225,330],[225,192],[219,181],[202,158]],
    bDn1: [[125,104],[125,230],[112,240],[98,262],[98,330]],
    bDn2: [[195,104],[195,230],[208,240],[222,262],[222,330]]
  };
  function plen(pts){ var L=[0], t=0; for (var i=1;i<pts.length;i++){ t+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); L.push(t);} return {L:L,t:t}; }
  Object.keys(P).forEach(function(k){ P[k] = {pts:P[k], m:plen(P[k])}; });
  function at(p, d){
    var m=p.m, pts=p.pts; d = Math.max(0, Math.min(m.t, d));
    for (var i=1;i<m.L.length;i++){ if (d<=m.L[i]){ var s=(d-m.L[i-1])/(m.L[i]-m.L[i-1]); return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*s, pts[i-1][1]+(pts[i][1]-pts[i-1][1])*s]; } }
    return pts[pts.length-1];
  }

  var parts = $("parts"), dots = [];
  for (var i=0;i<40;i++){ var c=document.createElementNS(NS,"circle"); c.setAttribute("r","2.8"); c.setAttribute("class","p"); c.setAttribute("cx","-20"); c.setAttribute("cy","-20"); parts.appendChild(c); dots.push(c); }

  var mode = "HSC", running = true, tPrev = performance.now(), phase = 0, streams = [];
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) running = false;

  function buildStreams(){
    var M = MODES[mode], s = [], di = 0;
    function add(path, n, speed){ for (var k=0;k<n;k++){ s.push({p:path, off:k/n, speed:speed, el:dots[di++]}); } }
    var B = comp === "shock";
    var tgt = (B && M.dir < 0 && mode !== "SAG") ? $("partsB") : $("parts");
    dots.forEach(function(d){ tgt.appendChild(d); });
    if (mode==="HSC" && B){ add(P.bC1, M.portN/2+1|0, M.speed); add(P.bC2, M.portN/2+1|0, M.speed); add(P.bCb, M.bleedN, M.speed); }
    else if (mode==="HSC"){ add(P.aUp1, M.portN/2+1|0, M.speed); add(P.aUp2, M.portN/2+1|0, M.speed); add(P.bleedUp, M.bleedN, M.speed); }
    if (mode==="LSC"){ add(B ? P.bCb : P.bleedUp, M.bleedN, M.speed); }
    if (mode==="HSR"){ add(P.bDn1, M.portN/2+1|0, M.speed); add(P.bDn2, M.portN/2+1|0, M.speed); add(P.bleedDown, M.bleedN, M.speed); }
    if (mode==="LSR"){ add(P.bleedDown, M.bleedN, M.speed); }
    dots.forEach(function(d){ d.style.display = "none"; });
    s.forEach(function(q){ q.el.style.display = ""; });
    streams = s;
  }

  function mark(ids, on){ ids.forEach(function(id){ var e=$(id); if(e) e.classList.toggle("on", on); }); }
  function applyMode(){
    var M = MODES[mode];
    $("mTitle").textContent = M.title || mode; $("mSub").textContent = M.sub;
    $("iWhat").textContent = M.what; $("iWhen").textContent = M.when; $("iApp").textContent = M.app;
    ["bore","needle","pA1","pA2","pB1","pB2","shT1p","shT2p","shB1p","shB2p","fkPiston","holeP"].forEach(function(id){ var e=$(id); e.classList.remove("on","part-on"); });
    mark(["bore","needle","holeP"], M.needle || mode==="HSC" || mode==="HSR");
    if (!M.needle && (mode==="HSC"||mode==="HSR")){ mark(["needle"], false); }
    mark(["pA1","pA2","shT1p","shT2p"], mode==="HSC");
    mark(["pB1","pB2","shB1p","shB2p"], mode==="HSR");
    $("fkPiston").classList.add("part-on");
    $("arrowPath").setAttribute("d", M.dir<0 ? "M30 210V250M24 242L30 250L36 242" : "M30 250V210M24 218L30 210L36 218");
    $("arrowTxt").textContent = M.dir<0 ? "comprime" : "extiende";
    $("cap2").textContent = "Detalle A · corte del pistón · " + mode;
    var isSag = mode === "SAG";
    $("sheet").style.setProperty("--flow", isSag ? "var(--cian)" : (M.dir<0 ? "var(--flow-c)" : "var(--flow-r)"));
    var shock = comp === "shock", isTop = mode === "TOPES", isAir = mode === "AIRE", isEq = mode === "EQUIL", special = isSag || isTop || isAir || isEq, useB = shock && M.dir < 0 && !special;
    $("leftcol").hidden = (isTop && !popup) || (isSag && !shock) || isEq;
    document.querySelector(".fig-detail").hidden = special || useB;
    document.querySelector(".fig-detailB").hidden = !useB;
    $("noteShock").hidden = !shock;
    if (shock){
      $("iWhat").textContent = SHOCK_WHAT[mode];
      $("cap2").textContent = "Detalle A · pistón del shock (rebote) · " + mode;
      $("cap3").textContent = "Detalle B · válvula de compresión en la reserva, vista girada · " + mode;
    }
    $("lamC1").textContent = shock ? "paso libre" : "laminillas"; $("lamC2").textContent = shock ? "(compresión)" : "compresión";
    $("shArrowPath").setAttribute("d", M.dir<0 ? "M34 140V100M28 108L34 100L40 108" : "M34 100V140M28 132L34 140L40 132");
    $("shArrowTxt").textContent = M.dir<0 ? "comprime" : "extiende";
    $("saArrowPath").setAttribute("d", M.dir<0 ? "M34 100V140M28 132L34 140L40 132" : "M34 140V100M28 108L34 100L40 108");
    $("saArrowTxt").textContent = M.dir<0 ? "comprime" : "extiende";
    ["bPort1","bPort2","bShUp","bShLp","bBleed","bNeedle"].forEach(function(id){ $(id).classList.remove("on"); });
    mark(["bPort1","bPort2","bShUp","bShLp"], mode==="HSC");
    mark(["bBleed","bNeedle"], mode==="LSC" || mode==="HSC");
    $("shPiston").classList.add("part-on");
    $("ctxArrowPath").setAttribute("d", M.dir<0 ? "M34 44V84M28 76L34 84L40 76" : "M34 84V44M28 52L34 44L40 52");
    $("ctxArrowTxt").textContent = M.dir<0 ? "comprime" : "extiende";
    if (isAir || popup) view = "ctx";
    $("leftcol").classList.toggle("nolabels", isTop && popup);
    applyView();
    applySpring();
    $("gaugeSvg").hidden = special;
    $("legend").hidden = special;
    $("sagBox").hidden = !isSag;
    $("topBox").hidden = !isTop || popup;
    $("airBox").hidden = !isAir;
    $("equilBox").hidden = !isEq;
    $("noteShock").hidden = !shock || isEq;
    if (isTop || isAir) phase = 0;
    $("noteMain").hidden = isTop || isAir || isEq;
    if (isAir) drawAir();
    if (isSag) phase = 2;
    buildStreams();
    var gx = function(v){ return 20 + 360 * v / 800; };
    $("gThr").style.display = M.thr ? "" : "none"; $("gThrT").style.display = M.thr ? "" : "none";
    if (M.thr){ $("gThr").setAttribute("x1", gx(230)); $("gThr").setAttribute("x2", gx(230)); $("gThrT").setAttribute("x", gx(230)-4); $("gThrT").textContent = "umbral LSC/HSC 230"; }
    $("gVal").textContent = "velocidad de vástago, ejemplo: " + M.v + " mm/s";
    $("gDot").setAttribute("cx", gx(M.v));
    document.querySelectorAll(".tab").forEach(function(b){ b.setAttribute("aria-selected", b.dataset.m===mode ? "true":"false"); });
    frame(performance.now());
  }

  var ticks = $("gTicks");
  [0,200,400,600,800].forEach(function(v){
    var x = 20 + 360*v/800;
    var l = document.createElementNS(NS,"line"); l.setAttribute("x1",x); l.setAttribute("x2",x); l.setAttribute("y1",26); l.setAttribute("y2",34); l.setAttribute("class","thin"); ticks.appendChild(l);
    var t = document.createElementNS(NS,"text"); t.setAttribute("x",x); t.setAttribute("y",46); t.setAttribute("text-anchor","middle"); t.textContent = v; ticks.appendChild(t);
  });

  function frame(now){
    var dt = Math.max(0, Math.min(.05, (now - tPrev)/1000)); tPrev = now;
    if (running){ phase += dt; }
    var M = MODES[mode], tt = phase;
    streams.forEach(function(q){
      var d = ((tt*q.speed + q.off*q.p.m.t) % q.p.m.t);
      var xy = at(q.p, d); q.el.setAttribute("cx", xy[0].toFixed(1)); q.el.setAttribute("cy", xy[1].toFixed(1));
    });
    var s = .78 + .22*Math.sin(tt*M.hz*6.28);
    var ang = (M.shim ? 17*s : 0);
    $("shT1").setAttribute("transform", "rotate(" + (M.shim==="top" ?  ang : 0) + " 106 187)");
    $("shT2").setAttribute("transform", "rotate(" + (M.shim==="top" ? -ang : 0) + " 214 187)");
    $("shB1").setAttribute("transform", "rotate(" + (M.shim==="bot" ? -ang : 0) + " 136 233)");
    $("shB2").setAttribute("transform", "rotate(" + (M.shim==="bot" ?  ang : 0) + " 184 233)");
    $("needleG").setAttribute("transform", "translate(0 " + (M.needle ? (6*Math.sin(tt*1.1)).toFixed(1) : 0) + ")");
    var tpT = mode === "TOPES" ? topT(tt*1.1) : 0, posTop = mode === "TOPES" ? posAt(tpT)/100 : 0;
    var xa = .5 - .5*Math.cos(tt*2*Math.PI/9), up = (mode === "AIRE" ? xa*70 : mode === "TOPES" ? posTop*75 : M.amp*1.4*(.5 + .5*Math.sin(tt*M.hz*6.28))).toFixed(1);
    $("upG").setAttribute("transform", "translate(0 " + up + ")");
    $("upG2").setAttribute("transform", "translate(0 " + up + ")");
    $("shaftG").setAttribute("transform", "translate(0 " + (M.amp*Math.sin(tt*M.hz*6.28)).toFixed(1) + ")");
    // shock: sube el vástago, se acorta el resorte, el pistón flotante sigue al aceite
    var sw = .5 + .5*Math.sin(tt*M.hz*6.28), lowU = mode === "AIRE" ? xa*70 : mode === "TOPES" ? posTop*75 : M.amp*2*sw;
    $("lowG").setAttribute("transform", "translate(0 " + (-lowU).toFixed(1) + ")");
    $("spG").setAttribute("transform", "translate(0 316) scale(1 " + (((474 - lowU) - 316)/158).toFixed(3) + ") translate(0 -316)");
    $("shIfp").setAttribute("transform", "translate(0 " + (sw*9).toFixed(1) + ")");
    $("bIfp").setAttribute("transform", "translate(" + (sw*16).toFixed(1) + " 0)");
    $("bShU").setAttribute("transform", "rotate(" + (M.shim==="top" ? ang : 0) + " 193 144)");
    $("bShL").setAttribute("transform", "rotate(" + (M.shim==="top" ? -ang : 0) + " 193 296)");
    $("bNeedleG").setAttribute("transform", "translate(0 " + (M.needle ? (6*Math.sin(tt*1.1)).toFixed(1) : 0) + ")");
    if (mode === "SAG") updateSag(tt);
    if (mode === "EQUIL") updateEq(tt);
    if (mode === "TOPES") updateTop(tt);
    var hit = mode === "TOPES" && posTop > .97;
    ["fkHitG", "shHitG", "saHitG"].forEach(function(id){ $(id).style.display = hit ? "" : "none"; });
    if (mode === "TOPES"){
      var nT = PULSES.filter(function(p){ return p[1] > 97 && tpT >= p[0]; }).length;
      $("topN").textContent = nT;
      $("topMsg").textContent = nT === 0 ? "Todavía sin topes." : nT <= TOPE.tol ? "Uno solo: es normal en un golpe grande." : "Pasa seguido: a la suspensión le falta soporte.";
    }
    var dS = mode === "AIRE" ? lowU*1.5 : mode === "TOPES" ? posTop*105 : lowU;
    $("saTop").setAttribute("transform", "translate(0 " + dS.toFixed(1) + ")");
    $("saIfp").setAttribute("transform", "translate(0 " + (-sw*9).toFixed(1) + ")");
    updateSpring(+up, dS, mode === "AIRE" ? Math.min(1, curveF(xa)/6) : .45);
    if (mode === "AIRE") updateAir(xa);
    var v = M.v*(1 + .08*Math.sin(tt*M.hz*6.28));
    $("gDot").setAttribute("cx", (20 + 360*v/800).toFixed(1));
  }
  function loop(now){ requestAnimationFrame(loop); if (popup) { try { frame(now); } catch (e) { if (window.console) console.error(e); } } else tPrev = now; }

  document.querySelectorAll(".tab").forEach(function(b){
    b.addEventListener("click", function(){ mode = b.dataset.m; applyMode(); });
    b.addEventListener("keydown", function(e){
      var order = ["HSC","LSC","HSR","LSR","SAG","TOPES","AIRE"], i = order.indexOf(mode);
      if (e.key==="ArrowRight"){ mode = order[(i+1)%7]; applyMode(); $("t-"+mode).focus(); }
      if (e.key==="ArrowLeft"){ mode = order[(i+6)%7]; applyMode(); $("t-"+mode).focus(); }
    });
  });
  var view = "ctx";
  function applyView(){
    var shock = comp === "shock";
    document.querySelector(".fig-ctx").hidden = shock || view !== "ctx";
    document.querySelector(".fig-fork").hidden = shock || view !== "fork";
    document.querySelector(".fig-shock").hidden = !(shock && spring === "resorte");
    document.querySelector(".fig-shockair").hidden = !(shock && spring === "aire");
    $("viewseg").hidden = shock;
    document.querySelectorAll("#viewseg button").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.v === view ? "true" : "false"); });
    document.querySelectorAll("#compseg button").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.c === comp ? "true" : "false"); });
  }
  document.querySelectorAll("#viewseg button").forEach(function(b){ b.addEventListener("click", function(){ view = b.dataset.v; applyView(); }); });
  document.querySelectorAll("#compseg button").forEach(function(b){ b.addEventListener("click", function(){ comp = b.dataset.c; if (popup) spring = PERFIL[comp === "shock" ? "S" : "H"]; buildSag(); applyMode(); if (popup) popupText(); }); });
  // spiral del resorte del shock
  (function(){
    var h = "";
    for (var k = 0; k < 8; k++){
      var y = 316 + k*19.75;
      h += '<path d="M234 '+(y+9.9)+'L146 '+(y+19.75)+'" stroke-width="2.4" stroke-opacity=".35"/>';
      h += '<path d="M146 '+y+'L234 '+(y+9.9)+'" stroke-width="3.2" stroke-opacity=".9"/>';
    }
    $("spG").innerHTML = h;
  })();
  $("play").addEventListener("click", function(){ running = !running; this.textContent = running ? "Pausar" : "Reanudar"; });
  if (reduce) $("play").textContent = "Reanudar";

  // SAG: tres tubos con la misma escala, el o-ring sube hasta el valor de cada caso
  var H = 200, Y0 = 250;
  var SAGS = [
    { t:.07, cls:"bad", name:"Muy duro", rng:"menos de 10 %", why:"Casi no usa recorrido: la rueda no copia el terreno y pierde tracción." },
    { t:.18, cls:"ok",  name:"Objetivo", rng:"18 % en SendFlow", why:"Deja recorrido para extender en los huecos y para absorber golpes." },
    { t:.34, cls:"bad", name:"Muy blando", rng:"más de 30 %", why:"Se hunde antes del primer golpe y llega más seguido al tope." }
  ];
  var sagBox = $("sagBox");
  var SAGS_FORK = SAGS;
  var SAGS_SHOCK = [
    { t:.28, cls:"ok", name:"Objetivo del shock", rng:"28 % en SendFlow", why:"Es el valor del perfil base para el shock. La horquilla usa 18 %." }
  ];
  function buildSag(){
  sagBox.innerHTML = "";
  sagBox.className = "sagbox" + (comp === "shock" ? " one" : "");
  SAGS = comp === "shock" ? SAGS_SHOCK : SAGS_FORK;
  SAGS.forEach(function(S, i){
    var col = S.cls === "ok" ? "var(--ok)" : "var(--bad)", ticks = "";
    [0,.1,.2,.3,.4].forEach(function(p){
      var y = Y0 - p*H;
      ticks += '<line class="l" x1="140" y1="'+y+'" x2="148" y2="'+y+'"/><text class="labd" x="152" y="'+(y+3.5)+'">'+Math.round(p*100)+'%</text>';
    });
    var fig = document.createElement("figure");
    fig.innerHTML =
      '<svg viewBox="0 0 230 360" role="img" aria-label="Tubo de horquilla con escala de SAG. '+S.name+', '+S.rng+'.">' +
      '<defs><pattern id="hatch'+i+'" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" style="stroke:'+col+';stroke-width:1.3"/></pattern></defs>' +
      '<rect class="tealf" id="st'+i+'" x="80" y="20" width="60" height="230"/>' +
      '<line class="spec" x1="90" x2="90" id="sh'+i+'" y1="30" y2="250"/>' +
      '<g id="cr'+i+'"><rect class="metalf" x="52" y="6" width="116" height="14" rx="4"/></g>' +
      '<rect id="zn'+i+'" x="82" y="250" width="56" height="0" fill="url(#hatch'+i+')" style="stroke:'+col+';stroke-width:1"/>' +
      ticks +
      '<path class="glassf" d="M62 250H158V330Q158 340 148 340H72Q62 340 62 330Z"/><path class="l" d="M92 340V314Q110 298 128 314V340" style="stroke-opacity:.5"/>' +
      '<rect class="metalf" x="60" y="246" width="100" height="6" rx="2"/>' +
      '<rect id="or'+i+'" x="76" y="244" width="68" height="6" rx="3" fill="var(--panel)" style="stroke:'+col+';stroke-width:2.4"/>' +
      '<line id="ld'+i+'" class="thin" x1="34" x2="76" y1="247" y2="247"/>' +
      '<text id="rd'+i+'" class="lab" x="2" y="251" style="fill:'+col+'">0 %</text>' +
      '</svg>' +
      '<div class="sagcap '+S.cls+'"><b>'+(S.cls==="ok" ? "✓ " : "✕ ")+S.name+'</b><span class="r">'+S.rng+'</span><p>'+S.why+'</p></div>';
    sagBox.appendChild(fig);
  });
  }
  buildSag();
  function ease(x){ x = Math.max(0, Math.min(1, x)); return x*x*(3 - 2*x); }
  function updateSag(tt){
    var u = tt % 5.5;
    var k = u < .3 ? 0 : u < 1.7 ? ease((u-.3)/1.4) : u < 4.4 ? 1 : u < 5.2 ? 1 - ease((u-4.4)/.8) : 0;
    SAGS.forEach(function(S, i){
      var d = S.t*k + (k >= 1 ? .006*Math.sin(tt*2.2) : 0);
      var dy = d*H;
      $("or"+i).setAttribute("y", (Y0 - dy - 6).toFixed(1));
      $("zn"+i).setAttribute("y", (Y0 - dy).toFixed(1)); $("zn"+i).setAttribute("height", dy.toFixed(1));
      $("cr"+i).setAttribute("transform", "translate(0 " + dy.toFixed(1) + ")");
      $("st"+i).setAttribute("y", (20 + dy).toFixed(1)); $("st"+i).setAttribute("height", (230 - dy).toFixed(1));
      $("sh"+i).setAttribute("y1", (30 + dy).toFixed(1));
      var ly = (Y0 - dy - 3).toFixed(1);
      $("ld"+i).setAttribute("y1", ly); $("ld"+i).setAttribute("y2", ly);
      $("rd"+i).setAttribute("y", (Y0 - dy).toFixed(1)); $("rd"+i).textContent = Math.round(d*100) + " %";
    });
  }
  // ---- TOPES: una bajada de ejemplo, cuenta de topes y semáforo con la misma fórmula que la app ----
  var TOPE = { tol: 1, T: 11 };
  function topT(tt){ var t = tt % (TOPE.T + 1.5); return t > TOPE.T ? TOPE.T : t; }
  var PULSES = [[1.0,38],[2.1,62],[3.2,84],[4.4,99.2],[5.5,48],[6.5,74],[7.6,98.4],[8.6,70],[9.6,100]];
  function posAt(t){
    var m = 6;
    PULSES.forEach(function(p){ var d = (t - p[0])/.32, v = 6 + (p[1]-6)*Math.exp(-d*d); if (v > m) m = v; });
    return Math.min(100, m);
  }
  var tcX = function(t){ return 44 + t*(456/TOPE.T); }, tcY = function(v){ return 270 - v*2.5; };
  (function(){
    var d = "";
    for (var t = 0; t <= TOPE.T + .001; t += .05) d += (d ? "L" : "M") + tcX(t).toFixed(1) + " " + tcY(posAt(t)).toFixed(1);
    $("tcPath").setAttribute("d", d);
    var m = "";
    PULSES.forEach(function(p, i){ if (p[1] > 97) m += '<circle id="tcM'+i+'" cx="'+tcX(p[0]).toFixed(1)+'" cy="'+tcY(p[1]).toFixed(1)+'" r="5.5" fill="var(--bad)" fill-opacity="0"/>'; });
    $("tcMarks").innerHTML = m;
    var tk = "";
    for (var s = 0; s <= TOPE.T; s += 2) tk += '<text x="'+tcX(s)+'" y="290" text-anchor="middle">'+s+' s</text>';
    $("tcTicks").innerHTML = tk;
  })();
  function evalTopes(n, tol){
    if (!n) return { cls:"ok", chip:"EN PUNTO", msg:"Zona objetivo correcta" };
    if (n <= tol) return { cls:"ok", chip:"EN PUNTO", msg:"Zona objetivo correcta (" + n + " tope aislado)" };
    var d = Math.min(1, .35 + (n - tol)*.12);
    return { cls: d > .55 ? "bad" : "warn", chip: d > .55 ? "FUERTE" : d > .22 ? "MODERADO" : "LEVE", msg:"Aumentar soporte (" + n + " bottom-out" + (n > 1 ? "s" : "") + "): subir presión de aire o agregar token" };
  }
  document.querySelectorAll("#tolSeg button").forEach(function(b){
    b.addEventListener("click", function(){
      TOPE.tol = +b.dataset.n;
      document.querySelectorAll("#tolSeg button").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    });
  });
  function updateTop(tt){
    var t = tt % (TOPE.T + 1.5); if (t > TOPE.T) t = TOPE.T;
    var v = posAt(t), n = 0;
    PULSES.forEach(function(p, i){
      if (p[1] > 97){ var seen = t >= p[0]; if (seen) n++; var e = $("tcM"+i); if (e) e.setAttribute("fill-opacity", seen ? ".9" : "0"); }
    });
    var x = tcX(t).toFixed(1);
    $("tcHead").setAttribute("x1", x); $("tcHead").setAttribute("x2", x);
    $("tcDot").setAttribute("cx", x); $("tcDot").setAttribute("cy", tcY(v).toFixed(1));
    $("tcDot").style.fill = v > 97 ? "var(--bad)" : "var(--cian)";
    $("tgFill").setAttribute("y", (320 - v*3).toFixed(1)); $("tgFill").setAttribute("height", (v*3).toFixed(1));
    $("tgFill").style.fill = v > 97 ? "var(--bad)" : "var(--cian)";
    $("tgDot").setAttribute("cy", (320 - v*3).toFixed(1)); $("tgDot").style.fill = v > 97 ? "var(--bad)" : "var(--cian)";
    $("tgVal").textContent = Math.round(v) + " %";
    var r = evalTopes(n, TOPE.tol);
    $("tcN").textContent = n; $("tcChip").textContent = r.chip; $("tcChip").className = "chip " + r.cls; $("tcMsg").textContent = r.msg;
  }

  // ---- RESORTE: curva de fuerza ilustrativa (aire sellado con n = 1,25) contra un espiral lineal ----
  var AIR = { P:80, tok:0, pre:2 }, R_TOK = [.81, .88, .95], K_AIR = .7536, N_AIR = 1.25;
  function airF(x, P, r){ return Math.min(6, K_AIR*(P/80)/Math.pow(1 - r*x, N_AIR)); }
  function coilF(x, pre){ return Math.min(6, (.28 + .06*pre) + 2.4*x); }
  function sagAir(P, r){ return Math.max(0, (1 - Math.pow(K_AIR*(P/80), 1/N_AIR))/r); }
  function sagCoil(pre){ return Math.max(0, (1 - (.28 + .06*pre))/2.4); }
  function curveF(x){ return spring === "aire" ? airF(x, AIR.P, R_TOK[AIR.tok]) : coilF(x, AIR.pre); }
  var aX = function(x){ return 54 + x*440; }, aY = function(f){ return 270 - f*41.67; };
  (function(){
    var g = "", tk = "";
    for (var f = 0; f <= 6; f += 2){ g += "M54 "+aY(f)+"H494"; tk += '<text x="48" y="'+(aY(f)+3.5)+'" text-anchor="end">'+f+'×</text>'; }
    [0,25,50,75,100].forEach(function(p){ tk += '<text x="'+aX(p/100)+'" y="288" text-anchor="middle">'+p+' %</text>'; });
    $("aGrid").setAttribute("d", g); $("aTicks").innerHTML = tk;
  })();
  function drawAir(){
    var obj = comp === "shock" ? .28 : .18, aire = spring === "aire", da = "", dc = "";
    for (var i = 0; i <= 60; i++){
      var x = i/60;
      da += (i ? "L" : "M") + aX(x).toFixed(1) + " " + aY(airF(x, AIR.P, R_TOK[AIR.tok])).toFixed(1);
      dc += (i ? "L" : "M") + aX(x).toFixed(1) + " " + aY(coilF(x, AIR.pre)).toFixed(1);
    }
    $("aCurveA").setAttribute("d", da); $("aCurveC").setAttribute("d", dc);
    $("aCurveA").style.opacity = aire ? 1 : .25; $("aCurveC").style.opacity = aire ? .25 : 1;
    var sag = aire ? sagAir(AIR.P, R_TOK[AIR.tok]) : sagCoil(AIR.pre);
    $("aSagL").setAttribute("x1", aX(sag)); $("aSagL").setAttribute("x2", aX(sag));
    $("aSagC").setAttribute("cx", aX(sag)); $("aSagT").setAttribute("x", aX(sag) + 9);
    $("aSagT").textContent = "SAG " + Math.round(sag*100) + " %";
    $("aBand").setAttribute("x", aX(obj - .02)); $("aBand").setAttribute("width", 440*.04);
    $("a97").setAttribute("x1", aX(.97)); $("a97").setAttribute("x2", aX(.97)); $("a97T").setAttribute("x", aX(.97));
    var desv = sag - obj, ok = Math.abs(desv) < .02;
    $("sagVal").textContent = Math.round(sag*100) + " %"; $("sagObj").textContent = Math.round(obj*100) + " %";
    $("sagChip").textContent = ok ? "EN ZONA" : "FUERA"; $("sagChip").className = "chip " + (ok ? "ok" : "warn");
    var accion = aire ? (desv > 0 ? "Subir presión de aire" : "Bajar presión de aire")
                      : (desv > 0 ? "Aumentar precarga de resorte" : "Disminuir precarga de resorte");
    $("sagMsg").textContent = ok ? "Zona objetivo correcta" : accion + " (SAG " + (desv > 0 ? "por encima" : "por debajo") + " del objetivo)";
    $("f97").textContent = "×" + curveF(.97).toFixed(1).replace(".", ",");
    $("pVal").textContent = AIR.P + " psi"; $("tVal").textContent = AIR.tok; $("rVal").textContent = AIR.pre + (AIR.pre === 1 ? " vuelta" : " vueltas");
    $("pCtl").hidden = !aire; $("tCtl").hidden = !aire; $("rCtl").hidden = aire;
    applySpring();
  }
  function updateAir(xa){ var f = curveF(xa); $("aDot").setAttribute("cx", aX(xa).toFixed(1)); $("aDot").setAttribute("cy", aY(f).toFixed(1)); }
  // aire dentro de las siluetas: la horquilla (otra pata) y el shock (cámara bajo el cuerpo)
  var fkP = [], fkN = [], shP = [], shN = [];
  (function(){
    var seed = 11, rnd = function(){ seed = (seed*9301 + 49297) % 233280; return seed/233280; };
    function mk(gid, n, cls, arr){ var h = ""; for (var i = 0; i < n; i++) h += '<circle r="1.9" class="'+cls+'"/>'; var g = $(gid); g.insertAdjacentHTML("beforeend", h); g.querySelectorAll("."+cls).forEach(function(el){ arr.push({el:el, u:rnd(), v:rnd()}); }); }
    var gf = $("fkDots"), gs = $("saDots");
    gf.innerHTML = ""; gs.innerHTML = "";
    mk("fkDots", 30, "fp", fkP); mk("fkDots", 10, "fn", fkN); mk("saDots", 44, "sp", shP); mk("saDots", 16, "sn", shN);
    fkP.concat(shP).forEach(function(g){ g.el.setAttribute("fill", "var(--cian)"); });
    fkN.concat(shN).forEach(function(g){ g.el.setAttribute("fill", "var(--dim)"); });
  })();
  function updateSpring(upF, dS, hi){
    if (spring !== "aire") return;
    var tokH = AIR.tok*14, tp = 128 + upF + tokH, bp = 296, pOp = (.35 + .65*hi).toFixed(2), nOp = (.2 + .4*(1 - hi)).toFixed(2);
    fkP.forEach(function(g){ g.el.setAttribute("cx", (305 + g.u*20).toFixed(1)); g.el.setAttribute("cy", (tp + 4 + g.v*(bp - 4 - (tp + 4))).toFixed(1)); g.el.setAttribute("fill-opacity", pOp); });
    fkN.forEach(function(g){ g.el.setAttribute("cx", (305 + g.u*20).toFixed(1)); g.el.setAttribute("cy", (320 + g.v*(412 + upF - 320)).toFixed(1)); g.el.setAttribute("fill-opacity", nOp); });
    $("fkTok").setAttribute("y", (126 + upF).toFixed(1)); $("fkTok").setAttribute("height", tokH);
    // shock de aire: el pistón baja con el vástago; la cámara positiva queda debajo
    var pTop = 354 + dS, pBot = 508 - tokH, nTop = 274, nBot = 336 + dS;
    shP.forEach(function(g){ g.el.setAttribute("cx", (120 + g.u*140).toFixed(1)); g.el.setAttribute("cy", (pTop + g.v*Math.max(2, pBot - pTop)).toFixed(1)); g.el.setAttribute("fill-opacity", pOp); });
    shN.forEach(function(g){ var x = g.u < .5 ? 120 + g.u*2*42 : 218 + (g.u - .5)*2*42; g.el.setAttribute("cx", x.toFixed(1)); g.el.setAttribute("cy", (nTop + g.v*(nBot - nTop)).toFixed(1)); g.el.setAttribute("fill-opacity", nOp); });
    $("saTok").setAttribute("y", (512 - tokH).toFixed(1)); $("saTok").setAttribute("height", tokH);
  }
  function applySpring(){
    var air = spring === "aire", tok = air && AIR.tok > 0;
    [["fkCoil", !air], ["fkAirG", air], ["fkValve", air], ["fkLabCoil", !air], ["fkLabAir", air], ["fkLabTok", tok]].forEach(function(p){ $(p[0]).style.display = p[1] ? "" : "none"; });
    document.querySelectorAll("#springseg button").forEach(function(b){ b.setAttribute("aria-pressed", b.dataset.s === spring ? "true" : "false"); });
    applyView();
  }
  function bump(key, d, lo, hi){ AIR[key] = Math.max(lo, Math.min(hi, AIR[key] + d)); drawAir(); }
  $("pMinus").addEventListener("click", function(){ bump("P", -5, 60, 100); });
  $("pPlus").addEventListener("click", function(){ bump("P", 5, 60, 100); });
  $("tMinus").addEventListener("click", function(){ bump("tok", -1, 0, 2); });
  $("tPlus").addEventListener("click", function(){ bump("tok", 1, 0, 2); });
  $("rMinus").addEventListener("click", function(){ bump("pre", -1, 0, 5); });
  $("rPlus").addEventListener("click", function(){ bump("pre", 1, 0, 5); });
  document.querySelectorAll("#springseg button").forEach(function(b){ b.addEventListener("click", function(){ spring = b.dataset.s; drawAir(); }); });

  // ---- maqueta: tarjetas de semáforo y popup ----
  var ICON = {
    SAG: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 4v16M18 4v16"/><path d="M6 12h12"/></svg>',
    TOPES: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 20h16"/></svg>',
    HSC: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6l5 5 5-5"/><path d="M7 13l5 5 5-5"/></svg>',
    LSC: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9l5 5 5-5"/></svg>',
    HSR: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18l5-5 5 5"/><path d="M7 11l5-5 5 5"/></svg>',
    LSR: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>'
  };
  var ORDER = ["SAG","TOPES","HSC","LSC","HSR","LSR"];
  var TITLE = { EQUIL:"EQUILIBRIO ADELANTE / ATRÁS", SAG:"SAG", TOPES:"TOPES", HSC:"COMPRESIÓN ALTA VELOCIDAD (HSC)", LSC:"COMPRESIÓN BAJA VELOCIDAD (LSC)", HSR:"REBOTE ALTA VELOCIDAD (HSR)", LSR:"REBOTE BAJA VELOCIDAD (LSR)" };
  /* El perfil (piloto + bici) define qué suspensiones hay y de qué tipo de resorte. Acá es un ejemplo. */
  var PERFIL = { H:"aire", S:"resorte" };
  var PLAIN = {
    SAG: "El SAG es cuánto se hunde la suspensión solo con tu peso, parado sobre la bici y con el equipo puesto. Se mide con el anillo (o-ring) que queda marcado en el tubo. Si el SAG es alto, el vástago entra demasiado en la cámara y queda poco recorrido útil: hay que subir la presión de aire. Si es muy bajo, la suspensión está dura: hay que bajarla.",
    TOPES: "Un tope es cuando la suspensión llega al final de su recorrido y no tiene más para dar. Uno de vez en cuando, en un golpe muy grande, es normal. Si pasa seguido, falta soporte. Se corrige igual que un SAG alto: subiendo la presión de aire, o agregando un token.",
    HSC: "Cuando la rueda pega fuerte en una piedra, una raíz o un salto, el vástago entra muy rápido y el aceite no alcanza a pasar por el agujerito. Entonces empuja unas láminas finitas, las laminillas, que se abren como una puerta y dejan pasar el aceite. Así se frena el golpe sin que la suspensión se hunda de golpe. “Alta” y “baja” velocidad hablan de lo rápido que se mueve el vástago de la suspensión, no de lo rápido que vas en la bici.",
    LSC: "Cuando te apoyás en una curva, frenás o pedaleás, la suspensión se mueve despacio. Ahí el aceite pasa solo por un agujerito que regula la aguja. Cerrar clicks achica el agujero: la suspensión se hunde menos y te da más apoyo. “Alta” y “baja” velocidad hablan de lo rápido que se mueve el vástago de la suspensión, no de lo rápido que vas en la bici.",
    HSR: "Después de un golpe, el resorte devuelve la suspensión rápido a su lugar y el aceite pasa en sentido contrario. Abre las laminillas de rebote, del otro lado del pistón. Si vuelve muy rápido, la rueda salta. Si vuelve muy lento, no llega a recuperarse antes del próximo golpe. “Alta” y “baja” velocidad hablan de lo rápido que se mueve el vástago de la suspensión, no de lo rápido que vas en la bici.",
    EQUIL: "Este semáforo mira si la bici trabaja pareja entre la rueda de adelante y la de atrás. Primero compara cuánto recorrido usa cada una mientras bajás: la trasera tiene que usar unos 10 puntos más que la delantera. Si la diferencia es otra, se corrige el SAG (presión de aire o precarga). Después compara cuánto tarda cada suspensión en recuperarse de un golpe: la de atrás nunca debería tardar más que la de adelante. Si tarda más, queda hundida y llega sin recorrido al próximo golpe: se abre el rebote del shock.",
    LSR: "Cuando la suspensión vuelve despacio a su lugar, el aceite pasa por un agujerito que regula la aguja de rebote. Las laminillas no se abren. Es el ajuste del rebote de todos los días: con más clicks cerrados, la suspensión vuelve más lenta. “Alta” y “baja” velocidad hablan de lo rápido que se mueve el vástago de la suspensión, no de lo rápido que vas en la bici."
  };
  function plainFor(k, S){
    var sp = PERFIL[S];
    if (k === "SAG") return sp === "aire"
      ? PLAIN.SAG
      : "El SAG es cuánto se hunde la suspensión solo con tu peso, parado sobre la bici y con el equipo puesto. Se mide con el anillo (o-ring) que queda marcado. Si el SAG es alto, el resorte se comprime demasiado y queda poco recorrido útil: hay que aumentar la precarga. Si es muy bajo, hay que aflojarla. La precarga ajusta fino: si no alcanza, hay que cambiar el resorte por uno más duro o más blando.";
    if (k === "TOPES") return "Un tope es cuando la suspensión llega al final de su recorrido y no tiene más para dar. Uno de vez en cuando, en un golpe muy grande, es normal. Si pasa seguido: " + (sp === "aire"
      ? "si el SAG está alto, se corrige subiendo la presión de aire. Si el SAG ya está bien y sigue haciendo tope, hay que agregar un token."
      : "si el SAG está fuera de zona, se corrige primero con la precarga. Si el SAG ya está bien y sigue haciendo tope, hay que cambiar el resorte por uno de más lbs: subir la precarga no sirve porque cambia el SAG.");
    return PLAIN[k];
  }
  var SFI = window.SFIconos, pol = SFI.pol, f1 = SFI.f1, knobSVG = SFI.knobSVG, psiSVG = SFI.psiSVG, tokSVG = SFI.tokSVG, lbsSVG = SFI.lbsSVG, barSVG = SFI.barSVG;
  function fixItems(k, S){
    var sp = PERFIL[S];
    if (k === "SAG") return sp === "aire"
      ? [["psi","up","SUBIR PRESIÓN","de aire","El aire empuja más: el vástago queda más afuera de la cámara y hay más recorrido útil."], ["psi","down","BAJAR PRESIÓN","de aire","La suspensión se hunde más con tu peso."]]
      : [["knob","cw","MÁS PRECARGA","sentido horario","El resorte arranca más comprimido: la suspensión se hunde menos con tu peso."], ["knob","ccw","MENOS PRECARGA","sentido antihorario","La suspensión se hunde más con tu peso."], ["tok","","LA PRECARGA AJUSTA FINO","","Si no alcanza, hay que cambiar el resorte por uno más duro o más blando."]];
    if (k === "TOPES") return sp === "aire"
      ? [["psi","up","SUBIR PRESIÓN","de aire","Si el SAG está alto: es lo que corrige el SAG y evita el tope."], ["tokb","","AGREGAR TOKEN","el SAG está bien","Si el SAG está en zona y sigue haciendo tope: el token endurece el final del recorrido sin cambiar el SAG."]]
      : [["knob","cw","MÁS PRECARGA","sentido horario","Si el SAG está fuera de zona: se corrige primero con la precarga."], ["lbs","","RESORTE MÁS DURO","más lbs, no la precarga","Si el SAG está en zona y sigue haciendo tope: cambiar por un resorte de más lbs. Subir la precarga no sirve, cambia el SAG."]];
    if (k === "EQUIL") return [["knob","ccw","ABRIR REBOTE","rebote del shock","Pack down trasero: el shock se recupera más rápido y llega con recorrido al próximo golpe."], ["knob","cw","CERRAR REBOTE","rebote del shock","Si la trasera recupera mucho antes que la delantera, la bici rebota de atrás."], ["psi","up","SUBIR PRESIÓN","o más precarga","Si la trasera usa demasiado recorrido comparada con la delantera: más soporte atrás."], ["psi","down","BAJAR PRESIÓN","o menos precarga","Si usa muy poco recorrido comparada con la delantera."]];
    var close = { HSC:"El circuito rápido frena más: los golpes fuertes encuentran más resistencia.", LSC:"Más apoyo: la suspensión se hunde menos al pedalear, en curvas y frenadas.", HSR:"Después de un golpe fuerte la suspensión vuelve más lento.", LSR:"Vuelve más lento en los movimientos suaves." };
    var open = { HSC:"El circuito rápido frena menos.", LSC:"Más suave: sigue mejor el terreno.", HSR:"Vuelve más rápido.", LSR:"Vuelve más rápido." };
    return [["knob","cw","CERRAR 1 CLICK","sentido horario",close[k]], ["knob","ccw","ABRIR 1 CLICK","sentido antihorario",open[k]]];
  }
  function fixHTML(k, S){
    return fixItems(k, S).map(function(f){
      var g = f[0], svg;
      if (g === "tok") svg = '<b>'+f[2]+'</b>';
      else svg = '<svg class="ind" viewBox="0 0 190 48" aria-hidden="true">' + (g === "psi" ? psiSVG(f[1], f[2], f[3], "var(--oro)") : g === "knob" ? knobSVG(f[1], 1, f[2], f[3], "var(--oro)") : g === "tokb" ? tokSVG(f[2], f[3], "var(--oro)") : lbsSVG(f[2], f[3], "var(--oro)")) + '</svg>';
      return '<div class="fx">'+svg+'<p>'+f[4]+'</p></div>';
    }).join("");
  }
  var popK = null;
  function popupText(){
    var S = comp === "shock" ? "S" : "H";
    $("plainTxt").textContent = plainFor(popK, S); $("fixBox").innerHTML = fixHTML(popK, S); $("barEx").innerHTML = barSVG(.45);
    $("barTxt").textContent = "En el semáforo, el centro es el valor recomendado. Cuanto más lejos del centro está el punto, más fuera de zona está la medición. Abajo ves qué hacer para volver al centro.";
    $("fxNote").hidden = !/^(HSC|LSC|HSR|LSR|EQUIL)$/.test(popK);
    $("safeNote").hidden = !/^(TOPES|EQUIL)$/.test(popK);
    $("fxNote").textContent = "Se cambia de a un click, desde la posición cerrada hacia la abierta. Si la medición está muy lejos del centro, hacia los extremos de la barra, se cambian dos. No hay una cantidad de clicks que sirva para todos los modelos: depende de la marca y del año.";
  }

  // EQUILIBRIO: bici de costado con la cinemática de un cuadro de descenso de cuadrilátero (coordenadas medidas
  // sobre el dibujo del cuadro, en px). El rebote es lo único que cambia entre la delantera y la trasera.
  //   Pm: pivote del tirante inferior en el cuadro   R: pivote del balancín en el cuadro   SL: ojal inferior del shock
  //   D: unión tirante inferior / tirante superior   S: unión tirante superior / balancín   T: ojal superior del shock (en el balancín)
  //   A: eje de la rueda, solidario al tirante superior
  var K = { PM:[487,552], D0:[135,613], S0:[368,398], R0:[475,413], T0:[520,360], SL:[527,572], A0:[92,588], C0:[958,142], XF:1205, YA:588, WR:307, MX:650 };
  var EQT = 7, EQ_G = K.YA + K.WR, EQ_V = 700, EQ_HIT = [.5, 1.45, 2.4], EQ_BH = 80, EQ_BW = 110;
  var eqSeries = null, eqKey = "", eqTab = null;
  function kd(a, b){ return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function kRot(p, o, a){ var c = Math.cos(a), s = Math.sin(a); return [o[0] + (p[0] - o[0])*c - (p[1] - o[1])*s, o[1] + (p[0] - o[0])*s + (p[1] - o[1])*c]; }
  function kSolve(th){
    var L1 = kd(K.PM, K.D0), L2 = kd(K.D0, K.S0), L3 = kd(K.S0, K.R0);
    var D = kRot(K.D0, K.PM, th), dd = kd(D, K.R0), aa = (L2*L2 - L3*L3 + dd*dd)/(2*dd), h2 = L2*L2 - aa*aa;
    if (h2 < 0) return null;
    var h = Math.sqrt(h2), ux = (K.R0[0] - D[0])/dd, uy = (K.R0[1] - D[1])/dd, mx = D[0] + aa*ux, my = D[1] + aa*uy;
    var c1 = [mx + h*uy, my - h*ux], c2 = [mx - h*uy, my + h*ux], S = kd(c1, K.S0) < kd(c2, K.S0) ? c1 : c2;
    var ph = Math.atan2(S[1] - D[1], S[0] - D[0]) - Math.atan2(K.S0[1] - K.D0[1], K.S0[0] - K.D0[0]);
    var ps = Math.atan2(S[1] - K.R0[1], S[0] - K.R0[0]) - Math.atan2(K.S0[1] - K.R0[1], K.S0[0] - K.R0[0]);
    var A = kRot([D[0] + (K.A0[0] - K.D0[0]), D[1] + (K.A0[1] - K.D0[1])], D, ph), T = kRot(K.T0, K.R0, ps);
    return { rise: K.A0[1] - A[1], D: D, S: S, A: A, T: T, ph: ph };
  }
  function kTable(){
    if (eqTab) return eqTab;
    eqTab = []; for (var n = -14; n <= 56; n++){ var r = kSolve(n*.01); if (r) eqTab.push(r); }
    return eqTab;
  }
  function kAt(rise){
    var t = kTable(), i = 0;
    while (i < t.length - 2 && t[i + 1].rise < rise) i++;
    var a = t[i], b = t[i + 1], u = Math.max(-.2, Math.min(1.2, (rise - a.rise)/((b.rise - a.rise) || 1)));
    var lp = function(p, q){ return [p[0] + (q[0] - p[0])*u, p[1] + (q[1] - p[1])*u]; };
    return { D: lp(a.D, b.D), S: lp(a.S, b.S), A: lp(a.A, b.A), T: lp(a.T, b.T) };
  }
  function eqWheelH(x, t){
    var h = 0;
    EQ_HIT.forEach(function(th){ var u = (x - (K.XF + EQ_V*(th - t)))/EQ_BW; if (Math.abs(u) < 1) h += EQ_BH*.5*(1 + Math.cos(Math.PI*u)); });
    return h;
  }
  function eqSim(zr, xw){
    var k = 77, dtt = 1/240, N = Math.round(EQT*60), out = [], z = 0, v = 0, wPrev = 0, cc = 2*.5*Math.sqrt(k), cr = 2*zr*Math.sqrt(k);
    for (var i = 0; i < N; i++){
      for (var q = 0; q < 4; q++){
        var t = (i*4 + q)*dtt, w = eqWheelH(xw, t), wv = (w - wPrev)/dtt; wPrev = w;
        var rel = wv - v, c = w - z, a = k*c + (rel > 0 ? cc : cr)*rel;
        v += a*dtt; z += v*dtt;
      }
      out.push([z, wPrev]);
    }
    return out;
  }
  function eqBuild(){
    var rt = EQ.esc === "ok" ? 1 : EQ.ratio, key = EQ.esc + rt.toFixed(2);
    if (key === eqKey) return; eqKey = key;
    var zF = .75, zR = Math.max(.3, Math.min(1.7, .75/rt));
    eqSeries = { f: eqSim(zF, K.XF), r: eqSim(zR, K.A0[0]), zeta: [zF, zR] };
    $("eqSpF").setAttribute("width", (280*Math.min(1, (.75/zF)/2.2)).toFixed(1));
    $("eqSpR").setAttribute("width", (280*Math.min(1, (.75/zR)/2.2)).toFixed(1));
    $("eqMsg").textContent = EQ.esc === "ok" ? "Ya ajustado: las dos suspensiones recuperan al mismo ritmo y la bici sigue pareja."
      : rt > 1.15 ? "Tu bajada: el shock vuelve más rápido que la horquilla. Se ve cómo la trasera rebota y levanta la bici de atrás."
      : rt < .85 ? "Tu bajada: el shock vuelve más lento que la horquilla. Con obstáculos seguidos no alcanza a recuperarse y se hunde cada vez más."
      : "Tu bajada: las dos suspensiones se recuperan parejo. Si el semáforo está fuera de zona, el desequilibrio es de recorrido (SAG): mirá la indicación de abajo.";
  }
  function eqTube(a, b, w){
    return '<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="var(--line)" stroke-width="'+(w + 5)+'" stroke-linecap="round"/>' +
           '<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="var(--bg,#070b0c)" stroke-width="'+w+'" stroke-linecap="round"/>';
  }
  function eqDraw(){
    var BG = "var(--bg,#070b0c)", LN = "var(--line)", MU = "var(--mute,#5e6b6a)", H = "";
    var pv = function(p){ return '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="13" fill="'+BG+'" stroke="'+LN+'" stroke-width="4"/><circle cx="'+p[0]+'" cy="'+p[1]+'" r="4" fill="'+LN+'"/>'; };
    H += '<line x1="-200" y1="'+EQ_G+'" x2="1520" y2="'+EQ_G+'" stroke="'+MU+'" stroke-width="2.4"/>';
    EQ_HIT.forEach(function(th, j){ H += '<path id="eqB'+j+'" d="M-'+EQ_BW+' 0 Q-'+(EQ_BW/2)+' 0 0 -'+EQ_BH+' Q'+(EQ_BW/2)+' 0 '+EQ_BW+' 0Z" fill="rgba(159,176,179,.14)" stroke="'+LN+'" stroke-width="2.4"/>'; });
    [["R"], ["F"]].forEach(function(u){
      var sp = ""; for (var a = 0; a < 8; a++) sp += '<line x1="0" y1="-'+(K.WR - 18)+'" x2="0" y2="'+(K.WR - 18)+'" transform="rotate('+(a*22.5)+')" stroke="'+MU+'" stroke-width="1.6"/>';
      H += '<g id="eqW'+u[0]+'"><circle r="'+K.WR+'" fill="none" stroke="'+LN+'" stroke-width="7"/><circle r="'+(K.WR - 24)+'" fill="none" stroke="'+MU+'" stroke-width="2"/><g id="eqS'+u[0]+'">'+sp+'</g><circle r="16" fill="'+BG+'" stroke="'+LN+'" stroke-width="4"/></g>';
    });
    // cuadro delantero: se mueve y se inclina como un solo cuerpo
    H += '<g id="eqBody">' +
      eqTube([895, 140], [545, 600], 54) + eqTube([885, 92], [468, 335], 36) + eqTube([454, 340], [472, 548], 34) +
      '<rect x="424" y="296" width="40" height="62" rx="9" fill="'+BG+'" stroke="'+LN+'" stroke-width="4"/><line x1="444" y1="312" x2="444" y2="340" stroke="'+LN+'" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M873 64L925 40L975 128L912 152Z" fill="'+BG+'" stroke="'+LN+'" stroke-width="5" stroke-linejoin="round"/>' +
      '<circle cx="512" cy="612" r="30" fill="'+BG+'" stroke="'+LN+'" stroke-width="5"/><circle cx="512" cy="612" r="9" fill="'+LN+'"/>' +
      '<path d="M880 62L868 20L836 14M868 20L905 14" fill="none" stroke="'+LN+'" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M455 296L440 262H410" fill="none" stroke="'+LN+'" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
      pv(K.PM) + pv(K.R0) + '</g>';
    H += '<g id="eqRear"><path id="eqSsP" fill="'+LN+'" stroke="'+LN+'" stroke-width="40" stroke-linejoin="round"/><path id="eqSsB" fill="'+BG+'" stroke="'+BG+'" stroke-width="34" stroke-linejoin="round"/>' +
      '<g id="eqCs"></g><path id="eqRkP" fill="'+LN+'" stroke="'+LN+'" stroke-width="44" stroke-linejoin="round"/><path id="eqRkB" fill="'+BG+'" stroke="'+BG+'" stroke-width="38" stroke-linejoin="round"/><g id="eqPv"></g></g>';
    H += '<g id="eqFk"><line id="eqFkU" stroke="rgba(159,176,179,.55)" stroke-width="30" stroke-linecap="round"/><line id="eqFkL" stroke="'+LN+'" stroke-width="20" stroke-linecap="round"/></g>';
    H += '<g id="eqShk"></g>';
    H += '<text x="'+K.A0[0]+'" y="236" text-anchor="middle" font-size="27" font-weight="600" letter-spacing="3" fill="var(--oro)">TRASERA · SHOCK</text>' +
      '<text x="'+K.XF+'" y="236" text-anchor="middle" font-size="27" font-weight="600" letter-spacing="3" fill="var(--cian)">DELANTERA · HORQUILLA</text>' +
      '<path d="M330 80H560M538 64L560 80L538 96" fill="none" stroke="var(--dim,#8b9a98)" stroke-width="4"/><text x="445" y="56" text-anchor="middle" font-size="22" fill="var(--dim,#8b9a98)">sentido de marcha</text>' +
      '<path d="M1500 130H1360M1382 114L1360 130L1382 146" fill="none" stroke="var(--dim,#8b9a98)" stroke-width="4"/><text x="1430" y="106" text-anchor="middle" font-size="22" fill="var(--dim,#8b9a98)">obstáculos</text>';
    [["R", K.A0[0], "var(--oro)"], ["F", K.XF, "var(--cian)"]].forEach(function(u){
      H += '<text x="'+u[1]+'" y="962" text-anchor="middle" font-size="22" fill="var(--dim,#8b9a98)" letter-spacing="2">VELOCIDAD DE REBOTE</text>' +
        '<rect x="'+(u[1] - 140)+'" y="976" width="280" height="14" rx="6" fill="rgba(159,176,179,.18)"/><rect id="eqSp'+u[0]+'" x="'+(u[1] - 140)+'" y="976" width="0" height="14" rx="6" fill="'+u[2]+'"/>';
    });
    $("eqU0").innerHTML = H;
  }
  function updateEq(tt){
    if (!$("eqBody")) eqDraw();
    eqBuild();
    var t = ((tt % EQT) + EQT) % EQT, i = Math.max(0, Math.min(eqSeries.f.length - 1, Math.floor(t*60))), f = eqSeries.f[i], r = eqSeries.r[i];
    var zf = f[0], zr = r[0], zm = (zf + zr)/2, a = -Math.atan2(zf - zr, K.XF - K.A0[0]), ca = Math.cos(a), sa = Math.sin(a), MY = K.YA;
    var W = function(p){ var dx = p[0] - K.MX, dy = p[1] - MY; return [K.MX + dx*ca - dy*sa, MY + dx*sa + dy*ca - zm]; };
    $("eqBody").setAttribute("transform", "translate(0 " + (-zm).toFixed(2) + ") rotate(" + (a*180/Math.PI).toFixed(3) + " " + K.MX + " " + MY + ")");
    var kin = kAt(r[1] - r[0]), P = function(p){ var q = W(p); return q[0].toFixed(1) + " " + q[1].toFixed(1); };
    var wr = W(kin.A), wf = [K.XF, K.YA - f[1]], rot = (t*EQ_V/K.WR*180/Math.PI).toFixed(1);
    $("eqWR").setAttribute("transform", "translate(" + wr[0].toFixed(1) + " " + wr[1].toFixed(1) + ")");
    $("eqWF").setAttribute("transform", "translate(" + wf[0] + " " + wf[1].toFixed(1) + ")");
    $("eqSR").setAttribute("transform", "rotate(" + rot + ")"); $("eqSF").setAttribute("transform", "rotate(" + rot + ")");
    // tirante inferior, tirante superior, balancín
    var tri = "M" + P(kin.S) + "L" + P(kin.A) + "L" + P(kin.D) + "Z";
    $("eqSsP").setAttribute("d", tri); $("eqSsB").setAttribute("d", tri);
    var rk = "M" + P(kin.S) + "L" + P(K.R0) + "L" + P(kin.T) + "Z";
    $("eqRkP").setAttribute("d", rk); $("eqRkB").setAttribute("d", rk);
    var BG = "var(--bg,#070b0c)", LN = "var(--line)", Dw = W(kin.D), Pw = W(K.PM);
    $("eqCs").innerHTML = eqTube(Pw, Dw, 40);
    var pv = function(p){ var q = W(p); return '<circle cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="13" fill="'+BG+'" stroke="'+LN+'" stroke-width="4"/><circle cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="4" fill="'+LN+'"/>'; };
    $("eqPv").innerHTML = pv(kin.D) + pv(kin.S) + pv(K.R0) + pv(kin.A);
    // horquilla
    var C = W(K.C0), set = function(id, p, q){ var e = $(id); e.setAttribute("x1", p[0].toFixed(1)); e.setAttribute("y1", p[1].toFixed(1)); e.setAttribute("x2", q[0].toFixed(1)); e.setAttribute("y2", q[1].toFixed(1)); };
    var along = function(p, q, d){ var L = kd(p, q) || 1; return [p[0] + (q[0] - p[0])*d/L, p[1] + (q[1] - p[1])*d/L]; };
    set("eqFkU", C, along(C, wf, 290)); set("eqFkL", wf, along(wf, C, 300));
    // shock: del balancín (arriba) al cuadro (abajo)
    var Tw = W(kin.T), Sw = W(K.SL), L = kd(Tw, Sw), ux = (Sw[0] - Tw[0])/L, uy = (Sw[1] - Tw[1])/L, coil = PERFIL.S === "resorte", bw = coil ? 34 : 62, bl = coil ? 100 : 130;
    var e1 = [Tw[0] + ux*bl, Tw[1] + uy*bl], sh = eqTube(Tw, e1, bw) + '<line x1="'+e1[0].toFixed(1)+'" y1="'+e1[1].toFixed(1)+'" x2="'+Sw[0].toFixed(1)+'" y2="'+Sw[1].toFixed(1)+'" stroke="'+LN+'" stroke-width="18" stroke-linecap="round"/>';
    if (coil){
      var d = "M" + (Tw[0] + ux*24).toFixed(1) + " " + (Tw[1] + uy*24).toFixed(1), n = 11, len = L - 48;
      for (var q = 1; q <= n; q++){ var s0 = 24 + len*q/n, sg = q % 2 ? 1 : -1; d += "L" + (Tw[0] + ux*s0 - uy*26*sg).toFixed(1) + " " + (Tw[1] + uy*s0 + ux*26*sg).toFixed(1); }
      sh += '<path d="'+d+'" fill="none" stroke="var(--oro)" stroke-width="5" stroke-linejoin="round"/>';
    } else {
      sh += '<line x1="'+(Tw[0] + ux*8).toFixed(1)+'" y1="'+(Tw[1] + uy*8).toFixed(1)+'" x2="'+(e1[0] - ux*8).toFixed(1)+'" y2="'+(e1[1] - uy*8).toFixed(1)+'" stroke="var(--oro)" stroke-width="5" stroke-linecap="round" opacity=".85"/>';
    }
    sh += pv(kin.T) + pv(K.SL);
    $("eqShk").innerHTML = sh;
    EQ_HIT.forEach(function(th, j){ $("eqB"+j).setAttribute("transform", "translate(" + (K.XF + EQ_V*(th - t)).toFixed(1) + " " + EQ_G + ")"); });
  }
  document.querySelectorAll("#eqseg button").forEach(function(b){
    b.addEventListener("click", function(){
      EQ.esc = b.dataset.e; phase = 0;
      document.querySelectorAll("#eqseg button").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      if (mode === "EQUIL") updateEq(0);
    });
  });

  var opener = null;
  $("pCtl").appendChild($("compseg"));
  var EQ = { ratio: 1.7, esc: "hoy" };
  function openPopup(k, S, from){
    if (k === "EQUIL"){ S = "S"; }
    mode = k; comp = S === "S" ? "shock" : "fork"; spring = PERFIL[S === "S" ? "S" : "H"]; popK = k; popup = true; view = "ctx"; phase = 0; opener = from || null;
    $("pIc").innerHTML = ICON[k]; $("pT").textContent = TITLE[k];
    $("techTxt").textContent = MODES[k].app; $("topCount").hidden = k !== "TOPES"; popupText();
    buildSag(); applyMode();
    $("compseg").hidden = k === "EQUIL";
    $("ov").hidden = false; $("pX").focus();
  }
  function closePopup(){ try { parent.postMessage({ sf: "cerrar" }, location.origin); } catch (e) {} }
  $("pX").addEventListener("click", closePopup);
  $("ov").addEventListener("click", function(e){ if (e.target === $("ov")) closePopup(); });
  document.addEventListener("keydown", function(e){
    if (!popup) return;
    if (e.key === "Escape") closePopup();
    if (e.key === "Tab"){ var f = Array.prototype.slice.call($("mod").querySelectorAll("button, summary")).filter(function(x){ return x.offsetParent !== null; }), i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0){ e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1){ e.preventDefault(); f[0].focus(); } }
  });
  var hp = (location.hash || "").replace("#", "").split("-");
  if (hp[2] === "aire" || hp[2] === "resorte") PERFIL.H = hp[2];
  if (hp[3] === "aire" || hp[3] === "resorte") PERFIL.S = hp[3];
  applyMode();
  if (hp[4] && +hp[4] > 0) EQ.ratio = Math.max(.3, Math.min(3, +hp[4]));
  if (TITLE[hp[0]]){ openPopup(hp[0], hp[1] === "S" ? "S" : "H", null); }
  if (/^t[0-9.]+$/.test(hp[5] || "")){ phase = +hp[5].slice(1); running = false; frame(performance.now()); }
  requestAnimationFrame(loop);
})();
