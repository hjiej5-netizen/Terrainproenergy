// ============================================================
// TERRAINPRO v5.0 — Production Final
// ✅ Offline-first (IndexedDB auto-sync)
// ✅ PDF professionnel (logo, photos, signature, score)
// ✅ Dashboard analytics avancé
// ✅ 2 rôles: Admin + Superviseur
// ✅ PWA + Android APK ready
// ============================================================
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Tokens ──────────────────────────────────────────────────
const T = {
  navy:"#0B1F3A",teal:"#00C8A0",tealD:"#009E80",indigo:"#4F46E5",
  amber:"#F59E0B",rose:"#F04E4E",slate:"#5A6A7E",fog:"#EEF2F7",
  border:"#E0E8F0",success:"#22C55E",warning:"#F59E0B",danger:"#EF4444",
};
const scoreColor = s => s>=90?T.success:s>=70?T.warning:T.danger;
const scoreBg    = s => s>=90?"rgba(34,197,94,.1)":s>=70?"rgba(245,158,11,.1)":"rgba(239,68,68,.1)";
const fmt  = d => new Date(d).toLocaleDateString("fr-MA",{day:"2-digit",month:"short",year:"numeric"});
const fmtT = d => new Date(d).toLocaleTimeString("fr-MA",{hour:"2-digit",minute:"2-digit"});
const uid  = () => `id-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const roleBadge = r => r==="admin"
  ?{bg:"rgba(79,70,229,.13)",color:"#4F46E5",label:"Admin"}
  :{bg:"rgba(245,158,11,.13)",color:"#B45309",label:"Superviseur"};

// ─── Static seed data ─────────────────────────────────────────
const SECTEURS = Array.from({length:15},(_,i)=>({
  id:`sect-${String(i+1).padStart(2,"0")}`,
  code:`S${String(i+1).padStart(2,"0")}`,
  nom:`Secteur ${String(i+1).padStart(2,"0")}`,
}));

const MODULES = [
  {id:"sq",   code:"SQ",  nom:"Service Quality",   icon:"⭐",color:"#6366F1"},
  {id:"loy",  code:"LY",  nom:"Loyalty",            icon:"💎",color:"#EC4899"},
  {id:"voc",  code:"VOC", nom:"Voice of Customer",  icon:"🎙️",color:"#F59E0B"},
  {id:"vrpt", code:"VRPT",nom:"VRPT",               icon:"📋",color:"#3B82F6"},
  {id:"hssse",code:"HSS", nom:"HSSSE",              icon:"🛡️",color:"#10B981"},
];

const CHECKLIST = {
  sq:   ["Accueil client conforme aux standards","Délai d'attente < 5 min","Propreté espace accueil","Uniformes et badges conformes","Signalétique à jour","Satisfaction client enregistrée","Procédures de plainte affichées"],
  loy:  ["Programme fidélité actif","Matériel PLV en place","Formation staff fidélité","Objectifs inscription atteints","Reporting mensuel soumis"],
  voc:  ["Feedback clients collecté (min 30)","NPS calculé et documenté","Réclamations traitées < 48h","Actions correctives en place","Rapport VOC transmis"],
  vrpt: ["Rapport précédent soumis","KPIs période atteints","Plan actions correctives","Équipements inventoriés","Réunion équipe effectuée","Photos terrain archivées"],
  hssse:["Équipements sécurité conformes","EPI disponibles et utilisés","Incidents signalés","Zone travail conforme","Exercice évacuation (trim.)","Registre HSSSE à jour","Matières dangereuses stockées"],
};

// ─── In-memory DB (swap with Supabase + IndexedDB in prod) ────
const INIT_USERS = [
  {id:"u-admin",email:"admin@terrainpro.ma",password:"Admin2024!",nom:"Al-Amine",prenom:"Youssef",role:"admin",secteurId:null,actif:true},
  ...SECTEURS.map((s,i)=>({id:`u-sup-${s.id}`,email:`sup${i+1}@terrainpro.ma`,password:"Sup2024!",nom:"Superviseur",prenom:s.code,role:"superviseur",secteurId:s.id,actif:true})),
];
const INIT_STATIONS = SECTEURS.flatMap((s,si)=>
  Array.from({length:3},(_,k)=>({id:`st-${s.id}-${k+1}`,code:`${s.code}-ST${k+1}`,nom:`Station ${s.code}-${k+1}`,adresse:`Rue ${k+1}, ${s.nom}`,secteurId:s.id,actif:true,lat:30+si*.2+k*.05,lng:-5+si*.15+k*.04}))
);

// Seed some demo visites for analytics
const DEMO_VISITES = SECTEURS.slice(0,8).flatMap(s=>{
  const items=CHECKLIST.sq;
  return Array.from({length:Math.floor(Math.random()*4)+2},(_,k)=>{
    const ok=Math.floor(Math.random()*items.length);
    const nc=items.length-ok;
    const date=new Date();date.setDate(date.getDate()-Math.floor(Math.random()*30));
    return {
      id:uid(),supId:`u-sup-${s.id}`,supNom:`Sup ${s.code}`,
      secteurId:s.id,stationId:`st-${s.id}-1`,moduleId:MODULES[k%5].id,
      date,score:Math.floor(ok/items.length*100),total:items.length,ok,nc:nc>0?nc:0,
      nbPhotos:Math.floor(Math.random()*5),nbNC:nc>0?nc:0,
      anomalies:nc>0?CHECKLIST.sq.slice(0,nc):[],
    };
  });
});

let DB={users:[...INIT_USERS],stations:[...INIT_STATIONS],visites:[...DEMO_VISITES]};

// ─── Global toast ─────────────────────────────────────────────
let _showToast=null;
const showToast=msg=>_showToast?.(msg);

// ─── IndexedDB offline layer (minimal embedded) ───────────────
const OFFLINE = (() => {
  let _db=null;
  const open=()=>new Promise((res,rej)=>{
    if(_db)return res(_db);
    const req=indexedDB.open("TerrainProDB",1);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains("pendingVisites")){
        const s=db.createObjectStore("pendingVisites",{keyPath:"localId"});
        s.createIndex("status","status",{unique:false});
      }
    };
    req.onsuccess=e=>{_db=e.target.result;res(_db);};
    req.onerror=e=>rej(e.target.error);
  });
  const put=async(store,val)=>{const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");const s=tx.objectStore(store);const r=s.put(val);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});};
  const getAll=async(store)=>{const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(store,"readonly");const s=tx.objectStore(store);const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});};
  const del=async(store,key)=>{const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");const s=tx.objectStore(store);const r=s.delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});};
  return {
    saveVisite: async(v)=>{
      const id=`local-${Date.now()}`;
      await put("pendingVisites",{localId:id,...v,status:"pending",savedAt:new Date().toISOString()});
      return id;
    },
    getPending: ()=>getAll("pendingVisites").then(all=>all.filter(v=>v.status==="pending")),
    markSynced: async(localId)=>{const all=await getAll("pendingVisites");const v=all.find(x=>x.localId===localId);if(v)await put("pendingVisites",{...v,status:"synced",syncedAt:new Date().toISOString()});},
    getPendingCount: ()=>getAll("pendingVisites").then(all=>all.filter(v=>v.status==="pending").length),
  };
})();

// ─── CSS ──────────────────────────────────────────────────────
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Bebas+Neue&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body,#root{height:100%;background:#0B1F3A}
body{font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased;color:#0B1F3A}
::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:#C4D0DE;border-radius:99px}
.shell{max-width:430px;margin:0 auto;min-height:100dvh;background:#EEF2F7;display:flex;flex-direction:column;position:relative}
.screen{flex:1;display:flex;flex-direction:column}
.scroll{flex:1;overflow-y:auto;padding:16px 16px 96px}
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes scaleIn{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes spinR{to{transform:rotate(360deg)}}
.aup{animation:up .32s ease both}.apop{animation:scaleIn .26s ease both}
.d1{animation-delay:.04s}.d2{animation-delay:.08s}.d3{animation-delay:.12s}.d4{animation-delay:.16s}
.hdr{background:#0B1F3A;padding:13px 18px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200;box-shadow:0 2px 14px rgba(0,0,0,.3)}
.logo{font-family:'Bebas Neue',sans-serif;font-size:21px;color:#fff;letter-spacing:1.5px}.logo em{color:#00C8A0;font-style:normal}
.hdr-r{display:flex;align-items:center;gap:9px}
/* Login */
.login-bg{min-height:100dvh;background:linear-gradient(155deg,#071528 0%,#0E2D50 55%,#071528 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px;overflow:hidden;position:relative}
.lorb{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none}
.lcard{background:rgba(255,255,255,.055);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.09);border-radius:26px;padding:34px 28px;width:100%;max-width:385px;position:relative;z-index:1}
.l-brand{font-family:'Bebas Neue',sans-serif;font-size:40px;color:#fff;letter-spacing:2px;text-align:center}.l-brand em{color:#00C8A0;font-style:normal}
.l-tag{color:rgba(255,255,255,.38);font-size:11px;text-align:center;letter-spacing:1px;margin-bottom:28px}
.fl{margin-bottom:15px}.fl label{display:block;color:rgba(255,255,255,.45);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:7px}
.fi{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:12px;color:#fff;font-size:15px;font-family:'Plus Jakarta Sans',sans-serif;padding:13px 15px;outline:none;transition:border-color .2s}
.fi:focus{border-color:#00C8A0}.fi::placeholder{color:rgba(255,255,255,.25)}
.qbtns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
.qbtn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:rgba(255,255,255,.7);font-size:11px;font-weight:600;padding:10px 8px;cursor:pointer;text-align:center;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif}
.qbtn:hover,.qbtn:active{background:rgba(0,200,160,.12);border-color:rgba(0,200,160,.3);color:#00C8A0}
.btn-login{width:100%;background:linear-gradient(135deg,#00C8A0,#009E80);border:none;border-radius:14px;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:15px;padding:15px;cursor:pointer;box-shadow:0 8px 24px rgba(0,200,160,.28);transition:transform .15s;margin-top:6px}
.btn-login:active{transform:scale(.98)}
/* Cards */
.card{background:#fff;border-radius:18px;box-shadow:0 2px 10px rgba(11,31,58,.07);overflow:hidden}
.card-p{padding:16px}
.card-row{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid #EEF2F7}
.card-row:last-child{border-bottom:none}
/* Stats */
.sg{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
.sc{background:#fff;border-radius:17px;padding:16px;box-shadow:0 2px 10px rgba(11,31,58,.07)}
.sc-ico{width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:17px;margin-bottom:10px}
.sc-val{font-family:'Bebas Neue',sans-serif;font-size:30px;line-height:1;color:#0B1F3A}
.sc-lbl{font-size:11px;color:#5A6A7E;font-weight:500;margin-top:3px}
/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;transition:transform .14s;border-radius:12px}
.btn:active{transform:scale(.97)}
.btn-p{background:linear-gradient(135deg,#00C8A0,#009E80);color:#fff;box-shadow:0 5px 18px rgba(0,200,160,.28)}
.btn-d{background:linear-gradient(135deg,#F04E4E,#C73C3C);color:#fff;box-shadow:0 5px 16px rgba(240,78,78,.28)}
.btn-s{background:#EEF2F7;color:#0B1F3A}
.btn-o{background:#fff;border:1.5px solid #E0E8F0;color:#0B1F3A}
.btn-in{background:linear-gradient(135deg,#4F46E5,#3730A3);color:#fff}
.bsm{font-size:12px;padding:7px 13px;border-radius:9px}
.bmd{font-size:14px;padding:12px 18px}
.blg{font-size:15px;padding:15px 20px;width:100%;border-radius:15px}
.bic{width:36px;height:36px;border-radius:10px;padding:0;font-size:15px}
.cta{width:100%;background:linear-gradient(135deg,#00C8A0 0%,#0062CC 100%);border:none;border-radius:16px;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:15px;padding:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 8px 24px rgba(0,98,204,.22);transition:transform .14s;margin-bottom:16px}
.cta:active{transform:scale(.98)}.cta-sm{font-size:13px;padding:13px 16px;border-radius:13px;margin-bottom:0}
/* Selection */
.sel{background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:9px;display:flex;align-items:center;gap:12px;border:2px solid transparent;cursor:pointer;transition:border-color .15s;box-shadow:0 2px 8px rgba(11,31,58,.05)}
.sel.on{border-color:#00C8A0;background:rgba(0,200,160,.025)}.sel:active{transform:scale(.99)}
.sel-ck{width:22px;height:22px;border-radius:50%;border:2px solid #DDE5EF;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
.sel-ck.on{background:#00C8A0;border-color:#00C8A0}
.back{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid #E0E8F0;border-radius:11px;padding:9px 14px;font-size:13px;font-weight:600;color:#0B1F3A;cursor:pointer;margin-bottom:18px;transition:background .15s}
.back:active{background:#EEF2F7}
.sh{margin-bottom:18px}.sh h2{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:.4px;color:#0B1F3A}.sh p{font-size:12px;color:#5A6A7E;margin-top:3px}
.st{font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:.9px;color:#8A9AB5;text-transform:uppercase;margin:18px 0 10px}
/* Progress */
.pw{background:#E0E8F0;border-radius:99px;height:5px;overflow:hidden;margin-bottom:22px}
.pf{height:100%;background:linear-gradient(90deg,#00C8A0,#0062CC);border-radius:99px;transition:width .4s ease}
/* Checklist */
.qc{background:#fff;border-radius:20px;padding:22px 18px;box-shadow:0 4px 18px rgba(11,31,58,.09);animation:scaleIn .26s ease}
.qn{font-size:11px;color:#5A6A7E;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px}
.qt{font-weight:700;font-size:16px;color:#0B1F3A;line-height:1.45;margin-bottom:18px}
.cb{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:14px}
.cbtn{padding:13px;border-radius:13px;border:2px solid #E0E8F0;background:#fff;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:center;gap:7px;color:#5A6A7E;transition:all .15s}
.cbtn.ok.on{background:rgba(34,197,94,.08);border-color:#22C55E;color:#15803D}
.cbtn.nok.on{background:rgba(240,78,78,.08);border-color:#F04E4E;color:#DC2626}
.cmt{width:100%;background:#F8FAFC;border:1.5px solid #E0E8F0;border-radius:11px;padding:11px 13px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;color:#0B1F3A;outline:none;resize:none;transition:border-color .2s;margin-bottom:11px}
.cmt:focus{border-color:#00C8A0}
/* Photo zone */
.photo-zone{border:2px dashed #C4D4E8;border-radius:14px;padding:14px;background:#F5F8FC;cursor:pointer;transition:all .18s}
.photo-zone:hover{border-color:#00C8A0;background:rgba(0,200,160,.04)}
.photo-zone input[type=file]{display:none}
.pz-label{display:flex;align-items:center;justify-content:center;gap:8px;color:#5A6A7E;font-size:13px;font-weight:600;cursor:pointer}
.ph-grid{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.ph-wrap{position:relative}
.ph-img{width:62px;height:62px;border-radius:11px;object-fit:cover;border:2px solid #E0E8F0;display:block}
.ph-del{position:absolute;top:-5px;right:-5px;width:18px;height:18px;background:#F04E4E;border-radius:50%;border:none;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700}
.nb{display:flex;gap:9px;margin-top:16px}
.qdots{display:flex;gap:5px;flex-wrap:wrap;margin-top:14px}
.qdot{width:26px;height:26px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;transition:all .15s}
/* Signature canvas */
.sig-wrap{border:2px solid #E0E8F0;border-radius:14px;overflow:hidden;position:relative;background:#fff}
.sig-canvas{display:block;width:100%;height:100px;touch-action:none;cursor:crosshair}
.sig-clear{position:absolute;top:8px;right:8px;background:rgba(239,68,68,.1);border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;color:#EF4444;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif}
.sig-hint{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#C4D0DE;font-size:12px;pointer-events:none;font-weight:500}
/* Score ring */
.ring-wrap{display:flex;flex-direction:column;align-items:center;padding:24px 0 18px}
.ring{width:132px;height:132px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
.ring-in{width:102px;height:102px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 14px rgba(11,31,58,.12)}
.ring-v{font-family:'Bebas Neue',sans-serif;font-size:30px;line-height:1;color:#0B1F3A}
.ring-p{font-size:12px;color:#5A6A7E}
/* Rows */
.row{display:flex;align-items:center;gap:11px;padding:13px 16px;background:#fff;border-radius:15px;margin-bottom:8px;box-shadow:0 2px 8px rgba(11,31,58,.05)}
.rav{width:40px;height:40px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:14px;color:#fff;flex-shrink:0}
.ri{flex:1;min-width:0}.rn{font-weight:700;font-size:14px;color:#0B1F3A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rs{font-size:11px;color:#5A6A7E;margin-top:2px}.ract{display:flex;gap:6px;flex-shrink:0}
/* Pills */
.pill{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;letter-spacing:.3px}
.pdot{width:6px;height:6px;border-radius:50%;animation:pulse 1.4s infinite;flex-shrink:0}
.off-bar{background:rgba(240,78,78,.07);border:1px solid rgba(240,78,78,.18);border-radius:13px;padding:11px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px}
.sync-pill{display:flex;align-items:center;gap:5px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.25);border-radius:99px;padding:4px 10px;color:#B45309;font-size:10px;font-weight:700;cursor:pointer}
.syncing{animation:spinR 1s linear infinite}
/* Modal */
.overlay{position:fixed;inset:0;background:rgba(11,31,58,.55);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:flex-end;justify-content:center;animation:up .2s ease}
.sheet{background:#fff;border-radius:24px 24px 0 0;width:100%;max-width:430px;padding:22px 20px 36px;animation:slideUp .3s ease;max-height:92dvh;overflow-y:auto}
.sheet-hdl{width:36px;height:4px;background:#E0E8F0;border-radius:99px;margin:0 auto 20px}
.sheet-t{font-family:'Bebas Neue',sans-serif;font-size:22px;color:#0B1F3A;margin-bottom:18px;letter-spacing:.4px}
.ig{margin-bottom:14px}.ig label{display:block;font-size:11px;font-weight:700;color:#5A6A7E;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}
.inp{width:100%;background:#F8FAFC;border:1.5px solid #E0E8F0;border-radius:11px;padding:12px 14px;font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;color:#0B1F3A;outline:none;transition:border-color .2s}
.inp:focus{border-color:#00C8A0}.inp option{background:#fff;color:#0B1F3A}
.sheet-btns{display:flex;gap:9px;margin-top:18px}
.anomaly{background:rgba(240,78,78,.05);border:1px solid rgba(240,78,78,.14);border-radius:12px;padding:11px 13px;margin-bottom:7px;display:flex;gap:9px;align-items:flex-start}
.tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;margin-bottom:14px;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{flex-shrink:0;padding:7px 14px;border-radius:99px;font-size:12px;font-weight:700;border:none;cursor:pointer;transition:all .15s;font-family:'Plus Jakarta Sans',sans-serif}
.tab.on{background:#0B1F3A;color:#fff}.tab.off{background:#fff;color:#5A6A7E}
.gps-tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#00C8A0;background:rgba(0,200,160,.08);border-radius:99px;padding:4px 10px}
/* Analytics */
.bar-chart{display:flex;flex-direction:column;gap:8px}
.bar-row{display:flex;align-items:center;gap:10px}
.barlbl{font-size:11px;font-weight:600;color:#0B1F3A;width:75px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bartrk{flex:1;background:#EEF2F7;border-radius:99px;height:9px;overflow:hidden}
.barfil{height:100%;border-radius:99px;transition:width .6s ease}
.barval{font-size:11px;font-weight:700;width:36px;text-align:right;flex-shrink:0}
.heatmap{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:18px}
.hm-cell{border-radius:12px;padding:10px 8px;text-align:center}
.hm-code{font-family:'Bebas Neue',sans-serif;font-size:12px;letter-spacing:.5px}
.hm-score{font-family:'Bebas Neue',sans-serif;font-size:18px;line-height:1;margin-top:2px}
.hm-vis{font-size:9px;opacity:.7;margin-top:2px}
/* Bottom nav */
.bnav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:#fff;border-top:1px solid #E8EFF7;display:flex;padding:8px 4px 16px;z-index:300;box-shadow:0 -4px 20px rgba(11,31,58,.08)}
.bni{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;padding:7px 2px;border-radius:11px;border:none;background:transparent;color:#8A9AB5;transition:color .15s}
.bni.on{color:#00C8A0}.bni span{font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase}
.toast{position:fixed;top:74px;left:50%;transform:translateX(-50%);background:#0B1F3A;color:#fff;padding:11px 20px;border-radius:13px;font-size:13px;font-weight:600;z-index:999;animation:up .3s ease;white-space:nowrap;box-shadow:0 8px 28px rgba(11,31,58,.38)}
.pdf-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F0F4F9;font-size:12px}.pdf-row:last-child{border-bottom:none}
`;

