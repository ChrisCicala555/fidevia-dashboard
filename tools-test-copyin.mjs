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
    ok(/Copy in \(optional\)/.test(form), 'labelled as optional on the '+what+', since most items need none');
    ok(/oninput="wfShowAC\(this\)"/.test(form),
       'and offers the firms on the job as you type, on the '+what+' — the same picker the workflow uses');
    ok(/replies reach them too/.test(form), 'saying it outlasts the submission, on the '+what);
  });
  ok(/id="f-assigned" readonly/.test(rfi) && /id="f-reviewer" readonly/.test(sub),
     'while Goes to stays readonly on both — that is the workflow’s answer, not the submitter’s');
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

console.log(bad ? `FAIL tools-test-copyin.mjs — ${bad} of ${n}` : `ok   tools-test-copyin.mjs — ${n} assertions`);
process.exit(bad?1:0);
