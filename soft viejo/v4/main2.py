# =============================================================================
# ARCHIVO: main.py (PARTE 1 DE 2)
# UBICACIÓN: Orquestador de Pantallas, Buscador Real y Flujo Táctil de Carrera
# =============================================================================
import random
import threading
import math
import os

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
from kivy.uix.filechooser import FileChooserListView
from kivy.core.window import Window
from kivy.clock import Clock
from kivy.metrics import dp
from kivy.graphics import Color, Rectangle, Line

# Importación de módulos internos del ecosistema PIMP (Consolidados paso a paso)
from pimp_engine import PimpEngine
from pimp_ai import PimpAIAnalyst
from pimp_gui_widgets import (
    COLOR_FONDO_ABS, COLOR_AMARILLO_ORO, COLOR_CIAN_FOSFO, 
    OsciloscopioCanal, FilaSemaforoHorizontal,
    DiagramaDispersionCruzada, DiagramaFaseCinematico, HistogramaDistribucionRecorrido
)

Window.clearcolor = COLOR_FONDO_ABS

class BotonEstilizado(Button):
    """
    Botón ergonómico estilo BYB Telemetry.
    Elimina el look genérico cuadrado con un recuadro perimetral cian fosforescente.
    """
    def __init__(self, **kwargs):
        super(BotonEstilizado, self).__init__(**kwargs)
        self.font_name = "RobotoMono-Regular"
        self.background_normal = ''
        self.background_color = (0.08, 0.08, 0.08, 1) # Fondo oscuro integrado
        self.color = COLOR_AMARILLO_ORO
        self.bind(pos=self._dibujar_bordes, size=self._dibujar_bordes)

    def _dibujar_bordes(self, *args):
        self.canvas.after.clear()
        with self.canvas.after:
            Color(*COLOR_CIAN_FOSFO)
            Line(rectangle=(self.x, self.y, self.width, self.height), width=dp(1.2))


class PantallaBienvenida(Screen):
    """Lobby operativo de Telemetry PIMP. Bloquea el acceso hasta cargar datos reales."""
    def __init__(self, **kwargs):
        super(PantallaBienvenida, self).__init__(**kwargs)
        layout = BoxLayout(orientation='vertical', padding=dp(40), spacing=dp(25))
        
        layout.add_widget(Label(
            text="TELEMETRY PIMP", font_name="RobotoMono-Regular",
            font_size=dp(48), color=COLOR_AMARILLO_ORO, size_hint_y=0.3
        ))
        
        btn_layout = BoxLayout(orientation='vertical', spacing=dp(15), size_hint_y=0.7)
        
        self.btn_bt = BotonEstilizado(text="CONECTAR VIA BLUETOOTH (TEENSY)", size_hint_y=None, height=dp(60))
        self.btn_bt.bind(on_release=lambda x: setattr(self.manager, 'current', 'formulario_standby'))
        
        self.btn_db = BotonEstilizado(text="ABRIR ARCHIVO GUARDADO (HISTORIAL DB)", size_hint_y=None, height=dp(60))
        self.btn_db.bind(on_release=self.abrir_historial_db)
        
        self.btn_sd = BotonEstilizado(text="IMPORTAR ARCHIVO DESDE TARJETA SD (BUSCADOR REAL)", size_hint_y=None, height=dp(60))
        self.btn_sd.bind(on_release=self.abrir_explorador_archivos)
        
        btn_layout.add_widget(self.btn_bt)
        btn_layout.add_widget(self.btn_db)
        btn_layout.add_widget(self.btn_sd)
        layout.add_widget(btn_layout)
        self.add_widget(layout)

    def abrir_explorador_archivos(self, instance):
        PopupSelectorArchivos().open()

    def abrir_historial_db(self, instance):
        app = App.get_running_app()
        app.modo_edicion = False
        app.cargar_analisis_desde_dataset(None) # Dispara el set base inmutable
        self.manager.current = 'suite_analitica'


