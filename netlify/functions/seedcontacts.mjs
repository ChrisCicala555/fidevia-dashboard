import { getStore } from '@netlify/blobs';
const ROOT_NAME='Construction Dashboard'; const PROJECT='Lincoln';
let _svc={token:null,exp:0};
async function serviceToken(){ if(_svc.token&&Date.now()<_svc.exp-60000) return _svc.token; const body=new URLSearchParams({grant_type:'client_credentials',client_id:process.env.BOX_SVC_CLIENT_ID,client_secret:process.env.BOX_SVC_CLIENT_SECRET,box_subject_type:'enterprise',box_subject_id:process.env.BOX_ENTERPRISE_ID}); const r=await fetch('https://api.box.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); const d=await r.json(); if(!d.access_token) return null; _svc={token:d.access_token,exp:Date.now()+(d.expires_in||3600)*1000}; return _svc.token; }
const H=t=>({Authorization:'Bearer '+t});
async function list(t,id){ const r=await fetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`,{headers:H(t)}); return r.ok?(await r.json()).entries||[]:[]; }
const csvEsc=v=>{const s=String(v==null?'':v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
function parseCSV(text){ if(!text||!text.trim()) return {headers:[],rows:[]}; const lines=text.replace(/\r/g,'').split('\n').filter(l=>l.length); const pl=line=>{const res=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){res.push(cur.trim());cur='';}else cur+=c;}res.push(cur.trim());return res;}; const headers=pl(lines[0]); const rows=lines.slice(1).map(l=>{const v=pl(l),o={};headers.forEach((h,i)=>o[h]=v[i]!==undefined?v[i]:'');return o;}); return {headers,rows}; }
function toCSV(headers,rows){ return headers.join(',')+'\n'+rows.map(r=>headers.map(h=>csvEsc(r[h])).join(',')).join('\n')+'\n'; }
function b64ToBlob(b64,mime){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return new Blob([arr],{type:mime}); }
async function findCSV(t,folderId){ return (await list(t,folderId)).find(i=>i.type==='file'&&i.name.toLowerCase().endsWith('.csv')); }
async function upload(t,folderId,name,text,mime){ const ex=(await list(t,folderId)).find(i=>i.type==='file'&&i.name===name); const form=new FormData(); form.append('attributes',JSON.stringify(ex?{name}:{name,parent:{id:String(folderId)}})); form.append('file',b64ToBlob(btoa(unescape(encodeURIComponent(text))),mime),name); const url=ex?`https://upload.box.com/api/2.0/files/${ex.id}/content`:'https://upload.box.com/api/2.0/files/content'; const r=await fetch(url,{method:'POST',headers:H(t),body:form}); return r.ok; }

const PEOPLE=[
 {sub:'demo|andre-martin',name:'Andre Martin',first:'Andre',last:'Martin',company:'Fidevia',role:'Onsite Construction Manager',email:'amartin@fidevia.com',phone:'(717) 555-0101',notify:'Yes'},
 {sub:'demo|laura-simmons',name:'Laura Simmons',first:'Laura',last:'Simmons',company:'Meridian Architects',role:'Architect',email:'lsimmons@meridian-demo.test',phone:'(717) 555-0176',notify:'Yes'},
 {sub:'demo|greg-tan',name:'Greg Tan',first:'Greg',last:'Tan',company:'Meridian Architects',role:'Project Architect',email:'gtan@meridian-demo.test',phone:'(717) 555-0187',notify:'No'},
 {sub:'demo|tom-becker',name:'Tom Becker',first:'Tom',last:'Becker',company:'Keystone Engineering',role:'Structural Engineer',email:'tbecker@keystone-demo.test',phone:'(717) 555-0154',notify:'Yes'},
 {sub:'demo|aisha-rahman',name:'Aisha Rahman',first:'Aisha',last:'Rahman',company:'Keystone Engineering',role:'MEP Engineer',email:'arahman@keystone-demo.test',phone:'(717) 555-0165',notify:'Yes'},
 {sub:'demo|john-reyes',name:'John Reyes',first:'John',last:'Reyes',company:'Summit Builders',role:'General Contractor',email:'john.reyes@summit-demo.test',phone:'(717) 555-0110',notify:'Yes'},
 {sub:'demo|maria-chen',name:'Maria Chen',first:'Maria',last:'Chen',company:'Comfort Systems',role:'Mechanical Contractor',email:'maria.chen@comfort-demo.test',phone:'(717) 555-0121',notify:'No'},
 {sub:'demo|dave-kowalski',name:'Dave Kowalski',first:'Dave',last:'Kowalski',company:'AH Plumbing',role:'Plumbing Contractor',email:'dave.k@ahplumbing-demo.test',phone:'(717) 555-0132',notify:'No'},
 {sub:'demo|priya-nair',name:'Priya Nair',first:'Priya',last:'Nair',company:'Voltage Electric',role:'Electrical Contractor',email:'priya.nair@voltage-demo.test',phone:'(717) 555-0143',notify:'No'},
 {sub:'demo|district-owner',name:'Lincoln School District',first:'Lincoln School',last:'District',company:'Lincoln School District',role:'Owner',email:'facilities@lincolnsd-demo.test',phone:'(717) 555-0100',notify:'Yes'}
];

export default async (req)=>{
  const url=new URL(req.url); if(url.searchParams.get('token')!=='fidevia-ct-2h6') return new Response('nope',{status:403});
  const t=await serviceToken(); if(!t) return new Response('no token',{status:500});
  const root=(await list(t,'0')).find(i=>i.type==='folder'&&i.name===ROOT_NAME); if(!root) return new Response('no root');
  const proj=(await list(t,root.id)).find(i=>i.type==='folder'&&i.name.includes(PROJECT)); if(!proj) return new Response('no lincoln');
  const contF=(await list(t,proj.id)).find(i=>i.type==='folder'&&i.name.startsWith('05')); if(!contF) return new Response('no contacts folder');
  const csv=await findCSV(t,contF);
  let headers=['Name','Company','Role','Email','Phone','Notify - RFI','Notify - CO','Notify - Submittal'], rows=[];
  if(csv){ const p=parseCSV(await (await fetch(`https://api.box.com/2.0/files/${csv.id}/content`,{headers:H(t)})).text()); if(p.headers.length) headers=p.headers; rows=p.rows; }
  const store=getStore('profiles');
  let added=0, updated=0;
  for(const p of PEOPLE){
    const ex=rows.find(r=>(r['Name']||'').trim().toLowerCase()===p.name.toLowerCase());
    if(ex){ ex['Company']=p.company; ex['Role']=p.role; if(!ex['Email'])ex['Email']=p.email; if(!ex['Phone'])ex['Phone']=p.phone; updated++; }
    else { rows.push({'Name':p.name,'Company':p.company,'Role':p.role,'Email':p.email,'Phone':p.phone,'Notify - RFI':p.notify,'Notify - CO':p.notify,'Notify - Submittal':p.notify}); added++; }
    await store.setJSON(p.sub,{first_name:p.first,last_name:p.last,phone:p.phone,company:p.company,title:p.role,email:p.email,sub:p.sub,onboarded:true,updated_at:new Date().toISOString()});
  }
  await upload(t,contF,csv?csv.name:'Job Contacts.csv',toCSV(headers,rows),'text/csv');
  return new Response(JSON.stringify({ok:true,added,updated,total:rows.length}),{headers:{'Content-Type':'application/json'}});
};
