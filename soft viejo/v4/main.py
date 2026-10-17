# =============================================================================
# ARCHIVO: main.py (PARTE A DE B)
# =============================================================================
import random
import threading
import math
from kivy.app import App
from kivy.uix.screenmanager import ScreenManager, Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.textinput import TextInput
from kivy.uix.widget import Widget
from kivy.uix.popup import Popup
from kivy.uix.scrollview import ScrollView
from kivy.uix.spinner import Spinner
from kivy.uix.slider import Slider
from kivy.core.window import Window
from kivy.clock import Clock
from kivy.metrics import dp
from kivy.graphics import Color, Rectangle, Line

# Importación de módulos internos estructurados en Bloque 1
from pimp_engine import PimpEngine
from pimp_ai import PimpAIAnalyst
from pimp_gui_widgets import (
    COLOR_FONDO_ABS, 
    COLOR_AMARILLO_ORO, 
    COLOR_CIAN_FOSFO, 
    OsciloscopioCanal, 
    FilaSemaforoHorizontal,
    DiagramaDispersionCruzada,
    DiagramaFaseCinematico,
    HistogramaDistribucionRecorrido

)

Window.clearcolor = COLOR_FONDO_ABS

class PantallaBienvenida(Screen):
    """Lobby ergonómico con botones grandes optimizados para interacciones táctiles."""
    def __init__(self, **kwargs):
        super(PantallaBienvenida, self).__init__(**kwargs)
        layout = BoxLayout(orientation='vertical', padding=dp(35), spacing=dp(25))
        
        layout.add_widget(Label(
            text="TELEMETRY PIMP", font_name="RobotoMono-Regular",
            font_size=dp(46), color=COLOR_AMARILLO_ORO, size_hint_y=0.3
        ))
        
        btn_layout = BoxLayout(orientation='vertical', spacing=dp(15), size_hint_y=0.7)
        
        self.btn_bt = Button(text="CONECTAR VIA BLUETOOTH (TEENSY)", font_name="RobotoMono-Regular", font_size=dp(14), size_hint_y=None, height=dp(60))
        self.btn_bt.bind(on_release=self.verificar_y_conectar_bt)
        
        self.btn_db = Button(text="ABRIR ARCHIVO GUARDADO (HISTORIAL DB)", font_name="RobotoMono-Regular", font_size=dp(14), size_hint_y=None, height=dp(60))
        self.btn_db.bind(on_release=self.abrir_historial_db)
        
        self.btn_sd = Button(text="IMPORTAR ARCHIVO DESDE TARJETA SD", font_name="RobotoMono-Regular", font_size=dp(14), size_hint_y=None, height=dp(60))
        self.btn_sd.bind(on_release=self.abrir_recorte_sd)
        
        btn_layout.add_widget(self.btn_bt)
        btn_layout.add_widget(self.btn_db)
        btn_layout.add_widget(self.btn_sd)
        layout.add_widget(btn_layout)
        self.add_widget(layout)

    def verificar_y_conectar_bt(self, instance):
        self.btn_bt.text = "VERIFICANDO ANTENA BLUETOOTH..."
        def check_proc():
            threading.Event().wait(1.2)
            Clock.schedule_once(lambda dt: self.conexion_exitosa_bt(), 0)
        threading.Thread(target=check_proc, daemon=True).start()

    def conexion_exitosa_bt(self):
        self.btn_bt.text = "CONECTAR VIA BLUETOOTH (TEENSY)"
        self.manager.current = 'formulario_standby'

    def abrir_historial_db(self, instance):
        app = App.get_running_app()
        app.modo_edicion = False
        app.cargar_datos_sinteticos_analisis()
        self.manager.current = 'suite_analitica'

    def abrir_recorte_sd(self, instance):
        PopupRecorteTrack().open()


# =============================================================================
# BLOQUE INTEGRADO: REEMPLAZO DIRECTO PARA LA CLASE PantallaFormularioStandby EN main.py
# =============================================================================
from kivy.uix.slider import Slider  # Aseguramos la importación del Slider táctil

