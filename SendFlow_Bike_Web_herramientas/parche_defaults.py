"""(20/10/2026) Parches de /analisis, idempotentes. Los llama aplicar_semaforos_popup.py.
1) Vista de datos por defecto = suspensión (antes rueda).
2) Perfil activo automático: en /analisis ya no hay selector de perfil, así que el perfil de la cuenta se activa solo
   (el último usado, o el más reciente) y Mantenimiento / presiones / etc. lo usan sin pedir nada."""
import os


def parchar_defaults(destino, aqui):
    ruta = os.path.join(destino, "js", "app.js")
    js = open(ruta, encoding="utf-8").read()

    def reemplazar(viejo, nuevo):
        nonlocal js
        if nuevo in js:
            return
        assert js.count(viejo) == 1, "app.js cambió: " + viejo[:70]
        js = js.replace(viejo, nuevo, 1)

    reemplazar('modoCanalSusp: "rueda", modoUnidadSusp', 'modoCanalSusp: "suspension", modoUnidadSusp')
    # los botones Rueda/Susp. se sincronizan al arrancar (antes solo cambiaban al tocarlos y quedaba marcado «Rueda»)
    reemplazar('$("btnModoRueda").addEventListener("click"', 'actualizarPanelModoDatos();\n$("btnModoRueda").addEventListener("click"')
    rh = os.path.join(destino, "index.html")
    h = open(rh, encoding="utf-8").read()
    vh1, vh2 = '<button class="btn-toggle activo" id="btnModoRueda"', '<button class="btn-toggle" id="btnModoSuspension"'
    if vh1 in h:
        assert vh2 in h, "index.html cambió: botones de modo"
        h = h.replace(vh1, '<button class="btn-toggle" id="btnModoRueda"', 1).replace(vh2, '<button class="btn-toggle activo" id="btnModoSuspension"', 1)
        open(rh, "w", encoding="utf-8").write(h)

    if "async function sfSeleccionarPerfil" not in js:
        ini = js.index('$("listaSeleccionarPerfil").addEventListener("click"')
        fin = js.index('$("btnCerrarSeleccionarPerfil")', ini)
        funciones = open(os.path.join(aqui, "perfil-auto.js"), encoding="utf-8").read()
        handler = ('$("listaSeleccionarPerfil").addEventListener("click", async (ev) => {\n'
                   '  const fila = ev.target.closest("[data-seleccionar-perfil]");\n'
                   '  if (!fila) return;\n'
                   '  if (await sfSeleccionarPerfil(parseInt(fila.dataset.seleccionarPerfil, 10))) $("modalSeleccionarPerfil").classList.add("oculto");\n'
                   '});\n')
        js = js[:ini] + funciones + handler + js[fin:]

    if "async function sfPerfilDeConfig" not in js:
        # corrida anterior: la versión vieja de perfil-auto.js ya estaba inyectada; se reemplaza el bloque completo
        i0 = js.index("// (copia web) selección de perfil reutilizable")
        i1 = js.index('$("listaSeleccionarPerfil").addEventListener("click"', i0)
        js = js[:i0] + open(os.path.join(aqui, "perfil-auto.js"), encoding="utf-8").read() + js[i1:]
    reemplazar('guardarConfigConPerfil(config){\n  const p = estado.perfilActivoDatos || {};\n  return Object.assign({}, config, { perfilId: estado.perfilActivoId ?? null, modeloSuspH',
               'guardarConfigConPerfil(config){\n  const p = estado.perfilActivoDatos || {};\n  return Object.assign({}, config, { perfilId: estado.perfilActivoId ?? null, perfilNubeId: estado.perfilActivoNubeId || null, perfilNombre: estado.perfilActivoNombre || "", modeloSuspH')
    # al abrir una bajada (guardada, .sfb, WiFi) se activa el perfil con el que se analizó
    reemplazar("      const registro = await leerBajadaDB(id);\n      if (!registro){ $(\"avisoGuardados\").textContent = \"No se encontró esa bajada.\"; return; }\n      conCargando(",
               "      const registro = await leerBajadaDB(id);\n      if (!registro){ $(\"avisoGuardados\").textContent = \"No se encontró esa bajada.\"; return; }\n      await sfPerfilDeConfig(registro.config);\n      conCargando(")
    reemplazar("  if (r.meta && r.meta.config) estado.config = Object.assign({}, estado.config, r.meta.config);\n",
               "  if (r.meta && r.meta.config) { estado.config = Object.assign({}, estado.config, r.meta.config); sfPerfilDeConfig(r.meta.config); }\n")
    # Recorte: el perfil elegido ahí es el de la bajada (y del mantenimiento); no hay «sin perfil»
    reemplazar('  if (!id){ estado.perfilActivoDatos = null; return; }\n  try{\n    const perfil = await leerPerfilDB(id);\n    if (!perfil) return;\n    estado.perfilActivoDatos = perfil.datos || null;\n',
               '  if (!id){ return; }\n  try{\n    const perfil = await leerPerfilDB(id);\n    if (!perfil) return;\n    await sfSeleccionarPerfil(id, { sinConfig: true });\n')
    reemplazar('    sel.innerHTML = `<option value="">— sin perfil, calibración manual —</option>` +\n      perfiles.map',
               '    sel.innerHTML = (idSelector === "rcSelectorPerfil" ? "" : `<option value="">— sin perfil, calibración manual —</option>`) +\n      perfiles.map')
    reemplazar('    if (perfiles.some(p => String(p.id) === valorActual)) sel.value = valorActual;\n  }catch(e){ /* el selector',
               '    if (perfiles.some(p => String(p.id) === valorActual)) sel.value = valorActual;\n    if (idSelector === "rcSelectorPerfil" && sel.value && String(estado.perfilActivoId) !== sel.value) await sfSeleccionarPerfil(parseInt(sel.value, 10), { sinConfig: true });\n  }catch(e){ /* el selector')
    reemplazar('guardarPerfilEnDB: guardarPerfilEnDB, eliminarPerfilDB: eliminarPerfilDB,',
               'guardarPerfilEnDB: guardarPerfilEnDB, eliminarPerfilDB: eliminarPerfilDB, autoSeleccionarPerfil: sfAutoPerfil,')
    viejo = '  if (estado.perfilActivoId == null || !estado.perfilActivoDatos){ caja.innerHTML = cab + `<div class="aviso">Elegí un perfil de piloto y bici'
    reemplazar(viejo, '  if (estado.perfilActivoId == null || !estado.perfilActivoDatos) await sfAutoPerfil({ sinConfig: true });\n' + viejo)
    open(ruta, "w", encoding="utf-8").write(js)

    rp = os.path.join(destino, "js", "perfiles-web.js")
    t = open(rp, encoding="utf-8").read()
    v = '          H.classList.add("sf-perfiles-cuenta");\n'
    if "autoSeleccionarPerfil" not in t:
        assert v in t, "perfiles-web.js cambió"
        open(rp, "w", encoding="utf-8").write(t.replace(v, v + '          if (a.autoSeleccionarPerfil) a.autoSeleccionarPerfil();\n', 1))

    # la nube de /analisis muestra solo las bajadas propias (la política de la base deja VER las de pilotos con permiso: no se listan)
    rn = os.path.join(destino, "js", "nube-core.js")
    n = open(rn, encoding="utf-8").read()
    viejo = ('    return usuario().then(function () {\n      return sb().from("bajadas").select("id,fecha,pista,duracion_s,tamano_bytes,notas,metadatos,archivo_clave,subida_en").order("fecha", { ascending: false });')
    nuevo = ('    return usuario().then(function (u) {\n      return sb().from("bajadas").select("id,fecha,pista,duracion_s,tamano_bytes,notas,metadatos,archivo_clave,subida_en").eq("dueno_id", u.id).order("fecha", { ascending: false });')
    if nuevo not in n:
        assert viejo in n, "nube-core.js cambió"
        open(rn, "w", encoding="utf-8").write(n.replace(viejo, nuevo, 1))

