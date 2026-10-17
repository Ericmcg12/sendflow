# FlowBench — Resumen del proyecto y respaldo

Respaldo generado el 24 de septiembre de 2026. Contiene todo lo trabajado sobre el banco de ensayo de suspensiones (FlowBench), su software (SendFlow Lab) y el análisis de mercado.

## Contenido de esta carpeta

| Archivo | Qué es |
| --- | --- |
| 00_LEEME_FlowBench_resumen.md | Este resumen: decisiones, nombres y pendientes |
| 01_Banco_plan_mecanico.pdf | Plan mecánico completo del banco, pantalla, SendFlow Lab, CRM, seteo por peso |
| 02_Informacion_de_mercado.pdf | Precios de la competencia, comparación, modelos de negocio, línea bici y moto |
| 03_FlowBench_plan_de_fabricacion.pdf | Etapas de fabricación, piezas, componentes, riesgos y costos |
| 04_FlowBench_compras_prototipo.xlsx | Planilla de compras: 101 componentes, 22 materias primas, mecanizado, verificación de columnas |
| 05_FlowBench_esquema.png / .svg | Esquema frontal de la máquina con shock y con horquilla de doble corona |

Versiones editables en línea (se actualizan ahí; este respaldo es una copia de hoy):

- Plan mecánico: https://claude.ai/code/artifact/ca4b6ed5-5ec8-4877-9c86-b72f3c187064
- Información de mercado: https://claude.ai/code/artifact/ef687da1-f48c-4d4d-8529-a52d857f0f79
- Plan de fabricación: https://claude.ai/code/artifact/26a139de-014b-4ad3-8fc6-7fbe0df51157

## Nombres

| Producto | Nombre |
| --- | --- |
| Datalogger de campo | Sender |
| Software de campo (portátil) | SendFlow |
| Banco de ensayo (dinamómetro) | FlowBench (provisorio) |
| Software del banco | SendFlow Lab |

## Decisiones tomadas

### Producto
- FlowBench es un equipo independiente de Sender: se vende solo o en combo. Su ventaja principal es que se acopla con Sender, con datos reales de pista y de taller.
- Máquina autónoma: pantalla táctil y computadora propias, sin PC aparte.
- Línea de productos futura: banco Bici (este prototipo) y banco Moto/general más robusto; Sender para moto con más sensores (marcha, rpm, acelerador, freno).

### Mecánica
- Configuración de dinamómetro de competición: dos columnas-guía, puente superior que se corre a mano y se fija con dos trabas, carro inferior guiado movido por biela–manivela.
- Un solo montaje por shock u horquilla, sin pasadas ni reajustes.
- Mide shocks de 40 a 75 mm y horquillas completas de hasta 200 mm de recorrido y 605 mm de eje a corona (Fox 40, Boxxer).
- Plato de manivela Ø 260 mm con 23 posiciones fijas: shocks 40–75 mm y horquillas 100, 120, 130, 140, 150, 160, 170, 180, 190, 200 mm.
- Una sola biela de 300 mm para todos los recorridos.
- Celda de carga de 10 kN en el puente (lado fijo); posición medida con encoder lineal sin contacto.
- Estructura de 10 kN con cartucho de sobrecarga a ≈ 8 kN, limitador de torque y verificación por software.
- Alto ≈ 1,6 m, base 550 × 450 mm, 150 a 190 kg.
- Columnas: ejes lineales templados Ø 40 × 2.000 mm comprados ($ 440.000 por barra, ≈ USD 280; confirmar si es por barra).
- Kit de montaje base Fox y RockShox; Öhlins y EXT como ampliación.

### Accionamiento (a confirmar)
- Alimentación 220 V monofásica.
- A 4 kW solo se consiguen variadores trifásicos. Opción en la planilla: motor 2,2 kW + variador monofásico + correa 5:1 (horquillas llegan justo; shocks cortos ≈ 1,1 m/s).
- Alternativa a cotizar: servomotor ≈ 3 kW con drive de entrada monofásica.

### Electrónica y software
- Controlador de tiempo real: Teensy 4.1 (como Sender). Seguridad por hardware, independiente del software.
- Computadora de interfaz: Linux (Raspberry Pi 5 con SSD o mini PC N100), no Windows. Pantalla táctil 15,6".
- SendFlow Lab: base de datos de modelos, ensayos automáticos, seteo por peso con bandas objetivo, CRM de clientes, informes PDF, historial.
- Conexión con SendFlow portátil y con Sender por WiFi local o archivo, siempre offline.

### Fabricación
- Mecanizado, fresado y rectificado propios (torno, perforadora, fresado, rectificadora plana y tangencial).
- Tercerizar solo: templado y rectificado de pernos, balanceo, granallado y pintura, calibración de celda (opcional).

## Mercado (resumen)
- Competidor directo: LABA7 Featherlight, 7.950 EUR, hasta 100 mm de carrera (no mide horquillas de DH en todo su recorrido).
- Referencias: LABA7 Light 10.950 EUR; Intercomp 3 HP USD 10.995; manuales para bici USD 545–1.145.
- Los talleres de Mendoza no parecen poder pagar un banco de este precio. Camino propuesto: Sender + SendFlow primero, un banco propio para dar servicio (también por envío) y después evaluar fabricar para vender. La moto puede ser un mercado con más capacidad de pago.

## Costos estimados
- Prototipo completo, sin herramientas: ≈ USD 4.600 a 9.600 (planilla, con mecanizado propio).
- Plazo estimado hasta prototipo validado: 5 a 9 meses.

## Pendientes
1. Elegir accionamiento: motor 2,2 kW + variador monofásico, o servomotor con drive monofásico.
2. Confirmar si el precio de los ejes lineales es por barra.
3. Relevar medidas de shocks y horquillas Fox y RockShox (largos, bujes, tubos de dirección, ejes) y curvas de palanca de cuadros.
4. Revisar en el código de SendFlow si existe exportación de la base completa; si no, agregarla (software y endpoint en el firmware de Sender para listar y descargar todas las bajadas).
5. Diseñar la electrónica de control (capítulo siguiente) y elegir placa y pantalla.
6. CAD 3D con verificación de columnas (flexión lateral con 1,35 m) y planos.
7. Averiguaciones de mercado: cantidad de talleres (bici y moto), precio por ensayo, costo de un LABA7 puesto en Mendoza, precios de dataloggers de moto (AiM, 2D).
8. Definir nombre comercial definitivo del banco.
