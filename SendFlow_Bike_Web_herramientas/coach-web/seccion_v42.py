
# v42 (15/10/2026): un solo ícono en todo SendFlow (Bike, Coach, mails, app instalada): cuadro oscuro #0e1516, trazo cian y
# punto blanco. favicon e isotipo de Coach eran el trazo sin fondo (en la pestaña se veía sobre blanco). Los PNG de aviso
# pasan a ser cuadrados llenos (sin esquinas transparentes): en los mails y en iPhone se veían con fondo blanco.
for _n in ("img/isotipo.svg", "favicon.svg"): shutil.copy("piezas/icono.svg", f"{OUT}/{_n}")
for _n in ("aviso-192.png", "aviso-512.png"): shutil.copy("piezas/" + _n, f"{OUT}/img/" + _n)
