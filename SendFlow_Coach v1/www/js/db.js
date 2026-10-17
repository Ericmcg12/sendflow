// ============================================================================
// db.js — Base local de SendFlow Coach (IndexedDB "sendflow_coach").
// Todo queda en el dispositivo: pilotos, análisis, videos y grabaciones de
// voz. No depende de SendFlow ni de internet.
//
// Stores:
//   pilotos     {id, nombre, disciplina, nivel, bici, categoria, color, notas, creado}
//   analisis    {id, pilotoId, titulo, fecha, pista, videoId, duracion, ancho, alto,
//                miniatura, recorte:{ini,fin}, anotaciones[], etiquetas[],
//                notas:{fortalezas, mejorar, observaciones}, sender|null, creado, editado}
//   videos      {id, blob, nombre, tipo}
//   grabaciones {id, analisisId, blob, tipo, duracion, creado}
// ============================================================================
(function () {
  "use strict";
  const NOMBRE = "sendflow_coach";
  const VERSION = 1;
  let conexion = null;

  function abrir() {
    if (conexion) return Promise.resolve(conexion);
    return new Promise((ok, mal) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("pilotos")) db.createObjectStore("pilotos", { keyPath: "id" });
        if (!db.objectStoreNames.contains("analisis")) {
          const s = db.createObjectStore("analisis", { keyPath: "id" });
          s.createIndex("pilotoId", "pilotoId");
        }
        if (!db.objectStoreNames.contains("videos")) db.createObjectStore("videos", { keyPath: "id" });
        if (!db.objectStoreNames.contains("grabaciones")) {
          const s = db.createObjectStore("grabaciones", { keyPath: "id" });
          s.createIndex("analisisId", "analisisId");
        }
      };
      req.onsuccess = () => { conexion = req.result; ok(conexion); };
      req.onerror = () => mal(req.error);
    });
  }

  function tx(store, modo, fn) {
    return abrir().then(db => new Promise((ok, mal) => {
      const t = db.transaction(store, modo);
      const s = t.objectStore(store);
      let res;
      const r = fn(s);
      if (r && "onsuccess" in r) r.onsuccess = () => { res = r.result; };
      t.oncomplete = () => ok(res);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error || new Error("operación cancelada"));
    }));
  }

  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  const DB = {
    nuevoId,
    poner: (store, obj) => tx(store, "readwrite", s => s.put(obj)).then(() => obj),
    traer: (store, id) => tx(store, "readonly", s => s.get(id)),
    todos: (store) => tx(store, "readonly", s => s.getAll()),
    borrar: (store, id) => tx(store, "readwrite", s => s.delete(id)),
    porIndice: (store, indice, valor) => tx(store, "readonly", s => s.index(indice).getAll(valor)),

    async borrarAnalisis(id) {
      const a = await DB.traer("analisis", id);
      if (!a) return;
      const grabs = await DB.porIndice("grabaciones", "analisisId", id);
      for (const g of grabs) await DB.borrar("grabaciones", g.id);
      if (a.videoId) await DB.borrar("videos", a.videoId);
      await DB.borrar("analisis", id);
    },
    async borrarPiloto(id) {
      const lista = await DB.porIndice("analisis", "pilotoId", id);
      for (const a of lista) await DB.borrarAnalisis(a.id);
      await DB.borrar("pilotos", id);
    },
    // Pide al navegador que no borre la base si se queda sin espacio
    async pedirPersistencia() {
      try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
      return false;
    }
  };
  window.DB = DB;
})();
