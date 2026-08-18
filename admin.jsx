// ═══════════════════════════════════════════════════════════════
// admin.jsx — FLIP 7: Panel Administrativo
// Acceso restringido a ADMIN_EMAIL. Muestra estadísticas generales de uso
// y los buzones de bugs / sugerencias que los jugadores mandan desde la app
// principal (ver FeedbackModal en components.jsx).
// Reutiliza _db / _auth / signInEmail / signInGoogle / signOut de app.js.
// ═══════════════════════════════════════════════════════════════

// Único correo con acceso al panel por ahora. Para agregar más admins en el
// futuro, lo más simple es convertir esto en una lista y usar .includes(),
// o mover el control a Firebase (config/admins/{uid}:true) si crece el equipo.
const ADMIN_EMAIL = "mysqldump.bd@gmail.com";

function fmtDate(ts){
  if(!ts)return "";
  return new Date(ts).toLocaleString("es-MX",{dateStyle:"medium",timeStyle:"short"});
}

// Mismo patrón de Error Boundary que la app principal (components.jsx) --
// si algo truena en el render, se ve un mensaje claro en vez de pantalla negra.
class AdminErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={hasError:false,msg:""};}
  static getDerivedStateFromError(error){return{hasError:true,msg:(error&&error.message)||"Error desconocido"};}
  componentDidCatch(error,info){console.error("Admin error:",error,info);}
  render(){
    if(this.state.hasError){
      return(
        <div className="wrap"><div className="page" style={{paddingTop:80,textAlign:"center"}}>
          <div style={{fontSize:"2.5rem",marginBottom:12}}>😵</div>
          <div style={{fontWeight:900,fontSize:"1rem",marginBottom:8}}>Algo salió mal en el panel</div>
          <div style={{color:"rgba(255,255,255,.5)",fontSize:".8rem",marginBottom:16}}>{this.state.msg}</div>
          <button className="btn btn-y" onClick={()=>window.location.reload()}>🔄 Recargar</button>
        </div></div>
      );
    }
    return this.props.children;
  }
}

function StatCard({icon,label,value,sub}){
  return(
    <div style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
      borderRadius:14,padding:"14px 16px",minWidth:140,flex:"1 1 140px"}}>
      <div style={{fontSize:"1.4rem",marginBottom:6}}>{icon}</div>
      <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.5rem",color:"var(--y)"}}>{value}</div>
      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".62rem",color:"rgba(255,255,255,.5)",
        letterSpacing:1,marginTop:2}}>{label}</div>
      {sub&&<div style={{fontSize:".68rem",color:"rgba(255,255,255,.35)",marginTop:4}}>{sub}</div>}
    </div>
  );
}

const STATUS_LABEL={new:"🆕 Nuevo",reviewed:"👀 Revisado",resolved:"✅ Resuelto"};
const STATUS_COLOR={
  new:{bg:"rgba(230,57,70,.15)",border:"rgba(230,57,70,.4)"},
  reviewed:{bg:"rgba(245,200,0,.15)",border:"rgba(245,200,0,.4)"},
  resolved:{bg:"rgba(59,178,115,.15)",border:"rgba(59,178,115,.4)"}
};
// Mismas listas que FEEDBACK_SCREENS/FEEDBACK_CATEGORIES en components.jsx --
// admin.jsx es un archivo aparte (sin build step, no puede importar del
// otro), así que se duplican solo los labels para mostrar el texto en vez
// del id crudo ("scanner" -> "📷 Escáner de cartas (IA)").
const SCREEN_LABEL={
  home:"🏠 Inicio",create:"➕ Crear sala",join:"🔑 Unirse a una sala",
  round:"🎲 Ronda / Marcador",table:"📋 Tabla de rondas",
  spectator:"📺 Marcador en vivo",scanner:"📷 Escáner de cartas (IA)",
  stats:"📊 Estadísticas",profile:"👤 Perfil",groups:"👥 Grupos",other:"❓ Otra"
};
const CATEGORY_LABEL={
  crash:"🖤 Se puso en negro / se cerró",notsaved:"💾 No se guardó el puntaje",
  ai:"🤖 Escáner de cartas (IA) falló",connection:"📡 No pudo conectarse",
  visual:"🎨 Error visual",other:"❓ Otro"
};

