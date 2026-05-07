#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import subprocess
import os
import re
import tempfile
import html as _html
from urllib.parse import unquote

ROOT = Path('/Users/samg/AI/OpenClaw')
UI_ROOT = ROOT / 'dev' / 'mission-control'
ASSET_MANAGER_ROOT = ROOT / 'dev' / 'asset-manager'
DATA_DIR = ASSET_MANAGER_ROOT / 'data'
DATA_JSON = DATA_DIR / 'assets.json'
CONFIG_JSON = DATA_DIR / 'library-config.json'

PLAN_JSON = DATA_DIR / 'plan-state.json'

def _default_plan_state():
    now_ms = int(__import__('time').time() * 1000)
    return {
        'ok': True,
        'title': 'Focus',
        'philosophy': 'Small team. Clear mission. Council for judgement. Mission Control for the distilled truth.',
        'mission': 'Build Mission Control into a simple, sturdy operating system for Sam, Alfred, and Alice: one place that makes the mission, focus, and next move obvious.',
        'currentFocus': 'Simplify Mission Control around Focus instead of a complex Plan interface.',
        'activeReq': 'REQ-111',
        'activeProject': 'Mission Control',
        'updatedAt': now_ms,
        'recentSuccesses': [
            'Plan navigation and persistence are working.',
            'Focus can sync into the vault as a readable note.',
            'Alice safe read-only exec access is now verified.'
        ],
        'recentChallenges': [
            'The Plan interface became too complex for the job it needs to do.',
            'Approval and annotation mechanics added UI friction.'
        ],
        'upcomingChallenges': [
            'Keep Council discussion rich while keeping Mission Control calm.',
            'Avoid turning Focus into another dashboard full of knobs.'
        ],
        'nextBestStep': 'Use the Council to discuss the MC plan, then keep this Focus page as the clear distilled source of truth.',
        'plan': [
            'Rename Plan to Focus.',
            'Show Mission, Current Focus, Recent Successes, Recent Challenges, Upcoming Challenges, and Next Best Step.',
            'Keep editing and judgement in Council; keep Mission Control simple and sturdy.'
        ],
        'annotations': []
    }

def load_plan_state():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PLAN_JSON.exists():
        state = _default_plan_state()
        save_plan_state(state)
        return state
    try:
        state = json.loads(PLAN_JSON.read_text(encoding='utf-8'))
        state['ok'] = True
        return state
    except Exception:
        state = _default_plan_state()
        state['warning'] = 'Recovered from invalid plan state'
        return state

def _plan_summary_markdown(state):
    def lines_for(key, label):
        items = state.get(key, []) or []
        out = [f'## {label}']
        if not items:
            out.append('- None')
        for item in items:
            if isinstance(item, str):
                text = item
            else:
                text = item.get('text') or item.get('title') or ''
            out.append(f'- {text}')
        return '\n'.join(out)
    return f"""---
title: Focus
category: Focus
status: active
updated: 2026-05-02
tags:
  - focus
  - mission-control
---

# Focus

**Active REQ:** {state.get('activeReq','—')}
**Project:** {state.get('activeProject','—')}

## Philosophy
{state.get('philosophy','')}

## Mission
{state.get('mission') or state.get('objective','')}

## Current Focus
{state.get('currentFocus','')}

{lines_for('recentSuccesses', 'Recent Successes')}

{lines_for('recentChallenges', 'Recent Challenges')}

{lines_for('upcomingChallenges', 'Upcoming Challenges')}

## Next Best Step
{state.get('nextBestStep','')}

{lines_for('plan', 'Plan')}
"""

def save_plan_state(state):
    import time as _time_plan
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    state['updatedAt'] = int(_time_plan.time() * 1000)
    state['ok'] = True
    PLAN_JSON.write_text(json.dumps(state, indent=2), encoding='utf-8')
    try:
        vault_dir = Path.home() / 'Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control'
        focus_dir = vault_dir / 'Mission Control Focus'
        focus_dir.mkdir(parents=True, exist_ok=True)
        (focus_dir / 'Current Focus.md').write_text(_plan_summary_markdown(state), encoding='utf-8')
    except Exception:
        pass
IMPORT_SCRIPT = ASSET_MANAGER_ROOT / 'tools' / 'import_assets.py'
DELETION_LOG = DATA_DIR / 'deletions.log'
DASHBOARD_ROOT = ROOT / 'dev' / 'market-dashboard'
DEV_ROOT = ROOT / 'dev'
AI_ROOT = Path('/Users/samg/AI')
SELECTED_ROOT_LINK = ASSET_MANAGER_ROOT / 'selected_root'
WORKSPACE_ROOT = Path('/Users/samg/.openclaw/workspace')
OPENCLAW_AGENTS_ROOT = Path('/Users/samg/.openclaw/agents')
OPENCLAW_WORKSPACES_ROOT = Path('/Users/samg/.openclaw/workspaces')


# Mind Vault Marp style — keep MC Present visually identical to Mind Vault decks.
DECK_STYLE = """
  html, body { background:#050505 !important; color-scheme:dark; }
  section {
    background: #0B0A09 !important;
    color: #F3ECDF !important;
    color-scheme: dark;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
    letter-spacing: -0.005em;
    padding: 72px 80px 126px !important;
    overflow: hidden !important;
    box-sizing: border-box;
    border: 1px solid #24211D !important;
    border-radius: 5px;
    box-shadow: 0 20px 64px rgba(0,0,0,.42);
  }
  section::after { color: rgba(243,236,223,.46); bottom: 42px; font-weight: 800; }
  section.lead { text-align: left; justify-content: center; }
  h1 {
    font-size: 86px;
    font-weight: 500;
    color: #F3ECDF;
    line-height: 1.02;
    letter-spacing: -.03em;
    max-width: 15ch;
  }
  h2 {
    color: #F3ECDF;
    font-size: 50px;
    font-weight: 520;
    line-height: .98;
    letter-spacing: -.025em;
    margin-bottom: .45em;
  }
  h3 { color: #E2D8C8; font-size: 31px; font-weight: 520; line-height: 1.08; letter-spacing: -.015em; }
  p, li { font-size: 23px; line-height: 1.28; color: #F3ECDF; }
  ul, ol { padding-left: 1.05em; margin-top: .35em; }
  section > *:last-child { margin-bottom: 0; }
  img, video, canvas, iframe, section > svg:not([data-marpit-svg]) {
    max-width: 100%;
    max-height: 410px;
    object-fit: contain;
  }
  strong { color: #FFF8EC; font-weight:900; }
  em { color:#E2D8C8; font-style:normal; }
  a { color: #F3ECDF; text-decoration-color: rgba(243,236,223,.42); }
  code, pre { background: rgba(255,255,255,.07); color: #FFF8EC; border-radius:4px; }
  table { border-collapse: collapse; background: #100E0C !important; color:#F3ECDF !important; box-shadow:0 0 0 1px #28241F; font-size:15px; line-height:1.16; max-height:330px; overflow:hidden; }
  th { background: #161310 !important; color:#F3ECDF !important; border-color: #28241F !important; }
  td { background: rgba(255,255,255,.025) !important; color:#F3ECDF !important; border-color: #28241F !important; }
  th, td { padding:.26em .44em; }
  tr:nth-child(even) td { background: rgba(255,255,255,.045) !important; }
  footer { color: rgba(243,236,223,.44); }
"""

MARP_DARK_SHELL_STYLE = r"""
<style id="mind-vault-marp-dark-shell">
  html, body, .bespoke-marp-parent, #\:\$p {
    background:#0D0B0A !important;
    color-scheme:dark !important;
  }
  svg[data-marpit-svg], svg.bespoke-marp-slide, foreignObject {
    background:#0D0B0A !important;
  }
  body[data-bespoke-view="overview"] {
    background:#0D0B0A !important;
  }
  body:not([data-bespoke-view="overview"]) .bespoke-marp-parent {
    padding-bottom:72px !important;
    box-sizing:border-box !important;
  }
  body[data-bespoke-view=""] .bespoke-marp-parent,
  body[data-bespoke-view="next"] .bespoke-marp-parent {
    width:100dvw !important;
    height:100dvh !important;
    inset:0 !important;
    overflow:hidden !important;
  }
  body[data-bespoke-view=""] svg.bespoke-marp-slide,
  body[data-bespoke-view="next"] svg.bespoke-marp-slide {
    width:100dvw !important;
    height:100dvh !important;
    left:50% !important;
    top:50% !important;
    transform:translate(-50%, -50%) !important;
  }
  body[data-bespoke-view=""] .bespoke-marp-parent > .bespoke-marp-osc,
  body[data-bespoke-view="next"] .bespoke-marp-parent > .bespoke-marp-osc {
    bottom:max(18px, calc(env(safe-area-inset-bottom) + 12px)) !important;
  }
  body[data-bespoke-view="overview"] .bespoke-marp-parent {
    background:#0D0B0A !important;
    gap:28px !important;
  }
  body[data-bespoke-view="overview"] .bespoke-marp-parent svg.bespoke-marp-slide {
    --bov-selected:rgba(232,228,221,.35) !important;
    --bov-focus:#1A1714 !important;
    --bov-focus-outline:rgba(232,228,221,.18) !important;
    background:#0D0B0A !important;
    background-image:none !important;
    border-radius:14px !important;
    box-shadow:0 18px 60px rgba(0,0,0,.48), 0 0 0 1px rgba(232,228,221,.10) !important;
  }
  section, section[data-theme="default"] {
    background:#0B0A09 !important;
    color:#F3ECDF !important;
    color-scheme:dark !important;
    padding:72px 80px 126px !important;
    overflow:hidden !important;
    box-sizing:border-box !important;
    border:1px solid #24211D !important;
    border-radius:5px !important;
  }
  section h1{font-size:86px !important;font-weight:1000 !important;line-height:.86 !important;letter-spacing:-.045em !important;color:#F3ECDF !important;}
  section h2{font-size:50px !important;font-weight:520 !important;line-height:.98 !important;letter-spacing:-.025em !important;color:#F3ECDF !important;}
  section h3{font-size:31px !important;font-weight:520 !important;line-height:1.08 !important;letter-spacing:-.015em !important;color:#E2D8C8 !important;}
  section p, section li{font-size:23px !important;line-height:1.28 !important;color:#F3ECDF !important;}
  section::after { bottom:42px !important; }
  .mc-marp-exit {
    position:fixed;
    top:max(12px, calc(env(safe-area-inset-top) + 10px));
    right:max(12px, calc(env(safe-area-inset-right) + 10px));
    z-index:2147483647;
    border:1px solid rgba(232,228,221,.22);
    border-radius:999px;
    background:rgba(13,11,10,.72);
    color:#F4EFE7;
    -webkit-backdrop-filter:blur(16px);
    backdrop-filter:blur(16px);
    font:600 13px/1 -apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;
    padding:11px 14px;
    box-shadow:0 12px 36px rgba(0,0,0,.34);
    touch-action:manipulation;
  }
  @media (hover:hover) and (pointer:fine) {
    .mc-marp-exit { opacity:.72; }
    .mc-marp-exit:hover { opacity:1; }
  }
</style>
"""

MARP_MOBILE_PRESENT_FIX_SCRIPT = r"""
<script id="mc-marp-mobile-present-fix">
(() => {
  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const exitFullscreen = () => {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn && isFullscreen()) {
      try { fn.call(document); return true; } catch (_) {}
    }
    return false;
  };

  let internalResize = false;
  const emitResize = () => {
    internalResize = true;
    try { window.dispatchEvent(new Event('resize')); }
    finally { setTimeout(() => { internalResize = false; }, 0); }
  };

  const refreshLayout = () => {
    const vv = window.visualViewport;
    const width = Math.round(vv?.width || window.innerWidth || document.documentElement.clientWidth || 0);
    const height = Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight || 0);
    document.documentElement.style.setProperty('--mc-marp-vw', `${width}px`);
    document.documentElement.style.setProperty('--mc-marp-vh', `${height}px`);
    window.scrollTo(0, 0);
    document.body?.offsetHeight; // force iOS Safari to recalculate before resize observers run
    emitResize();
    setTimeout(emitResize, 80);
    setTimeout(emitResize, 280);
  };

  const scheduleRefresh = () => requestAnimationFrame(() => requestAnimationFrame(refreshLayout));
  window.addEventListener('orientationchange', scheduleRefresh, { passive: true });
  window.addEventListener('resize', () => { if (!internalResize) scheduleRefresh(); }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { if (!internalResize) scheduleRefresh(); }, { passive: true });
  document.addEventListener('fullscreenchange', scheduleRefresh);
  document.addEventListener('webkitfullscreenchange', scheduleRefresh);
  window.addEventListener('load', scheduleRefresh, { once: true });

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mc-marp-exit';
  button.textContent = 'Done';
  button.setAttribute('aria-label', 'Exit presentation');
  button.addEventListener('click', () => {
    if (exitFullscreen()) return;
    try { window.close(); } catch (_) {}
    setTimeout(() => {
      if (history.length > 1) history.back();
      else location.href = '/';
    }, 120);
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(button);
    scheduleRefresh();
  });
})();
</script>
"""


def _note_title_from_markdown(path, markdown):
    fm = re.match(r"^---\s*\n([\s\S]*?)\n---", markdown or "")
    if fm:
        title = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', fm.group(1), flags=re.M)
        if title:
            return title.group(1).strip()
    h1 = re.search(r'^#\s+(.+)$', markdown or "", flags=re.M)
    if h1:
        return h1.group(1).strip()
    return Path(path).stem


def _plain_wikilinks(markdown):
    def repl(match):
        inner = match.group(1)
        return inner.split('|', 1)[1] if '|' in inner else inner.split('#', 1)[0]
    return re.sub(r'\[\[([^\]]+)\]\]', repl, markdown or "")


def _chunk_slide_lines(lines, max_lines=7, max_chars=680):
    chunks, cur, cur_chars = [], [], 0
    for line in lines:
        projected_lines = len(cur) + 1
        projected_chars = cur_chars + len(line) + 1
        if cur and (projected_lines > max_lines or projected_chars > max_chars):
            chunks.append(cur)
            cur, cur_chars = [], 0
        cur.append(line)
        cur_chars += len(line) + 1
    if cur:
        chunks.append(cur)
    return chunks


