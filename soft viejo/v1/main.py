import dash
from dash import html, dcc
from dash.dependencies import Input, Output, State
import plotly.graph_objects as go
from engine import TelemetryEngine
from ai_analyst import TelemetryAIAnalyst

app = dash.Dash(__name__, title="Universal Motorsport Telemetry Suite v5.0")
engine = TelemetryEngine()
analyst = TelemetryAIAnalyst()

# --- DISEÑO TÁCTIL E INDUSTRIAL STYLE BYB ---
app.layout = html.Div(style={'backgroundColor': '#090B0E', 'fontFamily': 'Arial, sans-serif', 'color': 'white', 'padding': '15px'}, children=[
    
    # ENCABEZADO DE CONTROL GENERAL
    html.Div(style={'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '8px', 'border': '1px solid #1F242E', 'marginBottom': '15px'}, children=[
        html.Div(style={'display': 'flex', 'alignItems': 'center', 'gap': '10px'}, children=[
            html.Div(style={'backgroundColor': '#FF9800', 'width': '10px', 'height': '22px', 'borderRadius': '2px'}),
            html.H1("UNIVERSAL RACING LAB - DAQ 1000Hz", style={'fontSize': '18px', 'margin': '0', 'fontWeight': 'bold'}),
            html.Span("PRO PIT ENGINE v5.0", style={'color': '#FF9800', 'fontSize': '11px', 'fontWeight': 'bold'})
        ]),
        html.Button("🧠 SIMULAR RUN DE PISTA", id="btn-simular", n_clicks=0, style={'backgroundColor': '#7D3C98', 'color': 'white', 'border': 'none', 'padding': '10px 22px', 'borderRadius': '5px', 'fontWeight': 'bold', 'cursor': 'pointer'})
    ]),

    html.Div(style={'display': 'flex', 'gap': '15px'}, children=[
        
        # PANEL IZQUIERDO DE ENTRADAS ABIERTAS Y SELECCIÓN DE REGLAJES
        html.Div(style={'width': '22%', 'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '8px', 'border': '1px solid #1F242E', 'display': 'flex', 'flexDirection': 'column', 'gap': '10px'}, children=[
            html.H3("🔧 CONFIGURACIÓN DE PARÁMETROS", style={'fontSize': '12px', 'color': '#FF9800', 'margin': '0 0 5px 0', 'fontWeight': 'bold'}),
            
            html.Label("Modelo Suspensión Delantera:", style={'fontSize': '11px', 'color': 'grey'}),
            dcc.Dropdown(id="inp-fork-name", options=[{'label': i, 'value': i} for i in ["Fox 40 Factory Grip2", "RockShox Boxxer Ultimate", "Öhlins DH38 Race"]], value="Fox 40 Factory Grip2", style={'color': 'black'}),
            
            html.Label("Modelo Amortiguador Trasero:", style={'fontSize': '11px', 'color': 'grey'}),
            dcc.Dropdown(id="inp-shock-name", options=[{'label': i, 'value': i} for i in ["Fox DHX2 Factory", "RockShox Super Deluxe", "Öhlins TTX22M"]], value="Fox DHX2 Factory", style={'color': 'black'}),
            
            html.Label("Peso Conductor (kg):", style={'fontSize': '11px'}),
            dcc.Input(id="inp-weight", type="number", value=75, style={'backgroundColor': '#1A1F2C', 'color': 'white', 'border': '1px solid #2E323F', 'padding': '6px'}),
            
            html.Label("Carrera Delantera / SAG (mm):", style={'fontSize': '11px'}),
            html.Div(style={'display': 'flex', 'gap': '5px'}, children=[
                dcc.Input(id="inp-travel-f", type="number", value=203, style={'backgroundColor': '#1A1F2C', 'color': 'white', 'border': '1px solid #2E323F', 'padding': '6px', 'width': '50%'}),
                dcc.Input(id="inp-sag-f", type="number", value=40, style={'backgroundColor': '#1A1F2C', 'color': 'white', 'border': '1px solid #2E323F', 'padding': '6px', 'width': '50%'})
            ]),
            
            html.Label("Stroke Shock / SAG (mm):", style={'fontSize': '11px'}),
            html.Div(style={'display': 'flex', 'gap': '5px'}, children=[
                dcc.Input(id="inp-stroke-r", type="number", value=75, style={'backgroundColor': '#1A1F2C', 'color': 'white', 'border': '1px solid #2E323F', 'padding': '6px', 'width': '50%'}),
                dcc.Input(id="inp-sag-r", type="number", value=22, style={'backgroundColor': '#1A1F2C', 'color': 'white', 'border': '1px solid #2E323F', 'padding': '6px', 'width': '50%'})
            ]),
            
            html.Label("Recorrido Rueda Trasera (mm):", style={'fontSize': '11px'}),
            dcc.Input(id="inp-wheel-r", type="number", value=200, style={'backgroundColor': '#1A1F2C', 'color': 'white', 'border': '1px solid #2E323F', 'padding': '6px'}),
        ]),

        # PANEL DERECHO CENTRAL DE PANTALLAS (DASHBOARD SUITE)
        html.Div(style={'width': '78%', 'display': 'flex', 'flexDirection': 'column', 'gap': '15px'}, children=[
            
            # CONTROL DE CONTENEDORES MULTITAREA (TABS ESTILO F1 DE DASH)
            dcc.Tabs(id="tabs-consola", value='tab-run', children=[
                dcc.Tab(label='🗺️ TRACK GENERAL & RUN METRICS', value='tab-run', style={'backgroundColor': '#11141A', 'color': 'white'}, selected_style={'backgroundColor': '#FF9800', 'color': 'black', 'fontWeight': 'bold'}),
                dcc.Tab(label='📊 ANALÍTICA AVANZADA DE SUSPENSIONES', value='tab-susp', style={'backgroundColor': '#11141A', 'color': 'white'}, selected_style={'backgroundColor': '#FF9800', 'color': 'black', 'fontWeight': 'bold'}),
                dcc.Tab(label='🤖 AUTO TUNING & DEVOLUCIÓN IA', value='tab-ia', style={'backgroundColor': '#11141A', 'color': 'white'}, selected_style={'backgroundColor': '#FF9800', 'color': 'black', 'fontWeight': 'bold'}),
            ]),
            
            html.Div(id='contenedor-pantalla-activa')
        ])
    ])
])