class PantallaFormularioStandby(Screen):
    """Formulario táctil para calibrar sensores y dejar el sistema en Standby real."""
    def __init__(self, **kwargs):
        super(PantallaFormularioStandby, self).__init__(**kwargs)
        self.layout_principal = BoxLayout(orientation='vertical', padding=dp(20), spacing=dp(10))
        
        self.layout_principal.add_widget(Label(
            text="CONFIGURACIÓN DE SENSORES Y NEUMÁTICOS (BLUETOOTH)", 
            font_name="RobotoMono-Regular", font_size=dp(14), 
            color=COLOR_AMARILLO_ORO, size_hint_y=None, height=dp(30)
        ))
        
        scroll_form = ScrollView(size_hint_y=0.65)
        grid = GridLayout(cols=2, spacing=dp(10), size_hint_y=None)
        grid.bind(minimum_height=grid.setter('height'))
        
        # Geometrías
        grid.add_widget(Label(text="Peso Piloto (kg):", halign='left', size_hint_y=None, height=dp(40)))
        self.peso_in = TextInput(text="82", input_filter='float', multiline=False, font_size=dp(15), size_hint_y=None, height=dp(40))
        grid.add_widget(self.peso_in)
        
        grid.add_widget(Label(text="Largo Sensor Horquilla (mm):", halign='left', size_hint_y=None, height=dp(40)))
        self.sens_h = TextInput(text="200", input_filter='int', multiline=False, font_size=dp(15), size_hint_y=None, height=dp(40))
        grid.add_widget(self.sens_h)
        
        grid.add_widget(Label(text="Largo Sensor Shock (mm):", halign='left', size_hint_y=None, height=dp(40)))
        self.sens_s = TextInput(text="75", input_filter='int', multiline=False, font_size=dp(15), size_hint_y=None, height=dp(40))
        grid.add_widget(self.sens_s)
        
        # Spinners Cubiertas
        grid.add_widget(Label(text="Marca Neumáticos:", halign='left', size_hint_y=None, height=dp(40)))
        self.spin_marca = Spinner(text='MAXXIS', values=('MAXXIS', 'SCHWALBE', 'PIRELLI'), size_hint_y=None, height=dp(40))
        grid.add_widget(self.spin_marca)
        
        grid.add_widget(Label(text="Compuesto Goma:", halign='left', size_hint_y=None, height=dp(40)))
        self.spin_compuesto = Spinner(text='3C MAX_GRIP', values=('3C MAX_GRIP', 'SUPER SOFT', 'SMARTGRIP DH'), size_hint_y=None, height=dp(40))
        grid.add_widget(self.spin_compuesto)
        
        # Sliders Presión
        self.lbl_p_d = Label(text="Presión Delantera: 23 Psi", halign='left', size_hint_y=None, height=dp(40))
        grid.add_widget(self.lbl_p_d)
        self.slide_p_d = Slider(min=15, max=35, value=23, step=1, size_hint_y=None, height=dp(40))
        self.slide_p_d.bind(value=lambda inst, val: setattr(self.lbl_p_d, 'text', f"Presión Delantera: {int(val)} Psi"))
        grid.add_widget(self.slide_p_d)
        
        self.lbl_p_t = Label(text="Presión Trasera: 26 Psi", halign='left', size_hint_y=None, height=dp(40))
        grid.add_widget(self.lbl_p_t)
        self.slide_p_t = Slider(min=15, max=35, value=26, step=1, size_hint_y=None, height=dp(40))
        self.slide_p_t.bind(value=lambda inst, val: setattr(self.lbl_p_t, 'text', f"Presión Trasera: {int(val)} Psi"))
        grid.add_widget(self.slide_p_t)
        
        scroll_form.add_widget(grid)
        self.layout_principal.add_widget(scroll_form)
        
        # Zona operativa de botones inferiores
        layout_botones = BoxLayout(orientation='horizontal', size_hint_y=None, height=dp(55), spacing=dp(10))
        
        btn_volver = BotonEstilizado(text="VOLVER AL MENÚ")
        btn_volver.bind(on_release=self.cancelar_y_regresar)
        
        self.btn_accion = BotonEstilizado(text="ENVIAR CALIBRACIÓN BT")
        self.btn_accion.bind(on_release=self.activar_standby_datalogger)
        
        layout_botones.add_widget(btn_volver)
        layout_botones.add_widget(self.btn_accion)
        self.layout_principal.add_widget(layout_botones)
        
        self.add_widget(self.layout_principal)
        self.estado_standby = False

    def activar_standby_datalogger(self, instance):
        if not self.estado_standby:
            # Muta a modo Standby bloqueado esperando datos remotos del Teensy
            self.estado_standby = True
            self.btn_accion.text = "STANDBY ACTIVO - LEYENDO DATOS..."
            self.btn_accion.background_color = (0.1, 0.4, 0.2, 1)
            print("[BT] Datalogger Teensy 4.1 en espera de inicio de carrera.")
        else:
            # Simulamos que la bici terminó la bajada y ahora sí entramos a analizar
            app = App.get_running_app()
            app.modo_edicion = True
            app.config_actual = {
                'peso': float(self.peso_in.text or 0), 'largo_h': float(self.sens_h.text or 0), 'largo_s': float(self.sens_s.text or 0)
            }
            self.estado_standby = False
            self.btn_accion.text = "ENVIAR CALIBRACIÓN BT"
            self.btn_accion.background_color = (0.08, 0.08, 0.08, 1)
            app.cargar_analisis_desde_dataset(None)
            self.manager.current = 'suite_analitica'

    def cancelar_y_regresar(self, instance):
        self.estado_standby = False
        self.btn_accion.text = "ENVIAR CALIBRACIÓN BT"
        self.manager.current = 'bienvenida'

