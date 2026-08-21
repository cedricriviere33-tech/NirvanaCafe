-- ═══════════════════════════════════════════════════════════════════════════
-- NIRVANA CAFÉ — Installation SQL COMPLÈTE (à exécuter en UNE fois)
-- Supabase → SQL Editor → coller CE fichier entier → Run. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ┌─ PARTIE 1/2 — SCHÉMA DE BASE ─┐

-- ════════════════════════════════════════════════════════════════════════
-- NIRVANA CAFÉ — Schéma Supabase (PostgreSQL)
-- À coller dans Supabase → SQL Editor → Run.
--
-- Deux tables :
--   1) menu         : menu PUBLIC dynamique (lu par le QR code). Lecture ouverte.
--   2) nirvana_sync : sauvegarde de l'état de l'app (JSON par collection).
--
-- SÉCURITÉ (à lire) :
--   • La clé "anon" est publique par nature. La protection réelle = ces règles RLS.
--   • `menu` : lecture par tous (c'est fait pour), écriture à restreindre en prod.
--   • `nirvana_sync` : contient vos données de gestion. En prod, protégez-la
--     derrière Supabase Auth (voir le bloc "VERSION SÉCURISÉE" plus bas).
--   • L'app N'ENVOIE JAMAIS au cloud les collections sensibles (comptes/mots de
--     passe, employés, clients) : elles restent en local + LAN (XAMPP).
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) TABLE MENU (publique)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.menu (
  id          text primary key,
  nom         text not null,
  description text default '',
  prix        numeric(10,2) not null default 0,
  disponible  boolean not null default true,
  categorie   text default 'Divers',
  updated_at  timestamptz not null default now()
);

alter table public.menu enable row level security;

-- Lecture publique du menu (n'importe qui peut afficher la carte via le QR code)
drop policy if exists "menu lecture publique" on public.menu;
create policy "menu lecture publique"
  on public.menu for select
  using (true);

-- Écriture depuis l'app (clé anon).  ⚠️ Simple mais permissif : convient à un
-- petit établissement. Pour durcir, remplacez par la VERSION SÉCURISÉE ci-dessous.
drop policy if exists "menu ecriture anon" on public.menu;
create policy "menu ecriture anon"
  on public.menu for all
  using (true) with check (true);


-- ─────────────────────────────────────────────────────────────
-- 2) TABLE NIRVANA_SYNC (sauvegarde de l'état de l'app)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.nirvana_sync (
  collection text primary key,
  data       jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nirvana_sync enable row level security;

-- Version simple (démarrage rapide) : accès complet via la clé anon.
-- ⚠️ Toute personne connaissant l'URL + la clé anon peut lire/écrire ces données.
--    Acceptable pour tester ; passez à la VERSION SÉCURISÉE pour la production.
drop policy if exists "sync anon complet" on public.nirvana_sync;
create policy "sync anon complet"
  on public.nirvana_sync for all
  using (true) with check (true);


-- ════════════════════════════════════════════════════════════════════════
-- VERSION SÉCURISÉE (recommandée en production) — À activer quand vous voulez
-- restreindre l'accès aux seuls utilisateurs connectés (Supabase Auth).
--
-- 1. Créez un utilisateur dans Supabase → Authentication → Users (ex. le patron).
-- 2. Faites en sorte que l'app se connecte (supabase.auth.signInWithPassword).
-- 3. Remplacez les policies "anon" par celles-ci :
--
--   drop policy if exists "sync anon complet" on public.nirvana_sync;
--   create policy "sync auth complet" on public.nirvana_sync
--     for all to authenticated using (true) with check (true);
--
--   drop policy if exists "menu ecriture anon" on public.menu;
--   create policy "menu ecriture auth" on public.menu
--     for all to authenticated using (true) with check (true);
--   -- (on garde "menu lecture publique" pour que les clients voient la carte)
-- ════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 3) TABLE PAIEMENTS (journal des encaissements du terminal smartphone)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.paiements (
  id         bigint generated always as identity primary key,
  montant    numeric(10,2) not null,
  mode       text,
  ref        text,
  ts         timestamptz not null default now()
);

alter table public.paiements enable row level security;

-- Insertion depuis le terminal (clé anon). Lecture réservée (à durcir via Auth en prod).
drop policy if exists "paiements insert anon" on public.paiements;
create policy "paiements insert anon"
  on public.paiements for insert
  with check (true);

