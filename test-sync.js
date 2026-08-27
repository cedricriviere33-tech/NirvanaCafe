/* Banc de test — reproduit les scénarios réels rapportés par Cedric. */
const path = require('path');

function mkEnv(){
  const store = {};                       // localStorage simulé
  global.localStorage = {
    getItem:k=>(k in store?store[k]:null),
    setItem:(k,v)=>{store[k]=String(v);},
    removeItem:k=>{delete store[k];},
    clear:()=>{for(const k in store)delete store[k];},
    _dump:()=>store
  };
  global.indexedDB = { open:function(){ var r={}; setTimeout(function(){ if(r.onerror) r.onerror({target:{}}); },0); return r; } };
  global.fetch = global.fetch || (()=>Promise.reject(new Error('no fetch in test')));           // force le repli localStorage (même code de lecture)
  // Node ≥21 expose un `navigator` natif non inscriptible → redéfinition forcée
  Object.defineProperty(global, 'navigator', { value:{ onLine:true }, configurable:true, writable:true });
  global.window = global;
  global.addEventListener = ()=>{};
  global.CanvasRenderingContext2D = function(){}; global.CanvasRenderingContext2D.prototype = { roundRect(){} };
  global.AudioContext = function(){ return {createOscillator:()=>({connect(){},start(){},stop(){},frequency:{setValueAtTime(){}}}),createGain:()=>({connect(){},gain:{exponentialRampToValueAtTime(){}}}),close(){},currentTime:0,destination:{}}; };
  const el = ()=>({ innerHTML:'', style:{}, classList:{add(){},remove(){},toggle(){}}, textContent:'', value:'', appendChild(){}, remove(){}, focus(){} });
  global.document = { addEventListener(){}, getElementById:()=>el(), createElement:()=>el(), querySelector:()=>el() };
  global.toast = ()=>{};
  global.renderNetPill = ()=>{};
  global.buildTabs = ()=>{}; global.goTab = ()=>{}; global.currentTab=null;
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
  global.crypto = require('crypto').webcrypto;
  global.btoa = s=>Buffer.from(s,'binary').toString('base64');
  global.atob = s=>Buffer.from(s,'base64').toString('binary');
  global.setTimeout = setTimeout; global.clearTimeout = clearTimeout;
  return store;
}

function mkCloud(rows){                    // rows = {collection: data} ou null = injoignable
  const state = { rows: rows===null?null:JSON.parse(JSON.stringify(rows)), pushes:[] };
  global.NirvanaCloud = {
    ready:()=>true,
    pull:async()=> state.rows===null ? null : JSON.parse(JSON.stringify(state.rows)),
    push:async(body)=>{ state.pushes.push(Object.keys(body));
      if(state.rows===null) return false;
      Object.assign(state.rows, JSON.parse(JSON.stringify(body))); return true; },
    publishMenu:async()=>true,
    pullCollection:async n=> state.rows&&state.rows[n]?state.rows[n]:null
  };
  return state;
}

