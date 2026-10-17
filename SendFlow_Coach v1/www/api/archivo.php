<?php
// ============================================================================
// archivo.php — entrega un video, grabación o bajada con enlace firmado
// (archivo.php?id=…&v=vencimiento&f=firma). El enlace lo arma la API sólo si
// el usuario tiene permiso; así el <video> del navegador puede pedirlo sin
// mandar la sesión. Soporta "Range" para poder adelantar el video.
// ============================================================================
declare(strict_types=1);
require __DIR__ . '/lib/base.php';
cabeceras_cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$id = (string)($_GET['id'] ?? '');
$v = (int)($_GET['v'] ?? 0);
$f = (string)($_GET['f'] ?? '');
if (!preg_match('/^[a-f0-9-]{36}$/', $id) || $v < time() || !hash_equals(hash_hmac('sha256', "$id|$v", config()['secreto']), $f)) {
  http_response_code(403); echo 'Enlace vencido o inválido.'; exit;
}
$a = fila('SELECT * FROM archivos WHERE id = ? AND completo = 1', [$id]);
$ruta = ruta_archivo($id);
if (!$a || !is_file($ruta)) { http_response_code(404); echo 'No existe.'; exit; }

$tam = filesize($ruta);
$ini = 0; $fin = $tam - 1;
header('Content-Type: ' . $a['tipo']);
header('Accept-Ranges: bytes');
header('Cache-Control: private, max-age=3600');
header('Content-Disposition: inline; filename="' . str_replace('"', '', $a['nombre']) . '"');
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
  if ($m[1] === '' && $m[2] !== '') { $ini = max(0, $tam - (int)$m[2]); }
  else { $ini = (int)$m[1]; if ($m[2] !== '') $fin = min($fin, (int)$m[2]); }
  if ($ini > $fin || $ini >= $tam) { http_response_code(416); header("Content-Range: bytes */$tam"); exit; }
  http_response_code(206);
  header("Content-Range: bytes $ini-$fin/$tam");
}
$largo = $fin - $ini + 1;
header('Content-Length: ' . $largo);
if ($_SERVER['REQUEST_METHOD'] === 'HEAD') exit;
@set_time_limit(0);
while (ob_get_level()) ob_end_clean();
$fh = fopen($ruta, 'rb');
fseek($fh, $ini);
$resta = $largo;
while ($resta > 0 && !feof($fh) && !connection_aborted()) {
  $buf = fread($fh, (int)min(1024 * 256, $resta));
  if ($buf === false) break;
  echo $buf; flush();
  $resta -= strlen($buf);
}
fclose($fh);
