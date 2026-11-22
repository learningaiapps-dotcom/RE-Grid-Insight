const el=id=>document.getElementById(id);
async function post(action,body){
  const res=await fetch('/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok){
    const error=await res.json().catch(()=>({}));
    throw Error(error.message || 'Request failed. Check your details or try again.');
  }
}
function button(text,action){
  const b=document.createElement('button');b.textContent=text;b.onclick=()=>run(action);return b;
}
async function run(fn){try{el('message').textContent='';await fn()}catch(e){el('message').textContent=e.message}}
async function render(){
  const r=await fetch('/me');el('login').hidden=r.ok;el('home').hidden=!r.ok;if(!r.ok)return;
  const u=await r.json();el('sites').replaceChildren();el('admin').replaceChildren();
  for(const [site,title] of Object.entries({dsm:'DSM',forecast:'Forecast',maps:'Maps',bess:'BESS Operations'})){
    const row=document.createElement('p'),status=u.access.find(a=>a.site===site)?.status;
    row.append(title+' — ');
    if(u.admin||status==='approved'){const a=document.createElement('a');a.href='/'+site+'/';a.textContent='Open site';row.append(a)}
    else if(status)row.append(status);
    else row.append(button('Request access',async()=>{await post('request',{site});await render()}));
    el('sites').append(row);
  }
  if(u.admin){
    const h=document.createElement('h2');h.textContent='Admin approvals';el('admin').append(h);
    for(const req of u.requests){
      const row=document.createElement('p');row.append(req.email+' · '+req.site+' · '+req.status);
      for(const status of ['approved','revoked'])row.append(button(status==='approved'?'Approve':'Revoke',async()=>{await post('decision',{site:req.site,uid:req.uid,status});await render()}));
      el('admin').append(row);
    }
  }
}
let signup = false;
function setMode(register) {
  signup = register;
  el('login-title').textContent = signup ? 'Create your account' : 'Sign in';
  el('submit').textContent = signup ? 'Create account' : 'Sign in';
  el('switch-prompt').textContent = signup ? 'Already have an account?' : 'New to RE Grid Insight?';
  el('switch-mode').textContent = signup ? 'Sign in' : 'Create account';
  el('password').autocomplete = signup ? 'new-password' : 'current-password';
  if (signup) el('password').minLength = 6;
  else el('password').removeAttribute('minlength');
  el('password-hint').hidden = !signup;
  el('recovery').hidden = signup;
  el('message').textContent = '';
}
async function complete(action) {
  const passwordField = action === 'reset' ? 'new-password' : 'password';
  await post(action, {
    email: el('email').value.trim(),
    password: el(passwordField).value,
    code: el('code').value.trim()
  });
  el(passwordField).value = '';
  if (action === 'reset') el('code').value = '';
  await render();
  el('message').textContent = ({
    signup: 'Check your inbox to confirm your email.',
    recover: 'Check your inbox for a recovery code.',
    reset: 'Password updated. Sign in with your new password.'
  })[action] || '';
}
el('switch-mode').onclick = () => setMode(!signup);
el('credentials').onsubmit = async event => {
  event.preventDefault();
  const submit = el('submit');
  submit.disabled = true;
  try { await run(() => complete(signup ? 'signup' : 'login')); }
  finally { submit.disabled = false; }
};
for (const b of document.querySelectorAll('[data-action]')) b.onclick = () => run(async () => {
  if (b.dataset.action !== 'logout' && !el('email').reportValidity()) return;
  await complete(b.dataset.action);
});
run(render);
