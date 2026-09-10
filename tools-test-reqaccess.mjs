// Request Project Access used to fetch every project Fidevia has and put them
// in a dropdown — so anybody with an account could read the name of every job
// in the business, including ones not yet announced, from the one screen whose
// users are by definition not on a project yet.
import fs from 'fs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const srv =fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');

console.log('The list is not handed out');
ok(!/proxyCall\('listAllProjectNames'/.test(html), 'the screen no longer asks for every project');
{
  const c = srv.split("if (op === 'listAllProjectNames')")[1].slice(0,400);
  ok(/if \(!who\.isAdmin\) return json\(\{ error: 'Admins only' \}, 403\);/.test(c),
     'and the op that returns them is Fidevia’s alone — an unused op is still a reachable one');
}
ok(/<input id="req-project-name"/.test(html), 'the screen asks them to type it');
ok(!/<select id="req-project">/.test(html), 'rather than choose from a list');
ok(/It does not have to be exact/.test(html), 'and says an approximate name is fine');
ok(/<textarea id="req-project-note"/.test(html), 'with room to say who they are');

console.log('The server works out which project they mean');
{
  const body = srv.split("      let projectId = '', matched = '';")[1].split('      // Unmatched requests')[0];
  const F = new Function('typed','SYSTEM_FOLDERS','boxFetch','H',
    `return (async()=>{ let projectId='', matched=''; ${body} return {projectId, matched}; })();`);
  const PROJECTS=[{id:'900',name:'Ithaca Housing Complex'},
                  {id:'901',name:'Lincoln Elementary Modernization Project'},
                  {id:'902',name:'W Earl Twp Municipal Building'}];
  const boxFetch=async()=>({json:async()=>({entries:PROJECTS.map(p=>({...p,type:'folder'}))})});
  const at=async t=>(await F(t,[],boxFetch,{})).matched||'';
  ok(await at('Ithaca Housing Complex')==='Ithaca Housing Complex', 'the exact name');
  ok(await at('ithaca housing complex')==='Ithaca Housing Complex', 'in any case');
  ok(await at('Ithaca')==='Ithaca Housing Complex', 'a fragment of it');
  ok(await at('Ithaca Housing Complex - Phase 2')==='Ithaca Housing Complex', 'or more than it');
  ok(await at('W Earl Twp')==='W Earl Twp Municipal Building', 'punctuation and spacing ignored');
  ok(await at('Some Other Job')==='', 'a name that is nothing like one of them matches nothing');
  ok(await at('a')==='' && await at('the')==='',
     'and a fragment too short to mean anything is not allowed to match everything');
  ok(await at('')==='', 'nor is nothing');
}

console.log('And answers the same either way');
{
  const c = srv.split("if (op === 'requestAccess')")[1].split("if (op === 'listRequests')")[0];
  ok(/const bucket = projectId \|\| 'unmatched';/.test(c),
     'a request it could not place is still stored, for a person to read');
  ok((c.match(/return json\(\{ ok: true \}\)/g)||[]).length===1
     && !/matched: false[\s\S]{0,80}return json\(\{ error/.test(c),
     'and the reply does not say whether it matched');
  ok(/one guess at a time/.test(c),
     'because otherwise this screen answers "does a project called this exist?"');
  ok(/asked: typed/.test(c) && /note,/.test(c),
     'what they typed is kept alongside what it resolved to, so a wrong match is visible');
  ok(/if \(!typed\) return json/.test(c), 'an empty request is refused before anything is stored');
  ok(/\.slice\(0, 200\)/.test(c) && /\.slice\(0, 500\)/.test(c), 'and both fields are bounded');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-reqaccess.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
