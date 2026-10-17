# Graph Report - web  (2026-10-14)

## Corpus Check
- 53 files · ~175,159 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: .css 5, (none) 3, .webmanifest 2)

## Summary
- 976 nodes · 2498 edges · 63 communities (51 shown, 12 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Estudio de video (Coach)
- Vibración y regresión
- Nube: núcleo de bajadas
- Bike: mensajes y perfil
- Coach: interfaz principal
- Recomendaciones TUNE
- Base local y mapas
- Análisis: interfaz principal
- Enviar al profe
- Mapa 3D y cortes
- Gráficos y leyendas
- Saltos e impactos
- Mapa offline
- Video sincronizado
- Nube: interfaz
- Importar del Sender
- Tarjetas de eventos
- Base local por cuenta
- Guardado y FFT
- Formato SFB (análisis)
- Formato SFB (Coach)
- Panel de admin
- API de Coach
- Temperatura y SAG
- Comparación de bajadas
- Comparar videos (Coach)
- Planes de entrenamiento
- Datos del Sender
- Utilidades UI de Coach
- GoPro GPMF (análisis)
- GoPro GPMF (Coach)
- Terreno y TMD
- Curvas y frenadas
- Carpetas y archivos
- Perfil de bici
- Avisos push
- Notas de bajada
- Compresor de video
- Base local de Coach
- SAG en rueda
- Recuperación y topes
- Saltos confirmados
- Isotipo SendFlow
- Config del dispositivo
- Leverage
- Foto de perfil
- Calibración (UI)
- Reparto de peso
- Estadísticas
- Presión de aire
- Pivotes y golpes
- Reporte imprimible
- Pista sintética
- Balance de rebote
- Perfil completo

## God Nodes (most connected - your core abstractions)
1. `ejecutarAnalisis()` - 84 edges
2. `prepararCanvas()` - 27 edges
3. `abrir()` - 26 edges
4. `calcularAnalisisIndependiente()` - 24 edges
5. `refrescarPestana()` - 22 edges
6. `areaGrafico()` - 21 edges
7. `dibujarEjeY()` - 21 edges
8. `dibujarEjeXNumerico()` - 21 edges
9. `abrirDB()` - 20 edges
10. `dibujarLinea()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `pedirClave()` --indirect_call--> `claveMapas()`  [INFERRED]
  SendFlow_Coach_Web/js/datos-pista.js → SendFlow_Bike_Web/analisis/js/nube-core.js
- `abrir()` --indirect_call--> `esc()`  [INFERRED]
  SendFlow_Bike_Web/analisis/js/nube-ui.js → SendFlow_Bike_Web/analisis/js/enviar-profe.js
- `pintarHub()` --indirect_call--> `sb()`  [INFERRED]
  SendFlow_Bike_Web/js/app.js → SendFlow_Bike_Web/analisis/js/nube-core.js
- `cerrar()` --indirect_call--> `fondo()`  [INFERRED]
  SendFlow_Bike_Web/analisis/js/enviar-profe.js → SendFlow_Bike_Web/analisis/js/modo-web.js

## Import Cycles
- None detected.

## Communities (63 total, 12 thin omitted)

### Community 0 - "Estudio de video (Coach)"
Cohesion: 0.09
Nodes (78): abrir(), abrirPestana(), actualizarHud(), actualizarPlay(), agregarAnotacion(), ajustarCanvas(), alCambiarTamano(), alternarPlay() (+70 more)

### Community 1 - "Vibración y regresión"
Cohesion: 0.11
Nodes (73): accHActual(), accSActual(), analizarVibracionFatiga(), areaGrafico(), calcularRegresionLineal(), calcularTravelBudget(), calificarCorrelacion(), colorRgba() (+65 more)

### Community 2 - "Nube: núcleo de bajadas"
Cohesion: 0.06
Nodes (48): abrirDB(), aColumnas(), ajustesLocales(), bajadaLocal(), bajadasLocales(), bajadasNube(), bajarBajada(), borrarBajadaNube() (+40 more)

### Community 3 - "Bike: mensajes y perfil"
Cohesion: 0.07
Nodes (45): abrirConversacion(), abrirMensajes(), abrirPerfil(), actualizarInsigniaMensajes(), alertaBreve(), cargarBandeja(), cargarHub(), cargarInvitaciones() (+37 more)

### Community 4 - "Coach: interfaz principal"
Cohesion: 0.11
Nodes (45): actualizarAvisos(), actualizarInsignia(), animarHero(), arrancar(), barraPilotos(), barrasCategorias(), barraTipos(), cargarCoach() (+37 more)

### Community 5 - "Recomendaciones TUNE"
Cohesion: 0.07
Nodes (42): abrirSagVivo(), analizarComportamiento(), avisoEndurecer(), avisoNivel(), evaluarBottomOut(), evaluarLSC(), evaluarRebote(), analizarReparto() (+34 more)

### Community 6 - "Base local y mapas"
Cohesion: 0.07
Nodes (44): abrirDB(), activarSelectorHistorial(), actualizarIndiceCortes(), aplicarCalibracionReparto(), asegurarHistorialSetup(), borrarTilesDeMapa(), bytesABase64(), columnasAMuestras() (+36 more)

### Community 7 - "Análisis: interfaz principal"
Cohesion: 0.06
Nodes (9): calcularDensidadEventosEnTrack(), calcularHistograma(), calcularHistogramaConteo(), dibujarDistPosicionDinamica(), dibujarDistVelocidadDinamica(), esperarVueltaParaRestaurarMapa(), pendientesAterrizaje(), restaurarMapaTrackTrasImprimir() (+1 more)

### Community 8 - "Enviar al profe"
Cohesion: 0.12
Nodes (24): abrir(), cerrar(), esc(), bajadaActual(), claveSubida(), el(), enviar(), crearEnvio() (+16 more)

### Community 9 - "Mapa 3D y cortes"
Cohesion: 0.15
Nodes (25): actualizarBotonMarcarCortes(), actualizarBotonToggleCapa(), actualizarCapaTrazaML(), actualizarMapaTrackML(), actualizarSelectorTramo(), agregarCorteEnPunto(), agregarPinMarcadorAlMapa(), buscarCortesSugeridos() (+17 more)

### Community 10 - "Gráficos y leyendas"
Cohesion: 0.09
Nodes (25): actualizarBotonToggleCanal(), actualizarLeyendaGraficoDinamica(), actualizarLeyendaGraficoGrande(), actualizarToggleMapa(), actualizarVisibilidadPersistentes(), aplicarCambioModoDatos(), aplicarFusionSemaforos(), cambiarZoom() (+17 more)

### Community 11 - "Saltos e impactos"
Cohesion: 0.08
Nodes (25): actualizarTituloPestanaMovil(), anotarAterrizajePorSalto(), anotarDetalleSaltos(), anotarImpactoPorGolpe(), calcularDerivadaRobustaAActualizacionLenta(), calcularDesviacionMovil(), calcularDistanciaTotal(), calcularGeometriaDinamica() (+17 more)

### Community 12 - "Mapa offline"
Cohesion: 0.15
Nodes (23): abrirModalMapaOffline(), actualizarEstimacionDescarga(), actualizarSelectorMapasOffline(), autoSeleccionarMapaOffline(), calcularBboxDesdeCentro(), calcularPiramideTiles(), calcularTilesParaBbox(), claveTile() (+15 more)

### Community 13 - "Video sincronizado"
Cohesion: 0.18
Nodes (22): abrirVideo(), actualizarEstadoVideo(), bucleVideo(), calcularEventosDeVideo(), construirClipsVideo(), controlarFinDeClip(), dibujarHud(), dibujarHudPantalla() (+14 more)

### Community 14 - "Nube: interfaz"
Cohesion: 0.37
Nodes (17): abrir(), aviso(), btn(), cerrar(), dibujar(), el(), fechaTxt(), importarEnWeb() (+9 more)

### Community 15 - "Importar del Sender"
Cohesion: 0.16
Nodes (17): abrirModalWifi(), actualizarInfoRango(), actualizarSelectorPerfilesBT(), actualizarSelectorPerfilesComo(), bdDisponible(), cargarBajadaSFB(), cargarCrudo(), conCargando() (+9 more)

### Community 16 - "Tarjetas de eventos"
Cohesion: 0.18
Nodes (17): activarTarjetasEvento(), actualizarLecturaScrubber(), cabeceraTarjetaEventos(), construirGeometria(), construirRecuperacion(), construirReparto(), construirTablaCurvas(), construirTablaFrenadas() (+9 more)

### Community 17 - "Base local por cuenta"
Cohesion: 0.24
Nodes (14): abrirDestino(), abrirPropia(), abrirVieja(), borrarVieja(), contar(), copiar(), cuandoAbra(), dialogo() (+6 more)

### Community 18 - "Guardado y FFT"
Cohesion: 0.14
Nodes (15): actualizarBajadaGuardadaAbierta(), cortesParaGuardar(), desfaseSegunHora(), envolventeVibracion(), fftEnLugar(), guardarBajadaEnDB(), guardarConfigConPerfil(), guardarMarcadoresActuales() (+7 more)

### Community 19 - "Formato SFB (análisis)"
Cohesion: 0.21
Nodes (7): bmp280Compensar(), crc16(), EscritorSFB, leerCrudo(), leerSFB(), nmeaCoord(), nmeaValida()

### Community 20 - "Formato SFB (Coach)"
Cohesion: 0.21
Nodes (7): bmp280Compensar(), crc16(), EscritorSFB, leerCrudo(), leerSFB(), nmeaCoord(), nmeaValida()

### Community 21 - "Panel de admin"
Cohesion: 0.27
Nodes (12): arrancar(), aviso(), bloquear(), casilla(), cerrarSesion(), el(), fecha(), llamar() (+4 more)

### Community 22 - "API de Coach"
Cohesion: 0.32
Nodes (11): cambiarClave(), funcion(), invitarSiCorresponde(), jwt(), login(), pedir(), registro(), rpc() (+3 more)

### Community 23 - "Temperatura y SAG"
Cohesion: 0.17
Nodes (13): analizarTemperaturaSuspension(), calcularAnalisisIndependiente(), calcularDerivadaYFiltrar(), calcularDistanciasAcumuladas(), calcularEstadisticasGolpes(), calcularSagDinamico(), construirMascaraAire(), factorVerticalHorquilla() (+5 more)

### Community 24 - "Comparación de bajadas"
Cohesion: 0.17
Nodes (12): abrirComparacion(), activarSelectorCortesComp(), actualizarLeyendaComparacion(), animarEntradaBienvenida(), animarEntradaPantalla(), animarEntradaTiles(), calcularDeltaBadge(), construirSectoresComparacion() (+4 more)

### Community 25 - "Comparar videos (Coach)"
Cohesion: 0.41
Nodes (11): abrir(), alternar(), bucle(), cerrar(), elegir(), modo(), paso(), pausar() (+3 more)

### Community 26 - "Planes de entrenamiento"
Cohesion: 0.44
Nodes (11): editarPlan(), editarSesion(), fichas(), lista(), pintarFases(), pintarSemana(), rpc(), tarjetaHoy() (+3 more)

### Community 27 - "Datos del Sender"
Cohesion: 0.30
Nodes (9): comprimir(), desdeMuestras(), desdePaquete(), detectarEventos(), leerArchivo(), leerBytes(), pasaAltos(), sincronizarConGoPro() (+1 more)

### Community 28 - "Utilidades UI de Coach"
Cohesion: 0.23
Nodes (4): abrirModal(), animar(), aviso(), html()

### Community 29 - "GoPro GPMF (análisis)"
Cohesion: 0.36
Nodes (10): buscarCajaRaiz(), fechaCreacion(), hijos(), lectorDeBlob(), lectorDeBytes(), leerGoPro(), leerValor(), pistaGPMF() (+2 more)

### Community 30 - "GoPro GPMF (Coach)"
Cohesion: 0.36
Nodes (10): buscarCajaRaiz(), fechaCreacion(), hijos(), lectorDeBlob(), lectorDeBytes(), leerGoPro(), leerValor(), pistaGPMF() (+2 more)

### Community 31 - "Terreno y TMD"
Cohesion: 0.20
Nodes (10): analizarTerreno(), analizarTmd(), claseTerreno(), construirTmd(), datosTmdPerfil(), frecuenciaTmd(), graficoEspectroTmd(), mediaMovilRapida() (+2 more)

### Community 32 - "Curvas y frenadas"
Cohesion: 0.31
Nodes (10): detectarCurvas(), detectarFrenadas(), difAngular(), indiceAntesDe(), indiceDespuesDe(), maxFinito(), medianaFinita(), minFinito() (+2 more)

### Community 33 - "Carpetas y archivos"
Cohesion: 0.25
Nodes (8): abrirModalCarpeta(), actualizarEstadoCarpetaUI(), descargarCSV(), entregarArchivoAlUsuario(), entregarTextoComoArchivo(), escribirArchivoEnCarpeta(), fsaDisponible(), verificarPermisoCarpeta()

### Community 34 - "Perfil de bici"
Cohesion: 0.25
Nodes (8): abrirModalPerfil(), actualizarAvatarPerfil(), actualizarVisibilidadResortePF(), actualizarVisibilidadTmdPF(), escribirPerfilCompleto(), escribirSelectConNuevo(), poblarSelectConDB(), poblarTodosLosSelectsDeEquipo()

### Community 35 - "Avisos push"
Cohesion: 0.32
Nodes (3): registrar(), soportado(), suscripcion()

### Community 36 - "Notas de bajada"
Cohesion: 0.47
Nodes (6): abrirModalNotas(), bloqueInfoNotas(), construirResumenEquipoYPista(), resumenSuspensionNotas(), tituloResumenNotas(), valNotas()

### Community 37 - "Compresor de video"
Cohesion: 0.60
Nodes (5): correr(), noLegible(), preparar(), revisar(), soportado()

### Community 39 - "SAG en rueda"
Cohesion: 0.40
Nodes (5): calcularSagEnRueda(), aplicarLeverage(), filtrarGlitchesPosicion(), interpolarLeverageLineal(), pctSeriesDeRegistro()

### Community 40 - "Recuperación y topes"
Cohesion: 0.40
Nodes (5): analizarRecuperacion(), buscarIndiceTiempoEn(), curvasAterrizaje(), detectarTopes(), golpesSinRebotesEnAire()

### Community 41 - "Saltos confirmados"
Cohesion: 0.40
Nodes (5): confirmarSaltosConSuspension(), detectarSaltos(), haySeñalIMU(), saltosConfirmadosDeMuestras(), unirSaltosCercanos()

### Community 43 - "Config del dispositivo"
Cohesion: 0.50
Nodes (4): abrirModalDispositivo(), actualizarBotonToggleDispositivo(), configDispositivoPorDefecto(), renderizarMapeoCanales()

### Community 44 - "Leverage"
Cohesion: 0.50
Nodes (4): abrirModalLeverage(), generarTablaLeverageDefault(), renderizarTablaLeverageEditor(), transformarTrayectoriaTrasera()

### Community 45 - "Foto de perfil"
Cohesion: 0.50
Nodes (4): abrirRecorteFoto(), abrirSelectorFoto(), aplicarTransformRecorteFoto(), clampOffsetsRecorteFoto()

### Community 46 - "Calibración (UI)"
Cohesion: 0.50
Nodes (4): actualizarEstadoLeverageUI(), actualizarNotaZonaMuerta(), actualizarVisibilidadDurezaResorte(), escribirCamposCalibracion()

### Community 47 - "Reparto de peso"
Cohesion: 0.50
Nodes (4): calibrarAreasReparto(), palancaEn(), presionAireEn(), terminosRueda()

### Community 48 - "Estadísticas"
Cohesion: 0.50
Nodes (4): construirStats(), minArr(), proyectarLocal(), proyectarLocalConAltura()

### Community 49 - "Presión de aire"
Cohesion: 0.67
Nodes (3): analizarPresion(), analizarPresionLado(), hayPresion()

### Community 50 - "Pivotes y golpes"
Cohesion: 0.67
Nodes (3): calcularGananciaPerdida(), detectarEventosDeGolpe(), detectarPivots()

### Community 51 - "Reporte imprimible"
Cohesion: 0.67
Nodes (3): clonarSinIds(), construirReporteImprimible(), recortarAlDibujo()

### Community 52 - "Pista sintética"
Cohesion: 0.67
Nodes (3): generarPerfilRumbo(), generarPistaSintetica(), rumboEnTiempo()

## Knowledge Gaps
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `btn()` connect `Nube: interfaz` to `Análisis: interfaz principal`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `abrir()` connect `Nube: interfaz` to `Enviar al profe`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `esc()` connect `Enviar al profe` to `Nube: interfaz`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `abrir()` (e.g. with `estudio.js` and `alCambiarTamano()`) actually correct?**
  _`abrir()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `refrescarPestana()` (e.g. with `pestanaEtiquetas()` and `pestanaPostura()`) actually correct?**
  _`refrescarPestana()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `Estudio de video (Coach)` be split into smaller, more focused modules?**
  _Cohesion score 0.08568646543330087 - nodes in this community are weakly interconnected._
- **Should `Vibración y regresión` be split into smaller, more focused modules?**
  _Cohesion score 0.10540334855403348 - nodes in this community are weakly interconnected._