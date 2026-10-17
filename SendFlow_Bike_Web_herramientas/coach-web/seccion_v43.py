
# v43 (15/10/2026): bicis y set-ups del piloto en su ficha (perfiles_v1.sql). Si el piloto dio permiso, el entrenador crea y
# edita set-ups y resuelve los set-ups propuestos por la app. Sin perfiles_v1.sql no se muestra nada nuevo.
shutil.copy("piezas/bicis-piloto.js", f"{OUT}/js/bicis-piloto.js")
parchar(f"{OUT}/index.html", [
 ('<script src="js/app.js"></script>', '<script src="js/bicis-piloto.js"></script>\n<script src="js/app.js"></script>'),
])
parchar(f"{OUT}/js/app.js", [
 ('''        cont.appendChild(html(`<div><div class="titulo-seccion">Perfiles de SendFlow de ${esc(p.nombre)}</div><div class="grilla g3">${r.perfiles.map(tarjetaPerfil).join("")}</div></div>`));
      }
    }''', '''        cont.appendChild(html(`<div><div class="titulo-seccion">Perfiles de SendFlow de ${esc(p.nombre)}</div><div class="grilla g3">${r.perfiles.map(tarjetaPerfil).join("")}</div></div>`));
      }
    }
    if (window.CoachBicis) CoachBicis.pintar($("#perfilesPiloto", v), id, p.nombre);   // v43: bicis y set-ups (perfiles_v1.sql)'''),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v43.css", encoding="utf-8").read())
