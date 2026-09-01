// Named allowances per contract, and change orders drawing against them.
import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };

// ── model ──
ok(/function allowanceLetter/.test(html), 'allowances are lettered');
ok(/function allowancesFor/.test(html), 'a contractor has a list');
ok(/function allowanceRemainingById/.test(html), 'remaining is available per allowance');
{
  const af = html.split('function allowancesFor')[1].split('function allowanceFor')[0];
  ok(/const legacy=payNum\(c\.allowance\)/.test(af), 'the old single number is still read');
  ok(/legacy:true/.test(af), 'and marked as such');
  ok(/id:'A'/.test(af), 'as Allowance A, so existing figures do not move');
}
{
  const tot = html.split('function allowanceFor(name)')[1].split('function coAllowanceId')[0];
  ok(/allowancesFor\(name\)\.reduce/.test(tot), 'the total is the sum of the list');
}

// lettering
{
  const letter=i=>{ let n=i,out=''; do{ out=String.fromCharCode(65+(n%26))+out; n=Math.floor(n/26)-1; }while(n>=0); return out; };
  ok(letter(0)==='A' && letter(1)==='B' && letter(25)==='Z', 'A through Z');
  ok(letter(26)==='AA', 'and past Z (got '+letter(26)+')');
}

// ── the editor ──
ok(/function alwRenderAll/.test(html) && /function alwGather/.test(html), 'one editor, rendered twice');
ok(/id="np-allowances"/.test(html), 'the wizard has it');
ok(/id="ps-allowances"/.test(html), 'and so does Settings');
ok(/data-pane="allowances"/.test(html), 'Settings has an Allowances tab');
ok(/\['project','dates','allowances','workflows','notifs'\]/.test(html), 'the tab is routable');
{
  const ar = html.split('function alwRenderAll')[1].split('function alwGather')[0];
  ok(/Add a contractor first/.test(ar), 'with no contractors it says why it is empty');
  ok(/an allowance sits inside a contract/.test(ar), 'and that an allowance belongs to one');
}
{
  const ag = html.split('function alwGather')[1].split('function wizGatherContractors')[0];
  ok(/id: allowanceLetter\(i\)/.test(ag), 'letters are assigned by position, so they always run A, B, C');
  ok(/filter\(a=>a\.name\|\|a\.amount\)/.test(ag), 'an entirely blank row is dropped');
}
ok(/function alwReletter/.test(html), 'removing one re-letters the rest');

// ── saving ──
{
  const sa = html.split('async function saveAllowances')[1].split('function relocateDatesPanel')[0];
  ok(/delete next\.allowance/.test(sa), 'the old single field is removed once a list exists');
  ok(/cannot disagree about the total/.test(sa), 'and why');
  ok(/hasOwnProperty\.call\(got, x\.name\)/.test(sa), 'a contractor not on screen is left alone');
}

// ── change orders ──
ok(/'Applied to Allowance','Allowance','Cause'/.test(html), 'the log records which allowance');
ok(/id="f-allow-id"/.test(html), 'the form asks which');
ok(/function coAllowOptions/.test(html), 'options come from that contract');
{
  const cn = html.split('function coAllowNote')[1].split('function allowanceUsedById')[0];
  ok(/would exceed it/.test(cn), 'an over-draw is flagged before submitting');
  ok(/or the draw cannot be tracked/.test(cn), 'an amount with no allowance named is flagged');
  ok(/after this draw/.test(cn), 'and what is left afterwards is shown');
}
{
  const ub = html.split('function allowanceUsedById')[1].split('function allowanceUsedBy\\(name\\)')[0];
  ok(/!coAllowanceId\(r\) && want==='A'/.test(ub),
     'a draw recorded before allowances were named counts against A, so totals still add up');
}

// ── PCO ──
{
  const gb = html.split('function coGenBtn')[1].split('function archiveBtn')[0];
  ok(/const label=appr\?'Generate CO':'Generate PCO'/.test(gb), 'PCO before approval, CO after');
  ok(!/if\(!coIsApproved\(r\)\) return '';/.test(gb), 'the approval gate is gone');
  ok(/wfIsStopped\(r\)\) return ''/.test(gb), 'but nothing is issued for a change decided against');
}

// ── summary ──
ok(/allowList\.length>1/.test(html), 'a contract with several allowances says so');
ok(/allowanceRemainingById\(c\.name,a\.id\)/.test(html), 'with the breakdown on hover');

// behaviour
{
  const payNum=v=>parseFloat(String(v||'0').replace(/[^0-9.\-]/g,''))||0;
  const forC=c=>{ if(Array.isArray(c.allowances)&&c.allowances.length)
      return c.allowances.map((a,i)=>({id:a.id||String.fromCharCode(65+i),name:a.name||'',amount:payNum(a.amount)}));
    const l=payNum(c.allowance); return l?[{id:'A',name:'Allowance',amount:l}]:[]; };
  ok(forC({allowance:'25000'}).length===1 && forC({allowance:'25000'})[0].amount===25000,
     'a legacy contractor yields one allowance');
  ok(forC({allowances:[{name:'Hardware',amount:10000},{name:'Paving',amount:5000}]}).map(a=>a.id).join('')==='AB',
     'a list yields A and B');
  ok(forC({}).length===0, 'no allowance yields none');
  const total=c=>forC(c).reduce((s,a)=>s+a.amount,0);
  ok(total({allowances:[{amount:10000},{amount:5000}]})===15000, 'the total sums the list');
  ok(total({allowance:'25000'})===25000, 'and matches the old figure for a legacy contract');
}

console.log((bad?'FAIL ':'ok   ')+'tools-test-allowances.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
