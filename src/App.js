/* eslint-disable */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════  CONSTANTS  ═══ */
const SCHEMA_VERSION = 2;
const STORAGE_KEY = "e7draft_v6";

const EL_META = {
  fire:  { label:"Fire",        color:"#b84830" },
  water: { label:"Water",       color:"#2e82b8" },
  earth: { label:"Earth",       color:"#488040" },
  light: { label:"Light",       color:"#b89820" },
  dark:  { label:"Dark",        color:"#6838a8" },
};
const CL_META = {
  KN:{ label:"Knight" }, WA:{ label:"Warrior" },
  MG:{ label:"Mage"   }, RG:{ label:"Ranger"  },
  SW:{ label:"Soul Weaver" }, TH:{ label:"Thief" },
};
const ROLES = ["Opener","Tank","Bruiser","DPS","Healer","Buffer","Debuffer","Cleanser","Reviver","Counter"];
const RC = {
  Opener:"#c8a020", Tank:"#2868b0", Bruiser:"#5848a8", DPS:"#b03820",
  Healer:"#287850", Buffer:"#208888", Debuffer:"#a82860", Cleanser:"#5890a8",
  Reviver:"#60a040", Counter:"#a87020",
};
const HIGHLIGHT = "#e8d060";

// Element advantage: attacker beats defender
// Fire beats Earth, Water beats Fire, Earth beats Water, Dark beats Light, Light beats Dark
const EL_BEATS = { fire:"earth", water:"fire", earth:"water", dark:"light", light:"dark" };
// Leaf SVG for element advantage — filled green
const LeafIcon = ({size=11,color="#4cba60"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{flexShrink:0,display:"inline-block"}}>
    <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 1-13 6 0 0 4-2 8-2A13.5 13.5 0 0 1 17 8Z"/>
  </svg>
);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,5);
const blankHero = () => ({ id:uid(), name:"", class:"KN", element:"fire", image:"", roles:[], buffs:[], debuffs:[], strengths:[], weaknesses:[], counters:[], strongAgainst:[], synergies:[], note:"", createdAt:Date.now() });
const blankTag  = () => ({ id:uid(), name:"", icon:"", color:"#888888", createdAt:Date.now() });
const blankSW   = () => ({ id:uid(), name:"", icon:"", linkedBuffs:[], linkedDebuffs:[], createdAt:Date.now() });

const freshData = () => ({
  version:SCHEMA_VERSION,
  heroes:[blankHero(),blankHero(),blankHero()],
  buffs:[], debuffs:[], strengths:[], weaknesses:[],
  settings:{ classIcons:{}, elementIcons:{} },
});

function migrate(raw) {
  let d = typeof raw==="string" ? JSON.parse(raw) : {...raw};
  // Normalise hero shape regardless of version
  const fh=h=>({
    id:h.id??uid(), name:h.name??"", class:h.class??"KN", element:h.element??"fire",
    image:h.image??"", roles:h.roles??[], buffs:h.buffs??[], debuffs:h.debuffs??[],
    strengths:h.strengths??[], weaknesses:h.weaknesses??[], counters:h.counters??[],
    strongAgainst:h.strongAgainst??[], synergies:h.synergies??[],
    note:h.note??"", createdAt:h.createdAt??Date.now()
  });
  const ft=t=>({ id:t.id??uid(), name:t.name??"", icon:t.icon??"", color:t.color??"#888888", createdAt:t.createdAt??Date.now() });
  const fs=s=>({ id:s.id??uid(), name:s.name??"", icon:s.icon??"", linkedBuffs:s.linkedBuffs??[], linkedDebuffs:s.linkedDebuffs??[], createdAt:s.createdAt??Date.now() });
  d = {
    version: SCHEMA_VERSION,
    heroes:   (d.heroes??[]).map(fh),
    buffs:    (d.buffs??[]).map(ft),
    debuffs:  (d.debuffs??[]).map(ft),
    strengths:(d.strengths??[]).map(fs),
    weaknesses:(d.weaknesses??[]).map(fs),
    settings: { classIcons:{}, elementIcons:{}, ...(d.settings??{}) }
  };
  return d;
}

async function load() { try { const r=localStorage.getItem(STORAGE_KEY); if(r) return migrate(r); } catch {} return freshData(); }
async function save(d) { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(d)); } catch {} }

function exportXLSX(data) {
  const wb=XLSX.utils.book_new();
  // Heroes — all fields, arrays as JSON strings
  const heroRows=data.heroes.map(h=>({
    id:h.id, name:h.name, class:h.class, element:h.element,
    image:h.image,                          // base64 or url
    roles:        JSON.stringify(h.roles        ||[]),
    buffs:        JSON.stringify(h.buffs        ||[]),
    debuffs:      JSON.stringify(h.debuffs      ||[]),
    strengths:    JSON.stringify(h.strengths    ||[]),
    weaknesses:   JSON.stringify(h.weaknesses   ||[]),
    counters:     JSON.stringify(h.counters     ||[]),
    strongAgainst:JSON.stringify(h.strongAgainst||[]),
    synergies:    JSON.stringify(h.synergies    ||[]),
    note:h.note||"", createdAt:h.createdAt||Date.now()
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(heroRows), "Heroes");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.buffs.map(t=>({...t}))), "Buffs");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.debuffs.map(t=>({...t}))), "Debuffs");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.strengths.map(s=>({...s, linkedBuffs:JSON.stringify(s.linkedBuffs||[]), linkedDebuffs:JSON.stringify(s.linkedDebuffs||[])}))
  ), "Strengths");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.weaknesses.map(s=>({...s, linkedBuffs:JSON.stringify(s.linkedBuffs||[]), linkedDebuffs:JSON.stringify(s.linkedDebuffs||[])}))
  ), "Weaknesses");
  // Meta sheet — version + full settings JSON
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    version: SCHEMA_VERSION,
    settings: JSON.stringify(data.settings||{classIcons:{},elementIcons:{}})
  }]), "Meta");
  XLSX.writeFile(wb, "e7_draft_data.xlsx");
}
function importXLSX(file) {
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try {
        const wb=XLSX.read(e.target.result,{type:"array"});
        const sh=n=>wb.Sheets[n]?XLSX.utils.sheet_to_json(wb.Sheets[n]):[];
        const pj=v=>{try{return JSON.parse(v||"[]");}catch{return [];}};
        const pjObj=v=>{try{return JSON.parse(v||"{}");}catch{return {};}};

        const heroes=sh("Heroes").map(h=>({
          id:h.id||uid(), name:h.name||"", class:h.class||"KN", element:h.element||"fire",
          image:h.image||"",
          roles:        pj(h.roles),
          buffs:        pj(h.buffs),
          debuffs:      pj(h.debuffs),
          strengths:    pj(h.strengths),
          weaknesses:   pj(h.weaknesses),
          counters:     pj(h.counters),
          strongAgainst:pj(h.strongAgainst),
          synergies:    pj(h.synergies),
          note:h.note||"", createdAt:h.createdAt||Date.now()
        }));
        const buffs   =sh("Buffs"   ).map(t=>({id:t.id||uid(),name:t.name||"",icon:t.icon||"",color:t.color||"#888888",createdAt:t.createdAt||Date.now()}));
        const debuffs =sh("Debuffs" ).map(t=>({id:t.id||uid(),name:t.name||"",icon:t.icon||"",color:t.color||"#888888",createdAt:t.createdAt||Date.now()}));
        const strengths =sh("Strengths" ).map(s=>({id:s.id||uid(),name:s.name||"",icon:s.icon||"",linkedBuffs:pj(s.linkedBuffs),linkedDebuffs:pj(s.linkedDebuffs),createdAt:s.createdAt||Date.now()}));
        const weaknesses=sh("Weaknesses").map(s=>({id:s.id||uid(),name:s.name||"",icon:s.icon||"",linkedBuffs:pj(s.linkedBuffs),linkedDebuffs:pj(s.linkedDebuffs),createdAt:s.createdAt||Date.now()}));
        const meta=sh("Meta")[0]||{};
        const settings=pjObj(meta.settings);
        if(!settings.classIcons)  settings.classIcons={};
        if(!settings.elementIcons)settings.elementIcons={};
        // Run through migrate() so any missing fields get defaults
        res(migrate({version:SCHEMA_VERSION,heroes,buffs,debuffs,strengths,weaknesses,settings}));
      } catch(err){rej(err);}
    };
    reader.readAsArrayBuffer(file);
  });
}

/* ═══ HELPERS ═══ */
const sorted=(arr,s)=>[...arr].sort((a,b)=>s==="az"?(a.name||"").localeCompare(b.name||""):(b.createdAt||0)-(a.createdAt||0));
function clsIcon(cls,settings){const ico=settings?.classIcons?.[cls];if(ico)return ico;const label=CL_META[cls]?.label||cls;return label.split(" ").map(w=>w[0]).join("");}
function elIcon(el,settings){const ico=settings?.elementIcons?.[el];if(ico)return ico;return(EL_META[el]?.label||el)[0];}
function elColor(el){return EL_META[el]?.color||"#666";}
function cropToSquare(src,isPng){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const size=Math.min(img.width,img.height);
      const canvas=document.createElement("canvas");
      canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext("2d");
      if(isPng){ctx.fillStyle="#000";ctx.fillRect(0,0,size,size);}
      ctx.drawImage(img,(img.width-size)/2,(img.height-size)/2,size,size,0,0,size,size);
      resolve(canvas.toDataURL("image/jpeg",0.92));
    };
    img.onerror=()=>resolve(src);
    img.src=src;
  });
}

