/* SafeTown AI v2 — framework-free interactive frontend */
const state = {user:null,page:null,zones:[],mine:[],reports:[],dashboard:null,selectedZone:null,authMode:'login',lastResult:null,filter:'all',search:''};
const severityInfo = {
  1:['Very low','Minor inconvenience, no immediate danger'],
  2:['Low','Small hazard needing routine attention'],
  3:['Moderate','Noticeable risk; staff attention needed'],
  4:['High','Serious hazard needing prompt action'],
  5:['Critical','Immediate danger — seek emergency help']
};
const statusText={pending:'Pending',verified:'Verified',in_progress:'In progress',resolved:'Resolved',rejected:'Rejected'};
const statusColor={pending:'yellow',verified:'blue',in_progress:'teal',resolved:'green',rejected:'gray'};
const pages={
  resident:[['overview','Overview','◫'],['report','Report a hazard','✎'],['tracking','My reports','☷'],['how','How it works','ⓘ']],
  admin:[['command','Command centre','◫'],['review','Incident review','☷'],['how','How it works','ⓘ']],
};
const $=(id)=>document.getElementById(id);
const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const time=(s)=>new Date(s).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const pill=(word,type='gray')=>`<span class="pill ${type}">${esc(word)}</span>`;
const statusPill=(s)=>pill(statusText[s]||s,statusColor[s]||'gray');
const riskPill=(z)=>pill(z.level==='red'?'Higher risk':z.level==='yellow'?'Caution':'Lower reported risk',z.level);
let toastHandle;
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastHandle);toastHandle=setTimeout(()=>$('toast').classList.add('hidden'),3700);}
async function request(path,options={}){
  const resp=await fetch(path,{credentials:'same-origin',...options});
  let json={};try{json=await resp.json();}catch(e){}
  if(!resp.ok)throw new Error(typeof json.detail==='string'?json.detail:`Request failed (${resp.status})`);
  return json;
}
async function jsonRequest(path,method,data){return request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});}
function showAuth(){state.user=null;$('authPage').classList.remove('hidden');$('appPage').classList.add('hidden');$('modalRoot').innerHTML='';}
function authMode(mode){state.authMode=mode;$('authTitle').textContent=mode==='login'?'Sign in to continue':'Create your resident account';$('authSubtitle').textContent=mode==='login'?'Access the appropriate workspace for your role.':'Residents can report hazards and track management updates.';$('signupNameGroup').classList.toggle('hidden',mode==='login');$('authPassword').autocomplete=mode==='login'?'current-password':'new-password';$('authSubmit').textContent=mode==='login'?'Sign in →':'Create account →';$('authSwitchLine').innerHTML=mode==='login'?'New resident? <button type="button" class="link-btn" id="switchAuth">Create an account</button>':'Already have an account? <button type="button" class="link-btn" id="switchAuth">Sign in</button>';
  $('switchAuth').onclick=()=>authMode(mode==='login'?'register':'login');
}
$('authForm').addEventListener('submit',async(e)=>{
  e.preventDefault();const email=$('authEmail').value,password=$('authPassword').value;
  try{
    if(state.authMode==='register'){
      await jsonRequest('/api/auth/register','POST',{email,password,name:$('signupName').value});
      authMode('login');toast('Account created. Sign in to continue.');return;
    }
    const result=await jsonRequest('/api/auth/login','POST',{email,password});
    startApp(result.user);
  }catch(e){toast(e.message);}
});
document.querySelectorAll('.demo-account').forEach(el=>el.addEventListener('click',()=>{
  authMode('login');const admin=el.dataset.demo==='admin';$('authEmail').value=admin?'admin@safetown.test':'resident@safetown.test';$('authPassword').value=admin?'Admin@12345':'Resident@12345';toast('Demo credentials filled — click Sign in.');
}));
$('logoutBtn').onclick=logout;
async function logout(){try{await jsonRequest('/api/auth/logout','POST',{});}catch(e){}showAuth();toast('Signed out.');}
$('refreshBtn').onclick=async()=>{await refreshAll(true);toast('Data refreshed.');};

