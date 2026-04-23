import { AsyncLocalStorage } from "node:async_hooks";
import { resolveGlobalSingleton } from "../shared/global-singleton.js";

/**
 * Per-chat-request async-local context. Set at the agent-runner entry when we
 * know which chat peer/channel this turn belongs to. Read inside stream
 * wrappers that need to tag outbound provider calls with a per-chat identifier
 * (e.g., the openai-compat `user` field used by the Claude Code proxy for
 * session routing).
 */
export type ChatRequestScope = {
  sessionKey: string;
};

const KEY: unique symbol = Symbol.for("openclaw.chatRequestScope");

const store = resolveGlobalSingleton<AsyncLocalStorage<ChatRequestScope>>(
  KEY,
  () => new AsyncLocalStorage<ChatRequestScope>(),
);

export function withChatRequestScope<T>(
  scope: ChatRequestScope,
  run: () => Promise<T>,
): Promise<T> {
  return store.run(scope, run);
}

export function getChatRequestScope(): ChatRequestScope | undefined {
  return store.getStore();
}
