import dash
from dash import dcc, html, Input, Output, State, callback_context
import plotly.graph_objects as go
import pandas as pd
import numpy as np

# Módulos de ingeniería locales
import engine
import ai_analyst

# Procesamiento de la telemetría base a 1000 Hz
df_raw = engine.generate_mock_telemetry()
telemetry_df = engine.process_telemetry_data(df_raw)
metrics = engine.extract_run_metrics(telemetry_df)

app = dash.Dash(__name__, title="Universal Motorsport Telemetry Suite v5.0", suppress_callback_exceptions=True)

# Paleta Estética Oscura Radical
DARK_BG = '#0b0c10'
CARD_BG = '#1f2833'
CYAN = '#66fcf1'
DARK_CYAN = '#45a29e'
RED = '#ff4d4d'
GREEN = '#1fbc1f'
GOLD = '#ffbc00'

app.layout = html.Div(style={'backgroundColor': DARK_BG, 'color': '#c5c6c7', 'fontFamily': 'sans-serif', 'padding': '0 10px'}, children=[
    
    # ENCABEZADO PRINCIPAL DE CARRERA
    html.Div(style={'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'padding': '15px', 'backgroundColor': CARD_BG, 'borderBottom': f'3px solid {CYAN}'}, children=[
        html.H1("UNIVERSAL MOTORSPORT TELEMETRY SUITE v5.0", style={'margin': '0', 'fontSize': '22px', 'letterSpacing': '2px', 'color': CYAN}),
        html.Div(style={'display': 'flex', 'alignItems': 'center', 'gap': '15px'}, children=[
            html.Span("RIDER MASS (KG):"),
            dcc.Input(id='weight-in', type='number', value=80, style={'backgroundColor': DARK_BG, 'color': CYAN, 'border': f'1px solid {DARK_CYAN}', 'width': '60px', 'padding': '5px'}),
            html.Button("COMPUTE TELEMETRY", id='btn-calc', style={'backgroundColor': CYAN, 'color': DARK_BG, 'fontWeight': 'bold', 'padding': '6px 12px', 'border': 'none', 'cursor': 'pointer'})
        ])
    ]),
    
    # DESLIZADOR MAESTRO DE LÍNEA DE TIEMPO SÍNCRONA
    html.Div(style={'backgroundColor': CARD_BG, 'padding': '15px', 'marginTop': '10px', 'borderRadius': '6px'}, children=[
        html.H5("⏱️ MASTER TIME CONTROLLER (TRACK TIMELINE POSITION)", style={'margin': '0 0 5px 0', 'color': CYAN, 'fontSize': '12px'}),
        dcc.Slider(
            id='master-time-slider',
            min=float(telemetry_df['time_sec'].min()),
            max=float(telemetry_df['time_sec'].max()),
            step=0.05,
            value=float(telemetry_df['time_sec'].min()),
            marks={i: f"{i}s" for i in range(0, int(telemetry_df['time_sec'].max())+1, 2)},
            tooltip={"placement": "bottom", "always_visible": True}
        )
    ]),

    # MENÚ DE PESTAÑAS DE TRABAJO
    dcc.Tabs(id="tabs-system", value="tab-kinematics", children=[
        dcc.Tab(label="LIVE TELEMETRY & RUN KINETICS", value="tab-kinematics", style={'backgroundColor': CARD_BG, 'color': '#c5c6c7'}, selected_style={'backgroundColor': DARK_BG, 'color': CYAN, 'borderTop': f'3px solid {CYAN}'}),
        dcc.Tab(label="AI DIAGNOSTIC CONSOLE", value="tab-ai", style={'backgroundColor': CARD_BG, 'color': '#c5c6c7'}, selected_style={'backgroundColor': DARK_BG, 'color': GREEN, 'borderTop': f'3px solid {GREEN}'}),
        dcc.Tab(label="BIKE COCKPIT & CHASSIS SETUP", value="tab-setup", style={'backgroundColor': CARD_BG, 'color': '#c5c6c7'}, selected_style={'backgroundColor': DARK_BG, 'color': GOLD, 'borderTop': f'3px solid {GOLD}'}),
    ], style={'marginTop': '10px'}),

    html.Div(id='tab-runtime-container', style={'padding': '15px 0'})
])

