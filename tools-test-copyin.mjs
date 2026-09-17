// "When sending a submittal from a contractor — allow them to copy an
// additional person into the review. Should be consistent with RFI, and
// Submittals."
//
// "Goes to" is the workflow's answer and readonly, which is right. What was
// missing is the submitter's own: a consultant's reviewer, an owner's rep,
// their own office. They had to forward the email by hand.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`allData.contacts=[
  {Name:'Bob Potter', Company:'Moore Engineering', Email:'bob@moore.com'},
  {Name:'Blake Strickler', Company:'Moore Engineering', Email:'blake@moore.com'},
  {Name:'Amanda Cook', Company:"Cook's Service Company", Email:'amanda@cooks.com'}];`);
const cc=(v)=>P.run(`ccList({'Copied To':${JSON.stringify(v)}})`);

console.log('A person, a firm, or an address');
{
  ok(cc('Bob Potter').join()==='bob@moore.com', 'a name resolves off the contact sheet');
  ok(cc('bob@moore.com').join()==='bob@moore.com', 'an address is taken as it stands');
  ok(cc('Moore Engineering').sort().join()==='blake@moore.com,bob@moore.com',
     'and a firm copies in everyone there, which is the same rule a step follows');
  ok(cc('Bob Potter, amanda@cooks.com').sort().join()==='amanda@cooks.com,bob@moore.com',
     'several, comma separated');
  ok(cc('Bob Potter; Amanda Cook').length===2, 'or semicolons, since people type both');
}

console.log('Nothing sent twice, nothing sent to nonsense');
{
  ok(cc('Bob Potter, bob@moore.com, BOB@MOORE.COM').length===1,
     'the same person three ways is one email');
  ok(cc('Moore Engineering, Bob Potter').length===2, 'and a firm plus one of its people is still the firm');
  ok(cc('Somebody Unknown').length===0, 'a name nobody knows resolves to nothing, not to everybody');
  ok(cc('').length===0 && cc('  ,  ;  ').length===0, 'blanks and stray punctuation are not addresses');
  ok(P.run(`ccList(null).length`)===0 && P.run(`ccList({}).length`)===0, 'and no row is not a wildcard');
  ok(cc('not-an-address').length===0, 'nor is a word with no @ and no match');
}

console.log('On both forms, the same way');
{
  const rfi=html.split("rfi:{title:'New RFI'")[1].split("co:{title:'New PCO'")[0];
  const sub=html.split("submittal:{title:'New Submittal'")[1].split("payapp:{title:'New Payment Application'")[0];
  [['RFI',rfi],['submittal',sub]].forEach(([what,form])=>{
    ok(/id="f-cc"/.test(form), 'the '+what+' form has a Copy in field');
    ok(/Additional Review \(optional\)/.test(form),
       'called Additional Review on the '+what+' \u2014 which is what it is: the submitter adding to the '
       +'chain, not replacing it');
    ok(/oninput="wfShowAC\(this\)"/.test(form),
       'and offers the firms on the job as you type, on the '+what+' — the same picker the workflow uses');
    ok(/replies reach them too/.test(form), 'saying it outlasts the submission, on the '+what);
    ok(/<input type="hidden" id="f-(assigned|reviewer)">/.test(form),
       'and the workflow\u2019s own answer is still carried on the '+what+', hidden rather than shown in '
       +'a box nobody could type into \u2014 it reaches the row either way');
  });
  ok(!/Goes to/.test(rfi) && !/Goes to/.test(sub),
     'and the readonly Goes to box is gone from both \u2014 a field nobody can type into is a sentence, '
     +'so it is written as one');
  const f=html.split('function fillAssignedFirm')[1].split('// Whoever the submitter')[0];
  ok(/Next in the workflow: <strong>/.test(f), 'said underneath the box: who is next');
  ok(/, alongside '\+esc\(firms\.slice\(1\)/.test(f), 'and who is alongside them, when a step is parallel');
  ok(/will reach nobody on its own/.test(f) && /name somebody above/.test(f),
     'while a workflow naming nobody says so, and points at the box that can rescue it');
}

console.log('Held on the row, not just on the first email');
{
  ok(/'Submitted By Email','Copied To','Archived'/.test(html),
     'the log carries a column for it');
  ok((html.match(/'Copied To','Archived'/g)||[]).length===2, 'on both the RFI and submittal logs');
  const sm=html.split('async function submitForm()')[1].slice(0,26000);
  ok(/const _ccRaw=/.test(sm), 'the field is read once at submit');
  ok(/extraTo:\(_senderEmail\?\[_senderEmail\]:\[\]\)\.concat\(ccList\(\{'Copied To':_ccRaw\}\)\)/.test(sm),
     'and everyone named is on the submission email');
  ok(/headers\.includes\('Copied To'\)\)\{ newRow\['Copied To'\]=_ccRaw\|\|''/.test(sm),
     'and written to the row, so it survives the email');
  const r=html.slice(html.indexOf('const _rOpts='), html.indexOf('const _rOpts=')+2000);
  ok(/ccList\(row\)\.forEach\(e=>_rOpts\.extraTo\.push\(e\)\)/.test(r),
     'a reply reaches them too — dropping them after the first email would make Copy in a courtesy '
     +'rather than a record, and the reply is the part they were waiting for');
}

console.log('Additional Review adds the firm to the chain')
{
  // "I added next level engineers to the Submittal 004, but do not see them on
  // the workflow anywhere." Because it did not put them there: the field copied
  // them on the email and nothing else, which is not what the label promises.
  const P2=bootPage('index.html'); P2.run(SEED);
  P2.run(`currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'}];
    ME_NAME='Test Contractor';`);
  const add=(raw)=>P2.run(`(function(){
    var r={};
    var added=ccAddReviewSteps('sub', r, ${'$'}{JSON.stringify(raw)});
    return { added:added, steps:wfEffectiveSteps('sub', r).map(function(s){
      return (s.name||'')+' \u2014 '+(wfStepCompany(s)||''); }) }; })()`.replace('${JSON.stringify(raw)}', JSON.stringify(raw)));

  const one=add('Next Level Engineers');
  ok(one.added.join()==='Next Level Engineers', 'the firm is reported as added');
  ok(one.steps.length===2, 'and the chain is one step longer');
  ok(/Additional Review \u2014 Next Level Engineers/.test(one.steps[1]),
     'named for what it is, and carrying the firm \u2014 '+one.steps[1]);
  ok(/Architect Review/.test(one.steps[0]),
     'beside the first reviewer, not before them: the configured chain still leads');

  // A two-step chain is what tells "after the first reviewer" apart from "at the
  // end" — on a one-step chain they are the same index.
  P2.run(`currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'},
    {name:'Fidevia Review', company:'Fidevia'}];`);
  const mid=add('Next Level Engineers');
  ok(mid.steps.length===3, 'the chain grows by one');
  ok(/Architect Review/.test(mid.steps[0]) && /Additional Review/.test(mid.steps[1])
     && /Fidevia Review/.test(mid.steps[2]),
     'and the firm lands beside the first, ahead of the rest \u2014 '+mid.steps.join(' | '));
  P2.run(`currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'}];`);

  // The point of the change: the chain is on both at once, so the added firm can
  // record a review straight away rather than waiting on the architect's desk.
  const both=P2.run(`(function(){
    currentProject.config.workflows.sub=[{name:'Architect Review', company:'Architect 2'}];
    var r={'Workflow Step':'0','Workflow Status':'In Review'};
    ccAddReviewSteps('sub', r, 'Next Level Engineers');
    var steps=wfEffectiveSteps('sub', r);
    var g=wfGroupAt(steps, 0);
    return { group:[g[0],g[1]], parallel:!!steps[1].parallel,
             with:steps.slice(g[0],g[1]+1).map(function(s){ return wfStepCompany(s); }) }; })()`);
  ok(both.parallel===true, 'the added step is parallel');
  ok(both.group[0]===0 && both.group[1]===1, 'so it joins the first group rather than queueing behind it');
  ok(both.with.join()==='Architect 2,Next Level Engineers',
     'and the item is with both firms at once \u2014 '+both.with.join(' and '));

  const two=add('Next Level Engineers, Moore Engineering');
  ok(two.added.length===2 && two.steps.length===3, 'several firms, several steps');

  const dup=add('Architect 2');
  ok(dup.added.length===0 && dup.steps.length===1,
     'a firm already reviewing it is not added again \u2014 one office signing the same item in two '
     +'places is not an additional review');
  ok(add('  ,  ; ').added.length===0, 'and punctuation on its own adds nobody');
  ok(add('').added.length===0, 'nor does an empty field');
}