drop policy if exists "paiements select anon" on public.paiements;
create policy "paiements select anon"
  on public.paiements for select
  using (true);


-- ─────────────────────────────────────────────────────────────
-- Données de démonstration pour le menu (facultatif)
-- ─────────────────────────────────────────────────────────────
insert into public.menu (id, nom, description, prix, disponible, categorie) values
  ('p1','Rougail saucisse','Saucisses fumées, tomates, épices péi',12.50,true,'Plats'),
  ('p2','Cari poulet','Poulet mariné, curcuma, riz basmati',13.00,true,'Plats'),
  ('p3','Civet zébu','Zébu mijoté, brèdes, riz',15.50,true,'Plats'),
  ('p4','Coca','33 cl',2.50,true,'Boissons'),
  ('p5','Bière Dodo','33 cl',3.50,true,'Boissons')
on conflict (id) do nothing;


-- ┌─ PARTIE 2/2 — AUTH + CONFORMITÉ + LECTURE PUBLIQUE ─┐

-- ════════════════════════════════════════════════════════════════════════════
--  NIRVANA CAFÉ — Schéma Supabase v2
--  Sécurité (Supabase Auth + RLS par rôle) ET conformité caisse, ensemble.
--
--  POURQUOI LES DEUX ENSEMBLE :
--  L'inaltérabilité ne peut PAS être garantie par le navigateur. Tant que la
--  clé anon (publique) donne un accès complet à `nirvana_sync`, n'importe qui
--  réécrit les ventes et recalcule la chaîne de hachage. Ici, c'est PostgreSQL
--  qui refuse : la numérotation, le chaînage et l'horodatage sont produits
--  côté serveur, et UPDATE/DELETE sur les ventes sont bloqués par trigger —
--  même depuis le SQL Editor, même avec la clé service_role.
--
--  À COLLER DANS : Supabase → SQL Editor → New query → Run.
--  Idempotent : réexécutable sans casse.
--
--  ⚠ Ce fichier fournit les MOYENS TECHNIQUES des 4 conditions du 3° bis du I
--    de l'art. 286 du CGI (inaltérabilité, sécurisation, conservation,
--    archivage). Il ne vaut pas attestation.
--
--  📍 MICRO-ENTREPRISE EN FRANCHISE EN BASE (art. 293 B) :
--    le 2 du II de l'art. 286 du CGI vous DISPENSE de l'obligation de logiciel
--    de caisse sécurisé. L'inaltérabilité reste néanmoins active ici : elle
--    protège vos données et vous rend conforme d'avance le jour où vous
--    dépasserez le seuil (85 000 € / 93 500 € en restauration).
--    En franchise, `total_tva` vaut 0 et `ventilation_tva` est vide : c'est
--    normal et accepté par enregistrer_vente().
--
--  📍 LA RÉUNION (art. 296 du CGI) : taux normal 8,5 %, taux réduit 2,1 %.
--    Les taux métropolitains (10 %, 20 %) ne s'appliquent PAS.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;   -- digest() pour le chaînage SHA-256

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. PROFILS — le rôle applicatif rattaché à un compte Supabase Auth       ║
-- ║    Remplace la collection `users` : plus AUCUN hash de mot de passe ne   ║
-- ║    transite ni ne dort dans votre base. Les mots de passe vivent dans    ║
-- ║    auth.users, gérés par Supabase (bcrypt, jamais exposés).              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table if not exists public.profils (
  id           uuid primary key references auth.users(id) on delete cascade,
  identifiant  text unique not null,                    -- 'patron', 'marie'…
  nom          text not null,
  role         text not null check (role in ('dev','admin','employe')),
  actif        boolean not null default true,
  cree_le      timestamptz not null default now()
);
alter table public.profils enable row level security;

-- Helpers en SECURITY DEFINER : ils contournent la RLS, ce qui évite la
-- récursion infinie (une policy sur profils qui relit profils).
create or replace function public.mon_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profils where id = auth.uid() and actif;
$$;

create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','dev') from public.profils
                   where id = auth.uid() and actif), false);
$$;

drop policy if exists "profils lecture" on public.profils;
create policy "profils lecture" on public.profils
  for select to authenticated using (true);

