const ROOT_NAME='Construction Dashboard'; const PROJECT='Lincoln';
let _svc={token:null,exp:0};
async function serviceToken(){ if(_svc.token&&Date.now()<_svc.exp-60000) return _svc.token; const body=new URLSearchParams({grant_type:'client_credentials',client_id:process.env.BOX_SVC_CLIENT_ID,client_secret:process.env.BOX_SVC_CLIENT_SECRET,box_subject_type:'enterprise',box_subject_id:process.env.BOX_ENTERPRISE_ID}); const r=await fetch('https://api.box.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); const d=await r.json(); if(!d.access_token) return null; _svc={token:d.access_token,exp:Date.now()+(d.expires_in||3600)*1000}; return _svc.token; }
const H=t=>({Authorization:'Bearer '+t});
async function list(t,id){ const r=await fetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`,{headers:H(t)}); return r.ok?(await r.json()).entries||[]:[]; }
const csvEsc=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
function parseCSV(text){ if(!text||!text.trim()) return {headers:[],rows:[]}; const lines=text.replace(/\r/g,'').split('\n').filter(l=>l.length); const pl=line=>{const res=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){res.push(cur.trim());cur='';}else cur+=c;}res.push(cur.trim());return res;}; const headers=pl(lines[0]); const rows=lines.slice(1).map(l=>{const v=pl(l),o={};headers.forEach((h,i)=>o[h]=v[i]!==undefined?v[i]:'');return o;}); return {headers,rows}; }
function toCSV(headers,rows){ return headers.join(',')+'\n'+rows.map(r=>headers.map(h=>csvEsc(r[h])).join(',')).join('\n')+'\n'; }
function b64ToBlob(b64,mime){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return new Blob([arr],{type:mime}); }
async function findFile(t,folderId,name){ return (await list(t,folderId)).find(i=>i.type==='file'&&i.name===name); }
async function findCSV(t,folderId){ return (await list(t,folderId)).find(i=>i.type==='file'&&i.name.toLowerCase().endsWith('.csv')); }
async function upload(t,folderId,name,text,mime){ const ex=await findFile(t,folderId,name); const form=new FormData(); form.append('attributes',JSON.stringify(ex?{name}:{name,parent:{id:String(folderId)}})); form.append('file',b64ToBlob(btoa(unescape(encodeURIComponent(text))),mime),name); const url=ex?`https://upload.box.com/api/2.0/files/${ex.id}/content`:'https://upload.box.com/api/2.0/files/content'; const r=await fetch(url,{method:'POST',headers:H(t),body:form}); return r.ok; }

const WORKFLOWS={
  rfi:[{name:'Fidevia CM Review',person:'Andre Martin',parallel:false},{name:'Architect Response',person:'Laura Simmons',parallel:false},{name:'Engineer Review',person:'Tom Becker',parallel:true},{name:'Contractor Close-out',person:'John Reyes',parallel:false}],
  co:[{name:'Fidevia CM Review',person:'Andre Martin',parallel:false},{name:'Owner Approval',person:'Lincoln School District',parallel:false}],
  sub:[{name:'Fidevia CM Review',person:'Andre Martin',parallel:false},{name:'Architect Review',person:'Laura Simmons',parallel:false},{name:'Engineer Review',person:'Aisha Rahman',parallel:true}],
  payapp:[{name:'Fidevia CM Review',person:'Andre Martin',parallel:false},{name:'Owner Approval',person:'Lincoln School District',parallel:false}]
};

export default async (req)=>{
  const url=new URL(req.url); if(url.searchParams.get('token')!=='fidevia-wf-3d7') return new Response('nope',{status:403});
  const t=await serviceToken(); if(!t) return new Response('no token',{status:500});
  const root=(await list(t,'0')).find(i=>i.type==='folder'&&i.name===ROOT_NAME); if(!root) return new Response('no root');
  const proj=(await list(t,root.id)).find(i=>i.type==='folder'&&i.name.includes(PROJECT)); if(!proj) return new Response('no lincoln');
  const log=[];
  // 1. config
  const cfgFile=await findFile(t,proj.id,'Project Info.json');
  let cfg={}; if(cfgFile){ try{ cfg=JSON.parse(await (await fetch(`https://api.box.com/2.0/files/${cfgFile.id}/content`,{headers:H(t)})).text())||{}; }catch(e){} }
  cfg.workflows=WORKFLOWS; if(!cfg.projectAdmin) cfg.projectAdmin='ccicala@fidevia.com';
  await upload(t,proj.id,'Project Info.json',JSON.stringify(cfg,null,2),'application/json');
  log.push('workflows saved');
  // 2. put items at varying stages
  const subs=await list(t,proj.id); const gf=p=>{const f=subs.find(i=>i.type==='folder'&&i.name.startsWith(p));return f?f.id:null;};
  for(const [key,pfx,max] of [['rfi','01',4],['co','02',2],['sub','03',3]]){
    const modF=gf(pfx); if(!modF) continue; const csv=await findCSV(t,modF); if(!csv) continue;
    const {headers,rows}=parseCSV(await (await fetch(`https://api.box.com/2.0/files/${csv.id}/content`,{headers:H(t)})).text());
    if(!headers.includes('Workflow Step')) headers.push('Workflow Step');
    if(!headers.includes('Workflow Status')) headers.push('Workflow Status');
    rows.forEach((r,i)=>{ const stage=i%(max+1); if(stage>=max){ r['Workflow Step']=String(max-1); r['Workflow Status']='Complete'; } else { r['Workflow Step']=String(stage); r['Workflow Status']='In Review'; } });
    await upload(t,modF,csv.name,toCSV(headers,rows),'text/csv');
    log.push(key+': '+rows.length+' staged');
  }
  return new Response(JSON.stringify({ok:true,log}),{headers:{'Content-Type':'application/json'}});
};
