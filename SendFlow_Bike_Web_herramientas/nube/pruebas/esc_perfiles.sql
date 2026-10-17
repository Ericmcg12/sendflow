-- Escenario de perfiles_v1. a = Eric (piloto, vinculado al entrenador c), c = Martín (entrenador), ee = intruso.
\set ON_ERROR_STOP 1
set role authenticated;
create temp table r (k text primary key, v jsonb);
grant all on r to authenticated;

-- 1) Eric: mis datos y dos bicis
set sf.uid = '00000000-0000-0000-0000-00000000000a';
select public.perfiles_piloto_guardar('{"nombre":"Eric Gil","peso":"78,5","edad":"44","estilo":"agresivo","nivelApp":"avanzado","disciplina":"Descenso (DH)"}');
insert into r select 'b1', public.perfiles_bici_guardar(null, 'Supreme', '{"modeloBici":"Commencal Supreme DH V5","recH":200,"recS":250,"presSuspS":180,"pesoPiloto":99}', null, null, '{"presSuspS":"185","clicksLscS":"8","presD":"23","basura":"x"}')->'bici';
insert into r select 'b2', public.perfiles_bici_guardar('11111111-1111-1111-1111-111111111111', '', '{"modeloBici":"Devinci Spartan"}', null, null, '{"presD":22}')->'bici';
do $$ declare b jsonb := (select v from r where k='b1'); begin
  assert b->'datos' ? 'recH', 'datos de bici';
  assert not (b->'datos' ? 'presSuspS') and not (b->'datos' ? 'pesoPiloto'), 'set-up y piloto fuera de la bici';
  assert (b->'setups'->0->>'esBase')::boolean and (b->'setups'->0->'valores'->>'presSuspS')::numeric = 185, 'base';
  assert not (b->'setups'->0->'valores' ? 'basura'), 'campos ajenos fuera del set-up';
end $$;
do $$ declare b jsonb := (select v from r where k='b2'); begin
  assert b->>'id' = '11111111-1111-1111-1111-111111111111' and b->>'nombre' = 'Devinci Spartan', 'id de la app y nombre por modelo';
end $$;
-- número inválido en set-up
do $$ begin perform public.perfiles_setup_guardar(null, ((select v from r where k='b1')->>'id')::uuid, 'X', '', '{"presD":"abc"}'); assert false, 'debía fallar';
exception when raise_exception then null; end $$;
-- set-up con nombre y versión
insert into r select 's1', public.perfiles_setup_guardar(null, ((select v from r where k='b1')->>'id')::uuid, 'Setup 1', 'Vallecitos', '{"clicksLscS":10}')->'setup';
do $$ declare x jsonb; begin
  x := public.perfiles_setup_guardar(((select v from r where k='s1')->>'id')::uuid, null, 'Setup 1', null, '{"clicksLscS":11}', 99);
  assert (x->>'conflicto')::boolean, 'conflicto de versión del set-up';
  x := public.perfiles_setup_guardar(((select v from r where k='s1')->>'id')::uuid, null, 'Setup 1', null, '{"clicksLscS":11}', 1);
  assert (x->'setup'->>'version')::int = 2 and x->'setup'->>'pista' = 'Vallecitos', 'set-up guardado';
end $$;
-- no se borra la base
do $$ begin perform public.perfiles_setup_borrar((select (s->>'id')::uuid from jsonb_array_elements((select v from r where k='b1')->'setups') s where (s->>'esBase')::boolean)); assert false;
exception when raise_exception then null; end $$;
-- nombre repetido
do $$ begin perform public.perfiles_setup_guardar(null, ((select v from r where k='b1')->>'id')::uuid, 'setup 1', '', '{}'); assert false, 'nombre repetido';
exception when raise_exception then null; end $$;
-- conflicto de versión de bici
do $$ declare x jsonb; begin
  x := public.perfiles_bici_guardar(((select v from r where k='b1')->>'id')::uuid, 'Supreme', '{"modeloBici":"Commencal Supreme DH V5"}', 7);
  assert (x->>'conflicto')::boolean, 'conflicto bici';
