"use client";

import { parseTemplateContent } from "@/lib/interview-templates";

type TemplateContentProps = {
  content: string;
  compact?: boolean;
};

export function TemplateContent({ content, compact = false }: TemplateContentProps) {
  const blocks = parseTemplateContent(content);

  if (blocks.length === 0) {
    return <div style={{ whiteSpace: "pre-wrap" }}>{content}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? "0.45rem" : "0.75rem" }}>
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <div
              key={`${block.type}-${index}`}
              style={{
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
                color: "var(--text-secondary)",
                fontSize: compact ? "0.82rem" : "0.88rem",
              }}
            >
              {block.text}
            </div>
          );
        }

        if (block.type === "image") {
          return (
            <div key={`${block.type}-${index}`} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <img
                src={block.src}
                alt={block.alt || "Template image"}
                style={{
                  maxWidth: "100%",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  objectFit: "contain",
                }}
              />
              {block.alt && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {block.alt}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={`${block.type}-${index}`} style={{ border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
            {block.language && (
              <div style={{ padding: "0.35rem 0.6rem", background: "var(--surface-2)", fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {block.language}
              </div>
            )}
            <pre
              style={{
                margin: 0,
                padding: "0.75rem",
                overflowX: "auto",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: compact ? "0.78rem" : "0.84rem",
                lineHeight: 1.5,
              }}
            >
              <code>{block.code}</code>
            </pre>
          </div>
        );
      })}
    </div>
  );
}