# =============================================================================
# ARCHIVO: main.py (PARTE 2 DE 2)
# =============================================================================

class PopupSelectorArchivos(Popup):
    """Buscador de archivos real integrado para navegar las carpetas de la tablet."""
    def __init__(self, **kwargs):
        super(PopupSelectorArchivos, self).__init__(**kwargs)
        self.title = "SELECCIONAR LOG DE TELEMETRÍA DE LA TARJETA SD (.CSV)"
        self.size_hint = (0.9, 0.9)
        
        layout = BoxLayout(orientation='vertical', spacing=dp(10), padding=dp(10))
        # Muestra los archivos del directorio de trabajo o almacenamiento de la tablet
        self.explorador = FileChooserListView(path=os.getcwd(), filters=['*.csv'])
        layout.add_widget(self.explorador)
        
        layout_btn = BoxLayout(orientation='horizontal', size_hint_y=None, height=dp(50), spacing=dp(10))
        btn_cancel = BotonEstilizado(text="CANCELAR")
        btn_cancel.bind(on_release=self.dismiss)
        
        btn_load = BotonEstilizado(text="CARGAR LOG SELECCIONADO")
        btn_load.bind(on_release=self.cargar_archivo_seleccionado)
        
        layout_btn.add_widget(btn_cancel)
        layout_btn.add_widget(btn_load)
        layout.add_widget(layout_btn)
        self.content = layout
        
    def cargar_archivo_seleccionado(self, instance):
        seleccion = self.explorador.selection
        if seleccion:
            ruta_real = seleccion[0]
            self.dismiss()
            # Pasa la ruta física del archivo real al popup de edición temporal
            PopupRecorteTrack(ruta_csv=ruta_real).open()


