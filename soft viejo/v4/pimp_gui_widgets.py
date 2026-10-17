# =============================================================================
# ARCHIVO: pimp_gui_widgets.py
# UBICACIÓN: Componentes Gráficos y Renderizado OpenGL ES para Telemetry PIMP
# =============================================================================
from kivy.uix.widget import Widget
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.label import Label
from kivy.graphics import Color, Line, Rectangle, StencilPush, StencilUse, StencilUnUse, StencilPop
from kivy.metrics import dp

# PALETA DE COLORES RADICAL DE CARRERAS (ESTILO BYB TELEMETRY)
COLOR_FONDO_ABS = (0.05, 0.05, 0.05, 1)    # Gris/Negro absoluto de boxes
COLOR_CIAN_FOSFO = (0.31, 0.89, 0.76, 1)   # Trazas de sensores de alta frecuencia
COLOR_AMARILLO_ORO = (1, 0.74, 0, 1)       # Barras de referencia y semáforos óptimos
COLOR_GRIS_BORDE = (0.2, 0.2, 0.2, 1)      # Grillas y ejes estructurales

class WidgetGraficoProtegido(Widget):
    """
    Clase base que actúa como contenedor gráfico seguro,
    previniendo desbordamientos geométricos mediante herencia directa.
    """
    pass