/* Extrait le bloc applicatif d'index.html et l'instrumente (autonome). */
const fs=require('fs');
function fresh(){
  const h=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const scripts=[...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  let js=scripts.reduce((a,b)=>a.length>b.length?a:b);
  js=js.replace(/\(async function init\(\)\{[\s\S]*?\n\}\)\(\);/, `
async function __boot(){
  await DB.init(); Sync._loadQueue();
  await cloudPullAll(true); await loadAll(); await seedIfEmpty(); await loadAll();
  await migrateVersAuth();
  if(Sync._pulledOnce && Sync._queue.size) await Sync.flush();
}
module.exports={DB,Sync,state,cloudPullAll,seedIfEmpty,__boot,loadAll};`);
  js=js.replace("'use strict';",'',1);
  const f=path.join(__dirname,'.test-app-sync.js');
  fs.writeFileSync(f,js);
  delete require.cache[require.resolve(f)];
  return require(f);
}

let pass=0, fail=0;
function check(label, cond, detail){
  if(cond){ pass++; console.log('  ✅ '+label); }
  else { fail++; console.log('  ❌ '+label+(detail?'  → '+detail:'')); }
}

(async ()=>{

/* ── SCÉNARIO 1 — LE BUG DE CEDRIC ────────────────────────────────────────
   Le smartphone (cache vide) ouvre l'app. Le cloud contient la VRAIE base :
   comptes renommés + tables avec terrasse. Avant : re-seed + push → tout écrasé. */
console.log('\n[1] Appareil au cache vide, cloud contenant la vraie base');
{
  mkEnv();
  const cloud = mkCloud({
    users:  [{id:'u_patron',nom:'Cedric',user:'cedric',role:'admin',actif:true,pass:'x:y'}],
    tables: [{id:'t1',nom:'T1',etat:'libre',zone:'terrasse',ticket:[]},
             {id:'t2',nom:'T2',etat:'libre',zone:'terrasse',ticket:[]}],
    produits:[{id:'px',nom:'Cari poulet',prix:13,tva:10}],
    config: { lastTicket:7, seeded:true }
  });
  const app = fresh();
  await app.__boot();
  check('les données du cloud sont conservées',
        app.state.produits.length===1 && app.state.produits[0].nom==='Cari poulet',
        JSON.stringify(app.state.produits.map(p=>p.nom)));
  check('la terrasse survit', app.state.tables.every(t=>t.zone==='terrasse'),
        JSON.stringify(app.state.tables.map(t=>t.zone)));
  check('AUCUN push parasite au démarrage', cloud.pushes.length===0,
        'pushes='+JSON.stringify(cloud.pushes));
  check('lastTicket préservé', app.state.config.lastTicket===7);
}

/* ── SCÉNARIO 2 — clé AES perdue (localStorage purgé par iOS) ─────────────
   Des données chiffrées existent mais sont illisibles. Avant : DB.get → null → re-seed. */
console.log('\n[2] Données locales chiffrées illisibles (sel perdu)');
{
  const store = mkEnv();
  // simule une collection `users` chiffrée avec une clé qui ne correspond plus
  store['nirvana_users'] = JSON.stringify({__enc:true, iv:'AAAAAAAAAAAAAAAA', ct:'Ym9ndXM='});
  store['nirvana_salt']  = 'ffffffffffffffffffffffffffffffff';
  const cloud = mkCloud(null);                 // cloud injoignable en prime
  const app = fresh();
  await app.__boot();
  check('collection détectée comme ILLISIBLE', app.DB._corrupt.has('users'),
        [...app.DB._corrupt].join(','));
  check('AUCUN re-seed', app.state.produits.length===0,
        JSON.stringify(app.state.produits.map(p=>p.nom)));
  check('AUCUN push (rien n\'est écrasé)', cloud.pushes.length===0);
}

/* ── SCÉNARIO 3 — cloud injoignable, cache local sain ────────────────────
   Avant : si users était illisible → seed. Ici on vérifie qu'on ne seede pas à l'aveugle. */
console.log('\n[3] Cloud injoignable + cache local vide');
{
  mkEnv();
  const cloud = mkCloud(null);
  const app = fresh();
  await app.__boot();
  check('seed BLOQUÉ tant que le cloud n\'est pas vérifié', app.state.users.length===0,
        JSON.stringify(app.state.users.map(u=>u.user)));
  check('lastPull = error', app.Sync.lastPull==='error', app.Sync.lastPull);
  check('_pulledOnce reste faux → aucun push possible', app.Sync._pulledOnce===false);
}

/* ── SCÉNARIO 4 — toute première installation légitime ───────────────────
   Cloud joignable mais vierge → le seed DOIT avoir lieu, avec zone + id. */
console.log('\n[4] Première installation réelle (cloud vierge)');
{
  mkEnv();
  const cloud = mkCloud({});
  const app = fresh();
  await app.__boot();
  check('base VIERGE : aucun produit', app.state.produits.length===0);
  check('base VIERGE : aucune table', app.state.tables.length===0);
  check('aucun compte local (Supabase Auth)', app.state.users.length===0);
  check('drapeau seeded posé', app.state.config.seeded===true);
  check('régime par défaut posé', !!app.state.config.entreprise);
  check('rien n\'est poussé au démarrage', cloud.pushes.length===0);
}

/* ── SCÉNARIO 5 — deuxième démarrage après seed : pas de re-seed ─────────*/
console.log('\n[5] Redémarrage après un seed, cloud vierge (push pas encore parti)');
{
  mkEnv();
  const cloud = mkCloud({});
  let app = fresh();
  await app.__boot();
  app.state.produits.push({id:'p1',nom:'Cari Cedric',prix:13,tva:2.1});   // Cedric crée son 1er produit
  await app.DB.set('produits', app.state.produits);
  await app.Sync.flush();
  check('la modif est bien téléversée', cloud.pushes.length===1 && cloud.pushes[0].includes('produits'),
        JSON.stringify(cloud.pushes));
  // nouveau démarrage sur un AUTRE appareil vierge
  mkEnv(); global.NirvanaCloud = { ready:()=>true, pull:async()=>JSON.parse(JSON.stringify(cloud.rows)),
    push:async(b)=>{cloud.pushes.push(Object.keys(b)); return true;}, publishMenu:async()=>true, pullCollection:async()=>null };
  app = fresh();
  await app.__boot();
  check('le 2e appareil récupère la modif et ne re-seede pas',
        app.state.produits.some(p=>p.nom==='Cari Cedric'), JSON.stringify(app.state.produits.map(p=>p.nom)));
}

/* ── SCÉNARIO 6 — travail hors-ligne puis retour du réseau ───────────────*/
console.log('\n[6] Saisie hors-ligne → retour réseau → téléversement auto');
{
  mkEnv();
  const cloud = mkCloud({ commandes:[], config:{seeded:true}, produits:[{id:'p1',nom:'Cari',prix:13,tva:10}] });
  const app = fresh();
  await app.__boot();
  navigator.onLine = false; app.Sync.online = false;   // coupure réseau
  app.state.commandes.push({id:'c1',tableNom:'T1',items:[],ts:new Date().toISOString()});
  await app.DB.set('commandes', app.state.commandes);
  await app.Sync.flush();
  check('rien n\'est poussé hors-ligne', cloud.pushes.length===0);
  check('la saisie est en file d\'attente', app.Sync._queue.has('commandes'));
  check('la file est persistée (survit à un reload)',
        JSON.parse(global.localStorage.getItem('nirvana_queue')||'[]').includes('commandes'));
  navigator.onLine = true; app.Sync.online = true;      // retour réseau
  await app.Sync.flush();
  check('la saisie est téléversée automatiquement',
        cloud.rows.commandes && cloud.rows.commandes.length===1, JSON.stringify(cloud.rows.commandes));
  check('la file est vidée', app.Sync._queue.size===0);
}

/* ── SCÉNARIO 7 — le pull ne doit pas écraser une modif locale en attente ─*/
console.log('\n[7] Pull pendant qu\'une modif locale attend d\'être téléversée');
{
  mkEnv();
  const cloud = mkCloud({ commandes:[{id:'vieux'}], config:{seeded:true}, produits:[{id:'p1',nom:'Cari',prix:13,tva:10}] });
  const app = fresh();
  await app.__boot();
  navigator.onLine=false; app.Sync.online=false;
  app.state.commandes.push({id:'nouveau'});
  await app.DB.set('commandes', app.state.commandes);
  navigator.onLine=true; app.Sync.online=true;
  await app.cloudPullAll(true);                       // pull AVANT le flush
  check('la saisie locale non téléversée n\'est PAS écrasée par le pull',
        app.state.commandes.some(v=>v.id==='nouveau'), JSON.stringify(app.state.commandes.map(v=>v.id)));
  await app.Sync.flush();
  check('elle finit bien dans le cloud',
        cloud.rows.commandes.some(v=>v.id==='nouveau'));
}

console.log('\n──────────────────────────────');
console.log(`RÉSULTAT : ${pass} réussis · ${fail} échoués`);
try{ require('fs').unlinkSync(require('path').join(__dirname,'.test-app-sync.js')); }catch(_){}
process.exit(fail?1:0);
})();
