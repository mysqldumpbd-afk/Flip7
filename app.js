// ═══════════════════════════════════════════════════════════
//  FLIP 7 — app.js
//  Firebase SDK v10 via CDN (funciona en GitHub Pages)
// ═══════════════════════════════════════════════════════════
import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase config ──────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyApch0BMFO9cGB63Mt-Czuo4E0pc11k2Y8",
  authDomain:        "flip7-e364b.firebaseapp.com",
  projectId:         "flip7-e364b",
  storageBucket:     "flip7-e364b.firebasestorage.app",
  messagingSenderId: "505574308605",
  appId:             "1:505574308605:web:51c63edb57b32a289f1c94",
  measurementId:     "G-BFSLZWCZXC"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ── Constants ─────────────────────────────────────────────
const WIN    = 200;
const EMOJIS = ["🔴","🔵","🟡","🟢","🟣","🟠","⚪","🩷"];
const COLORS  = ["#E63946","#2EC4B6","#F5C800","#3BB273","#7B2D8B","#FF6B35","#aaa","#ff69b4"];
const CONF    = ["#F5C800","#E63946","#2EC4B6","#FF6B35","#fff","#3BB273","#7B2D8B"];

function uid4(){ return Math.random().toString(36).slice(2,6).toUpperCase(); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function fmtDate(ts){ return new Date(ts).toLocaleDateString("es-MX",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}); }

// ── App state ─────────────────────────────────────────────
window._state = {
  roomCode: null,
  room: null,
  sessions: JSON.parse(localStorage.getItem("flip7_sessions")||"[]"),
  scanPid: null,
  scanImgB64: null,
  scanImgType: null,
  scanResult: null,
  manualPid: null,
  manualVal: "",
  unsubscribe: null,
  winnerShown: false,
  playerSetupCount: 3,
};
const S = window._state;

// ── Firestore helpers ─────────────────────────────────────
const roomRef = code => doc(db, "rooms", code.toUpperCase());

async function fsCreate(code, players){
  await setDoc(roomRef(code), {
    code,
    players: players.map((name,i)=>({
      id: uid(), name: name.trim(),
      emoji: EMOJIS[i%EMOJIS.length], color: COLORS[i%COLORS.length],
      total: 0, rounds: []
    })),
    round: 1, roundScores: {}, finished: false, winner: null, createdAt: Date.now()
  });
}

async function fsGet(code){
  const snap = await getDoc(roomRef(code.toUpperCase()));
  return snap.exists() ? snap.data() : null;
}

function fsListen(code, cb){
  return onSnapshot(roomRef(code.toUpperCase()), snap => {
    if(snap.exists()) cb(snap.data());
  });
}

// ── Screen navigation ─────────────────────────────────────
window.showView = function(view){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(`screen-${view}`);
  if(el) el.classList.add("active");
  window.scrollTo(0,0);
};

// ── Player setup fields ───────────────────────────────────
window.addPlayerField = function(){
  const list = document.getElementById("players-list");
  const i = list.children.length;
  if(i >= 8) return;
  const row = document.createElement("div");
  row.className = "player-setup-row";
  row.innerHTML = `
    <span style="font-size:1.2rem">${EMOJIS[i%EMOJIS.length]}</span>
    <input class="inp" style="margin:0;flex:1" placeholder="Jugador ${i+1}" data-idx="${i}"/>
    <button class="remove-player-btn" onclick="removePlayerField(this)">✕</button>`;
  list.appendChild(row);
};

window.removePlayerField = function(btn){
  const list = document.getElementById("players-list");
  if(list.children.length <= 2) return;
  btn.closest(".player-setup-row").remove();
};

function initPlayerFields(){
  const list = document.getElementById("players-list");
  list.innerHTML = "";
  for(let i=0;i<3;i++) addPlayerField();
}

function getPlayerNames(){
  return Array.from(document.querySelectorAll("#players-list .inp"))
    .map(el=>el.value.trim()).filter(Boolean);
}

