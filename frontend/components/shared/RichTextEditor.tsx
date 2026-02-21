"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { lowlight } from "lowlight";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export interface TiptapContent {
  type: string;
  content?: unknown[];
}

interface RichTextEditorProps {
  initialContent?: TiptapContent | null;
  onChange?: (json: TiptapContent, text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

/** Convert legacy plain text string to minimal TipTap JSON doc */
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
      onMouseDown={(e) => {
        e.preventDefault();
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

function Toolbar({ editor, onImageClick }: { editor: Editor; onImageClick: () => void }) {
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
        H✦
      </ToolbarBtn>

      <Sep />

      <ToolbarBtn active={isActive("heading", { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()} title="Heading 1">
        H1
      </ToolbarBtn>
      <ToolbarBtn active={isActive("heading", { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()} title="Heading 2">
        H2
      </ToolbarBtn>
      <ToolbarBtn active={isActive("heading", { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()} title="Heading 3">
        H3
      </ToolbarBtn>

      <Sep />

      <ToolbarBtn active={isActive("bulletList")} onClick={() => chain().toggleBulletList().run()} title="Bullet list">
        • List
      </ToolbarBtn>
      <ToolbarBtn active={isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()} title="Numbered list">
        1. List
      </ToolbarBtn>

      <Sep />

      <ToolbarBtn active={isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()} title="Blockquote">
        ❝
      </ToolbarBtn>
      <ToolbarBtn active={isActive("code")} onClick={() => chain().toggleCode().run()} title="Inline code">
        {"<>"}
      </ToolbarBtn>
      <ToolbarBtn active={isActive("codeBlock")} onClick={() => chain().toggleCodeBlock().run()} title="Code block">
        {"```"}
      </ToolbarBtn>

      <Sep />

      <ToolbarBtn active={false} onClick={() => chain().setHorizontalRule().run()} title="Divider">
        —
      </ToolbarBtn>
      <ToolbarBtn active={false} onClick={onImageClick} title="이미지 삽입">
        📷
      </ToolbarBtn>
    </div>
  );
}

/** Inner component — only rendered client-side after mount */
function EditorCore({
  initialContent,
  onChange,
  placeholder,
  disabled,
  readOnly,
  className,
}: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({
        placeholder: placeholder ?? "내용을 입력하세요...",
      }),
      Highlight,
      Link.configure({ openOnClick: !!readOnly }),
      Image.configure({ inline: false, allowBase64: false }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: initialContent ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: !disabled && !readOnly,
    onUpdate({ editor }) {
      onChange?.(editor.getJSON() as TiptapContent, editor.getText());
    },
  });

  const handleImageUpload = async (file: File) => {
    if (!editor) return;
    const form = new FormData();
    form.append("file", file);
    form.append("file_type", "image");
    try {
      const res = await api.post("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = res.data?.public_url ?? res.data?.data?.public_url;
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    } catch (err) {
      console.error("Image upload failed:", err);
    }
  };

  return (
    <div className={`tiptap-wrapper ${readOnly ? "tiptap-readonly" : ""} ${className ?? ""}`}>
      {!readOnly && !disabled && editor && (
        <Toolbar editor={editor} onImageClick={() => imageInputRef.current?.click()} />
      )}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImageUpload(file);
          // reset so same file can be re-uploaded
          e.target.value = "";
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
    return (
      <div
        className={`min-h-[360px] animate-pulse rounded-lg bg-black/[0.04] ${props.className ?? ""}`}
      />
    );
  }

  return <EditorCore {...props} />;
}