# CALLBACK CONTROLADOR CENTRAL DEL DASHBOARD
@app.callback(
    Output('tab-runtime-container', 'children'),
    Input('tabs-system', 'value'),
    Input('master-time-slider', 'value'),
    State('weight-in', 'value')
)
def update_dashboard_layout(selected_tab, active_time, weight_val):
    idx_closest = (telemetry_df['time_sec'] - active_time).abs().idxmin()
    current_sample = telemetry_df.iloc[idx_closest]

    if selected_tab == 'tab-kinematics':
        # Gráfico 1: Desplazamiento Lineal de Ruedas
        fig_lines = go.Figure()
        fig_lines.add_trace(go.Scatter(x=telemetry_df['time_sec'], y=telemetry_df['fork_travel_mm'], name='Front Fork (mm)', line=dict(color=CYAN, width=1.5)))
        fig_lines.add_trace(go.Scatter(x=telemetry_df['time_sec'], y=telemetry_df['rear_travel_mm'], name='Rear Wheel (mm)', line=dict(color=RED, width=1.5)))
        fig_lines.add_vline(x=active_time, line_width=2, line_dash="dash", line_color="#fff")
        fig_lines.update_layout(title="SYNCHRONOUS WHEEL TRAVEL INTERACTIVE TELEMETRY", template='plotly_dark', paper_bgcolor=CARD_BG, plot_bgcolor=DARK_BG, height=300, margin=dict(t=40, b=40))

        # Gráfico 2: Deslizamiento y Velocidades Comparadas
        fig_speeds = go.Figure()
        fig_speeds.add_trace(go.Scatter(x=telemetry_df['time_sec'], y=telemetry_df['wheel_speed_ms']*3.6, name='Wheel (Hall)', line=dict(color=GOLD, width=1.5)))
        fig_speeds.add_trace(go.Scatter(x=telemetry_df['time_sec'], y=telemetry_df['gps_speed_ms']*3.6, name='Ground (GPS)', line=dict(color='#a370f7', width=1.5)))
        fig_speeds.add_vline(x=active_time, line_width=2, line_dash="dash", line_color="#fff")
        fig_speeds.update_layout(title="WHEEL SPEED VS SATELLITE GPS SPEED (km/h)", template='plotly_dark', paper_bgcolor=CARD_BG, plot_bgcolor=DARK_BG, height=220, margin=dict(t=40, b=40))

        # Gráfico 3: Histograma Hidráulico con Límites Dinámicos
        ai_res = ai_analyst.analyze_suspension_health(telemetry_df, weight_val)
        hsc_lim = ai_res['hsc_threshold']
        
        fig_hist = go.Figure()
        fig_hist.add_histogram(x=telemetry_df['fork_velocity_mms'], name="Fork Shaft", marker_color=CYAN, opacity=0.6)
        fig_hist.add_histogram(x=telemetry_df['rear_velocity_mms'], name="Rear Shock", marker_color=RED, opacity=0.6)
        
        # Corrección: Se cambió title_text por annotation_text
        fig_hist.add_vrect(x0=hsc_lim, x1=telemetry_df['fork_velocity_mms'].max(), fillcolor="rgba(255, 77, 77, 0.15)", line_width=0, annotation_text="HSC ALARM")
        fig_hist.add_vrect(x0=telemetry_df['fork_velocity_mms'].min(), x1=-hsc_lim, fillcolor="rgba(255, 77, 77, 0.15)", line_width=0, annotation_text="HSR ALARM")
        
        fig_hist.update_layout(title=f"HYDRAULIC VELOCITY LOG (Alarm Threshold: +/-{hsc_lim} mm/s)", template='plotly_dark', paper_bgcolor=CARD_BG, plot_bgcolor=DARK_BG, barmode='overlay', height=240, margin=dict(t=40, b=40))

        return html.Div([
            html.Div(style={'display': 'grid', 'gridTemplateColumns': 'repeat(5, 1fr)', 'gap': '12px', 'marginBottom': '15px'}, children=[
                html.Div(style={'backgroundColor': CARD_BG, 'padding': '12px', 'borderRadius': '4px', 'borderLeft': f'4px solid {CYAN}'}, children=[html.H6("FORK POSITION", style={'margin':'0','fontSize':'11px','color':DARK_CYAN}), html.H4(f"{current_sample['fork_travel_mm']:.1f} mm", style={'margin':'2px 0 0 0','color':'#fff'})]),
                html.Div(style={'backgroundColor': CARD_BG, 'padding': '12px', 'borderRadius': '4px', 'borderLeft': f'4px solid {RED}'}, children=[html.H6("REAR RECOVERY", style={'margin':'0','fontSize':'11px','color':DARK_CYAN}), html.H4(f"{current_sample['rear_travel_mm']:.1f} mm", style={'margin':'2px 0 0 0','color':'#fff'})]),
                html.Div(style={'backgroundColor': CARD_BG, 'padding': '12px', 'borderRadius': '4px', 'borderLeft': f'4px solid {GOLD}'}, children=[html.H6("INSTANT WHEEL SLIP", style={'margin':'0','fontSize':'11px','color':DARK_CYAN}), html.H4(f"{current_sample['wheel_slip_pct']:.1f} %", style={'margin':'2px 0 0 0','color': GOLD if abs(current_sample['wheel_slip_pct']) < 35 else RED})]),
                html.Div(style={'backgroundColor': CARD_BG, 'padding': '12px', 'borderRadius': '4px', 'borderLeft': '4px solid #a370f7'}, children=[html.H6("IMPACT FORCE", style={'margin':'0','fontSize':'11px','color':DARK_CYAN}), html.H4(f"{current_sample['impact_g']:.1f} G", style={'margin':'2px 0 0 0','color':'#fff'})]),
                html.Div(style={'backgroundColor': CARD_BG, 'padding': '12px', 'borderRadius': '4px', 'borderLeft': f'4px solid {CYAN}'}, children=[html.H6("TIMELINE POINTER", style={'margin':'0','fontSize':'11px','color':DARK_CYAN}), html.H4(f"{current_sample['time_sec']:.3f} s", style={'margin':'2px 0 0 0','color':CYAN})]),
            ]),
            html.Div(style={'backgroundColor': CARD_BG, 'padding': '10px', 'borderRadius': '6px'}, children=[dcc.Graph(figure=fig_lines)]),
            html.Div(style={'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '15px', 'marginTop': '15px'}, children=[
                html.Div(style={'backgroundColor': CARD_BG, 'padding': '10px', 'borderRadius': '6px'}, children=[dcc.Graph(figure=fig_speeds)]),
                html.Div(style={'backgroundColor': CARD_BG, 'padding': '10px', 'borderRadius': '6px'}, children=[dcc.Graph(figure=fig_hist)])
            ])
        ])

    elif selected_tab == 'tab-ai':
        ai_res = ai_analyst.analyze_suspension_health(telemetry_df, weight_val)
        return html.Div([
            html.H4("AUTOMATED TELEMETRY DIAGNOSTIC CORE v5.0", style={'color': GREEN, 'fontSize': '14px', 'marginBottom': '10px'}),
            html.Div(style={'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '20px'}, children=[
                html.Div(style={'backgroundColor': '#050c05', 'border': f'1px solid {GREEN}', 'padding': '15px', 'borderRadius': '4px'}, children=[
                    html.H5("CHASSIS FIRMWARE LIVE METRICS", style={'color': GREEN, 'margin': '0 0 10px 0'}),
                    html.Pre(ai_res['diagnostics'], style={'color': '#39ff14', 'fontFamily': 'monospace', 'fontSize': '12px', 'whiteSpace': 'pre-wrap'})
                ]),
                html.Div(style={'backgroundColor': '#050c05', 'border': f'1px solid {GREEN}', 'padding': '15px', 'borderRadius': '4px'}, children=[
                    html.H5("EXPERT VALVE SETTING SUGGESTIONS", style={'color': GREEN, 'margin': '0 0 10px 0'}),
                    html.Pre(ai_res['recommendations'], style={'color': '#39ff14', 'fontFamily': 'monospace', 'fontSize': '12px', 'whiteSpace': 'pre-wrap', 'fontWeight':'bold'})
                ])
            ])
        ])
    
    elif selected_tab == 'tab-setup':
        return get_setup_panel_layout()

