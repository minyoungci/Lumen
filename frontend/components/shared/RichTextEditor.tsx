"use client";

import type { JSONContent } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { EditorContent, Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { lowlight } from "lowlight";
import { NodeSelection } from "prosemirror-state";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type TiptapContent = JSONContent;

interface RichTextEditorProps {
  initialContent?: TiptapContent | null;
  onChange?: (json: TiptapContent, text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

interface SelectionSnapshot {
  from: number;
  to: number;
}

const ResizableImage = Image.extend({
  addAttributes() {
    const inherited = typeof this.parent === "function" ? this.parent() : {};
    return {
      ...inherited,
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const dataWidth = element.getAttribute("data-width");
          if (dataWidth) return dataWidth;

          const styleWidth = element.style.width?.trim();
          if (styleWidth?.endsWith("%")) {
            return styleWidth.slice(0, -1);
          }

          const widthAttr = element.getAttribute("width");
          return widthAttr || null;
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const raw = attributes.width;
          if (raw === null || raw === undefined || raw === "") return {};

          const parsed = Number(raw);
          if (!Number.isFinite(parsed)) return {};

          const clamped = Math.max(20, Math.min(100, Math.round(parsed)));
          return {
            "data-width": String(clamped),
            style: `width: ${clamped}%`,
          };
        },
      },
    };
  },
});

export function textToTiptap(text: string): TiptapContent {
  if (!text) return { type: "doc", content: [{ type: "paragraph" }] };
  const lines = text.split("\n");
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}

interface ParsedMarkdownTable {
  headers: string[];
  rows: string[][];
}

const MARKDOWN_TABLE_DIVIDER_CELL = /^:?-{3,}:?$/;

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];

  let normalized = trimmed;
  if (normalized.startsWith("|")) normalized = normalized.slice(1);
  if (normalized.endsWith("|")) normalized = normalized.slice(0, -1);
  return normalized.split("|").map((cell) => cell.trim());
}

function parseMarkdownTable(raw: string): ParsedMarkdownTable | null {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  const headers = splitMarkdownTableRow(lines[0]);
  const divider = splitMarkdownTableRow(lines[1]);
  if (headers.length < 2) return null;
  if (divider.length !== headers.length) return null;
  if (divider.some((cell) => !MARKDOWN_TABLE_DIVIDER_CELL.test(cell.replace(/\s+/g, "")))) {
    return null;
  }

  const bodyLines = lines.slice(2);
  const rows = bodyLines.map(splitMarkdownTableRow);
  if (rows.some((row) => row.length === 0)) return null;

  const normalizedRows = rows.map((row) => {
    if (row.length === headers.length) return row;
    if (row.length > headers.length) return row.slice(0, headers.length);
    return [...row, ...new Array(headers.length - row.length).fill("")];
  });

  return { headers, rows: normalizedRows };
}

