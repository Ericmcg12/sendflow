<?php
// ============================================================================
// API de SendFlow Coach. Todas las rutas pasan por acá: index.php?r=/ruta
// (no depende de mod_rewrite, anda igual en cPanel/Linux y en Plesk/Windows).
// Respuestas JSON. Autenticación: "Authorization: Bearer <token>".
// Detalle de cada ruta en docs/API.md.
// ============================================================================
declare(strict_types=1);
require __DIR__ . '/lib/base.php';

cabeceras_cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
set_exception_handler(function (Throwable $e) {
  error_log('SendFlow Coach: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  fallar(500, 'Error del servidor.');
});

$metodo = $_SERVER['REQUEST_METHOD'];
$ruta = '/' . trim((string)($_GET['r'] ?? ''), '/');
$partes = array_values(array_filter(explode('/', $ruta), 'strlen'));
$p0 = $partes[0] ?? ''; $p1 = $partes[1] ?? null; $p2 = $partes[2] ?? null;

const MODOS = ['coach', 'piloto'];
const CAMPOS_PILOTO = ['disciplina' => 60, 'nivel' => 30, 'categoria' => 40, 'bici' => 80, 'color' => 9, 'notas' => 2000, 'peso' => 6];

// ============================================================ Estado
if ($p0 === '' || $p0 === 'estado') {
  bd();
  responder(['ok' => true, 'app' => 'SendFlow Coach', 'version' => VERSION_API]);
}

// ============================================================ Cuenta
if ($p0 === 'registro' && $metodo === 'POST') {
  $d = leer_json();
  $email = strtolower(texto($d['email'] ?? '', 190));
  $nombre = texto($d['nombre'] ?? '', 120);
  $clave = (string)($d['clave'] ?? '');
  $modo = in_array($d['modo'] ?? '', MODOS, true) ? $d['modo'] : 'coach';
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fallar(400, 'El email no es válido.');
  if ($nombre === '') fallar(400, 'Poné tu nombre.');
  if (strlen($clave) < 8) fallar(400, 'La contraseña tiene que tener al menos 8 caracteres.');
  if (fila('SELECT id FROM usuarios WHERE email = ?', [$email])) fallar(409, 'Ya hay una cuenta con ese email.');
  $id = nuevo_id();
  q('INSERT INTO usuarios (id, email, nombre, clave_hash, modo, datos_piloto, creado) VALUES (?,?,?,?,?,?,?)',
    [$id, $email, $nombre, password_hash($clave, PASSWORD_DEFAULT), $modo, jenc((object)[]), ahora()]);
  // Si un entrenador ya lo había cargado como piloto con este email, queda vinculado
  q('UPDATE pilotos SET usuario_id = ? WHERE email = ? AND usuario_id IS NULL', [$id, $email]);
  $cliente = texto($d['cliente'] ?? 'coach', 20);
  $u = fila('SELECT * FROM usuarios WHERE id = ?', [$id]);
  responder(['token' => crear_sesion($id, $cliente), 'usuario' => usuario_publico($u)], 201);
}

if ($p0 === 'login' && $metodo === 'POST') {
  $d = leer_json();
  $email = strtolower(texto($d['email'] ?? '', 190));
  controlar_intentos($email, false);
  $u = fila('SELECT * FROM usuarios WHERE email = ?', [$email]);
  if (!$u || !password_verify((string)($d['clave'] ?? ''), $u['clave_hash'])) {
    controlar_intentos($email, true);
    fallar(401, 'Email o contraseña incorrectos.');
  }
  if (password_needs_rehash($u['clave_hash'], PASSWORD_DEFAULT))
    q('UPDATE usuarios SET clave_hash = ? WHERE id = ?', [password_hash((string)$d['clave'], PASSWORD_DEFAULT), $u['id']]);
  $cliente = in_array($d['cliente'] ?? '', ['coach', 'sendflow'], true) ? $d['cliente'] : 'coach';
  responder(['token' => crear_sesion($u['id'], $cliente), 'usuario' => usuario_publico($u)]);
}

if ($p0 === 'logout' && $metodo === 'POST') {
  $t = token_del_pedido();
  if ($t) q('DELETE FROM sesiones WHERE token_hash = ?', [hash('sha256', $t)]);
  responder(['ok' => true]);
}

// Desde acá todo necesita sesión
$U = usuario_actual();
$esCoach = $U['modo'] === 'coach';

if ($p0 === 'yo') {
  if ($metodo === 'GET') responder(['usuario' => usuario_publico($U)]);
  if ($metodo === 'PUT' && $p1 === 'clave') {
    $d = leer_json();
    if (!password_verify((string)($d['actual'] ?? ''), $U['clave_hash'])) fallar(400, 'La contraseña actual no es correcta.');
    if (strlen((string)($d['nueva'] ?? '')) < 8) fallar(400, 'La contraseña nueva tiene que tener al menos 8 caracteres.');
    q('UPDATE usuarios SET clave_hash = ? WHERE id = ?', [password_hash((string)$d['nueva'], PASSWORD_DEFAULT), $U['id']]);
    // Cierra las otras sesiones
    $t = token_del_pedido();
    q('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?', [$U['id'], hash('sha256', (string)$t)]);
    responder(['ok' => true]);
  }
  if ($metodo === 'PUT') {
    $d = leer_json();
    $nombre = array_key_exists('nombre', $d) ? texto($d['nombre'], 120) : $U['nombre'];
    if ($nombre === '') fallar(400, 'Poné tu nombre.');
    $modo = in_array($d['modo'] ?? '', MODOS, true) ? $d['modo'] : $U['modo'];
    $piloto = jdec($U['datos_piloto']) ?: [];
    if (isset($d['piloto']) && is_array($d['piloto']))
      foreach (CAMPOS_PILOTO as $k => $max) if (array_key_exists($k, $d['piloto'])) $piloto[$k] = texto($d['piloto'][$k], $max);
    q('UPDATE usuarios SET nombre = ?, modo = ?, datos_piloto = ? WHERE id = ?', [$nombre, $modo, jenc((object)$piloto), $U['id']]);
    responder(['usuario' => usuario_publico(fila('SELECT * FROM usuarios WHERE id = ?', [$U['id']]))]);
  }
}

// ============================================================ Pilotos (del entrenador)
function piloto_salida(array $p): array {
  $d = jdec($p['datos']) ?: [];
  return array_merge($d, ['id' => $p['id'], 'nombre' => $p['nombre'], 'email' => $p['email'],
    'vinculado' => $p['usuario_id'] !== null, 'usuarioId' => $p['usuario_id'], 'creado' => $p['creado']]);
}
function piloto_propio(string $id, array $U): array {
  $p = fila('SELECT * FROM pilotos WHERE id = ? AND coach_id = ?', [$id, $U['id']]);
  if (!$p) fallar(404, 'Ese piloto no existe.');
  return $p;
}
if ($p0 === 'pilotos') {
  if (!$esCoach) fallar(403, 'Los pilotos se manejan en modo entrenador.');
  if ($metodo === 'GET' && !$p1) {
    responder(['pilotos' => array_map('piloto_salida', filas('SELECT * FROM pilotos WHERE coach_id = ? ORDER BY nombre', [$U['id']]))]);
  }
  if ($metodo === 'GET' && $p1 && $p2 === 'perfiles') {
    $p = piloto_propio($p1, $U);
    if (!$p['usuario_id']) responder(['perfiles' => []]);
    responder(['perfiles' => array_map('perfil_salida', filas('SELECT * FROM perfiles WHERE usuario_id = ? ORDER BY nombre', [$p['usuario_id']]))]);
  }
  if (($metodo === 'POST' && !$p1) || ($metodo === 'PUT' && $p1)) {
    $d = leer_json();
    $nombre = texto($d['nombre'] ?? '', 120);
    if ($nombre === '') fallar(400, 'Poné el nombre del piloto.');
    $email = strtolower(texto($d['email'] ?? '', 190));
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fallar(400, 'El email del piloto no es válido.');
    $datos = [];
    foreach (CAMPOS_PILOTO as $k => $max) $datos[$k] = texto($d[$k] ?? '', $max);
    $usuarioId = null;
    if ($email !== '') { $v = fila('SELECT id FROM usuarios WHERE email = ?', [$email]); $usuarioId = $v ? $v['id'] : null; }
    if ($metodo === 'POST') {
      $id = nuevo_id();
      q('INSERT INTO pilotos (id, coach_id, usuario_id, email, nombre, datos, creado) VALUES (?,?,?,?,?,?,?)',
        [$id, $U['id'], $usuarioId, $email ?: null, $nombre, jenc($datos), ahora()]);
    } else {
      $id = piloto_propio($p1, $U)['id'];
      q('UPDATE pilotos SET usuario_id = ?, email = ?, nombre = ?, datos = ? WHERE id = ?', [$usuarioId, $email ?: null, $nombre, jenc($datos), $id]);
    }
    responder(['piloto' => piloto_salida(fila('SELECT * FROM pilotos WHERE id = ?', [$id]))], $metodo === 'POST' ? 201 : 200);
  }
  if ($metodo === 'DELETE' && $p1) {
    $p = piloto_propio($p1, $U);
    foreach (filas('SELECT id FROM analisis WHERE piloto_id = ? AND coach_id = ?', [$p['id'], $U['id']]) as $a) borrar_analisis($a['id']);
    q('DELETE FROM pilotos WHERE id = ?', [$p['id']]);
    responder(['ok' => true]);
  }
}

// ============================================================ Entrenadores (del piloto)
if ($p0 === 'entrenadores') {
  if ($metodo === 'GET') {
    responder(['entrenadores' => filas('SELECT DISTINCT u.id, u.nombre, u.email FROM pilotos p JOIN usuarios u ON u.id = p.coach_id WHERE p.usuario_id = ? ORDER BY u.nombre', [$U['id']])]);
  }
  if ($metodo === 'DELETE' && $p1) {
    q('UPDATE pilotos SET usuario_id = NULL, email = NULL WHERE coach_id = ? AND usuario_id = ?', [$p1, $U['id']]);
    responder(['ok' => true]);
  }
}

// ============================================================ Análisis
function analisis_visible(string $id, array $U): array {
  $a = fila('SELECT a.*, p.usuario_id AS piloto_usuario FROM analisis a LEFT JOIN pilotos p ON p.id = a.piloto_id WHERE a.id = ?', [$id]);
  if (!$a || ($a['coach_id'] !== $U['id'] && $a['piloto_usuario'] !== $U['id'])) fallar(404, 'Ese análisis no existe.');
  return $a;
}
function analisis_salida(array $a, array $U, bool $completo): array {
  $c = jdec($a['contenido']) ?: [];
  $o = ['id' => $a['id'], 'pilotoId' => $a['piloto_id'], 'titulo' => $a['titulo'], 'pista' => $a['pista'], 'fecha' => $a['fecha'],
    'videoId' => $a['video_id'], 'duracion' => (float)$a['duracion'], 'ancho' => (int)$a['ancho'], 'alto' => (int)$a['alto'],
    'miniatura' => $a['miniatura'], 'creado' => $a['creado'], 'editado' => $a['editado'],
    'puedeEditar' => $a['coach_id'] === $U['id'],
    'nEtiquetas' => count($c['etiquetas'] ?? []), 'nAnotaciones' => count($c['anotaciones'] ?? []),
    'nBien' => count(array_filter($c['etiquetas'] ?? [], fn($e) => ($e['tipo'] ?? '') === 'bien')),
    'nMejorar' => count(array_filter($c['etiquetas'] ?? [], fn($e) => ($e['tipo'] ?? '') === 'mejorar')),
    'categoriasMejorar' => array_values(array_map(fn($e) => $e['categoria'] ?? '', array_filter($c['etiquetas'] ?? [], fn($e) => ($e['tipo'] ?? '') === 'mejorar'))),
    'conSender' => !empty($c['sender'])];
  $coach = fila('SELECT nombre FROM usuarios WHERE id = ?', [$a['coach_id']]);
  $o['coachNombre'] = $coach ? $coach['nombre'] : '';
  if ($a['piloto_id']) { $p = fila('SELECT nombre FROM pilotos WHERE id = ?', [$a['piloto_id']]); $o['pilotoNombre'] = $p ? $p['nombre'] : ''; }
  if ($completo) {
    foreach (['recorte', 'anotaciones', 'etiquetas', 'notas', 'sender'] as $k) $o[$k] = $c[$k] ?? null;
    $o['videoUrl'] = $a['video_id'] ? firmar_enlace($a['video_id']) : null;
  }
  return $o;
}
function borrar_archivo(?string $id): void {
  if (!$id) return;
  $r = ruta_archivo($id);
  if (is_file($r)) @unlink($r);
  q('DELETE FROM archivos WHERE id = ?', [$id]);
}
function borrar_analisis(string $id): void {
  $a = fila('SELECT * FROM analisis WHERE id = ?', [$id]);
  if (!$a) return;
  foreach (filas('SELECT * FROM grabaciones WHERE analisis_id = ?', [$id]) as $g) borrar_archivo($g['archivo_id']);
  q('DELETE FROM grabaciones WHERE analisis_id = ?', [$id]);
  borrar_archivo($a['video_id']);
  q('DELETE FROM analisis WHERE id = ?', [$id]);
}
function archivo_propio_completo(?string $id, array $U, string $clase): ?array {
  if (!$id) return null;
  $f = fila('SELECT * FROM archivos WHERE id = ? AND usuario_id = ?', [$id, $U['id']]);
  if (!$f || !(int)$f['completo'] || $f['clase'] !== $clase) fallar(400, 'El archivo no terminó de subir.');
  return $f;
}
function contenido_de(array $d, array $previo = []): array {
  $c = $previo;
  foreach (['recorte', 'anotaciones', 'etiquetas', 'notas', 'sender'] as $k) if (array_key_exists($k, $d)) $c[$k] = $d[$k];
  return $c;
}

if ($p0 === 'analisis' && !$p2) {
  if ($metodo === 'GET' && !$p1) {
    $piloto = $_GET['piloto'] ?? '';
    if ($esCoach) {
      $sql = 'SELECT a.*, NULL AS piloto_usuario FROM analisis a WHERE a.coach_id = ?' . ($piloto ? ' AND a.piloto_id = ?' : '') . ' ORDER BY a.fecha DESC, a.creado DESC';
      $lista = filas($sql, $piloto ? [$U['id'], $piloto] : [$U['id']]);
    } else {
      $lista = filas('SELECT a.*, p.usuario_id AS piloto_usuario FROM analisis a JOIN pilotos p ON p.id = a.piloto_id WHERE p.usuario_id = ? ORDER BY a.fecha DESC, a.creado DESC', [$U['id']]);
    }
    responder(['analisis' => array_map(fn($a) => analisis_salida($a, $U, false), $lista)]);
  }
  if ($metodo === 'GET' && $p1) responder(['analisis' => analisis_salida(analisis_visible($p1, $U), $U, true)]);
  if ($metodo === 'POST' && !$p1) {
    if (!$esCoach) fallar(403, 'Los análisis los hace el entrenador.');
    $d = leer_json();
    $pil = texto($d['pilotoId'] ?? '', 36);
    if ($pil) piloto_propio($pil, $U);
    $video = archivo_propio_completo(texto($d['videoId'] ?? '', 36), $U, 'video');
    $id = nuevo_id();
    q('INSERT INTO analisis (id, coach_id, piloto_id, titulo, pista, fecha, video_id, duracion, ancho, alto, miniatura, contenido, creado, editado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [$id, $U['id'], $pil ?: null, texto($d['titulo'] ?? 'Sin título', 160) ?: 'Sin título', texto($d['pista'] ?? '', 120), texto($d['fecha'] ?? '', 10),
       $video ? $video['id'] : null, (float)($d['duracion'] ?? 0), (int)($d['ancho'] ?? 0), (int)($d['alto'] ?? 0),
       substr((string)($d['miniatura'] ?? ''), 0, 400000), jenc(contenido_de($d)), ahora(), ahora()]);
    responder(['analisis' => analisis_salida(analisis_visible($id, $U), $U, true)], 201);
  }
  if ($metodo === 'PUT' && $p1) {
    $a = analisis_visible($p1, $U);
    if ($a['coach_id'] !== $U['id']) fallar(403, 'Sólo el entrenador puede cambiar este análisis.');
    $d = leer_json();
    $pil = array_key_exists('pilotoId', $d) ? texto($d['pilotoId'], 36) : $a['piloto_id'];
    if ($pil) piloto_propio($pil, $U);
    $c = contenido_de($d, jdec($a['contenido']) ?: []);
    q('UPDATE analisis SET piloto_id = ?, titulo = ?, pista = ?, fecha = ?, contenido = ?, editado = ? WHERE id = ?',
      [$pil ?: null, array_key_exists('titulo', $d) ? (texto($d['titulo'], 160) ?: 'Sin título') : $a['titulo'],
       array_key_exists('pista', $d) ? texto($d['pista'], 120) : $a['pista'], array_key_exists('fecha', $d) ? texto($d['fecha'], 10) : $a['fecha'],
       jenc($c), ahora(), $a['id']]);
    responder(['ok' => true, 'editado' => ahora()]);
  }
  if ($metodo === 'DELETE' && $p1) {
    $a = analisis_visible($p1, $U);
    if ($a['coach_id'] !== $U['id']) fallar(403, 'Sólo el entrenador puede borrar este análisis.');
    borrar_analisis($a['id']);
    responder(['ok' => true]);
  }
}

