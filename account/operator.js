const byId = id => document.getElementById(id);
const picker = byId('sheets');
const statusLine = byId('operator-status');
const table = byId('operator-table');
const sheetKey = s => JSON.stringify([s.owner, s.plant, s.day]);
let sheets = [];
function showSchedule() {
  const sheet = sheets.find(s => sheetKey(s) === picker.value);
  table.hidden = !sheet;
  if (!sheet) {
    statusLine.textContent = 'No schedules have been shared with your email.';
    byId('operator-rows').replaceChildren();
    return;
  }
  const date = new Date();
  const istDay = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata'}).format(date);
  const istMinute = (date.getUTCHours()*60 + date.getUTCMinutes() + 330) % 1440;
  statusLine.textContent = 'Updated ' + new Date(sheet.updated_at).toLocaleString('en-IN', {timeZone:'Asia/Kolkata'}) + ' IST. Refreshes every 10 seconds.';
  const number = new Intl.NumberFormat('en-IN',{maximumFractionDigits:2,signDisplay:'exceptZero'});
  byId('operator-rows').replaceChildren(...sheet.schedule.map((values,i) => {
    const row = document.createElement('tr');
    row.classList.toggle('current',istDay===sheet.day&&i===Math.floor(istMinute/15));
    const time = String(Math.floor(i/4)).padStart(2,'0') + ':' + String((i%4)*15).padStart(2,'0');
    for(const value of [i+1,time,...values.map(n=>number.format(n))]) row.insertCell().textContent=value;
    return row;
  }));
}
picker.onchange = showSchedule;
async function refresh(){
  try{
    const response = await fetch('/operator-data');
    byId('operator-login').hidden = response.status!==401;
    if(response.status===401){
      sheets=[];picker.hidden=true;picker.replaceChildren();table.hidden=true;
      byId('operator-rows').replaceChildren();statusLine.textContent='Sign in to see your schedules.';
      return;
    }
    if(!response.ok)throw Error();
    const selected=picker.value;
    sheets=await response.json();
    picker.replaceChildren(...sheets.map(s=>new Option(s.label+' · '+s.day,sheetKey(s))));
    if(sheets.some(s=>sheetKey(s)===selected))picker.value=selected;
    picker.hidden=!sheets.length;
    showSchedule();
  }catch{
    statusLine.textContent='Could not refresh. The page will retry in 10 seconds.';
  }finally{
    setTimeout(refresh,10000);
  }
}
refresh();