function textParagraphNode(text: string): TiptapContent {
  if (!text) return { type: "paragraph" };
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function markdownTableToTiptapNode(raw: string): TiptapContent | null {
  const parsed = parseMarkdownTable(raw);
  if (!parsed) return null;

  const headerRow: TiptapContent = {
    type: "tableRow",
    content: parsed.headers.map((cell) => ({
      type: "tableHeader",
      content: [textParagraphNode(cell)],
    })),
  };

  const bodyRows: TiptapContent[] = parsed.rows.map((row) => ({
    type: "tableRow",
    content: row.map((cell) => ({
      type: "tableCell",
      content: [textParagraphNode(cell)],
    })),
  }));

  return {
    type: "table",
    content: [headerRow, ...bodyRows],
  };
}

function topLevelParagraphLooksLikeMarkdownTableLine(node: JSONContent | null | undefined): boolean {
  if (!node || node.type !== "paragraph") return false;
  const text = extractTextFromNode(node).trim();
  if (!text) return false;
  return text.includes("|");
}

function extractTextFromNode(node: JSONContent | null | undefined): string {
  if (!node) return "";
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map((child) => extractTextFromNode(child as JSONContent)).join("");
}

function convertMarkdownTableAroundCursor(editor: Editor): boolean {
  const topLevelNodes = editor.getJSON().content;
  if (!Array.isArray(topLevelNodes) || topLevelNodes.length === 0) return false;

  const cursorIndex = editor.state.selection.$from.index(0);
  if (cursorIndex < 0 || cursorIndex >= topLevelNodes.length) return false;
  if (!topLevelParagraphLooksLikeMarkdownTableLine(topLevelNodes[cursorIndex] as JSONContent)) return false;

  let start = cursorIndex;
  while (
    start > 0 &&
    topLevelParagraphLooksLikeMarkdownTableLine(topLevelNodes[start - 1] as JSONContent)
  ) {
    start -= 1;
  }

  let end = cursorIndex;
  while (
    end + 1 < topLevelNodes.length &&
    topLevelParagraphLooksLikeMarkdownTableLine(topLevelNodes[end + 1] as JSONContent)
  ) {
    end += 1;
  }

  const markdownBlock = topLevelNodes
    .slice(start, end + 1)
    .map((node) => extractTextFromNode(node as JSONContent).trim())
    .join("\n");
  const tableNode = markdownTableToTiptapNode(markdownBlock);
  if (!tableNode) return false;

  let from = 1;
  for (let index = 0; index < start; index += 1) {
    from += editor.state.doc.child(index).nodeSize;
  }

  let to = from;
  for (let index = start; index <= end; index += 1) {
    to += editor.state.doc.child(index).nodeSize;
  }

  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, [tableNode, { type: "paragraph" }])
    .run();
  return true;
}

function insertMarkdownTableFromText(editor: Editor, raw: string): boolean {
  const tableNode = markdownTableToTiptapNode(raw);
  if (!tableNode) return false;
  editor
    .chain()
    .focus()
    .insertContent([tableNode, { type: "paragraph" }])
    .run();
  return true;
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary-500/20 text-primary-600"
          : "text-gray-500 hover:bg-black/[0.06] hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-1 h-4 w-px bg-black/10" />;
}

function Toolbar({
  editor,
  onImageClick,
  onMarkdownTableClick,
}: {
  editor: Editor;
  onImageClick: () => void;
  onMarkdownTableClick: () => void;
}) {
  const isActive = editor.isActive.bind(editor);
  const chain = () => editor.chain().focus();

  return (
    <div className="mb-3 flex flex-wrap items-center gap-0.5 border-b border-black/[0.08] pb-2">
      <ToolbarBtn active={isActive("bold")} onClick={() => chain().toggleBold().run()} title="Bold">
        <strong>B</strong>
      </ToolbarBtn>
      <ToolbarBtn active={isActive("italic")} onClick={() => chain().toggleItalic().run()} title="Italic">
        <em>I</em>
      </ToolbarBtn>
      <ToolbarBtn active={isActive("strike")} onClick={() => chain().toggleStrike().run()} title="Strikethrough">
        <span style={{ textDecoration: "line-through" }}>S</span>
      </ToolbarBtn>
      <ToolbarBtn active={isActive("highlight")} onClick={() => chain().toggleHighlight().run()} title="Highlight">
        Mark
      </ToolbarBtn>

      <Sep />

      <ToolbarBtn
        active={isActive("heading", { level: 1 })}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
        title="Heading 1"
      >
        H1
      </ToolbarBtn>
      <ToolbarBtn
        active={isActive("heading", { level: 2 })}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        H2
      </ToolbarBtn>
      <ToolbarBtn
        active={isActive("heading", { level: 3 })}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        H3
      </ToolbarBtn>

      <Sep />

      <ToolbarBtn active={isActive("bulletList")} onClick={() => chain().toggleBulletList().run()} title="Bullet list">
        Bullets
      </ToolbarBtn>
      <ToolbarBtn active={isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()} title="Numbered list">
        1. List
      </ToolbarBtn>
      <ToolbarBtn
        active={isActive("table")}
        onClick={() => chain().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}
        title="Insert table"
      >
        Table
      </ToolbarBtn>
      <ToolbarBtn active={false} onClick={onMarkdownTableClick} title="Convert markdown table">
        MD Table
      </ToolbarBtn>

      <Sep />

      <ToolbarBtn active={isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()} title="Blockquote">
        Quote
      </ToolbarBtn>
      <ToolbarBtn active={isActive("code")} onClick={() => chain().toggleCode().run()} title="Inline code">
        {"<>"}
      </ToolbarBtn>
      <ToolbarBtn active={isActive("codeBlock")} onClick={() => chain().toggleCodeBlock().run()} title="Code block">
        {"```"}
      </ToolbarBtn>

      <Sep />

      <ToolbarBtn active={false} onClick={() => chain().setHorizontalRule().run()} title="Divider">
        Rule
      </ToolbarBtn>
      <ToolbarBtn active={false} onClick={onImageClick} title="Insert image">
        Image
      </ToolbarBtn>
    </div>
  );
}

