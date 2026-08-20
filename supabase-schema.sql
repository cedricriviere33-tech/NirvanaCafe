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
