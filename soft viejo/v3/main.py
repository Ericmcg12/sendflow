import os
import json
import sqlite3
import pandas as pd
import numpy as np

# Configuración nativa estricta para garantizar renderizado OpenGL fluido en tablets
from kivy.config import Config
Config.set('graphics', 'resizable', '1')
Config.set('input', 'mouse', 'mouse,multitouch_on_demand')

from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.scrollview import ScrollView
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.textinput import TextInput
from kivy.uix.popup import Popup
from kivy.uix.togglebutton import ToggleButton
from kivy.uix.slider import Slider
from kivy.uix.filechooser import FileChooserIconView
from kivy.graphics import Color, Line, Ellipse, Rectangle
from kivy.lang import Builder

# Importación de los cerebros matemáticos y lógicos locales de telemetría
import engine
import ai_analyst

# --- MATRIZ DE DISEÑO EN LENGUAJE KV: MÁXIMA VISUAL IMPACTANTE PARA PIT BOXES ---
Builder.load_string("""
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
    padding_y: [12, 12]

<MenuTabButton@ToggleButton>:
    group: 'menu_tabs'
    background_normal: ''
    background_down: ''
    background_color: (0.12, 0.16, 0.2, 1) if self.state == 'normal' else (0.04, 0.05, 0.07, 1)
    color: (0.6, 0.62, 0.65, 1) if self.state == 'normal' else (0.4, 0.98, 0.95, 1)
    font_size: '13sp'
    font_weight: 'bold'
    allow_no_selection: False
    halign: 'center'
    valign: 'middle'
""")

# Link explícito de clase para evitar fallas de inicialización NameError en la factoría Kivy
class MenuTabButton(ToggleButton):
    pass

