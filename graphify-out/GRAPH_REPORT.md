# Graph Report - web  (2026-10-15)

## Corpus Check
- 37 files · ~187,962 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: .css 5, (none) 3, .webmanifest 2)

## Summary
- 1044 nodes · 2648 edges · 70 communities (54 shown, 16 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 208 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- estudio.js
- prepararCanvas
- nube-core.js
- SendFlow_Bike_Web/js/app.js
- SendFlow_Coach_Web/js/app.js
- analizarComportamiento
- abrirDB
- leerEnVivo
- enviar-profe.js
- construirTablaSectores
- redibujarTodo
- ejecutarAnalisis
- descargarYRegistrarMapaOffline
- dibujarVideoGraficos
- analisis/js/app.js
- datos-pista.js
- cargarCrudo
- SendFlow — sitio base (`sendflow.bike`)
- nube-ui.js
- analisis/js/formato-sfb.js
- SendFlow_Coach_Web/js/formato-sfb.js
- admin.js
- cabeceraTarjetaEventos
- api.js
- calcularAnalisisIndependiente
- comparar.js
- planes.js
- sender.js
- ui.js
- analisis/js/gopro-gpmf.js
- SendFlow_Coach_Web/js/gopro-gpmf.js
- analizarTmd
- detectarCurvas
- postura.js
- abrirComparacion
- aplicarLeverage
- ref_fs
- compresor.js
- db.js
- ref_path
- abrirModalCarpeta
- escribirPerfilCompleto
- sendflow.js
- dibujarPerfil3d
- construirResumenEquipoYPista
- guardarBajadaEnDB
- buscarIndiceTiempoEn
- saltosConfirmadosDeMuestras
- abrirModalDispositivo
- abrirRecorteFoto
- escribirCamposCalibracion
- minArr
- calcularParadasGradiente
- analizarPresionLado
- detectarEventosDeGolpe
- generarPistaSintetica
- calcularSagDinamico
- esperarVueltaParaRestaurarMapa
- evaluarBalanceRebote
- ref_crypto
- archivos.js
- biblioteca.js

## God Nodes (most connected - your core abstractions)
1. `ejecutarAnalisis()` - 84 edges
2. `prepararCanvas()` - 27 edges
3. `abrir()` - 27 edges
4. `refrescarPestana()` - 25 edges
5. `calcularAnalisisIndependiente()` - 24 edges
6. `SendFlow — sitio base (`sendflow.bike`)` - 23 edges
7. `dibujarLinea()` - 22 edges
8. `areaGrafico()` - 21 edges
9. `dibujarEjeY()` - 21 edges
10. `dibujarEjeXNumerico()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Mapa en la web` --references--> `autoSeleccionarMapaOffline()`  [INFERRED]
  SendFlow_Bike_Web/LEEME.md → SendFlow_Bike_Web/analisis/js/app.js
- `pedirClave()` --indirect_call--> `claveMapas()`  [INFERRED]
  SendFlow_Coach_Web/js/datos-pista.js → SendFlow_Bike_Web/analisis/js/nube-core.js
- `SendFlow Bike Web — nube (bajadas y perfiles)` --references--> `bajadas()`  [INFERRED]
  SendFlow_Bike_Web/LEEME.md → SendFlow_Bike_Web/analisis/js/modo-web-pre.js
- `abrir()` --indirect_call--> `esc()`  [INFERRED]
  SendFlow_Bike_Web/analisis/js/nube-ui.js → SendFlow_Bike_Web/analisis/js/enviar-profe.js
- `pintarHub()` --indirect_call--> `sb()`  [INFERRED]
  SendFlow_Bike_Web/js/app.js → SendFlow_Bike_Web/analisis/js/nube-core.js

## Import Cycles
- None detected.

## Communities (70 total, 16 thin omitted)

### Community 0 - "estudio.js"
Cohesion: 0.07
Nodes (95): abrir(), abrirHojaEtiquetas(), abrirPestana(), activarHerr(), actualizarHud(), actualizarPlay(), actualizarRec(), agregarAnotacion() (+87 more)

### Community 1 - "prepararCanvas"
Cohesion: 0.11
Nodes (70): accHActual(), accSActual(), analizarVibracionFatiga(), areaGrafico(), calcularDeltaBadge(), calcularRegresionLineal(), calificarCorrelacion(), colorRgba() (+62 more)

### Community 2 - "nube-core.js"
Cohesion: 0.09
Nodes (40): abrirDB(), aColumnas(), ajustesLocales(), bajadaLocal(), bajadasLocales(), bajadasNube(), bajarBajada(), borrarBajadaNube() (+32 more)

### Community 3 - "SendFlow_Bike_Web/js/app.js"
Cohesion: 0.10
Nodes (37): abrirConversacion(), abrirMensajes(), abrirPerfil(), actualizarInsigniaMensajes(), alertaBreve(), cargarBandeja(), cargarHub(), cargarInvitaciones() (+29 more)

### Community 4 - "SendFlow_Coach_Web/js/app.js"
Cohesion: 0.12
Nodes (48): actualizarAvisos(), actualizarInsignia(), animarHero(), arrancar(), barraPilotos(), barrasCategorias(), barraTipos(), cargarCoach() (+40 more)

### Community 5 - "analizarComportamiento"
Cohesion: 0.29
Nodes (7): analizarComportamiento(), avisoEndurecer(), avisoNivel(), evaluarBottomOut(), evaluarLSC(), evaluarRebote(), calcularPerfilTune()

### Community 6 - "abrirDB"
Cohesion: 0.08
Nodes (42): abrirDB(), actualizarIndiceCortes(), aplicarCalibracionReparto(), asegurarHistorialSetup(), borrarTilesDeMapa(), bytesABase64(), columnasAMuestras(), comprimirGzip() (+34 more)

### Community 7 - "leerEnVivo"
Cohesion: 0.08
Nodes (39): abrirSagVivo(), analizarReparto(), calibrarAreasReparto(), cargarListaArchivosLogger(), cargasRuedas(), comandoDispositivo(), configSagVivo(), confirmarModal() (+31 more)

### Community 8 - "enviar-profe.js"
Cohesion: 0.12
Nodes (24): abrir(), cerrar(), esc(), bajadaActual(), claveSubida(), el(), enviar(), crearEnvio() (+16 more)

### Community 9 - "construirTablaSectores"
Cohesion: 0.18
Nodes (22): actualizarBotonMarcarCortes(), actualizarBotonToggleCapa(), actualizarMapaTrackML(), actualizarSelectorTramo(), agregarCorteEnPunto(), agregarPinMarcadorAlMapa(), buscarCortesSugeridos(), calcularBajadaIdeal() (+14 more)

### Community 10 - "redibujarTodo"
Cohesion: 0.10
Nodes (23): actualizarBotonToggleCanal(), actualizarLeyendaGraficoDinamica(), actualizarLeyendaGraficoGrande(), actualizarToggleMapa(), actualizarVisibilidadPersistentes(), aplicarCambioModoDatos(), aplicarFusionSemaforos(), cambiarZoom() (+15 more)

### Community 11 - "ejecutarAnalisis"
Cohesion: 0.08
Nodes (25): actualizarTituloPestanaMovil(), anotarAterrizajePorSalto(), anotarDetalleSaltos(), anotarImpactoPorGolpe(), calcularDerivadaRobustaAActualizacionLenta(), calcularDesviacionMovil(), calcularDistanciaTotal(), calcularGeometriaDinamica() (+17 more)

### Community 12 - "descargarYRegistrarMapaOffline"
Cohesion: 0.14
Nodes (24): abrirModalMapaOffline(), actualizarEstimacionDescarga(), actualizarSelectorMapasOffline(), autoSeleccionarMapaOffline(), calcularBboxDesdeCentro(), calcularPiramideTiles(), calcularTilesParaBbox(), claveTile() (+16 more)

### Community 13 - "dibujarVideoGraficos"
Cohesion: 0.17
Nodes (23): abrirVideo(), actualizarEstadoVideo(), bucleVideo(), calcularEventosDeVideo(), construirClipsVideo(), controlarFinDeClip(), dibujarHud(), dibujarHudPantalla() (+15 more)

### Community 14 - "analisis/js/app.js"
Cohesion: 0.06
Nodes (10): calcularDensidadEventosEnTrack(), calcularHistograma(), calcularHistogramaConteo(), calcularTravelBudget(), dibujarDistPosicionDinamica(), dibujarDistVelocidadDinamica(), leerPerfilCompleto(), pendientesAterrizaje() (+2 more)

### Community 15 - "datos-pista.js"
Cohesion: 0.12
Nodes (11): agregar(), cargarLib(), comprimir(), detectarCurvas(), hexRgb(), Mapa(), Mapa3D(), maxEn() (+3 more)

### Community 16 - "cargarCrudo"
Cohesion: 0.15
Nodes (18): abrirModalWifi(), activarSelectorHistorial(), actualizarInfoRango(), actualizarSelectorPerfilesBT(), actualizarSelectorPerfilesComo(), bdDisponible(), cargarBajadaSFB(), cargarCrudo() (+10 more)

### Community 17 - "SendFlow — sitio base (`sendflow.bike`)"
Cohesion: 0.07
Nodes (39): abrirDestino(), abrirPropia(), abrirVieja(), borrarVieja(), contar(), copiar(), bajadas(), cuandoAbra() (+31 more)

### Community 18 - "nube-ui.js"
Cohesion: 0.37
Nodes (17): abrir(), aviso(), btn(), cerrar(), dibujar(), el(), fechaTxt(), importarEnWeb() (+9 more)

### Community 19 - "analisis/js/formato-sfb.js"
Cohesion: 0.21
Nodes (7): bmp280Compensar(), crc16(), EscritorSFB, leerCrudo(), leerSFB(), nmeaCoord(), nmeaValida()

### Community 20 - "SendFlow_Coach_Web/js/formato-sfb.js"
Cohesion: 0.21
Nodes (7): bmp280Compensar(), crc16(), EscritorSFB, leerCrudo(), leerSFB(), nmeaCoord(), nmeaValida()

### Community 21 - "admin.js"
Cohesion: 0.27
Nodes (12): arrancar(), aviso(), bloquear(), casilla(), cerrarSesion(), el(), fecha(), llamar() (+4 more)

### Community 22 - "cabeceraTarjetaEventos"
Cohesion: 0.18
Nodes (17): activarTarjetasEvento(), actualizarLecturaScrubber(), cabeceraTarjetaEventos(), construirGeometria(), construirRecuperacion(), construirReparto(), construirTablaCurvas(), construirTablaFrenadas() (+9 more)

### Community 23 - "api.js"
Cohesion: 0.32
Nodes (11): cambiarClave(), funcion(), invitarSiCorresponde(), jwt(), login(), pedir(), registro(), rpc() (+3 more)

### Community 24 - "calcularAnalisisIndependiente"
Cohesion: 0.17
Nodes (13): analizarTemperaturaSuspension(), calcularAnalisisIndependiente(), calcularDerivadaYFiltrar(), calcularDistanciasAcumuladas(), calcularEstadisticasGolpes(), construirMascaraAire(), factorVerticalHorquilla(), filtrarFueraDelAire() (+5 more)

### Community 25 - "comparar.js"
Cohesion: 0.41
Nodes (11): abrir(), alternar(), bucle(), cerrar(), elegir(), modo(), paso(), pausar() (+3 more)

### Community 26 - "planes.js"
Cohesion: 0.37
Nodes (13): actividad(), editarPlan(), editarSesion(), fichas(), lista(), pintarFases(), pintarSemana(), rpc() (+5 more)

### Community 27 - "sender.js"
Cohesion: 0.30
Nodes (9): comprimir(), desdeMuestras(), desdePaquete(), detectarEventos(), leerArchivo(), leerBytes(), pasaAltos(), sincronizarConGoPro() (+1 more)

### Community 28 - "ui.js"
Cohesion: 0.23
Nodes (4): abrirModal(), animar(), aviso(), html()

### Community 29 - "analisis/js/gopro-gpmf.js"
Cohesion: 0.36
Nodes (10): buscarCajaRaiz(), fechaCreacion(), hijos(), lectorDeBlob(), lectorDeBytes(), leerGoPro(), leerValor(), pistaGPMF() (+2 more)

### Community 30 - "SendFlow_Coach_Web/js/gopro-gpmf.js"
Cohesion: 0.36
Nodes (10): buscarCajaRaiz(), fechaCreacion(), hijos(), lectorDeBlob(), lectorDeBytes(), leerGoPro(), leerValor(), pistaGPMF() (+2 more)

### Community 31 - "analizarTmd"
Cohesion: 0.12
Nodes (18): analizarTerreno(), analizarTmd(), claseTerreno(), construirTmd(), datosTmdPerfil(), desfaseSegunHora(), envolventeVibracion(), fftEnLugar() (+10 more)

### Community 32 - "detectarCurvas"
Cohesion: 0.31
Nodes (10): detectarCurvas(), detectarFrenadas(), difAngular(), indiceAntesDe(), indiceDespuesDe(), maxFinito(), medianaFinita(), minFinito() (+2 more)

### Community 33 - "postura.js"
Cohesion: 0.29
Nodes (8): ang3(), angulos(), caja(), cargar(), cargarScript(), crudo(), detectar(), enRecorte()

### Community 34 - "abrirComparacion"
Cohesion: 0.18
Nodes (11): abrirComparacion(), activarSelectorCortesComp(), actualizarLeyendaComparacion(), animarEntradaBienvenida(), animarEntradaPantalla(), animarEntradaTiles(), conCargando(), construirSectoresComparacion() (+3 more)

### Community 35 - "aplicarLeverage"
Cohesion: 0.22
Nodes (9): abrirModalLeverage(), calcularSagEnRueda(), aplicarLeverage(), filtrarGlitchesPosicion(), generarTablaLeverageDefault(), interpolarLeverageLineal(), pctSeriesDeRegistro(), renderizarTablaLeverageEditor() (+1 more)

### Community 37 - "compresor.js"
Cohesion: 0.60
Nodes (5): correr(), noLegible(), preparar(), revisar(), soportado()

### Community 40 - "abrirModalCarpeta"
Cohesion: 0.25
Nodes (8): abrirModalCarpeta(), actualizarEstadoCarpetaUI(), descargarCSV(), entregarArchivoAlUsuario(), entregarTextoComoArchivo(), escribirArchivoEnCarpeta(), fsaDisponible(), verificarPermisoCarpeta()

### Community 41 - "escribirPerfilCompleto"
Cohesion: 0.25
Nodes (8): abrirModalPerfil(), actualizarAvatarPerfil(), actualizarVisibilidadResortePF(), actualizarVisibilidadTmdPF(), escribirPerfilCompleto(), escribirSelectConNuevo(), poblarSelectConDB(), poblarTodosLosSelectsDeEquipo()

### Community 43 - "dibujarPerfil3d"
Cohesion: 0.29
Nodes (7): clonarSinIds(), construirReporteImprimible(), dibujarPerfil3d(), interpolarColorHex(), proyectarPerspectiva(), recortarAlDibujo(), rotarPunto3D()

### Community 44 - "construirResumenEquipoYPista"
Cohesion: 0.47
Nodes (6): abrirModalNotas(), bloqueInfoNotas(), construirResumenEquipoYPista(), resumenSuspensionNotas(), tituloResumenNotas(), valNotas()

### Community 45 - "guardarBajadaEnDB"
Cohesion: 0.33
Nodes (6): actualizarBajadaGuardadaAbierta(), cortesParaGuardar(), guardarBajadaEnDB(), guardarConfigConPerfil(), guardarMarcadoresActuales(), marcadoresParaGuardar()

### Community 46 - "buscarIndiceTiempoEn"
Cohesion: 0.40
Nodes (5): analizarRecuperacion(), buscarIndiceTiempoEn(), curvasAterrizaje(), detectarTopes(), golpesSinRebotesEnAire()

### Community 47 - "saltosConfirmadosDeMuestras"
Cohesion: 0.40
Nodes (5): confirmarSaltosConSuspension(), detectarSaltos(), haySeñalIMU(), saltosConfirmadosDeMuestras(), unirSaltosCercanos()

### Community 48 - "abrirModalDispositivo"
Cohesion: 0.50
Nodes (4): abrirModalDispositivo(), actualizarBotonToggleDispositivo(), configDispositivoPorDefecto(), renderizarMapeoCanales()

### Community 49 - "abrirRecorteFoto"
Cohesion: 0.50
Nodes (4): abrirRecorteFoto(), abrirSelectorFoto(), aplicarTransformRecorteFoto(), clampOffsetsRecorteFoto()

### Community 50 - "escribirCamposCalibracion"
Cohesion: 0.50
Nodes (4): actualizarEstadoLeverageUI(), actualizarNotaZonaMuerta(), actualizarVisibilidadDurezaResorte(), escribirCamposCalibracion()

### Community 51 - "minArr"
Cohesion: 0.50
Nodes (4): construirStats(), minArr(), proyectarLocal(), proyectarLocalConAltura()

### Community 52 - "calcularParadasGradiente"
Cohesion: 0.67
Nodes (3): actualizarCapaTrazaML(), calcularParadasGradiente(), colorEnEscala()

### Community 54 - "analizarPresionLado"
Cohesion: 0.67
Nodes (3): analizarPresion(), analizarPresionLado(), hayPresion()

### Community 55 - "detectarEventosDeGolpe"
Cohesion: 0.67
Nodes (3): calcularGananciaPerdida(), detectarEventosDeGolpe(), detectarPivots()

### Community 63 - "generarPistaSintetica"
Cohesion: 0.67
Nodes (3): generarPerfilRumbo(), generarPistaSintetica(), rumboEnTiempo()

### Community 189 - "archivos.js"
Cohesion: 0.39
Nodes (8): compartirVideo(), conversaciones(), detalle(), enviarPorMensaje(), pintar(), subir(), tarjeta(), ver()

### Community 190 - "biblioteca.js"
Cohesion: 0.36
Nodes (5): autoGuardar(), editarSesionTipo(), elegirEjercicios(), elegirSesion(), rpc()

## Knowledge Gaps
- **21 isolated node(s):** `Archivos`, `Probar en tu compu`, `1) Configurar Supabase (una vez)`, `2) Publicar gratis en Cloudflare Pages`, `3) Pendiente (próximos pasos)` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 129 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `btn()` connect `nube-ui.js` to `analisis/js/app.js`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `autoSeleccionarMapaOffline()` connect `descargarYRegistrarMapaOffline` to `construirTablaSectores`, `redibujarTodo`, `analisis/js/app.js`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `Mapa en la web` connect `descargarYRegistrarMapaOffline` to `SendFlow — sitio base (`sendflow.bike`)`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `abrir()` (e.g. with `estudio.js` and `alCambiarTamano()`) actually correct?**
  _`abrir()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `refrescarPestana()` (e.g. with `pestanaEtiquetas()` and `pestanaPostura()`) actually correct?**
  _`refrescarPestana()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Archivos`, `Probar en tu compu`, `1) Configurar Supabase (una vez)` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `estudio.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07390350877192982 - nodes in this community are weakly interconnected._