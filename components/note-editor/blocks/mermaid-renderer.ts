let renderCounter = 0;

export function getMermaidErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+at new Promise[\s\S]*$/g, "").trim();
  }

  return "The Mermaid diagram has invalid syntax.";
}

export async function renderMermaidSvg(code: string) {
  const { default: mermaid } = await import("mermaid");
  const id = `taskmaster-mermaid-${Date.now()}-${renderCounter}`;
  renderCounter += 1;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      background: "transparent",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      primaryColor: "#eef2ff",
      primaryTextColor: "#18181b",
      primaryBorderColor: "#c7d2fe",
      lineColor: "#64748b",
      secondaryColor: "#f8fafc",
      tertiaryColor: "#ffffff",
    },
  });

  const { svg } = await mermaid.render(id, code);
  return svg;
}
