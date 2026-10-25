"use client";

import { useState, useMemo } from "react";
import { cn } from "@/shared/utils/cn";
import Button from "@/shared/components/Button";
import {
  formatBytes, safeStringify, isTruncatedPayload, isRedactedPayload,
  messageContentToText, summarizePayload, getToolName,
} from "./requestDetailsHelpers";

const PREVIEW_CHARS = 300;
const DEFAULT_MESSAGES = 20;
const PRE_CLASS = "max-h-[300px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-black/5 bg-black/5 p-3 font-mono text-xs text-text-main dark:border-white/5 dark:bg-white/5 sm:p-4";

function CopyButton({ getText }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return <Button variant="outline" size="sm" onClick={onCopy}>{copied ? "Copied" : "Copy"}</Button>;
}

function MessageItem({ message }) {
  const [expanded, setExpanded] = useState(false);
  const text = messageContentToText(message?.content);
  const long = text.length > PREVIEW_CHARS;
  const shown = expanded || !long ? text : `${text.slice(0, PREVIEW_CHARS)}…`;
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  return (
    <div className="rounded-lg border border-black/5 p-2 dark:border-white/5">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-primary">
          {message?.role || "?"}
        </span>
        {long && <span className="text-[11px] text-text-muted">{formatBytes(text.length)}</span>}
      </div>
      {shown && <div className="whitespace-pre-wrap break-words font-mono text-xs text-text-main">{shown}</div>}
      {toolCalls.length > 0 && (
        <div className="mt-1 text-xs text-text-muted">
          {toolCalls.map((c, i) => <span key={i} className="mr-2 font-mono">[tool_call {c?.function?.name || c?.name || ""}]</span>)}
        </div>
      )}
      {long && (
        <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => setExpanded(!expanded)}>
          {expanded ? "show less" : "show more"}
        </button>
      )}
    </div>
  );
}

export default function PayloadViewer({ payload }) {
  const [showAll, setShowAll] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const summary = useMemo(() => summarizePayload(payload), [payload]);
  const rawSize = useMemo(() => {
    if (!payload || isTruncatedPayload(payload) || isRedactedPayload(payload)) return NaN;
    try { return JSON.stringify(payload).length; } catch { return NaN; }
  }, [payload]);

  if (payload == null) return <p className="text-sm text-text-muted">No data</p>;

  if (isRedactedPayload(payload)) {
    return <p className="text-sm text-text-muted">Payload redacted by server settings.</p>;
  }
  if (isTruncatedPayload(payload)) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-amber-600">
          Payload truncated ({formatBytes(payload._originalSize)} original). Showing preview only.
        </p>
        {payload._preview != null && <pre className={PRE_CLASS}>{safeStringify(payload._preview)}</pre>}
      </div>
    );
  }

  const { messages, tools, messageCount, toolCount } = summary;
  const visible = messages ? (showAll ? messages : messages.slice(-DEFAULT_MESSAGES)) : [];
  const offset = messages ? messages.length - visible.length : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span>{messageCount} messages</span>·<span>{toolCount} tools</span>·<span>{formatBytes(rawSize)}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? "Hide raw JSON" : "Raw JSON"}
          </Button>
          <CopyButton getText={() => safeStringify(payload)} />
        </div>
      </div>

      {messages && messages.length > 0 && (
        <div className="space-y-2">
          {offset > 0 && (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowAll(true)}>
              Show all {messages.length} messages ({offset} hidden)
            </button>
          )}
          {showAll && messages.length > DEFAULT_MESSAGES && (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowAll(false)}>
              Show last {DEFAULT_MESSAGES} only
            </button>
          )}
          <div className="max-h-[400px] space-y-2 overflow-auto">
            {visible.map((m, i) => <MessageItem key={offset + i} message={m} />)}
          </div>
        </div>
      )}

      {tools && tools.length > 0 && (
        <div>
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowTools(!showTools)}>
            {showTools ? "Hide" : "Show"} tools ({tools.length})
          </button>
          {showTools && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tools.map((t, i) => (
                <span key={i} className={cn("rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px] text-text-main dark:bg-white/10")}>
                  {getToolName(t)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {showRaw && <pre className={PRE_CLASS}>{safeStringify(payload)}</pre>}
    </div>
  );
}