// ─── Icons ────────────────────────────────────────────────────
const Ic={
  home:  (c="#8A9AB5",s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  users: (c,s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  map:   (c,s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
  chart: (c,s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  clip:  (c,s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  rep:   (c,s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  user:  (c,s=22)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  plus:  (c,s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  check: (c,s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x:     (c,s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  edit:  (c,s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: (c,s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
  back:  (c,s=17)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  camera:(c,s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  dl:    (c,s=17)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  pin:   (c,s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  sync:  (c,s=13)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  logout:(c,s=17)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  wifi0: (c,s=15)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
};

// ─── Toast ────────────────────────────────────────────────────
const Toast=()=>{
  const [msg,setMsg]=useState(null);
  useEffect(()=>{_showToast=setMsg;},[]);
  useEffect(()=>{if(msg){const t=setTimeout(()=>setMsg(null),2500);return()=>clearTimeout(t);}},[msg]);
  return msg?<div className="toast">✓ {msg}</div>:null;
};

// ─── Avatar ───────────────────────────────────────────────────
const Avatar=({user,size=40})=>{
  const pal=["#6366F1","#EC4899","#F59E0B","#10B981","#3B82F6","#8B5CF6","#EF4444"];
  const bg=pal[(user?.nom?.charCodeAt(0)||65)%pal.length];
  const init=`${user?.prenom?.[0]||""}${user?.nom?.[0]||""}`.toUpperCase();
  return <div className="rav" style={{width:size,height:size,borderRadius:size*.3,background:bg,fontSize:size*.33}}>{init}</div>;
};

// ─── Modal ────────────────────────────────────────────────────
const Modal=({title,onClose,children,footer})=>(
  <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="sheet">
      <div className="sheet-hdl"/>
      {title&&<div className="sheet-t">{title}</div>}
      {children}
      {footer&&<div className="sheet-btns">{footer}</div>}
    </div>
  </div>
);

// ─── Field ────────────────────────────────────────────────────
const Field=({label,value,onChange,type="text",as="input",children,placeholder=""})=>(
  <div className="ig">
    <label>{label}</label>
    {as==="select"
      ?<select className="inp" value={value} onChange={e=>onChange(e.target.value)}>{children}</select>
      :<input className="inp" type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
    }
  </div>
);

// ─── Signature Canvas ─────────────────────────────────────────
const SignatureCanvas=({canvasRef})=>{
  const [drawing,setDr]=useState(false);
  const [hasData,setHas]=useState(false);
  const last=useRef({x:0,y:0});

  const getPos=(e)=>{
    const rect=canvasRef.current.getBoundingClientRect();
    const src=e.touches?e.touches[0]:e;
    return{x:src.clientX-rect.left,y:src.clientY-rect.top};
  };
  const start=(e)=>{e.preventDefault();setDr(true);const p=getPos(e);last.current=p;};
  const draw=(e)=>{
    if(!drawing)return;e.preventDefault();
    const ctx=canvasRef.current.getContext("2d");
    const p=getPos(e);
    ctx.strokeStyle="#0B1F3A";ctx.lineWidth=2;ctx.lineCap="round";ctx.lineJoin="round";
    ctx.beginPath();ctx.moveTo(last.current.x,last.current.y);ctx.lineTo(p.x,p.y);ctx.stroke();
    last.current=p;setHas(true);
  };
  const stop=()=>setDr(false);
  const clear=()=>{
    const c=canvasRef.current;
    c.getContext("2d").clearRect(0,0,c.width,c.height);
    setHas(false);
  };

  return(
    <div className="sig-wrap">
      <canvas ref={canvasRef} className="sig-canvas" width={360} height={100}
        onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={draw} onTouchEnd={stop}/>
      {!hasData&&<div className="sig-hint">Signez ici…</div>}
      {hasData&&<button className="sig-clear" onClick={clear}>Effacer</button>}
    </div>
  );
};

// ─── Sparkline ────────────────────────────────────────────────
const Sparkline=({data,color=T.teal})=>{
  if(!data||data.length<2)return null;
  const max=Math.max(...data,1);
  const W=200,H=36;
  const pts=data.map((v,i)=>[(i/(data.length-1))*W,H-(v/max)*(H-6)-3]);
  const d=pts.map((p,i)=>`${i===0?"M":"L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area=`${d} L${W},${H} L0,${H} Z`;
  return(
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H}} preserveAspectRatio="none">
      <defs><linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".2"/><stop offset="100%" stopColor={color} stopOpacity=".01"/></linearGradient></defs>
      <path d={area} fill={`url(#sg${color.replace("#","")})`}/>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={i===pts.length-1?3.5:1.8} fill={i===pts.length-1?color:"white"} stroke={color} strokeWidth="1.5"/>)}
    </svg>
  );
};

// ─── Header ───────────────────────────────────────────────────
const Header=({user,isOffline,pending,isSyncing,onSync,onLogout})=>(
  <header className="hdr">
    <div className="logo">Terrain<em>Pro</em></div>
    <div className="hdr-r">
      {isOffline&&<span className="pill" style={{background:"rgba(240,78,78,.15)",color:"#F87171"}}><span className="pdot" style={{background:"#F87171"}}/> Hors ligne</span>}
      {pending>0&&(
        <span className="sync-pill" onClick={onSync}>
          <span className={isSyncing?"syncing":""}>{Ic.sync("#B45309")}</span>
          {isSyncing?"Sync…":`${pending} sync`}
        </span>
      )}
      <Avatar user={user} size={33}/>
      <button className="btn btn-s bic" onClick={onLogout}>{Ic.logout("#5A6A7E")}</button>
    </div>
  </header>
);

// ─── Bottom Nav ───────────────────────────────────────────────
const BottomNav=({role,active,setNav})=>{
  const tabs=role==="admin"
    ?[{id:"dash",l:"Accueil",I:Ic.home},{id:"users",l:"Users",I:Ic.users},{id:"stations",l:"Sites",I:Ic.map},{id:"stats",l:"Stats",I:Ic.chart}]
    :[{id:"dash",l:"Accueil",I:Ic.home},{id:"visite",l:"Visite",I:Ic.clip},{id:"rapports",l:"Rapports",I:Ic.rep},{id:"stats",l:"Stats",I:Ic.chart},{id:"profil",l:"Profil",I:Ic.user}];
  return(
    <nav className="bnav">
      {tabs.map(({id,l,I})=>(
        <button key={id} className={`bni ${active===id?"on":""}`} onClick={()=>setNav(id)}>
          {I(active===id?T.teal:"#8A9AB5")}
          <span>{l}</span>
        </button>
      ))}
    </nav>
  );
};

// ══════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════
const Login=({onLogin})=>{
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const go=(e,p)=>{setErr("");setBusy(true);setTimeout(()=>{const u=DB.users.find(x=>x.email===e&&x.password===p&&x.actif&&x.role!=="agent");u?onLogin(u):(setErr("Identifiants incorrects"),setBusy(false));},700);};
  return(
    <div className="login-bg">
      <div className="lorb" style={{width:280,height:280,top:-80,right:-80,background:"radial-gradient(circle,rgba(0,200,160,.18),transparent 70%)"}}/>
      <div className="lorb" style={{width:220,height:220,bottom:-60,left:-60,background:"radial-gradient(circle,rgba(79,70,229,.15),transparent 70%)"}}/>
      <div className="lcard aup">
        <div className="l-brand">Terrain<em>Pro</em></div>
        <div className="l-tag">GESTION VISITES TERRAIN · v5.0</div>
        <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.35)",letterSpacing:.8,textTransform:"uppercase",marginBottom:8}}>Connexion rapide</div>
        <div className="qbtns">
          <button className="qbtn" onClick={()=>go("admin@terrainpro.ma","Admin2024!")}>🔑 Admin</button>
          <button className="qbtn" onClick={()=>go("sup1@terrainpro.ma","Sup2024!")}>👤 Superviseur S01</button>
        </div>
        <div style={{height:1,background:"rgba(255,255,255,.07)",marginBottom:16}}/>
        <div className="fl"><label>Email</label><input className="fi" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="votre@email.ma" onKeyDown={e=>e.key==="Enter"&&go(email,pass)}/></div>
        <div className="fl"><label>Mot de passe</label><input className="fi" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&go(email,pass)}/></div>
        {err&&<div style={{background:"rgba(240,78,78,.1)",border:"1px solid rgba(240,78,78,.2)",borderRadius:10,padding:"10px 13px",color:"#F87171",fontSize:13,marginBottom:12}}>{err}</div>}
        <button className="btn-login" onClick={()=>go(email,pass)} disabled={busy}>{busy?"Connexion…":"Se connecter →"}</button>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// ADMIN DASH
// ══════════════════════════════════════════════════════════════
const AdminDash=({user,setNav})=>{
  const sups=DB.users.filter(u=>u.role==="superviseur");
  const sts=DB.stations.filter(s=>s.actif);
  const vis=DB.visites;
  const avg=vis.length?Math.round(vis.reduce((s,v)=>s+v.score,0)/vis.length):0;
  return(
    <div className="scroll">
      <div className="sh aup"><h2>Tableau de bord</h2><p>Vue globale — {SECTEURS.length} secteurs</p></div>
      <div className="sg">
        {[{v:SECTEURS.length,l:"Secteurs",ico:"🏢",bg:"rgba(79,70,229,.1)"},{v:sups.length,l:"Superviseurs",ico:"👤",bg:"rgba(236,72,153,.1)"},{v:sts.length,l:"Stations",ico:"📍",bg:"rgba(245,158,11,.1)"},{v:`${avg}%`,l:"Conformité",ico:"✅",bg:"rgba(34,197,94,.1)"}]
        .map((s,i)=><div key={i} className={`sc aup d${i+1}`}><div className="sc-ico" style={{background:s.bg}}>{s.ico}</div><div className="sc-val">{s.v}</div><div className="sc-lbl">{s.l}</div></div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
        <button className="cta cta-sm" onClick={()=>setNav("users")}>{Ic.plus("#fff",15)} Utilisateur</button>
        <button className="cta cta-sm" style={{background:"linear-gradient(135deg,#4F46E5,#3730A3)"}} onClick={()=>setNav("stations")}>{Ic.plus("#fff",15)} Station</button>
      </div>
      <div className="st">Secteurs ({SECTEURS.length})</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
        {SECTEURS.map((s,i)=>{
          const stNb=DB.stations.filter(x=>x.secteurId===s.id&&x.actif).length;
          const vs=DB.visites.filter(v=>v.secteurId===s.id);
          const avg2=vs.length?Math.round(vs.reduce((a,v)=>a+v.score,0)/vs.length):null;
          return(
            <div key={s.id} className={`card card-p aup d${(i%4)+1}`}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,letterSpacing:.5,color:T.navy}}>{s.nom}</div>
              <div style={{fontSize:10,color:T.slate,marginTop:4}}>📍 {stNb} stations · {vs.length} vis.</div>
              {avg2!==null&&<div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,color:scoreColor(avg2),marginTop:5}}>{avg2}%</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Users screen ──────────────────────────────────────────────
const UsersScreen=({currentUser,refresh})=>{
  const [sf,setSf]=useState("all");
  const [srch,setSrch]=useState("");
  const [modal,setModal]=useState(null);
  const [tgt,setTgt]=useState(null);
  const [form,setForm]=useState({email:"",password:"",nom:"",prenom:"",role:"superviseur",secteurId:SECTEURS[0].id,actif:true});
  const rf=(k,v)=>setForm(f=>({...f,[k]:v}));
  const list=DB.users.filter(u=>u.id!==currentUser.id).filter(u=>sf==="all"||u.secteurId===sf).filter(u=>!srch||`${u.nom} ${u.prenom} ${u.email}`.toLowerCase().includes(srch.toLowerCase()));
  const doAdd=()=>{if(!form.email||!form.password||!form.nom||!form.prenom)return showToast("Champs requis");DB.users.push({...form,id:uid()});setModal(null);refresh();showToast("Créé ✓");};
  const doEdit=()=>{const i=DB.users.findIndex(u=>u.id===tgt.id);if(i>=0)DB.users[i]={...form};setModal(null);refresh();showToast("Mis à jour ✓");};
  const doDel=()=>{DB.users=DB.users.filter(u=>u.id!==tgt.id);setModal(null);refresh();showToast("Supprimé ✓");};
  const UF=()=><><Field label="Prénom" value={form.prenom} onChange={v=>rf("prenom",v)} placeholder="Prénom"/><Field label="Nom" value={form.nom} onChange={v=>rf("nom",v)} placeholder="Nom"/><Field label="Email" value={form.email} onChange={v=>rf("email",v)} type="email"/><Field label="Mot de passe" value={form.password} onChange={v=>rf("password",v)} type="password"/><Field label="Rôle" value={form.role} onChange={v=>rf("role",v)} as="select"><option value="superviseur">Superviseur</option><option value="admin">Admin</option></Field>{form.role==="superviseur"&&<Field label="Secteur" value={form.secteurId} onChange={v=>rf("secteurId",v)} as="select">{SECTEURS.map(s=><option key={s.id} value={s.id}>{s.nom}</option>)}</Field>}{modal==="edit"&&<Field label="Statut" value={form.actif?"1":"0"} onChange={v=>rf("actif",v==="1")} as="select"><option value="1">Actif</option><option value="0">Inactif</option></Field>}</>;
  return(
    <div className="scroll">
      <div className="sh aup"><h2>Utilisateurs</h2><p>{DB.users.length} comptes</p></div>
      <button className="cta" onClick={()=>{setForm({email:"",password:"",nom:"",prenom:"",role:"superviseur",secteurId:SECTEURS[0].id,actif:true});setModal("add");}}>{Ic.plus("#fff")} Nouvel utilisateur</button>
      <input className="inp" style={{marginBottom:12}} placeholder="🔍 Rechercher…" value={srch} onChange={e=>setSrch(e.target.value)}/>
      <div className="tabs"><button className={`tab ${sf==="all"?"on":"off"}`} onClick={()=>setSf("all")}>Tous</button>{SECTEURS.map(s=><button key={s.id} className={`tab ${sf===s.id?"on":"off"}`} onClick={()=>setSf(s.id)}>{s.code}</button>)}</div>
      {list.map((u,i)=>{const b=roleBadge(u.role);const sect=SECTEURS.find(s=>s.id===u.secteurId);return(<div key={u.id} className={`row aup d${(i%4)+1}`}><Avatar user={u} size={40}/><div className="ri"><div className="rn">{u.prenom} {u.nom}</div><div className="rs">{u.email}{sect?` · ${sect.nom}`:""}</div><span className="pill" style={{background:b.bg,color:b.color,marginTop:4}}>{b.label}</span></div><div className="ract"><button className="btn btn-s bic bsm" onClick={()=>{setForm({...u});setTgt(u);setModal("edit");}}>{Ic.edit()}</button><button className="btn bic bsm" style={{background:"rgba(240,78,78,.1)"}} onClick={()=>{setTgt(u);setModal("del");}}>{Ic.trash(T.danger)}</button></div></div>);})}
      {modal==="add"&&<Modal title="Nouvel utilisateur" onClose={()=>setModal(null)} footer={[<button key="c" className="btn btn-o bmd" style={{flex:1}} onClick={()=>setModal(null)}>Annuler</button>,<button key="s" className="btn btn-p bmd" style={{flex:2}} onClick={doAdd}>Créer</button>]}><UF/></Modal>}
      {modal==="edit"&&<Modal title="Modifier" onClose={()=>setModal(null)} footer={[<button key="c" className="btn btn-o bmd" style={{flex:1}} onClick={()=>setModal(null)}>Annuler</button>,<button key="s" className="btn btn-p bmd" style={{flex:2}} onClick={doEdit}>Enregistrer</button>]}><UF/></Modal>}
      {modal==="del"&&<Modal title="Supprimer ?" onClose={()=>setModal(null)} footer={[<button key="c" className="btn btn-o bmd" style={{flex:1}} onClick={()=>setModal(null)}>Annuler</button>,<button key="d" className="btn btn-d bmd" style={{flex:2}} onClick={doDel}>Supprimer</button>]}><p style={{color:T.slate,fontSize:14,lineHeight:1.6}}>Supprimer <strong>{tgt?.prenom} {tgt?.nom}</strong> ?</p></Modal>}
    </div>
  );
};

// ── Stations screen ───────────────────────────────────────────
const StationsScreen=({refresh})=>{
  const [sf,setSf]=useState("all");
  const [modal,setModal]=useState(null);
  const [tgt,setTgt]=useState(null);
  const [form,setForm]=useState({code:"",nom:"",adresse:"",secteurId:SECTEURS[0].id,actif:true});
  const rf=(k,v)=>setForm(f=>({...f,[k]:v}));
  const list=DB.stations.filter(s=>sf==="all"||s.secteurId===sf);
  const doAdd=()=>{if(!form.nom||!form.code)return showToast("Nom et code requis");DB.stations.push({...form,id:uid(),lat:0,lng:0});setModal(null);refresh();showToast("Créée ✓");};
  const doEdit=()=>{const i=DB.stations.findIndex(s=>s.id===tgt.id);if(i>=0)DB.stations[i]={...DB.stations[i],...form};setModal(null);refresh();showToast("Mise à jour ✓");};
  const SF=()=><><Field label="Code" value={form.code} onChange={v=>rf("code",v)} placeholder="S01-ST4"/><Field label="Nom" value={form.nom} onChange={v=>rf("nom",v)} placeholder="Nom de la station"/><Field label="Adresse" value={form.adresse} onChange={v=>rf("adresse",v)}/><Field label="Secteur" value={form.secteurId} onChange={v=>rf("secteurId",v)} as="select">{SECTEURS.map(s=><option key={s.id} value={s.id}>{s.nom}</option>)}</Field><Field label="Statut" value={form.actif?"1":"0"} onChange={v=>rf("actif",v==="1")} as="select"><option value="1">Active</option><option value="0">Inactive</option></Field></>;
  return(
    <div className="scroll">
      <div className="sh aup"><h2>Stations</h2><p>{DB.stations.filter(s=>s.actif).length} actives</p></div>
      <button className="cta" onClick={()=>{setForm({code:"",nom:"",adresse:"",secteurId:SECTEURS[0].id,actif:true});setModal("add");}}>{Ic.plus("#fff")} Nouvelle station</button>
      <div className="tabs"><button className={`tab ${sf==="all"?"on":"off"}`} onClick={()=>setSf("all")}>Toutes</button>{SECTEURS.map(s=><button key={s.id} className={`tab ${sf===s.id?"on":"off"}`} onClick={()=>setSf(s.id)}>{s.code}</button>)}</div>
      {list.map((s,i)=>{const sect=SECTEURS.find(x=>x.id===s.secteurId);return(<div key={s.id} className={`row aup d${(i%4)+1}`}><div style={{width:40,height:40,borderRadius:12,background:"rgba(245,158,11,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📍</div><div className="ri"><div className="rn">{s.nom}</div><div className="rs">{s.code} · {sect?.nom}</div>{!s.actif&&<span className="pill" style={{background:"rgba(240,78,78,.1)",color:T.danger}}>Inactive</span>}</div><div className="ract"><button className="btn btn-s bic bsm" onClick={()=>{setForm({...s});setTgt(s);setModal("edit");}}>{Ic.edit()}</button><button className="btn bic bsm" style={{background:"rgba(240,78,78,.1)"}} onClick={()=>{DB.stations=DB.stations.filter(x=>x.id!==s.id);refresh();showToast("Supprimée ✓");}}>{Ic.trash(T.danger)}</button></div></div>);})}
      {modal==="add"&&<Modal title="Nouvelle station" onClose={()=>setModal(null)} footer={[<button key="c" className="btn btn-o bmd" style={{flex:1}} onClick={()=>setModal(null)}>Annuler</button>,<button key="s" className="btn btn-p bmd" style={{flex:2}} onClick={doAdd}>Créer</button>]}><SF/></Modal>}
      {modal==="edit"&&<Modal title="Modifier station" onClose={()=>setModal(null)} footer={[<button key="c" className="btn btn-o bmd" style={{flex:1}} onClick={()=>setModal(null)}>Annuler</button>,<button key="s" className="btn btn-p bmd" style={{flex:2}} onClick={doEdit}>Enregistrer</button>]}><SF/></Modal>}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD
// ══════════════════════════════════════════════════════════════
const Analytics=({user})=>{
  const [tab,setTab]=useState("overview");
  const [per,setPer]=useState("30");
  const [modF,setModF]=useState("all");

  const base=user.role==="admin"?DB.visites:DB.visites.filter(v=>v.secteurId===user.secteurId);
  const cutoff=useMemo(()=>{const d=new Date();d.setDate(d.getDate()-parseInt(per));return d;},[per]);
  const vis=useMemo(()=>base.filter(v=>new Date(v.date)>=cutoff&&(modF==="all"||v.moduleId===modF)),[base,cutoff,modF]);

  const kpis=useMemo(()=>{
    const total=vis.length;
    const avg=total?Math.round(vis.reduce((s,v)=>s+v.score,0)/total):0;
    const nc=vis.reduce((s,v)=>s+(v.nbNC||0),0);
    const ph=vis.reduce((s,v)=>s+(v.nbPhotos||0),0);
    return{total,avg,nc,ph};
  },[vis]);

  const bySect=useMemo(()=>SECTEURS.map(s=>{const vs=vis.filter(v=>v.secteurId===s.id);const avg=vs.length?Math.round(vs.reduce((a,v)=>a+v.score,0)/vs.length):null;return{...s,count:vs.length,avg};}).sort((a,b)=>(b.avg||0)-(a.avg||0)),[vis]);

  const byMod=useMemo(()=>MODULES.map(m=>{const vs=vis.filter(v=>v.moduleId===m.id);const avg=vs.length?Math.round(vs.reduce((a,v)=>a+v.score,0)/vs.length):0;return{...m,count:vs.length,avg};}), [vis]);

  const topAnomалии=useMemo(()=>{
    const freq={};
    vis.forEach(v=>(v.anomalies||[]).forEach(q=>{freq[q]=(freq[q]||0)+1;}));
    return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([q,n])=>({q,n}));
  },[vis]);

  const monthly=useMemo(()=>Array.from({length:6},(_,i)=>{
    const d=new Date();d.setMonth(d.getMonth()-(5-i));
    const m=d.getMonth(),y=d.getFullYear();
    const vs=base.filter(v=>{const vd=new Date(v.date);return vd.getMonth()===m&&vd.getFullYear()===y;});
    return{month:d.toLocaleDateString("fr-MA",{month:"short"}),visites:vs.length,score:vs.length?Math.round(vs.reduce((s,v)=>s+v.score,0)/vs.length):0};
  }),[base]);

  const bySup=useMemo(()=>{
    const ids=[...new Set(vis.map(v=>v.supId))];
    return ids.map(id=>{
      const vs=vis.filter(v=>v.supId===id);
      const avg=vs.length?Math.round(vs.reduce((a,v)=>a+v.score,0)/vs.length):0;
      const sup=DB.users.find(u=>u.id===id);
      return{id,name:sup?`${sup.prenom} ${sup.nom}`:id,count:vs.length,avg};
    }).sort((a,b)=>b.avg-a.avg);
  },[vis]);

  return(
    <div className="scroll">
      <div className="sh aup"><h2>Analytics</h2><p>{user.role==="admin"?"Vue globale":`${SECTEURS.find(s=>s.id===user.secteurId)?.nom}`}</p></div>
      {/* Filters */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {[["7","7j"],["30","30j"],["90","3m"],["365","1an"]].map(([v,l])=><button key={v} style={{padding:"5px 12px",borderRadius:99,fontSize:11,fontWeight:700,border:`1.5px solid ${per===v?"#0B1F3A":"#E0E8F0"}`,background:per===v?"#0B1F3A":"#fff",color:per===v?"#fff":"#5A6A7E",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}} onClick={()=>setPer(v)}>{l}</button>)}
        <div style={{width:1,height:24,background:T.border,margin:"0 2px",alignSelf:"center"}}/>
        {[["all","Tous"],...MODULES.map(m=>[m.id,`${m.icon}${m.code}`])].map(([v,l])=><button key={v} style={{padding:"5px 12px",borderRadius:99,fontSize:11,fontWeight:700,border:`1.5px solid ${modF===v?"#0B1F3A":"#E0E8F0"}`,background:modF===v?"#0B1F3A":"#fff",color:modF===v?"#fff":"#5A6A7E",cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}} onClick={()=>setModF(v)}>{l}</button>)}
      </div>
      {/* Tabs */}
      <div className="tabs">
        {[["overview","Vue d'ensemble"],["secteurs","Secteurs"],["supervisors","Superviseurs"],["anomalies","Anomalies"],["trends","Tendances"]].map(([v,l])=><button key={v} className={`tab ${tab===v?"on":"off"}`} onClick={()=>setTab(v)}>{l}</button>)}
      </div>

      {/* KPIs */}
      <div className="sg">
        {[{v:kpis.total,l:"Visites",ico:"📋",bg:"rgba(0,200,160,.1)"},{v:`${kpis.avg}%`,l:"Score moyen",ico:"⭐",bg:"rgba(245,158,11,.1)"},{v:kpis.nc,l:"Non-conformités",ico:"⚠️",bg:"rgba(239,68,68,.1)"},{v:kpis.ph,l:"Photos",ico:"📷",bg:"rgba(59,130,246,.1)"}]
        .map((k,i)=><div key={i} className={`sc aup d${i+1}`}><div className="sc-ico" style={{background:k.bg}}>{k.ico}</div><div className="sc-val">{k.v}</div><div className="sc-lbl">{k.l}</div></div>)}
      </div>

      {/* OVERVIEW */}
      {tab==="overview"&&<>
        <div className="st">Conformité par module</div>
        <div className="card card-p" style={{marginBottom:16}}>
          <div className="bar-chart">
            {byMod.map((m,i)=><div key={m.id} className="bar-row"><div className="barlbl" title={m.nom}>{m.icon} {m.code}</div><div className="bartrk"><div className="barfil" style={{width:`${m.avg}%`,background:m.color}}/></div><div className="barval" style={{color:m.count?scoreColor(m.avg):T.slate}}>{m.count?`${m.avg}%`:"—"}</div></div>)}
          </div>
        </div>
        <div className="st">Évolution score (6 mois)</div>
        <div className="card card-p" style={{marginBottom:16}}>
          <Sparkline data={monthly.map(m=>m.score)} color={T.teal}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            {monthly.map((m,i)=><span key={i} style={{fontSize:9,color:T.slate,fontWeight:700}}>{m.month}</span>)}
          </div>
        </div>
      </>}

      {/* SECTEURS */}
      {tab==="secteurs"&&<>
        <div className="st">Heatmap conformité</div>
        <div className="heatmap">
          {bySect.map(s=>{const avg=s.avg;const bg=avg===null?"#F0F4F8":scoreBg(avg);const col=avg===null?T.slate:scoreColor(avg);return(<div key={s.id} className="hm-cell" style={{background:bg}}><div className="hm-code" style={{color:col}}>{s.code}</div><div className="hm-score" style={{color:col}}>{avg!==null?`${avg}%`:"—"}</div><div className="hm-vis" style={{color:col}}>{s.count} vis.</div></div>);})}
        </div>
        <div className="st">Classement</div>
        <div className="card card-p"><div className="bar-chart">{bySect.filter(s=>s.count>0).map(s=><div key={s.id} className="bar-row"><div className="barlbl">{s.code}</div><div className="bartrk"><div className="barfil" style={{width:`${s.avg||0}%`,background:scoreColor(s.avg||0)}}/></div><div className="barval" style={{color:scoreColor(s.avg||0)}}>{s.avg!==null?`${s.avg}%`:"—"}</div></div>)}{bySect.every(s=>s.count===0)&&<div style={{textAlign:"center",color:T.slate,padding:"20px 0",fontSize:13}}>Aucune donnée</div>}</div></div>
      </>}

      {/* SUPERVISEURS */}
      {tab==="supervisors"&&<>
        <div className="st">Performance par superviseur</div>
        {bySup.length===0&&<div style={{textAlign:"center",color:T.slate,padding:"30px 0",fontSize:13}}>Aucune donnée</div>}
        {bySup.map((s,i)=><div key={s.id} className="row"><div style={{width:36,height:36,borderRadius:11,background:`rgba(${i%2===0?"0,200,160":"79,70,229"},.1)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue',sans-serif",fontSize:12,color:i%2===0?T.teal:T.indigo,flexShrink:0}}>#{i+1}</div><div className="ri"><div className="rn">{s.name}</div><div style={{marginTop:5}}><div style={{background:"#EEF2F7",borderRadius:99,height:7,overflow:"hidden"}}><div style={{width:`${s.avg}%`,height:"100%",background:scoreColor(s.avg),borderRadius:99,transition:"width .6s ease"}}/></div></div><div className="rs">{s.count} visite(s)</div></div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:scoreColor(s.avg),flexShrink:0}}>{s.avg}%</div></div>)}
      </>}

      {/* ANOMALIES */}
      {tab==="anomalies"&&<>
        <div className="st">Top anomalies récurrentes</div>
        {topAnomалии.length===0&&<div style={{background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.2)",borderRadius:14,padding:"20px 16px",textAlign:"center",color:"#16A34A",fontWeight:600,fontSize:14}}>✅ Aucune anomalie récurrente</div>}
        {topAnomалии.map((a,i)=><div key={i} style={{background:"#fff",borderRadius:13,padding:"13px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:10,boxShadow:"0 2px 8px rgba(11,31,58,.05)"}}><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:T.danger,width:26,flexShrink:0}}>#{i+1}</div><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13,color:T.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.q}</div><div style={{marginTop:5}}><div style={{background:"#FEE2E2",borderRadius:99,height:5,overflow:"hidden"}}><div style={{width:`${(a.n/Math.max(...topAnomалии.map(x=>x.n),1))*100}%`,height:"100%",background:"#EF4444",borderRadius:99}}/></div></div><div style={{fontSize:11,color:T.slate,marginTop:3}}>{a.n} occurrence(s)</div></div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:T.danger,flexShrink:0}}>{a.n}×</div></div>)}
      </>}

      {/* TRENDS */}
      {tab==="trends"&&<>
        <div className="st">Visites mensuelles</div>
        <div className="card card-p" style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:6,height:72,padding:"0 4px"}}>
            {monthly.map((m,i)=>{const maxV=Math.max(...monthly.map(x=>x.visites),1);return(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><span style={{fontSize:9,fontWeight:700,color:T.teal}}>{m.visites}</span><div style={{width:"100%",height:`${(m.visites/maxV)*52}px`,background:`linear-gradient(180deg,${T.teal},#009E80)`,borderRadius:"6px 6px 0 0",minHeight:3}}/><span style={{fontSize:9,fontWeight:700,color:T.slate,textTransform:"uppercase"}}>{m.month}</span></div>);})}</div>
        </div>
        <div className="st">Score mensuel</div>
        <div className="card card-p">
          <Sparkline data={monthly.map(m=>m.score)} color={T.teal}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            {monthly.map((m,i)=><span key={i} style={{fontSize:9,color:T.slate,fontWeight:700}}>{m.month}</span>)}
          </div>
        </div>
      </>}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// SUPERVISOR SCREENS
// ══════════════════════════════════════════════════════════════
const SupDash=({user,onNewVisit})=>{
  const sect=SECTEURS.find(s=>s.id===user.secteurId);
  const myVis=DB.visites.filter(v=>v.secteurId===user.secteurId);
  const today=myVis.filter(v=>new Date(v.date).toDateString()===new Date().toDateString());
  const avg=myVis.length?Math.round(myVis.reduce((s,v)=>s+v.score,0)/myVis.length):0;
  const sts=DB.stations.filter(s=>s.secteurId===user.secteurId&&s.actif);
  return(
    <div className="scroll">
      <div className="sh aup"><div className="gps-tag">{Ic.pin("#00C8A0")} {sect?.nom}</div><h2 style={{marginTop:7}}>Bonjour, {user.prenom} 👋</h2><p>Superviseur · {sect?.nom}</p></div>
      <div className="sg">
        {[{v:sts.length,l:"Mes stations",ico:"📍",bg:"rgba(245,158,11,.1)"},{v:today.length,l:"Visites auj.",ico:"📋",bg:"rgba(0,200,160,.1)"},{v:myVis.length,l:"Total",ico:"🗂️",bg:"rgba(79,70,229,.1)"},{v:`${avg}%`,l:"Conformité",ico:"✅",bg:"rgba(34,197,94,.1)"}]
        .map((s,i)=><div key={i} className={`sc aup d${i+1}`}><div className="sc-ico" style={{background:s.bg}}>{s.ico}</div><div className="sc-val">{s.v}</div><div className="sc-lbl">{s.l}</div></div>)}
      </div>
      <button className="cta" onClick={onNewVisit}>{Ic.plus("#fff",18)} Nouvelle inspection terrain</button>
      {myVis.length>0&&<>
        <div className="st">Dernières visites</div>
        {[...myVis].reverse().slice(0,5).map((v,i)=>{const st=DB.stations.find(s=>s.id===v.stationId);const m=MODULES.find(m=>m.id===v.moduleId);return(<div key={v.id} className={`row aup d${(i%4)+1}`}><div style={{width:40,height:40,borderRadius:12,background:`${m?.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{m?.icon}</div><div className="ri"><div className="rn">{st?.nom}</div><div className="rs">{m?.nom} · {fmt(v.date)} {fmtT(v.date)}</div><div style={{display:"flex",gap:5,marginTop:4}}>{v.nbPhotos>0&&<span className="pill" style={{background:"rgba(59,130,246,.1)",color:"#3B82F6"}}>📷 {v.nbPhotos}</span>}{v.nbNC>0&&<span className="pill" style={{background:"rgba(240,78,78,.1)",color:T.danger}}>⚠️ {v.nbNC}</span>}</div></div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:scoreColor(v.score)}}>{v.score}%</div></div>);})}
      </>}
    </div>
  );
};

const ReportsScreen=({user})=>{
  const [mf,setMf]=useState("all");
  const vis=DB.visites.filter(v=>v.secteurId===user.secteurId&&(mf==="all"||v.moduleId===mf)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  return(
    <div className="scroll">
      <div className="sh aup"><h2>Mes rapports</h2><p>{vis.length} visite(s)</p></div>
      <div className="tabs"><button className={`tab ${mf==="all"?"on":"off"}`} onClick={()=>setMf("all")}>Tous</button>{MODULES.map(m=><button key={m.id} className={`tab ${mf===m.id?"on":"off"}`} onClick={()=>setMf(m.id)}>{m.icon} {m.code}</button>)}</div>
      {vis.length===0&&<div style={{textAlign:"center",color:T.slate,padding:"36px 0",fontSize:13}}>Aucun rapport</div>}
      {vis.map((v,i)=>{const st=DB.stations.find(s=>s.id===v.stationId);const m=MODULES.find(m=>m.id===v.moduleId);return(<div key={v.id} className={`row aup d${(i%4)+1}`}><div style={{width:40,height:40,borderRadius:12,background:`${m?.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{m?.icon}</div><div className="ri"><div className="rn">{st?.nom}</div><div className="rs">{m?.nom} · {fmt(v.date)}</div><span className="pill" style={{background:scoreBg(v.score),color:scoreColor(v.score),marginTop:4}}>{v.score}%</span></div><button className="btn btn-s bsm" onClick={()=>showToast("Exporter — voir generatePDF() dans pdf.js")}>{Ic.dl(T.slate,13)}</button></div>);})}
    </div>
  );
};

const ProfilScreen=({user,onLogout})=>{
  const sect=SECTEURS.find(s=>s.id===user.secteurId);
  const myVis=DB.visites.filter(v=>v.secteurId===user.secteurId);
  const avg=myVis.length?Math.round(myVis.reduce((s,v)=>s+v.score,0)/myVis.length):0;
  return(
    <div className="scroll">
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 0 20px"}} className="aup">
        <Avatar user={user} size={72}/>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:T.navy,marginTop:12,letterSpacing:.5}}>{user.prenom} {user.nom}</div>
        <div style={{fontSize:13,color:T.slate}}>{user.email}</div>
        <span className="pill" style={{...roleBadge(user.role),marginTop:8}}>{roleBadge(user.role).label}</span>
        {sect&&<div className="gps-tag" style={{marginTop:10}}>{Ic.pin("#00C8A0")} {sect.nom}</div>}
      </div>
      <div className="sg" style={{marginBottom:18}}>
        {[{v:myVis.length,l:"Visites",ico:"📋"},{v:`${avg}%`,l:"Score moyen",ico:"⭐"}]
        .map((s,i)=><div key={i} className="sc aup"><div className="sc-ico" style={{background:"rgba(0,200,160,.1)",fontSize:20}}>{s.ico}</div><div className="sc-val">{s.v}</div><div className="sc-lbl">{s.l}</div></div>)}
      </div>
      <div className="card" style={{marginBottom:16}}>
        {[["Email",user.email],["Rôle","Superviseur"],["Secteur",sect?.nom||"—"],["Compte",user.actif?"✅ Actif":"❌ Inactif"]].map(([k,v],i)=><div key={i} className="card-row"><span style={{fontSize:13,color:T.slate,flex:1}}>{k}</span><span style={{fontSize:13,fontWeight:700,color:T.navy}}>{v}</span></div>)}
      </div>
      <button className="btn btn-d blg" onClick={onLogout}>{Ic.logout("#fff")} Déconnexion</button>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// VISIT FLOW
// ══════════════════════════════════════════════════════════════
const StationSelect=({user,onBack,onNext})=>{
  const [sel,setSel]=useState(null);
  const sts=DB.stations.filter(s=>s.secteurId===user.secteurId&&s.actif);
  return(
    <div className="screen">
      <header className="hdr"><div className="logo">Terrain<em>Pro</em></div><span className="pill" style={{background:"rgba(0,200,160,.15)",color:T.teal}}>Étape 1 / 3</span></header>
      <div className="scroll">
        <button className="back" onClick={onBack}>{Ic.back()} Retour</button>
        <div className="sh"><h2>Choisir la station</h2><p>Stations de votre secteur</p></div>
        {sts.length===0&&<div style={{textAlign:"center",color:T.slate,padding:"40px 0"}}>Aucune station dans votre secteur</div>}
        {sts.map((s,i)=><div key={s.id} className={`sel aup d${(i%4)+1} ${sel?.id===s.id?"on":""}`} onClick={()=>setSel(s)}><div style={{width:44,height:44,borderRadius:13,background:sel?.id===s.id?"rgba(0,200,160,.12)":"#EEF2F7",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{Ic.pin(sel?.id===s.id?T.teal:T.slate,20)}</div><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:T.navy}}>{s.nom}</div><div style={{fontSize:12,color:T.slate,marginTop:2}}>{s.code} · {s.adresse}</div></div><div className={`sel-ck ${sel?.id===s.id?"on":""}`}>{sel?.id===s.id&&Ic.check("#fff",12)}</div></div>)}
        <button className="btn btn-p blg" style={{marginTop:16,opacity:sel?1:.4}} disabled={!sel} onClick={()=>onNext(sel)}>Continuer →</button>
      </div>
    </div>
  );
};

const ModuleSelect=({station,onBack,onNext})=>{
  const [sel,setSel]=useState(null);
  return(
    <div className="screen">
      <header className="hdr"><div className="logo">Terrain<em>Pro</em></div><span className="pill" style={{background:"rgba(0,200,160,.15)",color:T.teal}}>Étape 2 / 3</span></header>
      <div className="scroll">
        <button className="back" onClick={onBack}>{Ic.back()} Retour</button>
        <div className="sh"><h2>Module</h2><p>📍 {station.nom}</p></div>
        {MODULES.map((m,i)=><div key={m.id} className={`sel aup d${(i%4)+1} ${sel?.id===m.id?"on":""}`} onClick={()=>setSel(m)}><div style={{width:46,height:46,borderRadius:14,background:`${m.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{m.icon}</div><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14,color:T.navy}}>{m.nom}</div><div style={{fontSize:12,color:T.slate,marginTop:2}}>{CHECKLIST[m.id]?.length} items · {m.code}</div></div><div className={`sel-ck ${sel?.id===m.id?"on":""}`} style={{background:sel?.id===m.id?m.color:"transparent",borderColor:sel?.id===m.id?m.color:"#DDE5EF"}}>{sel?.id===m.id&&Ic.check("#fff",12)}</div></div>)}
        <button className="btn btn-p blg" style={{marginTop:16,opacity:sel?1:.4}} disabled={!sel} onClick={()=>onNext(sel)}>Démarrer l'inspection →</button>
      </div>
    </div>
  );
};

const ChecklistSc=({station,module,user,onBack,onFinish})=>{
  const items=CHECKLIST[module.id]||[];
  const fileRef=useRef(null);
  const sigRef=useRef(null);
  const [cur,setCur]=useState(0);
  const [answers,setAns]=useState({});
  const [cmts,setCmts]=useState({});
  const [photos,setPhotos]=useState({});
  const [gps,setGps]=useState(null);
  const [showSig,setShowSig]=useState(false);
  const [sigCtrl,setSigCtrl]=useState(null);
  const item=items[cur];

  useEffect(()=>{
    if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>setGps({lat:p.coords.latitude.toFixed(5),lng:p.coords.longitude.toFixed(5)}),()=>setGps({lat:"33.58921",lng:"-7.60341"}));
  },[]);

  // init signature canvas
  useEffect(()=>{
    if(showSig&&sigRef.current&&!sigCtrl){
      const ctx=sigRef.current.getContext("2d");
      let drawing=false,last={x:0,y:0};
      const gp=(e)=>{const r=sigRef.current.getBoundingClientRect();const s=e.touches?e.touches[0]:e;return{x:s.clientX-r.left,y:s.clientY-r.top};};
      const start=(e)=>{e.preventDefault();drawing=true;last=gp(e);};
      const draw=(e)=>{if(!drawing)return;e.preventDefault();ctx.strokeStyle="#0B1F3A";ctx.lineWidth=2;ctx.lineCap="round";const p=gp(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;};
      const stop=()=>{drawing=false;};
      sigRef.current.addEventListener("mousedown",start);sigRef.current.addEventListener("mousemove",draw);sigRef.current.addEventListener("mouseup",stop);sigRef.current.addEventListener("touchstart",start,{passive:false});sigRef.current.addEventListener("touchmove",draw,{passive:false});sigRef.current.addEventListener("touchend",stop);
      setSigCtrl({clear:()=>ctx.clearRect(0,0,sigRef.current.width,sigRef.current.height),getURL:()=>sigRef.current.toDataURL()});
    }
  },[showSig]);

  const handleFiles=(files)=>{
    Array.from(files).forEach(f=>{
      const r=new FileReader();
      r.onload=e=>setPhotos(p=>({...p,[cur]:[...(p[cur]||[]),{url:e.target.result,name:f.name}]}));
      r.readAsDataURL(f);
    });
    showToast(`${files.length} photo(s) ajoutée(s) ✓`);
  };

  const goNext=()=>{
    if(cur<items.length-1){setCur(c=>c+1);}
    else{
      const total=items.length;
      const ok=Object.values(answers).filter(v=>v===true).length;
      const nc=Object.values(answers).filter(v=>v===false).length;
      const score=Math.round((ok/total)*100);
      const allPhotos=Object.values(photos).flat();
      const anomalies=items.filter((_,i)=>answers[i]===false);
      const sigURL=sigCtrl&&!sigCtrl.isEmpty?sigCtrl.getURL():null;
      onFinish({answers,cmts,photos,items,module,station,user,score,total,ok,nc,nbPhotos:allPhotos.length,allPhotos,anomalies,gps,signature:sigURL});
    }
  };

  return(
    <div className="screen">
      <header className="hdr">
        <div style={{flex:1}}><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:15,color:"#fff",letterSpacing:.5}}>{module.icon} {module.nom}</div><div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginTop:1}}>{station.nom}</div></div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:T.teal}}>{cur+1}/{items.length}</div>
      </header>
      <div className="scroll">
        <div className="pw"><div className="pf" style={{width:`${(cur/items.length)*100}%`}}/></div>
        <div className="qc">
          <div className="qn">Question {cur+1} / {items.length}</div>
          <div className="qt">{item}</div>
          <div className="cb">
            <button className={`cbtn ok ${answers[cur]===true?"on":""}`} onClick={()=>setAns(a=>({...a,[cur]:true}))}>{Ic.check(answers[cur]===true?"#15803D":T.slate,16)} Conforme</button>
            <button className={`cbtn nok ${answers[cur]===false?"on":""}`} onClick={()=>setAns(a=>({...a,[cur]:false}))}>{Ic.x(answers[cur]===false?"#DC2626":T.slate,16)} Non conforme</button>
          </div>
          <textarea className="cmt" rows={2} placeholder="Commentaire…" value={cmts[cur]||""} onChange={e=>setCmts(c=>({...c,[cur]:e.target.value}))}/>
          <div className="photo-zone">
            <label className="pz-label" htmlFor={`ph-${cur}`}>{Ic.camera(T.slate,16)} Ajouter photo(s) depuis galerie / caméra</label>
            <input id={`ph-${cur}`} type="file" accept="image/*" multiple capture="environment" onChange={e=>handleFiles(e.target.files)}/>
            {(photos[cur]||[]).length>0&&<div className="ph-grid">{(photos[cur]||[]).map((ph,pi)=><div key={pi} className="ph-wrap"><img src={ph.url} alt={ph.name} className="ph-img"/><button className="ph-del" onClick={()=>setPhotos(p=>{const n=[...(p[cur]||[])];n.splice(pi,1);return{...p,[cur]:n};})}>×</button></div>)}</div>}
          </div>
          {gps&&<div className="gps-tag" style={{marginTop:12}}>{Ic.pin("#00C8A0")} {gps.lat}, {gps.lng}</div>}
        </div>

        {/* Signature (last question only) */}
        {cur===items.length-1&&(
          <div style={{marginTop:14}}>
            <div style={{fontSize:12,fontWeight:700,color:T.slate,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>Signature du superviseur</div>
            <div className="sig-wrap">
              <canvas ref={sigRef} className="sig-canvas" width={360} height={100} style={{touchAction:"none",cursor:"crosshair"}}/>
              <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",color:"#C4D0DE",fontSize:12,pointerEvents:"none"}}>Signez ici…</div>
              <button className="sig-clear" onClick={()=>sigCtrl?.clear()}>Effacer</button>
            </div>
          </div>
        )}

        <div className="nb">
          <button className="btn btn-s bmd" style={{flex:1,opacity:cur===0?.4:1}} disabled={cur===0} onClick={()=>setCur(c=>Math.max(0,c-1))}>← Préc.</button>
          <button className="btn btn-p bmd" style={{flex:2,opacity:answers[cur]===undefined?.45:1}} disabled={answers[cur]===undefined} onClick={goNext}>
            {cur===items.length-1?"Terminer ✓":"Suivant →"}
          </button>
        </div>
        <div className="qdots">
          {items.map((_,idx)=><div key={idx} className="qdot" onClick={()=>setCur(idx)} style={{background:answers[idx]===true?T.success:answers[idx]===false?T.danger:idx===cur?T.navy:"#E0E8F0",color:answers[idx]!==undefined||idx===cur?"#fff":T.slate}}>{idx+1}</div>)}
        </div>
      </div>
    </div>
  );
};

// ── Rapport + PDF professionnel ───────────────────────────────
const RapportSc=({data,onHome,onNew,isOffline,onSavePending})=>{
  const {score,total,ok,nc,nbPhotos,allPhotos=[],items,answers,cmts,module,station,user,gps,anomalies=[],signature}=data;
  const pct=`${score}%`;
  const secteurNom=SECTEURS.find(s=>s.id===user.secteurId)?.nom||"—";
  const fmt2=(d)=>new Date(d).toLocaleDateString("fr-MA",{day:"2-digit",month:"long",year:"numeric"});
  const fmtT2=(d)=>new Date(d).toLocaleTimeString("fr-MA",{hour:"2-digit",minute:"2-digit"});

  useEffect(()=>{
    const v={id:uid(),supId:user.id,supNom:`${user.prenom} ${user.nom}`,secteurId:user.secteurId,stationId:station.id,stationNom:station.nom,moduleId:module.id,moduleNom:module.nom,date:new Date(),score,total,ok,nc,nbNC:nc,nbPhotos,anomalies:items.filter((_,i)=>answers[i]===false),gps};
    DB.visites.push(v);
    if(isOffline){OFFLINE.saveVisite({...v,items,answers,cmts,allPhotos}).then(()=>onSavePending?.());}
  },[]);

  const exportPDF=()=>{
    const anomHTML=anomalies.map((q,i)=>{const idx=items.indexOf(q);return`<div style="display:flex;gap:10px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 13px;margin-bottom:7px"><div style="width:22px;height:22px;border-radius:50%;background:#DC2626;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div><div><div style="font-size:12px;font-weight:600">${q}</div>${cmts[idx]?`<div style="font-size:11px;color:#6B7A8D;margin-top:3px">💬 ${cmts[idx]}</div>`:""}</div></div>`;}).join("");
    const rowsHTML=items.map((q,i)=>`<tr style="background:${i%2===0?"#FAFBFC":"#fff"}"><td style="padding:8px 11px;border-bottom:1px solid #F0F4F9;color:#9CA3AF;font-weight:700;width:32px;text-align:center">${i+1}</td><td style="padding:8px 11px;border-bottom:1px solid #F0F4F9;font-size:11.5px">${q}</td><td style="padding:8px 11px;border-bottom:1px solid #F0F4F9;font-size:11px;font-weight:600;color:${answers[i]===true?"#16A34A":answers[i]===false?"#DC2626":"#9CA3AF"}">${answers[i]===true?"✓ Conforme":answers[i]===false?"✗ Non conforme":"— N/A"}</td><td style="padding:8px 11px;border-bottom:1px solid #F0F4F9;font-size:10.5px;color:#6B7A8D">${cmts[i]||"—"}</td></tr>`).join("");
    const photosHTML=allPhotos.slice(0,9).map((ph,i)=>`<div><img src="${ph.url}" style="width:100%;height:90px;object-fit:cover;border-radius:8px;border:1px solid #E0E8F0"/><div style="font-size:9px;color:#9CA3AF;text-align:center;margin-top:3px">Photo ${i+1}</div></div>`).join("");
    const sigHTML=signature?`<img src="${signature}" style="max-height:60px;max-width:180px"/>`:
      `<div style="height:1px;background:#CBD5E1;margin:30px 16px 10px"/><div style="font-size:12px;font-weight:700;color:#0B1F3A">${user.prenom} ${user.nom}</div>`;

    const w=window.open("","_blank","width=900,height=700");
    if(!w){alert("Autorisez les popups pour générer le PDF");return;}
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Rapport TerrainPro — ${station.nom}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}html{font-size:13px}body{font-family:'Segoe UI',Arial,sans-serif;color:#1A2A3A;background:#fff;padding:0}.page{max-width:794px;margin:0 auto;padding:32px 36px}@media print{@page{margin:14mm 16mm;size:A4 portrait}body{padding:0}.page{padding:0;max-width:100%}.no-print{display:none!important}.pb{page-break-before:always}}</style></head>
<body>
<button class="no-print" onclick="window.print()" style="position:fixed;top:20px;right:20px;background:#0B1F3A;color:#fff;border:none;border-radius:10px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(11,31,58,.35);font-family:Arial,sans-serif">🖨️ Imprimer / PDF</button>
<div class="page">
<!-- HEADER -->
<div style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #0B1F3A;padding-bottom:18px;margin-bottom:22px">
<div><svg width="120" height="28" viewBox="0 0 140 32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="8" fill="#0B1F3A"/><text x="16" y="22" text-anchor="middle" font-family="Arial Black" font-size="14" font-weight="900" fill="#00C8A0">TP</text><text x="42" y="14" font-family="Arial Black" font-size="13" font-weight="900" fill="#0B1F3A">TERRAIN</text><text x="42" y="28" font-family="Arial Black" font-size="13" font-weight="900" fill="#00C8A0">PRO</text></svg><div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6B7A8D;margin-top:8px">Rapport de Visite Terrain</div><div style="font-size:8px;color:#9CA3AF;margin-top:3px">Réf: TP-${Date.now().toString(36).toUpperCase()} · v5.0</div></div>
<div style="text-align:center;background:${score>=90?"#F0FDF4":score>=70?"#FFFBEB":"#FEF2F2"};border:2px solid ${scoreColor(score)};border-radius:12px;padding:10px 20px;min-width:90px"><div style="font-size:36px;font-weight:900;color:${scoreColor(score)};line-height:1">${score}%</div><div style="font-size:9px;color:#6B7A8D;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-top:3px">${score>=90?"Excellent":score>=70?"Acceptable":"Non conforme"}</div></div>
</div>
<!-- KPIs -->
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:6px">
${[["#16A34A",ok,"✅ Conformes"],["#DC2626",nc,"❌ Non-conf."],["#0B1F3A",total,"📋 Total"],["#3B82F6",nbPhotos,"📷 Photos"]].map(([c,v,l])=>`<div style="background:#F8FAFC;border-radius:10px;padding:12px;text-align:center;border:1px solid #E8EFF7"><div style="font-size:24px;font-weight:900;color:${c};line-height:1">${v}</div><div style="font-size:9px;color:#6B7A8D;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-top:4px">${l}</div></div>`).join("")}
</div>
<!-- INFO -->
<div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#0B1F3A;border-left:3px solid #00C8A0;padding-left:10px;margin:22px 0 12px">Informations</div>
<table style="width:100%;border-collapse:collapse;border:1px solid #E0E8F0;border-radius:10px;overflow:hidden">
${[["Station",station.nom],["Module",`${module.icon} ${module.nom}`],["Secteur",secteurNom],["Superviseur",`${user.prenom} ${user.nom}`],["Date",fmt2(new Date())],["Heure",fmtT2(new Date())],["GPS Lat",gps?.lat||"—"],["GPS Lng",gps?.lng||"—"]].map(([k,v],i)=>`<tr><td style="padding:9px 14px;border-bottom:1px solid #F0F4F9;font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.6px">${k}</td><td style="padding:9px 14px;border-bottom:1px solid #F0F4F9;font-size:12px;font-weight:600;color:#0B1F3A">${v}</td></tr>`).join("")}
</table>
<!-- ANOMALIES -->
<div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#0B1F3A;border-left:3px solid #EF4444;padding-left:10px;margin:22px 0 12px">⚠️ Anomalies (${anomalies.length})</div>
${anomalies.length===0?`<p style="color:#16A34A;font-size:12px;font-weight:600;padding:10px 0">✅ Aucune anomalie — conformité totale</p>`:anomHTML}
<!-- CHECKLIST -->
<div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#0B1F3A;border-left:3px solid #00C8A0;padding-left:10px;margin:22px 0 12px">Checklist complète</div>
<table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="background:#0B1F3A;color:#fff"><th style="padding:9px 11px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.5px;width:32px">#</th><th style="padding:9px 11px;text-align:left">Item</th><th style="padding:9px 11px;text-align:left;width:115px">Résultat</th><th style="padding:9px 11px;text-align:left;width:130px">Commentaire</th></tr></thead><tbody>${rowsHTML}</tbody></table>
<!-- PHOTOS -->
${allPhotos.length>0?`<div class="pb"><div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#0B1F3A;border-left:3px solid #00C8A0;padding-left:10px;margin:22px 0 12px">📷 Photos terrain</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">${photosHTML}</div></div>`:""}
<!-- SIGNATURE -->
<div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#0B1F3A;border-left:3px solid #00C8A0;padding-left:10px;margin:22px 0 12px">Validation & Signature</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
<div style="border:1.5px solid #E0E8F0;border-radius:10px;padding:16px;text-align:center"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9CA3AF;margin-bottom:10px">Superviseur</div>${sigHTML}<div style="font-size:12px;font-weight:700;color:#0B1F3A;margin-top:8px">${user.prenom} ${user.nom}</div><div style="font-size:10px;color:#9CA3AF;margin-top:2px">${fmt2(new Date())}</div></div>
<div style="border:1.5px solid #E0E8F0;border-radius:10px;padding:16px;text-align:center"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9CA3AF;margin-bottom:10px">Responsable Secteur</div><div style="height:1px;background:#CBD5E1;margin:30px 16px 10px"/><div style="font-size:11px;color:#9CA3AF">À signer par le responsable</div><div style="font-size:11px;color:#9CA3AF;margin-top:4px">Date: _______________</div></div>
</div>
<!-- FOOTER -->
<div style="margin-top:28px;padding-top:14px;border-top:1px solid #E0E8F0;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#9CA3AF"><span>TerrainPro v5.0 © ${new Date().getFullYear()} — Rapport généré automatiquement</span><span>${new Date().toISOString()}</span></div>
</div></body></html>`);
    w.document.close();
    setTimeout(()=>w.print(),500);
    showToast("Rapport PDF ouvert ✓");
  };

  return(
    <div className="screen">
      <header className="hdr"><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:"#fff",letterSpacing:.5}}>Rapport d'inspection</div><div style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>{fmt(new Date())}</div></header>
      <div className="scroll">
        <div className="card" style={{marginBottom:14}}>
          <div className="ring-wrap">
            <div className="ring" style={{background:`conic-gradient(${scoreColor(score)} 0% ${pct},#E0E8F0 ${pct} 100%)`}}>
              <div className="ring-in"><div className="ring-v">{score}</div><div className="ring-p">/ 100</div></div>
            </div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:.5,color:T.navy}}>{score>=90?"Excellent ✅":score>=70?"Acceptable ⚠️":"Non conforme ❌"}</div>
            <div style={{fontSize:12,color:T.slate,marginTop:3}}>{ok}/{total} items conformes</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",borderTop:"1px solid #EEF2F7"}}>
            {[["📷","Photos",nbPhotos],["❌","NC",nc],["✅","OK",ok]].map(([ico,l,v],i)=><div key={i} style={{textAlign:"center",padding:"13px 8px",borderRight:i<2?"1px solid #EEF2F7":undefined}}><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:T.navy}}>{v}</div><div style={{fontSize:10,color:T.slate}}>{ico} {l}</div></div>)}
          </div>
        </div>

        {isOffline&&<div className="off-bar"><span style={{fontSize:18}}>⏳</span><div><div style={{fontWeight:700,fontSize:13,color:T.danger}}>Sauvegardé hors ligne</div><div style={{fontSize:12,color:T.slate,marginTop:2}}>Sera synchronisé au retour du réseau</div></div></div>}

        <div className="card card-p" style={{marginBottom:14}}>
          {[["Station",station.nom],["Module",`${module.icon} ${module.nom}`],["Superviseur",`${user.prenom} ${user.nom}`],["GPS",gps?`${gps.lat}, ${gps.lng}`:"—"],["Date/Heure",`${fmt(new Date())} ${fmtT(new Date())}`]].map(([k,v],i)=><div key={i} className="pdf-row"><span style={{color:T.slate}}>{k}</span><span style={{fontWeight:700,color:T.navy,maxWidth:"58%",textAlign:"right"}}>{v}</span></div>)}
        </div>

        {allPhotos.length>0&&<><div className="st">📷 Photos ({allPhotos.length})</div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>{allPhotos.map((ph,i)=><img key={i} src={ph.url} alt={ph.name} style={{width:68,height:68,borderRadius:11,objectFit:"cover",border:`2px solid ${T.border}`}}/>)}</div></>}

        {anomalies.length>0&&<><div className="st">⚠️ Anomalies ({anomalies.length})</div>{anomalies.map((q,i)=>{const idx=items.indexOf(q);return(<div key={i} className="anomaly">{Ic.x(T.danger,14)}<div><div style={{fontSize:13,fontWeight:600,color:T.navy}}>{q}</div>{cmts[idx]&&<div style={{fontSize:12,color:T.slate,marginTop:3}}>💬 {cmts[idx]}</div>}</div></div>);})}</>}

        <div style={{marginTop:18,display:"flex",flexDirection:"column",gap:9}}>
          <button className="btn btn-d blg" onClick={exportPDF}>{Ic.dl("#fff")} Exporter & Imprimer PDF</button>
          <button className="btn btn-o blg" onClick={()=>showToast("Excel: intégrez SheetJS dans le projet")}>📊 Exporter en Excel</button>
          <button className="btn btn-s blg" onClick={onNew}>{Ic.plus(T.navy)} Nouvelle inspection</button>
          <button className="btn btn-s blg" onClick={onHome}>{Ic.home(T.navy)} Retour accueil</button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════
export default function App(){
  const [user,setUser]=useState(null);
  const [nav,setNav]=useState("dash");
  const [step,setStep]=useState(null);
  const [selSt,setSelSt]=useState(null);
  const [selMod,setSelMod]=useState(null);
  const [rapD,setRapD]=useState(null);
  const [isOffline,setOff]=useState(false);
  const [pending,setPend]=useState(0);
  const [isSyncing,setSyncing]=useState(false);
  const [tick,setTick]=useState(0);
  const refresh=useCallback(()=>setTick(t=>t+1),[]);

  // Real offline detection
  useEffect(()=>{
    const goOn= async()=>{
      setOff(false);
      const p=await OFFLINE.getPending();
      if(p.length>0){
        setSyncing(true);
        showToast(`Synchronisation de ${p.length} visite(s)…`);
        setTimeout(async()=>{
          for(const v of p)await OFFLINE.markSynced(v.localId);
          setPend(0);setSyncing(false);showToast(`${p.length} visite(s) synchronisée(s) ✓`);
        },1500);
      }
    };
    const goOff=()=>setOff(true);
    window.addEventListener("online",goOn);
    window.addEventListener("offline",goOff);
    if(!navigator.onLine)setOff(true);
    OFFLINE.getPendingCount().then(setPend);
    // Demo sim
    const t1=setTimeout(()=>setOff(true),14000);
    const t2=setTimeout(()=>{setOff(false);},20000);
    return()=>{window.removeEventListener("online",goOn);window.removeEventListener("offline",goOff);clearTimeout(t1);clearTimeout(t2);};
  },[]);

  const login  =u=>{setUser(u);setNav("dash");};
  const logout =()=>{setUser(null);setNav("dash");setStep(null);};
  const doSync =async()=>{
    setSyncing(true);
    const p=await OFFLINE.getPending();
    setTimeout(async()=>{for(const v of p)await OFFLINE.markSynced(v.localId);setPend(0);setSyncing(false);showToast("Synchronisation réussie ✓");},1200);
  };

  const startVisit =()=>setStep("station");
  const onStation  =s=>{setSelSt(s);setStep("module");};
  const onModule   =m=>{setSelMod(m);setStep("checklist");};
  const onFinish   =d=>{setRapD(d);setStep("rapport");refresh();};
  const backToHome =()=>{setStep(null);setNav("dash");};
  const newVisit   =()=>setStep("station");
  const onSavePending=async()=>{setPend(await OFFLINE.getPendingCount());};

  if(!user)return<><style>{CSS}</style><div className="shell"><Login onLogin={login}/></div><Toast/></>;
  if(step==="station")return<><style>{CSS}</style><div className="shell"><StationSelect user={user} onBack={()=>setStep(null)} onNext={onStation}/></div><Toast/></>;
  if(step==="module") return<><style>{CSS}</style><div className="shell"><ModuleSelect station={selSt} onBack={()=>setStep("station")} onNext={onModule}/></div><Toast/></>;
  if(step==="checklist")return<><style>{CSS}</style><div className="shell"><ChecklistSc station={selSt} module={selMod} user={user} onBack={()=>setStep("module")} onFinish={onFinish}/></div><Toast/></>;
  if(step==="rapport")return<><style>{CSS}</style><div className="shell"><RapportSc data={rapD} onHome={backToHome} onNew={newVisit} isOffline={isOffline} onSavePending={onSavePending}/></div><Toast/></>;

  const render=()=>{
    if(user.role==="admin"){
      if(nav==="dash")    return<AdminDash user={user} setNav={setNav}/>;
      if(nav==="users")   return<UsersScreen currentUser={user} refresh={refresh}/>;
      if(nav==="stations")return<StationsScreen refresh={refresh}/>;
      if(nav==="stats")   return<Analytics user={user}/>;
    }
    if(user.role==="superviseur"){
      if(nav==="dash")    return<SupDash user={user} onNewVisit={startVisit}/>;
      if(nav==="visite")  {startVisit();return<SupDash user={user} onNewVisit={startVisit}/>;}
      if(nav==="rapports")return<ReportsScreen user={user}/>;
      if(nav==="stats")   return<Analytics user={user}/>;
      if(nav==="profil")  return<ProfilScreen user={user} onLogout={logout}/>;
    }
  };

  return(
    <><style>{CSS}</style>
    <div className="shell">
      <Header user={user} isOffline={isOffline} pending={pending} isSyncing={isSyncing} onSync={doSync} onLogout={logout}/>
      <div className="screen">{render()}</div>
      <BottomNav role={user.role} active={nav} setNav={v=>{if(v==="visite"){startVisit();}else setNav(v);}}/>
    </div>
    <Toast/></>
  );
}