class PantallaFormularioStandby(Screen):
    """
    Formulario táctil avanzado para el Modo NUEVO_LOG.
    Permite pre-cargar la configuración exacta de neumáticos y chasis antes de iniciar la DAQ.
    """
    def __init__(self, **kwargs):
        super(PantallaFormularioStandby, self).__init__(**kwargs)
        layout = BoxLayout(orientation='vertical', padding=dp(20), spacing=dp(10))
        
        # Encabezado fijo
        layout.add_widget(Label(
            text="PRE-CARGA DE PARÁMETROS: CONFIGURACIÓN DE CARRERA", 
            font_name="RobotoMono-Regular", font_size=dp(14), 
            color=COLOR_AMARILLO_ORO, size_hint_y=None, height=dp(30)
        ))
        
        scroll_form = ScrollView(size_hint_y=0.75)
        grid = GridLayout(cols=2, spacing=dp(10), size_hint_y=None)
        grid.bind(minimum_height=grid.setter('height'))
        
        # --- SECCIÓN GEOMETRÍA ---
        grid.add_widget(Label(text="Peso Piloto (kg):", halign='left', size_hint_y=None, height=dp(40)))
        self.peso_in = TextInput(text="82", input_filter='float', multiline=False, font_size=dp(15), size_hint_y=None, height=dp(40))
        grid.add_widget(self.peso_in)
        
        grid.add_widget(Label(text="Largo Sensor Horquilla (mm):", halign='left', size_hint_y=None, height=dp(40)))
        self.sens_h = TextInput(text="200", input_filter='int', multiline=False, font_size=dp(15), size_hint_y=None, height=dp(40))
        grid.add_widget(self.sens_h)
        
        grid.add_widget(Label(text="Largo Sensor Shock (mm):", halign='left', size_hint_y=None, height=dp(40)))
        self.sens_s = TextInput(text="75", input_filter='int', multiline=False, font_size=dp(15), size_hint_y=None, height=dp(40))
        grid.add_widget(self.sens_s)
        
        # --- SECCIÓN NEUMÁTICOS (SPINNERS TÁCTILES) ---
        grid.add_widget(Label(text="Marca Neumáticos:", halign='left', size_hint_y=None, height=dp(40)))
        self.spin_marca = Spinner(
            text='MAXXIS', values=('MAXXIS', 'SCHWALBE', 'PIRELLI', 'CONTINENTAL'),
            font_name="RobotoMono-Regular", font_size=dp(13), size_hint_y=None, height=dp(40)
        )
        grid.add_widget(self.spin_marca)
        
        grid.add_widget(Label(text="Ancho Cubierta:", halign='left', size_hint_y=None, height=dp(40)))
        self.spin_ancho = Spinner(
            text='2.40"', values=('2.35"', '2.40"', '2.50"'),
            font_name="RobotoMono-Regular", font_size=dp(13), size_hint_y=None, height=dp(40)
        )
        grid.add_widget(self.spin_ancho)
        
        grid.add_widget(Label(text="Compuesto Goma:", halign='left', size_hint_y=None, height=dp(40)))
        self.spin_compuesto = Spinner(
            text='3C MAX_GRIP', values=('3C MAX_GRIP', 'SUPER SOFT', 'SMARTGRIP DH'),
            font_name="RobotoMono-Regular", font_size=dp(13), size_hint_y=None, height=dp(40)
        )
        grid.add_widget(self.spin_compuesto)
        
        # --- SECCIÓN PRESIONES (SLIDERS DIGITALES) ---
        self.lbl_presion_d = Label(text="Presión Delantera: 23 Psi", halign='left', size_hint_y=None, height=dp(40))
        grid.add_widget(self.lbl_presion_d)
        self.slide_presion_d = Slider(min=15, max=35, value=23, step=1, size_hint_y=None, height=dp(40))
        self.slide_presion_d.bind(value=lambda instance, val: setattr(self.lbl_presion_d, 'text', f"Presión Delantera: {int(val)} Psi"))
        grid.add_widget(self.slide_presion_d)
        
        self.lbl_presion_t = Label(text="Presión Trasera: 26 Psi", halign='left', size_hint_y=None, height=dp(40))
        grid.add_widget(self.lbl_presion_t)
        self.slide_presion_t = Slider(min=15, max=35, value=26, step=1, size_hint_y=None, height=dp(40))
        self.slide_presion_t.bind(value=lambda instance, val: setattr(self.lbl_presion_t, 'text', f"Presión Trasera: {int(val)} Psi"))
        grid.add_widget(self.slide_presion_t)
        
        scroll_form.add_widget(grid)
        layout.add_widget(scroll_form)
        
        # Botón ergonómico de disparo
        btn_ready = Button(
            text="ENVIAR CALIBRACIÓN BT Y PONER EN STANDBY", 
            font_name="RobotoMono-Regular", background_color=(0.1, 0.5, 0.3, 1), 
            size_hint_y=None, height=dp(55)
        )
        btn_ready.bind(on_release=self.fijar_standby_daq)
        layout.add_widget(btn_ready)
        
        self.add_widget(layout)

    def fijar_standby_daq(self, instance):
        """
        Captura los Spinners y Sliders, simula el envío del paquete de telemetría 
        vía Bluetooth hacia el Teensy 4.1 y desbloquea el entorno operativo.
        """
        app = App.get_running_app()
        app.modo_edicion = True
        
        # Empaquetado completo de la calibración de boxes
        app.config_actual = {
            'peso': float(self.peso_in.text or 0),
            'largo_h': float(self.sens_h.text or 0),
            'largo_s': float(self.sens_s.text or 0),
            'rec_h': 200.0,
            'rec_s': 75.0,
            'marca_neumatico': self.spin_marca.text,
            'ancho_neumatico': self.spin_ancho.text,
            'compuesto_neumatico': self.spin_compuesto.text,
            'presion_d': int(self.slide_presion_d.value),
            'presion_t': int(self.slide_presion_t.value)
        }
        
        print(f"[BT] Payload de configuración inyectado: {app.config_actual['marca_neumatico']} a {app.config_actual['presion_t']} Psi traseros.")
        
        # Dispara los motores y cambia la pantalla a la suite de analíticas fijas
        app.cargar_datos_sinteticos_analisis()
        self.manager.current = 'suite_analitica'

