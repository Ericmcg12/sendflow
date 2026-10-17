#!/bin/bash
# Postgres local con imitaciones mínimas de Supabase + coach_v3..v19 + perfiles_v1.
PGB=/usr/lib/postgresql/16/bin; D=/var/tmp/pgsf; N=/mnt/user-data/uploads/telemetry/SendFlow_Bike_Web_herramientas/nube; H=/home/claude/nube
su postgres -c "$PGB/pg_ctl -D $D/data stop -m fast" >/dev/null 2>&1
rm -rf $D; mkdir -p $D; chown postgres:postgres $D
su postgres -c "$PGB/initdb -D $D/data -A trust >/dev/null && $PGB/pg_ctl -D $D/data -o '-p 5499 -k $D' -l $D/log start >/dev/null" && sleep 2
P="psql -h $D -p 5499 -U postgres -q -v ON_ERROR_STOP=1"
$P -f $H/pruebas/stub.sql || exit 1
for v in 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19; do $P -f $N/coach_v$v.sql >/tmp/claude-0/sql_$v.log 2>&1 || { echo "FALLA coach_v$v"; tail -5 /tmp/claude-0/sql_$v.log; exit 1; }; done
$P -f $H/perfiles_v1.sql || { echo "FALLA perfiles_v1"; exit 1; }
$P -f $H/perfiles_v1.sql || { echo "FALLA perfiles_v1 (2da vez)"; exit 1; }
echo "base lista (coach v3..v19 + perfiles_v1 x2)"
