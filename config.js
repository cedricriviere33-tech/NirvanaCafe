/* ════════════════════════════════════════════════════════════════════════
   NIRVANA CAFÉ — config.js
   CE FICHIER CONTIENT VOS CLÉS. Placez-le dans le MÊME dossier que index.html.

   👉 Il ne reste qu'UNE chose à faire : coller votre clé "anon public".
      Supabase → Project Settings → API → "anon public" → copiez la longue
      clé qui commence par eyJ... et remplacez VOTRE_CLE_ANON_ICI ci-dessous.

   (L'URL est déjà pré-remplie avec votre projet. La clé anon est publique
    par nature : elle peut figurer dans ce fichier, protégée par les règles
    RLS de Supabase — voir supabase-schema.sql.)
   ════════════════════════════════════════════════════════════════════════ */

window.NIRVANA_SUPABASE_URL      = 'https://wdbgowdzfdbegsyflnon.supabase.co';
window.NIRVANA_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkYmdvd2R6ZmRiZWdzeWZsbm9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzA4NzcsImV4cCI6MjEwMjgwNjg3N30.fR1ItzjAGyokCW2XsBB939tKd1bwWKtKHNBdx-ArMqA';

/* Coordonnées affichées sur la carte publique (facultatif) */
window.NIRVANA_NOM     = 'Nirvana Café';
window.NIRVANA_TEL     = '0693 43 31 99';
window.NIRVANA_ADRESSE = '8 Rue Philibert, Saint-Denis 97400, La Réunion';
window.NIRVANA_MAPS    = '4C7W+8V Saint-Denis, La Réunion';

/* Paiement smartphone (facultatif) */
window.NIRVANA_PAY_PROVIDER = 'PayPal';
window.NIRVANA_PAY_BASE     = '';
window.NIRVANA_PAY_DEEPLINK = '';
