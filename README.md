# Nirvana Café — Application de gestion

PWA de gestion pour restaurant/snack à La Réunion : carte publique + caisse,
stock, RH, comptabilité micro-entreprise, fidélité. Front statique (HTML/CSS/JS),
backend Supabase (PostgreSQL + Auth).

---

## Déploiement — 3 étapes

### 1. Supabase (base de données + authentification)

1. Créez un projet sur supabase.com.
2. **SQL Editor → New query** → collez **tout** le fichier
   `supabase-install-complet.sql` → **Run**.
   (Il contient le schéma de base + la couche Auth/conformité. Réexécutable sans risque.)
3. **Settings → API** : copiez **Project URL** et la clé **anon public**.
4. **Authentication → Providers → Email** → décochez **« Confirm email »** → Save.
5. **Authentication → Users → Add user** :
   - Email : `patron@nirvana.local`
   - Mot de passe : au choix (à retenir)
   - ✅ cochez **« Auto Confirm User »**
   - Create user
6. **SQL Editor** → rattachez le profil admin :

   ```sql
   insert into public.profils (id, identifiant, nom, role, actif)
   select id, 'patron', 'Le Patron', 'admin', true
   from auth.users where email = 'patron@nirvana.local'
   on conflict (id) do update
     set identifiant = excluded.identifiant, nom = excluded.nom,
         role = excluded.role, actif = true;
   ```

### 2. config.js

Ouvrez `config.js` et remplacez les deux premières valeurs par votre
**Project URL** et votre clé **anon public** (celles de l'étape 1.3).
⚠ La clé « anon », PAS « service_role ». Les deux du même projet.

### 3. Hébergement (site statique)

Aucun build. La racine du dépôt EST le site.

**Coolify** : New Resource → **Static** (ou Dockerfile ci-dessous) →
connectez le dépôt Git → publier. Le dossier à servir est la racine (`.`).

**Netlify / autre** : publier `.`, aucune commande de build.

---

## Connexion

Sur l'écran de connexion, identifiant **`patron`** (sans `@nirvana.local`,
l'app l'ajoute) + votre mot de passe.

Bouton **🧪 Mode test** : explore toutes les fonctionnalités sans toucher
à la base (données fictives en mémoire).

---

## Coolify — Dockerfile optionnel (si "Static" ne suffit pas)

Placez ce `Dockerfile` à la racine :

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
# En-têtes utiles pour la PWA (service worker à revalider)
RUN printf 'location = /sw.js { add_header Cache-Control "no-cache"; }\n' \
  > /etc/nginx/conf.d/pwa.conf.snippet
EXPOSE 80
```

Coolify servira le site sur le port 80. HTTPS géré par Coolify (indispensable
pour la PWA et le service worker).

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Application complète (caisse + gestion) |
| `menu.html` | Carte publique (lecture seule, allergènes) |
| `terminal.html` | Terminal d'encaissement autonome |
| `cloud.js` | Adaptateur Supabase (Auth + RPC) |
| `config.js` | **Vos clés Supabase — à remplir** |
| `sw.js` | Service worker (mode hors-ligne PWA) |
| `manifest.json`, `icon-*.png` | Installation PWA |
| `qrcode.js` | Génération de QR codes (hors-ligne) |
| `supabase-install-complet.sql` | **À coller dans Supabase** (schéma complet) |
| `supabase-schema.sql`, `supabase-schema-v2.sql` | Les deux parties séparées (référence) |
| `test-v2.js`, `test-sync.js` | Tests (Node, non déployés) |

---

## Notes importantes

- **TVA** : La Réunion (8,5 % / 2,1 %), pas la métropole. Réglable dans
  Comptabilité → Régime fiscal.
- **Franchise en base** (micro-entreprise) : aucune TVA facturée, dispense
  de l'obligation « logiciel de caisse certifié ». L'app surveille les seuils.
- **URSSAF** : le taux de cotisations n'est PAS prérempli (il varie, taux DOM
  possibles). À demander à l'URSSAF Réunion puis à saisir une fois.
- **À faire valider par un professionnel** (CCI Réunion, SIE, URSSAF, ou
  expert-comptable) avant ouverture : régime, date de début, prorata 1re année.
- Cette application n'a pas été auditée juridiquement ; elle fournit des outils,
  pas une garantie de conformité.
