(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>esc(s).replace(/\^(-?\d+)/g,'<sup>$1</sup>').replace(/sqrt\(/g,'√(');
const LET='ABCD';
const nid=p=>p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
const when=ms=>ms?new Date(ms).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'—';
let db=null,root=null,auth=null,migrated=false,students={},questions={},sessions={},classes={},locks={},reqs={};
/* Use the administrator's own Firebase app created in admin-auth.js (separate sign-in from the student page). */
if(window.FIREBASE_READY&&window.firebase&&window.MQ_ADMIN_AUTH){try{db=window.MQ_ADMIN_AUTH.db;root=db.ref();auth=window.MQ_ADMIN_AUTH.auth;}catch(e){console.error(e);}}
const ref=p=>root.child('mathQuiz/'+p);
const DEF=['Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6','JSS 1','JSS 2','JSS 3','SS 1','SS 2','SS 3'];
const slug=n=>'c_'+String(n).toLowerCase().replace(/[^a-z0-9]+/g,''),classOrder=n=>{const i=DEF.indexOf(n);return i<0?99:i;};
const idByName=n=>{const f=Object.entries(classes).find(([,c])=>String(c.name).toLowerCase()===String(n||'').trim().toLowerCase());return f?f[0]:'';};
const canonTopic=t=>{t=String(t||'').replace(/\s+/g,' ').trim()||'General';const f=Object.values(questions).map(q=>q&&q.topic).find(x=>x&&String(x).toLowerCase()===t.toLowerCase());return f||t;};
const clsList=()=>Object.entries(classes).sort((a,b)=>(a[1].order||0)-(b[1].order||0)||String(a[1].name).localeCompare(String(b[1].name),undefined,{numeric:true}));
function fillCls(el,ph){const cur=el.value;el.innerHTML='<option value="">'+(ph||'Select class…')+'</option>'+clsList().map(([k,c])=>`<option value="${esc(k)}">${esc(c.name)}</option>`).join('');if(classes[cur])el.value=cur;}
function toast(t){const el=$('toast');el.textContent=t;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),Math.max(3800,t.length*55));}
const dbErr=e=>e&&e.code==='PERMISSION_DENIED'?'Firebase rules blocked this action.':'Check your connection and try again.';
function tab(t){document.querySelectorAll('.mq-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));['classes','students','questions','results','devices'].forEach(n=>$('tab-'+n).classList.toggle('hidden',n!==t));}
document.querySelectorAll('.mq-tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('seedBtn').textContent=`Load starter bank (${(window.MQ_SEED||[]).length} questions)`;

/* ---------- live data ---------- */
const subs=[];let ready={};
function stopData(){subs.splice(0).forEach(f=>{try{f();}catch(e){}});ready={};migrated=false;students={};questions={};classes={};sessions={};locks={};reqs={};}
function denied(){toast('Firebase rules blocked reading the data. Publish the database.rules.json provided.');}
function listen(name,q,set){const fn=s=>{set(s.val()||{});ready[name]=true;if(!migrated&&ready.students&&ready.questions&&ready.classes){migrated=true;migrate();}renderAll();};q.on('value',fn,e=>{console.error(e);if(e&&e.code==='PERMISSION_DENIED')return denied();toast('Could not read '+name+'. '+dbErr(e));});subs.push(()=>q.off('value',fn));}
function startData(){stopData();listen('students',ref('students'),v=>students=v);listen('questions',ref('questions'),v=>questions=v);listen('classes',ref('classes'),v=>classes=v);listen('sessions',ref('sessions').orderByChild('completedAt').limitToLast(500),v=>sessions=v);listen('locks',ref('deviceLocks'),v=>locks=v);listen('requests',ref('deviceRequests'),v=>reqs=v);}
function maybeStart(){if(db&&window.MQ_ADMIN_AUTH&&window.MQ_ADMIN_AUTH.approved)startData();}
window.addEventListener('mq-admin-in',maybeStart);window.addEventListener('mq-admin-out',stopData);
if(!db)toast('Firebase is not configured. Update firebase-config.js.');else maybeStart();

function renderAll(){
 const ss=Object.entries(sessions),avg=ss.length?Math.round(ss.reduce((a,[,s])=>a+(Number(s.score)||0),0)/ss.length):null;
 $('aStudents').textContent=Object.keys(students).length;$('aQuestions').textContent=Object.keys(questions).length;$('aSessions').textContent=ss.length;$('aAvg').textContent=avg===null?'—':avg+'%';
 renderStudents();renderDevices();
 // questions
 const topics=[...new Set(Object.values(questions).map(q=>q.topic||'General'))].sort(),levels=[...new Set(Object.values(questions).map(q=>q.level).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 $('topicList').innerHTML=topics.map(t=>`<option value="${esc(t)}">`).join('');$('classesTable').innerHTML=clsList().length?clsList().map(([k,c])=>{const ns=Object.values(students).filter(s=>s.classId===k||(!s.classId&&s.className===c.name)).length,nq=Object.values(questions).filter(q=>qIds(q).includes(k)).length;return `<tr><td><b>${esc(c.name)}</b></td><td>${ns}</td><td>${nq}</td><td><div class="mq-acts"><button class="btn danger" data-dc="${esc(k)}">Delete</button></div></td></tr>`;}).join(''):'<tr><td colspan="4">No classes yet. Add one above or use the default set.</td></tr>';fillCls($('sClass'));fillQc();fillCls($('bulkClass'));fillCls($('xlsClass'),'Class column in file');fillCls($('qClsFilter'),'All classes');fillStu($('qStudents'));fillStu($('bulkStudent'),'Choose student…');
 const cur=$('qFilter').value;$('qFilter').innerHTML='<option value="">All topics</option>'+topics.map(t=>`<option>${esc(t)}</option>`).join('');if(topics.includes(cur))$('qFilter').value=cur;
 const qq=$('qSearch').value.toLowerCase(),qf=$('qFilter').value;
 const cf=$('qClsFilter').value,sort=$('qSort').value;
 const cname=q=>{const i=qIds(q)[0];return i&&classes[i]?classes[i].name:'';},corder=q=>{const i=qIds(q)[0];return i&&classes[i]?(classes[i].order||0):999;};
 const NUM={numeric:true,sensitivity:'base'};
 const fq=Object.entries(questions).filter(([,q])=>(!qf||(q.topic||'General')===qf)&&(!cf||qIds(q).includes(cf))&&`${q.topic||''} ${q.level||''} ${q.text||''}`.toLowerCase().includes(qq)).sort((a,b)=>{const A=a[1],B=b[1],
  byTopic=(A.topic||'General').localeCompare(B.topic||'General',undefined,NUM),byClass=corder(A)-corder(B)||cname(A).localeCompare(cname(B),undefined,NUM),byText=String(A.text||'').localeCompare(String(B.text||''),undefined,NUM);
  if(sort==='class')return byClass||byTopic||byText;
  if(sort==='newest')return (B.createdAt||0)-(A.createdAt||0)||byTopic;
  if(sort==='status')return String(A.status||'published').localeCompare(String(B.status||'published'))||byTopic||byClass||byText;
  return byTopic||byClass||byText;});
 const cap=window.__qcap||50;window.__fq=fq.map(x=>x[0]);
 // per-topic totals and per-class coverage (a student's quiz draws 20 from the topic in their class)
 const tcount={},cov={},shown={};
 Object.values(questions).forEach(q=>{const t=q.topic||'General';tcount[t]=(tcount[t]||0)+1;if(q.status!=='draft'){const c=cname(q)||'Individual students';(cov[t]=cov[t]||{})[c]=((cov[t]||{})[c]||0)+1;}});
 fq.forEach(([,q])=>{const t=q.topic||'General';shown[t]=(shown[t]||0)+1;});
 const covTxt=t=>Object.entries(cov[t]||{}).sort((a,b)=>a[0].localeCompare(b[0],undefined,NUM)).map(([c,n])=>`${esc(c)}: <b${n<20?' style="color:#b54708"':''}>${n}</b>${n<20?' ⚠ needs '+(20-n)+' more':''}`).join(' · ')||'No published questions';
 $('topicBar').innerHTML=topics.length?`<button type="button" class="mq-chip" data-tc="" style="cursor:pointer;border:0;${qf?'':'background:var(--blue);color:#fff'}">All · ${Object.keys(questions).length}</button>`+topics.map(t=>`<button type="button" class="mq-chip" data-tc="${esc(t)}" style="cursor:pointer;border:0;${qf===t?'background:var(--blue);color:#fff':''}">${esc(t)} · ${tcount[t]}</button>`).join(''):'';
 let last=null,html='';
 fq.slice(0,cap).forEach(([k,q])=>{const t=q.topic||'General';
  if(sort==='topic'&&t!==last){last=t;html+=`<tr class="mq-grp"><td colspan="7"><div class="mq-grph"><span><b>${esc(t)}</b> · ${tcount[t]} question${tcount[t]===1?'':'s'}${shown[t]!==tcount[t]?` (${shown[t]} shown)`:''}<br><small>Published per class: ${covTxt(t)}</small></span><span class="mq-acts"><button class="btn" type="button" data-selt="${esc(t)}">Select topic</button><button class="btn danger" type="button" data-dt="${esc(t)}">Delete topic</button></span></div></td></tr>`;}
  html+=`<tr><td><input type="checkbox" data-sq="${esc(k)}" ${SEL.has(k)?'checked':''}></td><td>${esc(t)}</td><td>${assignedTxt(q)}</td><td>${fmt(q.text)}</td><td>${LET[q.answer]||'?'}. ${fmt((q.options||[])[q.answer]||'')}</td><td>${esc(q.status||'published')}</td><td><div class="mq-acts"><button class="btn" data-eq="${esc(k)}">Edit</button><button class="btn danger" data-dq="${esc(k)}">Delete</button></div></td></tr>`;});
 if(fq.length>cap)html+=`<tr><td colspan="7"><button class="btn" id="moreQ">Show more (${fq.length-cap} left)</button></td></tr>`;
 $('questionsTable').innerHTML=fq.length?html:'<tr><td colspan="7">No questions match. Add one above or load the starter bank.</td></tr>';
 // results
 const rq=$('rSearch').value.toLowerCase();
 const fr=ss.filter(([,s])=>`${s.studentName||''} ${s.title||''}`.toLowerCase().includes(rq)).sort((a,b)=>(b[1].completedAt||0)-(a[1].completedAt||0));
 $('resultsTable').innerHTML=fr.length?fr.slice(0,200).map(([,s])=>`<tr><td>${when(s.completedAt)}</td><td>${esc(s.studentName)}</td><td>${esc(s.title)}</td><td><b>${Math.round(s.score||0)}%</b></td><td>${s.correct||0}/${s.total||0}</td><td>${Math.floor((s.durationSeconds||0)/60)}m ${(s.durationSeconds||0)%60}s</td></tr>`).join(''):'<tr><td colspan="6">No quizzes completed yet.</td></tr>';
 bind();
}
function bind(){
 document.querySelectorAll('[data-es]').forEach(b=>b.onclick=()=>editStudent(b.dataset.es));
 document.querySelectorAll('[data-ts]').forEach(b=>b.onclick=async()=>{const s=students[b.dataset.ts];try{await ref('students/'+b.dataset.ts+'/active').set(s.active===false);toast('Student status updated.');}catch(e){toast('Update failed. '+dbErr(e));}});
 document.querySelectorAll('[data-ds]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this student? Past results remain. The login account itself stays in Firebase Authentication, but it can no longer open Math Quiz.'))return;const sid=b.dataset.ds,up={};up['mathQuiz/students/'+sid]=null;up['mathQuiz/assignments/'+sid]=null;up['mathQuiz/deviceLocks/'+sid]=null;up['mathQuiz/deviceRequests/'+sid]=null;Object.entries(questions).forEach(([k,q])=>{if(q&&q.studentIds&&q.studentIds[sid])up['mathQuiz/questions/'+k+'/studentIds/'+sid]=null;});try{await root.update(up);toast('Student deleted.');}catch(e){toast('Delete failed. '+dbErr(e));}});
 document.querySelectorAll('[data-cv]').forEach(b=>b.onclick=()=>editStudent(b.dataset.cv,true));
 document.querySelectorAll('[data-lk]').forEach(b=>b.onclick=async()=>{const k=b.dataset.lk,L=locks[k];if(!L)return;const to=L.state==='locked'?'unlocked':'locked';if(to==='unlocked'&&!confirm('Unlock this student’s device? The student is signed out on the current device, and the next sign-in on any device becomes the new locked device.'))return;try{await ref('deviceLocks/'+k+'/state').set(to);toast(to==='unlocked'?'Device unlocked.':'Device locked again.');}catch(e){toast('Update failed. '+dbErr(e));}});
 document.querySelectorAll('[data-pw]').forEach(b=>b.onclick=async()=>{const s=students[b.dataset.pw];if(!s||!s.email||!auth)return;if(!confirm('Send a password reset email to '+s.email+'?'))return;try{await auth.sendPasswordResetEmail(s.email);toast('Password reset email sent to '+s.email+'.');}catch(e){toast(authErr(e));}});
 document.querySelectorAll('[data-eq]').forEach(b=>b.onclick=()=>editQuestion(b.dataset.eq));
 document.querySelectorAll('[data-dq]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this question?'))return;const k=b.dataset.dq,up={};up['mathQuiz/questions/'+k]=null;Object.keys((questions[k]||{}).studentIds||{}).forEach(s=>{up['mathQuiz/assignments/'+s+'/'+k]=null;});try{await root.update(up);if($('qId').value===k)clearQ();toast('Question deleted.');}catch(e){toast('Delete failed. '+dbErr(e));}});
 document.querySelectorAll('[data-dc]').forEach(b=>b.onclick=async()=>{const t=b.closest('tr').children;if(+t[1].textContent||+t[2].textContent)return toast('Move or delete this class’s students and questions first.');if(!confirm('Delete this class?'))return;try{await ref('classes/'+b.dataset.dc).remove();toast('Class deleted.');}catch(e){toast('Delete failed. '+dbErr(e));}});
 document.querySelectorAll('[data-dt]').forEach(b=>b.onclick=()=>{const t=b.dataset.dt,ks=Object.keys(questions).filter(k=>(questions[k].topic||'General')===t);if(!ks.length)return;if(!confirm('Delete the topic "'+t+'"?\n\nThis permanently deletes all '+ks.length+' question(s) in this topic, in every class. This cannot be undone.'))return;delQs(ks,'Topic "'+t+'" deleted');});
 document.querySelectorAll('[data-selt]').forEach(b=>b.onclick=()=>{const t=b.dataset.selt;Object.keys(questions).filter(k=>(questions[k].topic||'General')===t).forEach(k=>SEL.add(k));renderAll();toast('Whole topic selected. Use the bar above the table to move, publish or delete.');});
 document.querySelectorAll('[data-tc]').forEach(b=>b.onclick=()=>{$('qFilter').value=b.dataset.tc;window.__qcap=50;renderAll();});
 document.querySelectorAll('[data-sq]').forEach(c=>c.onchange=()=>{c.checked?SEL.add(c.dataset.sq):SEL.delete(c.dataset.sq);syncSel();});syncSel();
 const m=$('moreQ');if(m)m.onclick=()=>{window.__qcap=(window.__qcap||50)+50;renderAll();};
}
['sSearch','qSearch','rSearch'].forEach(i=>$(i).oninput=()=>{window.__qcap=50;renderAll();});$('qFilter').onchange=()=>{window.__qcap=50;renderAll();};$('qSort').onchange=()=>{window.__qcap=50;renderAll();};

