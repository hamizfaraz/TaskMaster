import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { studyNavItems } from "@/components/shell/navigation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("AppSidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows every study destination from the collapsed Study button", async () => {
    const user = userEvent.setup();

    render(
      <AppSidebar
        pathname="/flashcards"
        displayName="Test User"
        behavior="manual"
        collapsed
        onToggleCollapsed={vi.fn()}
        onHoverChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Study" }));

    for (const item of studyNavItems) {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        item.href,
      );
    }
  });
});
