// ═══════════════════════════════════════════════════════════════
// generic.jsx — BOARDGAMEZ OS v1.1
// Fixes: rondas dropdown 1-20+libre, puntos textbox libre,
//        cerrar/siguiente ronda, host=jugador, configs guardadas
// ═══════════════════════════════════════════════════════════════

// ── PICKER COMPARTIDO ───────────────────────────────────────────
function PlayerPicker({player, onUpdate, onClose}){
  const [mode,setMode]=React.useState('emoji');
  return(
    <div className="os-wrap">
      <div className="os-header">
        <button className="btn btn-ghost btn-sm" style={{width:'auto'}} onClick={onClose}>← Listo</button>
        <div style={{fontFamily:'var(--font-label)',fontSize:'.75rem',fontWeight:700,color:'rgba(255,255,255,.5)',letterSpacing:3}}>
          {player.name.toUpperCase()}
        </div>
        <div style={{width:70}}/>
      </div>
      <div className="os-page" style={{paddingTop:16}}>
        <div style={{display:'flex',gap:6,marginBottom:16}}>
          {['emoji','color'].map(m=>(
            <button key={m} className="btn btn-ghost btn-sm" style={{
              flex:1,background:mode===m?'var(--cyan)':undefined,
              color:mode===m?'var(--bg)':undefined,border:mode===m?'none':undefined
            }} onClick={()=>setMode(m)}>
              {m==='emoji'?'🐉 Emoji':'🎨 Color'}
            </button>
          ))}
        </div>
        {mode==='emoji'&&(
          <div className="picker-grid">
            {EMOJIS.map((e,i)=>(
              <div key={i} className={`picker-item ${player.emoji===e?'sel':''}`}
                onClick={()=>{snd('tap');onUpdate('emoji',e);}}>
                {e}
              </div>
            ))}
          </div>
        )}
        {mode==='color'&&(
          <div style={{display:'flex',flexWrap:'wrap',gap:10,padding:'8px 0'}}>
            {COLORS.map((c,i)=>(
              <div key={i} className={`color-dot ${player.color===c?'sel':''}`}
                style={{background:c}} onClick={()=>{snd('tap');onUpdate('color',c);}}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CONFIG PANEL — el núcleo de configuración ───────────────────
function ConfigPanel({config, onChange}){
  // config = { mode, useRounds, rounds, useTarget, targetScore }
  const ROUND_OPTIONS=Array.from({length:20},(_,i)=>i+1).concat(['libre']);

  return(
    <div>
      {/* MODO */}
      <div className="os-section">MODO DE PARTIDA</div>
      {[
        {id:'points',icon:'🏅',label:'Puntos acumulados',desc:'Gana quien llegue a la meta o tenga más al final'},
        {id:'wins',  icon:'🏆',label:'Victorias por ronda',desc:'Se cuentan victorias de ronda, no puntos'},
        {id:'survival',icon:'💀',label:'Supervivencia / Eliminación',desc:'Se eliminan jugadores hasta que queda uno'}
      ].map(m=>(
        <div key={m.id} className="os-card" style={{
          marginBottom:8,padding:'13px 14px',
          borderColor:config.mode===m.id?'rgba(0,245,255,.5)':undefined,
          background:config.mode===m.id?'rgba(0,245,255,.07)':undefined
        }} onClick={()=>{snd('tap');onChange({...config,mode:m.id});}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{fontSize:'1.9rem'}}>{m.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'var(--font-display)',fontSize:'1rem',letterSpacing:1,color:config.mode===m.id?'var(--cyan)':'#fff'}}>{m.label}</div>
              <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',fontWeight:600,color:'rgba(255,255,255,.4)',letterSpacing:1,marginTop:2}}>{m.desc}</div>
            </div>
            {config.mode===m.id&&<div style={{color:'var(--cyan)',fontSize:'1.3rem'}}>✓</div>}
          </div>
        </div>
      ))}

      {/* RONDAS — aplica a todos los modos */}
      <div className="os-section" style={{marginTop:6}}>RONDAS</div>
      <div className="check-row" style={{marginBottom:8}}
        onClick={()=>{snd('tap');onChange({...config,useRounds:!config.useRounds});}}>
        <div className={`check-box ${config.useRounds?'active':''}`}>{config.useRounds?'✓':''}</div>
        <div>
          <div className="check-label">¿Número de rondas definido?</div>
          <div className="check-sub">Si no, la partida es libre hasta cerrarla manualmente</div>
        </div>
      </div>
      {config.useRounds&&(
        <select className="os-select" value={config.rounds||3}
          onChange={e=>{snd('tap');onChange({...config,rounds:e.target.value==='libre'?'libre':parseInt(e.target.value)});}}>
          {ROUND_OPTIONS.map(r=>(
            <option key={r} value={r}>{r==='libre'?'∞ Libre':r+' ronda'+(r>1?'s':'')}</option>
          ))}
        </select>
      )}

      {/* META DE PUNTOS — solo modo points */}
      {config.mode==='points'&&(
        <>
          <div className="os-section" style={{marginTop:6}}>META DE PUNTOS</div>
          <div className="check-row" style={{marginBottom:8}}
            onClick={()=>{snd('tap');onChange({...config,useTarget:!config.useTarget});}}>
            <div className={`check-box ${config.useTarget?'active':''}`}>{config.useTarget?'✓':''}</div>
            <div>
              <div className="check-label">¿Con meta de puntos?</div>
              <div className="check-sub">Si no, gana quien más tenga al cerrar la partida</div>
            </div>
          </div>
          {config.useTarget&&(
            <input className="os-input" type="number" min="1" max="99999"
              placeholder="Meta de puntos (ej: 200)"
              value={config.targetScore||''}
              onChange={e=>{
                const v=parseInt(e.target.value)||0;
                onChange({...config,targetScore:Math.min(99999,v)});
              }}/>
          )}
        </>
      )}
    </div>
  );
}

// ── GENERIC SETUP ───────────────────────────────────────────────
function GenericSetup({onBack,onCreateRoom,hostPlayer}){
  const [step,setStep]=React.useState('name');
  const [title,setTitle]=React.useState('');
  const [players,setPlayers]=React.useState([]);
  const [newName,setNewName]=React.useState('');
  const [pickingFor,setPickingFor]=React.useState(null);
  const [config,setConfig]=React.useState({
    mode:'points',useRounds:true,rounds:3,useTarget:true,targetScore:100
  });
  const [savedConfigs,setSavedConfigs]=React.useState(()=>getSavedConfigs());
  const [saveName,setSaveName]=React.useState('');
  const [showSaveForm,setShowSaveForm]=React.useState(false);

  // Agregar host como primer jugador automáticamente
  React.useEffect(()=>{
    if(hostPlayer&&players.length===0){
      setPlayers([{...hostPlayer,isHost:true}]);
    }
  },[]);

  function addPlayer(){
    if(!newName.trim()) return;
    snd('join');
    const idx=players.length%EMOJIS.length;
    const cidx=players.length%COLORS.length;
    setPlayers([...players,{id:uid(),name:newName.trim(),emoji:EMOJIS[idx],color:COLORS[cidx]}]);
    setNewName('');
  }
  function removePlayer(id){
    snd('tap');setPlayers(players.filter(p=>p.id!==id));
  }
  function updatePlayer(id,field,value){
    setPlayers(players.map(p=>p.id===id?{...p,[field]:value}:p));
  }
  function handleSaveConfig(){
    if(!saveName.trim()) return;
    snd('save');
    saveConfig(saveName.trim(),config);
    setSavedConfigs(getSavedConfigs());
    setSaveName('');setShowSaveForm(false);
  }
  function loadSavedConfig(cfg){
    snd('tap');setConfig(cfg.config);
  }
  function handleDeleteConfig(id,e){
    e.stopPropagation();snd('tap');
    deleteConfig(id);setSavedConfigs(getSavedConfigs());
  }

  const canProceedName=title.trim().length>=2;
  const canProceedPlayers=players.length>=2;

  if(pickingFor!==null){
    const p=players.find(pl=>pl.id===pickingFor);
    if(!p){setPickingFor(null);return null;}
    return <PlayerPicker player={p} onUpdate={(f,v)=>updatePlayer(p.id,f,v)} onClose={()=>setPickingFor(null)}/>;
  }

  return(
    <div className="os-wrap">
      <div className="os-header">
        <button className="btn btn-ghost btn-sm" style={{width:'auto'}} onClick={onBack}>← Atrás</button>
        <div className="os-logo" style={{fontSize:'1rem'}}>PARTIDA <span>LIBRE</span></div>
        <div style={{fontFamily:'var(--font-ui)',fontSize:'.58rem',color:'rgba(0,245,255,.5)',letterSpacing:2}}>
          {step==='name'?'1/3':step==='players'?'2/3':'3/3'}
        </div>
      </div>

      <div className="os-page" style={{paddingTop:16}}>

        {/* PASO 1: NOMBRE */}
        {step==='name'&&(
          <div className="anim-fade">
            <div className="os-section">NOMBRE DE LA PARTIDA</div>
            <div style={{background:'rgba(0,245,255,.04)',border:'1px solid rgba(0,245,255,.15)',borderRadius:14,padding:16,marginBottom:16,textAlign:'center'}}>
              <div style={{fontSize:'3rem',marginBottom:6}}>⚔️</div>
              <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-sm)',fontWeight:700,color:'rgba(255,255,255,.5)',letterSpacing:2}}>¿QUÉ ESTÁN JUGANDO?</div>
            </div>
            <input className="os-input" placeholder="Ej: Catan del sábado, UNO brutal..."
              value={title} onChange={e=>setTitle(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&canProceedName&&setStep('players')}
              autoFocus maxLength={40}/>
            <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(255,255,255,.3)',textAlign:'right',marginBottom:16}}>
              {title.length}/40
            </div>
            <div className="os-section">SUGERENCIAS RÁPIDAS</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:20}}>
              {['Catan','UNO','Dominó','Poker','Lotería','Truco','Parqués','Mahjong'].map(s=>(
                <button key={s} style={{background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.12)',color:'rgba(255,255,255,.55)',borderRadius:20,padding:'6px 13px',cursor:'pointer',fontFamily:'var(--font-label)',fontSize:'var(--fs-xs)',fontWeight:600,letterSpacing:1}}
                  onClick={()=>{snd('tap');setTitle(s);}}>
                  {s}
                </button>
              ))}
            </div>
            <button className="btn btn-cyan" disabled={!canProceedName}
              onClick={()=>{snd('tap');setStep('players');}}>
              Siguiente → Jugadores
            </button>
          </div>
        )}

        {/* PASO 2: JUGADORES */}
        {step==='players'&&(
          <div className="anim-fade">
            <div className="os-section">JUGADORES · {players.length}</div>
            {players.map((p)=>(
              <div key={p.id} className="player-row" style={{marginBottom:8}}>
                <div className="player-emoji" style={{cursor:'pointer'}}
                  onClick={()=>{snd('tap');setPickingFor(p.id);}}>
                  {p.emoji}
                </div>
                <div style={{width:13,height:13,borderRadius:'50%',background:p.color,border:'2px solid rgba(255,255,255,.2)',flexShrink:0,cursor:'pointer'}}
                  onClick={()=>{snd('tap');setPickingFor(p.id);}}/>
                <div className="player-name" style={{color:p.color}}>
                  {p.name}
                  {p.isHost&&<span style={{fontFamily:'var(--font-ui)',fontSize:'.5rem',color:'var(--gold)',letterSpacing:2,marginLeft:6}}>HOST</span>}
                </div>
                {!p.isHost&&(
                  <button style={{background:'none',border:'none',color:'rgba(255,59,92,.5)',fontSize:'1.2rem',cursor:'pointer',padding:'0 4px'}}
                    onClick={()=>removePlayer(p.id)}>×</button>
                )}
              </div>
            ))}
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              <input className="os-input" style={{marginBottom:0,flex:1}}
                placeholder="Agregar jugador..."
                value={newName} onChange={e=>setNewName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addPlayer()} maxLength={20}/>
              <button style={{background:'rgba(0,245,255,.1)',border:'1px solid rgba(0,245,255,.3)',color:'var(--cyan)',borderRadius:11,padding:'0 18px',cursor:'pointer',fontFamily:'var(--font-display)',fontSize:'1.1rem',flexShrink:0}}
                onClick={addPlayer}>+</button>
            </div>
            {players.length<2&&(
              <div className="os-alert alert-cyan" style={{marginBottom:12}}>Agrega al menos 2 jugadores para continuar</div>
            )}
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-ghost" style={{flex:.5}} onClick={()=>setStep('name')}>← Atrás</button>
              <button className="btn btn-cyan" style={{flex:1}} disabled={!canProceedPlayers}
                onClick={()=>{snd('tap');setStep('config');}}>
                Siguiente → Config
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: CONFIG */}
        {step==='config'&&(
          <div className="anim-fade">
            {/* Configs guardadas */}
            {savedConfigs.length>0&&(
              <>
                <div className="os-section">CONFIGURACIONES GUARDADAS</div>
                {savedConfigs.map(sc=>(
                  <div key={sc.id} className="saved-config" onClick={()=>loadSavedConfig(sc)}>
                    <div style={{fontSize:'1.5rem'}}>💾</div>
                    <div className="saved-config-info">
                      <div className="saved-config-title">{sc.name}</div>
                      <div className="saved-config-meta">{describeConfig(sc.config)}</div>
                    </div>
                    <button className="saved-config-delete" onClick={(e)=>handleDeleteConfig(sc.id,e)}>×</button>
                  </div>
                ))}
                <div className="os-divider"/>
              </>
            )}

            <ConfigPanel config={config} onChange={setConfig}/>

            {/* Guardar config */}
            <div className="os-section" style={{marginTop:8}}>GUARDAR CONFIGURACIÓN</div>
            {!showSaveForm?(
              <button className="btn btn-ghost" onClick={()=>setShowSaveForm(true)}>
                💾 Guardar esta config para después
              </button>
            ):(
              <div style={{display:'flex',gap:8,marginBottom:8}}>
                <input className="os-input" style={{marginBottom:0,flex:1}}
                  placeholder="Nombre de la config..." value={saveName}
                  onChange={e=>setSaveName(e.target.value)} maxLength={30}
                  onKeyDown={e=>e.key==='Enter'&&handleSaveConfig()}/>
                <button style={{background:'rgba(155,93,229,.2)',border:'1px solid rgba(155,93,229,.4)',color:'var(--purple)',borderRadius:11,padding:'0 14px',cursor:'pointer',fontFamily:'var(--font-display)',fontSize:'var(--fs-xs)',flexShrink:0}}
                  onClick={handleSaveConfig}>
                  💾
                </button>
                <button style={{background:'none',border:'1px solid rgba(255,255,255,.1)',color:'rgba(255,255,255,.4)',borderRadius:11,padding:'0 12px',cursor:'pointer',flexShrink:0}}
                  onClick={()=>{setShowSaveForm(false);setSaveName('');}}>
                  ×
                </button>
              </div>
            )}

            <div className="g8"/>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-ghost" style={{flex:.5}} onClick={()=>setStep('players')}>← Atrás</button>
              <button className="btn btn-cyan" style={{flex:1}}
                onClick={()=>{snd('round');onCreateRoom({title,players,config});}}>
                🚀 Crear sala
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── GENERIC LOBBY ───────────────────────────────────────────────
function GenericLobby({session,onBack,onStart,isHost,myId,db}){
  const [room,setRoom]=React.useState(null);
  React.useEffect(()=>{
    const unsub=db.listen(`rooms/${session.code}`,data=>{if(data)setRoom(data);});
    return()=>unsub&&unsub();
  },[session.code]);
  React.useEffect(()=>{if(room?.status==='active')onStart();},[room?.status]);

  const players=room?.players||[];
  const config=room?.config||{};

  async function startGame(){
    snd('round');
    const now=Date.now();
    await db.set(`rooms/${session.code}`,{...room,status:'active',startedAt:now,currentRound:1,rounds:[],events:[{type:'match_start',ts:now}]});
  }

  return(
    <div className="os-wrap">
      <div className="os-header">
        <div><div className="os-logo">BOARD<span>GAMEZ</span></div><div className="os-logo-sub">OS · {(room?.customTitle||'PARTIDA LIBRE').toUpperCase()}</div></div>
        <div className="os-tag cyan">LOBBY</div>
      </div>
      <div className="os-page" style={{paddingTop:16}}>
        <div className="lobby-display anim-pop">
          <div style={{fontFamily:'var(--font-ui)',fontSize:'.58rem',letterSpacing:4,color:'rgba(0,245,255,.5)',marginBottom:6}}>CÓDIGO DE SALA</div>
          <div className="lobby-code">{session.code}</div>
          <div className="lobby-hint">COMPARTE PARA UNIRSE</div>
        </div>
        {config&&(
          <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'center',marginBottom:16}}>
            <div className="os-tag cyan">{config.mode==='points'?'🏅 Puntos':config.mode==='wins'?'🏆 Victorias':'💀 Supervivencia'}</div>
            {config.useRounds&&<div className="os-tag">{config.rounds==='libre'?'∞ Libre':`${config.rounds} rondas`}</div>}
            {config.mode==='points'&&config.useTarget&&<div className="os-tag gold">Meta: {config.targetScore}pts</div>}
            {!config.useRounds&&<div className="os-tag red">∞ Partida libre</div>}
          </div>
        )}
        <div className="os-section">JUGADORES · {players.length}</div>
        {players.map((p,i)=>(
          <div key={p.id} className="player-row active anim-fade" style={{animationDelay:i*.06+'s'}}>
            <div className="player-emoji">{p.emoji}</div>
            <div className="player-name" style={{color:p.color||'#fff'}}>
              {p.name}
              {p.id===myId&&<span style={{fontFamily:'var(--font-ui)',fontSize:'.5rem',color:'var(--cyan)',letterSpacing:2,marginLeft:6}}>TÚ</span>}
            </div>
            {p.id===room?.hostId&&<div className="os-tag gold" style={{fontSize:'var(--fs-micro)'}}>HOST</div>}
          </div>
        ))}
        <div className="g16"/>
        {isHost?(
          <button className="btn btn-cyan" onClick={startGame} disabled={players.length<2}>⚔️ INICIAR PARTIDA</button>
        ):(
          <div className="os-alert alert-cyan" style={{justifyContent:'center',textAlign:'center'}}>⏳ Esperando que el host inicie...</div>
        )}
        <button className="btn btn-ghost" onClick={onBack}>← Volver</button>
      </div>
    </div>
  );
}

// ── GENERIC RUNTIME ─────────────────────────────────────────────
function GenericRuntime({session,onBack,isHost,myId,db}){
  const [room,setRoom]=React.useState(null);
  const [elapsed,setElapsed]=React.useState(0);
  const [scoreInputs,setScoreInputs]=React.useState({});
  const [showEndScreen,setShowEndScreen]=React.useState(false);
  const [roundWinner,setRoundWinner]=React.useState(null);
  const [editingPlayer,setEditingPlayer]=React.useState(null);
  const timerRef=React.useRef(null);

  React.useEffect(()=>{
    const unsub=db.listen(`rooms/${session.code}`,data=>{if(data)setRoom(data);});
    return()=>unsub&&unsub();
  },[session.code]);
  React.useEffect(()=>{
    if(!room||room.status!=='active') return;
    const start=room.startedAt;
    timerRef.current=setInterval(()=>setElapsed(Date.now()-start),1000);
    return()=>clearInterval(timerRef.current);
  },[room?.status,room?.startedAt]);
  React.useEffect(()=>{if(room?.status==='finished')setShowEndScreen(true);},[room?.status]);

  if(!room) return(
    <div className="os-wrap"><div className="os-page" style={{paddingTop:80,textAlign:'center'}}>
      <div className="os-spin" style={{marginBottom:16}}/></div></div>
  );

  const players=room.players||[];
  const config=room.config||{};
  const isFreeSessions=!config.useRounds||config.rounds==='libre';
  const totalRounds=isFreeSessions?null:parseInt(config.rounds)||null;
  const currentRound=room.currentRound||1;

  const sortedPlayers=[...players].sort((a,b)=>
    config.mode==='wins'?(b.wins||0)-(a.wins||0):(b.total||0)-(a.total||0)
  );

  // Host edita jugador
  if(editingPlayer&&isHost){
    const p=players.find(pl=>pl.id===editingPlayer);
    if(!p){setEditingPlayer(null);return null;}
    return <PlayerPicker player={p}
      onUpdate={async(f,v)=>{
        const updated=players.map(pl=>pl.id===p.id?{...pl,[f]:v}:pl);
        await db.set(`rooms/${session.code}/players`,updated);
      }}
      onClose={()=>setEditingPlayer(null)}/>;
  }

  // ── Cerrar ronda (registra puntos + ganador, avanza ronda) ──
  async function closeRound(winnerId){
    if(!winnerId){alert('Selecciona el ganador de esta ronda');return;}
    snd('round');
    const now=Date.now();
    const updatedPlayers=players.map(p=>{
      const score=parseInt(scoreInputs[p.id]||0);
      const isWinner=p.id===winnerId;
      return{
        ...p,
        total:(p.total||0)+(config.mode!=='wins'?score:0),
        wins:(p.wins||0)+(isWinner?1:0),
        rounds:[...(p.rounds||[]),{round:currentRound,score:config.mode!=='wins'?score:0,won:isWinner,ts:now}]
      };
    });
    const newRound={number:currentRound,scores:Object.fromEntries(players.map(p=>[p.id,parseInt(scoreInputs[p.id]||0)])),winner:winnerId,closedAt:now};

    // Verificar victoria
    let finished=false;
    let winner=null;
    if(config.mode==='points'&&config.useTarget&&config.targetScore){
      winner=updatedPlayers.find(p=>(p.total||0)>=parseInt(config.targetScore));
      if(winner) finished=true;
    }
    if(!finished&&totalRounds&&currentRound>=totalRounds){
      finished=true;
      const sorted=[...updatedPlayers].sort((a,b)=>config.mode==='wins'?(b.wins||0)-(a.wins||0):(b.total||0)-(a.total||0));
      winner=sorted[0];
    }

    const updates={players:updatedPlayers,rounds:[...(room.rounds||[]),newRound],currentRound:currentRound+1};
    if(finished){
      updates.status='finished';updates.endedAt=now;
      updates.winner={id:winner?.id,name:winner?.name,emoji:winner?.emoji};
      snd('victory');
      await _saveSessionData(updatedPlayers,now,config);
    }
    await db.set(`rooms/${session.code}`,{...room,...updates});
    setScoreInputs({});setRoundWinner(null);
  }

  // ── Terminar partida manualmente ──
  async function endMatchNow(){
    snd('tap');
    if(!window.confirm('¿Terminar la partida ahora?')) return;
    const now=Date.now();
    const sorted=[...players].sort((a,b)=>config.mode==='wins'?(b.wins||0)-(a.wins||0):(b.total||0)-(a.total||0));
    await _saveSessionData(players,now,config);
    await db.set(`rooms/${session.code}`,{...room,status:'finished',endedAt:now,winner:{id:sorted[0]?.id,name:sorted[0]?.name,emoji:sorted[0]?.emoji}});
  }

  async function _saveSessionData(currentPlayers,now,config){
    const sorted=[...currentPlayers].sort((a,b)=>config.mode==='wins'?(b.wins||0)-(a.wins||0):(b.total||0)-(a.total||0));
    await saveSession({
      sessionId:session.code+"_"+room.startedAt,
      gameType:'generic',gameTitle:'⚔️ Partida Libre',
      customTitle:room.customTitle||'Partida Libre',
      startedAt:room.startedAt,endedAt:now,durationMs:now-room.startedAt,
      hostId:room.hostId,playerCount:currentPlayers.length,
      players:sorted.map((p,i)=>({
        id:p.id,name:p.name,emoji:p.emoji,color:p.color,
        finalPosition:i+1,eliminatedAt:null,
        survivalMs:now-room.startedAt,survivalLabel:fmtDuration(now-room.startedAt),
        points:p.total||null,wins:p.wins||null
      })),
      events:room.events||[]
    },session.demo);
  }

  if(showEndScreen) return <GenericEndScreen room={room} myId={myId} onBack={onBack}/>;

  return(
    <div className="os-wrap">
      <div className="os-header">
        <div>
          <div className="os-logo">BOARD<span>GAMEZ</span></div>
          <div className="os-logo-sub">OS · {(room.customTitle||'PARTIDA').toUpperCase()}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="match-timer">{fmtDuration(elapsed)}</div>
          <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(255,255,255,.3)',letterSpacing:1}}>
            RONDA {currentRound}{totalRounds?`/${totalRounds}`:''}
          </div>
        </div>
      </div>

      <div className="os-page" style={{paddingTop:16}}>
        <div className="match-header anim-fade">
          <div>
            <div className="match-title">{room.customTitle||'Partida Libre'}</div>
            <div className="match-meta">
              {config.mode==='points'?`🏅 ${config.useTarget?`Meta: ${config.targetScore}pts`:'Sin meta'}`:
               config.mode==='wins'?'🏆 Victorias':'💀 Supervivencia'}
              · {players.length} JUG.
            </div>
          </div>
          <div className="os-tag cyan">● RONDA {currentRound}</div>
        </div>

        {/* MARCADOR */}
        <div className="os-section">MARCADOR</div>
        {sortedPlayers.map((p,i)=>(
          <div key={p.id} className={`player-row ${i===0?'winner-row':''} anim-fade`}
            style={{animationDelay:i*.05+'s',marginBottom:6,cursor:isHost?'pointer':'default'}}
            onClick={()=>isHost&&setEditingPlayer(p.id)}>
            <div className="player-pos">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
            <div className="player-emoji">{p.emoji}</div>
            <div style={{flex:1}}>
              <div className="player-name" style={{color:p.color||'#fff'}}>
                {p.name}
                {p.id===myId&&<span style={{fontFamily:'var(--font-ui)',fontSize:'.5rem',color:'var(--cyan)',letterSpacing:2,marginLeft:5}}>TÚ</span>}
                {isHost&&<span style={{fontFamily:'var(--font-ui)',fontSize:'.45rem',color:'rgba(255,255,255,.2)',letterSpacing:1,marginLeft:5}}>✏️</span>}
              </div>
              {config.mode!=='wins'&&(p.rounds||[]).length>0&&(
                <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',fontWeight:600,color:'rgba(255,255,255,.3)',letterSpacing:1,marginTop:1}}>
                  Última ronda: +{(p.rounds[p.rounds.length-1]?.score||0)}pts
                </div>
              )}
            </div>
            <div style={{textAlign:'right'}}>
              <div className="player-stat" style={{color:i===0?'var(--gold)':'rgba(255,255,255,.6)'}}>
                {config.mode==='wins'?(p.wins||0)+'🏆':(p.total||0)+'pts'}
              </div>
            </div>
          </div>
        ))}

        {/* PANEL DE RONDA — solo host */}
        {isHost&&(
          <>
            <div className="os-section" style={{marginTop:20}}>RONDA {currentRound}{totalRounds?` DE ${totalRounds}`:''}</div>
            <div className="round-box">
              {/* Captura de puntos */}
              {config.mode!=='wins'&&(
                <>
                  <div className="round-box-title">PUNTOS DE ESTA RONDA</div>
                  {players.map(p=>(
                    <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <div style={{fontSize:'1.3rem',width:30}}>{p.emoji}</div>
                      <div style={{flex:1,fontFamily:'var(--font-body)',fontWeight:700,fontSize:'var(--fs-sm)',color:p.color||'#fff'}}>{p.name}</div>
                      <input type="number" className="os-input"
                        style={{width:90,marginBottom:0,textAlign:'center',padding:'10px 8px'}}
                        placeholder="0" min="0" max="99999"
                        value={scoreInputs[p.id]||''}
                        onChange={e=>setScoreInputs({...scoreInputs,[p.id]:e.target.value})}/>
                    </div>
                  ))}
                  <div className="os-divider"/>
                </>
              )}

              {/* Seleccionar ganador de ronda */}
              <div className="round-box-title">GANADOR DE ESTA RONDA</div>
              {players.map(p=>(
                <button key={p.id}
                  className={`btn ${roundWinner===p.id?'btn-cyan':'btn-ghost'}`}
                  style={{marginBottom:8,justifyContent:'flex-start',gap:12,padding:'12px 14px'}}
                  onClick={()=>{snd('tap');setRoundWinner(p.id);}}>
                  <span style={{fontSize:'1.3rem'}}>{p.emoji}</span>
                  <span style={{color:roundWinner===p.id?'var(--bg)':p.color||'#fff',fontWeight:700}}>
                    {p.name}
                  </span>
                  {config.mode!=='wins'&&(
                    <span style={{marginLeft:'auto',fontSize:'var(--fs-xs)',opacity:.7}}>
                      +{scoreInputs[p.id]||0} pts
                    </span>
                  )}
                  {roundWinner===p.id&&<span style={{marginLeft:'auto'}}>✓</span>}
                </button>
              ))}
            </div>

            {/* ACCIONES DE RONDA */}
            <div style={{display:'flex',gap:8,marginBottom:10}}>
              <button className="btn btn-green" style={{flex:1,marginBottom:0}}
                onClick={()=>closeRound(roundWinner)}
                disabled={!roundWinner}>
                ✓ Cerrar ronda {currentRound}
              </button>
            </div>

            {/* Terminar partida (siempre visible para host, especialmente en modo libre) */}
            {(isFreeSessions||true)&&(
              <button className="btn btn-red" onClick={endMatchNow}>
                🏁 Terminar partida
              </button>
            )}
          </>
        )}

        {/* Vista de jugadores no-host */}
        {!isHost&&(
          <div className="os-alert alert-cyan" style={{marginTop:16,justifyContent:'center',textAlign:'center'}}>
            ⏳ Esperando que el host cierre la ronda...
          </div>
        )}

        <div className="g16"/>
        <button className="btn btn-ghost" onClick={onBack}>← Volver al menú</button>
      </div>
    </div>
  );
}

// ── GENERIC END SCREEN ──────────────────────────────────────────
function GenericEndScreen({room,myId,onBack}){
  const config=room.config||{};
  const players=[...(room.players||[])].sort((a,b)=>
    config.mode==='wins'?(b.wins||0)-(a.wins||0):(b.total||0)-(a.total||0)
  );
  const winner=players[0];
  const totalDuration=room.endedAt&&room.startedAt?fmtDuration(room.endedAt-room.startedAt):'—';
  const confetti=Array.from({length:30},(_,i)=>({
    id:i,c:['#FFD447','#FF6B35','#00F5FF','#00FF9D','#9B5DE5'][i%5],
    l:Math.round(Math.random()*100)+"%",dl:Math.round(Math.random()*20)/10+"s",
    dr:Math.round((2+Math.random()*2.5)*10)/10+"s",sz:Math.round(6+Math.random()*8)+"px"
  }));
  React.useEffect(()=>{snd('victory');},[]);
  return(
    <div className="end-screen">
      <div className="end-confetti">
        {confetti.map(d=>(
          <div key={d.id} style={{position:'absolute',background:d.c,width:d.sz,height:d.sz,left:d.l,top:-20,borderRadius:Math.random()>.5?'50%':'3px',animation:`confettiFall ${d.dr} ${d.dl} linear infinite`}}/>
        ))}
      </div>
      <div className="end-trophy">🏆</div>
      <div className="end-label">CAMPEÓN</div>
      <div className="end-gamename">{room.customTitle||'PARTIDA LIBRE'}</div>
      {winner&&(
        <>
          <div style={{fontSize:'2.6rem',marginBottom:6}}>{winner.emoji}</div>
          <div className="end-winner-name" style={{color:winner.color||'#fff'}}>{winner.name}</div>
          <div className="end-stats">
            {config.mode==='wins'?`${winner.wins||0} VICTORIAS · ${totalDuration}`:`${winner.total||0} PUNTOS · ${totalDuration}`}
          </div>
        </>
      )}
      <div style={{width:'100%',maxWidth:380,marginBottom:24}}>
        {players.map((p,i)=>(
          <div key={p.id} className={`player-row ${i===0?'winner-row':''}`} style={{marginBottom:6}}>
            <div className="player-pos">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
            <div className="player-emoji">{p.emoji}</div>
            <div style={{flex:1}}>
              <div className="player-name" style={{color:p.color||'#fff'}}>
                {p.name}{p.id===myId&&<span style={{fontFamily:'var(--font-ui)',fontSize:'.5rem',color:'var(--cyan)',letterSpacing:2,marginLeft:5}}>TÚ</span>}
              </div>
            </div>
            <div className="player-stat" style={{color:i===0?'var(--gold)':'rgba(255,255,255,.55)'}}>
              {config.mode==='wins'?(p.wins||0)+'🏆':(p.total||0)+'pts'}
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-cyan" style={{maxWidth:320}} onClick={onBack}>🏠 Volver al menú</button>
    </div>
  );
}
