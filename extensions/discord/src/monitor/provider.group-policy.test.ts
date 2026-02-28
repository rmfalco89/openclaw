import { describe, expect, it, vi } from "vitest";
import { normalizeNonTelegramGroupPolicy } from "../../../../src/config/runtime-group-policy.js";
import { installProviderRuntimeGroupPolicyFallbackSuite } from "../../../../src/test-utils/runtime-group-policy-contract.js";

// @mariozechner/pi-coding-agent uses 'strip-ansi' which is a missing transitive
// dep in the published package. Mock to prevent load-time failure via:
// provider.ts → skill-commands → agents/skills/workspace → @mariozechner/pi-coding-agent
vi.mock("@mariozechner/pi-coding-agent", () => ({
  CURRENT_SESSION_VERSION: 1,
  SessionManager: vi.fn(),
  AuthStorage: vi.fn(),
  ModelRegistry: vi.fn(),
  codingTools: [],
  createReadTool: vi.fn(),
  createEditTool: vi.fn(),
  createWriteTool: vi.fn(),
  readTool: {},
  formatSkillsForPrompt: vi.fn(() => ""),
  loadSkillsFromDir: vi.fn(async () => []),
  estimateTokens: vi.fn(() => 0),
  generateSummary: vi.fn(async () => ""),
}));
import { isDiscordGroupAllowedByPolicy } from "./allow-list.js";
import { __testing } from "./provider.js";

describe("resolveDiscordRuntimeGroupPolicy", () => {
  installProviderRuntimeGroupPolicyFallbackSuite({
    resolve: __testing.resolveDiscordRuntimeGroupPolicy,
    configuredLabel: "keeps open default when channels.discord is configured",
    defaultGroupPolicyUnderTest: "open",
    missingConfigLabel: "fails closed when channels.discord is missing and no defaults are set",
    missingDefaultLabel: "ignores explicit global defaults when provider config is missing",
  });

  it("respects explicit provider policy", () => {
    const resolved = __testing.resolveDiscordRuntimeGroupPolicy({
      providerConfigPresent: false,
      groupPolicy: "disabled",
    });
    expect(resolved.groupPolicy).toBe("disabled");
    expect(resolved.providerMissingFallbackApplied).toBe(false);
  });
});

describe("groupPolicy 'members' normalization for Discord preflight", () => {
  it("normalizes 'members' to 'open' so guild messages are allowed", () => {
    // "members" is Telegram-only; for Discord it must normalize to "open" so
    // that guild messages pass the policy gate rather than being blocked.
    const normalized = normalizeNonTelegramGroupPolicy("members");
    expect(normalized).toBe("open");

    const allowed = isDiscordGroupAllowedByPolicy({
      groupPolicy: normalized,
      guildAllowlisted: false,
      channelAllowlistConfigured: false,
      channelAllowed: false,
    });
    expect(allowed).toBe(true);
  });

  it("normalized 'members' through full policy resolution allows guild messages", () => {
    // Simulate: provider configured, groupPolicy="members" explicitly set.
    const resolved = __testing.resolveDiscordRuntimeGroupPolicy({
      providerConfigPresent: true,
      groupPolicy: "members",
    });
    // resolveDiscordRuntimeGroupPolicy returns the raw policy; normalization happens next.
    const normalized = normalizeNonTelegramGroupPolicy(resolved.groupPolicy);
    expect(normalized).toBe("open");

    const allowed = isDiscordGroupAllowedByPolicy({
      groupPolicy: normalized,
      guildAllowlisted: false,
      channelAllowlistConfigured: false,
      channelAllowed: false,
    });
    expect(allowed).toBe(true);
  });
});
