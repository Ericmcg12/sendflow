# v45 (15/10/2026): tarjetas con el mismo efecto al pasar el mouse que sendflow.bike.
shutil.copy("piezas/tarjetas-luz.js", f"{OUT}/js/tarjetas-luz.js")
parchar(f"{OUT}/index.html", [
 ('<script src="js/app.js"></script>', '<script src="js/tarjetas-luz.js"></script>\n<script src="js/app.js"></script>'),
])
open(f"{OUT}/css/coach.css", "a", encoding="utf-8").write(open("piezas/coach_v45.css", encoding="utf-8").read())
