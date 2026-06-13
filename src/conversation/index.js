// Barrel export for the V conversation engine.
// See engine.js top-of-file CONTRACT for exact signatures + LLM adapter notes.
export {
  createResponder,
  createScriptedAdapter,
  ScriptedAdapter,
  coerceReply,
  normalize,
} from "./engine.js";
export {
  FACTS,
  VOICE_RULES,
  INTENTS,
  FALLBACKS,
  ESCALATION_LINES,
  PROBING_INTENTS,
} from "./knowledge.js";
