// ═══════════════════════════════════════════════════════════════
// components.jsx — FLIP 7: Race to 200  v3.1
// Cambios v3.1:
//   - ScoreTab/Spectator: nombre del jugador con su color
//   - RoundTab: botón "Corregir" después de confirmar (abre ManualModal con valor actual)
//   - ScanModal: posicionado arriba-centro; fetch fresco de key desde Firebase antes de enviar;
//               cartas más grandes; agregar carta = paleta de cartas disponibles (1 clic)
//   - Revancha: solo el host puede iniciarla; escribe rematchPending en Firebase;
//               no-host ve animación "REVANCHA EN CAMINO" con contador 3→2→1
//               (aplica también en SpectatorScreen)
// ═══════════════════════════════════════════════════════════════

const{useState,useEffect,useRef,useCallback}=React;

const WIN=200;

const EMOJIS=[
  "🐀","🐂","🐅","🐇","🐉","🐍",
  "🐎","🐏","🐒","🐓","🐕","🐖",
  "🦁","🐻","🐼","🦊","🦋","🦅"
];

const COLORS=[
  "#E63946","#2EC4B6","#F5C800",
  "#3BB273","#7B2D8B","#FF6B35",
  "#00B4D8","#ff69b4","#ffffff"
];

const CONF=["#F5C800","#E63946","#2EC4B6","#FF6B35","#fff","#3BB273","#7B2D8B"];
const uid4=()=>Math.random().toString(36).slice(2,6).toUpperCase();
const uid=()=>Math.random().toString(36).slice(2,10);
const fmtDate=ts=>new Date(ts).toLocaleDateString("es-MX",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});

// Colores de texto para cada número de carta Flip 7
const CARD_TEXT_MAP={0:"#FF2FA3",1:"#B7A9C9",2:"#D8E81B",3:"#FF4B78",4:"#19C7D8",5:"#10C96C",6:"#C86AE3",7:"#F48A9A",8:"#9EDB92",9:"#FFA33A",10:"#FF3B3B",11:"#6EBBFF",12:"#B9AEC9"};
const MOD_TEXT_COLOR="#F25A7A";
const MOD_BG_COLOR="#F6A623";
const ALL_CARD_NUMS=[0,1,2,3,4,5,6,7,8,9,10,11,12];


// ── ESTADÍSTICAS — guardar por jugador en Firebase ────────────
async function saveGameStats(session, roomData){
  const gameId = session.code + "_" + session.date;
  const sorted = [...roomData.players].sort((a,b)=>b.total-a.total);
  const gameRecord = {
    gameId, date: session.date,
    code: session.code,
    rounds: roomData.round,
    playerCount: roomData.players.length,
    winner: roomData.winner?.name || "",
    winnerId: roomData.winner?.id || "",
    title: "Partida " + new Date(session.date).toLocaleDateString("es-MX",{month:"short",day:"numeric"})
  };
  // Guardar registro global del juego
  await _db.ref("stats/games/" + gameId).set({
    ...gameRecord,
    players: roomData.players.map((p,i)=>({
      id:p.id, name:p.name, emoji:p.emoji, color:p.color,
      total:p.total, position:sorted.findIndex(s=>s.id===p.id)+1,
      rounds:p.rounds||[]
    }))
  });
  // Guardar por jugador (índice por nombre para búsqueda fácil)
  for(const p of roomData.players){
    const pKey = p.name.trim().toLowerCase().replace(/[^a-z0-9]/g,"_").slice(0,30);
    const position = sorted.findIndex(s=>s.id===p.id)+1;
    const playerGameRef = _db.ref("stats/players/"+pKey+"/games/"+gameId);
    await playerGameRef.set({
      date: session.date,
      gameId, code: session.code,
      title: gameRecord.title,
      name: p.name, emoji: p.emoji, color: p.color,
      total: p.total, position,
      rounds: p.rounds||[],
      playerCount: roomData.players.length,
      won: p.id === roomData.winner?.id
    });
    // Actualizar resumen del jugador
    const summaryRef = _db.ref("stats/players/"+pKey+"/summary");
    const snap = await summaryRef.once("value");
    const prev = snap.val() || {games:0,wins:0,totalScore:0,bestScore:0,name:p.name,emoji:p.emoji,color:p.color};
    await summaryRef.set({
      name: p.name, emoji: p.emoji, color: p.color, pKey,
      games: (prev.games||0)+1,
      wins: (prev.wins||0)+(p.id===roomData.winner?.id?1:0),
      totalScore: (prev.totalScore||0)+p.total,
      bestScore: Math.max(prev.bestScore||0, p.total),
      lastPlayed: session.date
    });
  }
}

// ── FIREBASE CONFIG SETUP — escribe config/ai y config/claude si no existen ──
async function setupFirebaseConfig(geminiKey, claudeKey){
  const updates = {};
  if(geminiKey){
    updates["config/ai/provider"] = "gemini";
    updates["config/ai/key"] = geminiKey;
  }
  if(claudeKey){
    updates["config/claude/key"] = claudeKey;
  }
  if(Object.keys(updates).length > 0){
    await _db.ref().update(updates);
    return true;
  }
  return false;
}

function makeDB(demo){
  if(demo)return{set:(p,d)=>demoSet(p,d),get:(p)=>demoGet(p),listen:(p,cb)=>demoListen(p,cb)};
  return{
    set:(p,d)=>_db.ref(p).set(d),
    get:(p)=>_db.ref(p).once("value").then(s=>s.val()),
    listen:(p,cb)=>{const r=_db.ref(p);r.on("value",s=>cb(s.val()));return()=>r.off("value");},
  };
}

function classifyError(e){
  const m=String(e?.message||e);
  if(!navigator.onLine)return{msg:"⚡ Sin conexión.",steps:["Verifica tu internet"]};
  if(m.includes("PERMISSION_DENIED"))return{msg:"🔒 Sin permisos Firebase.",steps:['Reglas → ".read":true,".write":true → Publicar']};
  if(m.includes("fetch")||m.includes("network"))return{msg:"📡 Error de red.",steps:["Verifica conexión e intenta de nuevo"]};
  return{msg:"⚠ "+m.slice(0,100),steps:["Recarga la página"]};
}

// ── LANGS ─────────────────────────────────────────────────────
const LANGS={
  es:{
    appTag:"Primero en llegar a 200 gana!",
    createGame:"CREAR NUEVO JUEGO",joinGame:"UNIRME CON CÓDIGO",
    recentSessions:"ÚLTIMAS SESIONES",
    createRoom:"CREAR SALA",newGame:"Nuevo juego",
    players:"JUGADORES",addPlayer:"Agregar jugador",
    creating:"⏳ Creando sala",create:"🚀 CREAR SALA",
    back:"← Volver",
    join:"UNIRSE",roomCode:"CÓDIGO DE SALA",yourName:"TU NOMBRE",
    joinBtn:"🎮 UNIRME AL JUEGO",joining:"⏳ Conectando",
    spectator:"MODO ESPECTADOR",spectatorDesc:"Solo ver marcador, sin controles",
    spectatorBtn:"👁 ENTRAR COMO ESPECTADOR",
    round:"🎴 Ronda",table:"📊 Tabla",history:"📋 Historial",
    players2:"JUGADORES",winner:"ganó",allReady:"✅ Todos listos! Cierra la ronda.",
    waitingHost:"Esperando al host",waitingCaps:"⏳ Esperando capturas",
    closeRound:"🔒 CERRAR RONDA",rematch:"🔁 REVANCHA",endGame:"🚪 Terminar",
    ranking:"CLASIFICACIÓN",rounds2:"TABLA DE RONDAS",goal:"META: 200 PUNTOS",
    noSessions:"Sin sesiones aún",noSessionsDesc:"Completa una partida para verla aquí",
    clearHistory:"🗑 Borrar historial",confirmClear:"Borrar todo el historial?",
    finalRanking:"CLASIFICACIÓN FINAL",
    scanTitle:"📷 Scan con IA",turnOf:"Turno de:",
    geminiReady:"✅ Gemini 2.5 Flash Activo",geminiDesc:"IA incluida — Lista para usar",
    geminiLoading:"⏳ Cargando configuración",geminiLoadDesc:"La key se carga automáticamente",
    changeKey:"Cambiar IA o key (opcional):",
    tapCamera:"Toca para abrir la cámara",tapHint:"Apunta a tus cartas y toma foto",
    orGallery:"o elegir de galería",
    goodCards:"¿Se ven bien todas las cartas?",modeNotice:"⚡ Solo números base — ajusta chips después",
    anotherPhoto:"📷 Otra foto",analyze:"🔍 Analizar",
    analyzing:"Analizando con",cardsDetected:"CARTAS DETECTADAS — toca ✕ para quitar",
    totalLabel:"TOTAL FINAL",modifiers:"MODIFICADORES — toca para aplicar",
    addCard:"➕ AGREGAR CARTA",whatNum:"¿QUÉ NÚMERO? (0-12)",
    cancel:"Cancelar",add:"✓ Agregar",repeatPhoto:"📷 Repetir foto",confirm:"✓ Confirmar",
    manualTitle:"🧮 Captura Manual",pointsOf:"Puntos de",thisRound:"esta ronda",
    winner2:"Ganador!",winners:"GANADORES",ptsEach:"PUNTOS CADA UNO",
    newGame2:"🔁 REVANCHA",seeFinal:"Ver marcador final",
    liveBoard:"📡 MARCADOR EN VIVO",autoUpdate:"AUTO-ACTUALIZA · META 200 PTS",
    roundProgress:"AVANCE POR RONDAS",
    codeLabel:"SALA",
    correct:"✏️ Corregir",
  },
  en:{
    appTag:"First to reach 200 wins!",
    createGame:"CREATE NEW GAME",joinGame:"JOIN WITH CODE",
    recentSessions:"RECENT SESSIONS",
    createRoom:"CREATE ROOM",newGame:"New game",
    players:"PLAYERS",addPlayer:"Add player",
    creating:"⏳ Creating room",create:"🚀 CREATE ROOM",
    back:"← Back",
    join:"JOIN",roomCode:"ROOM CODE",yourName:"YOUR NAME",
    joinBtn:"🎮 JOIN GAME",joining:"⏳ Connecting",
    spectator:"SPECTATOR MODE",spectatorDesc:"View scoreboard only, no controls",
    spectatorBtn:"👁 ENTER AS SPECTATOR",
    round:"🎴 Round",table:"📊 Table",history:"📋 History",
    players2:"PLAYERS",winner:"won",allReady:"✅ Everyone ready! Close the round.",
    waitingHost:"Waiting for host",waitingCaps:"⏳ Waiting for captures",
    closeRound:"🔒 CLOSE ROUND",rematch:"🔁 REMATCH",endGame:"🚪 End Game",
    ranking:"RANKING",rounds2:"ROUND TABLE",goal:"GOAL: 200 POINTS",
    noSessions:"No sessions yet",noSessionsDesc:"Complete a game to see it here",
    clearHistory:"🗑 Clear history",confirmClear:"Clear all history?",
    finalRanking:"FINAL RANKING",
    scanTitle:"📷 AI Scan",turnOf:"Turn of:",
    geminiReady:"✅ Gemini 2.5 Flash Ready",geminiDesc:"AI included — Ready to use",
    geminiLoading:"⏳ Loading config",geminiLoadDesc:"Key loads from Firebase automatically",
    changeKey:"Change AI or key (optional):",
    tapCamera:"Tap to open camera",tapHint:"Point at your cards and take a photo",
    orGallery:"or choose from gallery",
    goodCards:"Can you see all cards clearly?",modeNotice:"⚡ Base numbers only — adjust chips after scan",
    anotherPhoto:"📷 Another photo",analyze:"🔍 Analyze",
    analyzing:"Analyzing with",cardsDetected:"DETECTED CARDS — tap ✕ to remove",
    totalLabel:"FINAL TOTAL",modifiers:"MODIFIERS — tap to apply",
    addCard:"➕ ADD CARD",whatNum:"WHAT NUMBER? (0-12)",
    cancel:"Cancel",add:"✓ Add",repeatPhoto:"📷 Retake photo",confirm:"✓ Confirm",
    manualTitle:"🧮 Manual Entry",pointsOf:"Points for",thisRound:"this round",
    winner2:"Winner!",winners:"WINNERS",ptsEach:"POINTS EACH",
    newGame2:"🔁 REMATCH",seeFinal:"See final scoreboard",
    liveBoard:"📡 LIVE SCOREBOARD",autoUpdate:"AUTO-UPDATES · GOAL 200 PTS",
    roundProgress:"ROUND PROGRESS",
    codeLabel:"ROOM",
    correct:"✏️ Correct",
  }
};

