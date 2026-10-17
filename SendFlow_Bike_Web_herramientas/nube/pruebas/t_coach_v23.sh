#!/bin/bash
# Pruebas de coach_v23.sql (entrenadores libres + bienvenida).
# Base: la simple de perfiles (por defecto) o la del esquema v0 completo: PGDIR=/var/tmp/pg_ciclo PGPORT=5521 ./t_coach_v23.sh
D=${PGDIR:-/var/tmp/pgsf}; PORT=${PGPORT:-5499}; P="psql -h $D -p $PORT -U postgres -At -q"
C=00000000-0000-0000-0000-00000000000c; A=00000000-0000-0000-0000-00000000000a; E=00000000-0000-0000-0000-0000000000ee
B=00000000-0000-0000-0000-0000000000b1; D2=00000000-0000-0000-0000-0000000000d2; S=00000000-0000-0000-0000-0000000000f3
usuario() {  # id email nombre [rol] [producto...]
  local id=$1 em=$2 nom=$3 rol=$4; shift 4
  $P -c "insert into auth.users (id,email) values ('$id','$em') on conflict do nothing;
    insert into perfiles_usuario (id,nombre) values ('$id','$nom') on conflict (id) do update set nombre = excluded.nombre;
    update perfiles_usuario set aprobado = true where id = '$id';" >/dev/null
  [ -n "$rol" ] && $P -c "insert into roles_usuario (usuario_id,rol) select '$id','$rol' where not exists (select 1 from roles_usuario where usuario_id='$id' and rol::text='$rol')" >/dev/null
  for pr in "$@"; do $P -c "insert into accesos (usuario_id,producto) select '$id','$pr' where not exists (select 1 from accesos where usuario_id='$id' and producto='$pr')" >/dev/null; done
}
usuario $C coach@x.com Martín entrenador coach; usuario $A piloto@x.com Eric "" sender; usuario $E otro@x.com Intruso ""
usuario $B nuevo@x.com Bruno "" sender; usuario $D2 coach2@x.com Laura entrenador coach; usuario $S sincoach@x.com "Sin Coach" entrenador
como() { $P -c "set role authenticated; set sf.uid='$1'; $2" 2>&1 | sed 's/^ERROR:  /ERROR: /'; }
ok=0; mal=0
chk() { if echo "$2" | grep -q -- "$3"; then ok=$((ok+1)); else mal=$((mal+1)); echo "FALLA: $1 -> $2"; fi; }
chk "piloto no puede publicarse" "$(como $B "select coach_publico_guardar('{\"visible\":true,\"presentacion\":\"x\"}')")" "entrenadores con la suscripción"
chk "visible sin presentación" "$(como $D2 "select coach_publico_guardar('{\"visible\":true}')")" "presentación corta"
chk "modalidad inválida" "$(como $D2 "select coach_publico_guardar('{\"visible\":true,\"presentacion\":\"Hola\",\"modalidad\":\"<b>\"}')")" "Modalidad inválida"
chk "guardar" "$(como $D2 "select coach_publico_guardar('{\"visible\":true,\"presentacion\":\"DH y enduro en Mendoza\",\"zona\":\"Mendoza\",\"modalidad\":\"Presencial\",\"disciplinas\":\"DH, Enduro\"}')")" '"visible": true'
chk "sin coach activo no se publica (no aparece)" "$(como $S "select 1" ; $P -c "insert into coach_publico (coach_id,visible,presentacion) values ('$S',true,'x') on conflict do nothing"; como $B "select entrenadores_disponibles()")" 'Laura'
chk "sin coach activo no aparece" "$(como $B "select entrenadores_disponibles()::text not like '%Sin Coach%'")" 't'
chk "uno mismo no aparece" "$(como $D2 "select jsonb_array_length(entrenadores_disponibles()->'entrenadores')")" '^0$'
chk "sin Sender no pide" "$(como $E "select solicitud_entrenador_crear('$D2','hola')")" "Sender activo"
chk "a uno no visible no" "$(como $B "select solicitud_entrenador_crear('$C','hola')")" "ya no está disponible"
SID=$(como $B "select solicitud_entrenador_crear('$D2', E'Hola\x01 quiero entrenar')->>'id'")
chk "crear" "$SID" '^[0-9a-f-]\{36\}$'
chk "control limpio" "$($P -c "select mensaje from coach_solicitudes where id='$SID'")" '^Hola quiero entrenar$'
chk "duplicada" "$(como $B "select solicitud_entrenador_crear('$D2','otra')")" "Ya le mandaste"
chk "lista marca pendiente" "$(como $B "select entrenadores_disponibles()->'entrenadores'->0->'solicitud'->>'estado'")" "pendiente"
chk "otro coach no ve" "$(como $C "select jsonb_array_length(coach_solicitudes_listar()->'solicitudes')")" '^0$'
chk "coach ve sin email" "$(como $D2 "select coach_solicitudes_listar()::text")" 'Bruno'
chk "coach ve sin email 2" "$(como $D2 "select coach_solicitudes_listar()::text not like '%nuevo@x.com%'")" 't'
chk "piloto no responde" "$(como $B "select coach_solicitud_responder('$SID', true)")" "entrenadores con la suscripción"
chk "otro coach no responde" "$(como $C "select coach_solicitud_responder('$SID', true)")" "ya no está pendiente"
chk "aviso solo service_role" "$(como $B "select aviso_solicitud_preparar('$B','$SID','solicitud')")" "permission denied"
chk "aviso solicitud" "$($P -c "select aviso_solicitud_preparar('$B','$SID','solicitud')->>'email'")" "coach2@x.com"
chk "aviso una vez" "$($P -c "select aviso_solicitud_preparar('$B','$SID','solicitud')->>'motivo'")" "reciente"
# vínculo viejo cortado (del «Quitar» anterior): se reemplaza
$P -c "insert into vinculos (piloto_id,profesional_id,tipo,estado,cortado_en) values ('$B','$D2','piloto_entrenador','cortado',now())"
chk "aceptar" "$(como $D2 "select coach_solicitud_responder('$SID', true)->>'estado'")" "aceptada"
chk "vínculo activo único" "$($P -c "select string_agg(estado::text,',') from vinculos where piloto_id='$B' and profesional_id='$D2'")" '^activo$'
chk "ficha creada con email" "$($P -c "select email||'|'||nombre from coach_pilotos where coach_id='$D2'")" "nuevo@x.com|Bruno"
chk "ficha vinculada" "$(como $D2 "select (coach_pilotos_listar()->'pilotos'->0->>'vinculado')")" "true"
chk "aviso respuesta" "$($P -c "select aviso_solicitud_preparar('$D2','$SID','solicitud_respuesta')->>'aceptada'")" "true"
chk "ya entrena" "$(como $B "select solicitud_entrenador_crear('$D2','x')")" "Ya entrenás"
chk "esMio" "$(como $B "select entrenadores_disponibles()->'entrenadores'->0->>'esMio'")" "true"
chk "mis solicitudes" "$(como $B "select mis_solicitudes_entrenador()->'solicitudes'->0->>'estado'")" "aceptada"
# rechazo y espera de 30 días
$P -c "delete from vinculos where piloto_id='$B'; delete from coach_solicitudes;"
SID2=$(como $B "select solicitud_entrenador_crear('$D2','x')->>'id'")
chk "rechazar" "$(como $D2 "select coach_solicitud_responder('$SID2', false)->>'estado'")" "rechazada"
chk "sin vínculo tras rechazo" "$($P -c "select count(*) from vinculos where piloto_id='$B'")" '^0$'
chk "espera 30 días" "$(como $B "select solicitud_entrenador_crear('$D2','x')")" "dentro de un mes"
$P -c "update coach_solicitudes set resuelta_en = now() - interval '31 days'"
SID3=$(como $B "select solicitud_entrenador_crear('$D2','x')->>'id'")
chk "después de 30 días" "$SID3" '^[0-9a-f-]\{36\}$'
chk "cancelar ajena" "$(como $E "select solicitud_entrenador_cancelar('$SID3')")" "ya no está pendiente"
chk "cancelar" "$(como $B "select solicitud_entrenador_cancelar('$SID3')->>'ok'")" "true"
chk "responder cancelada" "$(como $D2 "select coach_solicitud_responder('$SID3', true)")" "ya no está pendiente"
chk "re-pedir tras cancelar" "$(como $B "select solicitud_entrenador_crear('$D2','x')")" "mañana"
$P -c "update coach_solicitudes set resuelta_en = now() - interval '2 days', creada_en = now() - interval '2 days' where estado = 'cancelada'"
# tope de 3 pendientes
for i in 1 2 3 4; do X=$(cat /proc/sys/kernel/random/uuid); usuario $X c$i@x.com C$i entrenador coach; $P -c "insert into coach_publico (coach_id,visible,presentacion) values ('$X',true,'p')"; R=$(como $B "select solicitud_entrenador_crear('$X','')"); done
chk "tope 3" "$R" "3 solicitudes"
$P -c "update coach_solicitudes set estado='cancelada', resuelta_en=now() where piloto_id='$B' and estado='pendiente'; insert into coach_solicitudes (piloto_id, coach_id, estado, resuelta_en) select '$B', coach_id, 'cancelada', now() - interval '2 days' from coach_publico where coach_id <> '$D2' limit 1;"
for i in $(seq 1 7); do $P -c "insert into coach_solicitudes (piloto_id, coach_id, estado, creada_en, resuelta_en) values ('$B','$C','rechazada', now() - interval '1 hour', now() - interval '40 days')" >/dev/null; done
chk "tope diario" "$(como $B "select solicitud_entrenador_crear('$D2','x')")" "muchas solicitudes"
# bienvenida
chk "bienvenida nueva" "$(como $B "select bienvenida_estado()->>'mostrar'")" "true"
chk "bienvenida coach" "$(como $D2 "select bienvenida_estado()->>'esEntrenador'")" "true"
como $B "select bienvenida_lista()" >/dev/null
chk "bienvenida vista" "$(como $B "select bienvenida_estado()->>'mostrar'")" "false"
chk "perfil conserva la marca" "$(como $B "select perfiles_piloto_guardar('{\"peso\":\"70\"}')" >/dev/null; $P -c "select datos_piloto ? 'bienvenida' from perfiles_usuario where id='$B'")" "t"
chk "anon no llama" "$($P -c "set role anon; select entrenadores_disponibles()" 2>&1)" "permission denied"
echo "coach_v23: $ok bien, $mal mal"
# cerrar la cuenta borra sus solicitudes y su ficha pública (cascada desde perfiles_usuario)
# (ciclo_purgar_cuenta termina con «delete from perfiles_usuario»; la base de prueba no tiene todas sus tablas)
$P -c "select public.ciclo_purgar_cuenta('$D2','prueba')" >/dev/null 2>&1 || { echo "(sin ciclo_purgar_cuenta completo en esta base: se borra el perfil)"; $P -c "delete from perfiles_usuario where id='$D2'" >/dev/null 2>&1; }
chk "purga coach: ficha pública" "$($P -c "select count(*) from coach_publico where coach_id='$D2'")" '^0$'
chk "purga coach: solicitudes" "$($P -c "select count(*) from coach_solicitudes where coach_id='$D2'")" '^0$'
echo "coach_v23 (con purga): $ok bien, $mal mal"
