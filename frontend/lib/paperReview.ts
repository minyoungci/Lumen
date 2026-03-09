import type { TiptapContent } from "@/components/shared/RichTextEditor";

export type PaperReviewDecision = "adopt" | "test" | "watch" | "ignore";

export interface PaperReviewMeta {
  paperTitle: string;
  venue: string;
  year: string;
  link: string;
  decision: PaperReviewDecision | "";
  rating: string;
}

export const PAPER_REVIEW_TITLE_PREFIX = "Paper review - ";

export const paperReviewDecisionOptions: Array<{ value: PaperReviewDecision; label: string }> = [
  { value: "adopt", label: "Adopt" },
  { value: "test", label: "Test" },
  { value: "watch", label: "Watch" },
  { value: "ignore", label: "Ignore" },
];

export const EMPTY_DOC_CONTENT: TiptapContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export const EMPTY_PAPER_REVIEW_META: PaperReviewMeta = {
  paperTitle: "",
  venue: "",
  year: "",
  link: "",
  decision: "",
  rating: "",
};

export const PAPER_REVIEW_BODY_TEMPLATE: TiptapContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Core claim" }] },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "What problem does the paper solve?" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "What is the main result or contribution?" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "What changes if the paper is correct?" }] }],
        },
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Methods and data" }] },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Dataset, sample size, and evaluation setup" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Modeling or experimental choices" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Baselines and comparisons that matter" }] }],
        },
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Evidence to trust" }] },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Summarize the strongest figures, tables, ablations, or qualitative evidence." }],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Weaknesses and open questions" }] },
    {
      type: "paragraph",
      content: [{ type: "text", text: "List threats to validity, unclear assumptions, and what you would challenge in discussion." }],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Team takeaway" }] },
    {
      type: "paragraph",
      content: [{ type: "text", text: "State whether the team should adopt, test, ignore, or follow up on this paper." }],
    },
  ],
};

const METADATA_HEADER = ["Field", "Value"] as const;

const METADATA_ROWS: Array<{ key: keyof PaperReviewMeta; label: string }> = [
  { key: "paperTitle", label: "Paper title" },
  { key: "venue", label: "Venue" },
  { key: "year", label: "Year" },
  { key: "link", label: "Link" },
  { key: "decision", label: "Decision" },
  { key: "rating", label: "Rating" },
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readNodeText(node: TiptapContent | null | undefined): string {
  if (!node) return "";
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }
  if (!Array.isArray(node.content)) {
    return "";
  }
  return node.content.map((child) => readNodeText(child as TiptapContent)).join("");
}

function paragraphNode(text: string): TiptapContent {
  if (!text) {
    return { type: "paragraph" };
  }
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function tableCellNode(cellType: "tableHeader" | "tableCell", text: string): TiptapContent {
  return {
    type: cellType,
    content: [paragraphNode(text)],
  };
}

function ensureDocContent(content?: TiptapContent | null): TiptapContent {
  if (content?.type === "doc" && Array.isArray(content.content) && content.content.length > 0) {
    return {
      ...content,
      content: content.content,
    };
  }
  return EMPTY_DOC_CONTENT;
}

export function normalizePaperReviewMeta(meta?: Partial<PaperReviewMeta> | null): PaperReviewMeta {
  return {
    paperTitle: normalizeWhitespace(meta?.paperTitle ?? ""),
    venue: normalizeWhitespace(meta?.venue ?? ""),
    year: normalizeWhitespace(meta?.year ?? ""),
    link: normalizeWhitespace(meta?.link ?? ""),
    decision:
      meta?.decision === "adopt" || meta?.decision === "test" || meta?.decision === "watch" || meta?.decision === "ignore"
        ? meta.decision
        : "",
    rating: normalizeWhitespace(meta?.rating ?? ""),
  };
}

export function isPaperReviewTitle(title?: string | null): boolean {
  return /^paper review\b/i.test(title ?? "");
}

export function stripPaperReviewPrefix(title?: string | null): string {
  return normalizeWhitespace((title ?? "").replace(/^paper review\s*-\s*/i, ""));
}

export function buildPaperReviewTitle(paperTitle: string): string {
  const normalizedTitle = stripPaperReviewPrefix(paperTitle);
  return normalizedTitle ? `${PAPER_REVIEW_TITLE_PREFIX}${normalizedTitle}` : PAPER_REVIEW_TITLE_PREFIX.trim();
}

export function getPaperReviewDecisionLabel(decision: PaperReviewDecision | ""): string {
  return paperReviewDecisionOptions.find((option) => option.value === decision)?.label ?? "Not set";
}

export function extractTextFromTiptap(content?: TiptapContent | null): string {
  const doc = ensureDocContent(content);
  const lines = (doc.content ?? [])
    .map((node) => normalizeWhitespace(readNodeText(node as TiptapContent)))
    .filter(Boolean);
  return lines.join("\n");
}

export function createPaperReviewDoc(meta: PaperReviewMeta, body?: TiptapContent | null): TiptapContent {
  const normalizedMeta = normalizePaperReviewMeta(meta);
  const bodyDoc = ensureDocContent(body);

  const headerRow: TiptapContent = {
    type: "tableRow",
    content: METADATA_HEADER.map((cell) => tableCellNode("tableHeader", cell)),
  };

  const metadataRows: TiptapContent[] = METADATA_ROWS.map(({ key, label }) => ({
    type: "tableRow",
    content: [
      tableCellNode("tableCell", label),
      tableCellNode(
        "tableCell",
        key === "decision" ? getPaperReviewDecisionLabel(normalizedMeta.decision) : normalizedMeta[key],
      ),
    ],
  }));

  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [headerRow, ...metadataRows],
      },
      { type: "horizontalRule" },
      ...(bodyDoc.content ?? []),
    ],
  };
}

