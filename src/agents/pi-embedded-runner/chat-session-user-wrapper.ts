import type { StreamFn } from "@mariozechner/pi-agent-core";
import { getChatRequestScope } from "../chat-request-scope.js";
import { streamWithPayloadPatch } from "./stream-payload-utils.js";

/**
 * Wraps a StreamFn to inject the current ChatRequestScope's `sessionKey` into
 * outbound payloads as the OpenAI `user` field, if and only if:
 *   - a ChatRequestScope is active for this request, and
 *   - the target model uses the openai-completions API, and
 *   - the payload doesn't already carry a `user` field.
 *
 * Non-openai-compat providers (anthropic native, bedrock, google, etc.) are
 * left untouched — `user` is an openai-completions concept.
 *
 * Consumed by `claude-code-proxy` on the other side as the session key for
 * routing to a per-channel Claude Code session.
 */
export function createChatSessionUserWrapper(underlying: StreamFn): StreamFn {
  return (model, context, options) => {
    const scope = getChatRequestScope();
    if (!scope?.sessionKey || model.api !== "openai-completions") {
      return underlying(model, context, options);
    }
    return streamWithPayloadPatch(underlying, model, context, options, (payload) => {
      if (payload["user"] === undefined) {
        payload["user"] = scope.sessionKey;
      }
    });
  };
}
