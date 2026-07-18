# Nirvana Café — Cloud (Supabase + Netlify) + hors-ligne (IndexedDB)

Application de gestion de restaurant. **Deux niveaux de stockage** qui se relaient automatiquement :

| Niveau | Rôle | Techno |
|---|---|---|
| **Cloud** | Base partagée **temps réel** entre tous les appareils (PC / smartphone) | Supabase (PostgreSQL) |
| **Local (SOS)** | Cache sur l'appareil, fonctionne **sans réseau** | IndexedDB |

Si Internet tombe, l'app bascule seule en local (mode SOS) et **resynchronise au retour du réseau**. XAMPP n'est plus utilisé.

La **page d'accueil est la carte** (menu du jour, lecture seule, publique). Un bouton **⭐ Se connecter** en haut à droite ouvre l'espace employé.

---

## Fichiers a mettre sur GitHub

```
nirvana-cafe/
├── index.html            <- l'app : accueil = la carte + espace employe
├── menu.html             <- menu public leger (cible alternative du QR code)
├── terminal.html         <- terminal de paiement smartphone
├── qrcode.js             <- generateur QR (offline)
├── cloud.js              <- connecteur Supabase (window.NirvanaCloud)
├── config.js             <- VOS cles (genere au build Netlify - NE PAS committer)
├── config.example.js     <- modele de config
├── supabase-schema.sql   <- a executer dans Supabase
├── netlify.toml          <- config de deploiement
├── generate-config.sh    <- genere config.js depuis les variables Netlify
└── .gitignore            <- ignore config.js
```

`.gitignore` contient : `config.js`

---

# SYNCHRONISER SUPABASE + NETLIFY - PAS A PAS

> Objectif : ce que vous saisissez sur le PC apparait en temps reel sur le smartphone (et inversement).

## Etape 1 - Creer la base Supabase
1. Allez sur **https://supabase.com** -> **New project** (gratuit). Choisissez un mot de passe de base et une region proche (Europe).
2. Attendez ~2 min que le projet soit pret.
3. Menu de gauche **SQL Editor** -> **New query** -> copiez-collez **tout** le contenu de `supabase-schema.sql` -> bouton **Run**.
   Cela cree les tables `menu`, `nirvana_sync`, `paiements` et leurs regles de securite.

## Etape 2 - Recuperer vos cles
1. Menu **Project Settings** (roue crantee) -> **API**.
2. Notez deux valeurs :
   - **Project URL** -> ex. `https://abcd1234.supabase.co`
   - **Project API keys -> anon public** -> une longue cle `eyJ...`

> **!!! ERREUR LA PLUS FREQUENTE !!!** Pour `SUPABASE_URL`, mettez UNIQUEMENT
> `https://abcd1234.supabase.co` — **SANS** `/rest/v1` a la fin. Si vous collez
> l'URL du "REST endpoint" (`.../rest/v1/`), le chemin est double et la synchro
> renvoie des erreurs 404 (`/rest/v1/rest/v1/...`). Le code corrige desormais ce
> cas automatiquement, mais mettez la bonne URL par securite.

## Etape 3 - Mettre le code sur GitHub
1. Creez un depot GitHub (ex. `nirvana-cafe`).
2. Uploadez-y tous les fichiers **sauf `config.js`**.

## Etape 4 - Deployer sur Netlify
1. Sur **https://netlify.com** -> **Add new site -> Import an existing project** -> **GitHub** -> choisissez votre depot.
2. Laissez les reglages par defaut (Netlify lit `netlify.toml`) -> **Deploy**.

## Etape 5 - Brancher les cles (LE point cle pour la synchro)
1. Dans Netlify : **Site configuration -> Environment variables -> Add a variable**.
2. Ajoutez :

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | votre Project URL |
   | `SUPABASE_ANON_KEY` | votre cle anon public |
   | `RESTO_NOM` | `Nirvana Cafe` |
   | `RESTO_TEL` | `+262 692 00 00 00` |
   | `RESTO_MAPS` | lien Google Maps |
   | `PAY_BASE` | votre lien de paiement (SumUp/Stripe/PayPal...) - optionnel |

3. **Deploys -> Trigger deploy -> Deploy site** (pour regenerer `config.js` avec les cles).

## Etape 6 - Verifier la synchro
1. Ouvrez `https://votre-site.netlify.app` sur le **PC**, connectez-vous (**patron / patron123**), modifiez un produit.
2. Ouvrez la **meme URL** sur le **smartphone**, connectez-vous.
   Vous devez voir la modification. Sinon, onglet **Systeme -> "Tout recuperer (cloud)"**.