function FeedbackCard({it,onCycleStatus}){
  const[expanded,setExpanded]=React.useState(false);
  const st=it.status||"new";
  const col=STATUS_COLOR[st]||STATUS_COLOR.new;
  return(
    <div style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
      borderRadius:12,padding:"12px 14px",marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",color:"rgba(255,255,255,.45)"}}>
          {it.name||"Anónimo"} · {fmtDate(it.createdAt)}
          {it.email && <div style={{color:"rgba(255,255,255,.3)",marginTop:2}}>{it.email}</div>}
        </div>
        <button onClick={()=>onCycleStatus(it)} style={{
          background:col.bg,border:"1px solid "+col.border,borderRadius:20,padding:"4px 10px",
          fontSize:".65rem",fontFamily:"'Righteous',sans-serif",color:"#fff",cursor:"pointer",whiteSpace:"nowrap"
        }}>{STATUS_LABEL[st]}</button>
      </div>
      {(it.screen||it.category) && (
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
          {it.screen && <span style={{fontSize:".64rem",background:"rgba(255,255,255,.07)",borderRadius:8,
            padding:"3px 8px",color:"rgba(255,255,255,.6)"}}>{SCREEN_LABEL[it.screen]||it.screen}</span>}
          {it.category && <span style={{fontSize:".64rem",background:"rgba(255,255,255,.07)",borderRadius:8,
            padding:"3px 8px",color:"rgba(255,255,255,.6)"}}>{CATEGORY_LABEL[it.category]||it.category}</span>}
        </div>
      )}
      <div style={{fontSize:".85rem",lineHeight:1.4,whiteSpace:"pre-wrap",marginBottom:it.imageBase64?8:0}}>{it.text}</div>
      {it.imageBase64 && (
        <img src={"data:"+(it.imageMime||"image/jpeg")+";base64,"+it.imageBase64} alt="captura"
          onClick={()=>setExpanded(v=>!v)}
          style={{width:expanded?"100%":90,height:expanded?"auto":90,objectFit:"cover",
            borderRadius:8,cursor:"pointer",border:"1px solid rgba(255,255,255,.15)"}}/>
      )}
    </div>
  );
}

function FeedbackList({title,icon,items,onCycleStatus}){
  return(
    <div style={{marginBottom:24}}>
      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".82rem",color:"#fff",
        letterSpacing:1,marginBottom:10}}>
        {icon} {title} <span style={{color:"rgba(255,255,255,.4)"}}>({items.length})</span>
      </div>
      {items.length===0 && (
        <div style={{color:"rgba(255,255,255,.35)",fontSize:".8rem",padding:"10px 0"}}>Nada por aquí todavía.</div>
      )}
      {items.map(it=><FeedbackCard key={it.id} it={it} onCycleStatus={onCycleStatus}/>)}
    </div>
  );
}

