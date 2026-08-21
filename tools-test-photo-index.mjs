// Round-trip the photo attribution index through the same CSV helpers the app uses.
const csvEsc = v => { const s=String(v==null?'':v); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
function parseCSV(text){
  const lines=text.replace(/\r/g,'').split('\n').filter(l=>l.length);
  const pl=l=>{const r=[];let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];
    if(ch==='"'){ if(q&&l[i+1]==='"'){c+='"';i++;} else q=!q; }
    else if(ch===','&&!q){r.push(c.trim());c='';} else c+=ch;} r.push(c.trim()); return r;};
  const h=pl(lines[0]);
  return {headers:h, rows:lines.slice(1).map(l=>{const v=pl(l),o={};h.forEach((k,i)=>o[k]=v[i]!==undefined?v[i]:'');return o;})};
}
const toCSV=(h,rows)=>h.join(',')+'\n'+rows.map(r=>h.map(k=>csvEsc(r[k])).join(',')).join('\n')+'\n';

const H=['File ID','File Name','Date Folder','Uploaded By','Uploaded By Email','Uploaded At'];
let pass=0,fail=0; const ck=(n,c,x='')=>{(c?pass++:fail++);console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  '+x:''));};

// A name containing a comma is the classic CSV break
const rows=[
 {'File ID':'111','File Name':'east wing, grid A-D.jpg','Date Folder':'2026-08-19','Uploaded By':'Chris Cicala (Fidevia)','Uploaded By Email':'c@fidevia.com','Uploaded At':'2026-08-19T20:15:00Z'},
 {'File ID':'222','File Name':'panel "104".jpg','Date Folder':'2026-08-19','Uploaded By':"O'Brien Steel",'Uploaded By Email':'x@obrien.test','Uploaded At':'2026-08-19T20:15:00Z'},
];
const back=parseCSV(toCSV(H,rows)).rows;
ck('comma in filename survives', back[0]['File Name']==='east wing, grid A-D.jpg', back[0]['File Name']);
ck('quotes in filename survive', back[1]['File Name']==='panel "104".jpg', back[1]['File Name']);
ck('uploader preserved', back[0]['Uploaded By']==='Chris Cicala (Fidevia)');
ck('apostrophe preserved', back[1]['Uploaded By']==="O'Brien Steel");

// Appending must not lose prior rows
const appended=parseCSV(toCSV(H, back.concat([{'File ID':'333','File Name':'c.jpg','Date Folder':'2026-08-20','Uploaded By':'Andre Martin (Fidevia)','Uploaded By Email':'a@fidevia.com','Uploaded At':'2026-08-20T09:00:00Z'}]))).rows;
ck('append keeps existing rows', appended.length===3 && appended[0]['File ID']==='111');

// Lookup map, as the viewer builds it
const meta={}; appended.forEach(r=>{ if(r['File ID']) meta[r['File ID']]={by:r['Uploaded By'],at:r['Uploaded At']}; });
ck('viewer lookup by file id', meta['333'].by==='Andre Martin (Fidevia)');
ck('unknown photo yields no entry', meta['999']===undefined, '(shows "Uploader not recorded")');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
