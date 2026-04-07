# Website Improvement Plan

## Current Direction

The site already has a distinct personality. The next step is not to make it more generic; it is to make that personality feel intentional, maintainable, and consistent across screen sizes.

## Main Problems To Solve

### 1. Responsive behavior is reactive, not systemic

There are many mobile fixes, but they mostly live as later overrides. That usually means the desktop layout was built first and mobile was patched afterward.

### 2. Too many visual systems coexist

The repository currently contains:
- the immersive homepage
- a minimalist standalone page
- a Tailwind prototype page
- experimental pages

That is useful for exploration, but the product surface feels fragmented unless those branches are clearly separated.

### 3. Content hierarchy is still weak

The homepage has strong visuals, but the information architecture is not always obvious on first visit:
- what the site is about
- what to click first
- which work is featured vs archival
- how to contact you quickly

### 4. Performance risk grows with visual complexity

The dots system, CRT overlay, heatmap, drag behavior, modal UI, and mobile overrides all stack together. The site can stay expressive, but it needs clearer budgets and fallback rules.

## Recommended Roadmap

### Phase 1: Stabilize the foundation

Goal: make future redesigns easier without changing the site's personality.

Actions:
- keep the modular CSS/JS split and continue grouping by responsibility
- decide which pages are live, legacy, and experimental
- move one-off concepts into a clearly named archive or experiments area later
- document shared conventions for breakpoints, spacing, and typography

Success looks like:
- one obvious homepage architecture
- fewer "where does this live?" moments
- easier onboarding for future edits

### Phase 2: Build a real responsive system

Goal: stop patching mobile late and make layouts scale intentionally.

Actions:
- define breakpoint strategy once and reuse it everywhere
- normalize spacing with a small design token layer
- convert key layouts to mobile-first rules instead of desktop-first overrides
- simplify overly rigid heights, transforms, and absolute positioning on smaller screens
- test four target widths consistently: small phone, large phone, tablet, desktop

Priority surfaces:
- header/nav
- project cards grid
- project modal
- constellation nav
- interests section

### Phase 3: Improve information architecture

Goal: make the site easier to understand within the first 10 to 20 seconds.

Actions:
- clarify the homepage opening state and primary call to action
- create a stronger distinction between featured work and everything else
- shorten project teaser copy on cards and reserve longer narrative for the modal
- surface contact and identity earlier on mobile
- decide whether the minimalist page should remain a separate destination or become a mode/view of the main site

### Phase 4: Create a design system for the personality

Goal: preserve the mood while making it repeatable.

Actions:
- define canonical accent colors and when each is used
- standardize type scales for title, section heading, label, body, metadata
- standardize glow, border, panel, and hover patterns
- document interaction rules for dots, cards, modals, and overlays
- decide which motifs are core to the brand: CRT, oracle text, deck-of-cards, constellation, pixel shapes

Important note:
Right now the site has several strong ideas. The improvement opportunity is curation, not adding more ideas.

### Phase 5: Performance and accessibility pass

Goal: keep the experience rich without punishing weaker devices.

Actions:
- add reduced-motion fallbacks for major animations
- audit keyboard access for modal flows and card interactions
- reduce duplicate effects on mobile where they do not add much value
- lazy-load or defer heavy content where possible
- define a "graceful degradation" mode for low-end devices

## Concrete Ideas Worth Exploring

### Option A: Guided Portfolio Flow

Keep the immersive feel, but guide the visitor through:
- intro
- featured work
- experience
- human side
- contact

This is the strongest option if the site is meant to help new visitors understand you quickly.

### Option B: Deck-First Portfolio

Lean harder into the card/deck metaphor:
- cards are the main interface
- tabs become secondary
- filtering and reshuffling are central
- each card category gets a more distinct visual language

This is the strongest option if experimentation and play are part of the brand.

### Option C: Dual-Mode Site

Make the split between immersive and minimalist explicit:
- immersive mode for discovery
- concise mode for quick professional scanning

This is stronger than maintaining two separate pages that feel only loosely related.

## Suggested Near-Term Backlog

- Audit every page and label it as live, experimental, or archival.
- Reduce duplicated styling patterns across modals and panels.
- Introduce shared design tokens for spacing, radius, accent, and text sizing.
- Rework the homepage for mobile-first layout decisions instead of late overrides.
- Simplify the first-screen experience so the primary action is clearer.
- Decide the future of `minimalist.html`, `outer_siraji_project.html`, and `test.html`.

## Decision Principles

- Do not trade clarity for atmosphere.
- Do not trade personality for generic polish.
- Do not add new interaction systems until the current ones feel coherent on mobile.
- Prefer one strong visual language over three competing ones.