// ── Create room ───────────────────────────────────────────
window.createRoom = async function(){
  const names = getPlayerNames();
  const errEl  = document.getElementById("create-error");
  const dbgEl  = document.getElementById("create-debug");
  errEl.style.display = "none";
  dbgEl.style.display = "none";

  if(names.length < 2){
    showError(errEl,"Necesitas al menos 2 jugadores.");
    return;
  }

  const btn = document.getElementById("btn-create");
  btn.disabled = true;
  btn.textContent = "⏳ Creando sala…";

  try{
    const code = uid4();
    await fsCreate(code, names);
    S.roomCode = code;
    S.winnerShown = false;
    startListening(code);
    document.getElementById("game-code-label").textContent = code;
    showView("game");
    switchTab("round", document.querySelector(".nav-btn"));
  } catch(e){
    const detail = buildErrorDetail(e);
    showError(errEl, detail.message);
    if(detail.extra) showDebug(dbgEl, detail.extra);
  }

  btn.disabled = false;
  btn.textContent = "🎮 CREAR SALA";
};

// ── Join room ─────────────────────────────────────────────
window.joinRoom = async function(){
  const code = document.getElementById("join-code").value.trim().toUpperCase();
  const name = document.getElementById("join-name").value.trim();
  const errEl = document.getElementById("join-error");
  const dbgEl = document.getElementById("join-debug");
  errEl.style.display = "none";
  dbgEl.style.display = "none";

  if(code.length < 4){ showError(errEl,"Código debe ser de 4 caracteres."); return; }
  if(!name){ showError(errEl,"Ingresa tu nombre."); return; }

  try{
    const r = await fsGet(code);
    if(!r){ showError(errEl,`❌ Sala "${code}" no encontrada. Verifica el código.`); return; }
    if(r.finished){ showError(errEl,`⚠️ Esta sala ya terminó. Pide al host crear una nueva.`); return; }

    S.roomCode = code;
    S.winnerShown = false;
    startListening(code);
    document.getElementById("game-code-label").textContent = code;
    showView("game");
    switchTab("round", document.querySelector(".nav-btn"));
  } catch(e){
    const detail = buildErrorDetail(e);
    showError(errEl, detail.message);
    if(detail.extra) showDebug(dbgEl, detail.extra);
  }
};

// ── Spectator ─────────────────────────────────────────────
window.joinSpectator = async function(){
  const code = document.getElementById("join-code").value.trim().toUpperCase();
  const errEl = document.getElementById("join-error");
  const dbgEl = document.getElementById("join-debug");
  errEl.style.display = "none";
  dbgEl.style.display = "none";

  if(code.length < 4){ showError(errEl,"Código debe ser de 4 caracteres."); return; }

  try{
    const r = await fsGet(code);
    if(!r){ showError(errEl,`❌ Sala "${code}" no encontrada.`); return; }

    S.roomCode = code;
    startListening(code);
    document.getElementById("spec-code-label").textContent = code;
    document.getElementById("spec-room-label").textContent = code;
    showView("spectator");
  } catch(e){
    const detail = buildErrorDetail(e);
    showError(errEl, detail.message);
    if(detail.extra) showDebug(dbgEl, detail.extra);
  }
};

// ── Error helpers ─────────────────────────────────────────
function buildErrorDetail(e){
  console.error("Flip7 error:", e);
  const code = e.code || "";
  const msg  = e.message || String(e);

  if(!navigator.onLine)
    return { message:"📵 Sin conexión a internet. Verifica tu red.", extra: null };

  if(code === "permission-denied" || msg.includes("permission"))
    return { message:"🔒 Sin permisos en Firestore. Revisa las reglas de seguridad en Firebase Console.", extra:`Rules: allow read, write: if true;` };

  if(code === "unavailable" || msg.includes("unavailable"))
    return { message:"🌐 Firestore no disponible. Puede ser un problema temporal, intenta de nuevo.", extra: msg };

  if(code === "not-found")
    return { message:"🔍 Sala no encontrada. Verifica el código.", extra: null };

  if(msg.includes("Failed to fetch") || msg.includes("fetch"))
    return { message:"🌐 Error de red. Si estás en Claude.ai, esta app debe abrirse desde GitHub Pages.", extra:`Error: ${msg}` };

  if(msg.includes("CORS") || msg.includes("cors"))
    return { message:"🚫 Error de CORS. Abre la app desde GitHub Pages, no directamente.", extra: msg };

  return { message:`⚠️ Error inesperado: ${code||msg}`, extra: msg };
}

