// (copia web) selección de perfil reutilizable; {sinConfig:true} no toca la configuración de una bajada ya abierta
async function sfSeleccionarPerfil(id, op){
  try{
    const perfil = await leerPerfilDB(id);
    if (!perfil) return false;
    if (!(op && op.sinConfig)) Object.assign(estado.config, extraerConfigDePerfilCompleto(perfil.datos));
    estado.perfilActivoId = id;
    estado.perfilActivoNombre = perfil.nombre;
    estado.perfilActivoNombreBase = perfil.nombreBase || perfil.nombre;
    estado.perfilActivoFoto = (perfil.datos && perfil.datos.foto) || null;
    estado.perfilActivoDatos = perfil.datos || null;
    estado.perfilActivoNubeId = perfil.nubeId || null;
    try{ localStorage.setItem("sf_perfil_activo", String(id)); }catch(e){}
    actualizarIndicadorPerfilActivoHome();
    return true;
  }catch(e){ console.error("No se pudo aplicar el perfil:", e); return false; }
}
// En /analisis ya no hay selector de perfil: se activa solo el último usado, o el más reciente de la cuenta.
async function sfAutoPerfil(op){
  if (estado.perfilActivoId != null && estado.perfilActivoDatos) return true;
  let lista = [];
  try{ lista = await listarPerfilesDB(); }catch(e){}
  const propios = lista.filter(p => p.nubePropio !== false);   // primero las bicis propias (un entrenador también recibe las de sus pilotos)
  if (propios.length) lista = propios;
  if (!lista.length) return false;
  let guardado = null;
  try{ guardado = parseInt(localStorage.getItem("sf_perfil_activo"), 10); }catch(e){}
  let elegido = lista.find(p => p.id === guardado);
  if (!elegido) elegido = lista.slice().sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))[0];
  return sfSeleccionarPerfil(elegido.id, op);
}
// Una bajada guardada (en este navegador, en la nube o en un .sfb) trae el perfil con el que se analizó: se vuelve a activar,
// así el mantenimiento sigue atado a esa bici. Entre dispositivos los ids locales cambian: se busca por el id de la cuenta.
async function sfPerfilDeConfig(cfg){
  if (!cfg) return false;
  let lista = [];
  try{ lista = await listarPerfilesDB(); }catch(e){}
  let p = null;
  if (cfg.perfilNubeId) p = lista.find(x => x.nubeId === cfg.perfilNubeId);
  else if (cfg.perfilId != null) p = lista.find(x => x.id === cfg.perfilId);
  if (!p && cfg.perfilNombre) p = lista.find(x => x.nombre === cfg.perfilNombre);
  return p ? sfSeleccionarPerfil(p.id, { sinConfig: true }) : false;
}