def _deck_markdown(title, markdown):
    """Convert a full vault note into a Mind Vault-styled Marp deck."""
    body = re.sub(r"^---[\s\S]*?---", "", markdown or "", count=1).strip()
    body = _plain_wikilinks(body)
    body = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", body)
    body = re.sub(r"^#\s+.+\n+", "", body, count=1).strip()

    slides = [f"<!-- _class: lead -->\n# {title}\n\nA visual reading from Mind Vault", "---"]
    if not body:
        slides.append("## Empty note\n\nNo content found.")
    else:
        sections = re.split(r"\n(?=##?\s+)", body)
        for sec in sections:
            sec = sec.strip()
            if not sec:
                continue
            lines = sec.splitlines()
            heading = lines[0] if lines and re.match(r"^#{1,3}\s+", lines[0]) else "## Notes"
            content = lines[1:] if lines and heading != "## Notes" else lines
            if heading.startswith("###"):
                heading = "##" + heading.lstrip('#')
            elif heading.startswith("# "):
                heading = "## " + heading[2:]

            chunks = _chunk_slide_lines(content)
            if not chunks:
                slides.extend([heading, "---"])
                continue
            for idx, chunk in enumerate(chunks):
                slide_heading = heading if idx == 0 else f"{heading} — continued"
                slides.extend([slide_heading + "\n\n" + "\n".join(chunk).strip(), "---"])

    return (
        "---\nmarp: true\ntheme: default\npaginate: true\nsize: 16:9\nstyle: |"
        + DECK_STYLE
        + "\n---\n\n"
        + "\n\n".join(slides).rstrip("-\n")
    )

def _reader_markdown_to_html(markdown):
    """Small, dependency-free markdown renderer for fast research reading."""
    body = re.sub(r"^---[\s\S]*?---", "", markdown or "", count=1).strip()
    body = _plain_wikilinks(body)
    body = re.sub(r"^#\s+.+\n+", "", body, count=1).strip()

    def inline(text):
        text = _html.escape(text or "")
        text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
        text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"__([^_]+)__", r"<strong>\1</strong>", text)
        text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
        text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
        return text

    blocks = []
    lines = body.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('```'):
            lang = line.strip('`').strip()
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i]); i += 1
            i += 1
            blocks.append(f'<pre><code data-lang="{_html.escape(lang)}">{_html.escape(chr(10).join(code))}</code></pre>')
            continue
        if re.match(r"^#{1,4}\s+", line):
            level = min(len(line) - len(line.lstrip('#')), 3)
            blocks.append(f'<h{level}>{inline(line.lstrip("#").strip())}</h{level}>')
            i += 1
            continue
        if line.lstrip().startswith('>'):
            quote = []
            while i < len(lines) and lines[i].lstrip().startswith('>'):
                quote.append(lines[i].lstrip()[1:].strip()); i += 1
            blocks.append('<blockquote>' + '<br>'.join(inline(q) for q in quote) + '</blockquote>')
            continue
        if '|' in line and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-{3,}:?", lines[i + 1]):
            table = []
            while i < len(lines) and '|' in lines[i] and lines[i].strip():
                table.append(lines[i].strip()); i += 1
            rows = []
            for idx, row in enumerate(table):
                if idx == 1 and re.match(r"^\s*\|?[\s|:\-]+\|?\s*$", row):
                    continue
                cells = [c.strip() for c in row.strip('|').split('|')]
                tag = 'th' if idx == 0 else 'td'
                rows.append('<tr>' + ''.join(f'<{tag}>{inline(c)}</{tag}>' for c in cells) + '</tr>')
            blocks.append('<div class="reader-table-wrap"><table>' + ''.join(rows) + '</table></div>')
            continue
        if re.match(r"^\s*[-*+]\s+", line) or re.match(r"^\s*\d+\.\s+", line):
            ordered = bool(re.match(r"^\s*\d+\.\s+", line))
            tag = 'ol' if ordered else 'ul'
            pattern = r"^\s*\d+\.\s+" if ordered else r"^\s*[-*+]\s+"
            items = []
            while i < len(lines) and re.match(pattern, lines[i]):
                items.append(re.sub(pattern, '', lines[i]).strip()); i += 1
            blocks.append(f'<{tag}>' + ''.join(f'<li>{inline(item)}</li>' for item in items) + f'</{tag}>')
            continue
        para = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^#{1,4}\s+", lines[i]) and not lines[i].startswith('```') and not re.match(r"^\s*[-*+]\s+", lines[i]) and not re.match(r"^\s*\d+\.\s+", lines[i]):
            if '|' in lines[i] and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-{3,}:?", lines[i + 1]):
                break
            para.append(lines[i].strip()); i += 1
        blocks.append('<p>' + inline(' '.join(para)) + '</p>')
    return '\n'.join(blocks)


def _reader_html(note_path, title, markdown):
    content = _reader_markdown_to_html(markdown)
    safe_title = _html.escape(title)
    safe_path = _html.escape(note_path)
    safe_obs_path = _html.escape(note_path, quote=True)
    note_label = "Reference note" if str(note_path).startswith("Reference/") else "Research note"
    safe_label = _html.escape(note_label)
    css = r"""
:root{color-scheme:dark;--font-heading:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif;--font-body:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter',system-ui,sans-serif;--bg:#050505;--bg-radial:radial-gradient(circle at 50% 0%,#171513 0%,#080807 42%,#020202 100%);--paper:#0b0a09;--paper-edge:#24211d;--text:#f3ecdf;--text-secondary:#e2d8c8;--muted:#a79d8f;--soft:#d6cabb;--glass-bg:rgba(12,11,10,.78);--glass-border:rgba(255,255,255,.16);--glass-shadow:0 20px 64px rgba(0,0,0,.42);--divider:#28241f;--table-head:#161310;--table-row:rgba(255,255,255,.035);--code-bg:rgba(255,255,255,.07);--progress:#f3ecdf}[data-theme=light]{color-scheme:light;--bg:#050505;--bg-radial:radial-gradient(circle at 50% 0%,#171513 0%,#080807 42%,#020202 100%);--paper:#fbfaf6;--paper-edge:#e2ddd2;--text:#11100f;--text-secondary:#292622;--muted:#6d665d;--soft:#2f2b27;--glass-bg:rgba(255,255,255,.88);--glass-border:rgba(255,255,255,.28);--glass-shadow:0 22px 76px rgba(0,0,0,.34);--divider:#ddd6ca;--table-head:#ebe6dc;--table-row:rgba(0,0,0,.026);--code-bg:rgba(0,0,0,.05);--progress:#fbfaf6}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-height:100vh;background:var(--bg-radial);background-color:#050505;color:var(--text);font:17px/1.68 var(--font-body);transition:color .35s ease}.reader-progress{position:fixed;top:0;left:0;height:2px;width:0;z-index:10;background:linear-gradient(90deg,var(--progress),#b9b1a4);box-shadow:0 0 18px rgba(243,240,232,.25)}.reader-shell{width:min(980px,calc(100vw - 32px));margin:0 auto;padding:calc(env(safe-area-inset-top) + 24px) 0 78px}.reader-top{position:sticky;top:calc(env(safe-area-inset-top) + 10px);z-index:6;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:34px;color:#d9d2c7;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.reader-actions{display:flex;gap:10px;align-items:center}.reader-pill{appearance:none;color:#f5f1ea;text-decoration:none;border:1px solid var(--glass-border);border-radius:6px;padding:9px 13px;background:rgba(20,18,16,.72);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);box-shadow:0 8px 28px rgba(0,0,0,.18);font:800 11px/1 var(--font-body);letter-spacing:.1em;text-transform:uppercase;cursor:pointer}.reader-pill:hover{border-color:rgba(255,255,255,.36)}.theme-toggle{width:38px;height:34px;display:grid;place-items:center;font-size:15px}.theme-toggle .sun{display:none}[data-theme=light] .theme-toggle .moon{display:none}[data-theme=light] .theme-toggle .sun{display:inline}article{position:relative;background:var(--paper);border:1px solid var(--paper-edge);border-radius:5px;padding:clamp(34px,5vw,72px);box-shadow:var(--glass-shadow);overflow:hidden}header{position:relative;margin-bottom:38px;padding-bottom:24px;border-bottom:1px solid var(--divider)}.eyebrow{color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;margin-bottom:16px}.kicker{margin-top:18px;color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.015em;word-break:break-word}h1{font-family:var(--font-heading);font-weight:500;font-style:normal;font-size:clamp(48px,9vw,104px);line-height:1.02;letter-spacing:-.03em;margin:0;color:var(--text);max-width:15ch}h1 em{font-style:normal;color:var(--text)}.reader-content{position:relative;max-width:790px}.reader-content>p:first-of-type{font-size:clamp(18px,2.3vw,23px);line-height:1.48;color:var(--text-secondary);font-weight:650}h2{margin:2em 0 .62em;font-family:var(--font-heading);font-weight:520;font-style:normal;font-size:clamp(34px,5.4vw,58px);line-height:.98;letter-spacing:-.025em;color:var(--text)}h3{margin:1.55em 0 .45em;font:520 clamp(25px,3.2vw,34px)/1.08 var(--font-body);letter-spacing:-.015em;color:var(--text-secondary)}p{margin:0 0 1.05em}a{color:var(--text);text-decoration-color:color-mix(in srgb,var(--text) 32%,transparent);text-underline-offset:3px}strong{color:var(--text);font-weight:900}em{color:var(--text-secondary);font-style:normal}code{font:.9em 'SF Mono',ui-monospace,monospace;background:var(--code-bg);border:1px solid var(--divider);padding:.13em .36em;border-radius:3px}pre{overflow:auto;background:color-mix(in srgb,var(--paper) 88%,var(--text) 8%);border:1px solid var(--divider);border-radius:4px;padding:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}pre code{background:transparent;border:0;padding:0}ul,ol{padding-left:1.18em;margin:0 0 1.22em}li{margin:.34em 0;padding-left:.08em}li::marker{color:var(--muted)}blockquote{margin:1.45em 0;padding:18px 22px;border-left:3px solid var(--soft);background:color-mix(in srgb,var(--text) 6%,transparent);border-radius:0 4px 4px 0;color:var(--text-secondary);font-weight:650;font-size:1.03em}.reader-table-wrap{width:100%;overflow:auto;margin:1.2em 0 1.65em;border:1px solid var(--divider);border-radius:4px;background:color-mix(in srgb,var(--paper) 92%,var(--text) 5%)}table{width:100%;border-collapse:collapse;min-width:620px;font-size:14px;line-height:1.35}th,td{padding:11px 13px;border-bottom:1px solid var(--divider);vertical-align:top}th{position:sticky;top:0;background:var(--table-head);color:var(--text);text-align:left;font-weight:900}tr:nth-child(even) td{background:var(--table-row)}@media(max-width:640px){.reader-shell{width:min(100vw - 18px,980px);padding-top:calc(env(safe-area-inset-top) + 12px)}.reader-top{top:calc(env(safe-area-inset-top) + 6px);margin-bottom:18px;letter-spacing:.07em}.reader-actions{gap:6px}.reader-pill{padding:9px 10px}.theme-toggle{width:35px}article{border-radius:4px;padding:27px 20px 44px}body{font-size:16px}h1{font-size:clamp(45px,15vw,78px)}table{font-size:13px}}
"""
    script = r"""
const root=document.documentElement;
const saved=localStorage.getItem('mc-reader-theme');
if(saved) root.dataset.theme=saved;
const bar=document.getElementById('readerProgress');
const tick=()=>{const max=document.documentElement.scrollHeight-innerHeight;bar.style.width=(max>0?(scrollY/max)*100:0)+'%'};
addEventListener('scroll',tick,{passive:true});addEventListener('resize',tick,{passive:true});tick();
document.getElementById('themeToggle')?.addEventListener('click',()=>{const next=root.dataset.theme==='light'?'dark':'light';root.dataset.theme=next;localStorage.setItem('mc-reader-theme',next)});
document.getElementById('doneBtn')?.addEventListener('click',(e)=>{e.preventDefault();try{window.close()}catch(_){};setTimeout(()=>{if(history.length>1)history.back();else location.href=(location.pathname.startsWith('/mc/')?'/mc/':'/')},120)});
"""
    return f"""<!doctype html><html lang=\"en\" data-theme=\"dark\"><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\" /><link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"><link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin><link href=\"https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&display=swap\" rel=\"stylesheet\"><title>{safe_title}</title><style>{css}</style></head><body><div class=\"reader-progress\" id=\"readerProgress\"></div><main class=\"reader-shell\"><nav class=\"reader-top\"><div>Mission Control / Read</div><div class=\"reader-actions\"><button class=\"reader-pill theme-toggle\" id=\"themeToggle\" title=\"Toggle light/dark\"><span class=\"moon\">☾</span><span class=\"sun\">☀</span></button><a class=\"reader-pill\" href=\"obsidian://open?vault=Mission%20Control&file={safe_obs_path}\">Obsidian</a><a class=\"reader-pill\" id=\"doneBtn\" href=\"/\">Done</a></div></nav><article><header><div class=\"eyebrow\">{safe_label}</div><h1>{safe_title}</h1><div class=\"kicker\">{safe_path}</div></header><section class=\"reader-content\">{content}</section></article></main><script>{script}</script></body></html>"""

# Pulse data cache — avoid rebuilding every 5s
_pulse_cache = None
_pulse_cache_ts = 0

# OpenClaw status cache — background refresh every 60s
_oc_status_cache = None
_oc_status_cache_lock = None  # threading.Lock, created at startup

import threading as _threading

