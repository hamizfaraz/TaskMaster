export type NavIcon =
  | "dashboard"
  | "classes"
  | "notes"
  | "flashcards"
  | "quizzes"
  | "calendar"
  | "resources"
  | "settings"
  | "study";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
};

export const primaryNavItems: readonly NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/classes", label: "Classes", icon: "classes" },
  { href: "/notes", label: "Notes", icon: "notes" },
  { href: "/flashcards", label: "Flashcards", icon: "flashcards" },
  { href: "/quizzes", label: "Quizzes", icon: "quizzes" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  // { href: "/resources", label: "Resources", icon: "resources" },
] as const;

export const studyNavItems = [
  { href: "/study", label: "Overview" },
  { href: "/study/pomodoro", label: "Pomodoro" },
  { href: "/study/feynman", label: "Feynman" },
  { href: "/study/active-recall", label: "Active recall" },
  { href: "/study/cheat-sheet", label: "Cheat sheet" },
  { href: "/study/associations", label: "Associations" },
  { href: "/study/spaced-repetition", label: "Spaced repetition" },
] as const;

export function getPageTitle(pathname: string) {
  if (pathname.startsWith("/classes/")) {
    return "Class details";
  }

  if (pathname.startsWith("/study/")) {
    return (
      studyNavItems.find((item) => item.href === pathname)?.label ?? "Study"
    );
  }

  if (pathname.startsWith("/parse-test")) {
    return "Syllabus upload";
  }

  return (
    primaryNavItems.find((item) => item.href === pathname)?.label ??
    "TaskMaster"
  );
}

export function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