**Comment marche le temps reel :** a la connexion, et chaque fois que vous revenez sur l'app (changement d'onglet/app), elle **recupere les donnees du cloud**. Chaque enregistrement est **renvoye vers le cloud** dans la foulee. Le **chat equipe** et **le menu** se rafraichissent automatiquement (toutes les ~9 s).

> Faites votre premiere configuration sur **un seul appareil** (le PC), puis connectez le smartphone : il recuperera la base.

---

## Securite (a lire)
- La cle **anon est publique** par nature (visible dans le navigateur). Les variables Netlify servent a ne pas la mettre dans Git, **pas** a la cacher. La vraie protection = les **regles RLS** du fichier `.sql`.
- Le schema fournit une version simple (demarrage rapide) **et** une version securisee (acces reserve aux utilisateurs connectes via **Supabase Auth**) - activez-la en production.
- Vos comptes employes (mots de passe **haches**, jamais en clair) sont stockes dans **votre** projet Supabase pour permettre la connexion multi-appareils. Securisez le projet (RLS/Auth) pour un vrai cloisonnement.

---

## La carte (accueil)
- **Lecture seule**, en-tete repris de l'onglet **Ticket de caisse** (nom, telephone, lien Maps, reseaux sociaux).
- Filtres : **Toute la carte / Plats / Boissons soft / Alcoolisees**.
- Modifiez-la apres connexion, onglet **Produits & Stock** : bouton **Dispo / Plus dispo** a droite de chaque produit. "Plus dispo" le retire de la carte et de la caisse instantanement.

## Terminal de paiement (terminal.html) - la verite sur le NFC
Un site web **ne peut pas** debiter une carte en NFC (interdit par les navigateurs et la norme bancaire). Le sans-contact reel passe par une **app certifiee** (Tap to Pay) + un prestataire agree. Ce que le terminal fait legalement : **QR de paiement** (le client paie depuis son mobile), **renvoi vers votre app** SumUp/Stripe, et **Web NFC** pour les etiquettes (Android). Configuration dans l'app -> onglet **Paiement CB**.

## Chat equipe
Bulle en bas a droite : messagerie interne, badge de non-lus, notification sonore et toast. Synchronise via le cloud (~9 s).

## Comptes de demonstration (a changer)
- **patron** / `patron123` - gestion complete
- **dev** / `dev1234` - systeme, synchro, sauvegarde
- **marie** / `marie123` - employe (caisse, cuisine)

---

## Nouveautes (mise a jour)

**Installation sur l'ecran d'accueil (PWA).** Le site est installable : une bulle "Installez Nirvana Cafe" s'affiche sur la carte (Android/Chrome : bouton Installer ; iPhone : Partager -> Sur l'ecran d'accueil). L'icone utilisee est le logo etoile. Fichiers ajoutes : `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (a mettre a la racine du depot). Le service worker permet aussi un affichage hors-ligne du menu.

**Carte d'accueil embellie** : fond moutarde etoile anime, logo anime, date du jour affichee, texte noir. Le numero de telephone est cliquable (lance l'appel), et le bouton Itineraire ouvre Google Maps meme si vous avez saisi une simple adresse (plus d'erreur "site inaccessible").

> Astuce Maps : dans Ticket de caisse, vous pouvez mettre soit un vrai lien Maps, soit juste l'adresse ("8 rue Philibert, Saint-Denis 97400") — l'app construit le bon lien toute seule.

**Caisse plug & play iPad** : gros boutons d'action, tables plus grandes.

**Compte rendu du jour (cloture caisse)** : dans Caisse, bouton "Compte rendu" -> total du jour, detail par mode de paiement, controle especes (entree = sortie, calcul de l'ecart). Bouton "Historique caisse" (patron) : cloture enregistree par jour, modifiable et supprimable.

**Registre / remboursement** : dans Ventes, le patron peut corriger, supprimer et **rembourser** un ticket (bouton retour) ; le montant est deduit du chiffre du jour et trace.

**RH — planning hebdomadaire** : onglet Employes -> bouton "Planning" par employe -> bulle Lundi-Dimanche avec heure d'entree/sortie par jour, plus boutons "Conge" et "Arret maladie". Tout s'affiche automatiquement sur le calendrier de l'onglet Planning (une couleur par employe, conges en violet, maladie en rouge).