/* ---------- access helpers: classes and individual students ---------- */
function fillStu(el,ph){const cur=new Set([...el.selectedOptions].map(o=>o.value)),list=Object.entries(students).filter(([,s])=>s).sort((a,b)=>String(a[1].name).localeCompare(String(b[1].name)));el.innerHTML=(ph?'<option value="">'+esc(ph)+'</option>':'')+list.map(([k,s])=>`<option value="${esc(k)}">${esc(s.name)} (${esc(s.className||'no class')})</option>`).join('');[...el.options].forEach(o=>{if(o.value&&cur.has(o.value))o.selected=true;});}
function setStu(q){const ids=q.studentIds||{};[...$('qStudents').options].forEach(o=>{o.selected=!!ids[o.value];});}
function assignedTxt(q){const c=qIds(q).map(i=>classes[i]?classes[i].name:'?'),st=Object.keys(q.studentIds||{}).map(i=>students[i]?students[i].name:'?');return [c.length?esc(c.join(', ')):'',st.length?'👤 '+esc(st.join(', ')):''].filter(Boolean).join('<br>')||(q.demo?'<small>Free demo only</small>':'<small>Not assigned</small>');}
// keeps the per-student index (assignments/{studentId}/{questionId}) in step with questions[].studentIds
function assignPaths(up,qid,oldIds,newIds){oldIds.filter(x=>!newIds.includes(x)).forEach(s=>{up['mathQuiz/assignments/'+s+'/'+qid]=null;});newIds.forEach(s=>{up['mathQuiz/assignments/'+s+'/'+qid]=true;});}
// one-time upgrade of older records so the new access rules work (passcode lookup key, class ids)
function migrate(){const up={};let n=0;
 Object.entries(students).forEach(([k,s])=>{if(!s)return;const b='mathQuiz/students/'+k+'/';if(!s.classId){const c=idByName(s.className);if(c){up[b+'classId']=c;n++;}}});
 Object.entries(questions).forEach(([k,q])=>{if(!q||q.classId)return;const c=q.classIds?Object.keys(q.classIds)[0]:idByName(q.level);if(c){up['mathQuiz/questions/'+k+'/classId']=c;n++;}});
 if(n)root.update(up).then(()=>toast('Upgraded '+n+' older record(s) for the new access rules.')).catch(e=>{console.error(e);toast('Upgrade of older records failed. '+dbErr(e));});}