/* ═══ THEME ═══ */
const T = { bg:"#080c15", panel:"#0d1526", card:"#101d2e", border:"#1a2d42", gold:"#c9a84c", goldDim:"#8a6e2e", text:"#cdc5b0", sub:"#5a7090", dim:"#2e4060" };
const GS = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{background:${T.bg};}
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-track{background:${T.bg};}
  ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px;}
  input,button,textarea,select{font-family:inherit;}
  .hov:hover{opacity:0.85;cursor:pointer;}
  .card-hov:hover{border-color:${T.goldDim}!important;}
  .syn-glow{box-shadow:0 0 0 1px #2a8050,0 0 16px #2a804466!important;}
  .ctr-glow{box-shadow:0 0 0 1px #803028,0 0 16px #80302844!important;}
  .both-glow{box-shadow:0 0 0 1px #a88020,0 0 16px #a8802044!important;}
  .active-slot{box-shadow:0 0 0 1px ${T.gold},0 0 12px ${T.gold}33!important;border-color:${T.gold}!important;}
  .hl{background:${HIGHLIGHT}22!important;border-color:${HIGHLIGHT}88!important;box-shadow:0 0 5px ${HIGHLIGHT}44!important;}
`;
const INP={background:T.bg,border:`1px solid ${T.border}`,color:T.text,padding:"6px 10px",borderRadius:3,fontSize:13,outline:"none",width:"100%",fontFamily:"'Crimson Text',serif"};

/* ═══ ATOMS ═══ */
function Ico({src,size=32,fallback="?"}){
  const isImg=src&&(src.startsWith("data:")||src.startsWith("http")||src.startsWith("blob:"));
  const s={width:size,height:size,minWidth:size,flexShrink:0,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:3,overflow:"hidden",background:isImg?"transparent":T.card};
  if(isImg) return <img src={src} alt="" style={{...s,objectFit:"cover",background:"#000"}}/>;
  return <span style={{...s,fontSize:Math.max(8,size*0.38),color:src?T.sub:T.dim,fontFamily:"Cinzel,serif",textAlign:"center",lineHeight:1}}>{src||fallback}</span>;
}

function ImagePicker({value,onChange}){
  const [mode,setMode]=useState("url");
  const [urlInput,setUrlInput]=useState("");
  const [loading,setLoading]=useState(false);
  const ref=useRef();
  async function handleFile(e){const f=e.target.files[0];if(!f)return;setLoading(true);const r=new FileReader();r.onload=async ev=>{const c=await cropToSquare(ev.target.result,f.type==="image/png");onChange(c);setLoading(false);};r.readAsDataURL(f);e.target.value="";}
  async function handleUrl(){if(!urlInput.trim())return;setLoading(true);try{const res=await fetch(urlInput);const blob=await res.blob();const r=new FileReader();r.onload=async ev=>{const c=await cropToSquare(ev.target.result,blob.type==="image/png");onChange(c);setLoading(false);};r.readAsDataURL(blob);}catch{onChange(urlInput);setLoading(false);}}
  return(
    <div>
      <div style={{display:"flex",gap:4,marginBottom:6}}>
        <Ico src={value} size={36} fallback="—"/>
        <div style={{display:"flex",gap:3,alignItems:"center"}}>
          {[["url","URL"],["file","File"],["text","Text"]].map(([v,l])=>(
            <button key={v} onClick={()=>setMode(v)} className="hov" style={{background:mode===v?T.gold:T.card,border:"none",color:mode===v?T.bg:T.sub,padding:"3px 9px",borderRadius:2,fontSize:10,fontFamily:"Cinzel,serif"}}>{l}</button>
          ))}
          {value&&<button onClick={()=>onChange("")} className="hov" style={{background:"none",border:`1px solid ${T.border}`,color:T.sub,padding:"2px 7px",borderRadius:2,fontSize:10}}>Clear</button>}
        </div>
      </div>
      {mode==="url"&&<div style={{display:"flex",gap:4}}><input value={urlInput} onChange={e=>setUrlInput(e.target.value)} placeholder="https://…" style={{...INP,flex:1}}/><Btn onClick={handleUrl} variant="primary">{loading?"…":"Load"}</Btn></div>}
      {mode==="text"&&<input value={value&&!value.startsWith("data:")&&!value.startsWith("http")?value:""} onChange={e=>onChange(e.target.value)} placeholder="Short label…" style={INP}/>}
      {mode==="file"&&<><input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/><button onClick={()=>ref.current.click()} className="hov" style={{background:T.card,border:`1px solid ${T.border}`,color:T.sub,padding:"6px 14px",borderRadius:3,fontSize:12}}>{loading?"Processing…":"Choose image…"}</button></>}
    </div>
  );
}

function Modal({title,onClose,children,width=580,maxH="88vh"}){
  return(
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"#000c",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}>
      <div style={{background:T.panel,border:`1px solid ${T.border}`,borderRadius:6,padding:"20px 22px",width,maxWidth:"96vw",maxHeight:maxH,overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
          <span style={{fontFamily:"Cinzel,serif",color:T.gold,fontSize:12,letterSpacing:2}}>{title}</span>
          <button onClick={onClose} className="hov" style={{background:"none",border:"none",color:T.sub,fontSize:16,lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({label,children,half}){
  return(
    <div style={{marginBottom:10,width:half?"50%":undefined,paddingRight:half?8:undefined}}>
      <div style={{fontFamily:"Cinzel,serif",fontSize:9,color:T.sub,letterSpacing:1.5,marginBottom:5}}>{label}</div>
      {children}
    </div>
  );
}

function Pill({active,color=T.gold,onClick,children}){
  return <button onClick={onClick} className="hov" style={{background:active?color+"2a":T.card,border:`1px solid ${active?color:T.border}`,color:active?color:T.sub,padding:"3px 10px",borderRadius:2,fontSize:11,display:"inline-flex",alignItems:"center",gap:4,transition:"all 0.1s",fontFamily:"'Crimson Text',serif"}}>{children}</button>;
}

function Btn({onClick,children,variant="default",style:sx={}}){
  const S={default:{background:T.card,border:`1px solid ${T.border}`,color:T.sub},primary:{background:T.gold,border:"none",color:T.bg,fontWeight:600},danger:{background:"#3a0e0e",border:`1px solid #5a1a1a`,color:"#c06060"},ghost:{background:"none",border:`1px solid ${T.border}`,color:T.sub}};
  return <button onClick={onClick} className="hov" style={{...S[variant],padding:"5px 14px",borderRadius:3,fontSize:12,fontFamily:"Cinzel,serif",letterSpacing:1,cursor:"pointer",...sx}}>{children}</button>;
}

function SortRow({sort,setSort}){
  return <div style={{display:"flex",gap:3}}>{[["az","A — Z"],["latest","Latest"]].map(([v,l])=><button key={v} onClick={()=>setSort(v)} className="hov" style={{background:sort===v?T.gold:T.card,border:"none",color:sort===v?T.bg:T.sub,padding:"3px 10px",borderRadius:2,fontSize:10,fontFamily:"Cinzel,serif",letterSpacing:1}}>{l}</button>)}</div>;
}

/* ═══ SEARCH DROPDOWN MULTI-SELECT ═══ */
function SearchDropdown({label,items,sel,onToggle,color=T.gold}){
  const [search,setSearch]=useState("");
  const [open,setOpen]=useState(false);
  const ref=useRef();
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  const filtered=items.filter(i=>!search||(i.name||"").toLowerCase().includes(search.toLowerCase()));
  const selNames=sel.map(id=>items.find(x=>x.id===id)?.name).filter(Boolean);
  return(
    <Field label={label}>
      <div ref={ref} style={{position:"relative"}}>
        <div onClick={()=>setOpen(v=>!v)} className="hov" style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:3,padding:"6px 10px",display:"flex",alignItems:"center",gap:6,cursor:"pointer",minHeight:34}}>
          {selNames.length===0
            ?<span style={{color:T.dim,fontSize:12,fontFamily:"'Crimson Text',serif",fontStyle:"italic"}}>None — click to browse</span>
            :<div style={{display:"flex",gap:3,flexWrap:"wrap",flex:1}}>{selNames.map((n,i)=>{const item=items.find(x=>x.name===n);return <span key={i} style={{fontSize:11,padding:"1px 6px",borderRadius:2,background:(item?.color||color)+"22",color:item?.color||color,fontFamily:"'Crimson Text',serif"}}>{n}</span>;})}</div>
          }
          <span style={{color:T.dim,fontSize:10,flexShrink:0}}>{open?"▲":"▼"}</span>
        </div>
        {open&&(
          <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:1000,background:T.panel,border:`1px solid ${T.border}`,borderRadius:3,maxHeight:180,overflowY:"auto",boxShadow:"0 8px 24px #0008"}}>
            <div style={{padding:"5px 8px",borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,background:T.panel}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...INP,fontSize:11}} autoFocus/>
            </div>
            {filtered.length===0&&<div style={{padding:"10px",color:T.dim,fontSize:12,fontStyle:"italic",fontFamily:"'Crimson Text',serif"}}>No matches</div>}
            {filtered.map(item=>{
              const active=sel.includes(item.id);
              return(
                <div key={item.id} onClick={()=>onToggle(item.id)} className="hov" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:active?(item.color||color)+"18":undefined,borderBottom:`1px solid ${T.border}22`,cursor:"pointer"}}>
                  <div style={{width:13,height:13,border:`1px solid ${active?item.color||color:T.border}`,borderRadius:2,background:active?item.color||color:undefined,flexShrink:0}}/>
                  <Ico src={item.icon} size={15} fallback={item.name?.[0]||"?"}/>
                  <span style={{fontSize:12,color:active?item.color||color:T.text,fontFamily:"'Crimson Text',serif",flex:1}}>{item.name||"(unnamed)"}</span>
                  {active&&<span style={{color:item.color||color,fontSize:10}}>✓</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Field>
  );
}

/* ═══ HERO PICKER MODAL ═══ */
function HeroPickerModal({title,heroes,selected,onSave,onClose,settings}){
  const [sort,setSort]=useState("az");
  const [search,setSearch]=useState("");
  const [sel,setSel]=useState([...selected]);
  const list=useMemo(()=>sorted(heroes.filter(h=>!search||(h.name||"").toLowerCase().includes(search.toLowerCase())),sort),[heroes,sort,search]);
  const tog=id=>setSel(s=>s.includes(id)?s.filter(v=>v!==id):[...s,id]);
  return(
    <Modal title={title} onClose={onClose} width={620} maxH="80vh">
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...INP,width:200}}/>
        <SortRow sort={sort} setSort={setSort}/>
        <span style={{marginLeft:"auto",fontSize:11,color:T.sub,fontFamily:"'Crimson Text',serif"}}>{sel.length} selected</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8,maxHeight:380,overflowY:"auto",padding:"2px"}}>
        {list.map(h=>{
          const active=sel.includes(h.id);
          return(
            <div key={h.id} onClick={()=>tog(h.id)} className="hov" style={{background:active?T.gold+"18":T.card,border:`1px solid ${active?T.gold:T.border}`,borderRadius:4,padding:"10px 6px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,transition:"all 0.12s"}}>
              <Ico src={h.image} size={64} fallback={clsIcon(h.class,settings)}/>
              <div style={{fontFamily:"Cinzel,serif",fontSize:10,color:active?T.gold:T.text,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",width:"100%"}}>{h.name||<span style={{color:T.dim,fontStyle:"italic"}}>Unnamed</span>}</div>
              <div style={{fontSize:9,color:elColor(h.element),fontFamily:"Cinzel,serif"}}>{EL_META[h.element]?.label}</div>
            </div>
          );
        })}
        {list.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",color:T.dim,fontStyle:"italic",padding:24,fontFamily:"'Crimson Text',serif"}}>No heroes found</div>}
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={()=>onSave(sel)}>Confirm</Btn>
      </div>
    </Modal>
  );
}

/* ═══ HERO MODAL ═══ */
function HeroModal({hero,data,onSave,onClose}){
  const [f,setF]=useState({...hero,roles:[...hero.roles],buffs:[...hero.buffs],debuffs:[...hero.debuffs],strengths:[...(hero.strengths||[])],weaknesses:[...(hero.weaknesses||[])],counters:[...(hero.counters||[])],strongAgainst:[...(hero.strongAgainst||[])],synergies:[...(hero.synergies||[])]});
  const [picker,setPicker]=useState(null);
  const tog=(field,val)=>setF(x=>({...x,[field]:x[field].includes(val)?x[field].filter(v=>v!==val):[...x[field],val]}));
  const others=data.heroes.filter(h=>h.id!==f.id);
  return(
    <Modal title={f.id&&data.heroes.some(h=>h.id===f.id)?"Edit Hero":"Add Hero"} onClose={onClose} width={680} maxH="92vh">
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{flex:1}}><Field label="NAME"><input value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))} placeholder="Hero name…" style={INP} autoFocus/></Field></div>
        <div style={{flex:1}}><Field label="NOTE"><input value={f.note} onChange={e=>setF(x=>({...x,note:e.target.value}))} placeholder="Short note…" style={INP}/></Field></div>
      </div>
      <Field label="PROFILE IMAGE"><ImagePicker value={f.image} onChange={v=>setF(x=>({...x,image:v}))}/></Field>
      <div style={{display:"flex",gap:12,marginTop:10}}>
        <Field label="CLASS" half>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {Object.entries(CL_META).map(([k,v])=>(
              <Pill key={k} active={f.class===k} onClick={()=>setF(x=>({...x,class:k}))}>
                <Ico src={data.settings?.classIcons?.[k]||""} size={14} fallback={clsIcon(k,data.settings)}/>{v.label}
              </Pill>
            ))}
          </div>
        </Field>
        <Field label="ELEMENT" half>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {Object.entries(EL_META).map(([k,v])=>(
              <Pill key={k} active={f.element===k} color={v.color} onClick={()=>setF(x=>({...x,element:k}))}>
                <Ico src={data.settings?.elementIcons?.[k]||""} size={14} fallback={elIcon(k,data.settings)}/>{v.label}
              </Pill>
            ))}
          </div>
        </Field>
      </div>
      {/* Element advantage auto-info */}
      {(()=>{
        const beats  = EL_BEATS[f.element];          // element this hero is strong against
        const losesTo= Object.keys(EL_BEATS).find(k=>EL_BEATS[k]===f.element); // element strong against this hero
        return (
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {beats&&(
              <div style={{display:"flex",alignItems:"center",gap:5,background:"#1a3a2a",border:"1px solid #2a6a40",borderRadius:3,padding:"5px 10px",flex:1,minWidth:140}}>
                <LeafIcon size={11} color="#4cba60"/>
                <span style={{fontFamily:"Cinzel,serif",fontSize:9,color:"#4cba60",letterSpacing:1}}>STRONG VS</span>
                <span style={{fontSize:11,color:elColor(beats),fontFamily:"'Crimson Text',serif",fontWeight:600,marginLeft:2}}>{EL_META[beats]?.label}</span>
                <span style={{fontSize:9,color:"#3a9a50",fontFamily:"'Crimson Text',serif",fontStyle:"italic",marginLeft:"auto"}}>auto</span>
              </div>
            )}
            {losesTo&&(
              <div style={{display:"flex",alignItems:"center",gap:5,background:"#3a1a1a",border:"1px solid #6a2a2a",borderRadius:3,padding:"5px 10px",flex:1,minWidth:140}}>
                <span style={{fontSize:11,color:"#c06060"}}>⚠</span>
                <span style={{fontFamily:"Cinzel,serif",fontSize:9,color:"#c06060",letterSpacing:1}}>WEAK VS</span>
                <span style={{fontSize:11,color:elColor(losesTo),fontFamily:"'Crimson Text',serif",fontWeight:600,marginLeft:2}}>{EL_META[losesTo]?.label}</span>
                <span style={{fontSize:9,color:"#9a3a3a",fontFamily:"'Crimson Text',serif",fontStyle:"italic",marginLeft:"auto"}}>auto</span>
              </div>
            )}
            {!beats&&!losesTo&&(
              <div style={{fontSize:10,color:T.dim,fontFamily:"'Crimson Text',serif",fontStyle:"italic",padding:"4px 0"}}>No elemental advantage (Dark / Light are mutual).</div>
            )}
          </div>
        );
      })()}
      <Field label="ROLES"><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{ROLES.map(r=><Pill key={r} active={f.roles.includes(r)} color={RC[r]} onClick={()=>tog("roles",r)}>{r}</Pill>)}</div></Field>
      <SearchDropdown label="BUFFS (can provide)"  items={data.buffs}   sel={f.buffs}     onToggle={v=>tog("buffs",v)}   color="#208888"/>
      <SearchDropdown label="DEBUFFS (can apply)"  items={data.debuffs} sel={f.debuffs}   onToggle={v=>tog("debuffs",v)} color="#a82860"/>
      <SearchDropdown label="STRENGTHS"  items={data.strengths.map(s=>({...s,color:"#3a7a50"}))}  sel={f.strengths}  onToggle={v=>tog("strengths",v)}  color="#3a7a50"/>
      <SearchDropdown label="WEAKNESSES" items={data.weaknesses.map(s=>({...s,color:"#7a3030"}))} sel={f.weaknesses} onToggle={v=>tog("weaknesses",v)} color="#7a3030"/>
      <div style={{display:"flex",gap:10,marginTop:6}}>
        <Field label="SYNERGIZES WITH" half>
          <button onClick={()=>setPicker("synergies")} className="hov card-hov" style={{background:T.card,border:`1px solid ${T.border}`,color:T.sub,padding:"6px 10px",borderRadius:3,fontSize:12,width:"100%",textAlign:"left",fontFamily:"'Crimson Text',serif"}}>
            {f.synergies.length===0?"Click to select heroes…":`${f.synergies.length} hero${f.synergies.length!==1?"s":""} selected`}
          </button>
          {f.synergies.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>{f.synergies.map(id=>{const h=data.heroes.find(x=>x.id===id);return h?<span key={id} style={{fontSize:10,padding:"2px 6px",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,color:T.text,fontFamily:"'Crimson Text',serif"}}>{h.name||"Unnamed"}</span>:null;})}</div>}
        </Field>
        <Field label="STRONG AGAINST" half>
          <button onClick={()=>setPicker("strongAgainst")} className="hov card-hov" style={{background:T.card,border:`1px solid #3a7a5066`,color:"#5aaa70",padding:"6px 10px",borderRadius:3,fontSize:12,width:"100%",textAlign:"left",fontFamily:"'Crimson Text',serif"}}>
            {(f.strongAgainst||[]).length===0?"Click to select heroes…":`${f.strongAgainst.length} hero${f.strongAgainst.length!==1?"s":""} selected`}
          </button>
          {(f.strongAgainst||[]).length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>{f.strongAgainst.map(id=>{const h=data.heroes.find(x=>x.id===id);return h?<span key={id} style={{fontSize:10,padding:"2px 6px",background:"#3a7a5022",border:`1px solid #3a7a5066`,borderRadius:2,color:"#5aaa70",fontFamily:"'Crimson Text',serif"}}>{h.name||"Unnamed"}</span>:null;})}</div>}
        </Field>
      </div>
      <Field label="COUNTERED BY">
        <button onClick={()=>setPicker("counters")} className="hov card-hov" style={{background:T.card,border:`1px solid ${T.border}`,color:T.sub,padding:"6px 10px",borderRadius:3,fontSize:12,width:"100%",textAlign:"left",fontFamily:"'Crimson Text',serif"}}>
          {f.counters.length===0?"Click to select heroes…":`${f.counters.length} hero${f.counters.length!==1?"s":""} selected`}
        </button>
        {f.counters.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>{f.counters.map(id=>{const h=data.heroes.find(x=>x.id===id);return h?<span key={id} style={{fontSize:10,padding:"2px 6px",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,color:T.text,fontFamily:"'Crimson Text',serif"}}>{h.name||"Unnamed"}</span>:null;})}</div>}
      </Field>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={()=>onSave(f)}>Save</Btn>
      </div>
      {picker&&<HeroPickerModal title={picker==="synergies"?"Select Synergy Heroes":picker==="strongAgainst"?"Select Heroes This Hero Is Strong Against":"Select Counter Heroes"} heroes={others} selected={f[picker]||[]} onSave={v=>{setF(x=>({...x,[picker]:v}));setPicker(null);}} onClose={()=>setPicker(null)} settings={data.settings}/>}
    </Modal>
  );
}