// ============================================================ Grabaciones de voz
if ($p0 === 'analisis' && $p1 && $p2 === 'grabaciones') {
  $a = analisis_visible($p1, $U);
  if ($metodo === 'GET') {
    $l = filas('SELECT g.*, u.nombre AS autor FROM grabaciones g JOIN usuarios u ON u.id = g.usuario_id WHERE g.analisis_id = ? ORDER BY g.creado DESC', [$a['id']]);
    responder(['grabaciones' => array_map(fn($g) => ['id' => $g['id'], 'duracion' => (float)$g['duracion'], 'creado' => $g['creado'], 'autor' => $g['autor'],
      'tipo' => (fila('SELECT tipo FROM archivos WHERE id = ?', [$g['archivo_id']]) ?? ['tipo' => ''])['tipo'],
      'url' => firmar_enlace($g['archivo_id']), 'puedeBorrar' => $g['usuario_id'] === $U['id']], $l)]);
  }
  if ($metodo === 'POST') {
    if ($a['coach_id'] !== $U['id']) fallar(403, 'Sólo el entrenador graba comentarios en este análisis.');
    $d = leer_json();
    $f = archivo_propio_completo(texto($d['archivoId'] ?? '', 36), $U, 'grabacion');
    $id = nuevo_id();
    q('INSERT INTO grabaciones (id, analisis_id, usuario_id, archivo_id, duracion, creado) VALUES (?,?,?,?,?,?)',
      [$id, $a['id'], $U['id'], $f['id'], min(600, (float)($d['duracion'] ?? 0)), ahora()]);
    responder(['ok' => true, 'id' => $id], 201);
  }
}
if ($p0 === 'grabaciones' && $p1 && $metodo === 'DELETE') {
  $g = fila('SELECT * FROM grabaciones WHERE id = ? AND usuario_id = ?', [$p1, $U['id']]);
  if (!$g) fallar(404, 'Esa grabación no existe.');
  borrar_archivo($g['archivo_id']);
  q('DELETE FROM grabaciones WHERE id = ?', [$g['id']]);
  responder(['ok' => true]);
}