// ── REMATCH ANIMATION — overlay con contador 3→2→1 ───────────
function RematchOverlay({onDone}){
  const[count,setCount]=React.useState(3);
  const[key,setKey]=React.useState(0); // para re-triggear animación
  React.useEffect(()=>{
    snd('round');
    const iv=setInterval(()=>{
      setCount(c=>{
        if(c<=1){clearInterval(iv);setTimeout(onDone,400);return 0;}
        snd('tap');
        setKey(k=>k+1);
        return c-1;
      });
    },1100);
    return()=>clearInterval(iv);
  },[]);

  // partículas de fondo
  const sparks=Array.from({length:30},(_,i)=>({
    c:CONF[i%CONF.length],
    l:Math.round(Math.random()*100)+"%",
    t:Math.round(Math.random()*100)+"%",
    s:Math.round(6+Math.random()*10)+"px",
    dl:Math.round(Math.random()*20)/10+"s",
    dr:Math.round((1.5+Math.random()*2)*10)/10+"s",
    sh:Math.random()>.5?"2px":"50%"
  }));

  return(
    <div className="rematch-overlay">
      {/* partículas decorativas */}
      <div className="rematch-sparks">
        {sparks.map((s,i)=>(
          <div key={i} style={{position:"absolute",background:s.c,width:s.s,height:s.s,
            left:s.l,top:s.t,borderRadius:s.sh,opacity:.4,
            animation:"cf "+s.dr+" "+s.dl+" linear infinite"}}/>
        ))}
      </div>
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{fontSize:"4rem",marginBottom:12,animation:"fl 1.5s ease-in-out infinite"}}>🔁</div>
        <div className="rematch-title">¡REVANCHA!</div>
        <div className="rematch-sub">EN CAMINO</div>
        {count>0
          ? <div key={key} className="rematch-counter">{count}</div>
          : <div className="rematch-counter" style={{fontSize:"5rem",color:"var(--y)"}}>🚀</div>
        }
      </div>
    </div>
  );
}

// ── PLAYERROW — dropdowns emoji y color ──────────────────────
function PlayerRow({idx,name,emoji,color,allEmojis,allColors,usedColors,canRemove,onName,onEmoji,onColor,onRemove,T}){
  const[emojiOpen,setEmojiOpen]=React.useState(false);
  const[colorOpen,setColorOpen]=React.useState(false);
  const emojiBtnRef=React.useRef(null);
  const colorBtnRef=React.useRef(null);
  const emojiDdRef=React.useRef(null);
  const colorDdRef=React.useRef(null);
  const[emojiPos,setEmojiPos]=React.useState({top:0,left:0});
  const[colorPos,setColorPos]=React.useState({top:0,left:0});

  React.useEffect(()=>{
    function handle(e){
      if(emojiOpen&&emojiBtnRef.current&&!emojiBtnRef.current.contains(e.target)&&emojiDdRef.current&&!emojiDdRef.current.contains(e.target)){setEmojiOpen(false);}
      if(colorOpen&&colorBtnRef.current&&!colorBtnRef.current.contains(e.target)&&colorDdRef.current&&!colorDdRef.current.contains(e.target)){setColorOpen(false);}
    }
    document.addEventListener("mousedown",handle);document.addEventListener("touchstart",handle);
    return()=>{document.removeEventListener("mousedown",handle);document.removeEventListener("touchstart",handle);}
  },[emojiOpen,colorOpen]);

  function openEmoji(){
    snd('tap');
    if(emojiBtnRef.current){
      const r=emojiBtnRef.current.getBoundingClientRect();
      setEmojiPos({top:Math.min(r.bottom+4,window.innerHeight-270),left:Math.max(4,Math.min(r.left,window.innerWidth-228))});
    }
    setEmojiOpen(v=>!v);setColorOpen(false);
  }
  function openColor(){
    snd('tap');
    if(colorBtnRef.current){
      const r=colorBtnRef.current.getBoundingClientRect();
      setColorPos({top:Math.min(r.bottom+4,window.innerHeight-180),left:Math.max(4,Math.min(r.left,window.innerWidth-140))});
    }
    setColorOpen(v=>!v);setEmojiOpen(false);
  }

  return(
    <div className="player-setup-row" style={{borderColor:color+"44"}}>
      <div className="psr-top">
        <div style={{position:"relative",flexShrink:0}}>
          <button ref={emojiBtnRef} className="emoji-big-btn" onClick={openEmoji}
            style={{background:color+"18",borderColor:color+"66"}}>{emoji}</button>
          {emojiOpen&&(
            <div ref={emojiDdRef} className="emoji-dd" style={{top:emojiPos.top,left:emojiPos.left}}>
              {allEmojis.map((e,ei)=>(
                <button key={ei} className={"emoji-dd-opt"+(emoji===e?" sel":"")}
                  onClick={()=>{snd('tap');onEmoji(e);setEmojiOpen(false);}}>{e}</button>
              ))}
            </div>
          )}
        </div>
        <input className="inp" style={{margin:0,flex:1,borderColor:color+"55",padding:"10px 12px"}}
          placeholder={(T?T.players:"Jugador")+" "+(idx+1)} value={name}
          onChange={e=>{snd('num');onName(e.target.value);}} onFocus={()=>snd('tap')}/>
        <div style={{position:"relative",flexShrink:0}}>
          <button ref={colorBtnRef} className="color-dd-btn" onClick={openColor}
            style={{background:color,borderColor:"rgba(255,255,255,.5)"}}></button>
          {colorOpen&&(
            <div ref={colorDdRef} className="color-dd" style={{top:colorPos.top,left:colorPos.left}}>
              {allColors.map((c,ci)=>{
                const taken=usedColors.includes(c);const sel=color===c;
                return(
                  <button key={ci} className={"color-dd-opt"+(sel?" sel":"")+(taken?" taken":"")}
                    style={{background:c,"--clr":c}}
                    onClick={()=>{if(!taken){snd('tap');onColor(c);setColorOpen(false);}}}></button>
                );
              })}
            </div>
          )}
        </div>
        {canRemove&&(
          <button onClick={()=>{snd('tap');onRemove();}}
            style={{background:"none",border:"none",color:"var(--r)",fontSize:"1.3rem",
              cursor:"pointer",flexShrink:0,padding:"0 2px",lineHeight:1}}>✕</button>
        )}
      </div>
    </div>
  );
}

// ── APP — componente raíz ──────────────────────────────────────
function App(){
  const[lang,setLang]=useState(()=>localStorage.getItem("f7lang")||"es");
  const T=LANGS[lang]||LANGS.es;
  React.useEffect(()=>localStorage.setItem("f7lang",lang),[lang]);
  const[screen,setScreen]=useState("home");
  const[demoMode,setDemoMode]=useState(false);
  const[isSpectator,setIsSpectator]=useState(false);
  const[myPlayerId,setMyPlayerId]=useState(null);
  const[room,setRoom]=useState(null);
  const[roomCode,setRoomCode]=useState("");
  const[sessions,setSessions]=useState(()=>{try{return JSON.parse(localStorage.getItem("f7sess")||"[]")}catch{return[]}});
  const[tab,setTab]=useState("round");
  const[winner,setWinner]=useState(null);
  const[aiConfig,setAiConfig]=useState({provider:"gemini",key:"",claudeKey:""});
  const[aiLoaded,setAiLoaded]=useState(false);
  // Revancha en camino para no-host
  const[rematchPending,setRematchPending]=useState(false);

  useEffect(()=>{
    async function loadAiConfig(){
      try{
        const[gemSnap,claudeSnap]=await Promise.all([
          _db.ref("config/ai").once("value"),
          _db.ref("config/claude").once("value")
        ]);
        const gemCfg=gemSnap.val();const claudeCfg=claudeSnap.val();
        setAiConfig({provider:gemCfg?.provider||"gemini",key:gemCfg?.key||"",claudeKey:claudeCfg?.key||""});
        setAiLoaded(true);return;
      }catch(e){console.log("Firebase config fallback");}
      try{
        const s=JSON.parse(localStorage.getItem("f7ai")||"{}");
        setAiConfig({provider:s.provider||"gemini",key:s.key||"",claudeKey:s.claudeKey||""});
      }catch{}
      setAiLoaded(true);
    }
    loadAiConfig();
  },[]);

  const winnerShown=useRef(false);
  const unsubRef=useRef(null);
  const dbRef=useRef(makeDB(false));
  const prevSortedRef=useRef([]);

  useEffect(()=>{try{localStorage.setItem("f7ai",JSON.stringify(aiConfig))}catch{};},[aiConfig]);

  function subscribe(code,db){
    if(unsubRef.current)unsubRef.current();
    unsubRef.current=db.listen("rooms/"+code,data=>{
      if(!data)return;
      const newSorted=[...data.players].sort((a,b)=>b.total-a.total);
      const prev=prevSortedRef.current;
      newSorted.forEach((p,ni)=>{
        const oi=prev.findIndex(x=>x.id===p.id);
        if(oi!==-1&&oi!==ni){p._moved=ni<oi?'up':'down';if(ni<oi)snd('up');else snd('down');}
      });
      prevSortedRef.current=newSorted.map(p=>({...p}));
      setRoom(data);
      // Detectar rematchPending — mostrar animación en no-host
      if(data.rematchPending&&myPlayerId){
        setRematchPending(true);
      }
      if(data.finished&&data.winner&&!winnerShown.current){
        winnerShown.current=true;setWinner(data.winner);snd('winner');setTimeout(()=>snd('victory'),400);
        const sessionObj={id:uid(),date:data.createdAt||Date.now(),players:data.players,rounds:data.round,winner:data.winner.name,code:data.code,demo:demoMode};
        setSessions(prev=>{
          if(prev.find(s=>s.code===data.code&&s.date===data.createdAt))return prev;
          const s=[sessionObj,...prev].slice(0,20);
          try{localStorage.setItem("f7sess",JSON.stringify(s))}catch{} return s;
        });
        // Guardar estadísticas por jugador en Firebase
        if(!demoMode){
          saveGameStats(sessionObj,data).catch(e=>console.log("Stats save error:",e));
        }
      }
    });
  }

  async function createLobby(){
    snd("join");
    var code=uid4();const db=makeDB(false);dbRef.current=db;
    await db.set("rooms/"+code,{code,round:1,roundScores:{},finished:false,winner:null,createdAt:Date.now(),players:[],lobbyMode:true});
    setRoomCode(code);setIsSpectator(false);setMyPlayerId(null);
    subscribe(code,db);setScreen("game");setTab("round");
    winnerShown.current=false;prevSortedRef.current=[];
  }

  function leaveGame(){
    if(unsubRef.current){unsubRef.current();unsubRef.current=null;}
    winnerShown.current=false;prevSortedRef.current=[];
    setRoom(null);setRoomCode("");setWinner(null);setScreen("home");
    setDemoMode(false);setIsSpectator(false);setMyPlayerId(null);setRematchPending(false);
  }

  // ── REVANCHA (solo host) — escribe rematchPending en Firebase ──
  async function startRematch(prevPlayers){
    snd('round');
    winnerShown.current=false;prevSortedRef.current=[];
    // 1. Marcar rematchPending para que los no-host vean la animación
    await dbRef.current.set("rooms/"+roomCode+"/rematchPending",true);
    // 2. Esperar 3.5s para que la animación se vea
    await new Promise(r=>setTimeout(r,3500));
    // 3. Resetear la sala con los mismos jugadores
    const freshPlayers=prevPlayers.map(p=>({...p,total:0,rounds:[]}));
    await dbRef.current.set("rooms/"+roomCode,{
      code:roomCode,round:1,roundScores:{},finished:false,
      winner:null,createdAt:Date.now(),players:freshPlayers,
      rematchPending:false
    });
    setWinner(null);setRematchPending(false);setTab("round");
    subscribe(roomCode,dbRef.current);
  }

  // Cuando el no-host termina la animación, la sala ya fue reseteada
  function onRematchAnimDone(){
    setRematchPending(false);setWinner(null);setTab("round");
  }

  async function submitScore(pid,score,method){
    snd('score');
    const cur=room?.roundScores||{};
    await dbRef.current.set("rooms/"+roomCode,{...room,roundScores:{...cur,[pid]:{score,method}}});
  }
  async function undoScore(pid){
    snd('tap');
    const ns={...room?.roundScores};delete ns[pid];
    await dbRef.current.set("rooms/"+roomCode,{...room,roundScores:ns});
  }
  async function finalizeRound(){
    snd('round');
    const newPlayers=room.players.map(p=>{
      const e=room.roundScores?.[p.id];const pts=e?e.score:0;
      return{...p,total:p.total+pts,rounds:[...(p.rounds||[]),{score:pts,method:e?.method||"zero"}]};
    });
    const maxScore=Math.max(...newPlayers.map(p=>p.total));
    const champs=newPlayers.filter(p=>p.total>=WIN&&p.total===maxScore);
    const isFinished=champs.length>0;
    const winner=champs.length===1?champs[0]:{tied:true,players:champs,total:maxScore,name:champs.map(p=>p.name).join(" & "),emoji:""};
    await dbRef.current.set("rooms/"+roomCode,{...room,players:newPlayers,roundScores:{},round:isFinished?room.round:room.round+1,finished:isFinished,winner:isFinished?winner:null});
  }

  async function enterGame({names,demo,spectator,code,playerId,customEmojis,customColors}){
    const db=makeDB(demo);dbRef.current=db;
    let roomCode2=code;
    if(!code){
      roomCode2=demo?"DEMO":uid4();
      await db.set("rooms/"+roomCode2,{
        code:roomCode2,round:1,roundScores:{},finished:false,winner:null,createdAt:Date.now(),
        players:names.map((name,i)=>({
          id:uid(),name:name.trim(),
          emoji:(customEmojis&&customEmojis[i])||EMOJIS[i%EMOJIS.length],
          color:(customColors&&customColors[i])||COLORS[i%COLORS.length],
          total:0,rounds:[]
        }))
      });
    }
    setDemoMode(demo);setRoomCode(roomCode2);setIsSpectator(spectator||false);
    setMyPlayerId(playerId||null);
    subscribe(roomCode2,db);
    setScreen("game");setTab(spectator?"scores":"round");
    winnerShown.current=false;prevSortedRef.current=[];
  }

  const allDone=room&&room.players.every(p=>room.roundScores?.[p.id]!==undefined);
  const sorted=room?[...room.players].sort((a,b)=>b.total-a.total):[];
  const isHost=!myPlayerId&&!isSpectator;

  if(screen==="home")return<HomeScreen onEnter={enterGame} onLobby={createLobby} sessions={sessions} aiConfig={aiConfig} setAiConfig={setAiConfig} lang={lang} setLang={setLang} T={T}/>;
  if(isSpectator)return<SpectatorScreen room={room} sorted={sorted} roomCode={roomCode} demoMode={demoMode} onBack={leaveGame} winner={winner} T={T}/>;

  // Animación revancha para no-host
  if(rematchPending&&!isHost){
    return<RematchOverlay onDone={onRematchAnimDone}/>;
  }

  return(
    <div className="wrap">
      <div className="hdr">
        <div>
          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
            <span className="logo-f">FLIP</span><span className="logo-7">7</span>
          </div>
          <span className="logo-sub">Race to 200!</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div className={"badge "+(demoMode?"demo":"")}>
            <span className={"dot "+(demoMode?"demo":"")}/>
            {demoMode?"DEMO":roomCode}
          </div>
          <button onClick={()=>{snd('tap');setLang(l=>l==="es"?"en":"es");}}
            style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",
              color:"rgba(255,255,255,.6)",borderRadius:9,padding:"5px 8px",cursor:"pointer",
              fontFamily:"'Righteous',sans-serif",fontSize:".7rem",letterSpacing:1}}>
            {lang==="es"?"EN":"ES"}
          </button>
          <button className="btn btn-g btn-sm" onClick={()=>{snd('tap');leaveGame();}}>Salir</button>
        </div>
      </div>
      <div className="nav">
        {[["round",T.round],["scores",T.table],["history",T.history]].map(([id,lbl])=>(
          <button key={id} className={"nb "+(tab===id?"on":"")} onClick={()=>{snd('tap');setTab(id);}}>{lbl}</button>
        ))}
      </div>
      <div className="page">
        {demoMode&&tab==="round"&&<div className="demo-banner">🟣 <span>MODO DEMO — local, sin Firebase</span></div>}
        {tab==="round"&&!room&&<div style={{textAlign:"center",paddingTop:60}}><div className="spin" style={{margin:"0 auto 16px"}}/><p style={{color:"rgba(255,255,255,.4)",fontWeight:700}}>Conectando</p></div>}
        {tab==="round"&&room&&<RoundTab room={room} allDone={allDone} onSubmit={submitScore} onUndo={undoScore} onFinalize={finalizeRound} myPlayerId={myPlayerId} isHost={isHost} demoMode={demoMode} aiConfig={aiConfig} setAiConfig={setAiConfig} onRematch={startRematch} onEndGame={leaveGame} roomCode={roomCode} T={T}/>}
        {tab==="scores"&&room&&<ScoreTab sorted={sorted} room={room} T={T}/>}
        {tab==="history"&&<HistoryTab sessions={sessions} onClear={()=>{setSessions([]);try{localStorage.removeItem("f7sess")}catch{}}} T={T}/>}
      </div>
      {winner&&<WinnerScreen winner={winner} onClose={()=>{setWinner(null);setTab("scores");}} onRematch={()=>{if(room&&room.players)startRematch(room.players);}} isHost={isHost} T={T}/>}
    </div>
  );
}

