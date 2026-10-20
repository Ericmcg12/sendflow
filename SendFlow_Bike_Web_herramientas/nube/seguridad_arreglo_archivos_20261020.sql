-- 20/10/2026 — Arreglo del cierre de seguridad del 19/10 (seguridad_cerrar_funciones_internas_20261019).
-- Esa migración le sacó EXECUTE a «authenticated» sobre tres funciones que la función de borde archivos-coach llama
-- CON LA SESIÓN DEL USUARIO (rpcComoUsuario). Resultado: toda subida/bajada de archivos de Coach falla con
-- «permission denied for function coach_uid» (enviar una bajada al profe, videos, grabaciones, imágenes, documentos).
-- Las tres solo informan sobre la persona que llama (quién es / si es entrenador / si puede ver un archivo); anon sigue sin acceso.
grant execute on function public.coach_uid() to authenticated;
grant execute on function public.coach_puede_ver_archivo(uuid) to authenticated;
grant execute on function public.coach_es_entrenador(uuid) to authenticated;
-- Para deshacer: revoke execute on function public.coach_uid(), public.coach_puede_ver_archivo(uuid), public.coach_es_entrenador(uuid) from authenticated;