class OsciloscopioCanal(WidgetGraficoProtegido):
    """
    Renderiza trazas continuas de telemetría lineal a 1000 Hz.
    Aplica desmuestreo dinámico para proteger la GPU de la tablet.
    """
    def actualizar_traza(self, puntos_y, max_valor=220.0):
        self.canvas.after.clear()
        if not puntos_y: 
            return
            
        with self.canvas.after:
            StencilPush()
            Rectangle(pos=self.pos, size=self.size)
            StencilUse()
            
            # Dibujo de la Rejilla de Fondo (4 cuadrantes horizontales)
            Color(0.12, 0.12, 0.12, 1)
            for i in range(1, 4):
                y_linea = self.y + (self.height / 4) * i
                Line(points=[self.x, y_linea, self.x + self.width, y_linea], width=dp(1))
            
            # Filtro de desmuestreo dinámico para evitar tirones (lags) táctiles
            total_puntos = len(puntos_y)
            paso_muestreo = max(1, total_puntos // int(self.width if self.width > 0 else 800))
            puntos_filtrados = puntos_y[::paso_muestreo]
            
            # Construcción de la línea continua en Cian Fosforescente
            Color(*COLOR_CIAN_FOSFO)
            puntos_render = []
            paso_x = self.width / max(1, len(puntos_filtrados) - 1)
            
            for i, val in enumerate(puntos_filtrados):
                px = self.x + (i * paso_x)
                py = self.y + (min(val, max_valor) / max_valor) * self.height
                puntos_render.extend([px, py])
                
            if len(puntos_render) >= 4:
                Line(points=puntos_render, width=dp(1.5))
                
            StencilUnUse()
            Rectangle(pos=self.pos, size=self.size)
            StencilPop()


class FilaSemaforoHorizontal(BoxLayout):
    """
    Barra horizontal de diagnóstico experto. Muestra si la suspensión
    requiere abrir clics (izquierda/cian) o cerrar clics (derecha/rojo).
    """
    def __init__(self, titulo_canal="", **kwargs):
        super(FilaSemaforoHorizontal, self).__init__(**kwargs)
        self.orientation = 'vertical'
        self.spacing = dp(4)
        self.desviacion = 0.0 # Rango matemático de -1.0 a +1.0
        
        # Cabecera de texto prolija sin emojis
        layout_txt = BoxLayout(orientation='horizontal', size_hint_y=None, height=dp(20))
        self.lbl_nom = Label(text=titulo_canal, font_name="RobotoMono-Regular", font_size=dp(12), color=(0.9, 0.9, 0.9, 1), halign='left')
        self.lbl_nom.bind(size=lambda inst, v: setattr(inst, 'text_size', v))
        self.lbl_val = Label(text="CALIBRANDO...", font_name="RobotoMono-Regular", font_size=dp(11), color=COLOR_AMARILLO_ORO, halign='right')
        self.lbl_val.bind(size=lambda inst, v: setattr(inst, 'text_size', v))
        
        layout_txt.add_widget(self.lbl_nom)
        layout_txt.add_widget(self.lbl_val)
        self.add_widget(layout_txt)
        
        # Barra gráfica interactiva vinculada al Canvas
        self.barra = Widget(size_hint_y=None, height=dp(20))
        self.barra.bind(pos=self._dibujar_barra, size=self._dibujar_barra)
        self.add_widget(self.barra)

    def fijar_desviacion(self, valor, msg):
        self.desviacion = max(-1.0, min(1.0, valor))
        self.lbl_val.text = msg.upper()
        self._dibujar_barra()

    def _dibujar_barra(self, *args):
        b = self.barra
        b.canvas.clear()
        with b.canvas:
            Color(0.1, 0.1, 0.1, 1)
            Rectangle(pos=b.pos, size=b.size)
            w_seg = b.width / 3.0
            
            # Segmentos de tolerancia hidráulica
            Color(0.1, 0.45, 0.55, 0.6)  # Demasiado Abierto / Suave (Cian oscuro)
            Rectangle(pos=(b.x, b.y), size=(w_seg, b.height))
            Color(0.15, 0.6, 0.25, 0.7)  # Ventana Objetivo Óptima (Verde Carrera)
            Rectangle(pos=(b.x + w_seg, b.y), size=(w_seg, b.height))
            Color(0.75, 0.18, 0.18, 0.6) # Demasiado Cerrado / Duro (Rojo Fuego)
            Rectangle(pos=(b.x + 2 * w_seg, b.y), size=(w_seg, b.height))
            
            # Líneas divisorias de bloques
            Color(0.05, 0.05, 0.05, 1)
            Line(points=[b.x + w_seg, b.y, b.x + w_seg, b.y + b.height], width=1.5)
            Line(points=[b.x + 2 * w_seg, b.y, b.x + 2 * w_seg, b.y + b.height], width=1.5)
            
            # Posicionamiento del marcador central de carrera Amarillo Oro
            centro_x = b.x + b.width / 2.0
            marcador_x = centro_x + (self.desviacion * (b.width / 2.0))
            Color(*COLOR_AMARILLO_ORO)
            Line(points=[marcador_x, b.y - dp(2), marcador_x, b.y + b.height + dp(2)], width=dp(3))


class DiagramaDispersionCruzada(WidgetGraficoProtegido):
    """
    Pestaña Avanzada: Grafica la dispersión cinemática cruzada de 4 cuadrantes.
    Eje X: Recorrido Horquilla (mm) | Eje Y: Recorrido Real Rueda Trasera (mm).
    """
    def actualizar_puntos(self, datos_x, datos_y, max_x=200.0, max_y=220.0):
        self.canvas.after.clear()
        if not datos_x or not datos_y: 
            return
            
        with self.canvas.after:
            StencilPush()
            Rectangle(pos=self.pos, size=self.size)
            StencilUse()
            
            # Ejes de cruzamiento central estructural
            Color(*COLOR_GRIS_BORDE)
            Line(points=[self.x, self.y + self.height/2, self.x + self.width, self.y + self.height/2], width=dp(1))
            Line(points=[self.x + self.width/2, self.y, self.x + self.width/2, self.y + self.height], width=dp(1))
            
            # Nube de puntos de alta frecuencia en cian fosforescente
            Color(0.31, 0.89, 0.76, 0.6)
            puntos_render = []
            
            for x_val, y_val in zip(datos_x, datos_y):
                # Mapeo lineal estricto contenido dentro del widget gráfico
                px = self.x + (max(0.0, min(x_val, max_x)) / max_x) * self.width
                py = self.y + (max(0.0, min(y_val, max_y)) / max_y) * self.height
                puntos_render.extend([px, py])
                
            if len(puntos_render) >= 4:
                Line(points=puntos_render, mode='points', pointsize=dp(2))
                
            StencilUnUse()
            Rectangle(pos=self.pos, size=self.size)
            StencilPop()


class DiagramaFaseCinematico(WidgetGraficoProtegido):
    """
    Pestaña Avanzada: Grafica las órbitas de fase hidráulicas.
    Eje X: Posición física del recorrido (mm) | Eje Y: Velocidad del vástago (mm/s).
    """
    def actualizar_orbita(self, posiciones, velocidades, max_pos=200.0, max_vel=4000.0):
        self.canvas.after.clear()
        if not posiciones or not velocidades: 
            return
            
        with self.canvas.after:
            StencilPush()
            Rectangle(pos=self.pos, size=self.size)
            StencilUse()
            
            # Eje horizontal estricto de velocidad cero (Compresión arriba, Rebote abajo)
            Color(*COLOR_GRIS_BORDE)
            Line(points=[self.x, self.y + self.height/2, self.x + self.width, self.y + self.height/2], width=dp(1))
            
            # Órbita de fase continua en Amarillo Oro de carreras
            Color(1, 0.74, 0, 0.8)
            puntos_render = []
            
            for pos, vel in zip(posiciones, velocidades):
                px = self.x + (max(0.0, min(pos, max_pos)) / max_pos) * self.width
                # Centrado vertical: divide la pantalla a la mitad para alojar velocidades (+) y (-)
                py = self.y + self.height/2 + (max(-max_vel, min(vel, max_vel)) / max_vel) * (self.height/2)
                puntos_render.extend([px, py])
                
            if len(puntos_render) >= 4:
                Line(points=puntos_render, width=dp(1.3))
                
            StencilUnUse()
            Rectangle(pos=self.pos, size=self.size)
            StencilPop()


class HistogramaDistribucionRecorrido(WidgetGraficoProtegido):
    """
    Pestaña Avanzada: Calcula estadísticamente el tiempo de permanencia por tercios.
    Muestra de forma paralela el comportamiento de la masa de aire (Tokens).
    """
    def actualizar_distribucion(self, posiciones, max_recorrido=220.0):
        self.canvas.after.clear()
        if not posiciones: 
            return
            
        zona_baja, zona_media, zona_alta = 0, 0, 0
        tercio = max_recorrido / 3.0
        
        for pos in posiciones:
            if pos < tercio: 
                zona_baja += 1
            elif pos < (tercio * 2): 
                zona_media += 1
            else: 
                zona_alta += 1
                
        total = float(len(posiciones))
        
        # Declaración explícita de dimensiones para que la GPU las lea sin problemas
        alto_barra = self.height / 4.0
        espacio_y = self.height / 16.0
        ancho_util = self.width - dp(40)
        
        with self.canvas.after:
            StencilPush()
            Rectangle(pos=self.pos, size=self.size)
            StencilUse()
            
            # Fondo del contenedor estadístico
            Color(0.08, 0.08, 0.08, 1)
            Rectangle(pos=self.pos, size=self.size)
            
            # Barra 1: Zona Inicial (SAG / Confort) - Cian Fosforescente
            Color(0.31, 0.89, 0.76, 0.8)
            ancho_baja = (zona_baja / total) * ancho_util
            Rectangle(pos=(self.x + dp(10), self.y + alto_barra * 3), size=(ancho_baja, alto_barra - espacio_y))
            
            # Barra 2: Zona Media (Soporte Hidráulico) - Amarillo Oro
            Color(1, 0.74, 0, 0.8)
            ancho_media = (zona_media / total) * ancho_util
            Rectangle(pos=(self.x + dp(10), self.y + alto_barra * 2), size=(ancho_media, alto_barra - espacio_y))
            
            # Barra 3: Zona Alta (Tope de Recorrido / Tokens) - Rojo Alarma
            Color(0.85, 0.2, 0.2, 0.8)
            ancho_alta = (zona_alta / total) * ancho_util
            Rectangle(pos=(self.x + dp(10), self.y + alto_barra * 1), size=(ancho_alta, alto_barra - espacio_y))
            
            # Líneas guía de porcentaje de referencia vertical (25%, 50%, 75%)
            Color(0.18, 0.18, 0.18, 1)
            for frac in [0.25, 0.50, 0.75]:
                x_ref = self.x + dp(10) + (frac * ancho_util)
                Line(points=[x_ref, self.y, x_ref, self.y + self.height], width=dp(1))
                
            StencilUnUse()
            Rectangle(pos=self.pos, size=self.size)
            StencilPop()