/* ---------- deleting questions: one, selected, a whole topic, or everything ---------- */
async function delQs(keys,label){
 keys=keys.filter(k=>questions[k]);if(!keys.length)return toast('Nothing to delete.');
 const paths=[];keys.forEach(k=>{paths.push('mathQuiz/questions/'+k);Object.keys((questions[k]||{}).studentIds||{}).forEach(s=>paths.push('mathQuiz/assignments/'+s+'/'+k));});
 let done=0;
 try{for(let i=0;i<paths.length;i+=300){const up={};paths.slice(i,i+300).forEach(p=>{up[p]=null;});await root.update(up);done=Math.min(paths.length,i+300);}
  if(keys.includes($('qId').value))clearQ();keys.forEach(k=>SEL.delete(k));toast(label+': '+keys.length+' question(s) removed.');}
 catch(e){console.error(e);toast('Delete stopped part-way'+(done?' ('+done+' of '+paths.length+' items removed)':'')+'. '+dbErr(e)+' Try again.');}
}
$('delAllBtn').onclick=()=>{const ks=Object.keys(questions);if(!ks.length)return toast('The question bank is already empty.');
 if(!confirm('Delete ALL '+ks.length+' questions in every topic and class?\n\nStudents will have nothing to practise until you add questions again. Past results are kept. This cannot be undone.'))return;
 if(prompt('Type DELETE (capital letters) to confirm.')!=='DELETE')return toast('Cancelled. Nothing was deleted.');
 delQs(ks,'All questions deleted');};
