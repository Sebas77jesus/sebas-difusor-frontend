import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { authApi, inboxApi, bodegasApi, comunidadesApi, whatsappApi, startDifusion } from "./api/client";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";
const gIcon = (g) => g === "Hombre" ? "🧔" : g === "Dama" ? "👱‍♀️" : "🧔👱‍♀️";
const fmt = (n) => n ? `$ ${Number(n).toLocaleString("es-CO")}` : "—";

function buildCaption(item) {
  const gi = gIcon(item.genero || "Hombre");
  const tallas = item.tallas || "CONSULTAR TALLAS";
  let txt = "";
  if (item.es_promo) txt += `🚨 *PROMO PROMO PROMO* 🚨\n*SEBAS SHOES* 👟\n⚠️ *NO CAMBIO - NO GARANTÍA*\n\n`;
  txt += `*${(item.nombre || "** NOMBRE **").toUpperCase()}* 💣🔥\n\n`;
  txt += `Numeración ${item.genero || "Hombre"} ${gi} *(${tallas})*\n\n`;
  txt += `*Precio: $ ${Number((item.precio_bodega || 0) + (item.price_adjust || 5000)).toLocaleString("es-CO")}*`;
  if (item.tiene_caja && item.precio_caja) {
    txt += `\n\n*DISPONIBLE POR CAJA* 📦 $ ${Number(item.precio_caja).toLocaleString("es-CO")}`;
  }
  if (item.cod) txt += `\n\nCOD ${item.cod}`;
  return txt;
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
const AuthCtx = React.createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("sd_user")); } catch { return null; } });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!localStorage.getItem("sd_token")) { setLoading(false); return; }
    authApi.me().then(setUser).catch(() => { localStorage.clear(); setUser(null); }).finally(() => setLoading(false));
  }, []);
  const login = async (email, password) => {
    const { token, user } = await authApi.login(email, password);
    localStorage.setItem("sd_token", token);
    localStorage.setItem("sd_user", JSON.stringify(user));
    setUser(user);
  };
  const logout = () => { localStorage.clear(); setUser(null); };
  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}

