<?php
// ============================================================================
// base.php — conexión, esquema, respuestas, sesiones y firma de enlaces.
// Servidor de SendFlow Coach: PHP 8 + PDO (MySQL en el hosting, SQLite para
// probar). Sin librerías externas: se sube por FTP / administrador de archivos.
// ============================================================================
declare(strict_types=1);

const VERSION_API = 1;

function config(): array {
  static $c = null;
  if ($c === null) {
    $ruta = __DIR__ . '/../config.php';
    if (!is_file($ruta)) fallar(500, 'Falta config.php en la carpeta api (copiá config.ejemplo.php y completalo).');
    $c = require $ruta;
  }
  return $c;
}

// ---------------------------------------------------------------- Respuestas
function cabeceras_cors(): void {
  $o = config()['cors'] ?? '*';
  header('Access-Control-Allow-Origin: ' . $o);
  header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Coach-Parte');
  header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
  header('Access-Control-Max-Age: 86400');
}
function responder($datos, int $codigo = 200): void {
  http_response_code($codigo);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fallar(int $codigo, string $mensaje): void { responder(['error' => $mensaje], $codigo); }

function leer_json(): array {
  $t = file_get_contents('php://input');
  if ($t === '' || $t === false) return [];
  $d = json_decode($t, true);
  if (!is_array($d)) fallar(400, 'El pedido no es un JSON válido.');
  return $d;
}
function texto($v, int $max = 200): string {
  $s = trim((string)($v ?? ''));
  return mb_substr($s, 0, $max);
}
function nuevo_id(): string {
  $b = random_bytes(16);
  $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
  $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
function ahora(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

// ---------------------------------------------------------------- Base de datos
function bd(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $c = config()['db'];
  try {
    if (($c['driver'] ?? 'mysql') === 'sqlite') {
      $dir = dirname($c['sqlite']);
      if (!is_dir($dir)) mkdir($dir, 0775, true);
      $pdo = new PDO('sqlite:' . $c['sqlite']);
      $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    } else {
      $pdo = new PDO("mysql:host={$c['host']};dbname={$c['nombre']};charset=utf8mb4", $c['usuario'], $c['clave']);
    }
  } catch (Throwable $e) {
    fallar(500, 'No se pudo conectar a la base de datos. Revisá config.php.');
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  crear_esquema($pdo);
  return $pdo;
}
function es_sqlite(): bool { return (config()['db']['driver'] ?? 'mysql') === 'sqlite'; }

// Crea las tablas la primera vez (y las que falten en versiones nuevas).
const VERSION_ESQUEMA = 1;
function crear_esquema(PDO $pdo): void {
  $motor0 = es_sqlite() ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
  $pdo->exec("CREATE TABLE IF NOT EXISTS meta (clave VARCHAR(40) NOT NULL PRIMARY KEY, valor VARCHAR(200) NOT NULL)$motor0");
  $v = $pdo->query("SELECT valor FROM meta WHERE clave = 'esquema'")->fetchColumn();
  if ((int)$v >= VERSION_ESQUEMA) return;
  $id = 'VARCHAR(36) NOT NULL';
  $largo = es_sqlite() ? 'TEXT' : 'LONGTEXT';
  $motor = es_sqlite() ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
  $tablas = [
    "usuarios (id $id PRIMARY KEY, email VARCHAR(190) NOT NULL UNIQUE, nombre VARCHAR(120) NOT NULL,
      clave_hash VARCHAR(255) NOT NULL, modo VARCHAR(10) NOT NULL DEFAULT 'coach', datos_piloto $largo,
      creado VARCHAR(25) NOT NULL)",
    "sesiones (token_hash VARCHAR(64) NOT NULL PRIMARY KEY, usuario_id $id, cliente VARCHAR(20) NOT NULL,
      creado VARCHAR(25) NOT NULL, vence VARCHAR(25) NOT NULL)",
    "intentos (clave VARCHAR(190) NOT NULL PRIMARY KEY, cantidad INT NOT NULL, desde VARCHAR(25) NOT NULL)",
    "pilotos (id $id PRIMARY KEY, coach_id $id, usuario_id VARCHAR(36) NULL, email VARCHAR(190) NULL,
      nombre VARCHAR(120) NOT NULL, datos $largo, creado VARCHAR(25) NOT NULL)",
    "analisis (id $id PRIMARY KEY, coach_id $id, piloto_id VARCHAR(36) NULL, titulo VARCHAR(160) NOT NULL,
      pista VARCHAR(120) NULL, fecha VARCHAR(10) NULL, video_id VARCHAR(36) NULL, duracion DOUBLE NULL,
      ancho INT NULL, alto INT NULL, miniatura $largo, contenido $largo, creado VARCHAR(25) NOT NULL, editado VARCHAR(25) NOT NULL)",
    "archivos (id $id PRIMARY KEY, usuario_id $id, clase VARCHAR(20) NOT NULL, nombre VARCHAR(200) NOT NULL,
      tipo VARCHAR(100) NOT NULL, tamano BIGINT NOT NULL, recibido BIGINT NOT NULL DEFAULT 0, completo INT NOT NULL DEFAULT 0,
      creado VARCHAR(25) NOT NULL)",
    "grabaciones (id $id PRIMARY KEY, analisis_id $id, usuario_id $id, archivo_id $id, duracion DOUBLE NOT NULL,
      creado VARCHAR(25) NOT NULL)",
    "perfiles (id $id PRIMARY KEY, usuario_id $id, nombre VARCHAR(160) NOT NULL, datos $largo, fecha VARCHAR(25) NULL,
      editado VARCHAR(25) NOT NULL)",
    "bajadas (id $id PRIMARY KEY, usuario_id $id, archivo_id $id, nombre VARCHAR(200) NOT NULL, fecha VARCHAR(25) NULL,
      pista VARCHAR(120) NULL, resumen $largo, origen VARCHAR(20) NOT NULL, creado VARCHAR(25) NOT NULL)",
  ];
  foreach ($tablas as $t) $pdo->exec("CREATE TABLE IF NOT EXISTS $t$motor");
  $indices = [
    'ix_pil_coach' => 'pilotos (coach_id)', 'ix_pil_usuario' => 'pilotos (usuario_id)', 'ix_pil_email' => 'pilotos (email)',
    'ix_ana_coach' => 'analisis (coach_id)', 'ix_ana_piloto' => 'analisis (piloto_id)',
    'ix_gra_ana' => 'grabaciones (analisis_id)', 'ix_per_usu' => 'perfiles (usuario_id)', 'ix_baj_usu' => 'bajadas (usuario_id)',
    'ix_ses_usu' => 'sesiones (usuario_id)',
  ];
  foreach ($indices as $n => $d) {
    try { $pdo->exec(es_sqlite() ? "CREATE INDEX IF NOT EXISTS $n ON $d" : "CREATE INDEX $n ON $d"); }
    catch (Throwable $e) { /* MySQL: ya existe */ }
  }
  $pdo->prepare($v === false ? "INSERT INTO meta (clave, valor) VALUES ('esquema', ?)" : "UPDATE meta SET valor = ? WHERE clave = 'esquema'")->execute([(string)VERSION_ESQUEMA]);
}

