import type { JSONContent } from "@tiptap/core";

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeReadableText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inlineText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((item) => inlineText(item)).join("");
  if (typeof node !== "object") return "";

  const record = node as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "hardBreak") return "\n";

  const ownText = typeof record.text === "string" ? record.text : "";
  const children = Array.isArray(record.content) ? inlineText(record.content) : "";
  return ownText + children;
}

function pushLine(lines: string[], line: string) {
  const normalized = normalizeInlineWhitespace(line);
  if (normalized) lines.push(normalized);
}

function tableCellText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  const text = normalizeReadableText(inlineText(content));
  return text.replace(/\|/g, "\\|");
}

function serializeNode(node: unknown, lines: string[], depth = 0) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((item) => serializeNode(item, lines, depth));
    return;
  }
  if (typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  const content = Array.isArray(record.content) ? record.content : [];
  const indent = "  ".repeat(depth);

  if (type === "doc") {
    serializeNode(content, lines, depth);
    return;
  }

  if (type === "heading") {
    const attrs = record.attrs as Record<string, unknown> | undefined;
    const rawLevel = typeof attrs?.level === "number" ? attrs.level : 2;
    const level = Math.max(1, Math.min(6, rawLevel));
    const text = inlineText(content);
    if (text.trim()) {
      pushLine(lines, `${"#".repeat(level)} ${text}`);
      lines.push("");
    }
    return;
  }

  if (type === "paragraph") {
    const text = inlineText(content);
    if (text.trim()) pushLine(lines, `${indent}${text}`);
    return;
  }

  if (type === "blockquote") {
    const quoteLines: string[] = [];
    serializeNode(content, quoteLines, 0);
    quoteLines
      .filter((line) => line.trim())
      .forEach((line) => pushLine(lines, `${indent}> ${line}`));
    lines.push("");
    return;
  }

  if (type === "codeBlock") {
    const code = normalizeReadableText(inlineText(content));
    if (code) {
      lines.push(`${indent}\`\`\``);
      code.split("\n").forEach((line) => lines.push(`${indent}${line}`));
      lines.push(`${indent}\`\`\``);
      lines.push("");
    }
    return;
  }

  if (type === "horizontalRule") {
    pushLine(lines, `${indent}---`);
    lines.push("");
    return;
  }

  if (type === "image") {
    const attrs = record.attrs as Record<string, unknown> | undefined;
    const alt = typeof attrs?.alt === "string" ? attrs.alt.trim() : "";
    const src = typeof attrs?.src === "string" ? attrs.src.trim() : "";
    const label = alt || src || "image";
    pushLine(lines, `${indent}[image] ${label}`);
    return;
  }

  if (type === "table") {
    const tableRows = content.filter((row) => {
      if (!row || typeof row !== "object") return false;
      return (row as Record<string, unknown>).type === "tableRow";
    });
    if (tableRows.length === 0) return;

    const rowCells = tableRows.map((row) => {
      const rowRecord = row as Record<string, unknown>;
      const cells = Array.isArray(rowRecord.content) ? rowRecord.content : [];
      return cells
        .filter((cell) => {
          if (!cell || typeof cell !== "object") return false;
          const cellType = (cell as Record<string, unknown>).type;
          return cellType === "tableHeader" || cellType === "tableCell";
        })
        .map((cell) => tableCellText(cell));
    });

    const header = rowCells[0] ?? [];
    if (header.length === 0) return;

    pushLine(lines, `${indent}| ${header.join(" | ")} |`);
    pushLine(lines, `${indent}| ${header.map(() => "---").join(" | ")} |`);
    rowCells.slice(1).forEach((cells) => {
      const normalized = [...cells];
      if (normalized.length < header.length) {
        normalized.push(...new Array(header.length - normalized.length).fill(""));
      }
      pushLine(lines, `${indent}| ${normalized.slice(0, header.length).join(" | ")} |`);
    });
    lines.push("");
    return;
  }

  if (type === "bulletList" || type === "orderedList") {
    const attrs = record.attrs as Record<string, unknown> | undefined;
    let order = type === "orderedList" ? (typeof attrs?.start === "number" ? attrs.start : 1) : 1;

    content.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const itemRecord = item as Record<string, unknown>;
      if (itemRecord.type !== "listItem") return;

      const itemChildren = Array.isArray(itemRecord.content) ? itemRecord.content : [];
      const inlineBlocks = itemChildren.filter((child) => {
        if (!child || typeof child !== "object") return false;
        const childType = (child as Record<string, unknown>).type;
        return childType !== "bulletList" && childType !== "orderedList";
      });
      const nestedLists = itemChildren.filter((child) => {
        if (!child || typeof child !== "object") return false;
        const childType = (child as Record<string, unknown>).type;
        return childType === "bulletList" || childType === "orderedList";
      });

      const itemTextLines: string[] = [];
      inlineBlocks.forEach((block) => serializeNode(block, itemTextLines, 0));
      const itemText = normalizeReadableText(itemTextLines.join("\n"));
      const bullet = type === "orderedList" ? `${order}.` : "•";
      if (itemText) {
        const firstLine = itemText.split("\n")[0] ?? "";
        pushLine(lines, `${indent}${bullet} ${firstLine}`);
        itemText
          .split("\n")
          .slice(1)
          .forEach((line) => pushLine(lines, `${indent}   ${line}`));
      } else {
        pushLine(lines, `${indent}${bullet}`);
      }

      nestedLists.forEach((nested) => serializeNode(nested, lines, depth + 1));
      if (type === "orderedList") order += 1;
    });
    lines.push("");
    return;
  }

  const fallback = inlineText(content);
  if (fallback.trim()) pushLine(lines, `${indent}${fallback}`);
}

export function tiptapToReadableText(content: JSONContent | null | undefined): string {
  if (!content) return "";
  const lines: string[] = [];
  serializeNode(content, lines);
  const joined = lines.join("\n");
  return normalizeReadableText(joined);
}