/* ═══ TAG MODAL ═══ */
function TagModal({type,tag,data,onSave,onClose}){
  const isStrWk=type==="strengths"||type==="weaknesses";
  const [f,setF]=useState({...tag,linkedBuffs:[...(tag.linkedBuffs||[])],linkedDebuffs:[...(tag.linkedDebuffs||[])]});
  const togL=(field,id)=>setF(x=>({...x,[field]:x[field].includes(id)?x[field].filter(v=>v!==id):[...x[field],id]}));
  return(
    <Modal title={`${tag.id?"Edit":"New"} ${type.slice(0,-1)}`} onClose={onClose} width={500}>
      <Field label="NAME"><input value={f.name} onChange={e=>setF(x=>({...x,name:e.target.value}))} placeholder="Tag name…" style={INP} autoFocus/></Field>
      <Field label="ICON / IMAGE"><ImagePicker value={f.icon} onChange={v=>setF(x=>({...x,icon:v}))}/></Field>
      {!isStrWk&&<Field label="COLOR"><div style={{display:"flex",gap:8,alignItems:"center"}}><input type="color" value={f.color||"#888888"} onChange={e=>setF(x=>({...x,color:e.target.value}))} style={{width:36,height:28,border:"none",background:"none",cursor:"pointer",padding:0}}/><span style={{fontSize:13,color:f.color,fontFamily:"'Crimson Text',serif"}}>{f.name||"preview"}</span></div></Field>}
      {isStrWk&&(
        <>
          <div style={{fontSize:12,color:T.sub,marginBottom:10,fontFamily:"'Crimson Text',serif",lineHeight:1.7,background:T.card,border:`1px solid ${T.border}`,borderRadius:3,padding:"8px 10px"}}>
            <span style={{fontFamily:"Cinzel,serif",fontSize:9,color:T.gold,letterSpacing:1,display:"block",marginBottom:4}}>HOW LINKING WORKS</span>
            <span style={{color:"#5aaa70"}}>Strength + debuff link</span> → activates when the <em>enemy</em> carries that debuff.<br/>
            <span style={{color:"#5aaa70"}}>Strength + buff link</span> → activates when <em>your</em> team has that buff.<br/>
            <span style={{color:"#c06060"}}>Weakness + debuff link</span> → exposed when the <em>enemy</em> applies that debuff.<br/>
            <span style={{color:"#c06060"}}>Weakness + buff link</span> → exposed when <em>your</em> team has that buff (it's countered).
          </div>
          <SearchDropdown
            label={type==="strengths"?"LINKED DEBUFFS — enemy must carry this (e.g. resist Stun when enemy has Stun)":"LINKED DEBUFFS — enemy applies this to exploit weakness"}
            items={data.debuffs} sel={f.linkedDebuffs} onToggle={v=>togL("linkedDebuffs",v)} color="#a82860"
          />
          <SearchDropdown
            label={type==="strengths"?"LINKED BUFFS — your team must have this (e.g. +speed buff)":"LINKED BUFFS — your team has this but the weakness nullifies it"}
            items={data.buffs} sel={f.linkedBuffs} onToggle={v=>togL("linkedBuffs",v)} color="#208888"
          />
        </>
      )}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={()=>f.name.trim()&&onSave(type,f)}>Save</Btn>
      </div>
    </Modal>
  );
}

/* ═══ DRAFT VIEW ═══ */
function DraftView({data}){
  const [myTeam,setMyTeam]=useState(Array(5).fill(null));
  const [enemyTeam,setEnemyTeam]=useState(Array(5).fill(null));
  const [active,setActive]=useState({team:"my",idx:0});
  const [search,setSearch]=useState("");
  const [fEl,setFEl]=useState("All");
  const [fCl,setFCl]=useState("All");
  const [sort,setSort]=useState("az");

  const roster=useMemo(()=>{
    const currentTeam=active.team==="my"?myTeam:enemyTeam;
    const used=new Set(currentTeam.filter(Boolean).map(h=>h.id));
    let h=data.heroes.filter(x=>!used.has(x.id));
    if(fEl!=="All")h=h.filter(x=>x.element===fEl);
    if(fCl!=="All")h=h.filter(x=>x.class===fCl);
    if(search)h=h.filter(x=>(x.name||"").toLowerCase().includes(search.toLowerCase()));
    return sorted(h,sort);
  },[data.heroes,myTeam,enemyTeam,fEl,fCl,search,sort,active.team]);

  function pick(hero){
    const t=active.team==="my"?myTeam:enemyTeam;
    const set=active.team==="my"?setMyTeam:setEnemyTeam;
    const n=[...t];n[active.idx]=hero;set(n);
    const nx=n.findIndex((h,i)=>i!==active.idx&&!h);
    if(nx>=0){setActive({team:active.team,idx:nx});return;}
    if(active.team==="my"){const ei=enemyTeam.findIndex(h=>!h);if(ei>=0)setActive({team:"enemy",idx:ei});}
  }
  function remove(team,idx){
    if(team==="my"){const n=[...myTeam];n[idx]=null;setMyTeam(n);}
    else{const n=[...enemyTeam];n[idx]=null;setEnemyTeam(n);}
    setActive({team,idx});
  }

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>
        <TeamPanel label="MY TEAM"    team={myTeam}    teamKey="my"    opp={enemyTeam} active={active} setActive={setActive} onRemove={remove} data={data}/>
        <div style={{width:1,background:T.border,flexShrink:0}}/>
        <TeamPanel label="ENEMY TEAM" team={enemyTeam} teamKey="enemy" opp={myTeam}    active={active} setActive={setActive} onRemove={remove} data={data}/>
      </div>
      {/* Picker */}
      <div style={{background:T.panel,borderTop:`1px solid ${T.border}`,flexShrink:0}}>
        <div style={{padding:"5px 12px 0",display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontFamily:"Cinzel,serif",fontSize:9,color:T.gold,letterSpacing:2,flexShrink:0}}>{active.team==="my"?"MY":"ENEMY"} · SLOT {active.idx+1}</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search heroes…" style={{...INP,width:130,fontSize:11}}/>
          <SortRow sort={sort} setSort={setSort}/>
        </div>
        <div style={{padding:"4px 12px 0",display:"flex",gap:4,alignItems:"center",overflowX:"auto"}}>
          <span style={{fontFamily:"Cinzel,serif",fontSize:8,color:T.dim,letterSpacing:1,marginRight:2,flexShrink:0}}>EL</span>
          {["All",...Object.keys(EL_META)].map(el=>(
            <button key={el} onClick={()=>setFEl(el)} className="hov" style={{background:fEl===el?(EL_META[el]?.color||T.gold):T.card,border:`1px solid ${fEl===el?(EL_META[el]?.color||T.gold):T.border}`,color:"#fff",padding:"2px 8px",borderRadius:2,fontSize:10,fontFamily:"Cinzel,serif",flexShrink:0}}>
              {el==="All"?"All":<span style={{display:"flex",alignItems:"center",gap:3}}><Ico src={data.settings?.elementIcons?.[el]||""} size={12} fallback={elIcon(el,data.settings)}/>{EL_META[el]?.label}</span>}
            </button>
          ))}
        </div>
        <div style={{padding:"4px 12px 4px",display:"flex",gap:4,alignItems:"center",overflowX:"auto"}}>
          <span style={{fontFamily:"Cinzel,serif",fontSize:8,color:T.dim,letterSpacing:1,marginRight:2,flexShrink:0}}>CL</span>
          {["All",...Object.keys(CL_META)].map(cl=>(
            <button key={cl} onClick={()=>setFCl(cl)} className="hov" style={{background:fCl===cl?T.gold:T.card,border:`1px solid ${fCl===cl?T.gold:T.border}`,color:fCl===cl?T.bg:T.sub,padding:"2px 8px",borderRadius:2,fontSize:10,fontFamily:"Cinzel,serif",flexShrink:0}}>
              {cl==="All"?"All":<span style={{display:"flex",alignItems:"center",gap:3}}><Ico src={data.settings?.classIcons?.[cl]||""} size={12} fallback={clsIcon(cl,data.settings)}/>{CL_META[cl]?.label}</span>}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:5,padding:"5px 12px 7px",overflowX:"auto",overflowY:"hidden",height:90}}>
          {roster.map(hero=>(
            <div key={hero.id} onClick={()=>pick(hero)} className="hov card-hov" style={{flexShrink:0,width:70,background:T.card,border:`1px solid ${T.border}`,borderRadius:4,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:"3px"}}>
              <Ico src={hero.image} size={34} fallback={clsIcon(hero.class,data.settings)}/>
              <div style={{fontSize:8,fontFamily:"Cinzel,serif",color:T.text,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",width:"100%",padding:"0 2px"}}>{hero.name||<span style={{color:T.dim}}>—</span>}</div>
              <div style={{fontSize:7,color:elColor(hero.element),fontFamily:"Cinzel,serif"}}>{EL_META[hero.element]?.label}</div>
            </div>
          ))}
          {roster.length===0&&<div style={{color:T.dim,fontSize:12,fontStyle:"italic",alignSelf:"center",fontFamily:"'Crimson Text',serif",padding:"0 8px"}}>All heroes placed or no heroes match filter.</div>}
        </div>
      </div>
    </div>
  );
}

/* ═══ TEAM PANEL ═══ */
function TeamPanel({label,team,teamKey,opp,active,setActive,onRemove,data}){
  const isActiveTeam=active.team===teamKey;
  const teammates=team.filter(Boolean);
  const opponents=opp.filter(Boolean);

  const ownBufSet =useMemo(()=>new Set(teammates.flatMap(h=>h.buffs||[])),[team,teammates]);
  const oppDebSet =useMemo(()=>new Set(opponents.flatMap(h=>h.debuffs||[])),[opp,opponents]);

  const tBufCounts=useMemo(()=>{const c={};teammates.forEach(h=>(h.buffs||[]).forEach(id=>{c[id]=(c[id]||0)+1;}));return c;},[team,teammates]);
  const tDebCounts=useMemo(()=>{const c={};teammates.forEach(h=>(h.debuffs||[]).forEach(id=>{c[id]=(c[id]||0)+1;}));return c;},[team,teammates]);

  const synPairs=useMemo(()=>{
    const p=[];
    for(let i=0;i<teammates.length;i++)for(let j=i+1;j<teammates.length;j++){
      const a=teammates[i],b=teammates[j];
      if((a.synergies||[]).includes(b.id)||(b.synergies||[]).includes(a.id))p.push([a,b]);
    }
    return p;
  },[team]);

  // STRENGTHS: hero ▶ enemy pairs + highlighted tags
  const strengthData=useMemo(()=>{
    const pairs=[];
    const tagMap=new Map();
    // ── Elemental advantage (auto) ──
    teammates.forEach(mine=>{
      opponents.forEach(e=>{
        if(EL_BEATS[mine.element]===e.element)
          pairs.push({mine,opp:e,label:null,elemental:true});
      });
    });
    teammates.forEach(mine=>{
      // Direct strong-against
      (mine.strongAgainst||[]).forEach(eid=>{
        const e=opponents.find(x=>x.id===eid);
        if(e&&!pairs.find(p=>p.mine.id===mine.id&&p.opp.id===e.id&&p.elemental))
          pairs.push({mine,opp:e,label:null,elemental:false});
      });
      // Strength tags
      (mine.strengths||[]).forEach(sid=>{
        const s=data.strengths.find(x=>x.id===sid);
        if(!s)return;
        if(!tagMap.has(sid)){
          const debMatch=(s.linkedDebuffs||[]).some(d=>oppDebSet.has(d));
          const bufMatch=(s.linkedBuffs||[]).some(b=>ownBufSet.has(b));
          tagMap.set(sid,{tag:s,highlighted:debMatch||bufMatch});
        }
        (s.linkedDebuffs||[]).forEach(d=>{
          opponents.forEach(e=>{
            if((e.debuffs||[]).includes(d)){
              const exists=pairs.find(p=>p.mine.id===mine.id&&p.opp.id===e.id&&p.label===s.name);
              if(!exists)pairs.push({mine,opp:e,label:s.name,elemental:false});
            }
          });
        });
      });
    });
    return {pairs:[...new Map(pairs.map(p=>[`${p.mine.id}:${p.opp.id}:${p.label}:${p.elemental}`,p])).values()], tags:[...tagMap.values()]};
  },[team,opp,data.strengths,oppDebSet,ownBufSet]);

  // WEAKNESSES
  const weaknessData=useMemo(()=>{
    const pairs=[];
    const tagMap=new Map();
    // ── Elemental weakness (auto) ──
    teammates.forEach(mine=>{
      opponents.forEach(e=>{
        if(EL_BEATS[e.element]===mine.element)
          pairs.push({mine,opp:e,elemental:true});
      });
    });
    teammates.forEach(mine=>{
      (mine.weaknesses||[]).forEach(wid=>{
        const w=data.weaknesses.find(x=>x.id===wid);
        if(!w)return;
        if(!tagMap.has(wid)){
          const debMatch=(w.linkedDebuffs||[]).some(d=>oppDebSet.has(d));
          const bufMatch=(w.linkedBuffs||[]).some(b=>ownBufSet.has(b));
          tagMap.set(wid,{tag:w,highlighted:debMatch||bufMatch});
        }
        (w.linkedDebuffs||[]).forEach(d=>{
          opponents.forEach(e=>{
            if((e.debuffs||[]).includes(d)){
              const exists=pairs.find(p=>p.mine.id===mine.id&&p.opp.id===e.id&&!p.elemental);
              if(!exists)pairs.push({mine,opp:e,elemental:false});
            }
          });
        });
        (mine.counters||[]).forEach(eid=>{
          const e=opponents.find(x=>x.id===eid);
          if(e&&!pairs.find(p=>p.mine.id===mine.id&&p.opp.id===e.id&&!p.elemental))
            pairs.push({mine,opp:e,elemental:false});
        });
      });
      (mine.counters||[]).forEach(eid=>{
        const e=opponents.find(x=>x.id===eid);
        if(e&&!pairs.find(p=>p.mine.id===mine.id&&p.opp.id===e.id&&!p.elemental))
          pairs.push({mine,opp:e,elemental:false});
      });
    });
    return {pairs:[...new Map(pairs.map(p=>[`${p.mine.id}:${p.opp.id}:${p.elemental}`,p])).values()], tags:[...tagMap.values()]};
  },[team,opp,data.weaknesses,oppDebSet,ownBufSet]);

  const highlightOf=hero=>{
    const allies=teammates.filter(h=>h.id!==hero.id);
    const hasSyn=allies.some(a=>(hero.synergies||[]).includes(a.id)||(a.synergies||[]).includes(hero.id));
    const hasCtr=opponents.some(e=>(hero.counters||[]).includes(e.id));
    return hasSyn&&hasCtr?"both":hasSyn?"syn":hasCtr?"ctr":null;
  };

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",padding:"8px 10px",gap:6}}>
      <div style={{fontFamily:"Cinzel,serif",fontSize:10,color:T.gold,letterSpacing:3,flexShrink:0}}>{label}</div>

      {/* 3+2 slots + name list */}
      <div style={{flexShrink:0}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:4,marginBottom:4}}>
          {[0,1,2].map(i=>(
            <div key={i} style={{gridColumn:"span 2"}}>
              <Slot idx={i} hero={team[i]} team={teamKey} isActiveTeam={isActiveTeam} active={active} setActive={setActive} onRemove={onRemove} highlight={team[i]?highlightOf(team[i]):null} settings={data.settings}/>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:4,marginBottom:5}}>
          <div style={{gridColumn:"2 / span 2"}}><Slot idx={3} hero={team[3]} team={teamKey} isActiveTeam={isActiveTeam} active={active} setActive={setActive} onRemove={onRemove} highlight={team[3]?highlightOf(team[3]):null} settings={data.settings}/></div>
          <div style={{gridColumn:"4 / span 2"}}><Slot idx={4} hero={team[4]} team={teamKey} isActiveTeam={isActiveTeam} active={active} setActive={setActive} onRemove={onRemove} highlight={team[4]?highlightOf(team[4]):null} settings={data.settings}/></div>
        </div>
        {/* Hero name list below grid */}
        <div style={{background:T.bg,borderRadius:2,padding:"3px 4px",minHeight:16}}>
          {teammates.length===0
            ?<span style={{fontSize:8,color:T.dim,fontFamily:"Cinzel,serif"}}>— no heroes selected —</span>
            :<div style={{display:"flex",flexDirection:"column",gap:1}}>
              {team.map((h,i)=>h&&(
                <div key={i} style={{fontSize:9,fontFamily:"Cinzel,serif",color:T.text,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",lineHeight:1.5}}>
                  <span style={{color:T.dim,fontSize:8,marginRight:3}}>{i+1}.</span>{h.name||<em style={{color:T.dim}}>Unnamed</em>}
                </div>
              ))}
            </div>
          }
        </div>
      </div>

      {/* Analysis sections — vertical, 3-row visible then scroll */}
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:4,minHeight:0}}>

        <ASection title="BUFFS" color="#208888">
          {Object.entries(tBufCounts).map(([id,cnt])=>{const b=data.buffs.find(x=>x.id===id);if(!b)return null;return <AChip key={id} tag={b} count={cnt}/>;})  }
          {Object.keys(tBufCounts).length===0&&<AEmpty/>}
        </ASection>

        <ASection title="DEBUFFS" color="#a82860">
          {Object.entries(tDebCounts).map(([id,cnt])=>{const d=data.debuffs.find(x=>x.id===id);if(!d)return null;return <AChip key={id} tag={d} count={cnt}/>;})  }
          {Object.keys(tDebCounts).length===0&&<AEmpty/>}
        </ASection>

        <ASection title="SYNERGIES" color="#2a8050">
          {synPairs.map(([a,b],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:3}}>
              <Ico src={a.image} size={13} fallback={clsIcon(a.class,data.settings)}/>
              <span style={{fontSize:9,color:T.text,fontFamily:"Cinzel,serif",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name||"—"}</span>
              <span style={{fontSize:8,color:T.gold}}>✦</span>
              <Ico src={b.image} size={13} fallback={clsIcon(b.class,data.settings)}/>
              <span style={{fontSize:9,color:T.text,fontFamily:"Cinzel,serif",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name||"—"}</span>
            </div>
          ))}
          {synPairs.length===0&&<AEmpty/>}
        </ASection>

        <ASection title="STRENGTHS" color="#3a9a60">
          {strengthData.pairs.map((p,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:3}}>
              <Ico src={p.mine.image} size={13} fallback={clsIcon(p.mine.class,data.settings)}/>
              <span style={{fontSize:9,color:T.text,fontFamily:"Cinzel,serif",maxWidth:52,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.mine.name||"—"}</span>
              <span style={{fontSize:9,color:"#5aaa70"}}>▶</span>
              <Ico src={p.opp.image} size={13} fallback={clsIcon(p.opp.class,data.settings)}/>
              <span style={{fontSize:9,color:"#a0d0a8",fontFamily:"Cinzel,serif",maxWidth:52,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.opp.name||"—"}</span>
              {p.elemental && <LeafIcon size={10} color="#4cba60"/>}
              {!p.elemental && p.label&&<span style={{fontSize:7,color:"#3a9a60",fontFamily:"'Crimson Text',serif",fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:40}}>{p.label}</span>}
            </div>
          ))}
          {strengthData.tags.map(({tag,highlighted},i)=>(
            <div key={`t${i}`} className={highlighted?"hl":""} style={{display:"flex",alignItems:"center",gap:3,borderRadius:2,padding:"0 2px",transition:"all 0.2s"}}>
              <Ico src={tag.icon} size={12} fallback={tag.name?.[0]||"?"}/>
              <span style={{fontSize:9,color:highlighted?HIGHLIGHT:"#5aaa70",fontFamily:"'Crimson Text',serif",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:highlighted?700:400}}>{tag.name}</span>
              {highlighted&&<span style={{fontSize:9,color:HIGHLIGHT,flexShrink:0}}>★</span>}
            </div>
          ))}
          {strengthData.pairs.length===0&&strengthData.tags.length===0&&<AEmpty/>}
        </ASection>

        <ASection title="WEAKNESSES" color="#9a3030">
          {weaknessData.pairs.map(({mine,opp:e,elemental},i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:3}}>
              <Ico src={mine.image} size={13} fallback={clsIcon(mine.class,data.settings)}/>
              <span style={{fontSize:9,color:T.text,fontFamily:"Cinzel,serif",maxWidth:52,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mine.name||"—"}</span>
              <span style={{fontSize:9,color:"#9a3030"}}>◀</span>
              <Ico src={e.image} size={13} fallback={clsIcon(e.class,data.settings)}/>
              <span style={{fontSize:9,color:"#a06060",fontFamily:"Cinzel,serif",maxWidth:52,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name||"—"}</span>
              {elemental && <LeafIcon size={10} color="#4cba60"/>}
            </div>
          ))}
          {weaknessData.tags.map(({tag,highlighted},i)=>(
            <div key={`t${i}`} className={highlighted?"hl":""} style={{display:"flex",alignItems:"center",gap:3,borderRadius:2,padding:"0 2px",transition:"all 0.2s"}}>
              <Ico src={tag.icon} size={12} fallback={tag.name?.[0]||"?"}/>
              <span style={{fontSize:9,color:highlighted?HIGHLIGHT:"#a06060",fontFamily:"'Crimson Text',serif",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:highlighted?700:400}}>{tag.name}</span>
              {highlighted&&<span style={{fontSize:9,color:HIGHLIGHT,flexShrink:0}}>⚠</span>}
            </div>
          ))}
          {weaknessData.pairs.length===0&&weaknessData.tags.length===0&&<AEmpty/>}
        </ASection>

      </div>
    </div>
  );
}

function ASection({title,color,children}){
  const LINE=17;const SHOW=3;
  return(
    <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:3,flexShrink:0}}>
      <div style={{fontFamily:"Cinzel,serif",fontSize:8,color:color||T.sub,letterSpacing:1.5,padding:"3px 7px 2px",borderBottom:`1px solid ${T.border}22`}}>{title}</div>
      <div style={{maxHeight:LINE*SHOW+6,overflowY:"auto",padding:"3px 7px",display:"flex",flexDirection:"column",gap:2}}>{children}</div>
    </div>
  );
}
function AChip({tag,count}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:3}}>
      <Ico src={tag.icon} size={12} fallback={tag.name?.[0]||"?"}/>
      <span style={{fontSize:9,color:tag.color,fontFamily:"'Crimson Text',serif",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tag.name}</span>
      {count>1&&<span style={{fontSize:8,color:T.gold,fontFamily:"Cinzel,serif",flexShrink:0}}>×{count}</span>}
    </div>
  );
}
function AEmpty(){return <span style={{fontSize:9,color:T.dim,fontStyle:"italic",fontFamily:"'Crimson Text',serif"}}>—</span>;}

