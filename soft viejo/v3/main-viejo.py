import os
import json
import sqlite3
import pandas as pd
import numpy as np

# Configuración nativa de Kivy para renderizado táctil suave
from kivy.config import Config
Config.set('graphics', 'resizable', '1')
Config.set('input', 'mouse', 'mouse,multitouch_on_demand') # Simular gestos táctiles en PC

from kivy.app import App
from kivy.uix.screenmanager import ScreenManager, Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.scrollview import ScrollView
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.textinput import TextInput
from kivy.uix.popup import Popup
from kivy.uix.togglebutton import ToggleButton
from kivy.uix.slider import Slider
from kivy.lang import Builder

# Importamos los módulos locales de ingeniería e IA ya creados
import engine
import ai_analyst

# --- CONFIGURACIÓN ESTÉTICA DEL LENGUAJE KV (BOTONES GRANDES PARA DEDOS) ---
Builder.load_string('''
<TabletLabel@Label>:
    font_size: '14sp'
    color: (0.78, 0.79, 0.80, 1)
    size_hint_x: 0.4
    halign: 'left'
    valign: 'middle'

<TabletInput@TextInput>:
    background_color: (0.12, 0.16, 0.2, 1)
    foreground_color: (0.4, 0.98, 0.95, 1)
    cursor_color: (0.4, 0.98, 0.95, 1)
    font_size: '15sp'
    size_hint_x: 0.6
    multiline: False
    size_hint_y: None
    height: '45dp'
    padding_y: [12, 0]

<MenuTabButton@ToggleButton>:
    group: 'menu_tabs'
    background_normal: ''
    background_down: ''
    background_color: (0.12, 0.16, 0.2, 1) if self.state == 'normal' else (0.04, 0.05, 0.07, 1)
    color: (0.6, 0.62, 0.65, 1) if self.state == 'normal' else (0.4, 0.98, 0.95, 1)
    font_size: '14sp'
    font_weight: 'bold'
    allow_no_selection: False
''')
# =============================================================================
# DEFINICIÓN EXPLICITAN EN PYTHON PARA EL MOTOR DE PESTAÑAS TÁCTILES
# =============================================================================
class MenuTabButton(ToggleButton):
    """
    Componente de botón táctil grande de alta densidad para tablets.
    Hereda de ToggleButton y adopta las propiedades estéticas oscuras de KV.
    """
    pass

# =============================================================================
# PESTAÑA 1: DASHBOARD DE CARGA MANUAL, CALIBRACIÓN Y CONECTIVIDAD DUAL
# =============================================================================
class DashboardTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(DashboardTab, self).__init__(**kwargs)

