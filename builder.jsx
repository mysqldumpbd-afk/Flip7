// ═══════════════════════════════════════════════════════════════
// builder.jsx — BOARDGAMEZ OS v1.2
// Game Engine Builder: Auth + 5 secciones MVP
// Guarda templates en Firebase por usuario autenticado
// ═══════════════════════════════════════════════════════════════

// ── AUTH SCREEN ──────────────────────────────────────────────────
function AuthScreen({ onAuth, onSkip }){
  const [mode, setMode] = React.useState('choose'); // choose | email-in | email-up
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  async function handleGoogle(){
    setLoading(true); setError('');
    try{
      const r = await authSignInGoogle();
      onAuth(r.user);
    } catch(e){
      setError('Error con Google: ' + (e.message||'intenta de nuevo'));
      setLoading(false);
    }
  }

  async function handleEmail(isSignUp){
    if(!email.trim() || !password.trim()){ setError('Completa email y contraseña'); return; }
    if(password.length < 6){ setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true); setError('');
    try{
      const r = isSignUp
        ? await authSignUpEmail(email.trim(), password)
        : await authSignInEmail(email.trim(), password);
      onAuth(r.user);
    } catch(e){
      const msg = e.code === 'auth/user-not-found' ? 'Usuario no encontrado'
        : e.code === 'auth/wrong-password' ? 'Contraseña incorrecta'
        : e.code === 'auth/email-already-in-use' ? 'Este email ya está registrado'
        : e.code === 'auth/invalid-email' ? 'Email inválido'
        : (e.message || 'Error de autenticación');
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="os-wrap">
      <div className="os-header">
        <div>
          <div className="os-logo">BOARD<span>GAMEZ</span></div>
          <div className="os-logo-sub">OS · GAME BUILDER</div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{width:'auto'}} onClick={onSkip}>
          Después →
        </button>
      </div>

      <div className="os-page" style={{paddingTop:16}}>
        {/* Hero */}
        <div style={{
          textAlign:'center',
          background:'linear-gradient(135deg,rgba(155,93,229,.08),rgba(0,245,255,.04))',
          border:'1px solid rgba(155,93,229,.25)',
          borderRadius:18,padding:'24px 20px',marginBottom:24
        }}>
          <div style={{fontSize:'3rem',marginBottom:10}}>🎮</div>
          <div style={{fontFamily:'var(--font-display)',fontSize:'1.5rem',letterSpacing:2,
            background:'linear-gradient(135deg,var(--purple),var(--cyan))',
            WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:6}}>
            GAME BUILDER
          </div>
          <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-sm)',fontWeight:600,
            color:'rgba(255,255,255,.45)',letterSpacing:1,lineHeight:1.5}}>
            Crea y guarda la configuración de tus juegos.<br/>
            La próxima vez solo la cargas y juegas.
          </div>
        </div>

        {mode==='choose' && (
          <div className="anim-fade">
            <div className="os-section">INICIAR SESIÓN</div>

            <button className="btn" style={{
              background:'#fff',color:'#333',marginBottom:12,
              border:'none',fontFamily:'var(--font-body)',fontWeight:700,
              fontSize:'var(--fs-sm)'
            }} onClick={handleGoogle} disabled={loading}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar con Google
            </button>

            <div style={{display:'flex',alignItems:'center',gap:10,margin:'16px 0'}}>
              <div style={{flex:1,height:1,background:'rgba(255,255,255,.1)'}}/>
              <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(255,255,255,.3)',letterSpacing:2}}>O CON EMAIL</div>
              <div style={{flex:1,height:1,background:'rgba(255,255,255,.1)'}}/>
            </div>

            <button className="btn btn-ghost" onClick={()=>setMode('email-in')}>
              📧 Iniciar sesión con email
            </button>
            <button className="btn btn-ghost" onClick={()=>setMode('email-up')}>
              ✨ Crear cuenta nueva
            </button>

            {error && <div className="os-alert alert-red" style={{marginTop:12}}>{error}</div>}
          </div>
        )}

        {(mode==='email-in'||mode==='email-up') && (
          <div className="anim-fade">
            <div className="os-section">
              {mode==='email-up' ? 'CREAR CUENTA' : 'INICIAR SESIÓN'}
            </div>
            <input className="os-input" type="email" placeholder="tu@email.com"
              value={email} onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleEmail(mode==='email-up')}/>
            <input className="os-input" type="password"
              placeholder={mode==='email-up'?'Contraseña (mín. 6 caracteres)':'Contraseña'}
              value={password} onChange={e=>setPassword(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleEmail(mode==='email-up')}/>

            {error && <div className="os-alert alert-red">{error}</div>}

            <button className="btn btn-cyan" disabled={loading}
              onClick={()=>handleEmail(mode==='email-up')}>
              {loading ? '⏳ ...' : mode==='email-up' ? '✨ Crear cuenta' : '🔑 Iniciar sesión'}
            </button>
            <button className="btn btn-ghost" onClick={()=>{setMode('choose');setError('');}}>
              ← Atrás
            </button>

            {mode==='email-in' && (
              <div style={{textAlign:'center',marginTop:8}}>
                <span style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(255,255,255,.3)'}}>
                  ¿No tienes cuenta?{' '}
                </span>
                <button style={{background:'none',border:'none',color:'var(--cyan)',cursor:'pointer',fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',fontWeight:700}}
                  onClick={()=>setMode('email-up')}>
                  Crear una
                </button>
              </div>
            )}
          </div>
        )}

        <div className="g16"/>
        <div style={{
          background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',
          borderRadius:12,padding:'12px 14px',
          fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',
          color:'rgba(255,255,255,.3)',letterSpacing:1,lineHeight:1.6
        }}>
          🔒 Tu cuenta solo se usa para guardar tus juegos en la nube.
          Puedes jugar sin cuenta — solo no podrás guardar configuraciones.
        </div>
      </div>
    </div>
  );
}