// ============================================================ Archivos (subida por partes)
// POST /archivos {clase, nombre, tipo, tamano} -> {id, parte}
// PUT  /archivos/{id}?desde=N  (cuerpo = bytes de la parte) -> {recibido, completo}
const CLASES = ['video' => 'video_max_mb', 'grabacion' => 300, 'bajada' => 200];
const PARTE = 2 * 1024 * 1024;
if ($p0 === 'archivos') {
  if ($metodo === 'POST' && !$p1) {
    $d = leer_json();
    $clase = $d['clase'] ?? '';
    if (!isset(CLASES[$clase])) fallar(400, 'Tipo de archivo no permitido.');
    $maxMb = is_int(CLASES[$clase]) ? CLASES[$clase] : (int)(config()[CLASES[$clase]] ?? 1024);
    $tam = (int)($d['tamano'] ?? 0);
    $tipo = texto($d['tipo'] ?? 'application/octet-stream', 100) ?: 'application/octet-stream';
    if ($tam <= 0) fallar(400, 'El archivo está vacío.');
    if ($tam > $maxMb * 1024 * 1024) fallar(413, "El archivo supera el máximo de $maxMb MB.");
    if (in_array($clase, ['video', 'grabacion'], true) && !preg_match('#^(video|audio)/#', $tipo)) fallar(400, 'Ese archivo no es un video.');
    $id = nuevo_id();
    file_put_contents(ruta_archivo($id), '');
    q('INSERT INTO archivos (id, usuario_id, clase, nombre, tipo, tamano, recibido, completo, creado) VALUES (?,?,?,?,?,?,0,0,?)',
      [$id, $U['id'], $clase, texto($d['nombre'] ?? 'archivo', 200), $tipo, $tam, ahora()]);
    responder(['id' => $id, 'parte' => PARTE], 201);
  }
  if ($metodo === 'PUT' && $p1) {
    $f = fila('SELECT * FROM archivos WHERE id = ? AND usuario_id = ?', [$p1, $U['id']]);
    if (!$f) fallar(404, 'Ese archivo no existe.');
    if ((int)$f['completo']) responder(['recibido' => (int)$f['tamano'], 'completo' => true]);
    $desde = (int)($_GET['desde'] ?? -1);
    $recibido = (int)$f['recibido'];
    if ($desde !== $recibido) responder(['recibido' => $recibido, 'completo' => false, 'reintentar' => true], 409);
    $datos = file_get_contents('php://input');
    $n = strlen((string)$datos);
    if ($n === 0 || $n > PARTE + 1024) fallar(400, 'Parte inválida.');
    if ($recibido + $n > (int)$f['tamano']) fallar(400, 'El archivo es más grande de lo anunciado.');
    $fh = fopen(ruta_archivo($f['id']), 'ab');
    if (!$fh || fwrite($fh, $datos) !== $n) fallar(500, 'No se pudo guardar el archivo en el servidor (¿espacio?).');
    fclose($fh);
    $recibido += $n;
    $completo = $recibido === (int)$f['tamano'];
    q('UPDATE archivos SET recibido = ?, completo = ? WHERE id = ?', [$recibido, $completo ? 1 : 0, $f['id']]);
    responder(['recibido' => $recibido, 'completo' => $completo]);
  }
  if ($metodo === 'DELETE' && $p1) {
    $f = fila('SELECT * FROM archivos WHERE id = ? AND usuario_id = ?', [$p1, $U['id']]);
    if ($f && !(int)$f['completo']) borrar_archivo($f['id']);
    responder(['ok' => true]);
  }
}