function EditorCore({
  initialContent,
  onChange,
  placeholder,
  disabled,
  readOnly,
  className,
}: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageSelectionRef = useRef<SelectionSnapshot | null>(null);
  const selectedImagePosRef = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [selectedImageWidth, setSelectedImageWidth] = useState(100);
  const [isImageSelected, setIsImageSelected] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({
        placeholder: placeholder ?? "Write here...",
      }),
      Highlight,
      Link.configure({ openOnClick: !!readOnly }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      ResizableImage.configure({ inline: false, allowBase64: false }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: initialContent ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: !disabled && !readOnly,
    editorProps: {
      handleClick(view, _pos, event) {
        const target = event.target as HTMLElement | null;
        if (!target || target.tagName !== "IMG") return false;
        try {
          const imagePos = view.posAtDOM(target, 0);
          const transaction = view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos));
          view.dispatch(transaction);
          return true;
        } catch {
          return false;
        }
      },
      handlePaste(_view, event) {
        const activeEditor = editorRef.current;
        if (!activeEditor || readOnly || disabled) return false;
        const pastedText = event.clipboardData?.getData("text/plain");
        if (!pastedText) return false;
        return insertMarkdownTableFromText(activeEditor, pastedText);
      },
      handleKeyDown(_view, event) {
        const activeEditor = editorRef.current;
        if (!activeEditor || readOnly || disabled) return false;

        if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
          return convertMarkdownTableAroundCursor(activeEditor);
        }

        const isShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "t";
        if (isShortcut) {
          return convertMarkdownTableAroundCursor(activeEditor);
        }
        return false;
      },
    },
    onCreate({ editor }) {
      editorRef.current = editor;
    },
    onDestroy() {
      editorRef.current = null;
    },
    onUpdate({ editor }) {
      onChange?.(editor.getJSON(), editor.getText());
    },
  });

  useEffect(() => {
    if (!editor) return;

    const syncImageSelection = () => {
      const { selection } = editor.state;
      const active = selection instanceof NodeSelection && selection.node.type.name === "image";
      setIsImageSelected(active);

      if (!active) {
        selectedImagePosRef.current = null;
        return;
      }

      selectedImagePosRef.current = selection.from;
      const attrs = editor.getAttributes("image") as { width?: number | string | null };
      const parsed = Number(attrs.width);
      setSelectedImageWidth(Number.isFinite(parsed) ? Math.max(20, Math.min(100, Math.round(parsed))) : 100);
    };

    syncImageSelection();
    editor.on("selectionUpdate", syncImageSelection);
    editor.on("transaction", syncImageSelection);
    return () => {
      editor.off("selectionUpdate", syncImageSelection);
      editor.off("transaction", syncImageSelection);
    };
  }, [editor]);

  const updateSelectedImageWidth = (nextWidth: number) => {
    if (!editor) return;
    const imagePos = selectedImagePosRef.current;
    if (imagePos === null) return;

    const clamped = Math.max(20, Math.min(100, Math.round(nextWidth)));
    setSelectedImageWidth(clamped);
    editor
      .chain()
      .focus()
      .setNodeSelection(imagePos)
      .updateAttributes("image", { width: clamped })
      .run();
  };

  const deleteSelectedImage = () => {
    if (!editor) return;
    const imagePos = selectedImagePosRef.current;
    if (imagePos === null) return;

    editor.chain().focus().setNodeSelection(imagePos).deleteSelection().run();
    selectedImagePosRef.current = null;
    setIsImageSelected(false);
  };

  const handleImageUpload = async (files: File[]) => {
    if (!editor || files.length === 0) return;

    const snapshot = imageSelectionRef.current;
    imageSelectionRef.current = null;

    const insertNodes: JSONContent[] = [];
    let failedCount = 0;

    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      form.append("file_type", "image");

      try {
        const response = await api.post("/uploads", form);
        const url = response.data?.public_url ?? response.data?.data?.public_url;
        if (url) {
          insertNodes.push(
            { type: "image", attrs: { src: url, alt: file.name || "image", width: 100 } },
            { type: "paragraph" },
          );
        } else {
          failedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        const detail =
          (error as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.detail ??
          (error as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.message ??
          "unknown error";
        console.error("Image upload failed:", detail);
      }
    }

    if (insertNodes.length > 0) {
      const docSize = editor.state.doc.content.size;
      const safePos = snapshot ? Math.max(0, Math.min(snapshot.to, docSize)) : docSize;

      editor
        .chain()
        .focus()
        .setTextSelection(safePos)
        .insertContent(insertNodes)
        .run();
    }

    if (failedCount > 0) {
      alert(`${failedCount} image upload(s) failed.`);
    }
  };

  return (
    <div className={`tiptap-wrapper ${readOnly ? "tiptap-readonly" : ""} ${className ?? ""}`}>
      {!readOnly && !disabled && editor ? (
        <Toolbar
          editor={editor}
          onImageClick={() => {
            const { from, to } = editor.state.selection;
            imageSelectionRef.current = { from, to };
            imageInputRef.current?.click();
          }}
          onMarkdownTableClick={() => {
            if (convertMarkdownTableAroundCursor(editor)) return;
            alert(
              [
                "Write a markdown table block, then try again.",
                "Example:",
                "| Name | Role |",
                "| --- | --- |",
                "| Lumen | Admin |",
              ].join("\n"),
            );
          }}
        />
      ) : null}

      {!readOnly && !disabled && editor && isImageSelected ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-black/[0.08] bg-black/[0.02] px-3 py-2">
          <span className="text-xs font-medium text-gray-600">Image size</span>
          {[40, 60, 80, 100].map((size) => (
            <button
              key={size}
              type="button"
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                selectedImageWidth === size
                  ? "bg-primary-500/20 text-primary-600"
                  : "text-gray-500 hover:bg-black/[0.06] hover:text-gray-700"
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                updateSelectedImageWidth(size);
              }}
            >
              {size}%
            </button>
          ))}
          <span className="text-xs text-gray-500">Now {selectedImageWidth}%</span>
          <button
            type="button"
            className="ml-auto rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
            onMouseDown={(event) => {
              event.preventDefault();
              deleteSelectedImage();
            }}
          >
            Remove image
          </button>
        </div>
      ) : null}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : [];
          if (files.length > 0) void handleImageUpload(files);
          event.target.value = "";
        }}
      />
      <EditorContent editor={editor} className="tiptap-content" />
    </div>
  );
}

export function RichTextEditor(props: RichTextEditorProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={`min-h-[360px] animate-pulse rounded-lg bg-black/[0.04] ${props.className ?? ""}`} />;
  }

  return <EditorCore {...props} />;
}
