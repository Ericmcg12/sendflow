# Anexo: MTB Fit, qué es y qué usar para los planes de Sendflow

> **Fecha: 2026-10-21.** Anexo de [ANALISIS_COMPETITIVO_2026-10-21.md](ANALISIS_COMPETITIVO_2026-10-21.md). Las decisiones que salen de acá están en el PRD (`final/01_PRD.md`, C67 a C73).
> Fuentes: la [web de MTB Fitness](https://mtb.fitness/), la [página del producto](https://mtb.fitness/products/mtb-fit-the-app), la [ficha de App Store](https://apps.apple.com/us/app/mtb-fit-by-mtb-fitness/id1665287148), las reseñas de [reviews.co.uk](https://www.reviews.co.uk/company-reviews/store/mtb.fitness) y **unas 50 capturas de pantalla que Eric sacó de la app el 21/10/2026** (cuenta nueva, primer día, sin historial). Lo que no se vio queda marcado como «no visto».

## 1. Qué es

- MTB Fit es la app de MTB Fitness Ltd., fundada en 2016 por Matt Mooney según su [home](https://mtb.fitness/). Se compra en la web (£29.99 según su [página del producto](https://mtb.fitness/products/mtb-fit-the-app); el periodo de cobro no figura en la página) y hay 30 días de prueba. La cuenta se crea solo desde la web, después de un formulario; la app no permite registrarse.
- El paquete de Google Play se llama `com.trainerize.mtbfit` y la URL del formulario es `mtbfit.trainerize.com`: está hecha sobre **Trainerize**, una plataforma genérica de coaching. El vídeo de uso inicial es genérico, sin ciclismo.
- **Valoración de Eric (21/10):** no le gustó. Es **una biblioteca de vídeos de ejercicios de gimnasio**, no tiene nada de ejercicios sobre la bici, el seguimiento de la sesión es muy básico y el Home se centra en el peso corporal, lo que no tiene que ver con Sendflow. El contenido «de bici» (por ejemplo «Intervals – RPM Builders») es **en bici fija dentro del gimnasio**, no sobre la MTB.
- **Matiz de la revisión:** el peso es uno de diez objetivos del formulario, y los otros nueve son de MTB («Stronger descending», «Less arm pump», «Easier/faster climbing»). El foco en peso, grasa, calorías y comidas viene de los módulos genéricos de la plataforma (Home, botón «+», perfil), no de los entrenamientos.

## 2. Qué vimos dentro

| Pantalla | Contenido |
|---|---|
| Formulario inicial | Objetivos (10 opciones, selección múltiple) + texto libre; frecuencia de uso de la bici; nivel físico; experiencia con pesas; tiempo para entrenar; descargo de lesiones firmado con nombre y teléfono. Se repite dentro de la app como «Onboarding Form» |
| Home | Saludo, semana, tarjetas «Contact» (contacto, grupo de Facebook, compra de bandas, dieta) y «My Progress» con nueve tarjetas (pasos, peso, pulso en reposo, sueño, grasa, masa magra, fotos, calorías, presión arterial), casi todas vacías |
| Calendar | Lista por días; el día de hoy trae «Cycling», «Plan 1 – Upper Body – Gym», fotos de progreso, peso y el formulario. Los días siguientes aparecían vacíos |
| Workouts | «MTB Fit Main – Home Plans» y «Gym Plans», bloque de 4 semanas con fechas (4 al 31 de octubre de 2026): Intervals – RPM Builders (47 min, 7 ejercicios), Plan 1 Upper Body (49–50 min, 9), Plan 2 Lower Body (49 min, 9), Plan 3 Circuit – Gym (47 min, 8). Además: estiramientos (diario 6 min, post-ride 9 min, rutinas para codo, cadera, rodilla, espalda baja y cuello de 7 a 25 min), calentamientos (pre-ride 12 min, pre-workout 7 min), sesiones cortas «Bonus» de 27 a 29 min (Arm Pump, Climb Easier, Core, Corner Better, Descend Strong, Full Body, Lower Body, «Twelve Days…» de 45 min) y una «Foundation Phase» opcional de 4 semanas (35 a 43 min) en gimnasio y en casa |
| Filtros | Orden por nombre o por fecha, duración (de 5 min a 1 h+) y equipo (unos 30 tipos). **No hay filtro de nivel** |
| Sesión | Duración estimada, número de ejercicios, instrucciones, lista de **sustituciones sugeridas** (por ejemplo «Barbell Back Squat → DB Squat», «Single Leg Burpee → Double Leg Burpee») y estructura en superseries o circuitos |
| Durante la sesión | Por serie: repeticiones y kilos, o tiempo en minutos y segundos para los isométricos; columna «Previous»; interruptor «Auto fill stats»; «Add new set»; «Insert Exercise»; descanso por bloque con temporizador (60, 90 s); cronómetro; comentarios de la sesión; nota por ejercicio de 200 caracteres («for your personal reference»); intercambio de ejercicio con buscador; menú «Cancel workout / Edit This Workout / Delete» |
| Cardio | «Cycling»: un cronómetro con parar, bloquear y pausar. No registra distancia ni datos |
| Mensajes | Mensaje de bienvenida de Matt: responde de lunes a viernes en 24 horas; recomienda ver los vídeos de bienvenida (6, 2 y 1 minuto) y unirse al grupo privado de Facebook |

Ejemplo de estructura de una sesión (Plan 1 – Upper Body – Gym): superserie de 4 series (remo con barra 6-8, «sumo high pull» 8-10 por lado, «leg pull ups» 15-20 por pierna, descanso 90 s), otra superserie de 4 series (press inclinado con pausa 8-10, «plank walk ups», «star plank» el mayor tiempo posible, descanso 90 s), una de 3 series (press con placa 15-25, curl Zottman 10-12, descanso 60 s) y un final «Tabata» de 8 series de 20 s.

**Instrucciones que repite en cada sesión:** elegir una carga «slightly lighter than you think you can do, then build up», técnica primero y después más peso, y si la sesión es demasiado difícil, descansar de 10 a 20 s entre ejercicios.

## 3. Lo que se puede usar (decisión de Eric, 21/10)

Solo para la **biblioteca de gimnasio** y la mecánica de las sesiones; nada de lo que MTB Fit hace con la bici sirve como modelo. El detalle de cada decisión está en el PRD (C67 a C73):

1. **Sustituciones:** campo «versión más fácil» en cada ejercicio de la biblioteca.
2. **Descanso y bloques:** descanso por ejercicio o bloque, y que el coach agrupe ejercicios en superserie o circuito.
3. **Registro por serie** (repeticiones, kilos y el valor de la sesión anterior) para gimnasio; y para las sesiones con bici: esfuerzo, pulso y datos del Sender (kilómetros, duración).
4. **Nota por ejercicio visible para el coach**, con aviso de dolor.
5. **Los planes los arma solo el coach.** Es la diferencia con MTB Fit y con las apps de seguimiento: Sendflow no entrega un plan enlatado al piloto; le da al coach una herramienta de planificación que **sugiere** planes según edad, peso, nivel y objetivo, y el coach los usa, modifica, agrega o quita.
6. **Más fáciles:** sesiones por objetivo (brazos y antebrazo, descenso, curvas) para que el coach elija más rápido; calentamiento previo a la bajada y recuperación como sesiones que se agregan al plan; fase de fundamentos opcional, que elige el coach; mensaje de bienvenida del coach con su tiempo de respuesta.
7. **Cuestionario del piloto** (condiciones, necesidades y objetivo: no es lo mismo entrenar por entrenar que para correr). Es una herramienta **de Coach, para el coach**, no un requisito para usar Sendflow, y puede llevar su propio descargo. **Descargo de lesiones de Sendflow:** se acepta al abrir la cuenta por primera vez (lo gestiona Bike, PRD W14), aparte del cuestionario. La sección de privacidad sigue pendiente de mejora por separado (PRD §11).

## 4. Lo que no se usa

- Comidas, recetas, sueño, presión arterial, medidas corporales, insignias y créditos de sesión (módulos genéricos de Trainerize).
- Planes enlatados que el piloto se sigue solo, con o sin entrenador.
- Un cuestionario como condición para usar Sendflow (el descargo de lesiones sí se acepta al abrir la cuenta, W14).
- Un plan generado para el piloto, aunque lo personalice una IA: anularía el trato humano del coach, que es la diferencia del producto (PRD C67).
- El peso corporal como objetivo; sí sirve el **peso del piloto** como dato (el SAG y el resorte dependen de él).

## 5. Qué no se vio

- El **cambio de nivel principiante o avanzado** que anuncia la ficha de App Store: en los filtros no existe; la etiqueta «Regular» junto a cada sesión podría ser el nivel, sin confirmar.
- Si los bloques cambian **cada 2 o cada 4 semanas**: la web dice 4 y la App Store 2; el bloque visto es de 4.
- Cómo avanza la dificultad semana a semana, y si Matt revisa lo que registra cada usuario (solo se vio el primer día).
- Las opciones de los desplegables del formulario (solo las respuestas elegidas: «1-2x Per Week» y «Fair»).
- El plan «Home» completo y el «Plan 3» de casa.

## 6. Qué puede caducar

Precio y periodo de cobro, el contenido del bloque (cambia cada mes), las cifras de clientes (autodeclaradas: más de 25.000 según su [home](https://mtb.fitness/)) y las valoraciones.
