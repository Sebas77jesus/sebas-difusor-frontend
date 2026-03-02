// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { authApi, inboxApi, bodegasApi, comunidadesApi, whatsappApi, startDifusion } from "./api/client";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => n ? `$ ${Number(n).toLocaleString("es-CO")}` : "—";
const gIcon = (g) => g === "Hombre" ? "🧔" : g === "Dama" ? "👱‍♀️" : "🧔👱‍♀️";
const ALL_SIZES = ["35","36","37","38","39","40","41","42","43","44","45","46"];

// ── Auth Context ──────────────────────────────────────────────────────────────
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

// ── WA Context ────────────────────────────────────────────────────────────────
const WaCtx = React.createContext(null);
function WaProvider({ children }) {
  const [waStatus, setWaStatus] = useState("disconnected");
  const [qr, setQr] = useState(null);
  const { user } = React.useContext(AuthCtx);
  useEffect(() => {
    if (!user) return;
    const es = new EventSource("/api/whatsapp/events");
    es.addEventListener("status", e => { const d = JSON.parse(e.data); setWaStatus(d.status); if(d.status==="connected") setQr(null); });
    es.addEventListener("qr", e => { setQr(JSON.parse(e.data).qr); setWaStatus("qr_ready"); });
    es.onerror = () => {};
    return () => es.close();
  }, [user]);
  return <WaCtx.Provider value={{ waStatus, qr, isConnected: waStatus === "connected" }}>{children}</WaCtx.Provider>;
}

// ── CSS-in-JS helpers ─────────────────────────────────────────────────────────
const card = { background: "#ffffff08", border: "1px solid #ffffff10", borderRadius: 14 };
const btn = (color = "#7c3aed", full = false) => ({
  background: color, border: "none", borderRadius: 12, color: "#fff",
  padding: full ? "13px 0" : "10px 18px", width: full ? "100%" : undefined,
  fontSize: 14, fontWeight: 700, cursor: "pointer",
});

