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
// Mismo truco que en FeedbackModal (components.jsx): el <select> nativo
// ignora el CSS del padre en el popup de opciones y se ve texto blanco
// sobre blanco en algunos navegadores -- se fuerza el color en cada <option>.
const OPTION_STYLE={background:"#1a1a2e",color:"#fff"};

// Estado de moderación por usuario (vive en /moderation/{uid}, ver reglas).
const MOD_LABEL={ok:"✅ Activo",warned:"⚠️ Advertido",suspended:"⏳ Suspendido",banned:"🚫 Baneado"};
const MOD_COLOR={
  ok:{bg:"rgba(59,178,115,.15)",border:"rgba(59,178,115,.4)"},
  warned:{bg:"rgba(245,200,0,.15)",border:"rgba(245,200,0,.4)"},
  suspended:{bg:"rgba(255,150,50,.15)",border:"rgba(255,150,50,.4)"},
  banned:{bg:"rgba(230,57,70,.15)",border:"rgba(230,57,70,.4)"}
};

// Prioridad de tickets del buzón (vive en /feedbackMeta/{bugs|suggestions}/{id}).
const PRIORITY_LABEL={low:"🔵 Baja",medium:"🟡 Media",high:"🟠 Alta",critical:"🔴 Crítica"};
const PRIORITY_COLOR={
  low:{bg:"rgba(100,150,255,.15)",border:"rgba(100,150,255,.4)"},
  medium:{bg:"rgba(245,200,0,.15)",border:"rgba(245,200,0,.4)"},
  high:{bg:"rgba(255,150,50,.15)",border:"rgba(255,150,50,.4)"},
  critical:{bg:"rgba(230,57,70,.15)",border:"rgba(230,57,70,.4)"}
};

const AUDIT_ACTION_LABEL={
  warn:"⚠️ Advertencia",suspend:"⏳ Suspensión",ban:"🚫 Baneo",
  unban:"✅ Sanción levantada",edit_name:"✏️ Nombre editado"
};

function daysAgo(ts){
  if(!ts) return "";
  const d=Math.floor((Date.now()-ts)/86400000);
  if(d<=0) return "hoy";
  if(d===1) return "hace 1 día";
  return "hace "+d+" días";
}

// Combina el ticket original (inmutable, escrito por el jugador) con su
// estado administrativo (feedbackMeta, editable solo por el admin) --
// separados en dos nodos de Firebase para que las reglas puedan proteger
// status/priority/internalNotes sin que la escritura abierta del ticket
// original (necesaria para que cualquiera pueda reportar) se los lleve
// entre las patas (ver notas de "adminStats" en components.jsx: un permiso
// abierto en un nodo no se puede cerrar con una regla más restrictiva en
// un hijo -- por eso son nodos hermanos y no uno anidado en el otro).
function mergeFeedback(raw, meta){
  return Object.keys(raw||{}).map(function(id){
    const base=raw[id]||{};
    const m=meta[id]||{};
    return Object.assign({}, base, m, {id:id, status:m.status||base.status||"new"});
  }).sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
}

