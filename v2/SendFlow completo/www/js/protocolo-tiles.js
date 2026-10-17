// ============================================================================
// PROTOCOLO "offline://" - puente entre MapLibre y los tiles ya guardados
// en IndexedDB (ver descargarPiramideTiles / descargarPiramideDem en
// js/app.js).
//
// IMPORTANTE - por que esta funcion es 100% autosuficiente (no llama a
// leerTileDB() ni claveTile() de app.js, aunque hagan exactamente lo mismo):
// MapLibre no ejecuta esta funcion "tal cual" en el hilo principal - la
// convierte a texto y la reconstruye en OTRO contexto de JavaScript (el
// Worker que procesa los tiles). Ese contexto reconstruido NO tiene acceso
// a nada que estuviera fuera de la funcion en el momento de escribirla -
// ni a variables de app.js, ni siquiera a otras funciones de este mismo
// archivo declaradas afuera. Por eso todo (abrir la base, leer el tile)
// esta declarado ADENTRO de la funcion que sigue, usando unicamente
// `indexedDB`, que si es un global real disponible en cualquier contexto.
//
// Si en algun momento cambias el nombre/version de la base o el store de
// tiles en app.js, cambialo TAMBIEN aca abajo (son independientes a
// proposito, por la razon de arriba).
// ============================================================================
maplibregl.addProtocol("offline", async (params) => {
  const NOMBRE_DB = "telemetry_pimp_db";
  const VERSION_DB = 4;
  const STORE_TILES = "tiles";

  function abrirDBLocal(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE_DB, VERSION_DB);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains("bajadas")){
          const s = db.createObjectStore("bajadas", {keyPath:"id", autoIncrement:true});
          s.createIndex("fecha", "fecha", {unique:false});
        }
        if (!db.objectStoreNames.contains("perfiles")){
          const s = db.createObjectStore("perfiles", {keyPath:"id", autoIncrement:true});
          s.createIndex("nombre", "nombre", {unique:false});
        }
        if (!db.objectStoreNames.contains("ajustes")){
          db.createObjectStore("ajustes", {keyPath:"clave"});
        }
        if (!db.objectStoreNames.contains(STORE_TILES)){
          db.createObjectStore(STORE_TILES, {keyPath:"clave"});
        }
      };
      req.onsuccess = (ev) => resolve(ev.target.result);
      req.onerror = () => reject(req.error || new Error("no se pudo abrir la base local"));
    });
  }

  const partes = params.url.replace("offline://", "").split("/");
  const tipo = partes[0]; // "sat" o "dem"
  const mapaIdBase = partes[1];
  const z = partes[2], x = partes[3], y = partes[4];
  const mapaId = tipo === "dem" ? mapaIdBase + "_dem" : mapaIdBase;
  const clave = `${mapaId}/${z}/${x}/${y}`;

  const db = await abrirDBLocal();
  const blob = await new Promise((res, rej) => {
    const tx = db.transaction(STORE_TILES, "readonly");
    const req = tx.objectStore(STORE_TILES).get(clave);
    req.onsuccess = () => res(req.result ? req.result.blob : null);
    req.onerror = () => rej(req.error);
  });
  if (!blob){
    throw new Error(`tile offline no disponible: ${tipo}/${mapaIdBase}/${z}/${x}/${y}`);
  }
  const data = await blob.arrayBuffer();
  return { data };
});
