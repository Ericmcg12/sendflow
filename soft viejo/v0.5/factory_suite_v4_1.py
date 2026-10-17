import flet as ft
import pandas as pd
import numpy as np

class TelemetriaUniversalApp:
    def __init__(self):
        self.df = None
        
        # Parámetros del Vehículo / Chasis (Inicialización Base)
        self.front_fork_model = "Custom Fork"
        self.rear_shock_model = "Custom Shock"
        self.front_travel_max = 200.0
        self.shock_stroke_max = 75.0
        self.wheel_travel_max = 200.0
        
        # Parámetros Biométricos y Ajuste de Carga Estática
        self.driver_weight_kg = 70.0
        self.sag_front_mm = 40.0
        self.sag_rear_stroke_mm = 22.0

    def main(self, page: ft.Page):
        self.page = page
        self.page.title = "Universal Telemetry - Mobile Pit Suite"
        self.page.theme_mode = ft.ThemeMode.DARK
        self.page.bgcolor = "#111217"
        self.page.padding = 20
        
        self.dialogo_alerta = ft.AlertDialog(title=ft.Text("⚠️ Alerta del Sistema"))

        # --- COMPONENTE 1: HEADER / COMPAÑÍA DE CARRERAS ---
        top_bar = ft.Container(
            content=ft.Row([
                ft.Row([
                    ft.Icon("analytics", color="amber", size=28),
                    ft.Text("UNIVERSAL TELEMETRY DAQ", size=18, weight=ft.FontWeight.BOLD),
                    ft.Text("FACTORY SUITE v4.2", size=12, color="amber")
                ], spacing=10),
                ft.Row([
                    ft.ElevatedButton("🧠 Simular Corrida (1000Hz)", icon="bolt", bgcolor="#6C3483", color="white", on_click=self.generar_datos_simulados),
                    ft.ElevatedButton("📡 Sincronizar Hardware", icon="wifi", bgcolor="#1E8449", color="white", on_click=self.sincronizar_wifi_mock)
                ], spacing=12)
            ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
            padding=15, bgcolor="#1A1C24", border_radius=10, border=ft.Border.all(1, "#2E323F")
        )

        # --- COMPONENTE 2: CONFIGURACIÓN UNIVERSAL DEL VEHÍCULO Y PILOTO ---
        config_panel = ft.ExpansionTile(
            title=ft.Text("🔧 Calibración de Chasis, Componentes y Peso del Piloto", weight=ft.FontWeight.BOLD),
            controls=[
                ft.Container(
                    content=ft.Column([
                        ft.ResponsiveRow([
                            ft.TextField(col={"sm": 6, "md": 4}, label="Modelo Suspensión Delantera", value=self.front_fork_model, on_change=self.actualizar_txt_modelo_f),
                            ft.TextField(col={"sm": 6, "md": 4}, label="Modelo Amortiguador Trasero", value=self.rear_shock_model, on_change=self.actualizar_txt_modelo_r),
                            ft.TextField(col={"sm": 6, "md": 4}, label="Peso del Piloto (kg)", value=str(self.driver_weight_kg), keyboard_type=ft.KeyboardType.NUMBER, on_change=self.actualizar_peso_piloto),
                        ], run_spacing=10),
                        ft.Divider(height=10, color="#2E323F"),
                        ft.ResponsiveRow([
                            ft.TextField(col={"sm": 4, "md": 2}, label="Carrera Delantera (mm)", value=str(self.front_travel_max), keyboard_type=ft.KeyboardType.NUMBER, on_change=self.actualizar_travel_f),
                            ft.TextField(col={"sm": 4, "md": 2}, label="SAG Delantero (mm)", value=str(self.sag_front_mm), keyboard_type=ft.KeyboardType.NUMBER, on_change=self.actualizar_sag_f),
                            ft.TextField(col={"sm": 4, "md": 2}, label="Carrera Shock (mm)", value=str(self.shock_stroke_max), keyboard_type=ft.KeyboardType.NUMBER, on_change=self.actualizar_stroke_r),
                            ft.TextField(col={"sm": 4, "md": 2}, label="SAG Shock (mm)", value=str(self.sag_rear_stroke_mm), keyboard_type=ft.KeyboardType.NUMBER, on_change=self.actualizar_sag_r),
                            ft.TextField(col={"sm": 4, "md": 4}, label="Recorrido Rueda Trasera Real (mm)", value=str(self.wheel_travel_max), keyboard_type=ft.KeyboardType.NUMBER, on_change=self.actualizar_wheel_r),
                        ], run_spacing=10),
                    ]), padding=20, bgcolor="#16181F"
                )
            ]
        )

        # --- COMPONENTE 3: CONTENEDORES DE INSTRUMENTAL DINÁMICO ---
        self.txt_ia_report = ft.Text("🧠 Motor analítico en espera de registros...\nPresione el botón morado 'Simular Corrida' para inyectar telemetría en vivo.", font_family="monospace", size=13, color="#00FF66")
        self.txt_notes = ft.TextField(label="Historial Clínico de Pista / Anotaciones Técnicas", multiline=True, min_lines=5, hint_text="Ingrese condiciones ambientales, clicks hidráulicos basales, compuestos de neumáticos...")

        self.barra_delantera = ft.ProgressBar(value=0, height=15, color="yellow", bgcolor="#2E323F")
        self.barra_trasera = ft.ProgressBar(value=0, height=15, color="magenta", bgcolor="#2E323F")
        self.lbl_f_mm = ft.Text("Eje Delantero: 0.0 mm (Mapeo inactivo)", size=14, weight=ft.FontWeight.W_600)
        self.lbl_r_mm = ft.Text("Eje Trasero Real: 0.0 mm (Mapeo inactivo)", size=14, weight=ft.FontWeight.W_600)

        # Tableros de Vistas Táctiles
        self.vista_suspension = ft.Container(
            content=ft.Column([
                ft.Text("📊 PANEL DE ADQUISICIÓN DE DATOS EN VIVO", size=16, weight=ft.FontWeight.BOLD),
                ft.Row([
                    ft.Container(content=ft.Column([self.lbl_f_mm, ft.Container(content=self.barra_delantera, border_radius=5)]), bgcolor="#1A1C24", padding=20, border_radius=10, expand=True, border=ft.Border.all(1, "#2E323F")),
                    ft.Container(content=ft.Column([self.lbl_r_mm, ft.Container(content=self.barra_trasera, border_radius=5)]), bgcolor="#1A1C24", padding=20, border_radius=10, expand=True, border=ft.Border.all(1, "#2E323F"))
                ], spacing=15),
            ]), padding=10, visible=True
        )

        self.vista_ia = ft.Container(
            content=ft.Column([
                ft.Text("🤖 ASISTENTE LOGÍSTICO AUTOMATIZADO DE AJUSTES", size=16, weight=ft.FontWeight.BOLD),
                ft.ElevatedButton("🧠 Procesar Diagnóstico e Ingeniería de Válvulas", icon="analytics", bgcolor="#8E44AD", color="white", height=45, on_click=self.ejecutar_ia),
                ft.Container(content=self.txt_ia_report, bgcolor="#0D0E12", padding=20, border_radius=10, border=ft.Border.all(1, "#2E323F"), expand=True)
            ]), padding=10, visible=False
        )

        self.vista_notes = ft.Container(
            content=ft.Column([
                ft.Text("📝 BITÁCORA GENERAL DE BOXES", size=16, weight=ft.FontWeight.BOLD),
                self.txt_notes,
                ft.ElevatedButton("💾 Almacenar Registro Técnico", icon="save", bgcolor="#2E4053", color="white")
            ]), padding=10, visible=False
        )

        self.contenedor_pantallas = ft.Column(controls=[self.vista_suspension, self.vista_ia, self.vista_notes], expand=True)

        # --- COMPONENTE 4: SELECTOR DE PESTAÑAS UNIVERSAL ---
        self.btn_tab_susp = ft.ElevatedButton("📊 Suspension View", bgcolor="amber", color="black", on_click=lambda _: self.cambiar_pestana_manual(0))
        self.btn_tab_ia = ft.ElevatedButton("🤖 Auto Tuning IA", bgcolor="#2E323F", color="white", on_click=lambda _: self.cambiar_pestana_manual(1))
        self.btn_tab_notes = ft.ElevatedButton("📝 Run Notes", bgcolor="#2E323F", color="white", on_click=lambda _: self.cambiar_pestana_manual(2))
        
        selector_consola = ft.Container(
            content=ft.Row([self.btn_tab_susp, self.btn_tab_ia, self.btn_tab_notes], alignment=ft.MainAxisAlignment.START, spacing=10),
            padding=10
        )

        self.file_picker = ft.FilePicker()

        # --- INYECCIÓN DIRECTA Y NATIVA A LA PÁGINA (MÉTODO BLINDADO) ---
        self.page.add(
            top_bar, 
            ft.Divider(height=10, color="transparent"), 
            config_panel, 
            selector_consola, 
            self.contenedor_pantallas
        )
        self.page.update()

    def cambiar_pestana_manual(self, idx):
        self.vista_suspension.visible = (idx == 0)
        self.vista_ia.visible = (idx == 1)
        self.vista_notes.visible = (idx == 2)
        
        self.btn_tab_susp.bgcolor = "amber" if idx == 0 else "#2E323F"
        self.btn_tab_susp.color = "black" if idx == 0 else "white"
        self.btn_tab_ia.bgcolor = "amber" if idx == 1 else "#2E323F"
        self.btn_tab_ia.color = "black" if idx == 1 else "white"
        self.btn_tab_notes.bgcolor = "amber" if idx == 2 else "#2E323F"
        self.btn_tab_notes.color = "black" if idx == 2 else "white"
        self.page.update()

    def generar_datos_simulados(self, e):
        """Generador universal de ruido blanco y dinámica amortiguada (1000 Hz)"""
        puntos = 5000
        time_ms = np.arange(0, puntos)
        
        comp_f = (500 + 400 * np.sin(time_ms / 100) + np.random.normal(0, 30, puntos)).clip(0, 1023)
        comp_r = (450 + 350 * np.sin(time_ms / 120) + np.random.normal(0, 25, puntos)).clip(0, 1023)
        comp_f[2400:2550] = 1015
        
        self.df = pd.DataFrame({
            'Time(ms)': time_ms, 'Horq(raw)': comp_f, 'Shock(raw)': comp_r,
            'AccX_16G': np.random.normal(0, 0.1, puntos), 'AccZ_200G': 5.5,
            'Alt(m)': 1200 - (time_ms / 40), 'Vel_GPS': np.random.uniform(25, 50, puntos),
            'Vel_Rueda': np.random.uniform(25, 50, puntos)
        })
        
        self.actualizar_graficos_móviles()
        self.page.snack_bar = ft.SnackBar(ft.Text("✅ Corrida de telemetría a 1000 Hz simulada con éxito."))
        self.page.snack_bar.open = True
        self.page.update()

    def actualizar_graficos_móviles(self):
        if self.df is None: return
        
        lev_factor = self.wheel_travel_max / self.shock_stroke_max
        max_f_raw = self.df['Horq(raw)'].max()
        max_r_raw = self.df['Shock(raw)'].max()
        
        f_travel_measured = (max_f_raw / 1023.0) * self.front_travel_max
        r_stroke_measured = (max_r_raw / 1023.0) * self.shock_stroke_max
        
        f_dinamico = max(0.0, f_travel_measured - self.sag_front_mm)
        r_wheel_dinamico = max(0.0, (r_stroke_measured - self.sag_rear_stroke_mm) * lev_factor)
        
        f_util_restante = self.front_travel_max - self.sag_front_mm
        r_util_restante = self.wheel_travel_max - (self.sag_rear_stroke_mm * lev_factor)
        
        self.lbl_f_mm.value = f"Eje Delantero [{self.front_fork_model}] (Compresión Máxima): {f_dinamico:.1f} mm / {f_util_restante:.1f} mm útiles (SAG deducido)"
        self.barra_delantera.value = f_dinamico / f_util_restante if f_util_restante > 0 else 0
        
        self.lbl_r_mm.value = f"Eje Trasero Real [{self.rear_shock_model}] (Compresión Máxima): {r_wheel_dinamico:.1f} mm / {r_util_restante:.1f} mm útiles"
        self.barra_trasera.value = r_wheel_dinamico / r_util_restante if r_util_restante > 0 else 0
        
        self.page.update()
    def ejecutar_ia(self, e):
        if self.df is None: return
        
    lev_factor = self.wheel_travel_max / self.shock_stroke_max
    max_f_raw = self.df['Horq(raw)'].max()
    f_travel_measured = (max_f_raw / 1023.0) * self.front_travel_max
    acc200_max = self.df['AccZ_200G'].max()
    
    pct_sag_f = (self.sag_front_mm / self.front_travel_max) * 100
    pct_sag_r = (self.sag_rear_stroke_mm / self.shock_stroke_max) * 100
    
    reporte = "===============================================================\n"
    reporte += "🤖 REPORTES DE INGENIERÍA DE SUSPENSIONES\n"
    reporte += "===============================================================\n\n"
    reporte += f"• Setup Delantero: Componente '{self.front_fork_model}' | Setup Trasero: Componente '{self.rear_shock_model}'\n"
    reporte += f"• Relación de Palanca de Chasis Evaluada: {lev_factor:.2f}:1\n"
    reporte += f"• Peso del Piloto: {self.driver_weight_kg} kg.\n\n"
    reporte += "📊 CONTROL MATEMÁTICO DE SAG ESTÁTICO (PESO VS. PRECARGA):\n"
    reporte += "---------------------------------------------------------------\n"
    reporte += f"  - SAG Delantero Actual: {pct_sag_f:.1f}% del recorrido total.\n"
    if pct_sag_f < 15.0:
        reporte += f"    ⚠️ ALERTA: SAG demasiado rígido para {self.driver_weight_kg}kg. Reducir precarga o presión de aire.\n"
    elif pct_sag_f > 30.0:
        reporte += f"    ⚠️ ALERTA: SAG demasiado blando. Incrementar precarga de resorte o presión.\n"
    else:reporte += "    ✅ SAG Delantero dentro del rango óptimo de competencia.\n"
    reporte += f"\n  - SAG Trasero Actual (En Amortiguador): {pct_sag_r:.1f}% de la carrera útil.\n"
    if pct_sag_r < 20.0:
        reporte += "    ⚠️ ALERTA: Tren trasero excesivamente firme. Abrir cámara o reducir dureza.\n"
    elif pct_sag_r > 35.0:
        reporte += "    ⚠️ ALERTA: Riesgo de hundimiento por fatiga estática. Incrementar dureza.\n"
    else:reporte += "    ✅ SAG Trasero dentro del estándar eficiente de tracción.\n\n"
    reporte += "🛠️ PROPUESTA DE CALIBRACIÓN HIDRÁULICA DINÁMICA:\n"
    reporte += "---------------------------------------------------------------\n"
    if f_travel_measured > (self.front_travel_max * 0.95) or acc200_max > 4.5:
        reporte += f"💥 EVENTO CRÍTICO: Tope mecánico detectado en eje delantero por impacto de {acc200_max:.1f} Gs.\n"
        reporte += "👉 ACCIÓN: Cerrar 2 clics de compresión de alta velocidad (HSC) o agregar espaciadores de volumen (Tokens).\n"
    else:reporte += "✅ Hidráulico dinámico operando con correcto margen de reserva mecánica.\n"
    self.txt_ia_report.value = reporte
    self.page.update()
def on_file_picked(self, e): 
    pass
def sincronizar_wifi_mock(self, e):
    pass
def actualizar_txt_modelo_f(self, e):
    self.front_fork_model = e.control.value
def actualizar_txt_modelo_r(self, e): 
    self.rear_shock_model = e.control.value
def actualizar_peso_piloto(self, e):
    try: self.driver_weight_kg = float(e.control.value)
    except: pass
def actualizar_sag_f(self, e):
    try: self.sag_front_mm = float(e.control.value); self.actualizar_graficos_móviles()
    except: pass
def actualizar_sag_r(self, e):
    try: self.sag_rear_stroke_mm = float(e.control.value); self.actualizar_graficos_móviles()
    except: pass
def actualizar_travel_f(self, e):
    try: self.front_travel_max = float(e.control.value); self.actualizar_graficos_móviles()
    except: pass
def actualizar_stroke_r(self, e):
    try: self.shock_stroke_max = float(e.control.value); self.actualizar_graficos_móviles()
    except: pass
def actualizar_wheel_r(self, e):
    try: self.wheel_travel_max = float(e.control.value); self.actualizar_graficos_móviles()
    except: pass

if __name__ == "__main__":
    app_tablet = TelemetriaUniversalApp()
    ft.app(target=app_tablet.main)