console.log('[MC] Unified Workspace loading...');

// Alfred working status — derived from job data (no polling)
let alfredWorkingStatus = { status: 'idle', task: null };

function updateAlfredStatusFromJobs(jobs) {
  const workingJobs = (jobs || []).filter(j => j.phase === 'working');
  if (workingJobs.length > 0) {
    const topJob = workingJobs[0];
    alfredWorkingStatus = { status: 'working', task: (topJob.number || '') + ' ' + (topJob.title || ''), activeReq: topJob.number };
  } else {
    alfredWorkingStatus = { status: 'idle', task: null, activeReq: null };
  }
}


document.addEventListener('DOMContentLoaded', () => {
  console.log('[MC] DOM ready');

  // ── Theme (dark mode persisted, dark is default) ──
  const savedTheme = localStorage.getItem('mc-theme');

  // Default to dark unless explicitly set to light
  if (savedTheme !== 'light') {
    document.body.classList.add('dark');
  }



  // ── View Switching ──
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  // ── Mobile Menu ──
  const mobileHeader = document.querySelector('.mobile-header');
  const sidebar = document.querySelector('.sidebar');
  // Mobile header menu button
  if (mobileHeader) {
    const headerBtn = mobileHeader.querySelector('.mobile-menu-btn');
    if (headerBtn && sidebar) {
      headerBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
    }
  }
  // Close menu when clicking a nav item
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (sidebar) sidebar.classList.remove('mobile-open');
    });
  });
  // Close menu when clicking outside
  if (sidebar) {
    document.addEventListener('click', (e) => {
      if (mobileHeader && mobileHeader.contains(e.target)) return;
      if (!sidebar.contains(e.target)) {
        sidebar.classList.remove('mobile-open');
      }
    });
  }

  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.dataset.view;
      switchView(targetView);
    });
  });

  function switchView(targetView) {
    navItems.forEach(nav => nav.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${targetView}"]`)?.classList.add('active');
    // Update mobile tabs too
    document.querySelectorAll('.mobile-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.mobile-tab[data-view="${targetView}"]`)?.classList.add('active');

    views.forEach(view => {
      view.classList.remove('active');
      if (view.id === targetView) view.classList.add('active');
    });

    // Pulse metrics now live in Overview — always load data

    // Load vault graph + logs when Logs view is activated
    if (targetView === 'logs') {
      loadVaultGraph();
      loadJobLogs();
    }
    // Load research list when Research view is activated
    if (targetView === 'research') {
      if (researchListData.length === 0) loadResearchList();
    }
  }

  window.switchView = switchView;

  // ── Mobile Tab Navigation ──
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchView(tab.dataset.view);
    });
  });

  // ── Elapsed Timer State ──
  let timerInterval = null;
  let workingJobTimestamps = {}; // { jobId: startedMs }
  let currentJobs = []; // Store current jobs for modal access
  let modalTimerInterval = null;

  function startElapsedTimers() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      Object.keys(workingJobTimestamps).forEach(jobId => {
        const el = document.getElementById(`elapsed-${jobId}`);
        if (!el) return;
        const startedMs = workingJobTimestamps[jobId];
        const diff = Date.now() - startedMs;
        el.textContent = formatElapsed(diff);
      });
    }, 1000);
  }

  function formatElapsed(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Format a duration in milliseconds to a human-readable string
  function formatDuration(ms) {
    if (!ms || ms < 0) return '';
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }

  function getWorkingStartTs(job) {
    if (!job.history || !Array.isArray(job.history)) return null;
    // Find the most recent transition to working
    for (let i = job.history.length - 1; i >= 0; i--) {
      const ev = job.history[i];
      if (ev.event === 'transitioned_to_working' || ev.event === 'rejected_to_working') {
        return ev.ts;
      }
    }
    // Fallback: startedAt or updatedAt
    return job.startedAt || job.updatedAt || null;
  }

  // ── Team emoji map ──
  const teamEmojis = {
    'Alfred': '🛎️',
    'Claude': '⚡',
    'Claude Code': '⚡',
    'Sam': '👤',
  };

  function getAssigneeEmoji(assignee) {
    return teamEmojis[assignee] || '👤';
  }

  function getCreatedByEmoji(name) {
    return teamEmojis[name] || '👤';
  }

  // ── Format timestamp ──
  function formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (isNaN(d.getTime())) return '';
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${hour}:${min}`;
  }

  // ── Format full date+time for activity ──
  function formatFullDate(ts) {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hour}:${min}`;
  }

  // ── Format due date ──
  function formatDueDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(d);
    due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    const formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (diff < 0) return `${formatted} (overdue)`;
    if (diff === 0) return `${formatted} (today)`;
    if (diff === 1) return `${formatted} (tomorrow)`;
    return formatted;
  }

  function isDueDateOverdue(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d < today;
  }

  // ── HTML Escaping ──
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Priority sort order ──
  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };

  function sortByPriority(jobs) {
    return [...jobs].sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      // Within same priority, sort by sortPriority (lower = higher priority)
      if (pa === pb) {
        const sa = a.sortPriority ?? 999;
        const sb = b.sortPriority ?? 999;
        return sa - sb;
      }
      return pa - pb;
    });
  }

  // ── Load Data ──
  async function loadAssetData() {
    try {
      const [stateRes, jobsRes, doneRes] = await Promise.all([
        fetch('/api/mission-control-state', { cache: 'no-store' }),
        fetch('/api/mission-control-jobs', { cache: 'no-store' }),
        fetch('/api/mission-control-jobs/done', { cache: 'no-store' })
      ]);

      const stateData = await stateRes.json();
      const jobsData = await jobsRes.json();
      const doneData = await doneRes.json();

      // Merge active + done jobs
      const activeJobs = jobsData.jobs || [];
      const doneJobs = doneData.jobs || [];
      currentJobs = [...activeJobs, ...doneJobs];
      updatePipeline(currentJobs);

      if (stateData.ok) {
        updateServerStatus(true);
      }

      // Load pulse data for dashboard + server info
      try {
        const pulseController = new AbortController();
        const pulseTimeout = setTimeout(() => pulseController.abort(), 25000);
        const pulseRes = await fetch('/api/pulse-data', { cache: 'no-store', signal: pulseController.signal });
        clearTimeout(pulseTimeout);
        const pulseData = await pulseRes.json();
        if (pulseData.ok) {
          const infoEl = document.getElementById('serverInfo');
          if (infoEl) {
            const ver = pulseData.version || '';
            infoEl.innerHTML = `OpenClaw ${ver}`;
          }
          updateDashboard(pulseData.agents || [], currentJobs, pulseData);
        }
      } catch (e) { /* non-critical */ }

      // Load pulse metrics (now in Overview)
      if (document.getElementById('overview')?.classList.contains('active')) {
        loadPulseData();
      }

    } catch (err) {
      console.error('[MC] Failed to load data:', err);
      updateServerStatus(false);
    }
  }

  // ── Update System Status (merged card) ──
  function updateSystemStatus(pulseData, connected) {
    const connectedEl = document.getElementById('statusConnected');
    const sysUptimeEl = document.getElementById('sysUptime');

    if (connectedEl) {
      if (connected) {
        connectedEl.textContent = 'Online';
        connectedEl.closest('.system-info-status')?.classList.remove('offline');
      } else {
        connectedEl.textContent = 'Offline';
        connectedEl.closest('.system-info-status')?.classList.add('offline');
      }
    }
    if (sysUptimeEl && pulseData) {
      sysUptimeEl.textContent = pulseData.uptime || '—';
    }
  }

  // ── Update Dashboard Top Bar ──
  function updateDashboard(pulseAgents, jobs, pulseData) {
    updateAlfredStatusFromJobs(jobs);
    const agentsEl = document.getElementById('systemAgents');
    const statsEl = document.getElementById('systemDashboardTop');

    // Update system status strip
    updateSystemStatus(pulseData, true);

    // Alfred is the sole agent — Claude Code is a tool, not a team member
    const teamBase = [
      { name: 'Alfred', emoji: '\u{1F6CE}\u{FE0F}', role: 'Operator' },
    ];
    // Merge server-provided models and status
    const serverModelMap = {};
    const serverStatusMap = {};
    (pulseAgents || []).forEach(a => {
      serverModelMap[a.name] = a.model || '';
      serverStatusMap[a.name] = a.status || 'standby';
    });
    const team = teamBase.map(t => ({
      ...t,
      model: serverModelMap[t.name] || '',
      _serverStatus: serverStatusMap[t.name] || 'standby',
    }));

    // Determine if Alfred is active from pulse data
    const isActive = (pulseAgents || []).some(a => {
      const n = (a.name || '').toLowerCase();
      return n.includes('alfred') || n.includes('main');
    });

    // Alfred's current assignment — only from active (non-done) jobs
    let alfredJob = null;
    let alfredSubtask = null;
    (jobs || []).forEach(job => {
      if (job.phase === 'done' || job.phase === 'completed' || job.phase === 'archived') return; // skip done jobs
      if (job.phase === 'working' && job.assignee && job.assignee.includes('Alfred')) {
        alfredJob = job.title;
      }
      (job.subtasks || []).forEach(st => {
        if (st.status === 'in-progress' && ((st.startedBy || '').includes('Alfred') || (job.assignee || '').includes('Alfred'))) {
          if (!alfredSubtask) alfredSubtask = { number: job.number, title: st.title, jobId: job.id };
        }
      });
    });

    // Alfred's stats
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0,0,0,0); const todayMs = todayStart.getTime();
    const weekMs = now - 7*24*60*60*1000;
    const monthMs = now - 30*24*60*60*1000;
    const yearMs = now - 365*24*60*60*1000;
    let todayCompleted = 0, weekCompleted = 0, monthCompleted = 0, yearCompleted = 0, totalCompleted = 0, totalJobs = 0, inProgress = 0;
    (jobs || []).forEach(job => {
      totalJobs++;
      const assignee = job.assignee || '';
      if (job.phase === 'working' || (job.phase === 'todo' && (job.subtasks || []).some(s => s.status === 'in-progress'))) inProgress++;
      if (job.phase === 'done' || job.phase === 'completed' || job.phase === 'archived') {
        totalCompleted++;
        const completedAt = job.completedAt || 0;
        if (completedAt >= todayMs) todayCompleted++;
        if (completedAt >= weekMs) weekCompleted++;
        if (completedAt >= monthMs) monthCompleted++;
        if (completedAt >= yearMs) yearCompleted++;
      }
    });

    // Render Alfred's card
    if (agentsEl) {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable) && agentsEl.contains(activeEl)) {
        // skip this render
      } else {
      const alfredStatus = alfredWorkingStatus.status;
      const alfredWorking = alfredStatus === 'working';
      const alfredPlanning = alfredStatus === 'planning';
      const alfredTask = alfredWorkingStatus.task ? alfredWorkingStatus.task : null;
      // Idle quips — shown when Alfred has no active work
      const idleQuips = [
        'Dusting the dashboard.',
        'All trails ridden.',
        'Polishing the silver.',
        'Awaiting further instructions.',
        'The fire needs no tending.',
        'Standing watch.',
        'All quiet on the western front.',
        'Saddle\'s ready.',
        'Perimeter secured.',
        'Tea\'s brewed. Biscuits optional.',
        'No varmints in sight.',
        'Horse is fed. Gun is clean.',
        'Campfire\'s warm.',
        'Ranch is running smooth.',
        'Another day, another trail.',
        'Quiet as a church mouse.',
        'Sunset\'s looking fine.',
      ];
      const idleQuip = idleQuips[Math.floor(Math.random() * idleQuips.length)];
      const displayLabel = alfredTask || (alfredSubtask ? `${alfredSubtask.number} ${alfredSubtask.title}` : (alfredJob ? escapeHtml(alfredJob.length > 50 ? alfredJob.substring(0, 47) + '...' : alfredJob) : idleQuip));
      const isIdle = !alfredTask && !alfredSubtask && !alfredJob;
      const isWorking = alfredWorking || inProgress > 0;
      let statusBadge;
      if (isWorking) {
        statusBadge = '<span class="agent-status-badge working">Working</span>';
      } else if (alfredPlanning) {
        statusBadge = '<span class="agent-status-badge planning">Planning</span>';
      } else {
        statusBadge = '<span class="agent-status-badge available">Available</span>';
      }
      const serverAlfredStatus = (serverStatusMap['Alfred'] || '').toLowerCase();
      const idleStatusBadge = (isIdle && serverAlfredStatus !== 'working') ? '<span class="agent-status-badge idle">Idle</span>' : statusBadge;
      const model = serverModelMap['Alfred'] || '';
      const effRate = totalJobs > 0 ? Math.round((totalCompleted / totalJobs) * 100) : 0;
      agentsEl.innerHTML = `<div class="agent-card ${isActive ? 'active' : 'standby'} agent-card-alfred">
          <div class="agent-card-top">
            <div class="agent-card-header">
              <div class="agent-card-name">Alfred${idleStatusBadge}</div>
              <div class="agent-card-role">Operator</div>
            </div>
            <span class="agent-card-model">${model}</span>
          </div>
          <div class="agent-card-now${isIdle ? ' idle-quip' : ''}">${displayLabel}</div>
          <div class="agent-card-stats">
            <span class="agent-stat"><span class="agent-stat-val">${todayCompleted}</span> today</span>
            <span class="agent-stat"><span class="agent-stat-val">${totalCompleted}</span> total done</span>
            <span class="agent-stat"><span class="agent-stat-val">${inProgress}</span> active</span>
            <span class="agent-stat"><span class="agent-stat-val">${effRate}%</span> rate</span>
          </div>
          <div class="agent-card-periods">
            <span class="agent-period">W ${weekCompleted}</span>
            <span class="agent-period">M ${monthCompleted}</span>
            <span class="agent-period">Y ${yearCompleted}</span>
          </div>

        </div>`;
      } // end else (not typing)
    }

    // --- Dispatched agents from acpx sessions ---
    const dispatchedAgents = (pulseAgents || []).filter(a => a.name !== 'Alfred');
    if (dispatchedAgents.length > 0 && agentsEl) {
      let dispatchHTML = '<div class="dispatched-section"><div class="dispatched-header">Dispatched</div>';
      dispatchedAgents.forEach(a => {
        const isActive = a.status === 'working';
        const dot = isActive ? '<span class="dispatched-dot active"></span>' : '<span class="dispatched-dot idle"></span>';
        // Elapsed timer from startedAt
        let elapsed = '';
        if (a.startedAt) {
          const startMs = new Date(a.startedAt).getTime();
          const diffMs = Date.now() - startMs;
          if (diffMs > 0) {
            const mins = Math.floor(diffMs / 60000);
            const hrs = Math.floor(mins / 60);
            const m = mins % 60;
            elapsed = hrs > 0 ? `${hrs}h ${m}m` : `${mins}m`;
          }
        }
        const startedTime = a.startedAt ? new Date(a.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
        // Simplify model name
        let modelShort = '';
        if (a.model) {
          modelShort = a.model.replace('ollama/', '');
        }
        // Session name or fallback to ID fragment
        // Try to extract REQ reference from session name
        let reqRef = '';
        const reqMatch = (a.sessionName || '').match(/req[-_]?(\d+)/i);
        if (reqMatch) reqRef = `REQ-${reqMatch[1].padStart(3, '0')}`;
        const sessLabel = a.sessionName || (a.session || '').substring(0, 8);
        dispatchHTML += `<div class="dispatched-line" title="${a.agentCommand}" data-agent-type="${a.agentType || ''}">
          ${dot}
          <span class="dispatched-name">${a.name}</span>
          ${modelShort ? `<span class="dispatched-model">${modelShort}</span>` : ''}
          ${reqRef ? `<span class="dispatched-req">${reqRef}</span>` : ''}
          <span class="dispatched-session">${sessLabel}</span>
          ${startedTime ? `<span class="dispatched-time">${startedTime}</span>` : ''}
          ${elapsed ? `<span class="dispatched-elapsed">${elapsed}</span>` : ''}
        </div>`;
      });
      dispatchHTML += '</div>';
      agentsEl.innerHTML += dispatchHTML;
    }

    // --- Dispatched session history ---
    const dispatchedHistory = (data.dispatchedHistory || []);
    if (dispatchedHistory.length > 0 && agentsEl) {
      let histHTML = '<div class="dispatched-section dispatched-history-section"><div class="dispatched-header">Recent</div>';
      dispatchedHistory.forEach(a => {
        const startedTime = a.startedAt ? new Date(a.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
        let modelShort = '';
        if (a.model) modelShort = a.model.replace('ollama/', '');
        const reqMatch = (a.sessionName || '').match(/req[-_]?(\d+)/i);
        const reqRef = reqMatch ? `REQ-${reqMatch[1].padStart(3, '0')}` : '';
        const sessLabel = a.sessionName || (a.session || '').substring(0, 8);
        histHTML += `<div class="dispatched-line dispatched-history-line">
          <span class="dispatched-dot done"></span>
          <span class="dispatched-name">${a.name}</span>
          ${modelShort ? `<span class="dispatched-model">${modelShort}</span>` : ''}
          ${reqRef ? `<span class="dispatched-req">${reqRef}</span>` : ''}
          <span class="dispatched-session">${sessLabel}</span>
          ${startedTime ? `<span class="dispatched-time">${startedTime}</span>` : ''}
        </div>`;
      });
      histHTML += '</div>';
      agentsEl.innerHTML += histHTML;
    }


    // Render stats
    if (statsEl) {
      const today = new Date().toDateString();
      // Stats removed — Overview focuses on agents + activity
    }

    // System Health removed — info lives in Pulse

    // Render Awaiting Approval section in Overview
    const awaitingEl = document.getElementById('systemAwaitingApproval');
    if (awaitingEl) {
      const awaitingJobs = (jobs || []).filter(j => j.phase === 'awaiting-approval');
      if (awaitingJobs.length > 0) {
        awaitingEl.style.display = 'block';
        awaitingEl.innerHTML = `
          <h3 class="section-title" style="color:#f59e0b">Awaiting Approval</h3>
          <div class="overview-awaiting-list">
            ${awaitingJobs.map(job => `
              <div class="overview-awaiting-item">
                <span class="overview-awaiting-title">${escapeHtml(job.title || 'Untitled')}</span>
                <div class="overview-awaiting-actions">
                  <button class="btn-approve-request" data-job-id="${job.id}">✅ Accept</button>
                  <button class="btn-deny-request" data-job-id="${job.id}">❌ Deny</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
        awaitingEl.querySelectorAll('.btn-approve-request').forEach(btn => {
          btn.addEventListener('click', (e) => { e.stopPropagation(); approveRequest(btn.dataset.jobId); });
        });
        awaitingEl.querySelectorAll('.btn-deny-request').forEach(btn => {
          btn.addEventListener('click', (e) => { e.stopPropagation(); denyRequest(btn.dataset.jobId, ''); });
        });
      } else {
        awaitingEl.style.display = 'none';
      }
    }

    // Activity section removed
  }

  // ── Activity click handler removed ──

  // ── Vault Graph (interactive) ──
  let graphSim = null;

  async function loadVaultGraph() {
    const canvas = document.getElementById('vaultGraphCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    try {
      const resp = await fetch('/api/vault-graph');
      if (!resp.ok) return;
      const data = await resp.json();
      const nodes = data.nodes || [];
      const edges = data.edges || [];

      const w = canvas.parentElement.offsetWidth - 32 || 800;
      const h = 450; // Bigger section
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      const groupColors = {
        hub: '#3b82f6',
        category: '#8b5cf6',
        req: '#10b981',
        reference: '#f59e0b',
        daily: '#6b7280',
        lesson: '#ef4444'
      };
      const groupSize = { hub: 10, category: 7, reference: 5, daily: 4, lesson: 5, req: 3.5 };

      // Init positions with better spread
      const simNodes = nodes.map((n, i) => {
        const ring = n.group === 'hub' ? 0 : (n.group === 'category' ? 1 : (n.group === 'reference' ? 2 : 3));
        const ringR = [0, 120, 170, 210][ring];
        const angle = (i / nodes.length) * Math.PI * 2 + ring * 0.5;
        return {
          id: n.id,
          group: n.group,
          x: w / 2 + Math.cos(angle) * ringR,
          y: h / 2 + Math.sin(angle) * ringR,
          vx: 0, vy: 0,
          radius: groupSize[n.group] || 3.5,
          color: groupColors[n.group] || '#6b7280'
        };
      });
      const nodeMap = {};
      simNodes.forEach(n => nodeMap[n.id] = n);
      const simEdges = edges.filter(e => nodeMap[e.source] && nodeMap[e.target])
        .map(e => ({ source: nodeMap[e.source], target: nodeMap[e.target] }));

      // Interaction state
      let hoveredNode = null;
      let dragNode = null;
      let dragOffsetX = 0, dragOffsetY = 0;
      let settled = false;

      let alpha = 1;
      function tick() {
        if (alpha < 0.002) { settled = true; }
        if (!settled) alpha *= 0.98;

        if (!settled) {

        // Repulsion between all nodes
        for (let i = 0; i < simNodes.length; i++) {
          for (let j = i + 1; j < simNodes.length; j++) {
            const dx = simNodes[j].x - simNodes[i].x;
            const dy = simNodes[j].y - simNodes[i].y;
            const d2 = dx * dx + dy * dy || 1;
            const f = 600 * alpha / d2;
            const d = Math.sqrt(d2);
            simNodes[i].vx -= (dx / d) * f;
            simNodes[i].vy -= (dy / d) * f;
            simNodes[j].vx += (dx / d) * f;
            simNodes[j].vy += (dy / d) * f;
          }
        }

        // Edge attraction
        simEdges.forEach(e => {
          const dx = e.target.x - e.source.x;
          const dy = e.target.y - e.source.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = d * 0.003 * alpha;
          e.source.vx += (dx / d) * f;
          e.source.vy += (dy / d) * f;
          e.target.vx -= (dx / d) * f;
          e.target.vy -= (dy / d) * f;
        });

          // Center pull
          simNodes.forEach(n => {
            if (n === dragNode) return; // Don't move dragged node
          n.vx += (w / 2 - n.x) * 0.003 * alpha;
          n.vy += (h / 2 - n.y) * 0.003 * alpha;
          n.vx *= 0.5; n.vy *= 0.5;
          n.x += n.vx; n.y += n.vy;
          n.x = Math.max(n.radius + 2, Math.min(w - n.radius - 2, n.x));
          n.y = Math.max(n.radius + 2, Math.min(h - n.radius - 2, n.y));
          });
        }

        draw();
        requestAnimationFrame(tick);
      }

      function draw() {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Background
        ctx.fillStyle = '#0f1115';
        ctx.fillRect(0, 0, w, h);

        // Edges
        simEdges.forEach(e => {
          const isHighlighted = hoveredNode && (e.source === hoveredNode || e.target === hoveredNode);
          ctx.strokeStyle = isHighlighted ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.08)';
          ctx.lineWidth = isHighlighted ? 1.2 : 0.5;
          ctx.beginPath();
          ctx.moveTo(e.source.x, e.source.y);
          ctx.lineTo(e.target.x, e.target.y);
          ctx.stroke();
        });

        // Nodes
        simNodes.forEach(n => {
          const isHovered = n === hoveredNode;
          const isConnected = hoveredNode && simEdges.some(e => (e.source === hoveredNode && e.target === n) || (e.target === hoveredNode && e.source === n));
          ctx.globalAlpha = (hoveredNode && !isHovered && !isConnected) ? 0.3 : (n.group === 'hub' ? 1 : 0.75);
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, isHovered ? n.radius * 1.6 : n.radius, 0, Math.PI * 2);
          ctx.fill();

          // Glow for hub or hovered
          if (n.group === 'hub' || isHovered) {
            ctx.globalAlpha = isHovered ? 0.3 : 0.2;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius * 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;

          // Labels: hub + categories always, hovered node, connected nodes
          if (n.group === 'hub' || n.group === 'category' || isHovered || isConnected) {
            ctx.fillStyle = isHovered ? '#ffffff' : '#c9cdd4';
            ctx.font = isHovered ? 'bold 12px -apple-system, system-ui' : (n.group === 'hub' ? 'bold 11px -apple-system, system-ui' : '9px -apple-system, system-ui');
            ctx.textAlign = 'center';
            ctx.fillText(n.id, n.x, n.y - (isHovered ? n.radius * 1.6 : n.radius) - 5);
          }
        });
        ctx.restore();

        // Tooltip for hovered node
        if (hoveredNode && hoveredNode.group !== 'hub' && hoveredNode.group !== 'category') {
          const label = hoveredNode.id;
          const tw = ctx.measureText(label).width + 16;
          const tx = Math.min(w - tw - 8, Math.max(8, hoveredNode.x - tw / 2));
          const ty = hoveredNode.y - hoveredNode.radius * 1.6 - 28;
          ctx.fillStyle = 'rgba(15,17,21,0.9)';
          ctx.strokeStyle = hoveredNode.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(tx, ty, tw, 22, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#e5e7eb';
          ctx.font = '11px -apple-system, system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(label, hoveredNode.x, ty + 15);
        }
      }

      // Mouse interaction
      function getNodeAtPos(mx, my) {
        for (let i = simNodes.length - 1; i >= 0; i--) {
          const n = simNodes[i];
          const dx = mx - n.x, dy = my - n.y;
          if (dx * dx + dy * dy < (n.radius + 4) * (n.radius + 4)) return n;
        }
        return null;
      }

      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        if (dragNode) {
          dragNode.x = mx - dragOffsetX;
          dragNode.y = my - dragOffsetY;
          dragNode.x = Math.max(dragNode.radius + 2, Math.min(w - dragNode.radius - 2, dragNode.x));
          dragNode.y = Math.max(dragNode.radius + 2, Math.min(h - dragNode.radius - 2, dragNode.y));
          return;
        }
        const node = getNodeAtPos(mx, my);
        hoveredNode = node;
        canvas.style.cursor = node ? 'grab' : 'default';
      });

      let dragStartX = 0, dragStartY = 0;
      let selectedNode = null;

      canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        dragStartX = mx; dragStartY = my;
        const node = getNodeAtPos(mx, my);
        if (node) {
          dragNode = node;
          dragOffsetX = mx - node.x;
          dragOffsetY = my - node.y;
          canvas.style.cursor = 'grabbing';
          if (settled) { alpha = 0.05; settled = false; }
        }
      });

      canvas.addEventListener('mouseup', (e) => {
        if (dragNode) {
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const dist = Math.sqrt((mx - dragStartX) ** 2 + (my - dragStartY) ** 2);
          // If barely moved, treat as click → select node
          if (dist < 5) {
            selectedNode = dragNode;
            showNodeDetail(dragNode);
          }
          dragNode = null; canvas.style.cursor = hoveredNode ? 'grab' : 'default';
        }
      });

      canvas.addEventListener('mouseleave', () => {
        hoveredNode = null; dragNode = null; canvas.style.cursor = 'default';
      });

      // Touch support
      canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = t.clientX - rect.left, my = t.clientY - rect.top;
        const node = getNodeAtPos(mx, my);
        if (node) {
          dragNode = node; dragOffsetX = mx - node.x; dragOffsetY = my - node.y; hoveredNode = node;
          if (settled) { alpha = 0.05; settled = false; }
        }
      }, { passive: false });

      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!dragNode) return;
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = t.clientX - rect.left, my = t.clientY - rect.top;
        dragNode.x = Math.max(dragNode.radius + 2, Math.min(w - dragNode.radius - 2, mx - dragOffsetX));
        dragNode.y = Math.max(dragNode.radius + 2, Math.min(h - dragNode.radius - 2, my - dragOffsetY));
      }, { passive: false });

      canvas.addEventListener('touchend', () => { dragNode = null; hoveredNode = null; });

      // Node detail panel
      function showNodeDetail(node) {
        const panel = document.getElementById('vaultDetailPanel');
        const title = document.getElementById('vaultDetailTitle');
        const body = document.getElementById('vaultDetailBody');
        if (!panel || !title || !body) return;

        title.textContent = node.id;
        body.innerHTML = '<div style="color:#6b7280">Loading...</div>';
        panel.classList.add('open');

        // Find connected nodes
        const connected = [];
        simEdges.forEach(e => {
          if (e.source === node) connected.push(e.target.id);
          if (e.target === node) connected.push(e.source.id);
        });

        // Fetch note content from API
        fetch(`/api/vault-note?name=${encodeURIComponent(node.id)}`)
          .then(r => r.json())
          .then(data => {
            let html = '';
            if (data.ok) {
              const meta = data.meta || {};
              if (meta.assignee) html += `<div class="detail-label">Assignee</div><div class="detail-value">${meta.assignee}</div>`;
              if (meta.priority) html += `<div class="detail-label">Priority</div><div class="detail-value">${meta.priority}</div>`;
              if (meta.created) html += `<div class="detail-label">Created</div><div class="detail-value">${meta.created}</div>`;
              if (meta.completed) html += `<div class="detail-label">Completed</div><div class="detail-value">${meta.completed}</div>`;
              // Description (first 300 chars of body, skip title line)
              const desc = data.body.replace(/^#.*\n?/, '').trim().substring(0, 300);
              if (desc) html += `<div class="detail-label">Details</div><div class="detail-desc">${desc}</div>`;
            } else {
              html += `<div class="detail-desc">No content available</div>`;
            }
            // Connected nodes
            if (connected.length) {
              html += `<div class="detail-label">Connected (${connected.length})</div>`;
              html += `<div class="detail-links">`;
              connected.slice(0, 20).forEach(c => {
                html += `<span class="detail-link" data-node="${c}">${c}</span>`;
              });
              if (connected.length > 20) html += `<span style="color:#6b7280;font-size:11px">+${connected.length - 20} more</span>`;
              html += `</div>`;
            }
            body.innerHTML = html;
            // Click connected node links to navigate
            body.querySelectorAll('.detail-link').forEach(el => {
              el.addEventListener('click', () => {
                const target = simNodes.find(n => n.id === el.dataset.node);
                if (target) {
                  selectedNode = target;
                  hoveredNode = target;
                  showNodeDetail(target);
                }
              });
            });
          })
          .catch(() => {
            body.innerHTML = '<div class="detail-desc">Failed to load</div>';
          });
      }

      // Close detail panel
      document.getElementById('vaultDetailClose')?.addEventListener('click', () => {
        const panel = document.getElementById('vaultDetailPanel');
        panel.classList.remove('open');
        selectedNode = null;
      });

      draw(); // Initial draw
      tick();

    } catch (e) {
      console.error('Vault graph error:', e);
    }
  }

  // Refresh button
  document.getElementById('vaultGraphRefresh')?.addEventListener('click', () => loadVaultGraph());

  // ── Job Logs Panel (Done-section grid style) ──
  async function loadJobLogs() {
    const logsEl = document.getElementById('jobLogsList');
    if (!logsEl) return;
    const expandedKeys = new Set();
    logsEl.querySelectorAll('.log-entry.expanded').forEach(el => {
      if (el.dataset.logId) expandedKeys.add(el.dataset.logId);
    });

    try {
      const resp = await fetch('/api/mission-control-jobs/logs');
      if (!resp.ok) { logsEl.innerHTML = '<div class="log-empty">No logs yet</div>'; return; }
      const data = await resp.json();
      const logs = data.logs || [];
      if (logs.length === 0) {
        logsEl.innerHTML = '<div class="log-empty">No logs yet</div>';
        return;
      }

      let html = '';
      logs.forEach(l => {
        const reqNum = l.number || '';
        const isExpanded = expandedKeys.has(l.id);
        const summary = l.summary || l.title || '';
        const summaryShort = summary.length > 80 ? summary.substring(0, 77) + '...' : summary;
        const phaseLabel = l.phase === 'done' ? '✓' : l.phase === 'working' ? '►' : '●';
        const dateStr = l.createdAt ? formatFullDate(l.createdAt) : '';
        const timeStr = l.createdAt ? formatTimestamp(l.createdAt) : '';
        const logLines = (l.log || []).map(line => `<div class="log-thread-msg">${escapeHtml(line)}</div>`).join('');
        // Add subtask details if available
        const subtaskLines = (l.subtasks || []).map((st, idx) => {
          const stNum = `${reqNum}-${idx + 1}`;
          const stIcon = st.status === 'done' ? '✓' : (st.status === 'cancelled' ? '✗' : (st.status === 'in-progress' ? '●' : '○'));
          const stTitle = escapeHtml(st.title || st.id || '');
          return `<div class="log-thread-subtask"><span class="log-subtask-icon ${st.status}">${stIcon}</span> <span class="log-subtask-number">${stNum}</span> <span class="log-subtask-title">${stTitle}</span></div>`;
        }).join('');
        const logHtml = logLines + subtaskLines;

        html += `<div class="log-entry${isExpanded ? ' expanded' : ''}" data-log-id="${l.id}" data-job-id="${l.id}">`;
        html += `<div class="done-item log-entry-row" data-job-id="${l.id}">`;
        html += `<span class="done-item-date">${dateStr}</span>`;
        html += `<span class="done-item-time">${timeStr}</span>`;
        html += `<span class="done-item-ref log-entry-req">${reqNum ? `<span class="task-number">${reqNum}</span>` : ''}</span>`;
        html += `<span class="done-item-title">${phaseLabel} ${escapeHtml(summaryShort)}</span>`;
        html += '</div>';
        if (logHtml) {
          html += `<div class="log-entry-thread" style="display:${isExpanded ? 'flex' : 'none'}">${logHtml}</div>`;
        }
        html += '</div>';
      });
      logsEl.innerHTML = html;

      // Click row to open job modal (instead of expanding thread)
      logsEl.querySelectorAll('.log-entry-row').forEach(row => {
        row.addEventListener('click', (e) => {
          const entry = row.parentElement;
          const jobId = entry?.dataset.jobId;
          if (!jobId) return;
          const job = currentJobs.find(j => j.id === jobId);
          if (job) openCardModal(job);
        });
      });
    } catch(e) {
      logsEl.innerHTML = '<div class="log-empty">Failed to load logs</div>';
    }
  }

  // ── Up Next Section ──
  function renderUpNext(jobs) {
    const upNextSection = document.getElementById('upNextSection');
    const upNextList = document.getElementById('upNextList');
    if (!upNextSection || !upNextList) return;

    // Filter to non-archived, non-done jobs
    const activeJobs = jobs.filter(j => j.phase !== 'archived' && j.phase !== 'done' && j.phase !== 'completed');

    // Collect all pending subtasks with their parent job info
    const pendingSubtasks = [];
    activeJobs.forEach(job => {
      const subtasks = job.subtasks || [];
      subtasks.forEach((st, idx) => {
        if (st.status === 'pending') {
          pendingSubtasks.push({
            subtaskId: st.id,
            subtaskTitle: st.title || st.id,
            subtaskNumber: `${job.number || 'REQ-?'}-${idx + 1}`,
            jobId: job.id,
            jobTitle: job.title || 'Untitled',
            jobNumber: job.number || '',
            priority: job.priority || 'normal',
            assignee: job.assignee || 'Unassigned',
            sortPriority: priorityOrder[job.priority] ?? 2,
            jobIdx: idx,
          });
        }
      });
    });

    // Sort by priority (critical → high → normal → low), then by job order
    pendingSubtasks.sort((a, b) => {
      if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
      return 0;
    });

    // Limit to top 8 items
    const topItems = pendingSubtasks.slice(0, 8);

    if (topItems.length === 0) {
      upNextSection.style.display = 'none';
      return;
    }

    upNextSection.style.display = 'block';
    upNextList.innerHTML = topItems.map(item => {
            const prioColor = { low: '#3b82f6', normal: 'var(--muted)', high: '#ef4444', critical: '#f59e0b' }[item.priority] || 'var(--muted)';
      return `
        <div class="up-next-item">
          <span class="up-next-number" style="color:${prioColor}">${escapeHtml(item.subtaskNumber)}</span>
          <span class="up-next-title">${escapeHtml(item.subtaskTitle)}</span>
          <span class="up-next-job">${escapeHtml(item.jobTitle)}</span>
        </div>
      `;
    }).join('');
  }

  // Load comms log when Logs view is active
  if (document.getElementById('logs')?.classList.contains('active')) {
    loadJobLogs();
  }

  // ── Pipeline Rendering ──
  function updatePipeline(jobs) {
    const approvalsStrip = document.getElementById('approvalsStrip');
    const todoGrid = document.getElementById('todoGrid');
    const doneRow = document.getElementById('doneRow'); // may be null (removed from Overview)

    // Don't re-render if user is typing in an input field inside any container
    const activeEl = document.activeElement;
    const containers = [approvalsStrip, todoGrid].filter(Boolean);
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      const typingInContainer = containers.some(c => c.contains(activeEl));
      if (typingInContainer) {
        // Data is stale but we'll refresh on next cycle; don't disrupt the user
        return;
      }
    }

    // Filter out archived jobs from display
    const visibleJobs = jobs;

    // Normalize phases
    const normalizedJobs = visibleJobs.map(j => {
      let phase = j.phase;
      if (phase === 'done' || phase === 'completed' || phase === 'archived') phase = 'done';
      else if (phase === 'awaiting-approval') phase = 'awaitingApproval';
      else phase = 'todo';
      return { ...j, _column: phase };
    });

    // Clear containers and reset timer state
    if (approvalsStrip) approvalsStrip.innerHTML = '';
    if (todoGrid) todoGrid.innerHTML = '';
    workingJobTimestamps = {};

    // Group jobs by column
    const grouped = { todo: [], awaitingApproval: [], done: [] };
    normalizedJobs.forEach(job => {
      const col = grouped[job._column] || grouped.todo;
      col.push(job);
    });

    // Sort To Do by priority
    grouped.todo = sortByPriority(grouped.todo);

    // ── Render Approvals Strip ──
    if (approvalsStrip) {
      if (grouped.awaitingApproval.length > 0) {
        approvalsStrip.style.display = 'flex';
        grouped.awaitingApproval.forEach(job => renderApprovalItem(job, approvalsStrip));
      } else {
        approvalsStrip.style.display = 'none';
      }
    }

    // ── Render Up Next ──
    renderUpNext(jobs);

    // ── Render To Do Grid ──
    if (todoGrid) {
      const filteredTodo = grouped.todo;
      if (filteredTodo.length === 0) {
        todoGrid.innerHTML = '';
      } else {
        filteredTodo.forEach(job => renderJobCard(job, todoGrid, 'todo'));
      }
    }
    // ── Done row removed (merged into Logs page) ──

    // ── Full Production Empty State — hide Current Jobs when no active jobs
    if (todoGrid) {
      const filteredTodo = grouped.todo;
      const filteredDone2 = grouped.done;
      const filteredAwaiting = grouped.awaitingApproval;
      if (filteredTodo.length === 0 && filteredAwaiting.length === 0) {
        // No active jobs — hide Current Jobs section, show only pulse metrics
        const sections = document.querySelectorAll('.production-section');
        sections.forEach(s => s.style.display = 'none');
        const upNext = document.getElementById('upNextSection');
        if (upNext) upNext.style.display = 'none';
      } else {
        const sections = document.querySelectorAll('.production-section');
        sections.forEach(s => s.style.display = '');
      }
    }

    // ── Bind approval button events ──
    document.querySelectorAll('.btn-approve-request').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        approveRequest(btn.dataset.jobId);
      });
    });

    document.querySelectorAll('.btn-deny-request').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const container = document.getElementById(`deny-reason-${btn.dataset.jobId}`);
        if (container) container.style.display = 'flex';
        const input = document.getElementById(`deny-input-${btn.dataset.jobId}`);
        if (input) input.focus();
      });
    });

    document.querySelectorAll('.btn-confirm-deny').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const input = document.getElementById(`deny-input-${btn.dataset.jobId}`);
        const reason = input ? input.value.trim() : '';
        denyRequest(btn.dataset.jobId, reason);
      });
    });

    // ── Subtask items on card front: click opens modal only (no toggle) ──
    // Subtask toggling is handled inside the modal via modal-subtask-item clicks

    // ── Bind ... menu buttons on subtasks ──
    document.querySelectorAll('.st-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const subtaskId = btn.dataset.subtaskId;
        const jobId = btn.dataset.jobId;
        const currentStatus = btn.dataset.status;
        // Toggle menu
        const existing = btn.parentElement.querySelector('.st-menu-dropdown');
        if (existing) { existing.remove(); return; }
        // Remove any other open menus
        document.querySelectorAll('.st-menu-dropdown').forEach(m => m.remove());
        const menu = document.createElement('div');
        menu.className = 'st-menu-dropdown';
        if (currentStatus === 'cancelled') {
          menu.innerHTML = `<div class="st-menu-item" data-action="resume">▶ Resume</div>`;
        } else {
          menu.innerHTML = `<div class="st-menu-item" data-action="cancel">✗ Cancel task</div>`;
        }
        btn.parentElement.appendChild(menu);
        menu.querySelectorAll('.st-menu-item').forEach(mi => {
          mi.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const action = mi.dataset.action;
            if (action === 'cancel') {
              toggleSubtask(jobId, subtaskId, 'cancelled');
            } else if (action === 'resume') {
              toggleSubtask(jobId, subtaskId, 'pending');
            }
            menu.remove();
          });
        });
      });
    });

    // ── Bind close (archive) buttons on Done cards ──
    document.querySelectorAll('.done-item-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        archiveJob(btn.dataset.jobId);
      });
    });

    // ── Start / restart elapsed timers ──
    startElapsedTimers();
  }

  // ── Render Approval Strip Item ──
  function renderApprovalItem(job, container) {
    const assignee = job.assignee || 'Unassigned';
    const emoji = getAssigneeEmoji(assignee);
    const item = document.createElement('div');
    item.className = 'approval-strip-item';
    item.innerHTML = `
      <span class="approval-strip-title">${escapeHtml(job.title || 'Untitled')}</span>
      <span class="approval-strip-assignee">${emoji} ${escapeHtml(assignee)}</span>
      <div class="approval-strip-actions">
        <button class="btn-approve-request" data-job-id="${job.id}">✅ Accept</button>
        <button class="btn-deny-request" data-job-id="${job.id}">❌ Deny</button>
      </div>
      <div id="deny-reason-${job.id}" class="deny-reason-container" style="display:none">
        <input type="text" id="deny-input-${job.id}" class="deny-reason-input" placeholder="Reason..." />
        <button class="btn-confirm-deny" data-job-id="${job.id}">Confirm</button>
      </div>
    `;
    container.appendChild(item);
  }

  // ── Render Done Row Item ──
  function renderDoneItem(job, container) {
    const item = document.createElement('div');
    item.className = 'done-item';
    item.dataset.jobId = job.id;

    const completedTs = job.completedAt;
    const timeStr = completedTs ? formatTimestamp(completedTs) : '';
    const dateStr = completedTs ? formatFullDate(completedTs) : '';

    item.innerHTML = `
      <span class="done-item-date">${dateStr}</span>
      <span class="done-item-time">${timeStr}</span>
      <span class="done-item-ref">${job.number ? `<span class="task-number">${job.number}</span>` : ''}</span>
      <span class="done-item-title">${escapeHtml(job.title || 'Untitled')}</span>
    `;

    // Click to open modal
    item.addEventListener('click', (e) => {
      openCardModal(job);
    });

    container.appendChild(item);
  }

  function renderJobCard(job, container, colKey) {
    const priority = job.priority || 'normal';
    const assignee = job.assignee || 'Unassigned';
    const createdBy = job.createdBy || 'Sam';
    const assignedBy = job.assignedBy || '';
    const isDone = job._column === 'done';
    const isAwaiting = job._column === 'awaitingApproval';
    const emoji = getAssigneeEmoji(assignee);
    const creatorEmoji = getCreatedByEmoji(createdBy);
    const subtasks = job.subtasks || [];
    const hasInProgress = subtasks.some(st => st.status === 'in-progress');

    const card = document.createElement('div');
    const jobStatus = job.jobStatus || 'active';
    card.className = `task-card ${isDone ? 'completed' : ''} phase-${job.phase}${hasInProgress ? ' job-active' : ''} job-${jobStatus}`;
    card.dataset.assignee = assignee || '';
    if (isAwaiting) card.classList.add('phase-awaiting-approval');
    card.dataset.jobId = job.id;
    card.dataset.assignee = job.assignee || 'Unassigned';

    // Build card inner HTML
    let cardHtml = '';

    // NEXT UP badge for highest sortPriority
    const isNextUp = job.sortPriority === 0;
    if (isNextUp && !isDone && !isAwaiting) {
      cardHtml += `<span class="next-up-badge">NEXT UP</span>`;
    }

    // Priority class on card for gradient border
    card.classList.add(`prio-${priority}`);
    // Hidden cycle target (invisible, but clickable area for cycling)
    cardHtml += `<span class="task-priority-cycle-target" data-job-id="${job.id}" title="Click to change priority: ${priority}"></span>`;

    // Close button for Done cards
    // No dismiss button - jobs are permanent

    // Number badge + job status badge + rewriting pen icon
    if (job.number) {
      const statusLabel = { active: '', paused: '⏸ Paused', stopped: '⏹ Stopped' }[jobStatus] || '';
      const obsLink = job.number ? `<a href="obsidian://open?vault=Mission%20Control&file=REQ%2F${encodeURIComponent(job.number)}" class="obs-link" title="Open in Obsidian" target="_blank" onclick="event.stopPropagation()">↗</a>` : '';
      cardHtml += `<div class="card-badge-row"><span class="task-number">${job.number}</span>${obsLink}${statusLabel ? `<span class="job-status-badge job-status-${jobStatus}">${statusLabel}</span>` : ''}</div>`;
    }

    // Title
    cardHtml += `<h4 class="task-title">${escapeHtml(job.title || 'Untitled Task')}</h4>`;

    // Show description when no subtasks
    const jobDesc = job.description || job.details || '';
    if (jobDesc && subtasks.length === 0) {
      cardHtml += `<div class="task-card-desc">${escapeHtml(jobDesc.length > 120 ? jobDesc.substring(0, 117) + '...' : jobDesc)}</div>`;
    }

    // Created by / Assigned to — plain text, no emoji icons
    cardHtml += `<div class="task-meta-line">Created by ${escapeHtml(createdBy)}`;
    if (assignee && assignee !== 'Unassigned') cardHtml += ` · Assigned to ${escapeHtml(assignee)}`;
    cardHtml += `</div>`;

    // ── Worker badge — show assignee name on any card with an assignee
    if (assignee && assignee !== 'Unassigned') {
      let displayWorker = assignee;
      if (displayWorker === 'Claude Code') displayWorker = 'Claude';
      const displayEmoji = displayWorker === 'Claude' ? '⚡' : displayWorker === 'Alfred' ? '🛎️' : '👤';
      cardHtml += `<span class="card-worker-badge">${escapeHtml(displayWorker)}</span>`;
    }

    // Due date — skip if today or if job is actively being worked on
    if (job.dueDate && job.phase !== 'working') {
      const overdue = isDueDateOverdue(job.dueDate);
      const isScheduled = !isDone && job.phase === 'todo' && new Date(job.dueDate) > new Date();
      const dueD = new Date(job.dueDate); dueD.setHours(0,0,0,0);
      const nowD = new Date(); nowD.setHours(0,0,0,0);
      const isDueToday = dueD.getTime() === nowD.getTime();
      if (isScheduled) {
        cardHtml += `<div class="task-due-date scheduled">Scheduled: ${formatDueDate(job.dueDate)}</div>`;
      } else if (!isDueToday) {
        cardHtml += `<div class="task-due-date ${overdue ? 'overdue' : ''}">📅 ${formatDueDate(job.dueDate)}</div>`;
      }
    }

    // ── Awaiting Approval: show Accept/Deny buttons ──
    if (isAwaiting) {
      cardHtml += `<div class="approval-actions">`;
      cardHtml += `<button class="btn-approve-request" data-job-id="${job.id}">✅ Accept</button>`;
      cardHtml += `<button class="btn-deny-request" data-job-id="${job.id}">❌ Deny</button>`;
      cardHtml += `</div>`;
      cardHtml += `<div id="deny-reason-${job.id}" class="deny-reason-container" style="display:none">`;
      cardHtml += `<input type="text" id="deny-input-${job.id}" class="deny-reason-input" placeholder="Reason for denial..." />`;
      cardHtml += `<button class="btn-confirm-deny" data-job-id="${job.id}">Confirm</button>`;
      cardHtml += `</div>`;
    }

    // ── Subtask progress (shown for non-done jobs) ──
    if (!isDone) {
      const startTs = getWorkingStartTs(job);
      if (startTs) {
        workingJobTimestamps[job.id] = startTs;
        const diff = Date.now() - startTs;
        cardHtml += `
          <div class="elapsed-timer">
            <span id="elapsed-${job.id}" class="elapsed-value">${formatElapsed(diff)}</span>
          </div>
        `;
        cardHtml += `<div class="task-started">Started: ${formatTimestamp(startTs)}</div>`;
      }

      // Subtask checklist — normalize both old {text, done} and new {id, status, title} formats
      const rawSubtasks = job.subtasks || [];
      const subtasks = rawSubtasks.map((st, idx) => {
        if (st.id && st.status) return st; // new format
        // Old format: {text, done} → normalize
        const status = st.done ? 'done' : 'pending';
        return { id: st.id || `${job.id}-st-${idx}`, status, title: st.text || st.title || '', text: st.text || st.title || '', done: !!st.done };
      });
      if (subtasks.length > 0) {
        const activeSubtasks = subtasks.filter(st => st.status !== 'cancelled');
        const doneCount = activeSubtasks.filter(st => st.status === 'done').length;
        const hasProgress = activeSubtasks.some(st => st.status !== 'pending');
        // For done jobs, show nothing or just completed count without fraction
        if (isDone) {
          cardHtml += `<div class="subtask-summary">${doneCount} tasks completed</div>`;
        } else {
          cardHtml += `<div class="subtask-summary">${doneCount}/${activeSubtasks.length} tasks${hasProgress ? ' — in progress' : ''}</div>`;
        }
        cardHtml += `<div class="subtask-list">`;
        subtasks.forEach((st, idx) => {
          const stNum = `${job.number || 'REQ-?'}-${idx + 1}`;
          const stIcon = st.status === 'done' ? '✓' : (st.status === 'cancelled' ? '✗' : (st.status === 'in-progress' ? '●' : ''));
          let stMeta = '';
          if (st.status === 'done') {
            const timeTaken = st.startedAt && st.completedAt ? formatDuration(st.completedAt - st.startedAt) : '';
            stMeta = `<span class="subtask-meta subtask-time-taken">${timeTaken || '✓'}</span>`;
          } else if (st.status === 'cancelled') {
            stMeta = '<span class="subtask-meta">cancelled</span>';
          } else if (st.status === 'in-progress') {
            stMeta = '<span class="subtask-meta">active</span>';
          }
          const titleText = escapeHtml((st.title || st.text || st.id || '').length > 35 ? (st.title || st.text || st.id || '').substring(0, 32) + '...' : (st.title || st.text || st.id || ''));
          // ... menu for pending subtasks
          const showMenu = (st.status === 'pending' || st.status === 'cancelled') && !isDone;
          cardHtml += `
            <div class="subtask-item ${st.status}" data-subtask-id="${st.id}" data-job-id="${job.id}" data-st-number="${stNum}">
              <span class="subtask-icon ${st.status}">${stIcon}</span>
              <span class="subtask-number">${stNum}</span>
              <span class="subtask-title">${titleText}</span>
              ${stMeta}
              ${showMenu ? `<button class="st-menu-btn" data-subtask-id="${st.id}" data-job-id="${job.id}" data-status="${st.status}">⋯</button>` : ''}
            </div>
          `;
        });
        cardHtml += `</div>`;
      }
    }

    // ── Done: compact with completion timestamp ──
    if (isDone) {
      if (job.completedAt) {
        cardHtml += `<div class="task-completed">Completed: ${formatTimestamp(job.completedAt)}</div>`;
      }
      if (job.qcResult && job.qcResult.status) {
        const qcIcon = job.qcResult.status === 'approved' ? '✅' : '❌';
        cardHtml += `<div class="task-qc-result">${qcIcon} QC ${job.qcResult.status}</div>`;
      }
    }

    // ── Card inline controls ──
    // Active: ⏸ pause button bottom-left inside card
    // Stopped: ▶ start bottom-left
    if (!isDone && !isAwaiting) {
      // Dismiss/delete ✕ on paused cards
      if (jobStatus === 'paused') {
        cardHtml += `<button class="job-dismiss-btn" data-job-id="${job.id}" title="Delete">✕</button>`;
      }
    }

    card.innerHTML = cardHtml;

    // Click to expand (but not on buttons or subtask items)
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.subtask-item') || e.target.closest('.approval-actions') || e.target.closest('.deny-reason-container')) return;
      openCardModal(job);
    });

    container.appendChild(card);
  }

  // ── Card Modal Expansion ──
  function openCardModal(job) {
    const modal = document.getElementById('cardModal');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;

    // Clean up previous modal timer
    if (modalTimerInterval) { clearInterval(modalTimerInterval); modalTimerInterval = null; }

    const assignee = job.assignee || 'Unassigned';
    const emoji = getAssigneeEmoji(assignee);
    const priority = job.priority || 'normal';
    const createdBy = job.createdBy || 'Sam';
    const creatorEmoji = getCreatedByEmoji(createdBy);
    const isDone = job.phase === 'done' || job._column === 'done';
    const isAwaiting = job.phase === 'awaiting-approval' || job._column === 'awaitingApproval';
    const subtasks = job.subtasks || [];
    const history = job.history || [];

    let html = '';

    // Header: [priority pill] [REQ-number] on line 1, title on line 2
    html += `<div class="modal-header">`;
    html += `<div class="modal-badge-row">`;
    // Priority shown via colored dot only in modal
    const prioColors = { low: '#3b82f6', normal: '#22c55e', high: '#ef4444', critical: '#f59e0b' };
    html += `<span class="modal-prio-dot" style="background:${prioColors[priority] || prioColors.normal}"></span>`;
    if (job.number) html += `<span class="task-number">${job.number}</span>`;
    const phaseLabels = { todo: 'To Do', 'awaiting-approval': 'Awaiting Approval', done: 'Done' };
    const phaseColors = { todo: '#6b7280', 'awaiting-approval': '#f59e0b', done: '#22c55e' };
    html += `<span class="phase-badge" style="background:${phaseColors[job.phase] || '#6b7280'}">${phaseLabels[job.phase] || job.phase}</span>`;
    html += `</div>`;
    // Edit button for unstarted jobs
    if (job.phase === 'todo') {
    }
    html += `<h2 class="modal-title">${escapeHtml(job.title || 'Untitled Task')}</h2>`;
    html += `</div>`;

    // Open in Obsidian link
    if (job.number) {
      const reqFile = `REQ/${job.number}.md`;
      const obsUri = `obsidian://open?vault=${encodeURIComponent('Mission Control')}&file=${encodeURIComponent(reqFile)}`;
      html += `<a class="vault-obsidian-link modal-obsidian-link" href="${obsUri}" title="Open ${job.number} in Obsidian">⧄ Open in Obsidian</a>`;
    }

    // Assignee
    html += `<div class="modal-section">`;
    html += `<h3>Assignee</h3>`;
    html += `<div class="modal-assignee"><span class="assignee-emoji" style="font-size:20px">${emoji}</span> ${escapeHtml(assignee)}</div>`;
    html += `</div>`;

    // Created By
    html += `<div class="modal-section">`;
    html += `<h3>Created By</h3>`;
    html += `<div class="modal-assignee"><span class="assignee-emoji" style="font-size:20px">${creatorEmoji}</span> ${escapeHtml(createdBy)}</div>`;
    html += `</div>`;

    // Due date / Scheduled indicator
    if (job.dueDate) {
      html += `<div class="modal-section">`;
      const overdue = isDueDateOverdue(job.dueDate);
      const isScheduled = job.phase === 'todo' && new Date(job.dueDate) > new Date();
      if (isScheduled) {
        html += `<h3>Scheduled</h3>`;
        html += `<div class="modal-due-date scheduled" style="color:#3b82f6;font-weight:600">🕐 Scheduled to start: ${formatDueDate(job.dueDate)}</div>`;
      } else {
        html += `<h3>Due Date</h3>`;
        html += `<div class="modal-due-date ${overdue ? 'overdue' : ''}">${formatDueDate(job.dueDate)}</div>`;
      }
      html += `</div>`;
    }

    // Description
    if (job.description || job.details) {
      html += `<div class="modal-section">`;
      html += `<h3>Description</h3>`;
      html += `<p class="modal-description">${escapeHtml(job.description || job.details)}</p>`;
      html += `</div>`;
    }

    // Working info with elapsed timer
    if (job.phase === 'working') {
      const startTs = getWorkingStartTs(job);
      if (startTs) {
        html += `<div class="modal-section">`;
        html += `<h3>Progress</h3>`;
        html += `<div class="modal-progress">`;
        html += `<div>Started: ${formatTimestamp(startTs)}</div>`;
        html += `<div>Elapsed: <span id="modal-elapsed-${job.id}">${formatElapsed(Date.now() - startTs)}</span></div>`;
        html += `</div>`;
        html += `</div>`;
      }
    }

    // Awaiting Approval actions in modal
    if (isAwaiting) {
      html += `<div class="modal-section">`;
      html += `<h3>Approval</h3>`;
      html += `<div class="modal-approval-actions">`;
      html += `<button class="btn btn-approve-request" data-job-id="${job.id}" style="background:#22c55e;color:#fff;border-color:#22c55e">✅ Accept — Move to Done</button>`;
      html += `</div>`;
      html += `<div class="modal-deny-section">`;
      html += `<input type="text" id="modal-deny-input-${job.id}" class="deny-reason-input" placeholder="Reason for denial..." style="width:100%;margin-top:8px" />`;
      html += `<button class="btn btn-deny-request" data-job-id="${job.id}" style="margin-top:6px;background:#ef4444;color:#fff;border-color:#ef4444">❌ Deny — Send back to To Do</button>`;
      html += `</div>`;
      html += `</div>`;
    }

    // Subtasks (detailed, clickable)
    if (subtasks.length > 0) {
      const doneCount = subtasks.filter(st => st.status === 'done').length;
      html += `<div class="modal-section">`;
      html += `<h3>Subtasks (${doneCount}/${subtasks.length})</h3>`;
      html += `<div class="modal-subtask-list">`;
      subtasks.forEach(st => {
        html += `
          <div class="modal-subtask-item ${st.status}" data-subtask-id="${st.id}" data-job-id="${job.id}">
            <span class="subtask-checkbox"></span>
            <span class="subtask-title">${escapeHtml(st.title || st.id)}</span>
            ${st.status === 'done' ? '<span class="subtask-meta">✓' + (st.completedBy ? ' by ' + escapeHtml(st.completedBy) : '') + (st.completedAt ? ' · ' + formatTimestamp(st.completedAt) : '') + '</span>' : ''}
            ${st.status === 'in-progress' ? '<span class="subtask-meta">⏱ active</span>' : ''}
          </div>
        `;
      });
      html += `</div>`;
      html += `</div>`;
    }

    // QC result
    if (job.qcResult) {
      html += `<div class="modal-section">`;
      html += `<h3>QC Result</h3>`;
      const qcIcon = job.qcResult.status === 'approved' ? '✅' : '❌';
      html += `<div class="modal-qc-result">${qcIcon} ${job.qcResult.status} by ${escapeHtml(job.qcResult.by || 'Unknown')}`;
      if (job.qcResult.notes) html += ` &mdash; "${escapeHtml(job.qcResult.notes)}"`;
      html += `</div>`;
      html += `</div>`;
    }

    // Completion
    if (isDone && job.completedAt) {
      html += `<div class="modal-section">`;
      html += `<h3>Completed</h3>`;
      html += `<div class="modal-progress">${formatTimestamp(job.completedAt)}</div>`;
      html += `</div>`;
    }

    // Token cost — removed (self-hosted, always $0)

    // History log
    if (history.length > 0) {
      html += `<div class="modal-section">`;
      html += `<h3>History</h3>`;
      html += `<div class="modal-history">`;
      // Show last 15 entries, most recent first
      const recentHistory = [...history].reverse().slice(0, 15);
      recentHistory.forEach(h => {
        const eventText = h.event || 'unknown';
        const reasonText = h.reason ? ` — "${h.reason}"` : '';
        const byHtml = h.by ? ` by <span class="history-person" data-person="${escapeHtml(h.by)}" title="Message ${escapeHtml(h.by)}">${escapeHtml(h.by)}</span>` : '';
        html += `
          <div class="history-entry">
            <span class="history-time">${formatTimestamp(h.ts)}</span>
            <span class="history-event">${escapeHtml(eventText)}${byHtml}${escapeHtml(reasonText)}</span>
          </div>
        `;
      });
      html += `</div>`;
      html += `</div>`;
    }

    // Cancel button (for non-done, non-awaiting jobs)
    if (!isDone && !isAwaiting) {
      html += `<div class="modal-section" style="text-align:center;padding-top:12px;border-top:1px solid var(--line)">`;
      html += `<button class="btn modal-cancel-btn" data-job-id="${job.id}" style="font-size:13px;padding:8px 24px;border-radius:8px;background:transparent;border:1px solid var(--line);color:var(--muted);cursor:pointer;transition:all .15s">Cancel</button>`;
      html += `</div>`;
    }

    content.innerHTML = html;

    // Bind modal subtask clicks
    content.querySelectorAll('.modal-subtask-item').forEach(item => {
      item.addEventListener('click', () => {
        const subtaskId = item.dataset.subtaskId;
        const jobId = item.dataset.jobId;
        const currentStatus = item.classList.contains('done') ? 'done' :
                             (item.classList.contains('in-progress') ? 'in-progress' : 'pending');
        // Don't toggle completed subtasks in modal either
        if (currentStatus === 'done') return;
        const nextStatus = currentStatus === 'pending' ? 'in-progress' : 'done';
        toggleSubtask(jobId, subtaskId, nextStatus);
      });
    });

    // Bind modal cancel button (closes modal)
    content.querySelectorAll('.modal-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const jobId = btn.dataset.jobId;
        // Stop the job and close modal
        fetch(`/api/mission-control-jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobStatus: 'stopped' })
        }).then(() => {
          modal.style.display = 'none';
          loadAssetData(); // Refresh the board
        });
      });
      // Hover effects
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#ef4444';
        btn.style.color = '#fff';
        btn.style.borderColor = '#ef4444';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--muted)';
        btn.style.borderColor = 'var(--line)';
      });
    });

    // Bind modal approval buttons
    content.querySelectorAll('.btn-approve-request').forEach(btn => {
      btn.addEventListener('click', () => {
        approveRequest(btn.dataset.jobId);
        modal.style.display = 'none';
      });
    });

    content.querySelectorAll('.btn-deny-request').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(`modal-deny-input-${btn.dataset.jobId}`);
        const reason = input ? input.value.trim() : '';
        denyRequest(btn.dataset.jobId, reason);
        modal.style.display = 'none';
      });
    });

    // Bind Edit button for todo jobs

    // Wake button — pokes Alfred to rewrite \u0026 start

    modal.style.display = 'flex';

    // Start modal elapsed timer if working
    if (job.phase === 'working') {
      const startTs = getWorkingStartTs(job);
      if (startTs) {
        modalTimerInterval = setInterval(() => {
          const el = document.getElementById(`modal-elapsed-${job.id}`);
          if (!el) { clearInterval(modalTimerInterval); modalTimerInterval = null; return; }
          el.textContent = formatElapsed(Date.now() - startTs);
        }, 1000);
      }
    }
  }

  // ── Close Modal ──
  document.getElementById('modalClose')?.addEventListener('click', () => {
    const modal = document.getElementById('cardModal');
    if (modal) {
      modal.style.display = 'none';
      if (modalTimerInterval) { clearInterval(modalTimerInterval); modalTimerInterval = null; }
    }
  });

  document.getElementById('cardModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'cardModal') {
      const modal = document.getElementById('cardModal');
      if (modal) {
        modal.style.display = 'none';
        if (modalTimerInterval) { clearInterval(modalTimerInterval); modalTimerInterval = null; }
      }
    }
  });

  // ── History person click: open message box ──
  document.addEventListener('click', (e) => {
    // Priority cycling on cards (click the invisible target overlay)
    const prioEl = e.target.closest('.task-priority-cycle-target');
    if (prioEl) {
      e.stopPropagation();
      const jobId = prioEl.dataset.jobId;
      const card = prioEl.closest('.task-card');
      const currentPrio = ['critical', 'high', 'normal', 'low'].find(p => card.classList.contains(`prio-${p}`)) || 'normal';
      const cycle = { 'normal': 'high', 'high': 'critical', 'critical': 'normal' };
      const newPrio = cycle[currentPrio] || 'normal';
      fetch(`/api/mission-control-jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPrio })
      }).then(r => r.json()).then(() => loadAssetData()).catch(() => {});
      return;
    }

    // Job status controls (pause / resume / start)
    const jobCtrlBtn = e.target.closest('.job-ctrl-btn');
    if (jobCtrlBtn) {
      e.stopPropagation();
      const jobId = jobCtrlBtn.dataset.jobId;
      let newStatus = 'active';
      if (jobCtrlBtn.classList.contains('pause-btn')) newStatus = 'paused';
      else if (jobCtrlBtn.classList.contains('stop-btn')) newStatus = 'stopped';
      else if (jobCtrlBtn.classList.contains('resume-btn')) newStatus = 'active';
      fetch(`/api/mission-control-jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobStatus: newStatus, by: 'Sam' })
      }).then(r => r.json()).then(() => loadAssetData()).catch(() => {});
      return;
    }

    // Dismiss/delete button (✕ on paused cards)
    const dismissBtn = e.target.closest('.job-dismiss-btn');
    if (dismissBtn) {
      e.stopPropagation();
      const jobId = dismissBtn.dataset.jobId;
      fetch(`/api/mission-control-jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobStatus: 'stopped', by: 'Sam' })
      }).then(r => r.json()).then(() => loadAssetData()).catch(() => {});
      return;
    }
    // ... menu click-away
    if (!e.target.closest('.st-menu-btn') && !e.target.closest('.st-menu-dropdown')) {
      document.querySelectorAll('.st-menu-dropdown').forEach(m => m.remove());
    }

    const person = e.target.closest('.history-person, .clickable-person, .activity-person');
    if (!person) return;
    e.stopPropagation();
    const name = person.dataset.person;
    if (!name) return;

    // Remove any existing message box
    document.querySelectorAll('.history-message-box').forEach(b => b.remove());

    const box = document.createElement('div');
    box.className = 'history-message-box';
    box.innerHTML = `
      <div class="history-message-label">Message <strong>${name}</strong> about this task:</div>
      <div class="history-message-row">
        <input type="text" class="history-message-input" placeholder="What do you want to ask?" />
        <button class="history-message-send">Send</button>
      </div>
    `;
    // Insert message box after the person's parent element
    const parentContainer = person.closest('.history-entry, .activity-entry, .modal-history-entry, .subtask-item, div');
    if (parentContainer) {
      parentContainer.after(box);
    } else {
      person.after(box);
    }

    const input = box.querySelector('.history-message-input');
    const sendBtn = box.querySelector('.history-message-send');
    input.focus();

    const sendMessage = async () => {
      const msg = input.value.trim();
      if (!msg) return;
      // Try to find job/subtask context from parent elements
      const cardEl = person.closest('.task-card, .modal-card');
      const jobNumber = cardEl?.querySelector('.task-number')?.textContent || '';
      const subtaskEl = person.closest('.subtask-item');
      const subtaskNumber = subtaskEl?.querySelector('.subtask-number')?.textContent || '';
      try {
        await fetch('/api/mission-control-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: name, message: msg, timestamp: Date.now(), jobNumber, subtaskNumber })
        });
        showToast(`Message sent to ${name}`);
      } catch (err) {
        console.error('[MC] Message send failed:', err);
      }
      box.innerHTML = `<div class="history-message-sent">✓ Sent to <strong>${name}</strong>: "${msg.substring(0, 50)}${msg.length > 50 ? '...' : ''}"</div>`;
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') sendMessage();
      if (ev.key === 'Escape') box.remove();
    });
  });
  async function toggleSubtask(jobId, subtaskId, newStatus, by) {
    try {
      const body = { updates: [{ subtaskId, status: newStatus }] };
      if (by) body.updates[0].by = by;
      const res = await fetch(`/api/mission-control-jobs/${jobId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok) {
        if (data.job && data.job.phase === 'awaiting-approval') {
          console.log('[MC] Auto-transitioned to Awaiting Approval — all subtasks done');
        }
        loadAssetData(); // Refresh pipeline
      } else {
        console.error('[MC] Subtask update failed:', data.error);
      }
    } catch (err) {
      console.error('[MC] Subtask update error:', err);
    }
  }

  // ── API: Transition Job ──
  async function transitionJob(jobId, phase) {
    try {
      const res = await fetch(`/api/mission-control-jobs/${jobId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase })
      });
      const data = await res.json();
      if (data.ok) {
        loadAssetData();
      } else {
        console.error('[MC] Transition failed:', data.error);
      }
    } catch (err) {
      console.error('[MC] Transition error:', err);
    }
  }

  // ── API: Approve Request ──
  async function approveRequest(jobId) {
    try {
      const res = await fetch(`/api/mission-control-jobs/${jobId}/approve-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'Sam' })
      });
      const data = await res.json();
      if (data.ok) {
        loadAssetData();
      } else {
        console.error('[MC] Approve request failed:', data.error);
      }
    } catch (err) {
      console.error('[MC] Approve request error:', err);
    }
  }

  // ── API: Deny Request ──
  async function denyRequest(jobId, reason) {
    try {
      const res = await fetch(`/api/mission-control-jobs/${jobId}/deny-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'Sam', reason: reason || '' })
      });
      const data = await res.json();
      if (data.ok) {
        loadAssetData();
      } else {
        console.error('[MC] Deny request failed:', data.error);
      }
    } catch (err) {
      console.error('[MC] Deny request error:', err);
    }
  }

  // ── API: Approve Job (legacy) ──
  async function approveJob(jobId) {
    try {
      const res = await fetch(`/api/mission-control-jobs/${jobId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.ok) {
        loadAssetData();
      } else {
        console.error('[MC] Approve failed:', data.error);
      }
    } catch (err) {
      console.error('[MC] Approve error:', err);
    }
  }

  // ── API: Reject Job (legacy) ──
  async function rejectJob(jobId, reason) {
    try {
      const res = await fetch(`/api/mission-control-jobs/${jobId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || '' })
      });
      const data = await res.json();
      if (data.ok) {
        loadAssetData();
      } else {
        console.error('[MC] Reject failed:', data.error);
      }
    } catch (err) {
      console.error('[MC] Reject error:', err);
    }
  }

  // ── API: Archive Job ──
  async function archiveJob(jobId) {
    try {
      const res = await fetch(`/api/mission-control-jobs/${jobId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.ok) {
        loadAssetData();
      } else {
        console.error('[MC] Archive failed:', data.error);
      }
    } catch (err) {
      console.error('[MC] Archive error:', err);
    }
  }

  // ── API: Archive All Done Jobs ──
  async function archiveAllDone() {
    try {
      const res = await fetch('/api/mission-control-jobs/archive-all-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.ok) {
        loadAssetData();
      } else {
        console.error('[MC] Archive all failed:', data.error);
      }
    } catch (err) {
      console.error('[MC] Archive all error:', err);
    }
  }

  // ── Add Task Button ──
  document.getElementById('addTaskBtn')?.addEventListener('click', async () => {
    const existingForm = document.getElementById('inlineTaskForm');
    if (existingForm) {
      existingForm.remove();
      return;
    }

    const container = document.querySelector('.main-viewport');
    if (!container) return;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    const form = document.createElement('div');
    form.id = 'inlineTaskForm';
    form.className = 'inline-task-form-overlay';
    form.innerHTML = `
      <div class="inline-task-form-card">
        <h3>New Job</h3>
        <input type="text" id="newTaskTitle" placeholder="What needs to be done?" class="inline-input" style="width:100%;margin-bottom:8px" />
        <textarea id="newTaskDetails" placeholder="Extra details (optional)" class="inline-input" style="width:100%;min-height:40px;resize:vertical;margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <select id="newTaskAssignee" class="inline-select" style="flex:1">
            <option value="Unassigned">Unassigned</option>
            <option value="Alfred">Alfred 🛎️</option>
          </select>
          <select id="newTaskPriority" class="inline-select" style="flex:1">
            <option value="normal" selected>Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <select id="newTaskCreatedBy" class="inline-select" style="flex:1">
            <option value="Sam" selected>Created by: Sam</option>
            <option value="Alfred">Created by: Alfred</option>
          </select>
          <input type="date" id="newTaskDueDate" class="inline-input" style="flex:1" min="${today}" value="${today}" placeholder="Due date" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="cancelTaskBtn" class="btn btn-secondary" style="font-size:13px;padding:6px 14px;">Cancel</button>
          <button id="submitTaskBtn" class="btn btn-primary" style="font-size:13px;padding:6px 14px;">Create Job</button>
        </div>
      </div>
    `;

    document.body.appendChild(form);

    // Close on overlay click
    form.addEventListener('click', (e) => {
      if (e.target === form) form.remove();
    });

    document.getElementById('newTaskTitle')?.focus();


    document.getElementById('cancelTaskBtn')?.addEventListener('click', () => {
      form.remove();
    });

    document.getElementById('submitTaskBtn')?.addEventListener('click', async () => {
      const rawTask = document.getElementById('newTaskTitle')?.value.trim();
      if (!rawTask) return;
      const title = rawTask.length > 50 ? rawTask.substring(0, 47) + '...' : rawTask;
      const details = document.getElementById('newTaskDetails')?.value.trim() || '';
      const description = rawTask + (details ? '\n\n' + details : '');
      const assignee = document.getElementById('newTaskAssignee')?.value || 'Unassigned';
      const priority = document.getElementById('newTaskPriority')?.value || 'normal';
      const createdBy = document.getElementById('newTaskCreatedBy')?.value || 'Sam';
      const dueDate = document.getElementById('newTaskDueDate')?.value || '';
      const project = 'Mission Control';

      try {
        const res = await fetch('/api/mission-control-jobs/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, details: description, assignee, priority, createdBy, dueDate, project, addSubtasks: [{ title: rawTask, status: 'pending' }] })
        });
        const data = await res.json();
        if (data.ok) {
          const overlay = document.getElementById('inlineTaskForm');
          if (overlay) overlay.remove();
          loadAssetData();
        } else {
          console.error('[MC] Create failed:', data.error);
        }
      } catch (err) {
        console.error('[MC] Create error:', err);
      }
    });
  });

  // ── Pulse Metrics (now in Overview) ──

  function formatDailyDate(dateStr) {
    // Convert "2026-04-09" → "Apr 9"
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = months[parseInt(parts[1], 10) - 1] || parts[1];
    const day = parseInt(parts[2], 10);
    return `${month} ${day}`;
  }

  async function loadPulseData() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const res = await fetch('/api/pulse-data', { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      if (!data.ok) {
        console.warn('[pulse] API returned not-ok:', data.error || data);
        // Show error state on system info
        const errEls = ['sysTokensIn','sysTokensOut','sysSessionTime'];
        errEls.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
        return;
      }

      // System Health
      const uptimeEl = document.getElementById('pulse-uptime');
      const modelEl = document.getElementById('pulse-model');
      const contextEl = document.getElementById('pulse-context');
      const contextDetailEl = document.getElementById('pulse-context-detail');

      if (uptimeEl) uptimeEl.textContent = data.uptime || '—';
      if (modelEl) modelEl.textContent = data.model ? data.model.replace('ollama/', '') : '—';
      // Context: show used/total format
      const ctxTotal = data.contextWindow || 202752;
      const ctxUsed = data.contextUsed || Math.round(ctxTotal * 0.1); // estimate if not provided
      const formatCtx = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : n.toString();
      if (contextEl) contextEl.textContent = `${formatCtx(ctxUsed)}/${formatCtx(ctxTotal)}`;
      if (contextDetailEl) contextDetailEl.textContent = `${ctxUsed.toLocaleString()} / ${ctxTotal.toLocaleString()} tokens`;

      // System Info Card
      const fmtK = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : n.toString();
      const sysSessionId = document.getElementById('sysSessionId');
      const sysModel = document.getElementById('sysModel');
      const sysTokensIn = document.getElementById('sysTokensIn');
      const sysTokensOut = document.getElementById('sysTokensOut');
      if (sysSessionId) sysSessionId.textContent = data.sessionId || '—';
      if (sysModel) sysModel.textContent = data.model ? data.model.replace('ollama/', '') : '—';
      if (sysTokensIn) sysTokensIn.textContent = data.inputTokens ? fmtK(data.inputTokens) : '—';
      if (sysTokensOut) sysTokensOut.textContent = data.outputTokens ? fmtK(data.outputTokens) : '—';
      // Footer context bar (bottom left)
      const footerCtxFill = document.getElementById('footerContextFill');
      const footerCtxLabel = document.getElementById('footerContextLabel');
      const pct = data.percentUsed || Math.round((data.contextUsed || 0) / (data.contextWindow || 202752) * 100);
      if (footerCtxFill) footerCtxFill.style.width = `${Math.min(pct, 100)}%`;
      if (footerCtxLabel) footerCtxLabel.textContent = `${pct}%`;
      // Session time (live counter)
      const sysSessionTime = document.getElementById('sysSessionTime');
      if (sysSessionTime) sysSessionTime.textContent = data.sessionUptime || '—';
      // Version (bottom right)
      const sysVersion = document.getElementById('sysVersion');
      if (sysVersion) sysVersion.textContent = (data.lastUpdate || '—').replace('OpenClaw ', 'v');
      // Start live session timer
      _startSessionTimer(data);



      // Version
      const versionEl = document.getElementById('pulse-version');
      if (versionEl) versionEl.textContent = data.lastUpdate || '—';

      // Tasks completed metrics
      const tasksCompleted = data.tasksCompleted || {};
      const todayEl = document.getElementById('pulse-tasks-today');
      const weekEl = document.getElementById('pulse-tasks-week');
      const monthEl = document.getElementById('pulse-tasks-month');
      const yearEl = document.getElementById('pulse-tasks-year');
      if (todayEl) todayEl.textContent = tasksCompleted.today ?? '—';
      if (weekEl) weekEl.textContent = tasksCompleted.week ?? '—';
      if (monthEl) monthEl.textContent = tasksCompleted.month ?? '—';
      if (yearEl) yearEl.textContent = tasksCompleted.year ?? '—';

      // Job count metrics
      const jobsData = data.jobs || {};
      const jobsActiveEl = document.getElementById('pulse-jobs-active');
      const jobsTodoEl = document.getElementById('pulse-jobs-todo');
      const jobsDoneTodayEl = document.getElementById('pulse-jobs-done-today');
      const jobsTotalEl = document.getElementById('pulse-jobs-total');
      if (jobsActiveEl) jobsActiveEl.textContent = jobsData.working ?? '—';
      if (jobsTodoEl) jobsTodoEl.textContent = jobsData.todo ?? '—';
      if (jobsDoneTodayEl) jobsDoneTodayEl.textContent = jobsData.doneToday ?? '—';
      if (jobsTotalEl) jobsTotalEl.textContent = jobsData.total ?? '—';

      // Usage — per-model cards
      const usage = data.usage || {};
      renderModelCards(usage);

    } catch (err) {
      console.error('[MC] Failed to load Pulse data:', err);
    }
  }

  function renderModelCards(usage) {
    const container = document.getElementById('pulseModelCards');
    if (!container) return;

    // Team model list — only active team members
    const displayNames = {
      'glm-5.1:cloud': 'GLM 5.1',
      'kimi-k2.5:cloud': 'Kimi K2.5',
      'gpt-5.4': 'GPT 5.4',
      'gpt-5.3-codex': 'Codex 5.3'
    };

    const modelOrigins = {
      'glm-5.1:cloud': 'Ollama',
      'kimi-k2.5:cloud': 'Ollama',
      'gpt-5.4': 'OpenAI',
      'gpt-5.3-codex': 'OpenAI'
    };

    // Keyword mapping for flexible matching
    const modelKeywords = {
      'glm-5.1:cloud': ['glm', 'glm5', 'glm-5'],
      'kimi-k2.5:cloud': ['kimi', 'kimi-k2', 'kimik2'],
      'gpt-5.4': ['gpt-5.4', 'gpt5.4'],
      'gpt-5.3-codex': ['gpt-5.3', 'gpt5.3', 'codex', 'codex5.3']
    };

    // Models to exclude (retired agents)
    const excludedModels = ['gemma', 'qwen', 'minimax'];

    const modelTokens = {};
    Object.keys(displayNames).forEach(m => { modelTokens[m] = 0; });

    function normalizeForMatch(s) {
      return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // Extract from Ollama model breakdown
    const ollama = usage.ollama;
    if (ollama && ollama.available && Array.isArray(ollama.modelBreakdown)) {
      ollama.modelBreakdown.forEach(m => {
        const name = (m.name || '').toLowerCase();
        const normName = normalizeForMatch(name);
        let matched = false;
        Object.keys(modelKeywords).forEach(target => {
          if (matched) return;
          const keywords = modelKeywords[target] || [];
          for (const kw of keywords) {
            if (normName.includes(normalizeForMatch(kw)) || name.includes(kw)) {
              modelTokens[target] += m.tokens || 0;
              matched = true;
              break;
            }
          }
        });
        // Unmatched Ollama models → add as-is (unless excluded)
        if (!matched && m.tokens > 0) {
          const isExcluded = excludedModels.some(ex => normalizeForMatch(name).includes(normalizeForMatch(ex)));
          if (!isExcluded) {
            modelTokens[name] = (modelTokens[name] || 0) + m.tokens;
            if (!displayNames[name]) displayNames[name] = name;
            if (!modelOrigins[name]) modelOrigins[name] = 'Ollama';
          }
        }
      });
    }

    // OpenAI models from Codex usage
    const codex = usage.codex;
    if (codex && codex.available && Array.isArray(codex.daily)) {
      codex.daily.forEach(d => {
        const models = d.modelsUsed || [];
        if (models.includes('gpt-5.4')) modelTokens['gpt-5.4'] += d.totalTokens || 0;
        if (models.includes('gpt-5.3-codex')) modelTokens['gpt-5.3-codex'] += d.totalTokens || 0;
      });
    }

    // Sort by tokens descending, take top 3
    const sorted = Object.entries(modelTokens)
      .filter(([_, t]) => t > 0)
      .sort((a, b) => b[1] - a[1]);
    const topModels = sorted.slice(0, 3);
    const totalTokens = sorted.reduce((sum, [_, t]) => sum + t, 0);

    // Time scale
    const codexDays = (codex && Array.isArray(codex.daily)) ? codex.daily.length : 0;
    const timeLabel = codexDays > 0 ? `${codexDays}d` : '—';

    let html = '';
    topModels.forEach(([model, tokens]) => {
      const displayName = displayNames[model] || model;
      const origin = modelOrigins[model] || '';
      const originClass = origin === 'OpenAI' ? 'model-origin-label openai' : 'model-origin-label';
      const originTag = origin ? `<span class="${originClass}">${escapeHtml(origin)}</span>` : '';
      html += `
        <div class="engagement-card">
          <span class="platform-name">${escapeHtml(displayName)} ${originTag}</span>
          <span class="metric-value" style="font-size:24px">${tokens.toLocaleString()}</span>
          <span class="metric-label">tokens</span>
        </div>
      `;
    });

    // Total card
    if (sorted.length > 0) {
      html += `
        <div class="engagement-card" style="border:2px solid var(--line)">
          <span class="platform-name" style="font-weight:700">Total · ${timeLabel}</span>
          <span class="metric-value" style="font-size:24px;font-weight:700">${totalTokens.toLocaleString()}</span>
          <span class="metric-label">tokens</span>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  // ── Server Status ──
  // ── Live Session Timer ──
  let _sessionTimerInterval = null;
  let _sessionStartMs = null;

  function _startSessionTimer(data) {
    // Parse session age from pulse data and start ticking
    if (_sessionTimerInterval) clearInterval(_sessionTimerInterval);
    // Use sessionUptime string to estimate start time
    const uptimeStr = data.sessionUptime || '';
    let elapsedSec = _parseDuration(uptimeStr);
    _sessionStartMs = Date.now() - (elapsedSec * 1000);
    _tickSessionTimer();
    _sessionTimerInterval = setInterval(_tickSessionTimer, 1000);
  }

  function _tickSessionTimer() {
    const el = document.getElementById('sysSessionTime');
    if (!el || !_sessionStartMs) return;
    const sec = Math.floor((Date.now() - _sessionStartMs) / 1000);
    el.textContent = _formatLiveDuration(sec);
  }

  function _parseDuration(str) {
    // Parse "1h 23m 45s" or "23m 45s" or "45s" back to seconds
    let total = 0;
    const h = str.match(/(\d+)h/); if (h) total += parseInt(h[1]) * 3600;
    const m = str.match(/(\d+)m/); if (m) total += parseInt(m[1]) * 60;
    const s = str.match(/(\d+)s/); if (s) total += parseInt(s[1]);
    return total;
  }

  function _formatLiveDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function updateServerStatus(connected) {
    // Removed: serverStatus element no longer in footer
    // Update footer green dot
    const infoEl = document.getElementById('serverInfo');
    if (infoEl) {
      const ver = '';
      infoEl.innerHTML = `OpenClaw`;
    }
    // Also update the system status strip
    updateSystemStatus(null, connected);
  }

  // ── Toast Notification ──
  function showToast(message, duration = 3000) {
    const existing = document.getElementById('mc-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'mc-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:10px;background:var(--ink);color:var(--primary-text);font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:opacity .3s';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, duration);
  }

  // ── Auto-Refresh Pipeline (every 10s, skip if typing) ──

  setInterval(() => {
    const activeInput = document.activeElement;
    const isTyping = activeInput && (activeInput.tagName === 'INPUT' || activeInput.tagName === 'TEXTAREA' || activeInput.isContentEditable);
    if (!isTyping) loadAssetData();
  }, 10000);



  // ── Initialize ──
  updateServerStatus(false);
  loadAssetData();

  console.log('[MC] Unified Workspace initialized');


  // Mobile FAB — triggers same add flow
  const mobileFab = document.getElementById('addTaskBtnMobile');
  if (mobileFab) {
    mobileFab.addEventListener('click', () => {
      document.getElementById('addTaskBtn')?.click();
    });
  }

// ── Vault Browser ──
let vaultTreeData = [];
let vaultCurrentFile = null;

async function loadVaultTree() {
  const treeEl = document.getElementById('vaultTree');
  if (!treeEl) return;
  try {
    const res = await fetch('/api/vault/tree');
    const data = await res.json();
    if (!data.ok) {
      treeEl.innerHTML = '<div class="vault-loading">Error loading vault</div>';
      return;
    }
    vaultTreeData = data.files;
    renderVaultTree(treeEl, data.files);
  } catch (e) {
    treeEl.innerHTML = '<div class="vault-loading">Error loading vault</div>';
  }
}

function renderVaultTree(container, files) {
  container.innerHTML = '';
  const structure = {};
  for (const f of files) {
    const parts = f.path.split('/');
    const folder = parts.slice(0, -1).join('/');
    if (!structure[folder]) structure[folder] = [];
    structure[folder].push(f);
  }

  function getSubFolders(parentPath) {
    return Object.keys(structure).filter(k => {
      if (k === parentPath) return false;
      if (parentPath === '') return !k.includes('/');
      return k.startsWith(parentPath + '/') && k.slice(parentPath.length + 1).split('/').length === 1;
    }).sort();
  }

  function renderLevelInto(targetContainer, parentPath, depth) {
    const items = structure[parentPath] || [];
    const subFolders = getSubFolders(parentPath);

    for (const f of items) {
      const el = document.createElement('div');
      el.className = 'vault-item';
      el.style.paddingLeft = (16 + depth * 16) + 'px';
      const icon = getFileIcon(f.name);
      el.innerHTML = '<span class="vault-icon">' + icon + '</span>' + escapeHtml(f.name);
      el.addEventListener('click', () => {
        container.querySelectorAll('.vault-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        openVaultFile(f.path, f.name);
      });
      targetContainer.appendChild(el);
    }

    for (const sf of subFolders) {
      const folderName = sf.split('/').pop();
      const folderEl = document.createElement('div');
      folderEl.className = 'vault-item folder';
      folderEl.style.paddingLeft = (16 + depth * 16) + 'px';
      folderEl.dataset.expanded = 'false';
      folderEl.dataset.folderPath = sf;
      folderEl.innerHTML = '<span class="vault-icon">📁</span>' + escapeHtml(folderName);

      let childContainer = null;
      folderEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = folderEl.dataset.expanded === 'true';
        if (isExpanded) {
          folderEl.dataset.expanded = 'false';
          folderEl.querySelector('.vault-icon').textContent = '📁';
          if (childContainer) childContainer.remove();
        } else {
          folderEl.dataset.expanded = 'true';
          folderEl.querySelector('.vault-icon').textContent = '📂';
          childContainer = document.createElement('div');
          childContainer.className = 'vault-children';
          renderLevelInto(childContainer, sf, depth + 1);
          folderEl.after(childContainer);
        }
      });
      targetContainer.appendChild(folderEl);
    }
  }

  renderLevelInto(container, '', 0);
}

function getFileIcon(name) {
  if (name.endsWith('.md')) return '📝';
  if (name.endsWith('.png') || name.endsWith('.jpg')) return '🖼️';
  if (name.endsWith('.json')) return '📋';
  if (name.endsWith('.css')) return '🎨';
  if (name.endsWith('.js')) return '⚡';
  return '📄';
}

async function openVaultFile(path, name) {
  const contentEl = document.getElementById('vaultContent');
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="vault-loading">Loading...</div>';

  try {
    const res = await fetch('/api/vault/file?path=' + encodeURIComponent(path));
    const data = await res.json();
    if (!data.ok) {
      contentEl.innerHTML = '<div class="vault-empty">Error: ' + escapeHtml(data.error) + '</div>';
      return;
    }
    vaultCurrentFile = path;
    const html = renderVaultMarkdown(data.content);
    const obsidianUri = 'obsidian://open?vault=' + encodeURIComponent('Mission Control') + '&file=' + encodeURIComponent(path);
    contentEl.innerHTML = '<div class="vault-breadcrumb">' + renderBreadcrumb(path) + '<a class="vault-obsidian-link" href="' + obsidianUri + '" title="Open in Obsidian">⧄ Open in Obsidian</a></div><div class="vault-md">' + html + '</div>';
  } catch (e) {
    contentEl.innerHTML = '<div class="vault-empty">Error loading file</div>';
  }
}

function renderBreadcrumb(path) {
  const parts = path.split('/');
  let html = '<span>Vault</span>';
  for (const p of parts) {
    html += ' <span style="opacity:.4">/</span> <span>' + escapeHtml(p) + '</span>';
  }
  return html;
}

function renderVaultMarkdown(md) {
  if (!md) return '';
  let html = md;
  let frontmatter = '';

  // Extract YAML frontmatter
  if (html.startsWith('---')) {
    const end = html.indexOf('---', 3);
    if (end !== -1) {
      const yaml = html.slice(3, end).trim();
      html = html.slice(end + 3).trim();
      let fmHtml = '<div class="frontmatter">';
      for (const line of yaml.split('\n')) {
        if (line.startsWith('tags:')) {
          const items = line.match(/-\s+(.+)/g);
          if (items) {
            fmHtml += '<div>tags: ' + items.map(t => '<span class="tag">' + escapeHtml(t.replace(/-\s+/, '')) + '</span>').join('') + '</div>';
          } else {
            const inlineTags = line.match(/\[(.+)\]/);
            if (inlineTags) {
              const tags = inlineTags[1].split(',').map(t => t.trim().replace(/[\[\]'"]/g, ''));
              fmHtml += '<div>tags: ' + tags.map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('') + '</div>';
            } else {
              fmHtml += '<div>' + escapeHtml(line) + '</div>';
            }
          }
        } else {
          fmHtml += '<div>' + escapeHtml(line) + '</div>';
        }
      }
      fmHtml += '</div>';
      frontmatter = fmHtml;
    }
  }

  // Wikilinks
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="wikilink">[[$1]]</span>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>[\s\S]*?<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Paragraphs
  const lines = html.split('\n');
  let result = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { result += '\n'; continue; }
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<li') ||
        trimmed.startsWith('<pre') || trimmed.startsWith('<blockquote') || trimmed.startsWith('<hr') ||
        trimmed.startsWith('<div') || trimmed.startsWith('</')) {
      result += line + '\n';
    } else {
      result += '<p>' + line + '</p>\n';
    }
  }

  return frontmatter + result;
}

// Load vault when nav is clicked
document.querySelectorAll('.nav-item[data-view="vault"], .mobile-tab[data-view="vault"]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (vaultTreeData.length === 0) loadVaultTree();
  });

});
// ── Research Browser ──
let researchListData = [];
let clippingsListData = [];
let currentResearchTab = 'research';

async function loadResearchList() {
  const listEl = document.getElementById('researchList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="vault-loading">Loading...</div>';
  try {
    const res = await fetch('/api/vault/tree');
    const data = await res.json();
    if (!data.ok) {
      listEl.innerHTML = '<div class="vault-loading">Error loading</div>';
      return;
    }
    researchListData = data.files.filter(f => f.path.startsWith('Research/') && !f.isDir && f.path !== 'Research/Research Index.md');
    clippingsListData = data.files.filter(f => f.path.startsWith('Clippings/') && !f.isDir);
    renderActiveResearchTab();
  } catch (e) {
    listEl.innerHTML = '<div class="vault-loading">Error loading</div>';
  }
}

function renderActiveResearchTab() {
  const listEl = document.getElementById('researchList');
  if (!listEl) return;
  if (currentResearchTab === 'clippings') {
    renderResearchList(listEl, clippingsListData, 'Clippings');
  } else {
    renderResearchList(listEl, researchListData, 'Research');
  }
}

function renderResearchList(container, files, category) {
  container.innerHTML = '';
  if (files.length === 0) {
    container.innerHTML = '<div class="vault-empty">No ' + (category || 'notes') + ' yet.' + (category === 'Research' ? ' Search above to start one.' : '') + '</div>';
    return;
  }
  // Sort by name
  const sorted = [...files].sort((a, b) => {
    const nameA = a.name.endsWith('.md') ? a.name.slice(0, -3) : a.name;
    const nameB = b.name.endsWith('.md') ? b.name.slice(0, -3) : b.name;
    return nameA.localeCompare(nameB);
  });
  const catLabel = category || 'Research';
  const icon = catLabel === 'Clippings' ? '📎' : '📝';
  for (const f of sorted) {
    const displayName = f.name.endsWith('.md') ? f.name.slice(0, -3) : f.name;
    const el = document.createElement('div');
    el.className = 'research-note';
    el.innerHTML = '<span class="research-note-icon">' + icon + '</span>' +
      '<div class="research-note-info">' +
        '<div class="research-note-title">' + escapeHtml(displayName) + '</div>' +
        '<div class="research-note-meta">' + catLabel + '</div>' +
      '</div>' +
      '<span class="research-note-arrow">›</span>';
    el.addEventListener('click', () => openResearchModal(f.path, f.name));
    container.appendChild(el);
  }
}

async function openResearchModal(path, name) {
  const modal = document.getElementById('researchModal');
  const content = document.getElementById('researchModalContent');
  const breadcrumb = document.getElementById('researchModalBreadcrumb');
  const obsLink = document.getElementById('researchModalObsidian');
  if (!modal || !content) return;

  const displayName = name.endsWith('.md') ? name.slice(0, -3) : name;
  breadcrumb.innerHTML = '<span>Research</span><span class="sep">/</span><span>' + escapeHtml(displayName) + '</span>';

  content.innerHTML = '<div class="vault-loading">Loading...</div>';
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Set Obsidian link
  const obsidianUri = 'obsidian://open?vault=' + encodeURIComponent('Mission Control') + '&file=' + encodeURIComponent(path);
  if (obsLink) {
    obsLink.href = obsidianUri;
    obsLink.style.display = '';
  }

  try {
    const res = await fetch('/api/vault/file?path=' + encodeURIComponent(path));
    const data = await res.json();
    if (!data.ok) {
      content.innerHTML = '<div class="vault-empty">Error: ' + escapeHtml(data.error) + '</div>';
      return;
    }
    const html = renderVaultMarkdown(data.content);
    content.innerHTML = '<div class="vault-md">' + html + '</div>';
  } catch (e) {
    content.innerHTML = '<div class="vault-empty">Error loading file</div>';
  }
}

function closeResearchModal() {
  const modal = document.getElementById('researchModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// Research modal close handlers
const researchModalClose = document.getElementById('researchModalClose');
if (researchModalClose) {
  researchModalClose.addEventListener('click', closeResearchModal);
}
const researchModal = document.getElementById('researchModal');
if (researchModal) {
  researchModal.addEventListener('click', (e) => {
    if (e.target === researchModal) closeResearchModal();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeResearchModal();
});

// Research search + new job
const researchSearchEl = document.getElementById('researchSearch');
const researchNewBtn = document.getElementById('researchNewBtn');

if (researchSearchEl) {
  researchSearchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && researchSearchEl.value.trim()) {
      createResearchJob(researchSearchEl.value.trim());
      researchSearchEl.value = '';
    }
  });
}

if (researchNewBtn) {
  researchNewBtn.addEventListener('click', () => {
    const query = researchSearchEl ? researchSearchEl.value.trim() : '';
    if (!query) {
      if (researchSearchEl) researchSearchEl.focus();
      return;
    }
    createResearchJob(query);
    researchSearchEl.value = '';
  });
}

async function createResearchJob(topic) {
  try {
    const res = await fetch('/api/mission-control-jobs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Research: ' + topic,
        description: 'Research and synthesize findings on: ' + topic + '. Create a research note in the MC vault with YAML frontmatter, wikilinks, and category tags. Update the Research Index.',
        priority: 'medium',
        assignee: 'Alfred',
        assignedBy: 'Sam'
      })
    });
    const data = await res.json();
    if (data.ok) {
      const num = data.job?.number || '';
      showToast(num + ' created: Research ' + topic);
      loadAssetData();
    } else {
      showToast('Error: ' + (data.error || 'Failed to create job'));
    }
  } catch (e) {
    showToast('Error creating research job');
  }
}

// Load research when tab is activated
document.querySelectorAll('.nav-item[data-view="research"], .mobile-tab[data-view="research"]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (researchListData.length === 0) loadResearchList();
  });
});

// Research/Clippings tab toggle
document.querySelectorAll('.research-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.research-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentResearchTab = tab.dataset.tab;
    renderActiveResearchTab();
  });
});

});