// ── MY GAMES SCREEN ──────────────────────────────────────────────
function MyGamesScreen({ user, onBack, onBuildNew, onEditTemplate, onPlayTemplate, onSignOut }){
  const [templates, setTemplates] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [deleting, setDeleting] = React.useState(null);

  React.useEffect(()=>{
    if(!user) return;
    loadGameTemplates(user.uid).then(t=>{ setTemplates(t); setLoading(false); });
  },[user?.uid]);

  async function handleDelete(t){
    if(!window.confirm(`¿Borrar "${t.name}"?`)) return;
    snd('delete');
    setDeleting(t.id);
    await deleteGameTemplate(user.uid, t.id);
    setTemplates(prev=>prev.filter(x=>x.id!==t.id));
    setDeleting(null);
  }

  // Colores por modo de victoria
  const modeColor = m => m==='points'?'var(--gold)':m==='wins'?'var(--cyan)':m==='elimination'?'var(--red)':'var(--purple)';
  const modeLabel = m => m==='points'?'Puntos':m==='wins'?'Victorias':m==='elimination'?'Eliminación':'Manual';

  return (
    <div className="os-wrap">
      <div className="os-header">
        <button className="btn btn-ghost btn-sm" style={{width:'auto'}} onClick={onBack}>← Home</button>
        <div className="os-logo" style={{fontSize:'1.1rem'}}>MIS <span>JUEGOS</span></div>
        {user && (
          <button className="btn btn-ghost btn-sm" style={{width:'auto',fontSize:'var(--fs-micro)'}}
            onClick={onSignOut}>
            {user.photoURL
              ? <img src={user.photoURL} style={{width:22,height:22,borderRadius:'50%'}} alt=""/>
              : '👤'
            }
          </button>
        )}
      </div>

      <div className="os-page" style={{paddingTop:16}}>
        {/* Usuario */}
        <div style={{
          display:'flex',alignItems:'center',gap:10,
          background:'rgba(155,93,229,.06)',border:'1px solid rgba(155,93,229,.2)',
          borderRadius:12,padding:'10px 14px',marginBottom:16
        }}>
          <div style={{fontSize:'1.4rem'}}>{user?.photoURL?<img src={user.photoURL} style={{width:28,height:28,borderRadius:'50%'}} alt=""/>:'👤'}</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:'var(--font-body)',fontWeight:700,fontSize:'var(--fs-sm)',color:'var(--purple)'}}>
              {user?.displayName || user?.email || 'Usuario'}
            </div>
            <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(255,255,255,.35)',letterSpacing:1,marginTop:1}}>
              {templates.length} juego{templates.length!==1?'s':''} guardado{templates.length!==1?'s':''}
            </div>
          </div>
        </div>

        {/* Botón crear nuevo */}
        <button className="btn btn-purple" style={{marginBottom:20}} onClick={()=>{snd('tap');onBuildNew();}}>
          + Crear nuevo juego
        </button>

        {loading && (
          <div style={{textAlign:'center',padding:'40px 0'}}>
            <div className="os-spin" style={{marginBottom:12}}/>
            <div style={{fontFamily:'var(--font-label)',color:'rgba(255,255,255,.35)',letterSpacing:2}}>CARGANDO...</div>
          </div>
        )}

        {!loading && templates.length===0 && (
          <div className="os-empty">
            <div style={{fontSize:'3rem',marginBottom:12}}>🎮</div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'1rem',letterSpacing:1,marginBottom:6}}>Sin juegos aún</div>
            <div style={{fontSize:'var(--fs-sm)'}}>Crea tu primer juego con el builder y aparecerá aquí</div>
          </div>
        )}

        {!loading && templates.map((t,i)=>(
          <div key={t.id} className="anim-fade" style={{
            background:'var(--surface)',
            border:`1px solid ${modeColor(t.config?.victoryMode)}44`,
            borderRadius:16,padding:'14px 15px',marginBottom:10,
            animationDelay: i*.05+'s'
          }}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
              <div style={{
                fontSize:'2rem',width:50,height:50,
                borderRadius:13,display:'flex',alignItems:'center',justifyContent:'center',
                background:`${modeColor(t.config?.victoryMode)}18`,
                border:`1px solid ${modeColor(t.config?.victoryMode)}33`,
                flexShrink:0
              }}>{t.emoji||'🎮'}</div>
              <div style={{flex:1}}>
                <div style={{fontFamily:'var(--font-display)',fontSize:'1.1rem',letterSpacing:1,color:'#fff'}}>
                  {t.name}
                </div>
                <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',fontWeight:600,
                  color:'rgba(255,255,255,.4)',letterSpacing:1,marginTop:2}}>
                  {t.description||describeTemplate(t)}
                </div>
              </div>
            </div>

            {/* Tags de config */}
            <div className="os-tags" style={{marginBottom:12}}>
              <div className="os-tag" style={{
                background:`${modeColor(t.config?.victoryMode)}18`,
                borderColor:`${modeColor(t.config?.victoryMode)}44`,
                color:modeColor(t.config?.victoryMode)
              }}>
                {t.config?.victoryMode==='points'?'🏅':t.config?.victoryMode==='wins'?'🏆':t.config?.victoryMode==='elimination'?'💀':'🎯'}
                {' '}{modeLabel(t.config?.victoryMode||'points')}
              </div>
              {t.config?.useRounds && (
                <div className="os-tag">
                  {t.config?.rounds==='libre'?'∞ Libre':`${t.config?.rounds} rondas`}
                </div>
              )}
              {t.config?.type && (
                <div className="os-tag">{t.config.type==='teams'?'👥 Equipos':'👤 Individual'}</div>
              )}
              {t.config?.tools?.length>0 && (
                <div className="os-tag purple">🎲 {t.config.tools.length} herr.</div>
              )}
              <div className="os-tag" style={{fontSize:'.6rem',color:'rgba(255,255,255,.25)'}}>
                {fmtShortDate(t.updatedAt||t.createdAt)}
              </div>
            </div>

            {/* Acciones */}
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-cyan btn-sm" style={{flex:1,marginBottom:0}}
                onClick={()=>{snd('tap');onPlayTemplate(t);}}>
                ▶ Jugar
              </button>
              <button className="btn btn-ghost btn-sm" style={{flex:.6,marginBottom:0}}
                onClick={()=>{snd('tap');onEditTemplate(t);}}>
                ✏️ Editar
              </button>
              <button className="btn btn-sm" style={{
                marginBottom:0,background:'rgba(255,59,92,.1)',border:'1px solid rgba(255,59,92,.25)',
                color:'var(--red)',borderRadius:9,padding:'9px 12px',cursor:'pointer',
                fontFamily:'var(--font-display)',fontSize:'var(--fs-xs)',opacity:deleting===t.id?.5:1
              }} onClick={()=>handleDelete(t)}>
                {deleting===t.id?'...':'🗑'}
              </button>
            </div>
          </div>
        ))}

        <div className="g16"/>
      </div>
    </div>
  );
}

