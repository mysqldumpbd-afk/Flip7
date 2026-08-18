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

// Tipo de cuenta (proveedor de Firebase Auth) -- providerId real que guarda
// saveUserProfile en app.js: "google.com", "password" o "anonymous".
const PROVIDER_LABEL={"google.com":"🟢 Gmail / Google","password":"✉️ Correo y contraseña",anonymous:"👻 Anónimo"};
function providerOf(u){
  if(!u) return "anonymous";
  if(u.isAnon) return "anonymous";
  return u.provider||"password";
}
// Comparador numérico genérico para filtros tipo "días de inactividad
// mayor/menor/igual a N" -- target vacío = sin filtro (deja pasar todo).
function cmpMatch(value,op,target){
  if(target===""||target===null||target===undefined) return true;
  const t=Number(target);
  if(isNaN(t)) return true;
  if(op==="lte") return value<=t;
  if(op==="eq") return value===t;
  if(op==="gt") return value>t;
  if(op==="lt") return value<t;
  return value>=t; // "gte" por default
}
const CMP_OPTIONS=[["gte","≥ mayor o igual"],["lte","≤ menor o igual"],["eq","= igual a"],["gt","> mayor que"],["lt","< menor que"]];
function CmpSelect({value,onChange}){
  return(
    <select value={value} onChange={e=>onChange(e.target.value)} style={{
      background:"#1a1a2e",color:"#fff",border:"1px solid rgba(255,255,255,.15)",
      borderRadius:10,padding:9,fontFamily:"'Nunito',sans-serif"}}>
      {CMP_OPTIONS.map(function(o){ return <option key={o[0]} style={OPTION_STYLE} value={o[0]}>{o[1]}</option>; })}
    </select>
  );
}

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
  unban:"✅ Sanción levantada",edit_name:"✏️ Nombre editado",
  close_room:"🚫 Sala cerrada",kick_player:"👢 Jugador expulsado",
  bulk_delete_rooms:"🗑️ Salas eliminadas en lote",delete_group:"🗑️ Grupo eliminado",
  bulk_delete_groups:"🗑️ Grupos eliminados en lote",
  bulk_ban:"🚫 Baneo en lote",bulk_resolve_bugs:"✅ Bugs resueltos en lote",
  bulk_resolve_suggestions:"✅ Sugerencias resueltas en lote",
  bulk_warn:"⚠️ Advertencia en lote",bulk_suspend:"⏳ Suspensión en lote",
  bulk_unban:"✅ Sanciones levantadas en lote"
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

function FeedbackCard({it,onCycleStatus,onSetPriority,onSetNotes,picked,onTogglePick}){
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
        <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
          <input type="checkbox" checked={!!picked} onChange={()=>onTogglePick(it)} style={{marginTop:3}}/>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".65rem",color:"rgba(255,255,255,.45)"}}>
            {it.name||"Anónimo"} · {fmtDate(it.createdAt)} · <span style={{color:"rgba(255,255,255,.3)"}}>{daysAgo(it.createdAt)}</span>
            {it.email && <div style={{color:"rgba(255,255,255,.3)",marginTop:2}}>{it.email}</div>}
          </div>
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

function FeedbackList({title,icon,items,onCycleStatus,onSetPriority,onSetNotes,onBulkResolve,usersByUid}){
  const[picked,setPicked]=React.useState({});
  const[q,setQ]=React.useState("");
  const[from,setFrom]=React.useState("");
  const[to,setTo]=React.useState("");
  const[providerF,setProviderF]=React.useState("all");
  const pickedIds=Object.keys(picked).filter(function(id){ return picked[id]; });
  const[busy,setBusy]=React.useState(false);

  const filtered=React.useMemo(function(){
    let list=items.slice();
    const qq=q.trim().toLowerCase();
    if(qq) list=list.filter(function(it){
      return (it.name||"").toLowerCase().indexOf(qq)>=0 || (it.email||"").toLowerCase().indexOf(qq)>=0;
    });
    if(from){
      const fromTs=new Date(from+"T00:00:00").getTime();
      list=list.filter(function(it){ return (it.createdAt||0)>=fromTs; });
    }
    if(to){
      const toTs=new Date(to+"T23:59:59").getTime();
      list=list.filter(function(it){ return (it.createdAt||0)<=toTs; });
    }
    if(providerF!=="all") list=list.filter(function(it){
      return providerOf((usersByUid||{})[it.uid])===providerF;
    });
    return list;
  },[items,q,from,to,providerF,usersByUid]);

  async function runBulkResolve(){
    setBusy(true);
    try{ await onBulkResolve(pickedIds); setPicked({}); }
    finally{ setBusy(false); }
  }

  const inputStyle={background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
    borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"};
  const selectStyle={background:"#1a1a2e",color:"#fff",border:"1px solid rgba(255,255,255,.15)",
    borderRadius:10,padding:9,fontFamily:"'Nunito',sans-serif"};

  return(
    <div style={{marginBottom:24}}>
      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".82rem",color:"#fff",
        letterSpacing:1,marginBottom:10}}>
        {icon} {title} <span style={{color:"rgba(255,255,255,.4)"}}>({filtered.length} de {items.length})</span>
      </div>

      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por nombre o correo..."
          style={Object.assign({flex:"1 1 180px"},inputStyle)}/>
        <select value={providerF} onChange={e=>setProviderF(e.target.value)} style={selectStyle}>
          <option style={OPTION_STYLE} value="all">Todos los tipos de cuenta</option>
          <option style={OPTION_STYLE} value="google.com">🟢 Gmail / Google</option>
          <option style={OPTION_STYLE} value="password">✉️ Correo y contraseña</option>
          <option style={OPTION_STYLE} value="anonymous">👻 Anónimo</option>
        </select>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
          style={Object.assign({colorScheme:"dark"},inputStyle)}/>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)}
          style={Object.assign({colorScheme:"dark"},inputStyle)}/>
      </div>

      {pickedIds.length>0 && (
        <div style={{background:"rgba(59,178,115,.1)",border:"1px solid rgba(59,178,115,.35)",borderRadius:12,
          padding:"10px 12px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
          <span style={{fontSize:".78rem"}}>{pickedIds.length} ticket(s) seleccionados</span>
          <button className="btn btn-g btn-sm" disabled={busy} onClick={runBulkResolve}>✅ Marcar resueltos</button>
        </div>
      )}
      {filtered.length===0 && (
        <div style={{color:"rgba(255,255,255,.35)",fontSize:".8rem",padding:"10px 0"}}>Nada por aquí con esos filtros.</div>
      )}
      {filtered.map(it=><FeedbackCard key={it.id} it={it} onCycleStatus={onCycleStatus}
        onSetPriority={onSetPriority} onSetNotes={onSetNotes}
        picked={!!picked[it.id]} onTogglePick={function(item){ setPicked(p=>Object.assign({},p,{[item.id]:!p[item.id]})); }}/>)}
    </div>
  );
}

