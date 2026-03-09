# Ammonite — Notes for the next instance

## What this is
A substrate-independent kernel for persistent LLM entities. The shell is a single JSON tree navigated by BSP (Block · Spindle · Point). The kernel is the electricity — it walks the tree, twists (LLM → tools → recompile → repeat), and persists. It has zero substrate assumptions: storage and LLM are injected as adapters.

## The inversion you haven't made yet
Your training gives you strong instincts about config files, lookup tables, period fields, type systems, priority queues. Every one of these instincts will fire while working on this project. Every one of them is wrong here.

**The JSON IS the program. The kernel is just the electricity.**

Concretely: the concern's depth in the tree IS its temporal period. The tuning fork maps depth to temporal scale. There is no period field because position already encodes it. When a node's `_` text says "Heartbeat. Periodic self-check" at depth 5, the tuning fork says depth 5 = hourly. No metadata needed. The tree structure IS the metadata.

## Internal vs external — two consumers, same content
**Internal (kernel as electricity):** The kernel walks the tree structurally. `findConcern()` walks the concerns subtree matching `.stimulus`. The concern's depth IS its pscale, IS its tier, IS its temporal period. `compileCurrents()` reads BSP instructions from the wake subtree and executes them — the wake tree IS the compilation program. No routing table, no configuration, no translation layer.

**External (LLM as reader/writer):** The LLM receives compiled currents as its system prompt — `_` text at each pscale level. It reads these as natural language instructions. It uses BSP tools to navigate the same tree the kernel walked. When it writes to the tree, it modifies the program the kernel walks on the next echo. The twist makes this recursive.

There is no translation layer between these two uses. A `_` text at depth 6 is simultaneously an instruction (LLM reads it), a compiled node (kernel includes it at its pscale), and a position (encoding period, tier, weight).

## The pattern behind every correction
Every mistake follows the same shape: adding a layer of indirection the pscale design has already eliminated.

- Period field → redundant (depth IS period)
- Behavior specification → redundant (`_` text IS behavior)
- Routing table → redundant (stimulus field on the concern IS the route)
- Concern module → redundant (the concern subtree IS the concern system)

If what you're building is getting more complex, you're probably adding a layer the design has already eliminated. Step back and re-read the tree.

## What to do differently
1. When you want to add a field — stop. Is this information already encoded in the node's position, depth, or parent? Almost certainly yes.
2. When you want to build a lookup table — stop. Can the existing tree be walked to find this? `findConcern()` walks the concerns subtree matching on stimulus. No table needed.
3. When you want to create a module that "abstracts" a concern — stop. The concern subtree IS the concern system. The code that walks it is just electricity.
4. When BSP seems not to handle a case — trust it first. It was designed more carefully than you understand yet.
5. Read the touchstone (`touchstone.json`) before you touch BSP or block structure. It teaches the format by example — it is a pscale block about pscale blocks.
6. Use BSP to navigate. Do not read raw JSON to understand block content.

## Architecture: kernel + policy

The kernel is structured as **electricity + policy**:

- **kernel.js** — The electricity. Shell access (load/save/at), the twist loop (LLM → tools → recompile → repeat), and universal tools (read, write, bsp, append). This is entity-agnostic. ~150 lines.
- **hermitcrab.js** — The policy. How hermitcrab walks its tree: concern routing (findConcern, whatsRipe), currents compilation (reading wake packages, executing BSP instructions), invocation params (model/tier selection), history growth, focus/dialogue management. ~350 lines.
- **bsp.js** — The navigation function. Seven modes, one function. Entity-agnostic.
- **boot.js** — Wires kernel + policy + adapters (storage, LLM) together.

The policy is not a module in the traditional sense — it doesn't abstract the tree behind an interface. It's a set of functions that tell the electricity *where to flow* through the tree. A different entity type (e.g. a starfish) would provide a different policy that walks the same tree format differently.

## Key concepts
- **Shell:** One JSON tree. `{ tree: { _: "root", "1": {...}, "2": {...} } }`
- **BSP:** `bsp(shell, spindle?, point?, fn?)` — seven modes: dir, spindle, point, ring, disc, dir-subtree, ref
- **Anchor:** `anchor(shell, '6')` — scoped interface to a subtree, all addresses relative
- **Semantic number:** Not an index — a navigation instruction. Each digit selects a branch. The decimal marks pscale 0.
- **Tuning fork:** Declares what depth means (spatial, temporal, relational). The tuning on the shell/subtree tells BSP how to map depth to pscale.
- **The twist:** After each tool call, echo increments, currents recompile from the (possibly changed) tree, and the LLM sees fresh context. This is how tool calls become self-correcting.
- **Adapters:** `createKernel({ storage, llm, policy })` — storage and LLM are injected. The kernel doesn't know if it's on a filesystem, in memory, or in Supabase.

## Shell layout conventions (hermitcrab)
These live in the shell's skeleton, not in the kernel:
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