// ── HOMESCREEN ────────────────────────────────────────────────
function HomeScreen({onEnter,sessions,aiConfig,setAiConfig,lang,setLang,T}){
  const[view,setView]=useState("main");
  const[names,setNames]=useState(["","",""]);
  const[playerEmojis,setPlayerEmojis]=useState(EMOJIS.slice(0,3));
  const[playerColors,setPlayerColors]=useState(COLORS.slice(0,3));
  const[jcode,setJcode]=useState("");
  const[jname,setJname]=useState("");
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState(null);
  const[roomPlayers,setRoomPlayers]=useState(null);
  const[pickingPlayer,setPickingPlayer]=useState(false);

  React.useEffect(()=>{
    setPlayerEmojis(p=>{const a=[...p];while(a.length<names.length){const next=EMOJIS.find(e=>!a.includes(e))||EMOJIS[a.length%EMOJIS.length];a.push(next);}return a.slice(0,names.length);});
    setPlayerColors(p=>{const a=[...p];while(a.length<names.length){const next=COLORS.find(c=>!a.includes(c))||COLORS[a.length%COLORS.length];a.push(next);}return a.slice(0,names.length);});
  },[names.length]);

  const go=v=>{snd('tap');setErr(null);setView(v);setRoomPlayers(null);setPickingPlayer(false);};

  async function createReal(){
    const ns=names.filter(n=>n.trim());
    if(ns.length<2){setErr({msg:"Necesitas al menos 2 jugadores.",steps:[]});return;}
    setBusy(true);setErr(null);
    try{await onEnter({names:ns,demo:false,customEmojis:playerEmojis,customColors:playerColors});}
    catch(e){setErr(classifyError(e));}
    setBusy(false);
  }

  async function tryJoin(asSpectator=false){
    if(jcode.length<4){setErr({msg:"Código de 4 caracteres.",steps:[]});return;}
    if(!asSpectator&&!jname.trim()){setErr({msg:"Ingresa tu nombre.",steps:[]});return;}
    setBusy(true);setErr(null);
    try{
      const db=makeDB(false);const r=await db.get("rooms/"+jcode.toUpperCase());
      if(!r){setErr({msg:"Sala \""+jcode.toUpperCase()+"\" no encontrada.",steps:["Pide el código al host"]});setBusy(false);return;}
      if(asSpectator){snd('join');await onEnter({demo:false,spectator:true,code:jcode.toUpperCase()});setBusy(false);return;}
      const inputName=jname.trim().toLowerCase();
      const existing=r.players.find(p=>p.name.toLowerCase()===inputName);
      if(existing){snd('join');await onEnter({demo:false,spectator:false,code:jcode.toUpperCase(),playerId:existing.id});}
      else{setRoomPlayers(r.players);setPickingPlayer(true);}
    }catch(e){setErr(classifyError(e));}
    setBusy(false);
  }

  async function pickPlayer(player){
    snd('join');
    try{await onEnter({demo:false,spectator:false,code:jcode.toUpperCase(),playerId:player.id});}
    catch(e){setErr(classifyError(e));}
  }

  async function joinAsNew(){
    if(!jname.trim()){setErr({msg:"Ingresa tu nombre.",steps:[]});return;}
    setBusy(true);setErr(null);
    try{
      const r=await makeDB(false).get("rooms/"+jcode.toUpperCase());
      const newP={id:uid(),name:jname.trim(),emoji:EMOJIS[r.players.length%EMOJIS.length],color:COLORS[r.players.length%COLORS.length],total:0,rounds:[]};
      r.players=[...r.players,newP];
      await _db.ref("rooms/"+jcode.toUpperCase()).set(r);
      snd('join');await onEnter({demo:false,spectator:false,code:jcode.toUpperCase(),playerId:newP.id});
    }catch(e){setErr(classifyError(e));}
    setBusy(false);
  }

  if(view==="create")return(
    <div className="create-wrap">
      <div className="create-header">
        <div className="create-title">{T.createRoom}</div>
        <div className="create-sub">{T.newGame}</div>
      </div>
      <div className="create-body">
        <p className="sec" style={{marginTop:4}}>{T.players} (min. 2)</p>
        {names.map((n,i)=>(
          <PlayerRow key={i} idx={i} T={T}
            name={n} emoji={playerEmojis[i]||EMOJIS[i%EMOJIS.length]} color={playerColors[i]||COLORS[i%COLORS.length]}
            allEmojis={EMOJIS} allColors={COLORS} usedColors={playerColors.filter((_,j)=>j!==i)}
            canRemove={names.length>2}
            onName={v=>setNames(p=>p.map((x,j)=>j===i?v:x))}
            onEmoji={v=>setPlayerEmojis(p=>p.map((x,j)=>j===i?v:x))}
            onColor={v=>setPlayerColors(p=>p.map((x,j)=>j===i?v:x))}
            onRemove={()=>{snd('tap');setNames(p=>p.filter((_,j)=>j!==i));setPlayerEmojis(p=>p.filter((_,j)=>j!==i));setPlayerColors(p=>p.filter((_,j)=>j!==i));}}
          />
        ))}
        {names.length<18&&<button className="btn-add" onClick={()=>{snd('tap');setNames(p=>[...p,""]);}}>+ {T.addPlayer}</button>}
        {err&&<ErrBox err={err}/>}
      </div>
      <div className="create-footer">
        <button className="btn btn-y" style={{marginBottom:8}} onClick={()=>{snd('tap');createReal();}} disabled={busy||names.filter(n=>n.trim()).length<2}>
          {busy?T.creating:T.create}
        </button>
        <button className="btn btn-g" onClick={()=>go("main")}>{T.back}</button>
      </div>
    </div>
  );

  if(view==="join")return(
    <div className="wrap"><div className="page" style={{paddingTop:24}}>
      <div className="hero">
        <div style={{fontSize:"2.8rem",marginBottom:6}}>🎮</div>
        <div className="hero-logo" style={{fontSize:"2.4rem"}}>UNIRSE</div>
        <div className="hero-tag">Código de sala</div>
      </div>
      {!pickingPlayer&&(<>
        <p className="sec">CÓDIGO DE SALA</p>
        <input className="inp code-inp" placeholder="XXXX" maxLength={4} value={jcode}
          onChange={e=>setJcode(e.target.value.toUpperCase())} onFocus={()=>snd('tap')}/>
        <p className="sec" style={{marginTop:12}}>TU NOMBRE</p>
        <input className="inp" placeholder="Tu nombre en el juego" value={jname}
          onChange={e=>setJname(e.target.value)} onFocus={()=>snd('tap')}/>
        {err&&<ErrBox err={err}/>}
        <div className="g12"/>
        <button className="btn btn-y" onClick={()=>{snd('tap');tryJoin(false);}} disabled={busy||jcode.length<4||!jname.trim()}>
          {busy?"⏳ Buscando sala":"🎮 UNIRME AL JUEGO"}
        </button>
        <div className="div"/>
        <p className="sec">SOLO VER MARCADOR</p>
        <button className="btn btn-t" onClick={()=>{snd('tap');tryJoin(true);}} disabled={busy||jcode.length<4}>
          {busy?"⏳":"👁 ENTRAR COMO ESPECTADOR"}
        </button>
      </>)}
      {pickingPlayer&&roomPlayers&&(<>
        <div className="alert al-y" style={{marginBottom:14}}>
          ℹ <span>Nombre no encontrado. ¿Eres alguno de estos jugadores?</span>
        </div>
        <p className="sec">ELIGE TU JUGADOR</p>
        {roomPlayers.map(p=>(
          <div key={p.id} className="player-pick" onClick={()=>pickPlayer(p)}>
            <div className="ava" style={{background:p.color+"22",color:p.color,width:42,height:42,fontSize:"1.4rem"}}>{p.emoji}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:900,fontSize:"1rem"}}>{p.name}</div>
              <div style={{fontSize:".72rem",color:"rgba(255,255,255,.4)",fontWeight:700}}>{p.total} pts · {(p.rounds||[]).length} rondas</div>
            </div>
            <div style={{color:"rgba(255,255,255,.3)",fontSize:"1.2rem"}}>›</div>
          </div>
        ))}
        <div className="div"/>
        <p className="sec">O UNIRME COMO JUGADOR NUEVO</p>
        <input className="inp" placeholder="Nombre del nuevo jugador" value={jname}
          onChange={e=>setJname(e.target.value)} onFocus={()=>snd('tap')}/>
        <button className="btn btn-y" onClick={()=>{snd('tap');joinAsNew();}} disabled={busy||!jname.trim()}>
          ➕ AGREGAR JUGADOR NUEVO
        </button>
      </>)}
      <div className="g8"/><button className="btn btn-g" onClick={()=>go("main")}>{T.back}</button>
    </div></div>
  );

  if(view==="stats")return<StatsScreen onBack={()=>go("main")} T={T}/>;

  return(
    <div className="wrap"><div className="page" style={{paddingTop:24}}>
      <div className="hero">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <button onClick={()=>{snd('tap');setLang(l=>l==="es"?"en":"es");}}
            style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",
              color:"rgba(255,255,255,.6)",borderRadius:9,padding:"5px 10px",cursor:"pointer",
              fontFamily:"'Righteous',sans-serif",fontSize:".72rem",letterSpacing:1}}>
            {lang==="es"?"🌐 English":"🌐 Español"}
          </button>
          <button onClick={()=>{snd('tap');setView("stats");}}
            style={{background:"rgba(245,200,0,.1)",border:"1px solid rgba(245,200,0,.3)",
              color:"var(--y)",borderRadius:9,padding:"5px 10px",cursor:"pointer",
              fontFamily:"'Righteous',sans-serif",fontSize:".72rem",letterSpacing:1,
              display:"flex",alignItems:"center",gap:5}}>
            📊 Stats
          </button>
        </div>
        <div style={{fontSize:"3.5rem",marginBottom:8}}>🎴</div>
        <div className="hero-logo">FLIP 7</div>
        <div className="hero-tag">Race to 200!</div>
        <p style={{color:"rgba(255,255,255,.3)",fontWeight:700,fontSize:".8rem",maxWidth:240,margin:"0 auto"}}>{T.appTag}</p>
      </div>
      <button className="btn btn-y" onClick={()=>go("create")}>{T.createGame}</button>
      <button className="btn btn-t" onClick={()=>go("join")}>🎮 {T.joinGame}</button>
      {sessions.length>0&&(<><div className="div"/><p className="sec">{T.recentSessions}</p><SesCards sessions={sessions} T={T} onClear={()=>{setSessions([]);try{localStorage.removeItem("f7sess")}catch{}}}/></>)}
      <div style={{textAlign:"center",marginTop:20,paddingBottom:8}}>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.15)",letterSpacing:2}}>v3.1 · FLIP 7</span>
        <button onClick={()=>{localStorage.clear();sessionStorage.clear();window.location.reload();}}
          style={{display:"block",margin:"6px auto 0",background:"none",border:"none",
            color:"rgba(255,255,255,.15)",fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
            cursor:"pointer",letterSpacing:1,textDecoration:"underline"}}>
          {lang==="es"?"Limpiar caché":"Clear cache"}
        </button>
      </div>
    </div></div>
  );
}

