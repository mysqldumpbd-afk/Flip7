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
//
// Por qué signInWithPopup + respaldo a redirect: en navegadores de
// escritorio (Chrome, Firefox, Safari) cada vez es más común que bloqueen
// las cookies de terceros que el popup de Google necesita para avisarle a
// la página que ya terminó -- ahí el popup falla o se queda colgado sin
// resolver nunca. En el celular casi no pasa (el navegador móvil maneja
// esto distinto), por eso ahí se sentía instantáneo y en web no.
// Si el popup falla con un error real (no que el usuario lo haya cerrado
// a propósito), reintentamos automáticamente con signInWithRedirect, que
// no depende de cookies de terceros -- manda al usuario a la página de
// Google y lo trae de vuelta ya logueado (ver getRedirectResult más abajo).
function googleProvider(){
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  return provider;
}
// Cuando el navegador bloquea el storage de terceros (Tracking Prevention de
// Edge, ITP de Safari, etc.) el popup de Google no lanza ningún error: se
// queda colgado sin resolver ni rechazar nunca, así que un try/catch normal
// no lo detecta. Esta carrera contra un timeout obliga a que, si el popup
// no contestó en POPUP_TIMEOUT_MS, se trate igual que un error real y se
// caiga automáticamente al flujo por redirect -- sin depender de que el
// usuario note el link "¿se está tardando?" y lo presione a mano.
const POPUP_TIMEOUT_MS = 9000;
function withPopupTimeout(promise){
  let timer;
  const timeout = new Promise(function(_, reject){
    timer = setTimeout(function(){
      reject({code:'auth/popup-timeout', message:'El popup no respondió a tiempo'});
    }, POPUP_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(function(){ clearTimeout(timer); });
}
async function signInGoogle(){
  try{
    return await withPopupTimeout(_auth.signInWithPopup(googleProvider()));
  }catch(e){
    if(e && e.code==='auth/popup-closed-by-user') throw e; // cerró la ventana a propósito -- no forzar redirect
    console.warn('[Auth] Popup de Google falló o no respondió, reintentando con redirect:', e&&e.code, e&&e.message);
    return _auth.signInWithRedirect(googleProvider()); // la página navega afuera; el resultado se recoge en getRedirectResult()
  }
}
// Disparo manual del flujo por redirect -- para el botón "¿se está
// tardando?" que se muestra si el popup lleva varios segundos sin resolver
// (el popup puede quedar colgado sin lanzar ningún error que el catch de
// arriba pueda atrapar, así que también hace falta una salida manual).
async function signInGoogleRedirect(){
  return _auth.signInWithRedirect(googleProvider());
}
// Recoge el resultado cuando el login (o la vinculación de cuenta) se
// resolvió por redirect en vez de popup -- se ejecuta una sola vez al
// cargar la página; en una carga normal (que no es el regreso desde
// Google) resuelve a null y no hace nada.
_auth.getRedirectResult().then(function(result){
  if(result && result.user){
    saveUserProfile(result.user).catch(function(e){console.warn('saveUserProfile tras redirect falló:',e.message);});
  }
}).catch(function(e){
  console.warn('[Auth] getRedirectResult falló:', e&&e.code, e&&e.message);
});
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
// Vincular cuenta anónima a Google/Email — conserva el mismo uid y todo lo
// que ya se guardó bajo esa sesión (en vez de crear una cuenta nueva y huérfana)
async function linkAnonToGoogle(){
  const user=_auth.currentUser;
  if(!user||!user.isAnonymous) throw new Error("No hay sesión anónima activa");
  try{
    return await withPopupTimeout(user.linkWithPopup(googleProvider()));
  }catch(e){
    if(e && e.code==='auth/popup-closed-by-user') throw e;
    console.warn('[Auth] Popup de vinculación falló o no respondió, reintentando con redirect:', e&&e.code, e&&e.message);
    return user.linkWithRedirect(googleProvider()); // la página navega afuera; el resultado se recoge en getRedirectResult()
  }
}
// Disparo manual del flujo por redirect para vincular -- mismo botón de
// "¿se está tardando?" que signInGoogleRedirect, pero para vincular una
// cuenta anónima ya existente en vez de iniciar sesión desde cero.
async function linkAnonToGoogleRedirect(){
  const user=_auth.currentUser;
  if(!user||!user.isAnonymous) throw new Error("No hay sesión anónima activa");
  return user.linkWithRedirect(googleProvider());
}
async function linkAnonToEmail(email,password,displayName){
  const user=_auth.currentUser;
  if(!user||!user.isAnonymous) throw new Error("No hay sesión anónima activa");
  const cred=firebase.auth.EmailAuthProvider.credential(email,password);
  const result=await user.linkWithCredential(cred);
  if(displayName) await result.user.updateProfile({displayName});
  return result;
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

// ── HUELLA DE DISPOSITIVO (best-effort, no bloquea nada) ──────────
// Un id aleatorio persistente en localStorage -- NO es un fingerprint real
// de hardware ni una medida de seguridad dura, solo permite reconocer "este
// mismo navegador ya estuvo aquí" para detectar reincidencia tras un baneo
// (ver pestaña Seguridad del panel admin). Si el usuario borra localStorage,
// usa modo incógnito o cambia de navegador, deja de coincidir -- es una
// señal para el admin, no un bloqueo técnico (eso requeriría Cloud Functions
// de pago, fuera del plan gratuito elegido para este proyecto).
function getOrCreateDeviceId(){
  try{
    let id=localStorage.getItem('f7deviceId');
    if(!id){
      id='dev_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
      localStorage.setItem('f7deviceId', id);
    }
    return id;
  }catch(e){ return null; }
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
    deviceId: getOrCreateDeviceId()||prev.deviceId||null,
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

// ── MODERACIÓN / ADMIN — baneo, suspensión, advertencias, bitácora ──────
// Todo vive en nodos separados de /users (moderation/{uid}, adminAudit) en
// vez de anidado dentro de /users/{uid}: la regla de /users/{uid} ya le da
// escritura al propio dueño de la cuenta, y un permiso abierto en un nodo
// padre no se puede cerrar con una regla más restrictiva en un hijo -- si
// el estado de baneo viviera ahí adentro, cualquier usuario podría
// desbanearse a sí mismo escribiendo directo. Por eso son nodos aparte,
// con escritura exclusiva del correo admin (ver reglas de Firebase).
function logAdminAction(action, targetUid, extra){
  const admin=_auth.currentUser;
  return _db.ref('adminAudit').push(Object.assign({
    action: action,
    targetUid: targetUid||null,
    by: (admin&&admin.email)||'?',
    at: Date.now()
  }, extra||{})).catch(function(e){ console.warn('No se pudo registrar en la bitácora:', e.message); });
}
async function warnUser(uid, reason, source){
  // seenAt:null reinicia el "ya la vi" del usuario -- si ya había reconocido
  // una advertencia anterior, esta nueva vuelve a mostrarse la próxima vez
  // que abra la app (ver listener de moderation/{uid} en components.jsx).
  await _db.ref('moderation/'+uid).update({
    status:'warned', reason: reason||'', until:null, seenAt:null,
    sourceType:(source&&source.type)||null, sourceId:(source&&source.id)||null,
    updatedAt: Date.now(), updatedBy:(_auth.currentUser&&_auth.currentUser.email)||'?'
  });
  // Contador acumulado de advertencias -- transaction para que sea atómico
  // aunque se adviertan varios usuarios casi al mismo tiempo.
  await _db.ref('moderation/'+uid+'/warnCount').transaction(function(cur){ return (cur||0)+1; });
  await logAdminAction('warn', uid, {reason: reason||'', sourceType:(source&&source.type)||null, sourceId:(source&&source.id)||null});
}
async function suspendUser(uid, reason, untilTs, source){
  await _db.ref('moderation/'+uid).update({
    status:'suspended', reason: reason||'', until: untilTs||null,
    sourceType:(source&&source.type)||null, sourceId:(source&&source.id)||null,
    updatedAt: Date.now(), updatedBy:(_auth.currentUser&&_auth.currentUser.email)||'?'
  });
  await logAdminAction('suspend', uid, {reason: reason||'', until: untilTs||null, sourceType:(source&&source.type)||null, sourceId:(source&&source.id)||null});
}
async function banUser(uid, reason, source){
  // Guarda un snapshot del deviceId actual del usuario -- permite detectar
  // en Seguridad si vuelve a aparecer el mismo navegador con otra cuenta
  // (ver getOrCreateDeviceId arriba). No bloquea nada, solo avisa.
  const devSnap=await _db.ref('users/'+uid+'/deviceId').once('value').catch(function(){return null;});
  const deviceId=devSnap?devSnap.val():null;
  await _db.ref('moderation/'+uid).update({
    status:'banned', reason: reason||'', until:null, deviceId: deviceId||null,
    sourceType:(source&&source.type)||null, sourceId:(source&&source.id)||null,
    updatedAt: Date.now(), updatedBy:(_auth.currentUser&&_auth.currentUser.email)||'?'
  });
  await logAdminAction('ban', uid, {reason: reason||'', sourceType:(source&&source.type)||null, sourceId:(source&&source.id)||null});
}
// Cierra remotamente la sesión activa de un usuario -- escribe una marca de
// tiempo que components.jsx escucha en vivo; si es más reciente que el
// inicio de la sesión actual del usuario, la app hace signOut() sola.
// No es una revocación real a nivel de Firebase Auth (eso requiere Admin
// SDK / Cloud Functions), pero funciona mientras la pestaña siga abierta.
async function forceLogoutUser(uid){
  await _db.ref('users/'+uid+'/forceLogoutAt').set(Date.now());
  await logAdminAction('force_logout', uid, {});
}
async function liftModeration(uid){
  await _db.ref('moderation/'+uid).update({
    status:'ok', reason:'', until:null,
    updatedAt: Date.now(), updatedBy:(_auth.currentUser&&_auth.currentUser.email)||'?'
  });
  await logAdminAction('unban', uid, {});
}
async function adminEditDisplayName(uid, newName){
  await _db.ref('users/'+uid+'/displayName').set(newName);
  await logAdminAction('edit_name', uid, {newName: newName});
}
// Lee el estado de moderación de un usuario y resuelve si debería estar
// bloqueado AHORA MISMO -- una suspensión ya vencida deja de contar sola,
// sin que el admin tenga que revertirla a mano. Las advertencias ('warned')
// no bloquean, solo quedan de contexto para el admin.
function checkModeration(uid){
  return _db.ref('moderation/'+uid).once('value').then(function(snap){
    const m=snap.val();
    if(!m) return null;
    if(m.status==='banned') return m;
    if(m.status==='suspended'){
      if(m.until && Date.now()>m.until) return null;
      return m;
    }
    return null;
  }).catch(function(){ return null; });
}

// ── ADMIN: salas, grupos y acciones masivas ─────────────────────────────
// rooms/$roomId y groups/$gid ya eran de escritura abierta para cualquier
// autenticado (así funciona hoy el juego -- cualquiera con el código puede
// escribir su propia sala), así que estas funciones no necesitan permisos
// nuevos; solo agregan el registro en la bitácora que las demás acciones
// de admin ya tienen.
// Nota general de snapshots: adminAudit ya es de lectura/escritura exclusiva
// del admin, así que guardar ahí una copia del nodo justo antes de borrarlo
// no necesita reglas nuevas ni infraestructura extra -- es la única forma de
// poder reconstruir algo eliminado por error, o investigar qué contenía una
// sala/grupo después de que ya no existe en su ubicación original.
async function closeRoom(code, reason){
  const snap=await _db.ref('rooms/'+code).once('value').catch(function(){return null;});
  const data=snap?snap.val():null;
  await _db.ref('rooms/'+code).remove();
  await logAdminAction('close_room', null, {roomCode: code, reason: reason||'', snapshot: data});
}
async function kickPlayerFromRoom(code, playerId, playerName){
  const snap=await _db.ref('rooms/'+code+'/players').once('value');
  const players=snap.val()||[];
  const next=players.filter(function(p){ return p.id!==playerId; });
  await _db.ref('rooms/'+code+'/players').set(next);
  await _db.ref('rooms/'+code+'/presence/'+playerId).remove().catch(function(){});
  await logAdminAction('kick_player', null, {roomCode: code, playerName: playerName||''});
}
async function deleteRoomsBulk(codes){
  const snaps=await Promise.all(codes.map(function(c){
    return _db.ref('rooms/'+c).once('value').then(function(s){return s.val();}).catch(function(){return null;});
  }));
  const updates={};
  codes.forEach(function(c){ updates['rooms/'+c]=null; });
  await _db.ref().update(updates);
  const snapshot={};
  codes.forEach(function(c,i){ snapshot[c]=snaps[i]; });
  await logAdminAction('bulk_delete_rooms', null, {count: codes.length, codes: codes.join(','), snapshot: snapshot});
}
async function deleteGroupAdmin(gid, groupName){
  const snap=await _db.ref('groups/'+gid).once('value').catch(function(){return null;});
  const data=snap?snap.val():null;
  await _db.ref('groups/'+gid).remove();
  await logAdminAction('delete_group', null, {groupId: gid, groupName: groupName||'', snapshot: data});
}
async function deleteGroupsBulk(gids){
  const snaps=await Promise.all(gids.map(function(gid){
    return _db.ref('groups/'+gid).once('value').then(function(s){return s.val();}).catch(function(){return null;});
  }));
  const updates={};
  gids.forEach(function(gid){ updates['groups/'+gid]=null; });
  await _db.ref().update(updates);
  const snapshot={};
  gids.forEach(function(gid,i){ snapshot[gid]=snaps[i]; });
  await logAdminAction('bulk_delete_groups', null, {count: gids.length, snapshot: snapshot});
}
async function banUsersBulk(uids, reason){
  const admin=_auth.currentUser;
  const deviceIds=await Promise.all(uids.map(function(uid){
    return _db.ref('users/'+uid+'/deviceId').once('value').then(function(s){return s.val();}).catch(function(){return null;});
  }));
  const updates={};
  uids.forEach(function(uid,i){
    updates['moderation/'+uid+'/status']='banned';
    updates['moderation/'+uid+'/reason']=reason||'';
    updates['moderation/'+uid+'/until']=null;
    updates['moderation/'+uid+'/deviceId']=deviceIds[i]||null;
    updates['moderation/'+uid+'/updatedAt']=Date.now();
    updates['moderation/'+uid+'/updatedBy']=(admin&&admin.email)||'?';
  });
  await _db.ref().update(updates);
  await logAdminAction('bulk_ban', null, {count: uids.length, reason: reason||''});
}
async function warnUsersBulk(uids, reason){
  const updates={};
  const admin=_auth.currentUser;
  uids.forEach(function(uid){
    updates['moderation/'+uid+'/status']='warned';
    updates['moderation/'+uid+'/reason']=reason||'';
    updates['moderation/'+uid+'/until']=null;
    updates['moderation/'+uid+'/seenAt']=null;
    updates['moderation/'+uid+'/updatedAt']=Date.now();
    updates['moderation/'+uid+'/updatedBy']=(admin&&admin.email)||'?';
  });
  await _db.ref().update(updates);
  await Promise.all(uids.map(function(uid){
    return _db.ref('moderation/'+uid+'/warnCount').transaction(function(cur){ return (cur||0)+1; });
  }));
  await logAdminAction('bulk_warn', null, {count: uids.length, reason: reason||''});
}
async function suspendUsersBulk(uids, reason, untilTs){
  const updates={};
  const admin=_auth.currentUser;
  uids.forEach(function(uid){
    updates['moderation/'+uid+'/status']='suspended';
    updates['moderation/'+uid+'/reason']=reason||'';
    updates['moderation/'+uid+'/until']=untilTs||null;
    updates['moderation/'+uid+'/updatedAt']=Date.now();
    updates['moderation/'+uid+'/updatedBy']=(admin&&admin.email)||'?';
  });
  await _db.ref().update(updates);
  await logAdminAction('bulk_suspend', null, {count: uids.length, reason: reason||'', until: untilTs||null});
}
async function unbanUsersBulk(uids){
  const updates={};
  const admin=_auth.currentUser;
  uids.forEach(function(uid){
    updates['moderation/'+uid+'/status']='ok';
    updates['moderation/'+uid+'/reason']='';
    updates['moderation/'+uid+'/until']=null;
    updates['moderation/'+uid+'/updatedAt']=Date.now();
    updates['moderation/'+uid+'/updatedBy']=(admin&&admin.email)||'?';
  });
  await _db.ref().update(updates);
  await logAdminAction('bulk_unban', null, {count: uids.length});
}
async function resolveTicketsBulk(type, ids){
  const updates={};
  ids.forEach(function(id){
    updates['feedbackMeta/'+type+'/'+id+'/status']='resolved';
    updates['feedbackMeta/'+type+'/'+id+'/updatedAt']=Date.now();
  });
  await _db.ref().update(updates);
  await logAdminAction('bulk_resolve_'+type, null, {count: ids.length});
}

// ── PRESENCIA — se reafirma en cada reconexión (bloqueo de pantalla, wifi
// caído, app en segundo plano) y detecta grupos nuevos sin requerir volver
// a iniciar sesión. Antes solo se escribía una vez al loguear, por eso
// alguien podía quedarse marcado "offline" para siempre tras reconectar.
let _presenceCleanup=null;
function startPresenceHeartbeat(uid){
  if(_presenceCleanup) _presenceCleanup(); // evitar listeners duplicados
  const groupsRef=_db.ref('users/'+uid+'/groups');
  const connectedRef=_db.ref('.info/connected');
  let currentGids=[];
  let isConnected=false;

  function applyPresence(){
    if(!isConnected) return;
    // Global — para mostrar "en línea" en Amigos sin depender de grupo compartido
    const gRef=_db.ref('presence/_global/'+uid);
    gRef.onDisconnect().update({online:false,lastSeen:{'.sv':'timestamp'}});
    gRef.update({online:true,lastSeen:Date.now()});
    // Por grupo — para la pantalla de Grupos
    currentGids.forEach(gid=>{
      const ref=_db.ref('presence/'+gid+'/'+uid);
      ref.onDisconnect().update({online:false,lastSeen:{'.sv':'timestamp'}});
      ref.update({online:true,status:'idle',lastSeen:Date.now()});
    });
  }

  const connHandler=connectedRef.on('value',snap=>{
    isConnected=!!snap.val();
    if(isConnected) applyPresence();
  });
  const groupsHandler=groupsRef.on('value',snap=>{
    currentGids=Object.keys(snap.val()||{});
    applyPresence();
  });

  _presenceCleanup=()=>{
    connectedRef.off('value',connHandler);
    groupsRef.off('value',groupsHandler);
    _presenceCleanup=null;
  };
  return _presenceCleanup;
}

// ── DEMO STORE (modo offline sin Firebase) ──────────────────────
const _DS={},_DL={};
function demoSet(p,d){_DS[p]=JSON.parse(JSON.stringify(d));(_DL[p]||[]).forEach(c=>c(_DS[p]));return Promise.resolve();}
function demoUpdate(p,patch){_DS[p]={...(_DS[p]||{}),...JSON.parse(JSON.stringify(patch))};(_DL[p]||[]).forEach(c=>c(_DS[p]));return Promise.resolve();}
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
  else if(t==='roundchange'){
    // Aviso de ronda nueva — mucho más largo y notorio que 'round' (que
    // se usa para acciones rápidas como cerrar ronda o unirse), para que
    // se note claramente aunque no estés mirando la pantalla ese instante.
    const notes=[392,440,523,659,784,659,523,659,784,880];
    const durs=[.12,.12,.12,.18,.35,.12,.12,.18,.4,.5];
    let t2=0;
    notes.forEach((f,i)=>{setTimeout(()=>beep(f,durs[i],'triangle',.32),t2*1000);t2+=durs[i]+.03;});
  }
  else if(t==='jungle'){
    // Celebración Selva — tambores graves y rápidos, cierre con un chillido agudo
    const beat=[100,80,100,120,80,100,140];
    const dur=[.09,.07,.09,.09,.07,.09,.15];
    let t2=0;
    beat.forEach((f,i)=>{setTimeout(()=>beep(f,dur[i],'triangle',.4),t2*1000);t2+=dur[i]+.03;});
    setTimeout(()=>{beep(900,.08,'sawtooth',.25);setTimeout(()=>beep(700,.1,'sawtooth',.22),90);},t2*1000+80);
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
