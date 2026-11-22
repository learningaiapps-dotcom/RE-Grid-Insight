const {createHash,randomBytes}=require('node:crypto');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const sites=['dsm','maps','forecast','bess'];
const base=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!base?.startsWith('https://') || !key) throw Error('Configure Supabase project URL and publishable key');
async function api(route,token,method='GET',body,prefer){
  const headers={apikey:key,'Content-Type':'application/json'};
  if(prefer) headers.Prefer=prefer;
  if(token) headers.Authorization='Bearer '+token;
  const r=await fetch(base+route,{method,headers,body:body&&JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!r.ok){
    const error=await r.json().catch(()=>({}));
    throw Object.assign(Error('Request failed'),{status:r.status,authCode:error.error_code||error.code});
  }
  const text=await r.text();return text?JSON.parse(text):null;
}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.csv':'text/csv','.png':'image/png'};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'https://localhost'),p=url.pathname;
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Referrer-Policy','no-referrer');
  const json=x=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x))};
  const token=(req.headers.cookie||'').match(/(?:^|; )__Host-regrid=([A-Za-z0-9_.-]+)/)?.[1];
  const cookie=(t,age)=>res.setHeader('Set-Cookie','__Host-regrid='+t+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age);
  try{
    if(req.method==='POST'){
      if(req.headers.origin!=='https://'+req.headers.host || req.headers['content-type']!=='application/json'){res.writeHead(403);return res.end()}
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>(['/operator-share','/operator-guest-link'].includes(p)?24000:8192)){res.writeHead(413);return res.end()}}
      const b=JSON.parse(raw);
      if(p==='/logout'){cookie('',0);if(token)await api('/auth/v1/logout?scope=local',token,'POST',{});return json({})}
      if(['/signup','/login','/recover'].includes(p)){
        const route={'/signup':'signup','/login':'token?grant_type=password','/recover':'recover'}[p];
        const data=await api('/auth/v1/'+route,null,'POST',p==='/recover'?{email:b.email}:{email:b.email,password:b.password});
        if(p==='/login')cookie(data.access_token,data.expires_in);
        return json({});
      }
      if(p==='/reset'){
        const session=await api('/auth/v1/verify',null,'POST',{type:'recovery',email:b.email,token:b.code});
        await api('/auth/v1/user',session.access_token,'PUT',{password:b.password});return json({});
      }
      if(p==='/operator-guest-data'){
        if(typeof b.link!=='string'||! /^[a-f0-9]{64}$/.test(b.link)){res.writeHead(404);return json([])}
        const digest=createHash('sha256').update(b.link).digest('hex');
        const rows=await api('/rest/v1/rpc/regrid_operator_guest_read',null,'POST',{digest});
        if(!rows.length)res.statusCode=404;
        return json(rows);
      }
      if(!token){res.writeHead(401);return res.end()}
      if(p==='/operator-share'||p==='/operator-guest-link'){
        const {plant,day,label,schedule}=b;
        const recipients=Array.isArray(b.recipients)?[...new Set(b.recipients)]:null;
        if(typeof plant!=='string'||!plant||plant.length>120||!/^\d{4}-\d{2}-\d{2}$/.test(day)
          ||typeof label!=='string'||!label||label.length>160||!Array.isArray(schedule)||schedule.length!==96
          ||!schedule.every(row=>Array.isArray(row)&&row.length===5&&row.every(Number.isFinite))
          ||(b.recipients!==undefined&&(!recipients||recipients.length>30||!recipients.every(email=>
            typeof email==='string'&&email.length<=254&&/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)&&email===email.toLowerCase())))){
          res.writeHead(400);return res.end('Invalid schedule or email list.');
        }
        if(p==='/operator-guest-link'){
          const link=b.revoke===true?null:randomBytes(32).toString('hex');
          const digest=link?createHash('sha256').update(link).digest('hex'):null;
          const expires=await api('/rest/v1/rpc/regrid_operator_guest_change',token,'POST',{
            plant_id:plant,operating_day:day,plant_label:label,blocks:schedule,digest
          });
          return json({link,expires});
        }
        const params=new URLSearchParams({plant:'eq.'+plant,day:'eq.'+day});
        const path='/rest/v1/regrid_operator_sheets';
        if(recipients){
          const changes={label,recipients,schedule,updated_at:new Date().toISOString()};
          const updated=await api(path+'?'+params,token,'PATCH',changes,'return=representation');
          if(!updated.length)await api(path,token,'POST',{plant,day,label,recipients,schedule});
        }else{
          await api(path+'?'+params,token,'PATCH',{label,schedule,updated_at:new Date().toISOString()});
        }
        return json({});
      }
      if(!sites.includes(b.site)){res.writeHead(400);return res.end()}
      if(p==='/request'){await api('/rest/v1/regrid_access',token,'POST',{site:b.site});return json({})}
      if(p==='/decision'&&['approved','revoked'].includes(b.status)&&/^[a-f0-9-]{36}$/.test(b.uid)){
        if(!await api('/rest/v1/rpc/regrid_admin',token,'POST',{})){res.writeHead(403);return res.end()}
        await api('/rest/v1/regrid_access?user_id=eq.'+b.uid+'&site=eq.'+b.site,token,'PATCH',{status:b.status});return json({});
      }
    }
    if(req.method!=='GET'){res.writeHead(405);return res.end()}
    const publicAsset = {
      '/': ['index.html', 'text/html'],
      '/operator': ['operator.html', 'text/html'],
      '/operator.js': ['operator.js', 'text/javascript'],
      '/account.js': ['account.js', 'text/javascript'],
      '/account.css': ['account.css', 'text/css'],
      '/renewable.webp': ['renewable.webp', 'image/webp']
    };
    if (Object.hasOwn(publicAsset,p)) {
      const [filename,type] = publicAsset[p];
      res.setHeader('Content-Type',type);
      return res.end(await fs.readFile(path.join(__dirname,filename)));
    }
    if(!token){res.writeHead(401);return res.end('Sign in at the portal home page.')}
    const user=await api('/auth/v1/user',token);
    if(p==='/operator-data')return json(await api('/rest/v1/rpc/regrid_operator_schedule',token,'POST',{}));
    if(p==='/operator-recipients'){
      const plant=url.searchParams.get('plant'),day=url.searchParams.get('day');
      const params=new URLSearchParams({owner:'eq.'+user.id,plant:'eq.'+plant,day:'eq.'+day,select:'recipients,guest_expires'});
      const list=await api('/rest/v1/regrid_operator_sheets?'+params,token);
      return json({emails:list[0]?.recipients||[],guestActive:Date.parse(list[0]?.guest_expires)>Date.now()});
    }
    const admin=await api('/rest/v1/rpc/regrid_admin',token,'POST',{});
    if(p==='/me')return json({email:user.email,admin,access:await api('/rest/v1/regrid_access?user_id=eq.'+user.id,token),requests:admin?await api('/rest/v1/rpc/regrid_requests',token,'POST',{}):[]});
    const [,site,...parts]=p.split('/');
    if(!sites.includes(site)){res.writeHead(404);return res.end()}
    if(!admin&&!(await api('/rest/v1/regrid_access?select=site&status=eq.approved&site=eq.'+site+'&user_id=eq.'+user.id,token)).length){res.writeHead(403);return res.end('Site approval required.')}
    if(!parts.length){res.writeHead(302,{Location:'/'+site+'/'});return res.end()}
    const root=path.resolve(__dirname,'../dist',site),file=path.resolve(root,decodeURIComponent(parts.join('/'))||'index.html');
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
    const data=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch(e){
    const weakPassword='Use a stronger password with at least 6 characters.';
    const authErrors={
      '/signup':{
        weak_password:weakPassword,
        email_address_invalid:'Enter a valid email address.',
        email_address_not_authorized:'Confirmation email could not be sent to this address. Contact the RE Grid Insight administrator.',
        over_email_send_rate_limit:'Too many confirmation emails were requested. Try again later.'
      },
      '/login':{
        weak_password:weakPassword,
        invalid_credentials:'Email address or password is incorrect. Try again or select Forgot password.',
        email_not_confirmed:'Confirm your email using the link in your inbox, then sign in again.',
        email_address_invalid:'Enter a valid email address.',
        over_request_rate_limit:'Too many sign-in attempts. Wait a few minutes and try again.'
      }
    };
    if(req.method==='POST' && Object.hasOwn(authErrors,p)){
      const errors=authErrors[p];
      const message=Object.hasOwn(errors,e.authCode)?errors[e.authCode]
        :p==='/login' && e.status===429?errors.over_request_rate_limit
        :p==='/login'?'Sign-in is temporarily unavailable. Try again shortly.':null;
      if(message){
        res.statusCode=e.status>=400&&e.status<500?e.status:503;
        return json({message});
      }
    }
    res.writeHead(e.code==='ENOENT'?404:e.status>=400&&e.status<500?e.status:503);res.end('Unable to complete request. Check your login or try again.')}
}).listen(process.env.PORT||3000);
