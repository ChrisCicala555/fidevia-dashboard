const ROOT_NAME='Construction Dashboard'; const PROJECT='Lincoln';
let _svc={token:null,exp:0};
async function serviceToken(){ if(_svc.token&&Date.now()<_svc.exp-60000) return _svc.token; const body=new URLSearchParams({grant_type:'client_credentials',client_id:process.env.BOX_SVC_CLIENT_ID,client_secret:process.env.BOX_SVC_CLIENT_SECRET,box_subject_type:'enterprise',box_subject_id:process.env.BOX_ENTERPRISE_ID}); const r=await fetch('https://api.box.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); const d=await r.json(); if(!d.access_token) return null; _svc={token:d.access_token,exp:Date.now()+(d.expires_in||3600)*1000}; return _svc.token; }
const H=t=>({Authorization:'Bearer '+t});
async function list(t,id){ const r=await fetch(`https://api.box.com/2.0/folders/${id}/items?limit=1000&fields=id,name,type`,{headers:H(t)}); return r.ok?(await r.json()).entries||[]:[]; }
function b64ToBlob(b64,mime){ const bin=atob(b64); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return new Blob([arr],{type:mime}); }
export default async (req)=>{
  const url=new URL(req.url); if(url.searchParams.get('token')!=='fidevia-addr-4p1') return new Response('nope',{status:403});
  const t=await serviceToken(); if(!t) return new Response('no token',{status:500});
  const root=(await list(t,'0')).find(i=>i.type==='folder'&&i.name===ROOT_NAME); if(!root) return new Response('no root');
  const proj=(await list(t,root.id)).find(i=>i.type==='folder'&&i.name.includes(PROJECT)); if(!proj) return new Response('no lincoln');
  const f=(await list(t,proj.id)).find(i=>i.type==='file'&&i.name==='Project Info.json');
  let cfg={}; if(f){ try{ cfg=JSON.parse(await (await fetch(`https://api.box.com/2.0/files/${f.id}/content`,{headers:H(t)})).text())||{}; }catch(e){} }
  cfg.address={line1:'750 Lititz Pike',line2:'',city:'Lititz',state:'PA',zip:'17543'};
  cfg.location='750 Lititz Pike · Lititz, PA · 17543';
  const text=JSON.stringify(cfg,null,2);
  const form=new FormData();
  form.append('attributes', JSON.stringify(f?{name:'Project Info.json'}:{name:'Project Info.json',parent:{id:String(proj.id)}}));
  form.append('file', b64ToBlob(btoa(unescape(encodeURIComponent(text))),'application/json'), 'Project Info.json');
  const u=f?`https://upload.box.com/api/2.0/files/${f.id}/content`:'https://upload.box.com/api/2.0/files/content';
  const r=await fetch(u,{method:'POST',headers:H(t),body:form});
  return new Response(JSON.stringify({ok:r.ok,address:cfg.address}),{headers:{'Content-Type':'application/json'}});
};
