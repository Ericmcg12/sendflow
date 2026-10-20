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
