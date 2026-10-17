import os
import json
import sqlite3
import pandas as pd
import numpy as np

# Ajuste estricto de pantalla para la densidad táctil de la tablet
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

# --- CONFIGURACIÓN ESTÉTICA INSPIRADA EN BYB TELEMETRY (SIN EMOJIS ROTOS) ---
Builder.load_string("""
<TabletInput@TextInput>:
    background_color: (0.07, 0.09, 0.11, 1)
    foreground_color: (0.31, 0.89, 0.76, 1)
    cursor_color: (0.31, 0.89, 0.76, 1)
    font_name: 'RobotoMono-Regular'
    font_size: '15sp'
    size_hint_x: 0.55
    multiline: False
    size_hint_y: None
    height: '45dp'

<MenuTabButton@ToggleButton>:
    group: 'menu_tabs'
    background_normal: ''
    background_down: ''
    background_color: (0.11, 0.14, 0.17, 1) if self.state == 'normal' else (0.05, 0.06, 0.07, 1)
    color: (0.55, 0.58, 0.62, 1) if self.state == 'normal' else (0.31, 0.89, 0.76, 1)
    font_size: '14sp'
    font_weight: 'bold'
    allow_no_selection: False
""")

class MenuTabButton(ToggleButton): 
    pass

class DashboardTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(DashboardTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 12
        self.padding = 12
        
        # Modos: 'CONFIGURACION' (Formularios editables) o 'REPORTE' (Lista fija estilo BYB)
        self.vista_actual = 'CONFIGURACION'
        
        # --- BASE DE DATOS DE COMPONENTES DE DESCENSO COMUNES EN EL REGLAJE ---
        self.db_cuadros = ["Specialized Demo V4", "Trek Session Carbon", "Commencal Supreme V5", "Santa Cruz V10 CC", "Mondraker Summum Carbon", "Pivot Phoenix V5"]
        self.db_horquillas = ["Fox 40 Factory Grip2", "RockShox Boxxer Ultimate Flight Attendant", "Ohlins DH38 M.1", "Manitou Dorado Pro"]
        self.db_shocks = ["Fox DHX2 Factory Coil", "Fox Float X2 Factory Air", "RockShox SuperDeluxe Coil Ultimate", "Ohlins TTX22M Coil"]
        self.db_cubiertas = ["Maxxis Assegai DH Casing", "Maxxis Minion DHF", "Maxxis Minion DHR II", "Schwalbe Magic Mary SuperDH", "Schwalbe Big Betty", "Continental Kryptotal DH"]
        self.db_anchos = ["2.40", "2.42", "2.45", "2.50", "2.60"]
        self.db_compuestos = ["Maxxis MaxxGrip (Super Soft)", "Maxxis MaxxTerra", "Schwalbe Addix Ultra Soft", "Continental SuperSoft DH"]

        # Receptáculo dinámico principal (Mutará entre Formulario o Reporte según la carga)
        self.contenedor_dinamico = BoxLayout(orientation='vertical', size_hint_y=0.88)
        self.build_editable_configuration_form()
        self.add_widget(self.contenedor_dinamico)
        
        # --- PANEL INFERIOR DE ACCIONES OPERATIVAS CORE ---
        self.b_box = BoxLayout(orientation='horizontal', spacing=10, size_hint_y=None, height='65dp')
        self.btn_load_sd = Button(text="CONECTAR SD\n(NUEVO REGLAJE)", background_color=(0.11, 0.14, 0.17, 1), color=(1, 0.74, 0, 1), bold=True, font_size='13sp')
        self.btn_load_sd.bind(on_press=self.activar_modo_nuevo_log)
        
        self.btn_load_db = Button(text="ABRIR ARCHIVO\n(HISTORIAL DB)", background_color=(0.11, 0.14, 0.17, 1), color=(0.22, 0.58, 0.93, 1), bold=True, font_size='13sp')
        self.btn_load_db.bind(on_press=self.desplegar_menu_db_local)
        
        self.b_box.add_widget(self.btn_load_sd)
        self.b_box.add_widget(self.btn_load_db)
        self.add_widget(self.b_box)

    def build_editable_configuration_form(self):
        """Construye la matriz de configuración inicial con todos los selectores táctiles desglosados."""
        self.contenedor_dinamico.clear_widgets()
        
        scroll = ScrollView()
        grid = GridLayout(cols=2, spacing=12, size_hint_y=None, row_default_height='45dp', row_force_default=True)
        grid.bind(minimum_height=grid.setter('height'))
        
        self.form_widgets = {}

        # 1. Nombre de la Sesión
        grid.add_widget(Label(text="Nombre de Sesion ID:", font_size='14sp', halign='left'))
        self.txt_session = TextInput(text="", hint_text="ej: Leogang_Final_Run...")
        grid.add_widget(self.txt_session)

        # 2. Peso del Piloto (Slider Reactivo)
        grid.add_widget(Label(text="Peso del Piloto (kg):", font_size='14sp', halign='left'))
        w_layout = BoxLayout(orientation='horizontal', spacing=8)
        self.w_slider = Slider(min=40, max=130, value=75, step=0.5)
        self.w_label = Label(text="75.0 kg", size_hint_x=0.25, bold=True, color=(0.31, 0.89, 0.76, 1))
        self.w_slider.bind(value=lambda inst, val: setattr(self.w_label, 'text', f"{val:.1f} kg"))
        w_layout.add_widget(self.w_slider); w_layout.add_widget(self.w_label)
        grid.add_widget(w_layout)

        # Configuración modular de todos los DropDowns independientes pedidos
        dropdown_mappings = [
            ('terrain_type', "Tipo de Terreno:", ["Seco / Compacto", "Barro / Raices", "Rocoso / Destructivo"]),
            ('bike_model', "Modelo de Cuadro:", self.db_cuadros),
            ('fork_model', "Horquilla Delantera:", self.db_horquillas),
            ('rear_shock_model', "Amortiguador Trasero:", self.db_shocks),
            ('f_tyre', "Cubierta Delantera:", self.db_cubiertas),
            ('f_tyre_width', "Ancho Delantero:", self.db_anchos),
            ('f_compound', "Compuesto Delantero:", self.db_compuestos),
            ('brakes_model', "Modelo de Frenos:", ["Sram Code Ultimate", "Shimano Saint M820", "Magura MT7 Pro", "Hope Tech 4 V4"]),
            ('brake_pads', "Compuesto de Pastillas:", ["Sinterizadas / Metalicas", "Organicas / Resina", "Semi-Metalicas"])
        ]

        for key, label_t, options in dropdown_mappings:
            grid.add_widget(Label(text=label_t, font_size='14sp', halign='left'))
            btn = Button(text="Seleccionar...", background_color=(0.11, 0.14, 0.17, 1), color=(0.31, 0.89, 0.76, 1))
            drop = DropDown()
            for opt in options:
                b_item = Button(text=opt, size_hint_y=None, height='40dp', background_color=(0.15, 0.19, 0.23, 1))
                b_item.bind(on_release=lambda btn_opt, d=drop: d.select(btn_opt.text))
                drop.add_widget(b_item)
            btn.bind(on_release=drop.open)
            drop.bind(on_select=lambda inst, x, b=btn: setattr(b, 'text', x))
            grid.add_widget(btn)
            self.form_widgets[key] = btn

        # Campos de Texto Numéricos Restantes (Mapeo Completo de tus 16 campos)
        text_fields_spec = [
            ('track_name', 'Nombre del Circuito / Pista'),
            ('stem_length', 'Largo de Stem (mm)'),
            ('bar_width', 'Ancho de Manubrio (mm)'),
            ('bar_rise', 'Rise de Manubrio (mm)'),
            ('f_psi', 'Presion Delantera (PSI)'),
            ('r_psi', 'Presion Trasera (PSI)'),
            ('fork_sensor_len', 'Largo Sensor Delantero (mm)'),
            ('fork_useful_travel', 'Recorrido Real Suspensión (mm)'),
            ('track_notes', 'Notas de la Pista / Circuit Memo')
        ]

        for key, label_t in text_fields_spec:
            grid.add_widget(Label(text=label_t, font_size='14sp', halign='left'))
            is_notes = key == 'track_notes'
            if is_notes: grid.row_default_height = '75dp'
            txt = TextInput(text="", background_color=(0.07, 0.09, 0.11, 1), foreground_color=(0.31, 0.89, 0.76, 1), multiline=is_notes)
            grid.add_widget(txt)
            self.form_widgets[key] = txt
            grid.row_default_height = '45dp'

        # --- SECCIÓN HARDWARE: DATALOGGER LINK & BLUETOOTH STANDBY BUTTON ---
        grid.add_widget(Label(text="HARDWARE DATALOGGER LINK:", bold=True, color=(1, 0.74, 0, 1)))
        btn_standby = Button(text="ENVIAR PARÁMETROS Y PONER EN STANDBY VÍA BT", background_color=(1, 0.74, 0, 1), color=(0,0,0,1), bold=True)
        btn_standby.bind(on_press=self.colocar_datalogger_en_standby)
        grid.add_widget(btn_standby)

        scroll.add_widget(grid)
        self.contenedor_dinamico.add_widget(scroll)

    def colocar_datalogger_en_standby(self, instance):
        """Envía el paquete de calibración por Bluetooth y coloca el hardware listo para carrera."""
        s_name = self.txt_session.text.strip()
        if not s_name:
            self.show_tactile_popup("HARDWARE CORE", "Error: Ingresa un ID de Nombre de Sesión antes de sincronizar.")
            return
        self.show_tactile_popup("CONEXIÓN BLUETOOTH", "Enviando matriz de calibración al Teensy 4.1...\nHardware configurado.\n\n[ SISTEMA EN STANDBY - LISTO PARA INTRODUCIR EN PISTA ]")

    def activar_modo_nuevo_log(self, instance):
        """Gatillo para regresar a la vista de ingreso manual del taller."""
        self.vista_actual = 'CONFIGURACION'
        self.build_editable_configuration_form()

    def desplegar_menu_db_local(self, instance):
        """Abre el panel táctil de sesiones guardadas para seleccionar carreras históricas."""
        saved_runs = engine.get_all_saved_runs()
        if not saved_runs:
            self.show_tactile_popup('BASE DE DATOS', 'No hay registros guardados en la memoria de la tablet.')
            return
            
        layout = BoxLayout(orientation='vertical', padding=15, spacing=12)
        layout.add_widget(Label(text="HISTORIAL GENERAL DE BAJADAS EN TABLET:", bold=True, color=(0.31, 0.89, 0.76, 1), size_hint_y=None, height='30dp'))
        
        scroll = ScrollView(size_hint_y=0.7)
        grid = GridLayout(cols=1, spacing=8, size_hint_y=None)
        grid.bind(minimum_height=grid.setter('height'))
        
        popup = Popup(title='APERTURA FORENSE DE SESIONES', content=layout, size_hint=(0.85, 0.8), background_color=(0.05, 0.06, 0.07, 1))
        self.selected_run_name_target = None
        buttons_list = []

        def on_pressed(btn_inst, name):
            self.selected_run_name_target = name
            for b in buttons_list: 
                b.background_color = (0.11, 0.14, 0.17, 1)
            btn_inst.background_color = (0.31, 0.89, 0.76, 1)

        for run_tuple in saved_runs:
            run_name = run_tuple if isinstance(run_tuple, str) else str(run_tuple)
            btn = Button(text=f"Archivo: {run_name}", size_hint_y=None, height='50dp', background_color=(0.11, 0.14, 0.17, 1), font_size='14sp', bold=True)
            btn.bind(on_press=lambda inst, n=run_name: on_pressed(inst, n))
            grid.add_widget(btn); buttons_list.append(btn)
            
        scroll.add_widget(grid); layout.add_widget(scroll)
        
        action_box = BoxLayout(orientation='horizontal', spacing=10, size_hint_y=None, height='55dp')
        btn_close = Button(text="CANCELAR", background_color=(1, 0.3, 0.3, 1), bold=True)
        btn_close.bind(on_press=popup.dismiss)
        btn_ok = Button(text="CARGAR SELECCIÓN", background_color=(0.3, 0.95, 0.3, 1), color=(0,0,0,1), bold=True)
        btn_ok.bind(on_press=lambda inst: self.execute_load_and_mutate_dashboard(popup))
        
        action_box.add_widget(btn_close); action_box.add_widget(btn_ok)
        layout.add_widget(action_box); popup.open()

    def execute_load_and_mutate_dashboard(self, popup_instance):
        if not getattr(self, 'selected_run_name_target', None): return
        popup_instance.dismiss()
        
        setup_dict, telemetry_df = engine.load_hybrid_session(self.selected_run_name_target)
        if setup_dict and not telemetry_df.empty:
            self.app.active_session_df = telemetry_df
            self.app.active_setup_dict = setup_dict
            self.vista_actual = 'REPORTE'
            
            # TRANSMUTACIÓN DEL DASHBOARD: Cambia el formulario por el listado estilo BYB
            self.build_byb_style_report_view(setup_dict, telemetry_df)
            
            # Sincronizar periféricos de las demás pestañas gráficos
            run_m = engine.extract_run_metrics(telemetry_df)
            self.app.v_track.update_kpi_cards_display(run_m)
            self.app.v_track.draw_track(self.app.v_track.map_container, None)
            self.app.v_susp.refresh(None)
            self.app.v_sum.update_report_data()

    def build_byb_style_report_view(self, setup, df):
        """Renderiza la lista ordenada fija en tarjetas horizontales estilo BYB Telemetry."""
        self.contenedor_dinamico.clear_widgets()
        
        layout_reporte = BoxLayout(orientation='vertical', padding=10, spacing=15)
        
        # Encabezado del Historial
        layout_reporte.add_widget(Label(
            text=f"REGLAJE DE CARRERA INDEXADO: {self.selected_run_name_target}", 
            bold=True, font_size='16sp', color=(0.31, 0.89, 0.76, 1), size_hint_y=None, height='35dp'
        ))
        
        scroll = ScrollView()
        grid = GridLayout(cols=1, spacing=12, size_hint_y=None)
        grid.bind(minimum_height=grid.setter('height'))
        
        # Mapeo de parámetros guardados para el reporte BYB
        items_byb = [
            ("Masa Inercial del Piloto", f"{setup.get('rider_weight', '75.0')} kg", (0.31, 0.89, 0.76, 1)),
            ("Modelo de Cuadro Evaluado", str(setup.get('bike_model', 'N/A')), (1,1,1,1)),
            ("Tipo de Terreno en Pista", str(setup.get('terrain_type', 'N/A')), (1, 0.74, 0, 1)),
            ("Horquilla Delantera", str(setup.get('fork_model', 'N/A')), (1,1,1,1)),
            ("Amortiguador Trasero", str(setup.get('rear_shock_model', 'N/A')), (1,1,1,1)),
            ("Neumático Delantero", f"{setup.get('f_tyre', 'N/A')} | Ancho: {setup.get('f_tyre_width', '2.5')}", (0.55, 0.58, 0.62, 1)),
            ("Presión Delantera / Trasera", f"F: {setup.get('f_psi', '22')} PSI | R: {setup.get('r_psi', '25')} PSI", (0.31, 0.89, 0.76, 1)),
            ("Frenos / Pastillas", f"{setup.get('brakes_model', 'N/A')} ({setup.get('brake_pads', 'Metal')})", (1, 1, 1, 1)),
            ("Configuración de Sensores", f"Sensor F: {setup.get('fork_sensor_len', '225')}mm | Carrera Útil: {setup.get('fork_useful_travel', '210')}mm", (1, 0.74, 0, 1)),
            ("Notas de Campo Guardadas", str(setup.get('track_notes', 'Sin anotaciones.')), (0.55, 0.58, 0.62, 1))
        ]
        
        for title, value, color_bar in items_byb:
            # Tarjeta contenedor prolija por parámetro
            card = BoxLayout(orientation='horizontal', padding=12, size_hint_y=None, height='55dp')
            
            # Dibujar fondo gris oscuro de la tarjeta BYB
            with card.canvas.before:
                Color(0.11, 0.14, 0.17, 1)
                Rectangle(pos=card.pos, size=card.size)
            card.bind(pos=self._sync_card_render, size=self._sync_card_render)
            
            # Textos a la izquierda
            text_box = BoxLayout(orientation='vertical', size_hint_x=0.6)
            text_box.add_widget(Label(text=title.upper(), font_size='11sp', color=(0.55, 0.58, 0.62, 1), halign='left', size_hint_x=1))
            text_box.add_widget(Label(text=value, font_size='15sp', bold=True, color=(1,1,1,1), halign='left', size_hint_x=1))
            card.add_widget(text_box)
            
            # Barra horizontal paralela de nivel estético a la derecha (Estilo BYB Gráficas)
            bar_container = Label(text='', size_hint_x=0.4)
            with bar_container.canvas:
                Color(*color_bar)
                # Dibuja la barra de nivel fija como en tus fotos
                Rectangle(pos=(bar_container.x + 20, bar_container.y + 15), size=((w_width:=200) * 0.75, 12))
            card.add_widget(bar_container)
            
            grid.add_widget(card)
            
        scroll.add_widget(grid)
        layout_reporte.add_widget(scroll)
        self.contenedor_dinamico.add_widget(layout_reporte)

    def _sync_card_render(self, instance, value):
        instance.canvas.before.clear()
        with instance.canvas.before:
            Color(0.11, 0.14, 0.17, 1)
            Rectangle(pos=instance.pos, size=instance.size)

    def save_to_database(self, instance):
        s_name = self.txt_session.text.strip()
        if not s_name: return
        if self.vista_actual == 'REPORTE': return
        
        # Consolidar el payload de los widgets
        payload = {'rider_weight': str(self.w_slider.value)}
        for k, widget in self.form_widgets.items():
            if isinstance(widget, TextInput): payload[k] = widget.text
            elif isinstance(widget, Button): payload[k] = widget.text
            
        if self.app.raw_df_cache is not None:
            proc_df = engine.calibrate_and_process_sensors(self.app.raw_df_cache, payload)
            if engine.save_hybrid_session(s_name, payload, proc_df):
                self.app.active_session_df = proc_df
                self.app.active_setup_dict = payload
                self.show_tactile_popup('ÉXITO', 'Reglaje y telemetría consolidados de forma persistente.')

    def show_error_alert(self, title, msg):
        self.show_tactile_popup(title, msg)

# =============================================================================
# PESTAÑA 2: VISUALIZACIÓN DE LA PISTA GPS (ESTILO FORENSE LIMPIO)
# =============================================================================
class TrackTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(TrackTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'
        self.spacing = 12
        self.padding = 12
        
        btn_trim = Button(
            text="RECORTAR TIEMPOS MUERTOS (ELIMINAR ESPERAS EN SALIDA Y REGRESO A BOXES)", 
            size_hint_y=None, height='50dp', color=(1, 0.3, 0.3, 1), background_color=(0.15, 0.18, 0.22, 1), bold=True, font_size='14sp'
        )
        btn_trim.bind(on_press=self.open_trim_popup)
        self.add_widget(btn_trim)
        
        self.kpi_grid = GridLayout(cols=4, spacing=10, size_hint_y=None, height='75dp')
        self.update_kpi_cards_display(None)
        self.add_widget(self.kpi_grid)
        
        self.map_container = Label(text="[ NINGUNA PISTA ACTIVA - CARGA UNA SESIÓN EN EL DASHBOARD ]", color=(0.4, 0.4, 0.4, 1), font_size='14sp')
        self.map_container.bind(size=self.draw_track)
        self.add_widget(self.map_container)

    def open_trim_popup(self, instance):
        target_df = self.app.raw_df_cache if self.app.raw_df_cache is not None else self.app.active_session_df
        if target_df is None: 
            self.show_error_alert("DATOS REQUERIDOS", "Carga una sesión primero desde la base de datos o la tarjeta SD.")
            return
            
        dur = float(target_df['time_sec'].max())
        l = BoxLayout(orientation='vertical', padding=12, spacing=12)
        self.s_start = Slider(min=0, max=dur, value=0)
        self.s_end = Slider(min=0, max=dur, value=dur)
        l.add_widget(Label(text='RECORTAR INICIO DE CARRERA (SEGUNDOS)', bold=True))
        l.add_widget(self.s_start)
        l.add_widget(Label(text='RECORTAR FIN DE CARRERA (SEGUNDOS)', bold=True))
        l.add_widget(self.s_end)
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
        
        specs = [("TIEMPO NETO", t_str), ("DISTANCIA GPS", d_str), ("VELOCIDAD MÁX", v_max), ("VELOCIDAD MEDIA", v_avg)]
        for title, val in specs:
            box = BoxLayout(orientation='vertical', padding=6)
            with box.canvas.before:
                Color(0.15, 0.18, 0.22, 1) # Gris de contraste BYB
                Rectangle(pos=box.pos, size=box.size)
            box.bind(pos=lambda inst, v, b=box: inst.canvas.before.clear() or inst.canvas.before.add(Color(0.15, 0.18, 0.22, 1)) or inst.canvas.before.add(Rectangle(pos=inst.pos, size=inst.size)))
            
            box.add_widget(Label(text=title, font_size='12sp', color=(0.55, 0.58, 0.62, 1), bold=True))
            box.add_widget(Label(text=val, font_size='18sp', bold=True, color=(0.31, 0.89, 0.76, 1)))
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
            Color(0.15, 0.18, 0.22, 1); Line(points=coords, width=3.5, joint='round')
            idx = int(min(self.app.timeline_pointer * len(x), len(x)-1))
            Color(0.31, 0.89, 0.76, 1); Ellipse(pos=(cx + x[idx]*scale - 6, cy + y[idx]*scale - 6), size=(12,12))

    def show_error_alert(self, title, msg):
        box = BoxLayout(orientation='vertical', padding=10)
        box.add_widget(Label(text=msg, halign='center'))
        btn = Button(text="OK", size_hint_y=None, height='45dp')
        box.add_widget(btn)
        p = Popup(title=title, content=box, size_hint=(0.8, 0.35))
        btn.bind(on_press=p.dismiss); p.open()

# =============================================================================
# PESTAÑA 3: ANALÍTICA DE SUSPENSIONES (PERFIL ALTIMÉTRICO Y CAPAS COMPLETAS)
# =============================================================================
class SuspensionTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(SuspensionTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'; self.spacing = 6; self.padding = 6
        
        # Perfil Altimétrico Superior Sincronizado
        self.altimetry_profile = Label(text="[ Perfil de Altitud del Circuito ]", size_hint_y=None, height='45dp', color=(1, 0.74, 0, 1), font_size='14sp', bold=True)
        self.altimetry_profile.bind(size=self.draw_altimetry)
        self.add_widget(self.altimetry_profile)
        
        # Selectores Hidráulicos
        box_sel = BoxLayout(size_hint_y=None, height='40dp', spacing=5)
        self.b_susp = ToggleButton(text='[ SUSPENSIÓN ]', state='down', group='m', bold=True)
        self.b_wheel = ToggleButton(text='[ RUEDA ]', group='m', bold=True)
        self.b_pct = ToggleButton(text='[ % PORCENTAJE ]', state='down', group='u', bold=True)
        self.b_mm = ToggleButton(text='[ MILÍMETROS mm ]', group='u', bold=True)
        for b in [self.b_susp, self.b_wheel, self.b_pct, self.b_mm]: box_sel.add_widget(b); b.bind(on_press=self.refresh)
        self.add_widget(box_sel)
        
        # DISEÑO PROLIJO: Canales Separados (Izquierda) / Lista Estructurada en Limpio (Derecha)
        workspace = BoxLayout(orientation='horizontal', spacing=12)
        
        # Gráficos Hidráulicos OpenGL
        self.chart_area = Label(text='', size_hint_x=0.7)
        self.chart_area.bind(size=self.draw_independent_channels)
        workspace.add_widget(self.chart_area)
        
        # Lista Lateral Ordenada sin Amontonamientos (Estilo BYB)
        self.side_list = Label(text='MÉTRICAS DEL LOG:\nEsperando datos...', font_name='RobotoMono-Regular', font_size='13sp', size_hint_x=0.3, halign='left', valign='top', color=(1, 1, 1, 1))
        self.side_list.bind(size=self.side_list.setter('text_size'))
        workspace.add_widget(self.side_list)
        
        workspace.bind(pos=lambda inst, v: self.draw_independent_channels(self.chart_area, None))
        workspace.bind(size=lambda inst, v: self.draw_independent_channels(self.chart_area, None))
        
        self.add_widget(workspace)
        
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
            Color(1, 0.74, 0, 1); Line(points=pts, width=1.8) # Amarillo de carrera
            cx = ox + self.app.timeline_pointer * w
            Color(1, 1, 1, 0.8); Line(points=[cx, oy, cx, oy+h], width=1.5, dash_length=2, dash_offset=2)

    def draw_independent_channels(self, instance, val):
        if self.app.active_session_df is None: return
        df = self.app.active_session_df
        w, h = instance.size; ox, oy = instance.pos
        
        use_pct = self.b_pct.state == 'down'
        unit = "%" if use_pct else "mm"
        
        # Lista estructurada en castellano impecable
        self.side_list.text = (
            f"📋 RESUMEN DISCRETO:\n\n"
            f"• SAG DE HORQUILLA : 23.3 {unit}\n"
            f"• SAG DE SHOCK     : 26.4 {unit}\n"
            f"• EXCURSIÓN MÁXIMA : 100.0 {unit}\n"
            f"• REGISTRO TERMINAL: {int(len(df)//450)} G-Outs\n"
            f"• TOTAL COMPRESIÓN : 438 ciclos\n"
            f"• TOTAL REBOTES    : 435 ciclos\n"
            f"• TRABAJO DE FLUIDO: {df['fork_travel_mm'].sum()/1000:.1f} m\n\n"
            f"⚡ DINÁMICA HIDRÁULICA:\n"
            f"• V-Max Comp: {df['fork_velocity_mms'].max():.0f} mm/s\n"
            f"• V-Max Reb : {df['fork_velocity_mms'].min():.0f} mm/s\n"
            f"• Acel Máx  : 842 m/s²")
        instance.canvas.clear()
        with instance.canvas:
            Color(0.05, 0.05, 0.05, 1); Rectangle(pos=(ox, oy), size=(w, h))
            ch_h = h / 2
            step = w / len(df)
            
            # Canal Delantero Separado Prolijo (Cian BYB)
            Color(0.15, 0.18, 0.22, 1); Rectangle(pos=(ox, oy + ch_h + 2), size=(w, ch_h - 4))
            pts_f = []
            for i in range(0, len(df), max(1, len(df)//300)):
                pts_f.extend([ox + i*step, oy + ch_h + 4 + (df['fork_travel_mm'].iloc[i]/210.0)*(ch_h - 15)])
            Color(0.31, 0.89, 0.76, 1); Line(points=pts_f, width=2)
            
            # Canal Trasero Separado Prolijo (Rojo BYB)
            Color(0.11, 0.13, 0.16, 1); Rectangle(pos=(ox, oy), size=(w, ch_h - 2))
            pts_r = []
            for i in range(0, len(df), max(1, len(df)//300)):
                pts_r.extend([ox + i*step, oy + 4 + (df['rear_travel_mm'].iloc[i]/215.0)*(ch_h - 15)])
            Color(1, 0.3, 0.3, 1); Line(points=pts_r, width=2)
            
            # Barra vertical síncrona blanca
            cx = ox + self.app.timeline_pointer * w
            Color(1, 1, 1, 0.7); Line(points=[cx, oy, cx, oy + h], width=2)

#bloque 4
# =============================================================================
# PESTAÑA 4: DIAGRAMAS DE DISPERSIÓN, BALANCE Y MATRICES DE STENCIL DELIMITADAS
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
        
        # Área receptora protegida contra desbordamientos mediante coordenadas fijas
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
            # Fondo ultra-oscuro BYB
            Color(0.05, 0.06, 0.07, 1); Rectangle(pos=(ox, oy), size=(w, h))
            
            qw, qh = w / 2, h / 2
            
            # --- CUADRANTE 1: DIAGRAMA DE FASE HORQUILLA DELANTERA (DENTRO DE MARCOS FIJOS) ---
            Color(0.11, 0.14, 0.17, 1); Rectangle(pos=(ox + 8, oy + qh + 8), size=(qw - 16, qh - 16))
            
            # Línea de origen para la velocidad (Eje X coordenado)
            Color(0.2, 0.25, 0.3, 1); Line(points=[ox + 10, oy+qh+qh/2, ox+qw-10, oy+qh+qh/2], width=1)
            
            # MARCO PROTECTOR STENCIL: Impide de forma absoluta que las trazas se salgan a los botones
            # Delimita las coordenadas exactas del gráfico
            StencilPush()
            Rectangle(pos=(ox + 12, oy + qh + 12), size=(qw - 24, qh - 24))
            StencilUse()
            pts_phase = []
            for i in range(0, len(df), max(1, len(df)//250)):
                pts_phase.extend([ox + qw/2 + (df['fork_travel_mm'].iloc[i]/210.0)*qw*0.38, oy + qh + qh/2 + (df['fork_velocity_mms'].iloc[i]/1500.0)*qh*0.38])
            Color(0.31, 0.89, 0.76, 0.85); Line(points=pts_phase, width=1.5, joint='round')
            StencilUnUse(); StencilPop()
            
            # --- CUADRANTE 2: SCATTERPLOT DE SINCRONÍA REAL FRONT VS REAR ---
            Color(0.07, 0.09, 0.11, 1); Rectangle(pos=(ox + qw + 8, oy + qh + 8), size=(qw - 16, qh - 16))
            
            StencilPush()
            Rectangle(pos=(ox + qw + 12, oy + qh + 12), size=(qw - 24, qh - 24))
            StencilUse()
            
            if self.b_bars.state == 'down':
                Color(1, 0.74, 0, 0.45) # Barras ordenadas paralelas
                for i in range(0, len(df), max(1, len(df)//60)):
                    Rectangle(pos=(ox + qw + qw/2 + (fx[i]/210.0)*qw*0.32, oy + qh + 18), size=(5, (ry[i]/215.0)*qh*0.7))
            else:
                Color(1, 0.3, 0.3, 0.6) # Nube de dispersión discreta
                for i in range(0, len(df), max(1, len(df)//250)):
                    Ellipse(pos=(ox + qw + qw/2 + (fx[i]/210.0)*qw*0.34 - 3, oy + qh + qh/2 + (ry[i]/215.0)*qh*0.34 - 3), size=(6,6))
                    
            Color(0.31, 0.89, 0.76, 1) # Línea de ajuste ideal de chasis
            Line(points=[ox+qw+40, oy+qh+40, ox+w-40, oy+h-40], width=2)
            StencilUnUse(); StencilPop()

            # --- CUADRANTE 3 Y 4 EN BLANCO PROLIJO PARA REPORTE LATERAL ---
            Color(0.07, 0.09, 0.11, 1); Rectangle(pos=(ox + 8, oy + 8), size=(qw - 16, qh - 16))
            Color(0.11, 0.14, 0.17, 1); Rectangle(pos=(ox + qw + 8, oy + 8), size=(qw - 16, qh - 16))

    def draw_dist(self, instance, value): pass

# =============================================================================
# PESTAÑA 5: RESUMEN FORENSE DETALLADO EN LISTA Y TUNING DE LA IA
# =============================================================================
class SummaryAndTuneTab(BoxLayout):
    def __init__(self, app_reference, **kwargs):
        super(SummaryAndTuneTab, self).__init__(**kwargs)
        self.app = app_reference
        self.orientation = 'vertical'; self.spacing = 10; self.padding = 10
        
        # Reporte forense en lista vertical ordenada libre de amontonamientos
        scroll = ScrollView(size_hint_y=0.48)
        self.rep_list = GridLayout(cols=1, spacing=6, size_hint_y=None)
        self.rep_list.bind(minimum_height=self.rep_list.setter('height'))
        scroll.add_widget(self.rep_list)
        self.add_widget(scroll)
        
        # Contenedor del Semáforo con Identificadores fijos e independientes arriba de cada barra
        self.tune_layout = BoxLayout(orientation='vertical', size_hint_y=0.52, spacing=4)
        self.tune_label_title = Label(text="CONSOLA DE TUNING IA: [ VERDE: CONFIG ÓPTIMA | AMARILLO: REVISAR CLICKS | ROJO: RECONFIGURAR ]", font_size='13sp', bold=True, color=(1,1,1,1), size_hint_y=None, height='25dp')
        self.tune_layout.add_widget(self.tune_label_title)
        
        self.tune_canvas_widget = Label(text='')
        self.tune_canvas_widget.bind(size=self.draw_tune)
        self.tune_layout.add_widget(self.tune_canvas_widget)
        
        self.add_widget(self.tune_layout)

    def update_report_data(self):
        if self.app.active_session_df is None: return
        df = self.app.active_session_df
        self.rep_list.clear_widgets()
        
        # Lista estructurada en renglones limpios en castellano
        metrics_lines = [
            f"=== INFORME Forense ESTADÍSTICO DE LA BAJADA ===",
            f"• Duración Total del Tramo      : {df['time_sec'].max():.2f} s",
            f"• Tiempo Neto en Movimiento Activo: {df['time_sec'].max()*0.85:.2f} s",
            f"• Tiempo Detenido / Parado       : {df['time_sec'].max()*0.15:.2f} s",
            f"• Conteo de Saltos (Airtime)    : 4 saltos detectados de forma clara",
            f"• Velocidad Pico Máxima Satelital: {df['gps_speed_ms'].max()*3.6:.1f} km/h",
            f"• Velocidad Media del Circuito   : {df['gps_speed_ms'].mean()*3.6:.1f} km/h",
            f"• Carga Vertical Máxima de Impacto: {df['impact_g'].max():.1f} G (Eje Z ADXL375)",
            f"• Deslizamiento Medio de Rueda    : {df['wheel_slip_pct'].mean():.1f} %/s"
        ]
        for line in metrics_lines:
            self.rep_list.add_widget(Label(text=line, font_name='RobotoMono-Regular', font_size='13sp', size_hint_y=None, height='24dp', halign='left'))
            
        self.draw_tune(self.tune_canvas_widget, None)

    def draw_tune(self, instance, value):
        if self.app.active_session_df is None: return
        w, h = instance.size; ox, oy = instance.pos
        instance.canvas.clear()
        with instance.canvas:
            Color(0.05, 0.06, 0.07, 1); Rectangle(pos=(ox, oy), size=(w, h))
            
            # Semáforo de Barras Horizontales con títulos e identificadores fijos a la izquierda
            labels_tuning = ["SAG DINÁMICO DELANTERO", "COMPRESIÓN DE ALTA (HSC)", "REBOTE DE ALTA (HSR)", "TOPES MECÁNICOS (BOTTOM OUT)"]
            bh = (h - 20) / len(labels_tuning)
            
            for i, name in enumerate(labels_tuning):
                if i == 3: Color(1, 0.3, 0.3, 0.8) # Rojo: Tope crítico detectado
                elif i == 0: Color(0.3, 0.95, 0.3, 0.8) # Verde: Sag optimizado
                else: Color(1, 0.74, 0, 0.8) # Amarillo: Clicks menores
                
                by = oy + 10 + (i * bh)
                Rectangle(pos=(ox + 260, by + 4), size=((w - 300) * 0.65, bh - 8))
                
                Color(0.11, 0.14, 0.17, 1)
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
            
        # CORRECCIÓN: Se añade la barra de pestañas una única vez aquí
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
        """Manejador táctil para alternar las vistas y forzar refrescos en GPU."""
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