export function parsePaperReviewDoc(content?: TiptapContent | null): { meta: PaperReviewMeta; body: TiptapContent } | null {
  const doc = ensureDocContent(content);
  const [firstNode, secondNode, ...restNodes] = doc.content ?? [];

  if (!firstNode || firstNode.type !== "table" || !Array.isArray(firstNode.content) || firstNode.content.length < 2) {
    return null;
  }

  const headerCells = (firstNode.content[0]?.content ?? [])
    .map((cell) => normalizeWhitespace(readNodeText(cell as TiptapContent)))
    .slice(0, 2);

  if (headerCells.length !== 2 || headerCells[0] !== METADATA_HEADER[0] || headerCells[1] !== METADATA_HEADER[1]) {
    return null;
  }

  const metadata = { ...EMPTY_PAPER_REVIEW_META };

  for (const row of firstNode.content.slice(1)) {
    const cells = (row.content ?? []).map((cell) => normalizeWhitespace(readNodeText(cell as TiptapContent))).slice(0, 2);
    if (cells.length !== 2) continue;
    const definition = METADATA_ROWS.find((item) => item.label === cells[0]);
    if (!definition) continue;

    if (definition.key === "decision") {
      const matchedDecision = paperReviewDecisionOptions.find(
        (option) => option.label.toLowerCase() === cells[1].toLowerCase(),
      );
      metadata.decision = matchedDecision?.value ?? "";
      continue;
    }

    metadata[definition.key] = cells[1];
  }

  const bodyNodes =
    secondNode?.type === "horizontalRule"
      ? restNodes
      : [secondNode, ...restNodes].filter(Boolean);

  return {
    meta: normalizePaperReviewMeta(metadata),
    body: {
      type: "doc",
      content: bodyNodes.length > 0 ? bodyNodes : EMPTY_DOC_CONTENT.content,
    },
  };
}

export function buildPaperReviewText(meta: PaperReviewMeta, bodyText: string): string {
  const normalizedMeta = normalizePaperReviewMeta(meta);
  const summaryParts = [
    normalizedMeta.paperTitle ? `Paper: ${normalizedMeta.paperTitle}.` : "",
    normalizedMeta.decision ? `Decision: ${getPaperReviewDecisionLabel(normalizedMeta.decision)}.` : "",
    normalizedMeta.venue ? `Venue: ${normalizedMeta.venue}${normalizedMeta.year ? ` (${normalizedMeta.year})` : ""}.` : normalizedMeta.year ? `Year: ${normalizedMeta.year}.` : "",
    normalizedMeta.rating ? `Rating: ${normalizedMeta.rating}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const details = normalizedMeta.link ? `Source: ${normalizedMeta.link}.` : "";
  const normalizedBody = normalizeWhitespace(bodyText);

  return [summaryParts, details, normalizedBody].filter(Boolean).join("\n\n");
}