/* ---------- bulk assignment ---------- */
const SEL=new Set();
function qIds(q){if(q.classIds)return Object.keys(q.classIds);if(q.classId)return [q.classId];const f=idByName(q.level);return f?[f]:[];}
function fillQc(){fillCls($('qLevel'));fillCls($('baClass'));}
function syncSel(){const n=[...SEL].filter(k=>questions[k]).length,f=window.__fq||[];$('selCount').textContent=n;$('bulkBar').classList.toggle('hidden',!n);$('selAll').checked=!!f.length&&f.every(k=>SEL.has(k));}
function setIds(k,ids,up){up[k+'/classIds']=null;up[k+'/classId']=ids[0]||null;up[k+'/level']=ids[0]&&classes[ids[0]]?classes[ids[0]].name:'';up[k+'/updatedAt']=Date.now();}
async function bulk(fn,msg){const keys=[...SEL].filter(k=>questions[k]);if(!keys.length)return;const up={},ex={};keys.forEach(k=>fn(k,questions[k],up,ex));const full={...ex};Object.entries(up).forEach(([p,v])=>{full['mathQuiz/questions/'+p]=v;});try{await root.update(full);toast(`${msg}: ${keys.length} question(s).`);}catch(e){console.error(e);toast('Bulk update failed. '+dbErr(e));}}
$('selAll').onchange=e=>{(window.__fq||[]).forEach(k=>e.target.checked?SEL.add(k):SEL.delete(k));renderAll();};
const pickCls=()=>{const c=$('bulkClass').value;if(!c)toast('Choose a class in the bar first.');return c;};
$('bAdd').onclick=()=>{const c=pickCls();if(c)bulk((k,q,up)=>setIds(k,[c],up),'Moved to '+classes[c].name);};
$('bPub').onclick=()=>bulk((k,q,up)=>{up[k+'/status']='published';},'Published');
$('bDraft').onclick=()=>bulk((k,q,up)=>{up[k+'/status']='draft';},'Set to draft');
$('bDel').onclick=()=>{const ks=[...SEL].filter(k=>questions[k]);if(!ks.length)return;if(!confirm('Delete the '+ks.length+' selected question(s)? This cannot be undone.'))return;delQs(ks,'Deleted');};
const pickStu=()=>{const s=$('bulkStudent').value;if(!s)toast('Choose a student in the bar first.');return s;};
$('bSAdd').onclick=()=>{const s=pickStu();if(s)bulk((k,q,up,ex)=>{up[k+'/studentIds/'+s]=true;up[k+'/updatedAt']=Date.now();ex['mathQuiz/assignments/'+s+'/'+k]=true;},'Assigned to '+(students[s]?students[s].name:'student'));};
$('bSDel').onclick=()=>{const s=pickStu();if(s)bulk((k,q,up,ex)=>{up[k+'/studentIds/'+s]=null;up[k+'/updatedAt']=Date.now();ex['mathQuiz/assignments/'+s+'/'+k]=null;},'Removed student from');};
/* ---------- add many questions to one class ---------- */
function parseQs(txt){const ok=[],bad=[];String(txt).replace(/\r/g,'').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean).forEach((b,i)=>{const raw=['','','',''],qs=[];let ans='',exp='';
 b.split('\n').map(l=>l.trim()).filter(Boolean).forEach(l=>{let m;if(m=l.match(/^([A-Da-d])[\).:]\s*(.+)$/))raw[LET.indexOf(m[1].toUpperCase())]=m[2].trim();else if(m=l.match(/^answer\s*[:=-]\s*(.+)$/i))ans=m[1].trim();else if(m=l.match(/^explanation\s*[:=-]\s*(.+)$/i))exp=m[1].trim();else if(!raw.some(Boolean)&&!ans)qs.push(l);});
 const li=LET.indexOf(ans.charAt(0).toUpperCase()),text=qs.join(' '),options=raw.filter(Boolean);
 if(!text||options.length<2||li<0||!raw[li])bad.push(i+1);else ok.push({text,options,answer:raw.slice(0,li).filter(Boolean).length,explanation:exp});});return {ok,bad};}
$('baText').oninput=()=>{const r=parseQs($('baText').value);$('baInfo').textContent=r.ok.length+' ready'+(r.bad.length?`, ${r.bad.length} need fixing (question ${r.bad.join(', ')})`:'');};
$('baSave').onclick=async()=>{if(!db)return toast('Configure Firebase first.');const c=$('baClass').value,topic=$('baTopic').value.trim();if(!classes[c])return toast('Choose the class first.');if(!topic)return toast('Enter the topic.');
 const r=parseQs($('baText').value);if(!r.ok.length)return toast('No complete questions found. Each needs options and an Answer line.');
 const up={};r.ok.forEach((q,i)=>{up[nid('q')+'_'+i]={topic:canonTopic(topic),classId:c,level:classes[c].name,...q,status:'published',demo:false,createdAt:Date.now(),updatedAt:Date.now()};});
 try{await ref('questions').update(up);toast(`Saved ${r.ok.length} question(s) to ${classes[c].name}.`+(r.bad.length?` Skipped question ${r.bad.join(', ')} (incomplete).`:''));$('baText').value='';$('baInfo').textContent='0 ready';}catch(e){console.error(e);toast('Could not save. '+dbErr(e));}};
