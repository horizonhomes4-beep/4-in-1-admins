(()=>{'use strict';const $=id=>document.getElementById(id);
if(!window.firebase||!window.FIREBASE_CONFIG)return;if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
const auth=firebase.auth(),db=firebase.database(),err=m=>{$('adminErr').textContent=m||'';};
const view=on=>{$('adminLogin').classList.toggle('hidden',on);$('adminApp').classList.toggle('hidden',!on);$('adminLogout').classList.toggle('hidden',!on);};
auth.onAuthStateChanged(async u=>{if(!u){view(false);return;}
 try{const a=await db.ref('readingFluency/access/admins/'+u.uid+'/active').once('value');
  if(a.val()!==true){await auth.signOut();err('This account is not an administrator.');view(false);return;}
  view(true);window.rfStartAdminListeners&&window.rfStartAdminListeners();}
 catch(e){console.error(e);await auth.signOut();err('Could not verify administrator access. Deploy database.rules.json and try again.');view(false);}});
$('adminLoginForm').addEventListener('submit',async e=>{e.preventDefault();err('');const b=e.submitter;b&&(b.disabled=true);
 try{await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);await auth.signInWithEmailAndPassword($('adminEmail').value.trim(),$('adminPassword').value);}
 catch(x){console.error(x);err(/invalid|wrong|user-not-found/.test(x.code||'')?'Incorrect email or password.':x.code==='auth/too-many-requests'?'Too many attempts. Wait a moment and retry.':(x.message||'Sign-in failed.'));}
 finally{b&&(b.disabled=false);}});
$('adminLogout').addEventListener('click',()=>auth.signOut());
})();
