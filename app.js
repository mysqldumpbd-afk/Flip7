// ═══════════════════════════════════════════════════════════════
// app.js — FLIP 7: Race to 200  v4.0
// Firebase init + Auth (Google / Email / Anónimo) + Demo + Sounds
// ═══════════════════════════════════════════════════════════════

firebase.initializeApp({
  apiKey:"AIzaSyApch0BMFO9cGB63Mt-Czuo4E0pc11k2Y8",
  authDomain:"flip7-e364b.firebaseapp.com",
  databaseURL:"https://flip7-e364b-default-rtdb.firebaseio.com",
  projectId:"flip7-e364b",
  storageBucket:"flip7-e364b.firebasestorage.app",
  messagingSenderId:"505574308605",
  appId:"1:505574308605:web:51c63edb57b32a289f1c94"
});
const _db   = firebase.database();
const _auth = firebase.auth();

// ── AUTH HELPERS ────────────────────────────────────────────────
// Google Sign-In
async function signInGoogle(){
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  return _auth.signInWithPopup(provider);
}
// Email / Password
async function signInEmail(email, password){
  return _auth.signInWithEmailAndPassword(email, password);
}
async function signUpEmail(email, password, displayName){
  const cred = await _auth.createUserWithEmailAndPassword(email, password);
  await cred.user.updateProfile({displayName});
  return cred;
}
// Anónimo (como antes — sin cuenta)
async function signInAnon(){
  return _auth.signInAnonymously();
}
// Cerrar sesión
async function signOut(){
  return _auth.signOut();
}
// Estado actual
function currentUser(){ return _auth.currentUser; }

// ── USUARIO PROFILE en Firebase ─────────────────────────────────
// Sanitiza un string a una clave válida para Firebase RTDB
// (sin . # $ [ ] / y en minúsculas, para usar como key de /userIndex)
function fbKey(str){
  return (str||'').toString().trim().toLowerCase().replace(/[.#$\[\]\/]/g,'_');
}

// Guarda/actualiza perfil del usuario autenticado en /users/{uid}
// y su(s) clave(s) de búsqueda en /userIndex/{clave} -> uid
// (evita tener que leer el nodo /users completo para buscar amigos)
async function saveUserProfile(user, extraData={}){
  if(!user) return;
  const ref = _db.ref('users/'+user.uid);
  const snap = await ref.once('value');
  const prev = snap.val()||{};
  const displayName = user.displayName||prev.displayName||'';
  const email = user.email||prev.email||'';

  await ref.update({
    uid: user.uid,
    email,
    displayName,
    photoURL: user.photoURL||prev.photoURL||'',
    provider: user.providerData&&user.providerData[0]
      ? user.providerData[0].providerId : 'anonymous',
    isAnon: user.isAnonymous||false,
    lastLogin: Date.now(),
    createdAt: prev.createdAt||Date.now(),
    ...extraData
  });

  // Actualizar índice de búsqueda. Cada clave guarda {uid,name,email} completos
  // (no solo el uid) para poder listar sugerencias por prefijo sin leer /users
  // de cada candidato — más rápido y evita lecturas de más.
  const idxEntry = { uid: user.uid, name: displayName||email||'', email };
  const idxUpdates = {};
  if(email)       idxUpdates['userIndex/'+fbKey(email)]       = idxEntry;
  if(displayName) idxUpdates['userIndex/'+fbKey(displayName)] = idxEntry;
  if(Object.keys(idxUpdates).length){
    try{ await _db.ref().update(idxUpdates); }
    catch(e){ console.warn('userIndex update falló (no bloquea login):', e.message); }
  }
}

// ── DEMO STORE (modo offline sin Firebase) ──────────────────────
const _DS={},_DL={};
function demoSet(p,d){_DS[p]=JSON.parse(JSON.stringify(d));(_DL[p]||[]).forEach(c=>c(_DS[p]));return Promise.resolve();}
function demoGet(p){return Promise.resolve(_DS[p]||null);}
function demoListen(p,cb){_DL[p]=_DL[p]||[];_DL[p].push(cb);if(_DS[p])cb(_DS[p]);return()=>{_DL[p]=_DL[p].filter(f=>f!==cb);};}

// ── AUDIO / SOUNDS ──────────────────────────────────────────────
let _actx=null;
function getAC(){if(!_actx)_actx=new(window.AudioContext||window.webkitAudioContext)();return _actx;}
function beep(f=440,d=.08,t='sine',v=.3){try{const a=getAC(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+d);o.start();o.stop(a.currentTime+d);}catch(e){}}
function snd(t){
  if(t==='tap')    beep(600,.05,'sine',.18);
  else if(t==='score'){beep(520,.08,'sine',.28);setTimeout(()=>beep(660,.1,'sine',.28),100);}
  else if(t==='round'){beep(440,.1,'square',.2);setTimeout(()=>beep(550,.1,'square',.2),120);setTimeout(()=>beep(660,.15,'square',.25),240);}
  else if(t==='winner'){[0,150,300,450].forEach((d,i)=>setTimeout(()=>beep(440+i*110,.15,'sine',.35),d));}
  else if(t==='up')   {beep(600,.06,'sine',.2);setTimeout(()=>beep(800,.1,'sine',.25),80);}
  else if(t==='down') beep(300,.12,'sine',.2);
  else if(t==='join') {beep(500,.08,'sine',.25);setTimeout(()=>beep(700,.1,'sine',.3),100);}
  else if(t==='num')  beep(700,.04,'sine',.13);
  else if(t==='zero') beep(400,.08,'triangle',.18);
  else if(t==='op')   beep(550,.06,'triangle',.2);
  else if(t==='del')  beep(300,.05,'sine',.15);
  else if(t==='fanfare'){
    const notes=[523,659,784,1047,784,1047,1175,1047];
    const durs=[.12,.12,.12,.25,.1,.12,.12,.35];
    let t2=0;
    notes.forEach((f,i)=>{setTimeout(()=>beep(f,durs[i],'sine',.4),t2*1000);t2+=durs[i]+.04;});
  }
  else if(t==='victory'){
    const melody=[523,523,523,392,523,659,392,330,440,494,466,440,392,523,659,784];
    const dur=[.15,.15,.15,.2,.3,.5,.3,.2,.15,.15,.15,.15,.2,.2,.2,.5];
    let t2=0;
    melody.forEach((f,i)=>{setTimeout(()=>beep(f,dur[i],'sine',.35),t2*1000);t2+=dur[i]+.05;});
  }
  else if(t==='spec_join'){
    [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,.15,'sine',.3),i*180));
  }
}

// ── CALCULADORA — evaluación segura ────────────────────────────
function safeEval(expr){
  try{
    const clean=expr.replace(/[^0-9+\-*/().]/g,'');
    if(!clean)return 0;
    const r=Function('"use strict";return ('+clean+')')();
    return isFinite(r)?Math.round(r*100)/100:null;
  }catch{return null;}
}