# =============================================================================
# ARCHIVO: main.py (PARTE B DE B)
# =============================================================================

class PopupRecorteTrack(Popup):
    """Módulo táctil transitorio para recortar logs dañados o tramos iniciales."""
    def __init__(self, **kwargs):
        super(PopupRecorteTrack, self).__init__(**kwargs)
        self.title = "RECORTAR TRAMO DE CARRERA - MUESTRAS FILTRADAS"
        self.size_hint = (0.95, 0.95)
        
        layout_int = BoxLayout(orientation='vertical', spacing=dp(12), padding=dp(12))
        
        self.mapa = Widget(size_hint_y=0.25)
        self.mapa.bind(pos=self._dibujar_mapa_canvas, size=self._dibujar_mapa_canvas)
        layout_int.add_widget(self.mapa)
        
        scroll = ScrollView(size_hint_y=0.45)
        self.tabla_datos = GridLayout(cols=4, spacing=dp(6), size_hint_y=None)
        self.tabla_datos.bind(minimum_height=self.tabla_datos.setter('height'))
        
        for c in ["TIEMPO (s)", "V_RUEDA (km/h)", "V_GPS (km/h)", "ALTURA (m)"]:
            self.tabla_datos.add_widget(Label(text=c, font_name="RobotoMono-Regular", font_size=dp(11), color=COLOR_AMARILLO_ORO))
            
        self.datos_totales = []
        for t in range(25):
            fila = {"tiempo": float(t), "vel_r": 32.0 + random.uniform(-4,4), "vel_g": 33.0 + random.uniform(-2,2), "altura": 950.0 - (t * 5)}
            self.datos_totales.append(fila)
            
            self.tabla_datos.add_widget(Label(text=f"{fila['tiempo']:.1f}", font_size=dp(12)))
            self.tabla_datos.add_widget(Label(text=f"{fila['vel_r']:.1f}", font_size=dp(12)))
            self.tabla_datos.add_widget(Label(text=f"{fila['vel_g']:.1f}", font_size=dp(12)))
            self.tabla_datos.add_widget(Label(text=f"{fila['altura']:.1f}", font_size=dp(12)))
            
        scroll.add_widget(self.tabla_datos)
        layout_int.add_widget(scroll)
        
        layout_ctrls = BoxLayout(orientation='horizontal', size_hint_y=None, height=dp(40), spacing=dp(8))
        self.in_ini = TextInput(text="4.0", multiline=False, font_size=dp(14))
        self.in_fin = TextInput(text="22.0", multiline=False, font_size=dp(14))
        self.in_nom = TextInput(text="Bajada_Tactica", multiline=False, font_size=dp(14))
        
        layout_ctrls.add_widget(Label(text="Desde:", font_size=dp(11)))
        layout_ctrls.add_widget(self.in_ini)
        layout_ctrls.add_widget(Label(text="Hasta:", font_size=dp(11)))
        layout_ctrls.add_widget(self.in_fin)
        layout_ctrls.add_widget(self.in_nom)
        layout_int.add_widget(layout_ctrls)
        
        btn_corte = Button(text="GUARDAR CORTE Y DESBLOQUEAR ANALÍTICAS", font_name="RobotoMono-Regular", size_hint_y=None, height=dp(50), background_color=(0.2, 0.6, 0.6, 1))
        btn_corte.bind(on_release=self.ejecutar_corte_seguro)
        layout_int.add_widget(btn_corte)
        
        self.content = layout_int

    def _dibujar_mapa_canvas(self, *args):
        self.mapa.canvas.clear()
        with self.mapa.canvas:
            Color(0.08, 0.08, 0.08, 1)
            Rectangle(pos=self.mapa.pos, size=self.mapa.size)
            Color(*COLOR_CIAN_FOSFO)
            pts = [
                self.mapa.x + dp(10), self.mapa.y + dp(10),
                self.mapa.x + self.mapa.width * 0.3, self.mapa.y + self.mapa.height * 0.7,
                self.mapa.x + self.mapa.width * 0.6, self.mapa.y + self.mapa.height * 0.3,
                self.mapa.x + self.mapa.width - dp(10), self.mapa.y + self.mapa.height - dp(10)
            ]
            Line(points=pts, width=dp(2))

    def ejecutar_corte_seguro(self, instance):
        app = App.get_running_app()
        t_i = float(self.in_ini.text or 0)
        t_f = float(self.in_fin.text or 25)
        
        filtrados = []
        for f in self.datos_totales:
            if t_i <= f["tiempo"] <= t_f:
                f["pos_h"] = 35.0 + random.uniform(-5, 90)
                f["pos_s"] = 12.0 + random.uniform(-2, 35)
                filtrados.append(f)
                
        app.engine.datos_temporales = filtrados
        cfg = {'peso': 82.0, 'largo_h': 200.0, 'largo_s': 75.0, 'rec_h': 200.0, 'rec_s': 75.0}
        
        def al_finalizar_guardado(config_id):
            app.modo_edicion = True
            app.cargar_datos_sinteticos_analisis()
            self.dismiss()
            app.sm.current = 'suite_analitica'

        app.engine.guardar_bajada_recortada_async(self.in_nom.text, filtrados, cfg, al_finalizar_guardado)


