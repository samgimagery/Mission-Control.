console.log('[MC] Unified Workspace loading...');

// Alfred working status — polled from /api/alfred-status
let alfredWorkingStatus = { status: 'idle', task: null };

function fetchAlfredStatus() {
  fetch('/api/alfred-status', { cache: 'no-store' }).then(r => r.json()).then(data => {
    alfredWorkingStatus = { status: data.status || 'idle', task: data.task || null };
  }).catch(() => {});
}
fetchAlfredStatus();
setInterval(fetchAlfredStatus, 5000);

document.addEventListener('DOMContentLoaded', () => {
  console.log('[MC] DOM ready');

  // ── Theme (dark mode persisted, dark is default) ──
  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('mc-theme');

  // Default to dark unless explicitly set to light
  if (savedTheme !== 'light') {
    document.body.classList.add('dark');
  }

  themeToggle.addEventListener('click', () => {
    // Refresh page
    location.reload();
  });



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
    document.querySelector(`[data-view="${targetView}"]`)?.classList.add('active');
    // Update mobile tabs too
    document.querySelectorAll('.mobile-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.mobile-tab[data-view="${targetView}"]`)?.classList.add('active');

    views.forEach(view => {
      view.classList.remove('active');
      if (view.id === targetView) view.classList.add('active');
    });

    // Auto-refresh pulse data when Pulse view is active
    if (targetView === 'pulse') {
      loadPulseData();
      startPulseAutoRefresh();
    } else {
      stopPulseAutoRefresh();
    }

    // Load comms log when Logs view is activated
    if (targetView === 'logs') {
      loadJobLogs();
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
        const pulseRes = await fetch('/api/pulse-data', { cache: 'no-store' });
        const pulseData = await pulseRes.json();
        if (pulseData.ok) {
          const infoEl = document.getElementById('serverInfo');
          if (infoEl) {
            const ver = pulseData.version || '2026.4.9';
            infoEl.innerHTML = `OpenClaw ${ver}`;
          }
          updateDashboard(pulseData.agents || [], currentJobs, pulseData);
        }
      } catch (e) { /* non-critical */ }

      // Load pulse data if pulse view is active
      if (document.getElementById('pulse')?.classList.contains('active')) {
        loadPulseData();
      }

    } catch (err) {
      console.error('[MC] Failed to load data:', err);
      updateServerStatus(false);
    }
  }

  // ── Update System Status Strip ──
  function updateSystemStatus(pulseData, connected) {
    const uptimeEl = document.getElementById('statusUptime');
    const connectedEl = document.getElementById('statusConnected');
    const contextFillEl = document.getElementById('statusContextFill');
    const contextLabelEl = document.getElementById('statusContextLabel');

    if (connectedEl) {
      if (connected) {
        connectedEl.innerHTML = '<span class="status-indicator"></span>Online';
        connectedEl.className = 'status-strip-value status-connected';
      } else {
        connectedEl.innerHTML = '<span class="status-indicator offline"></span>Offline';
        connectedEl.className = 'status-strip-value status-disconnected';
      }
    }
    if (uptimeEl && pulseData) {
      uptimeEl.textContent = pulseData.uptime || '—';
    }
    if (contextFillEl && contextLabelEl && pulseData) {
      const ctxTotal = pulseData.contextWindow || 202752;
      const ctxUsed = pulseData.contextUsed || Math.round(ctxTotal * 0.1);
      const pct = Math.min(100, Math.round((ctxUsed / ctxTotal) * 100));
      contextFillEl.style.width = pct + '%';
      // Color: green <50%, yellow 50-80%, red >80%
      if (pct > 80) contextFillEl.className = 'context-bar-fill high';
      else if (pct > 50) contextFillEl.className = 'context-bar-fill medium';
      else contextFillEl.className = 'context-bar-fill';
      const formatCtx = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : n.toString();
      contextLabelEl.textContent = `${formatCtx(ctxUsed)}/${formatCtx(ctxTotal)}`;
    }
  }

  // ── Update Dashboard Top Bar ──
  function updateDashboard(pulseAgents, jobs, pulseData) {
    const agentsEl = document.getElementById('systemAgents');
    const statsEl = document.getElementById('systemDashboardTop');

    // Update system status strip
    updateSystemStatus(pulseData, true);

    // Base team definition — models updated from server data
    const teamBase = [
      { name: 'Alfred', emoji: '\u{1F6CE}\u{FE0F}', role: 'Coordinator' },
      { name: 'Claude', emoji: '\u26A1', role: 'Build' },
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

    // Determine active agents from pulse data
    const activeNames = new Set();
    (pulseAgents || []).forEach(a => {
      const n = (a.name || '').toLowerCase();
      if (n.includes('alfred') || n.includes('main')) activeNames.add('Alfred');
      // Gemma removed from team
      if (n.includes('claude') || n.includes('coder')) activeNames.add('Claude');
    });
    // Also check status field
    (pulseAgents || []).forEach(a => {
      if (a.status === 'active' && a.name) {
        team.forEach(t => { if (a.name.includes(t.name)) activeNames.add(t.name); });
      }
    });

    // Check job assignments — show specific subtask if in-progress
    const jobAssignments = {};
    const agentSubtasks = {}; // agent name -> {number, subtaskTitle}
    (jobs || []).forEach(job => {
      if (job.phase === 'working' && job.assignee) {
        const a = job.assignee;
        team.forEach(t => {
          if (a.includes(t.name)) jobAssignments[t.name] = job.title;
        });
        if (a === 'Team' || a === 'Unassigned') {
          (job.workers || []).forEach(w => {
            team.forEach(t => {
              if (w.includes(t.name)) jobAssignments[t.name] = job.title;
            });
          });
        }
        // Find in-progress subtask for this agent
        (job.subtasks || []).forEach(st => {
          if (st.status === 'in-progress') {
            const startedBy = st.startedBy || job.assignee;
            team.forEach(t => {
              if (startedBy.includes(t.name) || (job.assignee && job.assignee.includes(t.name))) {
                agentSubtasks[t.name] = { number: job.number, title: st.title, jobId: job.id };
              }
            });
          }
        });
      }
    });

    // Count per-agent stats from jobs history
    const agentStats = {};
    team.forEach(t => { agentStats[t.name] = { completed: 0, inProgress: 0, total: 0 }; });
    (jobs || []).forEach(job => {
      const assignees = job.assignee === 'Team' ? ['Alfred','Claude'] : [job.assignee];
      assignees.forEach(a => {
        team.forEach(t => {
          if (a && a.includes(t.name)) {
            agentStats[t.name].total++;
            if (job.phase === 'done' || job.phase === 'completed' || job.phase === 'archived') agentStats[t.name].completed++;
            if (job.phase === 'working' || (job.phase === 'todo' && (job.subtasks || []).some(s => s.status === 'in-progress'))) agentStats[t.name].inProgress++;
          }
        });
      });
    });

    // Render agent cards
    if (agentsEl) {
      // Don't re-render if user is typing in a field inside the agents section
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable) && agentsEl.contains(activeEl)) {
        // skip this render
      } else {
      agentsEl.innerHTML = team.map(t => {
        const isActive = activeNames.has(t.name);
        const task = jobAssignments[t.name];
        const subtask = agentSubtasks[t.name];
        const jobLabel = subtask ? `${subtask.number} ${subtask.title}` : (task ? escapeHtml(task.length > 50 ? task.substring(0, 47) + '...' : task) : null);
        const stats = agentStats[t.name];
        const effRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
        const statusDot = '';
        const isAlfred = t.name === 'Alfred';
        const alfredWorking = isAlfred && alfredWorkingStatus.status === 'working';
        const alfredTask = isAlfred && alfredWorkingStatus.task ? alfredWorkingStatus.task : null;
        const displayLabel = alfredTask || jobLabel || '';
        const isWorking = alfredWorking || stats.inProgress > 0;
        const statusBadge = isWorking
          ? '<span class="agent-status-badge working">Working</span>'
          : '<span class="agent-status-badge available">Available</span>';
        return `<div class="agent-card ${isActive ? 'active' : 'standby'} agent-card-${t.name.toLowerCase()}">
          <div class="agent-card-top">
            <div class="agent-card-header">
              <div class="agent-card-name">${t.name}${statusBadge}</div>
              <div class="agent-card-role">${t.role}</div>
            </div>
            <span class="agent-card-model">${t.model || ''}</span>
          </div>
          <div class="agent-card-now"${!displayLabel ? ' style="display:none"' : ''}>${displayLabel}</div>
          <div class="agent-card-stats">
            <span class="agent-stat"><span class="agent-stat-val">${stats.completed}</span> jobs done</span>
            <span class="agent-stat"><span class="agent-stat-val">${stats.inProgress}</span> active</span>
            <span class="agent-stat"><span class="agent-stat-val">${effRate}%</span> rate</span>
          </div>
        </div>`;
      }).join('');
      } // end else (not typing)
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

      let html = '<div class="done-header-row"><span>Date</span><span>Time</span><span>Ref</span><span>Description</span></div>';
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

      // Click row to expand/collapse thread
      logsEl.querySelectorAll('.log-entry-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.log-entry-req')) return;
          const entry = row.parentElement;
          const thread = entry.querySelector('.log-entry-thread');
          if (!thread) return;
          const isNowExpanded = thread.style.display !== 'none';
          thread.style.display = isNowExpanded ? 'none' : 'flex';
          entry.classList.toggle('expanded', !isNowExpanded);
        });
      });

      // Click REQ number to open job modal
      logsEl.querySelectorAll('.log-entry-req').forEach(reqEl => {
        reqEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const entry = reqEl.closest('.log-entry');
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
          <button class="up-next-start-btn" data-job-id="${item.jobId}" data-subtask-id="${item.subtaskId}">Start</button>
        </div>
      `;
    }).join('');

    // Bind Start buttons
    upNextList.querySelectorAll('.up-next-start-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const jobId = btn.dataset.jobId;
        const subtaskId = btn.dataset.subtaskId;
        toggleSubtask(jobId, subtaskId, 'in-progress', 'Sam');
      });
    });
  }

  // Load comms log when Logs view is active
  if (document.getElementById('logs')?.classList.contains('active')) {
    loadJobLogs();
  }

  // ── Pipeline Rendering ──
  function updatePipeline(jobs) {
    const approvalsStrip = document.getElementById('approvalsStrip');
    const todoGrid = document.getElementById('todoGrid');
    const doneRow = document.getElementById('doneRow');

    // Don't re-render if user is typing in an input field inside any container
    const activeEl = document.activeElement;
    const containers = [approvalsStrip, todoGrid, doneRow].filter(Boolean);
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
    if (doneRow) doneRow.innerHTML = '';
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
      // Glow the To Do title if there are active tasks
      const todoTitle = document.getElementById('todoTitle');
      const hasActive = filteredTodo.some(j => j.subtasks?.some(st => st.status === 'in-progress'));
      if (todoTitle) todoTitle.classList.toggle('active', hasActive);
      if (filteredTodo.length === 0) {
        todoGrid.innerHTML = '';
      } else {
        filteredTodo.forEach(job => renderJobCard(job, todoGrid, 'todo'));
      }
    }

  // ── Render Done Row ──
    if (doneRow) {
      const filteredDone = grouped.done;
      if (filteredDone.length === 0) {
        doneRow.innerHTML = '';
      } else {
        filteredDone.sort((a, b) => (b.completedAt || b.updatedAt || 0) - (a.completedAt || a.updatedAt || 0));
        // Header row
        doneRow.innerHTML = `<div class="done-header-row"><span>Date</span><span>Time</span><span>Ref</span><span>Description</span></div>`;
        filteredDone.forEach(job => renderDoneItem(job, doneRow));
        // Limit to last 10 done items
        const doneItems = doneRow.querySelectorAll('.done-item');
        doneItems.forEach((item, i) => {
          if (i >= 10) item.style.display = 'none';
        });
      }
    }

    // ── Full Production Empty State ──
    if (todoGrid && doneRow) {
      const filteredTodo = grouped.todo;
      const filteredDone2 = grouped.done;
      const filteredAwaiting = grouped.awaitingApproval;
      if (filteredTodo.length === 0 && filteredDone2.length === 0 && filteredAwaiting.length === 0) {
        // Hide sections and show a big empty state
        const sections = document.querySelectorAll('.production-section');
        sections.forEach(s => s.style.display = 'none');
        if (approvalsStrip) approvalsStrip.style.display = 'none';
        // Insert full empty state if not already there
        const prodView = document.getElementById('overview');
        let emptyEl = document.getElementById('overviewEmpty');
        if (!emptyEl) {
          emptyEl = document.createElement('div');
          emptyEl.id = 'overviewEmpty';
          emptyEl.className = 'empty-state';
          emptyEl.style.padding = '80px 24px';
          emptyEl.innerHTML = '';
          prodView?.appendChild(emptyEl);
        }
      } else {
        // Show sections, remove empty state
        const sections = document.querySelectorAll('.production-section');
        sections.forEach(s => s.style.display = '');
        const emptyEl = document.getElementById('overviewEmpty');
        if (emptyEl) emptyEl.remove();
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

    // ── Bind subtask click events (toggle status) ──
    document.querySelectorAll('.subtask-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't toggle if clicking the ... menu button
        if (e.target.closest('.st-menu-btn')) return;
        e.stopPropagation();
        const subtaskId = item.dataset.subtaskId;
        const jobId = item.dataset.jobId;
        const currentStatus = item.classList.contains('done') ? 'done' :
                             (item.classList.contains('in-progress') ? 'in-progress' :
                             (item.classList.contains('cancelled') ? 'cancelled' : 'pending'));
        // Don't toggle cancelled or done subtasks by clicking
        if (currentStatus === 'done' || currentStatus === 'cancelled') return;
        const nextStatus = currentStatus === 'pending' ? 'in-progress' : 'done';
        toggleSubtask(jobId, subtaskId, nextStatus);
      });
    });

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
    card.className = `task-card ${isDone ? 'completed' : ''} phase-${job.phase}${hasInProgress ? ' job-active' : ''}${jobStatus === 'active' && !isDone ? ' job-active-glow' : ''} job-${jobStatus}`;
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
      const penIcon = job.needsRewrite ? '<span class="rewrite-pen">✏️</span>' : '';
      cardHtml += `<div class="card-badge-row"><span class="task-number">${job.number}</span>${penIcon}${statusLabel ? `<span class="job-status-badge job-status-${jobStatus}">${statusLabel}</span>` : ''}</div>`;
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

    // Pulse — token cost on the card itself
    if (job.phase === 'working' || job.phase === 'done') {
      const worker = assignee === 'Claude Code' || assignee === 'Claude' ? 'Claude (glm-5.1:cloud)' : assignee === 'Alfred' ? 'Alfred (glm-5.1:cloud)' : assignee;
      cardHtml += `<div class="task-pulse-line">$0 · ${escapeHtml(worker)}</div>`;
    }

    // ── Worker badge — show assignee icon on any card with an assignee
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

      // Subtask checklist
      const subtasks = job.subtasks || [];
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
          const titleText = escapeHtml((st.title || st.id).length > 35 ? (st.title || st.id).substring(0, 32) + '...' : (st.title || st.id));
          // ... menu for pending subtasks
          const showMenu = (st.status === 'pending' || st.status === 'cancelled') && !isDone;
          const sweepDelay = st.status === 'in-progress' ? ` style="animation-delay:${Math.random() * 3}s"` : '';
          cardHtml += `
            <div class="subtask-item ${st.status}" data-subtask-id="${st.id}" data-job-id="${job.id}" data-st-number="${stNum}"${sweepDelay}>
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
      html += `<button class="modal-edit-btn" data-job-id="${job.id}" title="Edit this job">✏️ Edit</button>`;
      html += `<button class="modal-wake-btn" data-job-id="${job.id}" title="Wake Alfred to rewrite \u0026 start this job">↻</button>`;
    }
    html += `<h2 class="modal-title">${escapeHtml(job.title || 'Untitled Task')}</h2>`;
    html += `</div>`;

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

    // Token cost
    if (job.phase === 'working' || job.phase === 'done') {
      html += `<div class="modal-section">`;
      html += `<h3>Token Cost</h3>`;
      html += `<div class="modal-cost">$0.00 — ${assignee === 'Claude' ? 'Claude Code (glm-5.1:cloud)' : 'Alfred (glm-5.1:cloud)'} via self-hosted proxy</div>`;
      html += `</div>`;
    }

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
        const nextStatus = currentStatus === 'pending' ? 'in-progress' :
                          (currentStatus === 'in-progress' ? 'done' : 'pending');
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
    const editBtn = content.querySelector('.modal-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        enableModalEditMode(job, content);
      });
    }

    // Wake button — pokes Alfred to rewrite \u0026 start
    const wakeBtn = content.querySelector('.modal-wake-btn');
    if (wakeBtn) {
      wakeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const jobId = wakeBtn.dataset.jobId;
        wakeBtn.textContent = '✓';
        wakeBtn.style.background = '#22c55e';
        fetch('/api/alfred-status', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({status: 'working', task: `Rewriting \u0026 starting ${job.number || jobId}`})
        }).then(() => {
          setTimeout(() => { wakeBtn.textContent = '↻'; wakeBtn.style.background = ''; }, 2000);
        });
      });
    }

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

  // ── Edit Mode for unstarted jobs ──
  function enableModalEditMode(job, content) {
    const prioColors = { low: '#3b82f6', normal: '#22c55e', high: '#ef4444', critical: '#f59e0b' };
    const prioOpts = ['low', 'normal', 'high', 'critical'];
    const assigneeOpts = ['Unassigned', 'Alfred', 'Claude'];
    const currentPriority = job.priority || 'normal';
    const currentAssignee = job.assignee || 'Unassigned';
    const currentDueDate = job.dueDate || '';

    let editHtml = `<div class="modal-edit-form">`;
    editHtml += `<div class="modal-edit-row"><label>Title</label><input type="text" id="edit-title" class="edit-input" value="${escapeHtml(job.title || '')}" /></div>`;
    editHtml += `<div class="modal-edit-row"><label>Description</label><textarea id="edit-desc" class="edit-input edit-textarea">${escapeHtml(job.description || job.details || '')}</textarea></div>`;
    editHtml += `<div class="modal-edit-row"><label>Priority</label><select id="edit-priority" class="edit-input">`;
    prioOpts.forEach(p => { editHtml += `<option value="${p}" ${p === currentPriority ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`; });
    editHtml += `</select></div>`;
    editHtml += `<div class="modal-edit-row"><label>Assignee</label><select id="edit-assignee" class="edit-input">`;
    assigneeOpts.forEach(a => { editHtml += `<option value="${a}" ${a === currentAssignee ? 'selected' : ''}>${a}</option>`; });
    editHtml += `</select></div>`;
    editHtml += `<div class="modal-edit-row"><label>Due Date</label><input type="date" id="edit-due" class="edit-input" value="${currentDueDate}" /></div>`;
    editHtml += `<div class="modal-edit-actions">`;
    editHtml += `<button class="btn-primary edit-save" data-job-id="${job.id}">Save</button>`;
    editHtml += `<button class="btn-secondary edit-cancel">Cancel</button>`;
    editHtml += `</div>`;
    editHtml += `</div>`;

    content.innerHTML = editHtml;

    // Cancel = re-open modal in view mode
    content.querySelector('.edit-cancel')?.addEventListener('click', () => {
      openCardModal(job);
    });

    // Save
    content.querySelector('.edit-save')?.addEventListener('click', async () => {
      const newTitle = document.getElementById('edit-title')?.value?.trim();
      const newDesc = document.getElementById('edit-desc')?.value?.trim();
      const newPriority = document.getElementById('edit-priority')?.value;
      const newAssignee = document.getElementById('edit-assignee')?.value;
      const newDue = document.getElementById('edit-due')?.value || null;

      if (!newTitle) return;

      const patch = {
        title: newTitle,
        description: newDesc,
        priority: newPriority,
        assignee: newAssignee,
      };
      if (newDue) patch.dueDate = newDue;

      try {
        const res = await fetch(`/api/mission-control-jobs/${job.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        });
        const data = await res.json();
        if (data.ok) {
          showToast('Job updated');
          document.getElementById('cardModal').style.display = 'none';
          loadAssetData();
        } else {
          showToast('Failed to update job');
        }
      } catch(e) {
        showToast('Error saving changes');
      }
    });
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
      const cycle = { 'low': 'normal', 'normal': 'high', 'high': 'critical', 'critical': 'low' };
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

    const today = new Date().toISOString().split('T')[0];

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
            <option value="Claude">Claude ⚡</option>
          </select>
          <select id="newTaskPriority" class="inline-select" style="flex:1">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <select id="newTaskCreatedBy" class="inline-select" style="flex:1">
            <option value="Sam" selected>Created by: Sam</option>
            <option value="Alfred">Created by: Alfred</option>
            <option value="Claude">Created by: Claude</option>
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

  // ── Pulse Auto-Refresh ──
  let pulseInterval = null;

  function startPulseAutoRefresh() {
    stopPulseAutoRefresh();
    pulseInterval = setInterval(loadPulseData, 30000);
  }

  function stopPulseAutoRefresh() {
    if (pulseInterval) {
      clearInterval(pulseInterval);
      pulseInterval = null;
    }
  }

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
      const res = await fetch('/api/pulse-data');
      const data = await res.json();
      if (!data.ok) return;

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
      const sysContext = document.getElementById('sysContext');
      const sysCompactions = document.getElementById('sysCompactions');
      const sysUptime = document.getElementById('sysUptime');
      const sysVersion = document.getElementById('sysVersion');
      if (sysSessionId) sysSessionId.textContent = data.sessionId || '—';
      if (sysModel) sysModel.textContent = data.model ? data.model.replace('ollama/', '') : '—';
      if (sysTokensIn) sysTokensIn.textContent = data.inputTokens ? fmtK(data.inputTokens) : '—';
      if (sysTokensOut) sysTokensOut.textContent = data.outputTokens ? fmtK(data.outputTokens) : '—';
      if (sysContext) sysContext.textContent = `${data.percentUsed || 0}%`;
      if (sysCompactions) sysCompactions.textContent = data.compactions ?? '—';
      if (sysUptime) sysUptime.textContent = data.uptime || '—';
      if (sysVersion) sysVersion.textContent = (data.lastUpdate || '—').replace('OpenClaw ', 'v');

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
  function updateServerStatus(connected) {
    // Removed: serverStatus element no longer in footer
    // Update footer green dot
    const infoEl = document.getElementById('serverInfo');
    if (infoEl) {
      const ver = '2026.4.9';
      infoEl.innerHTML = `OpenClaw ${ver}`;
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

  // Start Work button — pokes Alfred to check board
  const startBtn = document.getElementById('startWorkBtn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      // If Alfred already working, dim briefly and skip
      if (alfredWorkingStatus.status === 'working') {
        startBtn.style.opacity = '0.4';
        setTimeout(() => { startBtn.style.opacity = '1'; }, 800);
        return;
      }
      fetch('/api/alfred-status', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({status: 'working', task: 'Checking board...'})
      }).then(() => {
        startBtn.textContent = '✓';
        startBtn.style.background = 'linear-gradient(135deg,#22c55e,#16a34a)';
        setTimeout(() => {
          startBtn.textContent = '↻';
          startBtn.style.background = 'linear-gradient(135deg,#3b82f6,#2563eb)';
        }, 2000);
      });
    });
  }

  // Mobile FAB — triggers same add flow
  const mobileFab = document.getElementById('addTaskBtnMobile');
  if (mobileFab) {
    mobileFab.addEventListener('click', () => {
      document.getElementById('addTaskBtn')?.click();
    });
  }
});