const ROOT_NAME='Construction Dashboard'; const PROJECT='Lincoln';
const CONTRACTORS=['Summit Builders','Comfort Systems','AH Plumbing','Voltage Electric'];
let _svc={token:null,exp:0};
async function serviceToken(){ if(_svc.token&&Date.now()<_svc.exp-60000) return _svc.token; const body=new URLSearchParams({grant_type:'client_credentials',client_id:process.env.BOX_SVC_CLIENT_ID,client_secret:process.env.BOX_SVC_CLIENT_SECRET,box_subject_type:'enterprise',box_subject_id:process.env.BOX_ENTERPRISE_ID}); const r=await fetch('https://api.box.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); const d=await r.json(); if(!d.access_token) return null; _svc={token:d.access_token,exp:Date.now()+(d.expires_in||3600)*1000}; return _svc.token; }
const H=t=>({Authorization:'Bearer '+t});
async function list(t,id){ const r=await fetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`,{headers:H(t)}); return r.ok?(await r.json()).entries||[]:[]; }
const csvEsc=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
function parseCSV(text){ if(!text||!text.trim()) return {headers:[],rows:[]}; const lines=text.replace(/\r/g,'').split('\n').filter(l=>l.length); const pl=line=>{const res=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){res.push(cur.trim());cur='';}else cur+=c;}res.push(cur.trim());return res;}; const headers=pl(lines[0]); const rows=lines.slice(1).map(l=>{const v=pl(l),o={};headers.forEach((h,i)=>o[h]=v[i]!==undefined?v[i]:'');return o;}); return {headers,rows}; }
function toCSV(headers,rows){ return headers.join(',')+'\n'+rows.map(r=>headers.map(h=>csvEsc(r[h])).join(',')).join('\n')+'\n'; }
function b64ToBlob(b64,mime){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return new Blob([arr],{type:mime}); }
async function findCSV(t,folderId){ return (await list(t,folderId)).find(i=>i.type==='file'&&i.name.toLowerCase().endsWith('.csv')); }
async function writeCSV(t,folderId,name,headers,rows){ const ex=await findCSV(t,folderId); const out=toCSV(headers,rows); const form=new FormData(); form.append('attributes',JSON.stringify(ex?{name}:{name,parent:{id:String(folderId)}})); form.append('file',b64ToBlob(btoa(unescape(encodeURIComponent(out))),'text/csv'),name); const url=ex?`https://upload.box.com/api/2.0/files/${ex.id}/content`:'https://upload.box.com/api/2.0/files/content'; const r=await fetch(url,{method:'POST',headers:H(t),body:form}); return r.ok; }

export default async (req)=>{
  const url=new URL(req.url); if(url.searchParams.get('token')!=='fidevia-num-9c2') return new Response('nope',{status:403});
  const t=await serviceToken(); if(!t) return new Response('no token',{status:500});
  const root=(await list(t,'0')).find(i=>i.type==='folder'&&i.name===ROOT_NAME); if(!root) return new Response('no root');
  const proj=(await list(t,root.id)).find(i=>i.type==='folder'&&i.name.includes(PROJECT)); if(!proj) return new Response('no lincoln');
  const subs=await list(t,proj.id); const gf=p=>{const f=subs.find(i=>i.type==='folder'&&i.name.startsWith(p));return f?f.id:null;};
  const log=[];
  for(const [key,pfx,label,idField] of [['rfi','01','RFI','RFI #'],['co','02','CO','CO #'],['sub','03','Submittal','Submittal #']]){
    const modF=gf(pfx); if(!modF) continue; const csv=await findCSV(t,modF); if(!csv) continue;
    const {headers,rows}=parseCSV(await (await fetch(`https://api.box.com/2.0/files/${csv.id}/content`,{headers:H(t)})).text());
    if(!headers.includes('Company')) headers.push('Company');
    const seq={};
    rows.forEach((r,i)=>{ let comp=r['Company']; if(!comp){ const by=(r['Submitted By']||r['Submitted By (Sub)']||'').toLowerCase(); comp=CONTRACTORS.find(c=>by.includes(c.toLowerCase()))||CONTRACTORS[i%CONTRACTORS.length]; } r['Company']=comp; seq[comp]=(seq[comp]||0)+1; r[idField]=label+'-'+String(seq[comp]).padStart(3,'0')+'_'+comp; });
    await writeCSV(t,modF,csv.name,headers,rows);
    log.push(key+': '+rows.length+' renumbered');
  }
  return new Response(JSON.stringify({ok:true,log}),{headers:{'Content-Type':'application/json'}});
};
