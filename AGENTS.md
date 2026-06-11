<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# TaskMaster agent conventions

Read this file before writing any code. It will save reprompts.

---

## 1. User feedback — loading, error, and success states

**This is mandatory.** Every async operation must have all three states handled. Never leave the user staring at a button with no indication of what is happening.

### Toasts (Sonner) — use for async feedback from API calls

`<Toaster>` is already mounted in `app/layout.tsx`. Import and use directly:

```ts
import { toast } from "sonner";

// Loading state for long operations
const id = toast.loading("Saving...", { duration: Infinity });
// Then resolve it:
toast.success("Saved", { id });
toast.error("Failed to save", { id, description: err.message });

// Short operations
toast.error("Failed to generate flashcards", {
  description: err instanceof Error ? err.message : undefined,
  duration: 5000,
});
toast.success("Deck saved");
```

Use `toast.loading` + `id` update for anything that takes more than ~1 second. Use `toast.error` / `toast.success` directly for quick ops.

### Inline banners — use only for form validation and auth flows

Auth and settings forms use inline `error` / `message` state rendered as colored boxes with `aria-live="polite"`. Use this pattern only for forms where the error is tied to specific fields and the user needs to act before proceeding — not for async API results.

### Inline loading indicators

Use `Loader2` from `lucide-react` with `animate-spin` on button icons during async operations. Disable the button and swap its label while loading:

```tsx
<Button disabled={isSaving} leadingIcon={isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}>
  {isSaving ? "Saving..." : "Save"}
</Button>
```

### What NOT to do

- Do not render raw API error responses or Zod issue arrays in the UI. In Zod v4, `ZodError.message` is a JSON-serialized issues array — catch it server-side, log it, and throw a plain string instead.
- Do not silently swallow errors. Every catch block must either call `toast.error(...)` or set visible error state.
- Do not skip loading state. Buttons must be `disabled` and show a spinner while their action is in flight.

### Server-side error handling rule

API routes must `console.error(...)` the actual error for server logs, then return only a short user-facing string:

```ts
} catch (error) {
  console.error("[POST /api/example]", error);
  return NextResponse.json({ error: "Operation failed" }, { status: 500 });
}
```

Never return `error.message` directly from a catch block — it may contain Zod issue JSON, stack traces, or DB driver internals.

---

## 2. Layout and scroll — one-pager viewport-locked shell

The app shell is **`h-screen overflow-hidden`**. Content must scroll *inside* panels, not on the page body. Getting this wrong means content is clipped with no scrollbar.

### The pattern

```
app-shell: h-screen overflow-hidden
  └── sidebar
  └── main: h-full w-full (overflow-hidden for most routes)
       └── page root: h-full min-h-0 flex flex-col overflow-hidden
            └── header: shrink-0
            └── scrollable region: flex-1 min-h-0 overflow-y-auto
```

`min-h-0` is required on every flex child that should shrink below its content size. Without it, flex items refuse to shrink and content overflows the viewport invisibly.

### For new pages inside `(app)/`

```tsx
// Page root
<main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
  <header className="shrink-0">...</header>
  <div className="min-h-0 flex-1 overflow-y-auto">
    {/* your content */}
  </div>
</main>
```

Do **not** use `min-h-screen` inside `(app)/` routes. That breaks the locked shell.

### Scrollable panels within a view

When a view has a sidebar + main editor (like the quiz preview), the sidebar and editor each need their own scroll:

```tsx
<section className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[260px_1fr]">
  <aside className="flex min-h-0 flex-col overflow-hidden">
    <div className="min-h-0 flex-1 overflow-y-auto">...</div>
  </aside>
  <div className="overflow-y-auto">...</div>   {/* editor scrolls independently */}
</section>
```

Do not use `flex-1` on textareas or labels inside a scrollable editor panel — that fights the scroll and clips content. Give textareas natural height with `rows={N}` and let the parent scroll.

---

## 3. Available UI components and libraries

### `components/ui/` — small custom set (shadcn-style, not full shadcn)

