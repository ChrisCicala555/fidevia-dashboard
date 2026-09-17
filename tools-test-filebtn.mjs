// "Don't let contractors upload without attaching a file."
//
// It was already refused on submit, but only on submit: the form had been
// filled in and the button pressed before anything said so, and the person was
// left to work out what had gone wrong. The button says it instead, and stays
// off until there is a file.
import fs from 'fs';
import { bootPage, SEED } from './tools-harness.mjs';
let n=0, bad=0;
const ok=(c,m)=>{ n++; if(!c){ bad++; console.error('  FAIL:',m); } };
const html=fs.readFileSync('index.html','utf8');
const P=bootPage(); P.run(SEED);
P.run(`['modal-submit-btn','file-req-note','f-file'].forEach(function(id){
    var el=document.createElement(id==='f-file'?'input':(id==='file-req-note'?'span':'button'));
    el.id=id; el.files=[]; document.body.appendChild(el);
    document.getElementById=(function(p){ return function(x){ return x===id?el:p(x); }; })(document.getElementById);
  });`);
const btnOff=()=>P.run(`document.getElementById('modal-submit-btn').disabled`);
const note=()=>String(P.run(`document.getElementById('file-req-note').textContent`));
const shown=()=>P.run(`document.getElementById('file-req-note').style.display`);
const pick=(yes)=>P.run(`document.getElementById('f-file').files=${yes?"[{name:'pa.pdf'}]":'[]'};`);

console.log('The button waits for the file');
{
  P.run(`FILE_REQUIRED_NOW=true;`); pick(false); P.run(`fileReqCheck();`);
  ok(btnOff()===true, 'nothing to submit, nothing to press');
  ok(note()==='Choose a file to submit.', 'and it says what is missing rather than leaving a dead button');
  ok(shown()==='', 'with the note visible');
  pick(true); P.run(`fileReqCheck();`);
  ok(btnOff()===false, 'a file chosen turns it on');
  ok(note()==='' && shown()==='none', 'and takes the note away');
  pick(false); P.run(`fileReqCheck();`);
  ok(btnOff()===true, 'clearing it turns the button off again');
}
{
  // Fidevia records things that arrived by other means, so the form does not
  // hold them to a document.
  P.run(`FILE_REQUIRED_NOW=false;`); pick(false); P.run(`fileReqCheck();`);
  ok(btnOff()===false, 'where no file is required the button is live from the start');
  ok(note()==='' && shown()==='none', 'and says nothing');
}
{
  P.run(`FILE_REQUIRED_NOW=true; document.getElementById('f-file').files=null; fileReqCheck();`);
  ok(btnOff()===true, 'a file input with nothing on it at all counts as no file, not as an error');
}

console.log('Which forms it applies to');
{
  const o=html.split('const req=viewingAsExternal() && !!FILE_REQUIRED_EXTERNAL[type];')[1].split('\n  }')[0];
  ok(/FILE_REQUIRED_NOW = req;/.test(o),
     'the same test that draws the asterisk arms the button — one rule, not two');
  ok(/if\(fi\) fi\.onchange=fileReqCheck;/.test(o), 'and the file input drives it');
  ok(/if\(fi && req\) try\{ fi\.value=''; \}catch\(e\)\{\}/.test(o),
     'a form reopened after a filing is cleared, so the button cannot be enabled by a ghost');
  ok(/try\{ fileReqCheck\(\); \}catch\(e\)\{\}/.test(html), 'and the form is checked as it opens');
  // The contractor's own upload form is the one in the screenshot.
  const keys=Object.keys(P.run(`FILE_REQUIRED_EXTERNAL`)).sort();
  ok(keys.join()==='co,payapp,payapp_ext,rfi,submittal',
     'every form a contractor files a document through, and no others');
  keys.forEach(k=>ok(/\S/.test(P.run(`FILE_REQUIRED_EXTERNAL[${JSON.stringify(k)}]`)),
    k+' says what to attach and why, rather than "required"'));
}

console.log('And the refusal underneath is still there');
{
  ok(/if\(viewingAsExternal\(\) && FILE_REQUIRED_EXTERNAL\[currentModal\] && !attachId\)\{\s*\n\s*throw new Error/.test(html),
     'a disabled button is a courtesy to the person using the page, not a rule');
  ok(/id="file-req-note"/.test(html), 'and there is somewhere to say why the button is off');
}

console.log((bad?'FAIL':'ok  ')+' tools-test-filebtn.mjs — '+n+' assertions'+(bad?', '+bad+' failed':''));
process.exit(bad?1:0);