// ══════════════════════════════════════════════════════════════════════════════
//  PAGES
// ══════════════════════════════════════════════════════════════════════════════

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 10 }}>👟</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>SebasDifusor</div>
          <div style={{ color: "#ffffff40", fontSize: 13, marginTop: 4 }}>Sistema de difusión con IA</div>
        </div>
        <form onSubmit={submit} style={{ ...card, padding: 24 }}>
          {err && <div style={{ background:"#ef444412", border:"1px solid #ef444430", borderRadius:9, padding:"10px 14px", marginBottom:16, color:"#ef4444", fontSize:13 }}>⚠️ {err}</div>}
          <div style={{ marginBottom: 14 }}>
            <label style={{ color:"#ffffff50", fontSize:11, display:"block", marginBottom:5 }}>Email</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} style={{ width:"100%", background:"#ffffff08", border:"1px solid #ffffff15", borderRadius:9, padding:"10px 13px", fontSize:14, outline:"none" }} />
          </div>
          <div style={{ marginBottom: 22 }}>
            <label style={{ color:"#ffffff50", fontSize:11, display:"block", marginBottom:5 }}>Contraseña</label>
            <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" style={{ width:"100%", background:"#ffffff08", border:"1px solid #ffffff15", borderRadius:9, padding:"10px 13px", fontSize:14, outline:"none" }} />
          </div>
          <button type="submit" disabled={loading} style={{ ...btn("linear-gradient(135deg,#f59e0b,#ef4444)"), width:"100%", padding:"13px 0", fontSize:15, opacity: loading ? 0.5 : 1 }}>
            {loading ? "Entrando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── INBOX ─────────────────────────────────────────────────────────────────────
function InboxPage() {
  const nav = useNavigate();
  const { isConnected } = React.useContext(WaCtx);
  const [msgs, setMsgs] = useState([]);
  const [stats, setStats] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [tab, setTab] = useState("ready"); // ready | sent

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ messages }, s] = await Promise.all([inboxApi.list(tab), inboxApi.stats()]);
      setMsgs(messages || []); setStats(s || {});
    } catch {} finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { loadData(); }, [loadData]);

  // SSE para nuevos mensajes
  useEffect(() => {
    const es = new EventSource(inboxApi.streamUrl());
    es.addEventListener("new_message", () => loadData());
    return () => es.close();
  }, [loadData]);

  const toggleSelect = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(msgs.filter(m=>m.status==="ready").map(m=>m.id)));
  const clearSel = () => setSelected(new Set());

  const handleSkip = async (id) => {
    await inboxApi.skip(id);
    setMsgs(prev => prev.filter(m => m.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const proceedDifundir = () => {
    if (selected.size === 0) return;
    sessionStorage.setItem("sd_selected", JSON.stringify([...selected]));
    nav("/difundir");
  };

  return (
    <div>
      {/* Tabs + stats */}
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["ready","📥 Pendientes", stats.pendientes], ["sent","✅ Enviados", stats.enviados]].map(([v,l,c]) => (
            <button key={v} onClick={() => setTab(v)} style={{ flex:1, background: tab===v?"#7c3aed":"#ffffff08", border:`1px solid ${tab===v?"#7c3aed":"#ffffff12"}`, borderRadius:10, color:"#fff", padding:"10px 0", fontSize:13, fontWeight:tab===v?700:400, cursor:"pointer" }}>
              {l} {c > 0 && <span style={{ background:"#ffffff20", borderRadius:10, padding:"1px 7px", marginLeft:4, fontSize:11 }}>{c}</span>}
            </button>
          ))}
        </div>

        {!isConnected && (
          <div style={{ background:"#f59e0b0d", border:"1px solid #f59e0b25", borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ color:"#f59e0b", fontSize:13 }}>⚠️ WhatsApp desconectado</span>
            <button onClick={() => nav("/conexion")} style={{ ...btn("#f59e0b18"), border:"1px solid #f59e0b40", color:"#f59e0b", padding:"4px 10px", fontSize:12 }}>Conectar</button>
          </div>
        )}

        {tab === "ready" && msgs.length > 0 && (
          <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center" }}>
            <button onClick={selectAll} style={{ ...btn("#ffffff12"), border:"1px solid #ffffff15", color:"#fff", fontSize:12, padding:"7px 12px" }}>Seleccionar todos ({msgs.length})</button>
            {selected.size > 0 && <button onClick={clearSel} style={{ ...btn("#ffffff08"), border:"1px solid #ffffff12", color:"#ffffff50", fontSize:12, padding:"7px 12px" }}>Limpiar</button>}
            {selected.size > 0 && (
              <button onClick={proceedDifundir} style={{ ...btn("linear-gradient(135deg,#25d366,#128c7e)"), padding:"7px 14px", fontSize:13, marginLeft:"auto" }}>
                📲 Difundir ({selected.size})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lista */}
      <div style={{ padding: "0 16px 100px" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:40, color:"#ffffff40" }}>Cargando...</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign:"center", padding:48 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ color:"#fff", fontWeight:700 }}>{tab==="ready" ? "Bandeja vacía" : "Sin envíos aún"}</div>
            <div style={{ color:"#ffffff40", fontSize:13, marginTop:4 }}>
              {tab==="ready" ? "Los mensajes de las bodegas aparecerán aquí automáticamente" : "Aquí verás los mensajes ya difundidos"}
            </div>
          </div>
        ) : (
          msgs.map(msg => (
            <MsgCard
              key={msg.id}
              msg={msg}
              selected={selected.has(msg.id)}
              onToggle={() => toggleSelect(msg.id)}
              onSkip={() => handleSkip(msg.id)}
              onUpdate={(updated) => setMsgs(prev => prev.map(m => m.id===msg.id ? updated : m))}
              editing={editingId === msg.id}
              onEdit={() => setEditingId(msg.id)}
              onCloseEdit={() => setEditingId(null)}
              showSelect={tab === "ready"}
            />
          ))
        )}
      </div>

      {/* FAB difundir */}
      {selected.size > 0 && (
        <div style={{ position:"fixed", bottom:76, left:0, right:0, padding:"0 16px", zIndex:50 }}>
          <button onClick={proceedDifundir} style={{ ...btn("linear-gradient(135deg,#25d366,#128c7e)"), width:"100%", padding:"15px 0", fontSize:16, boxShadow:"0 4px 24px #25d36650" }}>
            📲 Difundir {selected.size} foto{selected.size!==1?"s":""} a mis comunidades
          </button>
        </div>
      )}
    </div>
  );
}