function ErrBox({err}){
  return(
    <div className="alert al-r">
      <div style={{fontWeight:900}}>{err.msg}</div>
      {err.steps?.length>0&&<ul style={{marginTop:5,paddingLeft:16,fontWeight:700,fontSize:".78rem",opacity:.85}}>{err.steps.map((s,i)=><li key={i}>{s}</li>)}</ul>}
    </div>
  );
}

// ── ROUNDTAB ──────────────────────────────────────────────────
function RoundTab({room,allDone,onSubmit,onUndo,onFinalize,myPlayerId,isHost,demoMode,aiConfig,setAiConfig,onRematch,onEndGame,roomCode,T}){
  const[scanModal,setScan]=useState(null);
  const[manModal,setMan]=useState(null);  // {pid, name, initialScore}
  const[shakePid,setShakePid]=useState(null);
  const canControl=pid=>!myPlayerId||myPlayerId===pid;

  function handleZero(pid){
    snd('zero');setShakePid(pid);setTimeout(()=>setShakePid(null),500);
    onSubmit(pid,0,"zero");
  }

  return(
    <>
      {room.finished&&room.winner&&(
        <div style={{background:"linear-gradient(135deg,rgba(245,200,0,.15),rgba(255,107,53,.1))",
          border:"2px solid rgba(245,200,0,.4)",borderRadius:16,padding:"16px",marginBottom:14,textAlign:"center"}}>
          <div style={{fontSize:"2.5rem",marginBottom:4}}>🏆</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.8rem",color:"var(--y)",letterSpacing:2,marginBottom:2}}>{room.winner.name} ganó!</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".78rem",color:"rgba(255,255,255,.5)",letterSpacing:2,marginBottom:14}}>{room.winner.total} PUNTOS · FIN DEL JUEGO</div>
          <div style={{display:"flex",gap:8}}>
            {/* Solo el host puede iniciar revancha */}
            {isHost
              ? <button className="btn btn-y" style={{flex:1,fontSize:".9rem",padding:"12px"}} onClick={()=>onRematch(room.players)}>{T.rematch}</button>
              : <div style={{flex:1,padding:"12px",background:"rgba(255,255,255,.05)",borderRadius:14,fontFamily:"'Righteous',sans-serif",fontSize:".78rem",color:"rgba(255,255,255,.35)",letterSpacing:1,display:"flex",alignItems:"center",justifyContent:"center"}}>⏳ Esperando revancha del host</div>
            }
            <button className="btn btn-g" style={{flex:1,fontSize:".9rem",padding:"12px"}} onClick={onEndGame}>{T.endGame}</button>
          </div>
        </div>
      )}
      {!room.finished&&allDone&&<div className="alert al-g">{isHost?T.allReady:T.waitingHost}</div>}
      {!room.finished&&!allDone&&room.players.some(p=>room.roundScores?.[p.id])&&<div className="alert al-y">{T.waitingCaps}</div>}
      <div className="rsb" style={{marginBottom:10}}>
        <p className="sec" style={{margin:0}}>{T.players2}</p>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:".85rem",letterSpacing:2,
            color:"var(--y)",background:"rgba(245,200,0,.1)",border:"1px solid rgba(245,200,0,.25)",
            padding:"2px 10px",borderRadius:20}}>{roomCode}</div>
          <div className="rbd">R{room.round}</div>
        </div>
      </div>
      {room.players.map(p=>{
        const entry=room.roundScores?.[p.id];const done=entry!==undefined;const mine=canControl(p.id);
        const isShaking=shakePid===p.id;
        return(
          <div key={p.id}
            className={"pr "+(done?"done":"")+(p.id===myPlayerId?" me":"")+(isShaking?" zero-flash":"")}
            style={{"--clr":p.color}}>
            <div className="ava" style={{background:p.color+"22",color:p.color,border:"2px solid "+p.color+"55",boxShadow:"0 0 10px "+p.color+"33",fontSize:"1.4rem"}}>{p.emoji}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8}}>
                <div className="pr-name" style={{display:"flex",alignItems:"center",gap:5}}>
                  {/* nombre con color del jugador */}
                  <span style={{color:p.color,textShadow:"0 0 8px "+p.color+"55"}}>{p.name}</span>
                  {myPlayerId===p.id&&<span className="me-tag">tú</span>}
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:4,flexShrink:0}}>
                  <span style={{fontFamily:"'Anton',sans-serif",fontSize:"1.5rem",color:p.color,lineHeight:1,textShadow:"2px 2px 0 rgba(0,0,0,.4)"}}>{p.total}</span>
                  <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.3)",letterSpacing:1}}>pts</span>
                </div>
              </div>
              <div style={{height:3,background:"rgba(255,255,255,.07)",borderRadius:2,marginTop:4,marginBottom:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:Math.min(100,(p.total/200)*100)+"%",
                  background:"linear-gradient(90deg,"+p.color+","+p.color+"aa)",borderRadius:2,transition:"width .8s"}}/>
              </div>
              {done?(
                <div style={{display:"flex",alignItems:"center",gap:7,marginTop:2,flexWrap:"wrap"}}>
                  <span className="pr-pts">{entry.score===0?"💀":"+"+entry.score}</span>
                  <span className={"mtag mt-"+entry.method}>{entry.method==="scan"?"📷":entry.method==="zero"?"💀":""} {entry.method}</span>
                  {/* Botón Corregir — siempre visible cuando done, abre manual con valor actual */}
                  {mine&&!room.finished&&(
                    <button onClick={()=>{snd('tap');setMan({pid:p.id,name:p.name,initialScore:entry.score});}}
                      style={{background:"rgba(46,196,182,.12)",border:"1px solid rgba(46,196,182,.3)",
                        color:"var(--t)",borderRadius:8,padding:"3px 10px",cursor:"pointer",
                        fontFamily:"'Righteous',sans-serif",fontSize:".62rem",letterSpacing:1,
                        marginLeft:"auto"}}>
                      ✏️ Corregir
                    </button>
                  )}
                </div>
              ):mine?(
                <div className="ar">
                  {!demoMode&&<button className="ab ab-s" onClick={()=>{snd('tap');setScan({pid:p.id,name:p.name});}}>📷 Scan IA</button>}
                  <button className="ab ab-z" onClick={()=>handleZero(p.id)}>💀 Cero</button>
                  <button className="ab ab-m" onClick={()=>{snd('tap');setMan({pid:p.id,name:p.name,initialScore:null});}}>🧮 Manual</button>
                </div>
              ):(
                <div style={{fontSize:".72rem",color:"rgba(255,255,255,.28)",marginTop:3,fontWeight:700}}>⏳ esperando</div>
              )}
            </div>
            {done&&mine&&!room.finished&&<button className="undo" onClick={()=>onUndo(p.id)}>↩</button>}
          </div>
        );
      })}
      {room.players.length===0&&(
        <div style={{textAlign:"center",padding:"24px 10px",borderRadius:16,
          border:"2px dashed rgba(245,200,0,.3)",marginBottom:14}}>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",color:"rgba(255,255,255,.35)",letterSpacing:3,marginBottom:10}}>SALA EN MODO LOBBY</div>
          <div className="lobby-code">{roomCode}</div>
          <div style={{fontSize:".78rem",color:"rgba(255,255,255,.4)",fontWeight:700,marginTop:8}}>
            Comparte este código para que los jugadores se unan
          </div>
        </div>
      )}
      {!room.finished&&isHost&&(
        <div style={{marginTop:14}}>
          <button className="btn btn-y" disabled={!allDone||room.players.length<2} onClick={onFinalize}>
            {T.closeRound} {room.round}
          </button>
        </div>
      )}
      {scanModal&&<ScanModal playerName={scanModal.name} aiConfig={aiConfig} setAiConfig={setAiConfig} onResult={s=>{onSubmit(scanModal.pid,s,"scan");setScan(null);}} onClose={()=>setScan(null)}/>}
      {/* ManualModal recibe initialScore para permitir corrección */}
      {manModal&&<ManualModal playerName={manModal.name} initialScore={manModal.initialScore} onSubmit={s=>{onSubmit(manModal.pid,s,"manual");setMan(null);}} onClose={()=>setMan(null)}/>}
    </>
  );
}

