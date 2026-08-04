const ROOT_NAME='Construction Dashboard'; const PROJECT='Lincoln';
const PDF="JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pi9Db250ZW50cyA0IDAgUj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNzA+PnN0cmVhbQpCVCAvRjEgMTggVGYgNzIgNzAwIFRkIChGSURFVklBIC0gUkZJIERvY3VtZW50KSBUaiBFVAplbmRzdHJlYW0gZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUi9TaXplIDY+PgolJUVPRg==";
let _svc={token:null,exp:0};
async function serviceToken(){ if(_svc.token&&Date.now()<_svc.exp-60000) return _svc.token; const body=new URLSearchParams({grant_type:'client_credentials',client_id:process.env.BOX_SVC_CLIENT_ID,client_secret:process.env.BOX_SVC_CLIENT_SECRET,box_subject_type:'enterprise',box_subject_id:process.env.BOX_ENTERPRISE_ID}); const r=await fetch('https://api.box.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); const d=await r.json(); if(!d.access_token) return null; _svc={token:d.access_token,exp:Date.now()+(d.expires_in||3600)*1000}; return _svc.token; }
const H=t=>({Authorization:'Bearer '+t});
async function list(t,id){ const r=await fetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`,{headers:H(t)}); return r.ok?(await r.json()).entries||[]:[]; }
const csvEsc=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
function parseCSV(text){ if(!text||!text.trim()) return {headers:[],rows:[]}; const lines=text.replace(/\r/g,'').split('\n').filter(l=>l.length); const pl=line=>{const res=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){res.push(cur.trim());cur='';}else cur+=c;}res.push(cur.trim());return res;}; const headers=pl(lines[0]); const rows=lines.slice(1).map(l=>{const v=pl(l),o={};headers.forEach((h,i)=>o[h]=v[i]!==undefined?v[i]:'');return o;}); return {headers,rows}; }
function toCSV(headers,rows){ return headers.join(',')+'\n'+rows.map(r=>headers.map(h=>csvEsc(r[h])).join(',')).join('\n')+'\n'; }
function b64ToBlob(b64,mime){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return new Blob([arr],{type:mime}); }
async function findCSV(t,folderId){ return (await list(t,folderId)).find(i=>i.type==='file'&&i.name.toLowerCase().endsWith('.csv')); }
async function ensureFolder(t,parent,name){ const items=await list(t,parent); const f=items.find(i=>i.type==='folder'&&i.name===name); if(f) return f.id; const r=await fetch('https://api.box.com/2.0/folders',{method:'POST',headers:{...H(t),'Content-Type':'application/json'},body:JSON.stringify({name,parent:{id:String(parent)}})}); if(r.ok) return (await r.json()).id; if(r.status===409){ const it=await list(t,parent); const f2=it.find(i=>i.type==='folder'&&i.name===name); if(f2) return f2.id; } return null; }
async function uploadFile(t,folder,name,b64,mime){ const items=await list(t,folder); const ex=items.find(i=>i.type==='file'&&i.name===name); if(ex) return ex.id; const form=new FormData(); form.append('attributes',JSON.stringify({name,parent:{id:String(folder)}})); form.append('file',b64ToBlob(b64,mime),name); const r=await fetch('https://upload.box.com/api/2.0/files/content',{method:'POST',headers:H(t),body:form}); if(!r.ok) return ''; const d=await r.json(); return (d.entries?d.entries[0]:d).id||''; }
async function writeCSV(t,folderId,name,headers,rows){ const ex=await findCSV(t,folderId); const out=toCSV(headers,rows); const form=new FormData(); form.append('attributes',JSON.stringify(ex?{name}:{name,parent:{id:String(folderId)}})); form.append('file',b64ToBlob(btoa(unescape(encodeURIComponent(out))),'text/csv'),name); const url=ex?`https://upload.box.com/api/2.0/files/${ex.id}/content`:'https://upload.box.com/api/2.0/files/content'; const r=await fetch(url,{method:'POST',headers:H(t),body:form}); return r.ok; }

export default async (req)=>{
  const url=new URL(req.url); if(url.searchParams.get('token')!=='fidevia-rfiflow-8t3') return new Response('nope',{status:403});
  const t=await serviceToken(); if(!t) return new Response('no token',{status:500});
  const root=(await list(t,'0')).find(i=>i.type==='folder'&&i.name===ROOT_NAME); if(!root) return new Response('no root');
  const proj=(await list(t,root.id)).find(i=>i.type==='folder'&&i.name.includes(PROJECT)); if(!proj) return new Response('no lincoln');
  const subs=await list(t,proj.id); const rfiF=(subs.find(i=>i.type==='folder'&&i.name.startsWith('01'))||{}).id; if(!rfiF) return new Response('no rfi folder');
  const csv=await findCSV(t,rfiF); if(!csv) return new Response('no rfi csv');
  const txt=await (await fetch(`https://api.box.com/2.0/files/${csv.id}/content`,{headers:H(t)})).text();
  const {headers,rows}=parseCSV(txt);
  if(!headers.includes('Version History')) headers.push('Version History');
  const row=rows.find(r=>String(r['RFI #'])==='RFI-001')||rows[0]; if(!row) return new Response('no rfi row');
  const num=row['RFI #']||'RFI-001';
  const itemF=await ensureFolder(t,rfiF,'RFI #'+num);
  const f1=await uploadFile(t,itemF,num+' question.pdf',PDF,'application/pdf');
  const f2=await uploadFile(t,itemF,num+' response rev1.pdf',PDF,'application/pdf');
  const f3=await uploadFile(t,itemF,num+' response rev2.pdf',PDF,'application/pdf');
  const vh=[
    {v:1,fileId:f1,fileName:num+' question.pdf',status:'Open',date:'2026-06-01',by:'Summit Builders',note:'RFI submitted — clarification needed on the window head flashing detail at the sill.'},
    {v:2,fileId:f2,fileName:num+' response rev1.pdf',status:'Answered',date:'2026-06-05',by:'Meridian Architects',note:'See attached sketch SK-12 clarifying the head flashing detail.'},
    {v:3,fileId:'',fileName:'',status:'Open',date:'2026-06-08',by:'Summit Builders',note:'Thank you. Does SK-12 also govern the jamb condition?'},
    {v:4,fileId:f3,fileName:num+' response rev2.pdf',status:'Answered',date:'2026-06-12',by:'Meridian Architects',note:'Yes — the jamb follows the same detail. Proceed as shown on rev2.'},
    {v:5,fileId:'',fileName:'',status:'Closed',date:'2026-06-15',by:'Summit Builders',note:'Resolved. Closing RFI.'}
  ];
  row['Version History']=JSON.stringify(vh);
  row['Status']='Closed';
  if('Submitted By' in row) row['Submitted By']='Summit Builders';
  if('Date Submitted' in row) row['Date Submitted']='2026-06-01';
  if('Date Closed' in row) row['Date Closed']='2026-06-15';
  if('Response Summary' in row) row['Response Summary']='Head and jamb flashing per sketch SK-12 (see response rev2).';
  if('Attachment File ID' in row) row['Attachment File ID']=f3;
  if('Attachment Name' in row) row['Attachment Name']=num+' response rev2.pdf';
  if('Assigned To' in row) row['Assigned To']='Meridian Architects';
  await writeCSV(t,rfiF,csv.name,headers,rows);
  return new Response(JSON.stringify({ok:true,rfi:num,files:[f1,f2,f3]}),{headers:{'Content-Type':'application/json'}});
};