async function startApp(user){
  state.user=user;state.page=user.role==='admin'?'command':'overview';state.selectedZone=null;state.lastResult=null;
  $('authPage').classList.add('hidden');$('appPage').classList.remove('hidden');
  $('rolePill').textContent=user.role==='admin'?'◈ SECURITY MANAGEMENT':'◈ RESIDENT WORKSPACE';
  $('userName').textContent=user.name;$('userRole').textContent=user.role==='admin'?'Security administrator':'Community resident';
  $('userAvatar').textContent=(user.name||'U').charAt(0).toUpperCase();
  buildNav();await refreshAll(true);
}
function buildNav(){
  $('appNav').innerHTML=pages[state.user.role].map(([key,title,icon])=>`<button class="nav-item ${state.page===key?'active':''}" data-page="${key}"><span class="nav-icon">${icon}</span>${title}</button>`).join('')+'<button class="nav-item mobile-signout" data-action="signout"><span class="nav-icon">↪</span>Sign out</button>';
  document.querySelectorAll('#appNav [data-page]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
  document.querySelector('#appNav [data-action="signout"]').onclick=logout;
}
function navigate(page){state.page=page;state.lastResult=null;state.filter='all';state.search='';buildNav();render();window.scrollTo({top:0,behavior:'smooth'});}
async function refreshAll(force=false){
  if(!state.user)return;
  try{
    const paths=state.user.role==='admin'?['/api/zones','/api/reports','/api/dashboard']:['/api/zones','/api/reports/mine'];
    const values=await Promise.all(paths.map(p=>request(p)));
    state.zones=values[0];if(state.user.role==='admin'){state.reports=values[1];state.dashboard=values[2];}else state.mine=values[1];
    if(force || !['report'].includes(state.page))render();
  }catch(e){if(e.message.includes('sign in')||e.message.includes('expired'))showAuth();toast(e.message);}
}
function topHeader(kicker,title){$('pageKicker').textContent=kicker;$('pageTitle').textContent=title;}
function render(){
  if(!state.user)return;
  if(state.page==='overview'){topHeader('COMMUNITY SAFETY','Township Safety Overview');$('mainContent').innerHTML=residentHome();}
  else if(state.page==='report'){topHeader('COMMUNITY REPORTING','Report a Safety Hazard');$('mainContent').innerHTML=reportPage();bindReportForm();}
  else if(state.page==='tracking'){topHeader('MY INCIDENTS','Report Tracking');$('mainContent').innerHTML=trackingPage();}
  else if(state.page==='command'){topHeader('SECURITY OPERATIONS','Township Command Centre');$('mainContent').innerHTML=commandPage();}
  else if(state.page==='review'){topHeader('MANAGEMENT REVIEW','Incident Verification Queue');$('mainContent').innerHTML=reviewPage();bindReviewFilters();}
  else{topHeader('HOW SAFETOWN WORKS','A Transparent Safety Workflow');$('mainContent').innerHTML=howPage();}
  bindCommon();
}
function metric(label,value,small,icon){return `<div class="metric"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon}</span></div><strong>${value}</strong><small>${small}</small></div>`;}
function mapMarkup(){
  const coords={A:[5,6,35,31,22.5,21,'North Residences'],B:[48,6,25,31,60.5,21,'Playground'],C:[79,6,16,31,87,21,'Lakeside'],D:[5,51,35,31,22.5,65,'Community Hub'],E:[48,51,25,31,60.5,65,'Commercial'],F:[79,51,16,31,87,65,'Entrance']};
  const zones=Object.entries(coords).map(([code,[x,y,w,h,cx,cy,name]])=>{
    const z=state.zones.find(z=>z.code===code)||{level:'green',score:0};
    return `<rect class="zone-shape ${z.level} ${state.selectedZone===code?'selected':''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="2" data-zone="${code}"><title>Zone ${code} - ${name}: ${z.score}/100</title></rect><text class="map-code" x="${cx}" y="${cy}">${code}</text><text class="map-sub" x="${cx}" y="${cy+7}">${name}</text>`;
  }).join('');
  return `<div class="map-container"><svg class="town-map" viewBox="0 0 100 88" role="img" aria-label="Schematic township heatmap with six clickable zones">
     <rect class="map-land" x="0" y="0" width="100" height="88" rx="3"/>
     <path class="map-road" d="M3 44 H97 M44 3 V85"/><path class="map-road-thin" d="M76 2 V85"/>
     ${zones}<text class="road-name" x="3" y="48">MAIN BOULEVARD</text>
   </svg></div><div class="zone-grid">${state.zones.map(z=>`<button class="zone-card ${state.selectedZone===z.code?'selected':''}" data-zone="${z.code}"><small>ZONE ${z.code} · ${esc(z.name)}</small><div class="zone-row"><strong>${z.score}<span style="font-size:12px;color:#819bad">/100</span></strong>${riskPill(z)}</div><div class="zone-count">${z.active} active report${z.active===1?'':'s'}</div><div class="tiny-risk"><b class="${z.level}" style="width:${z.score}%"></b></div></button>`).join('')}</div>`;
}
function zoneLegend(){return `<div class="legend"><span><i style="background:#48b58c"></i>Lower reported risk</span><span><i style="background:#efb84d"></i>Caution</span><span><i style="background:#df6669"></i>Higher reported risk</span></div>`;}
function selectedZoneCard(){
  const z=state.zones.find(z=>z.code===state.selectedZone);
  if(!z)return `<div class="tip-box">Select a zone to view aggregated safety information. New reports start unverified and contribute less to the provisional heatmap.</div>`;
  return `<div class="tip-box"><strong>ZONE ${z.code} — ${esc(z.name)}</strong><br>${z.pending} pending report(s) · ${z.verified} verified/in-progress report(s). Risk score ${z.score}/100.<br><small>${z.active===0?'No recent active reports; this does not prove the area is safe.':'Risk is indicative, not a guarantee or a verified crime forecast.'}</small></div>`;
}
function residentHome(){
  const mine=state.mine||[], active=mine.filter(r=>!['resolved','rejected'].includes(r.status)).length;
  return `<div class="page-intro"><div><h2>Good day, ${esc(state.user.name.split(' ')[0])} 👋</h2><p>Stay informed about reported hazards. Help your community by sharing what you personally observe.</p></div><button class="btn primary" data-go="report">＋ Report a hazard</button></div>
    <div class="metrics">${metric('Township zones','06','Illustrative township','◫')}${metric('My reports',mine.length,'Your submitted cases','☷')}${metric('My active cases',active,'Pending, verified or in progress','◷')}${metric('Caution / higher zones',state.zones.filter(z=>z.level!=='green').length,'Based on reported incidents','⌁')}</div>
    <div class="two-col"><section class="card"><div class="card-head"><div><div class="card-kicker">LIVE SAFETY INTELLIGENCE</div><h3>Community Safety Heatmap</h3></div><span class="pill teal">12s updates</span></div>${mapMarkup()}<div class="section-gap">${zoneLegend()}</div>${selectedZoneCard()}<p class="small-note">Green means lower <strong>reported</strong> risk, not proof that the area is safe. Zones are a simulated map for the hackathon.</p></section>
      <div><section class="card"><div class="card-kicker">YOUR PARTICIPATION</div><h3>Have you noticed a hazard?</h3><p class="muted" style="font-size:13px">Report broken lights, damaged fences, stray animals, concerning activity, or dangerous roads. You choose the initial severity; AI helps classify your description.</p><button class="btn primary block" data-go="report">Report an issue →</button><div class="tip-box warning-box">⚠ For immediate threats to life or safety, contact emergency services directly. Do not wait for an app verification.</div></section>
      <section class="card section-gap"><div class="card-head"><div><div class="card-kicker">CASE TRACKING</div><h3>My recent reports</h3></div><button class="btn outline sm" data-go="tracking">View all</button></div>${mine.length?`<div class="list-stack">${mine.slice(0,4).map(reportRow).join('')}</div>`:`<div class="empty-state"><strong>No reports yet</strong>Your submitted reports will appear here.</div>`}</section></div>
    </div>`;
}
function severitySelector(selected=3){return `<div class="severity-list">${Object.entries(severityInfo).map(([n,[name]])=>`<div class="sev-option"><input id="severity-${n}" type="radio" name="severity" value="${n}" ${+n===+selected?'checked':''}><label for="severity-${n}"><strong>${n}</strong><small>${name}</small></label></div>`).join('')}</div><div id="severityHelp" class="sev-explain">${severityInfo[selected][0]} — ${severityInfo[selected][1]}</div>`;}
function reportPage(){return `<div class="page-intro report-intro">
  <div>
    <div class="mobile-report-eyebrow">COMMUNITY SAFETY · NEW REPORT</div>
    <h2>Report a hazard</h2>
    <p>Share what you observed. Your report will be reviewed by township security management.</p>
  </div>
</div>
<div class="report-layout" id="reportLayout">
  <section class="card report-form-card" aria-label="Community Safety Report form">
    <div class="card-kicker">NEW INCIDENT REPORT</div>
    <div class="report-form-header">
      <h3>Community Safety Report</h3>
      <p class="mobile-report-lead">Complete the four sections below. You can scroll naturally through the form.</p>
    </div>
    <form id="newReportForm">
      <div class="report-form-section">
        <div class="mobile-report-step"><span class="mobile-step-number">01</span><span>Location</span></div>
        <label for="reportZone">Where did it happen?</label>
        <select id="reportZone" name="zone" required>${state.zones.map(z=>`<option value="${z.code}" ${state.selectedZone===z.code?'selected':''}>Zone ${z.code} — ${esc(z.name)}</option>`).join('')}</select>
      </div>
      <div class="report-form-section">
        <div class="mobile-report-step"><span class="mobile-step-number">02</span><span>Incident details</span></div>
        <label for="reportDescription">What happened?</label>
        <textarea id="reportDescription" name="description" maxlength="800" minlength="10" required placeholder="Example: Lampu jalan rosak dekat playground dan kawasan sangat gelap."></textarea>
        <p class="small-note">Write in English, Bahasa Melayu, or both. Only share what you personally observed.</p>
      </div>
      <div class="report-form-section">
        <div class="mobile-report-step"><span class="mobile-step-number">03</span><span>Your severity assessment</span></div>
        <label id="resident-severity-label">How serious did the situation seem to you?</label>
        <div role="group" aria-labelledby="resident-severity-label">${severitySelector(3)}</div>
        <p class="small-note mobile-severity-note">You select the initial severity. Management will verify the actual situation later.</p>
      </div>
      <div class="report-form-section report-evidence-section">
        <div class="mobile-report-step"><span class="mobile-step-number">04</span><span>Evidence (optional)</span></div>
        <label for="reportPhoto">Attach a supporting photo</label>
        <input id="reportPhoto" name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
        <p class="small-note">JPEG, PNG or WebP · Maximum 4 MB · Visible only to you and authorized security admins.</p>
      </div>
      <div class="report-submit-section">
        <div class="tip-box report-ai-disclaimer">✦ AI identifies the <strong>incident category</strong>. <strong>You</strong> select the initial severity.</div>
        <button type="submit" class="btn primary block" id="submitReport">Submit report for verification →</button>
        <p class="mobile-submit-note">Your report will start as <strong>Pending Verification</strong>.</p>
      </div>
    </form>
    <div id="reportResult" role="status" aria-live="polite"></div>
  </section>

  <aside class="report-support" aria-label="Additional reporting information">
    <details class="card report-help-details">
      <summary class="report-help-summary"><span class="report-help-icon" aria-hidden="true">◷</span><span><strong>What happens after I submit?</strong><small>See your report journey</small></span><span class="report-help-chevron" aria-hidden="true">⌄</span></summary>
      <div class="report-help-content"><div class="audit">${[['1','Pending','Your report enters the management queue with your severity rating.'],['2','Verified','Security confirms the incident and may correct the severity with a reason.'],['3','In progress','Security or maintenance takes the required action.'],['4','Resolved','Management confirms the issue has been addressed.']].map(([n,t,d])=>`<div class="audit-entry"><strong>${n}. ${t}</strong><p>${d}</p></div>`).join('')}</div>
        <p class="small-note">Reports may also be rejected when unsupported. An exaggerated severity does not automatically make a report false.</p>
      </div>
    </details>
    <details class="card report-help-details">
      <summary class="report-help-summary"><span class="report-help-icon" aria-hidden="true">ⓘ</span><span><strong>How does the heatmap work?</strong><small>Understand reported-risk levels</small></span><span class="report-help-chevron" aria-hidden="true">⌄</span></summary>
      <div class="report-help-content"><p class="small-note">Pending reports contribute provisional reported risk. Verified severity is used after review. Older reports carry less weight; resolved and rejected reports no longer contribute to current risk.</p>
        <div class="tip-box warning-box">For immediate danger, contact emergency services. This prototype does not call them automatically.</div>
      </div>
    </details>
  </aside>
</div>`;}
function reportRow(r){return `<div class="report-row"><div><h4>#ST-${String(r.id).padStart(4,'0')} · ${esc(r.category_label)}</h4><p>Zone ${r.zone} · ${time(r.created_at)} · Resident severity ${r.resident_severity}/5</p></div><div class="end">${statusPill(r.status)}<button class="btn outline sm" data-detail="${r.id}">Track →</button></div></div>`;}
function trackingPage(){return `<div class="page-intro"><div><h2>Track your submitted cases</h2><p>Your original severity remains saved even if management adjusts its verified assessment.</p></div><button class="btn primary" data-go="report">＋ New report</button></div>
    <section class="card"><div class="card-head"><div><div class="card-kicker">REPORT HISTORY</div><h3>My safety reports</h3></div><span class="pill blue">${state.mine.length} total</span></div>
    ${state.mine.length?`<div class="list-stack">${state.mine.map(reportRow).join('')}</div>`:`<div class="empty-state"><strong>No reports have been submitted</strong>When you submit a report, its progress will appear here.</div>`}</section>`;}
function commandPage(){const d=state.dashboard||{counts:{},urgent_pending:0,severity_corrections:0,priority_zone:{code:'—',score:0},recommendation:''};const cs=d.counts||{};
 return `<div class="page-intro"><div><h2>Security decisions, backed by reports.</h2><p>Review unverified claims, track active hazards, and focus security attention on verified and provisional risks.</p></div><button class="btn outline" id="resetDemoBtn">↻ Reset demo reports</button></div>
    <div class="metrics">${metric('Pending review',cs.pending||0,`${d.urgent_pending} urgent flag(s)`,'◷')}${metric('Verified incidents',(cs.verified||0)+(cs.in_progress||0),'Confirmed or in progress','✓')}${metric('Resolved',cs.resolved||0,'Completed cases','◈')}${metric('Severity corrected',d.severity_corrections,'Resident rating adjusted','⇄')}</div>
    <div class="two-col"><section class="card"><div class="card-head"><div><div class="card-kicker">ZONE INTELLIGENCE</div><h3>Dynamic Township Heatmap</h3></div><span class="pill teal">Live estimates</span></div>${mapMarkup()}<div class="section-gap">${zoneLegend()}</div>${selectedZoneCard()}<p class="small-note">No heatmap is a guarantee of safety. Unverified reports carry a smaller provisional weight. Risk thresholds are illustrative only.</p></section>
    <div><section class="card"><div class="card-kicker">PATROL PRIORITY</div><h3>Zone attention ranking</h3><div class="top-zone">${[...state.zones].sort((a,b)=>b.score-a.score).map(z=>`<div class="top-zone-item"><div><strong>Zone ${z.code} — ${esc(z.name)}</strong>${riskPill(z)}</div><div class="tiny-risk"><b class="${z.level}" style="width:${z.score}%"></b></div><small>${z.score}/100 · ${z.active} active reports · ${z.pending} pending</small></div>`).join('')}</div><div class="review-callout section-gap"><h4>◉ Suggested patrol attention</h4><p>${esc(d.recommendation)} This is a rule-based recommendation, not a crime forecast.</p></div></section>
    <section class="card section-gap"><div class="card-kicker">HIGH PRIORITY QUEUE</div><h3>Pending management review</h3><div class="list-stack">${state.reports.filter(r=>r.status==='pending').slice(0,4).map(reportRow).join('')||'<div class="empty-state">No pending reports.</div>'}</div><button class="btn outline block" style="margin-top:15px" data-go="review">Open verification queue →</button></section></div>
    </div>`;
}
function reviewPage(){return `<div class="page-intro"><div><h2>Review and verify community reports</h2><p>Confirm the actual condition using available evidence or a site inspection when needed. Correct exaggerated ratings with a recorded reason.</p></div></div>
    <section class="card"><div class="card-head"><div><div class="card-kicker">CENTRALISED REPORTS</div><h3>Incident management queue</h3></div><span class="pill blue">${state.reports.length} reports</span></div>
      <div class="filterbar"><select id="statusFilter"><option value="all" ${state.filter==='all'?'selected':''}>All statuses</option>${Object.entries(statusText).map(([k,v])=>`<option value="${k}" ${state.filter===k?'selected':''}>${v}</option>`).join('')}</select><input id="reportSearch" placeholder="Search incident or zone..." value="${esc(state.search)}" /></div>
      <div id="reportTableWrapper">${reviewTable()}</div>
    </section><section class="card section-gap"><div class="card-kicker">REVIEW RULES</div><div class="review-callout"><h4>Human verification is required</h4><p>Only security management can verify, reject, begin work, or resolve a report. Verification records the admin’s severity and reason for changes. Urgent flags require prompt human attention even when an incident remains unverified.</p></div></section>`;}
function reviewTable(){let results=state.reports.filter(r=>(state.filter==='all'||r.status===state.filter)&&(`${r.description} ${r.zone} ${r.category_label}`.toLowerCase().includes(state.search.toLowerCase())));
 return results.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>REPORT</th><th>ZONE</th><th>RESIDENT RATE</th><th>VERIFIED RATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>${results.map(r=>`<tr><td class="description"><strong>#ST-${String(r.id).padStart(4,'0')} ${r.urgent_flag?'<span class="badge-n">URGENT FLAG</span>':''} ${r.possible_duplicate_of?'<span class="badge-n">POSSIBLE DUPLICATE</span>':''}</strong>${esc(r.description)}<br><small>${esc(r.category_label)} · ${time(r.created_at)}</small></td><td><strong>${r.zone}</strong></td><td><strong>${r.resident_severity}/5</strong></td><td>${r.verified_severity?`${r.verified_severity}/5`:'—'}</td><td>${statusPill(r.status)}</td><td><button class="btn outline sm" data-detail="${r.id}">Review →</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><strong>No matching reports</strong>Try a different filter or search term.</div>';
}
function howPage(){return `<div class="page-intro"><div><h2>One clear workflow, two separate roles.</h2><p>Residents supply firsthand observations and initial severity. AI assists with classification. Security teams verify facts before management action and update the community risk map.</p></div></div>
   <div class="guide-grid">${[
       ['1','Resident submits','Describe an incident, choose its township zone, set perceived severity from 1–5, and optionally attach a photo.'],
       ['2','AI classifies','A machine-learning classifier identifies the hazard category, records confidence, and flags likely duplicates and urgent terms.'],
       ['3','Pending appears','New reports receive provisional status; they influence the heatmap at 50% weight while awaiting review.'],
       ['4','Human verifies','An admin reviews reports and supporting evidence. Staff inspection may be necessary; urgent hazards need immediate attention.'],
       ['5','Management acts','A confirmed issue moves from Verified → In progress → Resolved. Unsubstantiated reports can be rejected.'],
       ['6','Heatmap recalculates','The map uses verified severity where available, verification weight, 48-hour recency decay, and excludes resolved/rejected reports.'],
      ].map(([n,h,d])=>`<article class="guide-card"><div class="guide-num">${n}</div><h3>${h}</h3><p>${d}</p></article>`).join('')}</div>
   <section class="card section-gap"><div class="card-kicker">EXPLAINABLE RISK MODEL</div><h3>What the zone score really means</h3>
   <p class="muted" style="font-size:13px">For each active report: <strong>severity × recency factor × verification weight</strong>. Unverified reports use the resident's rating × 0.35; verified or in-progress reports use the admin's confirmed severity × 1.0. An exponential factor halves a report's influence every 48 hours. Contributions are summed and scaled to a 0–100 display score.</p>
   <div class="count-strip">${pill('Green: under 25','green')}${pill('Yellow: 25–59','yellow')}${pill('Red: 60+','red')}</div>
   <div class="tip-box warning-box">The thresholds and sample data are demonstration assumptions, not empirically validated safety predictions. No reports means insufficient evidence, not proof of safety. For emergencies, contact local emergency services immediately.</div></section>`;}

function bindReviewFilters(){
 $('statusFilter').onchange=e=>{state.filter=e.target.value;$('reportTableWrapper').innerHTML=reviewTable();bindCommon();};
 $('reportSearch').oninput=e=>{state.search=e.target.value;$('reportTableWrapper').innerHTML=reviewTable();bindCommon();};
}
function bindReportForm(){
 document.querySelectorAll('input[name="severity"]').forEach(el=>el.addEventListener('change',()=>{
   const n=+document.querySelector('input[name="severity"]:checked').value;
   $('severityHelp').textContent=severityInfo[n][0]+' — '+severityInfo[n][1];
   $('severityHelp').classList.toggle('warning-box',n===5);
 }));
 $('newReportForm').addEventListener('submit',async e=>{
   e.preventDefault();const form=e.target;const fd=new FormData();const photo=$('reportPhoto').files[0];
   if(photo&&photo.size>4*1024*1024){toast('Choose a photo no larger than 4 MB');return;}
   fd.append('zone',$('reportZone').value);fd.append('description',$('reportDescription').value);fd.append('resident_severity',document.querySelector('input[name="severity"]:checked').value);
   if(photo)fd.append('photo',photo);
   const b=$('submitReport');b.disabled=true;b.textContent='Submitting report...';
   try{
     const result=await request('/api/reports',{method:'POST',body:fd});
     state.lastResult=result.report;
     await Promise.all([request('/api/zones').then(z=>state.zones=z),request('/api/reports/mine').then(r=>state.mine=r)]);
     form.reset();const s=document.querySelector('#severity-3');if(s)s.checked=true;$('severityHelp').textContent=severityInfo[3].join(' — ');
     $('reportResult').innerHTML=`<div class="report-confirm"><h4>✓ Report #ST-${String(result.report.id).padStart(4,'0')} submitted</h4><p>AI category: <strong>${esc(result.report.category_label)}</strong> · Resident severity: <strong>${result.report.resident_severity}/5</strong> · Status: <strong>Pending verification</strong></p>${result.report.possible_duplicate_of?`<p>⚑ Possible similar report #ST-${result.report.possible_duplicate_of} flagged for human review.</p>`:''}${result.report.urgent_flag?'<p>⚠ This report has been flagged for prompt security review. Contact emergency services for immediate danger.</p>':''}<button class="btn outline sm" data-detail="${result.report.id}">Track this report →</button></div>`;
     bindCommon();toast('Report saved. Management can now review it.');
   }catch(err){toast(err.message);}finally{b.disabled=false;b.textContent='Submit report for verification →';}
 });
}
function bindCommon(){
  document.querySelectorAll('[data-go]').forEach(el=>el.onclick=()=>navigate(el.dataset.go));
  document.querySelectorAll('[data-zone]').forEach(el=>el.onclick=()=>{state.selectedZone=el.dataset.zone;render();});
  document.querySelectorAll('[data-detail]').forEach(el=>el.onclick=()=>openDetail(+el.dataset.detail));
  const reset=$('resetDemoBtn');if(reset)reset.onclick=resetDemo;
}
async function resetDemo(){
 if(!confirm('Restore the sample demo reports? This deletes all submitted reports and case histories, but keeps user accounts.'))return;
 try{const r=await jsonRequest('/api/demo/reset','POST',{});await refreshAll(true);toast(r.message);}catch(e){toast(e.message);}
}
function photoHtml(id){return `<div class="section-gap"><div class="card-kicker">SUPPORTING PHOTO</div><img class="modal-photo" src="/api/reports/${id}/photo" alt="Photo attached to incident #${id}" /></div>`;}
async function openDetail(id){
 try{
   const {report:r,history}=await request(`/api/reports/${id}`);const isAdmin=state.user.role==='admin';
   const before=r.resident_severity,after=r.verified_severity;
   const severityComparison=`<div class="panel-columns"><div class="info-stat"><label>Original resident severity</label><strong>${before}/5 — ${severityInfo[before][0]}</strong></div><div class="info-stat"><label>Confirmed management severity</label><strong>${after?`${after}/5 — ${severityInfo[after][0]}`:'Not verified yet'}</strong></div></div>`;
   $('modalRoot').innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Report #${id}"><button class="close" id="closeModal" aria-label="Close">×</button><div class="card-kicker">INCIDENT #ST-${String(id).padStart(4,'0')} · ZONE ${r.zone}</div><h2>Incident details & tracking</h2><div class="timeline-status">${statusPill(r.status)}${r.urgent_flag?pill('Urgent review flag','red'):''}${r.possible_duplicate_of?pill(`Similar report #${r.possible_duplicate_of}`,'yellow'):''}${r.needs_review?pill('Low AI confidence','yellow'):''}</div>
     <div class="divider"></div><p><strong>Resident description</strong></p><p style="font-size:13px;color:#48657a;white-space:pre-wrap">${esc(r.description)}</p><div class="report-meta">${pill('AI category: '+r.category_label,'blue')}${pill('AI confidence: '+Math.round(r.ai_confidence*100)+'%','gray')}${pill('Submitted: '+time(r.created_at),'gray')}</div>
     <div class="section-gap">${severityComparison}</div>
     ${after&&after!==before?`<p class="diff-chip section-gap">↪ Management adjusted severity from ${before}/5 to ${after}/5. Check the audit trail for its justification.</p>`:''}
     ${r.has_photo?photoHtml(id):''}
     ${isAdmin?adminReviewControls(r):''}
     <div class="divider"></div><div class="card-kicker">CASE HISTORY · IMMUTABLE AUDIT TRAIL</div><div class="audit">${history.map(h=>`<div class="audit-entry"><strong>${statusText[h.to_status]||h.to_status}</strong> ${h.from_status?`<span class="muted" style="font-size:11px">from ${statusText[h.from_status]||h.from_status}</span>`:''}<p>${esc(h.note)} ${h.new_severity!=null&&h.previous_severity!=null&&h.new_severity!==h.previous_severity?`(Severity ${h.previous_severity} → ${h.new_severity})`:''}</p><small>${time(h.created_at)} · ${esc(h.actor_name)}</small></div>`).join('')}</div>
     </section></div>`;
   $('closeModal').onclick=closeModal;
   $('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
   if(isAdmin)bindAdminReview(r);
 }catch(e){toast(e.message);}
}
function adminReviewControls(r){
 if(['resolved','rejected'].includes(r.status))return `<div class="tip-box">This report is closed. Its audit history remains available; it does not currently contribute to reported risk.</div>`;
 if(r.status==='pending')return `<div class="section-gap"><div class="card-kicker">MANAGEMENT VERIFICATION</div><p class="small-note">Check available photos, records or request a site inspection when necessary. Enter confirmed severity <em>after reviewing evidence</em>, not before.</p><label for="verifiedSeverity">Confirmed severity (1–5)</label><select id="verifiedSeverity">${Object.entries(severityInfo).map(([n,[name]])=>`<option value="${n}" ${+n===r.resident_severity?'selected':''}>${n} — ${name}</option>`).join('')}</select><label for="reviewNote">Management note / reason for change</label><textarea id="reviewNote" style="min-height:75px" maxlength="500" placeholder="Example: Inspected location; only one lamp is out and the path has additional lighting."></textarea><div class="review-actions"><button class="btn primary" data-review-action="verify">✓ Verify report</button><button class="btn danger" data-review-action="reject">× Reject unsupported report</button></div><p class="small-note">Rejected reports require a written reason. If the severity changes, a written explanation is required.</p></div>`;
 if(r.status==='verified')return `<div class="section-gap"><div class="card-kicker">ASSIGN RESPONSE</div><label for="reviewNote">Action note (optional)</label><textarea id="reviewNote" style="min-height:75px" maxlength="500" placeholder="Example: Assigned maintenance team to inspect the lamp post."></textarea><div class="review-actions"><button class="btn primary" data-review-action="start">Start work →</button><button class="btn outline" data-review-action="resolve">Mark resolved</button></div></div>`;
 return `<div class="section-gap"><div class="card-kicker">RESOLVE INCIDENT</div><label for="reviewNote">Resolution details (required)</label><textarea id="reviewNote" style="min-height:75px" maxlength="500" placeholder="Example: Maintenance repaired the lamp post and tested the light."></textarea><div class="review-actions"><button class="btn primary" data-review-action="resolve">✓ Mark resolved</button></div></div>`;
}
function bindAdminReview(r){document.querySelectorAll('[data-review-action]').forEach(el=>el.onclick=async()=>{
 const action=el.dataset.reviewAction;
 const verified_severity=action==='verify'?Number($('verifiedSeverity').value):null;
 const note=$('reviewNote')?.value||'';
 if(action==='reject'&&!confirm('Reject this report as unsupported? The original report will remain in history.'))return;
 try{
   const result=await jsonRequest(`/api/reports/${r.id}/review`,'POST',{action,verified_severity,note});
   await refreshAll(true);toast(result.message);await openDetail(r.id);
 }catch(e){toast(e.message);}
});}
function closeModal(){$('modalRoot').innerHTML='';}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
authMode('login');
(async()=>{try{const user=await request('/api/auth/me');await startApp(user);}catch(e){showAuth();}})();
setInterval(async()=>{
 if(state.user){
   // Preserve the resident's partially written report and any open incident review.
   if(!['report'].includes(state.page)&&!$('modalBackdrop'))await refreshAll(false);
 }
},12000);
