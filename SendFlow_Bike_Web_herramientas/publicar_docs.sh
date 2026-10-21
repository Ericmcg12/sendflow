#!/usr/bin/env bash
# Arma la rama de descarga deploy-docs (documentación para copiar a Obsidian): bash publicar_docs.sh ["mensaje"]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
ACT=$(git rev-parse --abbrev-ref HEAD); MSG="${1:-Documentación $(date +%d/%m/%Y)}"
git worktree prune; rm -rf /tmp/wt_docs
git worktree add -q --detach /tmp/wt_docs HEAD
( cd /tmp/wt_docs && git checkout -q --orphan deploy-docs && git rm -rq --cached . && find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} + \
  && mkdir SendFlow_docs && cp "$OLDPWD"/SendFlow_docs/final/*.md SendFlow_docs/ && cp "$OLDPWD"/SendFlow_docs/00_MAPA.md SendFlow_docs/ \
  && cp "$OLDPWD"/SendFlow_Bike_Web_herramientas/CAMBIOS_WEB_VS_APP.md SendFlow_docs/08_CAMBIOS_WEB_VS_APP.md \
  && cp "$OLDPWD"/SendFlow_Bike_Web_herramientas/coach-web/LEEME_COACH.md SendFlow_docs/09_LEEME_COACH.md \
  && git add -A && git commit -qm "$MSG" && git push -q -f origin deploy-docs && echo "Publicado en deploy-docs" )
git worktree remove --force /tmp/wt_docs; git branch -D deploy-docs -q 2>/dev/null || true; git checkout -q "$ACT"
git ls-remote origin deploy-docs | cut -c1-10