function showError(el, msg){
  el.innerHTML = `⚠️ ${msg}`;
  el.style.display = "flex";
}

function showDebug(el, msg){
  el.textContent = `Debug: ${msg}`;
  el.style.display = "block";
}

// ── Live listener ─────────────────────────────────────────
function startListening(code){
  if(S.unsubscribe) S.unsubscribe();
  S.unsubscribe = fsListen(code, data => {
    S.room = data;
    renderCurrentScreen();
    if(data.finished && data.winner && !S.winnerShown){
      S.winnerShown = true;
      showWinner(data.winner);
      saveSession(data);
    }
  });
}

function renderCurrentScreen(){
  const active = document.querySelector(".screen.active");
  if(!active) return;
  const id = active.id;
  if(id === "screen-game") renderGame();
  if(id === "screen-spectator") renderSpectator();
}

// ── Leave / Home ──────────────────────────────────────────
window.leaveGame = function(){
  if(S.unsubscribe){ S.unsubscribe(); S.unsubscribe = null; }
  S.roomCode = null; S.room = null; S.winnerShown = false;
  showView("home");
  renderSessions();
};

// ── Tab switching ─────────────────────────────────────────
window.switchTab = function(tab, btn){
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("on"));
  if(btn) btn.classList.add("on");
  ["round","scores","history"].forEach(t=>{
    const el = document.getElementById(`tab-${t}`);
    if(el) el.style.display = t===tab ? "block" : "none";
  });
  if(tab==="scores") renderScores();
  if(tab==="history") renderGameHistory();
};

// ── Render game ───────────────────────────────────────────
function renderGame(){
  if(!S.room) return;
  const r = S.room;

  document.getElementById("round-label").textContent = `RONDA ${r.round}`;
  document.getElementById("round-num").textContent = r.round;

  // alerts
  const alertsEl = document.getElementById("round-alerts");
  alertsEl.innerHTML = "";
  if(r.finished && r.winner){
    alertsEl.innerHTML = `<div class="alert alert-green">🏆 ¡${r.winner.name} ganó el juego!</div>`;
  } else {
    const allDone = r.players.every(p => r.roundScores?.[p.id] !== undefined);
    const someDone = r.players.some(p => r.roundScores?.[p.id] !== undefined);
    if(allDone) alertsEl.innerHTML = `<div class="alert alert-green">✅ ¡Todos listos! Cierra la ronda.</div>`;
    else if(someDone) alertsEl.innerHTML = `<div class="alert alert-yellow">⏳ Esperando que todos capturen…</div>`;
  }

  // players
  const pEl = document.getElementById("players-round");
  const allDone2 = r.players.every(p => r.roundScores?.[p.id] !== undefined);
  pEl.innerHTML = r.players.map(p => {
    const entry = r.roundScores?.[p.id];
    const done  = entry !== undefined;
    return `<div class="player-row ${done?"done":"waiting"}" style="--clr:${p.color}">
      <div class="avatar" style="background:${p.color}22;color:${p.color}">${p.emoji}</div>
      <div style="flex:1">
        <div class="pr-name">${p.name}</div>
        ${done ? `
          <div style="display:flex;align-items:center;gap:7px;margin-top:3px">
            <span class="pr-pts">+${entry.score}</span>
            <span class="method-tag method-${entry.method}">${entry.method==="scan"?"📷 scan":entry.method==="zero"?"0️⃣ zero":"✏️ manual"}</span>
          </div>` : `
          <div class="action-row">
            <button class="act-btn act-scan" onclick="openScan('${p.id}','${p.name}')">📷 Escanear</button>
            <button class="act-btn act-zero" onclick="submitScore('${p.id}',0,'zero')">0️⃣ Cero</button>
            <button class="act-btn act-manual" onclick="openManual('${p.id}','${p.name}')">✏️</button>
          </div>`}
      </div>
      ${done ? `<button class="undo-btn" onclick="undoScore('${p.id}')">✕</button>` : ""}
    </div>`;
  }).join("");

  const closeBtn = document.getElementById("btn-close-round");
  closeBtn.disabled = !allDone2 || r.finished;
  closeBtn.style.display = r.finished ? "none" : "";
}

