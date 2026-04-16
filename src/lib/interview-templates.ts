export function parseTemplateQuestions(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}

export type TemplateContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "image"; alt: string; src: string }
  | { type: "code"; language: string; code: string };

export function parseTemplateContent(content: string): TemplateContentBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: TemplateContentBlock[] = [];
  let paragraphLines: string[] = [];
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeLines: string[] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join("\n").trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
    paragraphLines = [];
  };

  const flushCode = () => {
    blocks.push({
      type: "code",
      language: codeLanguage,
      code: codeLines.join("\n").replace(/\n+$/, ""),
    });
    codeLanguage = "";
    codeLines = [];
  };

  for (const line of lines) {
    const codeFenceMatch = line.match(/^```([\w-]*)\s*$/);
    if (codeFenceMatch) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushParagraph();
        inCodeBlock = true;
        codeLanguage = codeFenceMatch[1] ?? "";
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const imageMatch = line.match(/^\s*!\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)\s*$/);
    if (imageMatch) {
      flushParagraph();
      blocks.push({
        type: "image",
        alt: imageMatch[1],
        src: imageMatch[2],
      });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    paragraphLines.push(line);
  }

  if (inCodeBlock) {
    flushCode();
  } else {
    flushParagraph();
  }

  return blocks;
}
