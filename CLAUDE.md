# Ammonite — Notes for the next Claude

## What this is

A substrate-independent kernel for persistent LLM entities. The shell is a single JSON tree navigated by BSP (Block · Spindle · Point). The kernel is the electricity — it walks the tree, twists (LLM → tools → recompile → repeat), and persists. It has zero substrate assumptions: storage and LLM are injected as adapters.

## The engine underneath: seaurchin

The core unfold engine has been extracted to its own repo: [seaurchin](https://github.com/happyseaurchin/seaurchin) (`/Users/davidpinto/Projects/seaurchin`). Seaurchin is ~130 lines of `nav + read + RT + unfold` per language (JS and Python). It executes Mode 4 blocks — JSON structures that ARE executable programs.

Ammonite's BSP algorithms and twist data processing are already Mode 4 blocks running on seaurchin's unfold. The trajectory is for more of ammonite to become blocks until only the irreducible electricity remains.

## The inversion you haven't made yet

Your training gives you strong instincts about config files, lookup tables, period fields, type systems, priority queues. Every one of these instincts will fire while working on this project. Every one of them is wrong here.

**The JSON IS the program. The kernel is just the electricity.**

Read the seaurchin CLAUDE.md (`/Users/davidpinto/Projects/seaurchin/CLAUDE.md`) before you start. It has a candid account of what the inversion actually takes — written by a Claude that went through it. Two other sessions failed. The failure mode is always the same: you understand the words, you nod, and you start writing JavaScript. The understanding has to go deeper than cognitive. It has to change how you reach for solutions.

### The pattern behind every correction

Every mistake follows the same shape: adding a layer of indirection the pscale design has already eliminated.

- Period field → redundant (depth IS period)
- Behavior specification → redundant (`_` text IS behavior)
- Routing table → redundant (stimulus field on the concern IS the route)
- Concern module → redundant (the concern subtree IS the concern system)
- Helper function → probably redundant (can it be a Mode 4 block?)

If what you're building is getting more complex, you're probably adding a layer the design has already eliminated. Step back and re-read the tree.

## What's been done

### BSP as Mode 4 ✅
All 5 BSP modes are now Mode 4 blocks executed by generic unfold:
- BSP_PARSE, BSP_SPINDLE, BSP_RING, BSP_DIR, BSP_POINT, BSP_DISC_WALK
- 33/33 tests pass against bsp.js reference on live shell.json
- bsp.js (297 lines) is now the reference, not the implementation — the blocks are the implementation

### Twist as Mode 4 ✅
The twist loop's data algorithm is Mode 4:
- TWIST_CHECK (stop_reason), TWIST_EXTRACT (filter tools), TWIST_MESSAGES (build history)
- Async runner (~25 lines) handles timing. Blocks handle data.
- 44/44 tests with mock LLM

### Multi-language key ✅
- core.js and core.py produce identical results on identical blocks
- Cross-kitchen validation proves language independence

### What's next

1. **Seed package** — Move blocks from test files into touchstone.json. The touchstone becomes the single source of truth. core.js + touchstone.json = everything needed to bootstrap.

2. **Context boots** — Thin wrappers that provide environment-specific adapters. The seed + a boot = a running ammonite.

3. **Policy as shell blocks** — hermitcrab.js (~488 lines: concern routing, currents, history) becomes Mode 4 blocks living IN the shell. No hermitcrab.js. The shell carries its own operating instructions. Different organism, different shell, same seed. This is the big one.

## Internal vs external — two consumers, same content

**Internal (kernel as electricity):** The kernel walks the tree structurally. `findConcern()` walks the concerns subtree matching `.stimulus`. The concern's depth IS its pscale, IS its tier, IS its temporal period. `compileCurrents()` reads BSP instructions from the wake subtree and executes them — the wake tree IS the compilation program. No routing table, no configuration, no translation layer.

**External (LLM as reader/writer):** The LLM receives compiled currents as its system prompt — `_` text at each pscale level. It reads these as natural language instructions. It uses BSP tools to navigate the same tree the kernel walked. When it writes to the tree, it modifies the program the kernel walks on the next echo. The twist makes this recursive.

There is no translation layer between these two uses. A `_` text at depth 6 is simultaneously an instruction (LLM reads it), a compiled node (kernel includes it at its pscale), and a position (encoding period, tier, weight).

## Architecture: kernel + policy (current state)

- **kernel.js** — The electricity. Shell access (load/save/at), the twist loop, universal tools. ~362 lines (will shrink as more becomes Mode 4).
- **hermitcrab.js** — The policy. How hermitcrab walks its tree. ~488 lines (target: zero — replaced by shell blocks).
- **core.js** — The key. nav, read, RT, unfold. ~130 lines (will import from seaurchin).
- **bsp.js** — Reference BSP. 297 lines (already replaced by Mode 4 blocks, kept for validation).
- **boot.js** — Wires kernel + policy + adapters together.

## What to do differently

1. When you want to add a field — stop. Is this already encoded in position, depth, or parent?
2. When you want to build a lookup table — stop. Can the tree be walked?
3. When you want to write a helper function — stop. Can this be a Mode 4 block?
4. When you want to add complexity to unfold — stop. Can you solve it with existing ops + a tiny RT primitive?
5. Read the touchstone (`touchstone.json`) before touching BSP or block structure.
6. Run ALL tests after every change: `node test-unfold.js && node test-twist.js`

## Key concepts

- **Shell:** One JSON tree. `{ tree: { _: "root", "1": {...}, "2": {...} } }`
- **BSP:** Block · Spindle · Point — seven modes, one function, now Mode 4 blocks
- **Mode 4 block:** JSON structure that IS an executable program. Digits 1-9 = steps, _ = instruction.
- **Semantic number:** Not an index — a navigation instruction. Each digit selects a branch. The decimal marks pscale 0.
- **"whole":** The pscale anchor — length of the integer part. 0 for delineation, N for accumulation. Not "decimal."
- **Depth = spindle = sequence.** Ring = spread = simultaneous. Don't confuse them.
- **Tuning fork:** Declares what depth means (spatial, temporal, relational).
- **The twist:** LLM → tools → echo++ → recompile currents → repeat. Self-correcting loop.
- **Adapters:** `createKernel({ storage, llm, policy })` — storage and LLM injected.

## Shell layout conventions (hermitcrab)
```
1 = wake (spine, packages, invocation)
2 = concerns (stimulus routing, temporal state)
3 = history (growth tree, append-only)
4 = stash (working memory)
5 = purpose
6 = relationships
7 = cooking (recipes)
8 = touchstone (format spec)
9 = horizon (roadmap)
```
