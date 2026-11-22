const el=id=>document.getElementById(id);
async function post(action,body){
  const res=await fetch('/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok){
    const error=await res.json().catch(()=>({}));
    throw Error(error.message || 'Request failed. Check your details or try again.');
  }
  return res.json();
}
function button(text,action){
  const b=document.createElement('button');b.textContent=text;b.onclick=()=>run(action);return b;
}
async function run(fn){try{el('message').textContent='';await fn()}catch(e){el('message').textContent=e.message}}
async function renderOperatorAdmin(){
  const section=el('operator-admin');
  section.hidden=false;
  const response=await fetch('/operator-admin');
  if(!response.ok)throw Error('Could not load operator access.');
  const {approvals,plants}=await response.json();
  const labels=new Map();
  for(const plant of plants)if(!labels.has(plant.plant))labels.set(plant.plant,plant.label);
  const picker=el('operator-plant'),selected=picker.value||new URLSearchParams(location.search).get('operatorPlant');
  picker.replaceChildren(...[...labels].map(([id,label])=>new Option(label,id)));
  if(labels.has(selected))picker.value=selected;
  el('operator-form').hidden=!labels.size;
  el('operator-empty').hidden=Boolean(labels.size);
  const rows=el('operator-approvals');
  rows.replaceChildren();
  for(const item of approvals){
    const row=rows.insertRow();
    const expires=new Date(item.expires_at);
    const status=item.revoked_at?'Revoked':expires<=new Date()?'Expired':'Active';
    for(const value of [item.email,labels.get(item.plant)||item.plant,expires.toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),status]){
      row.insertCell().textContent=value;
    }
    const actions=row.insertCell();
    actions.append(button('Renew',async()=>{
      picker.value=item.plant;el('operator-email').value=item.email;
      el('operator-period').focus();
    }));
    if(status==='Active')actions.append(button('Revoke',async()=>{
      await post('operator-approval',{plant:item.plant,email:item.email,months:0});
      el('operator-link').hidden=true;await renderOperatorAdmin();
    }));
  }
  el('operator-form').onsubmit=event=>{
    event.preventDefault();
    const submit=el('operator-grant');
    if(submit.disabled)return;
    submit.disabled=true;
    run(async()=>{
      try{
        const data=await post('operator-approval',{plant:picker.value,email:el('operator-email').value.trim(),months:Number(el('operator-period').value)});
        el('operator-link-value').value=location.origin+'/operator#link='+data.link;
        el('operator-link').hidden=false;
        await renderOperatorAdmin();
      }finally{submit.disabled=false}
    });
  };
  el('operator-copy').onclick=()=>run(async()=>{
    await navigator.clipboard.writeText(el('operator-link-value').value);
    el('message').textContent='Operator link copied.';
  });
}
async function render(){
  const r=await fetch('/me');el('login').hidden=r.ok;el('home').hidden=!r.ok;if(!r.ok)return;
  const u=await r.json();el('sites').replaceChildren();el('admin').replaceChildren();el('operator-admin').hidden=true;el('operator-link').hidden=true;
  for(const [site,title] of Object.entries({dsm:'DSM',forecast:'Forecast',maps:'Maps',bess:'BESS Operations'})){
    const row=document.createElement('p'),status=u.access.find(a=>a.site===site)?.status;
    row.append(title+' — ');
    if(u.admin||status==='approved'){const a=document.createElement('a');a.href='/'+site+'/'+(site==='bess'?'#live':'');a.textContent='Open site';row.append(a)}
    else if(status)row.append(status);
    else row.append(button('Request access',async()=>{await post('request',{site});await render()}));
    el('sites').append(row);
  }
  if(u.admin){
    await renderOperatorAdmin();
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
el('credentials').addEventListener('invalid', event => {
  if (event.target === el('password') && event.target.validity.tooShort) {
    el('message').textContent = 'Enter a password with at least 6 characters.';
  }
}, true);
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
