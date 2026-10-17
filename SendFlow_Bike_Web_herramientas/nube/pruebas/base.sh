#!/bin/bash
# Levanta un Postgres local con imitaciones mínimas de Supabase y corre coach_v3..v7 + el escenario de v5.
PGB=/usr/lib/postgresql/16/bin; D=/var/tmp/pgsf; N=/mnt/user-data/uploads/telemetry/SendFlow_Bike_Web_herramientas/nube; H=/home/claude/nube
su postgres -c "$PGB/pg_ctl -D $D/data stop -m fast" >/dev/null 2>&1
rm -rf $D; mkdir -p $D; chown postgres:postgres $D
su postgres -c "$PGB/initdb -D $D/data -A trust >/dev/null && $PGB/pg_ctl -D $D/data -o '-p 5499 -k $D' -l $D/log start >/dev/null" && sleep 2
P="psql -h $D -p 5499 -U postgres -q -v ON_ERROR_STOP=1"
$P -f $H/pruebas/stub.sql && $P -f $N/coach_v3.sql >/dev/null && $P -f $N/coach_v4.sql >/dev/null && \
for v in 5 6 7 8 9 10 11 12 13 14; do $P -f $H/coach_v$v.sql >/dev/null 2>&1 || { echo "FALLA coach_v$v"; exit 1; }; done && \
$P -f $H/pruebas/esc.sql >/dev/null 2>&1 && echo "base lista (v3..v14 + escenario v5)"
