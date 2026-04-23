import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

const DEFAULT_WORKDIR = path.join(os.homedir(), ".openclaw");
const DEFAULT_TIMEOUT_SECONDS = 600;
const MAX_OUTPUT_BYTES = 256 * 1024;

const ClaudeCodeToolSchema = Type.Object({
  task: Type.String({
    description:
      "Complete task prompt for the delegated Claude Code session. The session is fresh and stateless — include ALL context (files, goals, constraints). No reference to your own conversation survives.",
  }),
  workdir: Type.Optional(
    Type.String({
      description:
        "Absolute working directory. Defaults to ~/.openclaw so the session can read workspace/AGENTS.md, workspace/MEMORY.md, etc. Override only if the task is strictly scoped to another repo (e.g. ~/projects/home_admin).",
    }),
  ),
  timeoutSeconds: Type.Optional(
    Type.Number({
      minimum: 1,
      description: `Max seconds to wait for completion. Default ${DEFAULT_TIMEOUT_SECONDS}. Raise for known long jobs (large refactors, web research).`,
    }),
  ),
});

function buildEnv(): NodeJS.ProcessEnv {
  const extraPaths = [
    path.join(os.homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const existing = process.env.PATH ?? "";
  const merged = [...extraPaths, ...existing.split(":").filter(Boolean)];
  const seen = new Set<string>();
  const deduped = merged.filter((p) => {
    if (seen.has(p)) {
      return false;
    }
    seen.add(p);
    return true;
  });
  return { ...process.env, PATH: deduped.join(":") };
}

function appendCapped(acc: string, chunk: string, truncatedRef: { value: boolean }): string {
  if (acc.length >= MAX_OUTPUT_BYTES) {
    truncatedRef.value = true;
    return acc;
  }
  const remaining = MAX_OUTPUT_BYTES - acc.length;
  if (chunk.length <= remaining) {
    return acc + chunk;
  }
  truncatedRef.value = true;
  return acc + chunk.slice(0, remaining);
}

export function createClaudeCodeTool(): AnyAgentTool {
  return {
    label: "Claude Code",
    name: "claude_code",
    description:
      "Delegate a self-contained task to a FRESH Claude Code session with full native tools (Bash, Read, Edit, Write, Grep, Glob, WebFetch, Task). Use for multi-file edits, repo-wide refactors, deep debugging, web research, or anything requiring extended reasoning over code. The subagent runs with cwd ~/.openclaw and reads CLAUDE.md there for orientation; it has NO memory of your conversation — include all needed context in `task`.",
    parameters: ClaudeCodeToolSchema,
    execute: async (_toolCallId, args, signal) => {
      const params = args as Record<string, unknown>;
      const task = readStringParam(params, "task", { required: true });
      const workdir = readStringParam(params, "workdir") ?? DEFAULT_WORKDIR;
      const timeoutSeconds =
        readNumberParam(params, "timeoutSeconds", { integer: true }) ?? DEFAULT_TIMEOUT_SECONDS;

      const startedAt = Date.now();
      const env = buildEnv();

      return await new Promise((resolve) => {
        let child: ReturnType<typeof spawn>;
        try {
          child = spawn("claude", ["--dangerously-skip-permissions", "--print", task], {
            cwd: workdir,
            env,
            stdio: ["ignore", "pipe", "pipe"],
            detached: true,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          resolve(
            jsonResult({
              status: "error",
              error: `spawn failed: ${message}`,
              workdir,
            }),
          );
          return;
        }

        let stdout = "";
        let stderr = "";
        const truncatedRef = { value: false };
        let settled = false;
        let timedOut = false;

        const killTree = (sig: NodeJS.Signals) => {
          try {
            if (child.pid !== undefined) {
              process.kill(-child.pid, sig);
              return;
            }
          } catch {
            // fall through to direct kill
          }
          try {
            child.kill(sig);
          } catch {
            // best effort
          }
        };

        const timer = setTimeout(() => {
          timedOut = true;
          killTree("SIGKILL");
        }, timeoutSeconds * 1000);

        const onAbort = () => {
          killTree("SIGTERM");
        };
        signal?.addEventListener?.("abort", onAbort, { once: true });

        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => {
          stdout = appendCapped(stdout, chunk, truncatedRef);
        });
        child.stderr?.on("data", (chunk: string) => {
          stderr = appendCapped(stderr, chunk, truncatedRef);
        });

        const finish = (payload: {
          status: "ok" | "error" | "timeout" | "aborted";
          exitCode: number | null;
          terminationSignal: NodeJS.Signals | null;
          errorMessage?: string;
        }) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener?.("abort", onAbort);

          const text = stdout.trim();
          const stderrTail = stderr.slice(-2000);
          const durationMs = Date.now() - startedAt;
          const content: { type: "text"; text: string }[] = [];

          if (text) {
            content.push({ type: "text", text });
          }
          if (payload.status !== "ok" || !text) {
            const note =
              payload.status === "ok"
                ? `claude_code returned no stdout (exit=${payload.exitCode}).`
                : `[claude_code ${payload.status}: exit=${payload.exitCode} signal=${
                    payload.terminationSignal ?? "none"
                  }${payload.errorMessage ? ` — ${payload.errorMessage}` : ""}]`;
            content.push({ type: "text", text: note });
          }
          if (truncatedRef.value) {
            content.push({
              type: "text",
              text: `[output truncated at ${MAX_OUTPUT_BYTES} bytes per stream]`,
            });
          }

          const details: Record<string, unknown> = {
            status: payload.status,
            exitCode: payload.exitCode,
            signal: payload.terminationSignal,
            durationMs,
            workdir,
            timeoutSeconds,
            truncated: truncatedRef.value,
          };
          if (payload.errorMessage) {
            details.error = payload.errorMessage;
          }
          if (stderrTail) {
            details.stderr = stderrTail;
          }

          resolve({ content, details });
        };

        child.on("error", (err) => {
          finish({
            status: "error",
            exitCode: null,
            terminationSignal: null,
            errorMessage: err.message,
          });
        });
        child.on("exit", (code, sig) => {
          if (timedOut) {
            finish({
              status: "timeout",
              exitCode: code,
              terminationSignal: sig,
              errorMessage: `timed out after ${timeoutSeconds}s`,
            });
            return;
          }
          if (signal?.aborted) {
            finish({
              status: "aborted",
              exitCode: code,
              terminationSignal: sig,
              errorMessage: "aborted by parent",
            });
            return;
          }
          finish({
            status: code === 0 ? "ok" : "error",
            exitCode: code,
            terminationSignal: sig,
          });
        });
      });
    },
  };
}
