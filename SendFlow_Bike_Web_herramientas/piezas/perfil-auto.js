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
  if (!lista.length) return false;
  let guardado = null;
  try{ guardado = parseInt(localStorage.getItem("sf_perfil_activo"), 10); }catch(e){}
  let elegido = lista.find(p => p.id === guardado);
  if (!elegido) elegido = lista.slice().sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))[0];
  return sfSeleccionarPerfil(elegido.id, op);
}