drop policy if exists "profils gestion admin" on public.profils;
create policy "profils gestion admin" on public.profils
  for all to authenticated using (public.est_admin()) with check (public.est_admin());


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. COMPTEURS — numérotation séquentielle SANS TROU                       ║
-- ║    Une `sequence` Postgres laisse des trous (elle ne revient pas en      ║
-- ║    arrière sur ROLLBACK). Ici le compteur est une ligne verrouillée par  ║
-- ║    l'UPDATE : si la transaction échoue, le numéro est rendu. Aucun trou. ║
-- ║    Aucune policy → table injoignable depuis le client. Seules les        ║
-- ║    fonctions SECURITY DEFINER ci-dessous y touchent.                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table if not exists public.compteurs (
  cle    text primary key,        -- 'ticket:2026'
  valeur bigint not null default 0
);
alter table public.compteurs enable row level security;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. VENTES — journal des encaissements, APPEND-ONLY et chaîné            ║
-- ║    Une vente n'est JAMAIS modifiée ni supprimée. Une erreur se corrige   ║
-- ║    par une écriture inverse (type='annulation') qui référence l'origine. ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table if not exists public.ventes (
  id              uuid primary key default gen_random_uuid(),
  numero          text not null unique,                 -- '2026-000001'
  exercice        int  not null,
  emis_le         timestamptz not null default now(),   -- horodatage SERVEUR
  caissier_id     uuid not null references auth.users(id),
  caissier_nom    text not null,
  caissier_role   text not null,
  mode            text not null check (mode in ('surplace','emporter')),
  paiement        text not null check (paiement in ('especes','cb','cheque','ticket_resto','virement','multiple')),
  table_nom       text,
  lignes          jsonb not null,   -- [{nom,qte,pu_ht,pu_ttc,taux_tva,total_ht,total_tva,total_ttc}]
  total_ht        numeric(12,2) not null,
  total_tva       numeric(12,2) not null,
  total_ttc       numeric(12,2) not null,
  ventilation_tva jsonb not null,   -- {"5.50":{"base_ht":..,"tva":..},"10.00":{...},"20.00":{...}}
  type            text not null default 'vente' check (type in ('vente','annulation')),
  annule_vente_id uuid references public.ventes(id),
  motif           text,             -- obligatoire pour une annulation
  -- Cumul perpétuel (exigence NF525) : total TTC de TOUTES les ventes depuis
  -- la mise en service, figé à l'instant de l'écriture.
  cumul_perpetuel numeric(14,2) not null,
  precedent_hash  text not null,
  hash            text not null,
  cree_le         timestamptz not null default now()
);
create index if not exists idx_ventes_emis_le  on public.ventes(emis_le);
create index if not exists idx_ventes_exercice on public.ventes(exercice);

alter table public.ventes enable row level security;

drop policy if exists "ventes lecture" on public.ventes;
create policy "ventes lecture" on public.ventes
  for select to authenticated using (true);

-- Pas de policy INSERT directe : on passe OBLIGATOIREMENT par enregistrer_vente()
-- pour que numéro, hash, horodatage et cumul soient produits par le serveur.
-- Aucune policy UPDATE/DELETE → refus par défaut de la RLS.

-- Ceinture ET bretelles : le trigger bloque aussi service_role et le SQL Editor.
create or replace function public.refus_modification()
returns trigger language plpgsql as $$
begin
  raise exception
    'Écriture inaltérable (art. 286-I-3° bis CGI) : UPDATE/DELETE interdit sur %. Passez par une annulation.',
    TG_TABLE_NAME;
end; $$;

drop trigger if exists trg_ventes_no_update on public.ventes;
create trigger trg_ventes_no_update before update on public.ventes
  for each row execute function public.refus_modification();