console.log('The submission wires it up')
{
  const sm=html.split('async function submitForm()')[1].slice(0,26000);
  ok(/if\(newRow && _ccRaw\) ccAddReviewSteps\(key, newRow, _ccRaw\)/.test(sm),
     'the firms named go into the chain as well as onto the email');
  ok(sm.indexOf("newRow['Copied To']=_ccRaw")<sm.indexOf('ccAddReviewSteps'),
     'recorded on the row first, so what was asked for survives even if the chain write fails');
  const rfi=html.split("rfi:{title:'New RFI'")[1].split("co:{title:'New PCO'")[0];
  ok(/placeholder="A firm \\u2014 comma separated"/.test(rfi),
     'and the field asks for a firm, not a person \u2014 a step belongs to an office');
  ok(/They review alongside the first reviewer/.test(rfi),
     'saying what it does, which it previously did not do \u2014 and that it is alongside, since queued '
     +'behind, an added reviewer could say nothing until somebody else\u2019s desk had cleared');
}

console.log('The list stays open when you click into the box')
{
  // "When i click on the box, it flashes a list that goes away." Focus opened
  // it; the click that caused the focus closed it again. The guard spared only
  // .wf-row, which is where this picker started life — on a submission form it
  // had no such ancestor.
  const c=html.split('function wfCloseAC')[1].split('function wfCompanyList')[0];
  ok(/\.wf-ac-host'\)\.forEach\(el=>el\.classList\.remove\('wf-ac-host'\)\)/.test(c),
     'closing clears the marker, so it cannot go stale and keep a later click alive');
  ok(/!e\.target\.closest\('\.wf-row'\) && !e\.target\.closest\('\.wf-ac-host'\)\) wfCloseAC\(\);/.test(html),
     'and a click inside whatever opened the list no longer closes it');
  ok((html.match(/wrap\.classList\.add\('wf-ac-host'\)/g)||[]).length===2,
     'both pickers mark their host, since both are governed by the one guard \u2014 fixing only the new '
     +'one would leave the same trap set for the next field that uses it');
}

console.log(bad ? `FAIL tools-test-copyin.mjs — ${bad} of ${n}` : `ok   tools-test-copyin.mjs — ${n} assertions`);
process.exit(bad?1:0);
