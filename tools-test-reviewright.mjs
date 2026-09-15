// "As an engineer, I can submit a review step for something I was not assigned
// ... that should be changed." And: "that goes for anyone except for Fidevia
// pretty much."
//
// The right to record a review was the ROLE, deliberately — the comment said
// "the design team is recording a review, whether or not the chain happens to
// name them". That is wrong. A review is an answer from the party the item was
// put to; anyone else offering one is a comment wearing a reviewer's clothes.
//
// The server was never fooled: advanceWorkflow refuses anyone who is not on the
// current step, by name or firm, unless they are Fidevia. So the chain did not
// move — but the button said Submit Review Step and the thread gained an entry
// that read like a decision.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html = fs.readFileSync('index.html','utf8');
const srv  = fs.readFileSync('netlify/functions/box-proxy.mjs','utf8');

const STEPS=[{person:'Dana Reyes',role:'Architect'},{person:'Priya Shah',role:'Engineer'}];
const ROW=(o)=>Object.assign({'RFI #':'RFI-GC-001','Subject':'Beam clearance','Company':'Summit Builders',
  'Status':'Open','Workflow Step':'0','Workflow Status':'In Review','Workflow Done':'[]','Workflow Signed':'{}'}, o);

// Who is reading, and whether the chain is on them.
const asPerson = (name, email, company, row) => {
  const P=bootPage(); P.run(SEED);
  P.run(`
    IS_ADMIN=false; EXTERNAL=true; DATA_READY=true;
    ME_NAME=${JSON.stringify(name)}; ME_EMAIL=${JSON.stringify(email)};
    currentProject.userCompany=${JSON.stringify(company)}; currentProject.userRole='engineer';
    currentProject.config.workflows={rfi:${JSON.stringify(STEPS)}};
    allData.contacts=[{Name:'Dana Reyes',Company:'Meridian Architects',Email:'dana@meridian.test'},
                      {Name:'Priya Shah',Company:'Keystone Engineering',Email:'priya@keystone.test'}];
    allData.rfi=[${JSON.stringify(row)}];
  `);
  return P;
};

// Pulled out of index.html rather than written out here: a test that
// re-implements the expression proves the intent and not the code, and a
// mutation to the real line would sail past it. This one did, until the mutant
// that removed Fidevia's exemption survived.
const EXPR=(html.match(/const _reviews = ([^;]+);/)||[])[1];
if(!EXPR) throw new Error('could not find the _reviews expression');
const reviews = (P) => P.run(`(function(){ const r=allData.rfi[0], key='rfi'; return (`+EXPR+`); })()`);

console.log('Whose step it is');
{
  // Step 0 is the architect's. Keystone's engineer is on the chain, but later.
  const P=asPerson('Priya Shah','priya@keystone.test','Keystone Engineering', ROW());
  ok(P.run(`replyStepIsMine('rfi', allData.rfi[0])`)===false,
     'an engineer whose turn has not come is not the current reviewer');
  const P2=asPerson('Dana Reyes','dana@meridian.test','Meridian Architects', ROW());
  ok(P2.run(`replyStepIsMine('rfi', allData.rfi[0])`)===true, 'the architect the step names is');
  // A colleague at the same firm may act — that rule predates this and stands.
  const P3=asPerson('Someone Else','other@meridian.test','Meridian Architects', ROW());
  ok(P3.run(`replyStepIsMine('rfi', allData.rfi[0])`)===true,
     'as is anyone at that firm, so one person being away does not stop the job');
  // A firm with no step at all.
  const P4=asPerson('Nobody','nb@voltage.test','Voltage Electric', ROW());
  ok(P4.run(`replyStepIsMine('rfi', allData.rfi[0])`)===false, 'a firm the chain never names is not');
}

