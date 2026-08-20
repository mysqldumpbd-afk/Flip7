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
  // Zodiaco chino (12)
  "🐀","🐂","🐅","🐇","🐉","🐍",
  "🐎","🐏","🐒","🐓","🐕","🐖",
  // Animales extra fila 3 (6)
  "🦁","🐻","🐼","🦊","🦋","🦅",
  // Animales extra fila 4 (6)
  "🐬","🦈","🦜","🦩","🐙","🦖",
  // Animales extra fila 5 (6)
  "🦝","🦦","🦥","🐿️","🦔","🐲"
];

const COLORS=[
  // Fila 1: rojo, turquesa, amarillo
  "#E63946","#2EC4B6","#F5C800",
  // Fila 2: verde, morado, naranja
  "#3BB273","#7B2D8B","#FF6B35",
  // Fila 3: azul cielo, rosa, blanco
  "#00B4D8","#ff69b4","#ffffff",
  // Fila 4: verde lima, azul marino, coral
  "#A8E63B","#1A4FCC","#FF6B6B",
  // Fila 5: verde esmeralda, violeta, azul aguamarina
  "#06D6A0","#9B5DE5","#00CFE8",
  // Fila 6: dorado, verde oliva, salmon
  "#FFD700","#6A8C2F","#FF9A8B"
];

// ── AVATARES ILUSTRADOS (icons/avatars/*.png) ───────────────────────────
// Reemplazan al emoji como forma principal de identificarte: cada archivo ya
// viene recortado a cuadro y optimizado (~200x200, ~10-30KB c/u). "file" es
// el nombre exacto en icons/avatars/, "label" es lo que ve el usuario en el
// selector del perfil. defaultAvatar guarda el "file" en users/{uid}; si no
// hay avatar elegido (o el jugador es un invitado viejo), se sigue cayendo
// al emoji de siempre — ver PlayerAvatar más abajo.
const AVATARS=[
  {file:"adorable-cartoon-green-turtle-character.png",label:"Tortuga"},
  {file:"blue-dolphin-cartoon-character.png",label:"Delfín"},
  {file:"brown-teddy-bear-toy.png",label:"Osito"},
  {file:"cartoon-cow-character.png",label:"Vaca"},
  {file:"cartoon-monkey-holding-a-banana.png",label:"Mono"},
  {file:"cartoon-snail.png",label:"Caracol"},
  {file:"fluffy-white-sheep-character.png",label:"Oveja"},
  {file:"green-baby-dinosaur-character.png",label:"Dino Bebé"},
  {file:"green-cartoon-dinosaur-character.png",label:"Dinosaurio"},
  {file:"green-frog-character.png",label:"Rana"},
  {file:"koala-character-hugging-a-tree-log.png",label:"Koala"},
  {file:"orange-fox-character.png",label:"Zorro"},
  {file:"panda-character-holding-bamboo.png",label:"Panda"},
  {file:"penguin-character.png",label:"Pingüino"},
  {file:"purple-octopus-character.png",label:"Pulpo"},
  {file:"rendered-corgi-puppy-character.png",label:"Corgi"},
  {file:"rendered-yellow-baby-duckling-character.png",label:"Patito"},
  {file:"sleeping-grey-and-white-kitten.png",label:"Gatito"},
  {file:"stylized-unicorn-character-with-pastel-mane.png",label:"Unicornio"},
  {file:"white-bunny.png",label:"Conejo"}
];
// Cómo viaja el avatar por TODO el juego sin tener que agregar un campo
// paralelo en cada sala/estado/registro de Firebase que hoy ya carga un
// "emoji": si elegiste un avatar ilustrado, su valor de "emoji" efectivo
// deja de ser un emoji de verdad y pasa a ser la cadena especial
// "@avatar:archivo.png" -- así reutiliza intacta toda la plomería existente
// (playerEmojis, customEmojis, room.players[i].emoji, winner.emoji, etc.)
// que ya lee/guarda/sincroniza ese campo por su cuenta. <Ava v={...}/>
// es el único punto que sabe interpretar esa cadena especial: si detecta
// el prefijo muestra la imagen, si no, muestra el emoji tal cual (por eso
// ningún perfil viejo se rompe -- nunca tuvieron ese prefijo).
function Ava({v,size,style}){
  if(v&&typeof v==="string"&&v.indexOf("@avatar:")===0){
    return <img src={"icons/avatars/"+v.slice(8)} alt="" draggable="false"
      style={{width:size||"1em",height:size||"1em",objectFit:"contain",
        verticalAlign:"-0.15em",display:"inline-block",flexShrink:0,...style}}/>;
  }
  return <React.Fragment>{v}</React.Fragment>;
}
// Convierte el perfil guardado (defaultAvatar + defaultEmoji) en el valor
// de "emoji" efectivo que se siembra en una partida nueva. Se usa en los
// pocos puntos donde se lee el perfil para pre-llenar tu fila de jugador.
function effectiveEmoji(profile){
  if(!profile)return null;
  if(profile.defaultAvatar)return "@avatar:"+profile.defaultAvatar;
  return profile.defaultEmoji||null;
}
const CONF=["#F5C800","#E63946","#2EC4B6","#FF6B35","#fff","#3BB273","#7B2D8B"];
const uid4=()=>Math.random().toString(36).slice(2,6).toUpperCase();
const uid=()=>Math.random().toString(36).slice(2,10);
const fmtDate=(ts,T)=>{T=T||LANGS.es;return new Date(ts).toLocaleDateString(T.locale,{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});};

// Seudónimo para invitados (cuentas anónimas): NO se guarda en Firebase
// (una cuenta anónima no tiene un lugar persistente/único donde guardarlo
// entre sesiones), solo en sessionStorage — dura mientras la pestaña del
// navegador siga abierta, tal como se pidió ("solo para la sesión de uso").
function getAnonNickname(){ try{return sessionStorage.getItem('f7_anon_nick')||'';}catch(e){return '';} }
function setAnonNickname(v){ try{ if(v)sessionStorage.setItem('f7_anon_nick',v); else sessionStorage.removeItem('f7_anon_nick'); }catch(e){} }
// Etiqueta legible del método de acceso a partir de providerData de Firebase Auth
function providerLabel(user,T){
  T=T||LANGS.es;
  if(!user)return '';
  if(user.isAnonymous)return T.providerNone;
  const pid=user.providerData&&user.providerData[0]&&user.providerData[0].providerId;
  if(pid==='google.com')return T.providerGoogle;
  if(pid==='password')return T.providerPassword;
  return T.providerAccount;
}

// Colores de texto para cada número de carta Flip 7
const CARD_TEXT_MAP={0:"#FF2FA3",1:"#B7A9C9",2:"#D8E81B",3:"#FF4B78",4:"#19C7D8",5:"#10C96C",6:"#C86AE3",7:"#F48A9A",8:"#9EDB92",9:"#FFA33A",10:"#FF3B3B",11:"#6EBBFF",12:"#B9AEC9"};
const MOD_TEXT_COLOR="#F25A7A";
const MOD_BG_COLOR="#F6A623";
const ALL_CARD_NUMS=[0,1,2,3,4,5,6,7,8,9,10,11,12];
const FLIP7_BONUS=15;   // bonus oficial por completar 7 cartas únicas
const MAX_CARDS=7;      // máximo de cartas numéricas permitidas por ronda

// ── MODOS DE JUEGO ────────────────────────────────────────────────
const GAME_MODES={
  classic:{
    id:"classic",
    name:"FLIP 7",
    subtitle:"Race to 200",
    emoji:"🃏",
    image:"icons/card-classic.png",
    color:"#F5C800",
    glow:"rgba(245,200,0,.4)",
    labelEs:"Clásico",
    goal:200,
    flip7Bonus:15,
    maxCards:7,
    desc:"Primero en llegar a 200 puntos. 7 cartas únicas = +15 bonus.",
    rules:[
      "Meta: 200 puntos",
      "Carta duplicada = bust (0 pts en la ronda)",
      "7 cartas únicas = +15 pts bonus + fin de ronda",
      "Modificadores: x2, +2 al +10",
    ],
    badge:"ORIGINAL",
    badgeColor:"rgba(245,200,0,.2)",
    badgeBorder:"rgba(245,200,0,.5)",
  },
  venganza:{
    id:"venganza",
    name:"FLIP 7",
    subtitle:"With a Vengeance",
    emoji:"💀",
    image:"icons/card-vengeance.png",
    color:"#E63946",
    glow:"rgba(230,57,70,.5)",
    labelEs:"Venganza",
    goal:200,
    flip7Bonus:15,
    maxCards:7,
    // Cartas 1-13 (no 0-12 como classic)
    cardNums:[1,2,3,4,5,6,7,8,9,10,11,12,13],
    // Modificadores negativos (invertidos respecto a classic)
    // Orden de calculo: Suma -> /2 primero -> luego -N -> min 0 -> +15 flip7
    negMods:[-2,-4,-6,-8,-10],
    divMod:true,  // tiene carta /2
    // Cartas de accion inter-jugadores (se registran manualmente)
    actionCards:["Just One More","Swap","Steal","Discard","Flip Four"],
    desc:"Misma mecanica, cartas 1-13, modificadores negativos y cartas de accion inter-jugadores.",
    rules:[
      "Meta: 200 puntos",
      "Cartas numericas: 1 al 13",
      "Bust por duplicado = 0 pts",
      "Flip 7 bonus = +15 pts",
      "Modificadores NEGATIVOS: -2,-4,-6,-8,-10,/2",
      "Orden: Suma -> /2 -> -N -> min 0 -> +15",
      "Acciones: Swap, Steal, Discard, Flip Four",
    ],
    badge:"WITH A VENGEANCE",
    badgeColor:"rgba(230,57,70,.15)",
    badgeBorder:"rgba(230,57,70,.5)",
    comingSoon:false,
  },
};


// ── ESTADÍSTICAS — guardar por jugador en Firebase ────────────
async function saveGameStats(session, roomData){
  const gameId = session.code + "_" + session.date;

  // Reclamar el guardado de forma ATÓMICA — antes se leía "saved" y luego
  // se escribía por separado, dejando una ventana donde dos dispositivos
  // conectados a la vez podían pasar el chequeo y duplicar la partida.
  // Con transaction(), Firebase garantiza que solo UNO gane la carrera.
  const gameRef = _db.ref("stats/games/"+gameId);
  const claim = await gameRef.transaction(cur=>{
    if(cur&&cur.saved)return; // ya lo guardó otro dispositivo — abortar
    const sorted2=[...roomData.players].sort((a,b)=>b.total-a.total);
    const realWinnerId2 = roomData.winner?.tied ? null : (roomData.winner?.id || sorted2[0]?.id);
    const title2 = "Partida " + new Date(session.date).toLocaleDateString("es-MX",{month:"short",day:"numeric"});
    return{
      gameId, date: session.date, code: session.code,
      rounds: roomData.round, playerCount: roomData.players.length,
      winner: roomData.winner?.name||"", winnerId: realWinnerId2||"",
      title: title2, saved: true,
      winTarget: roomData.winTarget||WIN, // meta de esta partida — para mostrarla en el historial
      players: sorted2.map((p,i)=>({
        id:p.id, name:p.name, emoji:p.emoji, color:p.color,
        total:p.total, position:i+1, rounds:p.rounds||[]
      }))
    };
  });
  if(!claim.committed){ console.log("Stats: partida ya guardada por otro dispositivo, skip"); return; }

  const sorted = [...roomData.players].sort((a,b)=>b.total-a.total);
  const realWinnerId = roomData.winner?.tied ? null : (roomData.winner?.id || sorted[0]?.id);
  const title = "Partida " + new Date(session.date).toLocaleDateString("es-MX",{month:"short",day:"numeric"});
  const groupId = roomData.groupId||null;

  // Si la partida se creó desde un Grupo, dejar un índice de esa partida
  // bajo el grupo — así se puede listar el historial del grupo sin tener
  // que escanear todo /stats/games buscando coincidencias.
  if(groupId){
    await _db.ref("stats/groups/"+groupId+"/games/"+gameId).set({
      gameId, date: session.date, code: session.code, title,
      winner: roomData.winner?.name||"", winnerId: realWinnerId||"",
      playerCount: roomData.players.length, winTarget: roomData.winTarget||WIN
    }).catch(()=>{});
  }

  // Guardar por jugador — la CLAVE de almacenamiento ahora es el uid de
  // cuenta cuando existe. Solo se usa el nombre como clave de respaldo para
  // jugadores sin cuenta (anónimos) — antes SIEMPRE se usaba el nombre, lo
  // que mezclaba a dos personas distintas si compartían el mismo nombre.
  for(const p of roomData.players){
    const nameKey = p.name.trim().toLowerCase().replace(/[^a-z0-9]/g,"_").slice(0,30);
    const position = sorted.findIndex(s=>s.id===p.id)+1;
    const won = !!(realWinnerId && p.id===realWinnerId);

    // El uid ya viene guardado en el jugador desde que se creó/se unió a
    // la sala (ver enterGame/joinAsNew) — es la fuente confiable. Antes se
    // adivinaba SIEMPRE buscando /userIndex por el NOMBRE mostrado en la
    // partida, lo que se rompía en cuanto ese nombre era un seudónimo
    // distinto al nombre real de la cuenta (quedaban las estadísticas del
    // dueño de la cuenta guardadas bajo una llave de nombre, invisibles
    // tanto en "Mis estadísticas" como en las comparativas de amistad).
    // El lookup por /userIndex queda solo como respaldo para partidas
    // viejas creadas antes de este cambio, o jugadores agregados a mano
    // cuyo nombre coincide exacto con su cuenta.
    let resolvedUid=p.uid||null;
    if(!resolvedUid){
      try{
        const idxSnap=await _db.ref("userIndex/"+fbKey(p.name)).once("value");
        const idxVal=idxSnap.val();
        if(idxVal&&idxVal.uid)resolvedUid=idxVal.uid;
      }catch(e){}
    }
    const key = resolvedUid || nameKey; // clave real de almacenamiento

    await _db.ref("stats/players/"+key+"/games/"+gameId).set({
      date: session.date, gameId, code: session.code, title,
      name: p.name, emoji: p.emoji, color: p.color,
      total: p.total, position, rounds: p.rounds||[],
      playerCount: roomData.players.length, won,
      gameMode: roomData.gameMode||"classic",
      winTarget: roomData.winTarget||WIN
    });

    const pRounds = p.rounds||[];
    const partFlip7s = pRounds.filter(r=>r.breakdown&&r.breakdown.flip7).length;
    const partBusts  = pRounds.filter(r=>r.score===0).length;
    const partBestRound = pRounds.reduce((mx,r)=>Math.max(mx,r.score||0),0);
    await _db.ref("stats/players/"+key+"/summary").transaction(prev=>{
      prev=prev||{games:0,wins:0,totalScore:0,bestScore:0};
      return{
        name: p.name, emoji: p.emoji, color: p.color, pKey: key,
        uid: resolvedUid||prev.uid||null,
        games: (prev.games||0)+1,
        wins: (prev.wins||0)+(won?1:0),
        totalScore: (prev.totalScore||0)+p.total,
        bestScore: Math.max(prev.bestScore||0, p.total),
        bestRound: Math.max(prev.bestRound||0, partBestRound),
        flip7Count: (prev.flip7Count||0)+partFlip7s,
        bustCount:  (prev.bustCount||0)+partBusts,
        lastPlayed: session.date
      };
    });

    // Estadísticas del jugador DENTRO del grupo — se guardan por su
    // identidad (key), no por si sigue en el grupo o no. Así el historial
    // de un grupo queda completo aunque alguien lo abandone después, o
    // aunque haya sido invitado solo esa vez.
    if(groupId){
      await _db.ref("stats/groups/"+groupId+"/players/"+key+"/summary").transaction(prev=>{
        prev=prev||{games:0,wins:0,totalScore:0,bestScore:0};
        return{
          name: p.name, emoji: p.emoji, color: p.color, pKey: key,
          uid: resolvedUid||prev.uid||null,
          games: (prev.games||0)+1,
          wins: (prev.wins||0)+(won?1:0),
          totalScore: (prev.totalScore||0)+p.total,
          bestScore: Math.max(prev.bestScore||0, p.total),
          lastPlayed: session.date
        };
      }).catch(()=>{});
    }
  }
  console.log("Stats: guardadas correctamente para gameId",gameId);
}

// Trae el perfil GUARDADO (seudónimo/emoji/color de Perfil) de cada jugador
// elegido por uid — así una partida creada por otra persona (ej. eligiéndote
// desde Amigos o un Grupo) respeta TU personalización real en vez de tu
// nombre de cuenta y un emoji/color genérico asignado por orden. También es
// lo que permite guardar el uid real en cada jugador de la sala, para que
// las estadísticas no dependan de adivinar por nombre (ver saveGameStats).
async function enrichPickedPlayers(list){
  return Promise.all((list||[]).map(async f=>{
    if(!f||!f.uid)return{name:(f&&f.name)||"",uid:null,emoji:null,color:null};
    try{
      const snap=await _db.ref('users/'+f.uid).once('value');
      const v=snap.val()||{};
      return{name:v.nickname||f.name,uid:f.uid,emoji:effectiveEmoji(v),color:v.defaultColor||null};
    }catch(e){return{name:f.name,uid:f.uid,emoji:null,color:null};}
  }));
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
  if(demo)return{set:(p,d)=>demoSet(p,d),update:(p,d)=>demoUpdate(p,d),get:(p)=>demoGet(p),listen:(p,cb)=>demoListen(p,cb)};
  return{
    set:(p,d)=>_db.ref(p).set(d),
    update:(p,d)=>_db.ref(p).update(d),
    get:(p)=>_db.ref(p).once("value").then(s=>s.val()),
    listen:(p,cb)=>{const r=_db.ref(p);r.on("value",s=>cb(s.val()));return()=>r.off("value");},
  };
}

function classifyError(e,T){
  T=T||LANGS.es;
  const m=String(e?.message||e);
  if(!navigator.onLine)return{msg:T.errOffline,steps:[T.errOfflineStep]};
  if(m.includes("PERMISSION_DENIED"))return{msg:T.errPermission,steps:[T.errPermissionStep]};
  if(m.includes("fetch")||m.includes("network"))return{msg:T.errNetwork,steps:[T.errNetworkStep]};
  return{msg:"⚠ "+m.slice(0,100),steps:[T.errGenericStep]};
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
    players2:"JUGADORES",winner:"ganó",allReady:"Todos listos! Cierra la ronda.",
    waitingHost:"Esperando al admin",waitingCaps:"⏳ Esperando capturas",
    closeRound:"🔒 CERRAR RONDA",rematch:"🔁 REVANCHA",endGame:"🚪 Terminar",
    ranking:"CLASIFICACIÓN",rounds2:"TABLA DE RONDAS",goal:"META: 200 PUNTOS",
    noSessions:"Sin sesiones aún",noSessionsDesc:"Completa una partida para verla aquí",
    clearHistory:"🗑 Borrar historial",confirmClear:"Borrar todo el historial?",
    finalRanking:"CLASIFICACIÓN FINAL",
    scanTitle:"🃏 Árbitro de Cartas",turnOf:"Turno de:",
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
    // ── EXTENSIÓN i18n (auto-generada) ──
    modeClassicDesc:"Primero en llegar a 200 puntos. 7 cartas únicas = +15 bonus.",
    modeClassicRules:["Meta: 200 puntos", "Carta duplicada = bust (0 pts en la ronda)", "7 cartas únicas = +15 pts bonus + fin de ronda", "Modificadores: x2, +2 al +10"],
    modeVenganzaDesc:"Misma mecanica, cartas 1-13, modificadores negativos y cartas de accion inter-jugadores.",
    modeVenganzaRules:["Meta: 200 puntos", "Cartas numericas: 1 al 13", "Bust por duplicado = 0 pts", "Flip 7 bonus = +15 pts", "Modificadores NEGATIVOS: -2,-4,-6,-8,-10,/2", "Orden: Suma -> /2 -> -N -> min 0 -> +15", "Acciones: Swap, Steal, Discard, Flip Four"],
    errOffline:"⚡ Sin conexión.",
    errOfflineStep:"Verifica tu internet",
    errPermission:"🔒 Sin permisos Firebase.",
    errPermissionStep:"Reglas → \".read\":true,\".write\":true → Publicar",
    errNetwork:"📡 Error de red.",
    errNetworkStep:"Verifica conexión e intenta de nuevo",
    errGenericStep:"Recarga la página",
    errGoogle:"Error con Google",
    errGoogleContinue:"No se pudo continuar con Google",
    errEnterEmailPass:"Ingresa email y contraseña",
    errRegisteredWithGoogle:"Este correo ya está registrado con Google. Inicia sesión con Google.",
    errWrongCreds:"Correo o contraseña incorrectos",
    errLoginFailed:"No se pudo iniciar sesión",
    errEnterName:"Ingresa tu nombre",
    errMinChars:"Mínimo 6 caracteres",
    errEmailInUse:"Este email ya tiene cuenta — inicia sesión desde 'salir' primero",
    errSignupFailed:"Error al crear cuenta",
    errAnonDisabled:"El acceso como invitado está deshabilitado",
    errAnonFailed:"No se pudo entrar como invitado",
    guestLabel:"Invitado",
    savedSessionMsg:"Guardado para esta sesión",
    errorPrefixLbl:"Error:",
    feedbackEmptyErr:"Escribe algo antes de enviar.",
    feedbackSendErr:"No se pudo enviar. Revisa tu conexión e intenta de nuevo.",
    providerNone:"Sin cuenta",
    providerGoogle:"Google",
    providerPassword:"Correo y contraseña",
    providerAccount:"Cuenta",
    agoNow:"hace un momento",
    agoMin:"hace {n}min",
    agoH:"hace {n}h",
    agoD:"hace {n}d",
    locale:"es-MX",
    loadingCaps:"CARGANDO...",
    gamePrefix:"Partida",
    errBoundaryTitle:"Algo salió mal",
    errBoundaryDesc:"La app tuvo un error inesperado y no puede seguir en esta pantalla.",
    reloadApp:"🔄 Recargar la app",
    loadingSlow:"Esto está tardando más de lo normal",
    reloadPage:"🔄 Recargar página",
    exitBtn:"Salir",
    confirmSignOut:"¿Cerrar sesión?",
    roomLabelInline:"SALA:",
    demoModeLbl:"MODO DEMO — local, sin Firebase",
    connecting:"Conectando",
    modeLabelClassic:"Clásico",
    modeLabelVenganza:"Venganza",
    modeLbl:"Modo:",
    heroSubBrand:"FLIP 7 · UNOFFICIAL SCORETRACK",
    warnTitle:"ADVERTENCIA DEL ADMINISTRADOR",
    warnDefaultMsg:"Recibiste una advertencia por parte del equipo de administración. Revisa que tu comportamiento cumpla las reglas de la comunidad.",
    warnCountMsg:"Advertencias acumuladas: {n}. Si continúan, tu cuenta puede ser suspendida o bloqueada.",
    understood:"Entendido",
    accBlockedTitle:"CUENTA BLOQUEADA",
    accSuspendedTitle:"CUENTA SUSPENDIDA",
    accBlockedDesc:"Esta cuenta fue bloqueada y ya no puede usar la app.",
    accSuspendedDesc:"Esta cuenta está suspendida temporalmente y no puede usar la app por ahora.",
    accReason:"Motivo:",
    accReturnDate:"Podrás volver a entrar el {date}",
    accContact:"Si crees que esto es un error, contáctanos desde otra cuenta usando el buzón de la app (⚙️ → Reportar bug / sugerir).",
    signOutBtn:"Cerrar sesión",
    continueGoogle:"Continuar con Google",
    waitingGoogle:"Esperando a Google…",
    continueEmail:"✉️ Continuar con Email",
    waitLong:"Puede tardar hasta 40 segundos — no cierres la ventana ({n}s)",
    tryOtherMethod:"¿Se está tardando? Prueba con este otro método",
    orNoAccount:"O SIN CUENTA",
    playNoAccount:"👤 Jugar sin cuenta",
    noAccountWarnHist:"Sin cuenta no se guarda tu historial entre dispositivos",
    loginTab:"Iniciar sesión",
    createAccount:"Crear cuenta",
    namePlaceholder:"Tu nombre",
    emailPlaceholder:"Email",
    passwordPlaceholder:"Contraseña (mín. 6 caracteres)",
    waitingDots:"⏳ ...",
    loginBtn:"🎮 Iniciar sesión",
    signupBtn:"🚀 Crear cuenta",
    createAccountFor:"Crea tu cuenta para usar {feature}",
    progressKept:"Tu progreso actual se queda igual — solo se vincula.",
    notNow:"Ahora no",
    profileTitle:"👤 PERFIL",
    guestSessionLabel:"SIN CUENTA — sesión temporal",
    guestExplain:"Estás jugando sin cuenta: nada de esto se guarda de forma permanente, solo se usa mientras siga abierta esta sesión del navegador. Si cierras la pestaña o entras desde otro dispositivo, se pierde.",
    anonNickLabel:"TU SEUDÓNIMO PARA ESTA SESIÓN",
    anonNickPlaceholder:"¿Cómo quieres que te vean en las partidas?",
    useThisNick:"💾 Usar este seudónimo",
    wantSaveAcrossDevices:"¿Quieres que tu emoji, color y estadísticas se guarden entre partidas y dispositivos?",
    nickForGamesLabel:"TU SEUDÓNIMO PARA PARTIDAS",
    nickForGamesDesc:"Se usa para pre-llenar tu nombre al crear una partida, sin tener que cambiar tu nombre real de {provider}.",
    nickForGamesPlaceholder:"Tu nombre en partidas",
    defaultEmojiLabel:"TU EMOJI POR DEFECTO",
    defaultAvatarLabel:"TU AVATAR",
    avatarNoneLabel:"Ninguno",
    avatarOverridesEmoji:"Si eliges un avatar, reemplaza a tu emoji en las partidas. Elige \"Ninguno\" para volver al emoji.",
    defaultColorLabel:"TU COLOR POR DEFECTO",
    celebrationLabel:"CELEBRACIÓN AL GANAR",
    celebrationDesc:"Se aplica solo en TU pantalla cuando SOS quien gana. Los demás jugadores siguen viendo su propio sorteo.",
    celebRandom:"Aleatoria",
    celebRandomSub:"Sorprende cada vez (como hasta ahora)",
    celebOriginal:"Original",
    celebOriginalSub:"Dorado — confeti clásico",
    celebExplosive:"Victoria Explosiva",
    celebExplosiveSub:"Teal / morado",
    celebCrowned:"Coronado",
    celebCrownedSub:"Morado claro",
    celebJungle:"Selva",
    celebJungleSub:"Verde — hojas y tambores",
    celebBeaming:"Radiante",
    celebBeamingSub:"Dorado — sonrisa gigante",
    celebFire:"En Llamas",
    celebFireSub:"Naranja — fuego intenso",
    celebBiceps:"Pura Potencia",
    celebBicepsSub:"Verde lima — fuerza bruta",
    celebHahaha:"Muerto de Risa",
    celebHahahaSub:"Coral — carcajada total",
    celebRainbow:"Arcoíris",
    celebRainbowSub:"Multicolor — magia pura",
    celebSquint:"Travieso",
    celebSquintSub:"Rosa — guiño pícaro",
    savingBtn:"⏳ Guardando...",
    saveProfileBtn:"💾 Guardar perfil",
    profileSaved:"✅ Perfil guardado",
    feedbackThanks:"¡Gracias!",
    feedbackThanksBug:"Ya lo tenemos anotado, lo revisamos pronto.",
    feedbackThanksSuggestion:"Tu idea quedó guardada, la consideramos para futuras versiones.",
    closeBtn:"Cerrar",
    feedbackTitle:"🗳️ Buzón de Score 7",
    reportBug:"✍️ Reportar un error",
    suggestGame:"💡 Sugerir juego",
    whichScreen:"¿EN QUÉ PANTALLA?",
    whatErrorType:"¿QUÉ TIPO DE ERROR?",
    feedbackBugPlaceholder:"Cuéntanos qué pasó y qué esperabas que pasara...",
    feedbackSuggestPlaceholder:"¿Qué juego o función te gustaría ver en la app?",
    attachScreenshot:"📎 Adjuntar captura de pantalla (opcional)",
    screenshotAttached:"Captura adjunta",
    sendingAs:"Enviando como:",
    sendBtn:"Enviar",
    sendingBtn:"Enviando...",
    noNameLabel:"Sin nombre",
    anonPlayerLabel:"Jugador anónimo (sin cuenta)",
    fsHome:"🏠 Inicio",
    fsCreate:"➕ Crear sala",
    fsJoin:"🔑 Unirse a una sala",
    fsRound:"🎲 Ronda / Marcador",
    fsTable:"📋 Tabla de rondas",
    fsSpectator:"📺 Marcador en vivo (espectador)",
    fsScanner:"📷 Escáner de cartas (IA)",
    fsStats:"📊 Estadísticas",
    fsProfile:"👤 Perfil",
    fsGroups:"👥 Grupos",
    fsOther:"❓ Otra / no estoy seguro",
    fcCrash:"🖤 Se puso en negro / se cerró",
    fcNotSaved:"💾 No se guardó mi puntaje",
    fcAi:"🤖 El escáner de cartas (IA) falló",
    fcConnection:"📡 No pude entrar o conectarme a la sala",
    fcVisual:"🎨 Algo se ve mal (visual)",
    fcOther:"❓ Otro",
    someoneStarted:"Alguien ya empezó a jugar — únete ahora",
    joinNowBtn:"✅ Unirme",
    gameModeLabel:"MODO DE JUEGO",
    requiresManual:"📋 Requiere manual oficial",
    howItWorks:"CÓMO FUNCIONA",
    ruleClassicCards:"Cartas 0–12",
    ruleClassicCardsDesc:" · suma los valores de tu mano.",
    ruleDupTitle:"Carta duplicada",
    ruleDupDesc:" = bust, cero pts en la ronda.",
    ruleFlip7Title:"Flip 7",
    ruleFlip7Desc:": 7 cartas únicas = +15 pts bonus + fin de ronda.",
    ruleModTitle:"Modificadores:",
    ruleModDesc:" ×2, +2 al +10 sobre tu suma.",
    ruleGoalDesc:" · primero en llegar gana.",
    ruleVengCards:"Cartas 0–13",
    ruleVengCardsDesc:" · incluye especiales: Zero, Unlucky 7, Lucky 13.",
    ruleVengDupTitle:"Duplicado",
    ruleVengDupDesc:" = bust · Unlucky 7 = pierdes tus cartas, queda el 7.",
    ruleVengModTitle:"Modificadores negativos",
    ruleVengModDesc:" (te los juegan): ÷2, −2 al −10.",
    ruleVengActionsTitle:"Acciones:",
    ruleVengActionsDesc:" Swap, Steal, Discard, Flip Four, Just One More.",
    goalPointsLabel:"META DE PUNTOS",
    standardLbl:"ESTÁNDAR",
    autoCloseRound:"⚡ Auto-cerrar ronda cuando todos terminen",
    canChangeLater:"Puedes cambiarlo después, dentro del juego",
    nextArrow:"Siguiente →",
    backToGameType:"← Tipo de juego",
    noFriendsYet:"Aún no tienes amigos agregados",
    selectAll:"Todos",
    selectNone:"Ninguno",
    useSelected:"✅ Usar seleccionados",
    noGroupsYet:"Aún no tienes grupos",
    groupsAvailable:"GRUPOS DISPONIBLES",
    tapToIncludeExclude:"Toca a cada integrante para incluirlo o excluirlo de esta partida.",
    activeRoomFound:"SALA ACTIVA ENCONTRADA",
    codeLabelInline:"Código:",
    reconnectAdmin:"⚡ Reconectarme como Admin",
    ignoreBtn:"Ignorar",
    roomCodeTitle:"Código de sala",
    idealForTablet:"💡 Ideal para dejar abierta en una tablet o pantalla en medio de la mesa — todos ven los puntajes actualizarse en vivo, sin que nadie tenga que pasarse el celular.",
    joinNamePlaceholder:"Tu nombre en el juego",
    spectatorOnlyLbl:"SOLO VER MARCADOR",
    choosePlayerHint:"Elige tu personaje. Los marcados como \"En sala\" ya están conectados.",
    choosePlayerLbl:"ELIGE TU JUGADOR",
    inRoomTag:"En sala",
    joinAsNewLbl:"O UNIRME COMO JUGADOR NUEVO",
    newPlayerNamePlaceholder:"Nombre del nuevo jugador",
    addNewPlayerBtn:"➕ AGREGAR JUGADOR NUEVO",
    moreOptionsAria:"Más opciones",
    profileMenuItem:"👤 Perfil",
    reportBugMenuItem:"🗳️ Reportar bug / sugerir",
    changeAccount:"Cambiar cuenta",
    anonExpireWarn:"⚠ Las sesiones anónimas se eliminan tras 30 días de inactividad",
    spectatorMenuItem:"👁 Espectador",
    joinArrow:"Unirme →",
    waitingRematch:"⏳ Esperando revancha del admin...",
    adminDisconnected:"⚠️ El admin se desconectó",
    playerDisconnectedInfo:"ℹ️ Algún jugador está desconectado. Puede reconectarse con el código de sala.",
    transferAdmin:"🔁 Transferir admin",
    endGameBtn2:"🛑 Terminar partida",
    chooseNewAdmin:"ELEGIR NUEVO ADMIN — debe estar conectado ahora mismo",
    confirmEndGame:"¿Terminar la partida para todos?",
    endGameDesc:"Todos los jugadores volverán al inicio. La sala no se borra.",
    yesEndGame:"Sí, terminar",
    youLbl:"tú",
    adminBadge:"👑 ADMIN",
    ptsLbl:"pts",
    readyBtn:"✓ LISTO",
    unlockBtn:"🔒 Desbloquear",
    scanAiBtn:"📷 Scan IA",
    cardsBtn:"🃏 Cartas",
    manualBtn:"🧮 Manual",
    zeroBtn:"💀 Cero",
    lockedRowHint:"Fila protegida — toca para desbloquear y capturar",
    waitingDots2:"⏳ esperando",
    lobbyModeLbl:"SALA EN MODO LOBBY",
    shareCodeToJoin:"Comparte este código para que los jugadores se unan",
    colPlayer:"Jugador",
    colTotal:"Total",
    scoreboardTitle:"MARCADOR",
    liveCaps:"EN VIVO",
    roomCapsInline:"SALA",
    seeScoreboard:"🏆 Ver marcador final",
    clearHistoryConfirmTitle:"🗑 Borrar historial",
    demoTag:"DEMO",
    groupsTitle:"GRUPOS",
    groupsLoginPrompt:"Crea una cuenta para crear grupos con tus amigos, ver quién está online y jugar juntos cada semana.",
    backToGroups:"← Grupos",
    inviteBtn:"🔗 Invitar",
    confirmReq:"Confirmar",
    deleteGroupTitle:"Eliminar grupo",
    gameInProgress:"PARTIDA EN CURSO",
    membersLbl:"MIEMBROS",
    tapToIncludeHint:"TOCA A LOS QUE VAN A JUGAR · CUALQUIERA PUEDE UNIRSE DESPUÉS",
    adminLbl:"ADMIN",
    tapToIncludeShort:"tap para incluir",
    yesLbl:"Sí",
    noLbl:"No",
    deleteMemberTitle:"Eliminar del grupo",
    addFriendsToGroup:"AGREGAR AMIGOS AL GRUPO",
    addBtn:"+ Agregar",
    backToGroupsLong:"← Volver a Grupos",
    groupsCapsTitle:"👥 GRUPOS",
    noGroupsYet2:"Sin grupos aún",
    createGroupHint:"Crea un grupo para jugar con los mismos amigos cada semana con el mismo código",
    inGameTag:"🎮 EN JUEGO",
    groupNameLbl:"NOMBRE DEL GRUPO",
    groupNamePlaceholder:"ej. Los Jueves 🎴",
    createGroupBtn:"🎮 Crear grupo",
    newGroupBtn:"+ Crear nuevo grupo",
    groupCodeLbl:"CÓDIGO DEL GRUPO",
    joinGroupBtn:"👥 Unirme al grupo",
    askGroupCode:"Pide el código de 4 letras al admin del grupo",
    calendarLbl:"📅 CALENDARIO",
    thisMonthSuffix:"este mes",
    lessLbl:"menos",
    moreLbl:"más",
    comparingLbl:"Comparando…",
    neverPlayedTogether:"Aún no han jugado juntos en la misma partida",
    youAllCaps:"TÚ",
    vsLbl:"vs",
    gameWord:"partida",
    togetherSuffix:"juntos",
    dateColLbl:"Fecha",
    youCol:"Tú",
    posAbbrev:"pos.",
    loadingRoundsTable:"Cargando tabla de rondas…",
    guestModeLbl:"Modo anónimo",
    createAccountStatsHint:"Crea una cuenta para guardar tus stats, ver tu historial y agregar amigos.",
    createAccountLoginBtn:"Crear cuenta / Iniciar sesión",
    noGamesYetLong:"Aún sin partidas registradas",
    playFirstGameHint:"Juega tu primera partida para ver tus stats",
    winRateLbl:"WIN RATE",
    flip7PerGame:"FLIP 7 POR PARTIDA",
    bustPerGame:"BUST POR PARTIDA",
    bestStreak:"RACHA RÉCORD",
    cardsPerRound:"CARTAS POR RONDA",
    luckyCard:"CARTA DE LA SUERTE",
    bustsInARow:"BUSTS SEGUIDOS",
    needAccountFriends:"Necesitas cuenta para agregar amigos",
    inviteFriendCaps:"INVITAR AMIGO",
    shareLinkDesc:"Comparte tu link — cuando tu amigo lo abra quedará conectado contigo automáticamente.",
    shareInviteLinkBtn:"🔗 Compartir link de invitación",
    searchByNameEmail:"O BUSCAR POR NOMBRE / EMAIL (2+ letras)",
    searchNameEmailPlaceholder:"Escribe nombre o email…",
    searchingLbl:"Buscando…",
    requestSentBtn:"+ SOLICITUD",
    noResults:"Sin resultados",
    wantsToBeFriend:"quiere ser tu amigo",
    acceptBtn:"✓ Aceptar",
    noFriendsYetAdd:"Sin amigos aún — agrega a tus compañeros de juego",
    noGamesYetShort:"Sin partidas aún",
    winsLbl:"WINS",
    compareHeadToHead:"Comparar cabeza a cabeza",
    deleteFriendTitle:"Eliminar amigo",
    noGamesRegisteredYet:"Sin partidas registradas aún",
    vengeanceTag:"💀 VENGANZA",
    ptsTotalLbl:"pts totales",
    backToMenu:"← Volver al menú",
    historyOfGames:"HISTORIAL DE PARTIDAS",
    noHistoryYet:"Sin historial aún",
    backToRanking:"← Volver al ranking",
    statsCapsTitle:"📊 ESTADÍSTICAS",
    flip7RaceTo200:"FLIP 7 · RACE TO 200",
    loadingStats:"Cargando estadísticas...",
    completeGameForRanking:"Completa una partida para ver el ranking",
    noStatsYet:"Sin estadísticas aún",
    winsTrophy:"🏆 wins",
    weekdayLetters:["D", "L", "M", "M", "J", "V", "S"],
    heroPhrases:["FLIP. SUMA. GANA.", "¿PLANTAS O ARRIESGAS?", "SIN REPETIR, SIN PASARTE", "CADA CARTA CUENTA", "LA SUERTE ESTÁ ECHADA", "CORRE A LA META"],
    scanTitle2:"🃏 Árbitro de Cartas",
    myCardsTitle:"🃏 Mis cartas",
    myCardsVengTitle:"💀 Mis cartas",
    manualCorrectTitle:"✏️ Corregir puntos",
    manualCaptureTitle:"🧮 Captura Manual",
    loadingDots:"Cargando...",
    tapOpenCamera:"Toca para abrir la cámara",
    aimCardsHint:"Apunta a tus cartas y toma foto",
    orChooseGallery:"o elegir de galería",
    verticalPhotoDetected:"📱 Foto en vertical detectada",
    verticalPhotoDesc:"El Árbitro lee mejor las cartas en horizontal. No es perfecto con fotos verticales — gírala antes de analizar.",
    rotatePhotoBtn:"🔄 Girar foto",
    allCardsVisible:"¿Se ven bien todas las cartas?",
    refereeSupreme:"🃏 El Árbitro de Cartas™ · Juez Supremo del Mazo",
    anotherPhotoBtn:"📷 Otra foto",
    analyzeBtn:"🔍 Analizar",
    refereeAnalyzing:"El Árbitro está revisando las cartas...",
    retryBtn:"Reintentar",
    cardsDetectedCaps:"CARTAS DETECTADAS — toca para quitar",
    dupWarnPrefix:"aparecen dos veces en la foto — solo puntúan cartas diferentes.",
    dupWarnBust:"Si de verdad sacaste dos números iguales en tu turno, eso es un reventón — considera anotar 💀 Cero en vez de confirmar este puntaje.",
    noCardsAddFromPalette:"Sin cartas — agrega de la paleta",
    totalFinalCaps:"TOTAL FINAL",
    totalRoundCaps:"TOTAL DE ESTA RONDA",
    baseLbl:"Base:",
    modifiersCorrectCaps:"MODIFICADORES — toca para corregir",
    modifiersHaveCaps:"MODIFICADORES — toca si los tienes",
    modifiersPlayedCaps:"MODIFICADORES — si alguien te los jugo",
    onLbl:"ON",
    offLbl:"OFF",
    activeLbl:"ACTIVO",
    flip7UniqueCaps:"FLIP 7 — 7 CARTAS ÚNICAS",
    flip7DistinctCaps:"FLIP 7 — 7 CARTAS DISTINTAS",
    completeBonusActive:"¡Completo! Bonus activado",
    completeBonusAuto:"¡Completo! Bonus automático",
    missingForBonus:"Faltan {n} para el bonus",
    cardsWord:"cartas",
    actionCardsDetectedCaps:"CARTAS DE ACCIÓN DETECTADAS — toca para quitar si no aplica",
    actionCardsRegisterCaps:"CARTAS DE ACCION (registrar si las usaste)",
    addCardPaletteCaps:"➕ AGREGAR CARTA — toca para sumar",
    flip7CompletedMax:"🃏 ¡FLIP 7 COMPLETADO! Máximo de cartas alcanzado",
    youHavePrefix:"Tienes {a} + esta ronda {b} = {c}",
    repeatPhotoBtn2:"📷 Repetir foto",
    confirmPtsBtn:"✓ Confirmar {n} pts",
    confirmPtsVengBtn:"💀 Confirmar {n} pts",
    inclFlip7Bonus:" (incl. +15 Flip 7)",
    plusFlip7Bonus:" (+15 Flip 7)",
    exitWithoutScoring:"Salir sin anotar",
    zeroThisRound:"💀 Cero esta ronda",
    tapCardsInHand:"TOCA LAS CARTAS QUE TIENES EN MANO",
    tapCardsInHand113:"TOCA LAS CARTAS QUE TIENES (1-13)",
    selectCardsBtn:"Selecciona cartas",
    credentialsInvalid:"Credenciales del Árbitro inválidas. Contacta al admin.",
    refereeBusy:"El Árbitro está ocupado. Espera unos segundos e intenta de nuevo.",
    refereeBadFormat:"El Árbitro no devolvió un formato válido. Intenta de nuevo.",
    refereeConfused:"El Árbitro tuvo un momento confuso. Intenta de nuevo.",
    refereeNoCredentials:"El Árbitro no tiene credenciales.\nConfigura el proxy en Cloudflare Workers\no contacta al administrador.",
    couldntReadImage:"No se pudo leer esa imagen. Intenta con otra.",
    activeDivBtn:"Activo — solo tienes el 7. Agrega las cartas nuevas que te lleguen.",
    unlucky7Desc:"Te cayo Unlucky 7 — pierdes TODAS tus cartas. Solo te quedas con el 7. Puedes seguir acumulando cartas nuevas.",
    tapOnlyIfActivated:"tap solo si lo activaste por error",
    lucky13Caps:"LUCKY 13",
    unlucky7Caps:"UNLUCKY 7",
    lucky13Allow2:"Permite tener 2 cartas del 13 sin bustear",
    active2x13:"ACTIVO — 2x13",
    spentLbl:"gastado",
    flip7Bonus15Caps:"💀 FLIP 7 — BONUS +15",
    missingSlash7:"/7 · Faltan {n} para el bonus",
    completeAutoSlash7:"/7 · Bonus automatico",
    flip15Extra13:" (+13 extra Lucky 13)",
    correctionOf:"Corrección de",
    currentValueLbl:"valor actual:",
    pointsOf2:"Puntos de",
    thisRound2:"esta ronda",
    errorLbl:"ERROR",
    flip15BonusTip:"+ 15 FLIP 7 BONUS  (7 cartas únicas)",
    clrKey:"CLR",
    clrKeyClear:"CLR — Limpiar",
    saveCorrection:"GUARDAR CORRECCIÓN · ",
    confirmDot:"CONFIRMAR · ",
    statsMenuLbl:"Estadísticas",
    friendsMenuLbl:"Amigos",
    myGroupsMenuBtn:"👥 Mis grupos",
    gameInProgressRoomTpl:"Partida en curso · sala {code}",
    signOutConfirm:"¿Cerrar sesión?",
    signOutShortLbl:"salir",
    clearCacheLbl:"Limpiar caché",
    celWinnerLbl:"¡GANADOR!",
    celTieLbl:"¡EMPATE!",
    celExplosiveLbl:"¡VICTORIA EXPLOSIVA!",
    celExplosiveTieLbl:"¡EMPATE EXPLOSIVO!",
    celCrownedLbl:"¡CORONADO!",
    celCrownSharedLbl:"¡CORONA COMPARTIDA!",
    celJungleKingLbl:"¡REY DE LA SELVA!",
    celJungleSharedLbl:"¡SELVA COMPARTIDA!",
    celBeamingLbl:"¡RADIANTE!",
    celBeamingSharedLbl:"¡BRILLO COMPARTIDO!",
    celFireLbl:"¡EN LLAMAS!",
    celFireSharedLbl:"¡AMBOS EN LLAMAS!",
    celBicepsLbl:"¡PURA POTENCIA!",
    celBicepsSharedLbl:"¡FUERZA COMPARTIDA!",
    celHahahaLbl:"¡MUERTO DE RISA!",
    celHahahaSharedLbl:"¡RISA COMPARTIDA!",
    celRainbowLbl:"¡PURA MAGIA!",
    celRainbowSharedLbl:"¡MAGIA COMPARTIDA!",
    celSquintLbl:"¡TRAVIESO Y GANADOR!",
    celSquintSharedLbl:"¡TRAVESURA COMPARTIDA!",
    vpClose1:"¡Qué partidazo cerrado!",
    vpClose2:"Ganó por los pelos",
    vpClose3:"Victoria al filo de la navaja",
    vpClose4:"Casi un empate — qué emoción",
    vpClose5:"Se decidió en el último suspiro",
    vpSolid1:"Victoria sólida",
    vpSolid2:"Con margen de sobra",
    vpSolid3:"Dominó de principio a fin",
    vpSolid4:"Una ventaja clara",
    vpSolid5:"Se lo llevó con autoridad",
    vpCrush1:"¡Victoria aplastante!",
    vpCrush2:"Arrasó con todos",
    vpCrush3:"No hubo color",
    vpCrush4:"Un baño histórico",
    vpCrush5:"Nadie estuvo cerca",
    playersCapsHeader:"JUGADORES",
    manualModeLbl:"Manual",
    groupModeLbl:"Grupo",
    selectedCountWord:"seleccionados",
    onlineDotLbl:"● en línea",
    offlineDotLbl:"○ offline",
    viewScoreboardCaps:"VER MARCADOR",
    joinCapsLogo:"UNIRSE",
    roomCodeCapsLbl:"CÓDIGO DE SALA",
    yourNameCaps:"TU NOMBRE",
    searchingRoomLbl:"⏳ Buscando sala",
    joinGameCapsBtn:"🎮 UNIRME AL JUEGO",
    enterSpectatorBtn:"👁 ENTRAR COMO ESPECTADOR",
    alreadyConnectedLbl:"ya conectado",
    invitedYouToPlay:"te invitó a jugar!",
    gameInGroupTpl:"Partida en {group}!",
    notNowLbl:"Ahora no",
    need2PlayersErr:"Necesitas al menos 2 jugadores.",
    code4CharsErr:"Código de 4 caracteres.",
    enterNameErr:"Ingresa tu nombre.",
    roomNotFoundTpl:"Sala \"{code}\" no encontrada.",
    askAdminCodeStep:"Pide el código al admin",
    roomNoLongerExistsErr:"Esa sala ya no existe.",
    gameAlreadyEndedErr:"Esa partida ya terminó.",
    adminEndedGameNotice:"🚪 El admin terminó la partida",
    groupsFeatureLbl:"Grupos",
    yourGroupLbl:"tu grupo",
    sessionMetaLine:"{n} jugadores · {r} rondas · Sala {code}",
    liveSuffixWord:"LIVE",
    roomLiveTemplate:"SALA {code} · LIVE",
    liveScoreboardCaps:"📡 MARCADOR EN VIVO",
    roomRoundTemplate:"SALA {code} · RONDA {n}",
    missingPtsPctTemplate:"faltan {n} pts · {pct}%",
    roundWordBare:"ronda",
    roundWordBarePlural:"rondas",
    missingPtsTemplate:"faltan {n} pts",
    autoCloseHint:"⚡ Auto-cerrar ronda cuando todos terminen",
    editOtherRowLbl:"Editar fila de otro jugador",
    unlockedAutoRelock:"Desbloqueado — se bloquea solo después de usarlo",
    protectedRowHint:"Protegido — evita capturar por error la fila de alguien más",
    chooseNewAdminCaps:"ELEGIR NUEVO ADMIN — debe estar conectado ahora mismo",
    onlineDotWord:"● en línea",
    offlineSimple:"desconectado",
    endGameConfirmQ:"¿Terminar la partida para todos?",
    endGameConfirmDesc:"Todos los jugadores volverán al inicio. La sala no se borra.",
    yesEndGame:"Sí, terminar",
    adminCrownBadge:"👑 ADMIN",
    ptsAbbrev:"pts",
    readyBadge:"✓ LISTO",
    unlockBtn:"🔒 Desbloquear",
    scanIaBtn:"📷 Scan IA",
    cardsBtnCaps:"🃏 Cartas",
    manualBtn:"🧮 Manual",
    zeroBtn:"💀 Cero",
    rowProtectedTapHint:"Fila protegida — toca para desbloquear y capturar",
    waitingLower:"⏳ esperando",
    lobbyModeCaps:"SALA EN MODO LOBBY",
    shareCodeJoinHint:"Comparte este código para que los jugadores se unan",
    goalShortLabel:"META {n}",
    ptsGameOverTemplate:"{pts} PUNTOS · FIN DEL JUEGO",
    adminDisconnectedTitle:"⚠️ El admin se desconectó",
    adminReconnectHint:"La sala sigue activa — el admin puede reconectarse con el código {code}",
    playerDisconnectedHint:"ℹ️ Algún jugador está desconectado. Puede reconectarse con el código de sala.",
    missingOfTemplate:"Faltan {n} de {m}",
    ptsGoalTemplate:"{pts} PUNTOS · META A {target} PUNTOS",
    rematchSamePlayers:"🔁 REVANCHA · Mismos jugadores",
    waitingRematchAdmin:"⏳ Esperando revancha del admin...",
    errUnknown:"Error desconocido",
    rematchTitleCaps:"¡REVANCHA!",
    onTheWayCaps:"EN CAMINO",
    roundBadgeTemplate:"RONDA {n}",
    avgScoreLbl:"Prom. score",
    winsOfGamesLine:"{w} victorias de {g} partidas",
    tabRankingEmoji:"🏆 Ranking",
    tabGamesEmoji:"🎮 Partidas",
    statsLeaderRow:"{g} partidas · {pct}% victorias · mejor: {best}pts",
    posOfTotalTemplate:"#{p} de {n}",
    playersAbbrev:"jug.",
    roomInlineLower:"Sala {code}",
    roundsWord:"rondas",
    alreadyFriends:"Ya son amigos",
    requestAlreadySent:"Ya le enviaste una solicitud — espera a que responda",
    requestSentMsg:"✅ Solicitud enviada a {name}",
    errRemoveFriendPrefix:"Error al eliminar:",
    tabMe:"👤 Yo",
    tabHistory:"🎮 Historial",
    statLblWins:"Victorias",
    statLblGames:"Partidas",
    statLblBestScore:"Mejor score",
    statLblAvgGame:"Prom. partida",
    statLblFlip7s:"Flip 7s",
    statLblBusts:"Busts",
    winLossLine:"{w} victorias · {l} derrotas",
    winStreakCaps:"VICTORIAS SEGUIDAS",
    lossStreakCaps:"DERROTAS SEGUIDAS",
    comebackWord:"REMONTADA",
    comebackWordPlural:"REMONTADAS",
    modeClassicCaps:"CLÁSICO",
    modeVengCaps:"VENGANZA",
    gamesAbbrev:"P",
    shareInviteTitle:"¡Únete a Flip 7!",
    shareInviteText:"Agrégate como mi amigo en Flip 7 🃏",
    linkCopiedWhatsapp:"✅ Link copiado — pégalo en WhatsApp",
    pendingRequestsCaps:"🔴 SOLICITUDES PENDIENTES ({n})",
    playersCountPos:"{n} jugadores · pos #{p}",
    friendStatsLine:"{n} partidas · {pct}% wins · mejor: {best}pts · 🃏{flip7}",
    goalTargetPts:"🏆 META: {n} PUNTOS",
    gameWordPlural:"partidas",
    onlineWord:"Online",
    statusInGame:"🎮 En partida",
    statusInLobby:"🎴 En lobby",
    statusOnline:"🟢 Online",
    statusOffline:"Offline",
    grpShareText:"Únete a nuestro grupo Flip 7!",
    grpLinkCopied:"✅ Link copiado",
    grpJoinArrow:"Unirme →",
    grpYouTag:"tú",
    grpPlayNow:"Jugar ahora",
    grpPlayerWord:"jugador",
    grpPlayerWordPlural:"jugadores",
    grpMemberAdded:"{name} agregado al grupo",
    grpAddErr:"❌ Error al agregar",
    tabMyGroups:"Mis grupos",
    tabJoinGroup:"Unirme",
    grpMembersWord:"miembros",
    grpNameRequired:"Ponle nombre al grupo",
    grpCreatedMsg:"✅ Grupo creado — código: {code}",
    grpCodeRequired:"Código de 4 letras",
    grpNotFound:"Grupo no encontrado",
    grpAlreadyMember:"Ya eres miembro de este grupo",
    grpJoinedMsg:"✅ Te uniste a {name}",
    grpCreateRoomHint:"Crea una sala desde el menú principal y elige este grupo",
    grpMemberRemoved:"✅ Miembro eliminado del grupo",
    grpGroupDeleted:"✅ Grupo eliminado",
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
    players2:"PLAYERS",winner:"won",allReady:"Everyone ready! Close the round.",
    waitingHost:"Waiting for admin",waitingCaps:"⏳ Waiting for captures",
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
    correct:"✏️ Fix",
    // ── i18n EXTENSION (auto-generated) ──
    modeClassicDesc:"First to reach 200 points. 7 unique cards = +15 bonus.",
    modeClassicRules:["Goal: 200 points", "Duplicate card = bust (0 pts for the round)", "7 unique cards = +15 pt bonus + round ends", "Modifiers: x2, +2 to +10"],
    modeVenganzaDesc:"Same mechanics, cards 1-13, negative modifiers and inter-player action cards.",
    modeVenganzaRules:["Goal: 200 points", "Number cards: 1 to 13", "Bust on duplicate = 0 pts", "Flip 7 bonus = +15 pts", "NEGATIVE modifiers: -2,-4,-6,-8,-10,/2", "Order: Sum -> /2 -> -N -> min 0 -> +15", "Actions: Swap, Steal, Discard, Flip Four"],
    errOffline:"⚡ No connection.",
    errOfflineStep:"Check your internet",
    errPermission:"🔒 No Firebase permissions.",
    errPermissionStep:"Rules → \".read\":true,\".write\":true → Publish",
    errNetwork:"📡 Network error.",
    errNetworkStep:"Check your connection and try again",
    errGenericStep:"Reload the page",
    errGoogle:"Error with Google",
    errGoogleContinue:"Couldn't continue with Google",
    errEnterEmailPass:"Enter email and password",
    errRegisteredWithGoogle:"This email is already registered with Google. Sign in with Google.",
    errWrongCreds:"Wrong email or password",
    errLoginFailed:"Couldn't sign in",
    errEnterName:"Enter your name",
    errMinChars:"Minimum 6 characters",
    errEmailInUse:"This email already has an account — sign in from 'sign out' first",
    errSignupFailed:"Couldn't create account",
    errAnonDisabled:"Guest access is disabled",
    errAnonFailed:"Couldn't sign in as guest",
    guestLabel:"Guest",
    savedSessionMsg:"Saved for this session",
    errorPrefixLbl:"Error:",
    feedbackEmptyErr:"Write something before sending.",
    feedbackSendErr:"Couldn't send. Check your connection and try again.",
    providerNone:"No account",
    providerGoogle:"Google",
    providerPassword:"Email & password",
    providerAccount:"Account",
    agoNow:"just now",
    agoMin:"{n}min ago",
    agoH:"{n}h ago",
    agoD:"{n}d ago",
    locale:"en-US",
    loadingCaps:"LOADING...",
    gamePrefix:"Game",
    errBoundaryTitle:"Something went wrong",
    errBoundaryDesc:"The app had an unexpected error and can't continue on this screen.",
    reloadApp:"🔄 Reload app",
    loadingSlow:"This is taking longer than usual",
    reloadPage:"🔄 Reload page",
    exitBtn:"Exit",
    confirmSignOut:"Sign out?",
    roomLabelInline:"ROOM:",
    demoModeLbl:"DEMO MODE — local, no Firebase",
    connecting:"Connecting",
    modeLabelClassic:"Classic",
    modeLabelVenganza:"Vengeance",
    modeLbl:"Mode:",
    heroSubBrand:"FLIP 7 · UNOFFICIAL SCORETRACK",
    warnTitle:"WARNING FROM THE ADMIN",
    warnDefaultMsg:"You received a warning from the admin team. Please make sure your behavior follows the community rules.",
    warnCountMsg:"Total warnings: {n}. If this continues, your account may be suspended or blocked.",
    understood:"Got it",
    accBlockedTitle:"ACCOUNT BLOCKED",
    accSuspendedTitle:"ACCOUNT SUSPENDED",
    accBlockedDesc:"This account was blocked and can no longer use the app.",
    accSuspendedDesc:"This account is temporarily suspended and can't use the app right now.",
    accReason:"Reason:",
    accReturnDate:"You'll be able to log back in on {date}",
    accContact:"If you think this is a mistake, contact us from another account using the app's feedback box (⚙️ → Report bug / suggest).",
    signOutBtn:"Sign out",
    continueGoogle:"Continue with Google",
    waitingGoogle:"Waiting for Google…",
    continueEmail:"✉️ Continue with Email",
    waitLong:"This can take up to 40 seconds — don't close the window ({n}s)",
    tryOtherMethod:"Taking too long? Try this other method",
    orNoAccount:"OR NO ACCOUNT",
    playNoAccount:"👤 Play without an account",
    noAccountWarnHist:"Without an account your history isn't saved across devices",
    loginTab:"Log in",
    createAccount:"Create account",
    namePlaceholder:"Your name",
    emailPlaceholder:"Email",
    passwordPlaceholder:"Password (min. 6 characters)",
    waitingDots:"⏳ ...",
    loginBtn:"🎮 Log in",
    signupBtn:"🚀 Create account",
    createAccountFor:"Create your account to use {feature}",
    progressKept:"Your current progress stays the same — it just gets linked.",
    notNow:"Not now",
    profileTitle:"👤 PROFILE",
    guestSessionLabel:"NO ACCOUNT — temporary session",
    guestExplain:"You're playing without an account: none of this is saved permanently, it's only used while this browser session stays open. If you close the tab or use another device, it's lost.",
    anonNickLabel:"YOUR NICKNAME FOR THIS SESSION",
    anonNickPlaceholder:"How do you want to be seen in games?",
    useThisNick:"💾 Use this nickname",
    wantSaveAcrossDevices:"Want your emoji, color and stats saved across games and devices?",
    nickForGamesLabel:"YOUR NICKNAME FOR GAMES",
    nickForGamesDesc:"Used to pre-fill your name when creating a game, without changing your real {provider} name.",
    nickForGamesPlaceholder:"Your name in games",
    defaultEmojiLabel:"YOUR DEFAULT EMOJI",
    defaultAvatarLabel:"YOUR AVATAR",
    avatarNoneLabel:"None",
    avatarOverridesEmoji:"If you pick an avatar, it replaces your emoji in games. Pick \"None\" to go back to the emoji.",
    defaultColorLabel:"YOUR DEFAULT COLOR",
    celebrationLabel:"WIN CELEBRATION",
    celebrationDesc:"Only applies on YOUR screen when YOU are the winner. Other players still see their own random pick.",
    celebRandom:"Random",
    celebRandomSub:"Surprise every time (like before)",
    celebOriginal:"Original",
    celebOriginalSub:"Gold — classic confetti",
    celebExplosive:"Explosive Victory",
    celebExplosiveSub:"Teal / purple",
    celebCrowned:"Crowned",
    celebCrownedSub:"Light purple",
    celebJungle:"Jungle",
    celebJungleSub:"Green — leaves and drums",
    celebBeaming:"Beaming",
    celebBeamingSub:"Gold — huge grin",
    celebFire:"On Fire",
    celebFireSub:"Orange — intense flames",
    celebBiceps:"Pure Power",
    celebBicepsSub:"Lime — raw strength",
    celebHahaha:"Dying Laughing",
    celebHahahaSub:"Coral — total laughter",
    celebRainbow:"Rainbow",
    celebRainbowSub:"Multicolor — pure magic",
    celebSquint:"Cheeky",
    celebSquintSub:"Pink — playful wink",
    savingBtn:"⏳ Saving...",
    saveProfileBtn:"💾 Save profile",
    profileSaved:"✅ Profile saved",
    feedbackThanks:"Thanks!",
    feedbackThanksBug:"We've got it noted, we'll look into it soon.",
    feedbackThanksSuggestion:"Your idea has been saved, we'll consider it for future versions.",
    closeBtn:"Close",
    feedbackTitle:"🗳️ Score 7 Feedback Box",
    reportBug:"✍️ Report a bug",
    suggestGame:"💡 Suggest a game",
    whichScreen:"WHICH SCREEN?",
    whatErrorType:"WHAT TYPE OF ERROR?",
    feedbackBugPlaceholder:"Tell us what happened and what you expected to happen...",
    feedbackSuggestPlaceholder:"What game or feature would you like to see in the app?",
    attachScreenshot:"📎 Attach a screenshot (optional)",
    screenshotAttached:"Screenshot attached",
    sendingAs:"Sending as:",
    sendBtn:"Send",
    sendingBtn:"Sending...",
    noNameLabel:"No name",
    anonPlayerLabel:"Anonymous player (no account)",
    fsHome:"🏠 Home",
    fsCreate:"➕ Create room",
    fsJoin:"🔑 Join a room",
    fsRound:"🎲 Round / Scoreboard",
    fsTable:"📋 Round table",
    fsSpectator:"📺 Live scoreboard (spectator)",
    fsScanner:"📷 Card scanner (AI)",
    fsStats:"📊 Stats",
    fsProfile:"👤 Profile",
    fsGroups:"👥 Groups",
    fsOther:"❓ Other / not sure",
    fcCrash:"🖤 Screen went black / crashed",
    fcNotSaved:"💾 My score wasn't saved",
    fcAi:"🤖 The card scanner (AI) failed",
    fcConnection:"📡 Couldn't join or connect to the room",
    fcVisual:"🎨 Something looks wrong (visual)",
    fcOther:"❓ Other",
    someoneStarted:"Someone already started playing — join now",
    joinNowBtn:"✅ Join",
    gameModeLabel:"GAME MODE",
    requiresManual:"📋 Requires official manual",
    howItWorks:"HOW IT WORKS",
    ruleClassicCards:"Cards 0–12",
    ruleClassicCardsDesc:" · add up the values in your hand.",
    ruleDupTitle:"Duplicate card",
    ruleDupDesc:" = bust, zero pts for the round.",
    ruleFlip7Title:"Flip 7",
    ruleFlip7Desc:": 7 unique cards = +15 pt bonus + round ends.",
    ruleModTitle:"Modifiers:",
    ruleModDesc:" ×2, +2 to +10 on top of your sum.",
    ruleGoalDesc:" · first to reach it wins.",
    ruleVengCards:"Cards 0–13",
    ruleVengCardsDesc:" · includes specials: Zero, Unlucky 7, Lucky 13.",
    ruleVengDupTitle:"Duplicate",
    ruleVengDupDesc:" = bust · Unlucky 7 = you lose your cards, only the 7 stays.",
    ruleVengModTitle:"Negative modifiers",
    ruleVengModDesc:" (played on you): ÷2, −2 to −10.",
    ruleVengActionsTitle:"Actions:",
    ruleVengActionsDesc:" Swap, Steal, Discard, Flip Four, Just One More.",
    goalPointsLabel:"POINT GOAL",
    standardLbl:"STANDARD",
    autoCloseRound:"⚡ Auto-close round when everyone finishes",
    canChangeLater:"You can change this later, inside the game",
    nextArrow:"Next →",
    backToGameType:"← Game type",
    noFriendsYet:"You haven't added any friends yet",
    selectAll:"All",
    selectNone:"None",
    useSelected:"✅ Use selected",
    noGroupsYet:"You don't have any groups yet",
    groupsAvailable:"AVAILABLE GROUPS",
    tapToIncludeExclude:"Tap each member to include or exclude them from this game.",
    activeRoomFound:"ACTIVE ROOM FOUND",
    codeLabelInline:"Code:",
    reconnectAdmin:"⚡ Reconnect as Admin",
    ignoreBtn:"Ignore",
    roomCodeTitle:"Room code",
    idealForTablet:"💡 Great for leaving open on a tablet or screen in the middle of the table — everyone sees scores update live, no one has to pass the phone around.",
    joinNamePlaceholder:"Your name in the game",
    spectatorOnlyLbl:"VIEW SCOREBOARD ONLY",
    choosePlayerHint:"Choose your character. Those marked \"In room\" are already connected.",
    choosePlayerLbl:"CHOOSE YOUR PLAYER",
    inRoomTag:"In room",
    joinAsNewLbl:"OR JOIN AS A NEW PLAYER",
    newPlayerNamePlaceholder:"New player's name",
    addNewPlayerBtn:"➕ ADD NEW PLAYER",
    moreOptionsAria:"More options",
    profileMenuItem:"👤 Profile",
    reportBugMenuItem:"🗳️ Report bug / suggest",
    changeAccount:"Switch account",
    anonExpireWarn:"⚠ Anonymous sessions are deleted after 30 days of inactivity",
    spectatorMenuItem:"👁 Spectator",
    joinArrow:"Join →",
    waitingRematch:"⏳ Waiting for the admin's rematch...",
    adminDisconnected:"⚠️ The admin disconnected",
    playerDisconnectedInfo:"ℹ️ A player is disconnected. They can reconnect with the room code.",
    transferAdmin:"🔁 Transfer admin",
    endGameBtn2:"🛑 End game",
    chooseNewAdmin:"CHOOSE NEW ADMIN — must be connected right now",
    confirmEndGame:"End the game for everyone?",
    endGameDesc:"All players will return to the home screen. The room isn't deleted.",
    yesEndGame:"Yes, end it",
    youLbl:"you",
    adminBadge:"👑 ADMIN",
    ptsLbl:"pts",
    readyBtn:"✓ READY",
    unlockBtn:"🔒 Unlock",
    scanAiBtn:"📷 AI Scan",
    cardsBtn:"🃏 Cards",
    manualBtn:"🧮 Manual",
    zeroBtn:"💀 Zero",
    lockedRowHint:"Row locked — tap to unlock and capture",
    waitingDots2:"⏳ waiting",
    lobbyModeLbl:"ROOM IN LOBBY MODE",
    shareCodeToJoin:"Share this code so players can join",
    colPlayer:"Player",
    colTotal:"Total",
    scoreboardTitle:"SCOREBOARD",
    liveCaps:"LIVE",
    roomCapsInline:"ROOM",
    seeScoreboard:"🏆 See final scoreboard",
    clearHistoryConfirmTitle:"🗑 Clear history",
    demoTag:"DEMO",
    groupsTitle:"GROUPS",
    groupsLoginPrompt:"Create an account to make groups with your friends, see who's online and play together every week.",
    backToGroups:"← Groups",
    inviteBtn:"🔗 Invite",
    confirmReq:"Confirm",
    deleteGroupTitle:"Delete group",
    gameInProgress:"GAME IN PROGRESS",
    membersLbl:"MEMBERS",
    tapToIncludeHint:"TAP WHO'S PLAYING · ANYONE CAN JOIN LATER",
    adminLbl:"ADMIN",
    tapToIncludeShort:"tap to include",
    yesLbl:"Yes",
    noLbl:"No",
    deleteMemberTitle:"Remove from group",
    addFriendsToGroup:"ADD FRIENDS TO THE GROUP",
    addBtn:"+ Add",
    backToGroupsLong:"← Back to Groups",
    groupsCapsTitle:"👥 GROUPS",
    noGroupsYet2:"No groups yet",
    createGroupHint:"Create a group to play with the same friends every week using the same code",
    inGameTag:"🎮 IN GAME",
    groupNameLbl:"GROUP NAME",
    groupNamePlaceholder:"e.g. Thursday Crew 🎴",
    createGroupBtn:"🎮 Create group",
    newGroupBtn:"+ Create new group",
    groupCodeLbl:"GROUP CODE",
    joinGroupBtn:"👥 Join the group",
    askGroupCode:"Ask the group's admin for the 4-letter code",
    calendarLbl:"📅 CALENDAR",
    thisMonthSuffix:"this month",
    lessLbl:"less",
    moreLbl:"more",
    comparingLbl:"Comparing…",
    neverPlayedTogether:"You haven't played together in the same game yet",
    youAllCaps:"YOU",
    vsLbl:"vs",
    gameWord:"game",
    togetherSuffix:"together",
    dateColLbl:"Date",
    youCol:"You",
    posAbbrev:"pos.",
    loadingRoundsTable:"Loading round table…",
    guestModeLbl:"Guest mode",
    createAccountStatsHint:"Create an account to save your stats, see your history and add friends.",
    createAccountLoginBtn:"Create account / Log in",
    noGamesYetLong:"No games recorded yet",
    playFirstGameHint:"Play your first game to see your stats",
    winRateLbl:"WIN RATE",
    flip7PerGame:"FLIP 7 PER GAME",
    bustPerGame:"BUST PER GAME",
    bestStreak:"BEST STREAK",
    cardsPerRound:"CARDS PER ROUND",
    luckyCard:"LUCKY CARD",
    bustsInARow:"BUSTS IN A ROW",
    needAccountFriends:"You need an account to add friends",
    inviteFriendCaps:"INVITE A FRIEND",
    shareLinkDesc:"Share your link — when your friend opens it, they'll be automatically connected with you.",
    shareInviteLinkBtn:"🔗 Share invite link",
    searchByNameEmail:"OR SEARCH BY NAME / EMAIL (2+ letters)",
    searchNameEmailPlaceholder:"Type a name or email…",
    searchingLbl:"Searching…",
    requestSentBtn:"+ REQUEST",
    noResults:"No results",
    wantsToBeFriend:"wants to be your friend",
    acceptBtn:"✓ Accept",
    noFriendsYetAdd:"No friends yet — add your fellow players",
    noGamesYetShort:"No games yet",
    winsLbl:"WINS",
    compareHeadToHead:"Compare head to head",
    deleteFriendTitle:"Remove friend",
    noGamesRegisteredYet:"No games registered yet",
    vengeanceTag:"💀 VENGEANCE",
    ptsTotalLbl:"pts total",
    backToMenu:"← Back to menu",
    historyOfGames:"GAME HISTORY",
    noHistoryYet:"No history yet",
    backToRanking:"← Back to ranking",
    statsCapsTitle:"📊 STATS",
    flip7RaceTo200:"FLIP 7 · RACE TO 200",
    loadingStats:"Loading stats...",
    completeGameForRanking:"Complete a game to see the ranking",
    noStatsYet:"No stats yet",
    winsTrophy:"🏆 wins",
    weekdayLetters:["S", "M", "T", "W", "T", "F", "S"],
    heroPhrases:["FLIP. ADD. WIN.", "PLAY IT SAFE OR PUSH IT?", "NO REPEATS, NO BUST", "EVERY CARD COUNTS", "THE DICE ARE ROLLED", "RACE TO THE FINISH"],
    scanTitle2:"🃏 Card Referee",
    myCardsTitle:"🃏 My cards",
    myCardsVengTitle:"💀 My cards",
    manualCorrectTitle:"✏️ Fix score",
    manualCaptureTitle:"🧮 Manual Entry",
    loadingDots:"Loading...",
    tapOpenCamera:"Tap to open the camera",
    aimCardsHint:"Point at your cards and take a photo",
    orChooseGallery:"or choose from gallery",
    verticalPhotoDetected:"📱 Vertical photo detected",
    verticalPhotoDesc:"The Referee reads cards better in landscape. It's not perfect with vertical photos — rotate it before analyzing.",
    rotatePhotoBtn:"🔄 Rotate photo",
    allCardsVisible:"Can you see all the cards clearly?",
    refereeSupreme:"🃏 The Card Referee™ · Supreme Judge of the Deck",
    anotherPhotoBtn:"📷 Another photo",
    analyzeBtn:"🔍 Analyze",
    refereeAnalyzing:"The Referee is checking the cards...",
    retryBtn:"Retry",
    cardsDetectedCaps:"DETECTED CARDS — tap to remove",
    dupWarnPrefix:"appear twice in the photo — only different cards score.",
    dupWarnBust:"If you really drew two matching numbers on your turn, that's a bust — consider marking 💀 Zero instead of confirming this score.",
    noCardsAddFromPalette:"No cards — add from the palette",
    totalFinalCaps:"FINAL TOTAL",
    totalRoundCaps:"TOTAL FOR THIS ROUND",
    baseLbl:"Base:",
    modifiersCorrectCaps:"MODIFIERS — tap to fix",
    modifiersHaveCaps:"MODIFIERS — tap if you have them",
    modifiersPlayedCaps:"MODIFIERS — if someone played them on you",
    onLbl:"ON",
    offLbl:"OFF",
    activeLbl:"ACTIVE",
    flip7UniqueCaps:"FLIP 7 — 7 UNIQUE CARDS",
    flip7DistinctCaps:"FLIP 7 — 7 DIFFERENT CARDS",
    completeBonusActive:"Complete! Bonus activated",
    completeBonusAuto:"Complete! Automatic bonus",
    missingForBonus:"{n} more needed for the bonus",
    cardsWord:"cards",
    actionCardsDetectedCaps:"DETECTED ACTION CARDS — tap to remove if it doesn't apply",
    actionCardsRegisterCaps:"ACTION CARDS (log if you used them)",
    addCardPaletteCaps:"➕ ADD CARD — tap to add",
    flip7CompletedMax:"🃏 FLIP 7 COMPLETE! Max cards reached",
    youHavePrefix:"You have {a} + this round {b} = {c}",
    repeatPhotoBtn2:"📷 Retake photo",
    confirmPtsBtn:"✓ Confirm {n} pts",
    confirmPtsVengBtn:"💀 Confirm {n} pts",
    inclFlip7Bonus:" (incl. +15 Flip 7)",
    plusFlip7Bonus:" (+15 Flip 7)",
    exitWithoutScoring:"Exit without scoring",
    zeroThisRound:"💀 Zero this round",
    tapCardsInHand:"TAP THE CARDS IN YOUR HAND",
    tapCardsInHand113:"TAP THE CARDS YOU HAVE (1-13)",
    selectCardsBtn:"Select cards",
    credentialsInvalid:"Referee credentials are invalid. Contact the admin.",
    refereeBusy:"The Referee is busy. Wait a few seconds and try again.",
    refereeBadFormat:"The Referee didn't return a valid format. Try again.",
    refereeConfused:"The Referee got confused for a moment. Try again.",
    refereeNoCredentials:"The Referee has no credentials.\nSet up the proxy in Cloudflare Workers\nor contact the admin.",
    couldntReadImage:"Couldn't read that image. Try another one.",
    activeDivBtn:"Active — you only have the 7. Add new cards as you draw them.",
    unlucky7Desc:"You drew Unlucky 7 — you lose ALL your cards. You only keep the 7. You can keep drawing new cards.",
    tapOnlyIfActivated:"tap only if you activated it by mistake",
    lucky13Caps:"LUCKY 13",
    unlucky7Caps:"UNLUCKY 7",
    lucky13Allow2:"Lets you hold 2 copies of the 13 without busting",
    active2x13:"ACTIVE — 2x13",
    spentLbl:"spent",
    flip7Bonus15Caps:"💀 FLIP 7 — BONUS +15",
    missingSlash7:"/7 · {n} more for the bonus",
    completeAutoSlash7:"/7 · Automatic bonus",
    flip15Extra13:" (+13 extra Lucky 13)",
    correctionOf:"Correcting",
    currentValueLbl:"current value:",
    pointsOf2:"Points for",
    thisRound2:"this round",
    errorLbl:"ERROR",
    flip15BonusTip:"+ 15 FLIP 7 BONUS  (7 unique cards)",
    clrKey:"CLR",
    clrKeyClear:"CLR — Clear",
    saveCorrection:"SAVE CORRECTION · ",
    confirmDot:"CONFIRM · ",
    statsMenuLbl:"Stats",
    friendsMenuLbl:"Friends",
    myGroupsMenuBtn:"👥 My groups",
    gameInProgressRoomTpl:"Game in progress · room {code}",
    signOutConfirm:"Sign out?",
    signOutShortLbl:"sign out",
    clearCacheLbl:"Clear cache",
    celWinnerLbl:"WINNER!",
    celTieLbl:"TIE!",
    celExplosiveLbl:"EXPLOSIVE VICTORY!",
    celExplosiveTieLbl:"EXPLOSIVE TIE!",
    celCrownedLbl:"CROWNED!",
    celCrownSharedLbl:"SHARED CROWN!",
    celJungleKingLbl:"KING OF THE JUNGLE!",
    celJungleSharedLbl:"SHARED JUNGLE!",
    celBeamingLbl:"BEAMING!",
    celBeamingSharedLbl:"SHARED GLOW!",
    celFireLbl:"ON FIRE!",
    celFireSharedLbl:"BOTH ON FIRE!",
    celBicepsLbl:"PURE POWER!",
    celBicepsSharedLbl:"SHARED STRENGTH!",
    celHahahaLbl:"DYING LAUGHING!",
    celHahahaSharedLbl:"SHARED LAUGHS!",
    celRainbowLbl:"PURE MAGIC!",
    celRainbowSharedLbl:"SHARED MAGIC!",
    celSquintLbl:"CHEEKY WINNER!",
    celSquintSharedLbl:"SHARED MISCHIEF!",
    vpClose1:"What a close game!",
    vpClose2:"Won by a hair",
    vpClose3:"A razor-thin victory",
    vpClose4:"Almost a tie — what a thrill",
    vpClose5:"Decided in the final breath",
    vpSolid1:"Solid victory",
    vpSolid2:"With plenty of room to spare",
    vpSolid3:"Dominated from start to finish",
    vpSolid4:"A clear advantage",
    vpSolid5:"Took it with authority",
    vpCrush1:"Crushing victory!",
    vpCrush2:"Steamrolled everyone",
    vpCrush3:"It wasn't even close",
    vpCrush4:"A historic blowout",
    vpCrush5:"No one came close",
    playersCapsHeader:"PLAYERS",
    manualModeLbl:"Manual",
    groupModeLbl:"Group",
    selectedCountWord:"selected",
    onlineDotLbl:"● online",
    offlineDotLbl:"○ offline",
    viewScoreboardCaps:"VIEW SCOREBOARD",
    joinCapsLogo:"JOIN",
    roomCodeCapsLbl:"ROOM CODE",
    yourNameCaps:"YOUR NAME",
    searchingRoomLbl:"⏳ Searching room",
    joinGameCapsBtn:"🎮 JOIN GAME",
    enterSpectatorBtn:"👁 ENTER AS SPECTATOR",
    alreadyConnectedLbl:"already connected",
    invitedYouToPlay:"invited you to play!",
    gameInGroupTpl:"Game in {group}!",
    notNowLbl:"Not now",
    need2PlayersErr:"You need at least 2 players.",
    code4CharsErr:"4-character code.",
    enterNameErr:"Enter your name.",
    roomNotFoundTpl:"Room \"{code}\" not found.",
    askAdminCodeStep:"Ask the admin for the code",
    roomNoLongerExistsErr:"That room no longer exists.",
    gameAlreadyEndedErr:"That game already ended.",
    adminEndedGameNotice:"🚪 The admin ended the game",
    groupsFeatureLbl:"Groups",
    yourGroupLbl:"your group",
    sessionMetaLine:"{n} players · {r} rounds · Room {code}",
    liveSuffixWord:"LIVE",
    roomLiveTemplate:"ROOM {code} · LIVE",
    liveScoreboardCaps:"📡 LIVE SCOREBOARD",
    roomRoundTemplate:"ROOM {code} · ROUND {n}",
    missingPtsPctTemplate:"{n} pts left · {pct}%",
    roundWordBare:"round",
    roundWordBarePlural:"rounds",
    missingPtsTemplate:"{n} pts left",
    autoCloseHint:"⚡ Auto-close round when everyone's done",
    editOtherRowLbl:"Edit another player's row",
    unlockedAutoRelock:"Unlocked — locks itself again after one use",
    protectedRowHint:"Protected — prevents accidentally capturing another player's row",
    chooseNewAdminCaps:"CHOOSE NEW ADMIN — must be online right now",
    onlineDotWord:"● online",
    offlineSimple:"offline",
    endGameConfirmQ:"End the game for everyone?",
    endGameConfirmDesc:"All players will return to the home screen. The room isn't deleted.",
    yesEndGame:"Yes, end it",
    adminCrownBadge:"👑 ADMIN",
    ptsAbbrev:"pts",
    readyBadge:"✓ READY",
    unlockBtn:"🔒 Unlock",
    scanIaBtn:"📷 AI Scan",
    cardsBtnCaps:"🃏 Cards",
    manualBtn:"🧮 Manual",
    zeroBtn:"💀 Zero",
    rowProtectedTapHint:"Row protected — tap to unlock and capture",
    waitingLower:"⏳ waiting",
    lobbyModeCaps:"ROOM IN LOBBY MODE",
    shareCodeJoinHint:"Share this code so players can join",
    goalShortLabel:"GOAL {n}",
    ptsGameOverTemplate:"{pts} POINTS · GAME OVER",
    adminDisconnectedTitle:"⚠️ The admin disconnected",
    adminReconnectHint:"The room is still active — the admin can reconnect with the code {code}",
    playerDisconnectedHint:"ℹ️ A player got disconnected. They can reconnect with the room code.",
    missingOfTemplate:"{n} of {m} left",
    ptsGoalTemplate:"{pts} POINTS · GOAL {target} POINTS",
    rematchSamePlayers:"🔁 REMATCH · Same players",
    waitingRematchAdmin:"⏳ Waiting for the admin's rematch...",
    errUnknown:"Unknown error",
    rematchTitleCaps:"REMATCH!",
    onTheWayCaps:"ON THE WAY",
    roundBadgeTemplate:"ROUND {n}",
    avgScoreLbl:"Avg. score",
    winsOfGamesLine:"{w} wins out of {g} games",
    tabRankingEmoji:"🏆 Ranking",
    tabGamesEmoji:"🎮 Games",
    statsLeaderRow:"{g} games · {pct}% wins · best: {best}pts",
    posOfTotalTemplate:"#{p} of {n}",
    playersAbbrev:"pl.",
    roomInlineLower:"Room {code}",
    roundsWord:"rounds",
    alreadyFriends:"You're already friends",
    requestAlreadySent:"You already sent a request — wait for a reply",
    requestSentMsg:"✅ Request sent to {name}",
    errRemoveFriendPrefix:"Error removing:",
    tabMe:"👤 Me",
    tabHistory:"🎮 History",
    statLblWins:"Wins",
    statLblGames:"Games",
    statLblBestScore:"Best score",
    statLblAvgGame:"Avg. per game",
    statLblFlip7s:"Flip 7s",
    statLblBusts:"Busts",
    winLossLine:"{w} wins · {l} losses",
    winStreakCaps:"WIN STREAK",
    lossStreakCaps:"LOSS STREAK",
    comebackWord:"COMEBACK",
    comebackWordPlural:"COMEBACKS",
    modeClassicCaps:"CLASSIC",
    modeVengCaps:"VENGEANCE",
    gamesAbbrev:"G",
    shareInviteTitle:"Join Flip 7!",
    shareInviteText:"Add me as a friend on Flip 7 🃏",
    linkCopiedWhatsapp:"✅ Link copied — paste it on WhatsApp",
    pendingRequestsCaps:"🔴 PENDING REQUESTS ({n})",
    playersCountPos:"{n} players · pos #{p}",
    friendStatsLine:"{n} games · {pct}% wins · best: {best}pts · 🃏{flip7}",
    goalTargetPts:"🏆 GOAL: {n} POINTS",
    gameWordPlural:"games",
    onlineWord:"Online",
    statusInGame:"🎮 In a game",
    statusInLobby:"🎴 In lobby",
    statusOnline:"🟢 Online",
    statusOffline:"Offline",
    grpShareText:"Join our Flip 7 group!",
    grpLinkCopied:"✅ Link copied",
    grpJoinArrow:"Join →",
    grpYouTag:"you",
    grpPlayNow:"Play now",
    grpPlayerWord:"player",
    grpPlayerWordPlural:"players",
    grpMemberAdded:"{name} added to the group",
    grpAddErr:"❌ Error adding",
    tabMyGroups:"My groups",
    tabJoinGroup:"Join",
    grpMembersWord:"members",
    grpNameRequired:"Give the group a name",
    grpCreatedMsg:"✅ Group created — code: {code}",
    grpCodeRequired:"4-letter code",
    grpNotFound:"Group not found",
    grpAlreadyMember:"You're already a member of this group",
    grpJoinedMsg:"✅ You joined {name}",
    grpCreateRoomHint:"Create a room from the main menu and pick this group",
    grpMemberRemoved:"✅ Member removed from group",
    grpGroupDeleted:"✅ Group deleted",
  },
  pt:{
    appTag:"Primeiro a chegar a 200 vence!",
    createGame:"CRIAR NOVO JOGO",
    joinGame:"ENTRAR COM CÓDIGO",
    recentSessions:"ÚLTIMAS SESSÕES",
    createRoom:"CRIAR SALA",
    newGame:"Novo jogo",
    players:"JOGADORES",
    addPlayer:"Adicionar jogador",
    creating:"⏳ Criando sala",
    create:"🚀 CRIAR SALA",
    back:"← Voltar",
    join:"ENTRAR",
    roomCode:"CÓDIGO DA SALA",
    yourName:"SEU NOME",
    joinBtn:"🎮 ENTRAR NO JOGO",
    joining:"⏳ Conectando",
    spectator:"MODO ESPECTADOR",
    spectatorDesc:"Só ver o placar, sem controles",
    spectatorBtn:"👁 ENTRAR COMO ESPECTADOR",
    round:"🎴 Rodada",
    table:"📊 Tabela",
    history:"📋 Histórico",
    players2:"JOGADORES",
    winner:"venceu",
    allReady:"Todos prontos! Feche a rodada.",
    waitingHost:"Esperando o admin",
    waitingCaps:"⏳ Esperando capturas",
    closeRound:"🔒 FECHAR RODADA",
    rematch:"🔁 REVANCHE",
    endGame:"🚪 Encerrar",
    ranking:"CLASSIFICAÇÃO",
    rounds2:"TABELA DE RODADAS",
    goal:"META: 200 PONTOS",
    noSessions:"Ainda sem sessões",
    noSessionsDesc:"Complete uma partida para vê-la aqui",
    clearHistory:"🗑 Apagar histórico",
    confirmClear:"Apagar todo o histórico?",
    finalRanking:"CLASSIFICAÇÃO FINAL",
    scanTitle:"🃏 Árbitro de Cartas",
    turnOf:"Turno de:",
    geminiReady:"✅ Gemini 2.5 Flash Ativo",
    geminiDesc:"IA incluída — Pronta para usar",
    geminiLoading:"⏳ Carregando configuração",
    geminiLoadDesc:"A chave carrega automaticamente",
    changeKey:"Mudar IA ou chave (opcional):",
    tapCamera:"Toque para abrir a câmera",
    tapHint:"Aponte para suas cartas e tire uma foto",
    orGallery:"ou escolher da galeria",
    goodCards:"Dá para ver todas as cartas claramente?",
    modeNotice:"⚡ Só números base — ajuste depois",
    anotherPhoto:"📷 Outra foto",
    analyze:"🔍 Analisar",
    analyzing:"Analisando com",
    cardsDetected:"CARTAS DETECTADAS — toque ✕ para remover",
    totalLabel:"TOTAL FINAL",
    modifiers:"MODIFICADORES — toque para aplicar",
    addCard:"➕ ADICIONAR CARTA",
    whatNum:"QUE NÚMERO? (0-12)",
    cancel:"Cancelar",
    add:"✓ Adicionar",
    repeatPhoto:"📷 Repetir foto",
    confirm:"✓ Confirmar",
    manualTitle:"🧮 Entrada Manual",
    pointsOf:"Pontos de",
    thisRound:"esta rodada",
    winner2:"Vencedor!",
    winners:"VENCEDORES",
    ptsEach:"PONTOS CADA UM",
    newGame2:"🔁 REVANCHE",
    seeFinal:"Ver placar final",
    liveBoard:"📡 PLACAR AO VIVO",
    autoUpdate:"ATUALIZA AUTOMATICAMENTE · META 200 PTS",
    roundProgress:"AVANÇO POR RODADAS",
    codeLabel:"SALA",
    correct:"✏️ Corrigir",

    // ── EXTENSIÓN i18n (auto-generada) ──
    modeClassicDesc:"Primeiro a chegar a 200 pontos. 7 cartas únicas = +15 de bônus.",
    modeClassicRules:["Meta: 200 pontos", "Carta duplicada = estourou (0 pts na rodada)", "7 cartas únicas = +15 pts de bônus + fim da rodada", "Modificadores: x2, +2 a +10"],
    modeVenganzaDesc:"Mesma mecânica, cartas 1-13, modificadores negativos e cartas de ação entre jogadores.",
    modeVenganzaRules:["Meta: 200 pontos", "Cartas numéricas: 1 a 13", "Estourou por duplicata = 0 pts", "Bônus Flip 7 = +15 pts", "Modificadores NEGATIVOS: -2,-4,-6,-8,-10,/2", "Ordem: Soma -> /2 -> -N -> mín 0 -> +15", "Ações: Swap, Steal, Discard, Flip Four"],
    errOffline:"⚡ Sem conexão.",
    errOfflineStep:"Verifique sua internet",
    errPermission:"🔒 Sem permissões do Firebase.",
    errPermissionStep:"Regras → \".read\":true,\".write\":true → Publicar",
    errNetwork:"📡 Erro de rede.",
    errNetworkStep:"Verifique a conexão e tente novamente",
    errGenericStep:"Recarregue a página",
    errGoogle:"Erro com o Google",
    errGoogleContinue:"Não foi possível continuar com o Google",
    errEnterEmailPass:"Digite email e senha",
    errRegisteredWithGoogle:"Este email já está registrado com o Google. Entre com o Google.",
    errWrongCreds:"Email ou senha incorretos",
    errLoginFailed:"Não foi possível entrar",
    errEnterName:"Digite seu nome",
    errMinChars:"Mínimo de 6 caracteres",
    errEmailInUse:"Este email já tem uma conta — entre a partir de 'sair' primeiro",
    errSignupFailed:"Erro ao criar conta",
    errAnonDisabled:"O acesso como convidado está desabilitado",
    errAnonFailed:"Não foi possível entrar como convidado",
    guestLabel:"Convidado",
    savedSessionMsg:"Salvo para esta sessão",
    errorPrefixLbl:"Erro:",
    feedbackEmptyErr:"Escreva algo antes de enviar.",
    feedbackSendErr:"Não foi possível enviar. Verifique sua conexão e tente novamente.",
    providerNone:"Sem conta",
    providerGoogle:"Google",
    providerPassword:"E-mail e senha",
    providerAccount:"Conta",
    agoNow:"agora mesmo",
    agoMin:"há {n}min",
    agoH:"há {n}h",
    agoD:"há {n}d",
    locale:"pt-BR",
    loadingCaps:"CARREGANDO...",
    gamePrefix:"Partida",
    errBoundaryTitle:"Algo deu errado",
    errBoundaryDesc:"O app teve um erro inesperado e não pode continuar nesta tela.",
    reloadApp:"🔄 Recarregar o app",
    loadingSlow:"Isso está demorando mais que o normal",
    reloadPage:"🔄 Recarregar página",
    exitBtn:"Sair",
    confirmSignOut:"Sair da conta?",
    roomLabelInline:"SALA:",
    demoModeLbl:"MODO DEMO — local, sem Firebase",
    connecting:"Conectando",
    modeLabelClassic:"Clássico",
    modeLabelVenganza:"Vingança",
    modeLbl:"Modo:",
    heroSubBrand:"FLIP 7 · UNOFFICIAL SCORETRACK",
    warnTitle:"AVISO DO ADMINISTRADOR",
    warnDefaultMsg:"Você recebeu um aviso da equipe de administração. Revise se o seu comportamento segue as regras da comunidade.",
    warnCountMsg:"Avisos acumulados: {n}. Se continuar, sua conta pode ser suspensa ou bloqueada.",
    understood:"Entendi",
    accBlockedTitle:"CONTA BLOQUEADA",
    accSuspendedTitle:"CONTA SUSPENSA",
    accBlockedDesc:"Esta conta foi bloqueada e não pode mais usar o app.",
    accSuspendedDesc:"Esta conta está suspensa temporariamente e não pode usar o app no momento.",
    accReason:"Motivo:",
    accReturnDate:"Você poderá entrar novamente em {date}",
    accContact:"Se você acha que isso é um erro, entre em contato conosco a partir de outra conta usando a caixa de sugestões do app (⚙️ → Reportar bug / sugerir).",
    signOutBtn:"Sair da conta",
    continueGoogle:"Continuar com o Google",
    waitingGoogle:"Aguardando o Google…",
    continueEmail:"✉️ Continuar com E-mail",
    waitLong:"Pode levar até 40 segundos — não feche a janela ({n}s)",
    tryOtherMethod:"Demorando muito? Experimente este outro método",
    orNoAccount:"OU SEM CONTA",
    playNoAccount:"👤 Jogar sem conta",
    noAccountWarnHist:"Sem conta, seu histórico não é salvo entre dispositivos",
    loginTab:"Entrar",
    createAccount:"Criar conta",
    namePlaceholder:"Seu nome",
    emailPlaceholder:"E-mail",
    passwordPlaceholder:"Senha (mín. 6 caracteres)",
    waitingDots:"⏳ ...",
    loginBtn:"🎮 Entrar",
    signupBtn:"🚀 Criar conta",
    createAccountFor:"Crie sua conta para usar {feature}",
    progressKept:"Seu progresso atual continua igual — só é vinculado.",
    notNow:"Agora não",
    profileTitle:"👤 PERFIL",
    guestSessionLabel:"SEM CONTA — sessão temporária",
    guestExplain:"Você está jogando sem conta: nada disso é salvo permanentemente, só é usado enquanto esta sessão do navegador ficar aberta. Se você fechar a aba ou entrar de outro dispositivo, isso se perde.",
    anonNickLabel:"SEU APELIDO PARA ESTA SESSÃO",
    anonNickPlaceholder:"Como você quer ser visto nas partidas?",
    useThisNick:"💾 Usar este apelido",
    wantSaveAcrossDevices:"Quer que seu emoji, cor e estatísticas sejam salvos entre partidas e dispositivos?",
    nickForGamesLabel:"SEU APELIDO PARA AS PARTIDAS",
    nickForGamesDesc:"Usado para preencher seu nome ao criar uma partida, sem precisar mudar seu nome real do {provider}.",
    nickForGamesPlaceholder:"Seu nome nas partidas",
    defaultEmojiLabel:"SEU EMOJI PADRÃO",
    defaultAvatarLabel:"SEU AVATAR",
    avatarNoneLabel:"Nenhum",
    avatarOverridesEmoji:"Se você escolher um avatar, ele substitui seu emoji nas partidas. Escolha \"Nenhum\" para voltar ao emoji.",
    defaultColorLabel:"SUA COR PADRÃO",
    celebrationLabel:"COMEMORAÇÃO AO GANHAR",
    celebrationDesc:"Aplica-se só na SUA tela quando VOCÊ é quem ganha. Os outros jogadores continuam vendo o próprio sorteio deles.",
    celebRandom:"Aleatória",
    celebRandomSub:"Surpreende sempre (como até agora)",
    celebOriginal:"Original",
    celebOriginalSub:"Dourado — confete clássico",
    celebExplosive:"Vitória Explosiva",
    celebExplosiveSub:"Verde-azulado / roxo",
    celebCrowned:"Coroado",
    celebCrownedSub:"Roxo claro",
    celebJungle:"Selva",
    celebJungleSub:"Verde — folhas e tambores",
    celebBeaming:"Radiante",
    celebBeamingSub:"Dourado — sorriso enorme",
    celebFire:"Pegando Fogo",
    celebFireSub:"Laranja — chamas intensas",
    celebBiceps:"Pura Potência",
    celebBicepsSub:"Verde-limão — força bruta",
    celebHahaha:"Morrendo de Rir",
    celebHahahaSub:"Coral — risada total",
    celebRainbow:"Arco-íris",
    celebRainbowSub:"Multicolor — magia pura",
    celebSquint:"Travesso",
    celebSquintSub:"Rosa — piscadela travessa",
    savingBtn:"⏳ Salvando...",
    saveProfileBtn:"💾 Salvar perfil",
    profileSaved:"✅ Perfil salvo",
    feedbackThanks:"Obrigado!",
    feedbackThanksBug:"Já anotamos, vamos revisar em breve.",
    feedbackThanksSuggestion:"Sua ideia foi salva, vamos considerá-la para versões futuras.",
    closeBtn:"Fechar",
    feedbackTitle:"🗳️ Caixa de sugestões do Score 7",
    reportBug:"✍️ Reportar um erro",
    suggestGame:"💡 Sugerir jogo",
    whichScreen:"EM QUAL TELA?",
    whatErrorType:"QUE TIPO DE ERRO?",
    feedbackBugPlaceholder:"Conte-nos o que aconteceu e o que você esperava que acontecesse...",
    feedbackSuggestPlaceholder:"Que jogo ou função você gostaria de ver no app?",
    attachScreenshot:"📎 Anexar captura de tela (opcional)",
    screenshotAttached:"Captura anexada",
    sendingAs:"Enviando como:",
    sendBtn:"Enviar",
    sendingBtn:"Enviando...",
    noNameLabel:"Sem nome",
    anonPlayerLabel:"Jogador anônimo (sem conta)",
    fsHome:"🏠 Início",
    fsCreate:"➕ Criar sala",
    fsJoin:"🔑 Entrar em uma sala",
    fsRound:"🎲 Rodada / Placar",
    fsTable:"📋 Tabela de rodadas",
    fsSpectator:"📺 Placar ao vivo (espectador)",
    fsScanner:"📷 Scanner de cartas (IA)",
    fsStats:"📊 Estatísticas",
    fsProfile:"👤 Perfil",
    fsGroups:"👥 Grupos",
    fsOther:"❓ Outra / não tenho certeza",
    fcCrash:"🖤 A tela ficou preta / travou",
    fcNotSaved:"💾 Minha pontuação não foi salva",
    fcAi:"🤖 O scanner de cartas (IA) falhou",
    fcConnection:"📡 Não consegui entrar ou me conectar à sala",
    fcVisual:"🎨 Algo parece errado (visual)",
    fcOther:"❓ Outro",
    someoneStarted:"Alguém já começou a jogar — entre agora",
    joinNowBtn:"✅ Entrar",
    gameModeLabel:"MODO DE JOGO",
    requiresManual:"📋 Requer manual oficial",
    howItWorks:"COMO FUNCIONA",
    ruleClassicCards:"Cartas 0–12",
    ruleClassicCardsDesc:" · some os valores da sua mão.",
    ruleDupTitle:"Carta duplicada",
    ruleDupDesc:" = estourou, zero pts na rodada.",
    ruleFlip7Title:"Flip 7",
    ruleFlip7Desc:": 7 cartas únicas = +15 pts de bônus + fim da rodada.",
    ruleModTitle:"Modificadores:",
    ruleModDesc:" ×2, +2 a +10 sobre sua soma.",
    ruleGoalDesc:" · o primeiro a chegar vence.",
    ruleVengCards:"Cartas 0–13",
    ruleVengCardsDesc:" · inclui especiais: Zero, Unlucky 7, Lucky 13.",
    ruleVengDupTitle:"Duplicado",
    ruleVengDupDesc:" = estourou · Unlucky 7 = você perde suas cartas, fica só o 7.",
    ruleVengModTitle:"Modificadores negativos",
    ruleVengModDesc:" (jogados contra você): ÷2, −2 a −10.",
    ruleVengActionsTitle:"Ações:",
    ruleVengActionsDesc:" Swap, Steal, Discard, Flip Four, Just One More.",
    goalPointsLabel:"META DE PONTOS",
    standardLbl:"PADRÃO",
    autoCloseRound:"⚡ Fechar rodada automaticamente quando todos terminarem",
    canChangeLater:"Você pode mudar isso depois, dentro do jogo",
    nextArrow:"Próximo →",
    backToGameType:"← Tipo de jogo",
    noFriendsYet:"Você ainda não tem amigos adicionados",
    selectAll:"Todos",
    selectNone:"Nenhum",
    useSelected:"✅ Usar selecionados",
    noGroupsYet:"Você ainda não tem grupos",
    groupsAvailable:"GRUPOS DISPONÍVEIS",
    tapToIncludeExclude:"Toque em cada integrante para incluí-lo ou excluí-lo desta partida.",
    activeRoomFound:"SALA ATIVA ENCONTRADA",
    codeLabelInline:"Código:",
    reconnectAdmin:"⚡ Reconectar como Admin",
    ignoreBtn:"Ignorar",
    roomCodeTitle:"Código da sala",
    idealForTablet:"💡 Ideal para deixar aberto em um tablet ou tela no meio da mesa — todos veem as pontuações atualizarem ao vivo, sem precisar passar o celular.",
    joinNamePlaceholder:"Seu nome no jogo",
    spectatorOnlyLbl:"SÓ VER O PLACAR",
    choosePlayerHint:"Escolha seu personagem. Os marcados como \"Na sala\" já estão conectados.",
    choosePlayerLbl:"ESCOLHA SEU JOGADOR",
    inRoomTag:"Na sala",
    joinAsNewLbl:"OU ENTRAR COMO NOVO JOGADOR",
    newPlayerNamePlaceholder:"Nome do novo jogador",
    addNewPlayerBtn:"➕ ADICIONAR NOVO JOGADOR",
    moreOptionsAria:"Mais opções",
    profileMenuItem:"👤 Perfil",
    reportBugMenuItem:"🗳️ Reportar bug / sugerir",
    changeAccount:"Trocar de conta",
    anonExpireWarn:"⚠ Sessões anônimas são excluídas após 30 dias de inatividade",
    spectatorMenuItem:"👁 Espectador",
    joinArrow:"Entrar →",
    waitingRematch:"⏳ Aguardando a revanche do admin...",
    adminDisconnected:"⚠️ O admin desconectou",
    playerDisconnectedInfo:"ℹ️ Um jogador está desconectado. Ele pode reconectar com o código da sala.",
    transferAdmin:"🔁 Transferir admin",
    endGameBtn2:"🛑 Encerrar partida",
    chooseNewAdmin:"ESCOLHER NOVO ADMIN — precisa estar conectado agora",
    confirmEndGame:"Encerrar a partida para todos?",
    endGameDesc:"Todos os jogadores voltarão ao início. A sala não é excluída.",
    yesEndGame:"Sim, encerrar",
    youLbl:"você",
    adminBadge:"👑 ADMIN",
    ptsLbl:"pts",
    readyBtn:"✓ PRONTO",
    unlockBtn:"🔒 Desbloquear",
    scanAiBtn:"📷 Scan IA",
    cardsBtn:"🃏 Cartas",
    manualBtn:"🧮 Manual",
    zeroBtn:"💀 Zero",
    lockedRowHint:"Linha protegida — toque para desbloquear e capturar",
    waitingDots2:"⏳ aguardando",
    lobbyModeLbl:"SALA EM MODO LOBBY",
    shareCodeToJoin:"Compartilhe este código para os jogadores entrarem",
    colPlayer:"Jogador",
    colTotal:"Total",
    scoreboardTitle:"PLACAR",
    liveCaps:"AO VIVO",
    roomCapsInline:"SALA",
    seeScoreboard:"🏆 Ver placar final",
    clearHistoryConfirmTitle:"🗑 Apagar histórico",
    demoTag:"DEMO",
    groupsTitle:"GRUPOS",
    groupsLoginPrompt:"Crie uma conta para criar grupos com seus amigos, ver quem está online e jogar juntos toda semana.",
    backToGroups:"← Grupos",
    inviteBtn:"🔗 Convidar",
    confirmReq:"Confirmar",
    deleteGroupTitle:"Excluir grupo",
    gameInProgress:"PARTIDA EM ANDAMENTO",
    membersLbl:"MEMBROS",
    tapToIncludeHint:"TOQUE EM QUEM VAI JOGAR · QUALQUER UM PODE ENTRAR DEPOIS",
    adminLbl:"ADMIN",
    tapToIncludeShort:"toque para incluir",
    yesLbl:"Sim",
    noLbl:"Não",
    deleteMemberTitle:"Remover do grupo",
    addFriendsToGroup:"ADICIONAR AMIGOS AO GRUPO",
    addBtn:"+ Adicionar",
    backToGroupsLong:"← Voltar para Grupos",
    groupsCapsTitle:"👥 GRUPOS",
    noGroupsYet2:"Ainda sem grupos",
    createGroupHint:"Crie um grupo para jogar com os mesmos amigos toda semana com o mesmo código",
    inGameTag:"🎮 EM JOGO",
    groupNameLbl:"NOME DO GRUPO",
    groupNamePlaceholder:"ex. Quinta à Noite 🎴",
    createGroupBtn:"🎮 Criar grupo",
    newGroupBtn:"+ Criar novo grupo",
    groupCodeLbl:"CÓDIGO DO GRUPO",
    joinGroupBtn:"👥 Entrar no grupo",
    askGroupCode:"Peça o código de 4 letras ao admin do grupo",
    calendarLbl:"📅 CALENDÁRIO",
    thisMonthSuffix:"este mês",
    lessLbl:"menos",
    moreLbl:"mais",
    comparingLbl:"Comparando…",
    neverPlayedTogether:"Vocês ainda não jogaram juntos na mesma partida",
    youAllCaps:"VOCÊ",
    vsLbl:"vs",
    gameWord:"partida",
    togetherSuffix:"juntos",
    dateColLbl:"Data",
    youCol:"Você",
    posAbbrev:"pos.",
    loadingRoundsTable:"Carregando tabela de rodadas…",
    guestModeLbl:"Modo anônimo",
    createAccountStatsHint:"Crie uma conta para salvar suas estatísticas, ver seu histórico e adicionar amigos.",
    createAccountLoginBtn:"Criar conta / Entrar",
    noGamesYetLong:"Ainda sem partidas registradas",
    playFirstGameHint:"Jogue sua primeira partida para ver suas estatísticas",
    winRateLbl:"WIN RATE",
    flip7PerGame:"FLIP 7 POR PARTIDA",
    bustPerGame:"BUST POR PARTIDA",
    bestStreak:"MELHOR SEQUÊNCIA",
    cardsPerRound:"CARTAS POR RODADA",
    luckyCard:"CARTA DA SORTE",
    bustsInARow:"BUSTS SEGUIDOS",
    needAccountFriends:"Você precisa de conta para adicionar amigos",
    inviteFriendCaps:"CONVIDAR AMIGO",
    shareLinkDesc:"Compartilhe seu link — quando seu amigo abrir, ele ficará conectado com você automaticamente.",
    shareInviteLinkBtn:"🔗 Compartilhar link de convite",
    searchByNameEmail:"OU BUSCAR POR NOME / E-MAIL (2+ letras)",
    searchNameEmailPlaceholder:"Digite um nome ou e-mail…",
    searchingLbl:"Buscando…",
    requestSentBtn:"+ SOLICITAÇÃO",
    noResults:"Sem resultados",
    wantsToBeFriend:"quer ser seu amigo",
    acceptBtn:"✓ Aceitar",
    noFriendsYetAdd:"Ainda sem amigos — adicione seus companheiros de jogo",
    noGamesYetShort:"Ainda sem partidas",
    winsLbl:"VITÓRIAS",
    compareHeadToHead:"Comparar cara a cara",
    deleteFriendTitle:"Remover amigo",
    noGamesRegisteredYet:"Ainda sem partidas registradas",
    vengeanceTag:"💀 VINGANÇA",
    ptsTotalLbl:"pts totais",
    backToMenu:"← Voltar ao menu",
    historyOfGames:"HISTÓRICO DE PARTIDAS",
    noHistoryYet:"Ainda sem histórico",
    backToRanking:"← Voltar ao ranking",
    statsCapsTitle:"📊 ESTATÍSTICAS",
    flip7RaceTo200:"FLIP 7 · RACE TO 200",
    loadingStats:"Carregando estatísticas...",
    completeGameForRanking:"Complete uma partida para ver o ranking",
    noStatsYet:"Ainda sem estatísticas",
    winsTrophy:"🏆 vitórias",
    weekdayLetters:["D", "S", "T", "Q", "Q", "S", "S"],
    heroPhrases:["VIRE. SOME. VENÇA.", "PARAR OU ARRISCAR?", "SEM REPETIR, SEM ESTOURAR", "CADA CARTA CONTA", "A SORTE ESTÁ LANÇADA", "CORRA PARA A META"],
    scanTitle2:"🃏 Árbitro de Cartas",
    myCardsTitle:"🃏 Minhas cartas",
    myCardsVengTitle:"💀 Minhas cartas",
    manualCorrectTitle:"✏️ Corrigir pontos",
    manualCaptureTitle:"🧮 Entrada Manual",
    loadingDots:"Carregando...",
    tapOpenCamera:"Toque para abrir a câmera",
    aimCardsHint:"Aponte para suas cartas e tire uma foto",
    orChooseGallery:"ou escolher da galeria",
    verticalPhotoDetected:"📱 Foto vertical detectada",
    verticalPhotoDesc:"O Árbitro lê melhor as cartas na horizontal. Não é perfeito com fotos verticais — gire antes de analisar.",
    rotatePhotoBtn:"🔄 Girar foto",
    allCardsVisible:"Dá para ver todas as cartas claramente?",
    refereeSupreme:"🃏 O Árbitro de Cartas™ · Juiz Supremo do Baralho",
    anotherPhotoBtn:"📷 Outra foto",
    analyzeBtn:"🔍 Analisar",
    refereeAnalyzing:"O Árbitro está revisando as cartas...",
    retryBtn:"Tentar novamente",
    cardsDetectedCaps:"CARTAS DETECTADAS — toque para remover",
    dupWarnPrefix:"aparecem duas vezes na foto — só contam cartas diferentes.",
    dupWarnBust:"Se você realmente tirou dois números iguais no seu turno, isso é um estouro — considere marcar 💀 Zero em vez de confirmar essa pontuação.",
    noCardsAddFromPalette:"Sem cartas — adicione da paleta",
    totalFinalCaps:"TOTAL FINAL",
    totalRoundCaps:"TOTAL DESTA RODADA",
    baseLbl:"Base:",
    modifiersCorrectCaps:"MODIFICADORES — toque para corrigir",
    modifiersHaveCaps:"MODIFICADORES — toque se você tiver",
    modifiersPlayedCaps:"MODIFICADORES — se alguém jogou contra você",
    onLbl:"ON",
    offLbl:"OFF",
    activeLbl:"ATIVO",
    flip7UniqueCaps:"FLIP 7 — 7 CARTAS ÚNICAS",
    flip7DistinctCaps:"FLIP 7 — 7 CARTAS DIFERENTES",
    completeBonusActive:"Completo! Bônus ativado",
    completeBonusAuto:"Completo! Bônus automático",
    missingForBonus:"Faltam {n} para o bônus",
    cardsWord:"cartas",
    actionCardsDetectedCaps:"CARTAS DE AÇÃO DETECTADAS — toque para remover se não se aplica",
    actionCardsRegisterCaps:"CARTAS DE AÇÃO (registre se usou)",
    addCardPaletteCaps:"➕ ADICIONAR CARTA — toque para somar",
    flip7CompletedMax:"🃏 FLIP 7 COMPLETO! Máximo de cartas atingido",
    youHavePrefix:"Você tem {a} + esta rodada {b} = {c}",
    repeatPhotoBtn2:"📷 Repetir foto",
    confirmPtsBtn:"✓ Confirmar {n} pts",
    confirmPtsVengBtn:"💀 Confirmar {n} pts",
    inclFlip7Bonus:" (incl. +15 Flip 7)",
    plusFlip7Bonus:" (+15 Flip 7)",
    exitWithoutScoring:"Sair sem pontuar",
    zeroThisRound:"💀 Zero nesta rodada",
    tapCardsInHand:"TOQUE NAS CARTAS QUE VOCÊ TEM NA MÃO",
    tapCardsInHand113:"TOQUE NAS CARTAS QUE VOCÊ TEM (1-13)",
    selectCardsBtn:"Selecione as cartas",
    credentialsInvalid:"Credenciais do Árbitro inválidas. Contate o admin.",
    refereeBusy:"O Árbitro está ocupado. Espere alguns segundos e tente novamente.",
    refereeBadFormat:"O Árbitro não retornou um formato válido. Tente novamente.",
    refereeConfused:"O Árbitro teve um momento de confusão. Tente novamente.",
    refereeNoCredentials:"O Árbitro não tem credenciais.\nConfigure o proxy no Cloudflare Workers\nou contate o administrador.",
    couldntReadImage:"Não foi possível ler essa imagem. Tente outra.",
    activeDivBtn:"Ativo — você só tem o 7. Adicione as novas cartas que receber.",
    unlucky7Desc:"Você tirou Unlucky 7 — perde TODAS as suas cartas. Só fica com o 7. Você pode continuar acumulando cartas novas.",
    tapOnlyIfActivated:"toque só se ativou por engano",
    lucky13Caps:"LUCKY 13",
    unlucky7Caps:"UNLUCKY 7",
    lucky13Allow2:"Permite ter 2 cartas do 13 sem estourar",
    active2x13:"ATIVO — 2x13",
    spentLbl:"gasto",
    flip7Bonus15Caps:"💀 FLIP 7 — BÔNUS +15",
    missingSlash7:"/7 · Faltam {n} para o bônus",
    completeAutoSlash7:"/7 · Bônus automático",
    flip15Extra13:" (+13 extra Lucky 13)",
    correctionOf:"Correção de",
    currentValueLbl:"valor atual:",
    pointsOf2:"Pontos de",
    thisRound2:"esta rodada",
    errorLbl:"ERRO",
    flip15BonusTip:"+ 15 BÔNUS FLIP 7  (7 cartas únicas)",
    clrKey:"CLR",
    clrKeyClear:"CLR — Limpar",
    saveCorrection:"SALVAR CORREÇÃO · ",
    confirmDot:"CONFIRMAR · ",
    statsMenuLbl:"Estatísticas",
    friendsMenuLbl:"Amigos",
    myGroupsMenuBtn:"👥 Meus grupos",
    gameInProgressRoomTpl:"Partida em andamento · sala {code}",
    signOutConfirm:"Sair da conta?",
    signOutShortLbl:"sair",
    clearCacheLbl:"Limpar cache",
    celWinnerLbl:"VENCEDOR!",
    celTieLbl:"EMPATE!",
    celExplosiveLbl:"VITÓRIA EXPLOSIVA!",
    celExplosiveTieLbl:"EMPATE EXPLOSIVO!",
    celCrownedLbl:"COROADO!",
    celCrownSharedLbl:"COROA COMPARTILHADA!",
    celJungleKingLbl:"REI DA SELVA!",
    celJungleSharedLbl:"SELVA COMPARTILHADA!",
    celBeamingLbl:"RADIANTE!",
    celBeamingSharedLbl:"BRILHO COMPARTILHADO!",
    celFireLbl:"PEGANDO FOGO!",
    celFireSharedLbl:"AMBOS PEGANDO FOGO!",
    celBicepsLbl:"PURA POTÊNCIA!",
    celBicepsSharedLbl:"FORÇA COMPARTILHADA!",
    celHahahaLbl:"MORRENDO DE RIR!",
    celHahahaSharedLbl:"RISADA COMPARTILHADA!",
    celRainbowLbl:"PURA MAGIA!",
    celRainbowSharedLbl:"MAGIA COMPARTILHADA!",
    celSquintLbl:"TRAVESSO E VENCEDOR!",
    celSquintSharedLbl:"TRAVESSURA COMPARTILHADA!",
    vpClose1:"Que jogo apertado!",
    vpClose2:"Ganhou por pouco",
    vpClose3:"Vitória no fio da navalha",
    vpClose4:"Quase um empate — que emoção",
    vpClose5:"Decidido no último suspiro",
    vpSolid1:"Vitória sólida",
    vpSolid2:"Com folga de sobra",
    vpSolid3:"Dominou do início ao fim",
    vpSolid4:"Uma vantagem clara",
    vpSolid5:"Levou com autoridade",
    vpCrush1:"Vitória esmagadora!",
    vpCrush2:"Arrasou com todos",
    vpCrush3:"Não teve disputa",
    vpCrush4:"Um banho histórico",
    vpCrush5:"Ninguém chegou perto",
    playersCapsHeader:"JOGADORES",
    manualModeLbl:"Manual",
    groupModeLbl:"Grupo",
    selectedCountWord:"selecionados",
    onlineDotLbl:"● online",
    offlineDotLbl:"○ offline",
    viewScoreboardCaps:"VER PLACAR",
    joinCapsLogo:"ENTRAR",
    roomCodeCapsLbl:"CÓDIGO DA SALA",
    yourNameCaps:"SEU NOME",
    searchingRoomLbl:"⏳ Procurando sala",
    joinGameCapsBtn:"🎮 ENTRAR NO JOGO",
    enterSpectatorBtn:"👁 ENTRAR COMO ESPECTADOR",
    alreadyConnectedLbl:"já conectado",
    invitedYouToPlay:"te convidou para jogar!",
    gameInGroupTpl:"Partida em {group}!",
    notNowLbl:"Agora não",
    need2PlayersErr:"Você precisa de pelo menos 2 jogadores.",
    code4CharsErr:"Código de 4 caracteres.",
    enterNameErr:"Digite seu nome.",
    roomNotFoundTpl:"Sala \"{code}\" não encontrada.",
    askAdminCodeStep:"Peça o código ao admin",
    roomNoLongerExistsErr:"Essa sala não existe mais.",
    gameAlreadyEndedErr:"Essa partida já terminou.",
    adminEndedGameNotice:"🚪 O admin encerrou a partida",
    groupsFeatureLbl:"Grupos",
    yourGroupLbl:"seu grupo",
    sessionMetaLine:"{n} jogadores · {r} rodadas · Sala {code}",
    liveSuffixWord:"AO VIVO",
    roomLiveTemplate:"SALA {code} · AO VIVO",
    liveScoreboardCaps:"📡 PLACAR AO VIVO",
    roomRoundTemplate:"SALA {code} · RODADA {n}",
    missingPtsPctTemplate:"faltam {n} pts · {pct}%",
    roundWordBare:"rodada",
    roundWordBarePlural:"rodadas",
    missingPtsTemplate:"faltam {n} pts",
    autoCloseHint:"⚡ Fechar rodada automaticamente quando todos terminarem",
    editOtherRowLbl:"Editar linha de outro jogador",
    unlockedAutoRelock:"Desbloqueado — bloqueia sozinho após um uso",
    protectedRowHint:"Protegido — evita capturar por engano a linha de outra pessoa",
    chooseNewAdminCaps:"ESCOLHER NOVO ADMIN — precisa estar online agora",
    onlineDotWord:"● online",
    offlineSimple:"offline",
    endGameConfirmQ:"Encerrar a partida para todos?",
    endGameConfirmDesc:"Todos os jogadores voltarão para o início. A sala não é excluída.",
    yesEndGame:"Sim, encerrar",
    adminCrownBadge:"👑 ADMIN",
    ptsAbbrev:"pts",
    readyBadge:"✓ PRONTO",
    unlockBtn:"🔒 Desbloquear",
    scanIaBtn:"📷 Scan IA",
    cardsBtnCaps:"🃏 Cartas",
    manualBtn:"🧮 Manual",
    zeroBtn:"💀 Zero",
    rowProtectedTapHint:"Linha protegida — toque para desbloquear e capturar",
    waitingLower:"⏳ aguardando",
    lobbyModeCaps:"SALA EM MODO LOBBY",
    shareCodeJoinHint:"Compartilhe este código para os jogadores entrarem",
    goalShortLabel:"META {n}",
    ptsGameOverTemplate:"{pts} PONTOS · FIM DE JOGO",
    adminDisconnectedTitle:"⚠️ O admin desconectou",
    adminReconnectHint:"A sala continua ativa — o admin pode reconectar com o código {code}",
    playerDisconnectedHint:"ℹ️ Um jogador está desconectado. Ele pode reconectar com o código da sala.",
    missingOfTemplate:"Faltam {n} de {m}",
    ptsGoalTemplate:"{pts} PONTOS · META DE {target} PONTOS",
    rematchSamePlayers:"🔁 REVANCHE · Mesmos jogadores",
    waitingRematchAdmin:"⏳ Aguardando a revanche do admin...",
    errUnknown:"Erro desconhecido",
    rematchTitleCaps:"REVANCHE!",
    onTheWayCaps:"A CAMINHO",
    roundBadgeTemplate:"RODADA {n}",
    avgScoreLbl:"Média de score",
    winsOfGamesLine:"{w} vitórias em {g} partidas",
    tabRankingEmoji:"🏆 Ranking",
    tabGamesEmoji:"🎮 Partidas",
    statsLeaderRow:"{g} partidas · {pct}% vitórias · melhor: {best}pts",
    posOfTotalTemplate:"#{p} de {n}",
    playersAbbrev:"jog.",
    roomInlineLower:"Sala {code}",
    roundsWord:"rodadas",
    alreadyFriends:"Vocês já são amigos",
    requestAlreadySent:"Você já enviou uma solicitação — espere a resposta",
    requestSentMsg:"✅ Solicitação enviada para {name}",
    errRemoveFriendPrefix:"Erro ao remover:",
    tabMe:"👤 Eu",
    tabHistory:"🎮 Histórico",
    statLblWins:"Vitórias",
    statLblGames:"Partidas",
    statLblBestScore:"Melhor score",
    statLblAvgGame:"Média por partida",
    statLblFlip7s:"Flip 7s",
    statLblBusts:"Busts",
    winLossLine:"{w} vitórias · {l} derrotas",
    winStreakCaps:"VITÓRIAS SEGUIDAS",
    lossStreakCaps:"DERROTAS SEGUIDAS",
    comebackWord:"VIRADA",
    comebackWordPlural:"VIRADAS",
    modeClassicCaps:"CLÁSSICO",
    modeVengCaps:"VINGANÇA",
    gamesAbbrev:"P",
    shareInviteTitle:"Junte-se ao Flip 7!",
    shareInviteText:"Me adicione como amigo no Flip 7 🃏",
    linkCopiedWhatsapp:"✅ Link copiado — cole no WhatsApp",
    pendingRequestsCaps:"🔴 SOLICITAÇÕES PENDENTES ({n})",
    playersCountPos:"{n} jogadores · pos #{p}",
    friendStatsLine:"{n} partidas · {pct}% vitórias · melhor: {best}pts · 🃏{flip7}",
    goalTargetPts:"🏆 META: {n} PONTOS",
    gameWordPlural:"partidas",
    onlineWord:"Online",
    statusInGame:"🎮 Em partida",
    statusInLobby:"🎴 No lobby",
    statusOnline:"🟢 Online",
    statusOffline:"Offline",
    grpShareText:"Junte-se ao nosso grupo Flip 7!",
    grpLinkCopied:"✅ Link copiado",
    grpJoinArrow:"Entrar →",
    grpYouTag:"você",
    grpPlayNow:"Jogar agora",
    grpPlayerWord:"jogador",
    grpPlayerWordPlural:"jogadores",
    grpMemberAdded:"{name} adicionado ao grupo",
    grpAddErr:"❌ Erro ao adicionar",
    tabMyGroups:"Meus grupos",
    tabJoinGroup:"Entrar",
    grpMembersWord:"membros",
    grpNameRequired:"Dê um nome ao grupo",
    grpCreatedMsg:"✅ Grupo criado — código: {code}",
    grpCodeRequired:"Código de 4 letras",
    grpNotFound:"Grupo não encontrado",
    grpAlreadyMember:"Você já é membro deste grupo",
    grpJoinedMsg:"✅ Você entrou em {name}",
    grpCreateRoomHint:"Crie uma sala no menu principal e escolha este grupo",
    grpMemberRemoved:"✅ Membro removido do grupo",
    grpGroupDeleted:"✅ Grupo excluído",
  }
};

// ── REMATCH ANIMATION — overlay con contador 3→2→1 ───────────
function RematchOverlay({onDone,T}){
  T=T||LANGS.es;
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
        <div className="rematch-title">{T.rematchTitleCaps}</div>
        <div className="rematch-sub">{T.onTheWayCaps}</div>
        {count>0
          ? <div key={key} className="rematch-counter">{count}</div>
          : <div className="rematch-counter" style={{fontSize:"5rem",color:"var(--y)"}}>🚀</div>
        }
      </div>
    </div>
  );
}

// ── AVISO DE RONDA NUEVA — pantalla completa (antes era un pill chiquito
// que quedaba tapado por el header y no se notaba). Usa el mismo color
// aleatorio que la insignia "RONDA N" persistente, para que se vea como
// una sola cosa y no dos avisos con colores distintos.
function RoundChangeOverlay({round,color,T}){
  T=T||LANGS.es;
  const sparks=React.useMemo(()=>Array.from({length:24},(_,i)=>({
    c:[color,"#F5C800","#ffffff"][i%3],
    l:Math.round(Math.random()*100)+"%",
    t:Math.round(Math.random()*100)+"%",
    s:Math.round(6+Math.random()*10)+"px",
    dl:Math.round(Math.random()*20)/10+"s",
    dr:Math.round((1.5+Math.random()*2)*10)/10+"s",
    sh:Math.random()>.5?"2px":"50%"
  })),[round,color]);
  return(
    <div className="roundbig-overlay" style={{background:"radial-gradient(circle at 50% 45%,"+color+"3a 0%,#0a0a18 70%)"}}>
      <div className="rematch-sparks">
        {sparks.map((s,i)=>(
          <div key={i} style={{position:"absolute",background:s.c,width:s.s,height:s.s,
            left:s.l,top:s.t,borderRadius:s.sh,opacity:.5,
            animation:"cf "+s.dr+" "+s.dl+" linear infinite"}}/>
        ))}
      </div>
      <div style={{position:"relative",zIndex:1}}>
        <img src="score7-logo.png" alt="" className="roundbig-logo"/>
        <div className="roundbig-title" style={{color:color}}>{T.roundBadgeTemplate.replace('{n}',round)}</div>
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
      // Always open downward — if near bottom, modal will scroll internally
      setEmojiPos({top:r.bottom+6,left:Math.max(4,Math.min(r.left,window.innerWidth-210))});
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
    <div className="player-setup-row" style={{borderColor:color+"55",
      background:color+"0a",boxShadow:"0 2px 10px "+color+"14"}}>
      <div className="psr-top">
        <div style={{position:"relative",flexShrink:0}}>
          <button ref={emojiBtnRef} className="emoji-big-btn" onClick={openEmoji}
            style={{background:color+"22",borderColor:color+"88"}}><Ava v={emoji}/></button>
          <div style={{position:"absolute",top:-5,left:-5,width:15,height:15,borderRadius:"50%",
            background:color,border:"2px solid var(--dark,#0F0F1A)",display:"flex",
            alignItems:"center",justifyContent:"center",fontFamily:"'Anton',sans-serif",
            fontSize:".55rem",color:"#000",pointerEvents:"none"}}>{idx+1}</div>
          {emojiOpen&&(
            <div ref={emojiDdRef} className="emoji-dd" style={{top:emojiPos.top,left:emojiPos.left}}>
              {allEmojis.map((e,ei)=>(
                <button key={ei} className={"emoji-dd-opt"+(emoji===e?" sel":"")}
                  onClick={()=>{snd('tap');onEmoji(e);setEmojiOpen(false);}}>{e}</button>
              ))}
            </div>
          )}
        </div>
        <input className="player-name-inp" style={{"--clr":color}}
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

// ── LANGUAGE DROPDOWN — selector ES/EN/PT con banderas (reemplaza el botón
// que solo alternaba ES↔EN; mismo patrón visual que los demás dropdowns
// de la app, como el de emoji/color en PlayerRow) ──────────────────────
const LANG_OPTS=[{v:"es",flag:"🇪🇸",label:"Español"},{v:"en",flag:"🇺🇸",label:"English"},{v:"pt",flag:"🇧🇷",label:"Português"}];
function LanguageDropdown({lang,setLang,compact}){
  const[open,setOpen]=React.useState(false);
  const btnRef=React.useRef(null);
  const ddRef=React.useRef(null);
  React.useEffect(()=>{
    function handle(e){
      if(open&&btnRef.current&&!btnRef.current.contains(e.target)&&ddRef.current&&!ddRef.current.contains(e.target)){setOpen(false);}
    }
    document.addEventListener("mousedown",handle);document.addEventListener("touchstart",handle);
    return()=>{document.removeEventListener("mousedown",handle);document.removeEventListener("touchstart",handle);}
  },[open]);
  const current=LANG_OPTS.find(o=>o.v===lang)||LANG_OPTS[0];
  return(
    <div style={{position:"relative"}}>
      <button ref={btnRef} onClick={()=>{snd('tap');setOpen(v=>!v);}}
        style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",
          color:"rgba(255,255,255,.6)",borderRadius:9,cursor:"pointer",
          fontFamily:"'Righteous',sans-serif",fontSize:".68rem",letterSpacing:1,
          height:30,padding:"0 9px",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
        <span style={{fontSize:"1rem",lineHeight:1}}>{current.flag}</span>
        {!compact&&<span>{current.v.toUpperCase()}</span>}
      </button>
      {open&&(
        <div ref={ddRef} style={{position:"absolute",top:36,right:0,zIndex:30,minWidth:150,
          background:"var(--dark,#14141f)",border:"1px solid rgba(255,255,255,.15)",
          borderRadius:12,padding:6,boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
          {LANG_OPTS.map(o=>(
            <button key={o.v} onClick={()=>{snd('tap');setLang(o.v);setOpen(false);}}
              style={{width:"100%",textAlign:"left",background:o.v===lang?"rgba(245,200,0,.12)":"none",border:"none",
                padding:"8px 10px",borderRadius:8,cursor:"pointer",
                fontFamily:"'Righteous',sans-serif",fontSize:".76rem",
                color:o.v===lang?"var(--y)":"rgba(255,255,255,.75)",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:"1rem",lineHeight:1}}>{o.flag}</span><span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
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
  const[celebrationType,setCelebrationType]=useState(0); // 0/1/2 — variedad de pantalla de victoria
  const[aiConfig,setAiConfig]=useState({provider:"gemini",key:"",claudeKey:""});
  const[aiLoaded,setAiLoaded]=useState(false);
  const[rematchPending,setRematchPending]=useState(false);
  // ── AUTH STATE ──────────────────────────────────────────────
  const[authUser,setAuthUser]=useState(undefined); // undefined=loading, null=not authed, obj=authed
  const[authChecked,setAuthChecked]=useState(false);
  // undefined=todavía no se revisó, null=cuenta sin sanciones activas,
  // objeto {status,reason,until}=baneada o suspendida ahora mismo. Se
  // escucha en vivo (no solo al entrar) para que un baneo hecho mientras
  // la app ya está abierta también saque al usuario, no hasta que recargue.
  const[modBlock,setModBlock]=useState(undefined);
  // Advertencia ('warned') sin reconocer todavía -- no bloquea la app, pero
  // se muestra como aviso la próxima vez que el usuario entra (o mientras
  // sigue en Home). Se limpia sola cuando el usuario la reconoce (dismissWarnAlert)
  // guardando moderation/{uid}/seenAt = updatedAt de esa advertencia puntual;
  // si el admin advierte de nuevo más adelante, updatedAt cambia y vuelve a
  // aparecer aunque la anterior ya se hubiera reconocido.
  const[warnAlert,setWarnAlert]=useState(null);
  React.useEffect(()=>{
    if(!authUser){ setModBlock(undefined); setWarnAlert(null); return; }
    const ref=_db.ref("moderation/"+authUser.uid);
    const h=ref.on("value",function(snap){
      const m=snap.val();
      if(!m){ setModBlock(null); setWarnAlert(null); return; }
      if(m.status==="banned"){ setModBlock(m); setWarnAlert(null); return; }
      if(m.status==="suspended"){
        setModBlock(m.until&&Date.now()>m.until ? null : m);
        setWarnAlert(null);
        return;
      }
      setModBlock(null); // 'ok', 'warned' -- no bloquea
      if(m.status==="warned"&&m.updatedAt&&m.seenAt!==m.updatedAt){
        setWarnAlert(m);
      }else{
        setWarnAlert(null);
      }
    });
    return function(){ ref.off("value",h); };
  },[authUser]);
  function dismissWarnAlert(){
    if(!authUser||!warnAlert)return;
    _db.ref("moderation/"+authUser.uid+"/seenAt").set(warnAlert.updatedAt||Date.now()).catch(function(){});
    setWarnAlert(null);
  }
  // Cierre remoto de sesión (forceLogoutAt) -- si un admin fuerza el cierre
  // mientras esta pestaña sigue abierta, se detecta en vivo y se hace signOut().
  // sessionStartRef marca cuándo empezó ESTA sesión para no cerrar sesión con
  // una marca vieja de una vez anterior.
  const sessionStartRef=React.useRef(null);
  React.useEffect(()=>{
    if(!authUser){ sessionStartRef.current=null; return; }
    if(sessionStartRef.current===null) sessionStartRef.current=Date.now();
    const ref=_db.ref("users/"+authUser.uid+"/forceLogoutAt");
    const h=ref.on("value",function(snap){
      const ts=snap.val();
      if(ts&&sessionStartRef.current&&ts>sessionStartRef.current){
        signOut().catch(function(){});
      }
    });
    return function(){ ref.off("value",h); };
  },[authUser]);
  // Reconexión automática: guardar último código activo en localStorage
  const[lastKnownCode,setLastKnownCode]=useState(()=>localStorage.getItem("f7lastCode")||"");
  const[reconnectReady,setReconnectReady]=useState(false);
  const[stuckLoading,setStuckLoading]=useState(false);
  React.useEffect(()=>{
    const t=setTimeout(()=>setStuckLoading(true),6000);
    return()=>clearTimeout(t);
  },[]);
  // Aviso que se muestra en Home cuando volviste ahí porque el admin
  // terminó la partida para todos (en vez de quedarte sin explicación
  // viendo solo "el admin se desconectó"). Se limpia solo después de
  // unos segundos, o apenas el usuario haga cualquier otra cosa.
  const[homeNotice,setHomeNotice]=useState(null);
  React.useEffect(()=>{
    if(!homeNotice)return;
    const t=setTimeout(()=>setHomeNotice(null),5000);
    return()=>clearTimeout(t);
  },[homeNotice]);

  useEffect(()=>{
    async function loadAiConfig(){
      try{
        const[gemSnap,claudeSnap]=await Promise.all([
          _db.ref("config/ai").once("value"),
          _db.ref("config/claude").once("value")
        ]);
        const gemCfg=gemSnap.val();const claudeCfg=claudeSnap.val();
        // Solo guardar provider en estado global — la key la carga ScanModal en el momento
        setAiConfig({
          provider:gemCfg?.provider||"gemini",
          key:"",        // no exponer en estado global
          claudeKey:"",  // no exponer — ScanModal la carga directo de Firebase al usarla
          proxyUrl:gemCfg?.proxyUrl||""  // URL del Cloudflare Worker (opcional)
        });
        setAiLoaded(true);return;
      }catch(e){console.log("Firebase config fallback");}
      try{
        // Fallback: solo idioma y proveedor, nunca keys
        const s=JSON.parse(localStorage.getItem("f7ai")||"{}");
        setAiConfig({provider:s.provider||"gemini",key:"",claudeKey:"",proxyUrl:s.proxyUrl||""});
      }catch{}
      setAiLoaded(true);
    }
    loadAiConfig();
  },[]);

  // ── LISTEN TO AUTH STATE ────────────────────────────────────
  React.useEffect(()=>{
    const unsub=_auth.onAuthStateChanged(async user=>{
      setAuthUser(user||null);
      setAuthChecked(true);
      if(user&&!user.isAnonymous){
        await saveUserProfile(user).catch(()=>{});
        // ── Presencia robusta: se reafirma en cada reconexión (no solo al
        // loguear) y detecta grupos nuevos sin requerir volver a entrar ──
        try{ startPresenceHeartbeat(user.uid); }catch(e){}
        // ── Handle invite link ─────────────────────────────────
        const params=new URLSearchParams(window.location.search);
        const inviterUid=params.get("invite");
        if(inviterUid&&inviterUid!==user.uid){
          try{
            const inviterSnap=await _db.ref("users/"+inviterUid).once("value");
            const inviter=inviterSnap.val();
            if(inviter&&inviter.uid){
              const myKey=_db.ref("users/"+user.uid+"/friends/"+inviterUid);
              const theirKey=_db.ref("users/"+inviterUid+"/friends/"+user.uid);
              const meSnap=await _db.ref("users/"+user.uid).once("value");
              const me=meSnap.val()||{};
              const alreadyFriend=(await myKey.once("value")).val();
              if(!alreadyFriend){
                await myKey.set({uid:inviterUid,name:inviter.displayName||inviter.email||"?",
                  email:inviter.email||"",addedAt:Date.now()});
                await theirKey.set({uid:user.uid,name:me.displayName||me.email||"?",
                  email:me.email||"",addedAt:Date.now()});
              }
            }
          }catch(e){console.log("Invite error:",e);}
          // Clean URL without reload
          window.history.replaceState({},"",window.location.pathname);
        }
        // ── Handle group invite link ──────────────────────────
        const groupCode=params.get("group");
        if(groupCode&&user&&!user.isAnonymous){
          try{
            const snap=await _db.ref("groups").orderByChild("code").equalTo(groupCode.toUpperCase()).once("value");
            const data=snap.val();
            if(data){
              const gid=Object.keys(data)[0];
              const group=data[gid];
              const already=(await _db.ref("users/"+user.uid+"/groups/"+gid).once("value")).val();
              if(!already&&!group.members[user.uid]){
                const meSnap=await _db.ref("users/"+user.uid).once("value");
                const me=meSnap.val()||{};
                await _db.ref("groups/"+gid+"/members/"+user.uid).set({
                  name:me.displayName||me.email||"?",email:me.email||"",
                  photoURL:me.photoURL||"",role:"member",joinedAt:Date.now()
                });
                await _db.ref("users/"+user.uid+"/groups/"+gid).set(true);
              }
            }
          }catch(e){console.log("Group invite error:",e);}
          window.history.replaceState({},"",window.location.pathname)
        }
      }
    });
    return()=>unsub();
  },[]);

  // ── Reconexión automática: si hay código guardado, chequear sala ──
  useEffect(()=>{
    var saved=localStorage.getItem("f7lastCode");
    if(!saved)return;
    setLastKnownCode(saved);
    // Verificar que la sala siga activa
    _db.ref("rooms/"+saved+"/finished").once("value").then(function(snap){
      var finished=snap.val();
      // Solo ofrecer reconexión si la sala existe y no terminó
      if(finished===false){setReconnectReady(true);}
      else{try{localStorage.removeItem("f7lastCode");}catch(e){}}
    }).catch(function(){try{localStorage.removeItem("f7lastCode");}catch(e){}});
  },[]);

  const winnerShown=useRef(false);
  const unsubRef=useRef(null);
  const dbRef=useRef(makeDB(false));
  const prevSortedRef=useRef([]);
  // myPlayerId cambia con setState (async) pero subscribe() arma su
  // listener con el valor que tenía la clausura AL MOMENTO de llamarse —
  // por eso se usa un ref en paralelo, que siempre lee el valor más
  // reciente dentro del callback del listener (mismo patrón que los refs
  // de arriba).
  const myPlayerIdRef=useRef(null);
  useEffect(()=>{myPlayerIdRef.current=myPlayerId;},[myPlayerId]);
  // Celebración preferida guardada en tu perfil (users/{uid}/preferredCelebration).
  // Si sos vos quien gana Y tenés una fija (no "aleatoria"), tu pantalla la
  // usa en vez de sortear una — el resto de los dispositivos sigue viendo
  // su propio sorteo, ya que no hay forma de saber la preferencia de otro
  // jugador sin su cuenta.
  const myPreferredCelebrationRef=useRef(null);
  useEffect(()=>{
    if(!authUser||authUser.isAnonymous){myPreferredCelebrationRef.current=null;return;}
    const ref=_db.ref('users/'+authUser.uid+'/preferredCelebration');
    const h=snap=>{myPreferredCelebrationRef.current=snap.val();};
    ref.on('value',h);
    return()=>ref.off('value',h);
  },[authUser]);

  // Solo guardar preferencias no sensibles (NO keys)
  useEffect(()=>{
    try{localStorage.setItem("f7ai",JSON.stringify({provider:aiConfig.provider,proxyUrl:aiConfig.proxyUrl||""}))}catch{};
  },[aiConfig.provider,aiConfig.proxyUrl]);

  function subscribe(code,db){
    if(unsubRef.current)unsubRef.current();
    unsubRef.current=db.listen("rooms/"+code,data=>{
      if(!data)return;
      // El host terminó la partida para todos — cualquier cliente conectado
      // (jugadores, espectadores, incluso el propio host si el listener
      // llega a alcanzar a procesar el eco de su propio escritura) vuelve
      // a Home automáticamente.
      if(data.forceEnded){
        // Si el que se fue fuiste VOS (host), ya lo sabés — no hace falta
        // avisarte. Para todos los demás, antes esto los devolvía a Home
        // en silencio y solo veían "el admin se desconectó" sin enterarse
        // de que la partida ya había terminado.
        const iWasHost=data.hostPlayerId!=null?myPlayerIdRef.current===data.hostPlayerId:!myPlayerIdRef.current;
        if(!iWasHost)setHomeNotice(T.adminEndedGameNotice);
        leaveGame();
        return;
      }
      const newSorted=[...data.players].sort((a,b)=>b.total-a.total);
      const prev=prevSortedRef.current;
      newSorted.forEach((p,ni)=>{
        const oi=prev.findIndex(x=>x.id===p.id);
        if(oi!==-1&&oi!==ni){p._moved=ni<oi?'up':'down';if(ni<oi)snd('up');else snd('down');}
      });
      prevSortedRef.current=newSorted.map(p=>({...p}));
      setRoom(data);
      // Persistir último código activo para reconexión
      try{localStorage.setItem("f7lastCode",code);}catch(e){}
      // Detectar rematchPending — mostrar animación en TODOS los no-host (incluyendo host que también ve)
      if(data.rematchPending){
        setRematchPending(true);
      }
      if(data.finished&&data.winner&&!winnerShown.current){
        winnerShown.current=true;setWinner(data.winner);
        // Si el que ganó sos vos y elegiste una celebración fija en tu
        // perfil, se usa esa — si no, se sortea igual que siempre.
        const iAmWinner=!data.winner.tied&&myPlayerIdRef.current&&data.winner.id===myPlayerIdRef.current;
        const preferred=iAmWinner?myPreferredCelebrationRef.current:null;
        const ct=(preferred===0||preferred===1||preferred===2||preferred===3)?preferred:Math.floor(Math.random()*4);
        setCelebrationType(ct);
        if(ct===0){snd('winner');setTimeout(()=>snd('victory'),400);}
        else if(ct===1){snd('fanfare');}
        else if(ct===3){snd('jungle');}
        else{snd('victory');setTimeout(()=>snd('winner'),350);}
        const sessionObj={id:uid(),date:data.gameStartedAt||data.createdAt||Date.now(),players:data.players,rounds:data.round,winner:data.winner.name,code:data.code,demo:demoMode};
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
    await db.set("rooms/"+code,{code,round:1,roundScores:{},finished:false,winner:null,createdAt:Date.now(),gameStartedAt:Date.now(),players:[],lobbyMode:true});
    setRoomCode(code);setIsSpectator(false);setMyPlayerId(null);
    subscribe(code,db);setScreen("game");setTab("round");
    winnerShown.current=false;prevSortedRef.current=[];
  }

  function leaveGame(){
    // Avisar explícitamente que el host se va — antes solo dependía de
    // onDisconnect, que no siempre dispara al navegar dentro de la SPA
    // (el socket de Firebase sigue vivo aunque cambies de pantalla).
    if(isHost&&roomCode&&!demoMode){
      _db.ref("rooms/"+roomCode+"/hostOnline").set(false).catch(()=>{});
    }
    // Si la partida YA terminó (hay ganador) y te vas sin dar revancha,
    // liberamos la sala del grupo — si no, el banner "partida en curso"
    // se queda pegado para siempre aunque el juego ya haya acabado solo.
    if(room&&room.finished&&room.groupId&&!demoMode){
      _db.ref("groups/"+room.groupId+"/currentRoom").once("value").then(snap=>{
        if(snap.val()===roomCode){
          _db.ref("groups/"+room.groupId+"/currentRoom").set(null).catch(()=>{});
        }
      }).catch(()=>{});
    }
    if(unsubRef.current){unsubRef.current();unsubRef.current=null;}
    try{localStorage.removeItem("f7lastCode");}catch(e){}
    winnerShown.current=false;prevSortedRef.current=[];
    setRoom(null);setRoomCode("");setWinner(null);setScreen("home");
    setDemoMode(false);setIsSpectator(false);setMyPlayerId(null);setRematchPending(false);
  }

  // Transferir el rol de host a otro jugador ya conectado — soluciona el
  // problema de sala "huérfana" cuando el host original se desconecta.
  async function transferHost(newPlayerId){
    if(!isHost||!room||!roomCode||demoMode)return;
    snd('tap');
    await dbRef.current.update("rooms/"+roomCode,{hostPlayerId:newPlayerId});
    await _db.ref("rooms/"+roomCode+"/hostOnline").set(true);
  }

  // Terminar la partida para TODOS — no borra la sala (por si quieren
  // reiniciar), pero saca a todos a Home y libera el grupo asociado.
  async function endGameForAll(){
    if(!isHost||!room||!roomCode||demoMode)return;
    await dbRef.current.update("rooms/"+roomCode,{forceEnded:true,forceEndedAt:Date.now()});
    if(room.groupId){
      _db.ref("groups/"+room.groupId+"/currentRoom").set(null).catch(()=>{});
    }
    leaveGame();
  }

  // ── RECONEXIÓN RÁPIDA a la última sala ─────────────────────
  async function reconnectToLastRoom(asHost){
    if(!lastKnownCode)return;
    var code=lastKnownCode;
    setReconnectReady(false);
    var db=makeDB(false);dbRef.current=db;
    try{
      var r=await db.get("rooms/"+code);
      if(!r){try{localStorage.removeItem("f7lastCode");}catch(e){}return;}
      setDemoMode(false);setRoomCode(code);
      // BUG FIX: antes esto ponía myPlayerId en null al reconectar como
      // host, asumiendo "sos host si no tenés playerId" — pero isHost ya
      // no funciona así: desde que existe la transferencia de admin,
      // isHost compara myPlayerId contra room.hostPlayerId (un id de
      // jugador real) cada vez que ese campo existe. Reconectar con
      // myPlayerId=null nunca coincidía con room.hostPlayerId, así que
      // "Reconectarme como Admin" te dejaba sin ningún control (isHost
      // quedaba en false), como si solo pudieras ver la partida. Ahora se
      // usa el hostPlayerId real que ya trae la sala.
      setIsSpectator(false);
      setMyPlayerId(asHost?(r.hostPlayerId!=null?r.hostPlayerId:null):null);
      subscribe(code,db);
      if(asHost){
        var hostRef=_db.ref("rooms/"+code+"/hostOnline");
        hostRef.set(true);hostRef.onDisconnect().set(false);
      }
      setScreen("game");setTab("round");
      winnerShown.current=false;prevSortedRef.current=[];
    }catch(e){
      try{localStorage.removeItem("f7lastCode");}catch(ex){}
      setReconnectReady(false);
    }
  }

  // ── REVANCHA (solo host) — escribe rematchPending en Firebase ──
  async function startRematch(prevPlayers){
    snd('round');
    prevSortedRef.current=[];
    setWinner(null);
    // 1. Marcar rematchPending → todos (host incluido) ven el overlay via Firebase listener
    await dbRef.current.update("rooms/"+roomCode,{rematchPending:true});
    // 2. Esperar 4s para que la animación se vea en todos los dispositivos
    await new Promise(r=>setTimeout(r,4000));
    // 3. Resetear SOLO lo que debe reiniciar — antes esto era un .set()
    // completo que borraba gameMode, groupId, hostName, hostPlayerId,
    // presence y hostOnline sin querer (quedaban huérfanos tras la revancha).
    const freshPlayers=prevPlayers.map(p=>({...p,total:0,rounds:[]}));
    await dbRef.current.update("rooms/"+roomCode,{
      round:1,roundScores:{},finished:false,winner:null,
      players:freshPlayers,rematchPending:false,forceEnded:false,
      gameStartedAt:Date.now() // partida nueva = identificador nuevo para estadísticas
    });
    // IMPORTANTE: winnerShown se reactiva recién AQUÍ, con la sala ya
    // limpia — no al principio de la función. Antes, al resetearlo desde
    // el inicio, el listener todavía activo podía recibir el paso 1
    // (rematchPending:true) con finished/winner viejos del juego 1 sin
    // limpiar todavía, disparar la celebración vieja de nuevo, y volver a
    // dejar winnerShown en true antes de que empezara el juego 2 —
    // bloqueando la celebración real cuando el juego 2 sí terminaba.
    winnerShown.current=false;
    setRematchPending(false);setTab("round");
    subscribe(roomCode,dbRef.current);
  }

  // Cuando el no-host termina la animación, la sala ya fue reseteada
  function onRematchAnimDone(){
    // BUG FIX: a los no-host (jugadores normales Y espectadores) nunca se
    // les reseteaba winnerShown tras una revancha — solo el host lo hacía
    // (dentro de startRematch). Como el listener de arriba solo dispara la
    // celebración/guardado de stats cuando "!winnerShown.current", cualquier
    // cliente que NO fuera host se quedaba con winnerShown en true para
    // siempre después de la partida 1, y silenciosamente dejaba de detectar
    // el fin de la partida 2, 3, etc. (sin celebración, sin sonido). Esto es
    // justo lo que reportaste en "Marcador en vivo": la 2ª celebración en
    // adelante no aparecía porque nunca se resetaba en ese cliente.
    winnerShown.current=false;
    setRematchPending(false);setWinner(null);setTab("round");
  }

  async function submitScore(pid,score,method,breakdown){
    snd('score');
    const cur=room&&room.roundScores||{};
    var entry={score:score,method:method};
    if(breakdown)entry.breakdown=breakdown;
    var newRoundScores=Object.assign({},cur);
    newRoundScores[pid]=entry;
    await dbRef.current.update("rooms/"+roomCode,{roundScores:newRoundScores,lastActivityAt:Date.now()});
  }
  async function undoScore(pid){
    snd('tap');
    const ns={...room?.roundScores};delete ns[pid];
    await dbRef.current.update("rooms/"+roomCode,{roundScores:ns,lastActivityAt:Date.now()});
  }
  async function finalizeRound(){
    snd('round');
    const newPlayers=room.players.map(p=>{
      const e=room.roundScores?.[p.id];const pts=e?e.score:0;
      var roundEntry={score:pts,method:e?.method||"zero"};if(e&&e.breakdown)roundEntry.breakdown=e.breakdown;
      return{...p,total:p.total+pts,rounds:[...(p.rounds||[]),roundEntry]};
    });
    const target=room.winTarget||WIN;
    const maxScore=Math.max(...newPlayers.map(p=>p.total));
    const champs=newPlayers.filter(p=>p.total>=target&&p.total===maxScore);
    const isFinished=champs.length>0;
    const winner=champs.length===1?champs[0]:{tied:true,players:champs,total:maxScore,name:champs.map(p=>p.name).join(" & "),emoji:""};
    await dbRef.current.update("rooms/"+roomCode,{players:newPlayers,roundScores:{},round:isFinished?room.round:room.round+1,finished:isFinished,winner:isFinished?winner:null,lastActivityAt:Date.now()});
  }

  async function enterGame({names,demo,spectator,code,playerId,customEmojis,customColors,customUids,hostName,asHost,gameMode,groupId,winTarget,autoCloseRound}){
    const db=makeDB(demo);dbRef.current=db;
    let roomCode2=code;
    let resolvedMyPlayerId=playerId; // por default, el playerId que ya te pasaron (reconectar, unirte, etc.)
    const firstPlayerName=names&&names[0]?names[0].trim():"";
    if(!code){
      roomCode2=demo?"DEMO":uid4();
      const groupId2=groupId||null;
      const myNameLower=(hostName||firstPlayerName||"").trim().toLowerCase();
      const playersList=names.map((name,i)=>({
        id:uid(),name:name.trim(),
        emoji:(customEmojis&&customEmojis[i])||EMOJIS[i%EMOJIS.length],
        color:(customColors&&customColors[i])||COLORS[i%COLORS.length],
        // uid de cuenta real (si se conoce) — clave para que las estadísticas
        // de fin de partida se guarden bajo TU cuenta, no adivinando por
        // nombre (ver saveGameStats más abajo).
        uid:(customUids&&customUids[i])||null,
        total:0,rounds:[]
      }));
      // Ligar al creador a su propia fila (si su nombre está en la lista de
      // jugadores) desde el arranque — así aparece "tú" y la insignia HOST
      // de inmediato, no solo después de una transferencia explícita.
      const myRow=playersList.find(p=>p.name.toLowerCase()===myNameLower);
      resolvedMyPlayerId=myRow?myRow.id:null;
      await db.set("rooms/"+roomCode2,{
        code:roomCode2,round:1,roundScores:{},finished:false,winner:null,createdAt:Date.now(),
        gameMode:gameMode||"classic",
        groupId:groupId2,
        // Guardar nombre del host para permitir reconexión
        hostName: hostName||firstPlayerName,
        hostPlayerId: resolvedMyPlayerId, // el creador ya arranca visible como host
        gameStartedAt: Date.now(), // identifica ESTA partida en curso; se renueva en cada revancha
        winTarget: winTarget||WIN, // meta de puntos configurable — 200 por default
        autoCloseRound: !!autoCloseRound, // configurable desde la creación, se puede cambiar después
        players:playersList
      });
    }
    // Publish room to group if applicable
    if(groupId&&!demo&&!code){
      try{
        await _db.ref("groups/"+groupId+"/currentRoom").set(roomCode2);
        const u2=_auth&&_auth.currentUser;
        if(u2&&u2.uid)await _db.ref("presence/"+groupId+"/"+u2.uid+"/status").set("in-lobby");
      }catch(e){console.log("Group presence error:",e);}
    }
    // Notificar a cada jugador de la lista que tenga cuenta registrada —
    // antes esto SOLO pasaba si la partida estaba asociada a un grupo; si
    // elegías jugadores por "Amigos" directo (sin grupo), nunca les llegaba
    // aviso aunque literalmente fueran parte de la sala.
    if(!demo&&!code&&names&&names.length>0){
      const myName=(hostName||firstPlayerName||"").trim().toLowerCase();
      names.forEach(async n=>{
        const nm=(n||"").trim();
        if(!nm||nm.toLowerCase()===myName)return; // no te notificas a ti mismo
        try{
          const idxSnap=await _db.ref("userIndex/"+fbKey(nm)).once("value");
          const idxVal=idxSnap.val();
          if(idxVal&&idxVal.uid){
            await _db.ref("users/"+idxVal.uid+"/pendingInvite").set({
              code:roomCode2,hostName:hostName||firstPlayerName||"",
              gameMode:gameMode||"classic",at:Date.now()
            });
          }
        }catch(e){}
      });
    }
    setDemoMode(demo);setRoomCode(roomCode2);setIsSpectator(spectator||false);
    setMyPlayerId(resolvedMyPlayerId!==undefined?resolvedMyPlayerId:null);
    subscribe(roomCode2,db);
    // Presencia: marcar jugador/host online
    if(!demo && resolvedMyPlayerId){
      const presRef=_db.ref("rooms/"+roomCode2+"/presence/"+resolvedMyPlayerId);
      presRef.set(true);
      presRef.onDisconnect().remove();
    }
    if(!demo && (!resolvedMyPlayerId||asHost) && !spectator){
      // host online (nuevo o reconectando)
      const hostRef=_db.ref("rooms/"+roomCode2+"/hostOnline");
      hostRef.set(true);
      hostRef.onDisconnect().set(false);
    }
    setScreen("game");setTab(spectator?"scores":"round");
    winnerShown.current=false;prevSortedRef.current=[];
  }

  const allDone=room&&room.players.every(p=>room.roundScores?.[p.id]!==undefined);
  const sorted=room?[...room.players].sort((a,b)=>b.total-a.total):[];
  // El host puede ser el creador original (playerId null) O, si hubo una
  // transferencia explícita (room.hostPlayerId), quien tenga ese playerId.
  const isHost=!isSpectator&&(room&&room.hostPlayerId!=null?myPlayerId===room.hostPlayerId:!myPlayerId);

  // Reafirmar hostOnline en cada reconexión real (no solo al conectar la
  // primera vez) — mismo patrón que el heartbeat de presencia global.
  // Antes, si el host bloqueaba el celular, hostOnline se quedaba en
  // false para siempre aunque volviera a estar activo, mostrando el
  // aviso de "se desconectó" a los demás aunque ya no fuera cierto.
  React.useEffect(()=>{
    if(!roomCode||demoMode||!isHost)return;
    const connRef=_db.ref('.info/connected');
    const h=snap=>{
      if(snap.val()===true){
        const hostRef=_db.ref('rooms/'+roomCode+'/hostOnline');
        hostRef.onDisconnect().set(false);
        hostRef.set(true);
      }
    };
    connRef.on('value',h);
    return()=>connRef.off('value',h);
  },[roomCode,isHost,demoMode]);

  // ── AUTH GATE ──────────────────────────────────────────────
  if(!authChecked)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"100dvh",background:"var(--dark)"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:"3rem",marginBottom:12,animation:"fl 1.5s infinite"}}>🎴</div>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".75rem",
          color:"rgba(255,255,255,.3)",letterSpacing:3}}>{T.loadingCaps}</div>
        {stuckLoading&&(
          <div style={{marginTop:20}}>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
              color:"rgba(230,57,70,.7)",marginBottom:10,maxWidth:260}}>
              {T.loadingSlow}
            </div>
            <button onClick={()=>window.location.reload()} style={{
              background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.2)",
              color:"#fff",borderRadius:10,padding:"8px 16px",cursor:"pointer",
              fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:".8rem"}}>
              {T.reloadPage}
            </button>
          </div>
        )}
      </div>
    </div>
  );
  if(!authUser)return<AuthScreen T={T} onAuth={user=>{setAuthUser(user);setAuthChecked(true);}}/>;
  if(modBlock)return<AccountBlockedScreen mod={modBlock} T={T}/>;
  if(screen==="home")return<>
    {warnAlert&&<WarnAlertModal mod={warnAlert} onDismiss={dismissWarnAlert} T={T}/>}
    {homeNotice&&(
      <div onClick={()=>setHomeNotice(null)} style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",
        zIndex:400,maxWidth:"min(92vw,420px)",background:"linear-gradient(135deg,rgba(230,57,70,.95),rgba(123,45,139,.95))",
        borderRadius:16,padding:"12px 20px",boxShadow:"0 10px 34px rgba(0,0,0,.5)",cursor:"pointer",
        animation:"roundToastIn .4s cubic-bezier(.34,1.56,.64,1) both, roundToastOut .4s ease-in 4.4s both"}}>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".85rem",color:"#fff",letterSpacing:1}}>{homeNotice}</span>
      </div>
    )}
    <HomeScreen onEnter={enterGame} onLobby={createLobby} sessions={sessions} setSessions={setSessions} aiConfig={aiConfig} setAiConfig={setAiConfig} lang={lang} setLang={setLang} T={T} authUser={authUser} reconnectReady={reconnectReady} lastKnownCode={lastKnownCode} onReconnect={reconnectToLastRoom} onDismissReconnect={()=>{setReconnectReady(false);try{localStorage.removeItem('f7lastCode');}catch(e){};}}/>
  </>;
  if(isSpectator)return<SpectatorScreen room={room} sorted={sorted} roomCode={roomCode} demoMode={demoMode} onBack={leaveGame} winner={winner} onRematchAnimDone={onRematchAnimDone} T={T}/>;

  // Animación revancha para TODOS (host la ve también para sincronía visual)
  if(rematchPending){
    return<RematchOverlay onDone={onRematchAnimDone} T={T}/>;
  }

  return(
    <div className="wrap">
      <div className="hdr" style={{alignItems:"flex-start"}}>
        <div style={{display:"flex",flexDirection:"column",gap:5,minWidth:0,overflow:"hidden"}}>
          <HeroLogoCompact T={T}/>
          {room&&room.gameMode&&GAME_MODES[room.gameMode]&&(()=>{
            const gm=GAME_MODES[room.gameMode];
            return gm.image
              ? <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:2}}>
                  <img src={gm.image} alt={gm.name+" "+gm.subtitle} title={gm.subtitle}
                    style={{height:22,width:"auto",flexShrink:0,
                      filter:"drop-shadow(0 0 5px "+gm.glow+") drop-shadow(0 2px 4px rgba(0,0,0,.4))"}}
                    onError={e=>{e.target.style.display="none";}}/>
                  {gm.labelEs&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".46rem",
                    letterSpacing:.5,color:gm.color,whiteSpace:"nowrap"}}>
                    {T.modeLbl} {gm.id==="venganza"?T.modeLabelVenganza:T.modeLabelClassic}
                  </div>}
                </div>
              : <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",letterSpacing:1,
                  background:gm.badgeColor,border:"1px solid "+gm.badgeBorder,color:gm.color,
                  padding:"4px 9px",borderRadius:20,display:"flex",alignItems:"center",gap:4,
                  whiteSpace:"nowrap",flexShrink:0,marginLeft:2}}>
                  {gm.emoji} {gm.id.toUpperCase()}
                </div>;
          })()}
        </div>

        {/* Columna de controles — jerarquía: EN/Salir (chico, utilidad) arriba,
            tu cuenta en medio, código de sala abajo (el más grande, lo más
            consultado durante la partida) */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          <div style={{display:"flex",gap:6}}>
            <LanguageDropdown lang={lang} setLang={setLang} compact/>
            <button onClick={()=>{snd('tap');leaveGame();}}
              style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",
                color:"rgba(255,255,255,.55)",borderRadius:9,cursor:"pointer",
                fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:".72rem",
                width:58,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {T.exitBtn}
            </button>
          </div>

          {authUser&&!authUser.isAnonymous&&(
            <div style={{display:"flex",alignItems:"center",gap:6,
              background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",
              borderRadius:20,padding:"4px 10px 4px 6px",cursor:"pointer",whiteSpace:"nowrap"}}
              onClick={()=>{if(confirm(T.confirmSignOut))signOut();}}>
              {authUser.photoURL
                ? <img src={authUser.photoURL} style={{width:20,height:20,borderRadius:"50%",objectFit:"cover"}} alt=""/>
                : <div style={{width:20,height:20,borderRadius:"50%",background:"var(--y)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontFamily:"'Anton',sans-serif",fontSize:".65rem",color:"var(--dark)"}}>
                    {(authUser.displayName||authUser.email||"?")[0].toUpperCase()}
                  </div>
              }
              <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                color:"rgba(255,255,255,.6)",letterSpacing:1,maxWidth:80,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {(authUser.displayName||authUser.email||"").split(" ")[0]}
              </span>
            </div>
          )}

          <div className={"badge "+(demoMode?"demo":"")} style={{margin:0}}>
            <span className={"dot "+(demoMode?"demo":"")}/>
            {demoMode?T.demoTag:<>{T.roomLabelInline} <span className="code-mono">{roomCode}</span></>}
          </div>
        </div>
      </div>
      <div className="nav">
        {[["round",T.round],["scores",T.table],["history",T.history]].map(([id,lbl])=>(
          <button key={id} className={"nb "+(tab===id?"on":"")} onClick={()=>{snd('tap');setTab(id);}}>{lbl}</button>
        ))}
      </div>
      <div className="page">
        {demoMode&&tab==="round"&&<div className="demo-banner">🟣 <span>{T.demoModeLbl}</span></div>}
        {tab==="round"&&!room&&<div style={{textAlign:"center",paddingTop:60}}><div className="spin" style={{margin:"0 auto 16px"}}/><p style={{color:"rgba(255,255,255,.4)",fontWeight:700}}>{T.connecting}</p></div>}
        {tab==="round"&&room&&<RoundTab room={room} allDone={allDone} onSubmit={submitScore} onUndo={undoScore} onFinalize={finalizeRound} myPlayerId={myPlayerId} isHost={isHost} demoMode={demoMode} aiConfig={aiConfig} setAiConfig={setAiConfig} onRematch={startRematch} onEndGame={leaveGame} onTransferHost={transferHost} onEndGameForAll={endGameForAll} roomCode={roomCode} T={T}/>}
        {tab==="scores"&&room&&<ScoreTab sorted={sorted} room={room} T={T}/>}
        {tab==="history"&&<HistoryTab sessions={sessions} onClear={()=>{setSessions([]);try{localStorage.removeItem("f7sess")}catch{}}} T={T}/>}
      </div>
      {winner&&<WinnerScreen winner={winner} celebrationType={celebrationType} players={room&&room.players} target={(room&&room.winTarget)||WIN} onClose={()=>{setWinner(null);setTab("scores");}} onRematch={()=>{if(room&&room.players)startRematch(room.players);}} isHost={isHost} T={T}/>}
    </div>
  );
}


// ── TEST: LOGO ANIMADO + FRASE ROTATIVA ─────────────────────────
// Prueba visual pedida por Jonathan (14-ago-2026): en vez del 🎴 + texto
// "FLIP 7" / "Race to 200!", probar el logo ilustrado con una animación
// tipo "flip de carta" (inspirada en el flip-card 3D de CodePen) y una
// frase del juego con efecto de texto rotativo (inspirado en el
// SplitText de anime.js: caracteres entran en cascada desde el centro).
// Para volver a la versión anterior en cualquier momento, basta con
// poner HERO_LOGO_TEST=false — el bloque original no se tocó, sigue
// tal cual más abajo en AuthScreen y HomeScreen.
const HERO_LOGO_TEST=true;

const HERO_PHRASES=[
  "FLIP. SUMA. GANA.",
  "¿PLANTAS O ARRIESGAS?",
  "SIN REPETIR, SIN PASARTE",
  "CADA CARTA CUENTA",
  "LA SUERTE ESTÁ ECHADA",
  "CORRE A LA META"
];

function RollingTagline({phrases=HERO_PHRASES,interval=2800,compact=false}){
  const[i,setI]=React.useState(0);
  React.useEffect(()=>{
    const t=setInterval(()=>setI(v=>(v+1)%phrases.length),interval);
    return()=>clearInterval(t);
  },[phrases.length,interval]);
  const phrase=phrases[i];
  const chars=phrase.split("");
  const mid=(chars.length-1)/2;
  return(
    <div className={compact?"rolling-tag-sm":"hero-tag rolling-tag"} aria-live="polite">
      <div key={i} className="rt-row">
        {chars.map((c,idx)=>(
          <span key={idx} className="rt-char" style={{animationDelay:(Math.abs(idx-mid)*28)+"ms"}}>
            {c===" "?" ":c}
          </span>
        ))}
      </div>
    </div>
  );
}

function HeroLogo({T}){
  return(
    <div className="hero-logo-test">
      <div className="hero-flip-wrap">
        <img src="score7-logo.png" alt="Flip 7" className="hero-flip-img"/>
      </div>
      <div className="hero-brand-sub">FLIP 7 · UNOFFICIAL SCORETRACK</div>
      <RollingTagline phrases={T?T.heroPhrases:HERO_PHRASES}/>
    </div>
  );
}

// Versión chica del logo animado — para el header persistente de la
// partida en curso, donde antes iba el texto plano "FLIP7 / Race to
// 200!". Mismo logo + "unofficial" + frase rotativa, pero a tamaño de
// encabezado en vez de pantalla completa.
function HeroLogoCompact({T}){
  return(
    <div className="hero-logo-compact">
      <img src="score7-logo.png" alt="Flip 7" className="hero-flip-img-sm"/>
      <div style={{minWidth:0,overflow:"hidden"}}>
        <div className="hero-brand-sub-sm">FLIP 7 · UNOFFICIAL SCORETRACK</div>
        <RollingTagline compact phrases={T?T.heroPhrases:HERO_PHRASES}/>
      </div>
    </div>
  );
}

// ── PANTALLA DE BLOQUEO — cuenta baneada o suspendida ───────────
// Se muestra en vez del resto de la app cuando el estado en vivo de
// /moderation/{uid} indica un baneo permanente o una suspensión que
// todavía no vence (ver el efecto que la revisa en App, justo después
// del AUTH GATE).
// Aviso NO bloqueante de advertencia ('warned') -- a diferencia de
// AccountBlockedScreen, esto es un modal flotante sobre Home: el usuario
// puede seguir usando la app con normalidad, solo se le informa que un
// admin le llamó la atención y por qué, y lo reconoce con un botón.
function WarnAlertModal({mod,onDismiss,T}){
  return(
    <div className="mbg" style={{zIndex:500}}>
      <div className="ms" style={{maxWidth:380,textAlign:"center"}}>
        <div style={{fontSize:"2.4rem",marginBottom:10}}>⚠️</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.1rem",color:"var(--or)",marginBottom:8}}>
          {T.warnTitle}
        </div>
        <div style={{color:"rgba(255,255,255,.75)",fontSize:".85rem",lineHeight:1.5,marginBottom:14}}>
          {mod&&mod.reason
            ? mod.reason
            : T.warnDefaultMsg}
        </div>
        {mod&&mod.warnCount>1&&(
          <div style={{color:"rgba(255,255,255,.4)",fontSize:".7rem",marginBottom:14}}>
            {T.warnCountMsg.replace('{n}',mod.warnCount)}
          </div>
        )}
        <button className="btn btn-y" onClick={onDismiss} style={{width:"100%"}}>{T.understood}</button>
      </div>
    </div>
  );
}
function AccountBlockedScreen({mod,T}){
  const banned=mod&&mod.status==="banned";
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"100dvh",background:"var(--dark)",padding:20}}>
      <div style={{textAlign:"center",maxWidth:340}}>
        <div style={{fontSize:"3rem",marginBottom:14}}>{banned?"🚫":"⏳"}</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.25rem",color:"var(--y)",marginBottom:8}}>
          {banned?T.accBlockedTitle:T.accSuspendedTitle}
        </div>
        <div style={{color:"rgba(255,255,255,.7)",fontSize:".85rem",lineHeight:1.5,marginBottom:12}}>
          {banned
            ? T.accBlockedDesc
            : T.accSuspendedDesc}
        </div>
        {mod&&mod.reason&&(
          <div style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",
            borderRadius:12,padding:"10px 14px",fontSize:".78rem",color:"rgba(255,255,255,.6)",marginBottom:12}}>
            {T.accReason} {mod.reason}
          </div>
        )}
        {!banned&&mod&&mod.until&&(
          <div style={{fontSize:".75rem",color:"rgba(255,255,255,.4)",marginBottom:16}}>
            {T.accReturnDate.replace('{date}',new Date(mod.until).toLocaleString(T.locale,{dateStyle:"medium",timeStyle:"short"}))}
          </div>
        )}
        <div style={{fontSize:".72rem",color:"rgba(255,255,255,.35)",marginBottom:16}}>
          {T.accContact}
        </div>
        <button onClick={()=>signOut()} style={{
          background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.2)",
          color:"#fff",borderRadius:10,padding:"10px 20px",cursor:"pointer",
          fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:".85rem"}}>
          {T.signOutBtn}
        </button>
      </div>
    </div>
  );
}

// ── AUTHSCREEN — Google / Email / Anónimo ──────────────────────
function AuthScreen({onAuth,T}){
  const[mode,setMode]=React.useState("main"); // main | email-login | email-signup
  const[email,setEmail]=React.useState("");
  const[password,setPassword]=React.useState("");
  const[name,setName]=React.useState("");
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");

  const[waitSecs,setWaitSecs]=React.useState(0);

  async function handleGoogle(){
    setBusy(true);setErr("");setWaitSecs(0);
    const timer=setInterval(()=>setWaitSecs(s=>s+1),1000);
    try{
      console.log("[Auth] Abriendo popup de Google…");
      const r=await signInGoogle(); // ya trae su propio respaldo a redirect si el popup falla
      console.log("[Auth] Login resuelto, usuario:",r&&r.user&&r.user.uid);
      if(r&&r.user){ // si cayó a redirect, r es undefined y la página ya está navegando afuera
        await saveUserProfile(r.user);
        onAuth(r.user);
      }
    }catch(e){
      console.log("[Auth] Error en popup:",e.code,e.message);
      if(e.code==="auth/popup-closed-by-user"){
        setErr(""); // cerraste la ventana a propósito, no es error real
      }else{
        setErr(e.message||T.errGoogle);
      }
    }
    clearInterval(timer);setBusy(false);
  }
  // Salida manual para cuando el popup se queda colgado sin lanzar ningún
  // error que signInGoogle() pueda atrapar (pasa en algunos navegadores de
  // escritorio con cookies de terceros bloqueadas) -- manda al usuario por
  // redirect directamente en vez de dejarlo esperando indefinidamente.
  async function handleGoogleRedirectManual(){
    snd("tap");setErr("");
    try{ await signInGoogleRedirect(); }
    catch(e){ setErr(e.message||T.errGoogleContinue);setBusy(false); }
  }

  async function handleEmailLogin(){
    if(!email||!password){setErr(T.errEnterEmailPass);return;}
    setBusy(true);setErr("");
    try{
      const r=await signInEmail(email,password);
      await saveUserProfile(r.user);
      onAuth(r.user);
    }catch(e){
      if(e.code==="auth/user-not-found"||e.code==="auth/wrong-password"||e.code==="auth/invalid-login-credentials"||e.code==="auth/invalid-credential"){
        // Averiguar si ese email ya está registrado con otro método (típicamente Google)
        try{
          const methods=await _auth.fetchSignInMethodsForEmail(email);
          if(methods.includes("google.com")&&!methods.includes("password")){
            setErr(T.errRegisteredWithGoogle);
          }else{
            setErr(T.errWrongCreds);
          }
        }catch{setErr(T.errWrongCreds);}
      }
      else setErr(e.message||T.errLoginFailed);
    }
    setBusy(false);
  }

  async function handleEmailSignup(){
    if(!name.trim()){setErr(T.errEnterName);return;}
    if(!email||!password){setErr(T.errEnterEmailPass);return;}
    if(password.length<6){setErr(T.errMinChars);return;}
    setBusy(true);setErr("");
    try{
      const r=await signUpEmail(email,password,name.trim());
      await saveUserProfile(r.user);
      onAuth(r.user);
    }catch(e){
      if(e.code==="auth/email-already-in-use")
        setErr(T.errEmailInUse);
      else setErr(e.message||T.errSignupFailed);
    }
    setBusy(false);
  }

  async function handleAnon(){
    setBusy(true);setErr("");
    try{
      const r=await signInAnon();
      onAuth(r.user);
    }catch(e){
      if(e.code==="auth/admin-restricted-operation"){
        setErr(T.errAnonDisabled);
      } else {
        setErr(e.message||T.errAnonFailed);
      }
    }
    setBusy(false);
  }

  return(
    <div className="wrap"><div className="page" style={{paddingTop:32,paddingBottom:40}}>
      {/* Logo */}
      <div style={{textAlign:"center",marginBottom:32}}>
        {HERO_LOGO_TEST?<HeroLogo T={T}/>:<>
        <div style={{fontSize:"3.5rem",marginBottom:8}}>🎴</div>
        <div className="hero-logo">FLIP 7</div>
        <div className="hero-tag">Race to 200!</div>
        </>}
      </div>

      {mode==="main"&&(<>
        {/* Google */}
        <button className="btn" onClick={handleGoogle} disabled={busy} style={{
          gap:12,marginBottom:10,
          background:"#fff",border:"none",color:"#222",
          boxShadow:"0 4px 20px rgba(0,0,0,.3)",fontSize:"1.05rem",
          opacity:busy?.6:1
        }}>
          {/* Google icon */}
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {busy?T.waitingGoogle:T.continueGoogle}
        </button>
        {busy&&(
          <div style={{textAlign:"center",marginBottom:10,marginTop:-4}}>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
              color:"rgba(255,255,255,.4)"}}>
              {T.waitLong.replace('{n}',waitSecs)}
            </div>
            {waitSecs>=5&&(
              <div onClick={handleGoogleRedirectManual}
                style={{marginTop:6,fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
                  color:"var(--t)",textDecoration:"underline",cursor:"pointer"}}>
                {T.tryOtherMethod}
              </div>
            )}
          </div>
        )}

        {/* Email */}
        <button className="btn" onClick={()=>setMode("email-login")} disabled={busy} style={{
          gap:10,marginBottom:10,
          background:"rgba(255,255,255,.07)",border:"2px solid rgba(255,255,255,.15)",
          color:"rgba(255,255,255,.85)",fontSize:"1rem"
        }}>
          {T.continueEmail}
        </button>

        {/* Divider */}
        <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0"}}>
          <div style={{flex:1,height:1,background:"rgba(255,255,255,.1)"}}/>
          <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
            color:"rgba(255,255,255,.3)",letterSpacing:2}}>{T.orNoAccount}</span>
          <div style={{flex:1,height:1,background:"rgba(255,255,255,.1)"}}/>
        </div>

        {/* Anónimo */}
        <button className="btn" onClick={handleAnon} disabled={busy} style={{
          background:"rgba(46,196,182,.1)",border:"2px solid rgba(46,196,182,.35)",
          color:"var(--t)",fontSize:".92rem",opacity:busy?.6:1
        }}>
          {T.playNoAccount}
        </button>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
          color:"rgba(255,255,255,.2)",textAlign:"center",marginTop:8,letterSpacing:1}}>
          {T.noAccountWarnHist}
        </div>

        {err&&<div style={{marginTop:14,padding:"10px 13px",background:"rgba(230,57,70,.15)",
          border:"1px solid rgba(230,57,70,.4)",borderRadius:10,
          fontFamily:"'Righteous',sans-serif",fontSize:".75rem",color:"var(--r)"}}>{err}</div>}
      </>)}

      {(mode==="email-login"||mode==="email-signup")&&(<>
        <button onClick={()=>{setMode("main");setErr("");}} style={{
          background:"none",border:"none",color:"rgba(255,255,255,.4)",
          fontFamily:"'Righteous',sans-serif",fontSize:".75rem",letterSpacing:1,
          cursor:"pointer",marginBottom:20,display:"flex",alignItems:"center",gap:5
        }}>{T.back}</button>

        {/* Tabs login / signup */}
        <div style={{display:"flex",gap:6,marginBottom:20}}>
          {[["email-login",T.loginTab],["email-signup",T.createAccount]].map(([m,lbl])=>(
            <button key={m} onClick={()=>{setMode(m);setErr("");}} style={{
              flex:1,padding:"10px",borderRadius:11,cursor:"pointer",
              fontFamily:"'Righteous',sans-serif",fontSize:".75rem",letterSpacing:1,
              background:mode===m?"rgba(245,200,0,.15)":"rgba(255,255,255,.04)",
              border:"2px solid "+(mode===m?"rgba(245,200,0,.5)":"rgba(255,255,255,.1)"),
              color:mode===m?"var(--y)":"rgba(255,255,255,.4)"
            }}>{lbl}</button>
          ))}
        </div>

        {mode==="email-signup"&&(
          <input className="inp" placeholder={T.namePlaceholder} value={name}
            onChange={e=>setName(e.target.value)} style={{marginBottom:8}}/>
        )}
        <input className="inp" placeholder={T.emailPlaceholder} type="email" value={email}
          onChange={e=>setEmail(e.target.value)} style={{marginBottom:8}}/>
        <input className="inp" placeholder={T.passwordPlaceholder} type="password"
          value={password} onChange={e=>setPassword(e.target.value)} style={{marginBottom:16}}/>

        {err&&<div style={{marginBottom:12,padding:"10px 13px",background:"rgba(230,57,70,.15)",
          border:"1px solid rgba(230,57,70,.4)",borderRadius:10,
          fontFamily:"'Righteous',sans-serif",fontSize:".75rem",color:"var(--r)"}}>{err}</div>}

        <button className="btn btn-y" disabled={busy}
          onClick={mode==="email-login"?handleEmailLogin:handleEmailSignup}>
          {busy?T.waitingDots:(mode==="email-login"?T.loginBtn:T.signupBtn)}
        </button>
      </>)}
    </div></div>
  );
}

// Formatea "hace cuánto" para últimas conexiones — global, la usan tanto
// GroupsScreen como PersonalDashboard (Amigos).
function fmtAgo(ts,T){
  T=T||LANGS.es;
  const diff=Date.now()-ts;
  if(diff<60000)return T.agoNow;
  if(diff<3600000)return T.agoMin.replace('{n}',Math.floor(diff/60000));
  if(diff<86400000)return T.agoH.replace('{n}',Math.floor(diff/3600000));
  return T.agoD.replace('{n}',Math.floor(diff/86400000));
}

// ── UPGRADE ACCOUNT MODAL — se dispara al tocar algo bloqueado en modo
// anónimo. Vincula la sesión actual en vez de crear una cuenta nueva.
function UpgradeAccountModal({onClose,onDone,featureLabel,T}){
  T=T||LANGS.es;
  const[mode,setMode]=React.useState("main");
  const[email,setEmail]=React.useState("");
  const[password,setPassword]=React.useState("");
  const[name,setName]=React.useState("");
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");

  const[waitSecs,setWaitSecs]=React.useState(0);

  async function handleGoogle(){
    setBusy(true);setErr("");setWaitSecs(0);
    const timer=setInterval(()=>setWaitSecs(s=>s+1),1000);
    try{
      const r=await linkAnonToGoogle(); // ya trae su propio respaldo a redirect si el popup falla
      if(r&&r.user){ // si cayó a redirect, r es undefined y la página ya está navegando afuera
        await saveUserProfile(r.user);
        onDone(r.user);
      }
    }catch(e){
      if(e.code==="auth/popup-closed-by-user")setErr("");
      else setErr(e.message||T.errGoogle);
    }
    clearInterval(timer);setBusy(false);
  }
  // Misma salida manual que en AuthScreen -- por si el popup de vinculación
  // se queda colgado sin lanzar ningún error atrapable.
  async function handleGoogleRedirectManual(){
    snd("tap");setErr("");
    try{ await linkAnonToGoogleRedirect(); }
    catch(e){ setErr(e.message||T.errGoogleContinue);setBusy(false); }
  }
  async function handleEmail(){
    if(!name.trim()){setErr(T.errEnterName);return;}
    if(!email||!password){setErr(T.errEnterEmailPass);return;}
    if(password.length<6){setErr(T.errMinChars);return;}
    setBusy(true);setErr("");
    try{
      const r=await linkAnonToEmail(email,password,name.trim());
      await saveUserProfile(r.user);
      onDone(r.user);
    }catch(e){
      if(e.code==="auth/email-already-in-use")
        setErr(T.errEmailInUse);
      else setErr(e.message||T.errSignupFailed);
    }
    setBusy(false);
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--dark,#14141f)",
        border:"1px solid rgba(255,255,255,.12)",borderRadius:18,padding:22,
        maxWidth:360,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:"2rem",marginBottom:6}}>🔒</div>
          <div style={{fontFamily:"'Lilita One',sans-serif",fontSize:"1.05rem",color:"#fff"}}>
            {T.createAccountFor.replace('{feature}',featureLabel)}
          </div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
            color:"rgba(255,255,255,.4)",marginTop:6}}>
            {T.progressKept}
          </div>
        </div>

        {mode==="main"&&(<>
          <button onClick={handleGoogle} disabled={busy} style={{
            width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            padding:"12px",marginBottom:8,background:"#fff",border:"none",borderRadius:12,
            cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:".9rem",
            color:"#222",opacity:busy?.6:1}}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {busy?T.waitingGoogle:T.continueGoogle}
          </button>
          {busy&&(
            <div style={{textAlign:"center",marginBottom:8,fontFamily:"'Righteous',sans-serif",
              fontSize:".6rem",color:"rgba(255,255,255,.4)"}}>
              {T.waitLong.replace('{n}',waitSecs)}
              {waitSecs>=5&&(
                <div onClick={handleGoogleRedirectManual}
                  style={{marginTop:6,fontSize:".64rem",color:"var(--t)",
                    textDecoration:"underline",cursor:"pointer"}}>
                  {T.tryOtherMethod}
                </div>
              )}
            </div>
          )}
          <button onClick={()=>setMode("email")} disabled={busy} style={{
            width:"100%",padding:"12px",marginBottom:4,background:"rgba(255,255,255,.07)",
            border:"2px solid rgba(255,255,255,.15)",borderRadius:12,cursor:"pointer",
            fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:".9rem",
            color:"rgba(255,255,255,.85)"}}>
            {T.continueEmail}
          </button>
        </>)}

        {mode==="email"&&(<>
          <input className="inp" placeholder={T.namePlaceholder} value={name}
            onChange={e=>setName(e.target.value)} style={{marginBottom:8}}/>
          <input className="inp" placeholder={T.emailPlaceholder} type="email" value={email}
            onChange={e=>setEmail(e.target.value)} style={{marginBottom:8}}/>
          <input className="inp" placeholder={T.passwordPlaceholder} type="password"
            value={password} onChange={e=>setPassword(e.target.value)} style={{marginBottom:10}}/>
          <button className="btn btn-y" disabled={busy} onClick={handleEmail} style={{marginBottom:8}}>
            {busy?T.waitingDots:T.signupBtn}
          </button>
        </>)}

        {err&&<div style={{marginBottom:8,padding:"9px 12px",background:"rgba(230,57,70,.15)",
          border:"1px solid rgba(230,57,70,.4)",borderRadius:10,
          fontFamily:"'Righteous',sans-serif",fontSize:".7rem",color:"var(--r)"}}>{err}</div>}

        <button onClick={onClose} style={{width:"100%",background:"none",border:"none",
          color:"rgba(255,255,255,.35)",fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
          letterSpacing:1,cursor:"pointer",padding:"6px",marginTop:2}}>
          {T.notNow}
        </button>
      </div>
    </div>
  );
}

// ── PROFILESCREEN — emoji/color por defecto + celebración favorita ─────
// Se guarda en users/{uid}: defaultEmoji, defaultColor, preferredCelebration
// (0/1/2 o null="aleatoria"). HomeScreen los lee para pre-llenar tu propia
// fila al crear partida; App los lee para saber qué celebración mostrarte
// cuando SOS quien gana.
function ProfileScreen({authUser,onBack,onSaved,T}){
  const uid=authUser&&authUser.uid;
  const isAnon=authUser&&authUser.isAnonymous;
  const[loading,setLoading]=React.useState(true);
  const[emoji,setEmoji]=React.useState(EMOJIS[0]);
  const[avatar,setAvatar]=React.useState(null); // null = sin avatar ilustrado, usa el emoji
  const[color,setColor]=React.useState(COLORS[0]);
  const[nickname,setNickname]=React.useState('');
  const[celebration,setCelebration]=React.useState('random'); // 0|1|2|'random'
  const[saving,setSaving]=React.useState(false);
  const[ok,setOk]=React.useState('');
  // Seudónimo de invitado (sin cuenta) — vive solo en sessionStorage,
  // nunca se manda a Firebase (ver getAnonNickname arriba).
  const[anonNick,setAnonNick]=React.useState(()=>getAnonNickname());
  const[anonOk,setAnonOk]=React.useState('');

  React.useEffect(()=>{
    if(!uid||isAnon){setLoading(false);return;}
    _db.ref('users/'+uid).once('value').then(snap=>{
      const v=snap.val()||{};
      if(v.defaultEmoji)setEmoji(v.defaultEmoji);
      if(v.defaultAvatar)setAvatar(v.defaultAvatar);
      if(v.defaultColor)setColor(v.defaultColor);
      setNickname(v.nickname||'');
      setCelebration(v.preferredCelebration!=null?v.preferredCelebration:'random');
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[uid,isAnon]);

  async function save(){
    setSaving(true);setOk('');
    try{
      const profile={
        defaultEmoji:emoji,defaultAvatar:avatar,defaultColor:color,nickname:nickname.trim(),
        preferredCelebration:celebration==='random'?null:celebration
      };
      await _db.ref('users/'+uid).update(profile);
      snd('join');
      setOk(T.profileSaved);
      if(onSaved)onSaved(profile);
    }catch(e){setOk('❌ '+T.errorPrefixLbl+' '+e.message);}
    setSaving(false);
  }

  if(isAnon){
    const label=authUser.email||authUser.displayName||(T.guestLabel+' '+uid.slice(0,5));
    return(
    <div className="wrap"><div className="page" style={{paddingTop:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",
          color:"rgba(255,255,255,.5)",borderRadius:9,padding:"6px 12px",cursor:"pointer",
          fontFamily:"'Righteous',sans-serif",fontSize:".72rem"}}>{T.back}</button>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",letterSpacing:2,color:"var(--y)"}}>{T.profileTitle}</div>
      </div>

      {/* Identidad actual */}
      <div style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,.03)",
        border:"1px solid rgba(255,255,255,.08)",borderRadius:13,padding:"12px 14px",marginBottom:16}}>
        <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(255,255,255,.08)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.3rem",flexShrink:0}}>👤</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:900,fontSize:".85rem",color:"rgba(255,255,255,.85)",
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"var(--t)",letterSpacing:1,marginTop:2}}>
            {T.guestSessionLabel}
          </div>
        </div>
      </div>

      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"rgba(255,255,255,.4)",
        lineHeight:1.6,marginBottom:16}}>
        {T.guestExplain}
      </div>

      {/* Seudónimo temporal */}
      <p className="sec">{T.anonNickLabel}</p>
      <input className="inp" value={anonNick} maxLength={20} placeholder={T.anonNickPlaceholder}
        onChange={e=>setAnonNick(e.target.value)} style={{marginBottom:10}}/>
      {anonOk&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",color:"var(--gr)",
        textAlign:"center",marginBottom:10}}>{anonOk}</div>}
      <button className="btn btn-y" style={{marginBottom:20}} onClick={()=>{
        setAnonNickname(anonNick.trim());snd('join');
        setAnonOk('✅ '+T.savedSessionMsg);
      }}>{T.useThisNick}</button>

      <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:16,textAlign:"center"}}>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",color:"rgba(255,255,255,.35)",
          marginBottom:12,lineHeight:1.5}}>
          {T.wantSaveAcrossDevices}
        </div>
        <button onClick={()=>signOut()} className="btn btn-g" style={{maxWidth:280,margin:"0 auto"}}>{T.createAccount}</button>
      </div>
    </div></div>
    );
  }

  return(
    <div className="wrap"><div className="page" style={{paddingTop:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",
          color:"rgba(255,255,255,.5)",borderRadius:9,padding:"6px 12px",cursor:"pointer",
          fontFamily:"'Righteous',sans-serif",fontSize:".72rem"}}>{T.back}</button>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",letterSpacing:2,color:"var(--y)"}}>{T.profileTitle}</div>
      </div>

      {loading?(
        <div style={{textAlign:"center",paddingTop:30,color:"rgba(255,255,255,.3)",
          fontFamily:"'Righteous',sans-serif",fontSize:".75rem",letterSpacing:2}}>{T.loadingCaps}</div>
      ):(<>
        {/* Identidad actual */}
        <div style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,.03)",
          border:"1px solid rgba(255,255,255,.08)",borderRadius:13,padding:"12px 14px",marginBottom:16}}>
          {authUser.photoURL
            ? <img src={authUser.photoURL} style={{width:44,height:44,borderRadius:"50%",objectFit:"cover",flexShrink:0}} alt=""/>
            : <div style={{width:44,height:44,borderRadius:"50%",background:"var(--y)",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                fontFamily:"'Anton',sans-serif",fontSize:"1.1rem",color:"var(--dark)"}}>
                {(authUser.displayName||authUser.email||"?")[0].toUpperCase()}
              </div>
          }
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:900,fontSize:".85rem",color:"rgba(255,255,255,.85)",
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {authUser.displayName||authUser.email||T.providerAccount}
            </div>
            {authUser.email&&authUser.displayName&&
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.35)",
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:1}}>{authUser.email}</div>}
          </div>
          <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"var(--t)",
            background:"rgba(46,196,182,.1)",border:"1px solid rgba(46,196,182,.3)",borderRadius:20,
            padding:"4px 9px",letterSpacing:1,flexShrink:0,whiteSpace:"nowrap"}}>{providerLabel(authUser,T)}</span>
        </div>

        {/* Preview */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",marginBottom:18}}>
          <div style={{width:64,height:64,borderRadius:"50%",background:color+"22",
            border:"3px solid "+color,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:"2rem",boxShadow:"0 0 20px "+color+"55",overflow:"hidden"}}>
            {avatar
              ? <img src={"icons/avatars/"+avatar} alt="" style={{width:"78%",height:"78%",objectFit:"contain"}}/>
              : emoji}
          </div>
        </div>

        {/* Avatar ilustrado (opcional) — reemplaza al emoji donde se te ve
            en las partidas cuando está elegido. "Ninguno" vuelve al emoji. */}
        <p className="sec">{T.defaultAvatarLabel}</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
          <button onClick={()=>{snd('tap');setAvatar(null);}}
            style={{aspectRatio:"1",borderRadius:12,cursor:"pointer",display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",gap:2,
              background:!avatar?"rgba(245,200,0,.18)":"rgba(255,255,255,.04)",
              border:"2px solid "+(!avatar?"var(--y)":"rgba(255,255,255,.1)")}}>
            <span style={{fontSize:"1.1rem"}}>🚫</span>
            <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".5rem",color:"rgba(255,255,255,.5)"}}>{T.avatarNoneLabel}</span>
          </button>
          {AVATARS.map(a=>(
            <button key={a.file} onClick={()=>{snd('tap');setAvatar(a.file);}} title={a.label}
              style={{aspectRatio:"1",borderRadius:12,cursor:"pointer",padding:4,
                background:avatar===a.file?"rgba(245,200,0,.18)":"rgba(255,255,255,.04)",
                border:"2px solid "+(avatar===a.file?"var(--y)":"rgba(255,255,255,.1)"),
                display:"flex",alignItems:"center",justifyContent:"center"}}>
              <img src={"icons/avatars/"+a.file} alt={a.label} draggable="false"
                style={{width:"100%",height:"100%",objectFit:"contain"}}/>
            </button>
          ))}
        </div>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"rgba(255,255,255,.3)",
          marginBottom:16,lineHeight:1.5}}>{T.avatarOverridesEmoji}</div>

        {/* Seudónimo para partidas */}
        <p className="sec">{T.nickForGamesLabel}</p>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.3)",
          marginBottom:8,lineHeight:1.5}}>
          {T.nickForGamesDesc.replace('{provider}',providerLabel(authUser,T))}
        </div>
        <input className="inp" value={nickname} maxLength={20}
          placeholder={authUser.displayName||(authUser.email||"").split("@")[0]||T.nickForGamesPlaceholder}
          onChange={e=>setNickname(e.target.value)} style={{marginBottom:16}}/>

        {/* Emoji por defecto */}
        <p className="sec">{T.defaultEmojiLabel}</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:16}}>
          {EMOJIS.map((e,i)=>(
            <button key={i} onClick={()=>{snd('tap');setEmoji(e);}}
              style={{aspectRatio:"1",borderRadius:10,fontSize:"1.2rem",cursor:"pointer",
                background:emoji===e?"rgba(245,200,0,.18)":"rgba(255,255,255,.04)",
                border:"2px solid "+(emoji===e?"var(--y)":"rgba(255,255,255,.1)"),
                display:"flex",alignItems:"center",justifyContent:"center"}}>{e}</button>
          ))}
        </div>

        {/* Color por defecto */}
        <p className="sec">{T.defaultColorLabel}</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:18}}>
          {COLORS.map((c,i)=>(
            <button key={i} onClick={()=>{snd('tap');setColor(c);}}
              style={{aspectRatio:"1",borderRadius:"50%",cursor:"pointer",background:c,
                border:color===c?"3px solid #fff":"3px solid rgba(255,255,255,.15)",
                boxShadow:color===c?"0 0 12px "+c:"none"}}/>
          ))}
        </div>

        {/* Celebración favorita */}
        <p className="sec">{T.celebrationLabel}</p>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",
          marginBottom:10,lineHeight:1.5}}>
          {T.celebrationDesc}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {[
            {v:'random',icon:'🎲',label:T.celebRandom,sub:T.celebRandomSub},
            {v:0,icon:'🏆',label:T.celebOriginal,sub:T.celebOriginalSub},
            {v:1,icon:'🎆',label:T.celebExplosive,sub:T.celebExplosiveSub},
            {v:2,icon:'👑',label:T.celebCrowned,sub:T.celebCrownedSub},
            {v:3,icon:'🐒',label:T.celebJungle,sub:T.celebJungleSub},
            {v:4,icon:'😁',label:T.celebBeaming,sub:T.celebBeamingSub},
            {v:5,icon:'🔥',label:T.celebFire,sub:T.celebFireSub},
            {v:6,icon:'💪',label:T.celebBiceps,sub:T.celebBicepsSub},
            {v:7,icon:'🤣',label:T.celebHahaha,sub:T.celebHahahaSub},
            {v:8,icon:'🌈',label:T.celebRainbow,sub:T.celebRainbowSub},
            {v:9,icon:'😜',label:T.celebSquint,sub:T.celebSquintSub},
          ].map(opt=>(
            <button key={opt.v} onClick={()=>{snd('tap');setCelebration(opt.v);}}
              style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:12,cursor:"pointer",
                background:celebration===opt.v?"rgba(245,200,0,.1)":"rgba(255,255,255,.03)",
                border:"2px solid "+(celebration===opt.v?"rgba(245,200,0,.45)":"rgba(255,255,255,.08)"),
                textAlign:"left",width:"100%"}}>
              <span style={{fontSize:"1.4rem"}}>{opt.icon}</span>
              <span style={{flex:1}}>
                <div style={{fontWeight:900,fontSize:".85rem",color:celebration===opt.v?"var(--y)":"rgba(255,255,255,.8)"}}>{opt.label}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.3)",marginTop:2}}>{opt.sub}</div>
              </span>
              {celebration===opt.v&&<span style={{color:"var(--y)",fontSize:"1.1rem"}}>✓</span>}
            </button>
          ))}
        </div>

        {ok&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
          color:ok.indexOf('✅')===0?"var(--gr)":"var(--r)",textAlign:"center",marginBottom:10}}>{ok}</div>}
        <button className="btn btn-y" disabled={saving} onClick={save}>{saving?T.savingBtn:T.saveProfileBtn}</button>
      </>)}
    </div></div>
  );
}

// ── BUZÓN DE BUGS Y SUGERENCIAS ─────────────────────────────────
// Modal accesible desde el menú de Home. Cualquier jugador (con cuenta o
// anónimo) puede reportar un error o sugerir un juego nuevo -- se guarda en
// Firebase y aparece en el panel administrativo (admin.html).
function feedbackScreens(T){
  return[
    {v:"home",l:T.fsHome},{v:"create",l:T.fsCreate},{v:"join",l:T.fsJoin},
    {v:"round",l:T.fsRound},{v:"table",l:T.fsTable},{v:"spectator",l:T.fsSpectator},
    {v:"scanner",l:T.fsScanner},{v:"stats",l:T.fsStats},{v:"profile",l:T.fsProfile},
    {v:"groups",l:T.fsGroups},{v:"other",l:T.fsOther}
  ];
}
function feedbackCategories(T){
  return[
    {v:"crash",l:T.fcCrash},{v:"notsaved",l:T.fcNotSaved},{v:"ai",l:T.fcAi},
    {v:"connection",l:T.fcConnection},{v:"visual",l:T.fcVisual},{v:"other",l:T.fcOther}
  ];
}
// Los <select> nativos no siempre heredan bien los colores del tema en el
// popup de opciones (queda texto claro sobre fondo blanco en varios
// navegadores/WebViews, invisible) -- forzando el estilo directo en cada
// <option> se ve consistente en Chrome/Android (el WebView que usará el APK).
const OPTION_STYLE={background:"#1a1a2e",color:"#fff"};

function FeedbackModal({onClose,authUser,T}){
  const[type,setType]=React.useState("bug"); // bug | suggestion
  const[text,setText]=React.useState("");
  const[screen,setScreen]=React.useState("home");
  const[category,setCategory]=React.useState("crash");
  const[image,setImage]=React.useState(null); // {b64,mime,preview} | null
  const[imgErr,setImgErr]=React.useState("");
  const[sending,setSending]=React.useState(false);
  const[sent,setSent]=React.useState(false);
  const[err,setErr]=React.useState("");
  const fileRef=React.useRef();
  const FEEDBACK_SCREENS=feedbackScreens(T);
  const FEEDBACK_CATEGORIES=feedbackCategories(T);

  // Identidad FIJA, tomada de la misma cuenta con la que se inició sesión
  // (el mismo nombre que se ve en el pill del encabezado) -- ya no es un
  // campo de texto libre, así nadie puede escribir un nombre de broma.
  const identityLabel = (authUser&&!authUser.isAnonymous)
    ? (authUser.displayName||(authUser.email||"").split("@")[0]||T.noNameLabel)
    : T.anonPlayerLabel;

  // Comprime la captura igual que las fotos del escáner de cartas (mismo
  // patrón que ScanModal.handleFile): máx 1024px de lado, JPEG calidad .7.
  function handleImageFile(e){
    var f=e.target.files[0];if(!f)return;
    setImgErr("");
    var r=new FileReader();
    r.onload=function(ev){
      var imgEl=new Image();
      imgEl.onload=function(){
        var MAX=1024,w=imgEl.width,h=imgEl.height;
        if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}}
        var canvas=document.createElement("canvas");
        canvas.width=w;canvas.height=h;
        canvas.getContext("2d").drawImage(imgEl,0,0,w,h);
        var compressed=canvas.toDataURL("image/jpeg",.7);
        setImage({b64:compressed.split(",")[1],mime:"image/jpeg",preview:compressed});
      };
      imgEl.onerror=function(){setImgErr(T.couldntReadImage);};
      imgEl.src=ev.target.result;
    };
    r.readAsDataURL(f);
  }

  async function handleSubmit(){
    if(!text.trim()){setErr(T.feedbackEmptyErr);return;}
    setSending(true);setErr("");
    try{
      var path=type==="bug"?"feedback/bugs":"feedback/suggestions";
      var ref=_db.ref(path).push();
      var payload={
        text:text.trim().slice(0,2000),
        name:identityLabel,
        // Correo real solo para que el admin pueda dar seguimiento -- no se
        // muestra a otros jugadores, y el usuario nunca lo escribe a mano.
        email:(authUser&&!authUser.isAnonymous)?(authUser.email||null):null,
        uid:(authUser&&!authUser.isAnonymous)?authUser.uid:null,
        status:"new",
        createdAt:Date.now(),
        userAgent:(navigator.userAgent||"").slice(0,200)
      };
      // Pantalla y categoría solo aplican a reportes de error -- una
      // sugerencia de juego no está ligada a ninguna pantalla en particular.
      if(type==="bug"){payload.screen=screen;payload.category=category;}
      if(image){payload.imageBase64=image.b64;payload.imageMime=image.mime;}
      await ref.set(payload);
      snd("score");
      setSent(true);
    }catch(e){
      setErr(T.feedbackSendErr);
    }finally{
      setSending(false);
    }
  }

  const selectStyle={width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
    borderRadius:10,padding:10,color:"#fff",fontFamily:"'Nunito',sans-serif",fontSize:".85rem",
    marginBottom:10,boxSizing:"border-box"};

  return(
    <div className="mbg" onClick={onClose}>
      <div className="ms" onClick={e=>e.stopPropagation()}>
        <div className="mh"></div>
        {sent ? (
          <div style={{textAlign:"center",padding:"18px 6px"}}>
            <div style={{fontSize:"2.5rem",marginBottom:10}}>✅</div>
            <div style={{fontWeight:900,fontSize:"1rem",marginBottom:6}}>{T.feedbackThanks}</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:".82rem",marginBottom:16,lineHeight:1.4}}>
              {type==="bug"
                ? T.feedbackThanksBug
                : T.feedbackThanksSuggestion}
            </div>
            <button className="mo" style={{width:"100%"}} onClick={onClose}>{T.closeBtn}</button>
          </div>
        ) : (
          <>
            <div className="mt2">{T.feedbackTitle}</div>
            <div style={{display:"flex",gap:8,marginBottom:12,marginTop:10}}>
              <button className={type==="bug"?"mo":"mc"} style={{flex:1}} onClick={()=>{snd("tap");setType("bug");}}>{T.reportBug}</button>
              <button className={type==="suggestion"?"mo":"mc"} style={{flex:1}} onClick={()=>{snd("tap");setType("suggestion");}}>{T.suggestGame}</button>
            </div>

            {type==="bug" && (<>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".64rem",color:"rgba(255,255,255,.4)",letterSpacing:1,marginBottom:5}}>{T.whichScreen}</div>
              <select value={screen} onChange={e=>setScreen(e.target.value)} style={selectStyle}>
                {FEEDBACK_SCREENS.map(o=><option key={o.v} value={o.v} style={OPTION_STYLE}>{o.l}</option>)}
              </select>

              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".64rem",color:"rgba(255,255,255,.4)",letterSpacing:1,marginBottom:5}}>{T.whatErrorType}</div>
              <select value={category} onChange={e=>setCategory(e.target.value)} style={selectStyle}>
                {FEEDBACK_CATEGORIES.map(o=><option key={o.v} value={o.v} style={OPTION_STYLE}>{o.l}</option>)}
              </select>
            </>)}

            <textarea value={text} onChange={e=>setText(e.target.value)} rows={5}
              placeholder={type==="bug"
                ? T.feedbackBugPlaceholder
                : T.feedbackSuggestPlaceholder}
              style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
                borderRadius:10,padding:10,color:"#fff",fontFamily:"'Nunito',sans-serif",fontSize:".85rem",
                resize:"vertical",marginBottom:10,boxSizing:"border-box"}}/>

            {/* Adjuntar captura -- opcional, comprimida igual que las fotos del escáner de cartas */}
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImageFile}/>
            {!image ? (
              <button type="button" onClick={()=>{snd("tap");fileRef.current&&fileRef.current.click();}}
                style={{width:"100%",background:"rgba(255,255,255,.04)",border:"1px dashed rgba(255,255,255,.25)",
                  borderRadius:10,padding:10,color:"rgba(255,255,255,.55)",fontFamily:"'Nunito',sans-serif",
                  fontSize:".8rem",marginBottom:10,cursor:"pointer"}}>
                {T.attachScreenshot}
              </button>
            ) : (
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,
                background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:8}}>
                <img src={image.preview} alt="captura" style={{width:52,height:52,objectFit:"cover",borderRadius:8}}/>
                <div style={{flex:1,fontSize:".72rem",color:"rgba(255,255,255,.6)"}}>{T.screenshotAttached}</div>
                <button type="button" onClick={()=>{snd("tap");setImage(null);if(fileRef.current)fileRef.current.value="";}}
                  style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",fontSize:"1rem",cursor:"pointer"}}>✕</button>
              </div>
            )}
            {imgErr&&<div style={{color:"#FF5A5A",fontSize:".72rem",marginBottom:8,textAlign:"center"}}>{imgErr}</div>}

            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,
              background:"rgba(255,255,255,.04)",borderRadius:10,padding:"8px 10px"}}>
              <span style={{fontSize:".7rem",color:"rgba(255,255,255,.4)"}}>{T.sendingAs}</span>
              <span style={{fontSize:".78rem",fontWeight:800,color:"#fff"}}>{identityLabel}</span>
            </div>

            {err&&<div style={{color:"#FF5A5A",fontSize:".75rem",marginBottom:8,textAlign:"center"}}>{err}</div>}
            <div className="mr2">
              <button className="mc" onClick={()=>{snd("tap");onClose();}}>{T.cancel}</button>
              <button className="mo" disabled={sending} onClick={handleSubmit}>{sending?T.sendingBtn:T.sendBtn}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── HOMESCREEN ────────────────────────────────────────────────
function HomeScreen({onEnter,sessions,setSessions,aiConfig,setAiConfig,lang,setLang,T,authUser,reconnectReady,lastKnownCode,onReconnect,onDismissReconnect}){
  const[view,setView]=useState("main");
  const[showSecondaryMenu,setShowSecondaryMenu]=React.useState(false);
  const[showFeedbackModal,setShowFeedbackModal]=React.useState(false);
  const[upgradeModal,setUpgradeModal]=React.useState(null); // {label} | null
  const[myGroupsHome,setMyGroupsHome]=React.useState([]); // for presence banner
  const[presenceHome,setPresenceHome]=React.useState({});  // uid → {online,status}
  const[selectedGroup,setSelectedGroup]=React.useState(null); // for create-with-group
  const[gameMode,setGameMode]=useState("classic");
  const[winTarget,setWinTarget]=useState(200);
  const[autoCloseRound,setAutoCloseRound]=useState(false);
  const[createStep,setCreateStep]=React.useState("mode"); // mode | players
  const[playerMode,setPlayerMode]=React.useState("manual"); // manual | amigos | grupo
  const[friendsHome,setFriendsHome]=React.useState([]);
  const[pickedFriends,setPickedFriends]=React.useState({}); // uid→true
  const[pickedGroupForPlayers,setPickedGroupForPlayers]=React.useState(null);
  const[pickedGroupMembers,setPickedGroupMembers]=React.useState({}); // uid→true
  // Pre-fill player 1 with logged user's name — o, si no tiene cuenta,
  // con el seudónimo temporal que haya guardado en Perfil para esta sesión.
  const myDisplayName=authUser&&!authUser.isAnonymous
    ?(authUser.displayName||(authUser.email||"").split("@")[0]||"")
    :(authUser&&authUser.isAnonymous?getAnonNickname():"");
  const[names,setNames]=useState([myDisplayName,"",""]);
  const[playerEmojis,setPlayerEmojis]=useState(EMOJIS.slice(0,3));
  const[playerColors,setPlayerColors]=useState(COLORS.slice(0,3));
  // uid de cuenta real por jugador (índice a índice con names/emojis/colores) —
  // cuando se conoce, guardar-estadísticas lo usa DIRECTO en vez de adivinar
  // por nombre. Esto es lo que hace que "mis estadísticas" y las comparativas
  // de amistad encuentren tu partida aunque juegues con un seudónimo distinto
  // a tu nombre de cuenta. null = sin cuenta conocida en ese puesto.
  const[playerUids,setPlayerUids]=useState([null,null,null]);
  // Tu propio puesto (índice 0) siempre sos vos — se sincroniza apenas se
  // conoce tu sesión, sin esperar a que cargue el resto del perfil.
  React.useEffect(()=>{
    const myUid=(authUser&&!authUser.isAnonymous)?authUser.uid:null;
    setPlayerUids(u=>{const c=[...u];c[0]=myUid;return c;});
  },[authUser]);
  // Perfil guardado (emoji/color por defecto, celebración favorita) — se
  // carga una vez al entrar y se usa para pre-llenar TU fila (índice 0,
  // que siempre sos vos) al crear una partida nueva, en vez de siempre
  // caer en el primer emoji/color de la lista.
  const[myProfile,setMyProfile]=React.useState(null);
  const appliedProfileDefaults=React.useRef(false);
  React.useEffect(()=>{
    if(!authUser||authUser.isAnonymous)return;
    _db.ref('users/'+authUser.uid).once('value').then(snap=>{
      const v=snap.val()||{};
      setMyProfile({
        defaultEmoji:v.defaultEmoji||null,
        defaultAvatar:v.defaultAvatar||null,
        defaultColor:v.defaultColor||null,
        nickname:v.nickname||null,
        preferredCelebration:v.preferredCelebration!=null?v.preferredCelebration:null
      });
    }).catch(()=>{});
  },[authUser]);
  React.useEffect(()=>{
    if(appliedProfileDefaults.current||!myProfile)return;
    appliedProfileDefaults.current=true;
    if(myProfile.defaultEmoji||myProfile.defaultAvatar)setPlayerEmojis(p=>{const c=[...p];c[0]=effectiveEmoji(myProfile);return c;});
    if(myProfile.defaultColor)setPlayerColors(p=>{const c=[...p];c[0]=myProfile.defaultColor;return c;});
    if(myProfile.nickname)setNames(nm=>{const c=[...nm];c[0]=myProfile.nickname;return c;});
  },[myProfile]);
  const[jcode,setJcode]=useState("");
  const[jname,setJname]=useState("");
  const[hostName,setHostName]=useState("");
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState(null);
  const[roomPlayers,setRoomPlayers]=useState(null);
  const[pickingPlayer,setPickingPlayer]=useState(false);
  const[roomPlayersOnline,setRoomPlayersOnline]=useState([]);
  const presUnsubRef=React.useRef(null);

  // Suscribirse a presencia cuando se muestra lista de jugadores
  React.useEffect(()=>{
    if(pickingPlayer&&jcode.length>=4){
      const pref=_db.ref("rooms/"+jcode.toUpperCase()+"/presence");
      const handler=snap=>{
        const data=snap.val()||{};
        setRoomPlayersOnline(Object.keys(data).filter(k=>data[k]===true));
      };
      pref.on("value",handler);
      presUnsubRef.current=()=>pref.off("value",handler);
    }
    return()=>{if(presUnsubRef.current){presUnsubRef.current();presUnsubRef.current=null;}};
  },[pickingPlayer,jcode]);

  // Auto-reparación: si el "currentRoom" de un grupo apunta a una sala que
  // ya terminó, ya no existe, O quedó abandonada (nadie conectado y sin
  // actividad por horas) la liberamos sola — así el banner "partida en
  // curso" no se queda pegado indefinidamente por sesiones donde nadie usó
  // el botón explícito de terminar/salir (ej. simplemente cerraron la app).
  const STALE_ROOM_MS=3*60*60*1000; // 3 horas sin actividad y sin host = abandonada
  const checkedRoomsRef=React.useRef(new Set());
  React.useEffect(()=>{
    if(!authUser||authUser.isAnonymous)return;
    myGroupsHome.forEach(g=>{
      if(!g.currentRoom)return;
      const key=g.id+":"+g.currentRoom;
      if(checkedRoomsRef.current.has(key))return; // ya la revisamos esta sesión
      checkedRoomsRef.current.add(key);
      _db.ref("rooms/"+g.currentRoom).once("value").then(snap=>{
        const r=snap.val();
        if(!r){_db.ref("groups/"+g.id+"/currentRoom").set(null).catch(()=>{});return;}
        if(r.finished||r.forceEnded){
          _db.ref("groups/"+g.id+"/currentRoom").set(null).catch(()=>{});return;
        }
        const lastActivity=r.lastActivityAt||r.gameStartedAt||r.createdAt||0;
        const abandoned=!r.hostOnline&&(Date.now()-lastActivity)>STALE_ROOM_MS;
        if(abandoned){
          _db.ref("groups/"+g.id+"/currentRoom").set(null).catch(()=>{});
        }
      }).catch(()=>{});
    });
  },[myGroupsHome,authUser]);

  // Amigos en vivo — para el selector "Amigos" al crear partida
  React.useEffect(()=>{
    if(!authUser||authUser.isAnonymous)return;
    const ref=_db.ref("users/"+authUser.uid+"/friends");
    const h=snap=>setFriendsHome(Object.values(snap.val()||{}));
    ref.on("value",h);
    return()=>ref.off("value",h);
  },[authUser]);

  // Presencia global de amigos — para mostrar en línea/offline en el
  // selector de jugadores (modo Amigos), mismo dato que usa la pestaña Amigos
  const[friendPresenceHome,setFriendPresenceHome]=React.useState({});
  React.useEffect(()=>{
    if(!authUser||authUser.isAnonymous)return;
    const ref=_db.ref("presence/_global");
    const h=snap=>setFriendPresenceHome(snap.val()||{});
    ref.on("value",h);
    return()=>ref.off("value",h);
  },[authUser]);

  // Solicitudes de amistad pendientes — para la bolita roja en "Amigos"
  const[pendingFriendReqCount,setPendingFriendReqCount]=React.useState(0);
  React.useEffect(()=>{
    if(!authUser||authUser.isAnonymous)return;
    const ref=_db.ref("users/"+authUser.uid+"/friendRequests");
    const h=snap=>setPendingFriendReqCount(Object.keys(snap.val()||{}).length);
    ref.on("value",h);
    return()=>ref.off("value",h);
  },[authUser]);

  // Load groups for presence banner — EN VIVO (antes era .once, por eso un
  // grupo recién creado/editado no aparecía sin recargar la página)
  React.useEffect(()=>{
    if(!authUser||authUser.isAnonymous)return;
    const uid=authUser.uid;
    const idxRef=_db.ref("users/"+uid+"/groups");
    const groupUnsubs={};
    const presUnsubs={};

    function attachGroup(gid){
      if(groupUnsubs[gid])return;
      const gRef=_db.ref("groups/"+gid);
      const h=snap=>{
        const val=snap.val();
        setMyGroupsHome(prev=>{
          if(!val)return prev.filter(g=>g.id!==gid);
          const next={id:gid,...val};
          const idx=prev.findIndex(g=>g.id===gid);
          if(idx===-1)return[...prev,next];
          const copy=[...prev];copy[idx]=next;return copy;
        });
      };
      gRef.on("value",h);
      groupUnsubs[gid]=()=>gRef.off("value",h);
      if(!presUnsubs[gid]){
        const pRef=_db.ref("presence/"+gid);
        const ph=snap=>setPresenceHome(prev=>({...prev,...(snap.val()||{})}));
        pRef.on("value",ph);
        presUnsubs[gid]=()=>pRef.off("value",ph);
      }
    }
    function detachGroup(gid){
      if(groupUnsubs[gid]){groupUnsubs[gid]();delete groupUnsubs[gid];}
      if(presUnsubs[gid]){presUnsubs[gid]();delete presUnsubs[gid];}
    }

    const idxHandler=snap=>{
      const gids=Object.keys(snap.val()||{});
      gids.forEach(attachGroup);
      Object.keys(groupUnsubs).forEach(gid=>{
        if(!gids.includes(gid)){detachGroup(gid);setMyGroupsHome(prev=>prev.filter(g=>g.id!==gid));}
      });
    };
    idxRef.on("value",idxHandler);

    return()=>{
      idxRef.off("value",idxHandler);
      Object.values(groupUnsubs).forEach(u=>u());
      Object.values(presUnsubs).forEach(u=>u());
    };
  },[authUser]);

  React.useEffect(()=>{
    setPlayerEmojis(p=>{const a=[...p];while(a.length<names.length){const next=EMOJIS.find(e=>!a.includes(e))||EMOJIS[a.length%EMOJIS.length];a.push(next);}return a.slice(0,names.length);});
    setPlayerColors(p=>{const a=[...p];while(a.length<names.length){const next=COLORS.find(c=>!a.includes(c))||COLORS[a.length%COLORS.length];a.push(next);}return a.slice(0,names.length);});
    setPlayerUids(p=>{const a=[...p];while(a.length<names.length)a.push(null);return a.slice(0,names.length);});
  },[names.length]);

  const isAnonHome=authUser&&authUser.isAnonymous;
  const LOCKED_VIEWS={grupos:T.groupsFeatureLbl,perfil:T.profileMenuItem.replace("👤 ","")}; // stats NO se bloquea: ya tiene fallback público (StatsScreen)
  const[joinIntent,setJoinIntent]=React.useState("play"); // play | spectate
  const go=v=>{
    if(isAnonHome&&LOCKED_VIEWS[v]){
      snd('tap');setUpgradeModal({label:LOCKED_VIEWS[v]});return;
    }
    snd('tap');setErr(null);setView(v);setRoomPlayers(null);setPickingPlayer(false);
    if(v==="create")setCreateStep("mode"); // siempre entra por el paso de modo de juego
  };
  const[dashboardTab,setDashboardTab]=React.useState("me");
  const[roomInvite,setRoomInvite]=React.useState(null); // {group} pendiente de aceptar/declinar
  const prevRoomsRef=React.useRef({}); // gid -> currentRoom anterior, para detectar SOLO partidas nuevas
  const seenGroupsRef=React.useRef(new Set()); // gids con base ya establecida esta sesión

  // Detecta cuando un grupo tuyo arranca una partida nueva (transición
  // null → código) y muestra un popup con Aceptar/Declinar — a diferencia
  // del banner pasivo (que solo se ve si estás en Home), esto interrumpe
  // sin importar en qué pantalla estés.
  //
  // Importante: la PRIMERA vez que vemos cada grupo en esta sesión (ej.
  // recién cargaste la app) solo establecemos la base, sin avisar — antes
  // esto se comparaba contra "sin dato previo" y avisaba de una partida
  // que llevaba activa desde ayer, cada vez que recargabas la página.
  React.useEffect(()=>{
    if(!authUser||authUser.isAnonymous)return;
    const myName=(authUser.displayName||(authUser.email||"").split("@")[0]||"").toLowerCase();
    myGroupsHome.forEach(g=>{
      const isFirstSeen=!seenGroupsRef.current.has(g.id);
      seenGroupsRef.current.add(g.id);
      const prev=prevRoomsRef.current[g.id];
      if(!isFirstSeen&&g.currentRoom&&g.currentRoom!==prev){
        _db.ref("rooms/"+g.currentRoom+"/hostName").once("value").then(snap=>{
          const hostName=(snap.val()||"").toLowerCase();
          if(hostName&&hostName!==myName){ // no notificarte tu propia partida
            snd('spec_join');
            setRoomInvite({source:"group",group:g});
          }
        }).catch(()=>{});
      }
      prevRoomsRef.current[g.id]=g.currentRoom||null;
    });
  },[myGroupsHome,authUser]);

  // Invitación directa por amistad (sin necesidad de compartir grupo) —
  // se activa cuando alguien te agrega como jugador en una sala nueva y
  // tu nombre coincide con una cuenta registrada (ver enterGame).
  React.useEffect(()=>{
    if(!authUser||authUser.isAnonymous)return;
    const ref=_db.ref("users/"+authUser.uid+"/pendingInvite");
    const h=snap=>{
      const inv=snap.val();
      if(inv&&inv.code){
        snd('spec_join');
        setRoomInvite({source:"friend",code:inv.code,hostName:inv.hostName||"Un amigo"});
      }
    };
    ref.on("value",h);
    return()=>ref.off("value",h);
  },[authUser]);
  const[dashboardMode,setDashboardMode]=React.useState("stats");
  const goDashboard=tab=>{
    if(isAnonHome&&tab==="friends"){snd('tap');setUpgradeModal({label:T.friendsMenuLbl});return;}
    snd('tap');setDashboardTab(tab);setDashboardMode(tab==="friends"?"friends":"stats");setView("stats");
  };

  async function createReal(){
    // Filtrar nombres en blanco preservando el índice original para
    // emoji/color/uid — antes se filtraba solo `names` y se mandaban
    // playerEmojis/playerColors completos (sin filtrar), así que un
    // espacio en blanco en medio de la lista desalineaba los colores de
    // todos los que venían después.
    const idxs=names.map((n,i)=>i).filter(i=>names[i].trim());
    const ns=idxs.map(i=>names[i]);
    if(ns.length<2){setErr({msg:T.need2PlayersErr,steps:[]});return;}
    setBusy(true);setErr(null);
    try{
      await onEnter({names:ns,demo:false,
        customEmojis:idxs.map(i=>playerEmojis[i]),
        customColors:idxs.map(i=>playerColors[i]),
        customUids:idxs.map(i=>playerUids[i]),
        hostName:jname.trim()||ns[0],gameMode:gameMode,groupId:selectedGroup?selectedGroup.id:null,winTarget:winTarget,autoCloseRound:autoCloseRound});
    }
    catch(e){setErr(classifyError(e,T));}
    setBusy(false);
  }

  async function tryJoin(asSpectator=false){
    if(jcode.length<4){setErr({msg:T.code4CharsErr,steps:[]});return;}
    if(!asSpectator&&!jname.trim()){setErr({msg:T.enterNameErr,steps:[]});return;}
    setBusy(true);setErr(null);
    try{
      const db=makeDB(false);const r=await db.get("rooms/"+jcode.toUpperCase());
      if(!r){setErr({msg:T.roomNotFoundTpl.replace('{code}',jcode.toUpperCase()),steps:[T.askAdminCodeStep]});setBusy(false);return;}
      if(asSpectator){snd('join');await onEnter({demo:false,spectator:true,code:jcode.toUpperCase()});setBusy(false);return;}
      const inputName=jname.trim().toLowerCase();
      // Buscar si hay un jugador con ese nombre
      const existing=r.players.find(p=>p.name.toLowerCase()===inputName);
      if(existing){
        // Jugador existente → reconectar con su playerId.
        // Si ese nombre también era el del host original y nadie más tiene
        // el rol de host asignado, recuperas el host junto con tu propio
        // jugador (antes se perdía el host al reconectar así).
        if(!r.hostPlayerId&&r.hostName&&r.hostName.toLowerCase()===inputName){
          await _db.ref("rooms/"+jcode.toUpperCase()+"/hostPlayerId").set(existing.id);
        }
        snd('join');
        await onEnter({demo:false,spectator:false,code:jcode.toUpperCase(),playerId:existing.id});
      } else {
        // Verificar si el nombre coincide con el del host original
        // El host entra sin playerId (controla la sala completa)
        const isHostName = r.hostName && r.hostName.toLowerCase()===inputName;
        if(isHostName || r.lobbyMode){
          // Es el host reconectándose — entra sin playerId (modo host)
          snd('join');
          await onEnter({demo:false,spectator:false,code:jcode.toUpperCase(),playerId:null,asHost:true});
        } else {
          // Nombre no encontrado → mostrar lista de jugadores para elegir
          setRoomPlayers(r.players);setPickingPlayer(true);
        }
      }
    }catch(e){setErr(classifyError(e,T));}
    setBusy(false);
  }

  async function pickPlayer(player){
    snd('join');
    try{await onEnter({demo:false,spectator:false,code:jcode.toUpperCase(),playerId:player.id});}
    catch(e){setErr(classifyError(e,T));}
  }

  async function joinAsNew(){
    if(!jname.trim()){setErr({msg:T.enterNameErr,steps:[]});return;}
    setBusy(true);setErr(null);
    try{
      const r=await makeDB(false).get("rooms/"+jcode.toUpperCase());
      // Si tenés cuenta, tu emoji/color guardados en Perfil (si los
      // definiste) y tu uid real — así tus estadísticas de esta partida
      // quedan atadas a tu cuenta en vez de adivinarse por tu nombre.
      const myUidJoin=(authUser&&!authUser.isAnonymous)?authUser.uid:null;
      const newP={id:uid(),name:jname.trim(),
        emoji:effectiveEmoji(myProfile)||EMOJIS[r.players.length%EMOJIS.length],
        color:(myProfile&&myProfile.defaultColor)||COLORS[r.players.length%COLORS.length],
        uid:myUidJoin,total:0,rounds:[]};
      r.players=[...r.players,newP];
      await _db.ref("rooms/"+jcode.toUpperCase()).set(r);
      snd('join');await onEnter({demo:false,spectator:false,code:jcode.toUpperCase(),playerId:newP.id});
    }catch(e){setErr(classifyError(e,T));}
    setBusy(false);
  }

  // Unirse directo a la sala activa de un grupo — sin pasar por el
  // formulario manual de código+nombre (ya sabemos ambos: el código lo
  // tiene el grupo, el nombre lo tiene tu cuenta). Reutiliza la misma
  // lógica de reconexión/selección que tryJoin.
  async function quickJoinByCode(code,onMissing){
    const myName=(authUser&&(authUser.displayName||(authUser.email||"").split("@")[0]))||"";
    go("join");
    setJcode(code);setJname(myName);
    setBusy(true);setErr(null);
    try{
      const db=makeDB(false);const r=await db.get("rooms/"+code.toUpperCase());
      if(!r){
        setErr({msg:T.roomNoLongerExistsErr,steps:[]});
        if(onMissing)onMissing();
        setBusy(false);return;
      }
      if(r.finished||r.forceEnded){
        setErr({msg:T.gameAlreadyEndedErr,steps:[]});
        if(onMissing)onMissing();
        setBusy(false);return;
      }
      const inputName=myName.trim().toLowerCase();
      const existing=r.players.find(p=>p.name.toLowerCase()===inputName);
      if(existing){
        if(!r.hostPlayerId&&r.hostName&&r.hostName.toLowerCase()===inputName){
          await _db.ref("rooms/"+code.toUpperCase()+"/hostPlayerId").set(existing.id);
        }
        snd('join');
        await onEnter({demo:false,spectator:false,code:code.toUpperCase(),playerId:existing.id});
      }else{
        const isHostName=r.hostName&&r.hostName.toLowerCase()===inputName;
        if(isHostName||r.lobbyMode){
          snd('join');
          await onEnter({demo:false,spectator:false,code:code.toUpperCase(),playerId:null,asHost:true});
        }else{
          setRoomPlayers(r.players);setPickingPlayer(true);
        }
      }
    }catch(e){setErr(classifyError(e,T));}
    setBusy(false);
  }
  async function quickJoinGroup(g){
    if(!g||!g.currentRoom)return;
    await quickJoinByCode(g.currentRoom,()=>_db.ref("groups/"+g.id+"/currentRoom").set(null).catch(()=>{}));
  }

  // Modal de invitación — se inserta en cada rama de "view" para que
  // interrumpa sin importar en qué pantalla estés (no solo en Home).
  const roomInviteModal=roomInvite&&(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:250,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={()=>{if(roomInvite.source==="friend")_db.ref("users/"+authUser.uid+"/pendingInvite").set(null).catch(()=>{});setRoomInvite(null);}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--dark,#14141f)",
        border:"2px solid rgba(59,178,115,.5)",borderRadius:18,padding:22,
        maxWidth:340,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:"2.2rem",marginBottom:8}}>🎮</div>
        <div style={{fontFamily:"'Lilita One',sans-serif",fontSize:"1.1rem",color:"#fff",marginBottom:4}}>
          {roomInvite.source==="friend"
            ? "¡"+roomInvite.hostName+" "+T.invitedYouToPlay
            : "¡"+T.gameInGroupTpl.replace('{group}',roomInvite.group.name)}
        </div>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",
          color:"rgba(255,255,255,.4)",marginBottom:18}}>
          {T.someoneStarted}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{
            const inv=roomInvite;setRoomInvite(null);
            if(inv.source==="friend"){
              _db.ref("users/"+authUser.uid+"/pendingInvite").set(null).catch(()=>{});
              quickJoinByCode(inv.code);
            }else{
              quickJoinGroup(inv.group);
            }
          }} style={{flex:1,background:"var(--gr)",border:"none",borderRadius:12,padding:"11px",
              cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:".85rem",color:"#fff"}}>
            {T.joinNowBtn}
          </button>
          <button onClick={()=>{
            if(roomInvite.source==="friend")_db.ref("users/"+authUser.uid+"/pendingInvite").set(null).catch(()=>{});
            setRoomInvite(null);
          }} style={{flex:1,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",
              borderRadius:12,padding:"11px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",
              fontWeight:900,fontSize:".85rem",color:"rgba(255,255,255,.6)"}}>
            {T.notNowLbl}
          </button>
        </div>
      </div>
    </div>
  );

  if(view==="create")return(
    <div className="create-wrap">
      {roomInviteModal}
      <div className="create-header">
        <div className="create-title">{T.createRoom}</div>
        <div className="create-sub">{T.newGame}</div>
      </div>
      {createStep==="mode"&&(
      <div className="create-body">
      {(<>
        {/* ── SELECTOR DE MODO ── */}
        <p className="sec" style={{marginBottom:8}}>{T.gameModeLabel}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          {Object.values(GAME_MODES).map(mode=>{
            const isSel=gameMode===mode.id;
            return(
              <button key={mode.id}
                onClick={()=>{snd('tap');if(!mode.comingSoon)setGameMode(mode.id);}}
                style={{
                  position:"relative",textAlign:"left",
                  background:isSel?mode.color+"1a":"rgba(255,255,255,.03)",
                  border:"2px solid "+(isSel?mode.color:"rgba(255,255,255,.1)"),
                  borderRadius:16,padding:"14px 12px",
                  cursor:mode.comingSoon?"default":"pointer",
                  transition:"all .2s",
                  boxShadow:isSel?"0 0 20px "+mode.glow:"none",
                  opacity:mode.comingSoon?.8:1,
                }}>
                <div style={{position:"absolute",top:7,right:7,
                  background:mode.badgeColor,border:"1px solid "+mode.badgeBorder,
                  borderRadius:20,padding:"2px 6px",
                  fontFamily:"'Righteous',sans-serif",fontSize:".52rem",
                  color:mode.color,letterSpacing:1}}>
                  {mode.badge}
                </div>
                {mode.image
                  ? <img src={mode.image} alt={mode.name} style={{height:44,marginBottom:6,
                      filter:"drop-shadow(0 4px 10px "+mode.glow+")",
                      opacity:isSel?1:.75,transition:"opacity .2s"}}
                      onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="block";}}/>
                  : null}
                <div style={{fontSize:"1.8rem",marginBottom:4,lineHeight:1,
                  display:mode.image?"none":"block"}}>{mode.emoji}</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:".95rem",
                  letterSpacing:2,lineHeight:1,marginBottom:1,
                  color:isSel?mode.color:"rgba(255,255,255,.7)"}}>
                  {mode.name}
                </div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                  letterSpacing:1,marginBottom:5,
                  color:isSel?mode.color:"rgba(255,255,255,.3)"}}>
                  {mode.subtitle}
                </div>
                <div style={{fontFamily:"'Nunito',sans-serif",fontSize:".65rem",
                  color:"rgba(255,255,255,.45)",fontWeight:700,lineHeight:1.4}}>
                  {mode.comingSoon
                    ? <span style={{color:mode.color,fontFamily:"'Righteous',sans-serif",fontSize:".6rem"}}>{T.requiresManual}</span>
                    : (mode.id==="venganza"?T.modeVenganzaDesc:T.modeClassicDesc)}
                </div>
                {isSel&&!mode.comingSoon&&(
                  <div style={{marginTop:8,borderTop:"1px solid "+mode.color+"33",paddingTop:8}}>
                    {(mode.id==="venganza"?T.modeVenganzaRules:T.modeClassicRules).map((r,ri)=>(
                      <div key={ri} style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                        color:mode.color,letterSpacing:.5,display:"flex",gap:4,marginBottom:2}}>
                        <span style={{opacity:.6}}>▸</span><span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
                {isSel&&(
                  <div style={{position:"absolute",bottom:7,right:7,
                    width:16,height:16,borderRadius:"50%",background:mode.color,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:"9px",color:"#000",fontWeight:900}}>✓</div>
                )}
              </button>
            );
          })}
        </div>
        {/* Panel descriptivo del modo seleccionado */}
        {gameMode==="classic"?(
          <div style={{marginTop:0,background:"rgba(245,200,0,.06)",border:"1px solid rgba(245,200,0,.18)",
            borderRadius:12,padding:"10px 13px",marginBottom:10}}>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"var(--y)",
              letterSpacing:2,marginBottom:6}}>{T.howItWorks}</div>
            <div style={{fontSize:".76rem",color:"rgba(255,255,255,.6)",lineHeight:1.75,fontWeight:700}}>
              🃏 <b style={{color:"rgba(255,255,255,.85)"}}>{T.ruleClassicCards}</b>{T.ruleClassicCardsDesc}<br/>
              💀 <b style={{color:"rgba(255,255,255,.85)"}}>{T.ruleDupTitle}</b>{T.ruleDupDesc}<br/>
              ⭐ <b style={{color:"var(--y)"}}>{T.ruleFlip7Title}</b>{T.ruleFlip7Desc}<br/>
              🔧 <b style={{color:"rgba(255,255,255,.85)"}}>{T.ruleModTitle}</b>{T.ruleModDesc}<br/>
              🏆 <b style={{color:"var(--y)"}}>{T.goalPointsLabel.charAt(0)+T.goalPointsLabel.slice(1).toLowerCase()} {winTarget} pts</b>{T.ruleGoalDesc}
            </div>
          </div>
        ):(
          <div style={{marginTop:0,background:"rgba(230,57,70,.06)",border:"1px solid rgba(230,57,70,.2)",
            borderRadius:12,padding:"10px 13px",marginBottom:10}}>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"var(--r)",
              letterSpacing:2,marginBottom:6}}>{T.howItWorks}</div>
            <div style={{fontSize:".76rem",color:"rgba(255,255,255,.6)",lineHeight:1.75,fontWeight:700}}>
              💀 <b style={{color:"rgba(255,255,255,.85)"}}>{T.ruleVengCards}</b>{T.ruleVengCardsDesc}<br/>
              🔴 <b style={{color:"rgba(255,255,255,.85)"}}>{T.ruleVengDupTitle}</b>{T.ruleVengDupDesc}<br/>
              ⭐ <b style={{color:"var(--r)"}}>{T.ruleFlip7Title}</b>{T.ruleFlip7Desc}<br/>
              🔧 <b style={{color:"rgba(255,255,255,.85)"}}>{T.ruleVengModTitle}</b>{T.ruleVengModDesc}<br/>
              ⚡ <b style={{color:"rgba(255,255,255,.85)"}}>{T.ruleVengActionsTitle}</b>{T.ruleVengActionsDesc}<br/>
              🏆 <b style={{color:"var(--r)"}}>{T.goalPointsLabel.charAt(0)+T.goalPointsLabel.slice(1).toLowerCase()} {winTarget} pts</b>{T.ruleGoalDesc}
            </div>
          </div>
        )}

        {/* Meta de puntos configurable — 200 es el estándar oficial, 150
            es la alternativa más común para partidas más cortas */}
        <p className="sec" style={{marginBottom:8}}>{T.goalPointsLabel}</p>
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {[100,150,200,250,300].map(t=>(
            <button key={t} onClick={()=>{snd('tap');setWinTarget(t);}}
              style={{flex:"1 1 18%",minWidth:56,padding:"9px 4px",borderRadius:10,cursor:"pointer",
                fontFamily:"'Anton',sans-serif",fontSize:".85rem",letterSpacing:1,
                background:winTarget===t?"linear-gradient(135deg,var(--y),var(--or))":"rgba(255,255,255,.05)",
                border:"1.5px solid "+(winTarget===t?"transparent":"rgba(255,255,255,.12)"),
                color:winTarget===t?"var(--dark)":"rgba(255,255,255,.55)"}}>
              {t}{t===200&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".45rem",
                letterSpacing:0,marginTop:1,opacity:.7}}>{T.standardLbl}</div>}
            </button>
          ))}
        </div>

        {/* Autocierre — configurable desde la creación, para que se sienta
            lista desde el inicio. Se puede seguir cambiando dentro del
            juego en cualquier momento (mismo interruptor). */}
        <div onClick={()=>{snd('tap');setAutoCloseRound(v=>!v);}}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",
            background:autoCloseRound?"rgba(59,178,115,.08)":"rgba(255,255,255,.03)",
            border:"1px solid "+(autoCloseRound?"rgba(59,178,115,.3)":"rgba(255,255,255,.1)"),
            borderRadius:10,padding:"10px 12px",marginBottom:14}}>
          <div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".64rem",
              color:autoCloseRound?"var(--gr)":"rgba(255,255,255,.5)",letterSpacing:.5}}>
              {T.autoCloseRound}
            </div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
              color:"rgba(255,255,255,.3)",marginTop:2}}>
              {T.canChangeLater}
            </div>
          </div>
          <div style={{width:34,height:19,borderRadius:20,position:"relative",flexShrink:0,
            background:autoCloseRound?"var(--gr)":"rgba(255,255,255,.15)",transition:"background .2s"}}>
            <div style={{position:"absolute",top:2,left:autoCloseRound?17:2,width:15,height:15,
              borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
          </div>
        </div>
      </>)}
      </div>
      )}
      {createStep==="mode"&&(
        <div className="create-footer">
          <button className="btn btn-y" style={{marginBottom:8}}
            onClick={()=>{snd('tap');setCreateStep("players");}}>
            {T.nextArrow}
          </button>
          <button className="btn btn-g" onClick={()=>go("main")}>{T.back}</button>
        </div>
      )}
      {createStep==="players"&&(()=>{
        // Sincroniza names/emojis/colores/uids a partir de una lista de
        // jugadores elegidos ({name,uid}). Deduplica por nombre (sin
        // mayúsculas/espacios) — evita que aparezcas dos veces si algún
        // dato de grupo quedó con un rastro duplicado de tu propio nombre.
        // Trae en vivo el seudónimo/emoji/color GUARDADO de cada amigo o
        // integrante elegido (en vez de su nombre de cuenta y un color
        // genérico por orden), y guarda su uid real para que las
        // estadísticas de fin de partida se asocien a su cuenta y no a
        // una llave adivinada por nombre.
        async function applyPicked(pickedList){
          const myName=(myProfile&&myProfile.nickname)||myDisplayName;
          const myUid=(authUser&&!authUser.isAnonymous)?authUser.uid:null;
          const myEmoji=effectiveEmoji(myProfile);
          const myColor=(myProfile&&myProfile.defaultColor)||null;
          const enriched=await enrichPickedPlayers(pickedList);
          const all=[{name:myName,uid:myUid,emoji:myEmoji,color:myColor},...enriched];
          const seen=new Set();
          const list=[];
          all.forEach(p=>{
            const k=(p.name||"").trim().toLowerCase();
            if(k&&!seen.has(k)){seen.add(k);list.push(p);}
          });
          const finalList=list.length>=2?list:[...list,{name:"",uid:null,emoji:null,color:null}];
          setNames(finalList.map(p=>p.name));
          setPlayerUids(finalList.map(p=>p.uid));
          setPlayerEmojis(finalList.map((p,i)=>p.emoji||EMOJIS[i%EMOJIS.length]));
          setPlayerColors(finalList.map((p,i)=>p.color||COLORS[i%COLORS.length]));
        }
        return(
        <div className="create-body" style={{paddingTop:0}}>
          <button className="btn2 btn2-off" onClick={()=>{snd('tap');setCreateStep("mode");}}
            style={{padding:"7px 14px",fontSize:".68rem",width:"auto"}}>{T.backToGameType}</button>
          <div style={{textAlign:"center",fontFamily:"'Anton',sans-serif",fontSize:"1.6rem",
            color:"var(--y)",letterSpacing:3,margin:"14px 0 16px",
            textShadow:"0 0 20px rgba(245,200,0,.3)"}}>{T.playersCapsHeader}</div>

          {/* Selector de modo para llenar jugadores */}
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {[["manual","✍️ "+T.manualModeLbl],["amigos","👥 "+T.friendsMenuLbl],["grupo","🎭 "+T.groupModeLbl]].map(([id,lbl])=>(
              <button key={id} className={"btn2 "+(playerMode===id?"btn2-on":"btn2-off")}
                onClick={()=>{snd('tap');setPlayerMode(id);}}
                style={{flex:1,padding:"11px 4px",fontSize:".7rem"}}>
                {lbl}
              </button>
            ))}
          </div>

          {/* MODO AMIGOS */}
          {playerMode==="amigos"&&(
            <div style={{marginBottom:14}}>
              {friendsHome.length===0
                ? <div style={{textAlign:"center",padding:"14px",color:"rgba(255,255,255,.3)",
                    fontFamily:"'Righteous',sans-serif",fontSize:".7rem"}}>
                    {T.noFriendsYet}
                  </div>
                : <>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.35)"}}>
                        {Object.values(pickedFriends).filter(Boolean).length} {T.selectedCountWord||T.grpMembersWord}
                      </span>
                      <span style={{display:"flex",gap:10}}>
                        <span onClick={()=>{const all={};friendsHome.forEach(f=>all[f.uid]=true);setPickedFriends(all);}}
                          style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"var(--t)",cursor:"pointer"}}>{T.selectAll}</span>
                        <span onClick={()=>setPickedFriends({})}
                          style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.35)",cursor:"pointer"}}>{T.selectNone}</span>
                      </span>
                    </div>
                    {friendsHome.map(f=>{
                      const sel=pickedFriends[f.uid]||false;
                      const isOnline=friendPresenceHome[f.uid]&&friendPresenceHome[f.uid].online;
                      return(
                        <div key={f.uid} onClick={()=>{snd('tap');setPickedFriends(p=>({...p,[f.uid]:!p[f.uid]}));}}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
                            marginBottom:6,borderRadius:11,cursor:"pointer",
                            background:sel?"rgba(59,178,115,.12)":"rgba(255,255,255,.03)",
                            border:"2px solid "+(sel?"rgba(59,178,115,.5)":"rgba(255,255,255,.08)")}}>
                          <div style={{position:"relative",flexShrink:0}}>
                            <div style={{width:32,height:32,borderRadius:"50%",
                              background:sel?"rgba(59,178,115,.25)":"rgba(245,200,0,.12)",
                              display:"flex",alignItems:"center",justifyContent:"center",
                              fontFamily:"'Anton',sans-serif",fontSize:".9rem",
                              color:sel?"var(--gr)":"var(--y)"}}>
                              {(f.name||"?")[0].toUpperCase()}
                            </div>
                            {isOnline&&<div style={{position:"absolute",bottom:-1,right:-1,width:10,height:10,
                              borderRadius:"50%",background:"var(--gr)",border:"2px solid var(--dark,#0F0F1A)"}}/>}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:900,fontSize:".85rem",
                              color:sel?"var(--gr)":"rgba(255,255,255,.75)"}}>{f.name}</div>
                            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                              letterSpacing:1,color:isOnline?"var(--gr)":"rgba(255,255,255,.25)"}}>
                              {isOnline?T.onlineDotLbl:T.offlineDotLbl}
                            </div>
                          </div>
                          {sel&&<span style={{color:"var(--gr)",fontSize:"1rem"}}>✓</span>}
                        </div>
                      );
                    })}
                    <button className="btn btn-t" onClick={()=>{
                      const chosen=friendsHome.filter(f=>pickedFriends[f.uid]).map(f=>({name:f.name,uid:f.uid}));
                      applyPicked(chosen);snd('join');
                    }} disabled={!Object.values(pickedFriends).some(Boolean)}
                      style={{marginTop:6,fontSize:".82rem",padding:"10px",
                        opacity:Object.values(pickedFriends).some(Boolean)?1:.4}}>
                      {T.useSelected}
                    </button>
                  </>
              }
            </div>
          )}

          {/* MODO GRUPO */}
          {playerMode==="grupo"&&(
            <div style={{marginBottom:14}}>
              {myGroupsHome.length===0
                ? <div style={{textAlign:"center",padding:"14px",color:"rgba(255,255,255,.3)",
                    fontFamily:"'Righteous',sans-serif",fontSize:".7rem"}}>
                    {T.noGroupsYet}
                  </div>
                : <>
                    <p className="sec" style={{marginBottom:8,marginTop:0}}>{T.groupsAvailable}</p>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
                      {myGroupsHome.map(g=>(
                        <button key={g.id} onClick={()=>{
                          snd('tap');setPickedGroupForPlayers(g);setSelectedGroup(g);
                          // Auto-seleccionar a todos los miembros — un grupo normalmente
                          // significa "todos van a jugar", así que empezamos ahí y el
                          // usuario desmarca si alguien no va esta vez.
                          const allSelected={};
                          Object.keys(g.members||{}).forEach(muid=>{
                            if(muid!==authUser.uid)allSelected[muid]=true;
                          });
                          setPickedGroupMembers(allSelected);
                        }}
                          style={{padding:"10px 18px",borderRadius:22,cursor:"pointer",
                            fontFamily:"'Righteous',sans-serif",fontSize:".8rem",letterSpacing:1,
                            background:pickedGroupForPlayers&&pickedGroupForPlayers.id===g.id?"rgba(123,45,139,.3)":"rgba(255,255,255,.04)",
                            border:"1px solid "+(pickedGroupForPlayers&&pickedGroupForPlayers.id===g.id?"rgba(123,45,139,.6)":"rgba(255,255,255,.1)"),
                            color:pickedGroupForPlayers&&pickedGroupForPlayers.id===g.id?"#cc88ff":"rgba(255,255,255,.4)"}}>
                          👥 {g.name}
                        </button>
                      ))}
                    </div>
                    {pickedGroupForPlayers&&(<>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.35)"}}>
                          {Object.values(pickedGroupMembers).filter(Boolean).length} {T.selectedCountWord||T.grpMembersWord}
                        </span>
                        <span style={{display:"flex",gap:10}}>
                          <span onClick={()=>{
                            const all={};
                            Object.keys(pickedGroupForPlayers.members||{}).forEach(muid=>{if(muid!==authUser.uid)all[muid]=true;});
                            setPickedGroupMembers(all);
                          }} style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"var(--t)",cursor:"pointer"}}>{T.selectAll}</span>
                          <span onClick={()=>setPickedGroupMembers({})}
                            style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.35)",cursor:"pointer"}}>{T.selectNone}</span>
                        </span>
                      </div>
                      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                        color:"rgba(255,255,255,.3)",marginBottom:10,lineHeight:1.5}}>
                        {T.tapToIncludeExclude}
                      </div>
                    </>)}
                    {pickedGroupForPlayers&&Object.entries(pickedGroupForPlayers.members||{}).map(([muid,m])=>{
                      if(muid===authUser.uid)return null; // el host ya va incluido siempre
                      if((m.name||"").trim().toLowerCase()===(myDisplayName||"").trim().toLowerCase())return null;
                      const sel=pickedGroupMembers[muid]||false;
                      return(
                        <div key={muid} onClick={()=>{snd('tap');setPickedGroupMembers(p=>({...p,[muid]:!p[muid]}));}}
                          style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
                            marginBottom:6,borderRadius:11,cursor:"pointer",
                            background:sel?"rgba(59,178,115,.12)":"rgba(255,255,255,.03)",
                            border:"2px solid "+(sel?"rgba(59,178,115,.5)":"rgba(255,255,255,.08)")}}>
                          <div style={{width:32,height:32,borderRadius:"50%",
                            background:sel?"rgba(59,178,115,.25)":"rgba(245,200,0,.12)",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontFamily:"'Anton',sans-serif",fontSize:".9rem",
                            color:sel?"var(--gr)":"var(--y)",flexShrink:0}}>
                            {(m.name||"?")[0].toUpperCase()}
                          </div>
                          <div style={{flex:1,fontWeight:900,fontSize:".85rem",
                            color:sel?"var(--gr)":"rgba(255,255,255,.75)"}}>{m.name}</div>
                          {sel&&<span style={{color:"var(--gr)",fontSize:"1rem"}}>✓</span>}
                        </div>
                      );
                    })}
                    {pickedGroupForPlayers&&(
                      <button className="btn btn-t" onClick={()=>{
                        const chosen=Object.entries(pickedGroupForPlayers.members||{})
                          .filter(([muid])=>pickedGroupMembers[muid]).map(([muid,m])=>({name:m.name,uid:muid}));
                        applyPicked(chosen);snd('join');
                      }} disabled={!Object.values(pickedGroupMembers).some(Boolean)}
                        style={{marginTop:6,fontSize:".82rem",padding:"10px",
                          opacity:Object.values(pickedGroupMembers).some(Boolean)?1:.4}}>
                        {T.useSelected}
                      </button>
                    )}
                  </>
              }
            </div>
          )}

          <p className="sec" style={{marginTop:4}}>{T.players} (min. 2)</p>
          {names.map((n,i)=>(
            <PlayerRow key={i} idx={i} T={T}
              name={n} emoji={playerEmojis[i]||EMOJIS[i%EMOJIS.length]} color={playerColors[i]||COLORS[i%COLORS.length]}
              allEmojis={EMOJIS} allColors={COLORS} usedColors={playerColors.filter((_,j)=>j!==i)}
              canRemove={names.length>2}
              onName={v=>{setNames(p=>p.map((x,j)=>j===i?v:x));
                // Editar el nombre a mano invalida el uid que traíamos de
                // Amigos/Grupo para ese puesto — ya no podemos asumir que
                // sigue siendo la misma cuenta. Tu propio puesto (0) no se
                // toca: siempre sos vos.
                if(i!==0)setPlayerUids(p=>p.map((x,j)=>j===i?null:x));}}
              onEmoji={v=>setPlayerEmojis(p=>p.map((x,j)=>j===i?v:x))}
              onColor={v=>setPlayerColors(p=>p.map((x,j)=>j===i?v:x))}
              onRemove={()=>{snd('tap');setNames(p=>p.filter((_,j)=>j!==i));setPlayerEmojis(p=>p.filter((_,j)=>j!==i));setPlayerColors(p=>p.filter((_,j)=>j!==i));setPlayerUids(p=>p.filter((_,j)=>j!==i));}}
            />
          ))}
          {names.length<18&&<button className="btn-add" onClick={()=>{snd('tap');setNames(p=>[...p,""]);}}>+ {T.addPlayer}</button>}
          {err&&<ErrBox err={err}/>}
        </div>
        );
      })()}
      {createStep==="players"&&(
        <div className="create-footer">
          <button className="btn btn-y" style={{marginBottom:8}} onClick={()=>{snd('tap');createReal();}} disabled={busy||names.filter(n=>n.trim()).length<2}>
            {busy?T.creating:T.create}
          </button>
          <button className="btn btn-g" onClick={()=>go("main")}>{T.back}</button>
        </div>
      )}
    </div>
  );

  if(view==="join")return(
    <div className="wrap"><div className="page" style={{paddingTop:24}}>
      {roomInviteModal}
      {/* Banner de reconexión rápida */}
      {reconnectReady&&lastKnownCode&&(
        <div style={{background:"linear-gradient(135deg,rgba(46,196,182,.18),rgba(46,196,182,.08))",border:"2px solid rgba(46,196,182,.5)",borderRadius:16,padding:"14px 16px",marginBottom:14,position:"relative"}}>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",color:"var(--t)",letterSpacing:2,marginBottom:4}}>{T.activeRoomFound}</div>
          <div style={{fontWeight:900,fontSize:".96rem",marginBottom:10}}>{T.codeLabelInline} <span style={{fontFamily:"'Anton',sans-serif",fontSize:"1.3rem",color:"var(--y)",letterSpacing:3}}>{lastKnownCode}</span></div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-t" style={{flex:2,padding:"10px",fontSize:".86rem"}} onClick={()=>{snd("join");onReconnect(true);}}>{T.reconnectAdmin}</button>
            <button className="btn btn-g" style={{flex:1,padding:"10px",fontSize:".78rem"}} onClick={()=>{snd("tap");onDismissReconnect();}}>{T.ignoreBtn}</button>
          </div>
        </div>
      )}
      <div className="hero">
        <div style={{fontSize:"2.8rem",marginBottom:6}}>{joinIntent==="spectate"?"👁":"🎮"}</div>
        <div className="hero-logo" style={{fontSize:"2.4rem"}}>{joinIntent==="spectate"?T.viewScoreboardCaps:T.joinCapsLogo}</div>
        <div className="hero-tag">{T.roomCodeTitle}</div>
      </div>
      {/* Movido aquí (antes solo aparecía DENTRO de la pantalla en vivo) —
          la idea es invitar a usarlo ANTES de que decidan cómo van a ver
          la partida, no explicárselo cuando ya están adentro. */}
      {joinIntent==="spectate"&&(
        <div style={{textAlign:"center",background:"rgba(46,196,182,.06)",border:"1px solid rgba(46,196,182,.25)",
          borderRadius:13,padding:"10px 14px",marginBottom:14,fontFamily:"'Righteous',sans-serif",
          fontSize:".68rem",color:"rgba(255,255,255,.6)",lineHeight:1.6}}>
          {T.idealForTablet}
        </div>
      )}
      {!pickingPlayer&&(<>
        <p className="sec">{T.roomCodeCapsLbl}</p>
        <input className="inp code-inp" placeholder="XXXX" maxLength={4} value={jcode}
          onChange={e=>setJcode(e.target.value.toUpperCase())} onFocus={()=>snd('tap')}/>
        {joinIntent==="spectate"?(<>
          <div className="g12"/>
          {err&&<ErrBox err={err}/>}
          <button className="btn btn-t" onClick={()=>{snd('tap');tryJoin(true);}} disabled={busy||jcode.length<4}>
            {busy?"⏳":T.enterSpectatorBtn}
          </button>
        </>):(<>
          <p className="sec" style={{marginTop:12}}>{T.yourNameCaps}</p>
          <input className="inp" placeholder={T.joinNamePlaceholder} value={jname}
            onChange={e=>setJname(e.target.value)} onFocus={()=>snd('tap')}/>
          {err&&<ErrBox err={err}/>}
          <div className="g12"/>
          <button className="btn btn-y" onClick={()=>{snd('tap');tryJoin(false);}} disabled={busy||jcode.length<4||!jname.trim()}>
            {busy?T.searchingRoomLbl:T.joinGameCapsBtn}
          </button>
          <div className="div"/>
          <p className="sec">{T.spectatorOnlyLbl}</p>
          <button className="btn btn-t" onClick={()=>{snd('tap');tryJoin(true);}} disabled={busy||jcode.length<4}>
            {busy?"⏳":T.enterSpectatorBtn}
          </button>
        </>)}
      </>)}
      {pickingPlayer&&roomPlayers&&(<>
        <div className="alert al-y" style={{marginBottom:14}}>
          ℹ <span>{T.choosePlayerHint}</span>
        </div>
        <p className="sec">{T.choosePlayerLbl}</p>
        {roomPlayers.map(p=>{
          // Verificar si el jugador ya tiene presencia activa en Firebase
          const onlineIds = roomPlayersOnline||[];
          const isOnline = onlineIds.includes(p.id);
          return(
            <div key={p.id}
              className={"player-pick"+(isOnline?" selected":"")}
              onClick={()=>{if(!isOnline)pickPlayer(p);}}
              style={{opacity:isOnline?.55:1,cursor:isOnline?"not-allowed":"pointer",
                border:"2px solid "+(isOnline?"rgba(230,57,70,.4)":"rgba(255,255,255,.1)")}}>
              <div className="ava" style={{background:p.color+"22",color:p.color,width:42,height:42,fontSize:"1.4rem"}}><Ava v={p.emoji}/></div>
              <div style={{flex:1}}>
                <div style={{fontWeight:900,fontSize:"1rem"}}>{p.name}</div>
                <div style={{fontSize:".72rem",color:isOnline?"var(--r)":"rgba(255,255,255,.4)",fontWeight:700}}>
                  {isOnline?"🔴 "+T.inRoomTag+" — "+T.alreadyConnectedLbl:p.total+" pts · "+(p.rounds||[]).length+" "+T.roundWordBarePlural}
                </div>
              </div>
              <div style={{color:"rgba(255,255,255,.3)",fontSize:"1.2rem"}}>{isOnline?"🔒":"›"}</div>
            </div>
          );
        })}
        <div className="div"/>
        <p className="sec">{T.joinAsNewLbl}</p>
        <input className="inp" placeholder={T.newPlayerNamePlaceholder} value={jname}
          onChange={e=>setJname(e.target.value)} onFocus={()=>snd('tap')}/>
        <button className="btn btn-y" onClick={()=>{snd('tap');joinAsNew();}} disabled={busy||!jname.trim()}>
          {T.addNewPlayerBtn}
        </button>
      </>)}
      <div className="g8"/><button className="btn btn-g" onClick={()=>go("main")}>{T.back}</button>
    </div></div>
  );

  if(view==="stats"){
    if(authUser&&!authUser.isAnonymous)
      return<>{roomInviteModal}<PersonalDashboard authUser={authUser} onBack={()=>go("main")} T={T} initialTab={dashboardTab} mode={dashboardMode}/></>;
    return<>{roomInviteModal}<StatsScreen onBack={()=>go("main")} T={T}/></>;
  }
  if(view==="grupos")return<>{roomInviteModal}<GroupsScreen authUser={authUser} onBack={()=>go("main")}
    onJoinRoom={code=>{
      // Mismo arreglo que en el banner de Home: unirse directo, sin
      // formulario manual — reconstituimos el objeto grupo a partir del código.
      const g=myGroupsHome.find(x=>x.currentRoom===code)||{currentRoom:code,name:T.yourGroupLbl};
      quickJoinGroup(g);
    }}
    onPlay={async({names,groupId,groupName})=>{
      snd("round");
      // names llega como [{name,uid}] — traer el seudónimo/emoji/color
      // GUARDADO de cada quien (mismo criterio que applyPicked) en vez de
      // su nombre de cuenta y un color genérico por orden, y conservar su
      // uid real para que las estadísticas de fin de partida no dependan
      // de adivinar por nombre.
      const enriched=await enrichPickedPlayers(names);
      const filled=enriched.slice(0,8);
      const padded=[...filled,{name:"",uid:null,emoji:null,color:null},{name:"",uid:null,emoji:null,color:null}]
        .slice(0,Math.max(filled.length+1,3));
      setNames(padded.map(p=>p.name));
      setPlayerUids(padded.map(p=>p.uid));
      setPlayerEmojis(padded.map((p,i)=>p.emoji||EMOJIS[i%EMOJIS.length]));
      setPlayerColors(padded.map((p,i)=>p.color||COLORS[i%COLORS.length]));
      // Associate with the group
      setSelectedGroup(myGroupsHome.find(g=>g.id===groupId)||{id:groupId,name:groupName,code:""});
      go("create");
    }}
    T={T}/></>;

  if(view==="perfil")return<>{roomInviteModal}<ProfileScreen authUser={authUser} onBack={()=>go("main")}
    onSaved={p=>{
      // Reaplicar de inmediato a tu fila (índice 0) — antes esto solo
      // pasaba una vez, la primera vez que cargaba el perfil en esta
      // sesión, así que si guardabas un cambio después (ej. el seudónimo)
      // no se reflejaba hasta recargar la página.
      setMyProfile(p);
      if(p.nickname)setNames(nm=>{const c=[...nm];c[0]=p.nickname;return c;});
      if(p.defaultEmoji||p.defaultAvatar)setPlayerEmojis(pe=>{const c=[...pe];c[0]=effectiveEmoji(p);return c;});
      if(p.defaultColor)setPlayerColors(pc=>{const c=[...pc];c[0]=p.defaultColor;return c;});
    }} T={T}/></>;

  return(
    <div className="wrap"><div className="page" style={{paddingTop:24}}>
      {roomInviteModal}
      {/* Banner de reconexión rápida */}
      {reconnectReady&&lastKnownCode&&(
        <div style={{background:"linear-gradient(135deg,rgba(46,196,182,.18),rgba(46,196,182,.08))",border:"2px solid rgba(46,196,182,.5)",borderRadius:16,padding:"14px 16px",marginBottom:14,position:"relative"}}>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",color:"var(--t)",letterSpacing:2,marginBottom:4}}>{T.activeRoomFound}</div>
          <div style={{fontWeight:900,fontSize:".96rem",marginBottom:10}}>{T.codeLabelInline} <span style={{fontFamily:"'Anton',sans-serif",fontSize:"1.3rem",color:"var(--y)",letterSpacing:3}}>{lastKnownCode}</span></div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-t" style={{flex:2,padding:"10px",fontSize:".86rem"}} onClick={()=>{snd("join");onReconnect(true);}}>{T.reconnectAdmin}</button>
            <button className="btn btn-g" style={{flex:1,padding:"10px",fontSize:".78rem"}} onClick={()=>{snd("tap");onDismissReconnect();}}>{T.ignoreBtn}</button>
          </div>
        </div>
      )}
      <div className="hero">
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8,position:"relative"}}>
          <button onClick={()=>{snd('tap');setShowSecondaryMenu(v=>!v);}}
            aria-label={T.moreOptionsAria}
            style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",
              color:"rgba(255,255,255,.6)",borderRadius:9,width:32,height:32,cursor:"pointer",
              fontSize:"1rem",display:"flex",alignItems:"center",justifyContent:"center"}}>
            ⚙️
          </button>
          {showSecondaryMenu&&(
            <div style={{position:"absolute",top:38,right:0,zIndex:20,minWidth:180,
              background:"var(--dark,#14141f)",border:"1px solid rgba(255,255,255,.15)",
              borderRadius:12,padding:6,boxShadow:"0 8px 24px rgba(0,0,0,.4)"}}>
              <div style={{display:"flex",gap:4,padding:"2px 4px 8px"}}>
                {LANG_OPTS.map(o=>(
                  <button key={o.v} onClick={()=>{snd('tap');setLang(o.v);}}
                    style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                      background:o.v===lang?"rgba(245,200,0,.12)":"none",
                      border:"1px solid "+(o.v===lang?"rgba(245,200,0,.4)":"rgba(255,255,255,.1)"),
                      borderRadius:8,padding:"6px 2px",cursor:"pointer"}}>
                    <span style={{fontSize:"1.05rem",lineHeight:1}}>{o.flag}</span>
                    <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".5rem",
                      color:o.v===lang?"var(--y)":"rgba(255,255,255,.5)"}}>{o.v.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              <button onClick={()=>{setShowSecondaryMenu(false);go('perfil');}}
                style={{width:"100%",textAlign:"left",background:"none",border:"none",
                  padding:"9px 10px",borderRadius:8,cursor:"pointer",
                  fontFamily:"'Righteous',sans-serif",fontSize:".78rem",
                  color:"rgba(255,255,255,.75)",display:"flex",alignItems:"center",gap:8}}>
                {T.profileMenuItem}
              </button>
              <button onClick={()=>{snd('tap');setShowSecondaryMenu(false);setShowFeedbackModal(true);}}
                style={{width:"100%",textAlign:"left",background:"none",border:"none",
                  padding:"9px 10px",borderRadius:8,cursor:"pointer",
                  fontFamily:"'Righteous',sans-serif",fontSize:".78rem",
                  color:"rgba(255,255,255,.75)",display:"flex",alignItems:"center",gap:8}}>
                {T.reportBugMenuItem}
              </button>
            </div>
          )}
          {showFeedbackModal&&<FeedbackModal authUser={authUser} T={T} onClose={()=>setShowFeedbackModal(false)}/>}
        </div>
        {HERO_LOGO_TEST?<HeroLogo T={T}/>:<>
        <div style={{fontSize:"3.5rem",marginBottom:8}}>🎴</div>
        <div className="hero-logo">FLIP 7</div>
        <div className="hero-tag">Race to 200!</div>
        </>}
        {/* User greeting */}
        {authUser&&!authUser.isAnonymous?(
          <div style={{display:"inline-flex",alignItems:"center",gap:8,
            background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
            borderRadius:20,padding:"5px 12px 5px 8px",marginTop:6}}>
            {authUser.photoURL
              ? <img src={authUser.photoURL} style={{width:22,height:22,borderRadius:"50%",objectFit:"cover"}} alt=""/>
              : <div style={{width:22,height:22,borderRadius:"50%",background:"var(--y)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'Anton',sans-serif",fontSize:".7rem",color:"var(--dark)"}}>
                  {(authUser.displayName||authUser.email||"?")[0].toUpperCase()}
                </div>
            }
            <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",
              color:"rgba(255,255,255,.7)",letterSpacing:1}}>
              {authUser.displayName||(authUser.email||"").split("@")[0]}
            </span>
            <span onClick={()=>{if(confirm(T.signOutConfirm))signOut();}}
              style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                color:"rgba(255,255,255,.25)",letterSpacing:1,cursor:"pointer",
                borderLeft:"1px solid rgba(255,255,255,.1)",paddingLeft:8}}>
              {T.signOutShortLbl}
            </span>
          </div>
        ):authUser&&authUser.isAnonymous?(
          <div style={{marginTop:8,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,
              background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
              borderRadius:20,padding:"4px 12px 4px 8px"}}>
              <span style={{fontSize:"1rem"}}>👤</span>
              <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
                color:"rgba(255,255,255,.4)",letterSpacing:1}}>{T.guestModeLbl}</span>
              <span onClick={()=>signOut()}
                style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
                  color:"var(--t)",letterSpacing:1,cursor:"pointer",
                  borderLeft:"1px solid rgba(255,255,255,.1)",paddingLeft:8}}>
                {T.changeAccount}
              </span>
            </div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
              color:"rgba(230,57,70,.5)",letterSpacing:1,maxWidth:260,textAlign:"center",
              background:"rgba(230,57,70,.08)",border:"1px solid rgba(230,57,70,.2)",
              borderRadius:8,padding:"4px 10px"}}>
              {T.anonExpireWarn}
            </div>
          </div>
        ):(
          <p style={{color:"rgba(255,255,255,.3)",fontWeight:700,fontSize:".8rem",
            maxWidth:240,margin:"6px auto 0"}}>{T.appTag}</p>
        )}
      </div>
      <button className="btn btn-y" onClick={()=>go("create")}>{T.createGame}</button>
      <button className="btn btn-t" onClick={()=>{setJoinIntent("play");go("join");}}>🎮 {T.joinGame}</button>

      {/* Accesos secundarios en grid 2x2: Estadísticas · Amigos · Mis grupos · Espectador */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
        {[
          {key:"stats",label:T.statsMenuLbl,icon:"📊",cls:"btn3-y",locked:false,onClick:()=>goDashboard("me")},
          {key:"friends",label:T.friendsMenuLbl,icon:"👥",cls:"btn3-y",locked:isAnonHome,onClick:()=>goDashboard("friends")},
        ].map(b=>(
          <button key={b.key} className={"btn3 "+b.cls} onClick={b.onClick} style={{
            position:"relative",padding:"12px 4px",fontSize:".8rem",
            opacity:b.locked?.55:1}}>
            {b.locked&&<span style={{position:"absolute",top:4,right:6,fontSize:".7rem"}}>🔒</span>}
            {b.key==="friends"&&!b.locked&&pendingFriendReqCount>0&&(
              <span style={{position:"absolute",top:-5,right:-5,width:20,height:20,
                borderRadius:"50%",background:"var(--r)",border:"2px solid var(--dark,#0F0F1A)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'Anton',sans-serif",fontSize:".65rem",color:"#fff",
                boxShadow:"0 0 10px rgba(230,57,70,.6)"}}>
                {pendingFriendReqCount}
              </span>
            )}
            {b.icon} {b.label}
          </button>
        ))}

        <button className="btn3 btn3-y" onClick={()=>go("grupos")} style={{
          position:"relative",padding:"12px 4px",fontSize:".8rem",
          opacity:isAnonHome?.55:1
        }}>
          {isAnonHome&&<span style={{position:"absolute",top:4,right:6,fontSize:".7rem"}}>🔒</span>}
          {T.myGroupsMenuBtn}
          {!isAnonHome&&myGroupsHome.length>0&&(()=>{
            const onlineCount=myGroupsHome.reduce((acc,g)=>{
              const members=g.members||{};
              return acc+Object.keys(members).filter(muid=>muid!==authUser.uid&&presenceHome[muid]&&presenceHome[muid].online).length;
            },0);
            return onlineCount>0
              ? <span style={{position:"absolute",bottom:-6,right:6,fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                  background:"var(--gr)",color:"#fff",borderRadius:20,padding:"1px 6px",
                  letterSpacing:1}}>{onlineCount}●</span>
              : null;
          })()}
        </button>

        <button className="btn3 btn3-y" onClick={()=>{snd('tap');setJoinIntent("spectate");go("join");}} style={{
          padding:"12px 4px",fontSize:".8rem"}}>
          {T.spectatorMenuItem}
        </button>
      </div>
      {upgradeModal&&(
        <UpgradeAccountModal featureLabel={upgradeModal.label} T={T}
          onClose={()=>setUpgradeModal(null)}
          onDone={()=>{setUpgradeModal(null);}}/>
      )}
      {/* Friends online banner */}
      {myGroupsHome.length>0&&(()=>{
        const activeSessions=myGroupsHome.filter(g=>g.currentRoom);
        if(activeSessions.length===0)return null;
        return activeSessions.map(g=>(
          <div key={g.id} style={{
            background:"linear-gradient(135deg,rgba(59,178,115,.15),rgba(59,178,115,.06))",
            border:"2px solid rgba(59,178,115,.4)",borderRadius:12,
            padding:"10px 14px",marginBottom:8,
            display:"flex",alignItems:"center",gap:10
          }}>
            <div style={{fontSize:"1.3rem"}}>🎮</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
                color:"var(--gr)",letterSpacing:1,fontWeight:900}}>{g.name}</div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                color:"rgba(255,255,255,.4)",letterSpacing:1}}>{T.gameInProgressRoomTpl.replace('{code}',g.currentRoom)}</div>
            </div>
            <button onClick={()=>{snd('tap');quickJoinGroup(g);}}
              style={{background:"var(--gr)",border:"none",borderRadius:9,
              padding:"6px 12px",cursor:"pointer",fontFamily:"'Righteous',sans-serif",
              fontSize:".65rem",color:"#fff",fontWeight:900,flexShrink:0}}>
              {T.joinArrow}
            </button>
          </div>
        ));
      })()}
      {sessions.length>0&&(<><div className="div"/><p className="sec">{T.recentSessions}</p><SesCards sessions={sessions} T={T} onClear={()=>{setSessions([]);try{localStorage.removeItem("f7sess")}catch{}}}/></>)}
      <div style={{textAlign:"center",marginTop:20,paddingBottom:8}}>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.15)",letterSpacing:2}}>v3.1 · FLIP 7</span>
        <button onClick={()=>{localStorage.clear();sessionStorage.clear();window.location.reload();}}
          style={{display:"block",margin:"6px auto 0",background:"none",border:"none",
            color:"rgba(255,255,255,.15)",fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
            cursor:"pointer",letterSpacing:1,textDecoration:"underline"}}>
          {T.clearCacheLbl}
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

// Paleta para el color aleatorio de la insignia de ronda — colores
// saturados que se leen bien con texto blanco encima (nada de blanco ni
// pasteles muy claros, que se pierden contra el fondo oscuro del pill).
const ROUND_BADGE_COLORS=["#7B2D8B","#E63946","#1A4FCC","#3BB273","#FF6B35","#2EC4B6","#B8195B"];

// ── ROUNDTAB ──────────────────────────────────────────────────
function RoundTab({room,allDone,onSubmit,onUndo,onFinalize,myPlayerId,isHost,demoMode,aiConfig,setAiConfig,onRematch,onEndGame,onTransferHost,onEndGameForAll,roomCode,T}){
  const[scanModal,setScan]=useState(null);
  const[manModal,setMan]=useState(null);  // {pid, name, initialScore}
  const[cardModal,setCard]=useState(null); // {pid, name}
  const[vengCardModal,setVengCard]=useState(null); // {pid, name} — Venganza mode
  const[shakePid,setShakePid]=useState(null);
  const[showTransfer,setShowTransfer]=useState(false);
  const[showTentative,setShowTentative]=useState(true);
  // Seguro leve para el admin: por default NO puede tocar la fila de otro
  // jugador con un solo tap accidental — tiene que desbloquear con el
  // switch de arriba primero. El desbloqueo se consume solo (se re-bloquea
  // automáticamente) apenas se usa una sola vez, para no dejarlo "abierto"
  // sin querer el resto de la partida.
  const[otherRowUnlocked,setOtherRowUnlocked]=useState(false);

  // Aviso de ronda nueva — toast animado + sonido cuando room.round sube,
  // para que se note claramente que arrancó otra ronda. La insignia
  // "RONDA N" (antes solo "R1") también cambia a un color aleatorio
  // distinto del anterior en cada cambio, para que el cambio se note de
  // un vistazo aunque te hayas perdido la animación.
  const prevRoundRef=useRef(room.round);
  const[roundToast,setRoundToast]=useState(false);
  const[roundColor,setRoundColor]=useState(ROUND_BADGE_COLORS[0]);
  React.useEffect(()=>{
    if(prevRoundRef.current!==room.round){
      prevRoundRef.current=room.round;
      if(!room.finished){
        setRoundToast(true);
        setRoundColor(prev=>{
          const pool=ROUND_BADGE_COLORS.filter(c=>c!==prev);
          return pool[Math.floor(Math.random()*pool.length)];
        });
        snd('roundchange');
        setTimeout(()=>setRoundToast(false),2400);
      }
    }
  },[room.round]);

  // Auto-cerrar ronda: si el host activó la opción, y todos ya
  // capturaron, cierra sola sin que el host tenga que tocar nada.
  const autoCloseRef=useRef(false);
  React.useEffect(()=>{
    if(room.autoCloseRound&&allDone&&isHost&&!room.finished&&room.players.length>=2&&!autoCloseRef.current){
      autoCloseRef.current=true;
      setTimeout(()=>{onFinalize();autoCloseRef.current=false;},900); // breve pausa para ver el último "LISTO"
    }
  },[room.autoCloseRound,allDone,isHost,room.finished]);
  const[confirmEnd,setConfirmEnd]=useState(false);
  const canControl=pid=>isHost||myPlayerId===pid;
  const gameMode=(room&&room.gameMode)||'classic';
  const isVenganza=gameMode==='venganza';
  // Meta real de ESTA sala — antes las barras de avance en esta pantalla
  // tenían 200 fijo en el código, así que si la partida se creaba a 150
  // (o cualquier otra meta) el % y el "faltan" seguían calculando contra
  // 200, dando números incorrectos.
  const target=room.winTarget||WIN;

  // ¿Es una fila ajena que el admin controla solo por ser admin (no la suya
  // propia)? Esas son las que quedan protegidas por default.
  const isForeignRow=pid=>isHost&&myPlayerId!==pid;

  // Wrappers que re-bloquean el candado automáticamente después de usarlo
  // UNA vez sobre una fila ajena — así el admin tiene que desbloquear cada
  // vez que quiera tocar a otro jugador, en vez de dejarlo prendido y
  // olvidarse (que era justo el riesgo de equivocarse por accidente).
  function submitWithLock(pid,score,method,breakdown){
    onSubmit(pid,score,method,breakdown);
    if(isForeignRow(pid)&&otherRowUnlocked)setOtherRowUnlocked(false);
  }
  function undoWithLock(pid){
    onUndo(pid);
    if(isForeignRow(pid)&&otherRowUnlocked)setOtherRowUnlocked(false);
  }

  function handleZero(pid){
    snd('zero');setShakePid(pid);setTimeout(()=>setShakePid(null),500);
    submitWithLock(pid,0,"zero");
  }

  return(
    <>
      {room.finished&&room.winner&&(
        <div style={{background:"linear-gradient(135deg,rgba(245,200,0,.15),rgba(255,107,53,.1))",
          border:"2px solid rgba(245,200,0,.4)",borderRadius:16,padding:"16px",marginBottom:14,textAlign:"center"}}>
          <div style={{fontSize:"2.5rem",marginBottom:4}}>🏆</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.8rem",color:"var(--y)",letterSpacing:2,marginBottom:2}}>{room.winner.name} {T.winner}!</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".78rem",color:"rgba(255,255,255,.5)",letterSpacing:2,marginBottom:14}}>{T.ptsGameOverTemplate.replace('{pts}',room.winner.total)}</div>
          <div style={{display:"flex",gap:8}}>
            {/* Solo el host puede iniciar revancha */}
            {isHost
              ? <button className="btn btn-y" style={{flex:1,minWidth:0,fontSize:".9rem",padding:"12px"}} onClick={()=>onRematch(room.players)}>{T.rematch}</button>
              : <div style={{flex:1,minWidth:0,padding:"12px",background:"rgba(255,255,255,.05)",borderRadius:14,fontFamily:"'Righteous',sans-serif",fontSize:".78rem",color:"rgba(255,255,255,.35)",letterSpacing:1,display:"flex",alignItems:"center",justifyContent:"center"}}>{T.waitingRematchAdmin}</div>
            }
            {/* Si sos host, "Terminar" cierra la partida para TODOS (avisa a
                los demás y los regresa a Home) — antes solo te sacaba a vos,
                y a los demás les quedaba pegado el aviso de "admin
                desconectado" sin explicarles que la partida ya terminó. Si
                NO sos host, sigue siendo solo salir vos. */}
            <button className="btn btn-g" style={{flex:1,minWidth:0,fontSize:".9rem",padding:"12px"}}
              onClick={isHost?onEndGameForAll:onEndGame}>{T.endGame}</button>
          </div>
        </div>
      )}
      {/* Aviso admin desconectado */}
      {!isHost&&room.hostOnline===false&&(
        <div className="alert al-r" style={{marginBottom:10}}>
          <div style={{fontWeight:900}}>{T.adminDisconnectedTitle}</div>
          <div style={{fontSize:".78rem",opacity:.8,marginTop:3}}>{T.adminReconnectHint.replace('{code}',roomCode)}</div>
        </div>
      )}
      {/* Jugadores desconectados */}
      {room.players.some(p=>room.presence&&room.presence[p.id]===undefined&&p.id!==myPlayerId)&&isHost&&(
        <div className="alert al-y" style={{marginBottom:8,fontSize:".76rem"}}>
          {T.playerDisconnectedHint}
        </div>
      )}
      {!room.finished&&allDone&&(
        <div className="alert al-g" style={{flexDirection:"column",gap:4}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:"1.1rem"}}>✅</span>
            <span>{isHost?T.allReady:T.waitingHost}</span>
          </div>
        </div>
      )}
      {!room.finished&&!allDone&&(()=>{
        const pending=room.players.filter(p=>room.roundScores?.[p.id]===undefined);
        const done=room.players.filter(p=>room.roundScores?.[p.id]!==undefined);
        if(done.length===0)return null; // nadie ha capturado aún, no mostrar
        return(
          <div className="alert al-y" style={{flexDirection:"column",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:"1rem"}}>⏳</span>
              <span style={{fontWeight:900}}>{T.missingOfTemplate.replace('{n}',pending.length).replace('{m}',room.players.length)}</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:2}}>
              {pending.map(p=>(
                <span key={p.id} style={{
                  display:"inline-flex",alignItems:"center",gap:4,
                  background:"rgba(245,200,0,.12)",border:"1px solid rgba(245,200,0,.35)",
                  borderRadius:20,padding:"3px 9px",
                  fontFamily:"'Righteous',sans-serif",fontSize:".68rem",letterSpacing:1
                }}>
                  <span style={{color:p.color}}><Ava v={p.emoji}/></span>
                  <span style={{color:"rgba(255,255,255,.8)",fontWeight:800}}>{p.name}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}
      {/* Antes era un pill chiquito pegado al header y se perdía — ahora
          es una animación de pantalla completa (ver RoundChangeOverlay). */}
      {roundToast&&<RoundChangeOverlay round={room.round} color={roundColor} T={T}/>}
      {/* Meta de la partida — visible arriba de todo para que quede claro
          a cuánto se está jugando, sin tener que ir a la pestaña Tabla. */}
      <div style={{textAlign:"center",marginBottom:10}}>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".64rem",letterSpacing:2,
          color:"var(--y)",background:"rgba(245,200,0,.08)",border:"1px solid rgba(245,200,0,.3)",
          borderRadius:20,padding:"4px 13px",display:"inline-flex",alignItems:"center",gap:5}}>
          {T.goalTargetPts.replace('{n}',target)}
        </span>
      </div>
      <div className="rsb" style={{marginBottom:10}}>
        <p className="sec" style={{margin:0}}>{T.players2}</p>
        {/* El código de sala ya se ve arriba en el header — repetirlo aquí
            al lado de RONDA era redundante, así que se quitó de este renglón. */}
        <div className="rbd" style={{background:"linear-gradient(135deg,"+roundColor+","+roundColor+"cc)",
          boxShadow:"0 2px 10px "+roundColor+"55",transition:"background .3s"}}>
          {T.roundBadgeTemplate.replace('{n}',room.round)}
        </div>
      </div>
      {/* Controles de host — solo visibles para quien tiene el rol */}
      {isHost&&!room.finished&&!demoMode&&(
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <button onClick={()=>{snd('tap');setShowTransfer(v=>!v);}}
            style={{flex:1,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",
              color:"rgba(255,255,255,.55)",borderRadius:9,padding:"7px 8px",cursor:"pointer",
              fontFamily:"'Righteous',sans-serif",fontSize:".62rem",letterSpacing:1}}>
            🔁 Transferir admin
          </button>
          <button onClick={()=>{snd('tap');setConfirmEnd(true);}}
            style={{flex:1,background:"rgba(230,57,70,.08)",border:"1px solid rgba(230,57,70,.25)",
              color:"var(--r)",borderRadius:9,padding:"7px 8px",cursor:"pointer",
              fontFamily:"'Righteous',sans-serif",fontSize:".62rem",letterSpacing:1}}>
            🛑 Terminar partida
          </button>
        </div>
      )}
      {isHost&&!room.finished&&!demoMode&&(
        <div onClick={()=>{snd('tap');_db.ref("rooms/"+roomCode+"/autoCloseRound").set(!room.autoCloseRound);}}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",
            background:room.autoCloseRound?"rgba(59,178,115,.08)":"rgba(255,255,255,.03)",
            border:"1px solid "+(room.autoCloseRound?"rgba(59,178,115,.3)":"rgba(255,255,255,.1)"),
            borderRadius:10,padding:"8px 12px",marginBottom:10}}>
          <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".64rem",
            color:room.autoCloseRound?"var(--gr)":"rgba(255,255,255,.45)",letterSpacing:.5}}>
            {T.autoCloseHint}
          </span>
          <div style={{width:34,height:19,borderRadius:20,position:"relative",flexShrink:0,
            background:room.autoCloseRound?"var(--gr)":"rgba(255,255,255,.15)",transition:"background .2s"}}>
            <div style={{position:"absolute",top:2,left:room.autoCloseRound?17:2,width:15,height:15,
              borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
          </div>
        </div>
      )}
      {/* Seguro de edición de filas ajenas — protegido por default para que
          un tap accidental no capture/corrija a otro jugador. El admin lo
          prende cuando SÍ quiere tocar la fila de alguien más, y se apaga
          solo después de usarlo una vez. */}
      {isHost&&!room.finished&&!demoMode&&room.players.length>1&&(
        <div onClick={()=>{snd('tap');setOtherRowUnlocked(v=>!v);}}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",
            background:otherRowUnlocked?"rgba(230,57,70,.1)":"rgba(255,255,255,.03)",
            border:"1px solid "+(otherRowUnlocked?"rgba(230,57,70,.35)":"rgba(255,255,255,.1)"),
            borderRadius:10,padding:"8px 12px",marginBottom:10}}>
          <div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".64rem",
              color:otherRowUnlocked?"var(--r)":"rgba(255,255,255,.45)",letterSpacing:.5}}>
              {otherRowUnlocked?"🔓":"🔒"} {T.editOtherRowLbl}
            </div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
              color:"rgba(255,255,255,.3)",marginTop:2}}>
              {otherRowUnlocked?T.unlockedAutoRelock:T.protectedRowHint}
            </div>
          </div>
          <div style={{width:34,height:19,borderRadius:20,position:"relative",flexShrink:0,
            background:otherRowUnlocked?"var(--r)":"rgba(255,255,255,.15)",transition:"background .2s"}}>
            <div style={{position:"absolute",top:2,left:otherRowUnlocked?17:2,width:15,height:15,
              borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
          </div>
        </div>
      )}
      {isHost&&showTransfer&&(
        <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.1)",
          borderRadius:12,padding:10,marginBottom:10}}>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
            color:"rgba(255,255,255,.4)",letterSpacing:1,marginBottom:8}}>
            {T.chooseNewAdminCaps}
          </div>
          {room.players.filter(p=>p.id!==myPlayerId).map(p=>{
            const online=room.presence&&room.presence[p.id];
            return(
              <button key={p.id} disabled={!online}
                onClick={()=>{onTransferHost(p.id);setShowTransfer(false);}}
                style={{width:"100%",display:"flex",alignItems:"center",gap:8,
                  padding:"8px 10px",marginBottom:5,borderRadius:9,
                  background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
                  cursor:online?"pointer":"not-allowed",opacity:online?1:.4}}>
                <span style={{color:p.color}}><Ava v={p.emoji}/></span>
                <span style={{flex:1,textAlign:"left",fontWeight:900,fontSize:".8rem",color:"#fff"}}>{p.name}</span>
                <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                  color:online?"var(--gr)":"rgba(255,255,255,.25)"}}>{online?T.onlineDotWord:T.offlineSimple}</span>
              </button>
            );
          })}
        </div>
      )}
      {isHost&&confirmEnd&&(
        <div style={{background:"rgba(230,57,70,.08)",border:"2px solid rgba(230,57,70,.3)",
          borderRadius:12,padding:12,marginBottom:10,textAlign:"center"}}>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"var(--r)",
            marginBottom:8,fontWeight:900}}>{T.endGameConfirmQ}</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
            color:"rgba(255,255,255,.4)",marginBottom:10}}>
            {T.endGameConfirmDesc}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{snd('tap');onEndGameForAll();}}
              style={{flex:1,background:"var(--r)",border:"none",borderRadius:9,padding:"9px",
                cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:".78rem",color:"#fff"}}>
              {T.yesEndGame}
            </button>
            <button onClick={()=>setConfirmEnd(false)}
              style={{flex:1,background:"rgba(255,255,255,.07)",border:"none",borderRadius:9,padding:"9px",
                cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:".78rem",color:"rgba(255,255,255,.6)"}}>
              {T.cancel}
            </button>
          </div>
        </div>
      )}
      {(()=>{
        // Tu fila siempre primero — el resto conserva su orden relativo
        // (sort es estable, así que solo "jala" tu fila al frente).
        const orderedPlayers=[...room.players].sort((a,b)=>{
          if(a.id===myPlayerId)return -1;
          if(b.id===myPlayerId)return 1;
          return 0;
        });
        return orderedPlayers.map(p=>{
        const entry=room.roundScores?.[p.id];const done=entry!==undefined;const mine=canControl(p.id);
        const isShaking=shakePid===p.id;
        // Fila ajena que el admin controla solo por ser admin y que NO
        // desbloqueó — se muestra protegida en vez de los botones normales.
        const rowLocked=isForeignRow(p.id)&&!otherRowUnlocked;
        return(
          <div key={p.id}
            className={"pr "+(done?"done":"")+(p.id===myPlayerId?" me":"")+((done&&p.id===myPlayerId)?" me-done":"")+(isShaking?" zero-flash":"")}
            style={{"--clr":p.color}}>
            <div className="ava" style={{background:p.color+"22",color:p.color,border:"2px solid "+p.color+"55",boxShadow:"0 0 10px "+p.color+"33",fontSize:"1.4rem"}}><Ava v={p.emoji}/></div>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8}}>
                <div className="pr-name" style={{display:"flex",alignItems:"center",gap:5}}>
                  {/* nombre con color del jugador */}
                  <span style={{color:p.color,textShadow:"0 0 8px "+p.color+"55"}}>{p.name}</span>
                  {myPlayerId===p.id&&<span className="me-tag">{T.grpYouTag}</span>}
                  {room.hostPlayerId===p.id&&(
                    <span style={{display:"inline-flex",alignItems:"center",gap:2,
                      background:"rgba(245,200,0,.18)",border:"1px solid rgba(245,200,0,.4)",
                      borderRadius:20,padding:"1px 7px",fontFamily:"'Righteous',sans-serif",
                      fontSize:".55rem",color:"var(--y)",letterSpacing:1,fontWeight:900}}>{T.adminCrownBadge}</span>
                  )}
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:4,flexShrink:0}}>
                  <span style={{fontFamily:"'Anton',sans-serif",fontSize:"1.5rem",color:p.color,lineHeight:1,textShadow:"2px 2px 0 rgba(0,0,0,.4)"}}>{p.total}</span>
                  <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.3)",letterSpacing:1}}>{T.ptsAbbrev}</span>
                </div>
              </div>
              <div style={{height:3,background:"rgba(255,255,255,.07)",borderRadius:2,marginTop:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:Math.min(100,(p.total/target)*100)+"%",
                  background:"linear-gradient(90deg,"+p.color+","+p.color+"aa)",borderRadius:2,transition:"width .8s"}}/>
              </div>
              {/* % de avance chiquito, mismo color que la barra */}
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".56rem",fontWeight:700,
                color:p.color,letterSpacing:.5,marginTop:2,marginBottom:7,opacity:.85}}>
                {Math.round(Math.min(100,(p.total/target)*100))}%
              </div>
              {done?(
                <div style={{display:"flex",alignItems:"center",gap:7,marginTop:2,flexWrap:"wrap"}}>
                  {/* Score: más grande y verde cuando es tuyo */}
                  <span className="pr-pts" style={p.id===myPlayerId
                    ?{fontSize:"1.5rem",color:"var(--gr)",textShadow:"0 0 14px rgba(59,178,115,.6)"}
                    :{}}>
                    {entry.score===0?"💀":"+"+entry.score}
                  </span>
                  {/* LISTO para todos los que ya terminaron — antes solo se
                      veía para tu propia fila, y de paso se mostraba el
                      método usado (cartas/scan/manual), que no aporta y
                      se ve mejor así de simple. */}
                  <span style={{
                    display:"inline-flex",alignItems:"center",gap:3,
                    background:"rgba(59,178,115,.2)",border:"1px solid rgba(59,178,115,.5)",
                    borderRadius:20,padding:"2px 9px",
                    fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
                    color:"var(--gr)",letterSpacing:1,fontWeight:900
                  }}>{T.readyBadge}</span>
                  {mine&&!room.finished&&!rowLocked&&(
                    <button onClick={()=>{snd('tap');setMan({pid:p.id,name:p.name,initialScore:entry.score});}}
                      style={{background:"rgba(46,196,182,.12)",border:"1px solid rgba(46,196,182,.3)",
                        color:"var(--t)",borderRadius:8,padding:"3px 10px",cursor:"pointer",
                        fontFamily:"'Righteous',sans-serif",fontSize:".62rem",letterSpacing:1,
                        marginLeft:"auto"}}>
                      {T.correct}
                    </button>
                  )}
                  {mine&&!room.finished&&rowLocked&&(
                    <button onClick={()=>{snd('tap');setOtherRowUnlocked(true);}}
                      style={{background:"rgba(230,57,70,.1)",border:"1px solid rgba(230,57,70,.3)",
                        color:"var(--r)",borderRadius:8,padding:"3px 10px",cursor:"pointer",
                        fontFamily:"'Righteous',sans-serif",fontSize:".62rem",letterSpacing:1,
                        marginLeft:"auto"}}>
                      {T.unlockBtn}
                    </button>
                  )}
                </div>
              ):mine&&!rowLocked?(
                <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:6}}>
                  <div className="ar" style={{marginTop:0}}>
                    {!demoMode&&<button className="ab ab-s" style={{flex:1}} onClick={()=>{snd('tap');setScan({pid:p.id,name:p.name});}}>{T.scanIaBtn}</button>}
                    {isVenganza
                      ? <button className="ab ab-c" style={{flex:1}} onClick={()=>{snd('tap');setVengCard({pid:p.id,name:p.name});}}>{T.cardsBtnCaps}</button>
                      : <button className="ab ab-c" style={{flex:1}} onClick={()=>{snd('tap');setCard({pid:p.id,name:p.name});}}>{T.cardsBtnCaps}</button>
                    }
                    <button className="ab ab-m" style={{flex:1}} onClick={()=>{snd('tap');setMan({pid:p.id,name:p.name,initialScore:null});}}>{T.manualBtn}</button>
                  </div>
                  {/* 💀 Cero: registra 0 pts. En Venganza: si te obligan (Just One More y salió duplicado), o si activaste The Zero card, o si hiciste bust. Solo hay un tipo de Cero. — su propia fila, más ancho, para que resalte como acción distinta */}
                  <button className="ab ab-z" style={{width:"100%",justifyContent:"center",padding:"9px 10px"}} onClick={()=>handleZero(p.id)}>{T.zeroBtn}</button>
                </div>
              ):mine&&rowLocked?(
                <div onClick={()=>{snd('tap');setOtherRowUnlocked(true);}}
                  style={{marginTop:6,cursor:"pointer",display:"flex",alignItems:"center",gap:8,
                    background:"rgba(230,57,70,.06)",border:"1px dashed rgba(230,57,70,.3)",
                    borderRadius:10,padding:"9px 12px"}}>
                  <span style={{fontSize:"1rem"}}>🔒</span>
                  <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
                    color:"rgba(230,57,70,.85)",letterSpacing:.5}}>{T.rowProtectedTapHint}</span>
                </div>
              ):(
                <div style={{fontSize:".72rem",color:"rgba(255,255,255,.28)",marginTop:3,fontWeight:700}}>{T.waitingLower}</div>
              )}
            </div>
            {done&&mine&&!room.finished&&!rowLocked&&<button className="undo" onClick={()=>undoWithLock(p.id)}>↩</button>}
          </div>
        );
        });
      })()}
      {room.players.length===0&&(
        <div style={{textAlign:"center",padding:"24px 10px",borderRadius:16,
          border:"2px dashed rgba(245,200,0,.3)",marginBottom:14}}>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",color:"rgba(255,255,255,.35)",letterSpacing:3,marginBottom:10}}>{T.lobbyModeCaps}</div>
          <div className="lobby-code code-mono">{roomCode}</div>
          <div style={{fontSize:".78rem",color:"rgba(255,255,255,.4)",fontWeight:700,marginTop:8}}>
            {T.shareCodeJoinHint}
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
      {scanModal&&<ScanModal playerName={scanModal.name} currentTotal={room.players.find(p=>p.id===scanModal.pid)?.total||0} aiConfig={aiConfig} setAiConfig={setAiConfig} gameMode={gameMode} T={T} onResult={(s,bd)=>{submitWithLock(scanModal.pid,s,"scan",bd);setScan(null);}} onClose={()=>setScan(null)}/>}
      {cardModal&&<CardPickerModal playerName={cardModal.name} currentTotal={room.players.find(p=>p.id===cardModal.pid)?.total||0} T={T} onSubmit={function(s,bd){submitWithLock(cardModal.pid,s,"cards",bd);setCard(null);}} onClose={()=>setCard(null)}/>}
      {/* ManualModal recibe initialScore para permitir corrección */}
      {manModal&&<ManualModal playerName={manModal.name} currentTotal={room.players.find(p=>p.id===manModal.pid)?.total||0} initialScore={manModal.initialScore} gameMode={gameMode} T={T} onSubmit={s=>{submitWithLock(manModal.pid,s,"manual");setMan(null);}} onClose={()=>setMan(null)}/>}
      {vengCardModal&&<VenganzaCardPickerModal playerName={vengCardModal.name} currentTotal={room.players.find(p=>p.id===vengCardModal.pid)?.total||0} T={T} onSubmit={function(s,bd){submitWithLock(vengCardModal.pid,s,"cards",bd);setVengCard(null);}} onClose={()=>setVengCard(null)}/>}
    </>
  );
}

// ── GRÁFICA DE AVANCE — línea de puntaje acumulado por ronda para cada
// jugador, escalando hasta la meta de la partida (la "montaña" a subir).
// SVG a mano, sin librería — mismo criterio del resto del proyecto (sin
// paso de build, todo corre directo en el navegador vía Babel-standalone).
// Anima el trazo de una línea SVG "dibujándose" desde el inicio, con
// velocidad uniforme (no lineal-por-tramos como sería con un dasharray
// fijo a ojo) usando la longitud real del path — getTotalLength().
// Se redispara solo cuando cambia "d" (es decir, cada vez que arranca
// una ronda nueva y la serie de puntos crece).
function AnimatedChartLine({d,color,delay}){
  const ref=React.useRef(null);
  React.useEffect(()=>{
    const el=ref.current;
    if(!el)return;
    let len=0;
    try{len=el.getTotalLength();}catch(e){}
    el.style.transition="none";
    el.style.strokeDasharray=len;
    el.style.strokeDashoffset=len;
    void el.getBoundingClientRect(); // fuerza reflow para que el navegador registre el estado inicial
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        el.style.transition="stroke-dashoffset 1.7s cubic-bezier(.4,0,.2,1) "+delay+"s";
        el.style.strokeDashoffset="0";
      });
    });
  },[d]);
  return<path ref={ref} d={d} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
    style={{filter:"drop-shadow(0 0 3px "+color+") drop-shadow(0 0 7px "+color+"aa)"}}/>;
}
function RoundProgressChart({sorted,target,mr,T}){
  T=T||LANGS.es;
  if(mr<=0||!sorted||sorted.length===0)return null;
  const W=300,H=160,padL=6,padR=6,padT=10,padB=18;
  const innerW=W-padL-padR,innerH=H-padT-padB;
  // Puntaje acumulado ronda a ronda por jugador — arranca en 0 (ronda 0),
  // así la línea siempre sale del piso, como el arranque de una subida.
  const series=sorted.map(p=>{
    let acc=0;
    const pts=[0];
    for(let i=0;i<mr;i++){
      const r=(p.rounds||[])[i];
      acc+=r?(r.score||0):0;
      pts.push(acc);
    }
    return{p,pts};
  });
  const maxVal=Math.max(target,1,...series.flatMap(s=>s.pts));
  const x=i=>padL+innerW*(i/mr);
  const y=v=>padT+innerH-innerH*(Math.max(0,Math.min(v,maxVal))/maxVal);
  const targetY=y(target);
  // El líder actual (mayor puntaje) se resalta con un relleno debajo de su
  // línea — da la sensación de "pico de la montaña" sin saturar la gráfica
  // si hay muchos jugadores (los demás quedan solo como línea).
  const leader=series.reduce((a,b)=>b.pts[b.pts.length-1]>a.pts[a.pts.length-1]?b:a,series[0]);
  const floorY=padT+innerH;
  return(
    <div style={{marginBottom:4}}>
      <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block",overflow:"visible"}}>
        <line x1={padL} y1={targetY} x2={W-padR} y2={targetY}
          stroke="rgba(245,200,0,.45)" strokeWidth="1" strokeDasharray="3,3"/>
        <text x={W-padR} y={Math.max(8,targetY-4)} textAnchor="end" fontSize="6.5"
          fill="rgba(245,200,0,.7)" fontFamily="'Righteous',sans-serif">{T.goalShortLabel.replace('{n}',target)}</text>
        <path d={"M"+x(0)+","+floorY+" L"+leader.pts.map((v,i)=>x(i)+","+y(v)).join(" L")+" L"+x(mr)+","+floorY+" Z"}
          fill={leader.p.color} className="chart-area-fade"/>
        {series.map(({p,pts},pi)=>(
          <g key={p.id}>
            <AnimatedChartLine d={"M"+pts.map((v,i)=>x(i)+","+y(v)).join(" L")} color={p.color} delay={pi*.12}/>
            {pts.map((v,i)=>i>0&&(
              <circle key={i} cx={x(i)} cy={y(v)} r={i===mr?3.2:1.6} fill={p.color}
                className={i===mr?"chart-dot-pulse":""}
                style={i===mr?{filter:"drop-shadow(0 0 5px "+p.color+")"}:undefined}/>
            ))}
          </g>
        ))}
        {Array.from({length:mr},(_,i)=>(
          <text key={i} x={x(i+1)} y={H-5} textAnchor="middle" fontSize="6.5"
            fill="rgba(255,255,255,.32)" fontFamily="'Righteous',sans-serif">R{i+1}</text>
        ))}
      </svg>
      <div style={{display:"flex",flexWrap:"wrap",gap:"5px 12px",justifyContent:"center",marginTop:4}}>
        {sorted.map(p=>(
          <div key={p.id} style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:p.color,display:"inline-block",flexShrink:0}}/>
            <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"rgba(255,255,255,.5)"}}><Ava v={p.emoji}/> {p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SCORETAB — nombre con color del jugador ───────────────────
function ScoreTab({sorted,room,T}){
  const mr=room.finished?room.round:room.round-1; // finished=last round shown
  const target=room.winTarget||WIN;
  return(<>
    <p className="sec">{T.ranking}</p>
    <div className="sg">
      {sorted.map((p,i)=>{
        const cls=i===0?"first":i===1?"second":i===2?"third":"";
        return(
          <div key={p.id} className={"sc "+cls+" "+(p._moved==='up'?'moved-up':p._moved==='down'?'moved-down':'')}>
            <div className="sc-rank">{i===0?"🥇":i===1?"🥈":i===2?"🥉":"#"+(i+1)}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:900,fontSize:".98rem",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:"1.2rem"}}><Ava v={p.emoji}/></span>
                {/* nombre con color del jugador */}
                <span style={{color:p.color,textShadow:"0 0 12px "+p.color+"55"}}>{p.name}</span>
              </div>
              <div style={{fontSize:".7rem",color:"rgba(255,255,255,.38)",fontWeight:700,marginTop:2}}>
                {(p.rounds||[]).length} {(p.rounds||[]).length!==1?T.roundWordBarePlural:T.roundWordBare} · {T.missingPtsTemplate.replace('{n}',Math.max(0,target-p.total))}
              </div>
            </div>
            <AnimatedScore className="sc-pts" value={p.total}/>
            <div className="sc-bar" style={{width:Math.min(100,(p.total/target)*100)+"%"}}/>
            <div className="sc-pct">{Math.round((p.total/target)*100)}%</div>
          </div>
        );
      })}
    </div>
    {mr>0&&(<>
      <div className="div"/>
      <p className="sec">{T.rounds2}</p>
      <div className="tw">
        <table>
          <thead><tr><th>{T.colPlayer}</th>{Array.from({length:mr},(_,i)=><th key={i}>R{i+1}</th>)}<th>{T.colTotal}</th></tr></thead>
          <tbody>{sorted.map((p,ri)=>(
            <tr key={p.id} className={ri===0?"lr":""}>
              <td><span style={{color:p.color}}><Ava v={p.emoji}/></span> <span style={{color:p.color}}>{p.name}</span></td>
              {(p.rounds||[]).map((r,i)=>{
                var hasFlip=r.breakdown&&r.breakdown.flip7;
                var hasMod=r.breakdown&&(r.breakdown.multiplier||r.breakdown.divTwo||(r.breakdown.negMods&&r.breakdown.negMods.length>0)||(r.breakdown.plusCards&&r.breakdown.plusCards.length>0));
                return(<td key={i}
                  className={r.score===0?"rz":""}
                  style={{position:"relative",minWidth:36}}
                  title={r.breakdown&&r.breakdown.cards&&r.breakdown.cards.length>0
                    ?"["+r.breakdown.cards.slice().sort((a,b)=>a-b).join(",")+"]"+(hasFlip?" +15🃏":"")+(r.breakdown.multiplier?" x"+r.breakdown.multiplier:"")+(r.breakdown.divTwo?" /2":"")+(r.breakdown.negMods&&r.breakdown.negMods.length>0?" "+r.breakdown.negMods.join(""):""): ""}>
                  {r.score===0?"💀":(r.score>0?"+":"")+r.score}
                </td>);
              })}
              {Array.from({length:mr-(p.rounds||[]).length},(_,i)=><td key={"e"+i}></td>)}
              <td className="tc">{p.total}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p style={{textAlign:"center",color:"var(--y)",fontFamily:"'Anton',sans-serif",
        fontSize:"1rem",letterSpacing:3,textShadow:"0 0 14px rgba(245,200,0,.35)",marginTop:2}}>
        {T.goalTargetPts.replace('{n}',target)}
      </p>
      <div className="div"/>
      <p className="sec">{T.roundProgress||"AVANCE POR RONDA"}</p>
      <RoundProgressChart key={mr} sorted={sorted} target={target} mr={mr} T={T}/>
    </>)}
  </>);
}

// ── SPECTATORSCREEN — con revancha animación ──────────────────
function SpectatorScreen({room,sorted,roomCode,demoMode,onBack,winner,onRematchAnimDone,T}){
  // Misma corrección que en RoundTab/ScoreTab: usar la meta real de la
  // sala en vez de 200 fijo, para que el % y "faltan X pts" cuadren con
  // partidas creadas a 100/150/250/300.
  const target=(room&&room.winTarget)||WIN;
  const[showJoinAnim,setShowJoinAnim]=React.useState(true);
  const[showWinnerOverlay,setShowWinnerOverlay]=React.useState(!!winner);
  const[showRematch,setShowRematch]=React.useState(false);
  React.useEffect(()=>{snd('spec_join');setTimeout(()=>setShowJoinAnim(false),2800);},[]);
  React.useEffect(()=>{if(winner)setShowWinnerOverlay(true);},[winner]);
  // Mismo aviso de "cambio de ronda" a pantalla completa que ya está en la
  // partida (RoundTab) — antes esta pantalla no lo tenía, y es justo la
  // que más se beneficia (es la que se deja abierta en una tablet). El
  // primer valor de room.round que llega al conectarse NO cuenta como
  // cambio — es solo alcanzar el estado actual de la sala.
  const prevSpecRoundRef=React.useRef(null);
  const[roundToast,setRoundToast]=React.useState(false);
  const[roundColor,setRoundColor]=React.useState(ROUND_BADGE_COLORS[0]);
  React.useEffect(()=>{
    if(!room)return;
    if(prevSpecRoundRef.current===null){prevSpecRoundRef.current=room.round;return;}
    if(prevSpecRoundRef.current!==room.round){
      prevSpecRoundRef.current=room.round;
      if(!room.finished){
        setRoundToast(true);
        setRoundColor(prev=>{
          const pool=ROUND_BADGE_COLORS.filter(c=>c!==prev);
          return pool[Math.floor(Math.random()*pool.length)];
        });
        snd('roundchange');
        setTimeout(()=>setRoundToast(false),2400);
      }
    }
  },[room?.round]);
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
    return<RematchOverlay onDone={()=>{setShowRematch(false);onRematchAnimDone&&onRematchAnimDone();}} T={T}/>;
  }

  return(
    <div className="spec-wrap">
      {showJoinAnim&&<div style={{position:"fixed",inset:0,background:"linear-gradient(135deg,#0a0a18,#1a1a2e)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:500,animation:"fadeOut 2.5s forwards"}}>
        <style>{`@keyframes fadeOut{0%{opacity:1}70%{opacity:1}100%{opacity:0;pointer-events:none}} @keyframes zoomIn{0%{transform:scale(0) rotate(-10deg);opacity:0}60%{transform:scale(1.15) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}} @keyframes slidePill{0%{transform:translateY(40px);opacity:0}100%{transform:translateY(0);opacity:1}}`}</style>
        <div style={{animation:"zoomIn .6s cubic-bezier(.34,1.56,.64,1) forwards",textAlign:"center"}}>
          <div style={{fontSize:"5rem",marginBottom:10}}>📡</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"2.8rem",letterSpacing:4,background:"linear-gradient(135deg,var(--t),#1A9A94)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1,marginBottom:6}}>{T.scoreboardTitle}</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"2.8rem",letterSpacing:4,background:"linear-gradient(135deg,var(--y),var(--or))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1,marginBottom:20}}>{T.liveCaps}</div>
          <div style={{animation:"slidePill .5s .4s both",fontFamily:"'Righteous',sans-serif",fontSize:".9rem",color:"rgba(255,255,255,.5)",letterSpacing:3,background:"rgba(255,255,255,.06)",padding:"8px 20px",borderRadius:30,border:"1px solid rgba(255,255,255,.1)"}}>{T.roomCapsInline} <span className="code-mono">{roomCode}</span> · {T.liveSuffixWord}</div>
        </div>
      </div>}
      {roundToast&&<RoundChangeOverlay round={room.round} color={roundColor} T={T}/>}
      {showWinnerOverlay&&winner&&(
        <div style={{position:"fixed",inset:0,zIndex:400,background:"radial-gradient(circle at 50% 35%,#2a1800 0%,#0F0F1A 65%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:28,overflow:"hidden"}}>
          {Array.from({length:40},(_,i)=>({c:["#F5C800","#E63946","#2EC4B6","#FF6B35","#fff","#3BB273"][i%6],l:Math.random()*100+"%",dl:Math.random()*2.5+"s",dr:2.5+Math.random()*2.5+"s",sz:7+Math.random()*10+"px",sh:Math.random()>.5?"2px":"50%"})).map((d,i)=>(
            <div key={i} style={{position:"absolute",background:d.c,width:d.sz,height:d.sz,left:d.l,top:-20,borderRadius:d.sh,animation:"cf "+d.dr+" "+d.dl+" linear infinite"}}/>
          ))}
          <div style={{fontSize:"5rem",animation:"fl 2s ease-in-out infinite",marginBottom:8}}>🏆</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".8rem",letterSpacing:5,color:"var(--t)",textTransform:"uppercase",marginBottom:8}}>{T.winner2}</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"5rem",letterSpacing:3,background:"linear-gradient(135deg,var(--y) 30%,var(--or))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1,marginBottom:10}}>FLIP 7</div>
          <div style={{fontFamily:"'Lilita One',sans-serif",fontSize:"3.2rem",color:"white",letterSpacing:2,lineHeight:1.1,marginBottom:6,textShadow:"0 0 30px rgba(245,200,0,.5)"}}>
            <Ava v={winner.emoji}/> {winner.name}
          </div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:"1.1rem",color:"var(--y)",marginBottom:30,letterSpacing:2}}>
            {T.ptsGoalTemplate.replace('{pts}',winner.total).replace('{target}',target)}
          </div>
          <button className="btn btn-y" onClick={()=>setShowWinnerOverlay(false)} style={{maxWidth:260,marginBottom:10}}>{T.seeScoreboard}</button>
          <button className="btn btn-g" onClick={onBack} style={{maxWidth:260}}>{T.exitBtn}</button>
        </div>
      )}
      <div className="hdr" style={{alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0,overflow:"hidden"}}>
          <HeroLogoCompact T={T}/>
          {room&&room.gameMode&&GAME_MODES[room.gameMode]&&GAME_MODES[room.gameMode].image&&(
            <img src={GAME_MODES[room.gameMode].image} alt="" style={{height:22,width:"auto",flexShrink:0,
              filter:"drop-shadow(0 0 5px "+GAME_MODES[room.gameMode].glow+") drop-shadow(0 2px 4px rgba(0,0,0,.4))"}}
              onError={e=>{e.target.style.display="none";}}/>
          )}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <div className="badge spec"><span className="dot"/> <span className="code-mono">{roomCode}</span></div>
          <button className="btn btn-g btn-sm" onClick={()=>{snd('tap');onBack();}}>{T.exitBtn}</button>
        </div>
      </div>
      <div style={{padding:"10px 16px 0",textAlign:"center"}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",letterSpacing:5,color:"var(--t)"}}>{T.liveScoreboardCaps}</div>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"rgba(255,255,255,.3)",letterSpacing:2,display:"flex",alignItems:"center",justifyContent:"center",gap:5,marginTop:3}}>
          <span className="dot"/>{T.roomCapsInline} <span className="code-mono">{roomCode}</span> · {T.roundBadgeTemplate.replace('{n}',room?.round||"")}
        </div>
      </div>
      {!room?(
        <div style={{textAlign:"center",paddingTop:60}}><div className="spin" style={{margin:"0 auto 14px"}}/><p style={{color:"rgba(255,255,255,.4)",fontWeight:700}}>{T.connecting}</p></div>
      ):(
        <div style={{padding:"10px 12px 80px",overflowY:"auto"}}>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
            {sorted.map((p,i)=>{
              const pct=Math.min(100,(p.total/target)*100);
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
                    <div style={{fontWeight:900,fontSize:nameSize,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:p.color,textShadow:"0 0 12px "+p.color+"55"}}><Ava v={p.emoji}/> {p.name}</div>
                    <div style={{fontSize:".7rem",color:"rgba(255,255,255,.38)",fontWeight:700,marginTop:2}}>{T.missingPtsPctTemplate.replace('{n}',Math.max(0,target-p.total)).replace('{pct}',Math.round(pct))}</div>
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
            <p style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",letterSpacing:3,color:"rgba(255,255,255,.3)",textTransform:"uppercase",marginBottom:8}}>{T.rounds2}</p>
            <div className="tw">
              <table>
                <thead><tr><th>{T.colPlayer}</th>{Array.from({length:maxRound},(_,i)=><th key={i}>R{i+1}</th>)}<th>{T.colTotal}</th></tr></thead>
                <tbody>{sorted.map((p,ri)=>(
                  <tr key={p.id} className={ri===0?"lr":""}>
                    <td style={{fontSize:".82rem",color:p.color}}><Ava v={p.emoji}/> {p.name}</td>
                    {(p.rounds||[]).map((r,i)=>{
                var hasFlip=r.breakdown&&r.breakdown.flip7;
                var hasMod=r.breakdown&&(r.breakdown.multiplier||r.breakdown.divTwo||(r.breakdown.negMods&&r.breakdown.negMods.length>0)||(r.breakdown.plusCards&&r.breakdown.plusCards.length>0));
                return(<td key={i}
                  className={r.score===0?"rz":""}
                  style={{position:"relative",minWidth:36}}
                  title={r.breakdown&&r.breakdown.cards&&r.breakdown.cards.length>0
                    ?"["+r.breakdown.cards.slice().sort((a,b)=>a-b).join(",")+"]"+(hasFlip?" +15🃏":"")+(r.breakdown.multiplier?" x"+r.breakdown.multiplier:"")+(r.breakdown.divTwo?" /2":"")+(r.breakdown.negMods&&r.breakdown.negMods.length>0?" "+r.breakdown.negMods.join(""):""): ""}>
                  {r.score===0?"💀":(r.score>0?"+":"")+r.score}
                </td>);
              })}
                    {Array.from({length:maxRound-(p.rounds||[]).length},(_,i)=><td key={"e"+i}></td>)}
                    <td className="tc">{p.total}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>)}
          <p style={{textAlign:"center",color:"var(--y)",fontFamily:"'Anton',sans-serif",fontSize:".9rem",letterSpacing:2,textShadow:"0 0 12px rgba(245,200,0,.3)",marginBottom:maxRound>0?0:10}}>{T.goalTargetPts.replace('{n}',target)}</p>
          {maxRound>0&&(<>
            <div style={{height:1,background:"rgba(255,255,255,.07)",margin:"12px 0"}}/>
            <p style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",letterSpacing:3,color:"rgba(255,255,255,.3)",textTransform:"uppercase",marginBottom:8}}>{T.roundProgress||"AVANCE POR RONDA"}</p>
            <RoundProgressChart key={maxRound} sorted={sorted} target={target} mr={maxRound} T={T}/>
          </>)}
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
      <p style={{fontWeight:700}}>{T.noSessions}</p>
      <p style={{fontSize:".8rem",marginTop:6,color:"rgba(255,255,255,.3)"}}>{T.noSessionsDesc}</p>
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
            {T.clearHistory}
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
                <div style={{fontWeight:900,fontSize:".84rem"}}>{fmtDate(s.date,T)}</div>
                <div style={{fontSize:".7rem",color:"rgba(255,255,255,.32)",fontWeight:700}}>{T.sessionMetaLine.replace('{n}',s.players.length).replace('{r}',s.rounds).replace('{code}',s.code)}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {s.demo&&<span style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"var(--pu)",background:"rgba(123,45,139,.2)",padding:"2px 6px",borderRadius:10}}>{T.demoTag}</span>}
                <span style={{color:"rgba(255,255,255,.3)",fontSize:".9rem"}}>{isOpen?"▲":"▼"}</span>
              </div>
            </div>
            <div className="hw">
              <span style={{fontSize:"1.2rem"}}>🏆</span>
              <span style={{fontFamily:"'Lilita One',sans-serif",fontSize:".9rem",color:"var(--y)"}}>{s.winner}</span>
              <div className="hpl">
                {s.players.map(p=><span key={p.id} className="hpt"><Ava v={p.emoji}/> {p.name}</span>)}
              </div>
            </div>
            {isOpen&&(
              <div style={{marginTop:12}}>
                {sorted.map((p,i)=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:i===0?"var(--y)":"rgba(255,255,255,.3)",width:28}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":"#"+(i+1)}</div>
                    <div style={{fontWeight:900,flex:1,color:p.color}}><Ava v={p.emoji}/> {p.name}</div>
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

// ── SCANMODAL — Árbitro de Cartas™ (motor interno, key de Firebase) ──
function ScanModal({playerName,currentTotal,onResult,onClose,aiConfig,gameMode,T}){
  T=T||LANGS.es;
  var isVenganza=gameMode==="venganza";
  var useState=React.useState,useRef=React.useRef,useEffect=React.useEffect;
  var ph=useState("pick"),img_=useState(null),b64_=useState(null),mime_=useState("image/jpeg");
  var res_=useState(null),err_=useState(""),keyLoaded_=useState(false),claudeKey_=useState("");
  var attempt_=useState(0);
  var dims_=useState(null); // {w,h} de la foto actual -- para detectar orientacion vertical/horizontal
  var phase=ph[0],setPhase=ph[1],img=img_[0],setImg=img_[1],b64=b64_[0],setB64=b64_[1];
  var mime=mime_[0],setMime=mime_[1],res=res_[0],setRes=res_[1];
  var errMsg=err_[0],setErrMsg=err_[1];
  var keyLoaded=keyLoaded_[0],setKeyLoaded=keyLoaded_[1];
  var claudeKey=claudeKey_[0],setClaudeKey=claudeKey_[1];
  // scanAttempt se incrementa en cada retake() y se usa como "key" del
  // ResultEditor mas abajo -- esto obliga a React a desmontar/remontar el
  // componente por completo en vez de reutilizar la instancia anterior,
  // garantizando que ningun estado (modificadores, cartas de accion, etc.)
  // sobreviva entre una foto y la siguiente.
  var scanAttempt=attempt_[0],setScanAttempt=attempt_[1];
  var dims=dims_[0],setDims=dims_[1];
  var fileRef=useRef();

  // Cargar Claude key de Firebase al abrir — silencioso, sin UI de config
  useEffect(function(){
    async function fetchKey(){
      try{
        var snap=await _db.ref("config/claude").once("value");
        var val=snap.val();
        if(val&&val.key)setClaudeKey(val.key);
        else if(aiConfig&&aiConfig.claudeKey)setClaudeKey(aiConfig.claudeKey);
      }catch(e){
        if(aiConfig&&aiConfig.claudeKey)setClaudeKey(aiConfig.claudeKey);
      }
      setKeyLoaded(true);
    }
    fetchKey();
  },[]);

  // Antes el prompt le decia a la IA que IGNORARA por completo las cartas
  // modificadoras (x2/+N) y las de accion -- por eso nunca se marcaban solas
  // en el resultado, aunque el modelo si es capaz de leerlas. Ahora se le
  // pide identificarlas tambien, con un prompt distinto segun el modo de
  // la sala (los modificadores y las cartas de accion son diferentes en
  // Clasico vs. Venganza).
  var PROMPT_CLASSIC="Mira esta foto de cartas del juego Flip 7 (version Clasica) y clasifica TODO lo que veas en 3 categorias. Se CONSERVADOR: es mejor no contar una carta dudosa que inventar una que no esta.\n\n1) CARTAS NUMERICAS (fondo blanco/crema, valores 0-12, cada numero con color propio):\nCOLORES: 0=rosa/magenta #FF2FA3, 1=gris-lila #B7A9C9, 2=amarillo-verde #D8E81B, 3=rojo-rosa #FF4B78, 4=cyan #19C7D8, 5=verde #10C96C, 6=morado #C86AE3, 7=salmon palido #F48A9A, 8=verde claro #9EDB92, 9=naranja #FFA33A, 10=rojo #FF3B3B, 11=azul #6EBBFF, 12=gris-lila #B9AEC9.\nUsa la forma del digito como pista principal y el color como confirmacion (el color varia con la luz -- no exijas match exacto de HEX).\nOJO -- confusiones frecuentes: 0 vs 10 son colores DISTINTOS (rosa vs rojo) -- un numero rojo de 2 digitos es 10, no 0, aunque el \"1\" se vea tapado o borroso. 1 vs 12 usan el mismo gris-lila -- confirmalos por el segundo digito \"2\", no por color. El 7 es salmon muy palido y se pierde contra el fondo blanco/crema -- revisa con cuidado cualquier carta que parezca \"vacia\" antes de descartarla, es la que mas se escapa.\nPuede haber varias cartas fisicas con el mismo numero: incluye el numero una vez por cada carta fisica que distingas con claridad, nunca por deduccion.\n\n2) CARTAS MODIFICADORAS (fondo amarillo/dorado): \"x2\" (multiplicador, simbolo \"x\") o cartas de suma +2/+4/+6/+8/+10 (simbolo \"+\"). No confundas x2 con +2. Reportalas solo si ves la carta fisica con claridad -- nunca por la puntuacion esperada.\n\n3) CARTAS DE ACCION (ilustradas, sin numero): Freeze (predomina azul, tema hielo), Flip Three (predomina amarillo, ilustrada -- NO es un modificador aunque comparta color), Second Chance (predomina rojo/rosa, corazones). Cuenta cada carta fisica por separado -- si hay 2 Freeze claramente distintas y separadas, cuenta 2, pero no dupliques si no estas seguro.\n\nIGNORA cartas bocabajo, ilegibles o demasiado tapadas.\n\nREGLAS DE CONTEO -- muy importante:\n- Cuenta cada carta FISICA una sola vez. No repitas un numero, modificador o carta de accion salvo que veas, con TOTAL certeza, dos o mas copias fisicas separadas.\n- Ante la duda entre ver 1 o 2 copias, responde 1 -- mejor subcontar que inventar una copia que no esta.\n- No asumas ninguna carta (numero, modificador o accion) por lo que \"deberia\" haber en la mano, por la puntuacion o por otras cartas -- solo lo fisicamente visible y confirmado.\n\nFLIP 7: si hay exactamente 7 VALORES numericos DISTINTOS (los duplicados no aumentan el conteo), flip7=true y se suma +15 aparte -- no lo agregues como carta ni modifiques los valores por esto.\n\nResponde UNICAMENTE con JSON valido, sin markdown ni texto adicional, exactamente con esta estructura:\n{\"cards\":[<numeros enteros 0-12>],\"multiplier\":<2 si hay carta x2, si no null>,\"plus_cards\":[<subconjunto de 2,4,6,8,10 presentes>],\"action_cards\":[<nombres, uno por cada aparicion fisica>],\"flip7\":<true si hay exactamente 7 valores numericos distintos>,\"note\":\"<resumen muy breve, o que ignoraste>\"}";
  var PROMPT_VENGANZA="Mira esta foto de cartas del juego Flip 7: With a Vengeance (Venganza) y clasifica TODO lo que veas en 3 categorias. Se CONSERVADOR: es mejor no contar una carta dudosa que inventar una que no esta.\n\n1) CARTAS NUMERICAS (fondo blanco/crema, valores 0-13, cada numero con color propio):\nCOLORES: 0=rosa/magenta #FF2FA3, 1=gris #9C9096, 2=amarillo-verde #D9E026, 3=rojo-rosa #C9466F, 4=cyan #44C1BB, 5=verde #38B44A, 6=morado #B9529F, 7=salmon #D9837B, 8=verde claro #B1D57A, 9=naranja #F79420, 10=rojo oscuro #BB2540, 11=azul #6A8FC8, 12=gris-cafe #9A8776, 13=azul brillante #008CD3.\nUsa la forma del digito como pista principal y el color como confirmacion (el color varia con la luz -- no exijas match exacto de HEX).\nOJO -- confusiones frecuentes: 0 vs 10 son colores DISTINTOS (rosa vs rojo oscuro) -- un numero rojo oscuro de 2 digitos es 10, no 0, aunque el \"1\" se vea tapado o borroso. 11 vs 13 usan tonos de azul parecidos -- confirmalos por el segundo digito \"3\", no por color. El 7 es salmon y se pierde contra el fondo blanco/crema -- revisa con cuidado cualquier carta que parezca \"vacia\" antes de descartarla, es la que mas se escapa.\nPuede haber varias cartas fisicas con el mismo numero: incluye el numero una vez por cada carta fisica que distingas con claridad, nunca por deduccion.\n\n2) CARTAS MODIFICADORAS NEGATIVAS (fondo oscuro/rojo): \"/2\" (divisor) o cartas de resta -2/-4/-6/-8/-10. No confundas /2 con -2. Reportalas solo si ves la carta fisica con claridad -- nunca por la puntuacion esperada.\n\n3) CARTAS DE ACCION (ilustradas, con su nombre como texto): Just One More, Swap, Steal, Discard, Flip Four, Lucky 13, Unlucky 7. Cuenta cada carta fisica por separado -- si hay 2 copias claramente distintas y separadas de la misma carta, cuenta 2, pero no dupliques si no estas seguro.\n\nIGNORA cartas bocabajo, ilegibles o demasiado tapadas.\n\nREGLAS DE CONTEO -- muy importante:\n- Cuenta cada carta FISICA una sola vez. No repitas un numero, modificador o carta de accion salvo que veas, con TOTAL certeza, dos o mas copias fisicas separadas.\n- Ante la duda entre ver 1 o 2 copias, responde 1 -- mejor subcontar que inventar una copia que no esta.\n- No asumas ninguna carta (numero, modificador o accion) por lo que \"deberia\" haber en la mano, por la puntuacion o por otras cartas -- solo lo fisicamente visible y confirmado.\n\nFLIP 7: si hay exactamente 7 VALORES numericos DISTINTOS (los duplicados no aumentan el conteo), flip7=true y se suma +15 aparte -- no lo agregues como carta ni modifiques los valores por esto.\n\nResponde UNICAMENTE con JSON valido, sin markdown ni texto adicional, exactamente con esta estructura:\n{\"cards\":[<numeros enteros 0-13>],\"divide\":<true si hay carta /2, si no false>,\"minus_cards\":[<subconjunto de 2,4,6,8,10 presentes, solo la magnitud>],\"action_cards\":[<nombres, uno por cada aparicion fisica>],\"flip7\":<true si hay exactamente 7 valores numericos distintos>,\"note\":\"<resumen muy breve, o que ignoraste>\"}";
  var PROMPT=isVenganza?PROMPT_VENGANZA:PROMPT_CLASSIC;

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
        setImg(compressed);setB64(compressed.split(",")[1]);setMime("image/jpeg");setDims({w:w,h:h});setPhase("preview");
      };
      imgEl.onerror=function(){setImg(original);setB64(original.split(",")[1]);setMime("image/jpeg");setDims(null);setPhase("preview");};
      imgEl.src=original;
    };
    r.readAsDataURL(f);
  }

  // Gira la foto actual 90° en sentido horario -- para cuando la foto quedo
  // vertical (el Árbitro lee mucho mejor las cartas en horizontal). Se puede
  // tocar varias veces para dar la vuelta completa si hace falta.
  function rotateImage(){
    if(!img)return;
    snd("tap");
    var imgEl=new Image();
    imgEl.onload=function(){
      var w=imgEl.width,h=imgEl.height;
      var canvas=document.createElement("canvas");
      canvas.width=h;canvas.height=w;
      var ctx=canvas.getContext("2d");
      ctx.translate(h/2,w/2);
      ctx.rotate(Math.PI/2);
      ctx.drawImage(imgEl,-w/2,-h/2,w,h);
      var rotated=canvas.toDataURL("image/jpeg",.85);
      setImg(rotated);setB64(rotated.split(",")[1]);setMime("image/jpeg");setDims({w:h,h:w});
    };
    imgEl.src=img;
  }

  async function analyze(){
    setPhase("analyzing");
    try{
      var messages=[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:mime,data:b64}},
        {type:"text",text:PROMPT}
      ]}];

      var resp;

      // ── MODO SEGURO: usar proxy de Cloudflare Worker si está configurado ──
      // El proxy guarda la key en el servidor — el browser nunca la ve
      var proxyUrl="";
      try{
        var proxSnap=await _db.ref("config/proxy/url").once("value");
        proxyUrl=(proxSnap.val()||"").trim();
      }catch(pe){}

      if(proxyUrl){
        // Llamada al proxy — sin key en el request, el worker la añade
        resp=await fetch(proxyUrl,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({messages:messages,temperature:0})
        });
      } else {
        // MODO FALLBACK: llamada directa (insegura — usar solo en desarrollo)
        // En producción, configura el Cloudflare Worker
        var key=claudeKey;
        if(!key){
          try{
            var snap=await _db.ref("config/claude").once("value");
            key=(snap.val()?.key||"").trim();
            if(key)setClaudeKey(key);
          }catch(e){}
        }
        if(!key){setErrMsg(T.refereeNoCredentials);setPhase("error");return;}
        resp=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
          body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:400,temperature:0,messages:messages})
        });
      }

      if(!resp.ok){
        var errBody=await resp.text();
        if(resp.status===401||resp.status===403)throw new Error(T.credentialsInvalid);
        if(resp.status===429)throw new Error(T.refereeBusy);
        throw new Error("Error "+resp.status+": "+errBody.slice(0,120));
      }
      var d=await resp.json();
      var txt=(d.content||[]).map(function(x){return x.text||"";}).join("");
      // Limpieza robusta: quitar markdown, whitespace, caracteres no-JSON
      var clean=txt.replace(/```json/gi,"").replace(/```/g,"").trim();
      // Extraer solo el objeto JSON (entre { y })
      var js=clean.indexOf("{"),je=clean.lastIndexOf("}")+1;
      if(js<0||je<=js)throw new Error(T.refereeBadFormat);
      clean=clean.slice(js,je);
      // Validar que es JSON válido antes de parsear
      var parsed;
      try{ parsed=JSON.parse(clean); }
      catch(pe){ throw new Error(T.refereeConfused); }
      // BUG FIX — pantalla en negro al analizar: la IA a veces devuelve
      // "cards"/"plus_cards" en un formato distinto al esperado (string,
      // objeto, o ausente) en vez de un array. ResultEditor asume que son
      // arrays y llama .map()/.filter() directamente sobre ellos — si no
      // lo son, React lanza una excepción DURANTE EL RENDER (no dentro de
      // este try/catch, que solo cubre la llamada a la IA), y como la app
      // no tiene un Error Boundary, todo el árbol de React se desmonta y
      // queda la página en negro (el fondo oscuro de <body> sin nada
      // encima). Se sanea acá, en el único lugar que arma "res".
      if(!Array.isArray(parsed.cards))parsed.cards=[];
      if(parsed.base_cards!==undefined&&!Array.isArray(parsed.base_cards))parsed.base_cards=[];
      if(parsed.plus_cards!==undefined&&!Array.isArray(parsed.plus_cards))parsed.plus_cards=[];
      if(parsed.minus_cards!==undefined&&!Array.isArray(parsed.minus_cards))parsed.minus_cards=[];
      if(parsed.action_cards!==undefined&&!Array.isArray(parsed.action_cards))parsed.action_cards=[];
      // Contador global de escaneos exitosos -- alimenta el panel admin para
      // ver cuanto se esta usando el Árbitro y estimar el gasto real de IA.
      // OJO: vive en "adminStats" (no "stats") a propósito -- "stats" tiene
      // reglas de Firebase abiertas (".read":true,".write":true) para todo
      // el árbol, así que un contador anidado ahí no se puede proteger por
      // más restrictiva que se ponga su regla individual (una regla más
      // permisiva en un nodo padre no se puede revocar en un hijo). "adminStats"
      // es su propio nodo raíz con reglas que solo dejan leerlo a la cuenta admin.
      _db.ref("adminStats/aiScans").transaction(function(cur){return(cur||0)+1;}).catch(function(){});
      snd("score");setRes(parsed);setPhase("result");
    }catch(e){
      var m=e.message||"";
      setErrMsg(m.length>200?m.slice(0,200)+"...":m);
      setPhase("error");
    }
  }

  function retake(){
    // Reset completo de todos los estados para evitar errores con datos previos
    setImg(null);setB64(null);setRes(null);setErrMsg("");
    setMime("image/jpeg");setDims(null);
    setPhase("pick");
    setScanAttempt(function(n){return n+1;});
    if(fileRef.current)fileRef.current.value="";
  }

  return(
    React.createElement("div",{className:"mbg"},
      React.createElement("div",{className:"ms"},
        React.createElement("div",{className:"mh"}),
        React.createElement("div",{className:"mt2"},T.scanTitle2),
        React.createElement("div",{className:"msub"},T.turnOf+" ",React.createElement("b",{style:{color:"#fff"}},playerName)),

        phase==="pick"&&React.createElement(React.Fragment,null,
          // Indicador de estado minimal — sin mostrar la key ni config visible
          !keyLoaded&&React.createElement("div",{style:{textAlign:"center",padding:"8px 0",marginBottom:8}},
            React.createElement("div",{style:{display:"inline-flex",alignItems:"center",gap:6,fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"var(--t)"}},
              React.createElement("div",{className:"spin",style:{width:16,height:16,borderWidth:2}}),T.loadingDots
            )
          ),
          React.createElement("input",{ref:fileRef,type:"file",accept:"image/*",capture:"environment",style:{display:"none"},onChange:handleFile}),
          React.createElement("div",{className:"ce",onClick:function(){snd("tap");if(fileRef.current)fileRef.current.click();}},
            React.createElement("div",{style:{fontSize:"2.8rem"}},"📷"),
            React.createElement("div",null,T.tapOpenCamera),
            React.createElement("div",{style:{fontSize:".7rem",opacity:.5}},T.aimCardsHint)
          ),
          React.createElement("p",{style:{textAlign:"center",color:"rgba(255,255,255,.3)",fontSize:".75rem",fontWeight:700,cursor:"pointer",marginBottom:12},
            onClick:function(){snd("tap");if(fileRef.current){fileRef.current.removeAttribute("capture");fileRef.current.click();setTimeout(function(){if(fileRef.current)fileRef.current.setAttribute("capture","environment");},600);}}},T.orChooseGallery),
          React.createElement("div",{className:"mr2"},React.createElement("button",{className:"mc",onClick:function(){snd("tap");retake();onClose();}},T.cancel))
        ),

        phase==="preview"&&React.createElement(React.Fragment,null,
          React.createElement("div",{className:"cv"},React.createElement("img",{src:img,alt:"preview"})),
          // Aviso + botón de giro -- el Árbitro lee mucho mejor las cartas en
          // horizontal; si la foto quedó vertical se lo hacemos saber en vez
          // de fallar en silencio, y le damos la opción de corregirlo aquí
          // mismo antes de analizar.
          dims&&dims.h>dims.w&&React.createElement("div",{style:{background:"rgba(246,166,35,.1)",border:"1px solid rgba(246,166,35,.3)",borderRadius:10,padding:"8px 12px",marginBottom:8,textAlign:"center"}},
            React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",color:"var(--y)",letterSpacing:.5,marginBottom:4}},T.verticalPhotoDetected),
            React.createElement("div",{style:{fontSize:".72rem",color:"rgba(255,255,255,.6)",lineHeight:1.4,marginBottom:8}},T.verticalPhotoDesc),
            React.createElement("button",{className:"mc",style:{width:"100%"},onClick:function(){rotateImage();}},T.rotatePhotoBtn)
          ),
          React.createElement("p",{style:{textAlign:"center",color:"rgba(255,255,255,.45)",fontWeight:700,fontSize:".82rem",marginBottom:8}},T.allCardsVisible),
          React.createElement("div",{style:{background:"rgba(46,196,182,.08)",border:"1px solid rgba(46,196,182,.2)",borderRadius:10,padding:"8px 12px",marginBottom:8,textAlign:"center"}},
            React.createElement("span",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",color:"var(--t)",letterSpacing:1}},T.refereeSupreme)
          ),
          React.createElement("div",{className:"mr2"},
            React.createElement("button",{className:"mc",onClick:function(){snd("tap");retake();}},T.anotherPhotoBtn),
            React.createElement("button",{className:"mo",onClick:function(){snd("tap");analyze();}},T.analyzeBtn)
          )
        ),

        phase==="analyzing"&&React.createElement("div",{className:"cv",style:{position:"relative",aspectRatio:"unset",height:140}},
          React.createElement("img",{src:img,alt:"",style:{opacity:.4,width:"100%",height:"100%",objectFit:"cover",display:"block"}}),
          React.createElement("div",{className:"sov"},
            React.createElement("div",{className:"spin"}),
            React.createElement("div",{style:{fontFamily:"'Lilita One',sans-serif",color:"var(--y)",fontSize:"1rem"}},T.refereeAnalyzing)
          )
        ),

        phase==="result"&&res&&React.createElement(ResultEditor,{key:scanAttempt,res:res,onResult:onResult,onRetake:retake,onClose:onClose,currentTotal:currentTotal,gameMode:gameMode,T:T}),

        phase==="error"&&React.createElement(React.Fragment,null,
          React.createElement("div",{style:{textAlign:"center",padding:"16px 0"}},
            React.createElement("div",{style:{fontSize:"2.5rem",marginBottom:10}},"❌"),
            React.createElement("p",{style:{fontWeight:800,marginBottom:10,fontSize:".82rem",lineHeight:1.5,background:"rgba(0,0,0,.3)",padding:"10px",borderRadius:10,textAlign:"left",wordBreak:"break-all"}},errMsg)
          ),
          React.createElement("div",{className:"mr2"},
            React.createElement("button",{className:"mc",onClick:function(){snd("tap");onClose();}},T.closeBtn),
            React.createElement("button",{className:"mo",onClick:function(){snd("tap");retake();}},T.retryBtn)
          )
        )
      )
    )
  );
}

// ── RESULTEDITOR — cartas grandes + paleta rápida + regla 1 carta/número ──
function ResultEditor({res,onResult,onRetake,onClose,currentTotal,gameMode,T}){
  T=T||LANGS.es;
  const isVenganza=gameMode==="venganza";
  const NUM_MAX=isVenganza?13:12;
  // Regla: máximo 1 de cada número. Si IA detectó duplicados, filtrar y avisar.
  // Blindaje extra (además del saneo en analyze()): si "cards"/"base_cards"
  // llegara en un formato no-array por cualquier otra vía, no truena el render.
  const rawSrc=res.cards||res.base_cards||[];
  const rawCards=(Array.isArray(rawSrc)?rawSrc:[]).map(v=>Number(v)).filter(n=>!isNaN(n)&&n>=0&&n<=NUM_MAX);
  const seen=new Set();
  const dedupCards=[];
  const duplicatesFound=[];
  rawCards.forEach(n=>{
    if(!seen.has(n)){seen.add(n);dedupCards.push(n);}
    else if(!duplicatesFound.includes(n)){duplicatesFound.push(n);}
  });

  const[cards,setCards]=React.useState(dedupCards);
  // Modificadores Clásico (x2 / +N) — ya venían soportados por el estado,
  // solo faltaba que el prompt le pidiera a la IA detectarlos en vez de
  // ignorarlos, así que ahora sí llegan pre-marcados desde la foto.
  const[multiplier,setMultiplier]=React.useState(!isVenganza?(res.multiplier||null):null);
  const[plusCards,setPlusCards]=React.useState(!isVenganza?(Array.isArray(res.plus_cards)?res.plus_cards:[]).map(Number).filter(n=>n>0):[]);
  // Modificadores Venganza (/2 / -N) — mismo cálculo oficial que usa
  // VenganzaCardPickerModal: Suma -> /2 -> -N -> min 0 -> +15 flip7.
  const[hasDivTwo,setHasDivTwo]=React.useState(isVenganza?!!res.divide:false);
  const[negMods,setNegMods]=React.useState(isVenganza?(Array.isArray(res.minus_cards)?res.minus_cards:[]).map(Number).filter(n=>n>0).map(n=>-n):[]);
  // Cartas de acción detectadas — solo informativas (su efecto se resuelve
  // en la mesa), se guardan en el desglose para que quede registro.
  const[actionCards,setActionCards]=React.useState(Array.isArray(res.action_cards)?res.action_cards:[]);

  // Flip 7 bonus: se deriva ÚNICAMENTE de tener las 7 cartas — no es algo
  // que se pueda activar/desactivar a mano, solo se gana completando el Flip 7.
  const flip7=cards.length===MAX_CARDS;
  const baseTotal=cards.reduce((a,b)=>Number(a)+Number(b),0);
  const afterMult=multiplier?baseTotal*multiplier:baseTotal;
  const afterDiv=hasDivTwo?Math.floor(baseTotal/2):baseTotal;
  const afterNeg=Math.max(0,afterDiv+negMods.reduce((a,b)=>a+b,0));
  const total=isVenganza
    ? afterNeg+(flip7?FLIP7_BONUS:0)
    : afterMult+plusCards.reduce((a,b)=>Number(a)+Number(b),0)+(flip7?FLIP7_BONUS:0);

  function removeCard(idx){
    snd("del");
    setCards(c=>c.filter((_,i)=>i!==idx));
  }
  // Solo agregar si el número no existe y no supera el máximo de 7
  function addCard(n){
    if(cards.includes(n)){snd("zero");return;}
    if(cards.length>=MAX_CARDS){snd("zero");return;} // regla: máx 7 cartas
    snd("score");
    setCards(c=>[...c,n]);
  }
  function removeActionCard(name){
    snd("del");
    setActionCards(list=>{
      const i=list.indexOf(name);
      if(i<0)return list;
      const next=list.slice();next.splice(i,1);return next;
    });
  }
  // Marcar Cero directo -- para cuando el jugador se "reventó" (repitió
  // número) y quiere anotar 0 sin tener que ajustar manualmente las cartas.
  function handleZero(){
    snd("zero");
    const bd=isVenganza
      ?{cards:[],flip7:false,divTwo:false,negMods:[],actionCards:[]}
      :{cards:[],flip7:false,multiplier:null,plusCards:[],actionCards:[]};
    onResult(0,bd);
  }

  const CLASSIC_ACTION_CARDS=["Freeze","Flip Three","Second Chance"];
  const VENGANZA_ACTION_CARDS=["Just One More","Swap","Steal","Discard","Flip Four","Lucky 13","Unlucky 7"];
  // Agrupa duplicados ("Flip Three","Flip Three" → "2× Flip Three"), tal
  // como se ven las cartas repetidas en la mesa real.
  const actionCardCounts=actionCards.reduce((acc,name)=>{acc[name]=(acc[name]||0)+1;return acc;},{});
  const actionCardNames=Object.keys(actionCardCounts);

  // Disponibles = los que NO están ya en cards (máx 1 por número, regla del juego)
  const ALL_NUMS_MODE=isVenganza?[0,1,2,3,4,5,6,7,8,9,10,11,12,13]:ALL_CARD_NUMS;
  const availableCards=ALL_NUMS_MODE.filter(n=>!cards.includes(n));
  const colorFor=n=>isVenganza?(VENG_CARD_TEXT[n]||"#333"):(CARD_TEXT_MAP[n]||"#333");

  return(
    React.createElement(React.Fragment,null,
      // Cartas detectadas — más grandes
      React.createElement("div",{style:{marginBottom:12}},
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",color:"rgba(255,255,255,.35)",letterSpacing:3,marginBottom:10,textAlign:"center"}},T.cardsDetectedCaps),
        // Aviso si el Árbitro detectó números duplicados (regla: 1 por número)
        // + recordatorio de que en Flip 7 sacar un número repetido es un
        // reventón — antes solo se avisaba que "no puntúan cartas
        // duplicadas", sin recordar explícitamente que eso significa perder
        // la ronda si de verdad ocurrió durante el turno.
        duplicatesFound.length>0&&React.createElement("div",{style:{background:"rgba(245,200,0,.1)",border:"1px solid rgba(245,200,0,.3)",borderRadius:10,padding:"7px 12px",marginBottom:10,fontFamily:"'Righteous',sans-serif",fontSize:".68rem",color:"var(--y)",letterSpacing:1,textAlign:"center",lineHeight:1.5}},
          "⚠️ "+duplicatesFound.join(", ")+" "+T.dupWarnPrefix,
          React.createElement("br"),
          React.createElement("span",{style:{opacity:.85,fontWeight:500}},T.dupWarnBust)
        ),
        React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center",minHeight:56,alignItems:"center",padding:"4px 0"}},
          cards.length===0&&React.createElement("div",{style:{color:"rgba(255,255,255,.3)",fontWeight:700,fontSize:".85rem"}},T.noCardsAddFromPalette),
          cards.map((n,i)=>React.createElement("div",{key:i,className:"card-chip",onClick:()=>removeCard(i)},
            React.createElement("span",{className:"card-chip-num",style:{color:colorFor(n)}},n),
            React.createElement("button",{className:"card-chip-rm",onClick:(e)=>{e.stopPropagation();removeCard(i);}},"✕")
          ))
        )
      ),

      // Total
      React.createElement("div",{style:{textAlign:"center",padding:"8px 0 10px",borderTop:"1px solid rgba(255,255,255,.08)",borderBottom:"1px solid rgba(255,255,255,.08)",marginBottom:12}},
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:3,marginBottom:2}},T.totalFinalCaps),
        React.createElement("div",{style:{fontFamily:"'Anton',sans-serif",fontSize:"4.5rem",color:isVenganza?"var(--r)":"var(--y)",lineHeight:1,textShadow:"4px 4px 0 "+(isVenganza?"rgba(230,57,70,.4)":"var(--or)")}},total),
        cards.length>0&&React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",color:"rgba(255,255,255,.35)",marginTop:4,lineHeight:1.6}},
          isVenganza
            ? (hasDivTwo||negMods.length>0||flip7
                ? React.createElement(React.Fragment,null,
                    React.createElement("span",{style:{color:"rgba(255,255,255,.5)"}},T.baseLbl+" "+cards.join("+"+(cards.length>1?" ":""))+" = "+baseTotal),
                    hasDivTwo&&React.createElement(React.Fragment,null,React.createElement("br"),React.createElement("span",{style:{color:"rgba(230,57,70,.8)"}},"÷2 = "+afterDiv)),
                    negMods.length>0&&React.createElement(React.Fragment,null,React.createElement("br"),React.createElement("span",{style:{color:"rgba(230,57,70,.8)"}},negMods.join("")+" = "+afterNeg+(afterNeg<afterDiv?" (min 0)":""))),
                    flip7&&React.createElement(React.Fragment,null,React.createElement("br"),React.createElement("span",{style:{color:"var(--y)",fontWeight:700}},"+ 15 Flip 7 = "+total))
                  )
                : React.createElement("span",null,cards.length>1?cards.join(" + ")+" = "+baseTotal:""))
            : (multiplier||plusCards.length>0||flip7
                ? React.createElement(React.Fragment,null,
                    React.createElement("span",{style:{color:"rgba(255,255,255,.5)"}},T.baseLbl+" "+cards.join("+"+(cards.length>1?" ":""))+" = "+baseTotal),
                    multiplier&&React.createElement(React.Fragment,null,React.createElement("br"),React.createElement("span",{style:{color:"rgba(255,120,120,.8)"}},"x"+multiplier+" = "+(baseTotal*multiplier))),
                    plusCards.length>0&&React.createElement(React.Fragment,null,React.createElement("br"),React.createElement("span",{style:{color:"rgba(100,220,150,.8)"}},"+ "+plusCards.join("+")+" = "+afterMult+plusCards.reduce(function(a,b){return a+Number(b);},0))),
                    flip7&&React.createElement(React.Fragment,null,React.createElement("br"),React.createElement("span",{style:{color:"var(--y)",fontWeight:700}},"+ 15 Flip 7 = "+total))
                  )
                : React.createElement("span",null,cards.length>1?cards.join(" + ")+" = "+baseTotal:""))
        ),
        res.note&&React.createElement("div",{style:{color:"rgba(255,255,255,.25)",fontSize:".68rem",fontWeight:700,marginTop:5,fontStyle:"italic"}},res.note)
      ),

      // Modificadores — botones distintos según el modo (antes el Árbitro
      // los ignoraba por completo; ahora el prompt le pide detectarlos y
      // este bloque ya los muestra pre-marcados, aunque siempre se pueden
      // corregir a mano tocándolos).
      React.createElement("div",{style:{marginBottom:12}},
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:6,textAlign:"center"}},T.modifiersCorrectCaps),
        isVenganza
          ? React.createElement("div",{style:{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"center",marginBottom:6}},
              React.createElement("button",{onClick:()=>{snd("op");setHasDivTwo(v=>!v);},
                style:{border:"2px solid "+(hasDivTwo?"var(--r)":"rgba(230,57,70,.25)"),background:hasDivTwo?"var(--r)":"rgba(230,57,70,.07)",borderRadius:10,padding:"8px 12px",cursor:"pointer",fontFamily:"'Anton',sans-serif",fontSize:"1.2rem",color:hasDivTwo?"#fff":"var(--r)",transition:"all .2s",minWidth:52,textAlign:"center"}},
                "÷2",hasDivTwo&&React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".52rem",color:"#fff",letterSpacing:1,marginTop:1}},T.onLbl)
              ),
              [2,4,6,8,10].map(n=>{
                const active=negMods.includes(-n);
                return React.createElement("button",{key:n,onClick:()=>{snd("op");setNegMods(p=>active?p.filter(x=>x!==-n):[...p,-n]);},
                  style:{border:"2px solid "+(active?"var(--r)":"rgba(230,57,70,.2)"),background:active?"var(--r)":"rgba(230,57,70,.05)",borderRadius:10,padding:"8px 10px",cursor:"pointer",fontFamily:"'Anton',sans-serif",fontSize:"1.1rem",color:active?"#fff":"var(--r)",transition:"all .2s",minWidth:44,textAlign:"center"}},
                  "-"+n,active&&React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".52rem",color:"#fff",letterSpacing:1,marginTop:1}},T.onLbl)
                );
              })
            )
          : React.createElement("div",{style:{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",marginBottom:6}},
              React.createElement("button",{onClick:()=>{snd("op");setMultiplier(m=>m?null:2);},
                style:{border:"2px solid "+(multiplier===2?MOD_TEXT_COLOR:"rgba(242,90,122,.3)"),background:multiplier===2?MOD_BG_COLOR:"rgba(246,166,35,.1)",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontFamily:"'Anton',sans-serif",fontSize:"1.2rem",color:multiplier===2?"#fff":MOD_TEXT_COLOR,transition:"all .2s",minWidth:56,textAlign:"center"}},
                "x2",multiplier===2&&React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",color:"#fff",letterSpacing:1,marginTop:1}},T.activeLbl)
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

      // ── FLIP 7 BONUS ─────────────────────────────────────────
      React.createElement("div",{style:{
        background:flip7?"linear-gradient(135deg,rgba(245,200,0,.18),rgba(255,107,53,.1))":"rgba(255,255,255,.03)",
        border:"2px solid "+(flip7?"rgba(245,200,0,.6)":"rgba(255,255,255,.1)"),
        borderRadius:12,padding:"10px 14px",marginBottom:10,
        display:"flex",alignItems:"center",gap:12,transition:"all .2s"
      }},
        React.createElement("div",{style:{fontSize:"1.5rem"}},"🃏"),
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
            color:flip7?"var(--y)":"rgba(255,255,255,.4)",letterSpacing:2,fontWeight:700}},
            T.flip7UniqueCaps
          ),
          React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
            color:"rgba(255,255,255,.35)",marginTop:2}},
            cards.length+"/7 "+T.cardsWord+" · "+
            (cards.length===MAX_CARDS
              ? T.completeBonusActive
              : T.missingForBonus.replace('{n}',MAX_CARDS-cards.length))
          )
        ),
        React.createElement("div",{style:{
          fontFamily:"'Anton',sans-serif",fontSize:"1.5rem",
          color:flip7?"var(--y)":"rgba(255,255,255,.2)",
          textShadow:flip7?"0 0 15px rgba(245,200,0,.5)":"none",
          transition:"all .2s"
        }},flip7?"+15":"±0")
      ),

      // ── CARTAS DE ACCIÓN DETECTADAS (informativo, no afectan el total —
      // su efecto se resuelve en la mesa) ───────────────────────────
      actionCardNames.length>0&&React.createElement("div",{style:{
        background:"rgba(123,45,139,.08)",border:"1px solid rgba(123,45,139,.25)",
        borderRadius:12,padding:"10px 12px",marginBottom:12
      }},
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
          color:"rgba(255,255,255,.35)",letterSpacing:2,marginBottom:7,textAlign:"center"
        }},T.actionCardsDetectedCaps),
        React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center"}},
          actionCardNames.map(name=>{
            const count=actionCardCounts[name];
            return React.createElement("button",{
              key:name,
              onClick:()=>removeActionCard(name),
              style:{
                background:"linear-gradient(135deg,#7B2D8B,#5A1F70)",
                border:"2px solid rgba(200,100,255,.8)",
                borderRadius:20,padding:"8px 14px",cursor:"pointer",
                fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
                color:"#fff",letterSpacing:.5,
                boxShadow:"0 0 16px rgba(123,45,139,.6)",
                display:"inline-flex",alignItems:"center",gap:5
              }
            },(count>1?count+"× ":"")+name," ✕");
          })
        )
      ),

      // Paleta rápida — cartas disponibles (1 clic para agregar)
      React.createElement("div",{style:{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:"10px 12px",marginBottom:12}},
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:8,textAlign:"center"}},T.addCardPaletteCaps),
        React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}},
          // Paleta desactivada si ya hay 7 cartas
          cards.length>=MAX_CARDS
            ? React.createElement("div",{style:{width:"100%",textAlign:"center",
                fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
                color:"var(--y)",letterSpacing:2,padding:"6px 0"}},
                T.flip7CompletedMax
              )
            : availableCards.map(n=>
                React.createElement("button",{key:n,className:"avail-card",onClick:()=>addCard(n),
                  style:{color:colorFor(n),borderColor:colorFor(n)+"44"}},
                  n
                )
              )
        )
      ),

      // Total tentativo personal
      currentTotal!==undefined&&cards.length>0&&React.createElement("div",{style:{
        fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
        color:"rgba(255,255,255,.35)",marginBottom:8,letterSpacing:.5,textAlign:"center"
      }},T.youHavePrefix.replace('{a}',currentTotal).replace('{b}',total).replace('{c}',currentTotal+total)),

      // Botones confirm/retake
      React.createElement("div",{className:"mr2"},
        React.createElement("button",{className:"mc",onClick:()=>{snd("tap");onRetake();}},T.repeatPhotoBtn2),
        React.createElement("button",{className:"mo",onClick:()=>{
          snd("score");
          const bd=isVenganza
            ?{cards:cards.slice(),flip7,divTwo:hasDivTwo,negMods:negMods.slice(),actionCards:actionCards.slice()}
            :{cards:cards.slice(),flip7,multiplier,plusCards:plusCards.slice(),actionCards:actionCards.slice()};
          onResult(total,bd);
        },disabled:cards.length===0},T.confirmPtsBtn.replace('{n}',total+(flip7?T.inclFlip7Bonus:'')))
      ),
      // Cancelar (cierra el modal sin anotar) + Cero directo -- para cuando
      // el jugador se reventó y no necesita ajustar cartas, solo anotar 0.
      onClose&&React.createElement("div",{style:{display:"flex",gap:8,marginTop:8}},
        React.createElement("button",{className:"mc",style:{flex:1},
          onClick:()=>{snd("tap");onClose();}
        },T.exitWithoutScoring),
        React.createElement("button",{
          onClick:handleZero,
          style:{
            flex:1,background:"rgba(255,255,255,.06)",
            border:"2px solid rgba(255,255,255,.25)",borderRadius:11,
            padding:"12px",cursor:"pointer",
            fontFamily:"'Righteous',sans-serif",fontSize:".78rem",
            color:"rgba(255,255,255,.75)",letterSpacing:.5,
            transition:"all .2s",fontWeight:700
          }
        },T.zeroThisRound)
      )
    )
  );
}


// ── CARDPICKERMODAL — selector directo de cartas + modificadores ──
// El jugador toca las cartas que tiene en su mano (1 clic = agregar/quitar)
// Misma lógica que ResultEditor pero como modal de captura primaria
function CardPickerModal({playerName,currentTotal,onSubmit,onClose,T}){
  T=T||LANGS.es;
  var useState=React.useState,useEffect=React.useEffect;
  // Cartas seleccionadas — Set de números (0-12), máx 1 por número (regla del juego)
  var selState=useState([]);
  var selected=selState[0],setSelected=selState[1];
  var multState=useState(null);
  var multiplier=multState[0],setMultiplier=multState[1];
  var plusState=useState([]);
  var plusCards=plusState[0],setPlusCards=plusState[1];

  // Flip 7 bonus: se deriva ÚNICAMENTE de tener las 7 cartas — no es algo
  // que se pueda activar/desactivar a mano, solo se gana completando el Flip 7.
  var flip7=selected.length===MAX_CARDS;

  // Cálculo con bonus
  var baseTotal=selected.reduce(function(a,b){return a+b;},0);
  var afterMult=multiplier?baseTotal*multiplier:baseTotal;
  var total=afterMult+plusCards.reduce(function(a,b){return a+b;},0)+(flip7?FLIP7_BONUS:0);

  function toggleCard(n){
    if(selected.includes(n)){
      snd("del");
      setSelected(function(p){return p.filter(function(x){return x!==n;});});
    } else {
      if(selected.length>=MAX_CARDS){snd("zero");return;} // límite 7 cartas
      snd("score");
      setSelected(function(p){return p.concat([n]);});
    }
  }

  function togglePlus(n){
    snd("op");
    setPlusCards(function(p){
      return p.includes(n)?p.filter(function(x){return x!==n;}):p.concat([n]);
    });
  }

  function handleConfirm(){
    snd("score");
    var bd={cards:selected.slice(),flip7:flip7,multiplier:multiplier,plusCards:plusCards.slice()};
    onSubmit(total,bd);
  }

  function handleZero(){snd("zero");onSubmit(0,{cards:[],flip7:false,multiplier:null,plusCards:[]});}

  return React.createElement("div",{className:"mbg"},
    React.createElement("div",{className:"ms",style:{paddingBottom:40}},
      React.createElement("div",{className:"mh"}),
      React.createElement("div",{className:"mt2"},T.myCardsTitle),
      React.createElement("div",{className:"msub"},T.turnOf+" ",React.createElement("b",{style:{color:"#fff"}},playerName)),

      // ── DISPLAY TOTAL ────────────────────────────────────────
      React.createElement("div",{style:{
        textAlign:"center",padding:"10px 0 12px",
        borderBottom:"1px solid rgba(255,255,255,.08)",marginBottom:14
      }},
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
          color:"rgba(255,255,255,.3)",letterSpacing:3,marginBottom:2
        }},T.totalRoundCaps),
        React.createElement("div",{style:{
          fontFamily:"'Anton',sans-serif",fontSize:"5rem",
          color:selected.length===0?"rgba(255,255,255,.15)":"var(--y)",
          lineHeight:1,textShadow:selected.length>0?"4px 4px 0 var(--or)":"none",
          transition:"all .2s"
        }},total),
        // Total tentativo personal — "tienes X + esta ronda Y = Z", chiquito,
        // solo para orientarte mientras capturas, no le quita nada a la Tabla.
        currentTotal!==undefined&&React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
          color:"rgba(255,255,255,.35)",marginTop:6,letterSpacing:.5
        }},total>0?T.youHavePrefix.replace('{a}',currentTotal).replace('{b}',total).replace('{c}',currentTotal+total):(T.youHavePrefix.split(' + ')[0].replace('{a}',currentTotal))),
        // Fórmula desglosada
        selected.length>0&&React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
          color:"rgba(255,255,255,.35)",marginTop:4,lineHeight:1.7
        }},
          multiplier||plusCards.length>0||flip7
            ? React.createElement(React.Fragment,null,
                React.createElement("span",{style:{color:"rgba(255,255,255,.5)"}},
                  "Base: "+selected.slice().sort(function(a,b){return a-b;}).join("+")+" = "+baseTotal
                ),
                multiplier&&React.createElement(React.Fragment,null,
                  React.createElement("br"),
                  React.createElement("span",{style:{color:"rgba(255,120,120,.9)"}},
                    "x2 = "+baseTotal*2
                  )
                ),
                plusCards.length>0&&React.createElement(React.Fragment,null,
                  React.createElement("br"),
                  React.createElement("span",{style:{color:"rgba(100,220,150,.9)"}},
                    "+"+plusCards.join("+")+" = "+afterMult+plusCards.reduce(function(a,b){return a+Number(b);},0)
                  )
                ),
                flip7&&React.createElement(React.Fragment,null,
                  React.createElement("br"),
                  React.createElement("span",{style:{color:"var(--y)",fontWeight:700}},
                    "+ 15 Flip 7 = "+total
                  )
                )
              )
            : React.createElement("span",null,
                selected.slice().sort(function(a,b){return a-b;}).join(" + ")+(selected.length>1?" = "+baseTotal:"")
              )
        )
      ),

      // ── PALETA DE CARTAS 0-12 ─────────────────────────────────
      React.createElement("div",{style:{marginBottom:14}},
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
          color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:10,textAlign:"center"
        }},T.tapCardsInHand),
        React.createElement("div",{style:{
          display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6
        }},
          // Fila 0-6
          [0,1,2,3,4,5,6].map(function(n){
            var isSel=selected.includes(n);
            return React.createElement("button",{
              key:n,
              onClick:function(){toggleCard(n);},
              style:{
                background:isSel?"#F6EFD9":"rgba(255,255,255,.04)",
                border:"2px solid "+(isSel?CARD_TEXT_MAP[n]+"99":"rgba(255,255,255,.1)"),
                borderRadius:10,
                padding:"10px 4px 8px",
                cursor:(!isSel&&selected.length>=MAX_CARDS)?"not-allowed":"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                transition:"all .15s",
                transform:isSel?"scale(1.08)":"scale(1)",
                boxShadow:isSel?"0 4px 16px "+(CARD_TEXT_MAP[n]||"#fff")+"55":"none",
                opacity:(!isSel&&selected.length>=MAX_CARDS)?0.3:1,
                position:"relative"
              }
            },
              React.createElement("span",{style:{
                fontFamily:"'Anton',sans-serif",
                fontSize:"1.3rem",
                color:isSel?CARD_TEXT_MAP[n]||"#333":"rgba(255,255,255,.35)",
                lineHeight:1,
                transition:"color .15s"
              }},n),
              // Checkmark cuando seleccionada
              isSel&&React.createElement("div",{style:{
                position:"absolute",top:-5,right:-5,
                width:16,height:16,borderRadius:"50%",
                background:"var(--gr)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:"9px",color:"#fff",fontWeight:900,lineHeight:1
              }},"✓")
            );
          })
        ),
        React.createElement("div",{style:{
          display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginTop:6
        }},
          // Fila 7-12 + hueco
          [7,8,9,10,11,12,null].map(function(n,i){
            if(n===null){
              // Celda vacía para centrar el 12
              return React.createElement("div",{key:"empty"});
            }
            var isSel=selected.includes(n);
            return React.createElement("button",{
              key:n,
              onClick:function(){toggleCard(n);},
              style:{
                background:isSel?"#F6EFD9":"rgba(255,255,255,.04)",
                border:"2px solid "+(isSel?CARD_TEXT_MAP[n]+"99":"rgba(255,255,255,.1)"),
                borderRadius:10,
                padding:"10px 4px 8px",
                cursor:(!isSel&&selected.length>=MAX_CARDS)?"not-allowed":"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                transition:"all .15s",
                transform:isSel?"scale(1.08)":"scale(1)",
                boxShadow:isSel?"0 4px 16px "+(CARD_TEXT_MAP[n]||"#fff")+"55":"none",
                opacity:(!isSel&&selected.length>=MAX_CARDS)?0.3:1,
                position:"relative"
              }
            },
              React.createElement("span",{style:{
                fontFamily:"'Anton',sans-serif",
                fontSize:"1.3rem",
                color:isSel?CARD_TEXT_MAP[n]||"#333":"rgba(255,255,255,.35)",
                lineHeight:1,
                transition:"color .15s"
              }},n),
              isSel&&React.createElement("div",{style:{
                position:"absolute",top:-5,right:-5,
                width:16,height:16,borderRadius:"50%",
                background:"var(--gr)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:"9px",color:"#fff",fontWeight:900,lineHeight:1
              }},"✓")
            );
          })
        )
      ),

      // ── FLIP 7 BONUS INDICATOR ───────────────────────────────
      React.createElement("div",{
        style:{
          background:flip7?"linear-gradient(135deg,rgba(245,200,0,.18),rgba(255,107,53,.1))":"rgba(255,255,255,.03)",
          border:"2px solid "+(flip7?"rgba(245,200,0,.6)":"rgba(255,255,255,.1)"),
          borderRadius:12,padding:"10px 14px",marginBottom:10,
          display:"flex",alignItems:"center",gap:12,transition:"all .25s"
        }
      },
        React.createElement("div",{style:{fontSize:"1.5rem"}},"🃏"),
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
            color:flip7?"var(--y)":"rgba(255,255,255,.4)",letterSpacing:2}},
            T.flip7UniqueCaps
          ),
          React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
            color:"rgba(255,255,255,.35)",marginTop:2}},
            selected.length+"/7 "+T.cardsWord+" · "+
            (selected.length===MAX_CARDS?T.completeBonusActive:
             T.missingForBonus.replace('{n}',MAX_CARDS-selected.length))
          )
        ),
        React.createElement("div",{style:{
          fontFamily:"'Anton',sans-serif",fontSize:"1.6rem",
          color:flip7?"var(--y)":"rgba(255,255,255,.2)",
          textShadow:flip7?"0 0 15px rgba(245,200,0,.5)":"none",
          transition:"all .25s"
        }},flip7?"+15":"±0")
      ),
      // ── MODIFICADORES ─────────────────────────────────────────
      React.createElement("div",{style:{
        background:"rgba(246,166,35,.06)",border:"1px solid rgba(246,166,35,.2)",
        borderRadius:12,padding:"10px 12px",marginBottom:14
      }},
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
          color:"rgba(255,255,255,.35)",letterSpacing:2,marginBottom:8,textAlign:"center"
        }},T.modifiersHaveCaps),
        React.createElement("div",{style:{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}},
          // x2
          React.createElement("button",{
            onClick:function(){snd("op");setMultiplier(function(m){return m?null:2;});},
            style:{
              border:"2px solid "+(multiplier===2?MOD_TEXT_COLOR:"rgba(242,90,122,.25)"),
              background:multiplier===2?MOD_BG_COLOR:"rgba(246,166,35,.07)",
              borderRadius:10,padding:"8px 12px",cursor:"pointer",
              fontFamily:"'Anton',sans-serif",fontSize:"1.2rem",
              color:multiplier===2?"#fff":MOD_TEXT_COLOR,
              transition:"all .2s",minWidth:52,textAlign:"center",
              transform:multiplier===2?"scale(1.08)":"scale(1)"
            }
          },"x2",multiplier===2&&React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".52rem",color:"#fff",letterSpacing:1,marginTop:1}},"ON")),
          // +2 +4 +6 +8 +10
          [2,4,6,8,10].map(function(n){
            var active=plusCards.includes(n);
            return React.createElement("button",{key:n,
              onClick:function(){togglePlus(n);},
              style:{
                border:"2px solid "+(active?MOD_TEXT_COLOR:"rgba(242,90,122,.2)"),
                background:active?MOD_BG_COLOR:"rgba(246,166,35,.05)",
                borderRadius:10,padding:"8px 10px",cursor:"pointer",
                fontFamily:"'Anton',sans-serif",fontSize:"1.1rem",
                color:active?"#fff":MOD_TEXT_COLOR,
                transition:"all .2s",minWidth:44,textAlign:"center",
                transform:active?"scale(1.08)":"scale(1)"
              }
            },"+"+n,active&&React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".52rem",color:"#fff",letterSpacing:1,marginTop:1}},"ON"));
          })
        )
      ),

      // ── BOTONES FINALES ───────────────────────────────────────
      React.createElement("div",{style:{display:"flex",gap:8,marginBottom:8}},
        React.createElement("button",{className:"mc",
          style:{flex:1},
          onClick:function(){snd("tap");onClose();}
        },T.cancel),
        React.createElement("button",{
          style:{
            flex:2,padding:"13px",
            background:selected.length===0?"rgba(255,255,255,.07)":"linear-gradient(135deg,var(--y),var(--or))",
            border:"none",borderRadius:11,
            fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:".92rem",
            color:selected.length===0?"rgba(255,255,255,.3)":"var(--dark)",
            cursor:selected.length===0?"not-allowed":"pointer",
            boxShadow:selected.length>0?"0 4px 15px rgba(245,200,0,.3)":"none",
            transition:"all .2s"
          },
          disabled:selected.length===0,
          onClick:handleConfirm
        },selected.length===0
          ?T.selectCardsBtn
          :T.confirmPtsBtn.replace('{n}',total+(flip7?T.inclFlip7Bonus:'')))
      ),
      // Botón Cero separado
      React.createElement("button",{
        onClick:handleZero,
        style:{
          width:"100%",background:"rgba(255,255,255,.06)",
          border:"2px solid rgba(255,255,255,.25)",borderRadius:11,
          padding:"12px",cursor:"pointer",
          fontFamily:"'Righteous',sans-serif",fontSize:".82rem",
          color:"rgba(255,255,255,.75)",letterSpacing:1,
          transition:"all .2s",fontWeight:700
        }
      },T.zeroThisRound)
    )
  );
}


// ── VENGANZA CARD COLORS (1-13) ────────────────────────────────
const VENG_CARD_TEXT={
  0:"#FF2FA3",
  1:"#9c9096",2:"#d9e026",3:"#c9466f",4:"#44c1bb",5:"#38b44a",
  6:"#b9529f",7:"#d9837b",8:"#b1d57a",9:"#f79420",10:"#bb2540",
  11:"#6a8fc8",12:"#9a8776",13:"#008cd3"
};
const VENG_CARD_BG="#FFF8F0"; // crema ligeramente distinto al classic

// ── VENGANZA CARD PICKER MODAL ─────────────────────────────────
function VenganzaCardPickerModal({playerName,currentTotal,onSubmit,onClose,T}){
  T=T||LANGS.es;
  var useState=React.useState,useEffect=React.useEffect;
  var selState=useState([]);
  var selected=selState[0],setSelected=selState[1];
  var divState=useState(false);
  var hasDivTwo=divState[0],setHasDivTwo=divState[1];
  var negState=useState([]);
  var negMods=negState[0],setNegMods=negState[1];
  var f7State=useState(false);
  var flip7=f7State[0],setFlip7=f7State[1];
  var acState=useState([]);
  var actionCards=acState[0],setActionCards=acState[1];
  var lk13State=useState(false);
  var lucky13=lk13State[0],setLucky13=lk13State[1]; // permite 2x el 13
  var ul7State=useState(false);
  var unlucky7=ul7State[0],setUnlucky7=ul7State[1]; // borra cartas, deja solo el 7

  var NUMS=[0,1,2,3,4,5,6,7,8,9,10,11,12,13];
  var NEG_MODS=[-2,-4,-6,-8,-10];
  var ACTION_CARDS=["Just One More","Swap","Steal","Discard","Flip Four"];

  // Calculo oficial Venganza: Suma -> /2 -> -N -> min 0 -> +15 flip7
  var baseTotal=selected.reduce(function(a,b){return a+b;},0);
  var afterDiv=hasDivTwo?Math.floor(baseTotal/2):baseTotal;
  var afterNeg=Math.max(0,afterDiv+negMods.reduce(function(a,b){return a+b;},0));
  var total=afterNeg+(flip7?15:0);

  function distinctCount(arr){ return new Set(arr).size; }

  function toggleCard(n){
    var countN=selected.filter(function(x){return x===n;}).length;
    // Lucky 13: permite maximo 2 copias del 13. Resto: max 1 (un 3er 13 bustea).
    var maxAllowed=(n===13&&lucky13)?2:1;
    if(countN>0&&countN>=maxAllowed){
      // Quitar UNA copia del numero
      snd("del");
      setSelected(function(p){
        var removed=false;
        var next=p.filter(function(x){
          if(!removed&&x===n){removed=true;return false;}
          return true;
        });
        setFlip7(distinctCount(next)===7);
        return next;
      });
    }else{
      // Tope normal: 7 cartas (una por cada valor distinto).
      // Lucky 13: el 2do 13 es una carta EXTRA protegida — abre un 8vo cupo,
      // sin importar en qué momento/orden salga la 2da copia. Una vez que
      // esa 2da copia existe, ese 8vo cupo queda "gastado" ahí y el resto
      // de valores distintos se sigue llenando normalmente hasta 7 (8 en total).
      var already2x13=selected.filter(function(x){return x===13;}).length===2;
      var isSecond13Now=(n===13&&lucky13&&countN===1);
      var cap=(already2x13||isSecond13Now)?8:7;
      if(selected.length>=cap){snd("zero");return;}
      snd("score");
      setSelected(function(p){
        var next=p.concat([n]);
        // Bonus Flip 7 = 7 VALORES DISTINTOS (el 13 cuenta una vez aunque
        // tengas las 2 copias). La copia extra del 13 SÍ suma puntos y SÍ
        // cuenta para el bonus, según la carta oficial de Lucky 13.
        setFlip7(distinctCount(next)===7);
        return next;
      });
    }
  }

  function toggleNeg(n){
    snd("op");
    setNegMods(function(p){
      return p.includes(n)?p.filter(function(x){return x!==n;}):p.concat([n]);
    });
  }

  function toggleAction(a){
    snd("tap");
    setActionCards(function(p){
      return p.includes(a)?p.filter(function(x){return x!==a;}):p.concat([a]);
    });
  }

  function activateUnlucky7(){
    snd("del");
    // Unlucky 7: pierdes TODAS tus cartas, solo queda el 7. Sin recuperacion.
    setSelected([7]);
    setHasDivTwo(false);
    setNegMods([]);
    setFlip7(false);
    setUnlucky7(true);
    setLucky13(false);
  }
  function deactivateUnlucky7(){
    // Solo para desmarcar si el usuario lo activo por error
    // No restaura nada — las cartas ya se perdieron
    snd("tap");
    setSelected([]);
    setUnlucky7(false);
  }

  return React.createElement("div",{className:"mbg"},
    React.createElement("div",{className:"ms",style:{paddingBottom:40}},
      React.createElement("div",{className:"mh"}),
      // Header con color rojo Venganza
      React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:3}},
        React.createElement("div",{style:{fontFamily:"'Lilita One',sans-serif",fontSize:"1.4rem",
          color:"var(--r)",letterSpacing:1.5}},T.myCardsVengTitle),
        React.createElement("span",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
          background:"rgba(230,57,70,.15)",border:"1px solid rgba(230,57,70,.4)",
          color:"var(--r)",padding:"2px 8px",borderRadius:20,letterSpacing:1}},
          T.modeVengCaps)
      ),
      React.createElement("div",{className:"msub"},T.turnOf+" ",
        React.createElement("b",{style:{color:"#fff"}},playerName)),

      // ── TOTAL DISPLAY ───────────────────────────────────────────
      React.createElement("div",{style:{
        textAlign:"center",padding:"10px 0 12px",
        borderBottom:"1px solid rgba(255,255,255,.08)",marginBottom:12
      }},
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".58rem",letterSpacing:3,marginBottom:2,
          color:flip7?"var(--r)":"rgba(255,255,255,.3)",transition:"color .3s"
        }},flip7?T.flip7Bonus15Caps:T.totalRoundCaps),
        React.createElement("div",{style:{
          fontFamily:"'Anton',sans-serif",
          fontSize:selected.length===0?"3rem":"5rem",
          color:selected.length===0?"rgba(255,255,255,.15)":"var(--r)",
          lineHeight:1,textShadow:selected.length>0?"4px 4px 0 rgba(230,57,70,.4)":"none",
          transition:"all .2s"
        }},total),
        // Total tentativo personal
        currentTotal!==undefined&&React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
          color:"rgba(255,255,255,.35)",marginTop:6,letterSpacing:.5
        }},total>0?T.youHavePrefix.replace('{a}',currentTotal).replace('{b}',total).replace('{c}',currentTotal+total):(T.youHavePrefix.split(' + ')[0].replace('{a}',currentTotal))),
        // Desglose del calculo
        selected.length>0&&React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
          color:"rgba(255,255,255,.4)",marginTop:6,lineHeight:1.8
        }},
          React.createElement("span",null,T.baseLbl+" "+selected.slice().sort(function(a,b){return a-b;}).join("+")+" = "+baseTotal),
          hasDivTwo&&React.createElement(React.Fragment,null,
            React.createElement("br"),
            React.createElement("span",{style:{color:"rgba(230,57,70,.8)"}},"÷2 = "+afterDiv)
          ),
          negMods.length>0&&React.createElement(React.Fragment,null,
            React.createElement("br"),
            React.createElement("span",{style:{color:"rgba(230,57,70,.8)"}},
              negMods.join("")+" = "+afterNeg+(afterNeg<afterDiv?" (min 0)":"")
            )
          ),
          flip7&&React.createElement(React.Fragment,null,
            React.createElement("br"),
            React.createElement("span",{style:{color:"var(--r)",fontWeight:900}},"+15 Flip 7 = "+total)
          )
        )
      ),

      // ── PALETA DE CARTAS 1-13 ────────────────────────────────────
      React.createElement("div",{style:{marginBottom:12}},
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
          color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:8,textAlign:"center"
        }},T.tapCardsInHand113),
        // Fila 1-7
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:5}},
          [0,1,2,3,4,5,6].map(function(n){
            var isSel=selected.includes(n);
            var countN=selected.filter(function(x){return x===n;}).length;
            // A card is "locked" (can't add more) when: already selected (unless lucky13+13) OR grid full
            var locked=(!isSel&&selected.length>=7); // full grid, can't add new
            // Lucky 13 exception: can add a 2nd 13
            if(n===13&&lucky13&&countN<2&&selected.length<7)locked=false;
            return React.createElement("button",{key:n,
              onClick:function(){toggleCard(n);},
              style:{
                background:isSel?VENG_CARD_BG:"rgba(255,255,255,.04)",
                border:"2px solid "+(isSel?VENG_CARD_TEXT[n]+"99":(n===13&&lucky13&&countN<2?"rgba(123,45,139,.5)":"rgba(255,255,255,.1)")),
                borderRadius:10,padding:"10px 3px 8px",
                cursor:locked?"not-allowed":"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                transition:"all .15s",
                transform:isSel?"scale(1.08)":"scale(1)",
                boxShadow:isSel?"0 4px 14px "+VENG_CARD_TEXT[n]+"55":"none",
                opacity:locked?0.3:1,position:"relative"
              }},
              React.createElement("span",{style:{
                fontFamily:"'Anton',sans-serif",fontSize:"1.3rem",lineHeight:1,
                color:isSel?VENG_CARD_TEXT[n]:"rgba(255,255,255,.35)",
                transition:"color .15s"
              }},n),
              isSel&&React.createElement("div",{style:{
                position:"absolute",top:-4,right:-4,width:14,height:14,
                borderRadius:"50%",
                background:n===13&&lucky13&&selected.filter(function(x){return x===13;}).length===2?"var(--pu)":"var(--gr)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:"7px",color:"#fff",fontWeight:900,lineHeight:1
              }},n===13&&lucky13&&selected.filter(function(x){return x===13;}).length===2?"2":"✓")
            );
          })
        ),
        // Fila 8-13 + hueco
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}},
          [7,8,9,10,11,12,13].map(function(n,i){
            var isSel=selected.includes(n);
            var countN=selected.filter(function(x){return x===n;}).length;
            var isLucky=(n===13&&lucky13);
            // Locked: already selected (unless lucky13) OR grid full
            var locked=(!isSel&&selected.length>=7); // full grid, can't add
            if(isLucky&&countN<2&&selected.length<7)locked=false; // allow 2nd 13
            return React.createElement("button",{key:n,
              onClick:function(){toggleCard(n);},
              style:{
                background:isSel?VENG_CARD_BG:"rgba(255,255,255,.04)",
                border:"2px solid "+(isSel?VENG_CARD_TEXT[n]+"99":(isLucky&&countN<2&&!locked?"rgba(123,45,139,.5)":"rgba(255,255,255,.1)")),
                borderRadius:10,padding:"10px 3px 8px",
                cursor:locked?"not-allowed":"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                transition:"all .15s",
                transform:isSel?"scale(1.08)":"scale(1)",
                boxShadow:isSel?"0 4px 14px "+VENG_CARD_TEXT[n]+"55":"none",
                opacity:locked?0.3:1,position:"relative"
              }},
              React.createElement("span",{style:{
                fontFamily:"'Anton',sans-serif",
                fontSize:"1.3rem",lineHeight:1,
                color:isSel?VENG_CARD_TEXT[n]:"rgba(255,255,255,.35)",
                transition:"color .15s"
              }},n===13&&lucky13&&selected.filter(function(x){return x===13;}).length===2?"13×2":n),
              isSel&&React.createElement("div",{style:{
                position:"absolute",top:-4,right:-4,width:14,height:14,
                borderRadius:"50%",
                background:n===13&&lucky13&&selected.filter(function(x){return x===13;}).length===2?"var(--pu)":"var(--gr)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:"7px",color:"#fff",fontWeight:900,lineHeight:1
              }},n===13&&lucky13&&selected.filter(function(x){return x===13;}).length===2?"2":"✓")
            );
          })
        )
      ),

      // ── LUCKY 13 TOGGLE ──────────────────────────────────────────
      React.createElement("div",{
        onClick:function(){snd("tap");setLucky13(function(v){return !v;});},
        style:{
          display:"flex",alignItems:"center",gap:12,
          background:lucky13?"rgba(123,45,139,.2)":"rgba(255,255,255,.03)",
          border:"2px solid "+(lucky13?"rgba(123,45,139,.6)":"rgba(255,255,255,.1)"),
          borderRadius:12,padding:"9px 13px",marginBottom:8,
          cursor:"pointer",transition:"all .2s",
          boxShadow:lucky13?"0 0 16px rgba(123,45,139,.3)":"none"
        }
      },
        React.createElement("div",{style:{fontSize:"1.3rem"}},"🍀"),
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{style:{
            fontFamily:"'Righteous',sans-serif",fontSize:".7rem",
            color:lucky13?"#cc88ff":"rgba(255,255,255,.4)",letterSpacing:2
          }},T.lucky13Caps),
          React.createElement("div",{style:{
            fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
            color:"rgba(255,255,255,.3)",marginTop:2,lineHeight:1.4
          }},T.lucky13Allow2)
        ),
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
          color:lucky13?"#cc88ff":"rgba(255,255,255,.2)",letterSpacing:1,
          textAlign:"center",lineHeight:1.5
        }},
          lucky13
            ? React.createElement("span",{style:{
                background:"rgba(123,45,139,.4)",padding:"2px 8px",
                borderRadius:20,fontSize:".65rem",color:"#cc88ff"
              }},T.active2x13)
            : React.createElement("span",null,T.offLbl)
        )
      ),
      // ── UNLUCKY 7 ────────────────────────────────────────────────
      React.createElement("div",{
        onClick:function(){unlucky7?deactivateUnlucky7():activateUnlucky7();},
        style:{
          display:"flex",alignItems:"center",gap:12,
          background:unlucky7?"rgba(230,57,70,.18)":"rgba(255,255,255,.03)",
          border:"2px solid "+(unlucky7?"rgba(230,57,70,.7)":"rgba(255,255,255,.1)"),
          borderRadius:12,padding:"9px 13px",marginBottom:8,
          cursor:"pointer",transition:"all .2s",
          boxShadow:unlucky7?"0 0 16px rgba(230,57,70,.3)":"none"
        }
      },
        React.createElement("div",{style:{fontSize:"1.3rem"}},"💀"),
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{style:{
            fontFamily:"'Righteous',sans-serif",fontSize:".7rem",
            color:unlucky7?"var(--r)":"rgba(255,255,255,.4)",letterSpacing:2
          }},T.unlucky7Caps),
          React.createElement("div",{style:{
            fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
            color:"rgba(255,255,255,.3)",marginTop:2,lineHeight:1.4
          }},unlucky7
            ?T.activeDivBtn
            :T.unlucky7Desc)
        ),
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".62rem",letterSpacing:1,
          color:unlucky7?"var(--r)":"rgba(255,255,255,.2)",textAlign:"right",lineHeight:1.6
        }},unlucky7
          ? React.createElement(React.Fragment,null,
              React.createElement("div",{style:{background:"rgba(230,57,70,.35)",padding:"2px 8px",
                borderRadius:20,color:"var(--r)",fontSize:".62rem",marginBottom:3}},T.activeLbl),
              React.createElement("div",{style:{fontSize:".55rem",color:"rgba(255,255,255,.3)"}},T.tapOnlyIfActivated)
            )
          : T.offLbl)
      ),
      // ── FLIP 7 BONUS — solo informativo, se activa automáticamente ─
      React.createElement("div",{
        style:{
          background:flip7?"linear-gradient(135deg,rgba(230,57,70,.2),rgba(230,57,70,.08))"
            :"rgba(255,255,255,.03)",
          border:"2px solid "+(flip7?"rgba(230,57,70,.7)":"rgba(255,255,255,.1)"),
          borderRadius:12,padding:"10px 14px",marginBottom:10,
          display:"flex",alignItems:"center",gap:12,cursor:"default",transition:"all .25s",
          boxShadow:flip7?"0 0 20px rgba(230,57,70,.25)":"none"
        }
      },
        React.createElement("div",{style:{fontSize:"1.4rem"}},"🃏"),
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",
            fontSize:".7rem",color:flip7?"var(--r)":"rgba(255,255,255,.4)",letterSpacing:2}},
            T.flip7DistinctCaps),
          React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",
            fontSize:".58rem",color:"rgba(255,255,255,.3)",marginTop:2}},
            (function(){
              var dc=distinctCount(selected);
              var dup13=selected.filter(function(x){return x===13;}).length===2;
              if(dc===7)return dc+T.completeAutoSlash7+(dup13?T.flip15Extra13:"");
              return dc+T.missingSlash7.replace('{n}',7-dc);
            })())
        ),
        React.createElement("div",{style:{
          fontFamily:"'Anton',sans-serif",fontSize:"1.5rem",
          color:flip7?"var(--r)":"rgba(255,255,255,.2)",
          textShadow:flip7?"0 0 15px rgba(230,57,70,.6)":"none",
          transition:"all .25s"
        }},flip7?"+15":"±0")
      ),

      // ── MODIFICADORES NEGATIVOS ───────────────────────────────────
      React.createElement("div",{style:{
        background:"rgba(230,57,70,.06)",border:"1px solid rgba(230,57,70,.2)",
        borderRadius:12,padding:"10px 12px",marginBottom:10
      }},
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
          color:"rgba(255,255,255,.35)",letterSpacing:2,marginBottom:8,textAlign:"center"
        }},T.modifiersPlayedCaps),
        React.createElement("div",{style:{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"center"}},
          // Carta /2 — se aplica ANTES que los -N
          React.createElement("button",{
            onClick:function(){snd("op");setHasDivTwo(function(v){return !v;});},
            style:{
              border:"2px solid "+(hasDivTwo?"var(--r)":"rgba(230,57,70,.25)"),
              background:hasDivTwo?"var(--r)":"rgba(230,57,70,.07)",
              borderRadius:10,padding:"8px 12px",cursor:"pointer",
              fontFamily:"'Anton',sans-serif",fontSize:"1.2rem",
              color:hasDivTwo?"#fff":"var(--r)",
              transition:"all .2s",minWidth:52,textAlign:"center",
              transform:hasDivTwo?"scale(1.08)":"scale(1)"
            }
          },"÷2",hasDivTwo&&React.createElement("div",{style:{
            fontFamily:"'Righteous',sans-serif",fontSize:".52rem",
            color:"#fff",letterSpacing:1,marginTop:1
          }},"ON")),
          // Cartas -2 a -10
          NEG_MODS.map(function(n){
            var active=negMods.includes(n);
            return React.createElement("button",{key:n,
              onClick:function(){toggleNeg(n);},
              style:{
                border:"2px solid "+(active?"var(--r)":"rgba(230,57,70,.2)"),
                background:active?"var(--r)":"rgba(230,57,70,.05)",
                borderRadius:10,padding:"8px 10px",cursor:"pointer",
                fontFamily:"'Anton',sans-serif",fontSize:"1.1rem",
                color:active?"#fff":"var(--r)",
                transition:"all .2s",minWidth:44,textAlign:"center",
                transform:active?"scale(1.08)":"scale(1)"
              }
            },n,active&&React.createElement("div",{style:{
              fontFamily:"'Righteous',sans-serif",fontSize:".52rem",
              color:"#fff",letterSpacing:1,marginTop:1
            }},"ON"));
          })
        ),
        // Orden de calculo visible
        (hasDivTwo||negMods.length>0)&&React.createElement("div",{style:{
          marginTop:8,borderTop:"1px solid rgba(230,57,70,.2)",paddingTop:8,
          fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
          color:"var(--r)",textAlign:"center",letterSpacing:1
        }},
          "Suma("+baseTotal+") "+
          (hasDivTwo?"÷2="+afterDiv+" ":"")+
          (negMods.length>0?negMods.join("")+"="+afterNeg+" ":"")+
          (flip7?"+15="+total:"= "+afterNeg)
        )
      ),

      // ── CARTAS DE ACCION (informativo) ───────────────────────────
      React.createElement("div",{style:{
        background:"rgba(123,45,139,.08)",border:"1px solid rgba(123,45,139,.25)",
        borderRadius:12,padding:"10px 12px",marginBottom:12
      }},
        React.createElement("div",{style:{
          fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
          color:"rgba(255,255,255,.35)",letterSpacing:2,marginBottom:7,textAlign:"center"
        }},T.actionCardsRegisterCaps),
        React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center"}},
          ACTION_CARDS.map(function(a,ai){
            var active=actionCards.includes(a);
            return React.createElement("button",{
              key:a,
              onClick:function(e){e.stopPropagation();toggleAction(a);},
              style:{
                background:active?"linear-gradient(135deg,#7B2D8B,#5A1F70)":"rgba(255,255,255,.05)",
                border:"2px solid "+(active?"rgba(200,100,255,.8)":"rgba(255,255,255,.15)"),
                borderRadius:20,padding:"8px 14px",cursor:"pointer",
                fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
                color:active?"#fff":"rgba(255,255,255,.5)",
                letterSpacing:.5,
                boxShadow:active?"0 0 16px rgba(123,45,139,.6)":"none",
                display:"inline-flex",alignItems:"center",gap:5,
                userSelect:"none"
              }
            },
              active&&React.createElement("span",{style:{
                width:14,height:14,borderRadius:"50%",
                background:"rgba(255,255,255,.9)",
                display:"inline-flex",alignItems:"center",justifyContent:"center",
                fontSize:"9px",color:"#5A1F70",fontWeight:900,flexShrink:0
              }},"✓"),
              a
            );
          })
        )
      ),

      // ── BOTONES ───────────────────────────────────────────────────
      React.createElement("div",{style:{display:"flex",gap:8,marginBottom:8}},
        React.createElement("button",{style:{flex:1,padding:"13px",background:"rgba(255,255,255,.1)",border:"2px solid rgba(255,255,255,.25)",color:"rgba(255,255,255,.8)",borderRadius:11,fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:".9rem",cursor:"pointer"},
          onClick:function(){snd("tap");onClose();}
        },T.cancel),
        React.createElement("button",{
          disabled:selected.length===0,
          onClick:function(){
            snd("score");
            var bd={cards:selected.slice(),flip7:flip7,divTwo:hasDivTwo,negMods:negMods.slice(),lucky13:lucky13,unlucky7:unlucky7,actionCards:actionCards.slice()};
            onSubmit(total,bd);
          },
          style:{
            flex:2,padding:"13px",border:"none",borderRadius:11,
            fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:".9rem",
            background:selected.length===0?"rgba(255,255,255,.07)"
              :"linear-gradient(135deg,var(--r),#c0392b)",
            color:selected.length===0?"rgba(255,255,255,.3)":"#fff",
            cursor:selected.length===0?"not-allowed":"pointer",
            boxShadow:selected.length>0?"0 4px 15px rgba(230,57,70,.35)":"none",
            transition:"all .2s"
          }
        },selected.length===0
          ?T.selectCardsBtn
          :T.confirmPtsBtn.replace('{n}',total+(flip7?T.inclFlip7Bonus:'')))
      ),
      React.createElement("button",{
        onClick:function(){snd("zero");onSubmit(0,{cards:[],bust:true});},
        style:{
          width:"100%",background:"rgba(255,255,255,.06)",
          border:"2px solid rgba(255,255,255,.25)",borderRadius:11,
          padding:"12px",cursor:"pointer",
          fontFamily:"'Righteous',sans-serif",fontSize:".82rem",
          color:"rgba(255,255,255,.75)",letterSpacing:1,
          transition:"all .2s",fontWeight:700
        }
      },T.zeroThisRound)
    )
  );
}

// ── MANUALMODAL — soporta initialScore para corrección ────────
function ManualModal({playerName,currentTotal,initialScore,onSubmit,onClose,gameMode,T}){
  T=T||LANGS.es;
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
      React.createElement("div",{className:"mt2"},isCorrection?T.manualCorrectTitle:T.manualCaptureTitle),
      React.createElement("div",{className:"msub"},
        isCorrection
          ? React.createElement(React.Fragment,null,T.correctionOf+" ",React.createElement("b",{style:{color:"#fff"}},playerName)," — "+T.currentValueLbl+" ",React.createElement("b",{style:{color:"var(--y)"}},initialScore))
          : React.createElement(React.Fragment,null,T.pointsOf2+" ",React.createElement("b",{style:{color:"#fff"}},playerName)," "+T.thisRound2)
      ),
      React.createElement("div",{className:"calc-display"},
        React.createElement("div",{className:"calc-expr"},display),
        React.createElement("div",{className:"calc-result"+(error?" error":"")},error?T.errorLbl:finalVal)
      ),
      // Total tentativo personal — no aplica en corrección (ahí currentTotal
      // ya no representa "antes de esta ronda" de forma clara)
      !isCorrection&&currentTotal!==undefined&&React.createElement("div",{style:{
        fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
        color:"rgba(255,255,255,.35)",marginTop:-6,marginBottom:10,letterSpacing:.5,textAlign:"center"
      }},!error&&finalVal>0?T.youHavePrefix.replace('{a}',currentTotal).replace('{b}',finalVal).replace('{c}',currentTotal+finalVal):T.youHavePrefix.split(' + ')[0].replace('{a}',currentTotal)),
      // Tip: botón rápido +15 para Flip 7 bonus
      React.createElement("div",{style:{marginBottom:10}},
        React.createElement("button",{
          onClick:()=>{snd("op");setExpr(v=>{
            if(!v||v==="")return "15";
            const last=v.slice(-1);
            if(["+","-","*","/"].includes(last))return v+"15";
            return v+"+15";
          });},
          style:{
            width:"100%",background:"rgba(245,200,0,.1)",
            border:"1px solid rgba(245,200,0,.35)",borderRadius:10,
            padding:"8px 14px",cursor:"pointer",
            fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
            color:"var(--y)",letterSpacing:1,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8
          }
        },
          React.createElement("span",{style:{fontSize:"1.1rem"}},"🃏"),
          T.flip15BonusTip
        )
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
        gameMode==="venganza"
          ? React.createElement("button",{className:"npb op-key",style:{fontSize:"1.2rem"},onClick:()=>pressOp("/")},"÷")
          : React.createElement("button",{className:"npb clr-key",onClick:pressClear},T.clrKey)
      ),
      gameMode==="venganza"&&React.createElement("button",{className:"npb clr-key",style:{width:"100%",borderRadius:14,padding:"10px",marginBottom:8},onClick:pressClear},T.clrKeyClear),
      React.createElement("button",{className:"npb ok-key",onClick:()=>{
        if(error||(!expr&&finalVal===0)){snd("zero");onSubmit(0);}
        else{snd("score");onSubmit(Math.max(0,Math.round(finalVal)));}
      }},isCorrection?T.saveCorrection:T.confirmDot,React.createElement("span",{style:{fontSize:"1.4rem"}},error?"0":Math.max(0,Math.round(finalVal)))," pts"),
      React.createElement("div",{style:{height:10}}),
      React.createElement("button",{className:"mc",style:{width:"100%"},onClick:()=>{snd("tap");onClose();}},T.cancel)
    ))
  );
}



// ── GROUPSSCREEN — grupos persistentes + presencia ─────────────
function GroupsScreen({authUser, onBack, onJoinRoom, onPlay, T}){
  const[tab,setTab]=React.useState("my"); // my | browse
  const[myGroups,setMyGroups]=React.useState([]);
  const[activeGroup,setActiveGroup]=React.useState(null); // group detail
  const[presence,setPresence]=React.useState({}); // {uid: {online,status,lastSeen}}
  const[loading,setLoading]=React.useState(true);
  const[creating,setCreating]=React.useState(false);
  const[newGroupName,setNewGroupName]=React.useState("");
  const[joinCode,setJoinCode]=React.useState("");
  const[err,setErr]=React.useState("");
  const[ok,setOk]=React.useState("");
  const[friends,setFriends]=React.useState([]);
  const[selectedPlayers,setSelectedPlayers]=React.useState({}); // uid→true
  const[confirmRemoveMember,setConfirmRemoveMember]=React.useState(null); // uid pendiente
  const[confirmDeleteGroup,setConfirmDeleteGroup]=React.useState(false);
  const[busyAction,setBusyAction]=React.useState(false);
  const presUnsubRef=React.useRef([]);

  const uid=authUser&&authUser.uid;
  const isAnon=authUser&&authUser.isAnonymous;

  // Load my groups — EN VIVO. Antes era .once, por eso crear/agregar/quitar
  // se veía bien en el momento (parchábamos el estado a mano) pero al salir
  // y volver, o si otra persona hacía el cambio, no se reflejaba solo.
  React.useEffect(()=>{
    if(!uid||isAnon)return;
    setLoading(true);
    const idxRef=_db.ref("users/"+uid+"/groups");
    const groupUnsubs={};

    function attachGroup(gid){
      if(groupUnsubs[gid])return;
      const gRef=_db.ref("groups/"+gid);
      const h=snap=>{
        const val=snap.val();
        setMyGroups(prev=>{
          if(!val)return prev.filter(g=>g.id!==gid);
          const next={id:gid,...val};
          const idx=prev.findIndex(g=>g.id===gid);
          if(idx===-1)return[...prev,next];
          const copy=[...prev];copy[idx]=next;return copy;
        });
      };
      gRef.on("value",h);
      groupUnsubs[gid]=()=>gRef.off("value",h);
    }
    function detachGroup(gid){
      if(groupUnsubs[gid]){groupUnsubs[gid]();delete groupUnsubs[gid];}
    }
    const idxHandler=snap=>{
      const gids=Object.keys(snap.val()||{});
      gids.forEach(attachGroup);
      Object.keys(groupUnsubs).forEach(gid=>{
        if(!gids.includes(gid)){detachGroup(gid);setMyGroups(prev=>prev.filter(g=>g.id!==gid));}
      });
      setLoading(false);
    };
    idxRef.on("value",idxHandler);

    // Load friends live too (para que la lista de "agregar amigos" se actualice sola)
    const fRef=_db.ref("users/"+uid+"/friends");
    const fHandler=snap=>setFriends(Object.values(snap.val()||{}));
    fRef.on("value",fHandler);

    return()=>{
      idxRef.off("value",idxHandler);
      Object.values(groupUnsubs).forEach(u=>u());
      fRef.off("value",fHandler);
      presUnsubRef.current.forEach(u=>u());
    };
  },[uid]);

  // Reactivar la suscripción de presencia cuando cambia el SET de grupos
  // (no en cada cambio de contenido, para no resuscribir de más)
  const groupIdsKey=myGroups.map(g=>g.id).sort().join(",");
  React.useEffect(()=>{
    if(myGroups.length>0)listenPresence(myGroups);
  },[groupIdsKey]);

  // Mantener activeGroup sincronizado en vivo con myGroups — así ya no hace
  // falta parchar activeGroup a mano en cada acción (crear/agregar/quitar);
  // el listener de arriba actualiza myGroups y esto lo refleja en el detalle.
  React.useEffect(()=>{
    if(!activeGroup)return;
    const updated=myGroups.find(g=>g.id===activeGroup.id);
    if(updated&&updated!==activeGroup)setActiveGroup(updated);
    else if(!updated)setActiveGroup(null); // el grupo fue eliminado
  },[myGroups]);

  function listenPresence(groups){
    presUnsubRef.current.forEach(u=>u());
    presUnsubRef.current=[];
    groups.forEach(g=>{
      const ref=_db.ref("presence/"+g.id);
      const handler=snap=>{
        const data=snap.val()||{};
        setPresence(prev=>({...prev,...data}));
      };
      ref.on("value",handler);
      presUnsubRef.current.push(()=>ref.off("value",handler));
    });
  }

  // NOTA: la presencia ya NO se escribe aquí. Antes este efecto marcaba
  // online:true al entrar a Grupos y offline:false al salir de esta
  // pantalla — eso deshacía el heartbeat global (app.js) apenas
  // navegabas a otra vista, aunque siguieras conectado. Ahora la
  // presencia vive solo en startPresenceHeartbeat() (app.js), que se
  // mantiene activo en toda la app, no solo aquí.

  async function createGroup(){
    if(!newGroupName.trim()){setErr(T.grpNameRequired);return;}
    setErr("");
    try{
      const code=Math.random().toString(36).slice(2,6).toUpperCase();
      // Use authUser directly instead of reading /users/{uid} (avoids permission issues)
      const me={
        displayName:authUser.displayName||"",
        email:authUser.email||"",
        photoURL:authUser.photoURL||""
      };
      const newGroup={
        name:newGroupName.trim(),
        code,
        createdBy:uid,
        createdAt:Date.now(),
        members:{[uid]:{
          name:me.displayName||me.email||"?",
          email:me.email||"",
          photoURL:me.photoURL||"",
          role:"admin",
          joinedAt:Date.now()
        }},
        currentRoom:null,
        gameCount:0,
      };
      const ref=await _db.ref("groups").push(newGroup);
      await _db.ref("users/"+uid+"/groups/"+ref.key).set(true);
      const created={id:ref.key,...newGroup};
      setMyGroups(prev=>[...prev,created]);
      setCreating(false);setNewGroupName("");
      setActiveGroup(created);
      snd("join");
      setOk(T.grpCreatedMsg.replace('{code}',code));
    }catch(e){setErr(T.errorPrefixLbl+" "+e.message);}
  }

  async function joinGroup(){
    if(!joinCode.trim()||joinCode.length<4){setErr(T.grpCodeRequired);return;}
    setErr("");
    try{
      const snap=await _db.ref("groups").orderByChild("code").equalTo(joinCode.toUpperCase()).once("value");
      const data=snap.val();
      if(!data){setErr(T.grpNotFound);return;}
      const gid=Object.keys(data)[0];
      const group=data[gid];
      if(group.members&&group.members[uid]){setErr(T.grpAlreadyMember);return;}
      const me={
        displayName:authUser.displayName||"",
        email:authUser.email||"",
        photoURL:authUser.photoURL||""
      };
      await _db.ref("groups/"+gid+"/members/"+uid).set({
        name:me.displayName||me.email||"?",
        email:me.email||"",
        photoURL:me.photoURL||"",
        role:"member",
        joinedAt:Date.now()
      });
      await _db.ref("users/"+uid+"/groups/"+gid).set(true);
      const joined={id:gid,...group,members:{...group.members,[uid]:{name:me.displayName||me.email||"?"}}};
      setMyGroups(prev=>[...prev,joined]);
      setJoinCode("");
      snd("join");
      setOk(T.grpJoinedMsg.replace('{name}',group.name));
    }catch(e){setErr(T.errorPrefixLbl+" "+e.message);}
  }

  async function openRoomForGroup(group){
    // Set currentRoom on the group so members see it
    if(group.currentRoom){
      // Already has a room — join it
      onJoinRoom(group.currentRoom);
    } else {
      setErr(T.grpCreateRoomHint);
    }
  }

  // fmtAgo ahora es una función global (ver arriba de HomeScreen) — se
  // reutiliza también en PersonalDashboard para el estatus de Amigos.

  if(isAnon)return(
    <div className="wrap"><div className="page" style={{paddingTop:32}}>
      <div style={{textAlign:"center",padding:"40px 20px"}}>
        <div style={{fontSize:"3rem",marginBottom:12}}>👥</div>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--y)",letterSpacing:2,marginBottom:8}}>{T.groupsTitle}</div>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".78rem",color:"rgba(255,255,255,.4)",lineHeight:1.6,marginBottom:20}}>
          {T.groupsLoginPrompt}
        </div>
        <button onClick={()=>signOut()} className="btn btn-y" style={{maxWidth:280,margin:"0 auto"}}>{T.createAccount}</button>
        <div style={{height:12}}/>
        <button onClick={onBack} className="btn btn-g" style={{maxWidth:280,margin:"0 auto"}}>{T.back}</button>
      </div>
    </div></div>
  );

  // Eliminar un miembro del grupo (solo admin). Borra AMBOS lados del dato
  // — esto también sirve para reparar una membresía mal referenciada
  // (ej. alguien agregado antes del fix del índice inverso): sácalo y
  // vuelve a agregarlo con "+ Agregar", que ya guarda ambos lados.
  async function removeMember(targetUid){
    if(!activeGroup)return;
    setBusyAction(true);
    try{
      await _db.ref("groups/"+activeGroup.id+"/members/"+targetUid).remove();
      await _db.ref("users/"+targetUid+"/groups/"+activeGroup.id).remove();
      await _db.ref("presence/"+activeGroup.id+"/"+targetUid).remove();
      setActiveGroup(g=>{
        const nm={...g.members};delete nm[targetUid];
        return{...g,members:nm};
      });
      setMyGroups(prev=>prev.map(g=>g.id===activeGroup.id
        ?{...g,members:Object.fromEntries(Object.entries(g.members||{}).filter(([k])=>k!==targetUid))}
        :g));
      setConfirmRemoveMember(null);
      setOk(T.grpMemberRemoved);
    }catch(e){setOk("❌ "+T.errorPrefixLbl+" "+e.message);}
    setBusyAction(false);
  }

  // Eliminar el grupo completo (solo admin). Primero limpia el índice
  // inverso de cada miembro (mientras el grupo aún existe, para que la
  // regla de Firebase pueda validar la membresía), y al final borra el
  // grupo en sí.
  async function deleteGroup(){
    if(!activeGroup)return;
    setBusyAction(true);
    try{
      const memberUids=Object.keys(activeGroup.members||{});
      const idxUpdates={};
      memberUids.forEach(muid=>{idxUpdates["users/"+muid+"/groups/"+activeGroup.id]=null;});
      if(Object.keys(idxUpdates).length) await _db.ref().update(idxUpdates);
      await _db.ref("presence/"+activeGroup.id).remove();
      await _db.ref("groups/"+activeGroup.id).remove();
      setMyGroups(prev=>prev.filter(g=>g.id!==activeGroup.id));
      setActiveGroup(null);
      setConfirmDeleteGroup(false);
      setOk(T.grpGroupDeleted);
    }catch(e){setOk("❌ "+T.errorPrefixLbl+" "+e.message);}
    setBusyAction(false);
  }

  // Group detail view
  if(activeGroup){
    const members=activeGroup.members||{};
    const memberList=Object.entries(members).map(([muid,m])=>({uid:muid,...m}));
    const onlineCount=memberList.filter(m=>presence[m.uid]&&presence[m.uid].online).length;
    const hasActiveRoom=activeGroup.currentRoom;
    const isAdmin=members[uid]&&members[uid].role==="admin";
    return(
      <div className="wrap"><div className="page" style={{paddingTop:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <button onClick={()=>{setSelectedPlayers({});setActiveGroup(null);}} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",
            color:"rgba(255,255,255,.5)",borderRadius:9,padding:"6px 12px",cursor:"pointer",
            fontFamily:"'Righteous',sans-serif",fontSize:".72rem"}}>{T.backToGroups}</button>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.3rem",color:"var(--y)",letterSpacing:2}}>{activeGroup.name}</div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:2}}>
              {T.roomCapsInline||"CÓDIGO"}: {activeGroup.code} · {memberList.length} {T.grpMembersWord} · {onlineCount} online
            </div>
          </div>
          {/* Copy invite link */}
          <button onClick={()=>{
            const link="https://mysqldumpbd-afk.github.io/Flip7/?group="+activeGroup.code;
            if(navigator.share){navigator.share({title:activeGroup.name,text:T.grpShareText,url:link});}
            else{navigator.clipboard.writeText(link);setOk(T.grpLinkCopied);}
            snd("tap");
          }} style={{background:"rgba(46,196,182,.12)",border:"1px solid rgba(46,196,182,.3)",
            color:"var(--t)",borderRadius:9,padding:"6px 12px",cursor:"pointer",
            fontFamily:"'Righteous',sans-serif",fontSize:".62rem",flexShrink:0}}>
            {T.inviteBtn}
          </button>
          {isAdmin&&(
            confirmDeleteGroup ? (
              <div style={{display:"flex",gap:4,flexShrink:0,marginLeft:6}}>
                <button disabled={busyAction} onClick={()=>{snd("tap");deleteGroup();}}
                  style={{background:"var(--r)",border:"none",borderRadius:8,padding:"6px 9px",
                    cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                    color:"#fff",fontWeight:900,whiteSpace:"nowrap"}}>{T.confirmReq}</button>
                <button onClick={()=>setConfirmDeleteGroup(false)}
                  style={{background:"rgba(255,255,255,.08)",border:"none",borderRadius:8,padding:"6px 9px",
                    cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                    color:"rgba(255,255,255,.5)"}}>{T.cancel}</button>
              </div>
            ) : (
              <button onClick={()=>{snd("tap");setConfirmDeleteGroup(true);}}
                title={T.deleteGroupTitle}
                style={{background:"rgba(230,57,70,.1)",border:"1px solid rgba(230,57,70,.3)",
                  color:"var(--r)",borderRadius:9,width:34,height:32,cursor:"pointer",flexShrink:0,
                  marginLeft:6,fontSize:".85rem"}}>
                🗑
              </button>
            )
          )}
        </div>

        {/* Active room banner */}
        {hasActiveRoom&&(
          <div style={{background:"linear-gradient(135deg,rgba(59,178,115,.2),rgba(59,178,115,.08))",
            border:"2px solid rgba(59,178,115,.5)",borderRadius:14,padding:"12px 14px",marginBottom:12,
            display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:"1.5rem"}}>🎮</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"var(--gr)",letterSpacing:2}}>{T.gameInProgress}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.2rem",color:"#fff",letterSpacing:3}}>{activeGroup.currentRoom}</div>
            </div>
            <button onClick={()=>onJoinRoom(activeGroup.currentRoom)}
              style={{background:"var(--gr)",border:"none",borderRadius:10,padding:"8px 14px",
                cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:".82rem",color:"#fff"}}>
              {T.grpJoinArrow}
            </button>
          </div>
        )}

        {/* Members with presence */}
        <p className="sec">{T.membersLbl}</p>
        {/* Instrucción de selección */}
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
          color:"rgba(255,255,255,.3)",letterSpacing:1,marginBottom:8,textAlign:"center"}}>
          {T.tapToIncludeHint}
        </div>
        {memberList.map(m=>{
          const pres=presence[m.uid]||{};
          const isOnline=pres.online;
          const status=pres.status||"idle";
          const isMe=m.uid===uid;
          const isSel=selectedPlayers[m.uid]||false;
          return(
            <div key={m.uid}
              onClick={()=>{
                snd("tap");
                setSelectedPlayers(p=>({...p,[m.uid]:!p[m.uid]}));
              }}
              style={{display:"flex",alignItems:"center",gap:10,
                padding:"10px 12px",marginBottom:6,borderRadius:12,cursor:"pointer",
                background:isSel
                  ?"linear-gradient(135deg,rgba(59,178,115,.15),rgba(59,178,115,.08))"
                  :isMe?"rgba(245,200,0,.06)":"rgba(255,255,255,.03)",
                border:"2px solid "+(isSel?"rgba(59,178,115,.6)":isMe?"rgba(245,200,0,.2)":"rgba(255,255,255,.06)"),
                boxShadow:isSel?"0 0 12px rgba(59,178,115,.2)":"none",
                transition:"all .15s"}}>
              {/* Checkmark / Avatar */}
              <div style={{position:"relative",flexShrink:0}}>
                {m.photoURL
                  ? <img src={m.photoURL} style={{width:38,height:38,borderRadius:"50%",objectFit:"cover",
                      border:"2px solid "+(isSel?"var(--gr)":isOnline?"var(--gr)":"rgba(255,255,255,.1)")}} alt=""/>
                  : <div style={{width:38,height:38,borderRadius:"50%",
                      background:isSel?"rgba(59,178,115,.3)":isOnline?"rgba(59,178,115,.15)":"rgba(255,255,255,.08)",
                      border:"2px solid "+(isSel?"var(--gr)":isOnline?"var(--gr)":"rgba(255,255,255,.1)"),
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontFamily:"'Anton',sans-serif",fontSize:"1rem",
                      color:isSel?"var(--gr)":isOnline?"var(--gr)":"rgba(255,255,255,.3)"}}>
                      {(m.name||"?")[0].toUpperCase()}
                    </div>
                }
                {isSel&&<div style={{position:"absolute",top:-4,right:-4,
                  width:16,height:16,borderRadius:"50%",background:"var(--gr)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:"9px",color:"#fff",fontWeight:900}}>✓</div>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:900,fontSize:".88rem",
                  color:isSel?"var(--gr)":isMe?"var(--y)":"rgba(255,255,255,.85)"}}>
                  {m.name}
                  {isMe&&<span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                    color:"rgba(255,255,255,.3)",marginLeft:6,letterSpacing:1}}>{T.grpYouTag}</span>}
                </div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",letterSpacing:1,marginTop:2,
                  color:isOnline?(status==="in-game"?"var(--t)":"var(--gr)"):"rgba(255,255,255,.25)"}}>
                  {isOnline
                    ?(status==="in-game"?T.statusInGame:status==="in-lobby"?T.statusInLobby:T.statusOnline)
                    :(pres.lastSeen?"⚫ "+fmtAgo(pres.lastSeen,T):"⚫ "+T.statusOffline)}
                </div>
              </div>
              {m.role==="admin"&&<span style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                background:"rgba(245,200,0,.15)",border:"1px solid rgba(245,200,0,.3)",
                color:"var(--y)",padding:"2px 7px",borderRadius:20,letterSpacing:1}}>{T.adminLbl}</span>}
              {/* Tap hint for offline */}
              {!isOnline&&!isSel&&<span style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                color:"rgba(255,255,255,.15)",letterSpacing:1}}>{T.tapToIncludeShort}</span>}
              {/* Eliminar miembro — solo admin, no sobre uno mismo */}
              {isAdmin&&!isMe&&(
                confirmRemoveMember===m.uid ? (
                  <div onClick={e=>e.stopPropagation()} style={{display:"flex",gap:3,flexShrink:0}}>
                    <button disabled={busyAction} onClick={()=>{snd("tap");removeMember(m.uid);}}
                      style={{background:"var(--r)",border:"none",borderRadius:7,padding:"4px 7px",
                        cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                        color:"#fff",fontWeight:900,whiteSpace:"nowrap"}}>{T.yesLbl}</button>
                    <button onClick={()=>setConfirmRemoveMember(null)}
                      style={{background:"rgba(255,255,255,.08)",border:"none",borderRadius:7,padding:"4px 7px",
                        cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                        color:"rgba(255,255,255,.5)"}}>{T.noLbl}</button>
                  </div>
                ) : (
                  <button onClick={e=>{e.stopPropagation();snd("tap");setConfirmRemoveMember(m.uid);}}
                    title={T.deleteMemberTitle}
                    style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
                      color:"rgba(255,255,255,.35)",borderRadius:7,width:26,height:26,cursor:"pointer",
                      flexShrink:0,fontSize:".72rem"}}>🗑</button>
                )
              )}
            </div>
          );
        })}

        {/* JUGAR AHORA button — shows when players selected */}
        {Object.values(selectedPlayers).some(Boolean)&&(()=>{
          const selList=memberList.filter(m=>selectedPlayers[m.uid]);
          const count=selList.length;
          return(
            <div style={{position:"sticky",bottom:16,zIndex:10,marginTop:12}}>
              <button
                onClick={()=>{
                  snd("round");
                  // Build player list: selected members as {name,uid} —
                  // el uid deja que Home traiga su seudónimo/emoji/color
                  // guardado y asocie sus estadísticas a su cuenta real.
                  const names=selList.map(m=>({name:m.name||"?",uid:m.uid}));
                  onPlay({
                    names,
                    groupId:activeGroup.id,
                    groupName:activeGroup.name
                  });
                }}
                style={{
                  width:"100%",padding:"15px",
                  background:"linear-gradient(135deg,var(--gr),#1A9A6A)",
                  border:"none",borderRadius:14,cursor:"pointer",
                  fontFamily:"'Lilita One',sans-serif",fontSize:"1.1rem",
                  color:"#fff",letterSpacing:1,
                  boxShadow:"0 6px 24px rgba(59,178,115,.4)",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                  transition:"all .2s"
                }}>
                <span style={{fontSize:"1.3rem"}}>🎮</span>
                {T.grpPlayNow} · {count} {count!==1?T.grpPlayerWordPlural:T.grpPlayerWord}
                <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
                  background:"rgba(255,255,255,.2)",borderRadius:20,padding:"2px 8px",marginLeft:4}}>
                  {selList.map(m=>(m.name||"?")[0]).join(" · ")}
                </span>
              </button>
            </div>
          );
        })()}

        {/* Quick add from friends list */}
        {friends.length>0&&(()=>{
          const notInGroup=friends.filter(f=>!members[f.uid]);
          if(notInGroup.length===0)return null;
          return(<>
            <p className="sec" style={{marginTop:8}}>{T.addFriendsToGroup}</p>
            {notInGroup.map(f=>(
              <div key={f.uid} style={{display:"flex",alignItems:"center",gap:10,
                padding:"8px 12px",marginBottom:6,borderRadius:11,
                background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)"}}>
                <div style={{width:32,height:32,borderRadius:"50%",
                  background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.1)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'Anton',sans-serif",fontSize:".9rem",color:"rgba(255,255,255,.5)"}}>
                  {(f.name||"?")[0].toUpperCase()}
                </div>
                <div style={{flex:1,fontWeight:900,fontSize:".85rem",color:"rgba(255,255,255,.7)"}}>{f.name}</div>
                <button onClick={async()=>{
                  try{
                    await _db.ref("groups/"+activeGroup.id+"/members/"+f.uid).set({
                      name:f.name,email:f.email||"",photoURL:"",role:"member",joinedAt:Date.now()
                    });
                    // Índice inverso — sin esto, el amigo agregado nunca ve
                    // este grupo en SU propia lista (aunque sí aparezca aquí)
                    await _db.ref("users/"+f.uid+"/groups/"+activeGroup.id).set(true);
                    setOk("✅ "+T.grpMemberAdded.replace('{name}',f.name));
                    setActiveGroup(g=>({...g,members:{...g.members,[f.uid]:{name:f.name,role:"member"}}}));
                    snd("join");
                  }catch(e){setOk(T.grpAddErr);}
                }} style={{background:"rgba(46,196,182,.12)",border:"1px solid rgba(46,196,182,.3)",
                  color:"var(--t)",borderRadius:8,padding:"5px 12px",cursor:"pointer",
                  fontFamily:"'Righteous',sans-serif",fontSize:".65rem",flexShrink:0}}>
                  {T.addBtn}
                </button>
              </div>
            ))}
          </>);
        })()}
        {ok&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"var(--gr)",
          textAlign:"center",padding:"8px",marginTop:4}}>{ok}</div>}
        <div style={{height:8}}/>
        <button className="btn btn-g" onClick={()=>{setSelectedPlayers({});setActiveGroup(null);}}>{T.backToGroupsLong}</button>
      </div></div>
    );
  }

  return(
    <div className="wrap"><div className="page" style={{paddingTop:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",
          color:"rgba(255,255,255,.5)",borderRadius:9,padding:"6px 12px",cursor:"pointer",
          fontFamily:"'Righteous',sans-serif",fontSize:".72rem"}}>{T.back}</button>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--y)",letterSpacing:2}}>{T.groupsCapsTitle}</div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["my",T.tabMyGroups],["join",T.tabJoinGroup]].map(([id,lbl])=>(
          <button key={id} className={"nb "+(tab===id?"on":"")}
            onClick={()=>{snd("tap");setTab(id);setErr("");setOk("");}} style={{flex:1,padding:"9px 4px"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── MIS GRUPOS ── */}
      {tab==="my"&&(<>
        {loading
          ? <div style={{textAlign:"center",paddingTop:30,color:"rgba(255,255,255,.3)",
              fontFamily:"'Righteous',sans-serif",fontSize:".72rem",letterSpacing:2}}>{T.loadingCaps}</div>
          : myGroups.length===0
          ? <div style={{textAlign:"center",padding:"30px 20px"}}>
              <div style={{fontSize:"2.5rem",marginBottom:8}}>👥</div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".78rem",color:"rgba(255,255,255,.4)"}}>
                {T.noGroupsYet2}
              </div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",color:"rgba(255,255,255,.25)",marginTop:6,lineHeight:1.6}}>
                {T.createGroupHint}
              </div>
            </div>
          : myGroups.map(g=>{
              const members=g.members||{};
              const mList=Object.entries(members).map(([muid,m])=>({uid:muid,...m}));
              const onlineM=mList.filter(m=>presence[m.uid]&&presence[m.uid].online);
              const hasRoom=g.currentRoom;
              return(
                <div key={g.id} onClick={()=>{snd("tap");setSelectedPlayers({});setActiveGroup(g);}}
                  style={{background:"rgba(255,255,255,.04)",border:"2px solid rgba(255,255,255,.08)",
                    borderRadius:14,padding:"12px 14px",marginBottom:10,cursor:"pointer",
                    transition:"border-color .2s"}}
                  onMouseOver={e=>e.currentTarget.style.borderColor="rgba(245,200,0,.3)"}
                  onMouseOut={e=>e.currentTarget.style.borderColor="rgba(255,255,255,.08)"}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.1rem",
                        color:"var(--y)",letterSpacing:2}}>{g.name}</div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                        <span style={{fontFamily:"'Anton',sans-serif",fontSize:".9rem",
                          letterSpacing:4,color:"var(--y)",background:"rgba(245,200,0,.1)",
                          border:"1px solid rgba(245,200,0,.25)",borderRadius:6,
                          padding:"1px 7px"}}>{g.code}</span>
                        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                          color:"rgba(255,255,255,.3)",letterSpacing:1}}>{mList.length} {T.grpMembersWord}</span>
                      </div>
                    </div>
                    {hasRoom&&(
                      <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                        background:"rgba(59,178,115,.2)",border:"1px solid rgba(59,178,115,.4)",
                        color:"var(--gr)",padding:"3px 8px",borderRadius:20,letterSpacing:1}}>
                        {T.inGameTag}
                      </span>
                    )}
                    <span style={{color:"rgba(255,255,255,.2)",fontSize:"1.1rem"}}>›</span>
                  </div>
                  {/* Presence avatars */}
                  <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                    {mList.map(m=>{
                      const isOnline=presence[m.uid]&&presence[m.uid].online;
                      return(
                        <div key={m.uid} title={m.name+(isOnline?" · "+T.onlineWord:"")}
                          style={{width:28,height:28,borderRadius:"50%",
                            background:isOnline?"rgba(59,178,115,.25)":"rgba(255,255,255,.06)",
                            border:"2px solid "+(isOnline?"var(--gr)":"rgba(255,255,255,.1)"),
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontFamily:"'Anton',sans-serif",fontSize:".75rem",
                            color:isOnline?"var(--gr)":"rgba(255,255,255,.3)"}}>
                          {(m.name||"?")[0].toUpperCase()}
                        </div>
                      );
                    })}
                    {onlineM.length>0&&(
                      <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                        color:"var(--gr)",letterSpacing:1,marginLeft:4}}>
                        {onlineM.length} {T.onlineWord}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
        }

        {/* Create group */}
        {creating
          ? <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",
              borderRadius:12,padding:"14px",marginTop:10}}>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
                color:"rgba(255,255,255,.35)",letterSpacing:2,marginBottom:10}}>{T.groupNameLbl}</div>
              <input className="inp" placeholder={T.groupNamePlaceholder} value={newGroupName}
                onChange={e=>setNewGroupName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&createGroup()}
                style={{marginBottom:10}} autoFocus/>
              {err&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
                color:"var(--r)",marginBottom:8}}>{err}</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setCreating(false);setErr("");}} className="btn btn-g"
                  style={{flex:1,margin:0,padding:"11px"}}>{T.cancel}</button>
                <button onClick={createGroup} className="btn btn-y"
                  style={{flex:2,margin:0,padding:"11px"}}>{T.createGroupBtn}</button>
              </div>
            </div>
          : <button onClick={()=>{snd("tap");setCreating(true);setErr("");}}
              style={{width:"100%",background:"none",border:"2px dashed rgba(255,255,255,.12)",
                color:"rgba(255,255,255,.4)",borderRadius:12,padding:"12px",cursor:"pointer",
                fontFamily:"'Righteous',sans-serif",fontSize:".78rem",marginTop:10,
                transition:"all .2s"}}
              onMouseOver={e=>{e.target.style.borderColor="var(--y)";e.target.style.color="var(--y)";}}
              onMouseOut={e=>{e.target.style.borderColor="rgba(255,255,255,.12)";e.target.style.color="rgba(255,255,255,.4)";}}>
              {T.newGroupBtn}
            </button>
        }
        {ok&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"var(--gr)",
          textAlign:"center",padding:"10px"}}>{ok}</div>}
      </>)}

      {/* ── UNIRME ── */}
      {tab==="join"&&(
        <div style={{paddingTop:8}}>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
            color:"rgba(255,255,255,.35)",letterSpacing:2,marginBottom:10}}>{T.groupCodeLbl}</div>
          <input className="inp code-inp" style={{fontSize:"2.5rem",letterSpacing:8}}
            placeholder="XXXX" maxLength={4} value={joinCode}
            onChange={e=>setJoinCode(e.target.value.toUpperCase())}/>
          {err&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
            color:"var(--r)",marginBottom:10}}>{err}</div>}
          {ok&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
            color:"var(--gr)",marginBottom:10}}>{ok}</div>}
          <button className="btn btn-y" onClick={joinGroup}
            disabled={joinCode.length<4}>
            {T.joinGroupBtn}
          </button>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
            color:"rgba(255,255,255,.25)",textAlign:"center",marginTop:8,lineHeight:1.6}}>
            {T.askGroupCode}
          </div>
        </div>
      )}
    </div></div>
  );
}

// ── PERSONALDASHBOARD — stats del jugador + amigos ────────────
// Mapa de calor de días jugados — mes navegable, intensidad según
// cuántas partidas jugaste ese día. Puro adorno/vanidad, pero le da
// contexto visual al historial.
function GameCalendarHeatmap({games,T}){
  T=T||LANGS.es;
  // Colapsado por defecto cada vez que se entra al historial (el
  // componente se desmonta al salir del tab, así que este estado
  // siempre vuelve a arrancar en false al volver a entrar).
  const[open,setOpen]=React.useState(false);
  const[monthOffset,setMonthOffset]=React.useState(0);
  const now=new Date();
  const viewDate=new Date(now.getFullYear(),now.getMonth()+monthOffset,1);
  const year=viewDate.getFullYear(),month=viewDate.getMonth();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const firstDayOfWeek=new Date(year,month,1).getDay();

  const countByDay={};
  games.forEach(g=>{
    const d=new Date(g.date);
    if(d.getFullYear()===year&&d.getMonth()===month){
      countByDay[d.getDate()]=(countByDay[d.getDate()]||0)+1;
    }
  });
  const maxCount=Math.max(1,...Object.values(countByDay));
  const monthName=viewDate.toLocaleDateString(T.locale,{month:"long",year:"numeric"});
  const cells=[];
  for(let i=0;i<firstDayOfWeek;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  const colorFor=count=>count?"rgba(245,200,0,"+(0.25+(count/maxCount)*0.65)+")":"rgba(255,255,255,.04)";
  const gamesThisMonth=Object.values(countByDay).reduce((a,b)=>a+b,0);

  return(
    <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",
      borderRadius:13,padding:"12px 13px",marginBottom:14}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",background:"none",border:"none",
        cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:open?10:0}}>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",
          color:"rgba(255,255,255,.6)",letterSpacing:1,display:"flex",alignItems:"center",gap:6}}>
          {T.calendarLbl}
          {!open&&gamesThisMonth>0&&
            <span style={{color:"var(--y)"}}>· {gamesThisMonth} {T.thisMonthSuffix}</span>}
        </span>
        <span style={{color:"rgba(255,255,255,.35)",fontSize:".8rem",
          transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>
      </button>
      {open&&(<>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <button onClick={()=>setMonthOffset(m=>m-1)} style={{background:"none",border:"none",
          color:"rgba(255,255,255,.4)",fontSize:"1rem",cursor:"pointer",padding:"2px 10px"}}>‹</button>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
          color:"rgba(255,255,255,.6)",letterSpacing:1,textTransform:"capitalize"}}>{monthName}</span>
        <button onClick={()=>setMonthOffset(m=>Math.min(0,m+1))} disabled={monthOffset>=0}
          style={{background:"none",border:"none",
            color:monthOffset>=0?"rgba(255,255,255,.15)":"rgba(255,255,255,.4)",
            fontSize:"1rem",cursor:monthOffset>=0?"default":"pointer",padding:"2px 10px"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
        {T.weekdayLetters.map((d,i)=>(
          <div key={i} style={{textAlign:"center",fontFamily:"'Righteous',sans-serif",
            fontSize:".52rem",color:"rgba(255,255,255,.3)"}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {cells.map((d,i)=>{
          const count=d?(countByDay[d]||0):0;
          const isToday=d&&monthOffset===0&&d===now.getDate();
          return(
            <div key={i} title={d&&count>0?count+" "+(count!==1?T.gameWordPlural:T.gameWord):""}
              style={{aspectRatio:"1",borderRadius:6,
                background:d?colorFor(count):"transparent",
                border:isToday?"1.5px solid var(--y)":"1px solid rgba(255,255,255,.03)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                color:count>0?"#fff":"rgba(255,255,255,.2)"}}>
              {d||""}
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:10,justifyContent:"flex-end"}}>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".5rem",color:"rgba(255,255,255,.25)"}}>{T.lessLbl}</span>
        {[0,.3,.5,.7,.9].map((o,i)=>(
          <div key={i} style={{width:9,height:9,borderRadius:3,
            background:i===0?"rgba(255,255,255,.04)":"rgba(245,200,0,"+o+")"}}/>
        ))}
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".5rem",color:"rgba(255,255,255,.25)"}}>{T.moreLbl}</span>
      </div>
      </>)}
    </div>
  );
}

// Hook de conteo animado — interpola de un valor a otro en vez de saltar,
// para que los puntajes "crezcan" visualmente en vez de cambiar de golpe.
function useCountUp(value,duration=600){
  const[display,setDisplay]=React.useState(value);
  const prevRef=React.useRef(value);
  React.useEffect(()=>{
    const start=prevRef.current,end=value;
    if(start===end)return;
    const startTime=performance.now();
    let raf;
    function tick(now){
      const t=Math.min(1,(now-startTime)/duration);
      const eased=1-Math.pow(1-t,3);
      setDisplay(Math.round(start+(end-start)*eased));
      if(t<1)raf=requestAnimationFrame(tick);
      else prevRef.current=end;
    }
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[value]);
  return display;
}
function AnimatedScore({value,className,style}){
  const display=useCountUp(value);
  return <div className={className} style={style}>{display}</div>;
}

// Comparativa cabeza a cabeza — cruza TUS partidas con las del amigo por
// gameId compartido (si ambos tienen un registro con el mismo gameId,
// jugaron juntos). No hace falta leer stats/games completo para esto.
function HeadToHead({myUid,friendUid,friendName,T}){
  T=T||LANGS.es;
  const[data,setData]=React.useState(null); // null=cargando
  React.useEffect(()=>{
    if(!myUid||!friendUid)return;
    let cancelled=false;
    Promise.all([
      _db.ref("stats/players/"+myUid+"/games").once("value"),
      _db.ref("stats/players/"+friendUid+"/games").once("value")
    ]).then(([mySnap,fSnap])=>{
      if(cancelled)return;
      const myGamesData=mySnap.val()||{};
      const fGamesData=fSnap.val()||{};
      const commonIds=Object.keys(myGamesData).filter(gid=>fGamesData[gid]);
      const rows=commonIds.map(gid=>({
        gameId:gid,date:myGamesData[gid].date,
        myScore:myGamesData[gid].total,myPos:myGamesData[gid].position,
        theirScore:fGamesData[gid].total,theirPos:fGamesData[gid].position
      })).sort((a,b)=>b.date-a.date);
      setData(rows);
    }).catch(()=>{if(!cancelled)setData([]);});
    return()=>{cancelled=true;};
  },[myUid,friendUid]);

  if(data===null)return(
    <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
      color:"rgba(255,255,255,.25)",padding:"10px 14px",background:"rgba(46,196,182,.07)",
      border:"1px solid rgba(46,196,182,.3)",borderTop:"none",
      borderRadius:"0 0 13px 13px",marginTop:-1}}>{T.comparingLbl}</div>
  );
  if(data.length===0)return(
    <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
      color:"rgba(255,255,255,.3)",padding:"10px 14px",background:"rgba(46,196,182,.07)",
      border:"1px solid rgba(46,196,182,.3)",borderTop:"none",
      borderRadius:"0 0 13px 13px",marginTop:-1}}>
      {T.neverPlayedTogether}
    </div>
  );

  const myWins=data.filter(r=>r.myPos<r.theirPos).length;
  const theirWins=data.filter(r=>r.theirPos<r.myPos).length;

  return(
    <div style={{background:"rgba(46,196,182,.07)",border:"1px solid rgba(46,196,182,.3)",
      borderTop:"none",borderRadius:"0 0 13px 13px",padding:"10px 14px",marginTop:-1}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:8}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--t)"}}>{myWins}</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",color:"rgba(255,255,255,.35)"}}>{T.youAllCaps}</div>
        </div>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",color:"rgba(255,255,255,.25)"}}>{T.vsLbl}</div>
        <div style={{textAlign:"center"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--y)"}}>{theirWins}</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",color:"rgba(255,255,255,.35)"}}>{(friendName||"").toUpperCase().slice(0,10)}</div>
        </div>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"rgba(255,255,255,.25)",marginLeft:6}}>
          {data.length} {data.length!==1?T.gameWordPlural:T.gameWord} {T.togetherSuffix}
        </div>
      </div>
      {/* Encabezados — antes las columnas de la lista no decían qué se
          está comparando (¿puntaje? ¿posición?). Aquí queda explícito:
          fecha de la partida vs. la POSICIÓN de cada quien en esa ronda,
          mismo lenguaje que la pestaña Tabla. */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0 6px",
        borderBottom:"1px solid rgba(255,255,255,.1)",marginBottom:2}}>
        <span style={{flex:1,fontFamily:"'Righteous',sans-serif",fontSize:".52rem",
          color:"rgba(255,255,255,.3)",letterSpacing:1,textTransform:"uppercase"}}>{T.dateColLbl}</span>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".52rem",color:"var(--gr)",
          letterSpacing:1,textTransform:"uppercase",minWidth:26,textAlign:"center"}}>{T.youCol}</span>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".48rem",color:"rgba(255,255,255,.2)"}}>{T.posAbbrev}</span>
        <span style={{fontFamily:"'Righteous',sans-serif",fontSize:".52rem",color:"var(--y)",
          letterSpacing:1,textTransform:"uppercase",minWidth:26,textAlign:"center"}}>{(friendName||"").toUpperCase().slice(0,8)}</span>
      </div>
      {data.slice(0,5).map(r=>(
        <div key={r.gameId} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",fontSize:".68rem"}}>
          <span style={{flex:1,color:"rgba(255,255,255,.4)"}}>{fmtAgo(r.date,T)}</span>
          <span style={{minWidth:26,textAlign:"center",color:r.myPos<r.theirPos?"var(--gr)":"rgba(255,255,255,.4)",fontWeight:900}}>#{r.myPos}</span>
          <span style={{color:"rgba(255,255,255,.2)"}}>–</span>
          <span style={{minWidth:26,textAlign:"center",color:r.theirPos<r.myPos?"var(--y)":"rgba(255,255,255,.4)",fontWeight:900}}>#{r.theirPos}</span>
        </div>
      ))}
    </div>
  );
}

// Carga bajo demanda el resto de jugadores de una partida (solo cuando se
// expande la tarjeta) — el historial individual solo guarda tu propia
// fila, así que para ver a los demás hay que consultar stats/games/{id}.
// ── GAMEROUNDSTABLE — tabla horizontal Jugador × Ronda para el detalle de
// una partida en el historial personal. Antes esto mostraba solo TUS
// puntos por ronda en una lista vertical, y a los demás jugadores solo su
// total final ("también jugaron"). El registro guardado en
// stats/games/{gameId} ya trae el rounds[] completo de TODOS los
// jugadores, así que arma la misma tabla horizontal que se ve en vivo en
// la pestaña Tabla — con ícono de Flip 7, modificadores y meta incluidos.
function GameRoundsTable({gameId,highlightId,T}){
  T=T||LANGS.es;
  const[players,setPlayers]=React.useState(null); // null=cargando
  const[winTarget,setWinTarget]=React.useState(null);
  React.useEffect(()=>{
    if(!gameId)return;
    let cancelled=false;
    _db.ref("stats/games/"+gameId).once("value").then(snap=>{
      if(cancelled)return;
      const data=snap.val();
      setPlayers((data&&data.players)||[]);
      setWinTarget((data&&data.winTarget)||null);
    }).catch(()=>{if(!cancelled)setPlayers([]);});
    return()=>{cancelled=true;};
  },[gameId]);

  if(players===null)return(
    <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
      color:"rgba(255,255,255,.25)",marginTop:10}}>{T.loadingRoundsTable}</div>
  );
  if(players.length===0)return null;

  const sorted=[...players].sort((a,b)=>b.total-a.total);
  const maxRounds=Math.max(0,...sorted.map(p=>(p.rounds||[]).length));

  return(
    <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid rgba(255,255,255,.08)"}}>
      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
        color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:8}}>{T.rounds2}</div>
      <div className="tw">
        <table>
          <thead><tr><th>{T.colPlayer}</th>{Array.from({length:maxRounds},(_,i)=><th key={i}>R{i+1}</th>)}<th>{T.colTotal}</th></tr></thead>
          <tbody>
            {sorted.map((p,ri)=>{
              const isMe=highlightId&&p.id===highlightId;
              return(
              <tr key={p.id||ri} className={isMe||(!highlightId&&ri===0)?"lr":""}>
                <td>
                  <span style={{color:p.color}}><Ava v={p.emoji}/></span>{" "}
                  <span style={{color:p.color,fontWeight:isMe?900:undefined}}>{p.name}</span>
                  {isMe&&<span style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                    color:"var(--y)",marginLeft:4}}>{T.grpYouTag}</span>}
                </td>
                {(p.rounds||[]).map((r,i)=>{
                  var hasFlip=r.breakdown&&r.breakdown.flip7;
                  var hasMod=r.breakdown&&(r.breakdown.multiplier||r.breakdown.divTwo||(r.breakdown.negMods&&r.breakdown.negMods.length>0)||(r.breakdown.plusCards&&r.breakdown.plusCards.length>0));
                  return(<td key={i}
                    className={r.score===0?"rz":""}
                    style={{position:"relative",minWidth:36}}
                    title={r.breakdown&&r.breakdown.cards&&r.breakdown.cards.length>0
                      ?"["+r.breakdown.cards.slice().sort((a,b)=>a-b).join(",")+"]"+(hasFlip?" +15🃏":"")+(r.breakdown.multiplier?" x"+r.breakdown.multiplier:"")+(r.breakdown.divTwo?" /2":"")+(r.breakdown.negMods&&r.breakdown.negMods.length>0?" "+r.breakdown.negMods.join(""):""): ""}>
                    {r.score===0?"💀":(r.score>0?"+":"")+r.score}
                  </td>);
                })}
                {Array.from({length:maxRounds-(p.rounds||[]).length},(_,i)=><td key={"e"+i}></td>)}
                <td className="tc">{p.total}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {winTarget&&(
        <p style={{textAlign:"center",color:"var(--y)",fontFamily:"'Anton',sans-serif",
          fontSize:".85rem",letterSpacing:2,marginTop:8,textShadow:"0 0 10px rgba(245,200,0,.3)"}}>
          {T.goalTargetPts.replace('{n}',winTarget)}
        </p>
      )}
    </div>
  );
}

function PersonalDashboard({authUser, onBack, T, initialTab, mode}){
  const dashMode=mode||(initialTab==="friends"?"friends":"stats");
  const[tab,setTab]=React.useState(dashMode==="friends"?"friends":(initialTab||"me"));
  const[myStats,setMyStats]=React.useState(null);
  const[myGames,setMyGames]=React.useState([]);
  const[friends,setFriends]=React.useState([]);
  const[friendsStats,setFriendsStats]=React.useState({});
  const[friendRequests,setFriendRequests]=React.useState([]); // solicitudes entrantes pendientes
  const[loading,setLoading]=React.useState(true);
  const[addInput,setAddInput]=React.useState("");
  const[addErr,setAddErr]=React.useState("");
  const[addOk,setAddOk]=React.useState("");
  const[suggestions,setSuggestions]=React.useState([]);
  const[searching,setSearching]=React.useState(false);
  const[confirmRemove,setConfirmRemove]=React.useState(null); // uid pendiente de confirmar
  const[h2hOpen,setH2hOpen]=React.useState(null); // uid de amigo con comparativa abierta
  const[expandedGame,setExpandedGame]=React.useState(null); // gameId de la partida desplegada
  const[friendPresence,setFriendPresence]=React.useState({}); // {uid:{online,lastSeen}}

  const isAnon=authUser&&authUser.isAnonymous;
  const uid=authUser&&authUser.uid;

  React.useEffect(()=>{
    if(!uid)return;
    async function load(){
      setLoading(true);
      try{
        // Load personal stats — ahora la clave ES tu uid directamente,
        // ya no hace falta la consulta indexada por summary/uid
        const pSnap=await _db.ref("stats/players/"+uid).once("value");
        const pData=pSnap.val();
        if(pData){
          setMyStats(pData.summary||null);
          const gSnap=await _db.ref("stats/players/"+uid+"/games")
            .orderByChild("date").limitToLast(20).once("value");
          const gData=gSnap.val()||{};
          setMyGames(Object.values(gData).sort((a,b)=>b.date-a.date));
        }
        // Load friends
        const fSnap=await _db.ref("users/"+uid+"/friends").once("value");
        const fData=fSnap.val()||{};
        const fList=Object.values(fData);
        setFriends(fList);
        // Load friends stats — antes usaba f.pKey, que en realidad NUNCA
        // se guardaba en el perfil (users/{uid}.pKey no existía en ningún
        // lado), así que esto siempre fallaba en silencio y mostraba "sin
        // partidas aún" incluso a amigos que sí habían jugado. Ahora la
        // clave de stats ES el uid, así que se lee directo, sin depender
        // de ese campo roto.
        const fStats={};
        for(const f of fList){
          if(f.uid){
            const fs=await _db.ref("stats/players/"+f.uid+"/summary").once("value");
            if(fs.val())fStats[f.uid]=fs.val();
          }
        }
        setFriendsStats(fStats);
      }catch(e){console.log("Personal stats error:",e);}
      setLoading(false);
    }
    load();
  },[uid]);

  // Presencia global de amigos (en línea/offline) — independiente de si
  // comparten grupo. Se suscribe en vivo al nodo /presence/_global.
  React.useEffect(()=>{
    if(!uid)return;
    const ref=_db.ref("presence/_global");
    const handler=snap=>setFriendPresence(snap.val()||{});
    ref.on("value",handler);
    return()=>ref.off("value",handler);
  },[uid]);

  // Solicitudes de amistad entrantes — en vivo
  React.useEffect(()=>{
    if(!uid)return;
    const ref=_db.ref("users/"+uid+"/friendRequests");
    const handler=snap=>{
      const data=snap.val()||{};
      setFriendRequests(Object.entries(data).map(([fromUid,d])=>({fromUid,...d})));
    };
    ref.on("value",handler);
    return()=>ref.off("value",handler);
  },[uid]);

  // Búsqueda en vivo por prefijo mientras escribes — consulta un rango de
  // claves en /userIndex (no todo /users) y arma la lista de sugerencias.
  React.useEffect(()=>{
    const q=addInput.trim().toLowerCase();
    if(q.length<2){setSuggestions([]);return;}
    let cancelled=false;
    setSearching(true);
    const key=fbKey(q);
    const t=setTimeout(async()=>{
      try{
        const snap=await _db.ref("userIndex")
          .orderByKey().startAt(key).endAt(key+"\uf8ff")
          .limitToFirst(8).once("value");
        if(cancelled)return;
        const data=snap.val()||{};
        // Deduplicar por uid (una persona puede tener 2 claves: nombre y email)
        const seen=new Set();
        const list=[];
        for(const entry of Object.values(data)){
          if(!entry||!entry.uid||entry.uid===uid||seen.has(entry.uid))continue;
          seen.add(entry.uid);
          if(friends.some(f=>f.uid===entry.uid))continue; // ya es amigo
          list.push(entry);
        }
        setSuggestions(list);
      }catch(e){ console.warn("search error:",e.message); }
      if(!cancelled)setSearching(false);
    },300); // debounce
    return()=>{cancelled=true;clearTimeout(t);};
  },[addInput,uid,friends]);

  async function sendFriendRequest(found){
    setAddErr("");setAddOk("");
    try{
      // Ya son amigos — no hace falta nada
      if(friends.some(f=>f.uid===found.uid)){setAddErr(T.alreadyFriends);return;}
      // Ya le enviaste una solicitud — evita spam de solicitudes repetidas
      const sentCheck=await _db.ref("users/"+uid+"/sentRequests/"+found.uid).once("value");
      if(sentCheck.exists()){setAddErr(T.requestAlreadySent);return;}
      const meSnap=await _db.ref("users/"+uid).once("value");
      const me=meSnap.val()||{};
      const myName=me.displayName||me.email||"?";
      await _db.ref().update({
        ["users/"+found.uid+"/friendRequests/"+uid]:{uid,name:myName,email:me.email||"",at:Date.now()},
        ["users/"+uid+"/sentRequests/"+found.uid]:{uid:found.uid,name:found.name,at:Date.now()}
      });
      setAddOk(T.requestSentMsg.replace('{name}',found.name));
      setAddInput("");
      setSuggestions([]);
    }catch(e){setAddErr(T.errorPrefixLbl+" "+e.message);}
  }

  // Aceptar una solicitud entrante — recién ahí se crea la amistad
  // bidireccional (antes era instantáneo al agregar).
  async function acceptFriendRequest(fromUid,fromData){
    try{
      const meSnap=await _db.ref("users/"+uid).once("value");
      const me=meSnap.val()||{};
      await _db.ref().update({
        ["users/"+uid+"/friends/"+fromUid]:{uid:fromUid,name:fromData.name,email:fromData.email||"",addedAt:Date.now()},
        ["users/"+fromUid+"/friends/"+uid]:{uid,name:me.displayName||me.email||"?",email:me.email||"",addedAt:Date.now()},
        ["users/"+uid+"/friendRequests/"+fromUid]:null
      });
      setFriends(prev=>[...prev,{uid:fromUid,name:fromData.name,email:fromData.email||""}]);
      snd("join");
    }catch(e){console.log("Error al aceptar:",e.message);}
  }
  async function declineFriendRequest(fromUid){
    try{ await _db.ref("users/"+uid+"/friendRequests/"+fromUid).remove(); snd("tap"); }
    catch(e){}
  }

  // Eliminar amistad (bidireccional). NO toca /stats — el historial de
  // partidas vive independiente en /stats/players/{pKey}, así que cada
  // quien conserva sus partidas jugadas aunque ya no sean amigos.
  async function removeFriend(friendUid){
    setAddErr("");setAddOk("");
    try{
      await _db.ref("users/"+uid+"/friends/"+friendUid).remove();
      await _db.ref("users/"+friendUid+"/friends/"+uid).remove();
      setFriends(prev=>prev.filter(f=>f.uid!==friendUid));
      setConfirmRemove(null);
    }catch(e){setAddErr(T.errRemoveFriendPrefix+' '+e.message);}
  }

  const fmtD=ts=>new Date(ts).toLocaleDateString(T.locale,{day:"numeric",month:"short"})+" · "+new Date(ts).toLocaleTimeString(T.locale,{hour:"2-digit",minute:"2-digit"});
  const winRate=myStats&&myStats.games>0?Math.round((myStats.wins/myStats.games)*100):0;
  const avgScore=myStats&&myStats.games>0?Math.round((myStats.totalScore||0)/myStats.games):0;

  // ── KPIs nuevos — todos derivados de myGames, ya guardado, sin pedir
  // nada extra a Firebase. Se recalculan solo cuando cambian tus partidas.
  const kpis=React.useMemo(()=>{
    if(!myGames||myGames.length===0)return null;
    // Orden cronológico (más antigua primero) para calcular rachas bien
    const chron=[...myGames].sort((a,b)=>a.date-b.date);

    // Racha actual: cuenta desde la partida MÁS RECIENTE hacia atrás,
    // mientras el resultado (victoria/derrota) se mantenga igual
    let currentStreak=0,currentType=null;
    for(let i=chron.length-1;i>=0;i--){
      const isWin=chron[i].won;
      if(currentType===null){currentType=isWin;currentStreak=1;}
      else if(isWin===currentType)currentStreak++;
      else break;
    }
    // Racha récord: la corrida de victorias consecutivas más larga de tu historia
    let bestStreak=0,run=0;
    chron.forEach(g=>{ if(g.won){run++;bestStreak=Math.max(bestStreak,run);} else run=0; });

    // Agresividad: promedio de cartas que arriesgas por ronda (solo rondas
    // capturadas con cartas — scan o selección manual, no "cero" directo)
    let totalCards=0,roundsWithCards=0,totalRoundsPlayed=0;
    const cardFreq={}; // qué tan seguido juegas cada número
    chron.forEach(g=>(g.rounds||[]).forEach(r=>{
      totalRoundsPlayed++;
      if(r.breakdown&&Array.isArray(r.breakdown.cards)&&r.breakdown.cards.length>0){
        totalCards+=r.breakdown.cards.length;roundsWithCards++;
        r.breakdown.cards.forEach(c=>{cardFreq[c]=(cardFreq[c]||0)+1;});
      }
    }));
    const aggressiveness=roundsWithCards>0?(totalCards/roundsWithCards):0;
    let luckyCard=null,luckyCount=0;
    Object.entries(cardFreq).forEach(([c,n])=>{if(n>luckyCount){luckyCard=c;luckyCount=n;}});

    // Comeback: partidas donde tu ronda 1 fue un bust (0 pts) y aun así ganaste
    const comebacks=chron.filter(g=>g.won&&g.rounds&&g.rounds[0]&&g.rounds[0].score===0).length;

    // Peor racha de busts SEGUIDOS dentro de una misma partida (mala suerte
    // concentrada, no repartida en varias partidas distintas)
    let worstBustStreak=0;
    chron.forEach(g=>{
      let run=0;
      (g.rounds||[]).forEach(r=>{
        if(r.score===0){run++;worstBustStreak=Math.max(worstBustStreak,run);}
        else run=0;
      });
    });

    // Clásico vs Venganza — solo cuenta partidas que ya tienen el campo
    // (partidas jugadas antes de este cambio no lo tienen, se ignoran)
    const withMode=chron.filter(g=>g.gameMode);
    const classicG=withMode.filter(g=>g.gameMode==="classic");
    const vengG=withMode.filter(g=>g.gameMode!=="classic");
    const modeStats=(list)=>list.length===0?null:{
      games:list.length,winRate:Math.round((list.filter(g=>g.won).length/list.length)*100)
    };

    return{
      currentStreak,currentType,bestStreak,
      aggressiveness:aggressiveness.toFixed(1),
      luckyCard,luckyCount,
      comebacks,worstBustStreak,
      classic:modeStats(classicG),
      venganza:modeStats(vengG)
    };
  },[myGames]);

  return(
    <div className="wrap"><div className="page" style={{paddingTop:16}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",
          color:"rgba(255,255,255,.5)",borderRadius:9,padding:"6px 12px",cursor:"pointer",
          fontFamily:"'Righteous',sans-serif",fontSize:".72rem"}}>{T.back}</button>
        <div style={{flex:1,textAlign:"center"}}>
          {authUser.photoURL
            ? <img src={authUser.photoURL} style={{width:48,height:48,borderRadius:"50%",objectFit:"cover",border:"2px solid var(--y)"}} alt=""/>
            : <div style={{width:48,height:48,borderRadius:"50%",background:"var(--y)",
                display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",
                fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--dark)"}}>
                {(authUser.displayName||authUser.email||"?")[0].toUpperCase()}
              </div>
          }
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.2rem",color:"var(--y)",
            letterSpacing:2,marginTop:4}}>
            {authUser.displayName||(authUser.email||"").split("@")[0]||T.colPlayer}
          </div>
          {authUser.email&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
            color:"rgba(255,255,255,.3)",letterSpacing:1}}>{authUser.email}</div>}
        </div>
        <div style={{width:60}}/>
      </div>

      {/* Tabs — separadas por contexto: Estadísticas (Yo+Historial) vs Amigos (aparte) */}
      {dashMode!=="friends"&&(
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["me",T.tabMe],["history",T.tabHistory]].map(([id,lbl])=>(
            <button key={id} className={"nb "+(tab===id?"on":"")}
              onClick={()=>{snd("tap");setTab(id);}} style={{flex:1,padding:"9px 4px",fontSize:".65rem"}}>
              {lbl}
            </button>
          ))}
        </div>
      )}

      {loading&&<div style={{textAlign:"center",paddingTop:30,color:"rgba(255,255,255,.3)",
        fontFamily:"'Righteous',sans-serif",fontSize:".75rem",letterSpacing:2}}>{T.loadingCaps}</div>}

      {/* ── TAB: YO ── */}
      {!loading&&tab==="me"&&(
        isAnon
        ? <div style={{textAlign:"center",padding:"30px 20px"}}>
            <div style={{fontSize:"3rem",marginBottom:10}}>👤</div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".85rem",
              color:"rgba(255,255,255,.5)",marginBottom:6}}>{T.guestModeLbl}</div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
              color:"rgba(255,255,255,.3)",lineHeight:1.6}}>
              {T.createAccountStatsHint}
            </div>
            <button onClick={()=>signOut()} className="btn btn-y" style={{marginTop:20,maxWidth:280}}>
              {T.createAccountLoginBtn}
            </button>
          </div>
        : !myStats
        ? <div style={{textAlign:"center",padding:"30px 20px"}}>
            <div style={{fontSize:"2.5rem",marginBottom:8}}>🎴</div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".78rem",
              color:"rgba(255,255,255,.4)"}}>{T.noGamesYetLong}</div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
              color:"rgba(255,255,255,.25)",marginTop:6}}>{T.playFirstGameHint}</div>
          </div>
        : <>
          {/* Stats grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {[
              ["🏆",T.statLblWins,myStats.wins||0,"var(--y)"],
              ["🎮",T.statLblGames,myStats.games||0,"var(--t)"],
              ["⭐",T.statLblBestScore,myStats.bestScore||0,"var(--y)"],
              ["📊",T.statLblAvgGame,avgScore,"rgba(255,255,255,.6)"],
              ["🃏",T.statLblFlip7s,myStats.flip7Count||0,"var(--y)"],
              ["💀",T.statLblBusts,myStats.bustCount||0,"var(--r)"],
            ].map(([ico,lbl,val,clr])=>(
              <div key={lbl} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",
                borderRadius:13,padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontSize:"1.3rem",marginBottom:3}}>{ico}</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.8rem",color:clr,lineHeight:1}}>{val}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                  color:"rgba(255,255,255,.3)",letterSpacing:2,marginTop:3,textTransform:"uppercase"}}>{lbl}</div>
              </div>
            ))}
          </div>
          {/* Win rate bar */}
          <div style={{background:"rgba(245,200,0,.08)",border:"1px solid rgba(245,200,0,.2)",
            borderRadius:12,padding:"12px 14px",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".68rem",
                color:"rgba(255,255,255,.5)",letterSpacing:2}}>{T.winRateLbl}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.2rem",color:"var(--y)"}}>{winRate}%</div>
            </div>
            <div style={{height:6,background:"rgba(255,255,255,.08)",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:winRate+"%",background:"linear-gradient(90deg,var(--y),var(--or))",
                borderRadius:3,transition:"width 1s"}}/>
            </div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
              color:"rgba(255,255,255,.3)",marginTop:6,letterSpacing:1}}>
              {T.winLossLine.replace('{w}',myStats.wins||0).replace('{l}',(myStats.games||0)-(myStats.wins||0))}
            </div>
          </div>
          {/* Flip 7 vs Bust ratio */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            <div style={{background:"rgba(245,200,0,.06)",border:"1px solid rgba(245,200,0,.15)",
              borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:4}}>{T.flip7PerGame}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.6rem",color:"var(--y)"}}>
                {myStats.games>0?((myStats.flip7Count||0)/myStats.games).toFixed(1):0}
              </div>
            </div>
            <div style={{background:"rgba(230,57,70,.06)",border:"1px solid rgba(230,57,70,.15)",
              borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:4}}>{T.bustPerGame}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.6rem",color:"var(--r)"}}>
                {myStats.games>0?((myStats.bustCount||0)/myStats.games).toFixed(1):0}
              </div>
            </div>
          </div>

          {/* ── KPIs nuevos ── */}
          {kpis&&(<>
            {/* Racha actual + récord */}
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <div style={{flex:1,background:kpis.currentType?"rgba(59,178,115,.1)":"rgba(230,57,70,.08)",
                border:"1px solid "+(kpis.currentType?"rgba(59,178,115,.3)":"rgba(230,57,70,.25)"),
                borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:"1.3rem"}}>{kpis.currentType?"🔥":"🧊"}</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",
                  color:kpis.currentType?"var(--gr)":"var(--r)"}}>{kpis.currentStreak}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                  color:"rgba(255,255,255,.3)",letterSpacing:1}}>
                  {kpis.currentType?T.winStreakCaps:T.lossStreakCaps}
                </div>
              </div>
              <div style={{flex:1,background:"rgba(245,200,0,.08)",border:"1px solid rgba(245,200,0,.2)",
                borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:"1.3rem"}}>👑</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--y)"}}>{kpis.bestStreak}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                  color:"rgba(255,255,255,.3)",letterSpacing:1}}>{T.bestStreak}</div>
              </div>
            </div>

            {/* Agresividad + carta de la suerte */}
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <div style={{flex:1,background:"rgba(46,196,182,.08)",border:"1px solid rgba(46,196,182,.2)",
                borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:"1.3rem"}}>⚡</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--t)"}}>{kpis.aggressiveness}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                  color:"rgba(255,255,255,.3)",letterSpacing:1}}>{T.cardsPerRound}</div>
              </div>
              <div style={{flex:1,background:"rgba(245,200,0,.08)",border:"1px solid rgba(245,200,0,.2)",
                borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                <div style={{fontSize:"1.3rem"}}>🍀</div>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--y)"}}>
                  {kpis.luckyCard!==null?kpis.luckyCard:"—"}
                </div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                  color:"rgba(255,255,255,.3)",letterSpacing:1}}>{T.luckyCard}</div>
              </div>
            </div>

            {/* Comebacks + peor racha de busts — mismo patrón vertical que arriba */}
            {(kpis.comebacks>0||kpis.worstBustStreak>=2)&&(
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                {kpis.comebacks>0&&(
                  <div style={{flex:1,background:"rgba(123,45,139,.08)",border:"1px solid rgba(123,45,139,.25)",
                    borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                    <div style={{fontSize:"1.3rem"}}>🎬</div>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"#cc88ff"}}>{kpis.comebacks}</div>
                    <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                      color:"rgba(255,255,255,.3)",letterSpacing:1}}>{kpis.comebacks!==1?T.comebackWordPlural:T.comebackWord}</div>
                  </div>
                )}
                {kpis.worstBustStreak>=2&&(
                  <div style={{flex:1,background:"rgba(230,57,70,.08)",border:"1px solid rgba(230,57,70,.25)",
                    borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                    <div style={{fontSize:"1.3rem"}}>☠️</div>
                    <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--r)"}}>{kpis.worstBustStreak}</div>
                    <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                      color:"rgba(255,255,255,.3)",letterSpacing:1}}>{T.bustsInARow}</div>
                  </div>
                )}
              </div>
            )}

            {/* Clásico vs Venganza — mismo patrón vertical */}
            {(kpis.classic||kpis.venganza)&&(
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <div style={{flex:1,background:"rgba(245,200,0,.08)",border:"1px solid rgba(245,200,0,.2)",
                  borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:"1.3rem"}}>🃏</div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--y)"}}>
                    {kpis.classic?kpis.classic.winRate+"%":"—"}
                  </div>
                  <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                    color:"rgba(255,255,255,.3)",letterSpacing:1}}>
                    {T.modeClassicCaps}{kpis.classic?" · "+kpis.classic.games+T.gamesAbbrev:""}
                  </div>
                </div>
                <div style={{flex:1,background:"rgba(230,57,70,.08)",border:"1px solid rgba(230,57,70,.2)",
                  borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:"1.3rem"}}>💀</div>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:"var(--r)"}}>
                    {kpis.venganza?kpis.venganza.winRate+"%":"—"}
                  </div>
                  <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                    color:"rgba(255,255,255,.3)",letterSpacing:1}}>
                    {T.modeVengCaps}{kpis.venganza?" · "+kpis.venganza.games+T.gamesAbbrev:""}
                  </div>
                </div>
              </div>
            )}
          </>)}
        </>
      )}

      {/* ── TAB: AMIGOS ── */}
      {!loading&&tab==="friends"&&(
        isAnon
        ? <div style={{textAlign:"center",padding:"30px 20px"}}>
            <div style={{fontSize:"2.5rem",marginBottom:8}}>👥</div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".75rem",color:"rgba(255,255,255,.4)"}}>
              {T.needAccountFriends}
            </div>
            <button onClick={()=>signOut()} className="btn btn-y" style={{marginTop:16,maxWidth:280}}>
              {T.createAccount}
            </button>
          </div>
        : <>
          {/* Invite link */}
          <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
            borderRadius:12,padding:"12px 13px",marginBottom:14}}>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
              color:"rgba(255,255,255,.35)",letterSpacing:2,marginBottom:8}}>{T.inviteFriendCaps}</div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",
              color:"rgba(255,255,255,.6)",marginBottom:10,lineHeight:1.5}}>
              {T.shareLinkDesc}
            </div>
            <button onClick={()=>{
              const link="https://mysqldumpbd-afk.github.io/Flip7/?invite="+uid;
              if(navigator.share){
                navigator.share({title:T.shareInviteTitle,text:T.shareInviteText,url:link});
              } else {
                navigator.clipboard.writeText(link).then(()=>setAddOk(T.linkCopiedWhatsapp));
              }
              snd("tap");
            }} style={{width:"100%",padding:"11px",background:"linear-gradient(135deg,var(--t),#1A9A94)",
              border:"none",borderRadius:11,cursor:"pointer",
              fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:".9rem",color:"#fff",
              display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {T.shareInviteLinkBtn}
            </button>
            {addOk&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
              color:"var(--gr)",marginTop:8,textAlign:"center"}}>{addOk}</div>}
            <div style={{height:12}}/>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
              color:"rgba(255,255,255,.3)",letterSpacing:2,marginBottom:8}}>{T.searchByNameEmail}</div>
            <div style={{position:"relative"}}>
              <input className="inp" style={{margin:0,width:"100%",padding:"7px 10px",fontSize:".86rem"}}
                placeholder={T.searchNameEmailPlaceholder}
                value={addInput} onChange={e=>setAddInput(e.target.value)}/>
              {searching&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
                color:"rgba(255,255,255,.3)",marginTop:6}}>{T.searchingLbl}</div>}
              {!searching&&suggestions.length>0&&(
                <div style={{marginTop:8,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",
                  borderRadius:10,overflow:"hidden"}}>
                  {suggestions.map(s=>(
                    <div key={s.uid} onClick={()=>{snd("tap");sendFriendRequest(s);}}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",cursor:"pointer",
                        borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(245,200,0,.15)",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontFamily:"'Anton',sans-serif",color:"var(--y)",fontSize:".9rem",flexShrink:0}}>
                        {(s.name||"?")[0].toUpperCase()}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:900,fontSize:".82rem",color:"#fff"}}>{s.name}</div>
                        {s.email&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                          color:"rgba(255,255,255,.35)"}}>{s.email}</div>}
                      </div>
                      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"var(--t)",
                        fontWeight:900,letterSpacing:1,flexShrink:0}}>{T.requestSentBtn}</div>
                    </div>
                  ))}
                </div>
              )}
              {!searching&&addInput.trim().length>=2&&suggestions.length===0&&(
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
                  color:"rgba(255,255,255,.3)",marginTop:6}}>{T.noResults}</div>
              )}
            </div>
            {addErr&&<div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",
              color:"var(--r)",marginTop:6}}>{addErr}</div>}
          </div>

          {/* Solicitudes de amistad pendientes */}
          {friendRequests.length>0&&(
            <div style={{marginBottom:16}}>
              <p className="sec" style={{color:"var(--r)"}}>
                {T.pendingRequestsCaps.replace('{n}',friendRequests.length)}
              </p>
              {friendRequests.map(r=>(
                <div key={r.fromUid} style={{background:"rgba(230,57,70,.06)",
                  border:"1px solid rgba(230,57,70,.25)",borderRadius:13,
                  padding:"11px 13px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(230,57,70,.15)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontFamily:"'Anton',sans-serif",fontSize:"1rem",color:"var(--r)",flexShrink:0}}>
                    {(r.name||"?")[0].toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:900,fontSize:".85rem",color:"#fff"}}>{r.name}</div>
                    <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                      color:"rgba(255,255,255,.35)"}}>{T.wantsToBeFriend}</div>
                  </div>
                  <button onClick={()=>acceptFriendRequest(r.fromUid,r)}
                    style={{background:"var(--gr)",border:"none",borderRadius:8,padding:"7px 12px",
                      cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".62rem",
                      color:"#fff",fontWeight:900,flexShrink:0}}>{T.acceptBtn}</button>
                  <button onClick={()=>declineFriendRequest(r.fromUid)}
                    style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
                      borderRadius:8,width:30,height:30,cursor:"pointer",flexShrink:0,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      color:"rgba(255,255,255,.4)",fontSize:".8rem"}}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Friends list */}
          {friends.length===0
            ? <div style={{textAlign:"center",padding:"20px",color:"rgba(255,255,255,.3)",
                fontFamily:"'Righteous',sans-serif",fontSize:".75rem"}}>
                {T.noFriendsYetAdd}
              </div>
            : friends.map(f=>{
                const fs=friendsStats[f.uid];
                const fWinRate=fs&&fs.games>0?Math.round((fs.wins/fs.games)*100):0;
                const pres=friendPresence[f.uid]||{};
                const isOnline=pres.online;
                const h2hIsOpen=h2hOpen===f.uid;
                return(
                  <div key={f.uid} style={{marginBottom:8}}>
                  {/* Cuando la comparativa está abierta, la fila toma el
                      mismo tinte/borde teal que el panel de abajo y pierde
                      el redondeo inferior — así los dos se leen como una
                      sola tarjeta continua en vez de dos cuadros pegados
                      con colores distintos. */}
                  <div style={{background:h2hIsOpen?"rgba(46,196,182,.07)":"rgba(255,255,255,.04)",
                    border:"1px solid "+(h2hIsOpen?"rgba(46,196,182,.3)":"rgba(255,255,255,.07)"),
                    borderRadius:h2hIsOpen?"13px 13px 0 0":13,transition:"background .15s,border-color .15s",
                    padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:"rgba(245,200,0,.15)",
                      border:"2px solid "+(isOnline?"var(--gr)":"rgba(245,200,0,.3)"),display:"flex",alignItems:"center",
                      justifyContent:"center",fontFamily:"'Anton',sans-serif",
                      fontSize:"1.1rem",color:"var(--y)",flexShrink:0,position:"relative"}}>
                      {(f.name||"?")[0].toUpperCase()}
                      {isOnline&&<div style={{position:"absolute",bottom:-1,right:-1,width:12,height:12,
                        borderRadius:"50%",background:"var(--gr)",border:"2px solid var(--dark,#14141f)"}}/>}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:900,fontSize:".9rem",color:"rgba(255,255,255,.85)"}}>{f.name}</div>
                      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",letterSpacing:1,marginTop:2,
                        color:isOnline?"var(--gr)":"rgba(255,255,255,.25)"}}>
                        {isOnline?T.statusOnline:(pres.lastSeen?"⚫ "+fmtAgo(pres.lastSeen,T):"⚫ "+T.statusOffline)}
                      </div>
                      {fs
                        ? <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                            color:"rgba(255,255,255,.35)",letterSpacing:1,marginTop:2}}>
                            {T.friendStatsLine.replace('{n}',fs.games||0).replace('{pct}',fWinRate).replace('{best}',fs.bestScore||0).replace('{flip7}',fs.flip7Count||0)}
                          </div>
                        : <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                            color:"rgba(255,255,255,.25)",letterSpacing:1}}>{T.noGamesYetShort}</div>
                      }
                    </div>
                    {fs&&<div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.3rem",
                      color:"rgba(255,255,255,.4)"}}>{fs.wins||0}<div style={{fontFamily:"'Righteous',sans-serif",
                        fontSize:".52rem",color:"rgba(255,255,255,.25)",letterSpacing:1}}>{T.winsLbl}</div></div>}
                    <button onClick={()=>{snd("tap");setH2hOpen(h2hOpen===f.uid?null:f.uid);}}
                      title={T.compareHeadToHead}
                      style={{background:h2hOpen===f.uid?"rgba(46,196,182,.15)":"rgba(255,255,255,.06)",
                        border:"1px solid "+(h2hOpen===f.uid?"rgba(46,196,182,.4)":"rgba(255,255,255,.1)"),
                        borderRadius:8,width:30,height:30,cursor:"pointer",flexShrink:0,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        color:h2hOpen===f.uid?"var(--t)":"rgba(255,255,255,.4)",fontSize:".8rem"}}>⚔️</button>
                    {confirmRemove===f.uid ? (
                      <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                        <button onClick={()=>{snd("tap");removeFriend(f.uid);}}
                          style={{background:"var(--r)",border:"none",borderRadius:8,padding:"5px 9px",
                            cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                            color:"#fff",fontWeight:900,whiteSpace:"nowrap"}}>{T.confirmReq}</button>
                        <button onClick={()=>setConfirmRemove(null)}
                          style={{background:"rgba(255,255,255,.08)",border:"none",borderRadius:8,padding:"5px 9px",
                            cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                            color:"rgba(255,255,255,.5)",whiteSpace:"nowrap"}}>{T.cancel}</button>
                      </div>
                    ) : (
                      <button onClick={()=>{snd("tap");setConfirmRemove(f.uid);}}
                        title={T.deleteFriendTitle}
                        style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
                          borderRadius:8,width:30,height:30,cursor:"pointer",flexShrink:0,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          color:"rgba(255,255,255,.4)",fontSize:".9rem"}}>🗑</button>
                    )}
                  </div>
                  {h2hOpen===f.uid&&<HeadToHead myUid={uid} friendUid={f.uid} friendName={f.name} T={T}/>}
                  </div>
                );
              })
          }
        </>
      )}

      {/* ── TAB: HISTORIAL ── */}
      {!loading&&tab==="history"&&(
        myGames.length===0
        ? <div style={{textAlign:"center",padding:"30px",color:"rgba(255,255,255,.3)",
            fontFamily:"'Righteous',sans-serif",fontSize:".75rem"}}>
            {T.noGamesRegisteredYet}
          </div>
        : <>
          <GameCalendarHeatmap games={myGames} T={T}/>
          {myGames.map((g,i)=>{
            const isOpen=expandedGame===(g.gameId||i);
            return(
            <div key={g.gameId||i} onClick={()=>setExpandedGame(isOpen?null:(g.gameId||i))}
              style={{background:g.won?"rgba(59,178,115,.08)":"rgba(255,255,255,.03)",
              border:"2px solid "+(g.won?"rgba(59,178,115,.35)":"rgba(255,255,255,.07)"),
              borderRadius:13,padding:"11px 13px",marginBottom:8,cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <div style={{fontSize:"1.5rem"}}>{g.won?"🏆":g.position===2?"🥈":g.position===3?"🥉":"💀"}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:900,fontSize:".88rem",
                    color:g.won?"var(--gr)":"rgba(255,255,255,.8)"}}>{g.title?g.title:T.gamePrefix+" "+new Date(g.date).toLocaleDateString(T.locale)}
                    {g.gameMode&&g.gameMode!=="classic"&&<span style={{fontFamily:"'Righteous',sans-serif",
                      fontSize:".55rem",color:"var(--r)",marginLeft:6}}>{T.vengeanceTag}</span>}
                  </div>
                  <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",
                    color:"rgba(255,255,255,.35)",letterSpacing:1,marginTop:2}}>
                    {fmtD(g.date)} · {T.playersCountPos.replace('{n}',g.playerCount).replace('{p}',g.position)}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.6rem",
                    color:g.won?"var(--y)":"rgba(255,255,255,.5)"}}>{g.total}</div>
                  <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",
                    color:"rgba(255,255,255,.3)",letterSpacing:1}}>{T.ptsTotalLbl}</div>
                </div>
                <span style={{fontSize:"1rem",color:"rgba(255,255,255,.3)",
                  transform:isOpen?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>
              </div>
              {/* Round chips */}
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {(g.rounds||[]).map((r,ri)=>(
                  <span key={ri} style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                    padding:"2px 6px",borderRadius:8,
                    background:r.score===0?"rgba(230,57,70,.15)":(r.breakdown&&r.breakdown.flip7)?"rgba(245,200,0,.2)":"rgba(255,255,255,.07)",
                    color:r.score===0?"var(--r)":(r.breakdown&&r.breakdown.flip7)?"var(--y)":"rgba(255,255,255,.5)"}}>
                    R{ri+1}: {r.score===0?"💀":(r.score>0?"+":"")+r.score}{r.breakdown&&r.breakdown.flip7?"🃏":""}
                  </span>
                ))}
              </div>
              {/* Detalle expandido — tabla horizontal con TODOS los
                  participantes y su desglose ronda por ronda, igual que en
                  la pestaña Tabla durante la partida en vivo. */}
              {isOpen&&(
                <div onClick={e=>e.stopPropagation()}>
                  <GameRoundsTable gameId={g.gameId} highlightId={uid} T={T}/>
                </div>
              )}
            </div>
            );
          })}
          </>
      )}

      <div style={{height:8}}/>
      <button className="btn btn-g" onClick={onBack}>{T.backToMenu}</button>
    </div></div>
  );
}

// ── STATSSCREEN — dashboard de jugadores ────────────────────
function StatsScreen({onBack,T}){
  const[players,setPlayers]=React.useState([]);
  const[selectedPlayer,setSelectedPlayer]=React.useState(null);
  const[games,setGames]=React.useState([]);
  const[loading,setLoading]=React.useState(true);
  const[tab,setTab]=React.useState("leaderboard");


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
          <button onClick={()=>setSelectedPlayer(null)} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".72rem"}}>{T.back}</button>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:"2.4rem"}}><Ava v={p.emoji}/></div>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.4rem",color:p.color,letterSpacing:2}}>{p.name}</div>
          </div>
        </div>
        {/* Stats summary */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          {[["🏆",T.statLblWins,p.wins||0],["🎮",T.statLblGames,p.games||0],["⭐",T.statLblBestScore,p.bestScore||0],["📊",T.avgScoreLbl,avgScore],
            ["🃏",T.statLblFlip7s,p.flip7Count||0],["💀",T.statLblBusts,p.bustCount||0]
          ].map(([ico,lbl,val])=>(
            <div key={lbl} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",borderRadius:13,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:"1.4rem",marginBottom:4}}>{ico}</div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.8rem",color:lbl===T.statLblFlip7s?"var(--y)":lbl===T.statLblBusts?"var(--r)":"var(--y)",lineHeight:1}}>{val}</div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.35)",letterSpacing:2,marginTop:3,textTransform:"uppercase"}}>{lbl}</div>
            </div>
          ))}
        </div>
        <div style={{background:"rgba(245,200,0,.08)",border:"1px solid rgba(245,200,0,.2)",borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"2.4rem",color:"var(--y)"}}>{winRate}%</div>
          <div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".72rem",color:"var(--y)",letterSpacing:2}}>{T.winRateLbl}</div>
            <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.35)",letterSpacing:1}}>{T.winsOfGamesLine.replace('{w}',p.wins||0).replace('{g}',p.games||0)}</div>
          </div>
        </div>
        <p className="sec">{T.historyOfGames}</p>
        {(p.gamesList||[]).map((g,i)=>(
          <div key={g.gameId||i} style={{background:g.won?"rgba(59,178,115,.08)":"rgba(255,255,255,.03)",border:"2px solid "+(g.won?"rgba(59,178,115,.35)":"rgba(255,255,255,.07)"),borderRadius:13,padding:"11px 13px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:"1.6rem"}}>{g.won?"🏆":g.position===2?"🥈":g.position===3?"🥉":"💀"}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:900,fontSize:".88rem",color:g.won?"var(--gr)":"rgba(255,255,255,.8)"}}>{g.title?g.title:T.gamePrefix+" "+new Date(g.date).toLocaleDateString(T.locale)}</div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.35)",letterSpacing:1,marginTop:2}}>
                {fmtD(g.date)} · {g.playerCount} {T.playersAbbrev}
              </div>
              {/* Round breakdown mini */}
              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                {(g.rounds||[]).map((r,ri)=>(
                  <span key={ri} style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",
                    padding:"1px 5px",borderRadius:8,
                    background:r.score===0?"rgba(230,57,70,.15)":(r.breakdown&&r.breakdown.flip7)?"rgba(245,200,0,.2)":"rgba(255,255,255,.07)",
                    color:r.score===0?"var(--r)":(r.breakdown&&r.breakdown.flip7)?"var(--y)":"rgba(255,255,255,.5)"}}>
                    {r.score===0?"💀":(r.score>0?"+":"")+r.score}{r.breakdown&&r.breakdown.flip7?"🃏":""}
                  </span>
                ))}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.6rem",color:g.won?"var(--y)":"rgba(255,255,255,.5)"}}>{g.total}</div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".58rem",color:"rgba(255,255,255,.3)",letterSpacing:1}}>{T.posOfTotalTemplate.replace('{p}',g.position).replace('{n}',g.playerCount)}</div>
            </div>
          </div>
        ))}
        {(!p.gamesList||p.gamesList.length===0)&&<div className="es"><p>{T.noHistoryYet}</p></div>}
        <div className="g8"/>
        <button className="btn btn-g" onClick={()=>setSelectedPlayer(null)}>{T.backToRanking}</button>
      </div></div>
    );
  }

  return(
    <div className="wrap"><div className="page" style={{paddingTop:16}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",borderRadius:9,padding:"6px 12px",cursor:"pointer",fontFamily:"'Righteous',sans-serif",fontSize:".72rem"}}>{T.back}</button>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.5rem",letterSpacing:3,color:"var(--y)"}}>{T.statsCapsTitle}</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.3)",letterSpacing:2}}>{T.flip7RaceTo200}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["leaderboard",T.tabRankingEmoji],["games",T.tabGamesEmoji]].map(([id,lbl])=>(
          <button key={id} className={"nb "+(tab===id?"on":"")} onClick={()=>{snd('tap');setTab(id);}} style={{flex:1,padding:"9px 4px"}}>{lbl}</button>
        ))}
      </div>

      {loading&&<div style={{textAlign:"center",paddingTop:40}}><div className="spin" style={{margin:"0 auto 14px"}}/><p style={{color:"rgba(255,255,255,.4)",fontWeight:700}}>{T.loadingStats}</p></div>}

      {/* LEADERBOARD */}
      {!loading&&tab==="leaderboard"&&(<>
        {players.length===0&&<div className="es"><div style={{fontSize:"2.8rem",marginBottom:10}}>📊</div><p style={{fontWeight:700}}>{T.noStatsYet}</p><p style={{fontSize:".8rem",marginTop:6,color:"rgba(255,255,255,.3)"}}>{T.completeGameForRanking}</p></div>}
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
              <div style={{fontSize:"1.6rem"}}><Ava v={p.emoji}/></div>
              <div style={{flex:1}}>
                <div style={{fontWeight:900,fontSize:".96rem",color:p.color}}>{p.name}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.35)",letterSpacing:1,marginTop:2}}>
                  {T.statsLeaderRow.replace('{g}',p.games||0).replace('{pct}',winRate).replace('{best}',p.bestScore||0)}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.8rem",color:i===0?"var(--y)":"rgba(255,255,255,.55)"}}>{p.wins||0}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".55rem",color:"rgba(255,255,255,.3)",letterSpacing:1}}>{T.winsTrophy}</div>
              </div>
              <div style={{color:"rgba(255,255,255,.2)",fontSize:".9rem"}}>›</div>
            </div>
          );
        })}
      </>)}

      {/* PARTIDAS */}
      {!loading&&tab==="games"&&(<>
        {games.length===0&&<div className="es"><div style={{fontSize:"2.8rem",marginBottom:10}}>🎮</div><p style={{fontWeight:700}}>{T.noGamesYetShort}</p></div>}
        {games.map((g,i)=>(
          <div key={g.gameId||i} style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:13,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:900,fontSize:".88rem"}}>{g.title?g.title:T.gamePrefix+" "+new Date(g.date).toLocaleDateString(T.locale)}</div>
                <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.35)",letterSpacing:1,marginTop:2}}>{fmtD(g.date)} · {fmtT(g.date)} · {T.roomInlineLower.replace('{code}',g.code)}</div>
              </div>
              <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",color:"rgba(255,255,255,.3)",background:"rgba(255,255,255,.06)",padding:"2px 8px",borderRadius:20}}>{g.playerCount||0} {T.playersAbbrev} · {g.rounds||0} {T.roundsWord}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(245,200,0,.08)",borderRadius:9,padding:"7px 10px",marginBottom:8}}>
              <span style={{fontSize:"1.1rem"}}>🏆</span>
              <span style={{fontFamily:"'Lilita One',sans-serif",fontSize:".88rem",color:"var(--y)"}}>{g.winner}</span>
            </div>
            {(g.players||[]).sort((a,b)=>a.position-b.position).map(p=>{
              var pFlip7s=(p.rounds||[]).filter(r=>r.breakdown&&r.breakdown.flip7).length;
              var pBusts=(p.rounds||[]).filter(r=>r.score===0).length;
              return(
              <div key={p.id||p.name} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1rem",width:24,color:"rgba(255,255,255,.3)"}}>{p.position===1?"🥇":p.position===2?"🥈":p.position===3?"🥉":"#"+p.position}</div>
                <div style={{fontSize:"1rem"}}><Ava v={p.emoji}/></div>
                <div style={{fontWeight:800,flex:1,fontSize:".84rem",color:p.color}}>{p.name}</div>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  {pFlip7s>0&&<span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",background:"rgba(245,200,0,.15)",color:"var(--y)",padding:"1px 6px",borderRadius:10}}>🃏×{pFlip7s}</span>}
                  {pBusts>0&&<span style={{fontFamily:"'Righteous',sans-serif",fontSize:".6rem",background:"rgba(230,57,70,.12)",color:"var(--r)",padding:"1px 6px",borderRadius:10}}>💀×{pBusts}</span>}
                  <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.1rem",color:"rgba(255,255,255,.55)"}}>{p.total}pts</div>
                </div>
              </div>
              );
            })}
          </div>
        ))}
      </>)}
    </div></div>
  );
}

// ── WINNERSCREEN — revancha solo host ─────────────────────────
// 3 variantes de celebración — mismo layout y mecánica (confeti, texto,
// botones), solo cambia ícono, acento de color, fondo y animación del
// ícono. Se elige al azar cada vez que termina una partida.
// NOTA: label/labelTie ya NO llevan el texto — guardan la KEY de LANGS
// (labelKey/labelTieKey) para poder resolverse en el idioma activo (T)
// dentro de WinnerScreen, en vez de texto fijo en español.
const CELEBRATIONS=[
  {icon:"🏆",labelKey:"celWinnerLbl",labelTieKey:"celTieLbl",
    bg:"radial-gradient(circle at 50% 40%,#2a1800 0%,#0F0F1A 60%)",
    confetti:CONF,iconAnim:"fl 2s ease-in-out infinite",accent:"var(--y)"},
  {icon:"🎆",labelKey:"celExplosiveLbl",labelTieKey:"celExplosiveTieLbl",
    bg:"radial-gradient(circle at 50% 40%,#0d1a3a 0%,#0a0a18 60%)",
    confetti:["#2EC4B6","#7C6FE0","#ffffff","#4A90D9"],
    iconAnim:"celSpin 1.2s ease-in-out infinite",accent:"var(--t)"},
  {icon:"👑",labelKey:"celCrownedLbl",labelTieKey:"celCrownSharedLbl",
    bg:"radial-gradient(circle at 50% 40%,#2a0a30 0%,#0F0F1A 60%)",
    confetti:["#F5C800","#ffffff","#cc88ff","#FF6B35"],
    iconAnim:"celPulse 1.5s ease-in-out infinite",accent:"#cc88ff"},
  {icon:"🐒",image:"icons/Celebraciones/monkey.gif",labelKey:"celJungleKingLbl",labelTieKey:"celJungleSharedLbl",
    bg:"radial-gradient(circle at 50% 40%,#0e2a12 0%,#0F0F1A 60%)",
    confetti:["#3BB273","#F5C800","#8B5E34","#ffffff"],
    iconAnim:"celSwing 1.4s ease-in-out infinite",accent:"#3BB273"},
  // ── Celebraciones nuevas (carpeta icons/Celebraciones) — los nombres de
  // archivo traen espacios reales en disco, por eso van con %20 aquí.
  {icon:"😁",image:"icons/Celebraciones/Beaming%20Face%20Emoji.gif",labelKey:"celBeamingLbl",labelTieKey:"celBeamingSharedLbl",
    bg:"radial-gradient(circle at 50% 40%,#2a2200 0%,#0F0F1A 60%)",
    confetti:["#F5C800","#FFD700","#ffffff","#FF6B35"],
    iconAnim:"celPulse 1.3s ease-in-out infinite",accent:"#F5C800"},
  {icon:"🔥",image:"icons/Celebraciones/Fire%20Emoji.gif",labelKey:"celFireLbl",labelTieKey:"celFireSharedLbl",
    bg:"radial-gradient(circle at 50% 40%,#3a0e00 0%,#0F0F1A 60%)",
    confetti:["#FF6B35","#E63946","#F5C800","#ffffff"],
    iconAnim:"celPulse 1s ease-in-out infinite",accent:"#FF6B35"},
  {icon:"💪",image:"icons/Celebraciones/Flexed%20Biceps%20Emoji.gif",labelKey:"celBicepsLbl",labelTieKey:"celBicepsSharedLbl",
    bg:"radial-gradient(circle at 50% 40%,#1a2a0e 0%,#0F0F1A 60%)",
    confetti:["#A8E63B","#3BB273","#ffffff","#F5C800"],
    iconAnim:"celSpin 1.4s ease-in-out infinite",accent:"#A8E63B"},
  {icon:"🤣",image:"icons/Celebraciones/Hahaha%20Emoji.gif",labelKey:"celHahahaLbl",labelTieKey:"celHahahaSharedLbl",
    bg:"radial-gradient(circle at 50% 40%,#2a1a00 0%,#0F0F1A 60%)",
    confetti:["#FF9A8B","#F5C800","#ffffff","#FF6B6B"],
    iconAnim:"celSwing 1.2s ease-in-out infinite",accent:"#FF9A8B"},
  {icon:"🌈",image:"icons/Celebraciones/Rainbow%20Emoji.gif",labelKey:"celRainbowLbl",labelTieKey:"celRainbowSharedLbl",
    bg:"radial-gradient(circle at 50% 40%,#150e2a 0%,#0F0F1A 60%)",
    confetti:["#E63946","#F5C800","#3BB273","#00B4D8","#7B2D8B"],
    iconAnim:"celSpin 1.6s ease-in-out infinite",accent:"#00CFE8"},
  {icon:"😜",image:"icons/Celebraciones/Squinting%20Face%20with%20Tongue%20Emoji.gif",labelKey:"celSquintLbl",labelTieKey:"celSquintSharedLbl",
    bg:"radial-gradient(circle at 50% 40%,#2a0e22 0%,#0F0F1A 60%)",
    confetti:["#ff69b4","#F5C800","#ffffff","#9B5DE5"],
    iconAnim:"celPulse 1.1s ease-in-out infinite",accent:"#ff69b4"}
];

// Frases de margen — según qué tan grande fue la diferencia de puntos entre
// el 1° y el 2° lugar. Se elige una al azar dentro del rango que
// corresponda, cada vez que alguien gana (sin empate). Guardan KEYS de
// LANGS (no texto fijo) para poder traducirse según el idioma activo.
const VICTORY_PHRASE_KEYS={
  close:["vpClose1","vpClose2","vpClose3","vpClose4","vpClose5"],
  solid:["vpSolid1","vpSolid2","vpSolid3","vpSolid4","vpSolid5"],
  crushing:["vpCrush1","vpCrush2","vpCrush3","vpCrush4","vpCrush5"]
};

function WinnerScreen({winner,celebrationType,players,target,onClose,onRematch,isHost,T}){
  const cel=CELEBRATIONS[celebrationType||0];
  const isTie=winner&&winner.tied;
  // Diferencia de puntos entre el ganador y el 2° lugar — determina qué
  // tan "aplastante" fue la victoria. Solo aplica si no hay empate y
  // tenemos la lista completa de jugadores de esa partida.
  const runnerUp=(!isTie&&Array.isArray(players)&&players.length>1)
    ?[...players].sort((a,b)=>b.total-a.total).find(p=>p.id!==winner.id)
    :null;
  const margin=runnerUp?Math.max(0,(winner.total||0)-(runnerUp.total||0)):null;
  const marginTier=margin==null?null:(margin<15?'close':margin<40?'solid':'crushing');
  // Se elige UNA vez por victoria (no en cada re-render) para que no
  // cambie de frase mientras se ve la pantalla.
  const[victoryPhrase]=React.useState(()=>{
    if(!marginTier)return null;
    const pool=VICTORY_PHRASE_KEYS[marginTier];
    return T[pool[Math.floor(Math.random()*pool.length)]];
  });
  const dots=Array.from({length:40},(_,i)=>({
    id:i,c:cel.confetti[i%cel.confetti.length],
    l:Math.round(Math.random()*100)+"%",
    dl:Math.round(Math.random()*25)/10+"s",
    dr:Math.round((2.5+Math.random()*2.5)*10)/10+"s",
    sz:Math.round(7+Math.random()*10)+"px",
    sh:Math.random()>.5?"2px":"50%"
  }));
  return(
    React.createElement("div",{className:"wb",style:{background:cel.bg}},
      dots.map(d=>React.createElement("div",{key:d.id,style:{position:"absolute",background:d.c,width:d.sz,height:d.sz,left:d.l,top:-20,borderRadius:d.sh,animation:"cf "+d.dr+" "+d.dl+" linear infinite"}})),
      (cel.image&&!isTie)
        ? React.createElement("img",{src:cel.image,alt:"",className:"wc-img",style:{animation:cel.iconAnim},onError:e=>{e.target.style.display="none";}})
        : React.createElement("div",{className:"wc",style:{animation:cel.iconAnim}},isTie?"🎊":cel.icon),
      React.createElement("div",{className:"wl",style:{color:cel.accent}},isTie?T[cel.labelTieKey]:T[cel.labelKey]),
      React.createElement("div",{className:"wbig"},"FLIP 7"),
      isTie?React.createElement(React.Fragment,null,
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".85rem",color:cel.accent,letterSpacing:3,marginBottom:8}},winner.players.length+" "+T.winners),
        winner.players.map(p=>React.createElement("div",{key:p.id,style:{fontFamily:"'Lilita One',sans-serif",fontSize:"2rem",color:"white",letterSpacing:1,marginBottom:4,textShadow:"0 0 20px rgba(245,200,0,.4)"}},React.createElement(Ava,{v:p.emoji})," "+p.name)),
        React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".9rem",color:"var(--y)",marginBottom:30,letterSpacing:2,marginTop:6}},winner.total+" "+T.ptsEach)
      ):React.createElement(React.Fragment,null,
        React.createElement("div",{className:"wnm"},React.createElement(Ava,{v:winner.emoji})," "+(winner.name||"")),
        React.createElement("div",{className:"wpt",style:{marginBottom:victoryPhrase?10:32}},
          T.ptsGoalTemplate.replace('{pts}',winner.total||0).replace('{target}',target||WIN)),
        victoryPhrase&&React.createElement("div",{style:{
          fontFamily:"'Lilita One',sans-serif",fontSize:"1.15rem",color:cel.accent,
          letterSpacing:1,marginBottom:26,textShadow:"0 0 18px "+cel.accent+"66"
        }},victoryPhrase)
      ),
      // Revancha solo para el host
      isHost
        ? React.createElement("button",{className:"btn btn-y",onClick:()=>{snd("round");onRematch();},style:{maxWidth:300,marginBottom:10}},T.rematchSamePlayers)
        : React.createElement("div",{style:{fontFamily:"'Righteous',sans-serif",fontSize:".78rem",color:"rgba(255,255,255,.35)",letterSpacing:2,marginBottom:16,padding:"10px 20px",background:"rgba(255,255,255,.06)",borderRadius:12,border:"1px solid rgba(255,255,255,.1)"}},T.waitingRematchAdmin),
      React.createElement("button",{className:"btn btn-g",onClick:()=>{snd("tap");onClose();},style:{maxWidth:300}},T.seeFinal)
    )
  );
}

// ── ERRORBOUNDARY — red de seguridad ───────────────────────────
// La app no tenía ningún Error Boundary: cualquier excepción sin capturar
// durante un render (por ejemplo, una respuesta de la IA con un formato
// inesperado) tumbaba TODO el árbol de React sin avisar — como el fondo
// de <body> es casi negro (#0F0F1A), eso se veía literalmente como una
// "pantalla en negro", sin ningún mensaje ni forma de recuperarse salvo
// recargar a ciegas. Ahora, si algo se rompe durante el render, se
// muestra una pantalla de error real con botón para reintentar.
class ErrorBoundary extends React.Component{
  constructor(props){
    super(props);
    this.state={hasError:false,msg:""};
  }
  static getDerivedStateFromError(err){
    return{hasError:true,msg:(err&&err.message)||"__ERR_UNKNOWN__"};
  }
  componentDidCatch(err,info){
    console.error("Flip7 — error no capturado:",err,info&&info.componentStack);
    reportErrorToPosthog(err,{app:"game",componentStack:info&&info.componentStack});
  }
  render(){
    if(this.state.hasError){
      var _lang="es";
      try{ _lang=localStorage.getItem("f7lang")||"es"; }catch(e){}
      var _T=(typeof LANGS!=="undefined"&&LANGS[_lang])||LANGS.es;
      var _msg=this.state.msg==="__ERR_UNKNOWN__"?_T.errUnknown:this.state.msg;
      return React.createElement("div",{style:{minHeight:"100vh",display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center",padding:28,textAlign:"center",background:"var(--dark)"}},
        React.createElement("div",{style:{fontSize:"2.8rem",marginBottom:14}},"😵"),
        React.createElement("div",{style:{fontFamily:"'Anton',sans-serif",fontSize:"1.3rem",color:"var(--y)",
          marginBottom:10,letterSpacing:1}},_T.errBoundaryTitle),
        React.createElement("div",{style:{color:"rgba(255,255,255,.45)",fontSize:".78rem",marginBottom:8,
          maxWidth:320,lineHeight:1.5}},_T.errBoundaryDesc),
        React.createElement("div",{style:{color:"rgba(255,255,255,.3)",fontSize:".68rem",marginBottom:24,
          maxWidth:320,wordBreak:"break-word",fontFamily:"monospace"}},_msg),
        React.createElement("button",{className:"btn btn-y",style:{maxWidth:260},
          onClick:()=>{window.location.reload();}},_T.reloadApp)
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(ErrorBoundary,null,React.createElement(App)));
