/* ═══════════════════════════════════════════════════════════════════════════
   NIRVANA CAFÉ — Configuration
   ⚠ REMPLACEZ LES DEUX PREMIÈRES VALEURS par celles de VOTRE projet Supabase.
     Supabase → Settings → API :
       · Project URL      → NIRVANA_SUPABASE_URL   (sans /rest/v1 à la fin)
       · anon  public key → NIRVANA_SUPABASE_ANON_KEY  (la clé "anon", PAS "service_role")
     Les deux DOIVENT venir du MÊME projet (même écran).
     La clé anon est publique par nature : elle peut vivre ici et sur GitHub.
   ═══════════════════════════════════════════════════════════════════════════ */

window.NIRVANA_SUPABASE_URL      = 'https://yzuxprotdlsmyfnimuzm.supabase.co';
window.NIRVANA_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6dXhwcm90ZGxzbXlmbmltdXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTA5MzEsImV4cCI6MjEwMjgyNjkzMX0.x56GtezcUZkWIKXaTWL6Lv-BVcRK9Sb84k8Z2HVGpVo';

/* Domaine e-mail interne des comptes (identifiant → identifiant@ce-domaine).
   Ne pas changer sans raison : les comptes créés dans Supabase Auth l'utilisent. */
window.NIRVANA_AUTH_DOMAIN = 'nirvana.local';

/* ─── Informations affichées sur la carte publique ─── */
window.NIRVANA_NOM     = 'Nirvana Café';
window.NIRVANA_TEL     = '0693 43 31 99';
window.NIRVANA_ADRESSE = '8 Rue Philibert, Saint-Denis 97400, La Réunion';
window.NIRVANA_MAPS    = '';   // lien Google Maps ou plus-code, optionnel

/* ─── Paiement (optionnel) ─── */
window.NIRVANA_PAY_PROVIDER = '';
window.NIRVANA_PAY_BASE     = '';
window.NIRVANA_PAY_DEEPLINK = '';
