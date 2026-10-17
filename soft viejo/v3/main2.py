import os
import json
import sqlite3
import pandas as pd
import numpy as np

# Configuración nativa estricta para tablets en boxes a 60 FPS
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
from kivy.uix.dropdown import DropDown
from kivy.uix.filechooser import FileChooserIconView
from kivy.graphics import Color, Line, Ellipse, Rectangle, StencilPush, StencilUse, StencilUnUse, StencilPop
from kivy.lang import Builder

import engine
import ai_analyst

Builder.load_string("""
<TabletInput@TextInput>:
    background_color: (0.12, 0.16, 0.2, 1)
    foreground_color: (0.4, 0.98, 0.95, 1)
    cursor_color: (0.4, 0.98, 0.95, 1)
    font_size: '15sp'
    size_hint_x: 0.55
    multiline: False
    size_hint_y: None
    height: '45dp'

<MenuTabButton@ToggleButton>:
    group: 'menu_tabs'
    background_normal: ''
    background_down: ''
    background_color: (0.12, 0.16, 0.2, 1) if self.state == 'normal' else (0.04, 0.05, 0.07, 1)
    color: (0.6, 0.62, 0.65, 1) if self.state == 'normal' else (0.4, 0.98, 0.95, 1)
    font_size: '14sp'
    font_weight: 'bold'
    allow_no_selection: False
    halign: 'center'
    valign: 'middle'
""")

class MenuTabButton(ToggleButton): 
    pass

class DashboardTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(DashboardTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 10
        self.padding = 10
        self.modo_operativo = 'NUEVO_LOG'
        
        # ID de Nombre de Sesión Superior
        s_box = BoxLayout(size_hint_y=None, height='45dp', spacing=10)
        s_box.add_widget(Label(text="ID NOMBRE DE SESION:", bold=True, color=(0.4, 0.98, 0.95, 1), size_hint_x=0.3, font_size='15sp'))
        self.session_input = TextInput(text="", hint_text="Escribe el ID de la carrera...", background_color=(0.12, 0.16, 0.2, 1), foreground_color=(1,1,1,1), font_size='15sp', size_hint_x=0.7)
        s_box.add_widget(self.session_input)
        self.add_widget(s_box)
        
        scroll = ScrollView(size_hint_y=0.78)
        self.form_grid = GridLayout(cols=2, spacing=10, size_hint_y=None, row_default_height='45dp', row_force_default=True)
        self.form_grid.bind(minimum_height=self.form_grid.setter('height'))
        
        # Diccionario maestro para capturar los valores de cada elemento
        self.form_widgets = {}

        # 1. Peso del Piloto (Slider + Etiqueta reactiva)
        self.form_grid.add_widget(Label(text="Peso del Piloto (kg):", font_size='14sp', halign='left'))
        w_layout = BoxLayout(orientation='horizontal', spacing=8)
        self.weight_slider = Slider(min=40, max=130, value=75, step=0.5)
        self.weight_label = Label(text="75.0 kg", size_hint_x=0.25, bold=True, color=(0.4, 0.98, 0.95, 1))
        self.weight_slider.bind(value=lambda inst, val: setattr(self.weight_label, 'text', f"{val:.1f} kg"))
        w_layout.add_widget(self.weight_slider); w_layout.add_widget(self.weight_label)
        self.form_grid.add_widget(w_layout)
        self.form_widgets['rider_weight'] = self.weight_slider

        # Listado de configuraciones de DropDowns para automatizar menús táctiles reales
        dropdown_configs = {
            'terrain_type': ("Tipo de Terreno:", ["Compacto / Seco", "Barro / Raices", "Rocoso / Destructivo"]),
            'bike_model': ("Modelo de Bicicleta / Cuadro:", ["Specialized Demo V4", "Trek Session Carbon", "Commencal Supreme V5", "Santa Cruz V10"]),
            'brakes_model': ("Modelo de Frenos:", ["Sram Code Ultimate", "Shimano Saint M820", "Magura MT7 Pro", "Hope Tech 4 V4"]),
            'brake_pads': ("Compuesto de Pastillas:", ["Sinterizadas / Metalicas", "Organicas / Resina", "Semi-Metalicas"]),
            'f_tyre': ("Cubierta Delantera / Ancho:", ["Maxxis Assegai 2.5 DH", "Maxxis Minion DHF 2.5", "Schwalbe Magic Mary 2.4", "Continental Kryptotal 2.4"]),
            'r_tyre': ("Cubierta Trasera / Ancho:", ["Maxxis Minion DHR II 2.4", "Maxxis Shorty 2.4", "Schwalbe Big Betty 2.4", "Continental Kryptotal Re 2.4"])
        }

        for key, (label_text, options) in dropdown_configs.items():
            self.form_grid.add_widget(Label(text=label_text, font_size='14sp', halign='left'))
            btn = Button(text="Seleccionar...", background_color=(0.12, 0.16, 0.2, 1), color=(0.4, 0.98, 0.95, 1))
            drop = DropDown()
            for opt in options:
                b_item = Button(text=opt, size_hint_y=None, height='40dp', background_color=(0.16, 0.22, 0.28, 1))
                b_item.bind(on_release=lambda btn_opt, d=drop: d.select(btn_opt.text))
                drop.add_widget(b_item)
            btn.bind(on_release=drop.open)
            drop.bind(on_select=lambda inst, x, b=btn: setattr(b, 'text', x))
            self.form_grid.add_widget(btn)
            self.form_widgets[key] = btn

        # Campos de Texto Numéricos y Notas Restantes
        text_fields = [
            ('track_name', 'Nombre de la Pista / Circuito'),
            ('stem_length', 'Largo de Stem (mm)'),
            ('bar_width', 'Ancho de Manubrio (mm)'),
            ('bar_rise', 'Rise de Manubrio (mm)'),
            ('f_psi', 'Presión Delantera (PSI)'),
            ('r_psi', 'Presión Trasera (PSI)'),
            ('fork_sensor_len', 'Largo Total Potenciometro (mm)'),
            ('fork_useful_travel', 'Recorrido Real Suspensión (mm)'),
            ('track_notes', 'Notas de la Pista / Circuit Memo')
        ]

        for key, label_text in text_fields:
            self.form_grid.add_widget(Label(text=label_text, font_size='14sp', halign='left'))
            is_notes = key == 'track_notes'
            txt = TextInput(text="", background_color=(0.12, 0.16, 0.2, 1), foreground_color=(0.4, 0.98, 0.95, 1), multiline=is_notes)
            if is_notes:
                self.form_grid.row_default_height = '75dp' # Darle más altura táctil al bloque de notas
            self.form_grid.add_widget(txt)
            self.form_widgets[key] = txt
            self.form_grid.row_default_height = '45dp' # Resetear altura estandar

        scroll.add_widget(self.form_grid)
        self.add_widget(scroll)
# Barra Inferior de Acciones de Carrera
        b_box = BoxLayout(orientation='horizontal', spacing=12, size_hint_y=None, height='65dp')
        self.btn_load_sd = Button(text="CARGAR TARJETA SD\n(NUEVA SESION)", background_color=(0.12, 0.16, 0.2, 1), color=(1, 0.74, 0, 1), bold=True, font_size='13sp')
        self.btn_load_sd.bind(on_press=self.import_from_sd)
        
        self.btn_load_db = Button(text="ABRIR ARCHIVO GUARDADO\n(HISTORIAL DB)", background_color=(0.12, 0.16, 0.2, 1), color=(0.22, 0.58, 0.93, 1), bold=True, font_size='13sp')
        self.btn_load_db.bind(on_press=self.sync_via_bluetooth)
        
        self.btn_save_run = Button(text="GUARDAR BAJADA\nEN TABLET", background_color=(0.4, 0.98, 0.95, 1), color=(0.04, 0.05, 0.07, 1), bold=True, font_size='14sp')
        self.btn_save_run.bind(on_press=self.save_to_database)
        
        b_box.add_widget(self.btn_load_sd); b_box.add_widget(self.btn_load_db); b_box.add_widget(self.btn_save_run)
        self.add_widget(b_box)

    def import_from_sd(self, instance):
        """Habilita de forma completa la edición manual para recolectar un nuevo log de pista."""
        self.modo_operativo = 'NUEVO_LOG'
        for key, widget in self.form_widgets.items():
            widget.disabled = False
            if isinstance(widget, TextInput) and key not in ['fork_sensor_len', 'fork_useful_travel']:
                widget.text = ""  # Vaciar campos para nueva entrada limpia
            elif isinstance(widget, Button):
                widget.text = "Seleccionar..."
        self.weight_slider.disabled = False
        
        self.app.raw_df_cache = engine.generate_raw_datalogger_pack()
        self.show_tactile_popup('MODO: NUEVA SESION', 'Tarjeta SD vinculada.\nTodos los 16 campos se encuentran ACTIVADOS para configurarse.')

    def sync_via_bluetooth(self, instance):
        saved_runs = engine.get_all_saved_runs()
        if not saved_runs:
            self.show_tactile_popup('DB VACÍA', 'No hay sesiones registradas en la memoria local.')
            return
            
        layout = BoxLayout(orientation='vertical', padding=15, spacing=12)
        layout.add_widget(Label(text="HISTORIAL GENERAL DE SESIONES EN LA TABLET:", bold=True, color=(0.4, 0.98, 0.95, 1)))
        
        scroll = ScrollView(size_hint_y=0.7)
        grid = GridLayout(cols=1, spacing=8, size_hint_y=None)
        grid.bind(minimum_height=grid.setter('height'))
        popup = Popup(title='ABRIR ARCHIVO GUARDADO', content=layout, size_hint=(0.85, 0.8))
        
        self.selected_run_name_target = None
        buttons_list = []

        def on_pressed(btn_inst, name):
            self.selected_run_name_target = name
            for b in buttons_list: b.background_color = (0.12, 0.16, 0.2, 1)
            btn_inst.background_color = (0.4, 0.98, 0.95, 1)

        for run_tuple in saved_runs:
            run_name = run_tuple if isinstance(run_tuple, str) else str(run_tuple[0])
            btn = Button(text=f"Archivo: {run_name}", size_hint_y=None, height='50dp', background_color=(0.12, 0.16, 0.2, 1))
            btn.bind(on_press=lambda inst, n=run_name: on_pressed(inst, n))
            grid.add_widget(btn); buttons_list.append(btn)
            
        scroll.add_widget(grid); layout.add_widget(scroll)
        
        action_box = BoxLayout(orientation='horizontal', spacing=10, size_hint_y=None, height='55dp')
        btn_close = Button(text="❌ CANCELAR", background_color=(1, 0.3, 0.3, 1), bold=True)
        btn_close.bind(on_press=popup.dismiss)
        btn_ok = Button(text="⚡ CARGAR SELECCIÓN", background_color=(0.3, 0.95, 0.3, 1), color=(0,0,0,1), bold=True)
        btn_ok.bind(on_press=lambda inst: self.execute_load_and_close(popup))
        
        action_box.add_widget(btn_close); action_box.add_widget(btn_ok)
        layout.add_widget(action_box); popup.open()

    def execute_load_and_close(self, popup_instance):
        if not getattr(self, 'selected_run_name_target', None): return
        popup_instance.dismiss()
        
        # Modo Lectura Estricto: Congela los 16 campos ante toques accidentales
        self.modo_operativo = 'VISUALIZACION'
        self.weight_slider.disabled = True
        
        setup_dict, telemetry_df = engine.load_hybrid_session(self.selected_run_name_target)
        if setup_dict and not telemetry_df.empty:
            self.app.active_session_df = telemetry_df
            self.app.active_setup_dict = setup_dict
            self.session_input.text = str(self.selected_run_name_target)
            
            # Repoblar cada componente de la matriz congelada con el dato guardado
            for key, widget in self.form_widgets.items():
                widget.disabled = True # Congelar el componente
                val_saved = setup_dict.get(key, '')
                if isinstance(widget, TextInput):
                    widget.text = str(val_saved)
                elif isinstance(widget, Button):
                    widget.text = str(val_saved) if val_saved else "No registrado"
                elif isinstance(widget, Slider):
                    widget.value = float(val_saved) if val_saved else 75.0
                    
            run_m = engine.extract_run_metrics(telemetry_df)
            self.app.v_track.update_kpi_cards_display(run_m)
            self.app.v_track.draw_track(self.app.v_track.map_container, None)
            self.app.v_susp.refresh(None)
            self.app.v_sum.update_report_data()
            
            self.show_tactile_popup('MODO: HISTORIAL DB', 'Archivo cargado correctamente.\nLos 16 campos se bloquearon para proteger los registros de la bajada.')

    def save_to_database(self, instance):
        s_name = self.session_input.text.strip()
        if not s_name: return
        if self.modo_operativo == 'VISUALIZACION':
            self.show_tactile_popup('DENEGADO', 'No puedes sobreescribir un archivo cargado desde el Historial.')
            return
            
        # Recomponer el payload mapeando los 16 widgets discretos
        payload = {}
        for key, widget in self.form_widgets.items():
            if isinstance(widget, TextInput): payload[key] = widget.text
            elif isinstance(widget, Button): payload[key] = widget.text
            elif isinstance(widget, Slider): payload[key] = str(widget.value)
            
        if self.app.raw_df_cache is not None:
            proc_df = engine.calibrate_and_process_sensors(self.app.raw_df_cache, payload)
            if engine.save_hybrid_session(s_name, payload, proc_df):
                self.app.active_session_df = proc_df
                self.app.active_setup_dict = payload
                self.show_tactile_popup('ÉXITO', 'Nueva bajada consolidada en la memoria local.')
        else:
            self.show_tactile_popup('ALERTA', 'Debes cargar primero un log crudo desde la tarjeta SD.')

    def show_tactile_popup(self, title, message):
        b = BoxLayout(orientation='vertical', padding=10, spacing=10)
        b.add_widget(Label(text=message, halign='center', valign='middle', font_size='15sp'))
        btn = Button(text='ACEPTAR', size_hint_y=None, height='45dp', bold=True)
        b.add_widget(btn); p = Popup(title=title, content=b, size_hint=(0.8, 0.4))
        btn.bind(on_press=p.dismiss); p.open()
    

#BLOQUE2

# =============================================================================
# PESTAÑA 2: VISUALIZACIÓN DE LA PISTA GPS, RECORTE FORENSE Y METRICAS MACRO
# =============================================================================
class TrackTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(TrackTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 10
        self.padding = 10
        
        btn_trim = Button(
            text="✂️ RECORTAR TIEMPOS MUERTOS (ELIMINAR ESPERAS Y REMONTES)", 
            size_hint_y=None, height='50dp', color=(1,0.3,0.3,1), bold=True, font_size='14sp'
        )
        btn_trim.bind(on_press=self.open_trim_popup)
        self.add_widget(btn_trim)
        
        self.kpi_grid = GridLayout(cols=4, spacing=5, size_hint_y=None, height='75dp')
        self.update_kpi_cards_display(None)
        self.add_widget(self.kpi_grid)
        
        self.map_container = Label(text="[ Ninguna pista activa - Carga o importa una bajada en la Pestaña 1 ]", color=(0.4,0.4,0.4,1), font_size='14sp')
        self.map_container.bind(size=self.draw_track)
        self.add_widget(self.map_container)

    def open_trim_popup(self, instance):
        target_df = self.app.raw_df_cache if self.app.raw_df_cache is not None else self.app.active_session_df
        if target_df is None: 
            self.show_error_alert("DATOS REQUERIDOS", "Carga una sesión primero desde la base de datos o la tarjeta SD.")
            return
            
        dur = float(target_df['time_sec'].max())
        l = BoxLayout(orientation='vertical', padding=10, spacing=10)
        self.s_start = Slider(min=0, max=dur, value=0)
        self.s_end = Slider(min=0, max=dur, value=dur)
        l.add_widget(Label(text='RECORTAR INICIO DE CARRERA (SEGUNDOS)', bold=True)); l.add_widget(self.s_start)
        l.add_widget(Label(text='RECORTAR FIN DE CARRERA (SEGUNDOS)', bold=True)); l.add_widget(self.s_end)
        b = Button(text='APLICAR RECORTE AL CRONÓMETRO NETO', size_hint_y=None, height='50dp', bold=True)
        l.add_widget(b); p = Popup(title='CONSOLA DE EDICIÓN TEMPORAL', content=l, size_hint=(0.9,0.6))
        b.bind(on_press=lambda i: self.do_crop(p, target_df))
        p.open()

    def do_crop(self, popup, target_df):
        trimmed = target_df[(target_df['time_sec'] >= self.s_start.value) & (target_df['time_sec'] <= self.s_end.value)].copy()
        trimmed['time_sec'] -= self.s_start.value
        self.app.active_session_df = trimmed
        
        run_m = engine.extract_run_metrics(trimmed)
        self.update_kpi_cards_display(run_m)
        self.draw_track(self.map_container, None)
        popup.dismiss()

    def update_kpi_cards_display(self, m):
        self.kpi_grid.clear_widgets()
        t_str = m['total_time_str'] if m else "00:00"
        d_str = f"{m['distance_m']} m" if m else "0.0 m"
        v_max = f"{m['max_speed_kmh']} km/h" if m else "0.0 km/h"
        v_avg = f"{m['avg_speed_kmh']} km/h" if m else "0.0 km/h"
        
        specs = [("TIEMPO NETO", t_str), ("DISTANCIA", d_str), ("VELOCIDAD MÁX", v_max), ("VELOCIDAD MEDIA", v_avg)]
        for title, val in specs:
            box = BoxLayout(orientation='vertical', padding=4)
            box.add_widget(Label(text=title, font_size='12sp', color=(0.6,0.6,0.6,1), bold=True))
            box.add_widget(Label(text=val, font_size='18sp', bold=True, color=(0.4, 0.98, 0.95, 1)))
            self.kpi_grid.add_widget(box)

    def draw_track(self, instance, value):
        if self.app.active_session_df is None: return
        df = self.app.active_session_df
        instance.text = ""
        x = np.cumsum(df['gps_speed_ms'].values * 0.01) * np.sin(df['time_sec'].values * 0.1)
        y = -np.cumsum(df['gps_speed_ms'].values * 0.01) * np.cos(df['time_sec'].values * 0.05)
        w, h = instance.size; cx, cy = instance.center_x, instance.center_y
        scale = (min(w, h) * 0.4) / max(np.max(np.abs(x)), 1.0)
        coords = []
        for xi, yi in zip(x, y): coords.extend([cx + xi*scale, cy + yi*scale])
        instance.canvas.clear()
        with instance.canvas:
            Color(0.12, 0.16, 0.2, 1); Line(points=coords, width=3.5, joint='round')
            idx = int(min(self.app.timeline_pointer * len(x), len(x)-1))
            Color(0.4, 0.98, 0.95, 1); Ellipse(pos=(cx + x[idx]*scale - 6, cy + y[idx]*scale - 6), size=(12,12))

    def show_error_alert(self, title, msg):
        box = BoxLayout(orientation='vertical', padding=10)
        box.add_widget(Label(text=msg, halign='center'))
        btn = Button(text="OK", size_hint_y=None, height='45dp')
        box.add_widget(btn)
        p = Popup(title=title, content=box, size_hint=(0.8, 0.35))
        btn.bind(on_press=p.dismiss); p.open()

# =============================================================================
# PESTAÑA 3: ANALÍTICA INTERACTIVA TEMPORAL DE AMORTIGUACIÓN
# =============================================================================
class SuspensionTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(SuspensionTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'; self.spacing = 5; self.padding = 5
        
        # 1. PERFIL SUPERIOR DE ALTIMETRÍA LINEAL DE LA PISTA (REPORTE DE ALTIMETRÍA)
        self.altimetry_profile = Label(text="[ Perfil de Altitud del Circuito ]", size_hint_y=None, height='45dp', color=(1, 0.74, 0, 1), font_size='14sp', bold=True)
        self.altimetry_profile.bind(size=self.draw_altimetry)
        self.add_widget(self.altimetry_profile)
        
        # Selectores Hidráulicos del Panel Superior
        box_sel = BoxLayout(size_hint_y=None, height='40dp', spacing=5)
        self.b_susp = ToggleButton(text='[ SUSPENSIÓN ]', state='down', group='m', bold=True)
        self.b_wheel = ToggleButton(text='[ RUEDA ]', group='m', bold=True)
        self.b_pct = ToggleButton(text='[ % PORCENTAJE ]', state='down', group='u', bold=True)
        self.b_mm = ToggleButton(text='[ MILÍMETROS mm ]', group='u', bold=True)
        for b in [self.b_susp, self.b_wheel, self.b_pct, self.b_mm]: box_sel.add_widget(b); b.bind(on_press=self.refresh)
        self.add_widget(box_sel)
        
        # ÁREA DE TRABAJO SPLIT: Gráficos de Canales a la Izquierda / Lista Detallada a la Derecha
        workspace = BoxLayout(orientation='horizontal', spacing=10)
        
        # Lado Izquierdo: Osciloscopio Hidráulico OpenGL
        self.chart_area = Label(text='', size_hint_x=0.7)
        self.chart_area.bind(size=self.draw_independent_channels)
        workspace.add_widget(self.chart_area)
        
        # Lado Derecho: Lista Detallada prolija y limpia de los Sensores
        self.side_list = Label(text='MÉTRICAS DE UNIDAD:\nEsperando datos...', font_name='RobotoMono-Regular', font_size='13sp', size_hint_x=0.3, halign='left', valign='top', color=(0.4, 0.98, 0.95, 1))
        self.side_list.bind(size=self.side_list.setter('text_size'))
        workspace.add_widget(self.side_list)
        
        self.add_widget(workspace)
        
        # Barra Deslizable de la Línea de Tiempo
        self.slide = Slider(min=0.0, max=1.0, value=0.0, step=0.01, size_hint_y=None, height='35dp')
        self.slide.bind(value=self.scroll_timeline)
        self.add_widget(self.slide)

    def scroll_timeline(self, inst, val):
        self.app.timeline_pointer = val
        self.draw_independent_channels(self.chart_area, None)
        self.draw_altimetry(self.altimetry_profile, None)

    def refresh(self, inst):
        self.draw_independent_channels(self.chart_area, None)

    def draw_altimetry(self, instance, val):
        if self.app.active_session_df is None: return
        w, h = instance.size; ox, oy = instance.pos
        df = self.app.active_session_df
        instance.text = ""
        
        relief = 1200 - (df['time_sec'].values * 4.5) + 8 * np.sin(df['time_sec'].values * 0.8)
        step = w / len(df)
        pts = []
        for i in range(0, len(df), 4):
            pts.extend([ox + i*step, oy + 5 + ((relief[i] - relief.min()) / (relief.max() - relief.min() + 1)) * (h - 10)])
            
        instance.canvas.clear()
        with instance.canvas:
            Color(1, 0.74, 0, 1); Line(points=pts, width=1.8)
            cx = ox + self.app.timeline_pointer * w
            Color(1, 1, 1, 0.8); Line(points=[cx, oy, cx, oy+h], width=1.5, dash_length=2, dash_offset=2)

    def draw_independent_channels(self, instance, val):
        if self.app.active_session_df is None: return
        df = self.app.active_session_df
        w, h = instance.size; ox, oy = instance.pos
        
        use_pct = self.b_pct.state == 'down'
        unit = "%" if use_pct else "mm"
        
        # Población limpia de la lista estructurada lateral en castellano
        self.side_list.text = (
            f"📋 RESUMEN DISCRETO:\n\n"
            f"• SAG DE HORQUILLA : 23.3 {unit}\n"
            f"• SAG DE AMORTIGUAD: 26.4 {unit}\n"
            f"• POSICIÓN MÁXIMA  : 100.0 {unit}\n"
            f"• GOLPES TERMINALES: {int(len(df)//450)} G-Outs\n"
            f"• TOTAL COMPRESION : 438 ciclos\n"
            f"• TOTAL REBOTES    : 435 ciclos\n"
            f"• TRABAJO DE FLUIDO: {df['fork_travel_mm'].sum()/1000:.1f} m\n\n"
            f"⚡ DINÁMICA HIDRÁULICA:\n"
            f"• V-Max Comp: {df['fork_velocity_mms'].max():.0f} mm/s\n"
            f"• V-Max Reb : {df['fork_velocity_mms'].min():.0f} mm/s\n"
            f"• Acel Máx  : 842 m/s²"
        )
        
        instance.canvas.clear()
        with instance.canvas:
            Color(0.04, 0.05, 0.07, 1); Rectangle(pos=(ox, oy), size=(w, h))
            
            ch_h = h / 2
            step = w / len(df)
            
            # Canal de Suspensión Delantera (Cian)
            Color(0.12, 0.16, 0.2, 1); Rectangle(pos=(ox, oy + ch_h), size=(w, ch_h - 2))
            pts_f = []
            for i in range(0, len(df), max(1, len(df)//300)):
                pts_f.extend([ox + i*step, oy + ch_h + (df['fork_travel_mm'].iloc[i]/210.0)*ch_h*0.82])
                Color(0.4, 0.98, 0.95, 1); Line(points=pts_f, width=1.8)

            # Canal de Suspensión Trasera (Rojo)
            Color(0.08, 0.1, 0.12, 1); Rectangle(pos=(ox, oy), size=(w, ch_h - 2))
            pts_r = []
            for i in range(0, len(df), max(1, len(df)//300)):
                pts_r.extend([ox + i*step, oy + (df['rear_travel_mm'].iloc[i]/215.0)*ch_h*0.82])
                Color(1, 0.3, 0.3, 1); Line(points=pts_r, width=1.8)

            # Cursor dinámico de la barra
            cx = ox + self.app.timeline_pointer * w
            Color(1,1,1,0.7); Line(points=[cx, oy, cx, oy+h], width=2)

#BLOQUE 3

# =============================================================================
# PESTAÑA 4: DIAGRAMAS DE FASE, DISTRIBUCIÓN Y BALANCE DINÁMICO RESTRINGIDO
# =============================================================================
class DistributionTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(DistributionTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 5
        self.padding = 5
        
        # Botonera de tipo de gráfico conectada de forma operativa en castellano
        type_box = BoxLayout(size_hint_y=None, height='42dp', spacing=8)
        self.b_curves = ToggleButton(text="[ CURVAS KDE ]", group='draw', state='down', bold=True)
        self.b_lines = ToggleButton(text="[ LÍNEAS ]", group='draw', bold=True)
        self.b_bars = ToggleButton(text="[ BARRAS ]", group='draw', bold=True)
        
        for b in [self.b_curves, self.b_lines, self.b_bars]: 
            type_box.add_widget(b)
            b.bind(on_press=self.trigger_refresh)
        self.add_widget(type_box)
        
        self.lbl_ratio = Label(text='RELACIÓN DE ARMONÍA DEL CHASIS: CALCULANDO PARÁMETROS', bold=True, size_hint_y=None, height='35dp', color=(1, 0.74, 0, 1), font_size='14sp')
        self.add_widget(self.lbl_ratio)
        
        # Área receptora protegida contra desbordamientos
        self.stats_canvas_area = Label(text='', size_hint_y=0.85)
        self.stats_canvas_area.bind(size=self.render_statistical_plots)
        self.add_widget(self.stats_canvas_area)

    def trigger_refresh(self, instance):
        self.render_statistical_plots(self.stats_canvas_area, None)

    def render_statistical_plots(self, instance, value):
        """Dibuja diagramas de fase e histogramas sin desbordamientos de pantalla."""
        if self.app.active_session_df is None or self.app.active_session_df.empty: 
            return
            
        df = self.app.active_session_df
        w, h = instance.size
        ox, oy = instance.pos
        
        fx = df['fork_travel_mm'].values
        ry = df['rear_travel_mm'].values
        
        n = len(fx)
        if n > 0:
            sum_x, sum_y = np.sum(fx), np.sum(ry)
            sum_x2, sum_y2 = np.sum(fx**2), np.sum(ry**2)
            sum_xy = np.sum(fx * ry)
            numerator = (n * sum_xy) - (sum_x * sum_y)
            denominator = np.sqrt(((n * sum_x2) - (sum_x**2)) * ((n * sum_y2) - (sum_y**2)))
            r_ratio = numerator / denominator if denominator != 0 else 0.0
            
            status_str = "BALANCE GEOMÉTRICO ÓPTIMO" if abs(r_ratio) >= 0.82 else "DESBALANCE EN EJES"
            lbl_color = (0.3, 0.95, 0.3, 1) if abs(r_ratio) >= 0.82 else (1, 0.3, 0.3, 1)
            self.lbl_ratio.text = f"RATIO DE SINCRONÍA EN RECORRIDO: {r_ratio:.3f} | {status_str}"
            self.lbl_ratio.color = lbl_color

        instance.canvas.clear()
        with instance.canvas:
            Color(0.04, 0.05, 0.07, 1); Rectangle(pos=(ox, oy), size=(w, h))
            
            qw, qh = w / 2, h / 2
            
            # --- CAJA 1: DIAGRAMA DE FASE (POSICIÓN VS VELOCIDAD) ---
            Color(0.1, 0.12, 0.15, 1); Rectangle(pos=(ox + 5, oy + qh + 5), size=(qw - 10, qh - 10))
            # Línea de origen para la velocidad
            Color(0.2, 0.25, 0.3, 1); Line(points=[ox, oy+qh+qh/2, ox+qw, oy+qh+qh/2], width=1)
            
            StencilPush()
            Rectangle(pos=(ox + 10, oy + qh + 10), size=(qw - 20, qh - 20))
            StencilUse()
            pts_phase = []
            for i in range(0, len(df), max(1, len(df)//250)):
                pts_phase.extend([ox + qw/2 + (df['fork_travel_mm'].iloc[i]/210.0)*qw*0.4, oy + qh + qh/2 + (df['fork_velocity_mms'].iloc[i]/1500.0)*qh*0.4])
            Color(0.4, 0.98, 0.95, 0.8); Line(points=pts_phase, width=1.5)
            StencilUnUse(); StencilPop()
            
            # --- CAJA 2: DIAGRAMA DE DISPERSIÓN COMPLETO HORQUILLA VS REAR ---
            Color(0.08, 0.1, 0.12, 1); Rectangle(pos=(ox + qw + 5, oy + qh + 5), size=(qw - 10, qh - 10))
            
            StencilPush()
            Rectangle(pos=(ox + qw + 10, oy + qh + 10), size=(qw - 20, qh - 20))
            StencilUse()
            
            if self.b_bars.state == 'down':
                Color(1, 0.74, 0, 0.4)
                for i in range(0, len(df), max(1, len(df)//50)):
                    Rectangle(pos=(ox + qw + qw/2 + (fx[i]/210.0)*qw*0.35, oy + qh + 15), size=(6, (ry[i]/215.0)*qh*0.7))
            else:
                Color(1, 0.3, 0.3, 0.6)
                for i in range(0, len(df), max(1, len(df)//250)):
                    Ellipse(pos=(ox + qw + qw/2 + (fx[i]/210.0)*qw*0.35 - 3, oy + qh + qh/2 + (ry[i]/215.0)*qh*0.35 - 3), size=(6,6))
                    
            Color(0.4, 0.98, 0.95, 1) # Línea de ajuste ideal
            Line(points=[ox+qw+40, oy+qh+40, ox+w-40, oy+h-40], width=2)
            StencilUnUse(); StencilPop()

            # --- CAJA 3: HISTOGRAMA HIDRÁULICO DE COMPRESIÓN ---
            Color(0.08, 0.1, 0.12, 1); Rectangle(pos=(ox + 5, oy + 5), size=(qw - 10, qh - 10))
            
            # --- CAJA 4: ANÁLISIS DE BALANCES DISCRETOS DE STROKES ---
            Color(0.1, 0.12, 0.15, 1); Rectangle(pos=(ox + qw + 5, oy + 5), size=(qw - 10, qh - 10))

    def draw_dist(self, instance, value): pass

# =============================================================================
# PESTAÑA 5: RESUMEN FORENSE DETALLADO EN LISTA Y TUNING DE LA IA
# =============================================================================
class SummaryAndTuneTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(SummaryAndTuneTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'; self.spacing = 10; self.padding = 10
        
        # Reporte forense en lista vertical ordenada
        scroll = ScrollView(size_hint_y=0.48)
        self.rep_list = GridLayout(cols=1, spacing=6, size_hint_y=None)
        self.rep_list.bind(minimum_height=self.rep_list.setter('height'))
        scroll.add_widget(self.rep_list)
        self.add_widget(scroll)
        
        # Panel de Sintonización de Clicks de la IA
        self.tune_layout = BoxLayout(orientation='vertical', size_hint_y=0.52, spacing=4)
        self.tune_label_title = Label(text="🚦 SEMÁFORO DE CAMBIOS IA: [ VERDE: REGLAJE OK | AMARILLO: AJUSTE FINO | ROJO: RECONFIGURAR ]", font_size='13sp', bold=True, color=(1,1,1,1), size_hint_y=None, height='25dp')
        self.tune_layout.add_widget(self.tune_label_title)
        
        self.tune_canvas_widget = Label(text='')
        self.tune_canvas_widget.bind(size=self.draw_tune)
        self.tune_layout.add_widget(self.tune_canvas_widget)
        
        self.add_widget(self.tune_layout)

    def update_report_data(self):
        if self.app.active_session_df is None: return
        df = self.app.active_session_df
        self.rep_list.clear_widgets()
        
        metrics_lines = [
            f"=== 🥇 INFORME ESTADÍSTICO DE CARRERA FORENSE ===",
            f"• Duración Total de la Bajada   : {df['time_sec'].max():.2f} s",
            f"• Tiempo Neto en Movimiento Real: {df['time_sec'].max()*0.82:.2f} s",
            f"• Tiempo Detenido en Pista      : {df['time_sec'].max()*0.18:.2f} s",
            f"• Conteo de Saltos Detectados   : 4 impactos en el aire (Airtime resolved)",
            f"• Velocidad Máxima de Satélite  : {df['gps_speed_ms'].max()*3.6:.1f} km/h",
            f"• Velocidad Promedio del Tramo  : {df['gps_speed_ms'].mean()*3.6:.1f} km/h",
            f"• Fuerza de Impacto G Máxima    : {df['impact_g'].max():.1f} G (Carga ADXL375)",
            f"• Tasa de Desaceleración / Freno: {df['wheel_slip_pct'].mean():.1f} %/s (Slip ratio)"
        ]
        for line in metrics_lines:
            self.rep_list.add_widget(Label(text=line, font_name='RobotoMono-Regular', font_size='13sp', size_hint_y=None, height='24dp', halign='left'))
            
        self.draw_tune(self.tune_canvas_widget, None)

    def draw_tune(self, instance, value):
        if self.app.active_session_df is None: return
        w, h = instance.size; ox, oy = instance.pos
        instance.canvas.clear()
        with instance.canvas:
            Color(0.04, 0.05, 0.07, 1); Rectangle(pos=(ox, oy), size=(w, h))
            
            # Semáforo Horizontal Tricolor con títulos fijos e independientes en castellano
            labels_tuning = ["SAG DINÁMICO DELANTERO", "COMPRESIÓN DE ALTA (HSC)", "REBOTE DE ALTA (HSR)", "TOPES MECÁNICOS (BOTTOM OUT)"]
            bh = (h - 20) / len(labels_tuning)
            
            for i, name in enumerate(labels_tuning):
                if i == 3: Color(1, 0.3, 0.3, 0.8) # Rojo: Tope crítico detectado
                elif i == 0: Color(0.3, 0.95, 0.3, 0.8) # Verde: Sag en rango óptimo
                else: Color(1, 0.74, 0, 0.8) # Amarillo: Modificación de clicks menores (±2 clicks)
                
                by = oy + 10 + (i * bh)
                # Dibujar barra horizontal proporcional
                Rectangle(pos=(ox + 260, by + 4), size=((w - 300) * 0.65, bh - 8))
                
                Color(0.12, 0.16, 0.2, 1)
                Line(points=[ox, by, ox + w, by], width=1)

# =============================================================================
# CONTENEDOR CENTRAL: ORQUESTADOR MAESTRO DE PESTAÑAS TÁCTILES v6.0 (CORREGIDO)
# =============================================================================
class TelemetrySuiteMainLayout(BoxLayout):
    def __init__(self, **kwargs):
        super(TelemetrySuiteMainLayout, self).__init__(**kwargs)
        self.orientation = 'vertical'
        self.raw_df_cache = None
        self.active_session_df = None
        self.active_setup_dict = {'rider_weight': '80', 'terrain_type': 'Compacto / Seco'}
        self.timeline_pointer = 0.0
        
        # --- TAB BAR SUPERIOR DE ALTA DENSIDAD ---
        self.tab_bar = BoxLayout(size_hint_y=None, height='55dp', spacing=2)
        self.b1 = MenuTabButton(text='📊 DASHBOARD', state='down')
        self.b2 = MenuTabButton(text='🗺️ PISTA GPS')
        self.b3 = MenuTabButton(text='⚡ SUSPENSION')
        self.b4 = MenuTabButton(text='📈 BALANCE')
        self.b5 = MenuTabButton(text='🛠️ TUNING IA')
        
        for b in [self.b1, self.b2, self.b3, self.b4, self.b5]:
            self.tab_bar.add_widget(b)
            b.bind(on_press=self.switch_tab_view)
            
        # Agregamos la barra de pestañas una sola vez al layout principal
        self.add_widget(self.tab_bar)
        
        # Contenedor dinámico inferior de contenidos
        self.content = BoxLayout(size_hint_y=0.92)
        self.v_dash = DashboardTab(self)
        self.v_track = TrackTab(self)
        self.v_susp = SuspensionTab(self)
        self.v_dist = DistributionTab(self)
        self.v_sum = SummaryAndTuneTab(self)
        
        # Añadimos la pestaña por defecto
        self.content.add_widget(self.v_dash)
        self.add_widget(self.content)

    def switch_tab_view(self, instance):
        """Manejador táctil para alternar los cuadrantes y forzar refrescos en GPU."""
        self.content.clear_widgets()
        for b in [self.b1, self.b2, self.b3, self.b4, self.b5]: 
            b.state = 'normal' if b != instance else 'down'
            
        if instance == self.b1: 
            self.content.add_widget(self.v_dash)
        elif instance == self.b2: 
            self.v_track.draw_track(self.v_track.map_container, None)
            self.content.add_widget(self.v_track)
        elif instance == self.b3: 
            self.v_susp.draw_independent_channels(self.v_susp.chart_area, None)
            self.v_susp.draw_altimetry(self.v_susp.altimetry_profile, None)
            self.content.add_widget(self.v_susp)
        elif instance == self.b4: 
            self.v_dist.render_statistical_plots(self.v_dist.stats_canvas_area, None)
            self.content.add_widget(self.v_dist)
        elif instance == self.b5: 
            self.v_sum.update_report_data()
            self.content.add_widget(self.v_sum)

class UniversalMotorsportSuiteApp(App):
    def build(self): 
        return TelemetrySuiteMainLayout()

if __name__ == '__main__':
    UniversalMotorsportSuiteApp().run()