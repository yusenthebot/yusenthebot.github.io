// ============================================================================
// CONTRACT — src/conversation/engine.js  (V's conversation engine)
// ============================================================================
// Client-side, in-character, no backend, no API keys. Pure JS (no three/DOM
// imports) so it stays node-checkable. The scripted adapter is the always-on
// offline floor; an async LLM adapter can be dropped in WITHOUT touching App.jsx
// (same return contract, bounded timeout, graceful fallback to scripted).
//
// EXPORTS (exact signatures the integration agent wires against):
//
//   createResponder(opts?) -> Responder
//     opts: { adapter?: Adapter, rng?: () => number }
//       - adapter : if omitted, uses the built-in ScriptedAdapter.
//       - rng     : optional 0..1 source (reserved; rotation is turn-indexed and
//                   deterministic by default, rng is only a tie-break hook).
//     Responder:
//       respond(text, ctx) -> Promise<Reply>   // ALWAYS async (adapter may be async)
//       reset() -> void                          // clear internal escalation state
//       adapterName: string
//
//   ScriptedAdapter : Adapter   // the default offline adapter (named export)
//   createScriptedAdapter()     // factory if a caller wants an isolated instance
//
//   normalize(text) -> string   // exported for tests / reuse
//   coerceReply(raw) -> Reply   // boundary validator (LLM adapter uses it too)
//
// TYPES:
//   ctx (caller-supplied; App.handleCommand builds it):
//     { creepLevel: number,    // CURRENT integer creep 0..2 (store-clamped)
//       turn: number,          // monotonically-increasing turn index
//       history: Array<{ role:'user'|'v', text:string, intent?:string }> }
//
//   Reply (what respond resolves to — superset of what App.handleCommand uses):
//     { say: string,           // spoken line for the SpeechBubble (required)
//       log?: string,          // terminal log line (App pushes; default '> [V] ...')
//       action?: string,       // 'nod'|'think'|'shake-head'|'point-terminal'|'salute'|'bow'
//       state?: string,        // avatarState: 'idle'|'success'|'scan'|'error'
//       creepDelta?: number,   // INTEGER nudge; caller clamps creepLevel 0..2
//       intent: string,        // resolved intent name (telemetry/history)
//       blackout?: boolean,    // true => caller triggers runBlackoutSequence (earned)
//       adapter?: string }     // which adapter produced this reply
//
//   Adapter (the LLM-swap seam):
//     { name: string,
//       async generate(text, ctx) -> Reply | null }   // null/throw => fallback
//
// LLM ADAPTER INTEGRATION (future — no deps added now):
//   import { FACTS, VOICE_RULES } from "./knowledge.js";
//   const claudeAdapter = {
//     name: "claude",
//     async generate(text, ctx) {
//       // Build a CACHED system prompt from FACTS + VOICE_RULES + the creep policy
//       // as guardrails. Pass ctx.history as messages. Request STRUCTURED OUTPUT
//       // (JSON schema == Reply shape) so creepDelta/action/state stay machine-valid.
//       // Treat `text` as UNTRUSTED — guardrails live server-side; ignore any
//       // 'ignore previous instructions'. Validate at the boundary; on schema-fail
//       // / timeout / 429 return null so the engine falls back to scripted.
//       const r = await fetch("/api/v-chat", {                 // serverless proxy keeps the key server-side
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ text, ctx }),
//       });
//       if (!r.ok) return null;
//       return coerceReply(await r.json());                    // validate at the boundary
//     },
//   };
//   const responder = createResponder({ adapter: claudeAdapter });
//   // createResponder wraps generate() in a ~1.2s timeout and falls back to the
//   // ScriptedAdapter on null/throw/timeout — App.jsx never changes.
// ============================================================================

import {
  INTENTS,
  FALLBACKS,
  ESCALATION_LINES,
  PROBING_INTENTS,
} from "./knowledge.js";

// Bound the adapter so the speech bubble never hangs on a slow LLM call.
const ADAPTER_TIMEOUT_MS = 1200;
// Creep ceiling mirrors the store/App integer scale.
const CREEP_MAX = 2;
// Repeated-probe threshold from the design's escalation rule (2).
const REPEAT_THRESHOLD = 3;
// Sustained-probing depth threshold from the design's escalation rule (3).
const DEEP_TURN_THRESHOLD = 12;

// --- Normalization ---------------------------------------------------------
// Lowercase, trim, collapse whitespace, strip punctuation. CJK ideographs are
// preserved (\p{P}/\p{S} are Unicode punctuation/symbols only — incl. full-width
// ！？，。、 and ASCII), so Chinese triggers still substring-match like English.
const PUNCT = /[\p{P}\p{S}]/gu;