def _refresh_oc_status():
    """Background daemon: refresh openclaw status every 60s, then reconcile vault."""
    global _oc_status_cache
    while True:
        try:
            result = subprocess.run(
                ['openclaw', 'status', '--json'],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                _oc_status_cache = json.loads(result.stdout)
                import sys; print(f'[oc-status] Refreshed ({len(result.stdout)} bytes)', file=sys.stderr)
        except Exception as e:
            import sys; print(f'[oc-status] Refresh failed: {e}', file=sys.stderr)
        # Reconcile vault: ensure every job has a REQ note
        try:
            _reconcile_vault()
        except Exception as e:
            import sys; print(f'[vault-reconcile] Error: {e}', file=sys.stderr)
        import time; time.sleep(60)


def _reconcile_vault():
    """Check every job has a vault REQ note. Create missing ones. Best-effort."""
    jobs = load_mission_control_jobs()
    vault_req_dir = Path.home() / "Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control/REQ"
    vault_req_dir.mkdir(parents=True, exist_ok=True)
    existing = {f.stem for f in vault_req_dir.iterdir() if f.suffix == '.md' and f.stem.startswith('REQ-')}
    missing = 0
    for j in jobs:
        req = j.get('number', '')
        if not req or not req.startswith('REQ-'):
            continue
        if req not in existing:
            sync_to_vault('create', j)
            missing += 1
    if missing:
        import sys; print(f'[vault-reconcile] Created {missing} missing REQ notes', file=sys.stderr)
    # Boot file sync: ensure workspace boot files match vault -Boot mirrors
    try:
        vault_ref = Path.home() / "Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control/Reference"
        ws = Path.home() / ".openclaw/workspace"
        boot_map = {
            'AGENTS.md': 'AGENTS-Boot.md',
            'SOUL.md': 'SOUL-Boot.md',
            'IDENTITY.md': 'IDENTITY-Boot.md',
            'USER.md': 'USER-Boot.md',
            'MEMORY.md': 'MEMORY-Boot.md',
            'TOOLS.md': 'TOOLS-Boot.md',
        }
        synced = 0
        for ws_name, vault_name in boot_map.items():
            ws_file = ws / ws_name
            vault_file = vault_ref / vault_name
            if not ws_file.exists():
                continue
            ws_content = ws_file.read_text(encoding='utf-8')
            if vault_file.exists():
                vault_content = vault_file.read_text(encoding='utf-8')
                if ws_content != vault_content:
                    vault_file.write_text(ws_content, encoding='utf-8')
                    synced += 1
            else:
                vault_file.write_text(ws_content, encoding='utf-8')
                synced += 1
        if synced:
            import sys; print(f'[vault-reconcile] Synced {synced} boot files', file=sys.stderr)
    except Exception as e:
        import sys; print(f'[vault-reconcile] Boot sync failed: {e}', file=sys.stderr)


def get_oc_status():
    """Get cached openclaw status data (instant, never blocks)."""
    return _oc_status_cache
MISSION_CONTROL_JOBS_JSON = UI_ROOT / 'data' / 'jobs.json'
MISSION_CONTROL_PROJECTS_JSON = UI_ROOT / 'data' / 'projects.json'
MISSION_CONTROL_SNAPSHOTS_DIR = UI_ROOT / 'data' / 'snapshots'


def load_config():
    if not CONFIG_JSON.exists():
        return {}
    try:
        data = json.loads(CONFIG_JSON.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_config(cfg):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_JSON.write_text(json.dumps(cfg, indent=2), encoding='utf-8')


def load_mission_control_jobs():
    if not MISSION_CONTROL_JOBS_JSON.exists():
        return []
    try:
        data = json.loads(MISSION_CONTROL_JOBS_JSON.read_text(encoding='utf-8'))
        if not isinstance(data, list):
            return []
        # Normalize legacy phase names and timestamps
        for j in data:
            if j.get('phase') == 'review':
                j['phase'] = 'qc'
            if j.get('phase') == 'completed':
                j['phase'] = 'done'
            if j.get('status') == 'review':
                j['status'] = 'qc'
            if j.get('status') == 'completed':
                j['status'] = 'done'
            # Ensure subtasks array exists
            if 'subtasks' not in j:
                j['subtasks'] = []
            if 'history' not in j:
                j['history'] = []
            # Normalize completedAt to int (epoch ms)
            for ts_field in ('completedAt', 'startedAt', 'createdAt'):
                val = j.get(ts_field)
                if val is not None and isinstance(val, str):
                    try:
                        from datetime import datetime, timezone
                        dt = datetime.fromisoformat(val.replace('Z', '+00:00'))
                        j[ts_field] = int(dt.timestamp() * 1000)
                    except Exception:
                        j[ts_field] = 0
            # Normalize subtask timestamps too
            for st in j.get('subtasks', []):
                for ts_field in ('completedAt', 'startedAt'):
                    val = st.get(ts_field)
                    if val is not None and isinstance(val, str):
                        try:
                            from datetime import datetime, timezone
                            dt = datetime.fromisoformat(val.replace('Z', '+00:00'))
                            st[ts_field] = int(dt.timestamp() * 1000)
                        except Exception:
                            st[ts_field] = 0
        return data
    except Exception:
        return []


def save_mission_control_jobs(jobs):
    MISSION_CONTROL_JOBS_JSON.parent.mkdir(parents=True, exist_ok=True)
    MISSION_CONTROL_JOBS_JSON.write_text(json.dumps(jobs, indent=2), encoding='utf-8')


def load_mission_control_projects():
    if not MISSION_CONTROL_PROJECTS_JSON.exists():
        return []
    try:
        data = json.loads(MISSION_CONTROL_PROJECTS_JSON.read_text(encoding='utf-8'))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_mission_control_projects(projects):
    MISSION_CONTROL_PROJECTS_JSON.parent.mkdir(parents=True, exist_ok=True)
    MISSION_CONTROL_PROJECTS_JSON.write_text(json.dumps(projects, indent=2), encoding='utf-8')


def find_job_by_id(job_id):
    jobs = load_mission_control_jobs()
    for j in jobs:
        if j.get('id') == job_id:
            return j, jobs
    return None, jobs


def transition_job_phase(job_id, new_phase, event_prefix='transitioned', by='Alfred'):
    job, jobs = find_job_by_id(job_id)
    if not job:
        return None, 'Job not found'
    old_phase = job.get('phase', 'todo')
    if old_phase == new_phase:
        return job, None
    job['phase'] = new_phase
    job['status'] = new_phase
    import time
    now_ms = int(time.time() * 1000)
    job['updatedAt'] = now_ms
    if 'history' not in job:
        job['history'] = []
    # Set startedAt when moving to working
    if new_phase == 'working' and 'startedAt' not in job:
        job['startedAt'] = now_ms
    # Clear needsRewrite when job moves to working (rewrite is done)
    if new_phase == 'working' and job.get('needsRewrite'):
        job['needsRewrite'] = False
    # Set completedAt when moving to done
    if new_phase == 'done':
        job['completedAt'] = now_ms
        # Auto-complete all subtasks
        for st in job.get('subtasks', []):
            if st.get('status') != 'done':
                st['status'] = 'done'
                st['completedAt'] = st.get('completedAt') or now_ms
    event_record = {
        'ts': now_ms,
        'event': f'{event_prefix}_to_{new_phase}',
        'by': by,
    }
    job['history'].append(event_record)
    save_mission_control_jobs(jobs)
    # Sync to Obsidian vault
    sync_to_vault('transition', job)
    # If transitioning to done, check if board is empty — disable cron if so
    if new_phase == 'done':
        active_jobs = [j for j in jobs if j.get('phase') in ('todo', 'working')]
        if not active_jobs:
            try:
                subprocess.Popen(
                    ['openclaw', 'cron', 'disable', 'wake-alfred'],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            except Exception:
                pass
    return job, None


def sync_to_vault(action, job):
    """Push job state to Obsidian vault. Best-effort, never blocks.
    Uses direct filesystem writes for REQ notes (CLI can target wrong vault).
    Uses CLI for daily log appends (CLI handles file creation)."""
    import datetime as _dt
    vault = "Mission Control"
    req = job.get("number", "REQ-???")
    if not req or not req.startswith("REQ-") or req == "REQ-???":
        return  # Skip jobs without proper REQ numbers
    title = job.get("title", "")
    assignee = job.get("assignee", "Unassigned")
    priority = job.get("priority", "normal")
    phase = job.get("phase", "todo")
    desc = job.get("description", "")
    subtasks = job.get("subtasks", [])
    created_at = job.get("createdAt")
    completed_at = job.get("completedAt")
    tz = _dt.timezone(_dt.timedelta(hours=10))
    today = _dt.datetime.now(tz=tz).strftime("%Y-%m-%d")
    created_date = _dt.datetime.fromtimestamp(created_at/1000, tz=tz).strftime("%Y-%m-%d") if created_at else today
    try:
        # Build full note content
        st_lines = ""
        for st in subtasks:
            icon = {"done": "✓", "in-progress": "●", "pending": "○", "cancelled": "✗"}.get(st.get("status", "pending"), "○")
            st_lines += f"\n- {icon} {st.get('title', st.get('id', ''))}"
        # Determine category from priority/phase/assignee for Dataview
        category = "feature"  # default
        title_lower = title.lower()
        if any(w in title_lower for w in ["fix", "bug", "crash", "broken", "error", "typeerror", "render", "crash"]):
            category = "bug"
        elif any(w in title_lower for w in ["clean", "remove", "delete", "dead code", "repo"]):
            category = "cleanup"
        elif any(w in title_lower for w in ["pulse", "metric", "token", "system health"]):
            category = "pulse"
        elif any(w in title_lower for w in ["theme", "dark mode", "light mode", "colour", "color"]):
            category = "theme"
        elif any(w in title_lower for w in ["mobile", "animation", "layout", "card", "modal", "sidebar", "nav", "fab", "ui"]):
            category = "ui"
        elif any(w in title_lower for w in ["obsidian", "vault", "wiki", "clipping", "yaml", "wikilink"]):
            category = "obsidian"
        elif any(w in title_lower for w in ["api", "context weight", "optimization", "performance"]):
            category = "performance"
        elif any(w in title_lower for w in ["build", "create", "add", "implement", "new"]):
            category = "feature"
        elif any(w in title_lower for w in ["test", "setup", "reset", "restructure", "verify"]):
            category = "setup"
        elif any(w in title_lower for w in ["milestone", "complete", "launch"]):
            category = "milestone"

        note = (
            f"---\ncreated: {created_date}\ntags:\n  - req\nassignee: {assignee}\npriority: {priority}\ncategory: {category}\nphase: {phase}\n---\n\n"
            f"# {req}: {title}\n\n**Assignee:** {assignee}\n**Status:** {phase}\n\n{desc}"
        )
        if st_lines:
            note += f"\n## Subtasks{st_lines}\n"
        if phase == "done" and completed_at:
            comp_date = _dt.datetime.fromtimestamp(completed_at/1000, tz=tz).strftime("%Y-%m-%d")
            note += f"\n## Completed\nCompleted on {comp_date}."
        # Direct filesystem write — avoids CLI writing to wrong vault
        vault_req_dir = Path.home() / "Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control/REQ"
        vault_req_dir.mkdir(parents=True, exist_ok=True)
        (vault_req_dir / f"{req}.md").write_text(note, encoding="utf-8")
        # Daily log entry via CLI (append is safe — creates file if needed)
        if action == "create":
            subprocess.run(["obsidian", "append", f"path=Daily/{today}.md", f"content=- **{req}** created — {title}", f"vault={vault}"],
                           capture_output=True, timeout=10)
        elif phase == "done":
            subprocess.run(["obsidian", "append", f"path=Daily/{today}.md", f"content=- **{req}** ✅ {title}", f"vault={vault}"],
                           capture_output=True, timeout=10)
        else:
            subprocess.run(["obsidian", "append", f"path=Daily/{today}.md", f"content=- **{req}** → {phase}", f"vault={vault}"],
                           capture_output=True, timeout=10)
    except Exception:
        pass  # Vault sync is best-effort


def save_snapshot(job_id, image_data_b64):
    """Save a base64 PNG snapshot and update the job record."""
    MISSION_CONTROL_SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    # Strip data URL prefix if present
    if ',' in image_data_b64:
        image_data_b64 = image_data_b64.split(',', 1)[1]

    import base64
    import time
    timestamp = int(time.time() * 1000)
    filename = f'{job_id}_{timestamp}.png'
    filepath = MISSION_CONTROL_SNAPSHOTS_DIR / filename

    try:
        png_bytes = base64.b64decode(image_data_b64)
        filepath.write_bytes(png_bytes)
    except Exception as e:
        return None, f'Failed to decode/save image: {e}'

    snapshot_url = f'/data/snapshots/{filename}'

    # Update the job record
    job, jobs = find_job_by_id(job_id)
    if not job:
        # Clean up orphaned file
        filepath.unlink(missing_ok=True)
        return None, 'Job not found'

    job['snapshotUrl'] = snapshot_url
    job['snapshotFile'] = str(filepath)
    if 'history' not in job:
        job['history'] = []
    now_ms = int(time.time() * 1000)
    job['history'].append({
        'ts': now_ms,
        'event': 'snapshot_captured',
        'url': snapshot_url,
    })
    job['updatedAt'] = now_ms
    save_mission_control_jobs(jobs)
    return job, None


def sync_selected_root_link():
    cfg = load_config()
    raw = str(cfg.get('import_root') or '').strip()
    if SELECTED_ROOT_LINK.exists() or SELECTED_ROOT_LINK.is_symlink():
        SELECTED_ROOT_LINK.unlink()
    if not raw:
        return None
    target = Path(raw).expanduser().resolve()
    if not target.exists() or not target.is_dir():
        return None
    SELECTED_ROOT_LINK.symlink_to(target, target_is_directory=True)
    return target


def choose_folder_mac():
    script = 'POSIX path of (choose folder with prompt "Choose a folder to import into the asset library")'
    proc = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
    if proc.returncode != 0:
        stderr = (proc.stderr or '').strip()
        if 'User canceled' in stderr or '(-128)' in stderr:
            raise RuntimeError('Folder selection cancelled')
        raise RuntimeError(stderr or 'Folder selection failed')
    folder = (proc.stdout or '').strip()
    if not folder:
        raise RuntimeError('No folder selected')
    return str(Path(folder).expanduser().resolve())


def _safe_read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def _recent_dev_files(limit=24):
    files = []
    try:
        for fp in DEV_ROOT.rglob('*'):
            if not fp.is_file():
                continue
            parts = fp.parts
            if '.git' in parts or 'node_modules' in parts:
                continue
            try:
                st = fp.stat()
            except Exception:
                continue
            files.append({
                'path': str(fp.relative_to(DEV_ROOT)),
                'mtime': int(st.st_mtime),
                'size': st.st_size,
            })
    except Exception:
        return []
    files.sort(key=lambda x: x['mtime'], reverse=True)
    return files[:limit]


def _load_openclaw_sessions():
    """Load session data from openclaw status --json (fast, non-blocking)."""
    try:
        proc = subprocess.run(
            ['openclaw', 'status', '--json'],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return []
        data = json.loads(proc.stdout)
        # Extract recent sessions from status output
        recent = data.get('sessions', {}).get('recent', [])
        if isinstance(recent, list):
            return recent
        return []
    except Exception:
        return []


def _get_openclaw_status():
    """Call openclaw status --json and return parsed data."""
    try:
        proc = subprocess.run(
            ['openclaw', 'status', '--json'],
            capture_output=True, text=True, timeout=2
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return {}
        return json.loads(proc.stdout)
    except Exception:
        return {}


def _list_openclaw_agent_ids():
    ids = set()
    try:
        if OPENCLAW_AGENTS_ROOT.exists():
            for child in OPENCLAW_AGENTS_ROOT.iterdir():
                if child.is_dir():
                    ids.add(child.name)
    except Exception:
        pass
    return sorted(ids)


def _parse_identity_md(path: Path):
    out = {}
    try:
        for line in path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line.startswith('- **') and ':**' in line:
                left, right = line.split(':**', 1)
                key = left.replace('- **', '').replace('**', '').strip().lower()
                out[key] = right.strip().lstrip('-').strip()
    except Exception:
        pass
    return out


def _read_text(path: Path, fallback=''):
    try:
        return path.read_text(encoding='utf-8')
    except Exception:
        return fallback


def _load_openclaw_commands():
    try:
        import re
        proc = subprocess.run(['openclaw', '--help'], capture_output=True, text=True, timeout=8, check=True)
        commands = []
        in_commands = False
        for raw in (proc.stdout or '').splitlines():
            line = raw.rstrip('\n')
            if line.strip().startswith('Commands:'):
                in_commands = True
                continue
            if in_commands:
                if line.strip().startswith('Examples:'):
                    break
                m = re.match(r'^\s{2}([a-z][a-z0-9-]*)\s{2,}', line)
                if not m:
                    continue
                cmd = m.group(1)
                if cmd not in commands:
                    commands.append(cmd)
        return commands[:24]
    except Exception:
        return []



def _load_ready_skills(limit=20):
    try:
        proc = subprocess.run(['openclaw', 'skills'], capture_output=True, text=True, timeout=10, check=True)
        skills = []
        for line in (proc.stdout or '').splitlines():
            if '│ ✓ ready' in line:
                parts = [p.strip() for p in line.split('│')]
                if len(parts) > 2:
                    name = parts[2]
                    if name:
                        # strip leading emoji
                        cleaned = name.split(' ', 1)[1] if ' ' in name else name
                        skills.append(cleaned)
        return skills[:limit]
    except Exception:
        return []


def _load_agent_profile(agent_id: str, sessions: list, skills: list, commands: list):
    agent_root = OPENCLAW_AGENTS_ROOT / agent_id / 'agent'

    workspace_map = {
        'main': WORKSPACE_ROOT,
        'coder': OPENCLAW_WORKSPACES_ROOT / 'coder',
        'researcher': OPENCLAW_WORKSPACES_ROOT / 'researcher',
    }
    ws_root = workspace_map.get(agent_id)

    identity = _parse_identity_md(agent_root / 'IDENTITY.md')
    user = _parse_identity_md(agent_root / 'USER.md')
    soul = _read_text(agent_root / 'SOUL.md')

    if not identity and ws_root:
        identity = _parse_identity_md(ws_root / 'IDENTITY.md')
    if not user and ws_root:
        user = _parse_identity_md(ws_root / 'USER.md')
    if not soul and ws_root:
        soul = _read_text(ws_root / 'SOUL.md')

    vision_lines = []
    for line in soul.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('_') or line.startswith('- '):
            continue
        if line.startswith('**'):
            clean = line.replace('**', '').strip()
            if clean:
                vision_lines.append(clean)
        if len(vision_lines) >= 4:
            break

    agent_sessions = [s for s in sessions if str(s.get('agentId') or '') == agent_id]
    active = None
    if agent_sessions:
        agent_sessions = sorted(agent_sessions, key=lambda s: int(s.get('updatedAt') or 0), reverse=True)
        active = agent_sessions[0]

    from datetime import datetime

    appearance_defaults = {
        'main': {
            'skinTone': '#f2d7b6',
            'hairColor': '#2f4d87',
            'hairStyle': 'butler-cut',
            'note': 'Chief operations officer',
        },
        'coder': {
            'skinTone': '#5b3b2f',
            'hairColor': '#141414',
            'hairStyle': 'tight fade',
            'note': 'Jackson character profile: black',
        },
        'researcher': {
            'skinTone': '#f6d9bf',
            'hairColor': '#e6c46f',
            'hairStyle': 'blond mid-length',
            'note': 'Gemma character profile: blonde, white skin',
        },
    }

    fallback_name = {
        'main': 'Alfred',
        'coder': 'Jackson',
        'researcher': 'Gemma',
    }.get(agent_id, agent_id)

    return {
        'id': agent_id,
        'name': identity.get('name', fallback_name),
        'emoji': identity.get('emoji', '🤖'),
        'creature': identity.get('creature', 'AI agent'),
        'vibe': identity.get('vibe', ''),
        'human': {
            'name': user.get('name', 'Sam'),
            'preferredAddress': user.get('what to call them', 'Sam'),
        },
        'vision': vision_lines,
        'skills': list(skills or []),
        'commands': list(commands or []),
        'runtime': {
            'currentModel': (active or {}).get('model') or 'unknown',
            'currentProvider': (active or {}).get('modelProvider') or 'unknown',
            'activeSessionKey': (active or {}).get('key') or 'n/a',
            'sessionsCount': len(agent_sessions),
            'syncedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        },
        'appearance': appearance_defaults.get(agent_id, {
            'skinTone': '#d7b894',
            'hairColor': '#3a2f2a',
            'hairStyle': 'standard',
            'note': 'Custom agent appearance',
        }),
        'chief': agent_id == 'main',
    }


def build_alfred_profile():
    sessions = _load_openclaw_sessions()
    skills = _load_ready_skills()
    commands = _load_openclaw_commands()

    agent_ids = _list_openclaw_agent_ids()
    for s in sessions:
        sid = str(s.get('agentId') or '').strip()
        if sid:
            agent_ids.append(sid)

    dedup_agent_ids = []
    seen = set()
    for aid in agent_ids:
        if aid in seen:
            continue
        seen.add(aid)
        dedup_agent_ids.append(aid)

    profiles = [_load_agent_profile(aid, sessions, skills, commands) for aid in dedup_agent_ids]
    alfred = next((p for p in profiles if p.get('id') == 'main'), None)

    if not alfred:
        identity = _parse_identity_md(WORKSPACE_ROOT / 'IDENTITY.md')
        user = _parse_identity_md(WORKSPACE_ROOT / 'USER.md')
        from datetime import datetime
        alfred = {
            'id': 'main',
            'name': identity.get('name', 'Alfred'),
            'emoji': identity.get('emoji', '🛎️'),
            'creature': identity.get('creature', 'AI butler'),
            'vibe': identity.get('vibe', ''),
            'human': {
                'name': user.get('name', 'Sam'),
                'preferredAddress': user.get('what to call them', 'Sam'),
            },
            'vision': [],
            'skills': list(skills or []),
            'commands': list(commands or []),
            'runtime': {
                'currentModel': 'unknown',
                'currentProvider': 'unknown',
                'activeSessionKey': 'n/a',
                'sessionsCount': 0,
                'syncedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            },
            'chief': True,
            'appearance': {
                'skinTone': '#f2d7b6',
                'hairColor': '#2f4d87',
                'hairStyle': 'butler-cut',
                'note': 'Chief operations officer',
            },
        }
        profiles.insert(0, alfred)

    return {
        'ok': True,
        'name': alfred.get('name', 'Alfred'),
        'creature': alfred.get('creature', 'AI butler'),
        'vibe': alfred.get('vibe', ''),
        'emoji': alfred.get('emoji', '🛎️'),
        'human': alfred.get('human', {'name': 'Sam', 'preferredAddress': 'Sam'}),
        'vision': alfred.get('vision', []),
        'skills': alfred.get('skills', skills),
        'commands': alfred.get('commands', commands),
        'runtime': alfred.get('runtime', {}),
        'agents': profiles,
        'links': {
            'missionControl': 'http://localhost:8787/',
            'assetManager': 'http://localhost:8787/asset-manager/',
        }
    }


def _get_openclaw_version():
    """Get current OpenClaw version string."""
    try:
        result = subprocess.run(
            ['openclaw', '--version'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            import re
            m = re.search(r'(\d+\.\d+\.\d+)', result.stdout.strip())
            if m:
                return f'OpenClaw {m.group(1)}'
    except Exception:
        pass
    return 'OpenClaw'


def _get_gateway_uptime():
    """Get OpenClaw gateway process uptime in seconds."""
    try:
        proc = subprocess.run(
            ['pgrep', '-f', 'openclaw-gateway'],
            capture_output=True, text=True, timeout=3
        )
        if proc.returncode != 0:
            # Fallback: try 'openclaw gateway status'
            try:
                proc2 = subprocess.run(
                    ['openclaw', 'gateway', 'status', '--json'],
                    capture_output=True, text=True, timeout=5
                )
                if proc2.returncode == 0 and proc2.stdout.strip():
                    import json as _json
                    status = _json.loads(proc2.stdout)
                    uptime_s = status.get('uptimeSeconds') or status.get('uptime')
                    if uptime_s:
                        return int(uptime_s)
            except Exception as e:
                import sys; print(f'[uptime] gateway status fallback failed: {e}', file=sys.stderr)
                pass
            return 0
        # Found gateway PID — get its start time via ps
        pid = proc.stdout.strip().split('\n')[0]
        if not pid:
            return 0
        ps_proc = subprocess.run(
            ['ps', '-p', pid, '-o', 'etime='],
            capture_output=True, text=True, timeout=3
        )
        if ps_proc.returncode != 0:
            return 0
        elapsed = ps_proc.stdout.strip()
        # Parse ps etime format: "DD-HH:MM:SS" or "HH:MM:SS" or "MM:SS"
        return _parse_ps_etime(elapsed)
    except Exception as e:
        import sys; print(f'[uptime] gateway uptime lookup failed: {e}', file=sys.stderr)
        return 0


def _parse_ps_etime(etime_str):
    """Parse ps etime format to seconds."""
    s = etime_str.strip()
    days = 0
    if '-' in s:
        parts = s.split('-', 1)
        try:
            days = int(parts[0])
        except ValueError:
            return 0
        s = parts[1]
    parts = s.split(':')
    try:
        if len(parts) == 3:
            h, m, sec = int(parts[0]), int(parts[1]), int(parts[2])
        elif len(parts) == 2:
            h, m, sec = 0, int(parts[0]), int(parts[1])
        else:
            return 0
        return days * 86400 + h * 3600 + m * 60 + sec
    except (ValueError, IndexError):
        return 0


def _compute_today_tokens(ollama_usage, session_input, session_output):
    """Compute today's total tokens from daily usage data, falling back to session tokens."""
    from datetime import date
    today_str = date.today().isoformat()
    # Check Ollama daily data for today
    if ollama_usage and ollama_usage.get('available'):
        for day in ollama_usage.get('daily', []):
            if day.get('date', '') == today_str:
                return day.get('totalTokens', 0)
    # Fallback: session tokens (approximate today's usage)
    return session_input + session_output


def build_pulse_data():
    """Build real Mission Control pulse metrics."""
    import subprocess
    import time
    now_ms = int(time.time() * 1000)
    now_s = int(time.time())

    # --- Jobs stats ---
    jobs = load_mission_control_jobs()
    total_jobs = len(jobs)
    todo_count = sum(1 for j in jobs if j.get('phase') == 'todo')
    working_count = sum(1 for j in jobs if j.get('phase') == 'working')
    review_count = sum(1 for j in jobs if j.get('phase') in ('review', 'qc'))
    archived_count = sum(1 for j in jobs if j.get('phase') == 'archived')
    done_count = sum(1 for j in jobs if j.get('phase') in ('done', 'completed', 'archived') or j.get('jobStatus') == 'done')
    active_count = sum(1 for j in jobs if j.get('phase') not in ('done', 'completed', 'archived'))

    # --- Team agents (not raw sessions) ---
    sessions = _load_openclaw_sessions()
    STALE_MS = 5 * 60 * 1000  # 5 min — only truly active sessions
    live_sessions = [s for s in sessions if (now_ms - int(s.get('updatedAt', 0))) < STALE_MS]

    # --- Alfred agent card (sole operator) ---
    # Derive status from alfred-status.json + session liveness
    alfred_status = 'standby'
    alfred_req = None
    try:
        status_file = DATA_DIR / 'alfred-status.json'
        if status_file.exists():
            with open(status_file) as _sf:
                _ad = json.load(_sf)
                alfred_status = _ad.get('status', 'idle')
                alfred_req = _ad.get('activeReq')
    except Exception:
        pass
    # If main session is live, override idle/standby to working or planning
    for s in live_sessions:
        key = str(s.get('key') or '').lower()
        if 'main' in key or 'alfred' in key or 'telegram' in key:
            if alfred_status in ('idle', 'standby'):
                alfred_status = 'working'
            break
    # Map status values to display
    status_map = {'working': 'working', 'planning': 'planning', 'idle': 'available', 'standby': 'available', 'active': 'working'}
    display_status = status_map.get(alfred_status, alfred_status)

    # --- Live OpenClaw sessions by agent ---
    oc_status = get_oc_status()
    oc_recent = ((oc_status or {}).get('sessions', {}) or {}).get('recent', [])

    def _find_agent_session(agent_id):
        """Prefer the current Telegram direct session for a named agent, then the freshest session."""
        exact_prefix = f'agent:{agent_id}:telegram:direct:'
        fallback_prefix = f'agent:{agent_id}:'
        for _s in oc_recent:
            if str(_s.get('key') or '').startswith(exact_prefix):
                return _s
        for _s in oc_recent:
            if str(_s.get('key') or '').startswith(fallback_prefix):
                return _s
        return None

    alfred_session = _find_agent_session('main') or {}
    alice_session = _find_agent_session('alice') or {}
    alfred_model = alfred_session.get('model') or 'unknown'
    alice_model = alice_session.get('model') or 'unknown'
    alice_age = int(alice_session.get('age') or 999999999)
    alice_status = 'working' if alice_session and alice_age < (30 * 60 * 1000) else 'available'

    # --- Dispatched agents from acpx sessions ---
    # Friendly name mapping: raw command → display name
    _agent_name_map = {
        'pi-acp': 'Pi',
        'codex-acp': 'Codex',
        'claude-agent-acp': 'Claude Code',
    }
    dispatched = []
    dispatched_history = []
    try:
        acpx_dir = Path.home() / '.acpx' / 'sessions'
        if acpx_dir.exists():
            for _sf in sorted(acpx_dir.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True):
                if not _sf.name.endswith('.json') or _sf.name == 'index.json':
                    continue
                try:
                    with open(_sf) as _fh:
                        _sd = json.load(_fh)
                    _cmd = _sd.get('agent_command', '')
                    if not _cmd:
                        continue
                    # Extract short name
                    _parts = _cmd.split()
                    _bin = _parts[1] if len(_parts) > 1 else _parts[0]
                    if _bin.startswith('-'):
                        if len(_parts) > 2:
                            _bin = _parts[2]
                        else:
                            continue
                    _short = _bin.split('@')[0].split('/')[-1]
                    if not _short or _short.startswith('-'):
                        continue
                    _friendly = _agent_name_map.get(_short, _short)
                    _acpx = _sd.get('acpx', {})
                    _model = _acpx.get('current_model_id', '')
                    _sess_name = _sd.get('name', '') or ''
                    _cwd = _sd.get('cwd', '')
                    _started = _sd.get('created_at', '')
                    _last = _sd.get('last_prompt_at') or _sd.get('updated_at', '')
                    _closed = _sd.get('closed', False)
                    _exit_at = _sd.get('last_agent_exit_at', '')
                    entry = {
                        'name': _friendly, 'status': 'done' if _closed else 'working',
                        'agentType': _short, 'agentCommand': _cmd,
                        'session': _sf.stem, 'sessionName': _sess_name,
                        'startedAt': _started, 'lastPrompt': _last,
                        'model': _model, 'cwd': _cwd,
                        'closedAt': _exit_at if _closed else None,
                    }
                    if _closed:
                        if len(dispatched_history) < 10:
                            dispatched_history.append(entry)
                    else:
                        dispatched.append(entry)
                except Exception:
                    pass
    except Exception:
        pass

    team = [
        {
            'name': 'Alfred', 'emoji': '🛎️', 'role': 'Operator', 'status': display_status,
            'model': alfred_model, 'activeReq': alfred_req,
            'percentUsed': alfred_session.get('percentUsed', 0),
            'inputTokens': alfred_session.get('inputTokens', 0),
            'outputTokens': alfred_session.get('outputTokens', 0),
            'sessionId': (alfred_session.get('sessionId') or '').split('-')[0],
            'age': alfred_session.get('age', 0),
        },
        {
            'name': 'Alice', 'emoji': '', 'role': 'Research Librarian', 'status': alice_status,
            'model': alice_model, 'activeReq': None,
            'percentUsed': alice_session.get('percentUsed', 0),
            'inputTokens': alice_session.get('inputTokens', 0),
            'outputTokens': alice_session.get('outputTokens', 0),
            'sessionId': (alice_session.get('sessionId') or '').split('-')[0],
            'age': alice_session.get('age', 0),
        },
    ] + dispatched

    # --- Model usage from codexbar ---
    codex_usage = _get_codex_usage()
    ollama_usage = _get_ollama_usage()

    # --- Uptime from OpenClaw gateway ---
    uptime_s = _get_gateway_uptime()

    # --- Context & compaction: read from cached OpenClaw status --
    compactions = 0
    context_used = 0
    context_total = 202752
    input_tokens = 0
    output_tokens = 0
    percent_used = 0
    session_id = ''
    session_age_ms = 0
    if oc_status:
        try:
            sessions_data = oc_status.get('sessions', {})
            main_session = alfred_session or None
            if main_session:
                context_total = int(main_session.get('contextTokens') or sessions_data.get('defaults', {}).get('contextTokens', 202752))
                inp = main_session.get('inputTokens', 0)
                out = main_session.get('outputTokens', 0)
                remaining = main_session.get('remainingTokens', context_total - inp - out)
                context_used = max(0, context_total - remaining)
                input_tokens = inp
                output_tokens = out
                percent_used = main_session.get('percentUsed', 0)
                session_id = main_session.get('sessionId', '').split('-')[0] if main_session.get('sessionId') else ''
                session_age_ms = main_session.get('age', 0)
            session_stats_file = DATA_DIR / 'session-stats.json'
            if session_stats_file.exists():
                with open(session_stats_file, 'r') as f:
                    stats = json.load(f)
                compactions = int(stats.get('compactions', 0))
        except Exception as e:
            import sys; print(f'[pulse] oc_status parse failed: {e}', file=sys.stderr)
    else:
        # Fallback to file
        session_stats_file = DATA_DIR / 'session-stats.json'
        try:
            if session_stats_file.exists():
                with open(session_stats_file, 'r') as f:
                    stats = json.load(f)
                compactions = int(stats.get('compactions', 0))
                context_used = int(stats.get('contextUsed', 0))
                context_total = int(stats.get('contextWindow', 202752))
        except Exception as e:
            import sys; print(f'[pulse] session-stats fallback failed: {e}', file=sys.stderr)

    # --- Tasks completed metrics ---
    _aest = __import__('datetime').timezone(__import__('datetime').timedelta(hours=10))
    now_dt = __import__('datetime').datetime.now(_aest)
    today_start = __import__('datetime').datetime(now_dt.year, now_dt.month, now_dt.day, tzinfo=_aest)
    week_start = today_start - __import__('datetime').timedelta(days=today_start.weekday())
    month_start = __import__('datetime').datetime(now_dt.year, now_dt.month, 1, tzinfo=_aest)
    year_start = __import__('datetime').datetime(now_dt.year, 1, 1, tzinfo=_aest)

    today_ms = int(today_start.timestamp() * 1000)
    week_ms = int(week_start.timestamp() * 1000)
    month_ms = int(month_start.timestamp() * 1000)
    year_ms = int(year_start.timestamp() * 1000)

    def count_completed(since_ms):
        """Count completed subtasks since a timestamp."""
        count = 0
        for j in jobs:
            # Only count completed subtasks (not jobs themselves)
            for st in j.get('subtasks', []):
                if st.get('status') == 'done':
                    st_completed = st.get('completedAt') or j.get('completedAt') or 0
                    if st_completed >= since_ms:
                        count += 1
            # Also count jobs marked done that have no subtasks
            # (a done job with 0 subs = 1 implicit task completed)
            if j.get('phase') in ('done', 'completed', 'archived') and len(j.get('subtasks', [])) == 0:
                if (j.get('completedAt') or 0) >= since_ms:
                    count += 1
        return count

    tasks_completed = {
        'today': count_completed(today_ms),
        'week': count_completed(week_ms),
        'month': count_completed(month_ms),
        'year': count_completed(year_ms),
        'total': sum(len([s for s in j.get('subtasks', []) if s.get('status') == 'done']) for j in jobs) + sum(1 for j in jobs if j.get('phase') in ('done', 'completed', 'archived') and len(j.get('subtasks', [])) == 0),
    }

    # --- Queue depth from cached OpenClaw status ---
    queue_depth = 0
    if oc_status:
        try:
            tasks_info = oc_status.get('tasks', {})
            queue_depth = (tasks_info.get('byStatus', {}) or {}).get('queued', 0)
        except Exception:
            pass

    return {
        'ok': True,
        'timestamp': now_ms,
        'jobs': {
            'total': total_jobs,
            'active': active_count,
            'todo': todo_count,
            'working': working_count,
            'qc': review_count,
            'done': done_count,
            'archived': archived_count,
            'doneToday': sum(1 for j in jobs if j.get('phase') in ('done', 'completed', 'archived') and (j.get('completedAt') or 0) >= today_ms),
        },
        'agents': team,
        'usage': {
            'codex': codex_usage,
            'ollama': ollama_usage,
        },
        'compactions': compactions,
        'tasksCompleted': tasks_completed,
        'uptime': _format_duration(session_age_ms // 1000) if session_age_ms else (_format_duration(uptime_s) if uptime_s else 'unknown'),
    'sessionUptime': _format_duration(session_age_ms // 1000) if session_age_ms else '—',
        'model': alfred_model,
        'contextUsed': context_used,
        'contextWindow': context_total,
        'inputTokens': input_tokens,
        'outputTokens': output_tokens,
        'percentUsed': percent_used,
        'sessionId': session_id,
        'serverRestart': '2026-04-10T11:25:00+10:00',
        'lastUpdate': _get_openclaw_version(),
        'version': _get_openclaw_version().replace('OpenClaw ', ''),
        'queueDepth': queue_depth,
        'dispatchedHistory': dispatched_history,
        'todayTokens': _compute_today_tokens(ollama_usage, input_tokens, output_tokens),
    }


def _format_duration(seconds):
    if seconds < 60:
        return f'{seconds}s'
    elif seconds < 3600:
        return f'{seconds // 60}m {seconds % 60}s'
    elif seconds < 86400:
        return f'{seconds // 3600}h {(seconds % 3600) // 60}m'
    else:
        return f'{seconds // 86400}d {(seconds % 86400) // 3600}h'


def _get_codex_usage():
    """Get Codex/OpenAI usage from codexbar."""
    try:
        proc = subprocess.run(
            ['codexbar', 'cost', '--provider', 'codex', '--format', 'json'],
            capture_output=True, text=True, timeout=5
        )
        if proc.returncode != 0:
            return {'available': False}
        import json as _json
        data = _json.loads(proc.stdout)
        if isinstance(data, list) and len(data) > 0:
            entry = data[0]
            daily = entry.get('daily', [])
            totals = entry.get('totals', {})
            # Last 7 days
            recent = daily[-7:] if len(daily) >= 7 else daily
            daily_breakdown = []
            for day in recent:
                daily_breakdown.append({
                    'date': day.get('date', ''),
                    'totalTokens': day.get('totalTokens', 0),
                    'inputTokens': day.get('inputTokens', 0),
                    'outputTokens': day.get('outputTokens', 0),
                    'modelsUsed': day.get('modelsUsed', []),
                })
            return {
                'available': True,
                'provider': 'codex',
                'totalTokens': totals.get('totalTokens', 0),
                'totalInput': totals.get('inputTokens', 0),
                'totalOutput': totals.get('outputTokens', 0),
                'daily': daily_breakdown,
            }
    except Exception:
        pass
    return {'available': False}


def _get_ollama_usage():
    """Get Ollama usage by combining claude + codex providers with model breakdown."""
    import json as _json
    model_totals = {}
    total_in = 0
    total_out = 0
    total_tokens = 0
    daily_combined = {}

    for provider in ['claude', 'codex']:
        try:
            proc = subprocess.run(
                ['codexbar', 'cost', '--provider', provider, '--format', 'json'],
                capture_output=True, text=True, timeout=8
            )
            if proc.returncode != 0 or not proc.stdout.strip():
                continue
            data = _json.loads(proc.stdout)
            if not isinstance(data, list) or len(data) == 0:
                continue
            entry = data[0]
            daily = entry.get('daily', [])
            totals = entry.get('totals', {})
            total_in += totals.get('inputTokens', 0)
            total_out += totals.get('outputTokens', 0)
            total_tokens += totals.get('totalTokens', 0)
            for day in daily:
                date_key = day.get('date', '')
                day_in = day.get('inputTokens', 0)
                day_out = day.get('outputTokens', 0)
                day_total = day.get('totalTokens', 0)
                if date_key not in daily_combined:
                    daily_combined[date_key] = {'date': date_key, 'inputTokens': 0, 'outputTokens': 0, 'totalTokens': 0, 'models': {}}
                daily_combined[date_key]['inputTokens'] += day_in
                daily_combined[date_key]['outputTokens'] += day_out
                daily_combined[date_key]['totalTokens'] += day_total
                for m in day.get('modelsUsed', []):
                    mname = m.get('modelName', m) if isinstance(m, dict) else str(m)
                    mtokens = day_total  # approximate per-day
                    model_totals[mname] = model_totals.get(mname, 0) + mtokens
                    daily_combined[date_key]['models'][mname] = daily_combined[date_key]['models'].get(mname, 0) + mtokens
        except Exception:
            continue

    # Pull model usage from OpenClaw sessions (Kimi K2.5, etc.)
    try:
        sessions = _load_openclaw_sessions()
        for session in sessions:
            model = str(session.get('model') or '').strip()
            if not model:
                continue
            session_tokens = 0
            for key in ('totalTokens', 'tokensUsed', 'tokenCount', 'tokens'):
                val = session.get(key)
                if isinstance(val, (int, float)) and int(val) > session_tokens:
                    session_tokens = int(val)
            if session_tokens > 0:
                model_totals[model] = model_totals.get(model, 0) + session_tokens
                total_tokens += session_tokens
                input_t = session.get('inputTokens', 0)
                output_t = session.get('outputTokens', 0)
                total_in += int(input_t) if isinstance(input_t, (int, float)) and input_t > 0 else session_tokens // 2
                total_out += int(output_t) if isinstance(output_t, (int, float)) and output_t > 0 else session_tokens - session_tokens // 2
    except Exception:
        pass

    if not model_totals:
        return {'available': False}

    # Build model breakdown with separate in/out counts from daily data
    model_breakdown = []
    for name, tokens in sorted(model_totals.items(), key=lambda x: -x[1]):
        model_breakdown.append({'name': name, 'tokens': tokens})

    # Sort daily by date descending, take last 7
    sorted_daily = sorted(daily_combined.values(), key=lambda x: x['date'], reverse=True)[:7]
    sorted_daily.reverse()  # chronological order
    daily_output = []
    for d in sorted_daily:
        daily_output.append({
            'date': d['date'],
            'totalTokens': d['totalTokens'],
            'inputTokens': d['inputTokens'],
            'outputTokens': d['outputTokens'],
            'modelsUsed': list(d['models'].keys()),
        })

    return {
        'available': True,
        'provider': 'ollama',
        'totalTokens': total_tokens,
        'totalInput': total_in,
        'totalOutput': total_out,
        'daily': daily_output,
        'modelBreakdown': model_breakdown,
    }


def build_mission_control_state():
    assets = _safe_read_json(DATA_JSON, [])
    sessions = _load_openclaw_sessions()
    now_ms = int(__import__('time').time() * 1000)

    # Filter stale sessions (>30 min inactive) - only show live agents
    STALE_MS = 30 * 60 * 1000
    sessions = [s for s in sessions if (now_ms - int(s.get('updatedAt', 0))) < STALE_MS]

    normalized_sessions = []
    for s in sessions:
        key = str(s.get('key') or 'session')
        kind = str(s.get('kind') or 'direct')
        model = str(s.get('model') or 'unknown')
        updated_at = int(s.get('updatedAt') or 0)
        age_ms = max(now_ms - updated_at, 0) if updated_at else None

        zone = 'todo'
        if age_ms is not None:
            if age_ms < 5 * 60 * 1000:
                zone = 'working'
            elif age_ms < 60 * 60 * 1000:
                zone = 'review'
            else:
                zone = 'done'

        normalized_sessions.append({
            'id': key,
            'name': key.split(':')[-1] or key,
            'role': f"{kind} · {model}",
            'zone': zone,
            'updatedAt': updated_at,
            'ageMs': age_ms,
            'task': f"Session {key}",
            'key': key,
        })

    tasks = []
    for s in normalized_sessions:
        tasks.append({
            'id': f"task::{s['id']}",
            'title': s['task'],
            'zone': s['zone'],
            'meta': s['role'],
        })

    return {
        'ok': True,
        'timestamp': now_ms,
        'stats': {
            'assetsCount': len(assets) if isinstance(assets, list) else 0,
            'sessionsCount': len(normalized_sessions),
            'recentFilesCount': len(_recent_dev_files()),
        },
        'agents': normalized_sessions,
        'tasks': tasks,
        'recentFiles': _recent_dev_files(),
    }


def resolve_asset_path(rel: str):
    if rel.startswith('./media_root/'):
        rel_to_root = rel[len('./media_root/'):]
        base_root = ROOT.resolve()
        target = (ROOT / rel_to_root).resolve()
        return base_root, target
    if rel.startswith('./codex_root/'):
        rel_to_root = rel[len('./codex_root/'):]
        base_root = AI_ROOT.resolve()
        target = (AI_ROOT / rel_to_root).resolve()
        return base_root, target
    if rel.startswith('./selected_root/'):
        selected_root = sync_selected_root_link()
        if not selected_root:
            raise ValueError('No selected import folder is configured')
        rel_to_root = rel[len('./selected_root/'):]
        base_root = selected_root.resolve()
        target = (selected_root / rel_to_root).resolve()
        return base_root, target
    raise ValueError('Invalid path format')


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def _send_json(self, status: int, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = self.path.split('?', 1)
        clean_path = parsed[0].split('#', 1)[0]
        query_string = parsed[1] if len(parsed) > 1 else ''
        from urllib.parse import parse_qs
        params = {k: v[0] for k, v in parse_qs(query_string).items()}

        media_prefixes = ('/selected_root/', '/media_root/', '/codex_root/')
        if clean_path.startswith(media_prefixes):
            return self.serve_with_range_support()

        if clean_path == '/dashboard':
            self.send_response(302)
            self.send_header('Location', '/dashboard/')
            self.end_headers()
            return
        if clean_path == '/asset-manager':
            self.send_response(302)
            self.send_header('Location', '/asset-manager/')
            self.end_headers()
            return
        if clean_path == '/api/library-config':
            cfg = load_config()
            self._send_json(200, {'ok': True, 'config': cfg})
            return
        if clean_path == '/api/mission-control-state':
            state = build_mission_control_state()
            self._send_json(200, state)
            return
        if clean_path == '/api/mission-control-plan':
            self._send_json(200, load_plan_state())
            return
        if clean_path == '/api/pulse-data':
            import time as _time
            global _pulse_cache, _pulse_cache_ts
            # Serve cached data if fresh (<30s old)
            if _pulse_cache and (_time.time() - _pulse_cache_ts) < 30:
                self._send_json(200, _pulse_cache)
                return
            # Build fresh — no more blocking on openclaw status (uses cached oc_status)
            try:
                result = build_pulse_data()
                result['pulseTimestamp'] = int(_time.time() * 1000)
                result['pulseInterval'] = 60
                _pulse_cache = result
                _pulse_cache_ts = _time.time()
                self._send_json(200, result)
            except Exception as e:
                import sys; print(f'[pulse-data ERROR] {e}', file=sys.stderr)
                jobs = load_mission_control_jobs()
                done_count = sum(1 for j in jobs if j.get('phase') in ('done', 'completed', 'archived') or j.get('jobStatus') == 'done')
                fallback = {'ok': False, 'error': str(e), 'agents': [{'name': 'Alfred', 'emoji': '🛎️', 'role': 'Operator', 'status': 'available', 'model': 'unknown', 'activeReq': None}], 'jobs': {'total': len(jobs), 'todo': sum(1 for j in jobs if j.get('phase') == 'todo'), 'working': sum(1 for j in jobs if j.get('phase') == 'working'), 'qc': sum(1 for j in jobs if j.get('phase') in ('review', 'qc')), 'done': done_count}, 'usage': {}, 'compactions': 0, 'tasksCompleted': {}, 'uptime': 'unknown', 'contextUsed': 0, 'contextWindow': 202752, 'excludedModels': [], 'modelUsage': []}
                _pulse_cache = fallback
                _pulse_cache_ts = _time.time()
                self._send_json(200, fallback)
            return
        if clean_path == '/api/vault/tree':
            # Return the Mission Control vault file tree
            vault_dir = Path.home() / 'Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control'
            if not vault_dir.exists():
                self._send_json(404, {'ok': False, 'error': 'Vault not found'})
                return
            result = []
            skip = {'.obsidian', '.trash', '.DS_Store', '.git'}
            for item in sorted(vault_dir.rglob('*')):
                rel = item.relative_to(vault_dir)
                if any(p.startswith('.') or p in skip for p in rel.parts):
                    continue
                is_dir = item.is_dir()
                try:
                    mtime_ms = int(item.stat().st_mtime * 1000)
                except Exception:
                    mtime_ms = 0
                entry = {
                    'path': str(rel),
                    'name': item.name,
                    'isDir': is_dir,
                    'ext': item.suffix if not is_dir else '',
                    'mtime': mtime_ms,
                }
                # Extract source/thumbnail from YouTube clipping frontmatter
                if not is_dir and item.suffix == '.md' and 'YouTube' in str(rel):
                    try:
                        text = item.read_text(encoding='utf-8')[:2000]
                        for line in text.split('\n'):
                            line = line.strip()
                            low = line.lower()
                            if low.startswith('source:') or low.startswith('thumbnail:'):
                                key = line.split(':')[0].strip().lower()
                                val = line[len(key)+1:].strip().strip('"').strip("'")
                                entry[key] = val
                    except Exception:
                        pass
                result.append(entry)
            self._send_json(200, {'ok': True, 'files': result})
            return

        if clean_path.startswith('/api/vault/file'):
            # Return a single vault file's content
            import urllib.parse as _up
            query = _up.parse_qs(self.path.split('?', 1)[-1]) if '?' in self.path else {}
            file_path = query.get('path', [''])[0]
            if not file_path:
                self._send_json(400, {'ok': False, 'error': 'Missing path parameter'})
                return
            vault_dir = Path.home() / 'Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control'
            full_path = (vault_dir / file_path).resolve()
            # Security: ensure we don't escape the vault
            if not str(full_path).startswith(str(vault_dir.resolve())):
                self._send_json(403, {'ok': False, 'error': 'Access denied'})
                return
            if not full_path.exists() or not full_path.is_file():
                self._send_json(404, {'ok': False, 'error': 'File not found'})
                return
            try:
                content = full_path.read_text(encoding='utf-8')
                self._send_json(200, {'ok': True, 'content': content, 'path': file_path})
            except Exception as e:
                self._send_json(500, {'ok': False, 'error': str(e)})
            return

        if clean_path.startswith('/api/read'):
            # Render a vault note as a fast, beautiful reader page
            import urllib.parse as _up
            query = _up.parse_qs(self.path.split('?', 1)[-1]) if '?' in self.path else {}
            note_path = query.get('path', [''])[0]
            if not note_path:
                self._send_json(400, {'ok': False, 'error': 'Missing path parameter'})
                return
            vault_dir = Path.home() / 'Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control'
            full_path = (vault_dir / note_path).resolve()
            if not str(full_path).startswith(str(vault_dir.resolve())):
                self._send_json(403, {'ok': False, 'error': 'Access denied'})
                return
            if not full_path.exists() or not full_path.is_file():
                self._send_json(404, {'ok': False, 'error': 'File not found'})
                return
            try:
                content = full_path.read_text(encoding='utf-8')
                title = _note_title_from_markdown(note_path, content)
                html = _reader_html(note_path, title, content)
                body = html.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self._send_json(500, {'ok': False, 'error': str(e)})
            return

        if clean_path.startswith('/api/marp'):
            # Render a vault note as Marp presentation HTML
            import urllib.parse as _up
            import subprocess as _sp
            query = _up.parse_qs(self.path.split('?', 1)[-1]) if '?' in self.path else {}
            note_path = query.get('path', [''])[0]
            if not note_path:
                self._send_json(400, {'ok': False, 'error': 'Missing path parameter'})
                return
            vault_dir = Path.home() / 'Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control'
            full_path = (vault_dir / note_path).resolve()
            if not str(full_path).startswith(str(vault_dir.resolve())):
                self._send_json(403, {'ok': False, 'error': 'Access denied'})
                return
            if not full_path.exists() or not full_path.is_file():
                self._send_json(404, {'ok': False, 'error': 'File not found'})
                return
            try:
                content = full_path.read_text(encoding='utf-8')
                title = _note_title_from_markdown(note_path, content)
                marp_cli = '/opt/homebrew/bin/marp' if Path('/opt/homebrew/bin/marp').exists() else 'marp'
                with tempfile.TemporaryDirectory(prefix='mc-marp-') as tmp:
                    md_path = Path(tmp) / 'deck.md'
                    html_path = Path(tmp) / 'deck.html'
                    md_path.write_text(_deck_markdown(title, content), encoding='utf-8')
                    result = _sp.run([marp_cli, str(md_path), '-o', str(html_path), '--html'], capture_output=True, text=True, timeout=20)
                    if result.returncode == 0 and html_path.exists():
                        html = html_path.read_text(encoding='utf-8')
                        html = html.replace('</head>', f'{MARP_DARK_SHELL_STYLE}</head>', 1)
                        html = html.replace('</body>', f'{MARP_MOBILE_PRESENT_FIX_SCRIPT}</body>', 1)
                        body = html.encode('utf-8')
                        self.send_response(200)
                        self.send_header('Content-Type', 'text/html; charset=utf-8')
                        self.send_header('Content-Length', str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
                    else:
                        err = result.stderr or result.stdout or 'Unknown Marp error'
                        body = ('<pre>' + err.replace('&', '&amp;').replace('<', '&lt;') + '</pre>').encode('utf-8')
                        self.send_response(500)
                        self.send_header('Content-Type', 'text/html; charset=utf-8')
                        self.send_header('Content-Length', str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
            except Exception as e:
                self._send_json(500, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/alfred-status':
            status_file = DATA_DIR / 'alfred-status.json'
            status = {}
            if status_file.exists():
                try:
                    status = json.loads(status_file.read_text(encoding='utf-8'))
                except Exception:
                    pass
            # Auto-derive working status from current MC jobs if stale or idle
            all_jobs = load_mission_control_jobs()
            working_job = None
            for j in all_jobs:
                if j.get('phase') == 'working' and j.get('assignee', '') in ('Alfred', 'alfred'):
                    working_job = j
                    break
            if working_job:
                req = working_job.get('number', 'REQ-???')
                title = working_job.get('title', '')
                # Find in-progress subtask
                active_subtask = None
                for st in working_job.get('subtasks', []):
                    if st.get('status') == 'in-progress':
                        active_subtask = st.get('title', '')
                        break
                task_label = active_subtask or f"{req} {title}"
                status['status'] = 'working'
                status['task'] = task_label
                status['activeReq'] = req
            else:
                # No working job — show idle
                if status.get('status') == 'working':
                    status['status'] = 'idle'
                    status['task'] = None
                    status['activeReq'] = None
            self._send_json(200, {'ok': True, **status})
            return
        if clean_path == '/api/alfred-profile':
            profile = build_alfred_profile()
            self._send_json(200, profile)
            return
        if clean_path == '/api/mission-control-jobs':
            all_jobs = load_mission_control_jobs()
            # Return only active (todo + working) jobs — done jobs available via /done endpoint
            active = []
            for j in all_jobs:
                phase = j.get('phase', 'todo')
                if phase in ('archived', 'done', 'completed'):
                    continue  # Skip done/archived — load on demand only
                active.append(j)
            self._send_json(200, {'ok': True, 'jobs': active})
            return
        if clean_path == '/api/mission-control-jobs/done':
            # On-demand: return compacted done jobs for the Done list
            all_jobs = load_mission_control_jobs()
            compacted = []
            for j in all_jobs:
                phase = j.get('phase', 'todo')
                if phase in ('archived', 'done', 'completed'):
                    completed_by = ''
                    for h in j.get('history', []):
                        ev = h.get('event', '')
                        if ev in ('transitioned_to_done', 'approved') or 'done' in ev:
                            completed_by = h.get('by', 'Alfred')
                    compacted.append({
                        'id': j.get('id'),
                        'number': j.get('number'),
                        'title': j.get('title'),
                        'description': j.get('description', ''),
                        'details': j.get('details', ''),
                        'phase': phase,
                        'assignee': j.get('assignee'),
                        'priority': j.get('priority'),
                        'project': j.get('project'),
                        'createdBy': j.get('createdBy'),
                        'completedBy': completed_by or j.get('assignee', ''),
                        'completedAt': j.get('completedAt'),
                        'createdAt': j.get('createdAt'),
                        'subtasks': j.get('subtasks', []),
                        'history': j.get('history', []),
                        'qcResult': j.get('qcResult'),
                        'dueDate': j.get('dueDate'),
                    })
            self._send_json(200, {'ok': True, 'jobs': compacted})
            return
        if clean_path == '/api/mission-control-jobs/needs-rewrite':
            jobs = load_mission_control_jobs()
            needing = [j for j in jobs if j.get('needsRewrite')]
            self._send_json(200, {'ok': True, 'jobs': needing})
            return

        if clean_path == '/api/mission-control-jobs/logs':
            # Job-level log entries for the Logs panel
            from datetime import datetime as _dt, timezone as _tz
            import re as _re

            def _to_ms(val):
                """Normalize any timestamp to integer milliseconds."""
                if not val:
                    return 0
                if isinstance(val, (int, float)):
                    return int(val)
                # ISO string like "2026-04-15T14:35:00Z"
                try:
                    return int(_dt.fromisoformat(val.replace('Z', '+00:00')).timestamp() * 1000)
                except Exception:
                    return 0

            all_jobs = load_mission_control_jobs()
            log_entries = []
            for j in all_jobs:
                phase = j.get('phase', 'todo')
                # Include done/archived in logs
                number = j.get('number', '')
                title = j.get('title', '')
                description = j.get('description', j.get('details', ''))
                # Extract last sentence from description
                sentences = _re.split(r'[.!?]+', description.strip())
                sentences = [s.strip() for s in sentences if s.strip()]
                summary = sentences[-1] if sentences else title
                # Normalize timestamps to int ms
                created_at = _to_ms(j.get('createdAt'))
                completed_at = _to_ms(j.get('completedAt'))
                history = j.get('history', [])
                # Build log text from history
                log_lines = []
                for h in history:
                    ev = h.get('event', '')
                    by = h.get('by', '')
                    ts = _to_ms(h.get('ts', 0))
                    try:
                        dt = _dt.fromtimestamp(ts / 1000, tz=_tz.utc)
                        time_str = dt.strftime('%H:%M')
                    except Exception:
                        time_str = ''
                    if 'created' in ev:
                        log_lines.append(f'{time_str} Created by {by}')
                    elif 'working' in ev:
                        log_lines.append(f'{time_str} Started ({by})')
                    elif 'done' in ev or 'approved' in ev:
                        log_lines.append(f'{time_str} Completed ({by})')
                    elif 'archived' in ev:
                        log_lines.append(f'{time_str} Archived')
                    elif 'stopped' in ev:
                        log_lines.append(f'{time_str} Stopped ({by})')
                    elif 'subtask' in ev:
                        log_lines.append(f'{time_str} {ev} ({by})')
                log_entries.append({
                    'id': j.get('id'),
                    'number': number,
                    'title': title,
                    'summary': summary,
                    'phase': phase,
                    'createdAt': created_at,
                    'completedAt': completed_at,
                    'log': log_lines,
                    'assignee': j.get('assignee', ''),
                    'description': description,
                    'subtasks': j.get('subtasks', []),
                })
            # Sort by createdAt descending (all int ms now, safe to compare)
            log_entries.sort(key=lambda e: e.get('createdAt') or 0, reverse=True)
            self._send_json(200, {'ok': True, 'logs': log_entries})
            return

        if clean_path == '/api/vault-graph':
            # Generate vault graph data by reading vault files directly
            vault_dir = Path.home() / 'Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control'
            import re as _link_re
            link_pattern = _link_re.compile(r'\[\[([^\]|#]+)')  # [[Name]] or [[Name|alias]]
            nodes = []
            edges = []
            node_ids = set()

            def add_node(nid, group):
                if nid not in node_ids:
                    nodes.append({'id': nid, 'group': group})
                    node_ids.add(nid)

            def scan_folder(folder, group):
                fdir = vault_dir / folder
                if not fdir.exists():
                    return
                for fpath in sorted(fdir.glob('*.md')):
                    name = fpath.stem
                    add_node(name, group)
                    try:
                        content = fpath.read_text(encoding='utf-8')
                        for m in link_pattern.finditer(content):
                            target = m.group(1).strip()
                            if target and target != name:
                                edges.append({'source': name, 'target': target})
                    except Exception:
                        pass

            # Scan each folder
            add_node('Mission Control', 'hub')
            scan_folder('Categories', 'category')
            scan_folder('REQ', 'req')
            scan_folder('Archive/REQ-v1', 'archived')
            scan_folder('Reference', 'reference')
            scan_folder('Daily', 'daily')
            scan_folder('Lessons', 'lesson')
            scan_folder('Alfred', 'alfred')
            scan_folder('Skills', 'skill')

            # Read hub links
            hub_path = vault_dir / 'Mission Control.md'
            if hub_path.exists():
                try:
                    hub_content = hub_path.read_text(encoding='utf-8')
                    for m in link_pattern.finditer(hub_content):
                        target = m.group(1).strip()
                        if target:
                            edges.append({'source': 'Mission Control', 'target': target})
                except Exception:
                    pass

            # Read README if exists
            readme_path = vault_dir / 'README.md'
            if readme_path.exists():
                add_node('README', 'hub')
                try:
                    content = readme_path.read_text(encoding='utf-8')
                    for m in link_pattern.finditer(content):
                        target = m.group(1).strip()
                        if target:
                            edges.append({'source': 'README', 'target': target})
                except Exception:
                    pass

            self._send_json(200, {'ok': True, 'nodes': nodes, 'edges': edges})
            return

        if clean_path == '/api/vault-note':
            # Fetch a single vault note's content
            note_name = params.get('name', '')
            if not note_name:
                self._send_json(400, {'ok': False, 'error': 'name required'})
                return
            vault_dir = Path.home() / 'Library/Mobile Documents/iCloud~md~obsidian/Documents/Mission Control'
            # Search common folders
            for folder in ['', 'REQ', 'Categories', 'Daily', 'Reference', 'Lessons', 'Alfred']:
                fpath = vault_dir / folder / f'{note_name}.md'
                if fpath.exists():
                    try:
                        content = fpath.read_text(encoding='utf-8')
                        # Parse YAML frontmatter
                        meta = {}
                        body = content
                        if content.startswith('---'):
                            parts = content.split('---', 2)
                            if len(parts) >= 3:
                                for line in parts[1].strip().split('\n'):
                                    if ':' in line:
                                        k, v = line.split(':', 1)
                                        meta[k.strip()] = v.strip()
                                body = parts[2].strip()
                        self._send_json(200, {'ok': True, 'meta': meta, 'body': body})
                    except Exception as e:
                        self._send_json(500, {'ok': False, 'error': str(e)})
                    return
            self._send_json(404, {'ok': False, 'error': 'Note not found'})
            return

        if clean_path == '/api/mission-control-projects':
            self._send_json(200, {'ok': True, 'projects': load_mission_control_projects()})
            return
        if clean_path == '/api/mission-control-messages':
            msg_file = UI_ROOT / 'data' / 'messages.json'
            messages = []
            if msg_file.exists():
                try:
                    messages = json.loads(msg_file.read_text(encoding='utf-8'))
                    if not isinstance(messages, list):
                        messages = []
                except Exception:
                    messages = []
            self._send_json(200, {'ok': True, 'messages': messages})
            return
        return super().do_GET()

    def serve_with_range_support(self):
        clean = unquote(self.path.split('?', 1)[0].split('#', 1)[0])
        full_path = Path(super().translate_path(clean))
        if not full_path.exists() or not full_path.is_file():
            self.send_error(404, 'File not found')
            return

        total_size = full_path.stat().st_size
        content_type = self.guess_type(str(full_path))
        range_header = self.headers.get('Range', '').strip()

        start = 0
        end = total_size - 1
        status = 200

        if range_header.startswith('bytes='):
            try:
                range_spec = range_header[len('bytes='):].split(',', 1)[0].strip()
                start_str, end_str = range_spec.split('-', 1)

                if start_str == '':
                    length = int(end_str)
                    start = max(total_size - length, 0)
                else:
                    start = int(start_str)

                if end_str != '':
                    end = int(end_str)

                if start > end or start < 0 or end >= total_size:
                    raise ValueError('Invalid byte range')

                status = 206
            except Exception:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{total_size}')
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                return

        length = end - start + 1
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        self.send_header('Last-Modified', self.date_time_string(full_path.stat().st_mtime))
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{total_size}')
        self.end_headers()

        with full_path.open('rb') as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def translate_path(self, path):
        clean = unquote(path.split('?', 1)[0].split('#', 1)[0])
        if clean.startswith('/mission-control/'):
            rel = clean[len('/mission-control/'):].lstrip('/')
            candidate = (UI_ROOT / rel).resolve()
            root = UI_ROOT.resolve()
            if candidate == root or str(candidate).startswith(str(root) + '/'):
                return str(candidate)
            return str(root / '__forbidden__')
        if clean.startswith('/dashboard/'):
            rel = clean[len('/dashboard/'):].lstrip('/')
            candidate = (DASHBOARD_ROOT / rel).resolve()
            root = DASHBOARD_ROOT.resolve()
            if candidate == root or str(candidate).startswith(str(root) + '/'):
                return str(candidate)
            return str(root / '__forbidden__')
        if clean.startswith('/asset-manager/'):
            rel = clean[len('/asset-manager/'):].lstrip('/')
            candidate = (ASSET_MANAGER_ROOT / rel).resolve()
            root = ASSET_MANAGER_ROOT.resolve()
            if candidate == root or str(candidate).startswith(str(root) + '/'):
                return str(candidate)
            return str(root / '__forbidden__')
        return super().translate_path(path)

    def do_POST(self):
        clean_path = self.path.split('?', 1)[0].split('#', 1)[0]

        if clean_path == '/api/mission-control-plan/annotations':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
                text = (payload.get('text') or '').strip()
                if not text:
                    raise ValueError('Annotation text is required')
                import time as _time_plan_post
                now_ms = int(_time_plan_post.time() * 1000)
                state = load_plan_state()
                ann = {
                    'id': f'ann-{now_ms}',
                    'author': (payload.get('author') or 'Alfred').strip(),
                    'text': text,
                    'status': payload.get('status') or 'proposed',
                    'createdAt': now_ms,
                    'updatedAt': now_ms,
                }
                state.setdefault('annotations', []).insert(0, ann)
                save_plan_state(state)
                self._send_json(200, {'ok': True, 'annotation': ann, 'plan': state})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        # Create a new project
        if clean_path == '/api/mission-control-projects/create':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
                name = (payload.get('name') or '').strip()
                if not name:
                    raise ValueError('Project name is required')
                projects = load_mission_control_projects()
                # Check for duplicate name
                if any(p.get('name') == name for p in projects):
                    raise ValueError(f'Project "{name}" already exists')
                import time as _time_proj
                now_ms = int(_time_proj.time() * 1000)
                slug = name.lower().replace(' ', '-').replace('/', '-')
                new_project = {
                    'id': f'proj_{slug}',
                    'name': name,
                    'folderPath': (payload.get('folderPath') or '').strip(),
                    'createdAt': now_ms,
                    'isDefault': False,
                }
                projects.append(new_project)
                save_mission_control_projects(projects)
                self._send_json(200, {'ok': True, 'project': new_project})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/save-assets':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8'))
                if not isinstance(payload, list):
                    raise ValueError('Payload must be an array')
                DATA_JSON.parent.mkdir(parents=True, exist_ok=True)
                DATA_JSON.write_text(json.dumps(payload, indent=2), encoding='utf-8')
                self._send_json(200, {'ok': True, 'saved': len(payload)})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/select-import-folder':
            try:
                folder = choose_folder_mac()
                cfg = load_config()
                cfg['import_root'] = folder
                save_config(cfg)
                sync_selected_root_link()
                proc = subprocess.run(['/opt/homebrew/bin/python3', str(IMPORT_SCRIPT)], capture_output=True, text=True, check=True)
                self._send_json(200, {'ok': True, 'folder': folder, 'message': proc.stdout.strip()})
            except subprocess.CalledProcessError as e:
                self._send_json(500, {'ok': False, 'error': e.stderr or e.stdout})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/import-assets':
            try:
                DATA_JSON.parent.mkdir(parents=True, exist_ok=True)
                sync_selected_root_link()
                proc = subprocess.run(['/opt/homebrew/bin/python3', str(IMPORT_SCRIPT)], capture_output=True, text=True, check=True)
                self._send_json(200, {'ok': True, 'message': proc.stdout.strip()})
            except subprocess.CalledProcessError as e:
                self._send_json(500, {'ok': False, 'error': e.stderr or e.stdout})
            return

        if clean_path == '/api/delete-asset':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8'))
                rel = (payload.get('path') or '').strip()
                base_root, target = resolve_asset_path(rel)
                if not str(target).startswith(str(base_root) + '/') and target != base_root:
                    raise ValueError('Path escapes root')
                if not target.exists() or not target.is_file():
                    raise FileNotFoundError('Source file not found')
                target.unlink()
                self._send_json(200, {'ok': True, 'deleted': str(target)})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/log-deletion':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8'))
                DELETION_LOG.parent.mkdir(parents=True, exist_ok=True)
                with DELETION_LOG.open('a', encoding='utf-8') as f:
                    f.write(json.dumps(payload, ensure_ascii=False) + "\n")
                self._send_json(200, {'ok': True})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/mission-control-jobs':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8') or '{}')
                jobs = payload.get('jobs') if isinstance(payload, dict) else None
                if not isinstance(jobs, list):
                    raise ValueError('jobs must be a list')
                # drop noisy legacy auto-injected runtime jobs
                jobs = [j for j in jobs if isinstance(j, dict) and j.get('source') != 'runtime-auto']
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'saved': len(jobs)})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        # --- Mission Control Job Actions ---
        import re
        mc_job_match = re.match(r'^/api/mission-control-jobs/([^/]+)/(.+)$', clean_path)
        if mc_job_match:
            job_id = unquote(mc_job_match.group(1))
            action = mc_job_match.group(2)
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
            except Exception:
                payload = {}

            if action == 'transition':
                new_phase = (payload.get('phase') or '').strip()
                if new_phase not in ('todo', 'working', 'qc', 'review', 'awaiting-approval', 'done'):
                    self._send_json(400, {'ok': False, 'error': 'Invalid phase'})
                    return
                # Prevent starting a scheduled job before its due date
                if new_phase == 'working':
                    target_job, _ = find_job_by_id(job_id)
                    if target_job:
                        due = target_job.get('dueDate')
                        if due and due != 'None':
                            try:
                                import datetime as _dt
                                due_dt = _dt.datetime.fromisoformat(due.replace('Z', '+00:00'))
                                if due_dt.tzinfo is None:
                                    due_dt = due_dt.replace(tzinfo=_dt.timezone.utc)
                                now_utc = _dt.datetime.now(_dt.timezone.utc)
                                if due_dt > now_utc:
                                    self._send_json(400, {'ok': False, 'error': f'Job is scheduled to start at {due}. Cannot start before due date.'})
                                    return
                            except (ValueError, TypeError):
                                pass  # Invalid date format — allow transition
                by = (payload.get('by') or '').strip() or 'Alfred'
                job, err = transition_job_phase(job_id, new_phase, by=by)
                if err:
                    self._send_json(404, {'ok': False, 'error': err})
                    return
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'create':
                self._send_json(400, {'ok': False, 'error': 'Use POST /api/mission-control-jobs/create'})
                return

            if action == 'snapshot':
                # Snapshot endpoint is now a no-op
                self._send_json(200, {'ok': True, 'message': 'Snapshots are temporarily disabled'})
                return

            if action == 'approve':
                import time as _time_approve
                now_ms_approve = int(_time_approve.time() * 1000)
                job, err = transition_job_phase(job_id, 'done', event_prefix='approved', by='Sam')
                if err:
                    self._send_json(404, {'ok': False, 'error': err})
                    return
                # Set qcResult
                job['qcResult'] = {
                    'status': 'approved',
                    'by': payload.get('by', 'Gemma'),
                    'notes': payload.get('notes', ''),
                    'timestamp': now_ms_approve,
                }
                job['completedAt'] = now_ms_approve
                save_mission_control_jobs(load_mission_control_jobs())
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'reject':
                import time as _time_reject
                now_ms_reject = int(_time_reject.time() * 1000)
                reason = (payload.get('reason') or '').strip()
                job, err = transition_job_phase(job_id, 'working', event_prefix='rejected', by='Sam')
                if err:
                    self._send_json(404, {'ok': False, 'error': err})
                    return
                # Attach rejection reason to the latest history entry
                if job and job.get('history'):
                    job['history'][-1]['reason'] = reason or 'No reason provided'
                # Set qcResult
                job['qcResult'] = {
                    'status': 'rejected',
                    'by': payload.get('by', 'Gemma'),
                    'notes': reason or 'No reason provided',
                    'timestamp': now_ms_reject,
                }
                save_mission_control_jobs(load_mission_control_jobs())
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'archive':
                import time as _time_archive
                now_ms_archive = int(_time_archive.time() * 1000)
                job, jobs = find_job_by_id(job_id)
                if not job:
                    self._send_json(404, {'ok': False, 'error': 'Job not found'})
                    return
                job['phase'] = 'archived'
                job['status'] = 'archived'
                job['updatedAt'] = now_ms_archive
                if 'history' not in job:
                    job['history'] = []
                job['history'].append({'ts': now_ms_archive, 'event': 'archived'})
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'approve-request':
                import time as _time_approve_req
                now_ms_approve_req = int(_time_approve_req.time() * 1000)
                job, jobs = find_job_by_id(job_id)
                if not job:
                    self._send_json(404, {'ok': False, 'error': 'Job not found'})
                    return
                if job.get('phase') != 'awaiting-approval':
                    self._send_json(400, {'ok': False, 'error': 'Job is not awaiting approval'})
                    return
                job['phase'] = 'done'
                job['status'] = 'done'
                job['completedAt'] = now_ms_approve_req
                job['updatedAt'] = now_ms_approve_req
                if 'history' not in job:
                    job['history'] = []
                job['history'].append({
                    'ts': now_ms_approve_req,
                    'event': 'request_approved',
                    'by': payload.get('by', 'Sam'),
                })
                job['qcResult'] = {
                    'status': 'approved',
                    'by': payload.get('by', 'Sam'),
                    'notes': '',
                    'timestamp': now_ms_approve_req,
                }
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'deny-request':
                import time as _time_deny_req
                now_ms_deny_req = int(_time_deny_req.time() * 1000)
                reason = (payload.get('reason') or '').strip()
                job, jobs = find_job_by_id(job_id)
                if not job:
                    self._send_json(404, {'ok': False, 'error': 'Job not found'})
                    return
                if job.get('phase') != 'awaiting-approval':
                    self._send_json(400, {'ok': False, 'error': 'Job is not awaiting approval'})
                    return
                job['phase'] = 'todo'
                job['status'] = 'todo'
                job['updatedAt'] = now_ms_deny_req
                if 'history' not in job:
                    job['history'] = []
                job['history'].append({
                    'ts': now_ms_deny_req,
                    'event': 'request_denied',
                    'by': payload.get('by', 'Sam'),
                    'reason': reason or 'No reason provided',
                })
                job['qcResult'] = {
                    'status': 'rejected',
                    'by': payload.get('by', 'Sam'),
                    'notes': reason or 'No reason provided',
                    'timestamp': now_ms_deny_req,
                }
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'job': job})
                return

            self._send_json(404, {'ok': False, 'error': f'Unknown action: {action}'})
            return

        # Archive all done jobs
        if clean_path == '/api/mission-control-jobs/archive-all-done':
            try:
                import time as _time_arch_all
                now_ms_arch = int(_time_arch_all.time() * 1000)
                jobs = load_mission_control_jobs()
                archived_count = 0
                for j in jobs:
                    if j.get('phase') in ('done', 'completed'):
                        j['phase'] = 'archived'
                        j['status'] = 'archived'
                        j['updatedAt'] = now_ms_arch
                        if 'history' not in j:
                            j['history'] = []
                        j['history'].append({'ts': now_ms_arch, 'event': 'archived'})
                        archived_count += 1
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'archived': archived_count})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        # Create a new job
        if clean_path == '/api/mission-control-jobs/create':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
                title = (payload.get('title') or '').strip()
                if not title:
                    raise ValueError('Title is required')
                jobs = load_mission_control_jobs()
                import time
                now_ms = int(time.time() * 1000)
                # Auto-increment job number
                max_num = 0
                for j in jobs:
                    num_str = (j.get('number') or '')
                    if num_str.startswith('REQ-'):
                        try:
                            n = int(num_str[4:])
                            if n > max_num:
                                max_num = n
                        except ValueError:
                            pass
                new_job = {
                    'id': f'job_{now_ms}_{__import__("random").randint(1000,9999):04d}',
                    'number': f'REQ-{max_num + 1:03d}',
                    'title': title,
                    'description': payload.get('description', payload.get('details', '')),
                    'details': payload.get('details', ''),
                    'assignee': payload.get('assignee', 'Unassigned'),
                    'createdBy': payload.get('createdBy', payload.get('assignee', 'Unassigned')),
                    'assignedBy': payload.get('assignedBy', payload.get('createdBy', 'Alfred')),
                    'priority': payload.get('priority', 'normal'),
                    'project': payload.get('project', 'Mission Control'),
                    'status': 'todo',
                    'jobStatus': 'active',
                    'phase': 'todo',
                    'source': 'manual',
                    'needsRewrite': True,
                    'activity': 'new',
                    'workers': [],
                    'subtasks': payload.get('subtasks', []),
                    'history': [{'ts': now_ms, 'event': 'created', 'by': payload.get('createdBy', payload.get('assignee', 'Unassigned'))}],
                    'createdAt': now_ms,
                    'updatedAt': now_ms,
                    'dueDate': payload.get('dueDate') or None,
                    'startedAt': None,
                    'completedAt': None,
                    'qcResult': None,
                }
                jobs.append(new_job)
                save_mission_control_jobs(jobs)
                # Sync to Obsidian vault
                sync_to_vault('create', new_job)
                self._send_json(200, {'ok': True, 'job': new_job})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        # Message routing — relay to Alfred
        if clean_path == '/api/alfred-status':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
            except Exception:
                payload = {}
            import time as _time_status
            payload['updatedAt'] = int(_time_status.time() * 1000)
            status_file = DATA_DIR / 'alfred-status.json'
            status_file.write_text(json.dumps(payload, indent=2), encoding='utf-8')
            self._send_json(200, {'ok': True, **payload})
            return

        # Wake Alfred — triggers OpenClaw heartbeat via cron wake
        if clean_path == '/api/wake-alfred':
            try:
                # Immediate wake
                subprocess.Popen(
                    ['openclaw', 'cron', 'wake', '--mode', 'now', '--text', 'Wake from MC: job on the board needs attention. Check http://127.0.0.1:8787/'],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                # Enable the board-check cron while work is active
                subprocess.Popen(
                    ['openclaw', 'cron', 'enable', 'wake-alfred'],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            except Exception:
                pass
            self._send_json(200, {'ok': True, 'message': 'Alfred wake triggered, board check enabled'})
            return

        if clean_path == '/api/mission-control-message':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
                to_name = (payload.get('to') or '').strip()
                message = (payload.get('message') or '').strip()
                if not to_name or not message:
                    self._send_json(400, {'ok': False, 'error': 'to and message are required'})
                    return

                # Store message in a messages log
                msg_file = UI_ROOT / 'data' / 'messages.json'
                msg_file.parent.mkdir(parents=True, exist_ok=True)
                messages = []
                if msg_file.exists():
                    try:
                        messages = json.loads(msg_file.read_text(encoding='utf-8'))
                        if not isinstance(messages, list):
                            messages = []
                    except Exception:
                        messages = []

                import time as _time_msg
                now_ms_msg = int(_time_msg.time() * 1000)
                msg_entry = {
                    'id': f'msg_{now_ms_msg}',
                    'from': payload.get('from', 'Sam'),
                    'to': to_name,
                    'message': message,
                    'timestamp': now_ms_msg,
                    'routedTo': 'Alfred',
                    'status': 'pending',
                }
                messages.append(msg_entry)
                # Keep last 200 messages
                if len(messages) > 200:
                    messages = messages[-200:]
                msg_file.write_text(json.dumps(messages, indent=2), encoding='utf-8')

                # Try to relay via openclaw if Alfred session is active
                try:
                    subprocess.run(
                        ['openclaw', 'system', 'event', '--text',
                         f'Message from Sam to {to_name}: {message}',
                         '--mode', 'now'],
                        capture_output=True, text=True, timeout=5
                    )
                except Exception:
                    pass

                self._send_json(200, {'ok': True, 'message': msg_entry})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        self._send_json(404, {'ok': False, 'error': 'Not found'})

    def do_PATCH(self):
        clean_path = self.path.split('?', 1)[0].split('#', 1)[0]
        import re

        plan_ann_match = re.match(r'^/api/mission-control-plan/annotations/([^/]+)$', clean_path)
        if plan_ann_match:
            ann_id = unquote(plan_ann_match.group(1))
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
                status = (payload.get('status') or '').strip()
                if status not in ('proposed', 'approved', 'declined'):
                    raise ValueError('Invalid annotation status')
                import time as _time_plan_patch
                state = load_plan_state()
                target = None
                for ann in state.get('annotations', []):
                    if ann.get('id') == ann_id:
                        target = ann
                        break
                if not target:
                    self._send_json(404, {'ok': False, 'error': 'Annotation not found'})
                    return
                target['status'] = status
                target['decidedBy'] = payload.get('by', 'Sam')
                target['updatedAt'] = int(_time_plan_patch.time() * 1000)
                save_plan_state(state)
                self._send_json(200, {'ok': True, 'annotation': target, 'plan': state})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        # PATCH /api/mission-control-jobs/{id} — update job fields (priority, etc)
        mc_job_patch_match = re.match(r'^/api/mission-control-jobs/([^/]+)$', clean_path)
        if mc_job_patch_match and not clean_path.endswith('/subtasks'):
            job_id = unquote(mc_job_patch_match.group(1))
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
            except Exception:
                payload = {}

            job, jobs = find_job_by_id(job_id)
            if not job:
                self._send_json(404, {'ok': False, 'error': 'Job not found'})
                return

            # Allowed fields to patch
            _allowed_fields = ('priority', 'assignee', 'title', 'description', 'dueDate', 'jobStatus', 'assignedBy', 'needsRewrite', 'phase')
            _ignored = [k for k in payload if k not in _allowed_fields and k not in ('subtasks', 'addSubtasks', 'by') and not k.startswith('_')]
            for field in _allowed_fields:
                if field in payload:
                    job[field] = payload[field]
                    # Add history entry for jobStatus changes
                    if field == 'jobStatus' and payload[field] in ('paused', 'stopped', 'active'):
                        import time as _time_js
                        job['history'].append({
                            'ts': int(_time_js.time() * 1000),
                            'event': f'job {payload[field]}',
                            'by': payload.get('by', 'Alfred'),
                        })
                    # Phase transition — use proper transition function
                    if field == 'phase':
                        result_job, result_err = transition_job_phase(job_id, payload[field], by=payload.get('by', 'Alfred'))
                        if result_err:
                            import sys as _sys_phase_err
                            print(f'[PATCH] phase transition failed: {result_err}', file=_sys_phase_err.stderr)
                        # Refresh job reference after transition
                        job, jobs = find_job_by_id(job_id)

            # Support adding new subtasks via PATCH
            if 'addSubtasks' in payload:
                existing_ids = {st.get('id') for st in job.get('subtasks', [])}
                for new_st in payload['addSubtasks']:
                    if new_st.get('id') and new_st['id'] not in existing_ids:
                        st_obj = {
                            'id': new_st['id'],
                            'title': new_st.get('title', new_st['id']),
                            'status': new_st.get('status', 'pending'),
                            'startedBy': None,
                            'completedBy': None,
                            'startedAt': None,
                            'completedAt': None,
                        }
                        job.setdefault('subtasks', []).append(st_obj)
                        existing_ids.add(new_st['id'])

            # Support updating existing subtask statuses via PATCH
            if 'subtasks' in payload and isinstance(payload['subtasks'], list):
                subtask_map = {st.get('id'): st for st in job.get('subtasks', [])}
                valid_statuses = ('pending', 'in-progress', 'done', 'cancelled')
                import time as _time_patch_st
                now_ms_patch = int(_time_patch_st.time() * 1000)
                for upd in payload['subtasks']:
                    st_id = upd.get('id', '')
                    new_status = upd.get('status', '')
                    if st_id in subtask_map and new_status in valid_statuses:
                        subtask_map[st_id]['status'] = new_status
                        if new_status == 'done':
                            subtask_map[st_id]['completedAt'] = now_ms_patch
                            subtask_map[st_id]['completedBy'] = upd.get('completedBy') or upd.get('by', 'Alfred')
                        elif new_status == 'in-progress':
                            subtask_map[st_id]['startedAt'] = now_ms_patch
                            subtask_map[st_id]['startedBy'] = upd.get('startedBy') or upd.get('by', 'Alfred')
                        elif new_status == 'cancelled':
                            subtask_map[st_id]['cancelledAt'] = now_ms_patch
                            subtask_map[st_id]['cancelledBy'] = upd.get('by', 'Alfred')
                        if 'history' not in job:
                            job['history'] = []
                        st_title = subtask_map.get(st_id, {}).get('title', '')
                        title_suffix = f' — {st_title}' if st_title else ''
                        job['history'].append({
                            'ts': now_ms_patch,
                            'event': f'subtask {st_id} {new_status}{title_suffix}',
                            'by': upd.get('by', 'Alfred'),
                        })

            import time as _time_patch
            job['updatedAt'] = int(_time_patch.time() * 1000)
            save_mission_control_jobs(jobs)
            # Sync to vault if phase or subtasks changed
            if 'phase' in payload or 'subtasks' in payload or 'addSubtasks' in payload:
                sync_to_vault('update', job)
            response = {'ok': True, 'job': job}
            if _ignored:
                response['warnings'] = [f'ignored field: {f}' for f in _ignored]
            self._send_json(200, response)
            return

        mc_subtask_match = re.match(r'^/api/mission-control-jobs/([^/]+)/subtasks$', clean_path)
        if mc_subtask_match:
            job_id = unquote(mc_subtask_match.group(1))
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
            except Exception:
                payload = {}

            job, jobs = find_job_by_id(job_id)
            if not job:
                self._send_json(404, {'ok': False, 'error': 'Job not found'})
                return

            # Support single update or batch
            updates = payload.get('updates', [])
            if not updates and payload.get('subtaskId'):
                updates = [{'subtaskId': payload['subtaskId'], 'status': payload.get('status', 'pending')}]

            valid_statuses = ('pending', 'in-progress', 'done', 'cancelled')
            subtask_map = {st.get('id'): st for st in job.get('subtasks', [])}

            import time as _time_st
            now_ms_st = int(_time_st.time() * 1000)

            for upd in updates:
                st_id = upd.get('subtaskId', '')
                new_status = upd.get('status', 'pending')
                if st_id in subtask_map and new_status in valid_statuses:
                    subtask_map[st_id]['status'] = new_status
                    # Track completion metadata
                    if new_status == 'done':
                        subtask_map[st_id]['completedAt'] = now_ms_st
                        subtask_map[st_id]['completedBy'] = upd.get('by', 'Alfred')
                    elif new_status == 'in-progress':
                        subtask_map[st_id]['startedAt'] = now_ms_st
                        subtask_map[st_id]['startedBy'] = upd.get('by', 'Alfred')
                    elif new_status == 'cancelled':
                        subtask_map[st_id]['cancelledAt'] = now_ms_st
                        subtask_map[st_id]['cancelledBy'] = upd.get('by', 'Alfred')
                    if 'history' not in job:
                        job['history'] = []
                    # Include subtask title in event for better readability
                    st_title = subtask_map.get(st_id, {}).get('title', '')
                    title_suffix = f' — {st_title}' if st_title else ''
                    job['history'].append({
                        'ts': now_ms_st,
                        'event': f'subtask {st_id} {new_status}{title_suffix}',
                        'by': upd.get('by', 'Alfred'),
                    })

            job['updatedAt'] = now_ms_st
            save_mission_control_jobs(jobs)

            # Auto-transition: if all subtasks are done (ignore cancelled), move job to done
            subtasks = job.get('subtasks', [])
            active_subtasks = [st for st in subtasks if st.get('status') != 'cancelled']
            if active_subtasks and job.get('phase') != 'done':
                all_done = all(st.get('status') == 'done' for st in active_subtasks)
                if all_done:
                    import time as _time_done
                    now_ms_done = int(_time_done.time() * 1000)
                    job['phase'] = 'done'
                    job['status'] = 'done'
                    job['completedAt'] = now_ms_done
                    job['updatedAt'] = now_ms_done
                    if 'history' not in job:
                        job['history'] = []
                    job['history'].append({'ts': now_ms_done, 'event': 'all_subtasks_done_auto', 'by': 'System'})
                    save_mission_control_jobs(jobs)

            self._send_json(200, {'ok': True, 'job': job})
            return

        self._send_json(404, {'ok': False, 'error': 'Not found'})


if __name__ == '__main__':
    import time as _time
    _SERVER_START_TIME = _time.time()
    os.chdir(UI_ROOT)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_JSON.exists():
        DATA_JSON.write_text('[]\n', encoding='utf-8')
    if not CONFIG_JSON.exists():
        CONFIG_JSON.write_text('{}\n', encoding='utf-8')
    if not MISSION_CONTROL_JOBS_JSON.exists():
        MISSION_CONTROL_JOBS_JSON.parent.mkdir(parents=True, exist_ok=True)
        MISSION_CONTROL_JOBS_JSON.write_text('[]\n', encoding='utf-8')
    MISSION_CONTROL_SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    sync_selected_root_link()
    # Start background OpenClaw status refresher
    _oc_thread = _threading.Thread(target=_refresh_oc_status, daemon=True, name='oc-status-refresher')
    _oc_thread.start()
    print('[oc-status] Background refresher started (60s interval)')
    # Set SO_REUSEADDR on the class before instantiation
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer(('0.0.0.0', 8787), Handler)
    print('Creative Ops UI dev server running on http://0.0.0.0:8787')
    print('Market Dashboard available at http://0.0.0.0:8787/dashboard/')
    server.serve_forever()