// ── GAME BUILDER WIZARD ──────────────────────────────────────────
function GameBuilder({ user, editingTemplate, onBack, onSaved }){
  const TOTAL_STEPS = 5;
  const [step, setStep] = React.useState(1);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  // Estado completo del template
  const [tmpl, setTmpl] = React.useState(()=>{
    if(editingTemplate) return { ...editingTemplate };
    return {
      id: null,
      name: '',
      emoji: '🎮',
      description: '',
      // Sec 1
      type: 'individual',      // individual | teams
      minPlayers: 2,
      maxPlayers: 8,
      // Sec 2 — Estructura
      useRounds: true,
      rounds: 3,               // número | 'libre'
      roundClose: 'manual',    // manual | timer
      roundTimerSecs: 60,
      // Sec 3 — Victoria
      victoryMode: 'points',   // points | wins | elimination | manual
      useTarget: false,
      targetScore: 100,
      tiebreak: 'share',       // share | tool | host
      // Sec 4 — Puntos
      accumulates: 'points',   // points | wins | lives
      scoreSign: 'positive',   // positive | both
      capturedBy: 'host',      // host | self | all
      scoreVisibility: 'all',  // all | host | hidden
      // Sec 5 — Herramientas
      tools: [],               // ['coin','dice','wheel','ai']
      diceType: 'd6',
    };
  });

  function upd(field, value){ setTmpl(prev=>({...prev, [field]:value})); }
  function toggleTool(tool){
    setTmpl(prev=>({
      ...prev,
      tools: prev.tools.includes(tool)
        ? prev.tools.filter(t=>t!==tool)
        : [...prev.tools, tool]
    }));
  }

  async function handleSave(){
    if(!tmpl.name.trim()){ alert('El juego necesita un nombre'); return; }
    setSaving(true);
    snd('save');
    const saved = await saveGameTemplate(user.uid, {
      ...tmpl,
      config: {
        type: tmpl.type,
        minPlayers: tmpl.minPlayers,
        maxPlayers: tmpl.maxPlayers,
        useRounds: tmpl.useRounds,
        rounds: tmpl.rounds,
        roundClose: tmpl.roundClose,
        roundTimerSecs: tmpl.roundTimerSecs,
        victoryMode: tmpl.victoryMode,
        useTarget: tmpl.useTarget,
        targetScore: tmpl.targetScore,
        tiebreak: tmpl.tiebreak,
        accumulates: tmpl.accumulates,
        scoreSign: tmpl.scoreSign,
        capturedBy: tmpl.capturedBy,
        scoreVisibility: tmpl.scoreVisibility,
        tools: tmpl.tools,
        diceType: tmpl.diceType,
      }
    });
    setSaving(false);
    setSaved(true);
    setTimeout(()=>onSaved(saved), 1200);
  }

  const stepTitles = ['IDENTIDAD','ESTRUCTURA','VICTORIA','PUNTOS','HERRAMIENTAS'];
  const canNext = step===1 ? tmpl.name.trim().length>=2 : true;

  // ── Sección helpers ──
  function OptionRow({ label, sub, active, onClick, color='var(--cyan)' }){
    return(
      <div className="check-row" style={{borderColor:active?color+'88':undefined,background:active?color+'12':undefined}}
        onClick={onClick}>
        <div className="check-box" style={{borderColor:active?color:undefined,background:active?color:undefined,color:active?'var(--bg)':undefined}}>
          {active?'✓':''}
        </div>
        <div>
          <div className="check-label">{label}</div>
          {sub && <div className="check-sub">{sub}</div>}
        </div>
      </div>
    );
  }

  function SelectRow({ label, options, value, onChange }){
    return(
      <div style={{marginBottom:14}}>
        <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',fontWeight:700,
          color:'rgba(255,255,255,.4)',letterSpacing:2,marginBottom:8,textTransform:'uppercase'}}>
          {label}
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {options.map(o=>(
            <button key={o.value} onClick={()=>{snd('tap');onChange(o.value);}}
              style={{
                background:value===o.value?'var(--cyan)':'rgba(255,255,255,.06)',
                border:`1px solid ${value===o.value?'var(--cyan)':'rgba(255,255,255,.12)'}`,
                color:value===o.value?'var(--bg)':'rgba(255,255,255,.55)',
                borderRadius:9,padding:'8px 14px',cursor:'pointer',
                fontFamily:'var(--font-display)',fontSize:'var(--fs-xs)',letterSpacing:1,
                transition:'all .15s'
              }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if(saved){
    return(
      <div className="os-wrap">
        <div className="os-page" style={{paddingTop:80,textAlign:'center'}}>
          <div style={{fontSize:'4rem',marginBottom:16,animation:'trophyFloat 1s ease infinite'}}>💾</div>
          <div style={{fontFamily:'var(--font-display)',fontSize:'1.5rem',letterSpacing:2,
            background:'linear-gradient(135deg,var(--purple),var(--cyan))',
            WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:8}}>
            ¡GUARDADO!
          </div>
          <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-sm)',fontWeight:600,
            color:'rgba(255,255,255,.4)',letterSpacing:1}}>
            "{tmpl.name}" listo para jugar
          </div>
        </div>
      </div>
    );
  }

  return(
    <div className="os-wrap">
      {/* Header con progreso */}
      <div className="os-header">
        <button className="btn btn-ghost btn-sm" style={{width:'auto'}}
          onClick={()=>step>1?setStep(step-1):onBack()}>← {step>1?stepTitles[step-2]:'Mis juegos'}</button>
        <div style={{fontFamily:'var(--font-ui)',fontSize:'.6rem',color:'rgba(0,245,255,.5)',letterSpacing:3}}>
          {step}/{TOTAL_STEPS}
        </div>
        <div style={{fontFamily:'var(--font-ui)',fontSize:'.55rem',color:'rgba(255,255,255,.3)',letterSpacing:2,maxWidth:80,textAlign:'right'}}>
          {stepTitles[step-1]}
        </div>
      </div>

      {/* Barra de progreso */}
      <div style={{height:3,background:'rgba(255,255,255,.06)',position:'relative',zIndex:10}}>
        <div style={{
          height:'100%',
          width:`${(step/TOTAL_STEPS)*100}%`,
          background:'linear-gradient(90deg,var(--purple),var(--cyan))',
          transition:'width .3s ease',
          boxShadow:'0 0 8px rgba(0,245,255,.4)'
        }}/>
      </div>

      <div className="os-page" style={{paddingTop:16}}>

        {/* ── PASO 1: IDENTIDAD ── */}
        {step===1 && (
          <div className="anim-fade">
            {/* Emoji picker compacto */}
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{
                fontSize:'4rem',
                width:80,height:80,borderRadius:20,
                background:'rgba(155,93,229,.1)',border:'2px solid rgba(155,93,229,.3)',
                display:'inline-flex',alignItems:'center',justifyContent:'center',
                marginBottom:10,cursor:'pointer',transition:'all .2s'
              }}>
                {tmpl.emoji}
              </div>
              <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(0,245,255,.5)',letterSpacing:2}}>
                TOCA PARA CAMBIAR
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center',marginTop:10}}>
                {GAME_EMOJIS.map((e,i)=>(
                  <div key={i}
                    style={{
                      fontSize:'1.5rem',width:40,height:40,borderRadius:10,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      cursor:'pointer',transition:'all .15s',
                      background:tmpl.emoji===e?'rgba(155,93,229,.25)':'rgba(255,255,255,.05)',
                      border:`2px solid ${tmpl.emoji===e?'var(--purple)':'transparent'}`,
                    }}
                    onClick={()=>{snd('tap');upd('emoji',e);}}>
                    {e}
                  </div>
                ))}
              </div>
            </div>

            <div className="os-section">NOMBRE DEL JUEGO</div>
            <input className="os-input" placeholder="Ej: Mi Catan, UNO Brutal, Dominó Clásico..."
              value={tmpl.name} onChange={e=>upd('name',e.target.value)} autoFocus maxLength={40}/>
            <input className="os-input" placeholder="Descripción corta (opcional)"
              value={tmpl.description} onChange={e=>upd('description',e.target.value)} maxLength={80}/>

            <div className="os-section">TIPO DE PARTIDA</div>
            <OptionRow label="👤 Individual" sub="Cada jugador compite por su cuenta"
              active={tmpl.type==='individual'} onClick={()=>{snd('tap');upd('type','individual');}}/>
            <OptionRow label="👥 Por equipos" sub="Jugadores agrupados en equipos"
              active={tmpl.type==='teams'} onClick={()=>{snd('tap');upd('type','teams');}}/>

            <div className="os-section">NÚMERO DE JUGADORES</div>
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16}}>
              <div style={{flex:1}}>
                <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(255,255,255,.4)',letterSpacing:2,marginBottom:6}}>MÍNIMO</div>
                <select className="os-select" style={{marginBottom:0}} value={tmpl.minPlayers}
                  onChange={e=>upd('minPlayers',parseInt(e.target.value))}>
                  {[2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(255,255,255,.4)',letterSpacing:2,marginBottom:6}}>MÁXIMO</div>
                <select className="os-select" style={{marginBottom:0}} value={tmpl.maxPlayers}
                  onChange={e=>upd('maxPlayers',parseInt(e.target.value))}>
                  {[2,3,4,5,6,7,8,10,12,16,20].map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── PASO 2: ESTRUCTURA ── */}
        {step===2 && (
          <div className="anim-fade">
            <div className="os-section">¿SE JUEGA POR RONDAS?</div>
            <OptionRow label="Sí, hay rondas" sub="La partida se divide en rondas numeradas"
              active={tmpl.useRounds} onClick={()=>{snd('tap');upd('useRounds',true);}}/>
            <OptionRow label="No, partida continua" sub="Sin división en rondas, flujo libre"
              active={!tmpl.useRounds} onClick={()=>{snd('tap');upd('useRounds',false);}}/>

            {tmpl.useRounds && (
              <>
                <div className="os-section">NÚMERO DE RONDAS</div>
                <select className="os-select" value={tmpl.rounds}
                  onChange={e=>upd('rounds', e.target.value==='libre'?'libre':parseInt(e.target.value))}>
                  {Array.from({length:20},(_,i)=>i+1).map(n=>(
                    <option key={n} value={n}>{n} ronda{n>1?'s':''}</option>
                  ))}
                  <option value="libre">∞ Libre (cierre manual)</option>
                </select>

                <div className="os-section">CIERRE DE RONDA</div>
                <OptionRow label="Manual" sub="El host cierra la ronda cuando lo decide"
                  active={tmpl.roundClose==='manual'} onClick={()=>{snd('tap');upd('roundClose','manual');}}/>
                <OptionRow label="Por tiempo" sub="La ronda cierra automáticamente al acabar el timer"
                  active={tmpl.roundClose==='timer'} onClick={()=>{snd('tap');upd('roundClose','timer');}}/>

                {tmpl.roundClose==='timer' && (
                  <>
                    <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(255,255,255,.4)',letterSpacing:2,marginBottom:8,textTransform:'uppercase'}}>
                      Segundos por ronda
                    </div>
                    <select className="os-select" value={tmpl.roundTimerSecs}
                      onChange={e=>upd('roundTimerSecs',parseInt(e.target.value))}>
                      {[15,30,45,60,90,120,180,300,600].map(s=>(
                        <option key={s} value={s}>{s<60?s+' seg':Math.floor(s/60)+' min'+(s%60?' '+s%60+' seg':'')}</option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── PASO 3: VICTORIA ── */}
        {step===3 && (
          <div className="anim-fade">
            <div className="os-section">CONDICIÓN DE VICTORIA</div>

            {[
              {v:'points', icon:'🏅', label:'Por puntos acumulados', sub:'Gana quien más puntos tenga o llegue primero a la meta', color:'var(--gold)'},
              {v:'wins',   icon:'🏆', label:'Por victorias de ronda', sub:'Se cuentan rondas ganadas, no puntos', color:'var(--cyan)'},
              {v:'elimination', icon:'💀', label:'Por eliminación', sub:'Se van eliminando jugadores hasta que queda uno', color:'var(--red)'},
              {v:'manual', icon:'🎯', label:'Manual / Decisión del host', sub:'El host decide cuándo y quién gana', color:'var(--purple)'},
            ].map(m=>(
              <div key={m.v} className="os-card" style={{
                marginBottom:8,padding:'13px 14px',cursor:'pointer',
                borderColor:tmpl.victoryMode===m.v?m.color+'88':undefined,
                background:tmpl.victoryMode===m.v?m.color+'10':undefined
              }} onClick={()=>{snd('tap');upd('victoryMode',m.v);}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{fontSize:'1.8rem'}}>{m.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:'var(--font-display)',fontSize:'var(--fs-sm)',letterSpacing:1,
                      color:tmpl.victoryMode===m.v?m.color:'#fff'}}>{m.label}</div>
                    <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',fontWeight:600,
                      color:'rgba(255,255,255,.4)',letterSpacing:1,marginTop:2}}>{m.sub}</div>
                  </div>
                  {tmpl.victoryMode===m.v && <div style={{color:m.color,fontSize:'1.3rem'}}>✓</div>}
                </div>
              </div>
            ))}

            {/* Meta de puntos */}
            {tmpl.victoryMode==='points' && (
              <>
                <div className="os-section">META DE PUNTOS</div>
                <OptionRow label="¿Con meta numérica?" sub="Si no, gana quien más tenga al cerrar la partida"
                  active={tmpl.useTarget} onClick={()=>{snd('tap');upd('useTarget',!tmpl.useTarget);}}
                  color="var(--gold)"/>
                {tmpl.useTarget && (
                  <input className="os-input" type="number" min="1" max="99999"
                    placeholder="Meta de puntos (ej: 200)"
                    value={tmpl.targetScore||''}
                    onChange={e=>upd('targetScore',Math.min(99999,parseInt(e.target.value)||0))}/>
                )}
              </>
            )}

            {/* Desempate */}
            <div className="os-section">DESEMPATE</div>
            <SelectRow value={tmpl.tiebreak} onChange={v=>upd('tiebreak',v)} label="" options={[
              {value:'share', label:'Compartir'},
              {value:'tool',  label:'Herramienta'},
              {value:'host',  label:'Host decide'},
            ]}/>
          </div>
        )}

        {/* ── PASO 4: PUNTOS ── */}
        {step===4 && (
          <div className="anim-fade">
            <div className="os-section">¿QUÉ SE ACUMULA?</div>
            <SelectRow value={tmpl.accumulates} onChange={v=>upd('accumulates',v)} label="" options={[
              {value:'points', label:'🏅 Puntos'},
              {value:'wins',   label:'🏆 Victorias'},
              {value:'lives',  label:'❤️ Vidas'},
            ]}/>

            <div className="os-section">TIPO DE VALORES</div>
            <OptionRow label="Solo positivos" sub="Los puntos solo suman"
              active={tmpl.scoreSign==='positive'} onClick={()=>{snd('tap');upd('scoreSign','positive');}}/>
            <OptionRow label="Positivos y negativos" sub="Se pueden sumar y restar puntos"
              active={tmpl.scoreSign==='both'} onClick={()=>{snd('tap');upd('scoreSign','both');}}/>

            <div className="os-section">¿QUIÉN CAPTURA PUNTOS?</div>
            {[
              {v:'host', label:'Solo el host', sub:'El host registra todos los puntajes'},
              {v:'self', label:'Cada jugador el suyo', sub:'Cada quien captura sus propios puntos'},
              {v:'all',  label:'Todos pueden', sub:'Cualquiera puede capturar puntos de cualquier jugador'},
            ].map(o=>(
              <OptionRow key={o.v} label={o.label} sub={o.sub}
                active={tmpl.capturedBy===o.v} onClick={()=>{snd('tap');upd('capturedBy',o.v);}}/>
            ))}

            <div className="os-section">VISIBILIDAD DEL MARCADOR</div>
            {[
              {v:'all',    label:'Todos ven todo', sub:'El marcador es público en tiempo real'},
              {v:'host',   label:'Solo el host', sub:'Los jugadores no ven el marcador en vivo'},
              {v:'hidden', label:'Oculto hasta fin de ronda', sub:'Se revela cuando el host cierra la ronda'},
            ].map(o=>(
              <OptionRow key={o.v} label={o.label} sub={o.sub}
                active={tmpl.scoreVisibility===o.v} onClick={()=>{snd('tap');upd('scoreVisibility',o.v);}}/>
            ))}
          </div>
        )}

        {/* ── PASO 5: HERRAMIENTAS ── */}
        {step===5 && (
          <div className="anim-fade">
            <div className="os-section">HERRAMIENTAS DISPONIBLES EN LA PARTIDA</div>
            <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-sm)',color:'rgba(255,255,255,.4)',marginBottom:14}}>
              Selecciona las que estarán disponibles durante la partida.
            </div>

            {[
              {id:'coin',  icon:'🪙', label:'Moneda',           sub:'Cara o cruz para desempates o decisiones'},
              {id:'dice',  icon:'🎲', label:'Dados',             sub:'Lanzar dado durante la partida'},
              {id:'wheel', icon:'🎡', label:'Ruleta / Spin Wheel', sub:'Girar ruleta con segmentos'},
              {id:'rps',   icon:'✊', label:'Piedra Papel Tijera', sub:'Resolver disputas o decidir orden'},
              {id:'ai',    icon:'🤖', label:'Juez IA',           sub:'IA como árbitro para resolver conflictos'},
            ].map(tool=>(
              <div key={tool.id} className="check-row"
                style={{
                  borderColor:tmpl.tools.includes(tool.id)?'rgba(0,245,255,.4)':undefined,
                  background:tmpl.tools.includes(tool.id)?'rgba(0,245,255,.06)':undefined
                }}
                onClick={()=>{snd('tap');toggleTool(tool.id);}}>
                <div style={{fontSize:'1.6rem',width:36,textAlign:'center',flexShrink:0}}>{tool.icon}</div>
                <div style={{flex:1}}>
                  <div className="check-label">{tool.label}</div>
                  <div className="check-sub">{tool.sub}</div>
                </div>
                <div className="check-box" style={{
                  borderColor:tmpl.tools.includes(tool.id)?'var(--cyan)':undefined,
                  background:tmpl.tools.includes(tool.id)?'var(--cyan)':undefined,
                  color:tmpl.tools.includes(tool.id)?'var(--bg)':undefined
                }}>
                  {tmpl.tools.includes(tool.id)?'✓':''}
                </div>
              </div>
            ))}

            {tmpl.tools.includes('dice') && (
              <>
                <div className="os-section">TIPO DE DADO</div>
                <SelectRow value={tmpl.diceType} onChange={v=>upd('diceType',v)} label="" options={[
                  {value:'d4', label:'d4'},
                  {value:'d6', label:'d6'},
                  {value:'d8', label:'d8'},
                  {value:'d10',label:'d10'},
                  {value:'d12',label:'d12'},
                  {value:'d20',label:'d20'},
                ]}/>
              </>
            )}

            {/* Resumen antes de guardar */}
            <div className="os-section" style={{marginTop:24}}>RESUMEN DEL JUEGO</div>
            <div style={{
              background:'linear-gradient(135deg,rgba(155,93,229,.08),rgba(0,245,255,.04))',
              border:'1px solid rgba(155,93,229,.2)',
              borderRadius:14,padding:'16px 15px',marginBottom:20
            }}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <div style={{fontSize:'2.5rem'}}>{tmpl.emoji}</div>
                <div>
                  <div style={{fontFamily:'var(--font-display)',fontSize:'1.2rem',letterSpacing:1}}>{tmpl.name}</div>
                  <div style={{fontFamily:'var(--font-label)',fontSize:'var(--fs-micro)',color:'rgba(255,255,255,.4)',letterSpacing:1,marginTop:2}}>
                    {tmpl.description||'Sin descripción'}
                  </div>
                </div>
              </div>
              <div className="os-tags">
                <div className="os-tag">{tmpl.type==='teams'?'👥 Equipos':'👤 Individual'}</div>
                <div className="os-tag">{tmpl.minPlayers}-{tmpl.maxPlayers} jugadores</div>
                <div className="os-tag">{tmpl.useRounds?(tmpl.rounds==='libre'?'∞ Libre':`${tmpl.rounds} rondas`):'Sin rondas'}</div>
                <div className="os-tag gold">{tmpl.victoryMode==='points'?'🏅 Puntos':tmpl.victoryMode==='wins'?'🏆 Victorias':tmpl.victoryMode==='elimination'?'💀 Eliminación':'🎯 Manual'}</div>
                {tmpl.tools.length>0 && <div className="os-tag purple">🎲 {tmpl.tools.length} herr.</div>}
              </div>
            </div>

            <button className="btn btn-purple" disabled={saving} onClick={handleSave}>
              {saving ? '⏳ Guardando...' : `💾 Guardar "${tmpl.name}"`}
            </button>
          </div>
        )}

        {/* Navegación */}
        <div className="g16"/>
        {step < TOTAL_STEPS && (
          <button className="btn btn-cyan" disabled={!canNext}
            onClick={()=>{snd('tap');setStep(step+1);}}>
            Siguiente → {stepTitles[step]}
          </button>
        )}
        <button className="btn btn-ghost" onClick={()=>step>1?setStep(step-1):onBack()}>
          {step>1?'← Atrás':'← Cancelar'}
        </button>
      </div>
    </div>
  );
}

// ── AUTH GATE — wrapper para proteger Game Builder ───────────────
function AuthGate({ onAuthChange, children }){
  const [user, setUser] = React.useState(undefined); // undefined=cargando

  React.useEffect(()=>{
    const unsub = authOnChange(u=>{ setUser(u||null); onAuthChange(u||null); });
    return ()=>unsub();
  },[]);

  if(user===undefined) return(
    <div className="os-wrap">
      <div className="os-page" style={{paddingTop:80,textAlign:'center'}}>
        <div className="os-spin" style={{marginBottom:16}}/>
        <div style={{fontFamily:'var(--font-label)',color:'rgba(255,255,255,.35)',letterSpacing:2}}>VERIFICANDO...</div>
      </div>
    </div>
  );

  return children(user);
}