/* ---------- classes ---------- */
$('classForm').onsubmit=async e=>{e.preventDefault();if(!db)return toast('Configure Firebase first.');const name=$('cName').value.trim();if(!name)return;if(idByName(name)||classes[slug(name)])return toast('That class already exists.');try{await ref('classes/'+slug(name)).set({name,order:classOrder(name),createdAt:Date.now()});$('classForm').reset();toast('Class added.');}catch(err){toast('Could not add class. '+dbErr(err));}};
$('defClsBtn').onclick=async()=>{if(!db)return toast('Configure Firebase first.');const up={};DEF.forEach((n,i)=>{if(!idByName(n))up[slug(n)]={name:n,order:i,createdAt:Date.now()};});if(!Object.keys(up).length)return toast('Default classes already exist.');try{await ref('classes').update(up);toast('Default classes added.');}catch(e){toast('Could not add classes. '+dbErr(e));}};
/* ---------- students: email + password logins, one device per account ---------- */
function banner(el,html,onCancel){el.innerHTML=html?`<span>${html}</span><button type="button" class="btn" style="padding:7px 13px">Cancel edit</button>`:'';el.classList.toggle('hidden',!html);if(html)el.querySelector('button').onclick=onCancel;}
const genPw=()=>{const A='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789',a=new Uint32Array(10);crypto.getRandomValues(a);return [...a].map(n=>A[n%A.length]).join('');};
function secAuth(){let a=firebase.apps.find(x=>x.name==='mq-create');if(!a)a=firebase.initializeApp(window.FIREBASE_CONFIG,'mq-create');return a.auth();}
const authErr=e=>{const c=(e&&e.code)||'';return c==='auth/email-already-in-use'?'That email already has a login. Use a different email, or remove the old login in Firebase Console > Authentication.':c==='auth/invalid-email'?'That email address is not valid.':c==='auth/weak-password'?'The password is too weak. Use at least 6 characters.':c==='auth/operation-not-allowed'?'Email/Password sign-in is not enabled in Firebase Authentication.':c==='auth/network-request-failed'?'Network error. Check your internet connection.':c==='auth/user-not-found'?'No login exists for that email.':(e&&e.message)||'Unknown error.';};
let sMode='new';
function setMode(m){sMode=m;const edit=m==='edit';$('sEmail').disabled=edit;$('pwRow').classList.toggle('hidden',edit);$('sPass').required=!edit;$('sSubmit').textContent=edit?'Update student':m==='convert'?'Create login for this student':'Create student login';}
function clearS(){$('studentForm').reset();$('studentId').value='';setMode('new');banner($('studentBanner'),'');}
function editStudent(k,convert){const s=students[k];if(!s)return;tab('students');$('studentId').value=k;$('sName').value=s.name||'';$('sEmail').value=s.email||'';$('sPass').value=convert?genPw():'';$('sClass').value=s.classId&&classes[s.classId]?s.classId:idByName(s.className);setMode(convert?'convert':'edit');banner($('studentBanner'),(convert?'Creating a login for existing student: <b>':'Editing student: <b>')+esc(s.name)+'</b>',clearS);$('studentForm').scrollIntoView({behavior:'smooth',block:'start'});}
$('sClear').onclick=clearS;$('sGen').onclick=()=>{$('sPass').value=genPw();};
function showCreds(name,email,pw){const b=$('credBox');b.innerHTML=`<span><b>Login created for ${esc(name)}.</b> Email: <b>${esc(email)}</b> · Password: <b>${esc(pw)}</b><br><small>Copy these details and give them to the student now. The password cannot be shown again.</small></span><span class="mq-acts"><button class="btn" type="button" id="credCopy">Copy details</button><button class="btn" type="button" id="credHide">Dismiss</button></span>`;b.classList.remove('hidden');$('credCopy').onclick=async()=>{try{await navigator.clipboard.writeText('MathCloud Math Quiz login\nEmail: '+email+'\nPassword: '+pw);toast('Login details copied.');}catch(e){toast('Could not copy. Select and copy the details manually.');}};$('credHide').onclick=()=>{b.classList.add('hidden');b.innerHTML='';};}
/* An old passcode-only student becomes a login student: the record, assignments and results move to the new account id. */
async function convertStudent(old,uid,f){
 const o=students[old]||{},up={},P='mathQuiz/',{passcode,passcodeKey,...keep}=o;
 up[P+'students/'+uid]={...keep,uid,legacyId:old,name:f.name,email:f.email,classId:f.cid,className:classes[f.cid].name,active:o.active!==false,updatedAt:Date.now()};
 up[P+'students/'+old]=null;
 const asg=(await ref('assignments/'+old).once('value')).val();
 if(asg){up[P+'assignments/'+uid]=asg;up[P+'assignments/'+old]=null;}
 Object.entries(questions).forEach(([qk,q])=>{if(q&&q.studentIds&&q.studentIds[old]){up[P+'questions/'+qk+'/studentIds/'+uid]=true;up[P+'questions/'+qk+'/studentIds/'+old]=null;}});
 const ss=(await ref('sessions').orderByChild('studentId').equalTo(old).once('value')).val()||{};
 await Promise.all(Object.keys(ss).map(async id=>{up[P+'sessions/'+id+'/studentId']=uid;const a=await ref('sessionAnswers/'+id+'/studentId').once('value');if(a.exists())up[P+'sessionAnswers/'+id+'/studentId']=uid;}));
 await root.update(up);
}
$('studentForm').onsubmit=async e=>{e.preventDefault();if(!db)return toast('Configure Firebase first.');
 const name=$('sName').value.trim(),cid=$('sClass').value,email=$('sEmail').value.trim().toLowerCase(),pw=$('sPass').value,key=$('studentId').value;
 if(!name)return;if(!classes[cid])return toast('Select the student’s class.');
 if(sMode==='edit'){try{await ref('students/'+key).update({name,classId:cid,className:classes[cid].name,updatedAt:Date.now()});toast('Student updated.');clearS();}catch(err){console.error(err);toast('Could not update student. '+dbErr(err));}return;}
 if(!email||pw.length<6)return toast('Enter an email and a password of at least 6 characters.');
 if(Object.values(students).some(s=>s&&String(s.email||'').toLowerCase()===email))return toast('A student with that email already exists.');
 const btn=$('sSubmit');btn.disabled=true;let uid;
 try{const sa=secAuth(),cred=await sa.createUserWithEmailAndPassword(email,pw);uid=cred.user.uid;await sa.signOut();}
 catch(err){console.error(err);btn.disabled=false;return toast(authErr(err));}
 try{
  if(sMode==='convert')await convertStudent(key,uid,{name,email,cid});
  else await ref('students/'+uid).set({uid,name,email,classId:cid,className:classes[cid].name,active:true,createdAt:Date.now(),updatedAt:Date.now()});
  showCreds(name,email,pw);clearS();
 }catch(err){console.error(err);toast('The login was created but the student record could not be saved. '+dbErr(err));}
 btn.disabled=false;};
