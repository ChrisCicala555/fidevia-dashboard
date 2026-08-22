// Company-wide attention: everyone at a firm sees the same queue.
const contacts=[
  {Name:'Sarah Draper', Company:'Draper & Associates', Email:'sarah@draper.test'},
  {Name:'Tom Reed',     Company:'Draper & Associates', Email:'tom@draper.test'},
  {Name:'Andre Martin', Company:'Fidevia',             Email:'amartin@fidevia.com'},
  {Name:'Brian Kessler',Company:'Summit Builders',     Email:'bk@summit.test'},
];
const companyOf = n => (contacts.find(c=>c.Name.toLowerCase()===String(n||'').trim().toLowerCase())||{}).Company||'';

function queueFor(myCo, myName, items){
  const lc=s=>String(s||'').trim().toLowerCase();
  const nameMatches=v=>lc(v)===lc(myName)||lc(v).startsWith(lc(myName)+' (');
  const coMatches=v=>!!myCo && lc(v)===lc(myCo);
  const personIsOurs=p=>!!p && (nameMatches(p)||coMatches(companyOf(p)));
  return items.filter(i=>personIsOurs(i.with)).map(i=>({item:i.id, mine:nameMatches(i.with)}));
}

const items=[
  {id:'RFI-001', with:'Sarah Draper'},
  {id:'RFI-002', with:'Tom Reed'},
  {id:'SUB-001', with:'Andre Martin'},
  {id:'SUB-002', with:'Brian Kessler'},
];

let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

const sarah = queueFor('Draper & Associates','Sarah Draper',items);
ck('Sarah sees both Draper items', sarah.length===2, sarah.map(x=>x.item).join(', '));
ck('one is flagged as hers personally', sarah.filter(x=>x.mine).length===1);

const tom = queueFor('Draper & Associates','Tom Reed',items);
ck('Tom sees the SAME two items', tom.length===2 && tom.map(x=>x.item).join()===sarah.map(x=>x.item).join(),
   '<-- nothing stalls when Sarah is away');

ck('Draper does not see Fidevia items', !sarah.some(x=>x.item==='SUB-001'));
ck('Draper does not see Summit items', !sarah.some(x=>x.item==='SUB-002'));

const fidevia = queueFor('Fidevia','Andre Martin',items);
ck('Fidevia sees only its own', fidevia.length===1 && fidevia[0].item==='SUB-001');

const summit = queueFor('Summit Builders','Someone New',items);
ck('a new Summit hire sees the Summit item', summit.length===1 && summit[0].item==='SUB-002',
   '<-- no personal assignment needed');
ck('and it is not flagged as theirs personally', summit[0].mine===false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
