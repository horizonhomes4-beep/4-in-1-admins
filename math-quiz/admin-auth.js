(()=>{'use strict';
const $=id=>document.getElementById(id);
const cfg=window.FIREBASE_CONFIG;
const gate=$('adminAuthGate'),app=$('adminApp'),msg=$('adminAuthMsg');
let auth,db;
/* The administrator uses its OWN named Firebase app. Firebase stores a sign-in per app name, so an administrator
   session is now completely separate from the student session in the same browser. Before, both used the default
   app: a student signing in/out (or being kicked after an unlock) signed the administrator out, and an administrator
   opening the student page was signed out by the student page. */
const ADMIN_APP='mq-admin';
try{
 if(!window.firebase||!cfg) throw Error('Firebase configuration or SDK missing.');
 const fb=firebase.apps.find(a=>a.name===ADMIN_APP)||firebase.initializeApp(cfg,ADMIN_APP);
 auth=fb.auth(); db=fb.database();
}catch(e){msg.textContent=e.message;return;}
let approved=false,gen=0;
/* quiz-admin.js starts and stops its live data on these two events, so nothing is read before an approved admin is signed in. */
auth.onAuthStateChanged(async user=>{
 const my=++gen,was=approved;approved=false;app.style.display='none';gate.style.display='block';
 if(was)window.dispatchEvent(new Event('mq-admin-out'));
 if(!user)return;
 try{
  const snap=await db.ref('access/admins/'+user.uid).once('value');
  if(my!==gen)return; // a newer sign-in/sign-out happened while we were checking
  if(snap.val()===true){approved=true;gate.style.display='none';app.style.display='block';msg.textContent='';window.dispatchEvent(new Event('mq-admin-in'));}
  else {msg.textContent='This account is not an approved administrator. Use an approved administrator account.';await auth.signOut();}
 }catch(e){
  if(my!==gen)return;
  msg.textContent='Could not verify administrator access. Publish the latest database.rules.json and check your connection. '+(e&&e.message||'');
  try{await auth.signOut();}catch(_){}
 }
});
$('adminAuthForm').addEventListener('submit',async e=>{
 e.preventDefault();msg.textContent='Signing in…';
 try{await auth.signInWithEmailAndPassword($('adminEmail').value.trim(),$('adminPassword').value);$('adminPassword').value='';}
 catch(err){
  const c=(err&&err.code)||'';
  msg.textContent=/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)?'Sign-in failed: the email or password is not correct.':c==='auth/too-many-requests'?'Too many attempts. Wait a few minutes and try again.':c==='auth/network-request-failed'?'Network error. Check your internet connection.':'Sign-in failed: '+(err.message||'Check email and password.');
 }
});
$('adminSignOut').onclick=()=>auth.signOut();
window.MQ_ADMIN_AUTH={get approved(){return approved;},auth,db};
})();