const devCell=k=>{const L=locks[k];return !L?'<small>No device yet</small>':L.state==='locked'?`🔒 <b>Locked</b><br><small>${esc(L.label||'Device')} · ${when(L.boundAt)}</small>`:'🔓 <b>Unlocked</b><br><small>The next sign-in locks the new device</small>';};
function renderStudents(){
 const sq=$('sSearch').value.toLowerCase();
 const fs=Object.entries(students).filter(([,s])=>s&&`${s.name||''} ${s.email||''} ${s.className||''}`.toLowerCase().includes(sq)).sort((a,b)=>String(a[1].name).localeCompare(String(b[1].name)));
 $('studentsTable').innerHTML=fs.length?fs.map(([k,s])=>{const legacy=!s.uid,L=locks[k],pend=reqs[k]&&reqs[k].status==='pending';
  return `<tr><td><b>${esc(s.name)}</b><br><small>${legacy?'No login yet (old passcode record)':esc(s.email||'')}</small><br><small>${s.active===false?'Inactive':'Active'}${pend?' · <b style="color:#b54708">device request pending</b>':''}</small></td><td>${esc(s.className||'—')}</td><td>${legacy?'<small>—</small>':devCell(k)}</td><td><div class="mq-acts"><button class="btn" data-es="${esc(k)}">Edit</button>${legacy?`<button class="btn primary" data-cv="${esc(k)}">Create login</button>`:''}${!legacy&&L?`<button class="btn" data-lk="${esc(k)}">${L.state==='locked'?'Unlock device':'Lock again'}</button>`:''}${!legacy?`<button class="btn" data-pw="${esc(k)}">Reset password</button>`:''}<button class="btn" data-ts="${esc(k)}">${s.active===false?'Activate':'Deactivate'}</button><button class="btn danger" data-ds="${esc(k)}">Delete</button></div></td></tr>`;}).join(''):'<tr><td colspan="4">No students yet. Create the first student login above.</td></tr>';
}
/* ---------- device change requests ---------- */
async function decide(k,ok){const r=reqs[k];if(!r)return;const up={},P='mathQuiz/';up[P+'deviceRequests/'+k+'/status']=ok?'approved':'rejected';up[P+'deviceRequests/'+k+'/processedAt']=Date.now();if(ok&&locks[k])up[P+'deviceLocks/'+k+'/state']='unlocked';try{await root.update(up);toast(ok?'Approved. The old device is unlocked and the next sign-in locks the new device.':'Request rejected.');}catch(e){console.error(e);toast('Update failed. '+dbErr(e));}}
function renderDevices(){
 const all=Object.entries(reqs).filter(([,r])=>r&&r.status).sort((a,b)=>(b[1].requestedAt||0)-(a[1].requestedAt||0)),pend=all.filter(([,r])=>r.status==='pending'),done=all.filter(([,r])=>r.status!=='pending').slice(0,30);
 $('tabDevBtn').textContent='Device requests'+(pend.length?' ('+pend.length+')':'');
 $('devPending').innerHTML=pend.length?pend.map(([k,r])=>{const L=locks[k];return `<tr><td><b>${esc(r.studentName||(students[k]||{}).name||'Student')}</b><br><small>${esc(r.email||'')} · ${esc(r.className||'')}</small></td><td>${L?esc(L.label||'Device')+'<br><small>'+when(L.boundAt)+'</small>':'—'}</td><td>${esc(r.newDeviceLabel||'—')}</td><td>${esc(r.note||'—')}</td><td>${when(r.requestedAt)}</td><td><div class="mq-acts"><button class="btn primary" data-ap="${esc(k)}">Approve and unlock</button><button class="btn danger" data-rj="${esc(k)}">Reject</button></div></td></tr>`;}).join(''):'<tr><td colspan="6">No pending requests.</td></tr>';
 $('devHistory').innerHTML=done.length?done.map(([k,r])=>`<tr><td><b>${esc(r.studentName||'Student')}</b><br><small>${esc(r.email||'')}</small></td><td>${esc(r.newDeviceLabel||'—')}</td><td>${r.status==='approved'?'✅ Approved':'❌ Rejected'}</td><td>${when(r.requestedAt)}</td><td>${when(r.processedAt)}</td></tr>`).join(''):'<tr><td colspan="5">Nothing yet.</td></tr>';
 document.querySelectorAll('[data-ap]').forEach(b=>b.onclick=()=>decide(b.dataset.ap,true));
 document.querySelectorAll('[data-rj]').forEach(b=>b.onclick=()=>decide(b.dataset.rj,false));
}

/* ---------- questions ---------- */
function clearQ(){$('questionForm').reset();$('qId').value='';banner($('questionBanner'),'');$('qSubmit').textContent='Save question';}
function editQuestion(k){const q=questions[k];if(!q)return toast('Question not found. Reload the page.');tab('questions');const o=q.options||[];
 $('qId').value=k;$('qTopic').value=q.topic||'';$('qLevel').value=qIds(q)[0]||'';setStu(q);$('qText').value=q.text||'';$('qA').value=o[0]||'';$('qB').value=o[1]||'';$('qC').value=o[2]||'';$('qD').value=o[3]||'';$('qAns').value=LET[q.answer]||'A';$('qStatus').value=q.status==='draft'?'draft':'published';$('qExp').value=q.explanation||'';
 $('qSubmit').textContent='Update question';banner($('questionBanner'),'Editing a question in <b>'+esc(q.topic||'General')+'</b>',clearQ);$('questionForm').scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>$('qText').focus({preventScroll:true}),350);}
$('qClear').onclick=clearQ;
$('questionForm').onsubmit=async e=>{e.preventDefault();if(!db)return toast('Configure Firebase first.');
 const raw=[$('qA').value,$('qB').value,$('qC').value,$('qD').value].map(x=>x.trim()),letter=LET.indexOf($('qAns').value);
 if(!raw[letter])return toast('The correct answer points to an empty option.');
 const options=raw.filter(Boolean),answer=raw.slice(0,letter).filter(Boolean).length;
 if(new Set(options.map(x=>x.toLowerCase())).size!==options.length)return toast('Two options are identical. Make each option different.');
 const cid=$('qLevel').value,sids=[...$('qStudents').selectedOptions].map(o=>o.value).filter(x=>students[x]);if(!classes[cid]&&!sids.length)return toast('Choose a class, one or more students, or both.');
 const editing=!!$('qId').value,key=$('qId').value||nid('q');let old={};
 try{if(editing){const s=await ref('questions/'+key).once('value');if(!s.exists()){$('qId').value='';return toast('That question was deleted. Press Save to add it again.');}old=s.val()||{};}
  const up={};up['mathQuiz/questions/'+key]={topic:canonTopic($('qTopic').value),classId:classes[cid]?cid:null,level:classes[cid]?classes[cid].name:'',studentIds:sids.length?Object.fromEntries(sids.map(x=>[x,true])):null,demo:false,text:$('qText').value.trim(),options,answer,explanation:$('qExp').value.trim(),status:$('qStatus').value,createdAt:old.createdAt||Date.now(),updatedAt:Date.now()};assignPaths(up,key,Object.keys(old.studentIds||{}),sids);await root.update(up);
  toast(editing?'Question updated. Students see it straight away.':'Question saved.');clearQ();
 }catch(err){console.error(err);toast('Could not save question. '+dbErr(err));}};