function FeedbackCard({it,onCycleStatus,onSetPriority,onSetNotes}){
  const[expanded,setExpanded]=React.useState(false);
  const[notesOpen,setNotesOpen]=React.useState(false);
  const[notesDraft,setNotesDraft]=React.useState(it.internalNotes||"");
  const st=it.status||"new";
  const col=STATUS_COLOR[st]||STATUS_COLOR.new;
  const pr=it.priority||"medium";
  const prCol=PRIORITY_COLOR[pr]||PRIORITY_COLOR.medium;
  return(
    <div style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
      borderRadius:12,padding:"12px 14px",marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
        <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",color:"rgba(255,255,255,.45)"}}>
          {it.name||"Anónimo"} · {fmtDate(it.createdAt)} · <span style={{color:"rgba(255,255,255,.3)"}}>{daysAgo(it.createdAt)}</span>
          {it.email && <div style={{color:"rgba(255,255,255,.3)",marginTop:2}}>{it.email}</div>}
        </div>
        <button onClick={()=>onCycleStatus(it)} style={{
          background:col.bg,border:"1px solid "+col.border,borderRadius:20,padding:"4px 10px",
          fontSize:".65rem",fontFamily:"'Righteous',sans-serif",color:"#fff",cursor:"pointer",whiteSpace:"nowrap"
        }}>{STATUS_LABEL[st]}</button>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",marginBottom:8}}>
        {it.screen && <span style={{fontSize:".64rem",background:"rgba(255,255,255,.07)",borderRadius:8,
          padding:"3px 8px",color:"rgba(255,255,255,.6)"}}>{SCREEN_LABEL[it.screen]||it.screen}</span>}
        {it.category && <span style={{fontSize:".64rem",background:"rgba(255,255,255,.07)",borderRadius:8,
          padding:"3px 8px",color:"rgba(255,255,255,.6)"}}>{CATEGORY_LABEL[it.category]||it.category}</span>}
        <select value={pr} onChange={e=>onSetPriority(it,e.target.value)} style={{
          background:prCol.bg,border:"1px solid "+prCol.border,borderRadius:8,color:"#fff",
          fontSize:".64rem",padding:"3px 6px",fontFamily:"'Nunito',sans-serif"}}>
          <option style={OPTION_STYLE} value="low">🔵 Baja</option>
          <option style={OPTION_STYLE} value="medium">🟡 Media</option>
          <option style={OPTION_STYLE} value="high">🟠 Alta</option>
          <option style={OPTION_STYLE} value="critical">🔴 Crítica</option>
        </select>
      </div>
      <div style={{fontSize:".85rem",lineHeight:1.4,whiteSpace:"pre-wrap",marginBottom:it.imageBase64?8:8}}>{it.text}</div>
      {it.imageBase64 && (
        <img src={"data:"+(it.imageMime||"image/jpeg")+";base64,"+it.imageBase64} alt="captura"
          onClick={()=>setExpanded(v=>!v)}
          style={{width:expanded?"100%":90,height:expanded?"auto":90,objectFit:"cover",
            borderRadius:8,cursor:"pointer",border:"1px solid rgba(255,255,255,.15)"}}/>
      )}
      <div>
        <button onClick={()=>setNotesOpen(v=>!v)} style={{marginTop:8,background:"none",border:"none",
          color:"rgba(255,255,255,.4)",fontSize:".68rem",cursor:"pointer",textDecoration:"underline",padding:0}}>
          📝 {notesOpen?"Ocultar notas internas":("Notas internas"+(it.internalNotes?" •":""))}
        </button>
        {notesOpen && (
          <div style={{marginTop:6}}>
            <textarea value={notesDraft} onChange={e=>setNotesDraft(e.target.value)} rows={2}
              placeholder="Solo tú ves esto — contexto de investigación, causa, versión donde se corrigió, etc."
              style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
                borderRadius:8,padding:8,color:"#fff",fontSize:".78rem",boxSizing:"border-box",
                resize:"vertical",fontFamily:"'Nunito',sans-serif"}}/>
            <button className="btn btn-g btn-sm" style={{marginTop:4}}
              onClick={()=>onSetNotes(it,notesDraft)}>Guardar nota</button>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackList({title,icon,items,onCycleStatus,onSetPriority,onSetNotes}){
  return(
    <div style={{marginBottom:24}}>
      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".82rem",color:"#fff",
        letterSpacing:1,marginBottom:10}}>
        {icon} {title} <span style={{color:"rgba(255,255,255,.4)"}}>({items.length})</span>
      </div>
      {items.length===0 && (
        <div style={{color:"rgba(255,255,255,.35)",fontSize:".8rem",padding:"10px 0"}}>Nada por aquí todavía.</div>
      )}
      {items.map(it=><FeedbackCard key={it.id} it={it} onCycleStatus={onCycleStatus}
        onSetPriority={onSetPriority} onSetNotes={onSetNotes}/>)}
    </div>
  );
}