// ── SCORETAB — nombre con color del jugador ───────────────────
function ScoreTab({sorted,room,T}){
  const mr=room.round-1;
  return(<>
    <p className="sec">CLASIFICACIÓN</p>
    <div className="sg">
      {sorted.map((p,i)=>{
        const cls=i===0?"first":i===1?"second":i===2?"third":"";
        return(
          <div key={p.id} className={"sc "+cls+" "+(p._moved==='up'?'moved-up':p._moved==='down'?'moved-down':'')}>
            <div className="sc-rank">{i===0?"🥇":i===1?"🥈":i===2?"🥉":"#"+(i+1)}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:900,fontSize:".98rem",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:"1.2rem"}}>{p.emoji}</span>
                {/* nombre con color del jugador */}
                <span style={{color:p.color,textShadow:"0 0 12px "+p.color+"55"}}>{p.name}</span>
              </div>
              <div style={{fontSize:".7rem",color:"rgba(255,255,255,.38)",fontWeight:700,marginTop:2}}>
                {(p.rounds||[]).length} ronda{(p.rounds||[]).length!==1?"s":""} · faltan {Math.max(0,WIN-p.total)} pts
              </div>
            </div>
            <div className="sc-pts">{p.total}</div>
            <div className="sc-bar" style={{width:Math.min(100,(p.total/WIN)*100)+"%"}}/>
            <div className="sc-pct">{Math.round((p.total/WIN)*100)}%</div>
          </div>
        );
      })}
    </div>
    {mr>0&&(<>
      <div className="div"/>
      <p className="sec">TABLA DE RONDAS</p>
      <div className="tw">
        <table>
          <thead><tr><th>Jugador</th>{Array.from({length:mr},(_,i)=><th key={i}>R{i+1}</th>)}<th>Total</th></tr></thead>
          <tbody>{sorted.map((p,ri)=>(
            <tr key={p.id} className={ri===0?"lr":""}>
              <td><span style={{color:p.color}}>{p.emoji}</span> <span style={{color:p.color}}>{p.name}</span></td>
              {(p.rounds||[]).map((r,i)=><td key={i} className={r.score===0?"rz":""}>{r.score===0?"💀":r.score}</td>)}
              {Array.from({length:mr-(p.rounds||[]).length},(_,i)=><td key={"e"+i}></td>)}
              <td className="tc">{p.total}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p style={{textAlign:"center",color:"rgba(255,255,255,.2)",fontSize:".7rem",fontWeight:700,letterSpacing:2}}>META: {WIN} PUNTOS</p>
    </>)}
  </>);
}

// ── SPECTATORSCREEN — con revancha animación ──────────────────
function SpectatorScreen({room,sorted,roomCode,demoMode,onBack,winner,T}){
  const[showJoinAnim,setShowJoinAnim]=React.useState(true);
  const[showWinnerOverlay,setShowWinnerOverlay]=React.useState(!!winner);
  const[showRematch,setShowRematch]=React.useState(false);
  React.useEffect(()=>{snd('spec_join');setTimeout(()=>setShowJoinAnim(false),2800);},[]);
  React.useEffect(()=>{if(winner)setShowWinnerOverlay(true);},[winner]);
  // Detectar rematchPending en el room para espectador
  React.useEffect(()=>{
    if(room&&room.rematchPending){setShowRematch(true);setShowWinnerOverlay(false);}
    else if(room&&!room.rematchPending&&showRematch){
      // sala reseteada — nuevo juego listo
      setShowRematch(false);
    }
  },[room?.rematchPending]);

  const maxRound=(room?.round||1)-1;

  if(showRematch){
    return<RematchOverlay onDone={()=>setShowRematch(false)}/>;
  }

  return(
    <div className="spec-wrap">
      {showJoinAnim&&<div style={{position:"fixed",inset:0,background:"linear-gradient(135deg,#0a0a18,#1a1a2e)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:500,animation:"fadeOut 2.5s forwards"}}>
        <style>{`@keyframes fadeOut{0%{opacity:1}70%{opacity:1}100%{opacity:0;pointer-events:none}} @keyframes zoomIn{0%{transform:scale(0) rotate(-10deg);opacity:0}60%{transform:scale(1.15) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}} @keyframes slidePill{0%{transform:translateY(40px);opacity:0}100%{transform:translateY(0);opacity:1}}`}</style>
        <div style={{animation:"zoomIn .6s cubic-bezier(.34,1.56,.64,1) forwards",textAlign:"center"}}>
          <div style={{fontSize:"5rem",marginBottom:10}}>📡</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"2.8rem",letterSpacing:4,background:"linear-gradient(135deg,var(--t),#1A9A94)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1,marginBottom:6}}>MARCADOR</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"2.8rem",letterSpacing:4,background:"linear-gradient(135deg,var(--y),var(--or))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1,marginBottom:20}}>EN VIVO</div>
          <div style={{animation:"slidePill .5s .4s both",fontFamily:"'Righteous',sans-serif",fontSize:".9rem",color:"rgba(255,255,255,.5)",letterSpacing:3,background:"rgba(255,255,255,.06)",padding:"8px 20px",borderRadius:30,border:"1px solid rgba(255,255,255,.1)"}}>SALA {roomCode} · LIVE</div>
        </div>
      </div>}
      {showWinnerOverlay&&winner&&(
        <div style={{position:"fixed",inset:0,zIndex:400,background:"radial-gradient(circle at 50% 35%,#2a1800 0%,#0F0F1A 65%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:28,overflow:"hidden"}}>
          {Array.from({length:40},(_,i)=>({c:["#F5C800","#E63946","#2EC4B6","#FF6B35","#fff","#3BB273"][i%6],l:Math.random()*100+"%",dl:Math.random()*2.5+"s",dr:2.5+Math.random()*2.5+"s",sz:7+Math.random()*10+"px",sh:Math.random()>.5?"2px":"50%"})).map((d,i)=>(
            <div key={i} style={{position:"absolute",background:d.c,width:d.sz,height:d.sz,left:d.l,top:-20,borderRadius:d.sh,animation:"cf "+d.dr+" "+d.dl+" linear infinite"}}/>
          ))}
          <div style={{fontSize:"5rem",animation:"fl 2s ease-in-out infinite",marginBottom:8}}>🏆</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".8rem",letterSpacing:5,color:"var(--t)",textTransform:"uppercase",marginBottom:8}}>Ganador!</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"5rem",letterSpacing:3,background:"linear-gradient(135deg,var(--y) 30%,var(--or))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1,marginBottom:10}}>FLIP 7</div>
          <div style={{fontFamily:"'Lilita One',sans-serif",fontSize:"3.2rem",color:"white",letterSpacing:2,lineHeight:1.1,marginBottom:6,textShadow:"0 0 30px rgba(245,200,0,.5)"}}>
            {winner.emoji} {winner.name}
          </div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:"1.1rem",color:"var(--y)",marginBottom:30,letterSpacing:2}}>
            {winner.total} PUNTOS · RACE TO 200!
          </div>
          <button className="btn btn-y" onClick={()=>setShowWinnerOverlay(false)} style={{maxWidth:260,marginBottom:10}}>🏆 Ver marcador final</button>
          <button className="btn btn-g" onClick={onBack} style={{maxWidth:260}}>Salir</button>
        </div>
      )}
      <div className="hdr">
        <div>
          <div style={{display:"flex",alignItems:"baseline",gap:4}}><span className="logo-f">FLIP</span><span className="logo-7">7</span></div>
          <span className="logo-sub">Race to 200!</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          <div className="badge spec"><span className="dot"/> {roomCode}</div>
          <button className="btn btn-g btn-sm" onClick={()=>{snd('tap');onBack();}}>Salir</button>
        </div>
      </div>
      <div style={{padding:"10px 16px 0",textAlign:"center"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",letterSpacing:5,color:"var(--t)"}}>📡 MARCADOR EN VIVO</div>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"rgba(255,255,255,.3)",letterSpacing:2,display:"flex",alignItems:"center",justifyContent:"center",gap:5,marginTop:3}}>
          <span className="dot"/>SALA {roomCode} · RONDA {room?.round||""}
        </div>
      </div>
      {!room?(
        <div style={{textAlign:"center",paddingTop:60}}><div className="spin" style={{margin:"0 auto 14px"}}/><p style={{color:"rgba(255,255,255,.4)",fontWeight:700}}>Conectando</p></div>
      ):(
        <div style={{padding:"10px 12px 80px",overflowY:"auto"}}>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
            {sorted.map((p,i)=>{
              const pct=Math.min(100,(p.total/200)*100);
              const isFirst=i===0,isSecond=i===1,isThird=i===2;
              const rankEmoji=isFirst?"🥇":isSecond?"🥈":isThird?"🥉":"#"+(i+1);
              const borderColor=isFirst?"rgba(245,200,0,.6)":isSecond?"rgba(192,192,192,.4)":isThird?"rgba(205,127,50,.4)":"rgba(255,255,255,.08)";
              const bg=isFirst?"linear-gradient(135deg,rgba(245,200,0,.15),rgba(255,107,53,.1))":isSecond?"rgba(192,192,192,.05)":isThird?"rgba(205,127,50,.05)":"rgba(255,255,255,.03)";
              const scoreColor=isFirst?"var(--y)":isSecond?"#C0C0C0":isThird?"#CD7F32":"rgba(255,255,255,.55)";
              const scoreSize=isFirst?"5rem":isSecond?"4rem":"3.2rem";
              const nameSize=isFirst?"1.5rem":"1.05rem";
              const pad=isFirst?"20px 18px":"14px 16px";
              return(
                <div key={p.id} className={p._moved==='up'?'moved-up':p._moved==='down'?'moved-down':''}
                  style={{borderRadius:18,padding:pad,display:"flex",alignItems:"center",gap:14,position:"relative",overflow:"hidden",border:"2px solid "+borderColor,background:bg,transition:"all .6s cubic-bezier(.34,1.56,.64,1)"}}>
                  {isFirst&&<div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 20% 50%,rgba(245,200,0,.1) 0%,transparent 60%)",pointerEvents:"none"}}/>}
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:isFirst?"3.5rem":"2.5rem",color:scoreColor,lineHeight:1,width:isFirst?56:44,flexShrink:0,textAlign:"center"}}>{rankEmoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    {/* nombre con color del jugador en espectador */}
                    <div style={{fontWeight:900,fontSize:nameSize,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:p.color,textShadow:"0 0 12px "+p.color+"55"}}>{p.emoji} {p.name}</div>
                    <div style={{fontSize:".7rem",color:"rgba(255,255,255,.38)",fontWeight:700,marginTop:2}}>faltan {Math.max(0,200-p.total)} pts · {Math.round(pct)}%</div>
                    <div style={{height:isFirst?6:4,background:"rgba(255,255,255,.08)",borderRadius:3,marginTop:5,overflow:"hidden"}}>
                      <div style={{height:"100%",width:pct+"%",background:"linear-gradient(90deg,"+p.color+","+p.color+"cc)",borderRadius:3,transition:"width 1.2s cubic-bezier(.4,0,.2,1)"}}/>
                    </div>
                  </div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:scoreSize,lineHeight:1,color:scoreColor,flexShrink:0,textShadow:isFirst?"0 0 20px rgba(245,200,0,.4)":"none",transition:"all .5s"}}>{p.total}</div>
                  <div style={{position:"absolute",bottom:0,left:0,height:isFirst?5:3,width:pct+"%",background:"linear-gradient(90deg,var(--y),var(--or))",transition:"width 1.2s cubic-bezier(.4,0,.2,1)"}}/>
                </div>
              );
            })}
          </div>
          {maxRound>0&&(<>
            <div style={{height:1,background:"rgba(255,255,255,.07)",margin:"4px 0 12px"}}/>
            <p style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",letterSpacing:3,color:"rgba(255,255,255,.3)",textTransform:"uppercase",marginBottom:8}}>AVANCE POR RONDAS</p>
            <div className="tw">
              <table>
                <thead><tr><th>Jugador</th>{Array.from({length:maxRound},(_,i)=><th key={i}>R{i+1}</th>)}<th>Total</th></tr></thead>
                <tbody>{sorted.map((p,ri)=>(
                  <tr key={p.id} className={ri===0?"lr":""}>
                    <td style={{fontSize:".82rem",color:p.color}}>{p.emoji} {p.name}</td>
                    {(p.rounds||[]).map((r,i)=><td key={i} className={r.score===0?"rz":""}>{r.score===0?"💀":r.score}</td>)}
                    {Array.from({length:maxRound-(p.rounds||[]).length},(_,i)=><td key={"e"+i}></td>)}
                    <td className="tc">{p.total}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>)}
          <p style={{textAlign:"center",color:"rgba(255,255,255,.2)",fontSize:".68rem",fontWeight:700,letterSpacing:2,paddingBottom:10}}>AUTO-ACTUALIZA · META 200 PTS</p>
        </div>
      )}
    </div>
  );
}

// ── HISTORYTAB / SESCARDS ─────────────────────────────────────
function HistoryTab({sessions,onClear,T}){
  if(!sessions.length)return(
    <div className="es">
      <div style={{fontSize:"2.8rem",marginBottom:10}}>📋</div>
      <p style={{fontWeight:700}}>Sin sesiones aún</p>
      <p style={{fontSize:".8rem",marginTop:6,color:"rgba(255,255,255,.3)"}}>Completa una partida para verla aquí</p>
    </div>
  );
  return<SesCards sessions={sessions} onClear={onClear} T={T}/>;
}
function SesCards({sessions,onClear,T}){
  const[expanded,setExpanded]=React.useState(null);
  return(
    <>
      {sessions.length>0&&(
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <button onClick={()=>{if(window.confirm(T.confirmClear))onClear();}}
            style={{background:"rgba(230,57,70,.1)",border:"1px solid rgba(230,57,70,.3)",color:"var(--r)",borderRadius:8,padding:"4px 12px",cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".65rem",letterSpacing:1}}>
            🗑 Borrar historial
          </button>
        </div>
      )}
      {sessions.map(s=>{
        const isOpen=expanded===s.id;
        const sorted=[...s.players].sort((a,b)=>b.total-a.total);
        return(
          <div key={s.id} className="hc" style={{cursor:"pointer"}} onClick={()=>{snd('tap');setExpanded(isOpen?null:s.id);}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:900,fontSize:".84rem"}}>{fmtDate(s.date)}</div>
                <div style={{fontSize:".7rem",color:"rgba(255,255,255,.32)",fontWeight:700}}>{s.players.length} jugadores · {s.rounds} rondas · Sala {s.code}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {s.demo&&<span style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"var(--pu)",background:"rgba(123,45,139,.2)",padding:"2px 6px",borderRadius:10}}>DEMO</span>}
                <span style={{color:"rgba(255,255,255,.3)",fontSize:".9rem"}}>{isOpen?"▲":"▼"}</span>
              </div>
            </div>
            <div className="hw">
              <span style={{fontSize:"1.2rem"}}>🏆</span>
              <span style={{fontFamily:"'Lilita One',sans-serif",fontSize:".9rem",color:"var(--y)"}}>{s.winner}</span>
              <div className="hpl">
                {s.players.map(p=><span key={p.id} className="hpt">{p.emoji} {p.name}</span>)}
              </div>
            </div>
            {isOpen&&(
              <div style={{marginTop:12}}>
                {sorted.map((p,i)=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:i===0?"var(--y)":"rgba(255,255,255,.3)",width:28}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":"#"+(i+1)}</div>
                    <div style={{fontWeight:900,flex:1,color:p.color}}>{p.emoji} {p.name}</div>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.6rem",color:i===0?"var(--y)":"rgba(255,255,255,.6)"}}>{p.total}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── SCANMODAL — centrado en viewport; key cargada de Firebase al montar ──
function ScanModal({playerName,onResult,onClose,aiConfig,setAiConfig}){
  var useState=React.useState,useRef=React.useRef,useEffect=React.useEffect;
  var ph=useState("pick"),img_=useState(null),b64_=useState(null),mime_=useState("image/jpeg");
  var res_=useState(null),err_=useState(""),prov_=useState(aiConfig.provider||"gemini");
  // Iniciamos con la key que ya tiene aiConfig (puede estar vacía aún)
  var key_=useState(aiConfig.key||aiConfig.claudeKey||""),edit_=useState(false);
  var keyLoaded_=useState(false); // indica si Firebase ya respondió
  var phase=ph[0],setPhase=ph[1],img=img_[0],setImg=img_[1],b64=b64_[0],setB64=b64_[1];
  var mime=mime_[0],setMime=mime_[1],res=res_[0],setRes=res_[1];
  var errMsg=err_[0],setErrMsg=err_[1],provider=prov_[0],setProvider=prov_[1];
  var apiKey=key_[0],setApiKey=key_[1],showKeyEdit=edit_[0],setShowKeyEdit=edit_[1];
  var keyLoaded=keyLoaded_[0],setKeyLoaded=keyLoaded_[1];
  var fileRef=useRef();

  // ── Cargar key de Firebase al abrir el modal (no esperar a analyze) ──
  useEffect(function(){
    async function fetchKeys(){
      try{
        var[gemSnap,claudeSnap]=await Promise.all([
          _db.ref("config/ai").once("value"),
          _db.ref("config/claude").once("value")
        ]);
        var gemCfg=gemSnap.val();
        var claudeCfg=claudeSnap.val();
        var freshGem=gemCfg?.key||"";
        var freshClaude=claudeCfg?.key||"";
        // Actualizar aiConfig global con las keys frescas
        setAiConfig({
          provider:gemCfg?.provider||aiConfig.provider||"gemini",
          key:freshGem,
          claudeKey:freshClaude
        });
        // Cargar la key correcta según el proveedor activo
        if(provider==="anthropic"){
          if(freshClaude)setApiKey(freshClaude);
        } else {
          if(freshGem)setApiKey(freshGem);
        }
      }catch(fe){
        console.log("Firebase key load failed:",fe);
        // Fallback a lo que ya teníamos
        if(provider==="anthropic"){
          setApiKey(aiConfig.claudeKey||"");
        } else {
          setApiKey(aiConfig.key||"");
        }
      }
      setKeyLoaded(true);
    }
    fetchKeys();
  },[]);

  // Si cambia el proveedor, actualizar la key mostrada
  useEffect(function(){
    if(!keyLoaded)return;
    if(provider==="anthropic")setApiKey(aiConfig.claudeKey||"");
    else setApiKey(aiConfig.key||"");
  },[provider]);

  var PROMPT="Mira esta foto de cartas del juego Flip 7.\n\nTu UNICA tarea: lee los numeros que aparecen en las cartas de fondo BLANCO o CREMA.\nLas cartas base tienen escrito el numero en grande y debajo el nombre en ingles (SEVEN, TEN, TWELVE, etc.)\n\nIGNORA completamente:\n- Cualquier carta de fondo AMARILLO o DORADO\n- Cualquier carta de accion (Flip, Freeze, Second Chance)\n- Cualquier simbolo como x2, +2, +4, +6, +8, +10\n\nNOTA sobre colores de numeros:\n- Carta 7: color CAFE/MARRON claro, texto SEVEN\n- Carta 12: color GRIS oscuro, texto TWELVE\n- Carta 11: color AZUL/LILA, texto ELEVEN\n- Carta 10: color ROJO brillante, texto TEN\n\nSOLO reporta los numeros de cartas blancas/crema que veas claramente.\n\nResponde UNICAMENTE con este JSON sin markdown:\n{\"cards\":[<lista de numeros enteros>],\"total\":<suma>,\"note\":\"<que cartas viste>\"}";

  function handleFile(e){
    var f=e.target.files[0];if(!f)return;
    var r=new FileReader();
    r.onload=function(ev){
      var original=ev.target.result;
      var imgEl=new Image();
      imgEl.onload=function(){
        var MAX=1024,w=imgEl.width,h=imgEl.height;
        if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}}
        var canvas=document.createElement("canvas");
        canvas.width=w;canvas.height=h;
        canvas.getContext("2d").drawImage(imgEl,0,0,w,h);
        var compressed=canvas.toDataURL("image/jpeg",.75);
        setImg(compressed);setB64(compressed.split(",")[1]);setMime("image/jpeg");setPhase("preview");
      };
      imgEl.onerror=function(){setImg(original);setB64(original.split(",")[1]);setMime("image/jpeg");setPhase("preview");};
      imgEl.src=original;
    };
    r.readAsDataURL(f);
  }

  async function analyze(){
    // Key ya está cargada desde Firebase al abrir el modal
    // Si aún está vacía, hacer un último intento de fetch
    var key=apiKey.trim();
    if(!key){
      // último intento
      try{
        var snap=(provider==="anthropic")
          ? await _db.ref("config/claude").once("value")
          : await _db.ref("config/ai").once("value");
        var val=snap.val();
        key=(val?.key||"").trim();
        if(key)setApiKey(key);
      }catch(fe){}
    }
    if(!key){setErrMsg("No hay API Key configurada.\nConfigúrala en Firebase:\n• config/ai/key (Gemini)\n• config/claude/key (Claude)");setPhase("error");return;}
    setPhase("analyzing");

    try{
      var parsed=null;
      if(provider==="gemini"){
        var MODELS=["gemini-2.5-flash","gemini-2.5-flash-lite","gemini-2.5-pro"];
        var lastErr=null;
        for(var mi=0;mi<MODELS.length;mi++){
          var model=MODELS[mi];
          try{
            var body={contents:[{parts:[{inline_data:{mime_type:mime,data:b64}},{text:PROMPT}]}]};
            var resp=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent?key="+key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
            var rawBody=await resp.text();
            if(resp.status===429){lastErr=new Error("Cuota excedida (429). Espera 1 min.");continue;}
            if(resp.status===404){lastErr=new Error("Modelo "+model+" no encontrado.");continue;}
            if(resp.status===400){lastErr=new Error("Error 400: "+rawBody.slice(0,200));continue;}
            if(resp.status===403){lastErr=new Error("API Key sin permisos (403).");continue;}
            if(!resp.ok){lastErr=new Error("HTTP "+resp.status);continue;}
            var data=JSON.parse(rawBody);
            if(data.promptFeedback&&data.promptFeedback.blockReason){lastErr=new Error("Bloqueado: "+data.promptFeedback.blockReason);continue;}
            var rawTxt=(((data.candidates||[])[0]||{}).content||{}).parts;
            rawTxt=rawTxt?rawTxt[0].text:"";
            if(!rawTxt){lastErr=new Error("Respuesta vacía.");continue;}
            var cleanTxt=rawTxt.replace(/```json/g,"").replace(/```/g,"").trim();
            var js=cleanTxt.indexOf("{"),je=cleanTxt.lastIndexOf("}")+1;
            if(js>=0)cleanTxt=cleanTxt.slice(js,je);
            parsed=JSON.parse(cleanTxt);break;
          }catch(ex){lastErr=ex;}
        }
        if(!parsed)throw lastErr||new Error("Todos los modelos fallaron.");
      }else{
        // apiKey ya contiene la claudeKey cargada de Firebase al montar
        var ckey=apiKey.trim()||aiConfig.claudeKey||"";
        var resp2=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json","x-api-key":ckey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
          body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:300,messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:mime,data:b64}},
            {type:"text",text:PROMPT}
          ]}]})
        });
        if(!resp2.ok){var t2=await resp2.text();throw new Error("Anthropic "+resp2.status+": "+t2.slice(0,120));}
        var d2=await resp2.json();
        var txt2=(d2.content||[]).map(function(c){return c.text||"";}).join("");
        parsed=JSON.parse(txt2.replace(/```json/g,"").replace(/```/g,"").trim());
      }
      snd("score");setRes(parsed);setPhase("result");
    }catch(e){
      var m=e.message||"";
      var friendly=m;
      if(m.includes("429")||m.includes("Cuota"))friendly="Cuota de Gemini excedida. Espera ~1 minuto e intenta de nuevo.";
      else if(m.includes("404")||m.includes("not found"))friendly="Modelo no encontrado. Prueba de nuevo en unos minutos.";
      else if(m.includes("403")||m.includes("permisos"))friendly="API Key inválida o sin permisos.";
      else if(m.includes("fetch")||m.includes("network"))friendly="Error de red. Verifica tu conexión.";
      setErrMsg(friendly);setPhase("error");
    }
  }

  function retake(){setImg(null);setB64(null);setRes(null);setPhase("pick");if(fileRef.current)fileRef.current.value="";}

  return(
    React.createElement("div",{className:"mbg"},
      React.createElement("div",{className:"ms"},
        React.createElement("div",{className:"mh"}),
        React.createElement("div",{className:"mt2"},"📷 Scan con IA"),
        React.createElement("div",{className:"msub"},"Turno de: ",React.createElement("b",{style:{color:"#fff"}},playerName)),

        phase==="pick"&&React.createElement(React.Fragment,null,
          React.createElement("div",{style:{background:"rgba(46,196,182,.08)",border:"1px solid rgba(46,196,182,.22)",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}},
            React.createElement("div",{style:{flex:1}},
              React.createElement("div",{style:{fontWeight:900,fontSize:".82rem",color:keyLoaded?(apiKey?"var(--gr)":"var(--r)"):"var(--t)"}},
                !keyLoaded?"⏳ Cargando key de Firebase...":
                apiKey?"✅ Key cargada — Lista para usar":
                "⚠️ Sin API Key — usa Config para ingresar una"
              ),
              React.createElement("div",{style:{fontSize:".68rem",color:"rgba(255,255,255,.4)",fontWeight:700}},
                !keyLoaded?"Conectando con Firebase...":
                apiKey?"Toca la cámara o galería para escanear":
                "Ve a Config para ingresar tu key de Gemini o Claude"
              )
            ),
            React.createElement("button",{onClick:function(){snd("tap");setShowKeyEdit(function(v){return !v;});},style:{background:"none",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.4)",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:".68rem",fontWeight:700}},showKeyEdit?"Cerrar":"Config")
          ),
          showKeyEdit&&React.createElement("div",{className:"api-box",style:{marginBottom:12}},
            React.createElement("p",null,"Cambiar IA o key manual (opcional):"),
            React.createElement("div",{className:"ai-tabs"},
              React.createElement("button",{className:"ai-tab "+(provider==="gemini"?"on":""),onClick:function(){snd("tap");setProvider("gemini");setApiKey(aiConfig.key||"");}},
                "Gemini",React.createElement("br"),React.createElement("span",{style:{fontSize:".6rem",opacity:.7}},"GRATIS")),
              React.createElement("button",{className:"ai-tab "+(provider==="anthropic"?"on":""),onClick:function(){snd("tap");setProvider("anthropic");setApiKey(aiConfig.claudeKey||"");}},
                "Claude",React.createElement("br"),React.createElement("span",{style:{fontSize:".6rem",opacity:.7}},"$0.001/img"))
            ),
            React.createElement("input",{className:"inp",style:{margin:0,fontSize:".82rem"},
              placeholder:apiKey?"(key cargada de Firebase)":(provider==="gemini"?"AIzaSy...":"sk-ant-api03-..."),
              value:apiKey,
              onChange:function(e){setApiKey(e.target.value);},
              onFocus:function(){snd("tap");}
            })
          ),
          React.createElement("input",{ref:fileRef,type:"file",accept:"image/*",capture:"environment",style:{display:"none"},onChange:handleFile}),
          React.createElement("div",{className:"ce",style:{aspectRatio:"unset",height:130},onClick:function(){snd("tap");if(fileRef.current)fileRef.current.click();}},
            React.createElement("div",{style:{fontSize:"2.8rem"}},"📷"),
            React.createElement("div",null,"Toca para abrir la cámara"),
            React.createElement("div",{style:{fontSize:".7rem",opacity:.5}},"Apunta a tus cartas y toma foto")
          ),
          React.createElement("p",{style:{textAlign:"center",color:"rgba(255,255,255,.3)",fontSize:".75rem",fontWeight:700,cursor:"pointer",marginBottom:12},
            onClick:function(){snd("tap");if(fileRef.current){fileRef.current.removeAttribute("capture");fileRef.current.click();setTimeout(function(){if(fileRef.current)fileRef.current.setAttribute("capture","environment");},600);}}},"o elegir de galería"),
          React.createElement("div",{className:"mr2"},React.createElement("button",{className:"mc",onClick:function(){snd("tap");onClose();}},"Cancelar"))
        ),

        phase==="preview"&&React.createElement(React.Fragment,null,
          React.createElement("div",{className:"cv"},React.createElement("img",{src:img,alt:"preview"})),
          React.createElement("p",{style:{textAlign:"center",color:"rgba(255,255,255,.45)",fontWeight:700,fontSize:".82rem",marginBottom:8}},"¿Se ven bien todas las cartas?"),
          React.createElement("div",{style:{background:"rgba(46,196,182,.08)",border:"1px solid rgba(46,196,182,.2)",borderRadius:10,padding:"8px 12px",marginBottom:8,textAlign:"center"}},
            React.createElement("span",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",color:"var(--t)",letterSpacing:1}},"⚡ Solo números base · Ajusta chips después del scan")
          ),
          React.createElement("div",{className:"mr2"},
            React.createElement("button",{className:"mc",onClick:function(){snd("tap");retake();}},"📷 Otra foto"),
            React.createElement("button",{className:"mo",onClick:function(){snd("tap");analyze();}},"🔍 Analizar")
          )
        ),

        phase==="analyzing"&&React.createElement("div",{className:"cv",style:{position:"relative",aspectRatio:"unset",height:140}},
          React.createElement("img",{src:img,alt:"",style:{opacity:.4,width:"100%",height:"100%",objectFit:"cover",display:"block"}}),
          React.createElement("div",{className:"sov"},
            React.createElement("div",{className:"spin"}),
            React.createElement("div",{style:{fontFamily:"'Lilita One',sans-serif",color:"var(--y)",fontSize:"1rem"}},"Analizando con "+(provider==="gemini"?"Gemini":"Claude")+"...")
          )
        ),

        phase==="result"&&res&&React.createElement(ResultEditor,{res:res,onResult:onResult,onRetake:retake}),

        phase==="error"&&React.createElement(React.Fragment,null,
          React.createElement("div",{style:{textAlign:"center",padding:"16px 0"}},
            React.createElement("div",{style:{fontSize:"2.5rem",marginBottom:10}},"❌"),
            React.createElement("p",{style:{fontWeight:800,marginBottom:10,fontSize:".82rem",lineHeight:1.5,textAlign:"left",whiteSpace:"pre-wrap",background:"rgba(0,0,0,.3)",padding:"10px",borderRadius:10,maxHeight:160,overflowY:"auto",wordBreak:"break-all"}},errMsg),
            errMsg.includes("Cuota")&&React.createElement("div",{style:{background:"rgba(245,200,0,.1)",border:"1px solid rgba(245,200,0,.25)",borderRadius:10,padding:"10px 14px",fontSize:".8rem",fontWeight:800,color:"var(--y)"}},"Tip: la cuota gratuita es 15 req/min. Usa Manual mientras esperas.")
          ),
          React.createElement("div",{className:"mr2"},
            React.createElement("button",{className:"mc",onClick:function(){snd("tap");onClose();}},"Cerrar"),
            React.createElement("button",{className:"mo",onClick:function(){snd("tap");retake();}},"Reintentar")
          )
        )
      )
    )
  );
}

// ── RESULTEDITOR — cartas grandes + paleta rápida de cartas disponibles ──
function ResultEditor({res,onResult,onRetake}){
  const initCards=(res.cards||res.base_cards||[]).map(v=>Number(v)).filter(n=>!isNaN(n)&&n>=0&&n<=12);
  const[cards,setCards]=React.useState(initCards);
  const[multiplier,setMultiplier]=React.useState(res.multiplier||null);
  const[plusCards,setPlusCards]=React.useState((res.plus_cards||[]).map(Number).filter(n=>n>0));
  const baseTotal=cards.reduce((a,b)=>Number(a)+Number(b),0);
  const afterMult=multiplier?baseTotal*multiplier:baseTotal;
  const total=afterMult+plusCards.reduce((a,b)=>Number(a)+Number(b),0);

  function removeCard(idx){snd("del");setCards(c=>c.filter((_,i)=>i!==idx));}
  function addCard(n){snd("score");setCards(c=>[...c,n]);}

  // Cartas que NO están en la suma actual (para el selector rápido)
  const usedNums=cards.reduce((acc,n)=>{acc[n]=(acc[n]||0)+1;return acc;},{});
  const availableCards=ALL_CARD_NUMS.filter(n=>{
    // Se puede agregar si todavía no está en el número máximo razonable (permitir duplicados pero al menos las que no están)
    return (usedNums[n]||0)<3; // hasta 3 del mismo número
  });

  return(
    React.createElement(React.Fragment,null,
      // Cartas detectadas — más grandes
      React.createElement("div",{style:{marginBottom:12}},
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",color:"rgba(255,255,255,.35)",letterSpacing:3,marginBottom:10,textAlign:"center"}},"CARTAS DETECTADAS — toca para quitar"),
        React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center",minHeight:56,alignItems:"center",padding:"4px 0"}},
          cards.length===0&&React.createElement("div",{style:{color:"rgba(255,255,255,.3)",fontWeight:700,fontSize:".85rem"}},"Sin cartas — agrega de la paleta"),
          cards.map((n,i)=>React.createElement("div",{key:i,className:"card-chip",onClick:()=>removeCard(i)},
            React.createElement("span",{className:"card-chip-num",style:{color:CARD_TEXT_MAP[n]||"#333"}},n),
            React.createElement("button",{className:"card-chip-rm",onClick:(e)=>{e.stopPropagation();removeCard(i);}},"✕")
          ))
        )
      ),

      // Total
      React.createElement("div",{style:{textAlign:"center",padding:"8px 0 10px",borderTop:"1px solid rgba(255,255,255,.08)",borderBottom:"1px solid rgba(255,255,255,.08)",marginBottom:12}},
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:3,marginBottom:2}},"TOTAL FINAL"),
        React.createElement("div",{style:{fontFamily:"'Anton',sans-serif",fontSize:"4.5rem",color:"var(--y)",lineHeight:1,textShadow:"4px 4px 0 var(--or)"}},total),
        cards.length>0&&React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",color:"rgba(255,255,255,.35)",marginTop:4,lineHeight:1.6}},
          multiplier||plusCards.length>0
            ? React.createElement(React.Fragment,null,
                React.createElement("span",{style:{color:"rgba(255,255,255,.5)"}},"Base: "+cards.join("+"+(cards.length>1?" ":""))+" = "+baseTotal),
                multiplier&&React.createElement(React.Fragment,null,React.createElement("br"),React.createElement("span",{style:{color:"rgba(255,120,120,.8)"}},"x"+multiplier+" = "+(baseTotal*multiplier))),
                plusCards.length>0&&React.createElement(React.Fragment,null,React.createElement("br"),React.createElement("span",{style:{color:"rgba(100,220,150,.8)"}},"+ "+plusCards.join("+")+" = "+total))
              )
            : React.createElement("span",null,cards.length>1?cards.join(" + ")+" = "+baseTotal:"")
        ),
        res.note&&React.createElement("div",{style:{color:"rgba(255,255,255,.25)",fontSize:".68rem",fontWeight:700,marginTop:5,fontStyle:"italic"}},res.note)
      ),

      // Modificadores
      React.createElement("div",{style:{marginBottom:12}},
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:6,textAlign:"center"}},"MODIFICADORES — toca para aplicar"),
        React.createElement("div",{style:{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",marginBottom:6}},
          React.createElement("button",{onClick:()=>{snd("op");setMultiplier(m=>m?null:2);},
            style:{border:"2px solid "+(multiplier===2?MOD_TEXT_COLOR:"rgba(242,90,122,.3)"),background:multiplier===2?MOD_BG_COLOR:"rgba(246,166,35,.1)",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontFamily:"'Anton',sans-serif",fontSize:"1.2rem",color:multiplier===2?"#fff":MOD_TEXT_COLOR,transition:"all .2s",minWidth:56,textAlign:"center"}},
            "x2",multiplier===2&&React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",color:"#fff",letterSpacing:1,marginTop:1}},"ACTIVO")
          ),
          [2,4,6,8,10].map(n=>{
            const active=plusCards.includes(n);
            return React.createElement("button",{key:n,onClick:()=>{snd("op");setPlusCards(p=>active?p.filter(x=>x!==n):[...p,n]);},
              style:{border:"2px solid "+(active?MOD_TEXT_COLOR:"rgba(242,90,122,.25)"),background:active?MOD_BG_COLOR:"rgba(246,166,35,.08)",borderRadius:10,padding:"8px 12px",cursor:"pointer",fontFamily:"'Anton',sans-serif",fontSize:"1.1rem",color:active?"#fff":MOD_TEXT_COLOR,transition:"all .2s",minWidth:48,textAlign:"center"}},
              "+"+n,active&&React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",color:"#fff",letterSpacing:1,marginTop:1}},"✓")
            );
          })
        )
      ),

      // Paleta rápida — cartas disponibles (1 clic para agregar)
      React.createElement("div",{style:{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:"10px 12px",marginBottom:12}},
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:8,textAlign:"center"}},"➕ AGREGAR CARTA — toca para sumar"),
        React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}},
          availableCards.map(n=>
            React.createElement("button",{key:n,className:"avail-card",onClick:()=>addCard(n),
              style:{color:CARD_TEXT_MAP[n]||"white",borderColor:CARD_TEXT_MAP[n]+"44"}},
              n
            )
          )
        )
      ),

      // Botones confirm/retake
      React.createElement("div",{className:"mr2"},
        React.createElement("button",{className:"mc",onClick:()=>{snd("tap");onRetake();}},"📷 Repetir foto"),
        React.createElement("button",{className:"mo",onClick:()=>{snd("score");onResult(total);},disabled:cards.length===0},"✓ Confirmar "+total+" pts")
      )
    )
  );
}