$('seedBtn').onclick=async()=>{if(!db)return toast('Configure Firebase first.');const seed=window.MQ_SEED||[],up={},cu={};let added=0;const cidFor=n=>{const f=idByName(n);if(f)return f;const id=slug(n);cu[id]={name:n,order:classOrder(n),createdAt:Date.now()};return id;};
 seed.forEach((r,i)=>{const k='seed_'+String(i+1).padStart(3,'0');if(!questions[k]){up[k]={topic:r[0],level:r[1],classId:cidFor(r[1]),demo:i<5,text:r[2],options:r[3],answer:r[4],explanation:r[5],status:'published',createdAt:Date.now(),updatedAt:Date.now()};added++;}});
 if(!added)return toast('The starter bank is already loaded.');
 try{if(Object.keys(cu).length)await ref('classes').update(cu);await ref('questions').update(up);toast(`Added ${added} starter questions (first 5 are demo samples).`);}catch(e){console.error(e);toast('Could not add questions. '+dbErr(e));}};

/* ---------- Excel ---------- */
const SAMPLE_H=["topic", "class", "question", "A", "B", "C", "D", "answer", "explanation", "status", "demo"],SAMPLE_ROWS=[["Algebra", "JSS 2", "Solve: x + 9 = 15", "x = 6", "x = 5", "x = 7", "x = 24", "A", "Subtract 9 from both sides: x = 15 − 9 = 6.", "published", "no"], ["Algebra", "JSS 2", "Solve: x − 4 = 11", "x = 7", "x = 15", "x = 44", "x = 16", "B", "Add 4 to both sides: x = 11 + 4 = 15.", "published", "no"], ["Algebra", "JSS 2", "Solve: 5x = 45", "x = 40", "x = 50", "x = 9", "x = 225", "C", "Divide both sides by 5: x = 45 ÷ 5 = 9.", "published", "no"], ["Algebra", "JSS 2", "Solve: x/3 = 8", "x = 11", "x = 5", "x = 8/3", "x = 24", "D", "Multiply both sides by 3: x = 8 × 3 = 24.", "published", "no"], ["Algebra", "JSS 2", "Solve: 2x + 3 = 11", "x = 4", "x = 7", "x = 5", "x = 14", "A", "Subtract 3 to get 2x = 8, then divide by 2: x = 4.", "published", "no"], ["Algebra", "JSS 2", "Solve: 4x − 6 = 14", "x = 2", "x = 5", "x = 8", "x = 20", "B", "Add 6 to get 4x = 20, then divide by 4: x = 5.", "published", "no"], ["Algebra", "JSS 2", "Simplify 7a − 3a + 2a.", "8a", "12a", "6a", "6a^2", "C", "7 − 3 + 2 = 6, so the answer is 6a.", "published", "no"], ["Algebra", "JSS 2", "Simplify 3x + 2y + 4x − y.", "7x + 3y", "12xy", "6x + y", "7x + y", "D", "Collect like terms: 3x + 4x = 7x and 2y − y = y.", "published", "no"], ["Algebra", "JSS 2", "Expand 3(x + 5).", "3x + 15", "3x + 5", "x + 15", "3x + 8", "A", "Multiply both terms by 3: 3x + 15.", "published", "no"], ["Algebra", "JSS 2", "Expand and simplify 2(x + 3) + 4.", "2x + 7", "2x + 10", "2x + 12", "x + 10", "B", "2x + 6 + 4 = 2x + 10.", "published", "no"], ["Algebra", "JSS 2", "If y = 3x + 2, find y when x = 5.", "13", "15", "17", "21", "C", "y = 3(5) + 2 = 15 + 2 = 17.", "published", "no"], ["Algebra", "JSS 2", "If a = 4 and b = 3, find 2a − b.", "2", "7", "11", "5", "D", "2(4) − 3 = 8 − 3 = 5.", "published", "no"], ["Algebra", "JSS 2", "Solve: 3x + 4 = x + 12", "x = 4", "x = 8", "x = 2", "x = 16", "A", "Collect x terms: 3x − x = 12 − 4, so 2x = 8 and x = 4.", "published", "no"], ["Algebra", "JSS 2", "Solve: 5(x − 2) = 20", "x = 4", "x = 6", "x = 2", "x = 22", "B", "Divide both sides by 5: x − 2 = 4, so x = 6.", "published", "no"], ["Algebra", "JSS 2", "Factorise 6x + 9.", "6(x + 9)", "3(2x + 9)", "3(2x + 3)", "9(x + 1)", "C", "The HCF of 6 and 9 is 3, so 6x + 9 = 3(2x + 3).", "published", "no"], ["Algebra", "JSS 2", "Factorise x^2 + 5x.", "5(x + 1)", "x^2(5)", "(x + 5)^2", "x(x + 5)", "D", "x is common to both terms: x^2 + 5x = x(x + 5).", "published", "no"], ["Algebra", "JSS 2", "A number is doubled and 7 is added. The result is 25. Find the number.", "9", "8", "11", "16", "A", "Let the number be n: 2n + 7 = 25, so 2n = 18 and n = 9.", "published", "no"], ["Algebra", "JSS 2", "The sum of three consecutive numbers is 36. What is the smallest?", "10", "11", "12", "13", "B", "Let the numbers be n, n + 1, n + 2: 3n + 3 = 36, so 3n = 33 and n = 11.", "published", "no"], ["Algebra", "JSS 2", "Make x the subject of y = x + 6.", "x = y + 6", "x = 6 − y", "x = y − 6", "x = 6y", "C", "Subtract 6 from both sides: x = y − 6.", "published", "no"], ["Algebra", "JSS 2", "Simplify (2x)(3x).", "5x", "6x", "5x^2", "6x^2", "D", "2 × 3 = 6 and x × x = x^2, so the answer is 6x^2.", "published", "no"], ["Percentages", "", "What is 50% of 70?", "25", "30", "35", "40", "C", "50% is half, and half of 70 is 35.", "published", "yes"]],SAMPLE_INFO=[["HOW TO FILL THE QUESTIONS SHEET"], [""], ["topic", "Required. e.g. Algebra. Spelling and capital letters are matched to existing topics, so \"algebra\" joins \"Algebra\"."], ["class", "Required unless demo is yes, or pick a class in the import drop-down. New class names are created."], ["question", "Required. Use ^ for powers, e.g. x^2."], ["A to D", "At least two options. Leave C and D empty if not needed."], ["answer", "Required. A to D, or 1 to 4, or the exact option text."], ["explanation", "Strongly recommended. Students read it after every answer and the coach reads it aloud."], ["status", "published or draft. Blank means published."], ["demo", "yes adds the question to the demo bank. No class needed."], [""], ["20 PER TOPIC", "Every quiz has 20 questions. A student gets 20 questions drawn at random from the topic (or from all topics mixed) for their class."], ["", "Aim for at least 20 published questions per topic per class. The sample sheet shows one full topic of 20 (Algebra, JSS 2)."], ["", "A bigger bank (40 to 100 per topic) means fewer repeats: the app leaves out questions a student answered in recent quizzes and brings missed ones back later."], ["", "The admin Questions tab shows a warning mark next to any class that has fewer than 20 questions in a topic."], ["Tip", "One question per row. Delete the sample rows first, then paste your own. Keep each topic name spelled the same way."]];
$('tplBtn').onclick=()=>{if(!window.XLSX)return toast('Excel library did not load. Check your internet.');
 const ws=XLSX.utils.aoa_to_sheet([SAMPLE_H,...SAMPLE_ROWS]);ws['!cols']=[18,12,50,16,16,16,16,9,60,11,8].map(w=>({wch:w}));
 const w2=XLSX.utils.aoa_to_sheet(SAMPLE_INFO);w2['!cols']=[{wch:16},{wch:120}];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Questions');XLSX.utils.book_append_sheet(wb,w2,'Instructions');XLSX.writeFile(wb,'math-quiz-question-template.xlsx');};
$('xlsFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(!db||!window.XLSX)return toast('Firebase or the Excel library is not ready.');
 try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array'}),target=$('xlsClass').value,up={},cu={},bad=[],tcache={};let n=0;
  const tp=raw=>{const c=canonTopic(raw),k=c.toLowerCase();return tcache[k]||(tcache[k]=c);};
  const cidOf=nm=>{nm=String(nm).trim();const x=idByName(nm);if(x)return x;const id=slug(nm);cu[id]={name:nm,order:classOrder(nm),createdAt:Date.now()};classes[id]=cu[id];return id;};
  wb.SheetNames.filter(sn=>!/^instructions$/i.test(sn)).forEach(sn=>XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:''}).forEach((r,i)=>{const L={};Object.entries(r).forEach(([k,v])=>L[String(k).trim().toLowerCase().replace(/[\s_-]+/g,'')]=v);
   if(!Object.values(L).some(v=>String(v).trim()))return;
   const text=String(L.question||L.text||'').trim(),raw=['a','b','c','d'].map(x=>String(L[x]??L['option'+x]??'').trim()),options=raw.filter(Boolean),a=String(L.answer??L.correct??'').trim(),where=sn+' row '+(i+2);
   let li=LET.indexOf(a.toUpperCase());if(li<0&&/^[1-4]$/.test(a))li=+a-1;if(li<0)li=raw.findIndex(x=>x&&x.toLowerCase()===a.toLowerCase());
   if(!text||options.length<2||li<0||!raw[li]){bad.push(where);return;}
   if(/^(y|yes|true|1)$/i.test(String(L.demo??'').trim())){up[nid('q')+'_'+n++]={topic:tp(L.topic),classId:'',level:'Demo',demo:true,text,options,answer:raw.slice(0,li).filter(Boolean).length,explanation:String(L.explanation||'').trim(),status:'published',createdAt:Date.now(),updatedAt:Date.now()};return;}
   let names=target?[]:String(L.class??L.classes??L.level??'').split(/[,;|]/).filter(s=>s.trim());
   if(!target&&!names.length){if(idByName(sn))names=[sn];else{bad.push(where+' (no class)');return;}}
   const ids=[...new Set(target?[target]:names.map(cidOf))].slice(0,1);
   up[nid('q')+'_'+n++]={topic:tp(L.topic),classId:ids[0],level:classes[ids[0]].name,demo:false,text,options,answer:raw.slice(0,li).filter(Boolean).length,explanation:String(L.explanation||'').trim(),status:String(L.status||'published').toLowerCase()==='draft'?'draft':'published',createdAt:Date.now(),updatedAt:Date.now()};}));
  if(!n)throw Error('No valid rows found.'+(bad.length?' Check '+bad.slice(0,3).join(', '):''));
  if(Object.keys(cu).length)await ref('classes').update(cu);await ref('questions').update(up);
  const nc=Object.values(cu).map(c=>c.name),cnt={},mine=new Set();
  Object.values(up).forEach(q=>{if(!q.demo)mine.add(q.topic+' / '+q.level);});
  [...Object.values(questions).filter(q=>q&&q.status!=='draft'),...Object.values(up).filter(q=>!q.demo&&q.status!=='draft')].forEach(q=>{const k=(q.topic||'General')+' / '+(q.level||'?');cnt[k]=(cnt[k]||0)+1;});
  const low=[...mine].filter(k=>(cnt[k]||0)<20).map(k=>k+' ('+(cnt[k]||0)+')');
  toast(`Imported ${n} question(s).`+(bad.length?` Skipped ${bad.length}: ${bad.slice(0,3).join(', ')}${bad.length>3?'…':''}.`:'')+(nc.length?` New classes: ${nc.join(', ')}.`:'')+(low.length?` Under 20 questions: ${low.slice(0,3).join(', ')}${low.length>3?'…':''}. Add more so every quiz has 20.`:''));
 }catch(err){console.error(err);toast('Import failed: '+err.message);}};

/* ---------- CSV ---------- */
$('exportBtn').onclick=()=>{const rows=Object.values(sessions).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0)).map(s=>({date:when(s.completedAt),student:s.studentName,quiz:s.title,topic:s.topic,level:s.level,score:s.score,correct:s.correct,total:s.total,seconds:s.durationSeconds}));
 const head=['date','student','quiz','topic','level','score','correct','total','seconds'];
 const csv=[head.join(','),...rows.map(r=>head.map(h=>'"'+String(r[h]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));a.download='math-quiz-results.csv';a.click();URL.revokeObjectURL(a.href);};
})();