drop trigger if exists trg_ventes_no_delete on public.ventes;
create trigger trg_ventes_no_delete before delete on public.ventes
  for each row execute function public.refus_modification();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. ENREGISTRER UNE VENTE — le seul chemin d'écriture                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create or replace function public.enregistrer_vente(
  p_mode        text,
  p_paiement    text,
  p_lignes      jsonb,
  p_total_ht    numeric,
  p_total_tva   numeric,
  p_total_ttc   numeric,
  p_ventilation jsonb,
  p_table_nom   text default null,
  p_type        text default 'vente',
  p_annule      uuid default null,
  p_motif       text default null
) returns public.ventes
language plpgsql security definer set search_path = public as $$
declare
  v_exercice int := extract(year from now())::int;
  v_num      bigint;
  v_numero   text;
  v_prev     text;
  v_cumul    numeric(14,2);
  v_nom      text;
  v_role     text;
  v_row      public.ventes;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise pour encaisser.';
  end if;
  select nom, role into v_nom, v_role
    from public.profils where id = auth.uid() and actif;
  if v_nom is null then
    raise exception 'Profil inconnu ou désactivé — encaissement refusé.';
  end if;

  -- Règles métier des annulations : tracées, motivées, réservées aux responsables.
  if p_type = 'annulation' then
    if p_annule is null then raise exception 'Annulation : vente d''origine obligatoire.'; end if;
    if coalesce(btrim(p_motif),'') = '' then raise exception 'Annulation : motif obligatoire.'; end if;
    if not public.est_admin() then raise exception 'Annulation réservée à un responsable.'; end if;
    if exists (select 1 from public.ventes where annule_vente_id = p_annule) then
      raise exception 'Cette vente a déjà été annulée.';
    end if;
  end if;

  -- Numérotation continue par exercice. L'UPDATE pose un verrou de ligne :
  -- les encaissements concurrents se sérialisent, aucun numéro n'est perdu.
  insert into public.compteurs(cle, valeur) values ('ticket:'||v_exercice, 0)
    on conflict (cle) do nothing;
  update public.compteurs set valeur = valeur + 1
    where cle = 'ticket:'||v_exercice
    returning valeur into v_num;
  v_numero := v_exercice || '-' || lpad(v_num::text, 6, '0');

  -- Chaînage sur la vente précédente + cumul perpétuel
  select hash, cumul_perpetuel into v_prev, v_cumul
    from public.ventes order by cree_le desc, numero desc limit 1;
  v_prev  := coalesce(v_prev, 'GENESIS');
  v_cumul := coalesce(v_cumul, 0) + p_total_ttc;

  insert into public.ventes(
    numero, exercice, caissier_id, caissier_nom, caissier_role, mode, paiement,
    table_nom, lignes, total_ht, total_tva, total_ttc, ventilation_tva,
    type, annule_vente_id, motif, cumul_perpetuel, precedent_hash, hash)
  values (
    v_numero, v_exercice, auth.uid(), v_nom, v_role, p_mode, p_paiement,
    p_table_nom, p_lignes, p_total_ht, p_total_tva, p_total_ttc, p_ventilation,
    p_type, p_annule, p_motif, v_cumul, v_prev,
    encode(digest(v_prev || v_numero || now()::text || p_total_ttc::text
                  || p_lignes::text || auth.uid()::text, 'sha256'), 'hex'))
  returning * into v_row;

  perform public.tracer('caisse',
    case when p_type='annulation' then 'Annulation' else 'Encaissement' end,
    v_numero || ' · ' || p_total_ttc || ' € · ' || p_paiement, v_row.id::text, null, null);
  return v_row;
end; $$;

revoke all on function public.enregistrer_vente from public, anon;
grant execute on function public.enregistrer_vente to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5. ANNULER = écriture inverse (jamais de suppression)                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create or replace function public.annuler_vente(p_vente_id uuid, p_motif text)
returns public.ventes
language plpgsql security definer set search_path = public as $$
declare v_o public.ventes; v_lignes jsonb; v_vent jsonb;
begin
  select * into v_o from public.ventes where id = p_vente_id;
  if v_o.id is null then raise exception 'Vente introuvable.'; end if;
  if v_o.type = 'annulation' then raise exception 'Une annulation ne s''annule pas.'; end if;

  -- Miroir en négatif : lignes, totaux et ventilation TVA inversés.
  select jsonb_agg(jsonb_set(jsonb_set(jsonb_set(jsonb_set(l,
           '{qte}',       to_jsonb(-(l->>'qte')::numeric)),
           '{total_ht}',  to_jsonb(-(l->>'total_ht')::numeric)),
           '{total_tva}', to_jsonb(-(l->>'total_tva')::numeric)),
           '{total_ttc}', to_jsonb(-(l->>'total_ttc')::numeric)))
    into v_lignes from jsonb_array_elements(v_o.lignes) l;

  select jsonb_object_agg(k, jsonb_build_object(
           'base_ht', -((v->>'base_ht')::numeric),
           'tva',     -((v->>'tva')::numeric)))
    into v_vent from jsonb_each(v_o.ventilation_tva) as t(k,v);

  return public.enregistrer_vente(
    v_o.mode, v_o.paiement, v_lignes,
    -v_o.total_ht, -v_o.total_tva, -v_o.total_ttc, v_vent,
    v_o.table_nom, 'annulation', v_o.id, p_motif);