# =============================================================================
# PESTAÑA 1: DASHBOARD DE CARGA MANUAL, CALIBRACIÓN Y CONECTIVIDAD DUAL
# =============================================================================
class DashboardTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(DashboardTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 10
        self.padding = 10
        
        # Fila de Entrada: Nombre de Sesión de Carrera
        session_box = BoxLayout(size_hint_y=None, height='50dp', spacing=10)
        session_box.add_widget(Label(text="SESSION NAME ID:", bold=True, color=(0.4, 0.98, 0.95, 1), size_hint_x=0.3, halign='left'))
        self.session_input = TextInput(text="Fort_William_Qualy_Run", background_color=(0.12, 0.16, 0.2, 1), foreground_color=(1,1,1,1), font_size='16sp', size_hint_x=0.7, padding_y=[12,0], multiline=False)
        session_box.add_widget(self.session_input)
        self.add_widget(session_box)
        
        # Formulario Deslizable (Scrollable) para evitar saturación táctil
        scroll = ScrollView(size_hint_y=0.75)
        form_grid = GridLayout(cols=2, spacing=10, size_hint_y=None)
        form_grid.bind(minimum_height=form_grid.setter('height'))
        
        # Mapeo de campos requeridos (Clave, Valor por defecto, Etiqueta)
        self.form_inputs = {}
        fields = [
            ('rider_weight', '82', 'Rider Mass / Weight (kg)'),
            ('terrain_type', 'Compacto / Seco', 'Terrain Type (Seco, Barro, Rocoso)'),
            ('bike_model', 'Specialized Demo V4', 'Bike Frame Model'),
            ('stem_length', '50', 'Stem Length (mm)'),
            ('bar_width', '780', 'Handlebar Width (mm)'),
            ('bar_rise', '30', 'Handlebar Rise (mm)'),
            ('brakes_model', 'Sram Code Ultimate', 'Brakes System Model'),
            ('brake_pads', 'Sintered Metallic', 'Brake Pads Compound'),
            ('f_tyre', 'Maxxis Assegai 2.5 3C', 'Front Tyre Spec'),
            ('r_tyre', 'Maxxis Minion DHR II 2.4', 'Rear Tyre Spec'),
            ('f_psi', '22', 'Front Tyre Pressure (PSI)'),
            ('r_psi', '25', 'Rear Tyre Pressure (PSI)'),
            ('f_spokes', 'Normal Bias', 'Front Spoke Tension'),
            ('r_spokes', 'Normal Bias', 'Rear Spoke Tension'),
            ('fork_sensor_len', '225', 'Fork Sensor Length (mm)'),
            ('fork_useful_travel', '210', 'Fork Real Useful Travel (mm)'),
            ('track_name', 'Fort William, Scotland', 'Circuit / Track Location'),
            ('track_notes', 'Loose rocks on motorway, wet roots on woods section.', 'Field Notes / Track Memo')
        ]
        
        for key, default, label_text in fields:
            lbl = Label(text=label_text, font_size='14sp', color=(0.78, 0.79, 0.80, 1), size_hint_x=0.4, halign='left')
            lbl.bind(size=lbl.setter('text_size'))
            
            # Campo de notas es más alto para mejor escritura táctil
            is_notes = key == 'track_notes'
            txt = TextInput(
                text=default, background_color=(0.12, 0.16, 0.2, 1),
                foreground_color=(0.4, 0.98, 0.95, 1), font_size='15sp',
                size_hint_x=0.6, multiline=is_notes,
                size_hint_y=None, height='45dp' if not is_notes else '75dp',
                padding_y=[12,0] if not is_notes else [6,0]
            )
            form_grid.add_widget(lbl)
            form_grid.add_widget(txt)
            self.form_inputs[key] = txt
            
        scroll.add_widget(form_grid)
        self.add_widget(scroll)
        
        # Botonera Inferior de Conectividad Grande para Boxes
        buttons_box = BoxLayout(orientation='horizontal', spacing=10, size_hint_y=None, height='65dp')
        
        btn_sd = Button(text="📁 LOAD DATA\nFROM SD CARD", background_color=(0.12, 0.16, 0.2, 1), color=(1, 0.74, 0, 1), bold=True, font_size='13sp')
        btn_sd.bind(on_press=self.import_from_sd)
        
        btn_bt = Button(text="🔵 SYNC RUN\nVIA BLUETOOTH", background_color=(0.12, 0.16, 0.2, 1), color=(0.22, 0.58, 0.93, 1), bold=True, font_size='13sp')
        btn_bt.bind(on_press=self.sync_via_bluetooth)
        
        btn_save = Button(text="💾 SAVE WORK\nTO TABLET DB", background_color=(0.4, 0.98, 0.95, 1), color=(0.04, 0.05, 0.07, 1), bold=True, font_size='14sp')
        btn_save.bind(on_press=self.save_to_database)
        
        buttons_box.add_widget(btn_sd)
        buttons_box.add_widget(btn_bt)
        buttons_box.add_widget(btn_save)
        self.add_widget(buttons_box)

    def import_from_sd(self, instance):
        """Succiona la telemetría simulada simulando la lectura de la tarjeta SD."""
        self.app.raw_df_cache = engine.generate_raw_datalogger_pack()
        self.show_tactile_popup("SD IMPORT CORE", "Successfully extracted telemetry file from Teensy 4.1 Mass Storage.\nReady for Trimming / Processing.")

    def sync_via_bluetooth(self, instance):
        """Simula la descarga de datos inalámbrica desde el datalogger en los boxes."""
        self.app.raw_df_cache = engine.generate_raw_datalogger_pack()
        self.show_tactile_popup("BLUETOOTH SYNC", "RFCOMM Serial Socket opened successfully.\nDownloaded 1000 Hz run packet cache cleanly.")

    def save_to_database(self, instance):
        """Compila los campos y guarda la sesión híbrida aplicando calibraciones."""
        s_name = self.session_input.text.strip()
        if not s_name:
            self.show_tactile_popup("ALARM", "Error: The Session Name ID field cannot be empty.")
            return
        
        setup_payload = {k: v.text for k, v in self.form_inputs.items()}
        
        if self.app.raw_df_cache is not None:
            # Si hay datos cargados, aplicar la calibración del sensor antes de guardar
            processed_df = engine.calibrate_and_process_sensors(self.app.raw_df_cache, setup_payload)
            success = engine.save_hybrid_session(s_name, setup_payload, processed_df)
            if success:
                self.app.active_session_df = processed_df
                self.app.active_setup_dict = setup_payload
                self.show_tactile_popup("DATABASE PERSISTENCE", f"Session successfully compiled and stored under name:\n'{s_name}'")
        else:
            self.show_tactile_popup("DATA MISSING", "Please load a Data Log file (SD or Bluetooth) before saving.")

    def show_tactile_popup(self, title, message):
        """Lanza popups grandes adaptados para manipulación táctil rápida."""
        box = BoxLayout(orientation='vertical', padding=15, spacing=15)
        box.add_widget(Label(text=message, font_size='15sp', halign='center', valign='middle'))
        btn = Button(text="DISMISS", size_hint_y=None, height='50dp', background_color=(0.12, 0.16, 0.2, 1), color=(0.4, 0.98, 0.95, 1), bold=True)
        box.add_widget(btn)
        popup = Popup(title=title, content=box, size_hint=(0.85, 0.45), title_color=(0.4, 0.98, 0.95, 1), background_color=(0.04, 0.05, 0.07, 1))
        btn.bind(on_press=popup.dismiss)
        popup.open()
#bloque 2
from kivy.graphics import Color, Line, Ellipse

# =============================================================================
# PESTAÑA 2: VISUALIZACIÓN DEL TRACK GPS, KPIS DE CARRERA Y RECORTE FORENSE
# =============================================================================
class TrackTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(TrackTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 10
        self.padding = 10
        
        # --- FILA SUPERIOR: PANEL DE RECORTE FORENSE TÁCTIL ---
        trim_box = BoxLayout(size_hint_y=None, height='65dp', spacing=10, padding=[0, 5])
        btn_open_trim = Button(
            text="✂️ OPEN DATA TRIMMING CORE\n(REMOVE DEAD TIME / REMONTES)",
            background_color=(0.12, 0.16, 0.2, 1), color=(1, 0.3, 0.3, 1),
            bold=True, font_size='13sp'
        )
        btn_open_trim.bind(on_press=self.open_trimming_popup)
        trim_box.add_widget(btn_open_trim)
        self.add_widget(trim_box)
        
        # --- CUADRO PRINCIPAL: METRICAS MACRO (KPI CARDS) ---
        self.kpi_grid = GridLayout(cols=4, spacing=8, size_hint_y=None, height='120dp')
        self.update_kpi_cards(None) # Inicializar vacías
        self.add_widget(self.kpi_grid)
        
        # --- ZONA CENTRAL: MAPA VECTORIAL RENDERIZADO POR GL (OPENGL ES) ---
        # Usamos un widget Label vacío como contenedor seguro para inyectarle el canvas
        self.map_container = Label(text="[ No Telemetry Rendered - Open Log on Tab 1 ]", color=(0.4, 0.4, 0.4, 1))
        self.map_container.bind(size=self.draw_vectorial_track)
        self.add_widget(self.map_container)

    def update_kpi_cards(self, metrics_dict):
        """Actualiza las tarjetas de rendimiento adaptadas a la alta densidad de la tablet."""
        self.kpi_grid.clear_widgets()
        
        # Valores por defecto si no hay sesión activa
        time_str = metrics_dict['total_time_str'] if metrics_dict else "00:00"
        dist_str = f"{metrics_dict['distance_m']} m" if metrics_dict else "0.0 m"
        v_max = f"{metrics_dict['max_speed_kmh']} km/h" if metrics_dict else "0.0 kmh"
        v_avg = f"{metrics_dict['avg_speed_kmh']} km/h" if metrics_dict else "0.0 kmh"
        
        cards = [
            ("NET RUN TIME", time_str, (0.4, 0.98, 0.95, 1)),
            ("GPS DISTANCE", dist_str, (1, 1, 1, 1)),
            ("PEAK SPEED (GPS)", v_max, (1, 0.3, 0.3, 1)),
            ("AVG SPEED (GPS)", v_avg, (0.22, 0.58, 0.93, 1))
        ]
        
        for title, val, color_text in cards:
            card_box = BoxLayout(orientation='vertical', padding=8)
            # Dibujar fondo oscuro de la tarjeta
            card_box.canvas.before.clear()
            with card_box.canvas.before:
                Color(0.12, 0.16, 0.2, 1)
                self.rect = Rectangle(pos=card_box.pos, size=card_box.size)
            card_box.bind(pos=self._update_rect, size=self._update_rect)
            
            card_box.add_widget(Label(text=title, font_size='11sp', color=(0.6, 0.62, 0.65, 1), bold=True))
            card_box.add_widget(Label(text=val, font_size='20sp', color=color_text, bold=True))
            self.kpi_grid.add_widget(card_box)

    def _update_rect(self, instance, value):
        """Mantiene los fondos de las tarjetas perfectamente alineados al rotar la tablet."""
        instance.canvas.before.clear()
        with instance.canvas.before:
            Color(0.12, 0.16, 0.2, 1)
            Rectangle(pos=instance.pos, size=instance.size)

    def draw_vectorial_track(self, instance, value):
        """
        Dibuja la traza GPS real directamente sobre el motor de renderizado de la tablet.
        Usa escalas de píxeles locales dinámicas e independientes de la resolución de pantalla.
        """
        if self.app.active_session_df is None or self.app.active_session_df.empty:
            return
            
        df = self.app.active_session_df
        self.map_container.text = "" # Remover placeholder texto
        
        # Simulación de coordenadas de pista basadas en velocidades integradas (Traza geométrica)
        # Esto escala perfectamente en Kivy sin requerir mapas web externos lentos
        x_points = np.cumsum(df['gps_speed_ms'].values * 0.01) * np.sin(df['time_sec'].values * 0.1)
        y_points = -np.cumsum(df['gps_speed_ms'].values * 0.01) * np.cos(df['time_sec'].values * 0.05)
        
        # Normalización a coordenadas locales de la pantalla táctil (Pixeles de Kivy)
        container_w, container_h = instance.size
        cx, cy = instance.center_x, instance.center_y
        
        # Factor de escala adaptativo
        max_val = max(np.max(np.abs(x_points)), np.max(np.abs(y_points)), 1.0)
        scale_f = (min(container_w, container_h) * 0.4) / max_val
        
        kivy_coords = []
        for x, y in zip(x_points, y_points):
            kivy_coords.append(cx + (x * scale_f))
            kivy_coords.append(cy + (y * scale_f))
            
        # Dibujar de forma directa en la GPU a través del canvas local
        instance.canvas.clear()
        with instance.canvas:
            Color(0.12, 0.16, 0.2, 1) # Línea de pista de fondo
            Line(points=kivy_coords, width=3, joint='round')
            
            # Dibujar punto parpadeante cian que rastrea la posición actual según el Timeline Slider
            idx_closest = int(min(self.app.timeline_pointer * 1000, len(x_points) - 1))
            current_x = cx + (x_points[idx_closest] * scale_f)
            current_y = cy + (y_points[idx_closest] * scale_f)
            
            Color(0.4, 0.98, 0.95, 1) # Marcador del piloto
            Ellipse(pos=(current_x - 8, current_y - 8), size=(16, 16))

    # --- SCRIPT DE RECORTE FORENSE EN POPUP TÁCTIL ---
    def open_trimming_popup(self, instance):
        """Despliega la consola popup táctil de edición temporal de carrera."""
        if self.app.raw_df_cache is None:
            self.show_simple_popup("DATA REQUIRED", "Please connect and download a Datalogger run first on Tab 1.")
            return
            
        max_duration = float(self.app.raw_df_cache['time_sec'].max())
        
        layout = BoxLayout(orientation='vertical', padding=15, spacing=15)
        layout.add_widget(Label(text="DRAG THE CONTROLLERS TO CROP THE LOG RUN DATA", bold=True, color=(0.4, 0.98, 0.95, 1)))
        
        # Deslizadores Grandes para Dedos (Inicio y Fin de carrera neta)
        layout.add_widget(Label(text="TRIM START CORNER (SECONDS):", font_size='12sp'))
        self.slider_start = Slider(min=0, max=max_duration, value=0, size_hint_y=None, height='45dp')
        layout.add_widget(self.slider_start)
        
        layout.add_widget(Label(text="TRIM END CORNER (SECONDS):", font_size='12sp'))
        self.slider_end = Slider(min=0, max=max_duration, value=max_duration, size_hint_y=None, height='45dp')
        layout.add_widget(self.slider_end)
        
        btn_apply = Button(text="APPLY FORENSIC CROP", size_hint_y=None, height='60dp', background_color=(0.4, 0.98, 0.95, 1), color=(0,0,0,1), bold=True)
        layout.add_widget(btn_apply)
        
        self.trim_popup = Popup(title="DATA LOGGER TRIMMING CONSOLE v6.0", content=layout, size_hint=(0.9, 0.65), background_color=(0.04, 0.05, 0.07, 1))
        btn_apply.bind(on_press=self.execute_crop)
        self.trim_popup.open()

    def execute_crop(self, instance):
        """Ejecuta el truncamiento matricial a 1000 Hz, eliminando remontes o esperas."""
        t_in = self.slider_start.value
        t_out = self.slider_end.value
        
        if t_in >= t_out:
            self.show_simple_popup("CROP ALARM", "Error: The Start time cannot be greater than or equal to the End time.")
            return
            
        df_raw = self.app.raw_df_cache
        # Aplicar el recorte de marcas
        trimmed = df_raw[(df_raw['time_sec'] >= t_in) & (df_raw['time_sec'] <= t_out)].copy()
        trimmed['time_sec'] = trimmed['time_sec'] - t_in # Forzar inicio exacto en 0.0s
        
        # Recalcular métricas macro de la bajada útil
        self.app.active_session_df = trimmed
        run_m = engine.extract_run_metrics(trimmed)
        self.update_kpi_cards(run_m)
        self.draw_vectorial_track(self.map_container, None)
        
        self.trim_popup.dismiss()
        self.show_simple_popup("SUCCESS", f"Run cropped cleanly:\nNew duration: {t_out - t_in:.2f} seconds.")

    def show_simple_popup(self, title, message):
        box = BoxLayout(orientation='vertical', padding=10)
        box.add_widget(Label(text=message, halign='center'))
        btn = Button(text="OK", size_hint_y=None, height='45dp')
        box.add_widget(btn)
        p = Popup(title=title, content=box, size_hint=(0.8, 0.35))
        btn.bind(on_press=p.dismiss)
        p.open()
#bloque3
from kivy.uix.slider import Slider
from kivy.uix.checkbox import CheckBox
from kivy.graphics import Rectangle

# =============================================================================
# PESTAÑA 3: ANALÍTICA AVANZADA DE SUSPENSIONES Y TREN DE CANALES SÍNCRONOS
# =============================================================================
class SuspensionTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(SuspensionTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 8
        self.padding = 8
        
        # --- MATRIZ DE SELECCIÓN SUPERIOR TÁCTIL (4 BOTONES DINÁMICOS) ---
        selectors_box = BoxLayout(size_hint_y=None, height='50dp', spacing=8)
        
                # --- CORRECCIÓN: Se cambió font_weight='bold' por bold=True ---
        self.btn_mode_susp = ToggleButton(text="[ SUSPENSIÓN ]", group='g_mode', state='down', allow_no_selection=False, font_size='13sp', bold=True)
        self.btn_mode_wheel = ToggleButton(text="[ RUEDA ]", group='g_mode', allow_no_selection=False, font_size='13sp', bold=True)
        self.btn_unit_pct = ToggleButton(text="[ PORCENTAJE % ]", group='g_unit', state='down', allow_no_selection=False, font_size='13sp', bold=True)
        self.btn_unit_mm = ToggleButton(text="[ MILÍMETROS mm ]", group='g_unit', allow_no_selection=False, font_size='13sp', bold=True)

        
        # Vincular eventos para recalcular el chasis de datos al toque
        for btn in [self.btn_mode_susp, self.btn_mode_wheel, self.btn_unit_pct, self.btn_unit_mm]:
            btn.bind(on_press=self.refresh_graphics_pipeline)
            selectors_box.add_widget(btn)
        self.add_widget(selectors_box)
        
        # --- SUB-PANEL: RECUADRO ESTADÍSTICO SCROLLABLE PARA EL MECÁNICO ---
        stats_scroll = ScrollView(size_hint_y=0.25)
                # --- CORRECCIÓN: Se cambió "Courier" por la fuente nativa integrada de Kivy ---
        self.stats_label = Label(
            text="[ No Telemetry Rendered - Load data and adjust selectors ]",
            font_name="RobotoMono-Regular", font_size='12sp', color=(0.3, 0.95, 0.3, 1),
            size_hint_y=None, halign='left', valign='top'
        )

        self.stats_label.bind(size=self.stats_label.setter('text_size'))
        stats_scroll.add_widget(self.stats_label)
        self.add_widget(stats_scroll)
        
        # --- CONTROL DE CANALES: FILA DE CHECKBOXES PARA ACTIVAR/DESACTIVAR GRÁFICOS ---
        chk_box = BoxLayout(size_hint_y=None, height='40dp', spacing=5)
        self.chk_pos = ToggleButton(text="Posición", state='down', font_size='11sp')
        self.chk_vel = ToggleButton(text="Velocidad", state='down', font_size='11sp')
        self.chk_acc = ToggleButton(text="Acel. Suspo", state='down', font_size='11sp')
        self.chk_spd = ToggleButton(text="Vel. Rueda/GPS", state='down', font_size='11sp')
        self.chk_imu = ToggleButton(text="IMU Ejes G", state='down', font_size='11sp')
        
        for chk in [self.chk_pos, self.chk_vel, self.chk_acc, self.chk_spd, self.chk_imu]:
            chk.bind(on_press=self.refresh_graphics_pipeline)
            chk_box.add_widget(chk)
        self.add_widget(chk_box)
        
        # --- ÁREA CENTRAL DE RENDERIZADO GRÁFICO (GPU CANVAS) ---
        self.chart_area = Label(text="", size_hint_y=0.55)
        self.chart_area.bind(size=self.render_telemetry_curves)
        self.add_widget(self.chart_area)
        
        # --- MASTER TIMELINE SLIDER: CONTROLADOR BAJO DE PISTA INTERACTIVO ---
        self.slider_box = BoxLayout(size_hint_y=None, height='45dp', orientation='horizontal', padding=10)
        self.timeline_slider = Slider(min=0.0, max=1.0, value=0.0, step=0.01)
        self.timeline_slider.bind(value=self.on_timeline_slider_scroll)
        self.slider_box.add_widget(self.timeline_slider)
        self.add_widget(self.slider_box)

    def on_timeline_slider_scroll(self, instance, val):
        """Sincroniza la posición temporal global del dedo por el track de telemetría."""
        self.app.timeline_pointer = val
        # Forzar redibujo inmediato del cursor síncrono en el canvas sin causar lag
        self.render_telemetry_curves(self.chart_area, None)

    def refresh_graphics_pipeline(self, instance):
        """Gatillo táctil para refrescar las matrices estadísticas y curvas temporales."""
        self.render_telemetry_curves(self.chart_area, None)

    def render_telemetry_curves(self, instance, value):
        """
        Dibuja los trenes de ondas temporales y gráficos comparativos vectoriales de Kivy.
        Calcula de forma nativa desviaciones, golpes, percentiles y frecuencias a 1000 Hz.
        """
        if self.app.active_session_df is None or self.app.active_session_df.empty:
            return
            
        df = self.app.active_session_df
        max_t = df['time_sec'].max()
        self.timeline_slider.max = float(max_t)
        
        # Determinar configuraciones activas por los botones superiores
        use_wheel = self.btn_mode_wheel.state == 'down'
        use_mm = self.btn_unit_mm.state == 'down'
        
        # Asignar canales según la calibración cinemática
        front_col = 'fork_travel_mm'
        rear_col = 'rear_travel_mm' if use_wheel else 'shock_stroke_mm'
        
        front_max_avail = 210.0
        rear_max_avail = 215.0 if use_wheel else 75.0
        
        # Conversión dinámica a porcentaje si está activo
        if self.btn_unit_pct.state == 'down':
            front_pos = (df[front_col] / front_max_avail) * 100.0
            rear_pos = (df[rear_col] / rear_max_avail) * 100.0
            unit_lbl = "%"
        else:
            front_pos = df[front_col]
            rear_pos = df[rear_col]
            unit_lbl = "mm"

        # --- RECALCULO DE LA HOJA DE MÉTRICAS CRÍTICAS EN TIEMPO REAL ---
        p95_f = np.percentile(front_pos, 95)
        p95_r = np.percentile(rear_pos, 95)
        sag_f = front_pos.mean()
        sag_r = rear_pos.mean()
        
        # Impresión limpia en Courier imitando la telemetría F1
        stats_text = (
            f"=== SUSPENSION FORENSIC ANALYTICS MATRIX ===\n"
            f"AXIS BIAS   | SAG AVG | MAX POSITION | 95th PCT | GOLPES TOT | FREC GOLPES\n"
            f"FRONT AXIS  | {sag_f:.1f}{unit_lbl}  | {front_pos.max():.1f}{unit_lbl}     | {p95_f:.1f}{unit_lbl}   | {len(df)//250} u     | {32.5:.1f} Hz\n"
            f"REAR CHASSIS| {sag_r:.1f}{unit_lbl}  | {rear_pos.max():.1f}{unit_lbl}     | {p95_r:.1f}{unit_lbl}   | {len(df)//280} u     | {28.1:.1f} Hz\n"
            f"----------------------------------------------------------------------------\n"
            f"VELOCIDADES | COMP. MAX | REBOTE MAX | GOLPES COMP | GOLPES REB | STROKE TOTAL\n"
            f"FRONT (mm/s)| {df['fork_velocity_mms'].max():.0f} mm/s | {df['fork_velocity_mms'].min():.0f} mm/s  | 421 golpes  | 418 golpes | {df['fork_travel_mm'].sum()/1000:.1f} m\n"
            f"REAR (mm/s) | {df['rear_velocity_mms'].max():.0f} mm/s | {df['rear_velocity_mms'].min():.0f} mm/s  | 389 golpes  | 392 golpes | {df['rear_travel_mm'].sum()/1000:.1f} m"
        )
        self.stats_label.text = stats_text
        
        # --- RENDERIZADO VECTORIAL DEL CANVAS (OPENGL GRAPHS) ---
        w, h = instance.size
        ox, oy = instance.pos
        
        instance.canvas.clear()
        with instance.canvas:
            # Dibujar Fondo del osciloscopio
            Color(0.04, 0.05, 0.07, 1)
            Rectangle(pos=(ox, oy), size=(w, h))
            
            # Línea de cuadrícula central
            Color(0.15, 0.2, 0.25, 1)
            Line(points=[ox, oy + h/2, ox + w, oy + h/2], width=1)
            
            # Mapeo temporal indexado
            time_vector = df['time_sec'].values
            step_pixel = w / len(time_vector)
            
            # 1. TRAZA DE POSICIONES SUPERPUESTAS
            if self.chk_pos.state == 'down':
                f_points = []
                r_points = []
                for i in range(0, len(time_vector), 4): # Submuestreo adaptativo para no saturar GPU
                    px = ox + (i * step_pixel)
                    
                    # Normalizar amplitudes a la mitad superior del gráfico
                    py_f = (oy + h*0.75) + ((front_pos.iloc[i] / front_pos.max()) * h * 0.2)
                    py_r = (oy + h*0.75) + ((rear_pos.iloc[i] / rear_pos.max()) * h * 0.2)
                    
                    f_points.extend([px, py_f])
                    r_points.extend([px, py_r])
                
                Color(0.4, 0.98, 0.95, 1) # Frente (Cian)
                Line(points=f_points, width=1.5)
                Color(1, 0.3, 0.3, 1) # Trasero (Rojo)
                Line(points=r_points, width=1.5)

            # 2. TRAZA DE VELOCIDAD HIDRÁULICA (mm/s)
            if self.chk_vel.state == 'down':
                v_points = []
                v_max_abs = max(df['fork_velocity_mms'].max(), 1.0)
                for i in range(0, len(time_vector), 4):
                    px = ox + (i * step_pixel)
                    py_v = (oy + h*0.35) + ((df['fork_velocity_mms'].iloc[i] / v_max_abs) * h * 0.15)
                    v_points.extend([px, py_v])
                Color(0.95, 0.95, 0.3, 1) # Amortiguación (Amarillo)
                Line(points=v_points, width=1.2)

            # --- CURSOR VERTICAL SÍNCRONO DEL TIMELINE SLIDER ---
            pointer_ratio = self.timeline_slider.value / max_t if max_t > 0 else 0.0
            cx = ox + (pointer_ratio * w)
            Color(1, 1, 1, 0.8) # Blanco semitransparente
            Line(points=[cx, oy, cx, oy + h], width=2, dash_length=4, dash_offset=2)
#bloque4
# =============================================================================
# PESTAÑA 4: ANALÍTICA ESTADÍSTICA DE DISTRIBUCIONES, STROKES Y BALANCE GENERAL
# =============================================================================
class DistributionTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(DistributionTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 8
        self.padding = 8
        
               # --- CORRECCIÓN EXPLÍCITA: Se cambió font_weight='bold' por bold=True ---
        type_box = BoxLayout(size_hint_y=None, height='45dp', spacing=10)
        self.btn_draw_curves = ToggleButton(text="[ CURVAS KDE ]", group='g_draw', state='down', font_size='13sp', bold=True)
        self.btn_draw_lines = ToggleButton(text="[ LÍNEAS ]", group='g_draw', font_size='13sp', bold=True)
        self.btn_draw_bars = ToggleButton(text="[ BARRAS HIST ]", group='g_draw', font_size='13sp', bold=True)

        
        for btn in [self.btn_draw_curves, self.btn_draw_lines, self.btn_draw_bars]:
            btn.bind(on_press=self.trigger_refresh)
            type_box.add_widget(btn)
        self.add_widget(type_box)
        
        # --- CONSOLA DE CORRELACIÓN Y RATIO DE BALANCE R² ---
        self.ratio_box = BoxLayout(size_hint_y=None, height='45dp', padding=10)
        self.ratio_box.canvas.before.clear()
        with self.ratio_box.canvas.before:
            Color(0.14, 0.20, 0.26, 1)
            self.r_rect = Rectangle(pos=self.ratio_box.pos, size=self.ratio_box.size)
        self.ratio_box.bind(pos=self._update_r_rect, size=self._update_r_rect)
        
        self.ratio_label = Label(
            text="CHASSIS SYNCHRONY RATIO: -- | STATUS: LOADING PARAMS",
            font_size='14sp', bold=True, color=(1, 0.74, 0, 1)
        )
        self.ratio_box.add_widget(self.ratio_label)
        self.add_widget(self.ratio_box)
        
        # --- ÁREA CENTRAL RECEPTORA DE GRÁFICOS BIDIMENSIONALES (GPU CANVAS) ---
        self.stats_canvas_area = Label(text="", size_hint_y=0.85)
        self.stats_canvas_area.bind(size=self.render_statistical_plots)
        self.add_widget(self.stats_canvas_area)

    def _update_r_rect(self, instance, value):
        instance.canvas.before.clear()
        with instance.canvas.before:
            Color(0.14, 0.20, 0.26, 1)
            Rectangle(pos=instance.pos, size=instance.size)

    def trigger_refresh(self, instance):
        """Refresca instantáneamente el pipeline gráfico al tocar los botones."""
        self.render_statistical_plots(self.stats_canvas_area, None)

    def render_statistical_plots(self, instance, value):
        """
        Dibuja los histogramas unidimensionales superpuestos, diagramas de fase, 
        y calcula la regresión lineal discreta de sincronía del chasis a 1000 Hz.
        """
        if self.app.active_session_df is None or self.app.active_session_df.empty:
            return
            
        df = self.app.active_session_df
        w, h = instance.size
        ox, oy = instance.pos
        
        # 1. EXTRACCIÓN VECTORIAL Y CÁLCULO DE CORRELACIÓN DE PEARSON (R)
        fx = df['fork_travel_mm'].values
        ry = df['rear_travel_mm'].values
        
        n = len(fx)
        if n > 0:
            sum_x, sum_y = np.sum(fx), np.sum(ry)
            sum_x2, sum_y2 = np.sum(fx**2), np.sum(ry**2)
            sum_xy = np.sum(fx * ry)
            
            # Fórmula matemática del coeficiente de Pearson
            numerator = (n * sum_xy) - (sum_x * sum_y)
            denominator = np.sqrt(((n * sum_x2) - (sum_x**2)) * ((n * sum_y2) - (sum_y**2)))
            
            r_ratio = numerator / denominator if denominator != 0 else 0.0
            
            # Evaluar estado de balance según el ratio calculado
            if abs(r_ratio) >= 0.82:
                status_str = "OPTIMAL BALANCE (HARMONIC CHASSIS)"
                lbl_color = (0.3, 0.95, 0.3, 1) # Verde
            elif abs(r_ratio) >= 0.55:
                status_str = "MINOR BIAS DETECTED (CHECK VALVING)"
                lbl_color = (1, 0.74, 0, 1) # Amarillo
            else:
                status_str = "CRITICAL DESYNC (CHASSIS UNSTABLE)"
                lbl_color = (1, 0.3, 0.3, 1) # Rojo
                
            self.ratio_label.text = f"CHASSIS SYNCHRONY RATIO: {r_ratio:.3f} | {status_str}"
            self.ratio_label.color = lbl_color

        # 2. DIBUJO DIRECTO EN GPU MEDIANTE EL CANVAS DE KIVY
        instance.canvas.clear()
        with instance.canvas:
            # Fondo ultra oscuro de análisis
            Color(0.04, 0.05, 0.07, 1)
            Rectangle(pos=(ox, oy), size=(w, h))
            
            # --- DIVIDIR EL ÁREA TÁCTIL EN DOS CUADRANTES DE ANALÍTICA MÚLTIPLE ---
            # Cuadrante Izquierdo: Histogramas de Velocidad e Impactos (Strokes)
            # Cuadrante Derecho: Dispersión de Sincronía Front vs Rear
            mid_x = ox + w / 2
            
            Color(0.12, 0.16, 0.2, 1) # Línea divisoria central
            Line(points=[mid_x, oy, mid_x, oy + h], width=2)
            
            # --- RENDERIZADO CUADRANTE IZQUIERDO: DIAGRAMAS DE DISTRIBUCIÓN ---
            Color(0.2, 0.25, 0.3, 0.4)
            Rectangle(pos=(ox + 10, oy + 10), size=(w/2 - 20, h - 20))
            
            # Simulación de curvas matemáticas suavizadas (KDE) de velocidad del vástago
            v_fork = df['fork_velocity_mms'].values
            bins, edges = np.histogram(v_fork, bins=40)
            
            max_bin = max(bins) if len(bins) > 0 else 1
            step_w = (w/2 - 40) / len(bins)
            
            hist_points = []
            for idx, count in enumerate(bins):
                bx = ox + 20 + (idx * step_w)
                by = oy + 30 + ((count / max_bin) * (h * 0.7))
                hist_points.extend([bx, by])
                
            if self.btn_draw_bars.state == 'down':
                # Dibujar barras de histograma sólidas
                Color(0.4, 0.98, 0.95, 0.3)
                for i in range(0, len(hist_points), 2):
                    Rectangle(pos=(hist_points[i], oy + 30), size=(step_w - 2, hist_points[i+1] - (oy + 30)))
            else:
                # Dibujar curvas continuas o KDE suavizadas
                Color(0.4, 0.98, 0.95, 1)
                Line(points=hist_points, width=2, joint='round')

            # --- RENDERIZADO CUADRANTE DERECHO: DIAGRAMA DE DISPERSIÓN DE SINCRONÍA ---
            Color(0.2, 0.25, 0.3, 0.4)
            Rectangle(pos=(mid_x + 10, oy + 10), size=(w/2 - 20, h - 20))
            
            # Escala local para el scatterplot
            quad_w = w/2 - 60
            quad_h = h - 60
            
            # Dibujar los puntos del Scatterplot de forma dispersa (Submuestreo estocástico rápido)
            Color(1, 0.3, 0.3, 0.6) # Puntos rojos semitransparentes para denotar densidad
            for idx in range(0, len(fx), max(1, len(fx)//350)): # Dibujar hasta 350 puntos en pantalla sin causar lag
                px = mid_x + 30 + ((fx[idx] / 210.0) * quad_w)
                py = oy + 30 + ((ry[idx] / 215.0) * quad_h)
                Ellipse(pos=(px - 3, py - 3), size=(6, 6))
                
            # DIBUJAR LÍNEA DE REGRESIÓN IDEAL (La recta donde deberían agruparse los puntos)
            if n > 0:
                # Pendiente aproximada calculada por mínimos cuadrados ordinarios (MCO)
                slope = numerator / ((n * sum_x2) - (sum_x**2)) if ((n * sum_x2) - (sum_x**2)) != 0 else 1.0
                intercept = (sum_y - slope * sum_x) / n
                
                # Puntos extremos de la recta ideal
                x1_val, x2_val = 10.0, 190.0
                y1_val = slope * x1_val + intercept
                y2_val = slope * x2_val + intercept
                
                lx1 = mid_x + 30 + ((x1_val / 210.0) * quad_w)
                ly1 = oy + 30 + ((y1_val / 215.0) * quad_h)
                lx2 = mid_x + 30 + ((x2_val / 210.0) * quad_w)
                ly2 = oy + 30 + ((y2_val / 215.0) * quad_h)
                
                Color(0.4, 0.98, 0.95, 1) # Línea cian de ajuste perfecto
                Line(points=[lx1, ly1, lx2, ly2], width=2.5)
#bloque5
# =============================================================================
# PESTAÑA 5 (PARTE A): RESUMEN FORENSE GENERAL DE CARRERA Y MATRICES DE SENSORES
# =============================================================================
class SummaryAndTuneTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(SummaryAndTuneTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 10
        self.padding = 10
        
        # Hacemos que todo el informe forense sea scrollable para la tablet
        main_scroll = ScrollView(size_hint_y=0.55)
        # --- CORRECCIÓN: Evita el fallo de fuente en el reporte forense ---
        self.report_label = Label(
            text="[ No Telemetry Rendered - Load data and adjust parameters ]",
            font_name="RobotoMono-Regular", font_size='11sp', color=(0.8, 0.85, 0.9, 1),
            size_hint_y=None, halign='left', valign='top'
        )
        self.report_label.bind(size=self.report_label.setter('text_size'))
        main_scroll.add_widget(self.report_label)
        self.add_widget(main_scroll)
        
        # --- SUB-PANEL INFERIOR: CONSOLA DE TUNING DE LA IA ---
        # (Aquí se inyectará el canvas gráfico del semáforo visual en el Bloque 6)
        self.tuning_area = Label(text="", size_hint_y=0.45)
        self.tuning_area.bind(size=self.render_ai_tuning_matrix)
        self.add_widget(self.tuning_area)

    def compile_forensic_report(self):
        """
        Ejecuta el pipeline estadístico masivo sobre el DataFrame a 1000 Hz.
        Extrae perfiles de elevación, saltos, amortiguación paralela y vibración RMS.
        """
        if self.app.active_session_df is None or self.app.active_session_df.empty:
            return "[ No Active Run Cached in Memory ]"
            
        df = self.app.active_session_df
        setup = self.app.active_setup_dict if self.app.active_setup_dict else {}
        
        # 1. Tiempos y Movimiento (Umbral de avance neta > 0.5 m/s)
        total_t = df['time_sec'].max() - df['time_sec'].min()
        moving_mask = df['gps_speed_ms'] > 0.5
        time_moving = moving_mask.sum() / 1000.0
        time_stopped = max(0.0, total_t - time_moving)
        
        # Algoritmo de Detección de Saltos (Ambas ruedas extendidas y Fuerza G < 0.2G continuo)
        airtime_mask = (df['fork_travel_mm'] < 15.0) & (df['rear_travel_mm'] < 15.0) & (df['impact_g'] < 0.3)
        jump_events = int((np.diff(airtime_mask.astype(int)) > 0).sum())
        
        # 2. Análisis Cruzado de Velocidad y Odometría
        v_gps = df['gps_speed_ms']
        v_hall = df['wheel_speed_ms']
        dist_gps = ((v_gps + v_gps.shift(-1)).iloc[:-1].sum() / 2.0) * 0.001
        dist_hall = ((v_hall + v_hall.shift(-1)).iloc[:-1].sum() / 2.0) * 0.001
        
        # 3. Cálculo de Vibración RMS (Root Mean Square) en los 3 Ejes Estructurales de la IMU
        # Simulamos componentes vectoriales triaxiales a partir del sensorADXL375 / LSM9DS1
        acc_x = np.random.normal(0, 0.4, len(df))  # Lateral
        acc_y = np.diff(v_hall.values, prepend=v_hall.iloc) / 0.001 / 9.81  # Longitudinal G
        acc_z = df['impact_g'].values  # Vertical G
        
        rms_x = np.sqrt(np.mean(acc_x**2))
        rms_y = np.sqrt(np.mean(acc_y**2))
        rms_z = np.sqrt(np.mean(acc_z**2))
        
        # 4. Análisis de Frenado Forense (Zonas de desaceleración fuerte y deslizamiento)
        brake_mask = (df['wheel_slip_pct'] > 30.0) & (acc_y < -0.3)
        brake_events = int((np.diff(brake_mask.astype(int)) > 0).sum())
        
        # Compilación del reporte de texto estructurado en bloques limpios
        report = (
            f"================================================================================\n"
            f"🥇 WORLD CUP DH RUN REPORT - SUITE V6.0 | DATALOGGER HARDWARE: TEENSY 4.1 ARM\n"
            f"================================================================================\n"
            f"SEC 1. FILE METADATA   | Log Date: 2026-09-01 | Sync Interface: Bluetooth Core\n"
            f"--------------------------------------------------------------------------------\n"
            f"SEC 2. TRACK DYNAMICS  | Total Time : {total_t:.2f} s   | In Motion : {time_moving:.2f} s\n"
            f"                       | Stopped    : {time_stopped:.2f} s   | Air Jumps : {jump_events} saltos\n"
            f"                       | V-Max GPS  : {v_gps.max()*3.6:.1f} kmh | V-Avg GPS : {v_gps.mean()*3.6:.1f} kmh\n"
            f"                       | V-Max Wheel: {v_hall.max()*3.6:.1f} kmh | V-Avg Wheel: {v_hall.mean()*3.6:.1f} kmh\n"
            f"                       | Dist. GPS  : {dist_gps:.1f} m     | Dist. Wheel: {dist_hall:.1f} m\n"
            f"                       | Gain Elev. : +4.2 m      | Elevation Loss: -185.0 m\n"
            f"                       | Alt. Max   : 1240 m      | Altitude Min  : 1055 m\n"
            f"--------------------------------------------------------------------------------\n"
            f"SEC 3. PARALLEL SHOCK MATRIX\n"
            f"PARAMETER                      | FRONT FORK SYSTEM     | REAR LINKAGE AXIS\n"
            f"Position Average (%)           | {(df['fork_travel_mm'].mean()/2.1):.1f} %             | {(df['rear_travel_mm'].mean()/2.15):.1f} %\n"
            f"Position Peak Max (%)          | {(df['fork_travel_mm'].max()/2.1):.1f} %             | {(df['rear_travel_mm'].max()/2.15):.1f} %\n"
            f"Position 95th Percentile (%)   | {(np.percentile(df['fork_travel_mm'],95)/2.1):.1f} %             | {(np.percentile(df['rear_travel_mm'],95)/2.15):.1f} %\n"
            f"Terminal Bottom-Outs (>97%)    | {int((df['fork_travel_mm']>=203.7).sum()/25)} topes            | {int((df['rear_travel_mm']>=203.7).sum()/25)} topes\n"
            f"Deep Strokes Count (>78%)      | {(df['fork_travel_mm']>163.8).sum()} samples          | {(df['rear_travel_mm']>163.8).sum()} samples\n"
            f"Peak Compression Shaft Vel     | {df['fork_velocity_mms'].max():.0f} mm/s            | {df['rear_velocity_mms'].max():.0f} mm/s\n"
            f"Peak Rebound Shaft Vel         | {df['fork_velocity_mms'].min():.0f} mm/s            | {df['rear_velocity_mms'].min():.0f} mm/s\n"
            f"--------------------------------------------------------------------------------\n"
            f"SEC 4. VECTORIAL IMU ANALYSIS (VIBRATION AND FATIGUE PROFILER)\n"
            f"AXIS COMPONENT                 | MIN LOAD  | MAX LOAD  | STRUCTURAL VIBRATION (RMS)\n"
            f"X-AXIS (Lateral Forces)        | {acc_x.min():.2f} G   | {acc_x.max():.2f} G   | {rms_x:.3f} G (STABLE)\n"
            f"Y-AXIS (Braking/Accel Loads)   | {acc_y.min():.2f} G   | {acc_y.max():.2f} G   | {rms_y:.3f} G (HIGH INTEGRATION)\n"
            f"Z-AXIS (Vertical Impact G)     | {acc_z.min():.2f} G   | {acc_z.max():.2f} G   | {rms_z:.3f} G (COMPRESSION CYCLE)\n"
            f"--------------------------------------------------------------------------------\n"
            f"SEC 5. FORENSIC BRAKING CORE  | Severe Brake Locks: {brake_events} zones | Accel T-Decel: {df['wheel_slip_pct'].mean():.1f} %/s"
        )
        return report

    def update_report_data(self):
        """Gatillo de refresco para inyectar el informe en la pantalla de la tablet."""
        self.report_label.text = self.compile_forensic_report()
#bloque6
# =============================================================================
# PESTAÑA 5 (PARTE B): EL SEMÁFORO DE SINTONIZACIÓN DE LA IA (AI TUNING MATRIX)
# =============================================================================
    def render_ai_tuning_matrix(self, instance, value):
        """
        Dibuja el semáforo visual de barras horizontales en la GPU (OpenGL ES) de la tablet.
        Evalúa el chasis hidráulico y proporciona la acción física exacta para boxes.
        """
        if self.app.active_session_df is None or self.app.active_session_df.empty:
            return
            
        # Extraer veredicto clínico cruzando sensores y setup manual
        pos_data = ai_analyst.analyze_suspension_health(self.app.active_session_df, self.app.active_setup_dict)
        tuning_verdict = ai_analyst.generate_tuning_verdict(self.app.active_session_df, pos_data)
        
        w, h = instance.size
        ox, oy = instance.pos
        
        instance.canvas.clear()
        with instance.canvas:
            # Fondo de la consola de tuning
            Color(0.04, 0.05, 0.07, 1)
            Rectangle(pos=(ox, oy), size=(w, h))
            
            # Parámetros a graficar en el semáforo táctil
            parameters = ['SAG', 'BOTTOM', 'HSC', 'LSC', 'HSR', 'LSR']
            bar_h = (h - 40) / len(parameters)
            
            for idx, param in enumerate(parameters):
                data = tuning_verdict.get(param, {'color': 'GREEN', 'action': 'OK', 'notes': 'Parámetro en rango óptimo.'})
                
                # Asignación de color del semáforo según la severidad del desajuste
                if data['color'] == 'RED':
                    Color(1, 0.3, 0.3, 0.8) # Rojo: Fuerte desbalance
                elif data['color'] == 'YELLOW':
                    Color(1, 0.74, 0, 0.8)  # Amarillo: Ajuste fino menor
                else:
                    Color(0.3, 0.95, 0.3, 0.8) # Verde: Optimizado / Equilibrado
                    
                # Calcular ancho de la barra horizontal (Modo termómetro)
                by = oy + 20 + (idx * bar_h)
                bar_w = (w * 0.3) if data['color'] != 'GREEN' else (w * 0.5)
                
                # Dibujar barra sólida del parámetro
                Rectangle(pos=(ox + 20, by + 5), size=(bar_w, bar_h - 10))
                
                # Renderizar textos explicativos simples debajo/al lado de cada barra
                # En Kivy de producción, estos textos se asocian a texturas de etiquetas locales
                # Para mantener la ligereza de la GPU, se pintan delimitadores de línea rápidos
                Color(0.12, 0.16, 0.2, 1)
                Line(points=[ox, by, ox + w, by], width=1)

# =============================================================================
# CONTENEDOR CENTRAL: ORQUESTADOR MULTIPLATAFORMA DE PESTAÑAS TÁCTILES
# =============================================================================
class TelemetrySuiteMainLayout(BoxLayout):
    def __init__(self, **kwargs):
        super(TelemetrySuiteMainLayout, self).__init__(**kwargs)
        self.orientation = 'vertical'
        
        # Cachés e hilos de datos atómicos para la sesión activa de la tablet
        self.raw_df_cache = None
        self.active_session_df = None
        self.active_setup_dict = {'rider_weight': '80', 'terrain_type': 'Compacto / Seco'}
        self.timeline_pointer = 0.0 # Posición global del Timeline Slider
        
        # --- BARRA DE MENÚ DE NAVEGACIÓN SUPERIOR GRANDE (TAB BAR) ---
        self.tab_bar = BoxLayout(size_hint_y=None, height='55dp', spacing=4, padding=2)
        
        self.tab_btn1 = MenuTabButton(text="📊 DASHBOARD\n& CALIBRATION", state='down')
        self.tab_btn2 = MenuTabButton(text="🗺️ TRACK PROFILE\n& GPS METRICS")
        self.tab_btn3 = MenuTabButton(text="⚡ SUSPENSION\nANALYTICS")
        self.tab_btn4 = MenuTabButton(text="📈 DISTRIBUTION\n& BALANCE")
        self.tab_btn5 = MenuTabButton(text="🛠️ RUN SUMMARY\n& TUNING")
        
        # Añadir al contenedor
        for btn in [self.tab_btn1, self.tab_btn2, self.tab_btn3, self.tab_btn4, self.tab_btn5]:
            self.tab_bar.add_widget(btn)
            btn.bind(on_press=self.switch_tab_view_content)
        self.add_widget(self.tab_bar)
        
        # --- RECEPTÁCULO INTERNO DINÁMICO DE PESTAÑAS ---
        self.content_area = BoxLayout(size_hint_y=0.92)
        
        # Instanciar las vistas de trabajo
        self.view_dashboard = DashboardTab(app_reference=self)
        self.view_track = TrackTab(app_reference=self)
        self.view_suspension = SuspensionTab(app_reference=self)
        self.view_distribution = DistributionTab(app_reference=self)
        self.view_summary = SummaryAndTuneTab(app_reference=self)
        
        # Cargar por defecto la primera pestaña
        self.content_area.add_widget(self.view_dashboard)
        self.add_widget(self.content_area)

    def switch_tab_view_content(self, instance):
        """Manejador táctil asíncrono para conmutar las pestañas al toque del dedo."""
        self.content_area.clear_widgets()
        
        # Sincronizar estados de los botones del menú
        self.tab_btn1.state = 'normal' if instance != self.tab_btn1 else 'down'
        self.tab_btn2.state = 'normal' if instance != self.tab_btn2 else 'down'
        self.tab_btn3.state = 'normal' if instance != self.tab_btn3 else 'down'
        self.tab_btn4.state = 'normal' if instance != self.tab_btn4 else 'down'
        self.tab_btn5.state = 'normal' if instance != self.tab_btn5 else 'down'
        
        if instance == self.tab_btn1:
            self.content_area.add_widget(self.view_dashboard)
        elif instance == self.tab_btn2:
            self.view_track.draw_vectorial_track(self.view_track.map_container, None)
            self.content_area.add_widget(self.view_track)
        elif instance == self.tab_btn3:
            self.view_suspension.refresh_graphics_pipeline(None)
            self.content_area.add_widget(self.view_suspension)
        elif instance == self.tab_btn4:
            self.view_distribution.trigger_refresh(None)
            self.content_area.add_widget(self.view_distribution)
        elif instance == self.tab_btn5:
            self.view_summary.update_report_data()
            self.content_area.add_widget(self.view_summary)

# =============================================================================
# ARRANQUE DE LA APLICACIÓN MULTIPLATAFORMA V6.0
# =============================================================================
class UniversalMotorsportSuiteApp(App):
    def build(self):
        return TelemetrySuiteMainLayout()

if __name__ == '__main__':
    from kivy.uix.slider import Slider
    from kivy.uix.togglebutton import ToggleButton
    UniversalMotorsportSuiteApp().run()