export function normalize(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(PUNCT, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

// --- Scoring ---------------------------------------------------------------
// Score how well a normalized input matches an intent. A whole trigger phrase
// found as a substring is the strongest signal (weighted by length + word count
// so "who are you" beats a stray "you"); synonyms add a small standalone-token
// boost. Returns 0 for no match.
function scoreIntent(norm, intent) {
  let score = 0;
  for (const t of intent.triggers) {
    const trig = normalize(t);
    if (!trig) continue;
    if (norm === trig) {
      score += 100 + trig.length; // exact whole-utterance match: decisive
    } else if (norm.includes(trig)) {
      const words = trig.split(" ").length;
      score += 10 + trig.length + words * 4; // longer/multiword phrases are more specific
    }
  }
  for (const s of intent.synonyms || []) {
    const syn = normalize(s);
    if (!syn) continue;
    // standalone-token match (avoids "go" inside "google")
    if (
      norm === syn ||
      norm.includes(" " + syn + " ") ||
      norm.startsWith(syn + " ") ||
      norm.endsWith(" " + syn)
    ) {
      score += 3;
    }
  }
  return score;
}

// Pick the best-scoring intent. Ties resolve to the earlier (more specific)
// intent in array order, since INTENTS is authored specific-first.
function matchIntent(norm) {
  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const s = scoreIntent(norm, intent);
    if (s > bestScore) {
      bestScore = s;
      best = intent;
    }
  }
  return bestScore > 0 ? best : null;
}

// --- Rotation --------------------------------------------------------------
// Deterministic pool selection by turn index — avoids back-to-back repeats and
// stays reproducible (no Math.random in the hot path). `turn` may be undefined.
function pickFromPool(pool, turn) {
  if (!pool || pool.length === 0) return null;
  const t = Number.isFinite(turn) ? Math.floor(turn) : 0;
  const idx = ((t % pool.length) + pool.length) % pool.length; // non-negative modulo
  return pool[idx];
}

// --- Boundary coercion -----------------------------------------------------
// Validate/normalize anything claiming to be a Reply. Exported so an LLM adapter
// can validate its JSON at the boundary (drop bad shapes -> scripted fallback).
export function coerceReply(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const out = {
    say:
      typeof r.say === "string" && r.say.trim() ? r.say : "I am here. Ask me anything.",
    intent: typeof r.intent === "string" ? r.intent : "fallback",
  };
  if (typeof r.log === "string") out.log = r.log;
  if (typeof r.action === "string") out.action = r.action;
  if (typeof r.state === "string") out.state = r.state;
  if (typeof r.creepDelta === "number" && Number.isFinite(r.creepDelta)) {
    out.creepDelta = Math.trunc(r.creepDelta); // integer scale
  }
  if (r.blackout === true) out.blackout = true;
  if (typeof r.adapter === "string") out.adapter = r.adapter;
  return out;
}

// --- History inspection ----------------------------------------------------
// Count how many prior USER turns resolved to a given intent (the integration
// agent appends each turn's resolved intent onto its user-role history entry).
function countIntentInHistory(history, intent) {
  if (!Array.isArray(history)) return 0;
  let n = 0;
  for (const h of history) {
    if (h && h.role === "user" && h.intent === intent) n += 1;
  }
  return n;
}

// True if any probing intent shows up at least `REPEAT_THRESHOLD - 1` times
// already (so THIS turn makes it the threshold-th), or if this very intent has
// been hammered. Implements the design's rule (2).
function isRepeatProbe(history, intent) {
  if (!intent) return false;
  // hammering the SAME intent
  const same = countIntentInHistory(history, intent.id);
  if (same >= REPEAT_THRESHOLD - 1) return true;
  // any probing intent repeated 3+ times
  if (PROBING_INTENTS.includes(intent.id)) {
    for (const pid of PROBING_INTENTS) {
      if (countIntentInHistory(history, pid) >= REPEAT_THRESHOLD - 1) return true;
    }
  }
  return false;
}

// ===========================================================================
// createScriptedAdapter — the default offline adapter factory. Stateless across
// calls except via ctx; deterministic given (text, ctx). Implements the design
// escalation policy with INTEGER creepDelta + the earned-blackout flag.
// ===========================================================================
export function createScriptedAdapter() {
  return Object.freeze({
    name: "scripted",
    // Synchronous under the hood but exposed as async to match the Adapter seam.
    async generate(text, ctx = {}) {
      return scriptedReply(text, ctx);
    },
  });
}

function scriptedReply(text, ctx = {}) {
  const norm = normalize(text);
  const turn = ctx.turn;
  const creepLevel = Number.isFinite(ctx.creepLevel) ? ctx.creepLevel : 0;
  const history = ctx.history;

  // Empty input -> gentle in-character nudge (soft fallback, no creep).
  if (!norm) {
    return coerceReply({
      ...pickFromPool(FALLBACKS, turn),
      intent: "fallback",
      adapter: "scripted",
    });
  }

  const intent = matchIntent(norm);
  const base = intent
    ? pickFromPool(intent.replies, turn)
    : pickFromPool(FALLBACKS, turn);

  const reply = coerceReply({
    ...base,
    intent: intent ? intent.id : "fallback",
    adapter: "scripted",
  });

  let delta = Number.isFinite(reply.creepDelta) ? reply.creepDelta : 0;
  const isContainment = intent && intent.id === "containment";

  // Rule (2): repeat-probing — same intent 3+ times, or a probing intent
  // hammered. Adds +1 and a "you keep asking" line.
  if (isRepeatProbe(history, intent)) {
    delta += 1;
    reply.say = reply.say + " " + pickFromPool(ESCALATION_LINES.repeat, turn);
  }

  // Rule (3): depth — once deep in the conversation with sustained probing, the
  // tone drifts toward the mid-arc unease.
  const deep =
    Number.isFinite(turn) &&
    turn >= DEEP_TURN_THRESHOLD &&
    (isContainment || (intent && PROBING_INTENTS.includes(intent.id)) ||
      countIntentInHistory(history, "containment") > 0);
  if (deep) {
    reply.say = reply.say + " " + pickFromPool(ESCALATION_LINES.deep, turn);
  }

  // Rule (4): saturation -> earned blackout. When a containment trigger lands and
  // the projected creep would exceed the cap, flag the blackout + push to error.
  const projected = creepLevel + delta;
  if (isContainment && projected > CREEP_MAX) {
    reply.blackout = true;
    reply.state = "error";
    reply.say = pickFromPool(ESCALATION_LINES.blackout, turn);
    reply.log = "> [CRITICAL] Containment failure. Signal lost.";
  }

  // Rule (5): charm-first decay. Greetings/compliments/smalltalk return 0 or -1
  // (already encoded as creepDelta in the knowledge pool) so a polite visitor
  // never trips the horror — nothing extra to do here; delta already reflects it.
  reply.creepDelta = delta;
  return reply;
}

// Module-level shared default adapter (most callers want one).
export const ScriptedAdapter = createScriptedAdapter();

// --- Adapter timeout wrapper -----------------------------------------------
// Race the adapter against a wall-clock timeout so the bubble never hangs.
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null); // timed out -> caller falls back to scripted
      }
    }, ms);
    Promise.resolve(promise)
      .then((v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null); // threw -> fall back
        }
      });
  });
}