end; $$;

revoke all on function public.annuler_vente from public, anon;
grant execute on function public.annuler_vente to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6. JOURNAL — trace de tout (qui, quoi, quand, avant, après)              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table if not exists public.journal (
  id             uuid primary key default gen_random_uuid(),
  ts             timestamptz not null default now(),
  acteur_id      uuid,
  acteur_nom     text not null default 'système',
  role           text,
  module         text not null,
  action         text not null,
  detail         text,
  entite_id      text,
  avant          jsonb,          -- ancienne valeur
  apres          jsonb,          -- nouvelle valeur
  precedent_hash text not null,
  hash           text not null
);
create index if not exists idx_journal_ts on public.journal(ts);
alter table public.journal enable row level security;

drop policy if exists "journal lecture" on public.journal;
create policy "journal lecture" on public.journal
  for select to authenticated using (true);
-- Ni INSERT direct, ni UPDATE, ni DELETE : on passe par tracer().

drop trigger if exists trg_journal_no_update on public.journal;
create trigger trg_journal_no_update before update on public.journal
  for each row execute function public.refus_modification();
drop trigger if exists trg_journal_no_delete on public.journal;
create trigger trg_journal_no_delete before delete on public.journal
  for each row execute function public.refus_modification();

create or replace function public.tracer(
  p_module text, p_action text, p_detail text default null,
  p_entite text default null, p_avant jsonb default null, p_apres jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text; v_nom text; v_role text;
begin
  select nom, role into v_nom, v_role from public.profils where id = auth.uid();
  select hash into v_prev from public.journal order by ts desc limit 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  insert into public.journal(acteur_id, acteur_nom, role, module, action, detail,
                             entite_id, avant, apres, precedent_hash, hash)
  values (auth.uid(), coalesce(v_nom,'système'), v_role, p_module, p_action, p_detail,
          p_entite, p_avant, p_apres, v_prev,
          encode(digest(v_prev || p_module || p_action || coalesce(p_detail,'')
                        || now()::text || coalesce(auth.uid()::text,'-'), 'sha256'), 'hex'));
end; $$;

revoke all on function public.tracer from public, anon;
grant execute on function public.tracer to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7. CLÔTURES — journalière (ticket Z), mensuelle, annuelle. Immuables.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create table if not exists public.clotures (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('journaliere','mensuelle','annuelle')),
  periode         date not null,
  cloture_le      timestamptz not null default now(),
  operateur_id    uuid references auth.users(id),
  operateur_nom   text,
  nb_tickets      int not null,
  premier_ticket  text,
  dernier_ticket  text,
  total_ht        numeric(12,2) not null,
  total_tva       numeric(12,2) not null,
  total_ttc       numeric(12,2) not null,
  ventilation_tva jsonb not null,
  par_paiement    jsonb not null,       -- {"especes":…,"cb":…,"cheque":…}
  fond_caisse     numeric(12,2),
  especes_comptees numeric(12,2),
  ecart           numeric(12,2),
  cumul_perpetuel numeric(14,2) not null,
  hash            text not null,
  unique (type, periode)
);
alter table public.clotures enable row level security;

drop policy if exists "clotures lecture" on public.clotures;
create policy "clotures lecture" on public.clotures
  for select to authenticated using (true);

drop trigger if exists trg_clotures_no_update on public.clotures;
create trigger trg_clotures_no_update before update on public.clotures
  for each row execute function public.refus_modification();
drop trigger if exists trg_clotures_no_delete on public.clotures;
create trigger trg_clotures_no_delete before delete on public.clotures
  for each row execute function public.refus_modification();

create or replace function public.cloturer(p_type text, p_periode date,
  p_fond numeric default null, p_especes numeric default null)
returns public.clotures
language plpgsql security definer set search_path = public as $$
declare
  v_d timestamptz; v_f timestamptz; v_row public.clotures;
  v_nb int; v_ht numeric; v_tva numeric; v_ttc numeric;
  v_p1 text; v_p2 text; v_vent jsonb; v_pay jsonb; v_cum numeric; v_nom text;
