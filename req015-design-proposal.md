# REQ-015: Overview Redesign — Design Proposal

**Context:** The Overview has been stripped back to just agent cards and activity feed. The removed stats (Tasks Today/Completed/Error Rate) and System Health (Uptime/Model/Awaiting Approval) felt cluttered and redundant.

**Goal:** Make the Overview feel alive, useful, and clean — the landing view that tells Sam "what's happening right now" at a glance.

---

## Current State Analysis

**What's working:**
- Agent cards show the team clearly with emojis, roles, status
- Activity feed provides timeline visibility
- Dark/light theme support is solid

**What's missing:**
- No sense of "what's happening NOW" at the top
- Agent cards are informative but static-feeling
- No visual hierarchy — everything feels same-weight
- Activity feed can get lost below the fold

---

## Proposed Design Direction

### Core Philosophy

**"Command center, not dashboard."**

The Overview should feel like glancing at a mission control screen — immediate status, who's doing what, what's on fire, what's next. Information density without clutter.

---

## Layout: Three Zones

### Zone 1: Status Bar (New)

**Position:** Top of Overview, full width

**Purpose:** Immediate "state of the union" — the answer to "what should I know right now?"

**Content ideas:**
- **Active jobs count** — how many things are in flight
- **Awaiting approval alert** — only shows if >0, amber highlight
- **Next deadline** — next due date across all projects
- **Quick health indicator** — simple green/amber/red dot with label

**Visual approach:**
- Horizontal strip, flexbox spread
- Small text, high contrast
- Alert states use subtle background tints (amber for awaiting, red for overdue)
- No cards — this is ambient info

**CSS approach:**
```css
.status-bar {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  margin-bottom: 20px;
  border-radius: 10px;
  background: var(--card);
  border: 1px solid var(--line);
}
.status-bar.has-alert {
  border-color: #f59e0b;
  background: linear-gradient(90deg, var(--card) 0%, rgba(245,158,11,0.05) 100%);
}
```

---

### Zone 2: Agent Row (Redesigned)

**Position:** Below status bar

**Current problem:** 3-column grid feels cramped on mobile, cards have repetitive info

**New approach:** Horizontal scroll row on desktop, 2-column grid on mobile

**Card redesign:**
- **Bigger emoji** — 40px, the visual anchor
- **Simpler structure:**
  - Top row: Emoji + Name + Live pulse dot
  - Middle: Current task (or "Available")
  - Bottom: Mini progress bar (done/total for their assignments)
- **Remove:** Model name (moves to tooltip), role (moves to tooltip), separate stats row, vibe text
- **Add:** Subtle gradient border when active (animated)

**Visual hierarchy:**
```
┌─────────────────────────────┐
│ 🛎️  Alfred      ●         │  ← emoji + name + status dot
│ Building asset manager      │  ← current task
│ ████████░░  8/12            │  ← mini progress bar
└─────────────────────────────┘
```

**CSS approach:**
```css
.agent-card {
  min-width: 220px;
  padding: 16px;
  border-radius: 12px;
  background: var(--card);
  border: 1px solid var(--line);
  transition: all 0.2s ease;
}
.agent-card.active {
  border-color: transparent;
  background: linear-gradient(var(--card), var(--card)) padding-box,
              linear-gradient(135deg, #22c55e 0%, transparent 50%) border-box;
  animation: border-rotate 4s linear infinite;
}
.agent-task {
  font-size: 13px;
  color: var(--ink);
  margin: 8px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--line);
  overflow: hidden;
}
.agent-progress-fill {
  height: 100%;
  background: #22c55e;
  transition: width 0.3s ease;
}
```

---

### Zone 3: Activity Feed (Enhanced)

**Position:** Full width below agents

**Current problem:** Just a list, easy to miss important events

**New approach:** Grouped by time, visual distinction for event types

**Structure:**
- **Today** — events from today, most prominent
- **Yesterday** — collapsed by default?
- **Earlier** — just last 10 events

**Visual enhancements:**
- Event type icons (not just text)
  - 📝 Task created
  - ✅ Task completed
  - 🔄 Status change
  - 👤 Assignment
  - 💬 Message sent
