/* Banc de test v2 — conformité caisse + synchronisation.
   Lance : node test-v2.js                                                    */
const fs = require('fs'), path = require('path'), vm = require('vm');

function extraireJS(){
  const h = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const scripts = [...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  let js = scripts.reduce((a,b)=>a.length>b.length?a:b);
  js = js.replace(/\(async function init\(\)\{[\s\S]*?\n\}\)\(\);/, `
async function __boot(){
  await DB.init(); Sync._loadQueue();
  await cloudPullAll(true); await loadAll(); await seedIfEmpty(); await loadAll();
  await migrateVersAuth();
}
module.exports = { DB, Sync, state, cloudPullAll, seedIfEmpty, __boot, loadAll,
  computeTotals, venteServeurVersLocal, chargerVentesCloud, confirmEncaisse,
  todayReportLive, tauxTVA, tauxDefaut, tauxDispo, NON_SYNC, r2,
  entreprise, enFranchise, estMicro, seuils, caAnnee, alerteSeuils, Sandbox,
  ALLERGENES, allergenesDeduits, allergenesProduit, allergDeclare, produitsSansAllergenes,
  cleFid, numFid, parseFid, carteParNum, confFid, ajouterTampon, utiliserRecompense,
  confRgpd, auditPurge, lancerPurge, moisAvant, caPeriode, periodesUrssaf, confUrssaf };
`);
  js = js.replace("'use strict';", '', 1);
  return js;
}

function mkEnv(){
  const store = {};
  global.localStorage = { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);},
    removeItem:k=>{delete store[k];}, clear:()=>{for(const k in store)delete store[k];} };
  global.indexedDB = { open:function(){ var r={}; setTimeout(function(){ if(r.onerror) r.onerror({target:{}}); },0); return r; } };
  global.fetch = global.fetch || (()=>Promise.reject(new Error('no fetch in test')));
  Object.defineProperty(global,'navigator',{value:{onLine:true},configurable:true,writable:true});
  global.window = global;
  global.addEventListener = ()=>{};
  global.CanvasRenderingContext2D = function(){}; global.CanvasRenderingContext2D.prototype={roundRect(){}};
  global.AudioContext = function(){ return {createOscillator:()=>({connect(){},start(){},stop(){},frequency:{setValueAtTime(){}}}),
    createGain:()=>({connect(){},gain:{exponentialRampToValueAtTime(){}}}),close(){},currentTime:0,destination:{}}; };
  // Node ne dessine pas : on neutralise le canvas (clientWidth + contexte 2D)
  const el = ()=>({ innerHTML:'', style:{}, classList:{add(){},remove(){},toggle(){}}, textContent:'',
                    value:'', checked:false, disabled:false, appendChild(){}, remove(){}, focus(){},
                    clientWidth:600, height:200, width:600, parentElement:{clientWidth:600},
                    getContext:()=>{ const grad={addColorStop(){}};
                      return new Proxy({}, {get:(t,k)=>{
                        if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>grad;
                        if(k==='measureText') return ()=>({width:10});
                        return ()=>{};
                      }, set:()=>true}); } });
  global.document = { addEventListener(){}, getElementById:()=>el(), createElement:()=>el(),
                      querySelector:()=>el(), querySelectorAll:()=>[] };
  global.TextEncoder = require('util').TextEncoder; global.TextDecoder = require('util').TextDecoder;
  global.crypto = require('crypto').webcrypto;
  global.btoa = s=>Buffer.from(s,'binary').toString('base64');
  global.atob = s=>Buffer.from(s,'base64').toString('binary');
  global.print = ()=>{}; global.URL = { createObjectURL:()=>'blob:x', revokeObjectURL:()=>{} };
  global.Blob = function(){};
  global.confirm = ()=>true; global.alert = ()=>{};
  return store;
}

function charger(){
  const f = path.join(__dirname,'.test-app-v2.js');
  fs.writeFileSync(f, extraireJS());
  delete require.cache[require.resolve(f)];
  return require(f);
}

const TABLES_CLOUD = ()=>({
  config:{seeded:true, entreprise:{regime:'micro',tva:'reel',territoire:'reunion',activite:'restauration'}},
  tables:[{id:'t1',nom:'T1',etat:'libre',zone:'interieur',ticket:[]},
          {id:'t2',nom:'T2',etat:'libre',zone:'terrasse',ticket:[]}],
  produits:[{id:'p1',nom:'Cari poulet',prix:13,tva:2.1,categorie:'Plats',type:'plat'}],
  ingredients:[], commandes:[]
});

let pass=0, fail=0;
const check=(l,c,d)=>{ if(c){pass++;console.log('  ✅ '+l);} else {fail++;console.log('  ❌ '+l+(d?'  → '+d:''));} };