function AdminApp(){
  const[authUser,setAuthUser]=React.useState(undefined); // undefined=cargando, null=sin sesión
  const[email,setEmail]=React.useState("");
  const[password,setPassword]=React.useState("");
  const[loginErr,setLoginErr]=React.useState("");
  const[loggingIn,setLoggingIn]=React.useState(false);

  const[bugs,setBugs]=React.useState([]);
  const[suggestions,setSuggestions]=React.useState([]);
  const[stats,setStats]=React.useState({games:0,players:0,users:0,aiScans:0});
  const[tab,setTab]=React.useState("resumen"); // resumen | bugs | sugerencias

  React.useEffect(()=>{
    const unsub=_auth.onAuthStateChanged(u=>setAuthUser(u||null));
    return unsub;
  },[]);

  const authorized = !!(authUser && authUser.email===ADMIN_EMAIL);

  React.useEffect(()=>{
    if(!authorized)return;
    function toList(val){
      return Object.keys(val||{}).map(id=>Object.assign({id:id},val[id]))
        .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    }
    const bugsRef=_db.ref("feedback/bugs");
    const sugRef=_db.ref("feedback/suggestions");
    const gamesRef=_db.ref("stats/games");
    const playersRef=_db.ref("stats/players");
    const usersRef=_db.ref("users");
    // Vive en "adminStats" (no "stats") -- ver nota en components.jsx: "stats"
    // tiene reglas de Firebase abiertas para todo el árbol, así que un
    // contador ahí no se puede proteger a nivel de nodo individual.
    const scansRef=_db.ref("adminStats/aiScans");

    const hBugs=bugsRef.on("value",snap=>setBugs(toList(snap.val())));
    const hSug=sugRef.on("value",snap=>setSuggestions(toList(snap.val())));
    const hGames=gamesRef.on("value",snap=>setStats(s=>Object.assign({},s,{games:Object.keys(snap.val()||{}).length})));
    const hPlayers=playersRef.on("value",snap=>setStats(s=>Object.assign({},s,{players:Object.keys(snap.val()||{}).length})));
    const hUsers=usersRef.on("value",snap=>setStats(s=>Object.assign({},s,{users:Object.keys(snap.val()||{}).length})));
    const hScans=scansRef.on("value",snap=>setStats(s=>Object.assign({},s,{aiScans:snap.val()||0})));

    return ()=>{
      bugsRef.off("value",hBugs);sugRef.off("value",hSug);
      gamesRef.off("value",hGames);playersRef.off("value",hPlayers);
      usersRef.off("value",hUsers);scansRef.off("value",hScans);
    };
  },[authorized]);

  async function cycleStatus(item,path){
    const order={new:"reviewed",reviewed:"resolved",resolved:"new"};
    const next=order[item.status||"new"];
    try{ await _db.ref(path+"/"+item.id+"/status").set(next); }
    catch(e){ console.warn("No se pudo actualizar el estado:",e.message); }
  }

  async function handleLogin(e){
    e.preventDefault();
    setLoggingIn(true);setLoginErr("");
    try{ await signInEmail(email.trim(),password); }
    catch(err){ setLoginErr("No se pudo iniciar sesión. Revisa tu correo y contraseña."); }
    finally{ setLoggingIn(false); }
  }

  const[googleBusy,setGoogleBusy]=React.useState(false);
  const[waitSecs,setWaitSecs]=React.useState(0);
  async function handleGoogleLogin(){
    setLoginErr("");setGoogleBusy(true);setWaitSecs(0);
    const timer=setInterval(()=>setWaitSecs(s=>s+1),1000);
    try{ await signInGoogle(); } // ya trae su propio respaldo a redirect si el popup falla
    catch(err){
      if(err&&err.code!=="auth/popup-closed-by-user") setLoginErr("No se pudo iniciar sesión con Google.");
    }
    clearInterval(timer);setGoogleBusy(false);
  }
  // Salida manual por si el popup se queda colgado sin lanzar ningún error
  // atrapable (pasa en algunos navegadores de escritorio con cookies de
  // terceros bloqueadas) -- ver la misma nota en components.jsx/AuthScreen.
  async function handleGoogleRedirectManual(){
    setLoginErr("");
    try{ await signInGoogleRedirect(); }
    catch(err){ setLoginErr("No se pudo continuar con Google.");setGoogleBusy(false); }
  }

  if(authUser===undefined){
    return(
      <div className="wrap"><div className="page" style={{paddingTop:80,textAlign:"center"}}>
        <div className="spin" style={{margin:"0 auto"}}></div>
      </div></div>
    );
  }

  if(!authUser || !authorized){
    return(
      <div className="wrap"><div className="page" style={{paddingTop:60}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:"2.6rem",marginBottom:8}}>🛡️</div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.5rem",color:"var(--y)"}}>PANEL ADMIN</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".7rem",color:"rgba(255,255,255,.4)",
            letterSpacing:2,marginTop:4}}>FLIP 7</div>
        </div>
        {authUser && !authorized ? (
          <div style={{textAlign:"center"}}>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:".85rem",marginBottom:16}}>
              La cuenta {authUser.email||"anónima"} no tiene acceso a este panel.
            </div>
            <button className="btn btn-g" onClick={()=>signOut()}>Cerrar sesión</button>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Correo" required
              style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
                borderRadius:10,padding:12,color:"#fff",marginBottom:10,fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Contraseña" required
              style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
                borderRadius:10,padding:12,color:"#fff",marginBottom:10,fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
            {loginErr&&<div style={{color:"#FF5A5A",fontSize:".78rem",marginBottom:10,textAlign:"center"}}>{loginErr}</div>}
            <button className="btn btn-y" disabled={loggingIn} type="submit">{loggingIn?"Entrando...":"Entrar"}</button>
            <div style={{textAlign:"center",color:"rgba(255,255,255,.3)",fontSize:".7rem",margin:"12px 0"}}>o</div>
            <button type="button" className="btn btn-g" disabled={googleBusy} onClick={handleGoogleLogin}>
              {googleBusy?"Esperando a Google...":"Entrar con Google"}
            </button>
            {googleBusy&&(
              <div style={{textAlign:"center",marginTop:8,fontFamily:"'Righteous',sans-serif",
                fontSize:".62rem",color:"rgba(255,255,255,.4)"}}>
                Puede tardar hasta 40 segundos ({waitSecs}s)
                {waitSecs>=5&&(
                  <div onClick={handleGoogleRedirectManual}
                    style={{marginTop:6,fontSize:".64rem",color:"var(--t)",
                      textDecoration:"underline",cursor:"pointer"}}>
                    ¿Se está tardando? Prueba con este otro método
                  </div>
                )}
              </div>
            )}
          </form>
        )}
      </div></div>
    );
  }

  const pendingBugs=bugs.filter(b=>(b.status||"new")==="new").length;
  const pendingSug=suggestions.filter(s=>(s.status||"new")==="new").length;
  // Estimación de costo -- mismo rango que se usó para calcular el costo de
  // 1,000/100,000 escaneos (prompt optimizado, ~$0.0025-$0.0038 USD/escaneo).
  // Si el prompt vuelve a cambiar de tamaño, hay que ajustar este rango.
  const estCostLow=(stats.aiScans*0.0025).toFixed(2);
  const estCostHigh=(stats.aiScans*0.0038).toFixed(2);

  return(
    <div className="wrap"><div className="page" style={{paddingTop:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:"1.3rem",color:"var(--y)"}}>PANEL ADMIN</div>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",color:"rgba(255,255,255,.4)",
            letterSpacing:1}}>FLIP 7 · {authUser.email}</div>
        </div>
        <button className="btn btn-g btn-sm" onClick={()=>signOut()}>Salir</button>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[["resumen","📊 Resumen"],["bugs","🐞 Bugs ("+pendingBugs+")"],["sugerencias","💡 Sugerencias ("+pendingSug+")"]].map(function(pair){
          const k=pair[0],label=pair[1];
          return(
            <button key={k} onClick={()=>setTab(k)} style={{
              flex:1,padding:"9px 6px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",
              background:tab===k?"linear-gradient(135deg,var(--y),var(--or))":"rgba(255,255,255,.05)",
              color:tab===k?"var(--dark)":"rgba(255,255,255,.7)",fontFamily:"'Righteous',sans-serif",
              fontSize:".66rem",cursor:"pointer"
            }}>{label}</button>
          );
        })}
      </div>

      {tab==="resumen" && (
        <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
          <StatCard icon="🎮" label="PARTIDAS JUGADAS" value={stats.games}/>
          <StatCard icon="👥" label="JUGADORES CON CUENTA" value={stats.users}/>
          <StatCard icon="🏆" label="JUGADORES EN ESTADÍSTICAS" value={stats.players}/>
          <StatCard icon="🔍" label="ESCANEOS DE IA" value={stats.aiScans}
            sub={"~$"+estCostLow+" - $"+estCostHigh+" USD estimado"}/>
          <StatCard icon="🐞" label="BUGS PENDIENTES" value={pendingBugs}/>
          <StatCard icon="💡" label="SUGERENCIAS PENDIENTES" value={pendingSug}/>
        </div>
      )}

      {tab==="bugs" && <FeedbackList title="Bugs reportados" icon="🐞" items={bugs}
        onCycleStatus={it=>cycleStatus(it,"feedback/bugs")}/>}
      {tab==="sugerencias" && <FeedbackList title="Sugerencias de juegos" icon="💡" items={suggestions}
        onCycleStatus={it=>cycleStatus(it,"feedback/suggestions")}/>}
    </div></div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <AdminErrorBoundary><AdminApp/></AdminErrorBoundary>
);
