"use client";

import { isValidElement, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { CodeBlockView } from "@/components/note-editor/blocks/code-block-view";
import { MermaidBlockView } from "@/components/note-editor/blocks/mermaid-block-view";

function omitNode<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const { node, ...rest } = props;
  void node;
  return rest;
}

function getTextContent(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(getTextContent).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(value)) {
    return getTextContent(value.props.children);
  }

  if (value && typeof value === "object") {
    const candidate = value as {
      children?: unknown;
      props?: { children?: ReactNode };
      value?: unknown;
    };

    if (candidate.props?.children) {
      return getTextContent(candidate.props.children);
    }

    if (typeof candidate.value === "string" || typeof candidate.value === "number") {
      return String(candidate.value);
    }

    if (candidate.children) {
      return getNodeText(candidate.children);
    }
  }

  return "";
}

function getNodeText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(getNodeText).join("");
  }

  if (value && typeof value === "object") {
    const candidate = value as { value?: unknown; children?: unknown };
    if (typeof candidate.value === "string" || typeof candidate.value === "number") {
      return String(candidate.value);
    }

    return getNodeText(candidate.children);
  }

  return "";
}

function extractCode(children: ReactNode) {
  return getTextContent(children).replace(/\n$/, "");
}

function cleanMarkdownText(value: string) {
  return value === "[object Object]" ? "" : value;
}

function getCodeLanguage(value: unknown): string | undefined {
  if (isValidElement<{ className?: string }>(value)) {
    const match = value.props.className?.match(/language-([^\s]+)/);
    return match?.[1]?.toLowerCase();
  }

  if (Array.isArray(value)) {
    return value.map(getCodeLanguage).find(Boolean);
  }

  if (value && typeof value === "object") {
    const candidate = value as {
      properties?: { className?: string | string[] };
      props?: { className?: string };
      children?: unknown;
    };
    const className = Array.isArray(candidate.properties?.className)
      ? candidate.properties.className.join(" ")
      : candidate.properties?.className ?? candidate.props?.className;
    const match = className?.match(/language-([^\s]+)/);
    return match?.[1]?.toLowerCase() ?? getCodeLanguage(candidate.children);
  }

  return undefined;
}

export const markdownComponents: Components = {
  img: (props) => {
    const { alt, src } = omitNode(props);
    if (typeof src !== "string") {
      return null;
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt ?? "Embedded note image"}
        className="max-h-[32rem] w-full rounded-lg object-contain"
        src={src}
      />
    );
  },
  pre: (props) => {
    const { children, node } = props;
    const code =
      cleanMarkdownText(extractCode(children)) ||
      cleanMarkdownText(getTextContent(node as ReactNode));
    const language = getCodeLanguage(children) ?? getCodeLanguage(node);
    if (language === "mermaid" || language === "mmd") {
      return <MermaidBlockView data={{ code }} />;
    }

    return <CodeBlockView data={{ code, ...(language ? { language } : {}) }} />;
  },
  code: (props) => {
    const { children, className, node, ...rest } = props;
    const codeText =
      cleanMarkdownText(getTextContent(children)) ||
      cleanMarkdownText(getTextContent(node as ReactNode));
    if (className) {
      return (
        <code className={className} {...rest}>
          {codeText}
        </code>
      );
    }

    return (
      <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.9em] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
        {codeText}
      </code>
    );
  },
};