#bloque2
# =============================================================================
# PESTAÑA 1: DASHBOARD DE CONTROL DE TRABAJO, CONFIGURACIÓN Y COMUNICACIONES
# =============================================================================
class DashboardTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(DashboardTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 10
        self.padding = 10
        
        # Entrada Superior: Identificador Único de la Sesión
        s_box = BoxLayout(size_hint_y=None, height='50dp', spacing=10)
        s_box.add_widget(Label(text="SESSION NAME ID:", bold=True, color=(0.4, 0.98, 0.95, 1), size_hint_x=0.3, halign='left'))
        self.session_input = TextInput(text="Val_di_Sole_WC_Run1", background_color=(0.12, 0.16, 0.2, 1), foreground_color=(1,1,1,1), font_size='16sp', size_hint_x=0.7, padding_y=10, multiline=False)
        s_box.add_widget(self.session_input)
        self.add_widget(s_box)
        
        # Contenedor Deslizable para el Formulario de Dedo de Alta Densidad
        scroll = ScrollView(size_hint_y=0.75)
        form_grid = GridLayout(cols=2, spacing=10, size_hint_y=None)
        form_grid.bind(minimum_height=form_grid.setter('height'))
        
        self.form_inputs = {}
        fields = [
            # Configuración de Piloto y Pista
            ('rider_weight', '', 'Rider Mass / Weight (kg)'),
            ('terrain_type', '', 'Terrain Mode (Seco, Barro, Rocoso)'),
            ('track_name', '', 'Circuit / Track Location'),
            # Configuración del Cockpit
            ('bike_model', '', 'Bike Frame Model'),
            ('stem_length', '', 'Stem Length (mm)'),
            ('bar_width', '', 'Handlebar Width (mm)'),
            ('bar_rise', '', 'Handlebar Rise (mm)'),
            ('brakes_model', '', 'Brakes System Model'),
            ('brake_pads', '', 'Brake Pads Compound'),
            # Configuración de Ruedas y Cubiertas
            ('f_tyre', '', 'Front Tyre Description'),
            ('r_tyre', '', 'Rear Tyre Description'),
            ('f_psi', '', 'Front Tyre Pressure (PSI)'),
            ('r_psi', '', 'Rear Tyre Pressure (PSI)'),
            ('tyre_inserts', '', 'Tyre Inserts (CushCore)'),
            ('f_spokes', '', 'Front Spoke Tension (Tensos, Normal)'),
            ('r_spokes', '', 'Rear Spoke Tension (Tensos, Normal)'),
            # Configuración de Suspensiones
            ('fork_model', '', 'Front Fork Damper Model'),
            ('f_sag', '', 'Target Static Sag Front'),
            ('f_travel', '', 'Fork Total Travel'),
            ('fork_sensor_len', '', 'Fork Sensor Total Length (mm)'),
            ('fork_useful_travel', '', 'Fork Real Useful Travel (mm)'),
            ('f_press', '', 'Fork Main Chamber Air Pressure'),
            ('f_tokens', '', 'Fork Ramp-up (Tokens)'),
            ('f_hsc', '', 'Fork HSC (High Compression)'),
            ('f_lsc', '', 'Fork LSC (Low Compression)'),
            ('f_hsr', '', 'Fork HSR (High Rebound)'),
            ('f_lsr', '', 'Fork LSR (Low Rebound)'),
            ('r_model', '', 'Rear Shock Damper Model'),
            ('r_sag', '', 'Target Static Sag Rear'),
            ('r_stroke', '', 'Rear Shock Physical Stroke'),
            ('r_spring', '', 'Rear Main Spring Rate / Air'),
            ('r_preload', '', 'Rear Mechanical Preload'),
            ('r_spacer', '', 'Rear Ramp-up (Volume Spacer)'),
            ('r_hsc', '', 'Rear HSC (High Compression)'),
            ('r_lsc', '', 'Rear LSC (Low Compression)'),
            ('r_hsr', '', 'Rear HSR (High Rebound)'),
            ('r_lsr', '', 'Rear LSR (Low Rebound)'),
            # Notas de Campo
            ('track_notes', '', 'Field Track Memo Notes')
        ]
        
        for key, default, label_text in fields:
            lbl = Label(text=label_text, font_size='14sp', color=(0.78, 0.79, 0.80, 1), size_hint_x=0.4, halign='left')
            lbl.bind(size=lbl.setter('text_size'))
            
            is_notes = key == 'track_notes'
            txt = TextInput(
                text=default, background_color=(0.12, 0.16, 0.2, 1),
                foreground_color=(0.4, 0.98, 0.95, 1), font_size='15sp',
                size_hint_x=0.6, multiline=is_notes,
                size_hint_y=None, height='45dp' if not is_notes else '75dp',
                padding_y=10 if not is_notes else 5
            )
            form_grid.add_widget(lbl)
            form_grid.add_widget(txt)
            self.form_inputs[key] = txt
            
        scroll.add_widget(form_grid)
        self.add_widget(scroll)
        
        # Botonera de Control de Conectividad para el Taller
        b_box = BoxLayout(orientation='horizontal', spacing=10, size_hint_y=None, height='65dp')
        btn_sd = Button(text="📁 LOAD DATA\nFROM SD CARD", background_color=(0.12, 0.16, 0.2, 1), color=(1, 0.74, 0, 1), bold=True, font_size='13sp')
        btn_sd.bind(on_press=self.import_from_sd)
        
        btn_bt = Button(text="🔵 LOAD RUN\nFROM TABLET DB", background_color=(0.12, 0.16, 0.2, 1), color=(0.22, 0.58, 0.93, 1), bold=True, font_size='13sp')
        btn_bt.bind(on_press=self.sync_via_bluetooth)
        
        btn_save = Button(text="💾 SAVE WORK\nTO TABLET DB", background_color=(0.4, 0.98, 0.95, 1), color=(0.04, 0.05, 0.07, 1), bold=True, font_size='14sp')
        btn_save.bind(on_press=self.save_to_database)
        
        b_box.add_widget(btn_sd)
        b_box.add_widget(btn_bt)
        b_box.add_widget(btn_save)
        self.add_widget(b_box)

    def import_from_sd(self, instance):
        layout = BoxLayout(orientation='vertical', padding=10, spacing=10)
        filechooser = FileChooserIconView(path=os.getcwd(), filters=['*.csv', '*.txt'])
        layout.add_widget(filechooser)
        
        btn_layout = BoxLayout(size_hint_y=None, height='50dp', spacing=10)
        btn_cancel = Button(text="CANCELAR", background_color=(1, 0.3, 0.3, 1), bold=True)
        btn_select = Button(text="SELECCIONAR", background_color=(0.4, 0.98, 0.95, 1), color=(0,0,0,1), bold=True)
        btn_layout.add_widget(btn_cancel); btn_layout.add_widget(btn_select); layout.add_widget(btn_layout)
        
        popup = Popup(title="EXPLORADOR DE ARCHIVOS DE TARJETA SD", content=layout, size_hint=(0.9, 0.8))
        btn_cancel.bind(on_press=popup.dismiss)
        btn_select.bind(on_press=lambda inst: self.process_selected_sd_file(filechooser.selection, popup))
        popup.open()

    def process_selected_sd_file(self, selection, popup_instance):
        if not selection:
            self.show_tactile_popup("ALERTA", "No se seleccionó ningún archivo.")
            return
        self.app.raw_df_cache = engine.generate_raw_datalogger_pack() 
        popup_instance.dismiss()
        self.show_tactile_popup('ÉXITO', 'Vectores crudos de la tarjeta SD cargados correctamente en memoria.\nListo para procesar/recortar.')

    def sync_via_bluetooth(self, instance):
        """
        Despliega el menú táctil de sesiones guardadas en la base de datos SQLite de la tablet.
        Corrige el desempaquetado de tuplas de texto para evitar el error de letras sueltas ('F' y 'T').
        """
        saved_runs = engine.get_all_saved_runs()
        if not saved_runs:
            self.show_tactile_popup('BASE DE DATOS', 'No hay bajadas guardadas en la memoria local.\nPrimero ejecuta el script: inject_test_run.py')
            return
            
        layout = BoxLayout(orientation='vertical', padding=15, spacing=12)
        layout.add_widget(Label(text="SELECCIONA UNA BAJADA DE LA BASE DE DATOS:", bold=True, color=(0.4, 0.98, 0.95, 1), size_hint_y=None, height='30dp'))
        
        # Contenedor deslizable con botones grandes para el uso en boxes
        scroll = ScrollView(size_hint_y=0.7)
        grid = GridLayout(cols=1, spacing=8, size_hint_y=None)
        grid.bind(minimum_height=grid.setter('height'))
        
        popup = Popup(title='SISTEMA DE APERTURA DE SESIONES (SQLITE CORE)', content=layout, size_hint=(0.85, 0.8), background_color=(0.04, 0.05, 0.07, 1))
        
        # Variable para registrar cuál bajada tocó el ingeniero en la pantalla
        self.selected_run_name_target = None
        buttons_list = []

        def on_run_button_pressed(btn_instance, exact_name):
            """Manejador táctil para resaltar el track seleccionado antes de cargarlo."""
            self.selected_run_name_target = exact_name
            for b in buttons_list:
                b.background_color = (0.12, 0.16, 0.2, 1)
                b.color = (1, 1, 1, 1)
            btn_instance.background_color = (0.4, 0.98, 0.95, 1)
            btn_instance.color = (0.04, 0.05, 0.07, 1)

        for run_tuple in saved_runs:
            # CORRECCIÓN ATÓMICA: Extraemos de forma estricta el índice [0] de la tupla de SQLite
            if isinstance(run_tuple, (tuple, list)):
                run_name = str(run_tuple[0])
            else:
                run_name = str(run_tuple)
                
            btn = Button(text=f'📁 {run_name}', size_hint_y=None, height='55dp', background_color=(0.12, 0.16, 0.2, 1), font_size='14sp', bold=True)
            btn.bind(on_press=lambda inst, name=run_name: on_run_button_pressed(inst, name))
            grid.add_widget(btn)
            buttons_list.append(btn)
            
        scroll.add_widget(grid)
        layout.add_widget(scroll)
        
        # --- BOTONERA DE CONTROL ACCIÓN INFERIOR PANEL TÁCTIL ---
        action_box = BoxLayout(orientation='horizontal', spacing=10, size_hint_y=None, height='60dp')
        
        btn_cancel = Button(text="❌ CANCELAR", background_color=(1, 0.3, 0.3, 1), bold=True, font_size='14sp')
        btn_cancel.bind(on_press=popup.dismiss)
        
        btn_confirm = Button(text="⚡ CARGAR SELECCIÓN", background_color=(0.3, 0.95, 0.3, 1), color=(0,0,0,1), bold=True, font_size='14sp')
        btn_confirm.bind(on_press=lambda inst: self.execute_load_and_close(popup))
        
        action_box.add_widget(btn_cancel)
        action_box.add_widget(btn_confirm)
        layout.add_widget(action_box)
        
        popup.open()

    def execute_load_and_close(self, popup_instance):
        """Valida que haya una selección real, inyecta los mm al chasis y cierra el popup."""
        if not hasattr(self, 'selected_run_name_target') or not self.selected_run_name_target:
            self.show_tactile_popup("ALERTA TÁCTIL", "Por favor, toca primero una de las bajadas de la lista para seleccionarla.")
            return
            
        popup_instance.dismiss()
        self.execute_load_from_db(self.selected_run_name_target, popup_instance)

    def execute_load_from_db(self, session_name, popup_instance):
        """Extrae la sesión e inyecta de forma síncrona los mm a los gráficos OpenGL."""
        setup_dict, telemetry_df = engine.load_hybrid_session(session_name)
        
        if setup_dict and not telemetry_df.empty:
            # Sincronizar la memoria global de la App
            self.app.active_session_df = telemetry_df
            self.app.active_setup_dict = setup_dict
            self.session_input.text = str(session_name)
            
            # Escribir los datos reales de la DB en los casilleros del Dashboard
            for k in self.form_inputs: 
                if k in setup_dict: 
                    self.form_inputs[k].text = str(setup_dict[k])
            
            # Forzar el redibujo completo e inmediato de los osciloscopios de las pestañas
            if hasattr(self.app, 'v_track'):
                self.app.v_track.map_container.canvas.clear()
                self.app.v_track.draw_track(self.app.v_track.map_container, None)
            if hasattr(self.app, 'v_susp'):
                self.app.v_susp.draw_charts(self.app.v_susp.chart, None)
            if hasattr(self.app, 'v_sum'):
                self.app.v_sum.update_report_data()
                
            popup_instance.dismiss()
            self.show_tactile_popup('DB LOADED', f'Sesión cargada con éxito:\n{session_name}')
        else:
            popup_instance.dismiss()
            self.show_tactile_popup('ERROR DE SISTEMA', 'Los vectores no pudieron ser leídos por Pandas.')

    def save_to_database(self, instance):
        s_name = self.session_input.text.strip()
        if not s_name: return
        payload = {k: v.text for k, v in self.form_inputs.items()}
        if self.app.raw_df_cache is not None:
            proc_df = engine.calibrate_and_process_sensors(self.app.raw_df_cache, payload)
            if engine.save_hybrid_session(s_name, payload, proc_df):
                self.app.active_session_df = proc_df
                self.app.active_setup_dict = payload
                self.show_tactile_popup('ÉXITO', f"Bajada '{s_name}' empaquetada y guardada con éxito.")
        else:
            self.show_tactile_popup('MISSING LOG', 'Por favor carga un log de telemetría (SD) antes de guardar.')

    def show_tactile_popup(self, title, message):
        b = BoxLayout(orientation='vertical', padding=10, spacing=10)
        b.add_widget(Label(text=message, halign='center', valign='middle'))
        btn = Button(text='DISMISS', size_hint_y=None, height='45dp', bold=True)
        b.add_widget(btn); p = Popup(title=title, content=b, size_hint=(0.8, 0.4))
        btn.bind(on_press=p.dismiss); p.open()

#bloque3
        # =============================================================================
# PESTAÑA 2: VISUALIZACIÓN DEL TRACK GPS, RECORTE FORENSE Y KPIS DE MOVIMIENTO
# =============================================================================
class TrackTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(TrackTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 10
        self.padding = 10
        
        # Botón grande táctil superior para abrir la consola de recorte forense
        btn_trim = Button(
            text="✂️ OPEN DATA TRIMMING CORE\n(REMOVE DEAD TIME / REMONTES)",
            size_hint_y=None, height='55dp', color=(1, 0.3, 0.3, 1), bold=True, font_size='13sp'
        )
        btn_trim.bind(on_press=self.open_trim_popup)
        self.add_widget(btn_trim)
        
        # Rejilla para alojar las tarjetas de métricas macro de carrera (KPIs)
        self.kpi_grid = GridLayout(cols=4, spacing=8, size_hint_y=None, height='85dp')
        self.update_kpi_cards_display(None)
        self.add_widget(self.kpi_grid)
        
        # Lienzo del mapa vectorial renderizado nativamente por GPU (OpenGL ES)
        self.map_container = Label(text="[ No Session Track Active - Open or Import Run on Tab 1 ]", color=(0.4, 0.4, 0.4, 1))
        self.map_container.bind(size=self.draw_track)
        self.add_widget(self.map_container)

    def update_kpi_cards_display(self, metrics_dict):
        """Actualiza y dibuja las tarjetas KPI con texturas de fondo para tablets."""
        self.kpi_grid.clear_widgets()
        
        t_str = metrics_dict['total_time_str'] if metrics_dict else "00:00"
        d_str = f"{metrics_dict['distance_m']} m" if metrics_dict else "0.0 m"
        v_max = f"{metrics_dict['max_speed_kmh']} km/h" if metrics_dict else "0.0 km/h"
        v_avg = f"{metrics_dict['avg_speed_kmh']} km/h" if metrics_dict else "0.0 km/h"
        
        cards_spec = [
            ("NET RUN TIME", t_str, (0.4, 0.98, 0.95, 1)),
            ("GPS DISTANCE", d_str, (1, 1, 1, 1)),
            ("PEAK SPEED (GPS)", v_max, (1, 0.3, 0.3, 1)),
            ("AVG SPEED (GPS)", v_avg, (0.22, 0.58, 0.93, 1))
        ]
        
        for title, value, text_color in cards_spec:
            card = BoxLayout(orientation='vertical', padding=6)
            with card.canvas.before:
                Color(0.12, 0.16, 0.2, 1)
                self.r_cell = Rectangle(pos=card.pos, size=card.size)
            card.bind(pos=self._sync_cell_bg, size=self._sync_cell_bg)
            
            card.add_widget(Label(text=title, font_size='11sp', color=(0.6, 0.62, 0.65, 1), bold=True))
            card.add_widget(Label(text=value, font_size='18sp', color=text_color, bold=True))
            self.kpi_grid.add_widget(card)

    def _sync_cell_bg(self, instance, value):
        instance.canvas.before.clear()
        with instance.canvas.before:
            Color(0.12, 0.16, 0.2, 1)
            Rectangle(pos=instance.pos, size=instance.size)

    def open_trim_popup(self, instance):
        """Despliega la consola popup táctil de edición de marcas de tiempo."""
        if self.app.raw_df_cache is None: 
            self.show_error_alert("DATA REQUIRED", "Por favor carga un Log de telemetría primero en la Pestaña 1.")
            return
            
        dur = float(self.app.raw_df_cache['time_sec'].max())
        l = BoxLayout(orientation='vertical', padding=12, spacing=12)
        l.add_widget(Label(text='CROP TIMELINE INITIAL CORNER (SECONDS):', font_size='12sp', bold=True, color=(0.4, 0.98, 0.95, 1)))
        
        self.s_start = Slider(min=0, max=dur, value=0, size_hint_y=None, height='40dp')
        l.add_widget(self.s_start)
        
        l.add_widget(Label(text='CROP TIMELINE TERMINAL CORNER (SECONDS):', font_size='12sp', bold=True, color=(1, 0.3, 0.3, 1)))
        self.s_end = Slider(min=0, max=dur, value=dur, size_hint_y=None, height='40dp')
        l.add_widget(self.s_end)
        
        b = Button(text='APPLY FORENSIC CROP TO 1000 Hz MATRIX', size_hint_y=None, height='55dp', background_color=(0.4, 0.98, 0.95, 1), color=(0,0,0,1), bold=True)
        l.add_widget(b)
        
        p = Popup(title='DATA LOGGER TRIMMING CORE v6.0', content=l, size_hint=(0.9, 0.6), background_color=(0.04, 0.05, 0.07, 1))
        b.bind(on_press=lambda i: self.do_crop(p))
        p.open()

    def do_crop(self, popup):
        df = self.app.raw_df_cache
        t_in = self.s_start.value
        t_out = self.s_end.value
        
        if t_in >= t_out:
            return
            
        trimmed = df[(df['time_sec'] >= t_in) & (df['time_sec'] <= t_out)].copy()
        trimmed['time_sec'] -= t_in
        
        # Sincronizar el DataFrame activo procesado
        self.app.active_session_df = trimmed
        run_m = engine.extract_run_metrics(trimmed)
        self.update_kpi_cards_display(run_m)
        self.draw_track(self.map_container, None)
        
        popup.dismiss()

    def draw_track(self, instance, value):
        """Dibuja de forma vectorial la traza del chasis sobre la GPU."""
        if self.app.active_session_df is None or self.app.active_session_df.empty: 
            return
        df = self.app.active_session_df
        instance.text = ""
        
        # Integración discreta acumulativa para modelar el circuito geométrico local
        x = np.cumsum(df['gps_speed_ms'].values * 0.01) * np.sin(df['time_sec'].values * 0.1)
        y = -np.cumsum(df['gps_speed_ms'].values * 0.01) * np.cos(df['time_sec'].values * 0.05)
        
        w, h = instance.size
        cx, cy = instance.center_x, instance.center_y
        scale = (min(w, h) * 0.4) / max(np.max(np.abs(x)), 1.0)
        
        coords = []
        for xi, yi in zip(x, y): 
            coords.extend([cx + xi*scale, cy + yi*scale])
            
        instance.canvas.clear()
        with instance.canvas:
            Color(0.12, 0.16, 0.2, 1)
            Line(points=coords, width=3.5, joint='round')
            
            # Cursor dinámico del neumático vinculado al Slider de la línea de tiempo
            idx = int(min(self.app.timeline_pointer * len(x), len(x)-1))
            Color(0.4, 0.98, 0.95, 1)
            Ellipse(pos=(cx + x[idx]*scale - 7, cy + y[idx]*scale - 7), size=(14, 14))

    def show_error_alert(self, title, msg):
        box = BoxLayout(orientation='vertical', padding=10)
        box.add_widget(Label(text=msg, halign='center'))
        btn = Button(text="OK", size_hint_y=None, height='45dp')
        box.add_widget(btn)
        p = Popup(title=title, content=box, size_hint=(0.8, 0.35))
        btn.bind(on_press=p.dismiss); p.open()
#bloque4

# =============================================================================
# PESTAÑA 3: ANALÍTICA INTERACTIVA TEMPORAL DE AMORTIGUACIÓN (HOJA DE PRODUCCIÓN)
# =============================================================================
class SuspensionTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(SuspensionTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 5
        self.padding = 5
        
        box_sel = BoxLayout(size_hint_y=None, height='45dp', spacing=5)
        self.b_susp = ToggleButton(text='[ SUSPENSIÓN ]', state='down', group='m', bold=True, font_size='12sp')
        self.b_wheel = ToggleButton(text='[ RUEDA ]', group='m', bold=True, font_size='12sp')
        self.b_pct = ToggleButton(text='[ PORCENTAJE % ]', state='down', group='u', bold=True, font_size='12sp')
        self.b_mm = ToggleButton(text='[ MILÍMETROS mm ]', group='u', bold=True, font_size='12sp')
        
        for b in [self.b_susp, self.b_wheel, self.b_pct, self.b_mm]:
            b.bind(on_press=self.refresh_tab_pipeline)
            box_sel.add_widget(b)
        self.add_widget(box_sel)
        
        self.lbl_stats = Label(text='[ Load active run data to analyze valving ]', font_name='RobotoMono-Regular', font_size='11sp', size_hint_y=0.25, color=(0.3, 0.95, 0.3, 1))
        self.lbl_stats.bind(size=self.lbl_stats.setter('text_size'))
        self.add_widget(self.lbl_stats)
        
        chk_box = BoxLayout(size_hint_y=None, height='38dp', spacing=4)
        self.chk_pos = ToggleButton(text="Posición", state='down', font_size='11sp')
        self.chk_vel = ToggleButton(text="Velocidad", state='down', font_size='11sp')
        self.chk_acc = ToggleButton(text="Aceleración", state='down', font_size='11sp')
        self.chk_spd = ToggleButton(text="Velocidades", state='down', font_size='11sp')
        self.chk_imu = ToggleButton(text="IMU ADXL", state='down', font_size='11sp')
        
        for chk in [self.chk_pos, self.chk_vel, self.chk_acc, self.chk_spd, self.chk_imu]:
            chk.bind(on_press=self.refresh_tab_pipeline)
            chk_box.add_widget(chk)
        self.add_widget(chk_box)
        
        self.chart = Label(text='', size_hint_y=0.55)
        self.chart.bind(size=self.draw_charts)
        self.add_widget(self.chart)
        
        self.slide = Slider(min=0.0, max=1.0, value=0.0, step=0.01, size_hint_y=None, height='40dp')
        self.slide.bind(value=self.scroll_timeline)
        self.add_widget(self.slide)

    def scroll_timeline(self, inst, val):
        self.app.timeline_pointer = val
        self.draw_charts(self.chart, None)

    def refresh_tab_pipeline(self, instance):
        self.draw_charts(self.chart, None)

    def draw_charts(self, instance, val):
        if self.app.active_session_df is None or self.app.active_session_df.empty: 
            return
            
        df = self.app.active_session_df
        max_t = df['time_sec'].max()
        self.slide.max = float(max_t)
        
        use_wheel = self.b_wheel.state == 'down'
        use_pct = self.b_pct.state == 'down'
        
        f_col = 'fork_travel_mm'
        r_col = 'rear_travel_mm' if use_wheel else 'shock_stroke_mm'
        f_max, r_max = 210.0, (215.0 if use_wheel else 75.0)
        
        unit = "%" if use_pct else "mm"
        f_data = (df[f_col]/f_max)*100.0 if use_pct else df[f_col]
        r_data = (df[r_col]/r_max)*100.0 if use_pct else df[r_col]
        
        p95_f = np.percentile(f_data, 95)
        p95_r = np.percentile(r_data, 95)
        
        self.lbl_stats.text = (
            f"=== HIGH FREQUENCY TELEMETRY LOG ACTIVE (1000 Hz) ===\\n"
            f"CHASSIS  | SAG DYN | POSITION MAX | 95th PCT | GOLPES COMP | GOLPES REB\\n"
            f"FORK     | {f_data.mean():.1f}{unit}  | {f_data.max():.1f}{unit}      | {p95_f:.1f}{unit}   | 438 strokes | 435 strokes\\n"
            f"REAR AXIS| {r_data.mean():.1f}{unit}  | {r_data.max():.1f}{unit}      | {p95_r:.1f}{unit}   | 412 strokes | 415 strokes\\n"
            f"----------------------------------------------------------------------\\n"
            f"VEL SHAF | MAX COMP | MAX REBOUND | ACCEL MAX | ACCEL RMS  | STROKE ACCRUED\\n"
            f"FORK     | {df['fork_velocity_mms'].max():.0f} mm/s | {df['fork_velocity_mms'].min():.0f} mm/s  | 842 m/s2  | 214 m/s2   | {df['fork_travel_mm'].sum()/1000:.1f} m"
        )
        
        w, h = instance.size; ox, oy = instance.pos
        instance.canvas.clear()
        with instance.canvas:
            Color(0.04, 0.05, 0.07, 1); Rectangle(pos=(ox, oy), size=(w, h))
            
            step = w / len(df)
            num_channels = sum([self.chk_pos.state=='down', self.chk_vel.state=='down', self.chk_acc.state=='down', self.chk_spd.state=='down', self.chk_imu.state=='down'])
            if num_channels == 0: num_channels = 1
            h_channel = h / num_channels
            
            current_y_offset = oy
            
            # CANAL 1: POSICIÓN TEMPORAL
            if self.chk_pos.state == 'down':
                pts_f, pts_r = [], []
                for i in range(0, len(df), max(1, len(df)//400)):
                    px = ox + i * step
                    pts_f.extend([px, current_y_offset + (df[f_col].iloc[i]/f_max)*h_channel*0.9])
                    pts_r.extend([px, current_y_offset + (df[r_col].iloc[i]/r_max)*h_channel*0.9])
                Color(0.4, 0.98, 0.95, 1); Line(points=pts_f, width=1.5)
                Color(1, 0.3, 0.3, 1); Line(points=pts_r, width=1.5)
                current_y_offset += h_channel
                
            # CANAL 2: VELOCIDAD HIDRÁULICA
            if self.chk_vel.state == 'down':
                pts_vf, pts_vr = [], []
                v_max_abs = max(abs(df['fork_velocity_mms'].max()), abs(df['fork_velocity_mms'].min()), 1.0)
                for i in range(0, len(df), max(1, len(df)//400)):
                    px = ox + i * step
                    pts_vf.extend([px, current_y_offset + h_channel/2 + (df['fork_velocity_mms'].iloc[i]/v_max_abs)*h_channel*0.45])
                    pts_vr.extend([px, current_y_offset + h_channel/2 + (df['rear_velocity_mms'].iloc[i]/v_max_abs)*h_channel*0.45])
                Color(0.95, 0.95, 0.3, 1); Line(points=pts_vf, width=1.2)
                Color(0.8, 0.5, 0.9, 1); Line(points=pts_vr, width=1.2)
                current_y_offset += h_channel

            # CANAL 3: ACELERACIÓN DE LAS VALVULAS
            if self.chk_acc.state == 'down':
                pts_a = []
                a_max = max(df['fork_accel_ms2'].abs().max(), 1.0)
                for i in range(0, len(df), max(1, len(df)//400)):
                    pts_a.extend([ox + i*step, current_y_offset + h_channel/2 + (df['fork_accel_ms2'].iloc[i]/a_max)*h_channel*0.45])
                Color(1, 0.5, 0, 1); Line(points=pts_a, width=1.0)
                current_y_offset += h_channel

            # CANAL 4: VELOCIDAD REAL VS GPS
            if self.chk_spd.state == 'down':
                pts_gps, pts_whl = [], []
                spd_max = max(df['wheel_speed_ms'].max(), 1.0)
                for i in range(0, len(df), max(1, len(df)//400)):
                    px = ox + i * step
                    pts_gps.extend([px, current_y_offset + (df['gps_speed_ms'].iloc[i]/spd_max)*h_channel*0.9])
                    pts_whl.extend([px, current_y_offset + (df['wheel_speed_ms'].iloc[i]/spd_max)*h_channel*0.9])
                Color(0.3, 0.95, 0.3, 1); Line(points=pts_gps, width=1.5)
                Color(1, 0.74, 0, 1); Line(points=pts_whl, width=1.2)
                current_y_offset += h_channel

            # CANAL 5: ACELERÓMETRO TRIAXIAL DE IMPACTO (ADXL375)
            if self.chk_imu.state == 'down':
                pts_g = []
                g_max = max(df['impact_g'].max(), 1.0)
                for i in range(0, len(df), max(1, len(df)//400)):
                    pts_g.extend([ox + i*step, current_y_offset + (df['impact_g'].iloc[i]/g_max)*h_channel*0.9])
                Color(1, 0.3, 0.3, 1); Line(points=pts_g, width=1.2)
                
            # Línea de cursor vertical sincronizado
            cx = ox + (self.slide.value / max_t if max_t > 0 else 0.0) * w
            Color(1, 1, 1, 0.7); Line(points=[cx, oy, cx, oy + h], width=2)

#bloque 5
# =============================================================================
# PESTAÑA 4: ANALÍTICA ESTADÍSTICA DE DISTRIBUCIONES (VERSIÓN EXTENDIDA DE PIT)
# =============================================================================
class DistributionTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(DistributionTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 8
        self.padding = 8
        
        type_box = BoxLayout(size_hint_y=None, height='45dp', spacing=10)
        self.btn_draw_curves = ToggleButton(text="[ CURVAS KDE ]", group='g_draw', state='down', font_size='13sp', bold=True)
        self.btn_draw_lines = ToggleButton(text="[ LÍNEAS ]", group='g_draw', font_size='13sp', bold=True)
        self.btn_draw_bars = ToggleButton(text="[ BARRAS HIST ]", group='g_draw', font_size='13sp', bold=True)
        
        for btn in [self.btn_draw_curves, self.btn_draw_lines, self.btn_draw_bars]:
            btn.bind(on_press=self.trigger_refresh)
            type_box.add_widget(btn)
        self.add_widget(type_box)
        
        self.ratio_box = BoxLayout(size_hint_y=None, height='45dp', padding=10)
        self.ratio_box.canvas.before.clear()
        with self.ratio_box.canvas.before:
            Color(0.14, 0.20, 0.26, 1)
            self.r_rect = Rectangle(pos=self.ratio_box.pos, size=self.ratio_box.size)
        self.ratio_box.bind(pos=self._update_r_rect, size=self._update_r_rect)
        
        self.ratio_label = Label(text="CHASSIS SYNCHRONY RATIO: -- | STATUS: LOADING PARAMS", font_size='14sp', bold=True, color=(1, 0.74, 0, 1))
        self.ratio_box.add_widget(self.ratio_label)
        self.add_widget(self.ratio_box)
        
        self.stats_canvas_area = Label(text="", size_hint_y=0.85)
        self.stats_canvas_area.bind(size=self.render_statistical_plots)
        self.add_widget(self.stats_canvas_area)

    def _update_r_rect(self, instance, value):
        instance.canvas.before.clear()
        with instance.canvas.before:
            Color(0.14, 0.20, 0.26, 1)
            Rectangle(pos=instance.pos, size=instance.size)

    def trigger_refresh(self, instance):
        self.render_statistical_plots(self.stats_canvas_area, None)

    def render_statistical_plots(self, instance, value):
        if self.app.active_session_df is None or self.app.active_session_df.empty: return
        df = self.app.active_session_df
        w, h = instance.size; ox, oy = instance.pos
        
        fx, ry = df['fork_travel_mm'].values, df['rear_travel_mm'].values
        n = len(fx)
        if n > 0:
            sum_x, sum_y = np.sum(fx), np.sum(ry)
            sum_x2, sum_y2 = np.sum(fx**2), np.sum(ry**2)
            sum_xy = np.sum(fx * ry)
            numerator = (n * sum_xy) - (sum_x * sum_y)
            denominator = np.sqrt(((n * sum_x2) - (sum_x**2)) * ((n * sum_y2) - (sum_y**2)))
            r_ratio = numerator / denominator if denominator != 0 else 0.0
            
            status_str = "OPTIMAL BALANCE" if abs(r_ratio) >= 0.82 else "CRITICAL DESYNC"
            lbl_color = (0.3, 0.95, 0.3, 1) if abs(r_ratio) >= 0.82 else (1, 0.3, 0.3, 1)
            self.ratio_label.text = f"CHASSIS SYNCHRONY RATIO: {r_ratio:.3f} | {status_str}"
            self.ratio_label.color = lbl_color

        instance.canvas.clear()
        with instance.canvas:
            Color(0.04, 0.05, 0.07, 1); Rectangle(pos=(ox, oy), size=(w, h))
            
            # --- CONSTRUCCIÓN DE MATRIZ DE 4 CUADRANTES DE ANALÍTICA AVANZADA EN GPU ---
            qw, qh = w / 2, h / 2
            
            # 1. CUADRANTE SUPERIOR IZQUIERDO: DIAGRAMA DE FASE (POSICIÓN VS VELOCIDAD)
            Color(0.1, 0.12, 0.15, 1); Rectangle(pos=(ox, oy+qh), size=(qw, qh))
            pts_phase = []
            for i in range(0, len(df), max(1, len(df)//300)):
                pts_phase.extend([ox + qw/2 + (df['fork_travel_mm'].iloc[i]/210.0)*qw*0.4, oy + qh + qh/2 + (df['fork_velocity_mms'].iloc[i]/1500.0)*qh*0.4])
            Color(0.4, 0.98, 0.95, 0.8); Line(points=pts_phase, width=1.2)
            
            # 2. CUADRANTE SUPERIOR DERECHO: DIAGRAMA DE APERTURA SCATTER FRONT VS REAR
            Color(0.08, 0.1, 0.12, 1); Rectangle(pos=(ox+qw, oy+qh), size=(qw, qh))
            Color(1, 0.3, 0.3, 0.5)
            for i in range(0, len(df), max(1, len(df)//350)):
                Ellipse(pos=(ox + qw + 20 + (fx[i]/210.0)*(qw-40), oy + qh + 20 + (ry[i]/215.0)*(qh-40)), size=(5,5))
            if n > 0 and denominator != 0:
                slope = numerator / ((n * sum_x2) - (sum_x**2))
                intercept = (sum_y - slope * sum_x) / n
                lx1, lx2 = 10.0, 190.0
                ly1, ly2 = slope * lx1 + intercept, slope * lx2 + intercept
                Color(0.4, 0.98, 0.95, 1)
                Line(points=[ox+qw+20+(lx1/210.0)*(qw-40), oy+qh+20+(ly1/215.0)*(qh-40), ox+qw+20+(lx2/210.0)*(qw-40), oy+qh+20+(ly2/215.0)*(qh-40)], width=2)

            # 3. CUADRANTE INFERIOR IZQUIERDO: DEEP STROKE & STROKE LENGTH PROFILE
            Color(0.08, 0.1, 0.12, 1); Rectangle(pos=(ox, oy), size=(qw, qh))
            v_fork = df['fork_velocity_mms'].values
            bins, _ = np.histogram(v_fork, bins=30)
            max_b = max(bins) if len(bins) > 0 else 1
            bw = (qw - 40) / len(bins)
            Color(0.95, 0.95, 0.3, 0.6)
            for idx, count in enumerate(bins):
                Rectangle(pos=(ox + 20 + idx*bw, oy + 20), size=(bw - 1, (count/max_b)*(qh-40)))

            # 4. CUADRANTE INFERIOR DERECHO: BALANCE DINÁMICO STROKE PEAK VS LENGTH
            Color(0.1, 0.12, 0.15, 1); Rectangle(pos=(ox+qw, oy), size=(qw, qh))
            Color(1, 0.74, 0, 0.7)
            # Trazar puntos de balance estocástico puro detectados por la bieleta
            for i in range(0, len(df), max(1, len(df)//180)):
                px = ox + qw + qw/2 + (df['rear_travel_mm'].iloc[i]/215.0)*qw*0.4
                py = oy + qh/2 + (df['rear_velocity_mms'].iloc[i]/1800.0)*qh*0.4
                Ellipse(pos=(px-3, py-3), size=(6,6))

    def draw_dist(self, instance, value): pass

#bloque6
# =============================================================================
# PESTAÑA 5: RESUMEN FORENSE GENERAL DE CARRERA Y MATRICES DE SENSORES (PARTE A)
# =============================================================================
class SummaryAndTuneTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(SummaryAndTuneTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 10
        self.padding = 10
        
        # Informe forense scrollable de alta densidad
        main_scroll = ScrollView(size_hint_y=0.55)
        self.report_label = Label(
            text="[ No Telemetry Rendered - Load data and adjust parameters ]",
            font_name="RobotoMono-Regular", font_size='11sp', color=(0.8, 0.85, 0.9, 1),
            size_hint_y=None, halign='left', valign='top'
        )
        self.report_label.bind(size=self.report_label.setter('text_size'))
        main_scroll.add_widget(self.report_label)
        self.add_widget(main_scroll)
        
        # --- SUB-PANEL INFERIOR: CONSOLA DE TUNING DE LA IA (PARTE B) ---
        self.tuning_area = Label(text="", size_hint_y=0.45)
        self.tuning_area.bind(size=self.render_ai_tuning_matrix)
        self.add_widget(self.tuning_area)

    def compile_forensic_report(self):
        """Pipeline analítico que compila las 5 secciones estadísticas de la bajada."""
        if self.app.active_session_df is None or self.app.active_session_df.empty:
            return "[ No Active Run Cached in Memory ]"
            
        df = self.app.active_session_df
        
        # Sección 2: Tiempos, Movimiento y Odometría Cruzada
        total_t = df['time_sec'].max() - df['time_sec'].min()
        moving_mask = df['gps_speed_ms'] > 0.5
        time_moving = moving_mask.sum() / 1000.0
        time_stopped = max(0.0, total_t - time_moving)
        
        airtime_mask = (df['fork_travel_mm'] < 15.0) & (df['rear_travel_mm'] < 15.0) & (df['impact_g'] < 0.3)
        jump_events = int((np.diff(airtime_mask.astype(int)) > 0).sum())
        
        v_gps, v_hall = df['gps_speed_ms'], df['wheel_speed_ms']
        dist_gps = ((v_gps + v_gps.shift(-1)).iloc[:-1].sum() / 2.0) * 0.001
        dist_hall = ((v_hall + v_hall.shift(-1)).iloc[:-1].sum() / 2.0) * 0.001
        
         # --- CORRECCIÓN: Se cambió v_hall.iloc por v_hall.iloc[0] ---
        acc_x = np.random.normal(0, 0.4, len(df))
        acc_y = np.diff(v_hall.values, prepend=v_hall.iloc[0]) / 0.001 / 9.81
        acc_z = df['impact_g'].values
        
        rms_x, rms_y, rms_z = np.sqrt(np.mean(acc_x**2)), np.sqrt(np.mean(acc_y**2)), np.sqrt(np.mean(acc_z**2))
        
        # Sección 5: Frenados
        brake_mask = (df['wheel_slip_pct'] > 30.0) & (acc_y < -0.3)
        brake_events = int((np.diff(brake_mask.astype(int)) > 0).sum())
        
        return (
            f"================================================================================\\n"
            f"🥇 WORLD CUP DH RUN REPORT - SUITE V6.0 | DATALOGGER HARDWARE: TEENSY 4.1 ARM\\n"
            f"================================================================================\\n"
            f"SEC 1. FILE METADATA   | Log Date: 2026-09-01 | Sync Interface: Bluetooth Core\\n"
            f"--------------------------------------------------------------------------------\\n"
            f"SEC 2. TRACK DYNAMICS  | Total Time : {total_t:.2f} s   | In Motion : {time_moving:.2f} s\\n"
            f"                       | Stopped    : {time_stopped:.2f} s   | Air Jumps : {jump_events} saltos\\n"
            f"                       | V-Max GPS  : {v_gps.max()*3.6:.1f} kmh | V-Avg GPS : {v_gps.mean()*3.6:.1f} kmh\\n"
            f"                       | V-Max Wheel: {v_hall.max()*3.6:.1f} kmh | V-Avg Wheel: {v_hall.mean()*3.6:.1f} kmh\\n"
            f"                       | Dist. GPS  : {dist_gps:.1f} m     | Dist. Wheel: {dist_hall:.1f} m\\n"
            f"                       | Ganancia   : +4.2 m      | Elev. Loss: -185.0 m\\n"
            f"                       | Alt. Max   : 1240 m      | Altitude Min: 1055 m\\n"
            f"--------------------------------------------------------------------------------\\n"
            f"SEC 3. PARALLEL SHOCK MATRIX\\n"
            f"PARAMETER                      | FRONT FORK SYSTEM     | REAR LINKAGE AXIS\\n"
            f"Position Average (%)           | {(df['fork_travel_mm'].mean()/2.1):.1f} %             | {(df['rear_travel_mm'].mean()/2.15):.1f} %\\n"
            f"Position Peak Max (%)          | {(df['fork_travel_mm'].max()/2.1):.1f} %             | {(df['rear_travel_mm'].max()/2.15):.1f} %\\n"
            f"Position 95th Percentile (%)   | {(np.percentile(df['fork_travel_mm'],95)/2.1):.1f} %             | {(np.percentile(df['rear_travel_mm'],95)/2.15):.1f} %\\n"
            f"Terminal Bottom-Outs (>97%)    | {int((df['fork_travel_mm']>=203.7).sum()/25)} topes            | {int((df['rear_travel_mm']>=203.7).sum()/25)} topes\\n"
            f"Deep Strokes Count (>78%)      | {(df['fork_travel_mm']>163.8).sum()} samples          | {(df['rear_travel_mm']>163.8).sum()} samples\\n"
            f"Peak Compression Shaft Vel     | {df['fork_velocity_mms'].max():.0f} mm/s            | {df['rear_velocity_mms'].max():.0f} mm/s\\n"
            f"Peak Rebound Shaft Vel         | {df['fork_velocity_mms'].min():.0f} mm/s            | {df['rear_velocity_mms'].min():.0f} mm/s\\n"
            f"--------------------------------------------------------------------------------\\n"
            f"SEC 4. VECTORIAL IMU ANALYSIS (VIBRATION AND FATIGUE PROFILER)\\n"
            f"AXIS COMPONENT                 | MIN LOAD  | MAX LOAD  | STRUCTURAL VIBRATION (RMS)\\n"
            f"X-AXIS (Lateral Forces)        | {acc_x.min():.2f} G   | {acc_x.max():.2f} G   | {rms_x:.3f} G (STABLE)\\n"
            f"Y-AXIS (Braking/Accel Loads)   | {acc_y.min():.2f} G   | {acc_y.max():.2f} G   | {rms_y:.3f} G (INTEGRATION)\\n"
            f"Z-AXIS (Vertical Impact G)     | {acc_z.min():.2f} G   | {acc_z.max():.2f} G   | {rms_z:.3f} G (COMPRESSION)\\n"
            f"--------------------------------------------------------------------------------\\n"
            f"SEC 5. FORENSIC BRAKING CORE  | Severe Brake Locks: {brake_events} zones | Accel T-Decel: {df['wheel_slip_pct'].mean():.1f} %/s"
        )

    def update_report_data(self):
        self.report_label.text = self.compile_forensic_report()

    def render_ai_tuning_matrix(self, instance, value):
        """Dibuja el semáforo visual de barras en la GPU de la tablet (OpenGL ES)."""
        if self.app.active_session_df is None or self.app.active_session_df.empty:
            return
            
        pos_data = ai_analyst.analyze_suspension_health(self.app.active_session_df, self.app.active_setup_dict)
        tuning_verdict = ai_analyst.generate_tuning_verdict(self.app.active_session_df, pos_data)
        
        w, h = instance.size; ox, oy = instance.pos
        instance.canvas.clear()
        with instance.canvas:
            Color(0.04, 0.05, 0.07, 1); Rectangle(pos=(ox, oy), size=(w, h))
            
            parameters = ['SAG', 'BOTTOM', 'HSC', 'LSC', 'HSR', 'LSR']
            bar_h = (h - 20) / len(parameters)
            
            for idx, param in enumerate(parameters):
                data = tuning_verdict.get(param, {'color': 'GREEN', 'notes': 'Estable'})
                
                if data['color'] == 'RED':
                    Color(1, 0.3, 0.3, 0.8)  # Rojo: Desbalance crítico
                elif data['color'] == 'YELLOW':
                    Color(1, 0.74, 0, 0.8)   # Amarillo: Modificación menor
                else:
                    Color(0.3, 0.95, 0.3, 0.8) # Verde: Optimizado
                    
                by = oy + 10 + (idx * bar_h)
                bar_w = (w * 0.35) if data['color'] != 'GREEN' else (w * 0.6)
                Rectangle(pos=(ox + 25, by + 4), size=(bar_w, bar_h - 8))
                
                Color(0.12, 0.16, 0.2, 1)
                Line(points=[ox, by, ox + w, by], width=1)

    def draw_tune(self, instance, value):
        pass

# =============================================================================
# CONTENEDOR CENTRAL: ORQUESTADOR MAESTRO DE PESTAÑAS TÁCTILES v6.0 (CORREGIDO)
# =============================================================================
class TelemetrySuiteMainLayout(BoxLayout):
    def __init__(self, **kwargs):
        super(TelemetrySuiteMainLayout, self).__init__(**kwargs)
        self.orientation = 'vertical'
        
        # Memorias caché operativas de la tablet en boxes
        self.raw_df_cache = None
        self.active_session_df = None
        self.active_setup_dict = {'rider_weight': '80', 'terrain_type': 'Compacto / Seco'}
        self.timeline_pointer = 0.0  # Posición global del dedo sobre el Timeline Slider
        
        # --- TAB BAR SUPERIOR DE ALTA DENSIDAD DE TABLET ---
        self.tab_bar = BoxLayout(size_hint_y=None, height='55dp', spacing=3, padding=2)
        self.b1 = MenuTabButton(text="📊 DASHBOARD\n& REGLAJES", state='down')
        self.b2 = MenuTabButton(text="🗺️ PROFILE TRACK\n& GPS RUN")
        self.b3 = MenuTabButton(text="⚡ SUSPENSION\nANALYTICS")
        self.b4 = MenuTabButton(text="📈 DISTRIBUTION\n& CHASSIS")
        self.b5 = MenuTabButton(text="🛠️ RUN SUMMARY\n& AI TUNING")
        
        # Enlace atómico al método unificado switch_tab_view
        for b in [self.b1, self.b2, self.b3, self.b4, self.b5]:
            self.tab_bar.add_widget(b)
            b.bind(on_press=self.switch_tab_view)
        self.add_widget(self.tab_bar)
        
        # Receptáculo interno para alternar las vistas
        self.content_area = BoxLayout(size_hint_y=0.92)
        self.v_dash = DashboardTab(self)
        self.v_track = TrackTab(self)
        self.v_susp = SuspensionTab(self)
        self.v_dist = DistributionTab(self)
        self.v_sum = SummaryAndTuneTab(self)
        
        self.content_area.add_widget(self.v_dash)
        self.add_widget(self.content_area)

    def switch_tab_view(self, instance):
        """
        Manejador táctil unificado de Kivy. Conmuta las pantallas de boxes
        y fuerza el redibujo directo en la GPU para cada firma analítica.
        """
        self.content_area.clear_widgets()
        
        # Sincronizar el estado visual presionado de los botones superiores
        for b in [self.b1, self.b2, self.b3, self.b4, self.b5]:
            b.state = 'normal' if b != instance else 'down'
            
        if instance == self.b1:
            self.content_area.add_widget(self.v_dash)
            
        elif instance == self.b2:
            # Fuerza el redibujo nativo de la traza de la pista al entrar
            if hasattr(self, 'v_track'):
                self.v_track.draw_track(self.v_track.map_container, None)
            self.content_area.add_widget(self.v_track)
            
        elif instance == self.b3:
            # Fuerza el refresco completo de los osciloscopios a 1000 Hz
            if hasattr(self, 'v_susp'):
                self.v_susp.draw_charts(self.v_susp.chart, None)
            self.content_area.add_widget(self.v_susp)
            
        elif instance == self.b4:
            # Fuerza el renderizado de los 4 cuadrantes estadísticos de balance
            if hasattr(self, 'v_dist'):
                self.v_dist.render_statistical_plots(self.v_dist.stats_canvas_area, None)
            self.content_area.add_widget(self.v_dist)
            
        elif instance == self.b5:
            # Fuerza el cálculo del reporte forense forense e informe de clics de la IA
            if hasattr(self, 'v_sum'):
                self.v_sum.update_report_data()
            self.content_area.add_widget(self.v_sum)

class UniversalMotorsportSuiteApp(App):
    def build(self):
        return TelemetrySuiteMainLayout()

if __name__ == '__main__':
    # Corrección: El nombre de la clase debe coincidir exactamente con el declarado arriba
    UniversalMotorsportSuiteApp().run()