// ── WA STATUS ─────────────────────────────────────────────────────────────────
const WaCtx = React.createContext(null);
function WaProvider({ children }) {
  const [waStatus, setWaStatus] = useState("disconnected");
  const [qr, setQr] = useState(null);
  const { user } = React.useContext(AuthCtx);

  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        const s = await whatsappApi.status();
        setWaStatus(s.status);
        if (s.hasQR) {
          try { const d = await whatsappApi.qr(); if (d.qr) setQr(d.qr); } catch {}
        }
        if (s.isConnected) setQr(null);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => clearInterval(iv);
  }, [user]);

  return <WaCtx.Provider value={{ waStatus, qr, isConnected: waStatus === "connected" }}>{children}</WaCtx.Provider>;
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginPage() {
  const { login } = React.useContext(AuthCtx);
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@sebas.com");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setLoading(true);
    try { await login(email, pass); nav("/"); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0a0f1a", padding:20 }}>
      <div style={{ width:"100%", maxWidth:360 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:60,height:60,borderRadius:16,background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 12px" }}>👟</div>
          <div style={{ fontSize:22,fontWeight:900,color:"#fff" }}>SebasDifusor</div>
          <div style={{ color:"#ffffff40",fontSize:13,marginTop:4 }}>Sistema de difusión automática</div>
        </div>
        <form onSubmit={submit} style={{ background:"#ffffff06",border:"1px solid #ffffff10",borderRadius:16,padding:24 }}>
          {err && <div style={{ background:"#ef444412",border:"1px solid #ef444430",borderRadius:9,padding:"10px 14px",marginBottom:16,color:"#ef4444",fontSize:13 }}>⚠️ {err}</div>}
          <div style={{ marginBottom:14 }}>
            <label style={{ color:"#ffffff50",fontSize:11,display:"block",marginBottom:5 }}>Email</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} style={{ width:"100%",background:"#ffffff08",border:"1px solid #ffffff15",borderRadius:9,padding:"10px 13px",fontSize:14,color:"#fff",outline:"none",boxSizing:"border-box" }} />
          </div>
          <div style={{ marginBottom:22 }}>
            <label style={{ color:"#ffffff50",fontSize:11,display:"block",marginBottom:5 }}>Contraseña</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" style={{ width:"100%",background:"#ffffff08",border:"1px solid #ffffff15",borderRadius:9,padding:"10px 13px",fontSize:14,color:"#fff",outline:"none",boxSizing:"border-box" }} />
          </div>
          <button type="submit" disabled={loading} style={{ background:"linear-gradient(135deg,#f59e0b,#ef4444)",border:"none",borderRadius:12,color:"#fff",width:"100%",padding:"13px 0",fontSize:15,fontWeight:700,cursor:"pointer",opacity:loading?0.5:1 }}>
            {loading?"Entrando...":"Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── TARJETA PRODUCTO ──────────────────────────────────────────────────────────
function TarjetaProducto({ msg: msgInicial, selected, onToggle, onUpdate }) {
  const [msg, setMsg] = useState(msgInicial);
  const [editando, setEditando] = useState(!msg.nombre);
  const [saving, setSaving] = useState(false);
  const edit = (k, v) => setMsg(p => ({ ...p, [k]: v }));
  const caption = buildCaption(msg);

  const guardar = async () => {
    setSaving(true);
    try {
      const updated = await inboxApi.update(msg.id, {
        nombre: msg.nombre, genero: msg.genero, tallas: msg.tallas,
        precio_bodega: msg.precio_bodega, price_adjust: msg.price_adjust,
        tiene_caja: msg.tiene_caja, precio_caja: msg.precio_caja, es_promo: msg.es_promo,
        caption_final: buildCaption(msg),
      });
      onUpdate(updated);
      setEditando(false);
    } catch {} finally { setSaving(false); }
  };

  return (
    <div style={{ background:selected?"#25d36606":"#ffffff04", border:`1.5px solid ${selected?"#25d366":"#ffffff08"}`, borderRadius:16, marginBottom:10, overflow:"hidden" }}>

      {/* Layout horizontal: foto pequeña izq + texto derecha */}
      <div style={{ display:"flex" }}>
        {/* Foto */}
        <div style={{ width:90, flexShrink:0, background:"#111b21", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, color:"#ffffff10", position:"relative", minHeight:130 }}>
          {msg.media_path
            ? <img src={msg.media_path} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",position:"absolute",inset:0 }} />
            : "👟"
          }
          <div onClick={onToggle} style={{ position:"absolute",top:7,left:7,width:24,height:24,borderRadius:7,background:selected?"#25d366":"#00000099",border:`2px solid ${selected?"#25d366":"#ffffff50"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:13,fontWeight:900,color:"#fff",zIndex:2 }}>
            {selected?"✓":""}
          </div>
          {msg.es_promo && <div style={{ position:"absolute",bottom:6,left:4,background:"#ef4444",borderRadius:5,padding:"2px 5px",fontSize:9,color:"#fff",fontWeight:800,zIndex:2 }}>🚨PROMO</div>}
        </div>

        {/* Caption principal */}
        <div style={{ flex:1, padding:"11px 12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            {msg.cod && <div style={{ background:"#ffffff0a",borderRadius:5,padding:"2px 7px",fontSize:10,color:"#ffffff50",fontWeight:700 }}>COD {msg.cod}</div>}
            <button onClick={() => setEditando(!editando)} style={{ marginLeft:"auto",background:editando?"#f59e0b20":"#ffffff08",border:`1px solid ${editando?"#f59e0b40":"#ffffff10"}`,borderRadius:7,color:editando?"#f59e0b":"#ffffff50",padding:"4px 9px",fontSize:11,cursor:"pointer",fontWeight:editando?700:400 }}>
              {editando?"✅ Listo":"✏️ Editar"}
            </button>
          </div>
          {/* Burbuja WhatsApp */}
          <div style={{ background:"#005c4b",borderRadius:"4px 12px 12px 12px",padding:"9px 11px" }}>
            <pre style={{ margin:0,color:"#e9edef",fontSize:12,lineHeight:1.65,whiteSpace:"pre-wrap",fontFamily:"inherit" }}>{caption}</pre>
            <div style={{ textAlign:"right",fontSize:10,color:"#8696a088",marginTop:4 }}>
              {new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})} ✓✓
            </div>
          </div>
        </div>
      </div>

      {/* Panel edición inline */}
      {editando && (
        <div style={{ borderTop:"1px solid #ffffff08",padding:"12px 14px",background:"#0d1520" }}>
          <div style={{ color:"#f59e0b",fontSize:11,fontWeight:700,marginBottom:10 }}>✏️ Corregir si la IA procesó algo mal:</div>

          <div style={{ marginBottom:8 }}>
            <label style={{ color:"#ffffff40",fontSize:10,display:"block",marginBottom:3 }}>NOMBRE DEL PRODUCTO</label>
            <input value={msg.nombre || ""} onChange={e=>edit("nombre",e.target.value.toUpperCase())} placeholder={!msg.nombre?"⚠️ MÁQUINA no manda nombre — escríbelo aquí":"Nombre"} style={{ width:"100%",background:"#1e293b",border:`1.5px solid ${!msg.nombre?"#f59e0b":"#ffffff15"}`,borderRadius:8,padding:"8px 11px",fontSize:13,color:"#fff",fontWeight:700,outline:"none",boxSizing:"border-box" }} />
          </div>

          <div style={{ marginBottom:8 }}>
            <label style={{ color:"#ffffff40",fontSize:10,display:"block",marginBottom:3 }}>GÉNERO</label>
            <div style={{ display:"flex",gap:5 }}>
              {["Hombre","Dama","Hombre Y Dama"].map(g=>(
                <button key={g} onClick={()=>edit("genero",g)} style={{ flex:1,background:msg.genero===g?"#7c3aed":"#ffffff08",border:`1px solid ${msg.genero===g?"#7c3aed":"#ffffff12"}`,borderRadius:7,color:"#fff",padding:"6px 4px",fontSize:11,cursor:"pointer",fontWeight:msg.genero===g?700:400 }}>
                  {g==="Hombre"?"🧔 H":g==="Dama"?"👱‍♀️ D":"🧔👱‍♀️ H+D"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:8 }}>
            <label style={{ color:"#ffffff40",fontSize:10,display:"block",marginBottom:3 }}>TALLAS</label>
            <input value={msg.tallas || ""} onChange={e=>edit("tallas",e.target.value.toUpperCase())} style={{ width:"100%",background:"#1e293b",border:"1px solid #ffffff15",borderRadius:8,padding:"7px 10px",fontSize:12,color:"#fff",outline:"none",boxSizing:"border-box" }} />
          </div>

          <div style={{ marginBottom:8 }}>
            <label style={{ color:"#ffffff40",fontSize:10,display:"block",marginBottom:3 }}>PRECIO BODEGA → SE SUMA → TU PRECIO</label>
            <div style={{ display:"flex",gap:6,alignItems:"center" }}>
              <input type="number" value={msg.precio_bodega||0} onChange={e=>edit("precio_bodega",parseInt(e.target.value)||0)} style={{ flex:1,background:"#1e293b",border:"1px solid #ffffff15",borderRadius:8,padding:"7px 10px",fontSize:12,color:"#fff",outline:"none" }} />
              <span style={{ color:"#ffffff30" }}>+</span>
              <select value={msg.price_adjust||5000} onChange={e=>edit("price_adjust",parseInt(e.target.value))} style={{ background:"#1e293b",border:"1px solid #ffffff15",borderRadius:8,padding:"7px 8px",fontSize:12,color:"#fff",outline:"none" }}>
                {[0,3000,5000,8000,10000,15000].map(v=><option key={v} value={v}>{v===0?"0":`$${v.toLocaleString("es-CO")}`}</option>)}
              </select>
              <span style={{ color:"#ffffff30" }}>=</span>
              <div style={{ background:"#00d4aa15",border:"1px solid #00d4aa30",borderRadius:8,padding:"7px 10px",color:"#00d4aa",fontWeight:800,fontSize:13,whiteSpace:"nowrap" }}>
                ${((msg.precio_bodega||0)+(msg.price_adjust||5000)).toLocaleString("es-CO")}
              </div>
            </div>
          </div>

          <div style={{ display:"flex",gap:6,marginBottom:8 }}>
            <button onClick={()=>edit("tiene_caja",!msg.tiene_caja)} style={{ flex:1,background:msg.tiene_caja?"#00d4aa15":"#ffffff06",border:`1px solid ${msg.tiene_caja?"#00d4aa35":"#ffffff10"}`,borderRadius:8,color:msg.tiene_caja?"#00d4aa":"#ffffff40",padding:"7px 0",fontSize:11,cursor:"pointer" }}>
              📦 {msg.tiene_caja?"Tiene caja ✓":"Sin caja"}
            </button>
            <button onClick={()=>edit("es_promo",!msg.es_promo)} style={{ flex:1,background:msg.es_promo?"#ef444415":"#ffffff06",border:`1px solid ${msg.es_promo?"#ef444435":"#ffffff10"}`,borderRadius:8,color:msg.es_promo?"#ef4444":"#ffffff40",padding:"7px 0",fontSize:11,cursor:"pointer" }}>
              🚨 {msg.es_promo?"PROMO ✓":"No es promo"}
            </button>
          </div>

          {msg.tiene_caja && (
            <div style={{ marginBottom:8 }}>
              <label style={{ color:"#ffffff40",fontSize:10,display:"block",marginBottom:3 }}>PRECIO POR CAJA</label>
              <input type="number" value={msg.precio_caja||0} onChange={e=>edit("precio_caja",parseInt(e.target.value)||0)} style={{ width:"100%",background:"#1e293b",border:"1px solid #00d4aa30",borderRadius:8,padding:"7px 10px",fontSize:12,color:"#00d4aa",outline:"none",boxSizing:"border-box" }} />
            </div>
          )}

          <button onClick={guardar} disabled={saving} style={{ background:"linear-gradient(135deg,#25d366,#128c7e)",border:"none",borderRadius:10,color:"#fff",width:"100%",padding:"10px 0",fontSize:13,fontWeight:700,cursor:"pointer",marginTop:4,opacity:saving?0.5:1 }}>
            {saving?"Guardando...":"✅ Guardar cambios"}
          </button>
        </div>
      )}

      <div style={{ padding:"8px 14px",borderTop:"1px solid #ffffff06",display:"flex",justifyContent:"flex-end" }}>
        <button onClick={onToggle} style={{ background:selected?"#25d36620":"#ffffff08",border:`1.5px solid ${selected?"#25d366":"#ffffff12"}`,borderRadius:8,color:selected?"#25d366":"#ffffff40",padding:"6px 14px",fontSize:12,fontWeight:selected?700:400,cursor:"pointer" }}>
          {selected?"✓ Seleccionado":"Seleccionar"}
        </button>
      </div>
    </div>
  );
}

// ── INBOX PAGE ────────────────────────────────────────────────────────────────
const BODEGAS_TABS = [
  { key: "all", label: "Todas", emoji: "📥" },
  { key: "dmero", label: "D'Mero", emoji: "🔴", color: "#ef4444" },
  { key: "fym", label: "FYM", emoji: "✨", color: "#8b5cf6" },
  { key: "maylo", label: "Maylo", emoji: "📦", color: "#ec4899" },
  { key: "dinastia", label: "Dinastía", emoji: "👑", color: "#f59e0b" },
  { key: "maquina", label: "Máquina", emoji: "⚙️", color: "#06b6d4" },
];

function InboxPage() {
  const nav = useNavigate();
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [tab, setTab] = useState("all");
  const [step, setStep] = useState("list"); // list | sending | done
  const [progreso, setProgreso] = useState(0);
  const [comunidades, setComunidades] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ messages }, c] = await Promise.all([inboxApi.list("ready"), comunidadesApi.list()]);
      setMsgs(messages || []);
      setComunidades(c.comunidades || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const tk = localStorage.getItem("sd_token");
    const es = new EventSource(`${BASE_URL}/inbox/stream?token=${tk}`);
    es.addEventListener("new_message", () => loadData());
    return () => es.close();
  }, [loadData]);

  const bodegasPresentes = [...new Set(msgs.map(m => m.bodega_name || ""))].filter(Boolean);
  const tabColor = BODEGAS_TABS.find(t => t.key === tab)?.color || "#25d366";

  const filtrados = tab === "all" ? msgs : msgs.filter(m => {
    const n = (m.bodega_name || "").toLowerCase();
    if (tab === "dmero") return n.includes("mero");
    if (tab === "fym") return n.includes("fym");
    if (tab === "maylo") return n.includes("maylo");
    if (tab === "dinastia") return n.includes("dinast");
    if (tab === "maquina") return n.includes("quina");
    return true;
  });

  const toggle = (id) => setSelected(p => { const n = new Set(p); n.has(id)?n.delete(id):n.add(id); return n; });
  const selTodos = () => setSelected(new Set(filtrados.map(m=>m.id)));
  const limpiar = () => setSelected(new Set());

  const difundir = () => {
    setStep("sending"); setProgreso(0);
    startDifusion({
      inbox_ids: [...selected],
      comunidad_ids: comunidades.map(c=>c.id),
      onStart: () => {},
      onSent: (d) => setProgreso(Math.round((d.sent+d.failed)/d.total*100)),
      onFailed: (d) => setProgreso(Math.round((d.sent+d.failed)/d.total*100)),
      onComplete: () => { setStep("done"); setSelected(new Set()); loadData(); },
      onError: (e) => { alert("Error: "+e); setStep("list"); },
    });
  };

  if (step === "sending") return (
    <div style={{ padding:24,textAlign:"center",paddingTop:70,background:"#0a0f1a",minHeight:"100vh" }}>
      <div style={{ fontSize:60,marginBottom:16 }}>⏳</div>
      <div style={{ fontSize:20,fontWeight:900,color:"#25d366",marginBottom:8 }}>Difundiendo...</div>
      <div style={{ color:"#ffffff50",fontSize:13,marginBottom:28 }}>{selected.size} fotos → {comunidades.length} comunidades</div>
      <div style={{ height:10,background:"#ffffff0f",borderRadius:10,overflow:"hidden",marginBottom:8 }}>
        <div style={{ height:"100%",width:`${progreso}%`,background:"linear-gradient(90deg,#25d366,#128c7e)",borderRadius:10,transition:"width 0.15s" }} />
      </div>
      <div style={{ color:"#ffffff30",fontSize:12 }}>{progreso}%</div>
    </div>
  );

  if (step === "done") return (
    <div style={{ padding:24,textAlign:"center",paddingTop:70,background:"#0a0f1a",minHeight:"100vh" }}>
      <div style={{ fontSize:70,marginBottom:16 }}>🎉</div>
      <div style={{ fontSize:24,fontWeight:900,color:"#00d4aa",marginBottom:8 }}>¡Listo!</div>
      <div style={{ color:"#ffffff60",fontSize:14,marginBottom:4 }}>Fotos difundidas a {comunidades.length} comunidades</div>
      <div style={{ color:"#ffffff30",fontSize:13,marginBottom:32 }}>Lo que antes tardaba 50 min → ahora en minutos ⚡</div>
      <button onClick={()=>setStep("list")} style={{ background:"linear-gradient(135deg,#25d366,#128c7e)",border:"none",borderRadius:12,color:"#fff",padding:"14px 32px",fontSize:15,fontWeight:800,cursor:"pointer" }}>
        Ver bandeja →
      </button>
    </div>
  );

  return (
    <div>
      {/* Tabs por bodega */}
      <div style={{ display:"flex",overflowX:"auto",borderBottom:"1px solid #ffffff08",background:"#0d1520" }}>
        {BODEGAS_TABS.map(t => {
          const count = t.key === "all" ? msgs.length : msgs.filter(m => {
            const n = (m.bodega_name||"").toLowerCase();
            if (t.key==="dmero") return n.includes("mero");
            if (t.key==="fym") return n.includes("fym");
            if (t.key==="maylo") return n.includes("maylo");
            if (t.key==="dinastia") return n.includes("dinast");
            if (t.key==="maquina") return n.includes("quina");
            return false;
          }).length;
          if (t.key !== "all" && count === 0) return null;
          return (
            <button key={t.key} onClick={()=>{setTab(t.key);setSelected(new Set());}} style={{ background:tab===t.key?"#0a0f1a":"transparent",borderBottom:`2.5px solid ${tab===t.key?(t.color||"#25d366"):"transparent"}`,border:"none",borderTop:"none",borderLeft:"none",borderRight:"none",color:tab===t.key?"#fff":"#ffffff35",padding:"11px 12px",fontSize:12,fontWeight:tab===t.key?800:400,cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5 }}>
              {t.emoji} {t.label}
              {count > 0 && <span style={{ background:tab===t.key?(t.color||"#25d366"):"#ffffff15",color:"#fff",borderRadius:8,padding:"1px 6px",fontSize:10,fontWeight:800 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ padding:"10px 12px",display:"flex",gap:8,alignItems:"center",borderBottom:"1px solid #ffffff06" }}>
        <button onClick={selTodos} style={{ background:"#ffffff08",border:"1px solid #ffffff12",borderRadius:7,color:"#fff",padding:"6px 12px",fontSize:12,cursor:"pointer" }}>
          ☑️ Todos ({filtrados.length})
        </button>
        {selected.size>0 && <button onClick={limpiar} style={{ background:"#ffffff06",border:"1px solid #ffffff10",borderRadius:7,color:"#ffffff50",padding:"6px 10px",fontSize:12,cursor:"pointer" }}>Limpiar</button>}
        {selected.size>0 && <div style={{ marginLeft:"auto",color:"#ffffff50",fontSize:12 }}>{selected.size} seleccionados</div>}
      </div>

      {/* Lista */}
      <div style={{ padding:"8px 12px 110px" }}>
        {loading ? (
          <div style={{ textAlign:"center",padding:48,color:"#ffffff30" }}>Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign:"center",padding:48 }}>
            <div style={{ fontSize:48,marginBottom:12 }}>📭</div>
            <div style={{ color:"#fff",fontWeight:700 }}>Bandeja vacía</div>
            <div style={{ color:"#ffffff40",fontSize:13,marginTop:4 }}>Los mensajes de las bodegas aparecerán aquí</div>
          </div>
        ) : filtrados.map(msg => (
          <TarjetaProducto key={msg.id} msg={msg} selected={selected.has(msg.id)} onToggle={()=>toggle(msg.id)} onUpdate={(u)=>setMsgs(p=>p.map(m=>m.id===msg.id?u:m))} />
        ))}
      </div>

      {/* FAB Difundir */}
      {selected.size>0 && (
        <div style={{ position:"fixed",bottom:72,left:"50%",transform:"translateX(-50%)",width:"calc(100% - 24px)",maxWidth:406,zIndex:50 }}>
          <button onClick={difundir} style={{ width:"100%",background:`linear-gradient(135deg,${tabColor},${tabColor}bb)`,border:"none",borderRadius:14,color:"#fff",padding:"15px 0",fontSize:15,fontWeight:800,cursor:"pointer",boxShadow:`0 6px 28px ${tabColor}45` }}>
            📲 Difundir {selected.size} foto{selected.size!==1?"s":""} a {comunidades.length} comunidades
          </button>
          <div style={{ textAlign:"center",marginTop:5,color:"#ffffff30",fontSize:11 }}>
            → {comunidades.map(c=>c.name).join(" + ")}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CONFIG PAGE ───────────────────────────────────────────────────────────────
function ConfigPage() {
  const { isConnected } = React.useContext(WaCtx);
  const [seccion, setSeccion] = useState("bodegas");
  const [bodegas, setBodegas] = useState([]);
  const [comunidades, setComunidades] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [editando, setEditando] = useState(null);
  const [showBodegaForm, setShowBodegaForm] = useState(false);
  const [showComForm, setShowComForm] = useState(false);
  const [form, setForm] = useState({ name:"", wa_group_id:"", price_adjust:5000 });
  const [comForm, setComForm] = useState({ name:"", wa_group_id:"" });

  const load = async () => {
    const [b,c] = await Promise.all([bodegasApi.list(), comunidadesApi.list()]);
    setBodegas(b.bodegas||[]); setComunidades(c.comunidades||[]);
  };
  useEffect(()=>{ load(); },[]);

  const syncGroups = async () => {
    setLoadingGroups(true);
    try { const { groups } = await bodegasApi.syncGroups(); setGroups(groups); }
    catch(e){ alert("Error: "+e.message); }
    finally{ setLoadingGroups(false); }
  };

  const addBodega = async () => { await bodegasApi.create(form); setShowBodegaForm(false); setGroups([]); setForm({name:"",wa_group_id:"",price_adjust:5000}); load(); };
  const addCom = async () => { await comunidadesApi.create(comForm); setShowComForm(false); setComForm({name:"",wa_group_id:""}); load(); };

  const BODEGA_EMOJIS = { "mero":"🔴","fym":"✨","maylo":"📦","dinast":"👑","quina":"⚙️" };
  const BODEGA_COLORS = { "mero":"#ef4444","fym":"#8b5cf6","maylo":"#ec4899","dinast":"#f59e0b","quina":"#06b6d4" };
  const getBodegaStyle = (name) => {
    const n = (name||"").toLowerCase();
    for (const [k,v] of Object.entries(BODEGA_EMOJIS)) { if(n.includes(k)) return { emoji:v, color:BODEGA_COLORS[k] }; }
    return { emoji:"📦", color:"#ffffff40" };
  };

  return (
    <div style={{ padding:"14px 16px 80px" }}>
      <div style={{ fontSize:18,fontWeight:900,marginBottom:16 }}>⚙️ Configuración</div>
      <div style={{ display:"flex",gap:4,marginBottom:20,background:"#ffffff06",borderRadius:12,padding:4 }}>
        {[["bodegas","📥 Bodegas"],["comunidades","📤 Comunidades"],["reglas","🔧 Reglas IA"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSeccion(k)} style={{ flex:1,background:seccion===k?"#ffffff12":"transparent",border:"none",borderRadius:9,color:seccion===k?"#fff":"#ffffff40",padding:"9px 0",fontSize:12,fontWeight:seccion===k?700:400,cursor:"pointer" }}>{l}</button>
        ))}
      </div>

      {seccion==="bodegas" && (
        <div>
          {isConnected && !showBodegaForm && (
            <button onClick={syncGroups} disabled={loadingGroups} style={{ background:"#25d36615",border:"1px solid #25d36630",borderRadius:10,color:"#25d366",width:"100%",marginBottom:10,padding:"10px 0",fontSize:13,cursor:"pointer",fontWeight:700 }}>
              {loadingGroups?"🔄 Cargando grupos...":"🔄 Importar grupos de WhatsApp"}
            </button>
          )}
          {groups.length>0 && !showBodegaForm && (
            <div style={{ background:"#ffffff04",border:"1px solid #ffffff0f",borderRadius:12,padding:12,marginBottom:12 }}>
              <div style={{ color:"#ffffff50",fontSize:12,marginBottom:8 }}>Toca para agregar como bodega:</div>
              {groups.map(g=>(
                <div key={g.wa_group_id} onClick={()=>{setForm({name:g.name,wa_group_id:g.wa_group_id,price_adjust:5000});setShowBodegaForm(true);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 4px",borderBottom:"1px solid #ffffff06",cursor:"pointer" }}>
                  <div>
                    <div style={{ color:"#fff",fontSize:13 }}>{g.name}</div>
                    <div style={{ color:"#ffffff40",fontSize:11 }}>👥 {g.members}</div>
                  </div>
                  <span style={{ color:"#25d366",fontSize:12,fontWeight:700 }}>+ Agregar</span>
                </div>
              ))}
            </div>
          )}
          {bodegas.map(b=>{
            const s = getBodegaStyle(b.name);
            return (
              <div key={b.id} style={{ background:"#ffffff04",border:`1px solid ${s.color}20`,borderRadius:14,marginBottom:10 }}>
                <div style={{ padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                    <div style={{ width:40,height:40,borderRadius:12,background:`${s.color}15`,border:`1.5px solid ${s.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>{s.emoji}</div>
                    <div>
                      <div style={{ fontWeight:800,fontSize:14 }}>{b.name}</div>
                      <div style={{ color:"#ffffff40",fontSize:11 }}>Se suma: +${Number(b.price_adjust).toLocaleString("es-CO")}</div>
                    </div>
                  </div>
                  <div style={{ display:"flex",gap:6 }}>
                    <button onClick={()=>setEditando(editando===b.id?null:b.id)} style={{ background:`${s.color}15`,border:`1px solid ${s.color}30`,borderRadius:8,color:s.color,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer" }}>⚙️</button>
                    <button onClick={()=>bodegasApi.delete(b.id).then(load)} style={{ background:"#ef444410",border:"1px solid #ef444425",borderRadius:7,color:"#ef4444",padding:"6px 10px",fontSize:11,cursor:"pointer" }}>✕</button>
                  </div>
                </div>
                {editando===b.id && (
                  <div style={{ padding:"0 14px 14px",borderTop:"1px solid #ffffff06" }}>
                    <div style={{ marginTop:10,marginBottom:8,color:"#ffffff50",fontSize:12 }}>¿Cuánto se suma al precio?</div>
                    <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                      {[0,3000,5000,8000,10000,15000].map(v=>(
                        <button key={v} onClick={()=>bodegasApi.update(b.id,{price_adjust:v}).then(load)} style={{ background:b.price_adjust===v?s.color:"#ffffff08",border:`1px solid ${b.price_adjust===v?s.color:"#ffffff12"}`,borderRadius:8,color:"#fff",padding:"6px 10px",fontSize:12,cursor:"pointer",fontWeight:b.price_adjust===v?700:400 }}>
                          {v===0?"Sin sumar":`+$${v.toLocaleString("es-CO")}`}
                        </button>
                      ))}
                    </div>
                    <button onClick={()=>setEditando(null)} style={{ marginTop:10,background:"#25d36620",border:"1px solid #25d36635",borderRadius:8,color:"#25d366",padding:"8px 18px",fontSize:12,fontWeight:700,cursor:"pointer" }}>✅ Cerrar</button>
                  </div>
                )}
              </div>
            );
          })}
          {!showBodegaForm ? (
            <button onClick={()=>setShowBodegaForm(true)} style={{ background:"#ffffff04",border:"1px dashed #ffffff15",borderRadius:12,color:"#ffffff40",width:"100%",padding:"13px 0",fontSize:13,cursor:"pointer" }}>+ Agregar bodega manual</button>
          ) : (
            <div style={{ background:"#ffffff04",border:"1px solid #ffffff0f",borderRadius:14,padding:16 }}>
              <div style={{ color:"#fff",fontWeight:700,marginBottom:12 }}>📥 Nueva bodega</div>
              <div style={{ marginBottom:10 }}>
                <label style={{ color:"#ffffff40",fontSize:11,display:"block",marginBottom:4 }}>Nombre</label>
                <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={{ width:"100%",background:"#1e293b",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 11px",fontSize:13,color:"#fff",outline:"none",boxSizing:"border-box" }} />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ color:"#ffffff40",fontSize:11,display:"block",marginBottom:4 }}>Se suma</label>
                <div style={{ display:"flex",gap:5 }}>
                  {[0,3000,5000,8000,10000,15000].map(v=>(
                    <button key={v} onClick={()=>setForm(p=>({...p,price_adjust:v}))} style={{ background:form.price_adjust===v?"#7c3aed":"#ffffff08",border:`1px solid ${form.price_adjust===v?"#7c3aed":"#ffffff12"}`,borderRadius:7,color:"#fff",padding:"5px 8px",fontSize:11,cursor:"pointer" }}>
                      {v===0?"0":`+$${v/1000}k`}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex",gap:8 }}>
                <button onClick={()=>setShowBodegaForm(false)} style={{ flex:1,background:"#ffffff08",border:"1px solid #ffffff12",borderRadius:10,color:"#fff",padding:"10px 0",fontSize:13,cursor:"pointer" }}>Cancelar</button>
                <button onClick={addBodega} style={{ flex:2,background:"linear-gradient(135deg,#25d366,#128c7e)",border:"none",borderRadius:10,color:"#fff",padding:"10px 0",fontSize:13,fontWeight:700,cursor:"pointer" }}>✅ Guardar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {seccion==="comunidades" && (
        <div>
          {comunidades.map(c=>(
            <div key={c.id} style={{ background:"#ffffff04",border:"1px solid #25d36620",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <div style={{ width:40,height:40,borderRadius:12,background:"#25d36615",border:"1.5px solid #25d36635",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>👥</div>
                <div style={{ color:"#fff",fontSize:14,fontWeight:600 }}>{c.name}</div>
              </div>
              <button onClick={()=>comunidadesApi.delete(c.id).then(load)} style={{ background:"#ef444410",border:"1px solid #ef444425",borderRadius:7,color:"#ef4444",padding:"5px 10px",fontSize:11,cursor:"pointer" }}>✕</button>
            </div>
          ))}
          {!showComForm ? (
            <button onClick={()=>setShowComForm(true)} style={{ background:"#ffffff04",border:"1px dashed #ffffff15",borderRadius:12,color:"#ffffff40",width:"100%",padding:"13px 0",fontSize:13,cursor:"pointer" }}>+ Agregar comunidad</button>
          ) : (
            <div style={{ background:"#ffffff04",border:"1px solid #ffffff0f",borderRadius:14,padding:16 }}>
              <div style={{ color:"#fff",fontWeight:700,marginBottom:12 }}>📤 Nueva comunidad destino</div>
              {[{k:"name",l:"Nombre"},{k:"wa_group_id",l:"ID WhatsApp (lo obtienes importando grupos)"}].map(({k,l})=>(
                <div key={k} style={{ marginBottom:10 }}>
                  <label style={{ color:"#ffffff40",fontSize:11,display:"block",marginBottom:4 }}>{l}</label>
                  <input value={comForm[k]} onChange={e=>setComForm(p=>({...p,[k]:e.target.value}))} style={{ width:"100%",background:"#1e293b",border:"1px solid #ffffff15",borderRadius:8,padding:"8px 11px",fontSize:13,color:"#fff",outline:"none",boxSizing:"border-box" }} />
                </div>
              ))}
              <div style={{ display:"flex",gap:8 }}>
                <button onClick={()=>setShowComForm(false)} style={{ flex:1,background:"#ffffff08",border:"1px solid #ffffff12",borderRadius:10,color:"#fff",padding:"10px 0",fontSize:13,cursor:"pointer" }}>Cancelar</button>
                <button onClick={addCom} style={{ flex:2,background:"linear-gradient(135deg,#7c3aed,#00d4aa)",border:"none",borderRadius:10,color:"#fff",padding:"10px 0",fontSize:13,fontWeight:700,cursor:"pointer" }}>✅ Guardar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {seccion==="reglas" && (
        <div>
          <div style={{ background:"#7c3aed12",border:"1px solid #7c3aed25",borderRadius:10,padding:"10px 14px",marginBottom:16 }}>
            <div style={{ color:"#a78bfa",fontWeight:700,fontSize:13,marginBottom:4 }}>🔧 Reglas de la IA por bodega</div>
            <div style={{ color:"#ffffff60",fontSize:12,lineHeight:1.7 }}>Si una bodega cambia su forma de mandar precios o textos, aquí lo ajustas. Sin código, sin llamar a nadie.</div>
          </div>
          {[
            { nombre:"DINASTÍA", emoji:"👑", color:"#f59e0b", tipo:"CUADRE / PUBLICÓ", seSuma:"+$5.000", tallas:"Las de la bodega", nombre_auto:"Automático" },
            { nombre:"D'MERO SPORT", emoji:"🔴", color:"#ef4444", tipo:"PRECIO + CODIGO + CAJA", seSuma:"+$5.000", tallas:"Las de la bodega", nombre_auto:"Automático" },
            { nombre:"BODEGA MAYLO", emoji:"📦", color:"#ec4899", tipo:"COD + precio + CAJA", seSuma:"+$5.000", tallas:"Las de la bodega", nombre_auto:"Automático" },
            { nombre:"FYM", emoji:"✨", color:"#8b5cf6", tipo:"PRECIO + Ref + ¿PROMO?", seSuma:"+$5.000", tallas:"Las de la bodega", nombre_auto:"Automático" },
            { nombre:"MÁQUINA", emoji:"⚙️", color:"#06b6d4", tipo:"Solo Cod + precio", seSuma:"+$15.000", tallas:"Auto por género", nombre_auto:"⚠️ Tú lo escribes" },
          ].map(b=>(
            <div key={b.nombre} style={{ background:"#ffffff04",border:`1px solid ${b.color}20`,borderRadius:14,padding:14,marginBottom:10 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
                <span style={{ fontSize:20 }}>{b.emoji}</span>
                <span style={{ fontWeight:800,fontSize:14,color:b.color }}>{b.nombre}</span>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
                {[["Tipo de precio",b.tipo],["Se suma",b.seSuma],["Tallas",b.tallas],["Nombre",b.nombre_auto]].map(([k,v])=>(
                  <div key={k} style={{ background:"#ffffff05",borderRadius:8,padding:"7px 10px" }}>
                    <div style={{ color:"#ffffff30",fontSize:9,marginBottom:2 }}>{k}</div>
                    <div style={{ color:"#fff",fontSize:11,fontWeight:600 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CONEXION PAGE ─────────────────────────────────────────────────────────────
function ConexionPage() {
  const { waStatus, qr, isConnected } = React.useContext(WaCtx);
  const [connecting, setConnecting] = useState(false);
  const statusColor = { connected:"#00d4aa",qr_ready:"#f59e0b",connecting:"#f59e0b",disconnected:"#ef4444" }[waStatus]||"#ef4444";
  const statusLabel = { connected:"Conectado ✅",qr_ready:"📱 Escanea el QR",connecting:"🔄 Conectando...",disconnected:"Desconectado" }[waStatus]||waStatus;

  return (
    <div style={{ padding:"20px 16px" }}>
      <div style={{ fontSize:18,fontWeight:900,marginBottom:20 }}>🔗 Conexión WhatsApp</div>
      <div style={{ background:"#ffffff04",border:"1px solid #ffffff0a",borderRadius:16,padding:24,textAlign:"center",marginBottom:16 }}>
        <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:`${statusColor}12`,border:`1px solid ${statusColor}30`,borderRadius:20,padding:"8px 18px",marginBottom:20 }}>
          <div style={{ width:9,height:9,borderRadius:"50%",background:statusColor,boxShadow:`0 0 10px ${statusColor}` }} />
          <span style={{ color:statusColor,fontWeight:700 }}>{statusLabel}</span>
        </div>
        {qr && (
          <div style={{ marginBottom:16 }}>
            <div style={{ background:"#fff",borderRadius:14,padding:12,display:"inline-block",marginBottom:10 }}>
              <img src={qr} alt="QR" style={{ width:200,height:200,display:"block" }} />
            </div>
            <div style={{ color:"#f59e0b",fontSize:13 }}>⏱ Escanea con WhatsApp ahora</div>
          </div>
        )}
        {!isConnected && !qr && (
          <>
            <div style={{ fontSize:48,marginBottom:12 }}>📱</div>
            <p style={{ color:"#ffffff55",fontSize:13,lineHeight:1.7,marginBottom:20 }}>Conecta tu WhatsApp para que el sistema<br/>empiece a escuchar las bodegas automáticamente</p>
            <button onClick={async()=>{setConnecting(true);try{await whatsappApi.connect();}catch(e){alert(e.message);}finally{setConnecting(false);}}} style={{ background:"linear-gradient(135deg,#25d366,#128c7e)",border:"none",borderRadius:12,color:"#fff",padding:"13px 32px",fontSize:15,fontWeight:800,cursor:"pointer" }}>
              Conectar WhatsApp
            </button>
          </>
        )}
        {connecting && !qr && <div style={{ color:"#f59e0b",fontSize:14,marginTop:12 }}>🔄 Iniciando... espera 30 segundos</div>}
        {isConnected && <button onClick={()=>whatsappApi.disconnect()} style={{ background:"#ef444418",border:"1px solid #ef444435",borderRadius:10,color:"#ef4444",padding:"10px 24px",fontSize:13,cursor:"pointer" }}>Desconectar</button>}
      </div>
    </div>
  );
}

// ── LAYOUT ────────────────────────────────────────────────────────────────────
function Layout({ children }) {
  const { user, logout } = React.useContext(AuthCtx);
  const { waStatus } = React.useContext(WaCtx);
  const nav = useNavigate();
  const [pendientes, setPendientes] = useState(0);
  const waColor = { connected:"#00d4aa",qr_ready:"#f59e0b" }[waStatus]||"#ef4444";

  useEffect(()=>{ inboxApi.stats().then(s=>setPendientes(s.pendientes||0)).catch(()=>{}); },[]);

  return (
    <div style={{ minHeight:"100vh",background:"#0a0f1a",paddingBottom:70 }}>
      <div style={{ background:"#0d1520",borderBottom:"1px solid #ffffff08",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#25d366,#128c7e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>👟</div>
          <div>
            <div style={{ fontWeight:900,fontSize:14,color:"#fff" }}>SebasDifusor</div>
            <div style={{ color:"#ffffff30",fontSize:10 }}>{user?.name}</div>
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ display:"flex",alignItems:"center",gap:5 }}>
            <div style={{ width:7,height:7,borderRadius:"50%",background:waColor,boxShadow:`0 0 8px ${waColor}` }} />
            <span style={{ color:waColor,fontSize:11,fontWeight:700 }}>{waStatus==="connected"?"WhatsApp activo":"WA desconectado"}</span>
          </div>
          <button onClick={()=>{logout();nav("/login");}} style={{ background:"#ffffff08",border:"1px solid #ffffff10",borderRadius:8,color:"#ffffff50",padding:"5px 11px",fontSize:12,cursor:"pointer" }}>Salir</button>
        </div>
      </div>
      <div style={{ color:"#fff" }}>{children}</div>
      <nav style={{ position:"fixed",bottom:0,left:0,right:0,background:"#0d1520",borderTop:"1px solid #ffffff08",display:"flex",zIndex:100 }}>
        {[
          { to:"/",label:"Bandeja",icon:"📥",badge:pendientes },
          { to:"/config",label:"Config",icon:"⚙️" },
          { to:"/conexion",label:"WA",icon:"🔗",dot:waColor },
        ].map(({ to,label,icon,badge,dot })=>(
          <NavLink key={to} to={to} end={to==="/"} style={({isActive})=>({ flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 0",textDecoration:"none",color:isActive?"#fff":"#ffffff30",background:isActive?"#ffffff06":"transparent",fontSize:10,fontWeight:isActive?700:400,position:"relative" })}>
            <div style={{ position:"relative",fontSize:22,marginBottom:3 }}>
              {icon}
              {badge>0 && <span style={{ position:"absolute",top:-4,right:-6,background:"#ef4444",borderRadius:10,padding:"1px 5px",fontSize:9,color:"#fff",fontWeight:800 }}>{badge}</span>}
              {dot && <span style={{ position:"absolute",top:-2,right:-2,width:8,height:8,borderRadius:"50%",background:dot,border:"1.5px solid #0d1520" }}/>}
            </div>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const { user, loading } = React.useContext(AuthCtx);
  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0a0f1a",color:"#ffffff30" }}>Cargando...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function App() {
  const { user } = React.useContext(AuthCtx);
  return (
    <Routes>
      <Route path="/login" element={user?<Navigate to="/" replace />:<LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout><InboxPage /></Layout></PrivateRoute>} />
      <Route path="/config" element={<PrivateRoute><Layout><ConfigPage /></Layout></PrivateRoute>} />
      <Route path="/conexion" element={<PrivateRoute><Layout><ConexionPage /></Layout></PrivateRoute>} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <WaProvider>
        <App />
      </WaProvider>
    </AuthProvider>
  </BrowserRouter>
);
