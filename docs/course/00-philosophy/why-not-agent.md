# Why Not "AI Agent"?

> The framing you choose determines what you build.

---

## The Problem with "Agent"

When you say "AI agent," people hear:
- ChatGPT with tools
- Autonomous bot that does things
- Something that "thinks" and "decides"

This framing leads you to build:
- Chat interfaces as primary input
- LLM-centric architectures
- Systems that break when the LLM is slow/expensive/unavailable

**The word "agent" centers the AI. But AI isn't the point.**

---

## What's Actually Happening

Strip away the hype. What does your system actually do?

1. **Receives intent** — from somewhere (chat, webhook, schedule, API)
2. **Understands intent** — figures out what needs to be done
3. **Plans execution** — determines which capabilities to use, in what order
4. **Executes** — calls APIs, sends emails, updates records
5. **Reports results** — tells someone what happened

The LLM is involved in step 2. Maybe step 3. That's it.

**The LLM is a translator, not the system.**

---

## The Compiler Analogy

Think about what a compiler does:
- Takes human-readable code (C, Java, TypeScript)
- Translates it to machine-executable form
- The compiler isn't the program — it produces the program

An LLM in an orchestration system:
- Takes human-readable intent ("send email to John")
- Translates it to machine-executable form (`{ tool: "send_email", args: { to: "john@..." } }`)
- The LLM isn't the orchestrator — it feeds the orchestrator

**Compilers are replaceable.** You can swap GCC for Clang. The C code still works.

**LLMs should be replaceable too.** Swap Groq for OpenAI. Swap cloud for local. The orchestration still works.

---

## What This Means for Architecture

If you build around "AI agent":
```
User → LLM → Tools → Results
         ↑
    (everything goes through here)
```

If you build around "intent orchestration":
```
Intent Sources → Intent Parser → Plan → Execution → Results
      ↑               ↑
  (many inputs)   (swappable, can be LLM, classifier, or lookup)
```

The second architecture:
- Supports multiple input modalities naturally
- Allows progressive LLM replacement
- Works offline for common patterns
- Scales without LLM costs scaling linearly

---

## The Naming Matters

We call this system **ASO** — App-System-Orchestrator.

Not:
- "AI Assistant" (centers the AI)
- "Agent Framework" (implies autonomy we don't want)
- "Chatbot Platform" (limits the input modality)

The name reflects what it is: **orchestration infrastructure** that happens to use LLMs as one component.

---

## Exercise

Look at your current system (or one you're planning). Ask:

1. What are all the ways intent can enter the system?
2. Where exactly does the LLM fit? What does it actually do?
3. What would happen if you couldn't call the LLM?
4. Which intents are so common they could be lookup tables?

The answers will show you whether you're building an "AI agent" or an orchestration system.

---

*Next: [Intent is Universal](intent-is-universal.md)*