// ── USUARIOS: tabla con filtros + ficha de usuario con acciones ─────────
function UsersTable({users,moderationMap,onSelect}){
  const[q,setQ]=React.useState("");
  const[statusF,setStatusF]=React.useState("all");
  const[from,setFrom]=React.useState("");
  const[to,setTo]=React.useState("");
  const[sort,setSort]=React.useState("recent");

  const filtered=React.useMemo(function(){
    let list=users.slice();
    const qq=q.trim().toLowerCase();
    if(qq){
      list=list.filter(function(u){
        return (u.displayName||"").toLowerCase().indexOf(qq)>=0 ||
          (u.email||"").toLowerCase().indexOf(qq)>=0 ||
          (u.uid||"").toLowerCase().indexOf(qq)>=0;
      });
    }
    if(statusF!=="all"){
      list=list.filter(function(u){
        if(statusF==="anon") return !!u.isAnon;
        const st=(moderationMap[u.uid]&&moderationMap[u.uid].status)||"ok";
        return st===statusF;
      });
    }
    if(from){
      const fromTs=new Date(from+"T00:00:00").getTime();
      list=list.filter(function(u){ return (u.createdAt||0)>=fromTs; });
    }
    if(to){
      const toTs=new Date(to+"T23:59:59").getTime();
      list=list.filter(function(u){ return (u.createdAt||0)<=toTs; });
    }
    list.sort(function(a,b){
      if(sort==="recent") return (b.createdAt||0)-(a.createdAt||0);
      if(sort==="oldest") return (a.createdAt||0)-(b.createdAt||0);
      if(sort==="name") return (a.displayName||a.email||"").localeCompare(b.displayName||b.email||"");
      return 0;
    });
    return list;
  },[users,moderationMap,q,statusF,from,to,sort]);

  const inputStyle={background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
    borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"};
  const selectStyle={background:"#1a1a2e",color:"#fff",border:"1px solid rgba(255,255,255,.15)",
    borderRadius:10,padding:9,fontFamily:"'Nunito',sans-serif"};

  return(
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar nombre, correo o uid..."
          style={Object.assign({flex:"1 1 200px"},inputStyle)}/>
        <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={selectStyle}>
          <option style={OPTION_STYLE} value="all">Todos los estados</option>
          <option style={OPTION_STYLE} value="ok">✅ Activos</option>
          <option style={OPTION_STYLE} value="warned">⚠️ Advertidos</option>
          <option style={OPTION_STYLE} value="suspended">⏳ Suspendidos</option>
          <option style={OPTION_STYLE} value="banned">🚫 Baneados</option>
          <option style={OPTION_STYLE} value="anon">👻 Anónimos</option>
        </select>
        <select value={sort} onChange={e=>setSort(e.target.value)} style={selectStyle}>
          <option style={OPTION_STYLE} value="recent">Más recientes</option>
          <option style={OPTION_STYLE} value="oldest">Más antiguos</option>
          <option style={OPTION_STYLE} value="name">Alfabético</option>
        </select>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
          style={Object.assign({colorScheme:"dark"},inputStyle)}/>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)}
          style={Object.assign({colorScheme:"dark"},inputStyle)}/>
      </div>

      <div style={{fontSize:".7rem",color:"rgba(255,255,255,.4)",marginBottom:8}}>
        {filtered.length} de {users.length} usuarios
      </div>

      {filtered.slice(0,200).map(function(u){
        const st=(moderationMap[u.uid]&&moderationMap[u.uid].status)||"ok";
        const col=MOD_COLOR[st]||MOD_COLOR.ok;
        return(
          <div key={u.uid} onClick={()=>onSelect(u)} style={{
            background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
            borderRadius:12,padding:"10px 14px",marginBottom:8,cursor:"pointer",
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,fontSize:".85rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {u.displayName||"Sin nombre"} {u.isAnon && <span style={{color:"rgba(255,255,255,.35)"}}>(anónimo)</span>}
              </div>
              <div style={{fontSize:".68rem",color:"rgba(255,255,255,.45)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {u.email||"—"} · alta {fmtDate(u.createdAt)}
              </div>
            </div>
            <span style={{background:col.bg,border:"1px solid "+col.border,borderRadius:20,
              padding:"3px 9px",fontSize:".62rem",whiteSpace:"nowrap"}}>{MOD_LABEL[st]}</span>
          </div>
        );
      })}
      {filtered.length===0 && (
        <div style={{color:"rgba(255,255,255,.35)",fontSize:".8rem",padding:"10px 0"}}>Sin resultados con esos filtros.</div>
      )}
      {filtered.length>200 && (
        <div style={{textAlign:"center",color:"rgba(255,255,255,.35)",fontSize:".72rem",marginTop:8}}>
          Mostrando los primeros 200 — afina la búsqueda para ver más.
        </div>
      )}
    </div>
  );
}

function UserDetailModal({user,mod,onClose}){
  const[reason,setReason]=React.useState("");
  const[days,setDays]=React.useState(7);
  const[name,setName]=React.useState(user.displayName||"");
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");

  async function run(fn){
    setBusy(true);setErr("");
    try{ await fn(); }
    catch(e){ setErr((e&&e.message)||"No se pudo completar la acción."); }
    finally{ setBusy(false); }
  }

  const st=(mod&&mod.status)||"ok";
  const col=MOD_COLOR[st]||MOD_COLOR.ok;

  return(
    <div className="mbg" onClick={onClose}>
      <div className="ms" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
        <div className="mh">👤 {user.displayName||user.email||"Sin nombre"}</div>
        <div className="mt2" style={{fontSize:".72rem",color:"rgba(255,255,255,.5)",lineHeight:1.6}}>
          {user.email||"— sin correo —"}<br/>
          UID: {user.uid}<br/>
          Alta: {fmtDate(user.createdAt)} · Último acceso: {fmtDate(user.lastLogin)}<br/>
          Proveedor: {user.provider||"?"}{user.isAnon?" (anónimo)":""}
        </div>

        <div style={{margin:"12px 0",padding:"8px 10px",borderRadius:10,
          background:col.bg,border:"1px solid "+col.border,fontSize:".78rem"}}>
          Estado actual: <b>{MOD_LABEL[st]||st}</b>
          {mod&&mod.reason && <div style={{marginTop:4,color:"rgba(255,255,255,.7)"}}>Motivo: {mod.reason}</div>}
          {mod&&mod.until && <div style={{marginTop:2,color:"rgba(255,255,255,.5)"}}>Hasta: {fmtDate(mod.until)}</div>}
        </div>

        {err && <div style={{color:"#FF5A5A",fontSize:".78rem",marginBottom:8}}>{err}</div>}

        <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2}
          placeholder="Motivo (queda guardado en la bitácora)"
          style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
            borderRadius:10,padding:10,color:"#fff",marginBottom:8,fontFamily:"'Nunito',sans-serif",
            boxSizing:"border-box",resize:"vertical"}}/>

        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          <button className="btn btn-y btn-sm" disabled={busy}
            onClick={()=>run(()=>warnUser(user.uid,reason))}>⚠️ Advertir</button>
          <select value={days} onChange={e=>setDays(Number(e.target.value))} style={{
            background:"#1a1a2e",color:"#fff",border:"1px solid rgba(255,255,255,.15)",
            borderRadius:8,padding:"7px 8px",fontFamily:"'Nunito',sans-serif"}}>
            <option style={OPTION_STYLE} value={1}>1 día</option>
            <option style={OPTION_STYLE} value={3}>3 días</option>
            <option style={OPTION_STYLE} value={7}>7 días</option>
            <option style={OPTION_STYLE} value={30}>30 días</option>
          </select>
          <button className="btn btn-t btn-sm" disabled={busy}
            onClick={()=>run(()=>suspendUser(user.uid,reason,Date.now()+days*86400000))}>⏳ Suspender</button>
          <button className="btn btn-r btn-sm" disabled={busy}
            onClick={()=>run(()=>banUser(user.uid,reason))}>🚫 Banear</button>
          {st!=="ok" && (
            <button className="btn btn-g btn-sm" disabled={busy}
              onClick={()=>run(()=>liftModeration(user.uid))}>✅ Quitar sanción</button>
          )}
        </div>

        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre visible"
            style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
              borderRadius:10,padding:8,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
          <button className="btn btn-g btn-sm" disabled={busy||!name.trim()}
            onClick={()=>run(()=>adminEditDisplayName(user.uid,name.trim()))}>Guardar nombre</button>
        </div>

        <button className="btn btn-g" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

// ── AUDITORÍA: bitácora de acciones de administrador ─────────────────────
function AuditList({items,usersByUid}){
  return(
    <div>
      {items.length===0 && (
        <div style={{color:"rgba(255,255,255,.35)",fontSize:".8rem",padding:"10px 0"}}>Sin actividad registrada todavía.</div>
      )}
      {items.map(function(a){
        const target=usersByUid[a.targetUid];
        return(
          <div key={a.id} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
            borderRadius:10,padding:"10px 12px",marginBottom:8,fontSize:".78rem"}}>
            <b>{AUDIT_ACTION_LABEL[a.action]||a.action}</b>
            {target && <span> · {target.displayName||target.email||a.targetUid}</span>}
            <div style={{color:"rgba(255,255,255,.4)",fontSize:".68rem",marginTop:3}}>
              {a.by} · {fmtDate(a.at)}
            </div>
            {a.reason && <div style={{marginTop:4,color:"rgba(255,255,255,.6)"}}>Motivo: {a.reason}</div>}
            {a.newName && <div style={{marginTop:4,color:"rgba(255,255,255,.6)"}}>Nuevo nombre: {a.newName}</div>}
          </div>
        );
      })}
    </div>
  );
}

