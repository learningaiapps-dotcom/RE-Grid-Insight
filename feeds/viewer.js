const el=id=>document.getElementById(id);
async function load(list) {
  el('result').textContent='Loading…';
  try {
    const path=list?'/v1/feeds':'/v1/feeds/'+encodeURIComponent(el('feeds').value);
    const res=await fetch(path,{headers:{Authorization:'Bearer '+el('key').value.trim()}});
    const data=await res.json();
    if (!res.ok) throw Error(data.error);
    if(list) el('feeds').replaceChildren(...data.feeds.map(id=>new Option(id,id)));
    el('result').textContent=list?data.feeds.length+' approved feeds':JSON.stringify(data.rows,null,2);
  } catch(err){el('result').textContent=err.message;}
}
el('connect').onclick=()=>load(true);
el('read').onclick=()=>load(false);