// ── MANUALMODAL — soporta initialScore para corrección ────────
function ManualModal({playerName,initialScore,onSubmit,onClose}){
  const[expr,setExpr]=useState(initialScore!=null&&initialScore>0?String(initialScore):"");
  const[calcResult,setCalcResult]=useState(initialScore!=null?initialScore:0);
  const[error,setError]=useState(false);
  function pressNum(d){snd("num");setExpr(v=>v+d);}
  function pressOp(op){snd("op");setExpr(v=>{if(!v)return v;const last=v.slice(-1);if(["+","-","*","/"].includes(last))return v.slice(0,-1)+op;return v+op;});}
  function pressDel(){snd("del");setExpr(v=>v.slice(0,-1));}
  function pressClear(){snd("del");setExpr("");setCalcResult(0);setError(false);}
  useEffect(()=>{
    if(!expr){setCalcResult(0);setError(false);return;}
    const r=safeEval(expr);
    if(r===null){setError(true);}else{setError(false);setCalcResult(r);}
  },[expr]);
  const display=expr||"0";
  const finalVal=error?0:calcResult;
  const isCorrection=initialScore!=null;
  return(
    React.createElement("div",{className:"mbg"},React.createElement("div",{className:"ms"},
      React.createElement("div",{className:"mh"}),
      React.createElement("div",{className:"mt2"},isCorrection?"✏️ Corregir puntos":"🧮 Captura Manual"),
      React.createElement("div",{className:"msub"},
        isCorrection
          ? React.createElement(React.Fragment,null,"Corrección de ",React.createElement("b",{style:{color:"#fff"}},playerName)," — valor actual: ",React.createElement("b",{style:{color:"var(--y)"}},initialScore))
          : React.createElement(React.Fragment,null,"Puntos de ",React.createElement("b",{style:{color:"#fff"}},playerName)," esta ronda")
      ),
      React.createElement("div",{className:"calc-display"},
        React.createElement("div",{className:"calc-expr"},display),
        React.createElement("div",{className:"calc-result"+(error?" error":"")},error?"ERROR":finalVal)
      ),
      React.createElement("div",{className:"np-grid"},
        ["7","8","9","4","5","6","1","2","3"].map(d=>React.createElement("button",{key:d,className:"npb",onClick:()=>pressNum(d)},d))
      ),
      React.createElement("div",{className:"np-bottom"},
        React.createElement("button",{className:"npb zero-key",onClick:()=>pressNum("0")},"0"),
        React.createElement("button",{className:"npb del-key",onClick:pressDel},"←")
      ),
      React.createElement("div",{className:"np-ops"},
        React.createElement("button",{className:"npb op-key",onClick:()=>pressOp("+")}," + "),
        React.createElement("button",{className:"npb op-key",onClick:()=>pressOp("-")}," − "),
        React.createElement("button",{className:"npb op-key",onClick:()=>pressOp("*")}," × "),
        React.createElement("button",{className:"npb clr-key",onClick:pressClear},"CLR")
      ),
      React.createElement("button",{className:"npb ok-key",onClick:()=>{
        if(error||(!expr&&finalVal===0)){snd("zero");onSubmit(0);}
        else{snd("score");onSubmit(Math.max(0,Math.round(finalVal)));}
      }},isCorrection?"GUARDAR CORRECCIÓN · ":"CONFIRMAR · ",React.createElement("span",{style:{fontSize:"1.4rem"}},error?"0":Math.max(0,Math.round(finalVal)))," pts"),
      React.createElement("div",{style:{height:10}}),
      React.createElement("button",{className:"mc",style:{width:"100%"},onClick:()=>{snd("tap");onClose();}},"Cancelar")
    ))
  );
}