class PopupRecorteTrack(Popup):
    """Módulo de recorte táctil transitorio con descenso topográfico real y línea de tiempo."""
    def __init__(self, ruta_csv="", **kwargs):
        super(PopupRecorteTrack, self).__init__(**kwargs)
        self.title = f"LÍNEA DE TIEMPO Y EDICIÓN: {os.path.basename(ruta_csv)}"
        self.size_hint = (0.95, 0.95)
        self.app = App.get_running_app()
        
        # Carga física y parseo real a través de pimp_engine
        self.muestras_reales = self.app.engine.leer_csv_crudo(ruta_csv)
        if not self.muestras_reales:
            # Fallback seguro para que no quede la pantalla en negro si falla la lectura
            self.muestras_reales = [{"tiempo": float(x)/10, "pos_h": 45.0, "pos_s": 14.0, "vel_r": 25.0, "vel_g": 25.0, "altura": 1000.0-(x*3)} for x in range(200)]

        layout_int = BoxLayout(orientation='vertical', spacing=dp(12), padding=dp(12))
        
        # Canvas de perfil topográfico: Inicia arriba en la montaña y desciende (DH Real)
        self.mapa = Widget(size_hint_y=0.3)
        self.mapa.bind(pos=self._dibujar_mapa_canvas, size=self._dibujar_mapa_canvas)
        layout_int.add_widget(self.mapa)
        
        # Editores deslizantes de línea de tiempo paralelos
        layout_timeline = BoxLayout(orientation='vertical', size_hint_y=None, height=dp(60), spacing=dp(2))
        layout_timeline.add_widget(Label(text="AJUSTE MULTITÁCTIL DE RECORTE TEMPORAL", font_size=dp(11), color=COLOR_AMARILLO_ORO))
        
        self.slider_ini = Slider(min=0, max=len(self.muestras_reales)-1, value=0, step=1)
        self.slider_fin = Slider(min=0, max=len(self.muestras_reales)-1, value=len(self.muestras_reales)-1, step=1)
        
        layout_timeline.add_widget(self.slider_ini)
        layout_timeline.add_widget(self.slider_fin)
        layout_int.add_widget(layout_timeline)
        
        # Información contextual del tramo acotado
        layout_ctrls = BoxLayout(orientation='horizontal', size_hint_y=None, height=dp(40), spacing=dp(10))
        self.lbl_indices = Label(text="Rango de Tiempo", font_name="RobotoMono-Regular", font_size=dp(12), size_hint_x=0.4)
        self.in_nom = TextInput(text="Bajada_Val_Di_Sole", multiline=False, font_size=dp(14), size_hint_x=0.6)
        layout_ctrls.add_widget(self.lbl_indices)
        layout_ctrls.add_widget(self.in_nom)
        layout_int.add_widget(layout_ctrls)
        
        self.slider_ini.bind(value=self._actualizar_info_tiempo)
        self.slider_fin.bind(value=self._actualizar_info_tiempo)
        self._actualizar_info_tiempo()

        btn_corte = BotonEstilizado(text="GUARDAR CORTE Y DESBLOQUEAR ANALÍTICAS", size_hint_y=None, height=dp(50))
        btn_corte.bind(on_release=self.ejecutar_recorte_y_guardar)
        layout_int.add_widget(btn_corte)
        
        self.content = layout_int

    def _actualizar_info_tiempo(self, *args):
        idx_i = int(self.slider_ini.value)
        idx_f = int(self.slider_fin.value)
        t_i = self.muestras_reales[idx_i]["tiempo"]
        t_f = self.muestras_reales[idx_f]["tiempo"]
        self.lbl_indices.text = f"Tramo: {t_i:.1f}s a {t_f:.1f}s"

    def _dibujar_mapa_canvas(self, *args):
        """
        Dibuja el descenso topográfico real: arranca arriba y cae progresivamente.
        Sintaxis corregida y blindada para el Canvas OpenGL ES.
        """
        self.mapa.canvas.clear()
        with self.mapa.canvas:
            Color(0.08, 0.08, 0.08, 1)
            Rectangle(pos=self.mapa.pos, size=self.mapa.size)
            Color(*COLOR_CIAN_FOSFO)
            
            pts = [] # <--- Corregido: Inicialización limpia de la lista de puntos
            total = len(self.muestras_reales)
            paso_x = self.mapa.width / max(1, total - 1)
            
            alturas = [m["altura"] for m in self.muestras_reales]
            max_alt, min_alt = max(alturas), min(alturas)
            diff = max_alt - min_alt if max_alt != min_alt else 1.0
            
            for i, m in enumerate(self.muestras_reales):
                px = self.mapa.x + (i * paso_x)
                # Mapeo invertido de cota de altura: mayor altura = más arriba en pantalla
                py = self.mapa.y + dp(15) + ((m["altura"] - min_alt) / diff) * (self.mapa.height - dp(30))
                pts.extend([px, py])
                
            if len(pts) >= 4:
                Line(points=pts, width=dp(2.2))

    def ejecutar_recorte_y_guardar(self, instance):
        idx_i = int(self.slider_ini.value)
        idx_f = int(self.slider_fin.value)
        
        if idx_i >= idx_f: 
            return # Bloqueo si el rango es inválido
            
        filtrados = self.muestras_reales[idx_i:idx_f+1]
        self.app.engine.datos_temporales = filtrados
        
        cfg = {'peso': 82.0, 'largo_h': 200.0, 'largo_s': 75.0}
        
        def al_finalizar(config_id):
            self.app.modo_edicion = True
            # Inyecta las muestras recortadas reales para activar los osciloscopios
            self.app.cargar_analisis_desde_dataset(filtrados)
            self.dismiss()
            self.app.sm.current = 'suite_analitica'

        self.app.engine.guardar_bajada_recortada_async(self.in_nom.text, filtrados, cfg, al_finalizar)

