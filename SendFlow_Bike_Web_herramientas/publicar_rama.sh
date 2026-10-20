#!/usr/bin/env bash
# Publica una carpeta en su rama de descarga: bash publicar_rama.sh bike|coach ["mensaje del commit"]
# bike  -> SendFlow_Bike_Web   -> rama deploy-bike-web
# coach -> SendFlow_Coach_Web  -> rama deploy-coach-web   (corre antes verificar_coach.py)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
case "${1:-}" in bike) CARPETA=SendFlow_Bike_Web; RAMA=deploy-bike-web;; coach) CARPETA=SendFlow_Coach_Web; RAMA=deploy-coach-web
  python3 SendFlow_Bike_Web_herramientas/coach-web/verificar_coach.py;; *) echo "uso: $0 bike|coach [mensaje]"; exit 1;; esac
MSG="${2:-Actualización $(date +%d/%m/%Y)}"
ACTUAL=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin "+refs/heads/$RAMA:refs/remotes/origin/$RAMA"
git worktree prune; rm -rf /tmp/wt_publicar; git branch -D "$RAMA" -q 2>/dev/null || true
git worktree add -q -B "$RAMA" /tmp/wt_publicar "origin/$RAMA"
( cd /tmp/wt_publicar && find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} + && cp -a "$OLDPWD/$CARPETA/." . \
  && git add -A && { git diff --cached --quiet && echo "Sin cambios para publicar." || { git commit -qm "$MSG" && git push -q origin "$RAMA" && echo "Publicado en $RAMA"; }; } )
git worktree remove --force /tmp/wt_publicar; git branch -D "$RAMA" -q; git checkout -q "$ACTUAL"
git ls-remote origin "$RAMA" | cut -c1-10