// ── STATSSCREEN — dashboard de jugadores ────────────────────
function StatsScreen({onBack,T}){
  const[players,setPlayers]=React.useState([]);
  const[selectedPlayer,setSelectedPlayer]=React.useState(null);
  const[games,setGames]=React.useState([]);
  const[loading,setLoading]=React.useState(true);
  const[tab,setTab]=React.useState("leaderboard");
  const[setupOpen,setSetupOpen]=React.useState(false);
  const[gemKey,setGemKey]=React.useState("");
  const[claudeKeyInput,setClaudeKeyInput]=React.useState("");
  const[saving,setSaving]=React.useState(false);
  const[saveMsg,setSaveMsg]=React.useState("");

  React.useEffect(()=>{
    async function load(){
      setLoading(true);
      try{
        // Cargar resúmenes de jugadores
        const snap = await _db.ref("stats/players").once("value");
        const data = snap.val()||{};
        const list = Object.values(data)
          .filter(p=>p.summary)
          .map(p=>p.summary)
          .sort((a,b)=>(b.wins||0)-(a.wins||0));
        setPlayers(list);
        // Cargar últimos juegos globales
        const gSnap = await _db.ref("stats/games").orderByChild("date").limitToLast(20).once("value");
        const gData = gSnap.val()||{};
        const gList = Object.values(gData).sort((a,b)=>b.date-a.date);
        setGames(gList);
      }catch(e){console.log("Stats load error:",e);}
      setLoading(false);
    }
    load();
  },[]);

  async function loadPlayerDetail(pKey){
    try{
      const snap = await _db.ref("stats/players/"+pKey+"/games").orderByChild("date").limitToLast(30).once("value");
      const data = snap.val()||{};
      const list = Object.values(data).sort((a,b)=>b.date-a.date);
      setSelectedPlayer({...players.find(p=>p.pKey===pKey), gamesList:list});
    }catch(e){console.log("Player detail error:",e);}
  }

  async function handleSaveConfig(){
    setSaving(true);setSaveMsg("");
    try{
      await setupFirebaseConfig(gemKey.trim(),claudeKeyInput.trim());
      setSaveMsg("✅ Keys guardadas en Firebase correctamente");
      setGemKey("");setClaudeKeyInput("");
    }catch(e){setSaveMsg("❌ Error: "+e.message);}
    setSaving(false);
  }

  const fmtD = ts => new Date(ts).toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"});
  const fmtT = ts => new Date(ts).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});

  // Vista detalle de un jugador
  if(selectedPlayer){
    const p=selectedPlayer;
    const winRate=p.games>0?Math.round((p.wins/p.games)*100):0;
    const avgScore=p.games>0?Math.round((p.totalScore||0)/p.games):0;
    return(
      <div className="wrap"><div className="page" style={{paddingTop:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
          <button onClick={()=>setSelectedPlayer(null)} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".72rem"}}>← Volver</button>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:"2.4rem"}}>{p.emoji}</div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:p.color,letterSpacing:2}}>{p.name}</div>
          </div>
        </div>
        {/* Stats summary */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          {[["🏆","Victorias",p.wins||0],["🎮","Partidas",p.games||0],["⭐","Mejor score",p.bestScore||0],["📊","Prom. score",avgScore]].map(([ico,lbl,val])=>(
            <div key={lbl} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",borderRadius:13,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:"1.4rem",marginBottom:4}}>{ico}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.8rem",color:"var(--y)",lineHeight:1}}>{val}</div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.35)",letterSpacing:2,marginTop:3,textTransform:"uppercase"}}>{lbl}</div>
            </div>
          ))}
        </div>
        <div style={{background:"rgba(245,200,0,.08)",border:"1px solid rgba(245,200,0,.2)",borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"2.4rem",color:"var(--y)"}}>{winRate}%</div>
          <div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"var(--y)",letterSpacing:2}}>WIN RATE</div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.35)",letterSpacing:1}}>{p.wins||0} victorias de {p.games||0} partidas</div>
          </div>
        </div>
        <p className="sec">HISTORIAL DE PARTIDAS</p>
        {(p.gamesList||[]).map((g,i)=>(
          <div key={g.gameId||i} style={{background:g.won?"rgba(59,178,115,.08)":"rgba(255,255,255,.03)",border:"2px solid "+(g.won?"rgba(59,178,115,.35)":"rgba(255,255,255,.07)"),borderRadius:13,padding:"11px 13px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:"1.6rem"}}>{g.won?"🏆":g.position===2?"🥈":g.position===3?"🥉":"💀"}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:900,fontSize:".88rem",color:g.won?"var(--gr)":"rgba(255,255,255,.8)"}}>{g.title||"Partida"}</div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.35)",letterSpacing:1,marginTop:2}}>{fmtD(g.date)} · {fmtT(g.date)} · {g.playerCount} jugadores</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.6rem",color:g.won?"var(--y)":"rgba(255,255,255,.5)"}}>{g.total}</div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"rgba(255,255,255,.3)",letterSpacing:1}}>pos #{g.position}</div>
            </div>
          </div>
        ))}
        {(!p.gamesList||p.gamesList.length===0)&&<div className="es"><p>Sin historial aún</p></div>}
        <div className="g8"/>
        <button className="btn btn-g" onClick={()=>setSelectedPlayer(null)}>← Volver al ranking</button>
      </div></div>
    );
  }

  return(
    <div className="wrap"><div className="page" style={{paddingTop:16}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".72rem"}}>← Volver</button>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.5rem",letterSpacing:3,color:"var(--y)"}}>📊 ESTADÍSTICAS</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:2}}>FLIP 7 · RACE TO 200</div>
        </div>
        {/* Botón setup Firebase */}
        <button onClick={()=>{snd('tap');setSetupOpen(v=>!v);}}
          style={{background:"rgba(123,45,139,.2)",border:"1px solid rgba(123,45,139,.4)",color:"#cc88ff",borderRadius:9,padding:"6px 10px",cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".65rem",letterSpacing:1}}>
          ⚙️ Config
        </button>
      </div>

      {/* Setup Firebase config */}
      {setupOpen&&(
        <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:"14px",marginBottom:14}}>
          <div style={{fontFamily:"'Lilita One',sans-serif",fontSize:".9rem",color:"var(--y)",marginBottom:4}}>⚙️ Configurar API Keys en Firebase</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:1,marginBottom:10}}>Las keys se guardan en Firebase · Solo el admin las configura una vez</div>
          <input className="inp" style={{fontSize:".82rem"}} placeholder="Gemini API Key (AIzaSy...)" value={gemKey} onChange={e=>setGemKey(e.target.value)}/>
          <input className="inp" style={{fontSize:".82rem"}} placeholder="Claude API Key (sk-ant-...)" value={claudeKeyInput} onChange={e=>setClaudeKeyInput(e.target.value)}/>
          {saveMsg&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:saveMsg.includes("✅")?"var(--gr)":"var(--r)",marginBottom:8,fontWeight:700}}>{saveMsg}</div>}
          <button className="btn btn-y" style={{marginBottom:0}} onClick={handleSaveConfig} disabled={saving||(!gemKey.trim()&&!claudeKeyInput.trim())}>
            {saving?"⏳ Guardando...":"💾 Guardar keys en Firebase"}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["leaderboard","🏆 Ranking"],["games","🎮 Partidas"]].map(([id,lbl])=>(
          <button key={id} className={"nb "+(tab===id?"on":"")} onClick={()=>{snd('tap');setTab(id);}} style={{flex:1,padding:"9px 4px"}}>{lbl}</button>
        ))}
      </div>

      {loading&&<div style={{textAlign:"center",paddingTop:40}}><div className="spin" style={{margin:"0 auto 14px"}}/><p style={{color:"rgba(255,255,255,.4)",fontWeight:700}}>Cargando estadísticas...</p></div>}

      {/* LEADERBOARD */}
      {!loading&&tab==="leaderboard"&&(<>
        {players.length===0&&<div className="es"><div style={{fontSize:"2.8rem",marginBottom:10}}>📊</div><p style={{fontWeight:700}}>Sin estadísticas aún</p><p style={{fontSize:".8rem",marginTop:6,color:"rgba(255,255,255,.3)"}}>Completa una partida para ver el ranking</p></div>}
        {players.map((p,i)=>{
          const winRate=p.games>0?Math.round((p.wins/p.games)*100):0;
          return(
            <div key={p.pKey||i} onClick={()=>{snd('tap');if(p.pKey)loadPlayerDetail(p.pKey);}}
              style={{background:i===0?"linear-gradient(135deg,rgba(245,200,0,.12),rgba(255,107,53,.07))":"rgba(255,255,255,.03)",
                border:"2px solid "+(i===0?"rgba(245,200,0,.45)":i===1?"rgba(192,192,192,.3)":i===2?"rgba(205,127,50,.3)":"rgba(255,255,255,.07)"),
                borderRadius:16,padding:"12px 14px",marginBottom:9,display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"all .2s"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.8rem",color:i===0?"var(--y)":i===1?"#C0C0C0":i===2?"#CD7F32":"rgba(255,255,255,.2)",width:36,textAlign:"center"}}>
                {i===0?"🥇":i===1?"🥈":i===2?"🥉":"#"+(i+1)}
              </div>
              <div style={{fontSize:"1.6rem"}}>{p.emoji}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:900,fontSize:".96rem",color:p.color}}>{p.name}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.35)",letterSpacing:1,marginTop:2}}>
                  {p.games||0} partidas · {winRate}% victorias · mejor: {p.bestScore||0}pts
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.8rem",color:i===0?"var(--y)":"rgba(255,255,255,.55)"}}>{p.wins||0}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",color:"rgba(255,255,255,.3)",letterSpacing:1}}>🏆 wins</div>
              </div>
              <div style={{color:"rgba(255,255,255,.2)",fontSize:".9rem"}}>›</div>
            </div>
          );
        })}
      </>)}

      {/* PARTIDAS */}
      {!loading&&tab==="games"&&(<>
        {games.length===0&&<div className="es"><div style={{fontSize:"2.8rem",marginBottom:10}}>🎮</div><p style={{fontWeight:700}}>Sin partidas aún</p></div>}
        {games.map((g,i)=>(
          <div key={g.gameId||i} style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:13,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:900,fontSize:".88rem"}}>{g.title||"Partida"}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.35)",letterSpacing:1,marginTop:2}}>{fmtD(g.date)} · {fmtT(g.date)} · Sala {g.code}</div>
              </div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.3)",background:"rgba(255,255,255,.06)",padding:"2px 8px",borderRadius:20}}>{g.playerCount||0} jug. · {g.rounds||0} rondas</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(245,200,0,.08)",borderRadius:9,padding:"7px 10px",marginBottom:8}}>
              <span style={{fontSize:"1.1rem"}}>🏆</span>
              <span style={{fontFamily:"'Lilita One',sans-serif",fontSize:".88rem",color:"var(--y)"}}>{g.winner}</span>
            </div>
            {(g.players||[]).sort((a,b)=>a.position-b.position).map(p=>(
              <div key={p.id||p.name} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1rem",width:24,color:"rgba(255,255,255,.3)"}}>{p.position===1?"🥇":p.position===2?"🥈":p.position===3?"🥉":"#"+p.position}</div>
                <div style={{fontSize:"1rem"}}>{p.emoji}</div>
                <div style={{fontWeight:800,flex:1,fontSize:".84rem",color:p.color}}>{p.name}</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.1rem",color:"rgba(255,255,255,.55)"}}>{p.total}pts</div>
              </div>
            ))}
          </div>
        ))}
      </>)}
    </div></div>
  );
}

