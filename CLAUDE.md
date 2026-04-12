# Mission Control — Project Context

## What This Is
Mission Control is Sam's command center — a local web app at `http://127.0.0.1:8787/`. It tracks jobs, agents, and system health. Sam tells Alfred what to do, Alfred creates jobs here, and the pipeline shows progress live.

## Tech Stack
- Backend: Python `http.server` in `features/asset-manager/tools/dev_server.py`
- Frontend: Vanilla JS (`app.js`), HTML (`index.html`), CSS (`styles.css`)
- Data: JSON files in `data/` (jobs.json, alfred-profile.json, snapshots/)
- No npm, no build step — pure static files served by Python

## Nav Structure (current)
- **Overview** — Dashboard: agent cards, stats, system health
- **Production** — Working view: To Do + Done pipeline, priorities, due dates, approval flow
- **Pulse** — Real system metrics from `/api/pulse-data`
- Theme toggle (🌙/☀️ icon only) in sidebar
- + floating button top-right for creating jobs

## Pipeline Flow
1. Jobs live in **To Do** while being worked on
2. Subtasks show progress (pending → in-progress → done) — clickable with cursor:pointer
3. Jobs needing Sam's approval go to **Awaiting Approval** state
4. When ALL subtasks done → job auto-moves to **Done**
5. Done jobs can be archived (X button) or discarded (Discard All)

## Job Data Model
```json
{
  "id": "job_timestamp_random",
  "number": "REQ-001",
  "title": "Short syntax summary",
  "description": "Full details",
  "phase": "todo|awaiting-approval|done|archived",
  "createdBy": "Sam|Alfred|Claude|Gemma",
  "assignee": "Alfred|Claude|Gemma|Team",
  "priority": "normal|high|critical",
  "dueDate": "ISO date or null",
  "subtasks": [{"id": "st-1", "title": "Task", "status": "pending|in-progress|done"}],
  "history": [{"ts": timestamp, "event": "created", "by": "Alfred"}],
  "startedAt": timestamp,
  "completedAt": timestamp
}
```

## Team
- **Alfred** 🛎️ — Coordinator, talks to Sam, routes work
- **Gemma** 🔎 — Research, design, visual QC review
- **Claude** ⚡ — Build, implementation. He's a team player.

## API Endpoints

### GET
- `/api/mission-control-jobs` — list all jobs
- `/api/mission-control-state` — full state (agents as team members)
- `/api/pulse-data` — system metrics (uptime, model, usage by Ollama/model, agents)
- `/api/alfred-profile` — Alfred's identity

### POST
- `/api/mission-control-jobs/create` — create new job (title, description, assignee, priority, createdBy, dueDate, subtasks)
- `/api/mission-control-jobs/{id}/transition` — change job phase
- `/api/mission-control-jobs/{id}/approve-request` — approve an awaiting-approval job
- `/api/mission-control-jobs/{id}/deny-request` — deny an awaiting-approval job (with reason)
- `/api/mission-control-jobs/{id}/archive` — archive a done job

### PATCH
- `/api/mission-control-jobs/{id}/subtasks` — update subtask statuses (auto-transition when all done)

### POST (bulk)
- `/api/mission-control-jobs/archive-all-done` — archive all done jobs

## Key Files
- `index.html` — HTML structure
- `app.js` — All frontend logic
- `styles.css` — Full styling including dark mode
- `features/asset-manager/tools/dev_server.py` — Python HTTP server with all API endpoints
- `data/jobs.json` — Job data
- `CLAUDE.md` — This file

## Design Principles
- No external dependencies — pure vanilla
- Dark/light theme with CSS variables
- Simple and clear over feature-rich
- JSON files for data (no database)
- Snapshots removed for now — consolidate layout first