def get_setup_panel_layout():
    """Construye el panel técnico con la base de datos de persistencia integrada."""
    saved_options = [{'label': name, 'value': name} for name in engine.get_all_setup_names()]
    
    return html.Div([
        # SECCIÓN DE CONTROL OPERATIVO DE BASE DE DATOS (SQLite Core)
        html.Div(style={'backgroundColor': '#141d26', 'padding': '15px', 'borderRadius': '6px', 'marginBottom': '15px', 'display': 'flex', 'alignItems': 'center', 'justifyContent': 'space-between', 'border': f'1px solid {GOLD}'}, children=[
            html.Div(style={'display': 'flex', 'alignItems': 'center', 'gap': '10px'}, children=[
                html.B("💾 DATABASE STORAGE CORE:", style={'color': GOLD, 'fontSize': '13px'}),
                dcc.Input(id='setup-name-input', placeholder="New Setup Name (eg. Maribor Valleys)", style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': '1px solid #45a29e', 'padding': '6px', 'width': '230px'}),
                html.Button("SAVE TO DATABASE", id='btn-save-db', n_clicks=0, style={'backgroundColor': GOLD, 'color': '#000', 'fontWeight': 'bold', 'padding': '6px 12px', 'cursor': 'pointer', 'border': 'none'}),
            ]),
            html.Div(style={'display': 'flex', 'alignItems': 'center', 'gap': '10px'}, children=[
                html.B("LOAD SETUP:", style={'color': CYAN}),
                dcc.Dropdown(id='setup-load-dropdown', options=saved_options, placeholder="Select Saved Setup...", style={'width': '200px', 'color': '#000'}),
                html.Button("LOAD", id='btn-load-db', n_clicks=0, style={'backgroundColor': CYAN, 'color': '#000', 'fontWeight': 'bold', 'padding': '6px 12px', 'cursor': 'pointer', 'border': 'none'}),
            ]),
            html.Div(id='db-status-message', style={'color': GREEN, 'fontWeight': 'bold', 'fontSize': '12px'})
        ]),

        # FORMULARIOS ESTRUCTURADOS DEL REGLAJE DE LA BICICLETA
        html.Div(style={'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '20px'}, children=[
            html.Div(style={'backgroundColor': CARD_BG, 'padding': '15px', 'borderRadius': '6px'}, children=[
                html.H5("1. COCKPIT SETUP", style={'color': CYAN, 'marginTop': '0', 'borderBottom': '1px solid #45a29e'}),
                html.Div(style={'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '10px', 'fontSize': '12px'}, children=[
                    html.Label("Bike Model:"), dcc.Input(id='in-bike-model', value="Specialized Demo V4", style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                    html.Label("Stem Length (mm):"), dcc.Input(id='in-stem-len', type='number', value=50, style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                    html.Label("Handlebar Width (mm):"), dcc.Input(id='in-bar-width', type='number', value=780, style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                    html.Label("Handlebar Rise (mm):"), dcc.Input(id='in-bar-rise', type='number', value=30, style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                    html.Label("Brakes Model:"), dcc.Input(id='in-brakes', value="Sram Code Ultimate", style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                ])
            ]),
            
            html.Div(style={'backgroundColor': CARD_BG, 'padding': '15px', 'borderRadius': '6px'}, children=[
                html.H5("2. WHEELS & TYRES PROFILE", style={'color': CYAN, 'marginTop': '0', 'borderBottom': '1px solid #45a29e'}),
                html.Div(style={'display': 'grid', 'gridTemplateColumns': '1fr 1fr', 'gap': '10px', 'fontSize': '12px'}, children=[
                    html.Label("Front Tyre / Width:"), dcc.Input(id='in-f-tyre', value="Maxxis Assegai 2.5", style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                    html.Label("Rear Tyre / Width:"), dcc.Input(id='in-r-tyre', value="Maxxis Minion DHR 2.4", style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                    html.Label("Front PSI:"), dcc.Input(id='in-f-psi', type='number', value=22, style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                    html.Label("Rear PSI:"), dcc.Input(id='in-r-psi', type='number', value=25, style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                    html.Label("Spoke Tension Front:"), dcc.Input(id='in-f-spoke', value="Normal Bias", style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                    html.Label("Spoke Tension Rear:"), dcc.Input(id='in-r-spoke', value="Normal Bias", style={'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none'}),
                ])
            ]),

            html.Div(style={'backgroundColor': CARD_BG, 'padding': '15px', 'borderRadius': '6px', 'gridColumn': 'span 2'}, children=[
                html.H5("3. HYDRAULIC SUSPENSION VALVING MATRIX", style={'color': CYAN, 'marginTop': '0', 'borderBottom': '1px solid #45a29e'}),
                html.Div(style={'display': 'grid', 'gridTemplateColumns': 'repeat(3, 1fr)', 'gap': '10px', 'fontSize': '11px'}, children=[
                    html.B("PARAMETER"), html.B("FRONT FORK (FOX 40 / BOXXER)"), html.B("REAR SHOCK (DHX2 / DELUXE)"),
                    html.Label("Damper Model:"), dcc.Input(id='in-f-model', value="Fox 40 Grip2"), dcc.Input(id='in-r-model', value="Fox DHX2 Factory"),
                    html.Label("Travel / Stroke:"), dcc.Input(id='in-f-travel', value="200 mm"), dcc.Input(id='in-r-stroke', value="75 mm"),
                    html.Label("Target Static Sag:"), dcc.Input(id='in-f-sag', value="20%"), dcc.Input(id='in-r-sag', value="30%"),
                    html.Label("Air PSI / Spring Rate:"), dcc.Input(id='in-f-press', value="78 PSI"), dcc.Input(id='in-r-spring', value="450 lbs"),
                    html.Label("Ramp-up / Tokens / Spacer:"), dcc.Input(id='in-f-tokens', value="3 Tokens"), dcc.Input(id='in-r-spacer', value="0.2 Spacer"),
                    html.Label("HSC (High Compression):"), dcc.Input(id='in-f-hsc', value="-4 clicks"), dcc.Input(id='in-r-hsc', value="-6 clicks"),
                    html.Label("LSC (Low Compression):"), dcc.Input(id='in-f-lsc', value="-8 clicks"), dcc.Input(id='in-r-lsc', value="-10 clicks"),
                    html.Label("HSR (High Rebound):"), dcc.Input(id='in-f-hsr', value="-5 clicks"), dcc.Input(id='in-r-hsr', value="-4 clicks"),
                    html.Label("LSR (Low Rebound):"), dcc.Input(id='in-f-lsr', value="-9 clicks"), dcc.Input(id='in-r-lsr', value="-8 clicks"),
                ])
            ]),
            
            html.Div(style={'backgroundColor': CARD_BG, 'padding': '15px', 'borderRadius': '6px', 'gridColumn': 'span 2'}, children=[
                html.H5("4. FIELD TRACK NOTES", style={'color': GOLD, 'marginTop': '0', 'borderBottom': f'1px solid {GOLD}'}),
                dcc.Textarea(id='in-track-notes', placeholder="Circuit conditions, mud, roots alignment...", style={'width': '100%', 'height': '60px', 'backgroundColor': DARK_BG, 'color': '#fff', 'border': 'none', 'padding': '8px'})
            ])
        ])
    ])
# CALLBACK DE PERSISTENCIA COMPLETAMENTE MAPEADO EXPLICITAMENTE (SIN ARGS CONFUSOS)
@app.callback(
    [Output('db-status-message', 'children'),
     Output('in-bike-model', 'value'), Output('in-stem-len', 'value'), Output('in-bar-width', 'value'), Output('in-bar-rise', 'value'), Output('in-brakes', 'value'),
     Output('in-f-tyre', 'value'), Output('in-r-tyre', 'value'), Output('in-f-psi', 'value'), Output('in-r-psi', 'value'), Output('in-f-spoke', 'value'), Output('in-r-spoke', 'value'),
     Output('in-f-model', 'value'), Output('in-r-model', 'value'), Output('in-f-travel', 'value'), Output('in-r-stroke', 'value'), Output('in-f-sag', 'value'), Output('in-r-sag', 'value'),
     Output('in-f-press', 'value'), Output('in-r-spring', 'value'), Output('in-f-tokens', 'value'), Output('in-r-spacer', 'value'),
     Output('in-f-hsc', 'value'), Output('in-r-hsc', 'value'), Output('in-f-lsc', 'value'), Output('in-r-lsc', 'value'), Output('in-f-hsr', 'value'), Output('in-r-hsr', 'value'),
     Output('in-f-lsr', 'value'), Output('in-r-lsr', 'value'), Output('in-track-notes', 'value')],
    [Input('btn-save-db', 'n_clicks'), Input('btn-load-db', 'n_clicks')],
    [State('setup-name-input', 'value'), State('setup-load-dropdown', 'value'),
     State('in-bike-model', 'value'), State('in-stem-len', 'value'), State('in-bar-width', 'value'), State('in-bar-rise', 'value'), State('in-brakes', 'value'),
     State('in-f-tyre', 'value'), State('in-r-tyre', 'value'), State('in-f-psi', 'value'), State('in-r-psi', 'value'), State('in-f-spoke', 'value'), State('in-r-spoke', 'value'),
     State('in-f-model', 'value'), State('in-r-model', 'value'), State('in-f-travel', 'value'), State('in-r-stroke', 'value'), State('in-f-sag', 'value'), State('in-r-sag', 'value'),
     State('in-f-press', 'value'), State('in-r-spring', 'value'), State('in-f-tokens', 'value'), State('in-r-spacer', 'value'),
     State('in-f-hsc', 'value'), State('in-r-hsc', 'value'), State('in-f-lsc', 'value'), State('in-r-lsc', 'value'), State('in-f-hsr', 'value'), State('in-r-hsr', 'value'),
     State('in-f-lsr', 'value'), State('in-r-lsr', 'value'), State('in-track-notes', 'value')],
    prevent_initial_call=True
)
def handle_db_operations(n_save, n_load, save_name, load_name, 
                         bike, stem, bar_w, bar_r, brakes,
                         f_tyre, r_tyre, f_psi, r_psi, f_spk, r_spk,
                         f_mod, r_mod, f_trv, r_str, f_sg, r_sg,
                         f_prs, r_spr, f_tkn, r_spc,
                         f_hsc, r_hsc, f_lsc, r_lsc, f_hsr, r_hsr, f_lsr, r_lsr, notes):
    
    ctx = callback_context
    form_data = [bike, stem, bar_w, bar_r, brakes, f_tyre, r_tyre, f_psi, r_psi, f_spk, r_spk, f_mod, r_mod, f_trv, r_str, f_sg, r_sg, f_prs, r_spr, f_tkn, r_spc, f_hsc, r_hsc, f_lsc, r_lsc, f_hsr, r_hsr, f_lsr, r_lsr, notes]
    
    if not ctx.triggered:
        return ["", *form_data]
    
    # CORRECCIÓN: Acceder al índice 0 de la lista de triggers de Dash
    trigger_id = ctx.triggered[0]['prop_id'].split('.')[0]
    
    if trigger_id == 'btn-save-db':
        if not save_name:
            return ["❌ ENTER NAME", *form_data]
        fields = ['bike', 'stem', 'bar_w', 'bar_r', 'brakes', 'f_tyre', 'r_tyre', 'f_psi', 'r_psi', 'f_spk', 'r_spk', 'f_mod', 'r_mod', 'f_trv', 'r_str', 'f_sg', 'r_sg', 'f_prs', 'r_spr', 'f_tkn', 'r_spc', 'f_hsc', 'r_hsc', 'f_lsc', 'r_lsc', 'f_hsr', 'r_hsr', 'f_lsr', 'r_lsr', 'notes']
        cfg_dict = dict(zip(fields, form_data))
        success = engine.save_setup(save_name, cfg_dict)
        msg = f"✔️ SAVED: '{save_name}'" if success else "❌ DB ERROR"
        return [msg, *form_data]
        
    elif trigger_id == 'btn-load-db':
        if not load_name:
            return ["❌ SELECT ONE", *form_data]
        cfg = engine.load_setup_by_name(load_name)
        if cfg:
            return [
                f"✔️ LOADED: '{load_name}'",
                cfg.get('bike'), cfg.get('stem'), cfg.get('bar_w'), cfg.get('bar_r'), cfg.get('brakes'),
                cfg.get('f_tyre'), cfg.get('r_tyre'), cfg.get('f_psi'), cfg.get('r_psi'), cfg.get('f_spk'), cfg.get('r_spk'),
                cfg.get('f_mod'), cfg.get('r_mod'), cfg.get('f_trv'), cfg.get('r_str'), cfg.get('f_sg'), cfg.get('r_sg'),
                cfg.get('f_prs'), cfg.get('r_spr'), cfg.get('f_tkn'), cfg.get('r_spc'),
                cfg.get('f_hsc'), cfg.get('r_hsc'), cfg.get('f_lsc'), cfg.get('r_lsc'), cfg.get('f_hsr'), cfg.get('r_hsr'),
                cfg.get('f_lsr'), cfg.get('r_lsr'), cfg.get('notes')
            ]
            
    return ["", *form_data]

if __name__ == '__main__':
    app.run(debug=True, port=8050)