function q(string $sql, array $p = []): PDOStatement {
  $s = bd()->prepare($sql);
  $s->execute($p);
  return $s;
}
function fila(string $sql, array $p = []): ?array { $r = q($sql, $p)->fetch(); return $r ?: null; }
function filas(string $sql, array $p = []): array { return q($sql, $p)->fetchAll(); }
function jdec(?string $s) { if ($s === null || $s === '') return null; return json_decode($s, true); }
function jenc($v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }

// ---------------------------------------------------------------- Sesiones
function token_del_pedido(): ?string {
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if (!$h && function_exists('apache_request_headers')) {
    foreach (apache_request_headers() as $k => $v) if (strtolower($k) === 'authorization') $h = $v;
  }
  if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim($h), $m)) return strtolower($m[1]);
  return null;
}
function crear_sesion(string $usuarioId, string $cliente): string {
  $token = bin2hex(random_bytes(32));
  $dias = (int)(config()['sesion_dias'] ?? 60);
  q('INSERT INTO sesiones (token_hash, usuario_id, cliente, creado, vence) VALUES (?,?,?,?,?)',
    [hash('sha256', $token), $usuarioId, $cliente, ahora(), gmdate('Y-m-d\TH:i:s\Z', time() + $dias * 86400)]);
  return $token;
}
function usuario_actual(bool $obligatorio = true): ?array {
  static $u = false;
  if ($u !== false) return $u;
  $t = token_del_pedido();
  $u = null;
  if ($t) {
    $u = fila('SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.vence > ?', [hash('sha256', $t), ahora()]);
  }
  if (!$u && $obligatorio) fallar(401, 'Tenés que ingresar de nuevo.');
  return $u;
}
function usuario_publico(array $u): array {
  return ['id' => $u['id'], 'email' => $u['email'], 'nombre' => $u['nombre'], 'modo' => $u['modo'],
    'piloto' => jdec($u['datos_piloto']) ?: (object)[]];
}

// Límite de intentos de ingreso: 8 por email cada 15 minutos.
function controlar_intentos(string $clave, bool $fallo): void {
  $r = fila('SELECT * FROM intentos WHERE clave = ?', [$clave]);
  $limite = time() - 15 * 60;
  if ($r && strtotime($r['desde']) < $limite) { q('DELETE FROM intentos WHERE clave = ?', [$clave]); $r = null; }
  if (!$fallo) { if ($r && (int)$r['cantidad'] >= 8) fallar(429, 'Demasiados intentos. Esperá unos minutos.'); return; }
  if ($r) q('UPDATE intentos SET cantidad = cantidad + 1 WHERE clave = ?', [$clave]);
  else q('INSERT INTO intentos (clave, cantidad, desde) VALUES (?,?,?)', [$clave, 1, ahora()]);
}

// ---------------------------------------------------------------- Archivos
function dir_datos(): string {
  $d = rtrim(config()['datos_dir'], '/\\');
  if (!is_dir($d)) mkdir($d, 0775, true);
  // Bloqueo de acceso directo por si la carpeta quedó dentro de la web
  if (!is_file("$d/.htaccess")) @file_put_contents("$d/.htaccess", "Require all denied\nDeny from all\n");
  if (!is_file("$d/web.config")) @file_put_contents("$d/web.config", '<?xml version="1.0"?><configuration><system.webServer><authorization><deny users="*" /></authorization></system.webServer></configuration>');
  return $d;
}
function ruta_archivo(string $id): string {
  if (!preg_match('/^[a-f0-9-]{36}$/', $id)) fallar(400, 'Archivo inválido.');
  $sub = dir_datos() . '/' . substr($id, 0, 2);
  if (!is_dir($sub)) mkdir($sub, 0775, true);
  return "$sub/$id.bin";
}
function firmar_enlace(string $archivoId, int $segundos = 6 * 3600): string {
  $vence = time() + $segundos;
  $firma = hash_hmac('sha256', "$archivoId|$vence", config()['secreto']);
  return "archivo.php?id=$archivoId&v=$vence&f=$firma";
}