function Slot({idx,hero,team,isActiveTeam,active,setActive,onRemove,highlight,settings}){
  const isActive=isActiveTeam&&active.idx===idx;
  const gc=highlight==="both"?"both-glow":highlight==="syn"?"syn-glow":highlight==="ctr"?"ctr-glow":isActive?"active-slot":"";
  return(
    <div onClick={()=>setActive({team,idx})} className={gc} style={{aspectRatio:"1",background:hero?T.card:T.bg,border:`1px solid ${hero?T.border:T.dim}`,borderRadius:4,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"space-between",padding:"6px 3px 4px",cursor:"pointer",position:"relative",transition:"box-shadow 0.15s,border-color 0.15s",overflow:"hidden"}}>
      {hero&&<button onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();onRemove(team,idx);}} style={{position:"absolute",top:2,right:3,background:"none",border:"none",color:T.dim,fontSize:10,cursor:"pointer",lineHeight:1,padding:0}}>×</button>}
      {hero?(
        <>
          <Ico src={hero.image} size={44} fallback={clsIcon(hero.class,settings)}/>
          <div style={{fontFamily:"Cinzel,serif",fontSize:8,color:T.text,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",width:"100%",paddingTop:1}}>{hero.name||<span style={{color:T.dim}}>—</span>}</div>
        </>
      ):(
        <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontFamily:"Cinzel,serif",fontSize:10,color:isActive?T.gold:T.dim}}>{isActive?"·":"+"}</span>
        </div>
      )}
    </div>
  );
}