def parchar_peso_clima(destino):
    """(20/10/2026) El peso extra por barro/agua depende del clima y del estado de la pista (antes: +2,5 kg fijo con lluvia)."""
    ruta = os.path.join(destino, "js", "app.js")
    js = open(ruta, encoding="utf-8").read()
    if "pesoExtraClima" in js:
        return
    tabla = ('// Peso extra estimado (kg) de barro/agua encima, según clima + estado de la pista. Estimación, no una pesada real.\n'
             'const PESO_EXTRA_CLIMA = { lluvia: { humedo: 0.5, mojado: 1.5, barroso: 3.5 }, nieve: { humedo: 0.5, mojado: 1.5, barroso: 2.5 }, nublado: { mojado: 1, barroso: 1.5 } };\n'
             'function pesoExtraClima(clima, estadoPista){ return ((PESO_EXTRA_CLIMA[clima] || {})[estadoPista]) || 0; }\n')
    def rep(a, b):
        nonlocal js
        assert js.count(a) == 1, "app.js cambió: " + a[:70]
        js = js.replace(a, b, 1)
    rep("function analizarComportamiento(", tabla + "function analizarComportamiento(")
    rep('calcularPerfilTune((peso || 75) + (clima === "lluvia" ? 2.5 : 0), estilo, nivel, clima, tempAmbiente);', 'calcularPerfilTune((peso || 75) + pesoExtraClima(clima, estadoPista), estilo, nivel, clima, tempAmbiente);')
    rep("  const PESO_EXTRA_LLUVIA_KG = 2.5;\n  const pesoRef = (peso || 75) + (clima === \"lluvia\" ? PESO_EXTRA_LLUVIA_KG : 0);", "  const PESO_EXTRA_LLUVIA_KG = pesoExtraClima(clima, estadoPista);\n  const pesoRef = (peso || 75) + PESO_EXTRA_LLUVIA_KG;")
    rep('pesoExtraLluvia: (clima === "lluvia" ? PESO_EXTRA_LLUVIA_KG : 0),', "pesoExtraLluvia: PESO_EXTRA_LLUVIA_KG,")
    rep('calcularPerfilTune((cfg.peso || 75) + (cfg.clima === "lluvia" ? 2.5 : 0), cfg.estilo', 'calcularPerfilTune((cfg.peso || 75) + pesoExtraClima(cfg.clima, cfg.estadoPista), cfg.estilo')
    rep("kg estimados de barro/agua encima por la lluvia", "kg estimados de barro/agua encima por el clima y el estado de la pista")
    open(ruta, "w", encoding="utf-8").write(js)