// ── WINNERSCREEN — revancha solo host ─────────────────────────
function WinnerScreen({winner,onClose,onRematch,isHost,T}){
  React.useEffect(()=>{setTimeout(()=>snd("victory"),300);},[]);
  const isTie=winner&&winner.tied;
  const dots=Array.from({length:40},(_,i)=>({
    id:i,c:CONF[i%CONF.length],
    l:Math.round(Math.random()*100)+"%",
    dl:Math.round(Math.random()*25)/10+"s",
    dr:Math.round((2.5+Math.random()*2.5)*10)/10+"s",
    sz:Math.round(7+Math.random()*10)+"px",
    sh:Math.random()>.5?"2px":"50%"
  }));
  return(
    React.createElement("div",{className:"wb"},
      dots.map(d=>React.createElement("div",{key:d.id,style:{position:"absolute",background:d.c,width:d.sz,height:d.sz,left:d.l,top:-20,borderRadius:d.sh,animation:"cf "+d.dr+" "+d.dl+" linear infinite"}})),
      React.createElement("div",{className:"wc"},isTie?"🎊":"🏆"),
      React.createElement("div",{className:"wl"},isTie?"EMPATE!":"¡GANADOR!"),
      React.createElement("div",{className:"wbig"},"FLIP 7"),
      isTie?React.createElement(React.Fragment,null,
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".85rem",color:"var(--t)",letterSpacing:3,marginBottom:8}},winner.players.length+" GANADORES"),
        winner.players.map(p=>React.createElement("div",{key:p.id,style:{fontFamily:"'Lilita One',sans-serif",fontSize:"2rem",color:"white",letterSpacing:1,marginBottom:4,textShadow:"0 0 20px rgba(245,200,0,.4)"}},p.emoji+" "+p.name)),
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".9rem",color:"var(--y)",marginBottom:30,letterSpacing:2,marginTop:6}},winner.total+" PUNTOS CADA UNO")
      ):React.createElement(React.Fragment,null,
        React.createElement("div",{className:"wnm"},(winner.emoji||"")+" "+(winner.name||"")),
        React.createElement("div",{className:"wpt"},(winner.total||0)+" PUNTOS · RACE TO 200!")
      ),
      // Revancha solo para el host
      isHost
        ? React.createElement("button",{className:"btn btn-y",onClick:()=>{snd("round");onRematch();},style:{maxWidth:300,marginBottom:10}},"🔁 REVANCHA · Mismos jugadores")
        : React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".78rem",color:"rgba(255,255,255,.35)",letterSpacing:2,marginBottom:16,padding:"10px 20px",background:"rgba(255,255,255,.06)",borderRadius:12,border:"1px solid rgba(255,255,255,.1)"}},"⏳ Esperando revancha del host..."),
      React.createElement("button",{className:"btn btn-g",onClick:()=>{snd("tap");onClose();},style:{maxWidth:300}},"📊 Ver marcador final")
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