/* ═══ HEROES VIEW ═══ */
function HeroesView({data,onUpdate}){
  const [sort,setSort]=useState("latest");
  const [search,setSearch]=useState("");
  const [edit,setEdit]=useState(null);
  const [delConf,setDelConf]=useState(null);
  const list=useMemo(()=>sorted(data.heroes.filter(h=>!search||(h.name||"").toLowerCase().includes(search.toLowerCase())),sort),[data.heroes,sort,search]);
  function saveHero(hero){const exists=data.heroes.some(h=>h.id===hero.id);const heroes=exists?data.heroes.map(h=>h.id===hero.id?hero:h):[...data.heroes,{...hero,id:uid(),createdAt:Date.now()}];onUpdate({...data,heroes});setEdit(null);}
  function doDelete(id){onUpdate({...data,heroes:data.heroes.filter(h=>h.id!==id)});setDelConf(null);}
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search heroes…" style={{...INP,width:180}}/>
        <SortRow sort={sort} setSort={setSort}/>
        <span style={{fontSize:11,color:T.dim,fontFamily:"'Crimson Text',serif",marginLeft:4}}>{data.heroes.length} heroes</span>
        <Btn variant="primary" onClick={()=>setEdit(blankHero())} style={{marginLeft:"auto"}}>+ Add Hero</Btn>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8,alignContent:"start"}}>
        {list.map(hero=>(
          <div key={hero.id} className="card-hov" style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:5,padding:"10px 11px",transition:"border-color 0.15s"}}>
            <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"flex-start"}}>
              <Ico src={hero.image} size={52} fallback={clsIcon(hero.class,data.settings)}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"Cinzel,serif",color:T.gold,fontSize:12,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{hero.name||<span style={{color:T.dim,fontStyle:"italic"}}>Unnamed</span>}</div>
                <div style={{fontSize:10,color:elColor(hero.element),fontFamily:"Cinzel,serif",marginBottom:3}}>{EL_META[hero.element]?.label} · {CL_META[hero.class]?.label}</div>
                <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{hero.roles.map(r=><span key={r} style={{fontSize:8,padding:"1px 4px",borderRadius:2,background:RC[r]+"22",color:RC[r]}}>{r}</span>)}</div>
              </div>
            </div>
            {hero.note&&<div style={{fontSize:12,color:T.sub,fontStyle:"italic",marginBottom:6,fontFamily:"'Crimson Text',serif"}}>{hero.note}</div>}
            {hero.buffs.length>0&&<div style={{display:"flex",gap:2,flexWrap:"wrap",marginBottom:3}}>{hero.buffs.map(id=>{const b=data.buffs.find(x=>x.id===id);return b&&<span key={id} style={{fontSize:9,padding:"1px 4px",borderRadius:2,background:b.color+"22",color:b.color,fontFamily:"'Crimson Text',serif"}}>{b.name}</span>;})}</div>}
            {hero.debuffs.length>0&&<div style={{display:"flex",gap:2,flexWrap:"wrap",marginBottom:4}}>{hero.debuffs.map(id=>{const d=data.debuffs.find(x=>x.id===id);return d&&<span key={id} style={{fontSize:9,padding:"1px 4px",borderRadius:2,background:d.color+"22",color:d.color,fontFamily:"'Crimson Text',serif"}}>{d.name}</span>;})}</div>}
            <div style={{display:"flex",gap:5,marginTop:6}}>
              <Btn onClick={()=>setEdit({...hero})}>Edit</Btn>
              {delConf===hero.id
                ?<><Btn variant="danger" onClick={()=>doDelete(hero.id)}>Confirm</Btn><Btn onClick={()=>setDelConf(null)}>Cancel</Btn></>
                :<Btn variant="danger" onClick={e=>{e.stopPropagation();setDelConf(hero.id);}}>Delete</Btn>
              }
            </div>
          </div>
        ))}
        {list.length===0&&<div style={{gridColumn:"1/-1",textAlign:"center",color:T.dim,fontSize:13,fontStyle:"italic",padding:32,fontFamily:"'Crimson Text',serif"}}>No heroes yet. Add one above.</div>}
      </div>
      {edit&&<HeroModal hero={edit} data={data} onSave={saveHero} onClose={()=>setEdit(null)}/>}
    </div>
  );
}