console.log('What the dialog offers each of them');
{
  ok(reviews(asPerson('Dana Reyes','dana@meridian.test','Meridian Architects', ROW()))===true,
     'the assigned reviewer may record a review');
  ok(reviews(asPerson('Nobody','nb@voltage.test','Voltage Electric', ROW()))===false,
     'a design firm the chain never names may not — the report');
  // Christopher: someone named further down the chain keeps today's behaviour.
  // Their press is not wasted — the review is kept and signs their step when it
  // arrives — which is why it was allowed in the first place.
  ok(reviews(asPerson('Priya Shah','priya@keystone.test','Keystone Engineering', ROW()))===true,
     'but one named later in the chain still may, before their turn');
  ok(reviews(asPerson('Priya Shah','priya@keystone.test','Keystone Engineering', ROW({'Workflow Step':'1'})))===true,
     'and of course once it reaches them');
  // Sent back: the ball is with the contractor, so nobody on the review side
  // is reviewing, however far up the chain they are.
  // Built the way a send-back actually writes it: an extra step after the
  // reviewer's, carrying the SUBMITTING firm, with the chain moved onto it.
  const EXTRA=[{after:0, name:'Revise and Resubmit', person:'Test Contractor',
                company:'Summit Builders', email:'gc@summit.test', returned:true}];
  const sentBack=(email,co)=>asPerson('', email, co,
    ROW({'Workflow Extra':JSON.stringify(EXTRA), 'Workflow Step':'1'}));
  const back=sentBack('dana@meridian.test','Meridian Architects');
  ok(back.run(`wfEffectiveSteps('rfi',allData.rfi[0]).length`)===3,
     'the returned step is in the chain — the fixture is the real shape, not a guess');
  ok(back.run(`wfEffectiveSteps('rfi',allData.rfi[0])[1].returned`)===true, 'and marked as a return');
  ok(reviews(back)===false,
     'the architect who sent it back does not review while it is with the contractor');
  ok(reviews(sentBack('priya@keystone.test','Keystone Engineering'))===false,
     'and neither does anyone else on the review side');
  // A closed chain is nobody's.
  ok(reviews(asPerson('Dana Reyes','dana@meridian.test','Meridian Architects', ROW({'Workflow Status':'Complete'})))===false,
     'a finished chain is not open for more reviews');
  ok(reviews(asPerson('Dana Reyes','dana@meridian.test','Meridian Architects', ROW({'Workflow Status':'Rejected'})))===false,
     'nor one decided against');
}

console.log('Two cases the returned-step rule must not swallow');
{
  // A design firm can be the one that FILED the item — an architect raising an
  // RFI — and get it back to answer. The returned step is then theirs, and the
  // rule about items sitting with the submitting side must not lock them out of
  // their own.
  const P=asPerson('Dana Reyes','dana@meridian.test','Meridian Architects',
    ROW({'Company':'Meridian Architects',
         'Workflow Extra':JSON.stringify([{after:0,name:'Revise and Resubmit',person:'Dana Reyes',
                                           company:'Meridian Architects',email:'dana@meridian.test',returned:true}]),
         'Workflow Step':'1'}));
  ok(P.run(`wfEffectiveSteps('rfi',allData.rfi[0])[1].returned`)===true, 'the step is a return');
  ok(P.run(`replyMayReview('rfi', allData.rfi[0])`)===true,
     'and the firm it went back to may still act on it, because it is their step');
}
{
  // A project with no chain configured at all behaves as it always did.
  const P=asPerson('Anyone','a@x.test','Keystone Engineering', ROW());
  P.run(`currentProject.config.workflows={rfi:[]};`);
  ok(P.run(`replyMayReview('rfi', allData.rfi[0])`)===true,
     'with no workflow configured there is no step to be off, so nothing is withheld');
  ok(reviews(P)===true, 'and the dialog offers a review, as before');
}

console.log('Fidevia is the exception');
{
  const P=bootPage(); P.run(SEED);
  P.run(`IS_ADMIN=true; EXTERNAL=false; DATA_READY=true;
    currentProject.config.workflows={rfi:${JSON.stringify(STEPS)}};
    allData.rfi=[${JSON.stringify(ROW())}];`);
  ok(P.run(`(function(){ const r=allData.rfi[0];
      return !EXTERNAL || (DESIGN_ROLES.includes(viewingAsRole()) && replyStepIsMine('rfi', r)); })()`)===true,
     'Fidevia is not held to the chain — !EXTERNAL carries them, as it always did');
}

console.log('The button says what the dialog will do');
{
  const lbl=html.slice(html.indexOf('const _rvLabel ='), html.indexOf('// One action, not two'));
  ok(/replyMayReview\(key,r\)/.test(lbl), 'the label asks the same question the dialog asks');
  ok(/'Add a Comment'/.test(lbl),
     'and offers a comment to a design reader it is not on, rather than "Submit Review Step"');
  ok(/'Submit Updated Version'/.test(lbl), 'while a contractor still files a version');
}

console.log('The rule is the same one the server enforces');
{
  const a=srv.slice(srv.indexOf("if (op === 'advanceWorkflow')"));
  const auth=a.slice(a.indexOf('--- authorize'), a.indexOf('--- advance'));
  ok(/direct === me/.test(auth) && /viaName === me/.test(auth), 'the server matches the caller by address');
  ok(/myCo === stepCo/.test(auth), 'or by the firm on the step');
  ok(/!who\.isAdmin && !allowed/.test(auth), 'and lets Fidevia through');
  ok(/403/.test(auth), 'refusing everyone else outright');
  // The client now agrees with it rather than inviting what it refuses.
  ok(/DESIGN_ROLES\.includes\(viewingAsRole\(\)\) && replyMayReview\(key, r\)/.test(html),
     'and the client asks the same question before offering the action');
  ok(!/const _reviews = !EXTERNAL \|\| DESIGN_ROLES\.includes\(viewingAsRole\(\)\);/.test(html),
     'the role-alone test is gone');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-reviewright.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