function AdminApp(){
  const[authUser,setAuthUser]=React.useState(undefined); // undefined=cargando, null=sin sesión
  const[email,setEmail]=React.useState("");
  const[password,setPassword]=React.useState("");
  const[loginErr,setLoginErr]=React.useState("");
  const[loggingIn,setLoggingIn]=React.useState(false);

  const[rawBugs,setRawBugs]=React.useState({});
  const[rawSug,setRawSug]=React.useState({});
  const[metaBugs,setMetaBugs]=React.useState({});
  const[metaSug,setMetaSug]=React.useState({});
  const[users,setUsers]=React.useState([]);
  const[moderationMap,setModerationMap]=React.useState({});
  const[audit,setAudit]=React.useState([]);
  const[selectedUser,setSelectedUser]=React.useState(null);
  const[stats,setStats]=React.useState({games:0,players:0,users:0,aiScans:0});
  const[tab,setTab]=React.useState("resumen"); // resumen | usuarios | bugs | sugerencias | auditoria

  const bugs=React.useMemo(()=>mergeFeedback(rawBugs,metaBugs),[rawBugs,metaBugs]);
  const suggestions=React.useMemo(()=>mergeFeedback(rawSug,metaSug),[rawSug,metaSug]);
  const usersByUid=React.useMemo(function(){
    const m={};
    users.forEach(function(u){ m[u.uid]=u; });
    return m;
  },[users]);

  React.useEffect(()=>{
    const unsub=_auth.onAuthStateChanged(u=>setAuthUser(u||null));
    return unsub;
  },[]);

  const authorized = !!(authUser && authUser.email===ADMIN_EMAIL);

  React.useEffect(()=>{
    if(!authorized)return;
    const bugsRef=_db.ref("feedback/bugs");
    const sugRef=_db.ref("feedback/suggestions");
    const metaBugsRef=_db.ref("feedbackMeta/bugs");
    const metaSugRef=_db.ref("feedbackMeta/suggestions");
    const gamesRef=_db.ref("stats/games");
    const playersRef=_db.ref("stats/players");
    const usersRef=_db.ref("users");
    const moderationRef=_db.ref("moderation");
    // Últimas 300 acciones -- de sobra para revisar actividad reciente sin
    // bajar la bitácora completa cada vez que crece (ver .indexOn:"at" en reglas).
    const auditRef=_db.ref("adminAudit").orderByChild("at").limitToLast(300);
    // Vive en "adminStats" (no "stats") -- ver nota en components.jsx: "stats"
    // tiene reglas de Firebase abiertas para todo el árbol, así que un
    // contador ahí no se puede proteger a nivel de nodo individual.
    const scansRef=_db.ref("adminStats/aiScans");

    const hBugs=bugsRef.on("value",snap=>setRawBugs(snap.val()||{}));
    const hSug=sugRef.on("value",snap=>setRawSug(snap.val()||{}));
    const hMetaBugs=metaBugsRef.on("value",snap=>setMetaBugs(snap.val()||{}));
    const hMetaSug=metaSugRef.on("value",snap=>setMetaSug(snap.val()||{}));
    const hGames=gamesRef.on("value",snap=>setStats(s=>Object.assign({},s,{games:Object.keys(snap.val()||{}).length})));
    const hPlayers=playersRef.on("value",snap=>setStats(s=>Object.assign({},s,{players:Object.keys(snap.val()||{}).length})));
    const hUsers=usersRef.on("value",snap=>{
      const val=snap.val()||{};
      const list=Object.keys(val).map(function(uid){ return Object.assign({uid:uid},val[uid]); });
      setUsers(list);
      setStats(s=>Object.assign({},s,{users:list.length}));
    });
    const hMod=moderationRef.on("value",snap=>setModerationMap(snap.val()||{}));
    const hAudit=auditRef.on("value",snap=>{
      const val=snap.val()||{};
      const list=Object.keys(val).map(function(id){ return Object.assign({id:id},val[id]); })
        .sort(function(a,b){ return (b.at||0)-(a.at||0); });
      setAudit(list);
    });
    const hScans=scansRef.on("value",snap=>setStats(s=>Object.assign({},s,{aiScans:snap.val()||0})));

    return ()=>{
      bugsRef.off("value",hBugs);sugRef.off("value",hSug);
      metaBugsRef.off("value",hMetaBugs);metaSugRef.off("value",hMetaSug);
      gamesRef.off("value",hGames);playersRef.off("value",hPlayers);
      usersRef.off("value",hUsers);moderationRef.off("value",hMod);
      auditRef.off("value",hAudit);scansRef.off("value",hScans);
    };
  },[authorized]);

  async function cycleStatus(item,type){
    const order={new:"reviewed",reviewed:"resolved",resolved:"new"};
    const next=order[item.status||"new"];
    try{ await _db.ref("feedbackMeta/"+type+"/"+item.id).update({status:next,updatedAt:Date.now()}); }
    catch(e){ console.warn("No se pudo actualizar el estado:",e.message); }
  }
  async function setTicketPriority(item,type,priority){
    try{ await _db.ref("feedbackMeta/"+type+"/"+item.id).update({priority:priority,updatedAt:Date.now()}); }
    catch(e){ console.warn("No se pudo actualizar la prioridad:",e.message); }
  }
  async function setTicketNotes(item,type,notes){
    try{ await _db.ref("feedbackMeta/"+type+"/"+item.id).update({internalNotes:notes,updatedAt:Date.now()}); }
    catch(e){ console.warn("No se pudo guardar la nota:",e.message); }
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
  const bannedCount=Object.keys(moderationMap).filter(function(uid){
    return moderationMap[uid]&&moderationMap[uid].status==="banned";
  }).length;
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

      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {[["resumen","📊 Resumen"],["usuarios","👥 Usuarios"],["bugs","🐞 Bugs ("+pendingBugs+")"],
          ["sugerencias","💡 Sugerencias ("+pendingSug+")"],["auditoria","📜 Auditoría"]].map(function(pair){
          const k=pair[0],label=pair[1];
          return(
            <button key={k} onClick={()=>setTab(k)} style={{
              flex:"1 1 auto",padding:"9px 8px",borderRadius:10,border:"1px solid rgba(255,255,255,.12)",
              background:tab===k?"linear-gradient(135deg,var(--y),var(--or))":"rgba(255,255,255,.05)",
              color:tab===k?"var(--dark)":"rgba(255,255,255,.7)",fontFamily:"'Righteous',sans-serif",
              fontSize:".64rem",cursor:"pointer",whiteSpace:"nowrap"
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
          <StatCard icon="🚫" label="USUARIOS BANEADOS" value={bannedCount}/>
        </div>
      )}

      {tab==="usuarios" && (
        <UsersTable users={users} moderationMap={moderationMap} onSelect={setSelectedUser}/>
      )}

      {tab==="bugs" && <FeedbackList title="Bugs reportados" icon="🐞" items={bugs}
        onCycleStatus={it=>cycleStatus(it,"bugs")}
        onSetPriority={(it,p)=>setTicketPriority(it,"bugs",p)}
        onSetNotes={(it,n)=>setTicketNotes(it,"bugs",n)}/>}
      {tab==="sugerencias" && <FeedbackList title="Sugerencias de juegos" icon="💡" items={suggestions}
        onCycleStatus={it=>cycleStatus(it,"suggestions")}
        onSetPriority={(it,p)=>setTicketPriority(it,"suggestions",p)}
        onSetNotes={(it,n)=>setTicketNotes(it,"suggestions",n)}/>}

      {tab==="auditoria" && <AuditList items={audit} usersByUid={usersByUid}/>}

      {selectedUser && (
        <UserDetailModal user={selectedUser} mod={moderationMap[selectedUser.uid]}
          onClose={()=>setSelectedUser(null)}/>
      )}
    </div></div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <AdminErrorBoundary><AdminApp/></AdminErrorBoundary>
);
