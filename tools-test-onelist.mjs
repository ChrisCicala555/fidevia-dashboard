// "The What are we Doing Field seems like a second step we dont need. Couldn't
// we remove the What are we doing and just use the first table?"
//
// Four of its five answers were already implied by the status. The two that
// were not — send it on to somebody as well, hand the step over — are not
// decisions about the item, which is why they ended up in a field of their own;
// they are entries in the one list now, and the Who picker appears only for
// them.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage('index.html'); P.run(SEED);

console.log('There is one control');
{
  ok(!/id="reply-action"/.test(html), 'the second dropdown is gone');
  ok(!/replyActionSyncsStatus|replyActionChanged/.test(html),
     'and so is the code that kept the two from contradicting each other — one field holds one answer');
  ok(/onchange="replyStatusChanged\(\)"/.test(html), 'the remaining one drives everything');
  const m=html.split('id="reply-next-field"')[1].split('</div>')[0];
  ok(!/What are you doing/.test(html), 'and the question nobody needed is not asked');
}

console.log('What each entry does for the chain');
{
  const route=v=>P.run(`replyRouteOf(${JSON.stringify(v)})`);
  ok(route('Approved')==='continue', 'Approved records the review and lets the chain move on');
  ok(route('Approved as Noted')==='continue', 'as does Approved as Noted');
  ok(route('Comment only — no decision')==='continue', 'and a comment decides nothing either way');
  ok(route('Revise and Resubmit')==='return', 'Revise and Resubmit sends it back');
  ok(route('Revise & Resubmit')==='return', 'however that log words it');
  ok(route('__also')==='also', 'and the two routes are themselves');
  ok(route('__reassign')==='reassign', 'each one');
  ok(route('')==='continue', 'nothing chosen is not a route');
}

console.log('What each entry writes as the status');
{
  const st=(v,cur)=>P.run(`replyStatusFor(${JSON.stringify(v)}, ${JSON.stringify(cur||'')})`);
  ok(st('Approved')==='Approved', 'a status is its own status');
  ok(st('__also')==='Approved',
     'sending it on is an approval — the reviewer is saying yes and adding somebody after them');
  ok(st('__reassign','Under Review')==='Under Review',
     'while handing the step over decides nothing, so the item keeps the status it arrived with');
  ok(st('__reassign','')==='', 'and invents none where there was none');
  ok(!/value="__also"/.test(st('__also')), 'no reserved value ever reaches the row');
}

console.log('Only the two that need a name ask for one');
{
  const who=(v)=>P.run(`(function(){
    document.getElementById('reply-status').value=${JSON.stringify(v)};
    replyDecidesHere=function(){ return true; };
    replyStatusChanged();
    return { who:document.getElementById('reply-next-who').style.display,
             hint:document.getElementById('reply-next-hint').textContent }; })()`);
  ok(who('Approved').who==='none', 'a plain approval asks for nobody');
  ok(who('Revise and Resubmit').who==='none',
     'nor does a return — it goes to whoever filed it, which is not a choice');
  ok(who('__also').who!=='none', 'sending it on asks who');
  ok(/added after you as one more step/.test(who('__also').hint), 'and says where they land');
  ok(who('__reassign').who!=='none', 'handing over asks who');
  ok(/Your approval is not recorded/.test(who('__reassign').hint),
     'and says plainly that no approval is being given, which is the part somebody could get wrong');
}

console.log('The routes are offered only to the reviewer the chain is on');
{
  const opts=(advance)=>P.run(`(function(){
    allData.sub[0]['Workflow Step']='0'; allData.sub[0]['Workflow Status']='In Review';
    EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='a@x.test'; ME_NAME='Test Architect';
    currentProject.userCompany='Architect 2'; currentProject.userRole='architect';
    openReply('sub',0,${advance?'true':'false'});
    return document.getElementById('reply-status').innerHTML; })()`);
  ok(/__also/.test(opts(true)) && /__reassign/.test(opts(true)),
     'the reviewer completing their step gets both');
  ok(!/__also/.test(opts(false)) && !/__reassign/.test(opts(false)),
     'somebody adding a version or a note gets neither — they are not routing anything');
  ok(/Approved/.test(opts(false)), 'while the statuses are unaffected');
}

console.log('A route with nobody named is refused, not quietly downgraded')
{
  // "I tried to ask the architect if they agree as a test (as the engineer), is
  // there a reason why the architect wasn't roped back in?" Because the Who
  // field was empty: the branch that adds them requires a name, so the step was
  // signed, nobody was added, and nothing said the request had been dropped.
  const P2=bootPage('index.html'); P2.run(SEED);
  const setup=`
    allData.contacts=[{'Name':'Test Architect','Company':'Architect 2','Email':'a@x.test'},
      {'Name':'Penelope Odiem','Company':'Next Level Engineers','Email':'p@y.test'}];
    currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'}];
    allData.sub=[{'Submittal #':'S','Description':'d','Company':'Summit Builders',
      'Status':'Pending Review','Workflow Step':'0','Workflow Status':'In Review',
      'Version History':'[]','Workflow Signed':'','Workflow Extra':'','Workflow Done':''}];
    ccAddReviewSteps('sub', allData.sub[0], 'Next Level Engineers');
    EXTERNAL=true; IS_ADMIN=false; ME_EMAIL='p@y.test'; ME_NAME='Penelope Odiem';
    currentProject.userCompany='Next Level Engineers'; currentProject.userRole='engineer';
    openReply('sub',0,true);`;
  const chainAfter=(route,pick)=>{ P2.run(setup);
    P2.run(`document.getElementById('reply-status').value=${JSON.stringify(route)}; replyStatusChanged();
            document.getElementById('reply-next').value=${JSON.stringify(pick)};
            try{ applyReviewAdvance('sub', allData.sub[0], 'Penelope Odiem'); }catch(e){}`);
    return P2.run(`wfEffectiveSteps('sub',allData.sub[0]).map(function(s){ return wfStepCompany(s); })`); };

  ok(chainAfter('__also','Architect 2').join()==='Architect 2,Next Level Engineers,Architect 2',
     'naming a firm adds them back — which is what the reviewer asked for');
  ok(chainAfter('__also','').length===2, 'naming nobody adds nobody, which is the trap');

  // The guard: the submit refuses before anything is written.
  const sr=html.slice(html.indexOf("if(_canDecide){\n    const _v=document.getElementById('reply-status').value;"),
                      html.indexOf("const note=document.getElementById('reply-note').value.trim();"));
  ok(/_route==='also' \|\| _route==='reassign'/.test(sr), 'both routing choices are checked');
  ok(/if\(!_pick\)\{/.test(sr) && /alert\(/.test(sr) && /return;/.test(sr),
     'and an empty name stops the submit rather than letting it record something else');
  ok(/Choose who to send it to as well/.test(sr) && /Choose who to hand this step to/.test(sr),
     'each says which name is missing');
  ok(html.indexOf("if(_route==='also' || _route==='reassign')")
     < html.indexOf("const fileInput=document.getElementById('reply-file')"),
     'checked before the file is uploaded, so a refused submit writes nothing at all');
}

console.log(bad ? `FAIL tools-test-onelist.mjs — ${bad} of ${n}` : `ok   tools-test-onelist.mjs — ${n} assertions`);
process.exit(bad?1:0);
