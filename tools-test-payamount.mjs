// "Approved payment amount cannot be modified at this point... if they click
// modify and sign then maybe it should be editable."
//
// Right. The figure being approved is the figure asked for. Typing over it is
// what "Modify and Sign" says out loud — and a row that reads approved as filed
// while carrying some other number is a disagreement nobody would ever find,
// because nothing on the row admits a change was made.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);

// The dialog as it stands after openPayAction, without opening it: the field,
// the hint under it, and the row the amount is read off.
const setup=(action, req, typed)=>P.run(`
  (function(){
    allData.pay_apps=[{'App #':'PA #01','Contractor':'Summit Builders','Copy Type':'Final',
      'Status':'Uploaded — awaiting Fidevia','Requested Amount':${JSON.stringify(String(req))}}];
    PAY_CTX={idx:0};
    var box=document.getElementById('pa-details'); box.style.display='none';
    var sel=document.getElementById('pa-action');
    sel.innerHTML=payActions(allData.pay_apps[0]).map(function(a){return '<option>'+a[0]+'</option>';}).join('');
    sel.value=${JSON.stringify(action)};
    var amt=document.getElementById('pa-amount');
    ${typed==null?'':`amt.value=${JSON.stringify(String(typed))};`}
    payActionChanged();
    return {value:amt.value, readonly:!!amt.getAttribute('readonly'),
            locked:String(amt.className||'').indexOf('fig-locked')>=0,
            hint:(document.getElementById('pa-amount-hint')||{}).textContent||''};
  })()`);

console.log('Approving as filed approves what was filed');
{
  const a=setup('Approve and Sign', '100000');
  ok(a.value==='100,000', 'the field shows the amount asked for');
  ok(a.readonly, 'and will not take a different one');
  ok(a.locked, 'and is drawn as locked, so nobody types at it and wonders why nothing happens');
  ok(/modify and sign/i.test(a.hint), 'the hint says which action does let you change it');
}

console.log('Modify and Sign is the action that means "a different number"');
{
  const m=setup('Modify and Sign', '100000');
  ok(!m.readonly, 'the field opens');
  ok(!m.locked, 'and stops reading as locked');
  ok(m.value==='100,000', 'starting from what was asked for, which is usually most of the answer');
  ok(/comments/i.test(m.hint), 'and asks for the reason, because a cut with no explanation is not reviewable');
}

console.log('A denial approves nothing');
{
  const d=setup('Deny', '100000');
  ok(d.value==='0', 'zero');
  ok(d.readonly, 'and not negotiable');
  ok(/denial/i.test(d.hint), 'said plainly rather than left as a bare 0');
}

console.log('Switching back puts the figure back');
{
  // The one that matters: type 1 into a modified amount, change your mind, and
  // approve as filed. The typed figure must not survive the change of mind.
  const back=P.run(`
    (function(){
      allData.pay_apps=[{'App #':'PA #01','Contractor':'Summit Builders','Copy Type':'Final',
        'Status':'Uploaded — awaiting Fidevia','Requested Amount':'100000'}];
      PAY_CTX={idx:0};
      document.getElementById('pa-details').style.display='none';
      var sel=document.getElementById('pa-action');
      sel.innerHTML=payActions(allData.pay_apps[0]).map(function(a){return '<option>'+a[0]+'</option>';}).join('');
      sel.value='Modify and Sign'; payActionChanged();
      document.getElementById('pa-amount').value='1';
      sel.value='Approve and Sign'; payActionChanged();
      return document.getElementById('pa-amount').value;
    })()`);
  ok(back==='100,000', 'approving as filed means as filed, whatever was typed a moment ago');
}

console.log('Where the figure comes from');
{
  ok(P.run(`(function(){
    allData.pay_apps=[{'Requested Amount':'100000'}]; PAY_CTX={idx:0};
    document.getElementById('pa-details').style.display='none';
    return payReqNow(); })()`)===100000, 'the row, once Fidevia has recorded it');
  ok(P.run(`(function(){
    allData.pay_apps=[{'Requested Amount':'100000'}]; PAY_CTX={idx:0};
    document.getElementById('pa-details').style.display='';
    setMoneyField('pa-req','250000');
    return payReqNow(); })()`)===250000,
    'and the form while they are still typing it, since the row has not caught up yet');
  ok(P.run(`(function(){ PAY_CTX=null; allData.pay_apps=[];
    document.getElementById('pa-details').style.display='none';
    return payReqNow(); })()`)===0, 'and nothing, rather than throwing, with no application open');
}

console.log('A lock only the browser knows about is not a lock');
{
  const sub=html.split('async function submitPayAction(){')[1].split('\nfunction updateContractBar')[0];
  ok(/_modify \? amount : payReqNow\(\)/.test(sub),
     'what is saved is read off the action, not off a field a page could have unlocked');
  ok(/if\(!pencil && !_ext && _modify && !\(amount>0\)\)/.test(sub),
     'and "Modify and Sign" with nothing in the box is refused rather than saved as zero');
  ok(/PAY_NOTE_REQUIRED=\/noted\|modif\|/.test(html),
     'a modified figure needs its reason, like every other outcome the contractor has to act on');
}

console.log(bad ? `FAIL tools-test-payamount.mjs — ${bad} of ${n}` : `ok   tools-test-payamount.mjs — ${n} assertions`);
process.exit(bad?1:0);
