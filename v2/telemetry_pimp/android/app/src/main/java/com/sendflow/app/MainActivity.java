package com.sendflow.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    // ---- Selector de archivos con cámara (ver configurarSelectorArchivos) ----
    private ValueCallback<Uri[]> selectorArchivosCallback;
    private boolean selectorArchivosPedirCamara;
    private String[] selectorArchivosTiposAceptados;
    private File archivoFotoTemp;
    private static final int PEDIDO_SELECTOR_ARCHIVOS = 5501;
    private static final int PEDIDO_PERMISO_CAMARA = 5502;

    // FileChooserParams.isCaptureEnabled() (que indica si el <input> tenía el
    // atributo "capture") resultó no ser confiable en este WebView — en la
    // práctica siempre devolvía false, así que el botón de "sacar foto" y el
    // de "elegir de la galería" terminaban tratados igual (los dos abrían la
    // galería). En vez de depender de esa señal, el botón de cámara avisa
    // directo por JS (ver AndroidSelectorFoto.marcarProximoComoCamara() más
    // abajo, y el listener en pfFotoCamaraInput en js/app.js) justo antes de
    // que el <input type=file> dispare el selector — se consume una sola vez.
    private boolean forzarCamaraProximoSelector;

    // ---- Permiso de ubicación pedido desde JS (navigator.geolocation) ----
    private String geoOrigenPendiente;
    private GeolocationPermissions.Callback geoCallbackPendiente;
    private static final int PEDIDO_PERMISO_UBICACION = 5503;

    // ---- Guardar archivo directo en el dispositivo (ACTION_CREATE_DOCUMENT) ----
    // A diferencia de compartir() (ACTION_SEND, que solo ofrece mandar el
    // archivo a otra app), esto abre el selector nativo "Guardar como" de
    // Android, con el que el usuario elige carpeta y nombre y el archivo
    // queda accesible después en su almacenamiento. Ver guardar() más abajo.
    private byte[] datosPendientesGuardar;
    private static final int PEDIDO_GUARDAR_ARCHIVO = 5504;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ocultarBarrasSistema();
        configurarInterfazImpresion();
        configurarInterfazCompartirArchivo();
        configurarInterfazSelectorFoto();
        configurarWebChromeClient();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            ocultarBarrasSistema();
        }
    }

    // Modo inmersivo: oculta la barra de navegación/estado del sistema para
    // que la webapp use toda la pantalla. El usuario puede volver a
    // mostrarlas momentáneamente deslizando desde el borde. Ver
    // docs/CAPACITOR_SETUP.md.
    private void ocultarBarrasSistema() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    // Expone window.AndroidImprimir.imprimir() a la webapp, para reemplazar
    // window.print() (no abre ningún diálogo dentro del WebView empaquetado)
    // por el diálogo de impresión nativo de Android, que incluye
    // "Guardar como PDF". Ver el listener de btnExportarPDF en js/app.js.
    @SuppressLint("JavascriptInterface")
    private void configurarInterfazImpresion() {
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new InterfazImpresion(), "AndroidImprimir");
    }

    public class InterfazImpresion {
        @JavascriptInterface
        public void imprimir() {
            runOnUiThread(() -> {
                WebView webView = getBridge().getWebView();
                PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (printManager == null) return;
                String nombreTrabajo = "SendFlow_Reporte";
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(nombreTrabajo);
                printManager.print(nombreTrabajo, adapter, new PrintAttributes.Builder().build());
            });
        }
    }

    // Expone window.AndroidCompartirArchivo.compartir(nombre, base64, mime) a
    // la webapp — reemplaza el truco de <a download> con blob:, que en este
    // WebView empaquetado no dispara el selector de guardado de Android ni
    // escribe el archivo en ningún lugar al que se pueda volver a acceder
    // (a diferencia de un navegador de verdad). Se usa para exportar perfiles
    // (Configuración → Perfiles) y para el CSV de "Guardar en la tablet" — ver
    // entregarArchivoAlUsuario() en js/app.js. Abre el cartel nativo de
    // Android para elegir dónde guardarlo o con qué compartirlo (Archivos,
    // Drive, Bluetooth, etc.), que es justamente la elección que faltaba.
    @SuppressLint("JavascriptInterface")
    private void configurarInterfazCompartirArchivo() {
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new InterfazCompartirArchivo(), "AndroidCompartirArchivo");
    }

    public class InterfazCompartirArchivo {
        @JavascriptInterface
        public void compartir(String nombreArchivo, String contenidoBase64, String tipoMime) {
            runOnUiThread(() -> {
                try {
                    byte[] datos = Base64.decode(contenidoBase64, Base64.DEFAULT);
                    File dirCompartidos = new File(getCacheDir(), "compartidos");
                    if (!dirCompartidos.exists()) dirCompartidos.mkdirs();
                    File archivo = new File(dirCompartidos, nombreArchivo);
                    try (FileOutputStream fos = new FileOutputStream(archivo)) {
                        fos.write(datos);
                    }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", archivo);
                    Intent intent = new Intent(Intent.ACTION_SEND);
                    intent.setType(tipoMime != null && !tipoMime.isEmpty() ? tipoMime : "application/octet-stream");
                    intent.putExtra(Intent.EXTRA_STREAM, uri);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(intent, "Guardar o compartir " + nombreArchivo));
                } catch (Exception e) {
                    // La webapp ya asumió que esto se hizo cargo (no espera
                    // ninguna respuesta) — no hay mucho más que loguearlo acá.
                    Log.e("SendFlow", "No se pudo compartir archivo: " + nombreArchivo, e);
                }
            });
        }

        // window.AndroidCompartirArchivo.guardar(nombre, base64, mime) — abre
        // el selector nativo "Guardar como" de Android (Storage Access
        // Framework) para que el usuario elija carpeta y nombre y el archivo
        // quede guardado en el dispositivo, en vez de solo poder compartirlo
        // a otra app. El contenido se guarda temporalmente en memoria
        // (datosPendientesGuardar) hasta que el usuario confirma el destino
        // en onActivityResult.
        @JavascriptInterface
        public void guardar(String nombreArchivo, String contenidoBase64, String tipoMime) {
            runOnUiThread(() -> {
                try {
                    datosPendientesGuardar = Base64.decode(contenidoBase64, Base64.DEFAULT);
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(tipoMime != null && !tipoMime.isEmpty() ? tipoMime : "application/octet-stream");
                    intent.putExtra(Intent.EXTRA_TITLE, nombreArchivo);
                    startActivityForResult(intent, PEDIDO_GUARDAR_ARCHIVO);
                } catch (Exception e) {
                    Log.e("SendFlow", "No se pudo abrir el selector para guardar archivo: " + nombreArchivo, e);
                    datosPendientesGuardar = null;
                }
            });
        }
    }

    // Puente para el botón "sacar foto" de Perfil — ver el comentario de
    // forzarCamaraProximoSelector más arriba. Se llama por JS justo antes de
    // que el <input type=file capture> dispare el selector, para no depender
    // de isCaptureEnabled().
    @SuppressLint("JavascriptInterface")
    private void configurarInterfazSelectorFoto() {
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new InterfazSelectorFoto(), "AndroidSelectorFoto");
    }

    public class InterfazSelectorFoto {
        @JavascriptInterface
        public void marcarProximoComoCamara() {
            forzarCamaraProximoSelector = true;
        }
    }

    // ============================================================================
    // WEBCHROMECLIENT PROPIO — el WebView empaquetado (Capacitor) no sabe abrir
    // la cámara nativa solo con <input type="file" capture="user"> como hace un
    // navegador normal: sin esto, los dos botones de Perfil ("sacar foto" y
    // "elegir de la galería" — ver index.html/pfFotoCamaraInput y
    // pfFotoGaleriaInput) terminaban abriendo el mismo selector de archivos
    // genérico de Android, sin opción de cámara — exactamente lo que se estaba
    // viendo. Se reimplementa acá también onGeolocationPermissionsShowPrompt
    // (que Capacitor maneja por su cuenta por defecto) porque la app SÍ usa
    // navigator.geolocation directo (ver obtenerPosicionConFallback en
    // js/app.js, para elegir el radio de descarga de mapas offline) — así no
    // se pierde ese permiso al reemplazar el WebChromeClient por uno propio.
    // ============================================================================
    private void configurarWebChromeClient() {
        WebView webView = getBridge().getWebView();
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                manejarSelectorArchivos(filePathCallback, fileChooserParams.isCaptureEnabled(), fileChooserParams.getAcceptTypes());
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                manejarPermisoUbicacion(origin, callback);
            }
        });
    }

    private void manejarSelectorArchivos(ValueCallback<Uri[]> filePathCallback, boolean pideCamara, String[] tiposAceptados) {
        if (selectorArchivosCallback != null) {
            // Si ya había un selector pendiente sin resolver, se cancela — no
            // debería pasar en uso normal, pero WebView exige responder algo
            // a cada callback tarde o temprano.
            selectorArchivosCallback.onReceiveValue(null);
        }
        // Se combina la señal de Chromium (poco confiable acá) con la señal
        // explícita que manda JS desde el botón de cámara — cualquiera de
        // las dos alcanza. La bandera de JS se consume una sola vez.
        boolean pideCamaraFinal = pideCamara || forzarCamaraProximoSelector;
        forzarCamaraProximoSelector = false;
        selectorArchivosCallback = filePathCallback;
        selectorArchivosPedirCamara = pideCamaraFinal;
        selectorArchivosTiposAceptados = tiposAceptados;
        if (pideCamaraFinal && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, PEDIDO_PERMISO_CAMARA);
            return; // se continúa en onRequestPermissionsResult
        }
        lanzarSelectorArchivos();
    }

    private void manejarPermisoUbicacion(String origin, GeolocationPermissions.Callback callback) {
        boolean concedido = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (concedido) {
            callback.invoke(origin, true, false);
            return;
        }
        geoOrigenPendiente = origin;
        geoCallbackPendiente = callback;
        ActivityCompat.requestPermissions(this,
            new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
            PEDIDO_PERMISO_UBICACION);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PEDIDO_PERMISO_CAMARA) {
            if (grantResults.length == 0 || grantResults[0] != PackageManager.PERMISSION_GRANTED) {
                // Sin permiso no se puede abrir la cámara — se sigue igual,
                // pero solo con la opción de elegir de la galería, para no
                // dejar el botón sin hacer nada.
                selectorArchivosPedirCamara = false;
            }
            lanzarSelectorArchivos();
        } else if (requestCode == PEDIDO_PERMISO_UBICACION) {
            if (geoCallbackPendiente != null) {
                boolean concedido = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
                geoCallbackPendiente.invoke(geoOrigenPendiente, concedido, false);
                geoCallbackPendiente = null;
                geoOrigenPendiente = null;
            }
        }
    }

    // Perfil ya tiene DOS botones separados ("sacar foto" = pfFotoCamaraInput
    // con capture="user", y "elegir de la galería" = pfFotoGaleriaInput sin
    // capture) — así que acá no hace falta combinar cámara+galería en un
    // solo selector: se abre directo la que corresponda según el botón que
    // tocó el usuario (pideCamara, que viene de isCaptureEnabled()).
    //
    // Antes se armaba un Intent.createChooser(intentGaleria, ...) con la
    // cámara agregada vía EXTRA_INITIAL_INTENTS, pero en la práctica eso
    // terminaba abriendo directo el selector de fotos del sistema (el
    // "Photo Picker" que Android 11+ intercepta para ACTION_GET_CONTENT con
    // tipo imagen) e ignorando por completo la cámara — el chooser combinado
    // nunca llegaba a mostrarse. Lanzando cada intent por separado se evita
    // ese problema.
    private void lanzarSelectorArchivos() {
        archivoFotoTemp = null;
        Intent intentFinal;

        if (selectorArchivosPedirCamara) {
            Intent intentCamara = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (intentCamara.resolveActivity(getPackageManager()) != null) {
                try {
                    archivoFotoTemp = crearArchivoFotoTemp();
                } catch (IOException e) {
                    archivoFotoTemp = null;
                }
            }
            if (archivoFotoTemp != null) {
                Uri uriFoto = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", archivoFotoTemp);
                intentCamara.putExtra(MediaStore.EXTRA_OUTPUT, uriFoto);
                intentCamara.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                intentFinal = intentCamara;
            } else {
                // No hay app de cámara disponible o no se pudo preparar el
                // archivo temporal — se cae al selector genérico para no
                // dejar el botón sin hacer nada.
                intentFinal = crearIntentSelectorGenerico(selectorArchivosTiposAceptados);
            }
        } else {
            intentFinal = crearIntentSelectorGenerico(selectorArchivosTiposAceptados);
        }

        try {
            startActivityForResult(intentFinal, PEDIDO_SELECTOR_ARCHIVOS);
        } catch (Exception e) {
            if (selectorArchivosCallback != null) selectorArchivosCallback.onReceiveValue(null);
            selectorArchivosCallback = null;
        }
    }

    // Selector genérico para cualquier <input type="file"> que NO sea el de
    // "sacar foto" (o sea, botón de galería de Perfil, importar bajada CSV,
    // importar perfiles JSON, elegir imagen de fondo para mapa offline,
    // etc.) — respeta el "accept" real del input en vez de forzar
    // image/* para todos, que era el bug: eso hacía que "Importar bajada
    // desde SD" (accept=".csv,text/csv") y "Importar perfiles"
    // (accept=".json,application/json") terminaran abriendo la galería de
    // fotos en vez del buscador de archivos de Android.
    private Intent crearIntentSelectorGenerico(String[] tiposAceptados) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        java.util.List<String> mimes = new java.util.ArrayList<>();
        if (tiposAceptados != null) {
            for (String t : tiposAceptados) {
                // El accept del HTML puede traer extensiones (".csv") además
                // de tipos MIME reales — un Intent solo entiende MIME, así
                // que las extensiones se descartan acá (no hay forma
                // confiable de mapear ".csv" a un MIME sin ambigüedad).
                if (t != null && t.contains("/")) mimes.add(t);
            }
        }
        if (mimes.isEmpty()) {
            intent.setType("*/*");
        } else if (mimes.size() == 1) {
            intent.setType(mimes.get(0));
        } else {
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
        }
        return intent;
    }

    private File crearArchivoFotoTemp() throws IOException {
        String marca = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        File dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (dir == null) dir = getCacheDir();
        return File.createTempFile("FOTO_" + marca + "_", ".jpg", dir);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PEDIDO_GUARDAR_ARCHIVO) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && datosPendientesGuardar != null) {
                Uri destino = data.getData();
                try (OutputStream salida = getContentResolver().openOutputStream(destino)) {
                    if (salida != null) {
                        salida.write(datosPendientesGuardar);
                    }
                } catch (IOException e) {
                    Log.e("SendFlow", "No se pudo guardar el archivo en el destino elegido", e);
                }
            }
            datosPendientesGuardar = null;
            return;
        }
        if (requestCode != PEDIDO_SELECTOR_ARCHIVOS) return;
        if (selectorArchivosCallback == null) return;
        Uri[] resultado = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                // Se eligió un archivo de la galería/selector.
                resultado = new Uri[]{ data.getData() };
            } else if (archivoFotoTemp != null && archivoFotoTemp.exists() && archivoFotoTemp.length() > 0) {
                // Se sacó una foto con la cámara — el resultado viene por el
                // EXTRA_OUTPUT (FileProvider), no en el Intent de vuelta.
                Uri uriFoto = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", archivoFotoTemp);
                resultado = new Uri[]{ uriFoto };
            }
        }
        selectorArchivosCallback.onReceiveValue(resultado);
        selectorArchivosCallback = null;
        archivoFotoTemp = null;
    }

    // Botón/gesto "atrás" de Android: le pregunta primero a la webapp (vía
    // window.manejarBotonAtras en js/app.js) si hay algo que cerrar adentro
    // (un modal abierto, o una pantalla que no es el menú principal) antes
    // de salir de la app. Solo sale si la webapp responde que no hay nada
    // que manejar.
    @Override
    public void onBackPressed() {
        WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
            "(function(){ return (window.manejarBotonAtras ? !!window.manejarBotonAtras() : false); })();",
            valor -> {
                if (!"true".equals(valor)) {
                    super.onBackPressed();
                }
            }
        );
    }
}