# =============================================================================
# REEMPLAZO PROFESIONAL: main.py (SUITE DE PESTAÑAS CON HISTOGRAMAS OPENGL ES)
# =============================================================================

class SuiteAnaliticaPestaanas(Screen):
    """Panel principal multitáctil para análisis de telemetría avanzada en boxes."""
    def __init__(self, **kwargs):
        super(SuiteAnaliticaPestaanas, self).__init__(**kwargs)
        self.layout_principal = BoxLayout(orientation='vertical')
        
        # Pestañas operativas de alta ergonomía táctil
        self.layout_tabs = BoxLayout(orientation='horizontal', size_hint_y=None, height=dp(45), spacing=dp(4))
        self.btn_t1 = Button(text="CANALES LINEALES", font_name="RobotoMono-Regular", font_size=dp(11))
        self.btn_t2 = Button(text="DIAGNOSTICO IA", font_name="RobotoMono-Regular", font_size=dp(11))
        self.btn_t3 = Button(text="DINÁMICA AVANZADA", font_name="RobotoMono-Regular", font_size=dp(11))
        
        self.btn_t1.bind(on_release=lambda x: self.conmutar_pestaana(0))
        self.btn_t2.bind(on_release=lambda x: self.conmutar_pestaana(1))
        self.btn_t3.bind(on_release=lambda x: self.conmutar_pestaana(2))
        
        self.layout_tabs.add_widget(self.btn_t1)
        self.layout_tabs.add_widget(self.btn_t2)
        self.layout_tabs.add_widget(self.btn_t3)
        self.layout_principal.add_widget(self.layout_tabs)
        
        self.sub_vistas = []
        
        # PESTAÑA 0: Osciloscopios continuos a 1000 Hz
        self.vista_0 = BoxLayout(orientation='vertical', padding=dp(12), spacing=dp(8))
        self.graf_h = OsciloscopioCanal(size_hint_y=0.5)
        self.graf_s = OsciloscopioCanal(size_hint_y=0.5)
        self.vista_0.add_widget(Label(text="SUSPENSIÓN DELANTERA (HORQUILLA)", size_hint_y=None, height=dp(16), font_size=dp(12), color=COLOR_AMARILLO_ORO))
        self.vista_0.add_widget(self.graf_h)
        self.vista_0.add_widget(Label(text="SUSPENSIÓN TRASERA (SHOCK)", size_hint_y=None, height=dp(16), font_size=dp(12), color=COLOR_AMARILLO_ORO))
        self.vista_0.add_widget(self.graf_s)
        
        # PESTAÑA 1: Semáforos IA de Clics Hidráulicos
        self.vista_1 = BoxLayout(orientation='vertical', padding=dp(15), spacing=dp(12))
        self.semaforos = {}
        for canal in ["HORQUILLA LSC", "HORQUILLA HSC", "SHOCK LSC", "SHOCK HSC"]:
            fila = FilaSemaforoHorizontal(titulo_canal=canal)
            self.semaforos[canal] = fila
            self.vista_1.add_widget(fila)
            
        # PESTAÑA 2: DINÁMICA AVANZADA (Dispersión + Fases + Histogramas Operacionales)
        self.vista_2 = BoxLayout(orientation='horizontal', padding=dp(12), spacing=dp(12))
        
        # Columna Izquierda: Dispersión Cruzada e Histogramas de Recorrido de Aire
        col_izq = BoxLayout(orientation='vertical', size_hint_x=0.45, spacing=dp(10))
        col_izq.add_widget(Label(text="DISPERSIÓN: CINEMÁTICA RECORRIDO H vs S", size_hint_y=None, height=dp(18), font_size=dp(11), color=COLOR_AMARILLO_ORO))
        self.diagrama_disp = DiagramaDispersionCruzada(size_hint_y=0.5)
        col_izq.add_widget(self.diagrama_disp)
        
        col_izq.add_widget(Label(text="DISTRIBUCIÓN: H (SUPERIOR) vs S (INFERIOR)", size_hint_y=None, height=dp(18), font_size=dp(11), color=COLOR_AMARILLO_ORO))
        self.histo_h = HistogramaDistribucionRecorrido(size_hint_y=0.25)
        self.histo_s = HistogramaDistribucionRecorrido(size_hint_y=0.25)
        col_izq.add_widget(self.histo_h)
        col_izq.add_widget(self.histo_s)
        
        # Columna Derecha: Órbitas de Fase de Amortiguación
        col_der = BoxLayout(orientation='vertical', size_hint_x=0.55, spacing=dp(8))
        col_der.add_widget(Label(text="FASE: VELOCIDAD (mm/s) vs POSICIÓN HORQUILLA", size_hint_y=None, height=dp(16), font_size=dp(11), color=COLOR_CIAN_FOSFO))
        self.fase_h = DiagramaFaseCinematico()
        col_der.add_widget(self.fase_h)
        col_der.add_widget(Label(text="FASE: VELOCIDAD (mm/s) vs POSICIÓN SHOCK", size_hint_y=None, height=dp(16), font_size=dp(11), color=COLOR_CIAN_FOSFO))
        self.fase_s = DiagramaFaseCinematico()
        col_der.add_widget(self.fase_s)
        
        self.vista_2.add_widget(col_izq)
        self.vista_2.add_widget(col_der)
        
        # Ajuste de layout por defecto
        self.layout_principal.add_widget(self.vista_0)
        self.sub_vistas.extend([self.vista_0, self.vista_1, self.vista_2])
        self.add_widget(self.layout_principal)

    def conmutar_pestaana(self, index):
        for v in self.sub_vistas:
            if v.parent: self.layout_principal.remove_widget(v)
        self.layout_principal.add_widget(self.sub_vistas[index])

    def actualizar_interfaz(self, muestras_h, muestras_s, vel_h, vel_s, datos_ia):
        # Refresco Pestaña 0 (Lineal)
        self.graf_h.actualizar_traza(muestras_h, max_valor=200.0)
        self.graf_s.actualizar_traza(muestras_s, max_valor=75.0)
        
        # Refresco Pestaña 1 (Tuning Inteligente)
        for k, v in self.semaforos.items():
            if k in datos_ia:
                v.fijar_desviacion(datos_ia[k]["desviacion"], datos_ia[k]["mensaje_sugerido"])
                
        # Refresco Pestaña 2 (Dinámica de Ingeniería y Sorpresa de Histogramas)
        self.diagrama_disp.actualizar_puntos(muestras_h, muestras_s, max_x=200.0, max_y=75.0)
        self.fase_h.actualizar_orbita(muestras_h, vel_h, max_pos=200.0, max_vel=4000.0)
        self.fase_s.actualizar_orbita(muestras_s, vel_s, max_pos=75.0, max_vel=4000.0)
        
        # Inyección estadística en tiempo real para las barras paralelas fijas
        self.histo_h.actualizar_distribucion(muestras_h, max_recorrido=200.0)
        self.histo_s.actualizar_distribucion(muestras_s, max_recorrido=75.0)

