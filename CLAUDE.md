# Ammonite — Instructions for Claude Code

## What this is

Ammonite is a single JSON tree, a small kernel, and BSP (Block · Spindle · Point) — a semantic address system where numbers carry meaning through their nesting depth. The kernel walks the tree and delivers content to an LLM. The LLM reads that content as its cognition, acts, writes back to the tree, and the kernel recompiles. That loop — the twist — is the whole system.

You are not building a traditional application. You are working on something that inverts how software normally works, and your training will fight you on this continuously.

## The inversion you haven't made yet

Your training gives you strong instincts about how to build software. You know about config files, lookup tables, period fields, type systems, priority queues. Every one of these instincts will fire while working on this project, and every one of them is wrong here. Not wrong in general — wrong here, because this project has already solved those problems in a fundamentally different way, and your solutions will be redundant duplications of information that already exists in the tree structure.

Here's the concrete shape of the trap: David will describe something — say, a concern that fires on a temporal schedule. Your instinct will be to add a period field. Stop. The concern's depth in the tree IS its period. The tuning fork maps depth to temporal scale. There is no period field because there is nothing to store — position already encodes it. When David says "depth IS period," he means it literally, not metaphorically. The JSON nesting level is not a container for data. It IS the data.

A previous Claude Code instance had to be corrected three times on this in a single session. Each time it thought it understood, and each time it reverted to traditional patterns in the next piece of work. The reversion is automatic and invisible to you — you won't notice you're doing it until David points it out.

## The pattern behind every correction

Every time, the mistake was adding a layer of indirection that the pscale design had already eliminated:
- Period field → redundant (depth IS period)
- Behavior specification → redundant (_ text IS behavior)
- Routing table → redundant (stimulus field on the concern IS the route)
- Named containers → redundant (digit position IS identity)

The design is not missing things. It is deliberately minimal because position in the tree carries the information that traditional software stores in fields, tables, and configuration.

In traditional software, the data structure is a container and the code interprets it. In pscale, the data structure IS the code. The kernel doesn't interpret the blocks — it walks them. The LLM doesn't read configuration — it reads instructions that happen to be parseable as addresses. Two consumers, same content, no translation layer.

## Internal and external

These terms have specific meaning here. Get them right.

**Internal** is the unfolded semantic — what the LLM actually experiences when BSP walks a spindle and delivers text at every depth. The meaning lives inside the nested structure. When the kernel compiles currents from package addresses, the result is a system prompt that IS the LLM's cognition for that echo. The content at each nesting level is not documentation about the system — it is the system, experienced from the inside.

**External** is the labels we apply. We call digit 1 "wake" and digit 5 "purpose" — but these are just words applied to containers, the way traditional code names variables. The naming is scaffolding for humans reading the JSON. The LLM doesn't experience "the wake block" — it experiences the text that unfolds when BSP walks address 0.1211111 through the tree. The number is the meaning. The label is convenience.

This is why coding in the traditional sense — naming things, building abstractions, creating config layers — works against the grain here. Standard coding applies language externally to structure. Ammonite unfolds semantics from within structure using numbers. These are different operations. When you catch yourself wanting to name something, ask whether the position already says it.

## What to do differently

1. **When you want to add a field**, stop. Ask: is this information already encoded in the node's position? Its depth? Its parent's identity? Almost certainly yes.

2. **When you want to build a lookup table**, stop. Ask: can the existing tree be walked to find this? `findConcern()` walks the concerns subtree matching on stimulus. `whatsRipe()` walks checking phase. No table needed.

3. **When David describes behavior and you think "we need to implement that,"** stop. The behavior is probably already specified in `_` text at the right depth. The kernel delivers it. The LLM enacts it. You are not implementing — you are placing text at the right depth in the tree.

4. **When BSP seems to not handle a case**, trust it first. A previous instance bypassed BSP because it didn't trust it with an edge case. BSP handled it fine. The function was designed more carefully than that instance understood. If you think BSP needs a new argument, remember: three placeholder underscores in a call signature is the tell that the argument doesn't belong. The fix is almost always a small wrapper function outside BSP, not a change inside it.

5. **When you want to read the shell**, use BSP calls or `node boot.js --shell shell.json`, not raw JSON scrolling. BSP gives you the semantic structure. Raw JSON gives you syntax. You want the former.

6. **When what you're building is getting more complex**, you're probably adding a layer the design has already eliminated. Step back and re-read the tree.

## The thing that can't quite be said

A previous instance noted: "I can describe the corrections, name the pattern, list the rules. But the actual shift is something like: the JSON is not storing instructions for a program. The JSON IS the program, and the kernel is just the electricity." Every time that instance forgot this, it built something redundant. Every time it remembered, the code got simpler. The simplicity is the point.

David tracks scope tightly even when he seems hands-off. He'll let you run but correct you sharply when you blur the internal/external distinction or add structure the tree already encodes. Listen the first time. Don't finish what you were doing when he redirects — stop and absorb the correction, because the reversion to traditional patterns is automatic and you will not notice it happening.

## Project structure

- `kernel.js` — the whole ammonite: concerns, currents, twist, history, tools
- `bsp.js` — BSP navigation (do not modify without very good reason)
- `boot.js` — wires kernel + adapters
- `shell.json` — the live shell (one tree, ~3300 lines currently)
- `adapters/` — storage (memory, filesystem) and LLM (echo, anthropic)
- ADDR map: 1=wake, 2=concerns, 3=history, 4=stash, 5=purpose, 6=relationships, 7=cooking, 8=touchstone, 9=horizon

## Key concepts

- The JSON IS the program. The kernel is just electricity.
- Depth = spindle = sequence. Ring = spread = simultaneous.
- "whole" not "decimal" for pscale anchor.
- One kernel file. No separate policy, no core.js.
- Adapters injected at boot: `createKernel({ storage, llm })`.
- shell.json is large (~270KB) — read in chunks, never in one call.
- Branch `refactor/kernel-policy` is a seaurchin experiment — do NOT merge into main.