# --- CONTROLER PRINCIPAL DE CAMBIO DE PANTALLAS ---
@app.callback(
    Output('contenedor-pantalla-activa', 'children'),
    [Input('tabs-consola', 'value'), Input('btn-simular', "n_clicks")],
    [State("inp-fork-name", "value"), State("inp-shock-name", "value"),
     State("inp-weight", "value"), State("inp-travel-f", "value"),
     State("inp-sag-f", "value"), State("inp-stroke-r", "value"),
     State("inp-sag-r", "value"), State("inp-wheel-r", "value")]
)
def renderizar_vistas_consola(tab_seleccionada, n_clicks, fork, shock, w_kg, tf, sf, sr, sag_r, wr):
    p = {'front_max': float(tf), 'shock_max': float(sr), 'wheel_max': float(wr), 'sag_f': float(sf), 'sag_r': float(sag_r)}
    df = engine.generar_datos_simulados(p)
    m = engine.calcular_metricas_avanzadas(p)
    
    if tab_seleccionada == 'tab-run':
        # --- PANTALLA 1: GEOSPATIAL MAP & RUN TELEMETRY ---
        fig_mapa = go.Figure(go.Scattermap(
            lat=df['Latitude'], lon=df['Longitude'], mode='markers',
            marker=go.scattermap.Marker(size=6, color=df['Speed_Kmh'], colorscale='Jet', showscale=True)
        ))
        fig_mapa.update_layout(
            map=dict(style="open-street-map", center=dict(lat=df['Latitude'].mean(), lon=df['Longitude'].mean()), zoom=14),
            margin=dict(l=0, r=0, t=0, b=0), paper_bgcolor='#11141A'
        )
        
        return html.Div(children=[
            # Tarjetas de datos del circuito limpias
            html.Div(style={'display': 'flex', 'gap': '10px', 'marginBottom': '15px'}, children=[
                html.Div(style={'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("DISTANCIA TOTAL", style={'fontSize': '10px', 'color': 'grey', 'margin':'0'}), html.H4(f"{m['run_dist_m']:.1f} m", style={'margin':'5px 0 0 0','fontSize':'18px'})]),
                html.Div(style={'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("TIEMPO TOTAL", style={'fontSize': '10px', 'color': 'grey', 'margin':'0'}), html.H4(f"{m['run_time_s']:.2f} s", style={'margin':'5px 0 0 0','fontSize':'18px'})]),
                html.Div(style={'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("VELOCIDAD MÁXIMA", style={'fontSize': '10px', 'color': 'grey', 'margin':'0'}), html.H4(f"{m['vel_max']:.1f} km/h", style={'margin':'5px 0 0 0','fontSize':'18px'})]),
                html.Div(style={'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("VELOCIDAD PROMEDIO", style={'fontSize': '10px', 'color': 'grey', 'margin':'0'}), html.H4(f"{m['vel_prom']:.1f} km/h", style={'margin':'5px 0 0 0','fontSize':'18px'})]),
                html.Div(style={'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("ELEVATION LOSS", style={'fontSize': '10px', 'color': 'grey', 'margin':'0'}), html.H4(f"-{m['run_loss_m']:.1f} m", style={'margin':'5px 0 0 0','fontSize':'18px','color':'#00FF66'})]),
            ]),
            html.Div(style={'backgroundColor': '#11141A', 'padding': '10px', 'borderRadius': '8px', 'border': '1px solid #1F242E'}, children=[
                dcc.Graph(figure=fig_mapa, style={'height': '380px'})
            ])
        ])
        
    elif tab_seleccionada == 'tab-susp':
        # --- PANTALLA 2: MOTOR INTEGRAL DE SUSPENSIONES WORLD CUP ---
        fig_lineas = go.Figure()
        fig_lineas.add_trace(go.Scatter(x=df['Time_s'], y=m['fork_mm_list'], name=f"F: {fork}", line=dict(color='#FFC107', width=1.5)))
        fig_lineas.add_trace(go.Scatter(x=df['Time_s'], y=m['wheel_mm_list'], name=f"R: {shock}", line=dict(color='#E91E63', width=1.5)))
        fig_lineas.update_layout(title="📈 HISTORIAL COMPLETO DE DESPLAZAMIENTO NETO A 1000 Hz", paper_bgcolor='#11141A', plot_bgcolor='#11141A', font=dict(color='white', size=10), margin=dict(l=40, r=15, t=40, b=30), xaxis=dict(gridcolor='#1F242E', rangeslider=dict(visible=True, thickness=0.03)), yaxis=dict(gridcolor='#1F242E'))

        fig_hist = go.Figure(go.Histogram(x=m['vel_fork_list'], nbinsx=100, marker_color='#00BCD4'))
        fig_hist.update_layout(title="📊 HISTOGRAMA DE VELOCIDAD DE VÁLVULAS (mm/s)", paper_bgcolor='#11141A', plot_bgcolor='#11141A', font=dict(color='white', size=10), margin=dict(l=40, r=15, t=40, b=30), xaxis=dict(gridcolor='#1F242E', title="<- REBOTE | COMPRESIÓN ->"), yaxis=dict(gridcolor='#1F242E'))

        fig_pie = go.Figure(go.Pie(labels=['Zona SAG (0-15mm)', 'Zona Media Absorbente', 'Zona Crítica / Impactos'], values=[m['budget_sag'], m['budget_mid'], m['budget_crit']], hole=.4, marker=dict(colors=['#34495E', '#1F618D', '#9B59B6'])))
        fig_pie.update_layout(title="🍕 TRAVEL BUDGET ALLOCATION", paper_bgcolor='#11141A', font=dict(color='white', size=10), margin=dict(l=10, r=10, t=40, b=10), legend=dict(orientation="h"))

        return html.Div(children=[
            html.Div(style={'display': 'flex', 'gap': '10px', 'marginBottom': '15px'}, children=[
                html.Div(style={'backgroundColor': '#11141A', 'padding': '12px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("POSICIÓN PROM / MAX", style={'fontSize':'9px','color':'grey','margin':'0'}), html.H5(f"{m['f_prom']:.1f} / {m['f_max']:.1f} mm", style={'margin':'5px 0 0 0'})]),
                html.Div(style={'backgroundColor': '#11141A', 'padding': '12px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("PERCENTIL 95th", style={'fontSize':'9px','color':'grey','margin':'0'}), html.H5(f"{m['f_95th']:.1f} mm", style={'margin':'5px 0 0 0','color':'#FFB300'})]),
                html.Div(style={'backgroundColor': '#11141A', 'padding': '12px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("BOTTOM-OUTS (TOPES)", style={'fontSize':'9px','color':'grey','margin':'0'}), html.H5(f"{m['bottom_outs']} detectados", style={'margin':'5px 0 0 0','color':'red' if m['bottom_outs']>0 else 'white'})]),
                html.Div(style={'backgroundColor': '#11141A', 'padding': '12px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("DEEP / TOTAL STROKES", style={'fontSize':'9px','color':'grey','margin':'0'}), html.H5(f"{m['deep_strokes']} / {m['total_strokes']}", style={'margin':'5px 0 0 0'})]),
                html.Div(style={'backgroundColor': '#11141A', 'padding': '12px', 'borderRadius': '6px', 'flex': '1', 'border': '1px solid #1F242E'}, children=[html.P("FRECUENCIA PROMEDIO", style={'fontSize':'9px','color':'grey','margin':'0'}), html.H5(f"{m['freq_hz']:.1f} Hz", style={'margin':'5px 0 0 0'})]),
            ]),
            html.Div(style={'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '8px', 'border': '1px solid #1F242E', 'marginBottom':'15px'}, children=[dcc.Graph(figure=fig_lineas)]),
            html.Div(style={'display': 'flex', 'gap': '15px'}, children=[
                html.Div(style={'width': '60%', 'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '8px', 'border': '1px solid #1F242E'}, children=[dcc.Graph(figure=fig_hist)]),
                html.Div(style={'width': '40%', 'backgroundColor': '#11141A', 'padding': '15px', 'borderRadius': '8px', 'border': '1px solid #1F242E'}, children=[dcc.Graph(figure=fig_pie)])
            ])
        ])

    elif tab_seleccionada == 'tab-ia':
        # --- PANTALLA 3: DEVOLUCIÓN DE LA IA EN BOXES ---
        reporte_texto = analyst.generar_reporte_clinico(m, p, fork, shock, float(w_kg))
        return html.Div(style={'backgroundColor': '#11141A', 'padding': '25px', 'borderRadius': '8px', 'border': '1px solid #1F242E'}, children=[
            html.H3("🧠 INGENIERÍA PREDICTIVA - INFORME COMPAL SUITE", style={'fontSize': '14px', 'color': '#00FF66', 'margin': '0 0 15px 0', 'fontWeight': 'bold'}),
            html.Pre(reporte_texto, style={'fontFamily': 'monospace', 'fontSize': '13px', 'color': '#00FF66', 'lineHeight': '20px', 'margin': '0', 'whiteSpace': 'pre-wrap'})
        ])

if __name__ == "__main__":
    app.run(debug=True, port=8050)