begin
  if not public.est_admin() then raise exception 'Clôture réservée à un responsable.'; end if;
  select nom into v_nom from public.profils where id = auth.uid();

  v_d := p_periode::timestamptz;
  v_f := case p_type when 'journaliere' then v_d + interval '1 day'
                     when 'mensuelle'   then v_d + interval '1 month'
                     else v_d + interval '1 year' end;

  select count(*), coalesce(sum(total_ht),0), coalesce(sum(total_tva),0),
         coalesce(sum(total_ttc),0), min(numero), max(numero)
    into v_nb, v_ht, v_tva, v_ttc, v_p1, v_p2
    from public.ventes where emis_le >= v_d and emis_le < v_f;

  select coalesce(jsonb_object_agg(taux, montants), '{}'::jsonb) into v_vent from (
    select k as taux, jsonb_build_object(
             'base_ht', sum((v->>'base_ht')::numeric),
             'tva',     sum((v->>'tva')::numeric)) as montants
      from public.ventes, jsonb_each(ventilation_tva) as t(k,v)
     where emis_le >= v_d and emis_le < v_f group by k) s;

  select coalesce(jsonb_object_agg(paiement, tot), '{}'::jsonb) into v_pay from (
    select paiement, sum(total_ttc) as tot from public.ventes
     where emis_le >= v_d and emis_le < v_f group by paiement) s;

  select coalesce(max(cumul_perpetuel), 0) into v_cum
    from public.ventes where emis_le < v_f;

  insert into public.clotures(type, periode, operateur_id, operateur_nom, nb_tickets,
    premier_ticket, dernier_ticket, total_ht, total_tva, total_ttc, ventilation_tva,
    par_paiement, fond_caisse, especes_comptees, ecart, cumul_perpetuel, hash)
  values (p_type, p_periode, auth.uid(), v_nom, v_nb, v_p1, v_p2, v_ht, v_tva, v_ttc,
    v_vent, v_pay, p_fond, p_especes,
    case when p_especes is null then null
         else p_especes - coalesce(p_fond,0) - coalesce((v_pay->>'especes')::numeric,0) end,
    v_cum,
    encode(digest(p_type || p_periode::text || v_ttc::text || v_cum::text || now()::text, 'sha256'), 'hex'))
  returning * into v_row;

  perform public.tracer('caisse', 'Clôture '||p_type, p_periode::text||' · '||v_ttc||' € · '||v_nb||' tickets', v_row.id::text);
  return v_row;
end; $$;

revoke all on function public.cloturer from public, anon;
grant execute on function public.cloturer to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8. CONTRÔLE D'INTÉGRITÉ — à présenter en cas de contrôle fiscal          ║
-- ║    Rejoue toute la chaîne et signale la 1re rupture.                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create or replace function public.verifier_integrite()
returns table(ok boolean, controlees bigint, premiere_rupture text, trous text)
language plpgsql security definer set search_path = public as $$
declare r record; v_prev text := 'GENESIS'; v_n bigint := 0; v_bad text := null; v_trous text := '';
begin
  for r in select * from public.ventes order by cree_le asc, numero asc loop
    v_n := v_n + 1;
    if r.precedent_hash <> v_prev and v_bad is null then v_bad := r.numero; end if;
    v_prev := r.hash;
  end loop;
  -- détection de trous dans la numérotation, exercice par exercice
  select coalesce(string_agg(t.manquant, ', '), '') into v_trous from (
    select e.exercice || '-' || lpad(g::text, 6, '0') as manquant
      from (select exercice, max(split_part(numero,'-',2)::bigint) as hi
              from public.ventes group by exercice) e,
           generate_series(1, e.hi) g
     where not exists (select 1 from public.ventes v
                        where v.exercice = e.exercice
                          and v.numero = e.exercice || '-' || lpad(g::text, 6, '0'))
  ) t;
  return query select (v_bad is null and v_trous = ''), v_n, v_bad, v_trous;
