# FlowBench — Resumen del proyecto y respaldo

Respaldo actualizado el 24 de septiembre de 2026 (noche), después de rediseñar el mecanismo con scotch yoke dentro de la base. Reemplaza al respaldo anterior de la carpeta respaldo_2026-09-24.

## Contenido de esta carpeta

| Archivo | Qué es |
| --- | --- |
| 00_LEEME_FlowBench_resumen.md | Este resumen: decisiones, nombres y pendientes |
| 01_Banco_plan_mecanico.pdf | Plan mecánico completo, pantalla, SendFlow Lab, CRM, seteo por peso |
| 02_Informacion_de_mercado.pdf | Precios de la competencia (actualizados), comparación, modelos de negocio, línea bici y moto |
| 03_FlowBench_plan_de_fabricacion.pdf | Etapas, piezas, componentes, riesgos y costos |
| 04_FlowBench_compras_prototipo.xlsx | Planilla de compras: 102 componentes, 23 materias primas, mecanizado, verificación de guías |
| 05_FlowBench_esquema.png / .svg | Esquema frontal con shock y con horquilla de doble corona |

Versiones editables en línea (este respaldo es una copia):

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
- FlowBench es independiente de Sender: se vende solo o en combo. Ventaja principal: se acopla con Sender (datos de pista y de taller).
- Máquina autónoma: pantalla táctil y computadora propias, sin PC aparte.
- Línea futura: banco Bici (este prototipo) y banco Moto/general; Sender para moto.

### Mecánica (rediseño con scotch yoke)
- Arquitectura como LABA7: todo lo que se mueve va dentro de la base; afuera, dos columnas sostienen solo el puente.
- Scotch yoke con doble rodillo precargado (un rodillo sobre buje excéntrico) y caras de la ranura templadas y rectificadas.
- Yugo guiado por dos barras cromadas Ø30 dentro de la base, con bujes de bronce; vástago Ø30 que sale por la tapa con buje guía, rascador y sello.
- Plato de manivela Ø260 con 23 posiciones: shocks 40–75 mm y horquillas 100, 120, 130, 140, 150, 160, 170, 180, 190, 200 mm.
- Carrera máxima 200 mm, para medir horquillas completas (LABA7 llega a 150 mm como máximo).
- Base ≈ 550 × 450 × 500 mm; alto total ≈ 1,7 m; 150 a 180 kg.
- Columnas: barras cromadas Ø40 propias, sin travesaño, ancladas en dos placas de la base. Largo final según relevamiento (≈ 1,2 m libres).
- Puente con dos palancas de traba y topes de seguridad; sin resortes a gas.
- U universal arriba y abajo; shocks como en el cuadro; horquillas por la punta del steerer (manguito) y por el eje (bloque).
- Celda de 10 kN en el puente; posición medida en el yugo dentro de la base; sensor IR de temperatura en una columna.
- Kit de montaje base Fox y RockShox; Öhlins y EXT como ampliación.

### Accionamiento (a definir)
- 220 V monofásica. A 4 kW solo hay variadores trifásicos.
- Opción A (en la planilla): motor 2,2 kW + variador monofásico + correa 5:1. Horquillas justas; shock de 40 mm ≈ 1,1 m/s.
- Opción B: servomotor ≈ 3 kW con drive de entrada monofásica (LABA7 MICRO usa servo monofásico).
- Opción C: motor 3 kW + variador monofásico de 3 kW (LABA7 Light declara 4 HP monofásico).

### Electrónica y software
- Teensy 4.1 para tiempo real; seguridad por hardware.
- Computadora Linux (Raspberry Pi 5 con SSD o mini PC N100), no Windows. Pantalla táctil 15,6".
- SendFlow Lab: ensayos automáticos, seteo por peso, CRM de clientes, informes PDF, historial; conexión offline con SendFlow y Sender.

### Fabricación
- Mecanizado, fresado y rectificado propios. Afuera: temple de pernos y de las caras del yugo, balanceo, granallado y pintura.

## Mercado (resumen, precios actualizados)
- LABA7: MICRO 6.000 EUR (servo, 50 mm), Featherlight 9.000 EUR (100 mm), Light 11.500 EUR (150 mm), Mid 15.500, Heavy 19.500, Super Heavy 28.000 EUR.
- Referencias: Intercomp 3 HP USD 10.995; manuales para bici USD 545–1.145.
- Los talleres de Mendoza no parecen poder pagar un banco de este precio. Camino propuesto: Sender + SendFlow primero, un banco propio para dar servicio (también por envío) y después evaluar fabricar para vender. La moto puede ser un mercado con más capacidad de pago.

## Costos estimados
- Prototipo completo, sin herramientas: ≈ USD 4.000 a 8.900 (mecanizado propio, barras propias, accionamiento opción A).
- Plazo estimado hasta prototipo validado: 5 a 9 meses.

## Pendientes
1. Elegir accionamiento: opción A, B o C.
2. Relevar medidas de shocks y horquillas Fox y RockShox (largos entre pernos, bujes, steerers, ejes) y curvas de palanca de cuadros. Define el largo de las columnas.
3. Verificar diámetro y rectitud de las barras Ø30 para las guías del yugo (hoja Guías de la planilla).
4. Revisar en el código de SendFlow si existe exportación de la base completa; si no, agregarla (software y endpoint en el firmware de Sender).
5. Diseñar la electrónica de control y elegir placa y pantalla.
6. CAD 3D con verificación del yugo, las guías, las columnas sin travesaño y el puente.
7. Averiguaciones de mercado: talleres (bici y moto), precio por ensayo, costo de un LABA7 puesto en Mendoza, dataloggers de moto (AiM, 2D).
8. Definir nombre comercial definitivo del banco.
