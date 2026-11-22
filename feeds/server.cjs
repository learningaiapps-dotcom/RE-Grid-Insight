const http = require('node:http');
const { createHash } = require('node:crypto');
const grants = JSON.parse(process.env.FEED_GRANTS || '{}');
const feeds = JSON.parse(process.env.FEED_SOURCES || '{}');
const page = require('node:fs').readFileSync(__dirname + '/index.html');
const client = require('node:fs').readFileSync(__dirname + '/viewer.js');
const counters = new Map();
setInterval(() => counters.clear(), 60000).unref();

http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
  function send(status, data, type='application/json') {
    res.writeHead(status, {'Content-Type': type});
    res.end(type==='application/json' ? JSON.stringify(data) : data);
  }
  if (req.method !== 'GET') return send(405, {error:'Read-only service'});
  if (req.url === '/') return send(200, page, 'text/html; charset=utf-8');
  if (req.url === '/viewer.js') return send(200, client, 'text/javascript');
  const token = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.authorization || '');
  const hash = token && createHash('sha256').update(token[1]).digest('hex');
  const grant = hash && Object.hasOwn(grants,hash) && grants[hash];
  if (!grant || !(Date.parse(grant.expires)>Date.now())) return send(401,{error:'An active admin-approved key is required'});
  const used = counters.get(hash) || 0;
  if (used>=60) return send(429,{error:'Try again next minute'});
  counters.set(hash,used+1);
  const scopes = grant.feeds || {};
  if (req.url==='/v1/feeds') return send(200,{purpose:grant.purpose,feeds:Object.keys(scopes).filter(id=>Object.hasOwn(feeds,id))});
  const id = /^\/v1\/feeds\/([a-z0-9_-]+)$/.exec(req.url)?.[1];
  if (!id || !Object.hasOwn(scopes,id) || !Object.hasOwn(feeds,id)) return send(404,{error:'Feed unavailable'});
  const feed=feeds[id];
  try {
    const url=new URL(feed.url);
    if (url.protocol!=='https:' || url.username || url.password) throw Error();
    const headers={Accept:'application/json'};
    if (feed.authorizationEnv) {
      const value=process.env[feed.authorizationEnv];
      if (!value) throw Error();
      headers.Authorization=value;
    }
    const upstream=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});
    if (!upstream.ok) throw Error();
    const buffers=[];
    let bytes=0;
    for await (const chunk of upstream.body) {
      bytes+=chunk.length;
      if (bytes>2*1024*1024) throw Error();
      buffers.push(chunk);
    }
    const payload=JSON.parse(Buffer.concat(buffers).toString());
    const records=Array.isArray(payload)?payload:payload.rows;
    if (!Array.isArray(records)) throw Error();
    const fields=scopes[id].filter(name=>feed.fields.includes(name));
    const rows=records.filter(row=>row && (!feed.plantField || row[feed.plantField]===feed.plantValue)).map(row=>
      Object.fromEntries(fields.filter(name=>Object.hasOwn(row,name) && ['string','number','boolean'].includes(typeof row[name])).map(name=>[name,row[name]])));
    send(200,{feed:id,rows});
  } catch {send(502,{error:'Source unavailable or incompatible'});}
}).listen(process.env.PORT || 3000);