end $$;
-- perfiles para la app: piloto + bici + base
do $$ declare x jsonb; p jsonb; begin
  x := public.perfiles_para_app(false);
  assert jsonb_array_length(x->'perfiles') = 2, 'dos perfiles';
  select e into p from jsonb_array_elements(x->'perfiles') e where e->>'nombre' = 'Eric Gil · Supreme';
  assert p is not null, 'nombre piloto · bici';
  assert (p->'datos'->>'pesoPiloto')::numeric = 78.5 and p->'datos'->>'nivel' = 'avanzado' and p->'datos'->>'estilo' = 'agresivo', 'datos del piloto';
  assert (p->'datos'->>'presSuspS')::numeric = 185 and (p->'datos'->>'recH')::numeric = 200, 'base y bici';
  assert jsonb_array_length(p->'setups') = 2, 'base + setup 1';
end $$;

-- 2) Propuestas: dos para la misma pista → queda una (la más nueva)
select public.perfiles_propuesto_crear(((select v from r where k='b1')->>'id')::uuid, null, 'baj-1', 'Bajada 1', 'Vallecitos', '{"clicksLscS":9}');
select public.perfiles_propuesto_crear(((select v from r where k='b1')->>'id')::uuid, null, 'baj-2', 'Bajada 2', 'vallecitos', '{"clicksLscS":7}');
select public.perfiles_propuesto_crear(((select v from r where k='b1')->>'id')::uuid, null, 'baj-3', 'Bajada 3', 'Las Leñas', '{"presD":24}');
do $$ declare m jsonb := public.perfiles_mios(); b jsonb; begin
  select e into b from jsonb_array_elements(m->'bicis') e where e->>'nombre' = 'Supreme';
  assert jsonb_array_length(b->'propuestos') = 2 and (m->>'propuestosPendientes')::int = 2, 'una por pista';
  assert exists (select 1 from jsonb_array_elements(b->'propuestos') p where p->>'bajadaRef' = 'baj-2'), 'queda la más nueva';
end $$;
-- resolver: como base y con nombre
do $$ declare b jsonb; pid uuid; base numeric; begin
  select e into b from jsonb_array_elements(public.perfiles_mios()->'bicis') e where e->>'nombre' = 'Supreme';
  select (p->>'id')::uuid into pid from jsonb_array_elements(b->'propuestos') p where p->>'bajadaRef' = 'baj-2';
  perform public.perfiles_propuesto_resolver(pid, 'base');
  select (p->>'id')::uuid into pid from jsonb_array_elements(b->'propuestos') p where p->>'bajadaRef' = 'baj-3';
  perform public.perfiles_propuesto_resolver(pid, 'nombre', '');
  select e into b from jsonb_array_elements(public.perfiles_mios()->'bicis') e where e->>'nombre' = 'Supreme';
  select (s->'valores'->>'clicksLscS')::numeric into base from jsonb_array_elements(b->'setups') s where (s->>'esBase')::boolean;
  assert base = 7, 'base con los valores de la propuesta';
  assert (select (s->'valores'->>'presSuspS')::numeric from jsonb_array_elements(b->'setups') s where (s->>'esBase')::boolean) = 185, 'lo demás de la base se conserva';
  assert exists (select 1 from jsonb_array_elements(b->'setups') s where s->>'nombre' = 'Las Leñas'), 'set-up con nombre de la pista';
  assert jsonb_array_length(b->'propuestos') = 0, 'sin pendientes';
end $$;

-- 3) Entrenador: ve las bicis del alumno pero no las edita sin permiso
set sf.uid = '00000000-0000-0000-0000-00000000000c';
do $$ declare x jsonb; begin
  x := public.perfiles_para_app(true);
  assert exists (select 1 from jsonb_array_elements(x->'perfiles') e where e->>'piloto' = 'Eric Gil'), 'el entrenador ve las bicis del alumno';
end $$;
do $$ begin perform public.perfiles_setup_guardar(null, ((select v from r where k='b1')->>'id')::uuid, 'Del profe', '', '{}'); assert false, 'sin permiso';
exception when insufficient_privilege then null; end $$;
-- el piloto da permiso
set sf.uid = '00000000-0000-0000-0000-00000000000a';
select public.perfiles_permiso_editar(true);
set sf.uid = '00000000-0000-0000-0000-00000000000c';
select public.perfiles_setup_guardar(null, ((select v from r where k='b1')->>'id')::uuid, 'Del profe', '', '{"presD":21}');
do $$ begin perform public.perfiles_bici_borrar(((select v from r where k='b1')->>'id')::uuid); assert false, 'el profe no borra';
exception when insufficient_privilege then null; end $$;