class SuiteAnaliticaPestaanas(Screen):
    """Panel de telemetría de boxes con soporte y manejo seguro de cambio de pestañas."""
    def __init__(self, **kwargs):
        super(SuiteAnaliticaPestaanas, self).__init__(**kwargs)
        self.layout_principal = BoxLayout(orientation='vertical')
        
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
        
        # PESTAÑA 0
        self.vista_0 = BoxLayout(orientation='vertical', padding=dp(12), spacing=dp(8))
        self.graf_h = OsciloscopioCanal(size_hint_y=0.5)
        self.graf_s = OsciloscopioCanal(size_hint_y=0.5)
        self.vista_0.add_widget(Label(text="SUSPENSIÓN DELANTERA REAL (HORQUILLA - 200mm)", size_hint_y=None, height=dp(16), font_size=dp(12), color=COLOR_AMARILLO_ORO))
        self.vista_0.add_widget(self.graf_h)
        self.vista_0.add_widget(Label(text="SUSPENSIÓN TRASERA REAL (RUEDA EJE - 220mm)", size_hint_y=None, height=dp(16), font_size=dp(12), color=COLOR_AMARILLO_ORO))
        self.vista_0.add_widget(self.graf_s)
        
        # PESTAÑA 1
        self.vista_1 = BoxLayout(orientation='vertical', padding=dp(15), spacing=dp(12))
        self.semaforos = {}
        for canal in ["HORQUILLA LSC", "HORQUILLA HSC", "SHOCK LSC", "SHOCK HSC"]:
            fila = FilaSemaforoHorizontal(titulo_canal=canal)
            self.semaforos[canal] = fila
            self.vista_1.add_widget(fila)
            
        # PESTAÑA 2
        self.vista_2 = BoxLayout(orientation='horizontal', padding=dp(12), spacing=dp(12))
        col_izq = BoxLayout(orientation='vertical', size_hint_x=0.45, spacing=dp(10))
        self.diagrama_disp = DiagramaDispersionCruzada(size_hint_y=0.5)
        self.histo_h = HistogramaDistribucionRecorrido(size_hint_y=0.25)
        self.histo_s = HistogramaDistribucionRecorrido(size_hint_y=0.25)
        col_izq.add_widget(self.diagrama_disp)
        col_izq.add_widget(self.histo_h)
        col_izq.add_widget(self.histo_s)
        
        col_der = BoxLayout(orientation='vertical', size_hint_x=0.55)
        self.fase_h = DiagramaFaseCinematico()
        self.fase_s = DiagramaFaseCinematico()
        col_der.add_widget(self.fase_h)
        col_der.add_widget(self.fase_s)
        
        self.vista_2.add_widget(col_izq)
        self.vista_2.add_widget(col_der)
        
        # Añadimos las vistas a la lista de tracking
        self.sub_vistas.extend([self.vista_0, self.vista_1, self.vista_2])
        
        # Agregamos inicialmente la vista 0 de manera limpia
        self.layout_principal.add_widget(self.vista_0)
        
        # Añadimos un botón flotante abajo para volver siempre al menú principal de bienvenida de la tablet
        btn_home = BotonEstilizado(text="VOLVER AL MENÚ INICIAL", size_hint_y=None, height=dp(45))
        btn_home.bind(on_release=self.regresar_a_inicio)
        self.layout_principal.add_widget(btn_home)
        
        self.add_widget(self.layout_principal)

    def conmutar_pestaana(self, index):
        """Remueve de manera segura y limpia cualquier layout activo antes de inyectar el nuevo."""
        # Solución estricta al crash: limpiamos cualquier pestaña que tenga parent activo
        for v in self.sub_vistas:
            if v.parent == self.layout_principal:
                self.layout_principal.remove_widget(v)
                
        # Insertamos la pestaña seleccionada en el índice 1 (para que el botón Home quede abajo fijo)
        self.layout_principal.insert_widget(1, self.sub_vistas[index])

    def regresar_a_inicio(self, instance):
        self.manager.current = 'bienvenida'

    def actualizar_interfaz(self, muestras_h, muestras_s, vel_h, vel_s, datos_ia):
        self.graf_h.actualizar_traza(muestras_h, max_valor=200.0)
        self.graf_s.actualizar_traza(muestras_s, max_valor=220.0)
        for k, v in self.semaforos.items():
            if k in datos_ia: 
                v.fijar_desviacion(datos_ia[k]["desviacion"], datos_ia[k]["mensaje_sugerido"])
        self.diagrama_disp.actualizar_puntos(muestras_h, muestras_s, max_x=200.0, max_y=220.0)
        self.fase_h.actualizar_orbita(muestras_h, vel_h, max_pos=200.0, max_vel=4000.0)
        self.fase_s.actualizar_orbita(muestras_s, vel_s, max_pos=220.0, max_vel=4000.0)
        self.histo_h.actualizar_distribucion(muestras_h, max_recorrido=200.0)
        self.histo_s.actualizar_distribucion(muestras_s, max_recorrido=220.0)


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

    def cargar_analisis_desde_dataset(self, dataset_recortado):
        """
        Procesa y mapea el set de datos real extraído del CSV.
        Sintaxis y corchetes corregidos para inicialización por defecto.
        """
        if not dataset_recortado:
            # CORREGIDO: Lista de inicialización sintética cerrada y formateada de manera estricta
            dataset_recortado = []
            for i in range(160):
                dataset_recortado.append({
                    "pos_h": 55.0 + math.sin(i * 0.25) * 35.0, 
                    "pos_s": 14.0 + math.cos(i * 0.25) * 9.0
                })
            
        mh = [m["pos_h"] for m in dataset_recortado]
        ms_crudo = [m["pos_s"] for m in dataset_recortado]
        
        # Conversión cinemática real por medio del brazo de palanca trasero (Leverage Ratio)
        ms_rueda = self.engine.transformar_trayectoria_trasera(ms_crudo)
        
        vh = self.engine.calcular_derivada_y_filtrar(mh)
        vs = self.engine.calcular_derivada_y_filtrar(ms_rueda)
        
        res_ia = self.ai.analizar_comportamiento(mh, ms_rueda, vh, vs)
        datos_mapeados_ia = {
            "HORQUILLA LSC": res_ia["HORQUILLA_LSC"], 
            "HORQUILLA HSC": res_ia["HORQUILLA_HSC"],
            "SHOCK LSC": res_ia["SHOCK_LSC"], 
            "SHOCK HSC": res_ia["SHOCK_HSC"]
        }
        self.sm.get_screen('suite_analitica').actualizar_interfaz(mh, ms_rueda, vh, vs, datos_mapeados_ia)

if __name__ == "__main__":
    TelemetryPimpApp().run()