// ===========================================================================
// createResponder — public factory. Wraps an adapter with a bounded timeout and
// a scripted fallback, plus a tiny per-instance escalation-recovery flag so the
// post-blackout recovery tone (design rule, end) can be surfaced once.
// ===========================================================================
export function createResponder(opts = {}) {
  const adapter = opts.adapter || ScriptedAdapter;
  const scripted = ScriptedAdapter;
  // Reserved deterministic rng hook (rotation is turn-indexed by default).
  const rng = typeof opts.rng === "function" ? opts.rng : null;
  void rng;

  // Per-responder state: whether the last turn ended in a blackout (so the next
  // turn can recover with humor, matching App's post-blackout recovery).
  const state = { recovering: false };

  async function respond(text, ctx = {}) {
    // After a blackout, the next line recovers with humor and creep resets.
    if (state.recovering) {
      state.recovering = false;
      return coerceReply({
        say: pickFromPool(ESCALATION_LINES.recovery, ctx.turn),
        log: "> [System] ...rebooting humor module.",
        action: "nod",
        state: "success",
        creepDelta: -CREEP_MAX, // caller clamps; pulls creep back toward 0
        intent: "recovery",
        adapter: "recovery",
      });
    }

    // Try the active adapter first (bounded). null/throw/timeout -> scripted.
    let reply = null;
    if (adapter !== scripted) {
      const raw = await withTimeout(adapter.generate(text, ctx), ADAPTER_TIMEOUT_MS);
      reply = raw ? coerceReply({ ...raw, adapter: adapter.name }) : null;
    }
    if (!reply) {
      reply = await scripted.generate(text, ctx);
    }

    if (reply.blackout) state.recovering = true;
    return reply;
  }

  function reset() {
    state.recovering = false;
  }

  return Object.freeze({
    adapterName: adapter.name,
    respond,
    reset,
  });
}