// ── Scores ────────────────────────────────────────────────
function renderScores(){
  if(!S.room) return;
  const sorted = [...S.room.players].sort((a,b)=>b.total-a.total);
  const maxRound = S.room.round - 1;

  document.getElementById("big-score-grid").innerHTML = sorted.map((p,i) => `
    <div class="big-score-card ${i===0?"first":""}">
      <div class="bsc-rank">${i===0?"👑":`#${i+1}`}</div>
      <div>
        <div class="bsc-name">${p.emoji} ${p.name}</div>
        <div class="bsc-detail">${p.rounds.length} ronda${p.rounds.length!==1?"s":""} · faltan ${Math.max(0,WIN-p.total)} pts</div>
      </div>
      <div class="bsc-score">${p.total}</div>
      <div class="bsc-bar" style="width:${Math.min(100,(p.total/WIN)*100)}%"></div>
      <div class="progress-label">${Math.round((p.total/WIN)*100)}%</div>
    </div>`).join("");

  const tableWrap = document.getElementById("round-table-wrap");
  if(maxRound > 0){
    tableWrap.style.display = "block";
    document.getElementById("round-table-head").innerHTML =
      `<tr><th>Jugador</th>${Array.from({length:maxRound},(_,i)=>`<th>R${i+1}</th>`).join("")}<th>Total</th></tr>`;
    document.getElementById("round-table-body").innerHTML = sorted.map((p,ri) =>
      `<tr class="${ri===0?"leader-row":""}">
        <td>${p.emoji} ${p.name}</td>
        ${p.rounds.map(r=>`<td class="${r.score===0?"round-zero":""}">${r.score}</td>`).join("")}
        ${Array.from({length:maxRound-p.rounds.length},()=>"<td>—</td>").join("")}
        <td class="total-col">${p.total}</td>
      </tr>`).join("");
  } else {
    tableWrap.style.display = "none";
  }
}

// ── Spectator ─────────────────────────────────────────────
function renderSpectator(){
  if(!S.room) return;
  const r = S.room;
  const sorted = [...r.players].sort((a,b)=>b.total-a.total);
  const maxRound = r.round - 1;

  document.getElementById("spec-room-label").textContent = `${S.roomCode} · RONDA ${r.round}`;

  document.getElementById("spec-grid").innerHTML = sorted.map((p,i) => `
    <div class="big-score-card ${i===0?"first":""}" style="padding:${i===0?"18px 22px":"14px 18px"}">
      <div class="bsc-rank" style="font-size:${i===0?"3.2rem":"2.4rem"}">${i===0?"👑":`#${i+1}`}</div>
      <div>
        <div class="bsc-name" style="font-size:${i===0?"1.2rem":"0.95rem"}">${p.emoji} ${p.name}</div>
        <div class="bsc-detail">faltan ${Math.max(0,WIN-p.total)} pts · ${Math.round((p.total/WIN)*100)}%</div>
      </div>
      <div class="bsc-score" style="font-size:${i===0?"4.2rem":"2.8rem"}">${p.total}</div>
      <div class="bsc-bar" style="width:${Math.min(100,(p.total/WIN)*100)}%;height:${i===0?5:3}px"></div>
    </div>`).join("");

  const tw = document.getElementById("spec-table-wrap");
  if(maxRound > 0){
    tw.style.display = "block";
    document.getElementById("spec-table-head").innerHTML =
      `<tr><th>Jugador</th>${Array.from({length:maxRound},(_,i)=>`<th>R${i+1}</th>`).join("")}<th>Total</th></tr>`;
    document.getElementById("spec-table-body").innerHTML = sorted.map((p,ri) =>
      `<tr class="${ri===0?"leader-row":""}">
        <td>${p.emoji} ${p.name}</td>
        ${p.rounds.map(r=>`<td class="${r.score===0?"round-zero":""}">${r.score}</td>`).join("")}
        ${Array.from({length:maxRound-p.rounds.length},()=>"<td>—</td>").join("")}
        <td class="total-col">${p.total}</td>
      </tr>`).join("");
  } else {
    tw.style.display = "none";
  }
}

// ── Submit / Undo score ───────────────────────────────────
window.submitScore = async function(pid, score, method){
  if(!S.room) return;
  const newScores = { ...S.room.roundScores, [pid]: { score, method } };
  await updateDoc(doc(db,"rooms",S.roomCode), { roundScores: newScores });
};

window.undoScore = async function(pid){
  if(!S.room) return;
  const newScores = { ...S.room.roundScores };
  delete newScores[pid];
  await updateDoc(doc(db,"rooms",S.roomCode), { roundScores: newScores });
};

// ── Finalize round ────────────────────────────────────────
window.finalizeRound = async function(){
  if(!S.room) return;
  const r = S.room;
  const newPlayers = r.players.map(p => {
    const e   = r.roundScores?.[p.id];
    const pts = e ? e.score : 0;
    return { ...p, total: p.total + pts, rounds: [...p.rounds, { score: pts, method: e?.method||"zero" }] };
  });
  const champ = newPlayers.find(p => p.total >= WIN);
  await setDoc(doc(db,"rooms",S.roomCode), {
    ...r, players: newPlayers, roundScores: {},
    round: champ ? r.round : r.round + 1,
    finished: !!champ, winner: champ || null
  });
};

// ── SCAN MODAL ────────────────────────────────────────────
window.openScan = function(pid, name){
  S.scanPid = pid;
  S.scanImgB64 = null;
  S.scanImgType = null;
  S.scanResult = null;
  document.getElementById("scan-player-name").textContent = name;
  setScanPhase("pick");
  document.getElementById("modal-scan").style.display = "flex";
};

window.closeScanModal = function(){
  document.getElementById("modal-scan").style.display = "none";
  document.getElementById("file-input").value = "";
};

window.scanRetake = function(){
  S.scanImgB64 = null; S.scanResult = null;
  document.getElementById("file-input").value = "";
  setScanPhase("pick");
};

function setScanPhase(phase){
  ["pick","preview","analyzing","result","error"].forEach(p=>{
    document.getElementById(`scan-phase-${p}`).style.display = p===phase?"block":"none";
  });
}

window.handleFileSelect = function(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const dataUrl = ev.target.result;
    S.scanImgB64  = dataUrl.split(",")[1];
    S.scanImgType = dataUrl.split(";")[0].split(":")[1] || "image/jpeg";
    document.getElementById("scan-preview-img").src = dataUrl;
    setScanPhase("preview");
  };
  reader.readAsDataURL(file);
};

window.openGallery = function(){
  const fi = document.getElementById("file-input");
  fi.removeAttribute("capture");
  fi.click();
  setTimeout(()=> fi.setAttribute("capture","environment"), 800);
};

window.analyzeImage = async function(){
  const img = document.getElementById("scan-preview-img").src;
  document.getElementById("scan-analyzing-img").src = img;
  setScanPhase("analyzing");
  try{
    const resp = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514", max_tokens:300,
        messages:[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:S.scanImgType,data:S.scanImgB64}},
          {type:"text",text:`Esta es una foto de las cartas del juego Flip 7 de un jugador.
Suma ÚNICAMENTE los números visibles en las cartas. Las cartas numeradas van del 0 al 12.
Cartas de acción (Flip, Freeze, Second Chance) no suman, ignóralas.
Cartas con "+N" como "+8" SÍ suman ese número.
Responde SOLO con JSON sin markdown: {"total":<número>,"cards":[<lista>],"note":"<breve nota en español>"}`}
        ]}]
      })
    });
    if(!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const data  = await resp.json();
    const text  = data.content?.map(c=>c.text||"").join("")||"";
    const clean = text.replace(/```json|```/g,"").trim();
    const parsed = JSON.parse(clean);
    S.scanResult = parsed;
    document.getElementById("scan-result-total").textContent = parsed.total;
    document.getElementById("scan-result-cards").textContent = `Cartas: ${parsed.cards?.join(" + ")||"—"}`;
    document.getElementById("scan-result-note").textContent  = parsed.note || "";
    document.getElementById("scan-confirm-btn").textContent  = `✅ Confirmar ${parsed.total} pts`;
    setScanPhase("result");
  } catch(e){
    console.error("Scan error:", e);
    document.getElementById("scan-error-msg").textContent =
      `No pude leer las cartas. ${e.message||""} Toma otra foto con más luz o usa captura manual.`;
    setScanPhase("error");
  }
};

window.confirmScanResult = function(){
  if(!S.scanResult) return;
  submitScore(S.scanPid, S.scanResult.total, "scan");
  closeScanModal();
};

// ── MANUAL MODAL ──────────────────────────────────────────
window.openManual = function(pid, name){
  S.manualPid = pid;
  S.manualVal = "";
  document.getElementById("manual-player-name").textContent = name;
  document.getElementById("manual-display").textContent = "0";
  document.getElementById("modal-manual").style.display = "flex";
};

window.closeManualModal = function(){
  document.getElementById("modal-manual").style.display = "none";
};

window.numPress = function(d){
  if(d==="⌫"){ S.manualVal = S.manualVal.slice(0,-1); }
  else if(S.manualVal.length < 3){ S.manualVal += d; }
  document.getElementById("manual-display").textContent = S.manualVal || "0";
};

window.confirmManual = function(){
  submitScore(S.manualPid, parseInt(S.manualVal)||0, "manual");
  closeManualModal();
};

// ── WINNER ────────────────────────────────────────────────
function showWinner(winner){
  document.getElementById("winner-name-display").textContent = `${winner.emoji} ${winner.name}`;
  document.getElementById("winner-pts-display").textContent  = `${winner.total} PUNTOS · RACE TO 200!`;

  const container = document.getElementById("confetti-container");
  container.innerHTML = "";
  const colors = CONF;
  for(let i=0;i<40;i++){
    const d = document.createElement("div");
    d.style.cssText = `position:absolute;background:${colors[i%colors.length]};width:${7+Math.random()*9}px;height:${7+Math.random()*9}px;left:${Math.random()*100}%;top:-20px;border-radius:${Math.random()>0.5?"2px":"50%"};animation:cfall ${2.5+Math.random()*2.5}s ${Math.random()*2.5}s linear infinite`;
    container.appendChild(d);
  }
  document.getElementById("screen-winner").style.display = "block";
}

window.hideWinner = function(){
  document.getElementById("screen-winner").style.display = "none";
  switchTab("scores", document.querySelectorAll(".nav-btn")[1]);
};

window.newGame = function(){
  document.getElementById("screen-winner").style.display = "none";
  leaveGame();
};

// ── Sessions ──────────────────────────────────────────────
function saveSession(data){
  if(!data.winner) return;
  const already = S.sessions.find(s=>s.code===data.code && s.date===data.createdAt);
  if(already) return;
  const session = { id: uid(), date: data.createdAt||Date.now(), players: data.players, rounds: data.round, winner: data.winner.name, code: data.code };
  S.sessions = [session, ...S.sessions].slice(0,20);
  localStorage.setItem("flip7_sessions", JSON.stringify(S.sessions));
  renderSessions();
}

function renderSessions(){
  const wrap = document.getElementById("home-sessions-wrap");
  const el   = document.getElementById("home-sessions");
  if(!S.sessions.length){ wrap.style.display="none"; return; }
  wrap.style.display = "block";
  el.innerHTML = renderSessionCards(S.sessions);
}

function renderGameHistory(){
  const el = document.getElementById("game-sessions");
  if(!S.sessions.length){
    el.innerHTML = `<div class="empty-state"><div class="e-icon">🃏</div><p>Sin sesiones aún</p></div>`;
    return;
  }
  el.innerHTML = renderSessionCards(S.sessions);
}

function renderSessionCards(sessions){
  return sessions.map(s=>`
    <div class="hist-card">
      <div class="hist-head">
        <div><div class="hist-date">${fmtDate(s.date)}</div><div class="hist-meta">${s.players.length} jugadores · ${s.rounds} rondas · Sala ${s.code}</div></div>
      </div>
      <div class="hist-winner-row">
        <span style="font-size:1.3rem">🏆</span>
        <div><div style="font-size:0.65rem;color:rgba(255,255,255,0.32);font-weight:700;letter-spacing:2px">GANADOR</div>
        <div style="font-family:'Lilita One',sans-serif;color:var(--yellow);font-size:1.05rem">${s.winner}</div></div>
      </div>
      <div class="hist-players">
        ${[...s.players].sort((a,b)=>b.total-a.total).map(p=>`<div class="hist-player-tag">${p.emoji} ${p.name} — ${p.total}pts</div>`).join("")}
      </div>
    </div>`).join("");
}

// ── Init ──────────────────────────────────────────────────
initPlayerFields();
showView("home");
renderSessions();