// ── TARJETA DE MENSAJE ────────────────────────────────────────────────────────
function MsgCard({ msg, selected, onToggle, onSkip, onUpdate, editing, onEdit, onCloseEdit, showSelect }) {
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const openEdit = () => {
    setEditData({
      nombre: msg.nombre || "",
      genero: msg.genero || "Hombre Y Dama",
      tallas: msg.tallas || [],
      precio_bodega: msg.precio_bodega || 0,
      precio_caja: msg.precio_caja || 0,
      tiene_caja: msg.tiene_caja || false,
      es_promo: msg.es_promo || false,
      price_adjust: msg.price_adjust || 5000,
      caption_final: msg.caption_final || "",
    });
    onEdit();
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = await inboxApi.update(msg.id, editData);
      onUpdate(updated);
      onCloseEdit();
    } catch {} finally { setSaving(false); }
  };

  const buildCaption = (d) => {
    const tallas = d.tallas || [];
    const precio = (d.precio_bodega || 0) + (d.price_adjust || 5000);
    const caja = d.tiene_caja ? (d.precio_caja || 0) + (d.price_adjust || 5000) : 0;
    const nums = tallas.map(Number).sort((a,b)=>a-b);
    let tallaStr = tallas.length === 0 ? "CONSULTAR" : tallas.length === 1 ? `SOLO ${tallas[0]} EUR` :
      nums.every((v,i)=>i===0||v===nums[i-1]+1) ? `${nums[0]} AL ${nums[nums.length-1]} EUR` : tallas.join("-")+" EUR";
    let out = d.es_promo ? `🚨 *PROMO PROMO PROMO* 🚨\n*SEBAS SHOES* 👟\n⚠️ *NO CAMBIO - NO GARANTÍA*\n\n` : "";
    out += `*${d.nombre || "PRODUCTO"}* 💣🔥\n\nNumeración ${d.genero} ${gIcon(d.genero)} *(${tallaStr})*\n\n*Precio:  $ ${Number(precio).toLocaleString("es-CO")}*`;
    if (d.tiene_caja && caja > 0) out += `\n\n*DISPONIBLE POR CAJA* 📦 $ ${Number(caja).toLocaleString("es-CO")}`;
    return out;
  };

  const status_dot = { ready:"#00d4aa", sent:"#7c3aed", skipped:"#ffffff25" }[msg.status] || "#ffffff25";

  return (
    <div style={{ ...card, marginBottom:12, overflow:"hidden", border: selected ? "2px solid #25d366" : "1px solid #ffffff10" }}>
      {/* Imagen + selección */}
      <div style={{ position:"relative" }}>
        {msg.media_path ? (
          <img src={msg.media_path} alt="" style={{ width:"100%", height:200, objectFit:"cover", display:"block" }} />
        ) : (
          <div style={{ width:"100%", height:100, background:"#ffffff06", display:"flex", alignItems:"center", justifyContent:"center", fontSize:40 }}>👟</div>
        )}
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, transparent 50%, #00000099)" }} />

        {showSelect && (
          <div onClick={onToggle} style={{ position:"absolute", top:10, left:10, width:28, height:28, borderRadius:8, background: selected?"#25d366":"#00000066", border:`2px solid ${selected?"#25d366":"#ffffff50"}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:14 }}>
            {selected ? "✓" : ""}
          </div>
        )}

        <div style={{ position:"absolute", top:10, right:10, background:"#00000088", borderRadius:20, padding:"3px 10px", fontSize:11 }}>
          <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:status_dot, marginRight:4 }}/>
          <span style={{ color:"#fff" }}>{msg.bodega_name || "Bodega"}</span>
        </div>

        <div style={{ position:"absolute", bottom:10, left:12 }}>
          <div style={{ color:"#fff", fontWeight:800, fontSize:15, textShadow:"0 1px 4px #000" }}>{msg.nombre || "Sin nombre"}</div>
          <div style={{ color:"#ffffffcc", fontSize:12 }}>{gIcon(msg.genero)} {msg.genero} · {(msg.tallas||[]).join(", ") || "Sin tallas"}</div>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding:"12px 14px" }}>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ color:"#ffffff45", fontSize:10 }}>Precio bodega → tu precio</div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ color:"#ffffff40", fontSize:13, textDecoration:"line-through" }}>{fmt(msg.precio_bodega)}</span>
              <span style={{ color:"#00d4aa", fontWeight:800, fontSize:16 }}>{fmt((msg.precio_bodega||0)+(msg.price_adjust||5000))}</span>
            </div>
          </div>
          {msg.tiene_caja && (
            <div style={{ background:"#00d4aa12", border:"1px solid #00d4aa30", borderRadius:8, padding:"4px 10px", fontSize:11, color:"#00d4aa" }}>
              📦 Caja: {fmt((msg.precio_caja||0)+(msg.price_adjust||5000))}
            </div>
          )}
          {msg.es_promo && (
            <div style={{ background:"#ef444412", border:"1px solid #ef444430", borderRadius:8, padding:"4px 10px", fontSize:11, color:"#ef4444", fontWeight:700 }}>
              🚨 PROMO
            </div>
          )}
        </div>

        {/* Preview caption */}
        <div onClick={() => setShowPreview(v=>!v)} style={{ background:"#ffffff05", borderRadius:9, padding:"8px 12px", marginBottom:10, cursor:"pointer" }}>
          <div style={{ color:"#ffffff40", fontSize:10, marginBottom:4 }}>📱 Caption SebasShoes {showPreview?"▲":"▼"}</div>
          {showPreview && (
            <pre style={{ color:"#e9edef", fontSize:12, lineHeight:1.65, margin:0, whiteSpace:"pre-wrap", fontFamily:"inherit" }}>
              {msg.caption_final || buildCaption({ nombre:msg.nombre, genero:msg.genero, tallas:msg.tallas, precio_bodega:msg.precio_bodega, precio_caja:msg.precio_caja, tiene_caja:msg.tiene_caja, es_promo:msg.es_promo, price_adjust:msg.price_adjust })}
            </pre>
          )}
          {!showPreview && <div style={{ color:"#ffffff55", fontSize:12, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{(msg.caption_final || "").split("\n")[0]}</div>}
        </div>

        {/* Acciones */}
        {showSelect && msg.status === "ready" && (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={openEdit} style={{ flex:1, ...btn("#ffffff0a"), border:"1px solid #ffffff15", color:"#fff", padding:"8px 0", fontSize:12 }}>✏️ Editar</button>
            <button onClick={onToggle} style={{ flex:1, ...btn(selected?"#25d366":"#ffffff0a"), border:`1px solid ${selected?"#25d366":"#ffffff15"}`, color:"#fff", padding:"8px 0", fontSize:12 }}>{selected?"✓ Seleccionado":"Seleccionar"}</button>
            <button onClick={() => onSkip(msg.id)} style={{ ...btn("#ef444412"), border:"1px solid #ef444430", color:"#ef4444", padding:"8px 12px", fontSize:12 }}>✕</button>
          </div>
        )}
      </div>

      {/* Panel edición inline */}
      {editing && editData && (
        <div style={{ borderTop:"1px solid #ffffff10", padding:16, background:"#ffffff05" }}>
          <div style={{ color:"#ffffff60", fontSize:12, marginBottom:12, fontWeight:600 }}>✏️ Editar antes de difundir</div>

          {/* Nombre */}
          <div style={{ marginBottom:10 }}>
            <label style={{ color:"#ffffff45", fontSize:11, display:"block", marginBottom:4 }}>Nombre</label>
            <input value={editData.nombre} onChange={e=>setEditData(p=>({...p,nombre:e.target.value.toUpperCase()}))} style={{ width:"100%", background:"#ffffff08", border:"1px solid #ffffff15", borderRadius:8, padding:"8px 11px", fontSize:14, fontWeight:700, outline:"none" }} />
          </div>

          {/* Género */}
          <div style={{ marginBottom:10 }}>
            <label style={{ color:"#ffffff45", fontSize:11, display:"block", marginBottom:4 }}>Género</label>
            <div style={{ display:"flex", gap:6 }}>
              {["Hombre","Dama","Hombre Y Dama"].map(g=>(
                <button key={g} onClick={()=>setEditData(p=>({...p,genero:g}))} style={{ flex:1, background:editData.genero===g?"#7c3aed":"#ffffff08", border:`1px solid ${editData.genero===g?"#7c3aed":"#ffffff15"}`, borderRadius:7, color:"#fff", padding:"6px 2px", fontSize:11, cursor:"pointer" }}>
                  {gIcon(g)} {g.replace(" Y Dama","").replace("Hombre","H").replace("Dama","D")}
                </button>
              ))}
            </div>
          </div>

          {/* Tallas */}
          <div style={{ marginBottom:10 }}>
            <label style={{ color:"#ffffff45", fontSize:11, display:"block", marginBottom:4 }}>Tallas disponibles</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {ALL_SIZES.map(t=>{
                const active = editData.tallas.includes(t);
                return <button key={t} onClick={()=>setEditData(p=>({...p,tallas:active?p.tallas.filter(x=>x!==t):[...p.tallas,t].sort((a,b)=>Number(a)-Number(b))}))} style={{ width:38,height:34,background:active?"#00d4aa20":"#ffffff06",border:`2px solid ${active?"#00d4aa":"#ffffff10"}`,borderRadius:7,color:active?"#00d4aa":"#ffffff25",fontSize:12,fontWeight:active?800:400,cursor:"pointer" }}>{t}</button>
              })}
            </div>
          </div>

          {/* Ajuste de precio */}
          <div style={{ marginBottom:10 }}>
            <label style={{ color:"#ffffff45", fontSize:11, display:"block", marginBottom:4 }}>Sumarle al precio</label>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {[0,3000,5000,8000,10000,15000].map(v=>(
                <button key={v} onClick={()=>setEditData(p=>({...p,price_adjust:v}))} style={{ background:editData.price_adjust===v?"#7c3aed":"#ffffff08", border:`1px solid ${editData.price_adjust===v?"#7c3aed":"#ffffff12"}`, borderRadius:7, color:"#fff", padding:"5px 9px", fontSize:11, cursor:"pointer", fontWeight:editData.price_adjust===v?700:400 }}>
                  {v===0?"Sin ajuste":`+$${v/1000}k`}
                </button>
              ))}
            </div>
            <div style={{ color:"#00d4aa", fontWeight:800, fontSize:15, marginTop:6 }}>
              Tu precio: {fmt((editData.precio_bodega||0)+editData.price_adjust)}
            </div>
          </div>

          {/* Caja + Promo */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <button onClick={()=>setEditData(p=>({...p,tiene_caja:!p.tiene_caja}))} style={{ flex:1, background:editData.tiene_caja?"#00d4aa15":"#ffffff08", border:`1px solid ${editData.tiene_caja?"#00d4aa35":"#ffffff12"}`, borderRadius:8, color:editData.tiene_caja?"#00d4aa":"#ffffff50", padding:"8px 0", fontSize:12, cursor:"pointer" }}>
              📦 {editData.tiene_caja?"Tiene caja ✓":"Sin caja"}
            </button>
            <button onClick={()=>setEditData(p=>({...p,es_promo:!p.es_promo}))} style={{ flex:1, background:editData.es_promo?"#ef444415":"#ffffff08", border:`1px solid ${editData.es_promo?"#ef444435":"#ffffff12"}`, borderRadius:8, color:editData.es_promo?"#ef4444":"#ffffff50", padding:"8px 0", fontSize:12, cursor:"pointer" }}>
              🚨 {editData.es_promo?"Promo ✓":"No es promo"}
            </button>
          </div>

          {/* Preview live */}
          <div style={{ background:"#111b21", borderRadius:10, padding:12, marginBottom:14 }}>
            <div style={{ color:"#ffffff40", fontSize:10, marginBottom:6 }}>Preview:</div>
            <pre style={{ color:"#e9edef", fontSize:12, lineHeight:1.65, margin:0, whiteSpace:"pre-wrap", fontFamily:"inherit" }}>{buildCaption(editData)}</pre>
          </div>

          <div style={{ display:"flex", gap:8 }}>
            <button onClick={onCloseEdit} style={{ flex:1, ...btn("#ffffff10"), border:"1px solid #ffffff15", color:"#fff" }}>Cancelar</button>
            <button onClick={saveEdit} disabled={saving} style={{ flex:2, ...btn("linear-gradient(135deg,#7c3aed,#00d4aa)"), opacity:saving?0.5:1 }}>{saving?"Guardando...":"✅ Guardar"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DIFUNDIR PAGE ─────────────────────────────────────────────────────────────
function DifundirPage() {
  const nav = useNavigate();
  const { isConnected } = React.useContext(WaCtx);
  const [comunidades, setComunidades] = useState([]);
  const [selCom, setSelCom] = useState(new Set());
  const [step, setStep] = useState("select"); // select | sending | done
  const [progress, setProgress] = useState({ sent:0, failed:0, total:0, current:"" });
  const inboxIds = JSON.parse(sessionStorage.getItem("sd_selected") || "[]");

  useEffect(() => {
    comunidadesApi.list().then(({ comunidades }) => {
      setComunidades(comunidades || []);
      // Pre-seleccionar todas activas
      setSelCom(new Set((comunidades||[]).map(c=>c.id)));
    });
  }, []);

  const handleSend = () => {
    if (!isConnected || selCom.size === 0) return;
    setStep("sending");
    startDifusion({
      inbox_ids: inboxIds,
      comunidad_ids: [...selCom],
      onStart: (d) => setProgress(p=>({...p, total:d.total})),
      onSent: (d) => setProgress({ sent:d.sent, failed:d.failed, total:d.total, current:`✅ Enviado` }),
      onFailed: (d) => setProgress({ sent:d.sent, failed:d.failed, total:d.total, current:`❌ Fallo` }),
      onComplete: () => { sessionStorage.removeItem("sd_selected"); setStep("done"); },
      onError: (e) => { alert("Error: "+e); setStep("select"); },
    });
  };

  const pct = progress.total > 0 ? Math.round((progress.sent+progress.failed)/progress.total*100) : 0;

  return (
    <div style={{ padding:16 }}>
      <div style={{ marginBottom:18 }}>
        <button onClick={()=>nav("/")} style={{ background:"none", border:"none", color:"#ffffff50", cursor:"pointer", fontSize:13, padding:0 }}>← Volver</button>
        <h2 style={{ color:"#fff", fontSize:20, fontWeight:800, margin:"6px 0 4px" }}>📲 Difundir a comunidades</h2>
        <p style={{ color:"#ffffff50", fontSize:13 }}>{inboxIds.length} foto{inboxIds.length!==1?"s":""} seleccionada{inboxIds.length!==1?"s":""}</p>
      </div>

      {step === "select" && (
        <>
          {!isConnected && (
            <div style={{ background:"#ef444412", border:"1px solid #ef444430", borderRadius:11, padding:"11px 14px", marginBottom:16, color:"#ef4444", fontSize:13 }}>
              ⚠️ WhatsApp no conectado. Ve a Conexión primero.
            </div>
          )}

          <div style={{ ...card, padding:16, marginBottom:16 }}>
            <div style={{ color:"#ffffff55", fontSize:12, marginBottom:12, fontWeight:600 }}>Selecciona las comunidades destino:</div>
            {comunidades.length === 0 ? (
              <div style={{ color:"#ffffff40", fontSize:13, textAlign:"center", padding:16 }}>No tienes comunidades. Agrégalas en Configuración.</div>
            ) : (
              comunidades.map(c => {
                const sel = selCom.has(c.id);
                return (
                  <div key={c.id} onClick={()=>setSelCom(prev=>{const n=new Set(prev);sel?n.delete(c.id):n.add(c.id);return n;})} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:sel?"#25d36612":"#ffffff06", border:`1px solid ${sel?"#25d36640":"#ffffff10"}`, borderRadius:10, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}>
                    <div style={{ color:sel?"#fff":"#ffffff50", fontSize:14, fontWeight:sel?700:400 }}>{c.name}</div>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:sel?"#25d366":"#ffffff12", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:12 }}>{sel?"✓":""}</div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ ...card, padding:14, marginBottom:16, background:"#f59e0b0a", borderColor:"#f59e0b25" }}>
            <div style={{ color:"#f59e0b", fontSize:13 }}>
              ⏱ Tiempo estimado: ~{Math.ceil(inboxIds.length * selCom.size * 5 / 60)} minuto{Math.ceil(inboxIds.length * selCom.size * 5 / 60)!==1?"s":""} · 5 seg entre mensajes
            </div>
          </div>

          <button onClick={handleSend} disabled={!isConnected || selCom.size===0} style={{ ...btn("linear-gradient(135deg,#25d366,#128c7e)"), width:"100%", padding:"15px 0", fontSize:16, opacity:!isConnected||selCom.size===0?0.4:1 }}>
            📲 Enviar {inboxIds.length * selCom.size} mensajes a {selCom.size} comunidad{selCom.size!==1?"es":""}
          </button>
        </>
      )}

      {step === "sending" && (
        <div style={{ textAlign:"center", padding:"40px 0" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>⏳</div>
          <div style={{ color:"#25d366", fontWeight:800, fontSize:18, marginBottom:8 }}>Enviando...</div>
          <div style={{ color:"#ffffff50", fontSize:13, marginBottom:20 }}>{progress.current}</div>
          <div style={{ height:8, background:"#ffffff10", borderRadius:4, overflow:"hidden", marginBottom:10 }}>
            <div style={{ height:"100%", width:`${pct}%`, background:"linear-gradient(90deg,#25d366,#128c7e)", transition:"width 0.3s", borderRadius:4 }} />
          </div>
          <div style={{ color:"#ffffff50", fontSize:13 }}>{progress.sent+progress.failed} de {progress.total} · {pct}%</div>
          <div style={{ color:"#ffffff30", fontSize:12, marginTop:6 }}>✅ {progress.sent} enviados · ❌ {progress.failed} fallidos</div>
        </div>
      )}

      {step === "done" && (
        <div style={{ textAlign:"center", padding:"40px 0" }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🎉</div>
          <div style={{ color:"#00d4aa", fontWeight:900, fontSize:22, marginBottom:8 }}>¡Listo!</div>
          <div style={{ color:"#ffffff60", fontSize:14, marginBottom:4 }}>{progress.sent} mensajes enviados a {selCom.size} comunidades</div>
          <div style={{ color:"#ffffff30", fontSize:12, marginBottom:28 }}>⚡ En segundos lo que antes tomaba 30-50 minutos</div>
          <button onClick={()=>nav("/")} style={{ ...btn("linear-gradient(135deg,#7c3aed,#00d4aa)"), width:"100%", padding:"14px 0", fontSize:15 }}>
            Volver al inbox
          </button>
        </div>
      )}
    </div>
  );
}

// ── CONFIGURACIÓN ─────────────────────────────────────────────────────────────
function ConfigPage() {
  const { isConnected } = React.useContext(WaCtx);
  const [bodegas, setBodegas] = useState([]);
  const [comunidades, setComunidades] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [showBodegaForm, setShowBodegaForm] = useState(false);
  const [showComForm, setShowComForm] = useState(false);
  const [form, setForm] = useState({ name:"", wa_group_id:"", price_adjust:5000 });
  const [comForm, setComForm] = useState({ name:"", wa_group_id:"" });

  const load = async () => {
    const [b, c] = await Promise.all([bodegasApi.list(), comunidadesApi.list()]);
    setBodegas(b.bodegas || []);
    setComunidades(c.comunidades || []);
  };
  useEffect(() => { load(); }, []);

  const syncGroups = async () => {
    setLoadingGroups(true);
    try { const { groups } = await bodegasApi.syncGroups(); setGroups(groups); }
    catch (e) { alert("Error: "+e.message); }
    finally { setLoadingGroups(false); }
  };

  const addBodega = async () => {
    await bodegasApi.create(form); setShowBodegaForm(false); setForm({name:"",wa_group_id:"",price_adjust:5000}); load();
  };
  const addCom = async () => {
    await comunidadesApi.create(comForm); setShowComForm(false); setComForm({name:"",wa_group_id:""}); load();
  };

  const Section = ({ title, children }) => (
    <div style={{ marginBottom:24 }}>
      <div style={{ color:"#ffffff60", fontSize:12, fontWeight:700, marginBottom:10, letterSpacing:1 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ padding:16, paddingBottom:80 }}>
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:800, marginBottom:20 }}>⚙️ Configuración</h2>

      {/* Bodegas */}
      <Section title="📥 BODEGAS QUE VIGILAMOS">
        {isConnected && (
          <button onClick={syncGroups} disabled={loadingGroups} style={{ ...btn("#25d36618"), border:"1px solid #25d36630", color:"#25d366", width:"100%", marginBottom:10, padding:"10px 0", fontSize:13 }}>
            {loadingGroups ? "🔄 Cargando grupos WA..." : "🔄 Importar grupos de WhatsApp"}
          </button>
        )}

        {groups.length > 0 && (
          <div style={{ ...card, padding:14, marginBottom:12 }}>
            <div style={{ color:"#ffffff55", fontSize:12, marginBottom:8 }}>Grupos encontrados — toca para agregar como bodega:</div>
            {groups.map(g => (
              <div key={g.wa_group_id} onClick={()=>setForm({name:g.name, wa_group_id:g.wa_group_id, price_adjust:5000})} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #ffffff08", cursor:"pointer" }}>
                <div>
                  <div style={{ color:"#fff", fontSize:13 }}>{g.name}</div>
                  <div style={{ color:"#ffffff40", fontSize:11 }}>👥 {g.members}</div>
                </div>
                <span style={{ color:"#7c3aed", fontSize:12 }}>+ Agregar</span>
              </div>
            ))}
          </div>
        )}

        {bodegas.map(b => (
          <div key={b.id} style={{ ...card, padding:"12px 14px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ color:"#fff", fontSize:14, fontWeight:600 }}>{b.name}</div>
              <div style={{ color:"#ffffff40", fontSize:11 }}>Ajuste: +{fmt(b.price_adjust)} · {b.active?"Activa":"Inactiva"}</div>
            </div>
            <button onClick={()=>bodegasApi.delete(b.id).then(load)} style={{ background:"#ef444412", border:"1px solid #ef444430", borderRadius:7, color:"#ef4444", padding:"5px 10px", cursor:"pointer", fontSize:12 }}>✕</button>
          </div>
        ))}

        {!showBodegaForm ? (
          <button onClick={()=>setShowBodegaForm(true)} style={{ ...btn("#ffffff08"), border:"1px solid #ffffff15", color:"#fff", width:"100%", padding:"10px 0", fontSize:13 }}>+ Agregar bodega manual</button>
        ) : (
          <div style={{ ...card, padding:14 }}>
            {[{k:"name",l:"Nombre bodega"},{k:"wa_group_id",l:"ID WhatsApp (120363xxx@g.us)"}].map(({k,l})=>(
              <div key={k} style={{ marginBottom:10 }}>
                <label style={{ color:"#ffffff45", fontSize:11, display:"block", marginBottom:4 }}>{l}</label>
                <input value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} style={{ width:"100%", background:"#ffffff08", border:"1px solid #ffffff15", borderRadius:8, padding:"8px 11px", fontSize:13, outline:"none" }} />
              </div>
            ))}
            <div style={{ marginBottom:12 }}>
              <label style={{ color:"#ffffff45", fontSize:11, display:"block", marginBottom:4 }}>Ajuste de precio por defecto</label>
              <div style={{ display:"flex", gap:5 }}>
                {[0,3000,5000,8000,10000].map(v=>(
                  <button key={v} onClick={()=>setForm(p=>({...p,price_adjust:v}))} style={{ background:form.price_adjust===v?"#7c3aed":"#ffffff08", border:`1px solid ${form.price_adjust===v?"#7c3aed":"#ffffff12"}`, borderRadius:7, color:"#fff", padding:"5px 8px", fontSize:11, cursor:"pointer" }}>
                    {v===0?"Sin ajuste":`+$${v/1000}k`}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setShowBodegaForm(false)} style={{ flex:1, ...btn("#ffffff10"), border:"1px solid #ffffff15", color:"#fff" }}>Cancelar</button>
              <button onClick={addBodega} style={{ flex:2, ...btn("linear-gradient(135deg,#7c3aed,#00d4aa)") }}>Guardar</button>
            </div>
          </div>
        )}
      </Section>

      {/* Comunidades */}
      <Section title="📤 MIS COMUNIDADES DESTINO">
        {comunidades.map(c => (
          <div key={c.id} style={{ ...card, padding:"12px 14px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ color:"#fff", fontSize:14 }}>{c.name}</div>
            <button onClick={()=>comunidadesApi.delete(c.id).then(load)} style={{ background:"#ef444412", border:"1px solid #ef444430", borderRadius:7, color:"#ef4444", padding:"5px 10px", cursor:"pointer", fontSize:12 }}>✕</button>
          </div>
        ))}
        {!showComForm ? (
          <button onClick={()=>setShowComForm(true)} style={{ ...btn("#ffffff08"), border:"1px solid #ffffff15", color:"#fff", width:"100%", padding:"10px 0", fontSize:13 }}>+ Agregar comunidad</button>
        ) : (
          <div style={{ ...card, padding:14 }}>
            {[{k:"name",l:"Nombre"},{k:"wa_group_id",l:"ID WhatsApp del grupo/comunidad"}].map(({k,l})=>(
              <div key={k} style={{ marginBottom:10 }}>
                <label style={{ color:"#ffffff45", fontSize:11, display:"block", marginBottom:4 }}>{l}</label>
                <input value={comForm[k]} onChange={e=>setComForm(p=>({...p,[k]:e.target.value}))} style={{ width:"100%", background:"#ffffff08", border:"1px solid #ffffff15", borderRadius:8, padding:"8px 11px", fontSize:13, outline:"none" }} />
              </div>
            ))}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setShowComForm(false)} style={{ flex:1, ...btn("#ffffff10"), border:"1px solid #ffffff15", color:"#fff" }}>Cancelar</button>
              <button onClick={addCom} style={{ flex:2, ...btn("linear-gradient(135deg,#25d366,#128c7e)") }}>Guardar</button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── CONEXIÓN ──────────────────────────────────────────────────────────────────
function ConexionPage() {
  const { waStatus, qr, isConnected } = React.useContext(WaCtx);
  const [connecting, setConnecting] = useState(false);
  const statusColor = { connected:"#00d4aa", qr_ready:"#f59e0b", connecting:"#f59e0b", disconnected:"#ef4444" }[waStatus]||"#ef4444";
  const statusLabel = { connected:"Conectado ✅", qr_ready:"📱 Escanea el QR", connecting:"🔄 Conectando...", disconnected:"Desconectado" }[waStatus]||waStatus;

  return (
    <div style={{ padding:16 }}>
      <h2 style={{ color:"#fff", fontSize:20, fontWeight:800, marginBottom:20 }}>🔗 Conexión WhatsApp</h2>

      <div style={{ ...card, padding:24, textAlign:"center", marginBottom:16 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:`${statusColor}12`, border:`1px solid ${statusColor}30`, borderRadius:20, padding:"8px 18px", marginBottom:20 }}>
          <div style={{ width:9, height:9, borderRadius:"50%", background:statusColor, boxShadow:`0 0 10px ${statusColor}` }} />
          <span style={{ color:statusColor, fontWeight:700 }}>{statusLabel}</span>
        </div>

        {qr && (
          <div style={{ marginBottom:16 }}>
            <div style={{ background:"#fff", borderRadius:14, padding:12, display:"inline-block", marginBottom:10 }}>
              <img src={qr} alt="QR" style={{ width:200, height:200, display:"block" }} />
            </div>
            <div style={{ color:"#f59e0b", fontSize:13 }}>⏱ QR expira en 60 segundos</div>
          </div>
        )}

        {!isConnected && !qr && !connecting && (
          <>
            <div style={{ fontSize:48, marginBottom:12 }}>📱</div>
            <p style={{ color:"#ffffff55", fontSize:13, lineHeight:1.7, marginBottom:20 }}>
              Conecta tu WhatsApp para que el sistema<br/>empiece a escuchar las bodegas automáticamente
            </p>
            <button onClick={async()=>{setConnecting(true);try{await whatsappApi.connect();}catch(e){alert(e.message);}finally{setConnecting(false);}}} style={{ ...btn("linear-gradient(135deg,#25d366,#128c7e)"), padding:"13px 32px", fontSize:15 }}>
              Conectar WhatsApp
            </button>
          </>
        )}

        {isConnected && (
          <button onClick={()=>whatsappApi.disconnect()} style={{ ...btn("#ef444418"), border:"1px solid #ef444435", color:"#ef4444", padding:"10px 24px", fontSize:13 }}>
            Desconectar
          </button>
        )}
      </div>

      <div style={{ ...card, padding:16, background:"#7c3aed08", borderColor:"#7c3aed20" }}>
        <div style={{ color:"#a78bfa", fontWeight:700, marginBottom:8 }}>💡 ¿Cómo funciona?</div>
        <div style={{ color:"#ffffff50", fontSize:13, lineHeight:1.75 }}>
          1. Conectas tu WhatsApp escaneando el QR<br/>
          2. En Configuración agregas los grupos de bodegas<br/>
          3. El sistema escucha esos grupos 24/7<br/>
          4. Cada foto+texto llega a tu bandeja ya formateado<br/>
          5. Revisas, seleccionas todo y difundes en segundos
        </div>
      </div>
    </div>
  );
}

// ── LAYOUT ────────────────────────────────────────────────────────────────────
function Layout({ children }) {
  const { user, logout } = React.useContext(AuthCtx);
  const { waStatus } = React.useContext(WaCtx);
  const [stats, setStats] = useState({});
  const nav = useNavigate();
  const waColor = { connected:"#00d4aa", qr_ready:"#f59e0b" }[waStatus] || "#ef4444";

  useEffect(() => { inboxApi.stats().then(setStats).catch(()=>{}); }, []);

  const navItems = [
    { to:"/", label:"Inbox", icon:"📥", badge: stats.pendientes },
    { to:"/config", label:"Config", icon:"⚙️" },
    { to:"/conexion", label:"WA", icon:"🔗", dot: waColor },
  ];

  return (
    <div style={{ minHeight:"100vh", paddingBottom:70 }}>
      {/* Top bar */}
      <div style={{ background:"#0a0f1a", borderBottom:"1px solid #ffffff0f", padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>👟</span>
          <div>
            <div style={{ fontWeight:900, fontSize:14 }}>SebasDifusor</div>
            <div style={{ color:"#ffffff35", fontSize:10 }}>{user?.name}</div>
          </div>
        </div>
        <button onClick={()=>{logout();nav("/login");}} style={{ background:"#ffffff08", border:"1px solid #ffffff10", borderRadius:8, color:"#ffffff50", padding:"5px 11px", fontSize:12, cursor:"pointer" }}>
          Salir
        </button>
      </div>

      {/* Content */}
      <div>{children}</div>

      {/* Bottom nav */}
      <nav style={{ position:"fixed", bottom:0, left:0, right:0, background:"#0a0f1a", borderTop:"1px solid #ffffff0f", display:"flex", zIndex:100 }}>
        {navItems.map(({ to, label, icon, badge, dot }) => (
          <NavLink key={to} to={to} end={to==="/"} style={({ isActive }) => ({ flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"10px 0", textDecoration:"none", color: isActive ? "#fff" : "#ffffff40", background: isActive ? "#ffffff08" : "transparent", fontSize:10, fontWeight: isActive ? 700 : 400, position:"relative" })}>
            <div style={{ position:"relative", fontSize:22, marginBottom:3 }}>
              {icon}
              {badge > 0 && <span style={{ position:"absolute", top:-4, right:-6, background:"#ef4444", borderRadius:10, padding:"1px 5px", fontSize:9, color:"#fff", fontWeight:800 }}>{badge}</span>}
              {dot && <span style={{ position:"absolute", top:-2, right:-2, width:8, height:8, borderRadius:"50%", background:dot, border:"1.5px solid #0a0f1a" }}/>}
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
  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", color:"#ffffff30" }}>Cargando...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function App() {
  const { user } = React.useContext(AuthCtx);
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout><InboxPage /></Layout></PrivateRoute>} />
      <Route path="/difundir" element={<PrivateRoute><Layout><DifundirPage /></Layout></PrivateRoute>} />
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