- Color coding for event type (subtle)
- Avatars/emojis for who did it

**CSS approach:**
```css
.activity-feed {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.activity-group {
  margin-bottom: 16px;
}
.activity-group-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin-bottom: 8px;
  padding-left: 8px;
}
.activity-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  transition: background 0.15s;
}
.activity-entry:hover {
  background: var(--card);
}
.activity-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  background: var(--bg);
}
.activity-icon.completed {
  background: #dcfce7;
}
.activity-icon.assignment {
  background: #eff6ff;
}
```

---

## Responsive Behavior

**Desktop (1024px+):**
- Status bar: horizontal
- Agents: horizontal scroll row (shows 3, peek of more)
- Activity: full width, grouped by day

**Tablet (768px-1023px):**
- Status bar: wrap to 2 rows if needed
- Agents: 2-column grid
- Activity: full width

**Mobile (<768px):**
- Status bar: vertical stack, key metrics only
- Agents: horizontal scroll (cards 160px min-width)
- Activity: compact, single column

---

## Dark Theme Considerations

**Status bar:**
- Alert backgrounds use lower opacity (0.05 vs 0.08)
- Borders remain subtle

**Agent cards:**
- Active gradient border uses higher contrast
- Progress bar fill brightens (green-400 vs green-500)

**Activity:**
- Event icons have subtle background tints that shift in dark mode
- Hover state uses card background

---

## Animation & Motion

**Subtle, purposeful motion only:**

1. **Status dot pulse** — when agent is active
   ```css
   @keyframes pulse {
     0%, 100% { opacity: 1; }
     50% { opacity: 0.5; }
   }
   .status-dot.active {
     animation: pulse 2s ease-in-out infinite;
   }
   ```

2. **Activity entry fade-in** — on new events
   ```css
   @keyframes slide-in {
     from { opacity: 0; transform: translateX(-10px); }
     to { opacity: 1; transform: translateX(0); }
   }
   .activity-entry.new {
     animation: slide-in 0.3s ease;
   }
   ```

3. **Progress bar fill** — smooth transition on updates

---

## What NOT to Include

- **Charts/graphs** — Pulse view handles that
- **Detailed stats** — Production view handles that
- **System metrics** — Pulse view handles that
- **Settings/config** — Keep separate

---

## Implementation Priority

**Phase 1 (this proposal):**
1. Status bar component (new)
2. Agent card redesign
3. Activity feed grouping

**Phase 2 (future):**
1. Real-time WebSocket updates for activity
2. Activity filtering by type
3. Agent card expanded view on click

---

## Visual Mockup Description

```
┌─────────────────────────────────────────────────────────────┐
│ Mission Control                                    [Theme]  │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────┐   │
│ │ 4 active jobs  │  2 awaiting approval  │  Due: Apr 12 │   │ ← Status bar
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                      │
│ │ 🛎️       │ │ 🔎       │ │ ⚡       │                      │
│ │ Alfred   │ │ Gemma    │ │ Claude   │                      │
│ │ ● Active │ │ ○ Standby│ │ ● Active │                      │
│ │ Asset mgr│ │ Research │ │ Bug fix  │                      │
│ │ ████░░░░ │ │ Available│ │ ███████░ │                      │
│ └──────────┘ └──────────┘ └──────────┘                      │
│                                                             │
│ TODAY                                                       │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ 📝 Alfred created [REQ-042]                             │   │
│ │ ✅ Gemma completed REQ-038 subtask 3                    │   │
│ │ 🔄 Claude moved REQ-041 to Awaiting Approval            │   │
│ │ 👤 Sam assigned REQ-040 to Claude                      │   │
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary

The new Overview prioritizes **immediacy** over **completeness**. It's designed to answer three questions in 3 seconds:

1. **What's the current state?** (status bar)
2. **Who's doing what?** (agent cards)
3. **What just happened?** (activity feed)

Everything else lives in Production or Pulse views where it belongs.

The design uses **card-based grouping** with **clear visual hierarchy**, **subtle motion** for live status, and **responsive layouts** that work across devices.