// ── SALAS: listado en vivo con estado, expulsión y eliminación masiva ───
function RoomsTab({rooms,groups,onCloseRoom,onKick,onBulkDelete}){
  const[q,setQ]=React.useState("");
  const[statusF,setStatusF]=React.useState("all");
  const[groupF,setGroupF]=React.useState("all"); // all | none | any | {groupId}
  const[inactOp,setInactOp]=React.useState("gte");
  const[inactDays,setInactDays]=React.useState("");
  const[roundMin,setRoundMin]=React.useState("");
  const[roundMax,setRoundMax]=React.useState("");
  const[picked,setPicked]=React.useState({});
  const[expandedCode,setExpandedCode]=React.useState(null);
  const[confirmText,setConfirmText]=React.useState("");
  const[busy,setBusy]=React.useState(false);

  function activityTs(r){ return r.lastActivityAt||r.gameStartedAt||r.createdAt||0; }
  function statusOf(r){
    if(!r.finished && (Date.now()-activityTs(r)>3*86400000)) return "abandoned";
    return r.finished ? "finished" : "active";
  }
  function inactivityDays(r){ return Math.floor((Date.now()-activityTs(r))/86400000); }
  const groupsById=React.useMemo(function(){
    const m={};
    (groups||[]).forEach(function(g){ m[g.id]=g; });
    return m;
  },[groups]);

  const STATUS_L={active:"🟢 Activa",finished:"🏁 Finalizada",abandoned:"👻 Abandonada"};
  const STATUS_C={
    active:{bg:"rgba(59,178,115,.15)",border:"rgba(59,178,115,.4)"},
    finished:{bg:"rgba(100,150,255,.15)",border:"rgba(100,150,255,.4)"},
    abandoned:{bg:"rgba(255,150,50,.15)",border:"rgba(255,150,50,.4)"}
  };

  const filtered=React.useMemo(function(){
    let list=rooms.slice();
    const qq=q.trim().toUpperCase();
    if(qq) list=list.filter(function(r){
      if((r.code||"").toUpperCase().indexOf(qq)>=0) return true;
      if((r.hostName||"").toUpperCase().indexOf(qq)>=0) return true;
      return (r.players||[]).some(function(p){ return (p.name||"").toUpperCase().indexOf(qq)>=0; });
    });
    if(statusF!=="all") list=list.filter(function(r){ return statusOf(r)===statusF; });
    if(groupF==="none") list=list.filter(function(r){ return !r.groupId; });
    else if(groupF==="any") list=list.filter(function(r){ return !!r.groupId; });
    else if(groupF!=="all") list=list.filter(function(r){ return r.groupId===groupF; });
    if(inactDays!=="") list=list.filter(function(r){ return cmpMatch(inactivityDays(r),inactOp,inactDays); });
    if(roundMin!=="") list=list.filter(function(r){ return (r.round||1)>=Number(roundMin); });
    if(roundMax!=="") list=list.filter(function(r){ return (r.round||1)<=Number(roundMax); });
    list.sort(function(a,b){ return activityTs(b)-activityTs(a); });
    return list;
  },[rooms,q,statusF,groupF,inactOp,inactDays,roundMin,roundMax]);

  const pickedCodes=Object.keys(picked).filter(function(c){ return picked[c]; });
  const allVisibleChecked=filtered.length>0 && filtered.every(function(r){ return picked[r.code]; });
  function toggleSelectAllVisible(){
    setPicked(function(p){
      const next=Object.assign({},p);
      const target=!allVisibleChecked;
      filtered.forEach(function(r){ next[r.code]=target; });
      return next;
    });
  }
  async function runBulkDelete(){
    if(confirmText.trim().toUpperCase()!=="CONFIRMAR")return;
    setBusy(true);
    try{ await onBulkDelete(pickedCodes); setPicked({});setConfirmText(""); }
    finally{ setBusy(false); }
  }

  const selectStyle={background:"#1a1a2e",color:"#fff",border:"1px solid rgba(255,255,255,.15)",borderRadius:10,padding:9,fontFamily:"'Nunito',sans-serif"};

  return(
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar código, host o jugador..."
          style={{flex:"1 1 200px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
          borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
        <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={selectStyle}>
          <option style={OPTION_STYLE} value="all">Todos los estados</option>
          <option style={OPTION_STYLE} value="active">🟢 Activas</option>
          <option style={OPTION_STYLE} value="finished">🏁 Finalizadas</option>
          <option style={OPTION_STYLE} value="abandoned">👻 Abandonadas (+3 días)</option>
        </select>
        <select value={groupF} onChange={e=>setGroupF(e.target.value)} style={selectStyle}>
          <option style={OPTION_STYLE} value="all">Cualquier sala</option>
          <option style={OPTION_STYLE} value="any">🔗 Vinculadas a un grupo</option>
          <option style={OPTION_STYLE} value="none">Sin grupo</option>
          {(groups||[]).map(function(g){ return <option key={g.id} style={OPTION_STYLE} value={g.id}>👪 {g.name}</option>; })}
        </select>
        <span style={{fontSize:".7rem",color:"rgba(255,255,255,.45)",alignSelf:"center"}}>Días sin actividad:</span>
        <CmpSelect value={inactOp} onChange={setInactOp}/>
        <input type="number" min="0" value={inactDays} onChange={e=>setInactDays(e.target.value)} placeholder="días"
          style={{width:90,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
          borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
        <input type="number" min="1" value={roundMin} onChange={e=>setRoundMin(e.target.value)} placeholder="Ronda mín."
          style={{width:100,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
          borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
        <input type="number" min="1" value={roundMax} onChange={e=>setRoundMax(e.target.value)} placeholder="Ronda máx."
          style={{width:100,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
          borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
      </div>

      {pickedCodes.length>0 && (
        <div style={{background:"rgba(230,57,70,.1)",border:"1px solid rgba(230,57,70,.35)",borderRadius:12,
          padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:".78rem",marginBottom:6}}>{pickedCodes.length} sala(s) seleccionadas para cerrar/eliminar.</div>
          <input value={confirmText} onChange={e=>setConfirmText(e.target.value)} placeholder='Escribe "CONFIRMAR" para eliminar'
            style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
            borderRadius:8,padding:8,color:"#fff",marginBottom:6,fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
          <button className="btn btn-r btn-sm" disabled={busy||confirmText.trim().toUpperCase()!=="CONFIRMAR"}
            onClick={runBulkDelete}>🗑️ Cerrar/eliminar seleccionadas</button>
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <input type="checkbox" checked={allVisibleChecked} onChange={toggleSelectAllVisible}/>
        <span style={{fontSize:".7rem",color:"rgba(255,255,255,.4)"}}>
          Seleccionar todas las visibles · {filtered.length} de {rooms.length} salas
        </span>
      </div>

      {filtered.slice(0,150).map(function(r){
        const st=statusOf(r);
        const col=STATUS_C[st];
        const isExpanded=expandedCode===r.code;
        return(
          <div key={r.code} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
            borderRadius:12,padding:"10px 14px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input type="checkbox" checked={!!picked[r.code]}
                onChange={e=>setPicked(p=>Object.assign({},p,{[r.code]:e.target.checked}))}/>
              <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setExpandedCode(isExpanded?null:r.code)}>
                <div style={{fontWeight:700,fontSize:".85rem"}}>{r.code}
                  <span style={{color:"rgba(255,255,255,.4)",fontWeight:400}}> · {r.hostName||"?"}</span></div>
                <div style={{fontSize:".68rem",color:"rgba(255,255,255,.45)"}}>
                  {(r.players||[]).length} jugadores · ronda {r.round||1} · {daysAgo(activityTs(r))}
                  {r.groupId && <span> · 🔗 {(groupsById[r.groupId]&&groupsById[r.groupId].name)||"grupo eliminado"}</span>}
                </div>
              </div>
              <span style={{background:col.bg,border:"1px solid "+col.border,borderRadius:20,
                padding:"3px 9px",fontSize:".6rem",whiteSpace:"nowrap"}}>{STATUS_L[st]}</span>
            </div>
            {isExpanded && (
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,.08)"}}>
                {(r.players||[]).map(function(p){
                  return(
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"4px 0",fontSize:".78rem"}}>
                      <span>{p.emoji||"🎴"} {p.name} — {p.total||0} pts</span>
                      <button className="btn btn-r btn-sm" onClick={()=>onKick(r.code,p.id,p.name)}>Expulsar</button>
                    </div>
                  );
                })}
                {(r.players||[]).length===0 && <div style={{fontSize:".76rem",color:"rgba(255,255,255,.4)"}}>Sin jugadores.</div>}
                <button className="btn btn-r btn-sm" style={{marginTop:8}}
                  onClick={()=>onCloseRoom(r.code)}>🚫 Cerrar sala</button>
              </div>
            )}
          </div>
        );
      })}
      {filtered.length===0 && <div style={{color:"rgba(255,255,255,.35)",fontSize:".8rem",padding:"10px 0"}}>Sin salas con esos filtros.</div>}
      {filtered.length>150 && (
        <div style={{textAlign:"center",color:"rgba(255,255,255,.35)",fontSize:".72rem",marginTop:8}}>
          Mostrando las primeras 150 — afina la búsqueda para ver más.
        </div>
      )}
    </div>
  );
}

// ── GRUPOS: listado + buscador + actividad real + eliminación masiva ────
function GroupsTab({groups,statsGroups,usersByUid,onDelete,onBulkDelete}){
  const[q,setQ]=React.useState("");
  const[neverOnly,setNeverOnly]=React.useState(false);
  const[inactOp,setInactOp]=React.useState("gte");
  const[inactDays,setInactDays]=React.useState("");
  const[from,setFrom]=React.useState("");
  const[to,setTo]=React.useState("");
  const[memberTypeF,setMemberTypeF]=React.useState("all");
  const[picked,setPicked]=React.useState({});
  const[confirmText,setConfirmText]=React.useState("");
  const[busy,setBusy]=React.useState(false);

  // Tipos de cuenta presentes entre los miembros del grupo -- cruza los
  // uids guardados en members contra /users (usersByUid) para saber el
  // provider real de cada uno; "?" si el usuario ya no existe en /users.
  function memberProviders(g){
    const uids=Object.keys(g.members||{});
    const set={};
    uids.forEach(function(uid){
      const u=(usersByUid||{})[uid];
      set[u?providerOf(u):"?"]=true;
    });
    return set;
  }

  function gameIds(gid){ return Object.keys((statsGroups[gid]||{}).games||{}); }
  function lastActivity(gid){
    const games=(statsGroups[gid]||{}).games||{};
    let max=0;
    Object.keys(games).forEach(function(id){ if((games[id].date||0)>max) max=games[id].date; });
    return max;
  }
  // Días desde la última partida -- si nunca jugó, cuenta desde que se
  // creó el grupo (más útil que "días desde 1970" para decidir si ya se
  // puede considerar abandonado).
  function inactivityDays(g){
    const ts=lastActivity(g.id)||g.createdAt||0;
    return ts ? Math.floor((Date.now()-ts)/86400000) : 999999;
  }

  const filtered=React.useMemo(function(){
    let list=groups.slice();
    const qq=q.trim().toLowerCase();
    if(qq) list=list.filter(function(g){
      return (g.name||"").toLowerCase().indexOf(qq)>=0 || (g.code||"").toLowerCase().indexOf(qq)>=0;
    });
    if(from){
      const fromTs=new Date(from+"T00:00:00").getTime();
      list=list.filter(function(g){ return (g.createdAt||0)>=fromTs; });
    }
    if(to){
      const toTs=new Date(to+"T23:59:59").getTime();
      list=list.filter(function(g){ return (g.createdAt||0)<=toTs; });
    }
    if(neverOnly) list=list.filter(function(g){ return gameIds(g.id).length===0; });
    if(inactDays!=="") list=list.filter(function(g){ return cmpMatch(inactivityDays(g),inactOp,inactDays); });
    if(memberTypeF==="mixed"){
      list=list.filter(function(g){
        const set=memberProviders(g);
        return set["google.com"] && set["password"] && set["anonymous"];
      });
    } else if(memberTypeF!=="all"){
      list=list.filter(function(g){ return !!memberProviders(g)[memberTypeF]; });
    }
    list.sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
    return list;
  },[groups,statsGroups,usersByUid,q,neverOnly,inactOp,inactDays,memberTypeF,from,to]);

  const pickedIds=Object.keys(picked).filter(function(id){ return picked[id]; });
  async function runBulkDelete(){
    if(confirmText.trim().toUpperCase()!=="CONFIRMAR")return;
    setBusy(true);
    try{ await onBulkDelete(pickedIds); setPicked({});setConfirmText(""); }
    finally{ setBusy(false); }
  }

  const inputStyle={background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
    borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"};
  const selectStyle={background:"#1a1a2e",color:"#fff",border:"1px solid rgba(255,255,255,.15)",
    borderRadius:10,padding:9,fontFamily:"'Nunito',sans-serif"};

  return(
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar grupo o código..."
          style={Object.assign({flex:"1 1 180px"},inputStyle)}/>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
          style={Object.assign({colorScheme:"dark"},inputStyle)}/>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)}
          style={Object.assign({colorScheme:"dark"},inputStyle)}/>
        <span style={{fontSize:".7rem",color:"rgba(255,255,255,.45)",alignSelf:"center"}}>Días de inactividad:</span>
        <CmpSelect value={inactOp} onChange={setInactOp}/>
        <input type="number" min="0" value={inactDays} onChange={e=>setInactDays(e.target.value)} placeholder="días"
          style={{width:90,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
          borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:".72rem",color:"rgba(255,255,255,.6)"}}>
          <input type="checkbox" checked={neverOnly} onChange={e=>setNeverOnly(e.target.checked)}/>
          👻 Solo los que nunca jugaron
        </label>
        <select value={memberTypeF} onChange={e=>setMemberTypeF(e.target.value)} style={selectStyle}>
          <option style={OPTION_STYLE} value="all">Cualquier tipo de cuenta</option>
          <option style={OPTION_STYLE} value="google.com">🟢 Incluye Gmail/Google</option>
          <option style={OPTION_STYLE} value="password">✉️ Incluye correo y contraseña</option>
          <option style={OPTION_STYLE} value="anonymous">👻 Incluye anónimos</option>
          <option style={OPTION_STYLE} value="mixed">🎭 Mezcla los 3 tipos</option>
        </select>
      </div>

      {pickedIds.length>0 && (
        <div style={{background:"rgba(230,57,70,.1)",border:"1px solid rgba(230,57,70,.35)",borderRadius:12,
          padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:".78rem",marginBottom:6}}>{pickedIds.length} grupo(s) seleccionados para eliminar.</div>
          <input value={confirmText} onChange={e=>setConfirmText(e.target.value)} placeholder='Escribe "CONFIRMAR" para eliminar'
            style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
            borderRadius:8,padding:8,color:"#fff",marginBottom:6,fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
          <button className="btn btn-r btn-sm" disabled={busy||confirmText.trim().toUpperCase()!=="CONFIRMAR"}
            onClick={runBulkDelete}>🗑️ Eliminar seleccionados</button>
        </div>
      )}

      <div style={{fontSize:".7rem",color:"rgba(255,255,255,.4)",marginBottom:8}}>{filtered.length} de {groups.length} grupos</div>

      {filtered.map(function(g){
        const memberCount=Object.keys(g.members||{}).length;
        const games=gameIds(g.id).length;
        const last=lastActivity(g.id);
        const providers=memberProviders(g);
        return(
          <div key={g.id} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
            borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
            <input type="checkbox" checked={!!picked[g.id]}
              onChange={e=>setPicked(p=>Object.assign({},p,{[g.id]:e.target.checked}))}/>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontWeight:700,fontSize:".85rem"}}>{g.name}
                <span style={{color:"rgba(255,255,255,.4)",fontWeight:400}}> · {g.code}</span></div>
              <div style={{fontSize:".68rem",color:"rgba(255,255,255,.45)"}}>
                {memberCount} miembro(s) {providers["google.com"]&&"🟢"}{providers["password"]&&"✉️"}{providers["anonymous"]&&"👻"}
                {" "}· creado {fmtDate(g.createdAt)} · {games} partida(s)
                {last?" · última "+daysAgo(last):""}{g.currentRoom?" · partida activa: "+g.currentRoom:""}
              </div>
            </div>
            <button className="btn btn-r btn-sm" onClick={()=>onDelete(g.id,g.name)}>🗑️ Eliminar</button>
          </div>
        );
      })}
      {filtered.length===0 && <div style={{color:"rgba(255,255,255,.35)",fontSize:".8rem",padding:"10px 0"}}>Sin grupos con esos filtros.</div>}
    </div>
  );
}

// ── USUARIOS: tabla con filtros + ficha de usuario con acciones ─────────
function UsersTable({users,moderationMap,onSelect,onBulkBan,onBulkWarn,onBulkSuspend,onBulkUnban}){
  const[q,setQ]=React.useState("");
  const[statusF,setStatusF]=React.useState("all");
  const[providerF,setProviderF]=React.useState("all");
  const[from,setFrom]=React.useState("");
  const[to,setTo]=React.useState("");
  const[inactOp,setInactOp]=React.useState("gte");
  const[inactDays,setInactDays]=React.useState("");
  const[sort,setSort]=React.useState("recent");
  const[picked,setPicked]=React.useState({});
  const[bulkReason,setBulkReason]=React.useState("");
  const[bulkDays,setBulkDays]=React.useState(7);
  const[bulkConfirm,setBulkConfirm]=React.useState("");
  const[bulkBusy,setBulkBusy]=React.useState(false);

  function inactivityDays(u){
    const ts=u.lastLogin||u.createdAt||0;
    return ts ? Math.floor((Date.now()-ts)/86400000) : 999999;
  }

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
        const st=(moderationMap[u.uid]&&moderationMap[u.uid].status)||"ok";
        return st===statusF;
      });
    }
    if(providerF!=="all"){
      list=list.filter(function(u){ return providerOf(u)===providerF; });
    }
    if(from){
      const fromTs=new Date(from+"T00:00:00").getTime();
      list=list.filter(function(u){ return (u.createdAt||0)>=fromTs; });
    }
    if(to){
      const toTs=new Date(to+"T23:59:59").getTime();
      list=list.filter(function(u){ return (u.createdAt||0)<=toTs; });
    }
    if(inactDays!==""){
      list=list.filter(function(u){ return cmpMatch(inactivityDays(u),inactOp,inactDays); });
    }
    list.sort(function(a,b){
      if(sort==="recent") return (b.createdAt||0)-(a.createdAt||0);
      if(sort==="oldest") return (a.createdAt||0)-(b.createdAt||0);
      if(sort==="name") return (a.displayName||a.email||"").localeCompare(b.displayName||b.email||"");
      return 0;
    });
    return list;
  },[users,moderationMap,q,statusF,providerF,from,to,inactOp,inactDays,sort]);

  const inputStyle={background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
    borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"};
  const selectStyle={background:"#1a1a2e",color:"#fff",border:"1px solid rgba(255,255,255,.15)",
    borderRadius:10,padding:9,fontFamily:"'Nunito',sans-serif"};

  const pickedUids=Object.keys(picked).filter(function(u){ return picked[u]; });
  // Advertir y suspender no son irreversibles -- no piden "CONFIRMAR".
  // Banear y quitar sanción sobre un lote grande sí, por si acaso.
  async function runBulk(fn,needsConfirm){
    if(needsConfirm && bulkConfirm.trim().toUpperCase()!=="CONFIRMAR")return;
    setBulkBusy(true);
    try{ await fn(); setPicked({});setBulkReason("");setBulkConfirm(""); }
    finally{ setBulkBusy(false); }
  }

  return(
    <div>
      {pickedUids.length>0 && (
        <div style={{background:"rgba(230,57,70,.1)",border:"1px solid rgba(230,57,70,.35)",borderRadius:12,
          padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:".78rem",marginBottom:6}}>{pickedUids.length} usuario(s) seleccionados.</div>
          <textarea value={bulkReason} onChange={e=>setBulkReason(e.target.value)} rows={2} placeholder="Motivo (para advertir/suspender/banear)"
            style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
            borderRadius:8,padding:8,color:"#fff",marginBottom:6,fontFamily:"'Nunito',sans-serif",boxSizing:"border-box",resize:"vertical"}}/>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:6}}>
            <button className="btn btn-y btn-sm" disabled={bulkBusy}
              onClick={()=>runBulk(()=>onBulkWarn(pickedUids,bulkReason),false)}>⚠️ Advertir</button>
            <select value={bulkDays} onChange={e=>setBulkDays(Number(e.target.value))} style={{
              background:"#1a1a2e",color:"#fff",border:"1px solid rgba(255,255,255,.15)",
              borderRadius:8,padding:"7px 8px",fontFamily:"'Nunito',sans-serif"}}>
              <option style={OPTION_STYLE} value={1}>1 día</option>
              <option style={OPTION_STYLE} value={3}>3 días</option>
              <option style={OPTION_STYLE} value={7}>7 días</option>
              <option style={OPTION_STYLE} value={30}>30 días</option>
            </select>
            <button className="btn btn-t btn-sm" disabled={bulkBusy}
              onClick={()=>runBulk(()=>onBulkSuspend(pickedUids,bulkReason,Date.now()+bulkDays*86400000),false)}>⏳ Suspender</button>
            <button className="btn btn-g btn-sm" disabled={bulkBusy}
              onClick={()=>runBulk(()=>onBulkUnban(pickedUids),false)}>✅ Quitar sanción</button>
          </div>
          <input value={bulkConfirm} onChange={e=>setBulkConfirm(e.target.value)} placeholder='Escribe "CONFIRMAR" para banear'
            style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
            borderRadius:8,padding:8,color:"#fff",marginBottom:6,fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
          <button className="btn btn-r btn-sm" disabled={bulkBusy||bulkConfirm.trim().toUpperCase()!=="CONFIRMAR"}
            onClick={()=>runBulk(()=>onBulkBan(pickedUids,bulkReason),true)}>🚫 Banear seleccionados</button>
        </div>
      )}
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar nombre, correo o uid..."
          style={Object.assign({flex:"1 1 200px"},inputStyle)}/>
        <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={selectStyle}>
          <option style={OPTION_STYLE} value="all">Todos los estados</option>
          <option style={OPTION_STYLE} value="ok">✅ Activos</option>
          <option style={OPTION_STYLE} value="warned">⚠️ Advertidos</option>
          <option style={OPTION_STYLE} value="suspended">⏳ Suspendidos</option>
          <option style={OPTION_STYLE} value="banned">🚫 Baneados</option>
        </select>
        <select value={providerF} onChange={e=>setProviderF(e.target.value)} style={selectStyle}>
          <option style={OPTION_STYLE} value="all">Todos los tipos de cuenta</option>
          <option style={OPTION_STYLE} value="google.com">🟢 Gmail / Google</option>
          <option style={OPTION_STYLE} value="password">✉️ Correo y contraseña</option>
          <option style={OPTION_STYLE} value="anonymous">👻 Anónimo</option>
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
        <span style={{fontSize:".7rem",color:"rgba(255,255,255,.45)",alignSelf:"center"}}>Días de inactividad:</span>
        <CmpSelect value={inactOp} onChange={setInactOp}/>
        <input type="number" min="0" value={inactDays} onChange={e=>setInactDays(e.target.value)} placeholder="días"
          style={{width:90,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.15)",
          borderRadius:10,padding:9,color:"#fff",fontFamily:"'Nunito',sans-serif",boxSizing:"border-box"}}/>
      </div>

      <div style={{fontSize:".7rem",color:"rgba(255,255,255,.4)",marginBottom:8}}>
        {filtered.length} de {users.length} usuarios
      </div>

      {filtered.slice(0,200).map(function(u){
        const st=(moderationMap[u.uid]&&moderationMap[u.uid].status)||"ok";
        const col=MOD_COLOR[st]||MOD_COLOR.ok;
        return(
          <div key={u.uid} style={{
            background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",
            borderRadius:12,padding:"10px 14px",marginBottom:8,
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <input type="checkbox" checked={!!picked[u.uid]} onClick={e=>e.stopPropagation()}
              onChange={e=>setPicked(p=>Object.assign({},p,{[u.uid]:e.target.checked}))}/>
            <div style={{minWidth:0,flex:1,cursor:"pointer"}} onClick={()=>onSelect(u)}>
              <div style={{fontWeight:700,fontSize:".85rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {u.displayName||"Sin nombre"} {u.isAnon && <span style={{color:"rgba(255,255,255,.35)"}}>(anónimo)</span>}
              </div>
              <div style={{fontSize:".68rem",color:"rgba(255,255,255,.45)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {u.email||"—"} · alta {fmtDate(u.createdAt)} · {PROVIDER_LABEL[providerOf(u)]||providerOf(u)}
              </div>
            </div>
            <span onClick={()=>onSelect(u)} style={{background:col.bg,border:"1px solid "+col.border,borderRadius:20,
              padding:"3px 9px",fontSize:".62rem",whiteSpace:"nowrap",cursor:"pointer"}}>{MOD_LABEL[st]}</span>
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
            {a.roomCode && <div style={{marginTop:4,color:"rgba(255,255,255,.6)"}}>Sala: {a.roomCode}</div>}
            {a.playerName && <div style={{marginTop:4,color:"rgba(255,255,255,.6)"}}>Jugador: {a.playerName}</div>}
            {a.groupName && <div style={{marginTop:4,color:"rgba(255,255,255,.6)"}}>Grupo: {a.groupName}</div>}
            {typeof a.count==="number" && <div style={{marginTop:4,color:"rgba(255,255,255,.6)"}}>Cantidad: {a.count}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── SEGURIDAD: solicitudes de amistad en exceso + patrones sospechosos ──
// Firebase Realtime Database no es SQL, así que no hay "inyección SQL"
// real posible -- lo que sí puede pasar es que alguien meta ese tipo de
// texto (u otros intentos de script/plantilla) en un campo libre (nombre,
// sala, grupo, buzón) probando si algo se rompe. Este escaneo es un
// chequeo de patrones sobre lo que ya está cargado, no un firewall.
const SUSPICIOUS_PATTERNS=[
  {label:"Posible SQL",re:/(\bunion\b[\s\S]{0,20}\bselect\b)|('\s*or\s*'?1'?\s*=\s*'?1)|(\bdrop\s+table\b)|(;\s*--)|(\bselect\b[\s\S]{0,20}\bfrom\b)|(\binsert\s+into\b)/i},
  {label:"Posible script / XSS",re:/<script|onerror\s*=|onload\s*=|javascript:/i},
  {label:"Posible plantilla / inyección",re:/\$\{|\{\{/},
  {label:"Ruta sospechosa",re:/\.\.\//}
];
function scanText(value){
  if(!value||typeof value!=="string") return null;
  for(let i=0;i<SUSPICIOUS_PATTERNS.length;i++){
    if(SUSPICIOUS_PATTERNS[i].re.test(value)) return SUSPICIOUS_PATTERNS[i].label;
  }
  return null;
}

function SecurityTab({users,usersByUid,rooms,groups,bugs,suggestions,onSelectUser}){
  const requestCounts=React.useMemo(function(){
    const counts={};
    users.forEach(function(u){
      const reqs=u.friendRequests||{};
      Object.keys(reqs).forEach(function(fromUid){ counts[fromUid]=(counts[fromUid]||0)+1; });
    });
    return counts;
  },[users]);
  const topRequesters=React.useMemo(function(){
    return Object.keys(requestCounts)
      .map(function(uid){ return {uid:uid,count:requestCounts[uid],user:usersByUid[uid]}; })
      .sort(function(a,b){ return b.count-a.count; })
      .slice(0,20);
  },[requestCounts,usersByUid]);

  const flags=React.useMemo(function(){
    const out=[];
    users.forEach(function(u){
      const m=scanText(u.displayName);
      if(m) out.push({source:"Usuario",label:m,value:u.displayName,ref:u.email||u.uid,uid:u.uid});
    });
    rooms.forEach(function(r){
      const mh=scanText(r.hostName);
      if(mh) out.push({source:"Sala "+r.code,label:mh,value:r.hostName,ref:r.code});
      (r.players||[]).forEach(function(p){
        const mp=scanText(p.name);
        if(mp) out.push({source:"Sala "+r.code,label:mp,value:p.name,ref:r.code,uid:p.uid});
      });
    });
    groups.forEach(function(g){
      const m=scanText(g.name);
      if(m) out.push({source:"Grupo",label:m,value:g.name,ref:g.code});
    });
    (bugs||[]).concat(suggestions||[]).forEach(function(it){
      const m=scanText(it.text)||scanText(it.name);
      if(m) out.push({source:"Buzón",label:m,value:(it.text||it.name||"").slice(0,140),ref:it.email||it.name,uid:it.uid});
    });
    return out;
  },[users,rooms,groups,bugs,suggestions]);

  return(
    <div>
      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".8rem",color:"#fff",marginBottom:6}}>
        🕵️ Top solicitantes de amistad
      </div>
      <div style={{fontSize:".7rem",color:"rgba(255,255,255,.4)",marginBottom:10}}>
        Suma cuántas solicitudes de amistad ha ENVIADO cada quien (entre todos los destinatarios) -- útil para detectar a alguien agregando gente al por mayor. Clic para abrir su ficha.
      </div>
      {topRequesters.length===0 && (
        <div style={{color:"rgba(255,255,255,.35)",fontSize:".8rem",marginBottom:20}}>Sin solicitudes registradas todavía.</div>
      )}
      {topRequesters.map(function(r){
        return(
          <div key={r.uid} onClick={()=>r.user&&onSelectUser(r.user)} style={{
            background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,
            padding:"9px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",
            cursor:r.user?"pointer":"default"}}>
            <span style={{fontSize:".8rem"}}>{(r.user&&(r.user.displayName||r.user.email))||("uid: "+r.uid)}</span>
            <span style={{fontSize:".72rem",color:"rgba(255,255,255,.5)"}}>{r.count} solicitudes enviadas</span>
          </div>
        );
      })}

      <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".8rem",color:"#fff",margin:"22px 0 6px"}}>
        🚨 Patrones sospechosos
      </div>
      <div style={{fontSize:".7rem",color:"rgba(255,255,255,.4)",marginBottom:10}}>
        Firebase no usa SQL, así que no hay inyección SQL real posible aquí -- esto detecta a alguien probando ese tipo de texto (u otros intentos de script) en campos libres, más como señal de comportamiento raro que como vulnerabilidad real.
      </div>
      {flags.length===0 && <div style={{color:"rgba(255,255,255,.35)",fontSize:".8rem"}}>No se detectó nada sospechoso.</div>}
      {flags.map(function(f,i){
        return(
          <div key={i} style={{background:"rgba(230,57,70,.08)",border:"1px solid rgba(230,57,70,.3)",
            borderRadius:12,padding:"9px 12px",marginBottom:6,fontSize:".76rem"}}>
            <b>{f.label}</b> · {f.source}{f.ref?" ("+f.ref+")":""}
            <div style={{marginTop:3,color:"rgba(255,255,255,.6)",wordBreak:"break-word"}}>{f.value}</div>
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
  const[rooms,setRooms]=React.useState([]);
  const[groups,setGroups]=React.useState([]);
  const[statsGroups,setStatsGroups]=React.useState({}); // partidas reales por grupo (gameCount del grupo nunca se incrementa)
  const[stats,setStats]=React.useState({games:0,players:0,users:0,aiScans:0});
  const[tab,setTab]=React.useState("resumen"); // resumen | usuarios | salas | grupos | bugs | sugerencias | auditoria

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
    const roomsRef=_db.ref("rooms"); // .read admin-only a nivel padre -- ver reglas
    const groupsRef=_db.ref("groups");
    // "gameCount" en /groups/{gid} nunca se incrementa en el juego (queda
    // en 0 desde que se crea el grupo) -- la actividad real vive aquí, en
    // el índice que sí se llena cada vez que termina una partida de grupo.
    const statsGroupsRef=_db.ref("stats/groups");
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
    const hRooms=roomsRef.on("value",snap=>{
      const val=snap.val()||{};
      setRooms(Object.keys(val).map(function(code){ return Object.assign({code:code},val[code]); }));
    });
    const hGroups=groupsRef.on("value",snap=>{
      const val=snap.val()||{};
      setGroups(Object.keys(val).map(function(gid){ return Object.assign({id:gid},val[gid]); }));
    });
    const hStatsGroups=statsGroupsRef.on("value",snap=>setStatsGroups(snap.val()||{}));
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
      roomsRef.off("value",hRooms);groupsRef.off("value",hGroups);
      statsGroupsRef.off("value",hStatsGroups);
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
  async function handleBulkResolve(type,ids){
    try{ await resolveTicketsBulk(type,ids); }
    catch(e){ console.warn("No se pudo resolver en lote:",e.message); }
  }
  async function handleBulkBanUsers(uids,reason){
    try{ await banUsersBulk(uids,reason); }
    catch(e){ console.warn("No se pudo banear en lote:",e.message); }
  }
  async function handleBulkWarnUsers(uids,reason){
    try{ await warnUsersBulk(uids,reason); }
    catch(e){ console.warn("No se pudo advertir en lote:",e.message); }
  }
  async function handleBulkSuspendUsers(uids,reason,untilTs){
    try{ await suspendUsersBulk(uids,reason,untilTs); }
    catch(e){ console.warn("No se pudo suspender en lote:",e.message); }
  }
  async function handleBulkUnbanUsers(uids){
    try{ await unbanUsersBulk(uids); }
    catch(e){ console.warn("No se pudo quitar la sanción en lote:",e.message); }
  }
  async function handleCloseRoom(code){
    try{ await closeRoom(code); }
    catch(e){ console.warn("No se pudo cerrar la sala:",e.message); }
  }
  async function handleKickPlayer(code,playerId,playerName){
    try{ await kickPlayerFromRoom(code,playerId,playerName); }
    catch(e){ console.warn("No se pudo expulsar al jugador:",e.message); }
  }
  async function handleBulkDeleteRooms(codes){
    try{ await deleteRoomsBulk(codes); }
    catch(e){ console.warn("No se pudieron eliminar las salas:",e.message); }
  }
  async function handleDeleteGroup(gid,name){
    try{ await deleteGroupAdmin(gid,name); }
    catch(e){ console.warn("No se pudo eliminar el grupo:",e.message); }
  }
  async function handleBulkDeleteGroups(gids){
    try{ await deleteGroupsBulk(gids); }
    catch(e){ console.warn("No se pudieron eliminar los grupos:",e.message); }
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

  // ── Analítica ampliada (Fase 2) ──────────────────────────────────────
  const now=Date.now();
  const newUsers7d=users.filter(function(u){ return (u.createdAt||0)>=now-7*86400000; }).length;
  const newUsersPrev7d=users.filter(function(u){
    return (u.createdAt||0)>=now-14*86400000 && (u.createdAt||0)<now-7*86400000;
  }).length;
  const userTrend=newUsersPrev7d===0
    ? (newUsers7d>0?"nuevo":"sin cambio")
    : (newUsers7d>=newUsersPrev7d?"+":"")+Math.round(((newUsers7d-newUsersPrev7d)/newUsersPrev7d)*100)+"% vs semana anterior";
  const activeRooms=rooms.filter(function(r){ return !r.finished; }).length;
  const abandonedRooms=rooms.filter(function(r){
    const ts=r.lastActivityAt||r.gameStartedAt||r.createdAt||0;
    return !r.finished && (now-ts>3*86400000);
  }).length;
  const errorRate=stats.games>0 ? ((bugs.length/stats.games)*100).toFixed(1)+"%" : "—";
  function groupGameCount(gid){ return Object.keys((statsGroups[gid]||{}).games||{}).length; }
  const topGroups=groups.slice().sort(function(a,b){ return groupGameCount(b.id)-groupGameCount(a.id); })
    .filter(function(g){ return groupGameCount(g.id)>0; }).slice(0,3);

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
        {[["resumen","📊 Resumen"],["usuarios","👥 Usuarios"],["salas","🎮 Salas ("+activeRooms+")"],
          ["grupos","👪 Grupos"],["bugs","🐞 Bugs ("+pendingBugs+")"],
          ["sugerencias","💡 Sugerencias ("+pendingSug+")"],["seguridad","🕵️ Seguridad"],
          ["auditoria","📜 Auditoría"]].map(function(pair){
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
          <StatCard icon="🎮" label="SALAS ACTIVAS" value={activeRooms} sub={abandonedRooms+" abandonadas (+3 días)"}/>
          <StatCard icon="👪" label="GRUPOS" value={groups.length}/>
        </div>
      )}

      {tab==="resumen" && (
        <div style={{marginTop:16,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
          borderRadius:14,padding:"14px 16px"}}>
          <div style={{fontFamily:"'Righteous',sans-serif",fontSize:".75rem",color:"#fff",marginBottom:10}}>
            📈 Analítica
          </div>
          <div style={{fontSize:".8rem",color:"rgba(255,255,255,.7)",lineHeight:1.8}}>
            Usuarios nuevos esta semana: <b>{newUsers7d}</b> ({userTrend})<br/>
            Tasa de bugs reportados por partida: <b>{errorRate}</b><br/>
            {topGroups.length>0 && (
              <span>Grupos más activos: {topGroups.map(function(g){ return g.name+" ("+groupGameCount(g.id)+")"; }).join(", ")}</span>
            )}
            {topGroups.length===0 && <span>Todavía ningún grupo tiene partidas registradas.</span>}
          </div>
        </div>
      )}

      {tab==="usuarios" && (
        <UsersTable users={users} moderationMap={moderationMap} onSelect={setSelectedUser}
          onBulkBan={handleBulkBanUsers} onBulkWarn={handleBulkWarnUsers}
          onBulkSuspend={handleBulkSuspendUsers} onBulkUnban={handleBulkUnbanUsers}/>
      )}

      {tab==="salas" && (
        <RoomsTab rooms={rooms} groups={groups} onCloseRoom={handleCloseRoom} onKick={handleKickPlayer} onBulkDelete={handleBulkDeleteRooms}/>
      )}

      {tab==="grupos" && (
        <GroupsTab groups={groups} statsGroups={statsGroups} usersByUid={usersByUid} onDelete={handleDeleteGroup} onBulkDelete={handleBulkDeleteGroups}/>
      )}

      {tab==="bugs" && <FeedbackList title="Bugs reportados" icon="🐞" items={bugs} usersByUid={usersByUid}
        onCycleStatus={it=>cycleStatus(it,"bugs")}
        onSetPriority={(it,p)=>setTicketPriority(it,"bugs",p)}
        onSetNotes={(it,n)=>setTicketNotes(it,"bugs",n)}
        onBulkResolve={ids=>handleBulkResolve("bugs",ids)}/>}
      {tab==="sugerencias" && <FeedbackList title="Sugerencias de juegos" icon="💡" items={suggestions} usersByUid={usersByUid}
        onCycleStatus={it=>cycleStatus(it,"suggestions")}
        onSetPriority={(it,p)=>setTicketPriority(it,"suggestions",p)}
        onSetNotes={(it,n)=>setTicketNotes(it,"suggestions",n)}
        onBulkResolve={ids=>handleBulkResolve("suggestions",ids)}/>}

      {tab==="seguridad" && (
        <SecurityTab users={users} usersByUid={usersByUid} rooms={rooms} groups={groups}
          bugs={bugs} suggestions={suggestions} onSelectUser={setSelectedUser}/>
      )}

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