// ============================================================ Perfiles de SendFlow
function perfil_salida(array $p): array {
  return ['id' => $p['id'], 'nombre' => $p['nombre'], 'datos' => jdec($p['datos']), 'fecha' => $p['fecha'], 'editado' => $p['editado']];
}
if ($p0 === 'perfiles') {
  if ($metodo === 'GET') {
    $propios = array_map(fn($p) => perfil_salida($p) + ['propietario' => $U['nombre'], 'propio' => true],
      filas('SELECT * FROM perfiles WHERE usuario_id = ? ORDER BY nombre', [$U['id']]));
    if (($_GET['incluir'] ?? '') === 'pilotos' && $esCoach) {
      $otros = filas('SELECT pf.*, u.nombre AS propietario FROM perfiles pf JOIN usuarios u ON u.id = pf.usuario_id
        WHERE pf.usuario_id IN (SELECT usuario_id FROM pilotos WHERE coach_id = ? AND usuario_id IS NOT NULL) ORDER BY u.nombre, pf.nombre', [$U['id']]);
      foreach ($otros as $o) $propios[] = perfil_salida($o) + ['propietario' => $o['propietario'], 'propio' => false];
    }
    responder(['perfiles' => $propios]);
  }
  // PUT /perfiles {perfiles:[{nombre, datos, fecha}]}: agrega o reemplaza por nombre
  if ($metodo === 'PUT' && !$p1) {
    $d = leer_json();
    $lista = $d['perfiles'] ?? null;
    if (!is_array($lista) || count($lista) > 200) fallar(400, 'Lista de perfiles inválida.');
    $n = 0;
    foreach ($lista as $p) {
      $nombre = texto($p['nombre'] ?? '', 160);
      if ($nombre === '' || !is_array($p['datos'] ?? null)) continue;
      $json = jenc($p['datos']);
      if (strlen($json) > 3000000) continue; // foto demasiado grande
      $ya = fila('SELECT id FROM perfiles WHERE usuario_id = ? AND nombre = ?', [$U['id'], $nombre]);
      if ($ya) q('UPDATE perfiles SET datos = ?, fecha = ?, editado = ? WHERE id = ?', [$json, texto($p['fecha'] ?? '', 25), ahora(), $ya['id']]);
      else q('INSERT INTO perfiles (id, usuario_id, nombre, datos, fecha, editado) VALUES (?,?,?,?,?,?)', [nuevo_id(), $U['id'], $nombre, $json, texto($p['fecha'] ?? '', 25), ahora()]);
      $n++;
    }
    responder(['ok' => true, 'guardados' => $n]);
  }
  if ($metodo === 'DELETE' && $p1) {
    q('DELETE FROM perfiles WHERE id = ? AND usuario_id = ?', [$p1, $U['id']]);
    responder(['ok' => true]);
  }
}

// ============================================================ Bajadas del Sender
function bajada_visible(string $id, array $U): array {
  $b = fila('SELECT b.*, u.nombre AS propietario FROM bajadas b JOIN usuarios u ON u.id = b.usuario_id WHERE b.id = ?', [$id]);
  if (!$b) fallar(404, 'Esa bajada no existe.');
  if ($b['usuario_id'] !== $U['id'] && !fila('SELECT id FROM pilotos WHERE coach_id = ? AND usuario_id = ?', [$U['id'], $b['usuario_id']])) fallar(404, 'Esa bajada no existe.');
  return $b;
}
function bajada_salida(array $b, array $U): array {
  $f = fila('SELECT nombre, tamano FROM archivos WHERE id = ?', [$b['archivo_id']]);
  return ['id' => $b['id'], 'nombre' => $b['nombre'], 'fecha' => $b['fecha'], 'pista' => $b['pista'], 'resumen' => jdec($b['resumen']),
    'origen' => $b['origen'], 'creado' => $b['creado'], 'propietario' => $b['propietario'] ?? '', 'propia' => $b['usuario_id'] === $U['id'],
    'archivo' => $f ? $f['nombre'] : '', 'tamano' => $f ? (int)$f['tamano'] : 0];
}
if ($p0 === 'bajadas') {
  if ($metodo === 'GET' && !$p1) {
    $l = filas('SELECT b.*, u.nombre AS propietario FROM bajadas b JOIN usuarios u ON u.id = b.usuario_id
      WHERE b.usuario_id = ? OR b.usuario_id IN (SELECT usuario_id FROM pilotos WHERE coach_id = ? AND usuario_id IS NOT NULL)
      ORDER BY b.fecha DESC, b.creado DESC', [$U['id'], $U['id']]);
    responder(['bajadas' => array_map(fn($b) => bajada_salida($b, $U), $l)]);
  }
  if ($metodo === 'GET' && $p1) {
    $b = bajada_visible($p1, $U);
    responder(['bajada' => bajada_salida($b, $U) + ['url' => firmar_enlace($b['archivo_id'], 3600)]]);
  }
  if ($metodo === 'POST' && !$p1) {
    $d = leer_json();
    $f = archivo_propio_completo(texto($d['archivoId'] ?? '', 36), $U, 'bajada');
    $id = nuevo_id();
    $resumen = is_array($d['resumen'] ?? null) ? $d['resumen'] : (object)[];
    q('INSERT INTO bajadas (id, usuario_id, archivo_id, nombre, fecha, pista, resumen, origen, creado) VALUES (?,?,?,?,?,?,?,?,?)',
      [$id, $U['id'], $f['id'], texto($d['nombre'] ?? $f['nombre'], 200) ?: $f['nombre'], texto($d['fecha'] ?? '', 25), texto($d['pista'] ?? '', 120),
       jenc($resumen), in_array($d['origen'] ?? '', ['sendflow', 'archivo'], true) ? $d['origen'] : 'archivo', ahora()]);
    responder(['bajada' => bajada_salida(bajada_visible($id, $U), $U)], 201);
  }
  if ($metodo === 'DELETE' && $p1) {
    $b = fila('SELECT * FROM bajadas WHERE id = ? AND usuario_id = ?', [$p1, $U['id']]);
    if (!$b) fallar(404, 'Esa bajada no existe o no es tuya.');
    borrar_archivo($b['archivo_id']);
    q('DELETE FROM bajadas WHERE id = ?', [$b['id']]);
    responder(['ok' => true]);
  }
}

fallar(404, 'Ruta desconocida.');