end; $$;
grant execute on function public.verifier_integrite to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 9. EXPORT FEC — Fichier des Écritures Comptables (art. A47 A-1 LPF)      ║
-- ║    Une écriture par vente : contrepartie (411/53/512) puis produits par  ║
-- ║    taux (706) et TVA collectée (4457x). ⚠ Le plan de comptes ci-dessous  ║
-- ║    est un modèle : à valider avec votre expert-comptable.                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
create or replace function public.export_fec(p_debut date, p_fin date)
returns table(
  "JournalCode" text, "JournalLib" text, "EcritureNum" text, "EcritureDate" text,
  "CompteNum" text, "CompteLib" text, "CompAuxNum" text, "CompAuxLib" text,
  "PieceRef" text, "PieceDate" text, "EcritureLib" text,
  "Debit" text, "Credit" text, "EcritureLet" text, "DateLet" text,
  "ValidDate" text, "Montantdevise" text, "Idevise" text)
language sql stable security definer set search_path = public as $$
  with v as (
    select * from public.ventes
     where emis_le >= p_debut::timestamptz and emis_le < (p_fin + 1)::timestamptz
  ),
  contrepartie as (
    select 'CA' jc, 'Caisse' jl, v.numero en, to_char(v.emis_le,'YYYYMMDD') ed,
           case v.paiement when 'especes' then '531000' when 'cb' then '512000'
                           when 'cheque' then '511200' else '411000' end cn,
           case v.paiement when 'especes' then 'Caisse' when 'cb' then 'Banque'
                           when 'cheque' then 'Chèques à encaisser' else 'Clients' end cl,
           v.numero pr, to_char(v.emis_le,'YYYYMMDD') pd,
           case when v.type='annulation' then 'Annulation ' else 'Vente ' end || v.numero el,
           case when v.total_ttc >= 0 then v.total_ttc else 0 end db,
           case when v.total_ttc <  0 then -v.total_ttc else 0 end cr,
           v.emis_le ord, 1 rang
      from v
  ),
  produits as (
    select 'CA', 'Caisse', v.numero, to_char(v.emis_le,'YYYYMMDD'),
           '706000', 'Prestations de services', v.numero, to_char(v.emis_le,'YYYYMMDD'),
           'CA HT TVA ' || t.k || '% · ' || v.numero,
           case when (t.v->>'base_ht')::numeric <  0 then -(t.v->>'base_ht')::numeric else 0 end,
           case when (t.v->>'base_ht')::numeric >= 0 then  (t.v->>'base_ht')::numeric else 0 end,
           v.emis_le, 2
      from v, jsonb_each(v.ventilation_tva) as t(k,v)
     where (t.v->>'base_ht')::numeric <> 0
  ),
  tva as (
    -- Sous-comptes de TVA collectée par taux. ⚠ Couvre les taux MÉTROPOLITAINS
    -- (5,5 / 10 / 20) ET RÉUNIONNAIS (2,1 / 8,5 / 1,75 / 1,05 — art. 296 du CGI).
    -- En franchise en base (art. 293 B), ventilation_tva est vide : aucune ligne ici.
    select 'CA', 'Caisse', v.numero, to_char(v.emis_le,'YYYYMMDD'),
           case t.k
             when '1.05' then '445711' when '1.75' then '445712'
             when '2.10' then '445713' when '8.50' then '445714'   -- La Réunion
             when '5.50' then '445715' when '10.00' then '445716'
             when '20.00' then '445717'                            -- Métropole
             else '445719' end,
           'TVA collectée ' || t.k || '%', v.numero, to_char(v.emis_le,'YYYYMMDD'),
           'TVA ' || t.k || '% · ' || v.numero,
           case when (t.v->>'tva')::numeric <  0 then -(t.v->>'tva')::numeric else 0 end,
           case when (t.v->>'tva')::numeric >= 0 then  (t.v->>'tva')::numeric else 0 end,
           v.emis_le, 3
      from v, jsonb_each(v.ventilation_tva) as t(k,v)
     where (t.v->>'tva')::numeric <> 0
  ),
  tout as (
    select jc, jl, en, ed, cn, cl, pr, pd, el, db, cr, ord, rang from contrepartie
    union all select * from produits
    union all select * from tva
  )
  select jc, jl, en, ed, cn, cl, '', '', pr, pd, el,
         replace(to_char(db,'FM9999999990.00'),'.',','),
         replace(to_char(cr,'FM9999999990.00'),'.',','),
         '', '', ed, '', ''
    from tout order by ord, en, rang;