/* ═══ TAGS VIEW ═══ */
function TagsView({data,onUpdate}){
  const [sort,setSort]=useState("latest");
  const [edit,setEdit]=useState(null);
  const [delConf,setDelConf]=useState(null);
  const [searches,setSearches]=useState({buffs:"",debuffs:"",strengths:"",weaknesses:""});
  function saveTag(type,tag){const arr=[...data[type]];const idx=arr.findIndex(t=>t.id===tag.id);if(idx>=0)arr[idx]=tag;else arr.push({...tag,id:uid(),createdAt:Date.now()});onUpdate({...data,[type]:arr});setEdit(null);}
  function doDelete(type,id){onUpdate({...data,[type]:data[type].filter(t=>t.id!==id)});setDelConf(null);}
  const SECS=[
    {key:"buffs",    label:"BUFFS",     color:"#208888",desc:"Buffs heroes can provide to allies"},
    {key:"debuffs",  label:"DEBUFFS",   color:"#a82860",desc:"Debuffs heroes can apply to enemies"},
    {key:"strengths",label:"STRENGTHS", color:"#3a7a50",desc:"Resistances / advantages — link buffs or debuffs to activate in Draft"},
    {key:"weaknesses",label:"WEAKNESSES",color:"#7a3030",desc:"Vulnerabilities — link buffs or debuffs to expose in Draft"},
  ];
  return(
    <div style={{height:"100%",overflowY:"auto",padding:"14px 18px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <span style={{fontSize:12,color:T.sub,fontStyle:"italic",fontFamily:"'Crimson Text',serif"}}>Tags are labels assigned to heroes. Strengths and Weaknesses link to buffs/debuffs for automatic Draft analysis.</span>
        <SortRow sort={sort} setSort={setSort}/>
      </div>
      {SECS.map(({key,label,color,desc})=>{
        const filtered=sorted(data[key],sort).filter(t=>!searches[key]||(t.name||"").toLowerCase().includes(searches[key].toLowerCase()));
        return(
          <div key={key} style={{marginBottom:24}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontFamily:"Cinzel,serif",fontSize:10,color,letterSpacing:2}}>{label}</span>
              <span style={{fontSize:12,color:T.dim,fontStyle:"italic",fontFamily:"'Crimson Text',serif"}}>{desc}</span>
              <Btn onClick={()=>setEdit({type:key,tag:key==="strengths"||key==="weaknesses"?blankSW():blankTag()})} style={{marginLeft:"auto"}}>+ Add</Btn>
            </div>
            <div style={{marginBottom:6}}>
              <input value={searches[key]} onChange={e=>setSearches(s=>({...s,[key]:e.target.value}))} placeholder={`Search ${label.toLowerCase()}…`} style={{...INP,fontSize:11,width:220}}/>
            </div>
            <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
              {filtered.map(tag=>(
                <div key={tag.id} style={{background:T.card,border:`1px solid ${tag.color||color}33`,borderRadius:4,padding:"6px 10px",display:"flex",alignItems:"center",gap:8}}>
                  <Ico src={tag.icon} size={22} fallback={tag.name?.[0]||"?"}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,color:tag.color||color,fontFamily:"Cinzel,serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tag.name||<span style={{color:T.dim,fontStyle:"italic"}}>Unnamed</span>}</div>
                    {((tag.linkedDebuffs||[]).length>0||(tag.linkedBuffs||[]).length>0)&&(
                      <div style={{fontSize:10,color:T.dim,fontFamily:"'Crimson Text',serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {(tag.linkedDebuffs||[]).length>0&&<span>Debuffs: {tag.linkedDebuffs.map(id=>data.debuffs.find(d=>d.id===id)?.name).filter(Boolean).join(", ")}</span>}
                        {(tag.linkedBuffs||[]).length>0&&<span style={{marginLeft:8}}>Buffs: {tag.linkedBuffs.map(id=>data.buffs.find(b=>b.id===id)?.name).filter(Boolean).join(", ")}</span>}
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",gap:4,flexShrink:0}}>
                    <Btn onClick={()=>setEdit({type:key,tag:{...tag,linkedBuffs:[...(tag.linkedBuffs||[])],linkedDebuffs:[...(tag.linkedDebuffs||[])]}})}>Edit</Btn>
                    {delConf===tag.id
                      ?<><Btn variant="danger" onClick={()=>doDelete(key,tag.id)}>Confirm</Btn><Btn onClick={()=>setDelConf(null)}>Cancel</Btn></>
                      :<Btn variant="danger" onClick={()=>setDelConf(tag.id)}>Delete</Btn>
                    }
                  </div>
                </div>
              ))}
              {filtered.length===0&&<span style={{fontSize:12,color:T.dim,fontStyle:"italic",fontFamily:"'Crimson Text',serif",padding:"4px 0"}}>{data[key].length===0?"None yet — add one above.":"No matches."}</span>}
            </div>
          </div>
        );
      })}
      {edit&&<TagModal type={edit.type} tag={edit.tag} data={data} onSave={saveTag} onClose={()=>setEdit(null)}/>}
    </div>
  );
}

/* ═══ SETTINGS VIEW ═══ */
function SettingsView({data,onUpdate,onImport}){
  const fileRef=useRef();
  const [importErr,setImportErr]=useState("");
  function setClassIcon(k,v){onUpdate({...data,settings:{...data.settings,classIcons:{...data.settings.classIcons,[k]:v}}});}
  function setElIcon(k,v){onUpdate({...data,settings:{...data.settings,elementIcons:{...data.settings.elementIcons,[k]:v}}});}
  async function handleImport(e){const f=e.target.files[0];if(!f)return;try{const d=await importXLSX(f);onImport(d);setImportErr("");}catch(err){setImportErr("Failed: "+err.message);}e.target.value="";}
  return(
    <div style={{height:"100%",overflowY:"auto",padding:"20px 24px"}}>
      <section style={{marginBottom:32}}>
        <div style={{fontFamily:"Cinzel,serif",fontSize:11,color:T.gold,letterSpacing:2,marginBottom:10}}>DATA EXPORT / IMPORT</div>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:5,padding:"14px 16px",maxWidth:500}}>
          <p style={{fontFamily:"'Crimson Text',serif",fontSize:13,color:T.sub,marginBottom:12,lineHeight:1.6}}>Export your complete data — heroes, tags, and icons — to an Excel file. Import to restore everything.</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Btn variant="primary" onClick={()=>exportXLSX(data)}>Export to Excel</Btn>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={handleImport}/>
            <Btn onClick={()=>fileRef.current.click()}>Import from Excel</Btn>
          </div>
          {importErr&&<div style={{marginTop:8,fontSize:12,color:"#c06060",fontFamily:"'Crimson Text',serif"}}>{importErr}</div>}
        </div>
      </section>
      <section style={{marginBottom:28}}>
        <div style={{fontFamily:"Cinzel,serif",fontSize:11,color:T.gold,letterSpacing:2,marginBottom:4}}>CLASS ICONS</div>
        <p style={{fontSize:12,color:T.dim,fontFamily:"'Crimson Text',serif",marginBottom:10}}>No icon = first letter(s) of class name shown as fallback.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
          {Object.entries(CL_META).map(([k,v])=>(
            <div key={k} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:4,padding:"10px 12px"}}>
              <div style={{fontFamily:"Cinzel,serif",fontSize:10,color:T.sub,letterSpacing:1,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                <Ico src={data.settings.classIcons?.[k]||""} size={16} fallback={clsIcon(k,data.settings)}/>{v.label}
              </div>
              <ImagePicker value={data.settings.classIcons?.[k]||""} onChange={val=>setClassIcon(k,val)}/>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div style={{fontFamily:"Cinzel,serif",fontSize:11,color:T.gold,letterSpacing:2,marginBottom:4}}>ELEMENT ICONS</div>
        <p style={{fontSize:12,color:T.dim,fontFamily:"'Crimson Text',serif",marginBottom:10}}>No icon = first letter of element name shown as fallback.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
          {Object.entries(EL_META).map(([k,v])=>(
            <div key={k} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:4,padding:"10px 12px"}}>
              <div style={{fontFamily:"Cinzel,serif",fontSize:10,color:v.color,letterSpacing:1,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                <Ico src={data.settings.elementIcons?.[k]||""} size={16} fallback={elIcon(k,data.settings)}/>{v.label}
              </div>
              <ImagePicker value={data.settings.elementIcons?.[k]||""} onChange={val=>setElIcon(k,val)}/>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ═══ ROOT APP ═══ */
const TAB_ICONS = { draft:"⚔", heroes:"♞", tags:"🏷", settings:"⚙" };

export default function App(){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("draft");
  const [menuOpen,setMenuOpen]=useState(false);
  const menuRef=useRef();

  useEffect(()=>{load().then(d=>{setData(d);setLoading(false)});},[]);
  const update=useCallback(d=>{setData(d);save(d);},[]);

  // close menu on outside click
  useEffect(()=>{
    const h=e=>{if(menuRef.current&&!menuRef.current.contains(e.target))setMenuOpen(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.gold,fontFamily:"Cinzel,serif",fontSize:13,letterSpacing:4}}>LOADING</div>;

  const TABS=[["draft","DRAFT"],["heroes","HEROES"],["tags","TAGS"],["settings","SETTINGS"]];
  const TAB_LABELS = { draft:"DRAFT", heroes:"HEROES", tags:"TAGS", settings:"SETTINGS" };

  return(
    <div style={{background:T.bg,minHeight:"100vh",color:T.text,fontFamily:"'Crimson Text',serif",display:"flex",flexDirection:"column"}}>
      <style>{GS}</style>

      <header style={{background:T.panel,borderBottom:`1px solid ${T.border}`,padding:"0 14px",display:"flex",alignItems:"center",height:52,flexShrink:0,gap:10,overflow:"visible",position:"relative",zIndex:200}}>

        {/* Title */}
        <div style={{flexShrink:0,minWidth:0}}>
          <div style={{fontFamily:"Cinzel,serif",color:T.gold,fontSize:12,letterSpacing:2,lineHeight:1.2,whiteSpace:"nowrap"}}>EPIC SEVEN · WORLD ARENA</div>
          <div style={{fontFamily:"Cinzel,serif",color:T.dim,fontSize:6.5,letterSpacing:1.5,lineHeight:1.3,whiteSpace:"nowrap"}}>FANMADE / NON-OFFICIAL</div>
        </div>

        {/* Current tab label — fills middle space */}
        <div style={{flex:1,textAlign:"center",fontFamily:"Cinzel,serif",fontSize:10,color:T.sub,letterSpacing:2,whiteSpace:"nowrap"}}>
          {TAB_LABELS[tab]}
        </div>

        {/* Right side: hero count + hamburger */}
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontFamily:"'Crimson Text',serif",fontSize:11,color:T.dim,whiteSpace:"nowrap"}}>
            {data.heroes.length} heroes
          </span>

          {/* Hamburger button */}
          <div ref={menuRef} style={{position:"relative"}}>
            <button
              onClick={()=>setMenuOpen(v=>!v)}
              style={{background:menuOpen?T.gold:T.card,border:`1px solid ${menuOpen?T.gold:T.border}`,color:menuOpen?T.bg:T.sub,width:38,height:38,borderRadius:4,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,cursor:"pointer",flexShrink:0,padding:0}}
            >
              {menuOpen
                ? <span style={{fontSize:16,lineHeight:1,fontFamily:"Cinzel,serif",color:menuOpen?T.bg:T.sub}}>✕</span>
                : <>
                    <span style={{display:"block",width:18,height:2,background:T.sub,borderRadius:1}}/>
                    <span style={{display:"block",width:18,height:2,background:T.sub,borderRadius:1}}/>
                    <span style={{display:"block",width:18,height:2,background:T.sub,borderRadius:1}}/>
                  </>
              }
            </button>

            {/* Dropdown menu */}
            {menuOpen&&(
              <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:T.panel,border:`1px solid ${T.border}`,borderRadius:5,overflow:"hidden",boxShadow:"0 8px 32px #000a",minWidth:160,zIndex:9999}}>
                {TABS.map(([v,l])=>(
                  <button key={v} onClick={()=>{setTab(v);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:tab===v?T.gold+"18":"none",border:"none",borderBottom:`1px solid ${T.border}`,color:tab===v?T.gold:T.sub,padding:"13px 18px",fontFamily:"Cinzel,serif",fontSize:11,letterSpacing:1.5,cursor:"pointer",textAlign:"left",transition:"background 0.1s"}}>
                    <span style={{fontSize:14,flexShrink:0}}>{TAB_ICONS[v]}</span>
                    <span>{l}</span>
                    {tab===v&&<span style={{marginLeft:"auto",color:T.gold,fontSize:10}}>●</span>}
                  </button>
                ))}
                <div style={{padding:"8px 18px",fontFamily:"'Crimson Text',serif",fontSize:10,color:T.dim}}>
                  auto-saved
                </div>
              </div>
            )}
          </div>
        </div>

      </header>

      <main style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {tab==="draft"    &&<DraftView    data={data} onUpdate={update}/>}
        {tab==="heroes"   &&<HeroesView   data={data} onUpdate={update}/>}
        {tab==="tags"     &&<TagsView     data={data} onUpdate={update}/>}
        {tab==="settings" &&<SettingsView data={data} onUpdate={update} onImport={d=>{setData(d);save(d);setTab("heroes");}}/>}
      </main>
    </div>
  );
}