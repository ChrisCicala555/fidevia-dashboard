const ROOT_NAME='Construction Dashboard'; const PROJECT='Lincoln';
const PDF="JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNjEyIDc5Ml0vUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pi9Db250ZW50cyA0IDAgUj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNjA+PnN0cmVhbQpCVCAvRjEgMTggVGYgNzIgNzAwIFRkIChGSURFVklBIC0gQ29udHJhY3RvciBGaWxlKSBUaiBFVAplbmRzdHJlYW0gZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUi9TaXplIDY+PgolJUVPRg==";
import { getStore } from '@netlify/blobs';
let _svc={token:null,exp:0};
async function serviceToken(){ if(_svc.token&&Date.now()<_svc.exp-60000) return _svc.token; const body=new URLSearchParams({grant_type:'client_credentials',client_id:process.env.BOX_SVC_CLIENT_ID,client_secret:process.env.BOX_SVC_CLIENT_SECRET,box_subject_type:'enterprise',box_subject_id:process.env.BOX_ENTERPRISE_ID}); const r=await fetch('https://api.box.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); const d=await r.json(); if(!d.access_token) return null; _svc={token:d.access_token,exp:Date.now()+(d.expires_in||3600)*1000}; return _svc.token; }
const H=t=>({Authorization:'Bearer '+t});
async function list(t,id){ const r=await fetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`,{headers:H(t)}); return r.ok?(await r.json()).entries||[]:[]; }
const csvEsc=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
function toCSV(headers,rows){ return headers.join(',')+'\n'+rows.map(r=>headers.map(h=>csvEsc(r[h])).join(',')).join('\n')+'\n'; }
function b64ToBlob(b64,mime){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return new Blob([arr],{type:mime}); }
async function findCSV(t,folderId,name){ return (await list(t,folderId)).find(i=>i.type==='file'&&i.name===name); }
async function ensureFolder(t,parent,name){ const items=await list(t,parent); const f=items.find(i=>i.type==='folder'&&i.name===name); if(f) return f.id; const r=await fetch('https://api.box.com/2.0/folders',{method:'POST',headers:{...H(t),'Content-Type':'application/json'},body:JSON.stringify({name,parent:{id:String(parent)}})}); if(r.ok) return (await r.json()).id; if(r.status===409){ const it=await list(t,parent); const f2=it.find(i=>i.type==='folder'&&i.name===name); if(f2) return f2.id; } return null; }
async function uploadFile(t,folder,name,b64,mime){ const items=await list(t,folder); const ex=items.find(i=>i.type==='file'&&i.name===name); if(ex) return ex.id; const form=new FormData(); form.append('attributes',JSON.stringify({name,parent:{id:String(folder)}})); form.append('file',b64ToBlob(b64,mime),name); const r=await fetch('https://upload.box.com/api/2.0/files/content',{method:'POST',headers:H(t),body:form}); if(!r.ok) return ''; const d=await r.json(); return (d.entries?d.entries[0]:d).id||''; }
async function writeCSV(t,folderId,name,headers,rows){ const ex=await findCSV(t,folderId,name); const out=toCSV(headers,rows); const form=new FormData(); form.append('attributes',JSON.stringify(ex?{name}:{name,parent:{id:String(folderId)}})); form.append('file',b64ToBlob(btoa(unescape(encodeURIComponent(out))),'text/csv'),name); const url=ex?`https://upload.box.com/api/2.0/files/${ex.id}/content`:'https://upload.box.com/api/2.0/files/content'; const r=await fetch(url,{method:'POST',headers:H(t),body:form}); return r.ok; }
async function lincolnSub(t,pfx){ const root=(await list(t,'0')).find(i=>i.type==='folder'&&i.name===ROOT_NAME); if(!root) return null; const proj=(await list(t,root.id)).find(i=>i.type==='folder'&&i.name.includes(PROJECT)); if(!proj) return null; let f=(await list(t,proj.id)).find(i=>i.type==='folder'&&i.name.startsWith(pfx)); return {projId:proj.id, folderId:f?f.id:null}; }

const DUMMY=[
 {sub:'demo|john-reyes',first:'John',last:'Reyes',email:'john.reyes@summit-demo.test',company:'Summit Builders',title:'General Contractor',phone:'(717) 555-0110'},
 {sub:'demo|maria-chen',first:'Maria',last:'Chen',email:'maria.chen@comfort-demo.test',company:'Comfort Systems',title:'Mechanical Contractor',phone:'(717) 555-0121'},
 {sub:'demo|dave-kowalski',first:'Dave',last:'Kowalski',email:'dave.k@ahplumbing-demo.test',company:'AH Plumbing',title:'Plumbing Contractor',phone:'(717) 555-0132'},
 {sub:'demo|priya-nair',first:'Priya',last:'Nair',email:'priya.nair@voltage-demo.test',company:'Voltage Electric',title:'Electrical Contractor',phone:'(717) 555-0143'},
 {sub:'demo|tom-becker',first:'Tom',last:'Becker',email:'tbecker@keystone-demo.test',company:'Keystone Engineering',title:'Structural Engineer',phone:'(717) 555-0154'},
 {sub:'demo|aisha-rahman',first:'Aisha',last:'Rahman',email:'arahman@keystone-demo.test',company:'Keystone Engineering',title:'MEP Engineer',phone:'(717) 555-0165'},
 {sub:'demo|laura-simmons',first:'Laura',last:'Simmons',email:'lsimmons@meridian-demo.test',company:'Meridian Architects',title:'Architect',phone:'(717) 555-0176'},
 {sub:'demo|greg-tan',first:'Greg',last:'Tan',email:'gtan@meridian-demo.test',company:'Meridian Architects',title:'Project Architect',phone:'(717) 555-0187'}
];
const DAILY=[
 {c:'Summit Builders',by:'John Reyes',rows:[['2026-07-14','Sunny 78F','12','Foundation formwork at grid A-D','On schedule'],['2026-07-28','Cloudy 71F','16','Structural steel erection east wing','Crane delivery on time']]},
 {c:'Comfort Systems',by:'Maria Chen',rows:[['2026-07-20','Sunny 80F','6','Overhead ductwork rough-in level 1','']]},
 {c:'AH Plumbing',by:'Dave Kowalski',rows:[['2026-07-22','Rain 68F','5','Underground plumbing rough-in','Minor delay - weather']]},
 {c:'Voltage Electric',by:'Priya Nair',rows:[['2026-07-25','Sunny 75F','7','Branch conduit rough-in level 1','']]}
];
const PAY=[
 {c:'Summit Builders',by:'John Reyes',rows:[['2026-07-18','12']]},
 {c:'Comfort Systems',by:'Maria Chen',rows:[['2026-07-18','8']]},
 {c:'AH Plumbing',by:'Dave Kowalski',rows:[['2026-07-18','5']]},
 {c:'Voltage Electric',by:'Priya Nair',rows:[['2026-07-18','6']]}
];

export default async (req)=>{
  const url=new URL(req.url); if(url.searchParams.get('token')!=='fidevia-p2-4k8') return new Response('nope',{status:403});
  const step=url.searchParams.get('step')||'profiles';
  if(step==='profiles'){ const store=getStore('profiles'); for(const d of DUMMY){ await store.setJSON(d.sub,{first_name:d.first,last_name:d.last,phone:d.phone,company:d.company,title:d.title,email:d.email,sub:d.sub,onboarded:true,updated_at:new Date().toISOString()}); } return new Response(JSON.stringify({ok:true,step,added:DUMMY.length}),{headers:{'Content-Type':'application/json'}}); }
  const t=await serviceToken(); if(!t) return new Response('no token',{status:500});
  if(step==='daily'){ const L=await lincolnSub(t,'13'); if(!L) return new Response('no lincoln'); const modF=L.folderId||await ensureFolder(t,L.projId,'13 - Contractor Daily Reports'); const headers=['Date','Company','Submitted By','Weather','Crew Count','Work Performed','Notes','Attachment File ID','Attachment Name']; const rows=[]; for(const g of DAILY){ const sub=await ensureFolder(t,modF,g.c); for(const r of g.rows){ const fn=g.c+' Daily '+r[0]+'.pdf'; const fid=await uploadFile(t,sub,fn,PDF,'application/pdf'); rows.push({'Date':r[0],'Company':g.c,'Submitted By':g.by,'Weather':r[1],'Crew Count':r[2],'Work Performed':r[3],'Notes':r[4],'Attachment File ID':fid,'Attachment Name':fn}); } } await writeCSV(t,modF,'Contractor Daily Reports.csv',headers,rows); return new Response(JSON.stringify({ok:true,step,reports:rows.length}),{headers:{'Content-Type':'application/json'}}); }
  if(step==='payrolls'){ const L=await lincolnSub(t,'14'); if(!L) return new Response('no lincoln'); const modF=L.folderId||await ensureFolder(t,L.projId,'14 - Certified Payrolls'); const headers=['Week Ending','Company','Payroll #','Submitted By','Notes','Attachment File ID','Attachment Name']; const rows=[]; for(const g of PAY){ const sub=await ensureFolder(t,modF,g.c); for(const r of g.rows){ const fn=g.c+' Payroll '+r[1]+' wk '+r[0]+'.pdf'; const fid=await uploadFile(t,sub,fn,PDF,'application/pdf'); rows.push({'Week Ending':r[0],'Company':g.c,'Payroll #':r[1],'Submitted By':g.by,'Notes':'','Attachment File ID':fid,'Attachment Name':fn}); } } await writeCSV(t,modF,'Certified Payrolls.csv',headers,rows); return new Response(JSON.stringify({ok:true,step,payrolls:rows.length}),{headers:{'Content-Type':'application/json'}}); }
  return new Response('unknown step');
};
