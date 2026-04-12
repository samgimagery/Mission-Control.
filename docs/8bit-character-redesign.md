# Mission Control, 8-bit Character Redesign (Character-First)

## What was reviewed
- Existing lounge-style character cards in `index.html` and `styles.css`
- Existing sprite support in `assets/characters.css`
- Agent identity data in `data/alfred-profile.json`

## Design goal
Shift the characters to a clear retro 8-bit read while preserving role clarity at a glance:
- **Alfred** = chief/orchestrator, structured and premium
- **Jackson** = builder/coder, cool dark palette + cyan tech accents
- **Gemma** = design/research, warm hair + magenta-violet visual identity

## Implemented assets
1. **New stylesheet:** `assets/characters-8bit.css`
   - Pixel-grid look via block geometry and hard-edged borders
   - 3 character palettes with role-coded accent colors
   - Step-based movement/idle feel to reinforce retro motion
   - Pixel-styled chat bubble typography + box styling

2. **Markup updated:** `index.html`
   - Character nodes now use `.agent-character` sprite blocks
   - Kept existing scene layout, swapped just character rendering layer

## Character concept specs

### 1) Alfred, “Command Butler”
- Base silhouette: square shoulders, formal coat
- Palette:
  - Coat: `#2f4f90` / highlight `#5572be`
  - Skin: `#f0cfaa`
  - Hair: `#3c2d24`
  - Accent: `#f6d175` (gold trim)
- Readability cue: strongest contrast, centered authority vibe

### 2) Jackson, “Ops Coder”
- Base silhouette: practical hoodie-like shape
- Palette:
  - Jacket: `#2f3f63` / highlight `#516288`
  - Skin: `#8f6147`
  - Hair: `#171717`
  - Accent: `#53d2ff` (terminal cyan)
- Readability cue: cooler tones + technical accent

### 3) Gemma, “Design Analyst”
- Base silhouette: softer, research-oriented with bright hair block
- Palette:
  - Cardigan: `#7552ab` / highlight `#9879cc`
  - Skin: `#f3d3b4`
  - Hair: `#f1cd71`
  - Accent: `#ffd7fa` (pink-lilac)
- Readability cue: warm + creative color signature

## Production notes
- The new pass is **CSS-driven sprite art** for fast iteration.
- It is easy to migrate to PNG sprite sheets later by replacing `.agent-character::before/::after` backgrounds.
- Current scaling target: 52x58 logical sprite area inside each character slot.

## Next pass recommended (after Sam approves this character direction)
1. Add full walk-cycle sprite sheets (2-4 frames per agent).
2. Convert office props/furniture to matching 8-bit tiles.
3. Shift global UI chrome (buttons/cards/panels) to hard-edged pixel system for full visual consistency.
