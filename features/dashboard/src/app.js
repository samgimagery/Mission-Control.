const THEME_KEY = 'openclawTheme';
const themeToggle = document.getElementById('themeToggle');
function applyTheme(mode){
  document.body.classList.toggle('dark', mode === 'dark');
  if (themeToggle) themeToggle.textContent = mode === 'dark' ? 'Light mode' : 'Dark mode';
}
const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
applyTheme(savedTheme);
themeToggle?.addEventListener('click', ()=>{
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// --- LIVE ACTIVITY ---
async function fetchMissionControlState() {
  const apiUrl = new URL('../api/mission-control-state', window.location.href);
  try {
    const response = await fetch(apiUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Server offline (${response.status})`);
    return await response.json();
  } catch (e) {
    console.error('Mission Control Bridge Error:', e);
    return null;
  }
}

async function renderLive() {
  const state = await fetchMissionControlState();
  if (!state) {
    document.getElementById('liveGrid').innerHTML = 
      `<div style="grid-column: span 6; text-align: center; color: var(--muted); padding: 20px;">Server Offline - Check Bridge Connection</div>`;
    return;
  }

  const agents = state.agents || [];
  document.getElementById('liveGrid').innerHTML = agents.map(a => `
    <article class="live-item">
      <div class="k">${a.name} <span style="font-size: 9px; opacity: 0.6;">${a.id}</span></div>
      <div class="v" style="font-size: 14px;">${a.role}</div>
      <div style="font-size: 10px; margin-top: 4px; color: ${a.zone === 'working' ? '#16a34a' : 'var(--muted)'}">
        ● ${a.zone.toUpperCase()}
      </div>
    </article>
  `).join('') || '<div style="grid-column: span 6; text-align: center; color: var(--muted);">No active agents found</div>';

  // Update KPIs
  const stats = state.stats || {};
  const kpiData = [
    { label: 'Total Assets', value: stats.assetsCount || 0 },
    { label: 'Active Sessions', value: stats.sessionsCount || 0 },
    { label: 'Recent Files', value: stats.recentFilesCount || 0 },
    { label: 'Target CAC', value: 'CAD 28' },
    { label: 'Target LTV', value: 'CAD 132' }
  ];
  document.getElementById('kpis').innerHTML = kpiData.map(m => `
    <article class="kpi">
      <div class="label">${m.label}</div>
      <div class="value">${m.value}</div>
    </article>
  `).join('');

  // Update Timestamp
  const timestamp = state.timestamp ? new Date(state.timestamp).toLocaleString() : '—';
  document.getElementById('updatedAt').textContent = `Updated: ${timestamp}`;
}

// Initialize and start polling loop
renderLive();
setInterval(renderLive, 30000);

document.querySelectorAll('#rangeToggle .seg').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('#rangeToggle .seg').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderLive();
}));

// --- SIMULATOR LOGIC (NEW) ---
const budgetSlider = document.getElementById('budgetSlider');
const budgetValue = document.getElementById('budgetValue');
const projUsers = document.getElementById('projUsers');
const projARR = document.getElementById('projARR');
const projLTV = document.getElementById('projLTV');

const CAC_TARGET = 28; 
const LTV_TARGET = 132;
const AVG_ANNUAL_REV = 90; // Average annual revenue per paid user (CAD)

function updateSimulator() {
  const budget = parseInt(budgetSlider.value);
  budgetValue.textContent = `CAD ${budget.toLocaleString()}`;
  
  const users = Math.floor(budget / CAC_TARGET);
  const arr = users * AVG_ANNUAL_REV;
  const totalLTV = users * LTV_TARGET;
  
  projUsers.textContent = users.toLocaleString();
  projARR.textContent = `CAD ${Math.round(arr).toLocaleString()}`;
  projLTV.textContent = `CAD ${Math.round(totalLTV).toLocaleString()}`;
}

budgetSlider.addEventListener('input', updateSimulator);
updateSimulator(); // Initialize

// --- STATIC DASHBOARD CONTENT ---
const metrics = [
  { label: 'TAM (US+CA)', value: 'CAD 1.12B' },
  { label: 'SAM (EN/FR focus)', value: 'CAD 142M' },
  { label: '12-mo target', value: '12,000 paid' },
  { label: 'Target CAC', value: 'CAD 28' },
  { label: 'Target LTV', value: 'CAD 132' }
];
const glossary = [
  ['TAM', 'Total Addressable Market'], ['SAM', 'Serviceable Available Market'], ['SOM', 'Serviceable Obtainable Market'],
  ['CAC', 'Customer Acquisition Cost'], ['LTV', 'Lifetime Value'], ['KPI', 'Key Performance Indicator'], ['MRR', 'Monthly Recurring Revenue']
];
const chartSpecs = [
  {title:'Market Layers (Annual Revenue, CAD)',x:'Market layer',y:'CAD (annual)',type:'bar',labels:['TAM','SAM','SOM'],values:[1123200000,142100000,1440000],color:'#3b82f6',fmt:v=>`CAD ${(v/1e6).toFixed(1)}M`},
  {title:'Competitor Monthly Pricing (USD)',x:'App',y:'USD / month',type:'bar',labels:['CHANI','Co-Star','The Pattern','Sanctuary','Cosmic Engine'],values:[11.99,8.99,14.99,12.99,14.99],color:'#8b5cf6',fmt:v=>`$${v.toFixed(2)}`},
  {title:'Acquisition Funnel Assumptions',x:'Funnel stage',y:'Users',type:'bar',labels:['Impr.','Visits','Installs','Act.D7','Trial','Paid'],values:[2500000,200000,50000,24000,9000,2250],color:'#0ea5a4',fmt:v=>Math.round(v).toLocaleString()},
  {title:'CAC vs LTV by Scenario (CAD)',x:'Metric',y:'CAD',type:'bar',labels:['CAC Cons','LTV Cons','CAC Base','LTV Base','CAC Up','LTV Up'],values:[35,96,28,132,22,168],color:'#f59e0b',fmt:v=>`CAD ${Math.round(v)}`},
  {title:'Monthly Paying Users Forecast',x:'Month',y:'Paying users',type:'line',labels:Array.from({length:12},(_,i)=>`${i+1}`),series:[{name:'Conservative',color:'#64748b',values:[528,745,997,1282,1596,1937,2304,2694,3105,3536,3985,4451]},{name:'Base',color:'#2563eb',values:[619,943,1318,1740,2205,2710,3252,3829,4437,5075,5740,6430]},{name:'Upside',color:'#16a34a',values:[755,1242,1807,2444,3148,3915,4741,5622,6554,7534,8560,9628]}],fmt:v=>Math.round(v).toLocaleString()},
  {title:'Monthly Revenue Forecast (MRR CAD)',x:'Month',y:'MRR (CAD)',type:'line',labels:Array.from({length:12},(_,i)=>`${i+1}`),series:[{name:'Conservative',color:'#64748b',values:[5702,8046,10768,13846,17237,20920,24883,29095,33534,38189,43038,48071]},{name:'Base',color:'#2563eb',values:[7057,10750,15025,19836,25137,30894,37073,43651,50582,57855,65436,73302]},{name:'Upside',color:'#16a34a',values:[9060,14904,21684,29328,37776,46980,56892,67464,78648,90408,102720,115536]}],fmt:v=>`CAD ${(v/1000).toFixed(0)}k`},
  {title:'Budget Allocation (CAD)',x:'Function',y:'Budget (CAD)',type:'bar',labels:['Product','Content','Paid Acq','Influencer','Community','Tools','Reserve'],values:[22000,16000,28000,12000,9000,7000,6000],color:'#db2777',fmt:v=>`CAD ${(v/1000).toFixed(0)}k`},
  {title:'EN/FR Pilot Split (Proposed)',x:'Language',y:'Share %',type:'bar',labels:['EN','FR'],values:[60,40],color:'#14b8a6',fmt:v=>`${Math.round(v)}%`,yMax:100,yTickStep:10}
];

const kpisEl = document.getElementById('kpis');
const chartsEl = document.getElementById('charts');
const glossaryEl = document.getElementById('glossary');
kpisEl.innerHTML = metrics.map(m => `<article class="kpi"><div class="label">${m.label}</div><div class="value">${m.value}</div></article>`).join('');
glossaryEl.innerHTML = `<article class="card"><h3>Acronym guide</h3><ul>${glossary.map(([k,v])=>`<li><strong>${k}</strong> — ${v}</li>`).join('')}</ul></article>`;

function chartBox(w=760,h=360){ return {w,h,l:62,r:14,t:20,b:44,pw:w-62-14,ph:h-20-44}; }
function makeBarSVG(labels, values, color, fmt, yMax=null, yTickStep=null){
  const c = chartBox(); const max = yMax ?? (Math.max(...values) * 1.1); const step = c.pw / labels.length;
  const bars = values.map((v,i)=>{ const h=(v/max)*c.ph; const x=c.l+i*step+step*0.12; const y=c.t+c.ph-h; const bw=step*0.76;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${color}"/><text x="${(x+bw/2).toFixed(1)}" y="${(c.t+c.ph+16).toFixed(1)}" text-anchor="middle" font-size="10" fill="#6b7280">${labels[i]}</text>`;
  }).join('');
  const ticks = yTickStep ? Math.round(max / yTickStep) : 5;
  const grid = Array.from({length:ticks+1},(_,i)=>{ const v=yTickStep?(i*yTickStep):(max*(i/ticks)); const y=c.t+c.ph-(v/max)*c.ph;
    return `<line x1="${c.l}" y1="${y.toFixed(1)}" x2="${(c.l+c.pw)}" y2="${y.toFixed(1)}" stroke="#2f3540" opacity=".25"/><text x="${c.l-8}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="10" fill="#6b7280">${fmt(v)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${c.w} ${c.h}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="transparent"/>${grid}<line x1="${c.l}" y1="${c.t+c.ph}" x2="${c.l+c.pw}" y2="${c.t+c.ph}" stroke="#4b5563"/><line x1="${c.l}" y1="${c.t}" x2="${c.l}" y2="${c.t+c.ph}" stroke="#4b5563"/>${bars}</svg>`;
}
function makeLineSVG(labels, series, fmt){
  const c = chartBox(); const max = Math.max(...series.flatMap(s=>s.values))*1.1; const stepX = c.pw/(labels.length-1); const ticks = 5;
  const grid = Array.from({length:ticks+1},(_,i)=>{ const v=max*(i/ticks); const y=c.t+c.ph-(i/ticks)*c.ph;
    return `<line x1="${c.l}" y1="${y.toFixed(1)}" x2="${(c.l+c.pw)}" y2="${y.toFixed(1)}" stroke="#2f3540" opacity=".25"/><text x="${c.l-8}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="10" fill="#6b7280">${fmt(v)}</text>`;
  }).join('');
  const xTicks = labels.map((lb,i)=>`<text x="${(c.l+i*stepX).toFixed(1)}" y="${c.t+c.ph+16}" text-anchor="middle" font-size="10" fill="#6b7280">${lb}</text>`).join('');
  const lines = series.map((s,si)=>{ const pts=s.values.map((v,i)=>`${(c.l+i*stepX).toFixed(1)},${(c.t+c.ph-(v/max)*c.ph).toFixed(1)}`).join(' '); const legendY=c.t+14+si*14;
    return `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" points="${pts}"/><text x="${c.l+c.pw-6}" y="${legendY}" text-anchor="end" font-size="10" fill="${s.color}">${s.name}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${c.w} ${c.h}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="transparent"/>${grid}<line x1="${c.l}" y1="${c.t+c.ph}" x2="${c.l+c.pw}" y2="${c.t+c.ph}" stroke="#4b5563"/><line x1="${c.l}" y1="${c.t}" x2="${c.l}" y2="${c.t+c.ph}" stroke="#4b5563"/>${xTicks}${lines}</svg>`;
}
chartsEl.innerHTML = chartSpecs.map(c => `<article class="chart-card"><h4>${c.title}</h4><div class="chart-frame">${c.type==='line'?makeLineSVG(c.labels,c.series,c.fmt):makeBarSVG(c.labels,c.values,c.color,c.fmt,c.yMax,c.yTickStep)}</div><div class="axis-meta"><strong>X:</strong> ${c.x}</div><div class="axis-meta"><strong>Y:</strong> ${c.y}</div></article>`).join('');
document.getElementById('updatedAt').textContent = `Updated: ${new Date().toLocaleString()}`;