-- 4) Piloto nuevo (ficha sin cuenta) del entrenador
do $$ declare f jsonb; x jsonb; begin
  f := public.coach_piloto_guardar(null, '{"nombre":"Juan Sin Cuenta"}')->'piloto';
  insert into r values ('f', f);
  x := public.perfiles_bici_guardar('22222222-2222-2222-2222-222222222222', 'Session', '{"modeloBici":"Trek Session"}', null, (f->>'id')::uuid, '{"presD":20}');
  assert x->'bici'->>'fichaId' = f->>'id', 'bici de la ficha';
  x := public.perfiles_de_ficha((f->>'id')::uuid);
  assert not (x->>'conCuenta')::boolean and jsonb_array_length(x->'bicis') = 1, 'bicis de la ficha';
  x := public.perfiles_para_app(true);
  assert exists (select 1 from jsonb_array_elements(x->'perfiles') e where e->>'nombre' = 'Juan Sin Cuenta · Session'), 'ficha en perfiles para la app';
end $$;

-- 5) Intruso: no ve nada ajeno
set sf.uid = '00000000-0000-0000-0000-0000000000ee';
do $$ declare x jsonb; begin
  x := public.perfiles_para_app(true);
  assert jsonb_array_length(x->'perfiles') = 0, 'intruso sin perfiles';
end $$;
do $$ begin perform public.perfiles_bici_guardar(((select v from r where k='b1')->>'id')::uuid, 'X', '{}', null); assert false;
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.perfiles_propuesto_crear(((select v from r where k='b1')->>'id')::uuid, null, 'x', 'x', 'x', '{}'); assert false;
exception when raise_exception then null; end $$;

-- 6) Juan se registra con su mail, acepta y decide traer sus bicis
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000bb','juan@x.com');
insert into perfiles_usuario (id, nombre, aprobado) values ('00000000-0000-0000-0000-0000000000bb','Juan',true);
update coach_pilotos set email = 'juan@x.com' where id = ((select v from r where k='f')->>'id')::uuid;
insert into vinculos (piloto_id, profesional_id, tipo, estado) values ('00000000-0000-0000-0000-0000000000bb','00000000-0000-0000-0000-00000000000c','piloto_entrenador','activo');
set role authenticated;
set sf.uid = '00000000-0000-0000-0000-0000000000bb';
do $$ declare x jsonb; begin
  x := public.perfiles_fichas_para_traer();
  assert jsonb_array_length(x->'fichas') = 1, 'pregunta si trae';
  x := public.perfiles_ficha_traspasar(((select v from r where k='f')->>'id')::uuid, true);
  assert (x->>'traidas')::int = 1, 'trae la bici';
  x := public.perfiles_mios();
  assert jsonb_array_length(x->'bicis') = 1 and jsonb_array_length(x->'bicis'->0->'setups') = 1, 'bici y base en su cuenta';
  assert jsonb_array_length(public.perfiles_fichas_para_traer()->'fichas') = 0, 'no pregunta más';
end $$;
-- el entrenador la sigue viendo (ahora como bici del alumno con cuenta)
set sf.uid = '00000000-0000-0000-0000-00000000000c';
do $$ declare x jsonb; begin
  x := public.perfiles_de_ficha(((select v from r where k='f')->>'id')::uuid);
  assert (x->>'conCuenta')::boolean and jsonb_array_length(x->'bicis') = 1, 'el entrenador la ve en la cuenta del alumno';
end $$;
-- 7) borrar bici (dueño) → desaparece de la lista
set sf.uid = '00000000-0000-0000-0000-00000000000a';
select public.perfiles_bici_borrar('11111111-1111-1111-1111-111111111111');
do $$ begin assert jsonb_array_length(public.perfiles_mios()->'bicis') = 1, 'borrada'; end $$;
-- 8) foto inválida
do $$ begin perform public.perfiles_piloto_guardar('{"foto":"javascript:alert(1)"}'); assert false;
exception when raise_exception then null; end $$;
\echo ESCENARIO_OK