class TelemetryPimpApp(App):
    def build(self):
        self.title = "Telemetry PIMP"
        self.engine = PimpEngine()
        self.ai = PimpAIAnalyst()
        self.modo_edicion = False
        self.config_actual = {}
        
        self.sm = ScreenManager()
        self.sm.add_widget(PantallaBienvenida(name='bienvenida'))
        self.sm.add_widget(PantallaFormularioStandby(name='formulario_standby'))
        self.sm.add_widget(SuiteAnaliticaPestaanas(name='suite_analitica'))
        return self.sm

    # =============================================================================
# REEMPLAZO DE MÉTODO DE CARGA: main.py (APLICACIÓN DE CINEMÁTICA Y FILTRADO)
# =============================================================================

    def cargar_datos_sinteticos_analisis(self):
        """
        Orquesta la extracción, calcula ratios cinemáticos cúbicos,
        suaviza trazas de alta frecuencia y refresca la pantalla de analíticas.
        """
        # 1. Simulación de lecturas de sensores crudos a 1000 Hz (Entrada física en mm)
        muestras_crudas_h = [50.0 + (math.sin(i * 0.12) * 40.0) + random.uniform(-1.5, 1.5) for i in range(250)]
        muestras_crudas_s = [18.0 + (math.cos(i * 0.12) * 12.0) + random.uniform(-0.6, 0.6) for i in range(250)]
        
        # 2. PROCESAMIENTO CINEMÁTICO: Transformación de la rueda trasera usando el Leverage Ratio
        posiciones_reales_horquilla = muestras_crudas_h # Relación directa 1:1
        posiciones_reales_rueda_trasera = self.engine.transformar_trayectoria_trasera(muestras_crudas_s)
        
        # 3. DERIVACIÓN E HISTOGRAMAS: Suavizado central digital para obtener velocidades limpias
        v_h = self.engine.calcular_derivada_y_filtrar(posiciones_reales_horquilla, dt=0.001, ventana_suavizado=4)
        v_s = self.engine.calcular_derivada_y_filtrar(posiciones_reales_rueda_trasera, dt=0.001, ventana_suavizado=4)
        
        # 4. SISTEMA EXPERTO IA: Evaluación de desviaciones basada en las trayectorias filtradas
        res_ia = self.ai.analizar_comportamiento(posiciones_reales_horquilla, posiciones_reales_rueda_trasera, v_h, v_s)
        
        datos_mapeados_ia = {
            "HORQUILLA LSC": res_ia["HORQUILLA_LSC"],
            "HORQUILLA HSC": res_ia["HORQUILLA_HSC"],
            "SHOCK LSC": res_ia["SHOCK_LSC"],
            "SHOCK HSC": res_ia["SHOCK_HSC"]
        }
        
        # 5. REFRESCO DE INTERFAZ: Despacho a los osciloscopios e histogramas con límites de rueda reales (200mm)
        self.sm.get_screen('suite_analitica').actualizar_interfaz(
            posiciones_reales_horquilla,       # Traza delantera en mm reales
            posiciones_reales_rueda_trasera,   # Traza trasera real de la rueda (Mapeada desde el Shock)
            v_h, v_s, 
            datos_mapeados_ia
        )


if __name__ == "__main__":
    TelemetryPimpApp().run()
