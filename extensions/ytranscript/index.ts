import { Type } from "@sinclair/typebox";
import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const YTranscriptParams = Type.Object({
  url: Type.String({ description: "YouTube URL or 11-character video ID" }),
  format: Type.Optional(
    Type.Union([
      Type.Literal("text"),
      Type.Literal("json"),
      Type.Literal("srt"),
      Type.Literal("vtt"),
    ]),
  ),
  lang: Type.Optional(
    Type.String({ description: "Comma-separated language preferences, e.g. en or es,en" }),
  ),
  timestamps: Type.Optional(Type.Boolean({ description: "Include timestamps in text output" })),
});

const SANDBOX_ENDPOINT = "http://ytranscript:8000/api/transcript";
const HOST_ENDPOINT = "http://localhost:27842/api/transcript";

function resolveEndpoint() {
  if (process.env.OPENCLAW_SANDBOX === "1" || process.env.CONTAINER_SANDBOX === "1") {
    return SANDBOX_ENDPOINT;
  }
  return HOST_ENDPOINT;
}

export default definePluginEntry({
  id: "ytranscript",
  name: "YouTube Transcript",
  description: "Fetch YouTube transcripts via the local ytranscript service",
  register(api) {
    api.registerTool({
      name: "ytranscript",
      label: "YouTube Transcript",
      description:
        "Fetch a transcript for a YouTube video. Returns text by default, or json/srt/vtt when requested.",
      parameters: YTranscriptParams,
      async execute(_id, rawParams) {
        const params = (rawParams ?? {}) as {
          url?: string;
          format?: "text" | "json" | "srt" | "vtt";
          lang?: string;
          timestamps?: boolean;
        };
        try {
          const endpoint = resolveEndpoint();
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: params.url,
              format: params.format ?? "text",
              lang: params.lang ?? "en",
              timestamps: params.timestamps ?? false,
            }),
          });

          const text = await response.text();
          let data: { transcript?: unknown; error?: string } | null = null;
          try {
            data = text ? (JSON.parse(text) as { transcript?: unknown; error?: string }) : null;
          } catch {
            data = null;
          }

          if (!response.ok) {
            const errorText = data?.error || text || `HTTP ${response.status}`;
            return {
              content: [{ type: "text" as const, text: `Error: ${errorText}` }],
              details: { error: true, status: response.status },
            };
          }

          const transcript =
            typeof data?.transcript === "string"
              ? data.transcript
              : data?.transcript != null
                ? JSON.stringify(data.transcript, null, 2)
                : text;

          return {
            content: [{ type: "text" as const, text: transcript || "" }],
            details: { error: false, status: response.status },
          };
        } catch (error: unknown) {
          return {
            content: [{ type: "text" as const, text: `Error: ${formatErrorMessage(error)}` }],
            details: { error: true },
          };
        }
      },
    });
  },
});