| File | Exports |
|------|---------|
| `button.tsx` | `Button`, `getButtonClassName()` |
| `badge.tsx` | `Badge` — variants: `accent`, `outline`, `neutral` |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` |
| `input.tsx` | `Input`, `Textarea`, `Select` |
| `page-header.tsx` | `PageHeader` — eyebrow/title/description |
| `scaffold-page.tsx` | `ScaffoldPage` — placeholder for incomplete features |
| `empty-state.tsx` | `EmptyState` |
| `separator.tsx` | `Separator` |

Use these before reaching for anything external. Do **not** add Radix primitives or full shadcn components — the `radix-ui` package is installed but its primitives are not imported in app code.

### Installed libraries

| Library | Purpose |
|---------|---------|
| `sonner` | Toasts — `import { toast } from "sonner"` |
| `lucide-react` | Icons — use `Loader2 animate-spin` for loading |
| `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` | Markdown with math — reuse the `MarkdownText` component pattern from quizzes/flashcards |
| `zod` v4 | Validation — `safeParse` on API bodies |
| `drizzle-orm` | DB ORM |
| `better-auth` | Auth — `lib/auth.ts`, `lib/auth-client.ts` |
| `clsx` / `class-variance-authority` | Installed but use `cx()` from `lib/utils.ts` for class merging |

`tailwind-merge` and `cva` are in `package.json` but unused in app code. Do not introduce them.

### `cx()` does not resolve Tailwind conflicts

`lib/utils.ts` `cx()` is filter/join only — it does **not** merge conflicting Tailwind classes like `tailwind-merge` does. If two classes conflict (e.g. `p-4 p-6`), the last one wins by CSS source order, not argument order. Account for this manually.

---

## 4. Navigation and view state

### URL routing vs client view state

- **Between features**: use `<Link>` and real routes under `app/(app)/`.
- **Within a feature workspace**: use a local string-union view state. Never push view state into the URL for in-feature steps.

```ts
type View = "library" | "create" | "preview" | "take" | "results";
const [view, setView] = useState<View>("library");
```

This is the pattern in quizzes, flashcards, and notes. Do not use `useRouter().push()` for within-feature navigation.

### Search params for re-mount triggers

Notes uses `?new=1` and `?classId=...` to trigger remounts via a `key` prop on the workspace — useful when you need a clean state without a full route change.

### Sidebar navigation config

Nav items live in `components/shell/navigation.ts`. Add new top-level routes there. Study sub-pages go in `studyNavItems`.

---

## 5. API conventions

### Auth in API routes

```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({ headers: await headers() });
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

### Validation pattern

```ts
const parsed = mySchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  // Do NOT return parsed.error.issues — that leaks implementation details
}
```

### Error response shape

Always `{ error: string }`. Optionally `{ logs: string[] }` for diagnostic streams (parse-test only). Never an array at the top level.

### `runtime = "nodejs"`

Almost every API route sets `export const runtime = "nodejs"`. Match this for routes that use DB or AI.

### `await connection()` on dynamic pages

Server Component pages that should not be statically cached must call `await connection()` from `next/server` at the top. See quizzes, flashcards, notes pages.

---

## 6. State management

There is no global store. No React Context for app data. No TanStack Query.

- Local `useState` in large client workspaces.
- View state machines with string union types (see section 4).
- `useTransition` for post-mutation router refreshes.
- Temp IDs (`temp-${uuid}`) in notes — never call DELETE/PATCH while `isTempNote(id)`.

---

## 7. Styling

### Tailwind v4

Config is in `app/globals.css` via `@import "tailwindcss"` + `@theme inline`. Base font size is `20px` on `<html>` — all `rem` values are scaled up.

### Use semantic tokens, not raw colors

```
Surfaces:   bg-background  bg-surface  bg-surface-muted  bg-surface-elevated
Text:       text-foreground  text-muted-foreground
Borders:    border-border  border-border-strong
Accent:     bg-accent  bg-accent-soft  text-accent
Danger:     bg-danger-soft  text-danger  border-red-200 dark:border-red-950/70
Radius:     rounded-[var(--radius-xl)]
Shadow:     shadow-[var(--shadow-card)]
```

### Dark mode

Applied via `.dark` class on `<html>` by `applyTheme()`. Both `:root` and `html.dark` define CSS vars. Always test both.

---

## 8. UI copy and page headers

**Never add explanatory page headers describing what a feature does.** Users know what Quizzes and Flashcards are. Headers like "Focused quiz library, generation queue, and question editor" add zero value and visual noise.

The only text above the main content area should be:
- Breadcrumb/back navigation (e.g. "My Quizzes" ghost button when a sub-view is open)
- Functional state labels that change with the view (e.g. the step indicator pills in create flow)

When a feature needs explanation, that belongs in onboarding — not on the feature page itself.

**No marketing copy inside the app.** Descriptions like "Focused deck library, generation queue, and card editor" are not helpful to an active user. Remove them if you see them.

---

## 9. Component reuse — React is component-based

**Extract and reuse components. Do not duplicate markup.** If two features (e.g. flashcard library and quiz library) have the same visual structure, they must use the same component or the same CSS pattern — not two independently-written blocks that drift apart over time.

### Rules

- **If you write the same element twice, extract a component.** The threshold is low: a stat pill, a section header with a count, a card action row — all worth extracting.
- **Small local helpers are fine.** A `StatPill`, `StepPill`, or `EmptyLibrary` component that lives near its usage is better than inline-repeated markup.
- **Prefer shared `components/ui/` for anything used across two or more features.** If you find yourself defining the same helper in `quizzes-client.tsx` and `flashcards-client.tsx`, move it to `components/ui/`.
- **Check what exists before building.** `components/ui/` has `Badge`, `Button`, `Card`, `Input`, `Textarea`, `Select`, `EmptyState`, `ScaffoldPage`, `PageHeader`, `Separator`. Use them.

### Library views must match structurally

Any view that shows a collection of items (quizzes library, flashcards library, notes list, etc.) must follow the same pattern:

```tsx
<section className="flex h-full min-h-0 flex-col gap-5">
  {/* stats + primary action — shrink-0 */}
  <div className="flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div className="flex flex-wrap gap-2">
      <StatPill>N items</StatPill>
    </div>
    <Button leadingIcon={<Plus />}>Create ...</Button>
  </div>

  {/* empty state */}
  <div className="flex min-h-0 flex-1 items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-border bg-surface/70 p-8">
    ...
  </div>

  {/* OR: scrollable grid */}
  <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1 ...cols">
    {items.map(...)}
  </div>
</section>
```

Do not reinvent this layout per-feature.

### Do not define components inside components (React rule 5.4)

Defining a component inside another component creates a new type on every render — React remounts it every time, losing state. Always define components at module scope and pass data as props.

```tsx
// WRONG — new type every render, state lost
function Parent() {
  const Child = () => <div>...</div>;  // ← never do this
  return <Child />;
}

// RIGHT
function Child({ value }: { value: string }) {
  return <div>{value}</div>;
}
function Parent({ value }: { value: string }) {
  return <Child value={value} />;
}
```

---

## 10. React best practices (key rules)

These rules come from production React at scale. Violating them causes bugs that are hard to trace.

### State and effects

- **Derive state during render, not in effects.** If a value can be computed from existing state/props, do it inline — no `useState` + `useEffect` to sync. ([React docs](https://react.dev/learn/you-might-not-need-an-effect))
- **Put interaction logic in event handlers, not effects.** Side effects triggered by a button click belong in the click handler, not a `useEffect` that watches a `submitted` boolean.
- **Use functional `setState` updates.** When new state depends on old state, use the updater form: `setItems(curr => [...curr, newItem])`. This avoids stale closures and keeps callbacks stable.
- **`useRef` for transient values.** If a value changes frequently and doesn't need to trigger a re-render (mouse position, interval ID, animation frame), use `useRef`, not `useState`.

### Waterfalls

- **Parallel-fetch independent data.** `await A; await B;` when A and B are independent is a 2× latency hit. Use `Promise.all([A, B])` or start both promises before awaiting.
- **`await connection()` on dynamic pages.** Required in Next.js 16 for pages that must not be statically cached (notes, quizzes, flashcards pages already do this — keep it).

### Rendering

- **Avoid `&&` with numbers.** `{count && <Badge>}` renders `0` when count is 0. Use `{count > 0 ? <Badge> : null}` instead.
- **`useTransition` over manual loading state.** `const [isPending, startTransition] = useTransition()` gives you a built-in pending flag with correct error-reset behavior. Prefer it over `const [isSaving, setIsSaving] = useState(false)` when the operation is navigation-like.
- **`toSorted()` not `sort()`.** `.sort()` mutates the array — breaks React's immutability model. Use `.toSorted()` (all modern browsers, Node 20+).

### Bundle

- **Direct imports from `lucide-react` are fine** — Next.js 16 uses `optimizePackageImports` to tree-shake them automatically. No need for deep import paths.
- **Dynamic import heavy components.** Editor.js, math renderers, and other large libraries should be `next/dynamic` with `ssr: false` if not needed on initial paint.

---

## 11. Key gotchas

1. **Zod v4 `ZodError.message` is JSON** — if you do `error.message` in a catch where the error might be a ZodError, you will leak a JSON array to the client. Always catch parse errors specifically and throw a plain string.

2. **Embeddings are required for AI features** — flashcards and quizzes filter notes by `hasEmbedding`. If a user selects notes without embeddings, the API returns 400. UI must disable those notes.

3. **`/api/chat` has no auth guard** — do not expose sensitive data through it without adding session checks.

4. **Parse-test is feature-flagged** — `isParseTestEnabled()` checks `ENABLE_PARSE_TEST` env var; off in production by default.

5. **Auth schema and Drizzle schema are linked** — `pnpm auth:generate` rewrites `lib/db/schema.ts`. Coordinate with migrations.

6. **`radix-ui` is listed in deps but not imported** — do not use `@radix-ui/react-*` primitives directly in new components.

7. **Many study routes are scaffolds** — `/resources`, most `/study/*` pages use `ScaffoldPage` and are not implemented. Don't assume they have real functionality.

8. **Note editor is Editor.js** — complex, debounced, with custom blocks. Hundreds of CSS lines in `globals.css`. Do not touch it without reading `components/note-editor/`.

9. **Quiz storage guard** — `hasQuizStorage()` returns false if DB migrations haven't run; quiz APIs return 503. The page handles it gracefully — keep that check when adding quiz API routes.

10. **No shared form library** — no react-hook-form. Build forms with plain `<label>`, `Input`, `Textarea`, `Select`, manual state, and Zod validation on the API side.

11. **`hooks/` alias exists but the folder is empty** — no shared hooks yet. Add new shared hooks there if needed.

12. **Math rendering** — reuse the `MarkdownText` component pattern (ReactMarkdown + remark-gfm + remark-math + rehype-katex) for any user-facing content that may contain LaTeX. Do not add a separate math renderer.