$$;
grant execute on function public.export_fec to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 10. MENU PUBLIC — seule table restant en lecture anonyme (la carte)      ║
-- ║     + information ALLERGÈNES (règlement INCO / décret 2015-447)          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
alter table if exists public.menu add column if not exists allergenes      jsonb   not null default '[]'::jsonb;
alter table if exists public.menu add column if not exists allerg_declare  boolean not null default false;
alter table if exists public.menu add column if not exists fait_maison     boolean not null default false;
alter table if exists public.menu add column if not exists origine_viande  text;
comment on column public.menu.allergenes     is 'Ids parmi les 14 allergènes INCO, calculés depuis les recettes';
comment on column public.menu.allerg_declare is 'true = quelqu''un a statué (liste vide = « aucun allergène » vérifié)';

alter table if exists public.menu enable row level security;
drop policy if exists "menu lecture publique" on public.menu;
create policy "menu lecture publique" on public.menu for select to anon, authenticated using (true);
drop policy if exists "menu ecriture anon" on public.menu;      -- ⚠ l'ancienne, permissive
drop policy if exists "menu ecriture auth" on public.menu;
create policy "menu ecriture auth" on public.menu
  for all to authenticated using (public.est_admin()) with check (public.est_admin());


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 11. NIRVANA_SYNC — gestion (stock, RH, fournisseurs…), plus la caisse    ║
-- ║     Ces modules ne relèvent PAS de l'obligation « logiciel de caisse ».  ║
-- ║     On ferme simplement la porte à la clé anon.                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
alter table if exists public.nirvana_sync enable row level security;
drop policy if exists "sync anon complet" on public.nirvana_sync;   -- ⚠ ancienne faille
drop policy if exists "sync auth complet" on public.nirvana_sync;
drop policy if exists "sync auth all"     on public.nirvana_sync;
drop policy if exists "sync config public" on public.nirvana_sync;

-- Comptes connectés : accès complet à toute la gestion.
create policy "sync auth all" on public.nirvana_sync
  for all to authenticated using (true) with check (true);

-- Visiteurs anonymes : lecture de la SEULE ligne `config`
-- (nom, adresse, téléphone à afficher sur la carte publique). Rien d'autre
-- de nirvana_sync ne leur est accessible — ni stock, ni RH, ni ventes.
create policy "sync config public" on public.nirvana_sync
  for select to anon using (collection = 'config');

-- Les collections `users`/`clients` n'ont plus rien à faire ici : les comptes
-- vivent dans auth.users + profils. À exécuter APRÈS la migration des comptes.
--   delete from public.nirvana_sync where collection in ('users','clients');

alter table if exists public.paiements enable row level security;
drop policy if exists "paiements insert anon" on public.paiements;
drop policy if exists "paiements select anon" on public.paiements;
drop policy if exists "paiements auth" on public.paiements;
create policy "paiements auth" on public.paiements
  for all to authenticated using (true) with check (true);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 12. MISE EN SERVICE                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- a) Créez les comptes dans Supabase → Authentication → Users → Add user
--    (cochez « Auto Confirm User »). Convention d'e-mail interne :
--       patron@nirvana.local · marie@nirvana.local · dev@nirvana.local
--    Mettez de VRAIS mots de passe — patron123 & co ne survivent pas à v2.
--
-- b) Rattachez chaque compte à son profil (remplacez l'e-mail) :
--
--   insert into public.profils (id, identifiant, nom, role)
--   select id, 'patron', 'Le Patron', 'admin' from auth.users where email = 'patron@nirvana.local'
--   on conflict (id) do update set identifiant = excluded.identifiant,
--                                  nom = excluded.nom, role = excluded.role;
--
--   insert into public.profils (id, identifiant, nom, role)
--   select id, 'marie', 'Marie Hoarau', 'employe' from auth.users where email = 'marie@nirvana.local'
--   on conflict (id) do update set identifiant = excluded.identifiant,
--                                  nom = excluded.nom, role = excluded.role;
--
-- c) Vérifiez que tout est verrouillé :
--      select * from public.verifier_integrite();
--    Puis, dans le SQL Editor, tentez :
--      update public.ventes set total_ttc = 0;   -- doit lever une exception
--
-- d) CONSERVATION 6 ANS : Supabase → Settings → Database → activez les
--    sauvegardes quotidiennes (Point-in-Time Recovery si dispo). Exportez le
--    FEC à chaque clôture annuelle et archivez-le hors ligne :
--      select * from public.export_fec('2026-01-01','2026-12-31');
-- ════════════════════════════════════════════════════════════════════════════
