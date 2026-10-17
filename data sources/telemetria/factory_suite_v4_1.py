import flet as ft
import pandas as pd
import numpy as np

class TelemetriaFactoryApp:
    def __init__(self):
        # Base de datos e inicialización de parámetros de boxes
        self.df = None
        self.boxxer_travel = 205.0
        self.shock_stroke = 75.0
        self.wheel_travel = 200.0
        self.rodado = "27.5\""
        self.cubierta = "2.50\""

    def main(self, page: ft.Page):
        self.page = page
        self.page.title = "Black Edition v4.1 - Mobile Factory Suite"
        self.page.theme_mode = ft.ThemeMode.DARK
        self.page.scroll = ft.ScrollMode.AUTO
        
        # Diálogo para alertas o errores de boxes
        self.dialogo_alerta = ft.AlertDialog(title=ft.Text("⚠️ Notificación de Boxes"))

        # --- COMPONENTE 1: HEADER / TOP BAR DE TRABAJO ---
        top_bar = ft.Container(
            content=ft.Row([
                ft.Text("🏁 BLACK EDITION v4.1 FACTORY", size=18, weight=ft.FontWeight.BOLD, color=ft.colors.AMBER),
                ft.Row([
                    ft.ElevatedButton("📂 Cargar Datos SD", icon=ft.icons.FILE_OPEN, on_click=lambda _: self.file_picker.pick_files(allow_multiple=False)),
                    ft.ElevatedButton("🧠 Simular Datos (1000Hz)", icon=ft.icons.BOLT, bgcolor=ft.colors.PURPLE_800, color=ft.colors.WHITE, on_click=self.generar_datos_simulados),
                    ft.ElevatedButton("🔄 Wi-Fi Sync", icon=ft.icons.WIFI, bgcolor=ft.colors.GREEN_800, color=ft.colors.WHITE, on_click=self.sincronizar_wifi_mock)
                ], spacing=10)
            ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
            padding=15, bgcolor=ft.colors.BLUE_GREY_900, border_radius=8
        )

        # --- COMPONENTE 2: PANEL DE CALIBRACIÓN GEOMÉTRICA (LEVERAGE ENGINE) ---
        config_panel = ft.ExpansionTile(
            title=ft.Text("⚙️ Configuración y Calibración en Boxes (Geometría del Chasis)", weight=ft.FontWeight.BOLD),
            subtitle=ft.Text("Modifica el rodado, las cubiertas y el leverage ratio por software"),
            controls=[
                ft.Container(
                    content=ft.ResponsiveRow([
                        ft.Dropdown(
                            col={"sm": 6, "md": 3}, label="Rodado de Rueda", value=self.rodado,
                            options=[ft.dropdown.Option("27.5\""), ft.dropdown.Option("29\"")],
                            on_change=self.actualizar_parametros
                        ),
                        ft.Dropdown(
                            col={"sm": 6, "md": 3}, label="Ancho de Cubierta", value=self.cubierta,
                            options=[ft.dropdown.Option("2.40\""), ft.dropdown.Option("2.50\""), ft.dropdown.Option("2.60\"")],
                            on_change=self.actualizar_parametros
                        ),
                        ft.TextField(
                            col={"sm": 4, "md": 2}, label="Boxxer Stroke (mm)", value=str(self.boxxer_travel),
                            keyboard_type=ft.KeyboardType.NUMBER, on_change=self.actualizar_txt_boxxer
                        ),
                        ft.TextField(
                            col={"sm": 4, "md": 2}, label="Shock Stroke (mm)", value=str(self.shock_stroke),
                            keyboard_type=ft.KeyboardType.NUMBER, on_change=self.actualizar_txt_shock
                        ),
                        ft.TextField(
                            col={"sm": 4, "md": 2}, label="Recorrido Rueda Trasera (mm)", value=str(self.wheel_travel),
                            keyboard_type=ft.KeyboardType.NUMBER, on_change=self.actualizar_txt_wheel
                        ),
                    ]), padding=15
                )
            ]
        )

        # --- COMPONENTE 3: PANELES DINÁMICOS DE LECTURA DE DATOS ---
        self.txt_ia_report = ft.Text(
            "🧠 Esperando carga de telemetría...\nPresiona 'Simular Datos' para verificar las funciones del software.", 
            font_family="monospace", size=13, color=ft.colors.GREEN_400
        )
        
        self.txt_notes = ft.TextField(
            label="Notas de Carrera / Observaciones del Circuito",
            multiline=True, min_lines=5,
            placeholder="Introduce aquí las presiones base (PSI), tokens utilizados, clics de rebote y el estado del clima..."
        )

        # Contenedores visuales para simular los gráficos (Barras dinámicas de telemetría)
        self.barra_horquilla = ft.ProgressBar(value=0, width=300, color=ft.colors.YELLOW)
        self.barra_shock = ft.ProgressBar(value=0, width=300, color=ft.colors.MAGENTA)
        self.lbl_h_mm = ft.Text("Horquilla Boxxer: 0.0 mm", size=14, weight=ft.FontWeight.BOLD)
        self.lbl_s_mm = ft.Text("Rueda Trasera: 0.0 mm", size=14, weight=ft.FontWeight.BOLD)

        tabs_sistema = ft.Tabs(
            selected_index=0,
            animation_duration=300,
            tabs=[
                ft.Tab(
                    text="📊 Suspension & Track View", icon=ft.icons.LEADERBOARD,
                    content=ft.Container(
                        content=ft.Column([
                            ft.Text("Monitoreo Clínico de Suspensiones", size=16, weight=ft.FontWeight.BOLD),
                            ft.Text("Análisis de compresión instantánea en el punto máximo de impacto:", size=12, color=ft.colors.GREY_400),
                            ft.Card(
                                content=ft.Container(
                                    content=ft.Column([
                                        self.lbl_h_mm, self.barra_horquilla,
                                        ft.Divider(height=10, color=ft.colors.TRANSPARENT),
                                        self.lbl_s_mm, self.barra_shock
                                    ]), padding=15
                                ), bgcolor=ft.colors.BLACK
                            ),
                            ft.Text("💡 En la tablet, las curvas de 1000 Hz completas (Stack View) se despliegan en este tramo usando un visor web interactivo.", size=11, color=ft.colors.GREY_500, italic=True)
                        ]), padding=15
                    )
                ),
                ft.Tab(
                    text="🤖 Auto Tuning IA", icon=ft.icons.PSYCHOLOGY,
                    content=ft.Container(
                        content=ft.Column([
                            ft.ElevatedButton("🧠 Ejecutar Diagnóstico de Clics y Presión", bgcolor=ft.colors.PURPLE_800, color=ft.colors.WHITE, on_click=self.ejecutar_ia),
                            ft.Container(content=self.txt_ia_report, bgcolor=ft.colors.BLACK, padding=15, border_radius=8, expand=True)
                        ]), padding=15
                    )
                ),
                ft.Tab(
                    text="📝 Run Notes", icon=ft.icons.EDIT_NOTE,
                    content=ft.Container(
                        content=ft.Column([
                            self.txt_notes,
                            ft.ElevatedButton("💾 Guardar Sesión de Pruebas", icon=ft.icons.SAVE, bgcolor=ft.colors.BLUE_800, color=ft.colors.WHITE)
                        ]), padding=15
                    )
                )
            ], expand=1
        )

        # File Picker para buscar archivos en las carpetas de la tablet
        self.file_picker = ft.FilePicker(on_result=self.on_file_picked)
        self.page.overlay.append(self.file_picker)

        # Agregar los bloques a la pantalla de la tablet
        self.page.add(top_bar, ft.Divider(height=5, color=ft.colors.TRANSPARENT), config_panel, tabs_sistema)

    # --- LÓGICA DE PROGRAMACIÓN Y MATEMÁTICA ---
    def generar_datos_simulados(self, e):
        """Simula matemáticamente una bajada a 1000 Hz para probar el software sin la bici"""
        puntos = 5000 # 5 segundos de carrera a 1000 Hz
        time_ms = np.arange(0, puntos)
        # Generar movimientos elásticos usando ondas senoidales y picos de impactos duros
        horq_raw = (500 + 400 * np.sin(time_ms / 100) + np.random.normal(0, 30, puntos)).clip(0, 1023)
        shock_raw = (450 + 350 * np.sin(time_ms / 120) + np.random.normal(0, 25, puntos)).clip(0, 1023)
        # Forzar un bottom-out (tope) artificial en la muestra número 2500 para probar la IA
        horq_raw[2400:2550] = 1015 
        acc200 = np.random.normal(1.0, 0.2, puntos)
        acc200[2500] = 5.2 # Impacto vertical fuerte de 5.2 Gs
        
        # Crear el DataFrame estructurado idéntico al que grabará la Teensy 4.1
        self.df = pd.DataFrame({
            'Time(ms)': time_ms, 'Horq(raw)': horq_raw, 'Shock(raw)': shock_raw,
            'AccX_16G': np.random.normal(0, 0.1, puntos), 'AccZ_200G': acc200,
            'Alt(m)': 850 - (time_ms / 50), 'Vel_GPS': np.random.uniform(30, 45, puntos),
            'Vel_Rueda': np.random.uniform(30, 45, puntos)
        })
        
        self.actualizar_graficos_móviles()
        self.page.snack_bar = ft.SnackBar(ft.Text("✅ ¡Datos a 1000 Hz simulados de forma exitosa en boxes!"))
        self.page.snack_bar.open = True
        self.page.update()

    def actualizar_graficos_móviles(self):
        """Calibra los datos analógicos crudos a milímetros reales usando el Leverage Ratio"""
        if self.df is None: return
        
        # Fórmula automatizada de Leverage Ratio v4.1
        lev_factor = self.wheel_travel / self.shock_stroke
        
        max_horq_raw = self.df['Horq(raw)'].max()
        max_shock_raw = self.df['Shock(raw)'].max()
        
        # Pasar de escala 0-1023 a milímetros reales de carrera
        h_mm = (max_horq_raw / 1023.0) * self.boxxer_travel
        s_vastago_mm = (max_shock_raw / 1023.0) * self.shock_stroke
        s_rueda_real_mm = s_vastago_mm * lev_factor # Multiplicación por la bieleta del cuadro
        
        # Actualizar componentes de la pantalla táctil
        self.lbl_h_mm.value = f"Horquilla Boxxer (Pico Máximo): {h_mm:.1f} mm / {self.boxxer_travel} mm"
self.barra_horquilla.value = h_mm / self.boxxer_travel
self.lbl_s_mm.value = f"Rueda Trasera Real (Pico Máximo):{s_rueda_real_mm:.1f} mm / {self.wheel_travel} mm"
self.barra_shock.value = s_rueda_real_mm / self.wheel_travel
self.page.update()
def ejecutar_ia(self, e):
    """Motor lógico experto que analiza el comportamiento y propone clicks/presiones"""
    if self.df is None:
        self.dialogo_alerta.content = ft.Text("⚠️ No hay datos cargados en la tablet. Simule datos o cargue un archivo primero.")
        self.page.open(self.dialogo_alerta)
        return
    lev_factor = self.wheel_travel / self.shock_stroke
    h_max_raw = self.df['Horq(raw)'].max()
    h_mm = (h_max_raw / 1023.0) * self.boxxer_travel
    acc200_max = self.df['AccZ_200G'].max()
    reporte = "===============================================================\n"
    reporte += "🤖 REPORTES DE INGENIERÍA DE COMPETICIÓN - BLACK EDITION MOBILE\n"
    reporte += "===============================================================\n\n"
    reporte += f"• Relación de Palanca de Bieleta en Cuadro: {lev_factor:.2f}:1\n"reporte += f"• Altitud Máxima Registrada por Barómetro BMP280: {self.df['Alt(m)'].max():.1f} metros.\n\n"
    reporte += "🛠️ CONFIGURACIÓN PROPUESTA PARA LA SIGUIENTE MANGA:\n"
    reporte += "---------------------------------------------------------------\n"
    if h_mm > (self.boxxer_travel * 0.95) or acc200_max > 4.5:
        reporte += "❌ CRÍTICO [FRONT END]: Se detectó un bottom-out violento en la Boxxer delantera.\n"
        reporte += f"  (Hundimiento máximo de {h_mm:.1f}mm con un impacto seco de {acc200_max:.1f} Gs).\n"
        reporte += "👉 BOXES: Sumar +5 a +8 PSI de presión en el aire o cerrar 2 clics de compresión de alta velocidad (HSC).\n\n"
        else:
            reporte += "✅ EQUILIBRIO [FRONT END]: El tren delantero trabaja estable sin riesgo de lockout.\n\n"
            reporte += "💡 RECOMENDACIÓN EXTRA: Asegúrate de limpiar el eje de 10mm de la masa TMD de bronce con alcohol isopropílico para mantener la fricción seca constante."
            self.txt_ia_report.value = reporte
            self.page.update()
            def on_file_picked(self, e: ft.FilePickerResultEvent):
                if e.files:
                    self.df = pd.read_csv(e.files.path)
                    self.actualizar_graficos_móviles()
                    self.page.update()
                    
                    def sincronizar_wifi_mock(self, e):
                        self.page.snack_bar = ft.SnackBar(ft.Text("📡 Conectando a la red local 'TMD_Telemetria_Boxes'..."))
                        self.page.snack_bar.open = True
                        self.page.update()
                        def actualizar_parametros(self, e):
                            self.rodado = self.combo_rodado.value if hasattr(self, 'combo_rodado')
                             else self.rodado
                             self.actualizar_graficos_móviles()
                    # Captura segura de los cuadros de texto para evitar que el software se rompa si quedan vacíos
                    def actualizar_txt_boxxer(self, e):
                        try: self.boxxer_travel = float(e.control.value);
                         self.actualizar_graficos_móviles()
                         except: pass 
                         def actualizar_txt_shock(self, e):
                            try: self.shock_stroke = float(e.control.value);
                             self.actualizar_graficos_móviles()
                             except: pass
                             def actualizar_txt_wheel(self, e):
                                try: self.wheel_travel = float(e.control.value);
                                 self.actualizar_graficos_móviles()
                                 except: pass
                                 if name == "main":
                                    ft.app(target=TelemetriaFactoryApp().main)