(async ()=>{

/* ═════ 1. TVA — La Réunion, pas la métropole ═════ */
console.log('\n[1] Taux de TVA réunionnais (art. 296 du CGI)');
{
  mkEnv();
  global.NirvanaCloud = { ready:()=>true, pull:async()=>({}), push:async()=>true, publishMenu:async()=>true };
  const app = charger();
  app.state.config = { entreprise:{regime:'micro', tva:'reel', territoire:'reunion', activite:'restauration'} };

  check('taux par défaut restauration = 2,1 % (et non 10 %)', app.tauxDefaut(false)===2.1, app.tauxDefaut(false));
  check('taux par défaut alcool = 8,5 % (et non 20 %)', app.tauxDefaut(true)===8.5, app.tauxDefaut(true));
  check('les taux proposés sont ceux du DOM',
        app.tauxDispo().map(o=>o.t).sort((a,b)=>a-b).join(',')==='1.05,1.75,2.1,8.5',
        app.tauxDispo().map(o=>o.t).join(','));

  const tk=[ {nom:'Rougail saucisse', prix:12.50, qte:2, tva:2.1},
             {nom:'Bière Dodo',       prix:3.50,  qte:2, tva:8.5} ];
  const T=app.computeTotals(tk,'surplace');
  check('TTC = 32,00 €', T.ttc===32.00, 'ttc='+T.ttc);
  check('HT + TVA = TTC', app.r2(T.ht+T.tva)===T.ttc, T.ht+'+'+T.tva);
  check('ventilation aux taux DOM', Object.keys(T.ventilation).sort().join(',')==='2.10,8.50',
        Object.keys(T.ventilation).join(','));
  check('TVA 2,1 % sur 25,00 € TTC = 0,51 €', T.ventilation['2.10'].tva===0.51,
        JSON.stringify(T.ventilation['2.10']));
  check('TVA 8,5 % sur 7,00 € TTC = 0,55 €', T.ventilation['8.50'].tva===0.55,
        JSON.stringify(T.ventilation['8.50']));

  // Bascule métropole
  app.state.config.entreprise.territoire='metropole';
  check('en métropole, le défaut redevient 10 %', app.tauxDefaut(false)===10);
  check('en métropole, l\'alcool redevient 20 %', app.tauxDefaut(true)===20);
}

/* ═════ 1bis. Franchise en base — aucune TVA ═════ */
console.log('\n[1bis] Franchise en base de TVA (art. 293 B)');
{
  mkEnv();
  global.NirvanaCloud = { ready:()=>true, pull:async()=>({}), push:async()=>true, publishMenu:async()=>true };
  const app = charger();
  app.state.config = { entreprise:{regime:'micro', tva:'franchise', territoire:'reunion', activite:'restauration'} };

  check('enFranchise() détecté', app.enFranchise()===true);
  check('le taux est forcé à 0, même si le produit en porte un',
        app.tauxTVA({tva:8.5, alcool:true})===0);
  const T=app.computeTotals([{nom:'Cari',prix:13,qte:2,tva:2.1}],'surplace');
  check('HT = TTC (pas de TVA)', T.ht===26 && T.ttc===26, T.ht+'/'+T.ttc);
  check('TVA = 0', T.tva===0);
  check('ventilation vide → le ticket n\'affichera aucune TVA',
        Object.keys(T.ventilation).length===0, JSON.stringify(T.ventilation));
  check('la ligne porte un taux 0', T.lignes[0].taux_tva===0);
}

/* ═════ 1ter. Seuils et alertes ═════ */
console.log('\n[1ter] Surveillance des seuils (restauration)');
{
  mkEnv();
  global.NirvanaCloud = { ready:()=>true, pull:async()=>({}), push:async()=>true, publishMenu:async()=>true };
  const app = charger();
  const e = {regime:'micro', tva:'franchise', territoire:'reunion', activite:'restauration'};
  app.state.config = { entreprise:e };
  const S = app.seuils();
  check('seuil de franchise restauration = 85 000 €', S.franchise===85000, S.franchise);
  check('seuil majoré = 93 500 €', S.majore===93500, S.majore);
  check('plafond micro = 203 100 €', S.micro===203100, S.micro);

  const an=new Date().getFullYear();
  app.state.ventes=[{ts:an+'-03-01T12:00:00Z',total:40000},{ts:an+'-06-01T12:00:00Z',total:30000}];
  check('CA annuel = somme des encaissements', app.caAnnee()===70000, app.caAnnee());
  check('à 70 000 € : alerte d\'approche', app.alerteSeuils(70000,S,e).includes('approchez'));
  check('à 88 000 € : seuil de franchise dépassé',
        app.alerteSeuils(88000,S,e).includes('Seuil de franchise dépassé'));
  check('à 95 000 € : redevable immédiatement',
        app.alerteSeuils(95000,S,e).includes('Seuil majoré dépassé'));
  check('en franchise sous le seuil : aucune alerte', app.alerteSeuils(10000,S,e)==='');
}

/* ═════ 2. Base 100 % vierge ═════ */
console.log('\n[2] Première ouverture — base 100 % vierge');
{
  mkEnv();
  const pushes=[];
  global.NirvanaCloud={ ready:()=>true, pull:async()=>({}), push:async(b)=>{pushes.push(Object.keys(b));return true;},
    publishMenu:async()=>true, pullCollection:async()=>null };
  const app=charger();
  await app.__boot();
  check('aucun compte', app.state.users.length===0, JSON.stringify(app.state.users));
  check('aucun produit', app.state.produits.length===0, JSON.stringify(app.state.produits));
  check('aucune table', app.state.tables.length===0, JSON.stringify(app.state.tables));
  check('aucun ingrédient / fournisseur / employé',
        app.state.ingredients.length===0 && app.state.fournisseurs.length===0 && app.state.employes.length===0);
  check('aucun supplément ni charge de démo',
        (app.state.supplements||[]).length===0 && (app.state.charges||[]).length===0);
  check('la config minimale est posée', app.state.config.seeded===true && !!app.state.config.entreprise);
  check('régime par défaut : micro + franchise + Réunion',
        app.state.config.entreprise.regime==='micro' && app.state.config.entreprise.tva==='franchise'
        && app.state.config.entreprise.territoire==='reunion');
  check('rien n\'est poussé au démarrage', pushes.length===0, JSON.stringify(pushes));
}

/* ═════ 3. ventes / users ne transitent plus par nirvana_sync ═════ */
console.log('\n[3] Cloisonnement des collections serveur');
{
  mkEnv();
  const pushes=[];
  global.NirvanaCloud={ ready:()=>true,
    pull:async()=>({ produits:[{id:'p1',nom:'Cari',prix:13,tva:2.1}], config:{seeded:true},
                     ventes:[{id:'PIRATE',total:99999}], users:[{user:'pirate',pass:'x'}] }),
    push:async(b)=>{pushes.push(Object.keys(b));return true;}, publishMenu:async()=>true,
    listerVentes:async()=>[], pullCollection:async()=>null };
  const app=charger();
  await app.__boot();
  check('une collection `ventes` piégée dans nirvana_sync est ignorée',
        !app.state.ventes.some(v=>v.id==='PIRATE'), JSON.stringify(app.state.ventes));
  check('une collection `users` piégée est ignorée', app.state.users.length===0);

  app.Sync._pulledOnce=true;
  app.Sync.queue('ventes'); app.Sync.queue('users'); app.Sync.queue('produits');
  check('Sync refuse de mettre `ventes` en file', !app.Sync._queue.has('ventes'));
  check('Sync refuse de mettre `users` en file', !app.Sync._queue.has('users'));
  check('mais accepte `produits`', app.Sync._queue.has('produits'));
  await app.Sync.flush();
  check('le push ne contient jamais ventes/users',
        pushes.every(p=>!p.includes('ventes') && !p.includes('users')), JSON.stringify(pushes));
}

/* ═════ 4. Encaissement : EN LIGNE OBLIGATOIRE ═════ */
console.log('\n[4] Encaissement hors-ligne → refusé, table préservée');
{
  mkEnv();
  let appele=0;
  global.NirvanaCloud={ ready:()=>true, pull:async()=>TABLES_CLOUD(), push:async()=>true,
    publishMenu:async()=>true, listerVentes:async()=>[], pullCollection:async()=>null,
    enregistrerVente:async()=>{ appele++; return {numero:'2026-000001'}; } };
  const app=charger();
  await app.__boot();
  const t=app.state.tables[0];
  t.ticket=[{prodId:'p1',nom:'Cari poulet',prix:13,qte:1,tva:2.1,sentQte:0}];
  t.etat='occupee';
  app.state.bulleMode='surplace'; app.state.bulleTableId=t.id;
  app.state.user={id:'u1',nom:'Marie',role:'employe'};

  navigator.onLine=false; app.Sync.online=false;
  global._pm='cb';
  await app.confirmEncaisse(13);
  check('le serveur n\'est PAS appelé hors-ligne', appele===0);
  check('la table n\'est PAS vidée', t.ticket.length===1, JSON.stringify(t.ticket));
  check('aucune vente fantôme', app.state.ventes.length===0);
}

/* ═════ 5. Encaissement refusé par le serveur → rien n'est perdu ═════ */
console.log('\n[5] Refus serveur → la commande reste sur la table');
{
  mkEnv();
  global.NirvanaCloud={ ready:()=>true, pull:async()=>TABLES_CLOUD(), push:async()=>true,
    publishMenu:async()=>true, listerVentes:async()=>[], pullCollection:async()=>null,
    enregistrerVente:async()=>{ throw new Error('Profil inconnu ou désactivé'); } };
  const app=charger();
  await app.__boot();
  const t=app.state.tables[0];
  t.ticket=[{prodId:'p1',nom:'Cari poulet',prix:13,qte:1,tva:2.1,sentQte:0}]; t.etat='occupee';
  app.state.bulleMode='surplace'; app.state.bulleTableId=t.id;
  app.state.user={id:'u1',nom:'Marie',role:'employe'};
  navigator.onLine=true; app.Sync.online=true; global._pm='cb';
  await app.confirmEncaisse(13);
  check('la table conserve sa commande', t.ticket.length===1);
  check('la table reste occupée', t.etat==='occupee');
  check('aucune vente enregistrée', app.state.ventes.length===0);
}

/* ═════ 6. Encaissement réussi → c'est le SERVEUR qui numérote ═════ */
console.log('\n[6] Encaissement accepté');
{
  mkEnv();
  let recu=null;
  global.NirvanaCloud={ ready:()=>true, pull:async()=>TABLES_CLOUD(), push:async()=>true,
    publishMenu:async()=>true, listerVentes:async()=>[], pullCollection:async()=>null,
    enregistrerVente:async(p)=>{ recu=p; return {
      id:'srv-1', numero:'2026-000042', emis_le:new Date().toISOString(), mode:p.mode,
      paiement:p.paiement, table_nom:p.table_nom, lignes:p.lignes, total_ht:p.total_ht,
      total_tva:p.total_tva, total_ttc:p.total_ttc, ventilation_tva:p.ventilation,
      type:'vente', caissier_nom:'Marie', cumul_perpetuel:42.00, hash:'abcdef123456' }; } };
  const app=charger();
  await app.__boot();
  const t=app.state.tables[0];
  t.ticket=[{prodId:'p1',nom:'Cari poulet',prix:13,qte:1,tva:2.1,sentQte:0}]; t.etat='occupee';
  app.state.bulleMode='surplace'; app.state.bulleTableId=t.id;
  app.state.user={id:'u1',nom:'Marie',role:'employe'};
  navigator.onLine=true; app.Sync.online=true; global._pm='esp';
  await app.confirmEncaisse(13);

  check('le paiement est traduit pour le serveur', recu && recu.paiement==='especes', recu&&recu.paiement);
  check('la ventilation TVA réunionnaise est transmise', recu && recu.ventilation['2.10'].tva===0.27,
        JSON.stringify(recu&&recu.ventilation));
  check('le numéro vient du serveur, pas du client',
        app.state.ventes[0] && app.state.ventes[0].num==='2026-000042');
  check('la table est libérée après confirmation', t.ticket.length===0 && t.etat==='libre');
  check('le cumul perpétuel est conservé', app.state.ventes[0].cumul===42);
}

/* ═════ 7. Annulation : CA net sans double comptage ═════ */
console.log('\n[7] Annulation = écriture inverse');
{
  mkEnv();
  const j=new Date().toISOString();
  const rows=[
    { id:'v1', numero:'2026-000001', emis_le:j, mode:'surplace', paiement:'especes', table_nom:'T1',
      lignes:[{nom:'Cari',qte:1,pu_ttc:13,taux_tva:10,total_ht:11.82,total_tva:1.18,total_ttc:13}],
      total_ht:11.82, total_tva:1.18, total_ttc:13, ventilation_tva:{'10.00':{base_ht:11.82,tva:1.18}},
      type:'vente', caissier_nom:'Marie', cumul_perpetuel:13, hash:'h1' },
    { id:'v2', numero:'2026-000002', emis_le:j, mode:'surplace', paiement:'especes', table_nom:'T1',
      lignes:[{nom:'Cari',qte:-1,pu_ttc:13,taux_tva:10,total_ht:-11.82,total_tva:-1.18,total_ttc:-13}],
      total_ht:-11.82, total_tva:-1.18, total_ttc:-13, ventilation_tva:{'10.00':{base_ht:-11.82,tva:-1.18}},
      type:'annulation', annule_vente_id:'v1', motif:'Plat non servi',
      caissier_nom:'Le Patron', cumul_perpetuel:0, hash:'h2' }
  ];
  global.NirvanaCloud={ ready:()=>true, pull:async()=>({config:{seeded:true, entreprise:{regime:'micro',tva:'reel',territoire:'reunion',activite:'restauration'}}}),
    push:async()=>true, publishMenu:async()=>true, pullCollection:async()=>null, listerVentes:async()=>rows };
  const app=charger();
  await app.__boot();
  app.state.user={id:'u1',nom:'Marie',role:'admin'};
  await app.chargerVentesCloud();

  check('les 2 écritures sont présentes (rien n\'est masqué)', app.state.ventes.length===2);
  check('la vente d\'origine est marquée annulée (affichage)',
        app.state.ventes.find(v=>v.id==='v1').estAnnulee===true);
  check('l\'original reste dans les cumuls (annulee=false)',
        app.state.ventes.every(v=>v.annulee===false));
  const R=app.todayReportLive();
  check('CA net = 0 (pas de double déduction)', R.ca===0, 'ca='+R.ca);
  check('le montant annulé est reporté', R.remb===13, 'remb='+R.remb);
  check('1 seul ticket compté', R.nb===1, 'nb='+R.nb);
  check('le motif est conservé', app.state.ventes.find(v=>v.type==='annulation').motif==='Plat non servi');
}

/* ═════ 8. MODE TEST — étanchéité totale ═════
   La promesse : « tester toutes les fonctionnalités sans toucher à la base ».
   On la vérifie en espionnant TOUTES les portes de sortie possibles. */
console.log('\n[8] Mode test — aucune écriture ne doit sortir');
{
  const store = mkEnv();
  const sorties = { push:0, publishMenu:0, enregistrerVente:0, idb:0 };
  const cloudReel = { ready:()=>true,
    pull:async()=>({ config:{seeded:true}, produits:[{id:'REEL',nom:'Produit réel',prix:99,tva:2.1}],
                     tables:[{id:'treel',nom:'TABLE RÉELLE',etat:'libre',zone:'terrasse',ticket:[]}] }),
    push:async()=>{ sorties.push++; return true; },
    publishMenu:async()=>{ sorties.publishMenu++; return true; },
    enregistrerVente:async()=>{ sorties.enregistrerVente++; throw new Error('NE DOIT JAMAIS ÊTRE APPELÉ'); },
    listerVentes:async()=>[{id:'REEL-V',numero:'2026-999999',emis_le:new Date().toISOString(),
      mode:'surplace',paiement:'especes',lignes:[],total_ht:99,total_tva:0,total_ttc:99,
      ventilation_tva:{},type:'vente',caissier_nom:'Réel',cumul_perpetuel:99,hash:'reel'}],
    pullCollection:async()=>null, annulerVente:async()=>{throw new Error('NON');},
    cloturer:async()=>{throw new Error('NON');}, verifierIntegrite:async()=>{throw new Error('NON');},
    exportFEC:async()=>{throw new Error('NON');}, lireJournal:async()=>[], listerProfils:async()=>[],
    signIn:async()=>({ok:false}), signOut:async()=>true, session:async()=>null };
  global.NirvanaCloud = cloudReel;
  const app = charger();

  // 1) démarrage du bac à sable
  app.Sandbox.actif = true;
  app.Sandbox._cloudReel = cloudReel;
  global.NirvanaCloud = app.Sandbox._doublure();
  app.state.user = { id:'sb-user', user:'patron', nom:'Patron (test)', role:'admin', actif:true };
  app.Sandbox._charger('admin');
  await app.loadAll();
  await app.chargerVentesCloud();

  check('les VRAIES données ne sont pas chargées',
        !app.state.produits.some(p=>p.id==='REEL'), JSON.stringify(app.state.produits.map(p=>p.id)));
  check('le jeu fictif est chargé', app.state.produits.length===5 && app.state.tables.length===6);
  check('les tables réelles ne sont pas visibles', !app.state.tables.some(t=>t.nom==='TABLE RÉELLE'));
  check('le registre réel n\'est pas chargé', !app.state.ventes.some(v=>v.num==='2026-999999'));
  check('le régime fictif est réunionnais + franchise',
        app.entreprise().territoire==='reunion' && app.entreprise().tva==='franchise');
  check('des ventes fictives préexistent (écrans non vides)', app.state.ventes.length===4,
        app.state.ventes.length);

  // 2) écriture : rien ne doit atteindre le stockage
  const avantLS = JSON.stringify(store);
  app.state.produits.push({id:'sbX',nom:'Test produit',prix:5,tva:2.1});
  await app.DB.set('produits', app.state.produits);
  await app.Sync.flush();
  check('DB.set n\'écrit RIEN dans le localStorage', JSON.stringify(store)===avantLS);
  check('DB.set ne met rien en file de synchro', app.Sync._queue.size===0);
  check('aucun push vers Supabase', sorties.push===0);
  check('mais la donnée est bien lisible en mémoire',
        (await app.DB.get('produits',[])).some(p=>p.id==='sbX'));

  // 3) encaissement simulé
  const t = app.state.tables[0];
  t.ticket=[{prodId:'p1',nom:'Rougail saucisse',prix:12.5,qte:2,tva:2.1,sentQte:0}];
  app.state.bulleMode='surplace'; app.state.bulleTableId=t.id;
  navigator.onLine=true; app.Sync.online=true; global._pm='esp';
  await app.confirmEncaisse(25);
  check('le VRAI serveur n\'est jamais appelé', sorties.enregistrerVente===0);
  check('la vente fictive est créée', app.state.ventes.length===5);
  const der = app.state.ventes[app.state.ventes.length-1];
  check('elle est numérotée comme le ferait Postgres', /^\d{4}-\d{6}$/.test(der.num), der.num);
  check('franchise respectée : aucune TVA', der.tva===0 && Object.keys(der.ventilation).length===0);
  check('la table est libérée', t.ticket.length===0);
  check('le cumul perpétuel progresse', der.cumul > 0);

  // 4) les règles métier sont reproduites fidèlement
  let err=null;
  try{ await global.NirvanaCloud.annulerVente(der.id, ''); }catch(e){ err=e.message; }
  check('annulation sans motif refusée (comme le serveur)', /motif obligatoire/i.test(err||''), err);
  const inv = await global.NirvanaCloud.annulerVente(der.id, 'Erreur de saisie');
  check('annulation avec motif acceptée', inv.type==='annulation' && inv.total_ttc===-25, inv.total_ttc);
  err=null;
  try{ await global.NirvanaCloud.annulerVente(der.id, 'encore'); }catch(e){ err=e.message; }
  check('double annulation refusée', /déjà été annulée/i.test(err||''), err);

  const z = await global.NirvanaCloud.cloturer('journaliere', new Date().toISOString().slice(0,10), 100, 100);
  check('la clôture Z fonctionne', z.nb_tickets>0, z.nb_tickets);
  err=null;
  try{ await global.NirvanaCloud.cloturer('journaliere', new Date().toISOString().slice(0,10), 100, 100); }catch(e){ err=e.message; }
  check('double clôture refusée', /duplicate/i.test(err||''), err);
  const integ = await global.NirvanaCloud.verifierIntegrite();
  check('le contrôle d\'intégrité fonctionne', integ.ok===true, JSON.stringify(integ));

  // 5) bilan : aucune fuite
  check('BILAN — zéro écriture réelle sur toute la session',
        sorties.push===0 && sorties.publishMenu===0 && sorties.enregistrerVente===0,
        JSON.stringify(sorties));
  app.Sandbox.actif=false;
}

/* ═════ 9. ALLERGÈNES — déduction depuis les recettes ═════ */
console.log('\n[9] Allergènes (INCO) — déduits des ingrédients');
{
  mkEnv();
  global.NirvanaCloud = { ready:()=>true, pull:async()=>({}), push:async()=>true, publishMenu:async()=>true };
  const app = charger();
  app.state.ingredients = [
    {id:'i1',nom:'Riz',allergenes:[]},
    {id:'i2',nom:'Saucisse fumée',allergenes:['sulfites']},
    {id:'i3',nom:'Sauce soja',allergenes:['soja','gluten']},
    {id:'i4',nom:'Bière',allergenes:['gluten','sulfites'],estBoisson:true}
  ];
  check('les 14 allergènes réglementaires sont présents', app.ALLERGENES.length===14, app.ALLERGENES.length);

  const plat = {id:'p1',nom:'Rougail',recette:[{ingId:'i1'},{ingId:'i2'}],allergenesManuels:[]};
  check('allergènes déduits de la recette', app.allergenesDeduits(plat).join(',')==='sulfites',
        app.allergenesDeduits(plat).join(','));

  const plat2 = {id:'p2',nom:'Wok',recette:[{ingId:'i1'},{ingId:'i3'}],allergenesManuels:[]};
  check('déduplication sur plusieurs ingrédients',
        app.allergenesProduit(plat2).sort().join(',')==='gluten,soja', app.allergenesProduit(plat2).join(','));

  plat2.allergenesManuels=['arachides'];       // huile de friture
  check('ajout manuel cumulé (huile, panure…)',
        app.allergenesProduit(plat2).indexOf('arachides')>-1);

  const boisson = {id:'p3',nom:'Dodo',boissonRef:'i4',allergenesManuels:[]};
  check('une boisson hérite de son ingrédient',
        app.allergenesProduit(boisson).sort().join(',')==='gluten,sulfites');

  // Le point clé : changer l'ingrédient met à jour TOUS les plats
  app.state.ingredients.find(i=>i.id==='i2').allergenes=['sulfites','moutarde'];
  check('modifier un ingrédient met à jour le plat automatiquement',
        app.allergenesProduit(plat).sort().join(',')==='moutarde,sulfites',
        app.allergenesProduit(plat).join(','));

  // Déclaration
  const vierge = {id:'p9',nom:'Nouveau',recette:[{ingId:'i1'}],allergenesManuels:[]};
  check('plat sans allergène et non vérifié = NON déclaré', app.allergDeclare(vierge)===false);
  vierge.allergVerifie=true;
  check('après vérification explicite = déclaré', app.allergDeclare(vierge)===true);
  check('plat avec allergènes = déclaré d\'office', app.allergDeclare(plat)===true);

  app.state.produits=[plat, vierge, {id:'p8',nom:'Oublié',recette:[{ingId:'i1'}],allergenesManuels:[]}];
  check('les produits non déclarés sont signalés',
        app.produitsSansAllergenes().map(p=>p.id).join(',')==='p8',
        app.produitsSansAllergenes().map(p=>p.id).join(','));
}

/* ═════ 10. CARTES DE FIDÉLITÉ ═════ */
console.log('\n[10] Cartes de fidélité — clé de contrôle');
{
  mkEnv();
  global.NirvanaCloud = { ready:()=>true, pull:async()=>({}), push:async()=>true, publishMenu:async()=>true };
  const app = charger();
  app.state.config = { fidelite:{actif:true,prefixe:'NC',tamponsRequis:10,recompense:'Un plat offert'} };
  app.state.cartes = [];
  app.state.ventes = [];
  app.state.user = {id:'u1',nom:'Cedric',role:'admin'};

  check('format imprimable', /^NC-00042-[A-Y]$/.test(app.numFid(42)), app.numFid(42));
  check('la clé est déterministe', app.cleFid(42)===app.cleFid(42));
  check('deux numéros voisins ont des clés différentes', app.cleFid(42)!==app.cleFid(43));
  check('pas de I ni de O dans les clés (confusion 1/0)',
        [...Array(500)].every((_,i)=>!'IO'.includes(app.cleFid(i+1))));

  check('saisie complète acceptée', app.parseFid('NC-00042-'+app.cleFid(42))===42);
  check('saisie tolérante (numéro seul)', app.parseFid('42')===42);
  check('saisie tolérante (minuscules/espaces)', app.parseFid(' nc-00042-'+app.cleFid(42).toLowerCase()+' ')===42);
  const mauvaise = 'ABCDEFGHJKLMNPQRSTUVWXY'.split('').find(c=>c!==app.cleFid(42));
  check('clé erronée REFUSÉE (pas de carte fantôme)', app.parseFid('NC-00042-'+mauvaise)===null);
  check('numéro hors bornes refusé', app.parseFid('0')===null && app.parseFid('999999')===null);

  // cycle de vie
  check('aucune carte n\'existe avant le 1er tampon', app.carteParNum(42)===null);
  await app.ajouterTampon(42);
  check('la carte est créée au 1er tampon', app.carteParNum(42)!==null);
  check('1 tampon', app.carteParNum(42).tampons.length===1);
  check('elle est anonyme par défaut (aucune donnée personnelle)',
        !app.carteParNum(42).nom && !app.carteParNum(42).tel);
  for(let i=0;i<9;i++) await app.ajouterTampon(42);
  check('10 tampons = récompense atteinte', app.carteParNum(42).tampons.length===10);

  await app.ajouterTampon(42);                    // 11e avant utilisation
  global.confirm = ()=>true;
  await app.utiliserRecompense(42);
  check('la récompense est historisée', app.carteParNum(42).recompenses.length===1);
  check('le tampon excédentaire est conservé (pas de perte pour le client)',
        app.carteParNum(42).tampons.length===1, app.carteParNum(42).tampons.length);
}

/* ═════ 11. RGPD — la purge ne doit JAMAIS toucher au registre ═════ */
console.log('\n[11] RGPD — purge et conservation légale');
{
  mkEnv();
  global.NirvanaCloud = { ready:()=>true, pull:async()=>({}), push:async()=>true, publishMenu:async()=>true,
    listerVentes:async()=>[], pullCollection:async()=>null };
  const app = charger();
  app.state.config = { rgpd:{actif:true, fidelite:36, commandes:12, audit:12, pointages:60, problemes:24} };
  app.state.user = {id:'u1',nom:'Cedric',role:'admin'};

  const vieux = new Date(); vieux.setFullYear(vieux.getFullYear()-5);
  const recent = new Date();
  app.state.cartes = [
    {num:1, nom:'Laura', tel:'0692', dernier:vieux.toISOString(), tampons:[{ts:vieux.toISOString()}], recompenses:[]},
    {num:2, nom:'Actif', tel:'0693', dernier:recent.toISOString(), tampons:[{ts:recent.toISOString()}], recompenses:[]}
  ];
  app.state.commandes = [{id:'c1',ts:vieux.toISOString()},{id:'c2',ts:recent.toISOString()}];
  app.state.audit     = [{id:'a1',ts:vieux.toISOString()},{id:'a2',ts:recent.toISOString()}];
  app.state.pointages = [{id:'p1',ts:recent.toISOString()}];
  app.state.problemes = [{id:'x1',ts:vieux.toISOString(),statut:'resolu'},{id:'x2',ts:vieux.toISOString(),statut:'ouvert'}];
  // LE registre — il ne doit pas bouger d'un iota
  app.state.ventes = [{id:'v1',num:'2026-000001',ts:vieux.toISOString(),total:25,caissier:'Cedric',type:'vente'}];

  const A = app.auditPurge();
  check('l\'audit annonce ce qui sera purgé', A.reduce((s,x)=>s+x.n,0)===4, JSON.stringify(A.map(x=>x.cle+':'+x.n)));

  global.confirm = ()=>true;
  await app.lancerPurge();

  check('🔒 LE REGISTRE DES VENTES EST INTACT', app.state.ventes.length===1, app.state.ventes.length);
  check('🔒 le nom du caissier est conservé sur la vente', app.state.ventes[0].caissier==='Cedric');
  check('identité de carte inactive effacée', !app.state.cartes[0].nom && !app.state.cartes[0].tel);
  check('mais ses tampons sont conservés (carte anonymisée, pas supprimée)',
        app.state.cartes[0].tampons.length===1);
  check('la carte active est intacte', app.state.cartes[1].nom==='Actif');
  check('vieilles commandes purgées', app.state.commandes.length===1);
  check('vieil audit local purgé', !app.state.audit.some(a=>a.id==='a1'),
        JSON.stringify(app.state.audit.map(a=>a.id||a.action)));
  check('...et la purge elle-même est tracée', app.state.audit.some(a=>a.action==='Purge des données'));
  check('pointages récents conservés', app.state.pointages.length===1);
  check('incident résolu purgé, incident ouvert conservé',
        app.state.problemes.length===1 && app.state.problemes[0].id==='x2');

  const A2 = app.auditPurge();
  check('purge idempotente (2e passage : rien à faire)', A2.reduce((s,x)=>s+x.n,0)===0);
}

/* ═════ 12. URSSAF ═════ */
console.log('\n[12] Déclaration URSSAF');
{
  mkEnv();
  global.NirvanaCloud = { ready:()=>true, pull:async()=>({}), push:async()=>true, publishMenu:async()=>true };
  const app = charger();
  const an = new Date().getFullYear();
  app.state.config = { urssaf:{periodicite:'trimestrielle', tauxCotis:null, tauxIR:null} };
  check('taux NON codé en dur (à demander à l\'URSSAF)', app.confUrssaf().tauxCotis===null);
  check('4 trimestres', app.periodesUrssaf(an).length===4);
  app.state.config.urssaf.periodicite='mensuelle';
  check('12 mois si mensuel', app.periodesUrssaf(an).length===12);

  app.state.config.urssaf.periodicite='trimestrielle';
  app.state.ventes = [
    {ts:an+'-02-15T12:00:00Z', total:1000, type:'vente'},
    {ts:an+'-03-20T12:00:00Z', total:500,  type:'vente'},
    {ts:an+'-03-21T12:00:00Z', total:-200, type:'annulation'},
    {ts:an+'-05-10T12:00:00Z', total:800,  type:'vente'}
  ];
  const T = app.periodesUrssaf(an);
  check('CA T1 = encaissé net des annulations', app.caPeriode(T[0].debut,T[0].fin)===1300,
        app.caPeriode(T[0].debut,T[0].fin));
  check('CA T2 isolé', app.caPeriode(T[1].debut,T[1].fin)===800);
  check('CA T3 vide', app.caPeriode(T[2].debut,T[2].fin)===0);
  check('CA annuel = somme', app.caAnnee(an)===2100, app.caAnnee(an));
}

console.log('\n──────────────────────────────');
console.log(`RÉSULTAT : ${pass} réussis · ${fail} échoués`);
try{ fs.unlinkSync(path.join(__dirname,'.test-app-v2.js')); }catch(_){}
process.exit(fail?1:0);
})();
