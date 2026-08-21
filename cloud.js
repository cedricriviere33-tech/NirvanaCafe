/* ════════════════════════════════════════════════════════════════════════
   NIRVANA CAFÉ — cloud.js v2  (adaptateur Supabase → window.NirvanaCloud)

   Nécessite (chargés AVANT ce fichier dans index.html) :
     - config.js         → window.NIRVANA_SUPABASE_URL / window.NIRVANA_SUPABASE_ANON_KEY
     - @supabase/supabase-js (CDN) → window.supabase

   NOUVEAU en v2 :
     · Supabase Auth (persistSession:true) → plus aucun mot de passe dans la base
     · La caisse passe par des fonctions serveur (RPC) : le numéro, l'horodatage,
       le hachage et le cumul perpétuel sont produits par PostgreSQL, jamais ici.
       Le navigateur NE PEUT PAS écrire une vente directement (la RLS refuse).
   ════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var KEY = window.NIRVANA_SUPABASE_ANON_KEY || '';
  var client = null;
  var _profil = null;   // { id, identifiant, nom, role, actif }

  // Normalise l'URL : on garde SEULEMENT https://xxx.supabase.co
  var RAW = (window.NIRVANA_SUPABASE_URL || '').trim();
  var URL = RAW.replace(/\s+/g,'')
               .replace(/\/+$/,'')
               .replace(/\/rest\/v1$/i,'')
               .replace(/\/auth\/v1$/i,'')
               .replace(/\/+$/,'');
  if (RAW && RAW !== URL) console.warn('[Nirvana] URL Supabase corrigée :', RAW, '→', URL);

  // Les comptes sont 'patron', 'marie'… à l'écran, mais Supabase Auth exige un
  // e-mail. Convention : identifiant@<domaine>. Surchargable via config.js.
  var AUTH_DOMAIN = window.NIRVANA_AUTH_DOMAIN || 'nirvana.local';

  if (URL && KEY && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      client = window.supabase.createClient(URL, KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
      console.log('[Nirvana] cloud.js v2 prêt · Supabase =', URL);
    } catch (e) {
      console.warn('[Nirvana] createClient échoué :', e.message);
      client = null;
    }
  } else {
    console.log('[Nirvana] cloud.js : Supabase non configuré ou hors-ligne — cloud désactivé');
  }

  function ready(){ return !!client && navigator.onLine; }
  function emailDe(identifiant){
    var s = String(identifiant || '').trim().toLowerCase();
    return s.indexOf('@') > -1 ? s : s + '@' + AUTH_DOMAIN;
  }

  /* ─────────────────────── AUTHENTIFICATION ─────────────────────── */

  function profilCourant(){
    return client.auth.getUser().then(function(r){
      var u = r && r.data && r.data.user;
      if (!u) { _profil = null; return null; }
      return client.from('profils').select('id,identifiant,nom,role,actif').eq('id', u.id).maybeSingle()
        .then(function(res){
          if (res.error || !res.data) { _profil = null; return null; }
          _profil = res.data;
          return _profil;
        });
    }).catch(function(){ _profil = null; return null; });
  }

  function signIn(identifiant, motdepasse){
    if (!client) return Promise.resolve({ ok:false, err:'Cloud non configuré.' });
    if (!navigator.onLine) return Promise.resolve({ ok:false, err:'Connexion Internet requise.' });
    return client.auth.signInWithPassword({ email: emailDe(identifiant), password: motdepasse })
      .then(function(res){
        if (res.error) return { ok:false, err:'Identifiant ou mot de passe incorrect.' };
        return profilCourant().then(function(p){
          if (!p)       return client.auth.signOut().then(function(){ return { ok:false, err:'Aucun profil rattaché à ce compte (voir §12 du schéma SQL).' }; });
          if (!p.actif) return client.auth.signOut().then(function(){ return { ok:false, err:'Compte désactivé.' }; });
          return { ok:true, profil:p };
        });
      })
      .catch(function(e){ return { ok:false, err:e.message }; });
  }

  function signOut(){
    _profil = null;
    if (!client) return Promise.resolve(true);
    return client.auth.signOut().then(function(){ return true; }).catch(function(){ return true; });
  }

  // Session existante (rechargement de page / réouverture de la PWA)
  function session(){
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(function(r){
      if (!r || !r.data || !r.data.session) return null;
      return profilCourant();
    }).catch(function(){ return null; });
  }
  function profil(){ return _profil; }

  /* ─────────────────────── CAISSE (RPC serveur) ─────────────────────── */

  function enregistrerVente(p){
    if (!ready()) return Promise.reject(new Error('Encaissement impossible hors-ligne.'));
    return client.rpc('enregistrer_vente', {
      p_mode: p.mode, p_paiement: p.paiement, p_lignes: p.lignes,
      p_total_ht: p.total_ht, p_total_tva: p.total_tva, p_total_ttc: p.total_ttc,
      p_ventilation: p.ventilation, p_table_nom: p.table_nom || null,
      p_type: 'vente', p_annule: null, p_motif: null
    }).then(function(res){
      if (res.error) throw new Error(res.error.message);
      return Array.isArray(res.data) ? res.data[0] : res.data;
    });
  }

  function annulerVente(id, motif){
    if (!ready()) return Promise.reject(new Error('Annulation impossible hors-ligne.'));
    return client.rpc('annuler_vente', { p_vente_id: id, p_motif: motif })
      .then(function(res){
        if (res.error) throw new Error(res.error.message);
        return Array.isArray(res.data) ? res.data[0] : res.data;
      });
  }

  function listerVentes(debut, fin){
    if (!ready()) return Promise.resolve(null);
    var q = client.from('ventes').select('*').order('numero', { ascending:false });
    if (debut) q = q.gte('emis_le', debut);
    if (fin)   q = q.lt('emis_le', fin);
    return q.then(function(res){
      if (res.error) { console.warn('[listerVentes]', res.error.message); return null; }
      return res.data || [];
    }).catch(function(){ return null; });
  }

  function venteParId(id){
    if (!ready()) return Promise.resolve(null);
    return client.from('ventes').select('*').eq('id', id).maybeSingle()
      .then(function(res){ return res.error ? null : res.data; }).catch(function(){ return null; });
  }

  /* ─────────────────────── CLÔTURES / CONTRÔLE ─────────────────────── */

  function cloturer(type, periode, fond, especes){
    if (!ready()) return Promise.reject(new Error('Clôture impossible hors-ligne.'));
    return client.rpc('cloturer', {
      p_type: type, p_periode: periode,
      p_fond:    (fond    === undefined || fond    === null || fond    === '') ? null : Number(fond),
      p_especes: (especes === undefined || especes === null || especes === '') ? null : Number(especes)
    }).then(function(res){
      if (res.error) throw new Error(res.error.message);
      return Array.isArray(res.data) ? res.data[0] : res.data;
    });
  }

  function listerClotures(type){
    if (!ready()) return Promise.resolve(null);
    var q = client.from('clotures').select('*').order('periode', { ascending:false }).limit(120);
    if (type) q = q.eq('type', type);
    return q.then(function(res){ return res.error ? null : (res.data || []); }).catch(function(){ return null; });
  }

  function verifierIntegrite(){
    if (!ready()) return Promise.reject(new Error('Contrôle impossible hors-ligne.'));
    return client.rpc('verifier_integrite').then(function(res){
      if (res.error) throw new Error(res.error.message);
      return Array.isArray(res.data) ? res.data[0] : res.data;
    });
  }

  function exportFEC(debut, fin){
    if (!ready()) return Promise.reject(new Error('Export impossible hors-ligne.'));
    return client.rpc('export_fec', { p_debut: debut, p_fin: fin }).then(function(res){
      if (res.error) throw new Error(res.error.message);
      return res.data || [];
    });
  }

  function lireJournal(limite){
    if (!ready()) return Promise.resolve(null);
    return client.from('journal').select('*').order('ts', { ascending:false }).limit(limite || 300)
      .then(function(res){ return res.error ? null : (res.data || []); }).catch(function(){ return null; });
  }

  /* ─────────────────────── COMPTES / PROFILS ─────────────────────── */

  function listerProfils(){
    if (!ready()) return Promise.resolve(null);
    return client.from('profils').select('id,identifiant,nom,role,actif,cree_le').order('identifiant')
      .then(function(res){ return res.error ? null : (res.data || []); }).catch(function(){ return null; });
  }

  /* Crée un compte Auth SANS déconnecter le patron : client éphémère qui ne
     persiste pas sa session. Nécessite « Confirm email » = OFF dans
     Supabase → Authentication → Providers → Email. */
  function creerCompte(identifiant, motdepasse, nom, role){
    if (!ready()) return Promise.reject(new Error('Création impossible hors-ligne.'));
    var tmp;
    try {
      tmp = window.supabase.createClient(URL, KEY, {
        auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
      });
    } catch(e){ return Promise.reject(new Error('Client temporaire indisponible.')); }

    return tmp.auth.signUp({ email: emailDe(identifiant), password: motdepasse })
      .then(function(res){
        if (res.error) throw new Error(res.error.message);
        var uid = res.data && res.data.user && res.data.user.id;
        if (!uid) throw new Error('Compte créé mais confirmation e-mail requise : désactivez « Confirm email » dans Supabase.');
        // C'est le patron (session courante) qui insère le profil → policy « profils gestion admin »
        return client.from('profils').insert({
          id: uid, identifiant: String(identifiant).trim().toLowerCase(), nom: nom, role: role, actif: true
        }).then(function(r2){
          if (r2.error) throw new Error('Compte Auth créé, mais profil refusé : ' + r2.error.message);
          return true;
        });
      });
  }

  function majProfil(id, champs){
    if (!ready()) return Promise.reject(new Error('Modification impossible hors-ligne.'));
    return client.from('profils').update(champs).eq('id', id).then(function(res){
      if (res.error) throw new Error(res.error.message);
      return true;
    });
  }

  /* ─────────── GESTION (stock, RH, fournisseurs…) — inchangé ───────────
     Ces modules ne relèvent PAS de l'obligation « logiciel de caisse ».
     Depuis le schéma v2, nirvana_sync exige d'être authentifié.            */

  function push(collections){
    if (!ready()) return Promise.resolve(false);
    var rows = Object.keys(collections).map(function(name){
      return { collection: name, data: collections[name], updated_at: new Date().toISOString() };
    });
    if (!rows.length) return Promise.resolve(true);
    return client.from('nirvana_sync').upsert(rows, { onConflict: 'collection' })
      .then(function(res){
        if (res.error) { console.warn('[NirvanaCloud.push]', res.error.message); return false; }
        return true;
      })
      .catch(function(e){ console.warn('[NirvanaCloud.push]', e.message); return false; });
  }

  function pull(){
    if (!ready()) return Promise.resolve(null);
    return client.from('nirvana_sync').select('collection,data')
      .then(function(res){
        if (res.error) { console.warn('[NirvanaCloud.pull]', res.error.message); return null; }
        var out = {};
        (res.data || []).forEach(function(r){ out[r.collection] = r.data; });
        return out;
      })
      .catch(function(e){ console.warn('[NirvanaCloud.pull]', e.message); return null; });
  }

  /* La carte publique porte désormais l'information allergène (règlement INCO).
     `allergenes` est calculé côté app à partir des recettes puis figé ici. */
  /* Règle de visibilité de la carte publique :
       · BOISSON  → toujours sur la carte (grisée si rupture de stock)
       · PLAT     → sur la carte UNIQUEMENT si « actif » est coché
     Un plat désactivé est RETIRÉ de la table menu (delete), il ne reste pas grisé.
     Tout est automatique : appelé à chaque synchronisation des produits. */
  function estBoisson(p){ return p.type === 'boisson' || !!p.boissonRef; }
  function visibleCarte(p){ return estBoisson(p) ? true : (p.actif !== false); }

  function publishMenu(produits, meta){
    if (!ready()) return Promise.resolve(false);
    var calc = (meta && meta.allergenes) || function(){ return []; };
    produits = produits || [];

    var visibles = produits.filter(visibleCarte);
    var aRetirer = produits.filter(function(p){ return !visibleCarte(p); }).map(function(p){ return p.id; });

    var rows = visibles.map(function(p){
      return {
        id: p.id, nom: p.nom, description: p.description || '',
        prix: Number(p.prix) || 0,
        // « disponible » ne pilote plus la présence sur la carte, seulement l'état
        // grisé/« Indisponible ». Une boisson inactive = rupture → grisée mais visible.
        disponible: estBoisson(p) ? (p.actif !== false) : true,
        categorie: p.categorie || 'Divers',
        allergenes: calc(p),
        allerg_declare: !!(meta && meta.declare ? meta.declare(p) : false),
        fait_maison: !!p.faitMaison,
        origine_viande: p.origineViande || ''
      };
    });

    // 1) retirer de la carte les plats désactivés  2) publier/mettre à jour les visibles
    var chaine = Promise.resolve();
    if (aRetirer.length){
      chaine = client.from('menu').delete().in('id', aRetirer)
        .then(function(res){ if (res.error) console.warn('[publishMenu.delete]', res.error.message); })
        .catch(function(e){ console.warn('[publishMenu.delete]', e.message); });
    }
    return chaine.then(function(){
      if (!rows.length) return true;
      return client.from('menu').upsert(rows, { onConflict: 'id' })
        .then(function(res){
          if (res.error) { console.warn('[NirvanaCloud.publishMenu]', res.error.message); return false; }
          return true;
        })
        .catch(function(e){ console.warn('[NirvanaCloud.publishMenu]', e.message); return false; });
    });
  }

  function pullCollection(name){
    if (!ready()) return Promise.resolve(null);
    return client.from('nirvana_sync').select('data').eq('collection', name).maybeSingle()
      .then(function(res){ if (res.error) return null; return res.data ? res.data.data : null; })
      .catch(function(){ return null; });
  }

  window.NirvanaCloud = {
    ready: ready,
    signIn: signIn, signOut: signOut, session: session, profil: profil,
    enregistrerVente: enregistrerVente, annulerVente: annulerVente,
    listerVentes: listerVentes, venteParId: venteParId,
    cloturer: cloturer, listerClotures: listerClotures,
    verifierIntegrite: verifierIntegrite, exportFEC: exportFEC, lireJournal: lireJournal,
    listerProfils: listerProfils, creerCompte: creerCompte, majProfil: majProfil,
    push: push, pull: pull, pullCollection: pullCollection, publishMenu: publishMenu
  };
})();
