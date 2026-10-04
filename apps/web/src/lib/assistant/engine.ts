/**
 * CampusForge mock AI engine — 100% frontend, zero external calls.
 *
 * `generateResponse` inspects the user's message, scores it against keyword
 * groups, picks a matching (and not-recently-used) markdown response, then
 * applies a light model/length flavor. The result is a rich markdown string the
 * UI streams out word-by-word so it feels like a real model is thinking.
 *
 * Design notes:
 * - Responses are deduped per category for the lifetime of the page session,
 *   so the assistant never repeats the same answer twice in a row.
 * - All responses are hand-written, realistic, markdown-formatted content
 *   (headings, lists, tables, blockquotes, links, inline + fenced code).
 */
import type { ModelId, ResponseLength, Attachment } from './types';

export interface EngineContext {
  model: ModelId;
  temperature: number;
  responseLength: ResponseLength;
  systemPrompt?: string;
}

interface Category {
  id: string;
  /** Higher weight wins ties when multiple categories match. */
  weight?: number;
  keywords: string[];
  responses: string[];
}

/* ------------------------------------------------------------------ *
 * Response library — grouped by intent. ~90 distinct answers.
 * ------------------------------------------------------------------ */

const CATEGORIES: Category[] = [
  {
    id: 'greeting',
    weight: 0.5,
    keywords: [
      'hello',
      'hi ',
      'hey',
      'good morning',
      'good evening',
      'howdy',
      'yo ',
      'greetings',
      "what's up",
      'sup',
    ],
    responses: [
      `Hey! 👋 I'm your CampusForge assistant. I can help you **write**, **code**, **plan**, **research**, and **make sense of your documents**.\n\nA few things people ask me:\n\n- *"Summarize my lecture notes into 5 key points"*\n- *"Write a SQL query to find my top students"*\n- *"Draft an email to my professor about an extension"*\n\nWhat are you working on today?`,
      `Hi there! Great to see you. I'm here to help you move faster on whatever you're building or studying.\n\nI'm good at:\n\n1. **Coding** — JavaScript, React, Python, SQL and more\n2. **Writing** — emails, essays, blog posts, rewrites\n3. **Planning** — study schedules, project roadmaps, business plans\n\nJust tell me what you need.`,
      `Hello! 🙌 Ready when you are.\n\nYou can paste in code, drop a document, or just describe a problem in plain language. I'll do my best to give you something you can actually use.\n\nWhat can I help with?`,
    ],
  },
  {
    id: 'thanks',
    weight: 0.6,
    keywords: [
      'thank',
      'thanks',
      'thx',
      'appreciate',
      'awesome',
      'great job',
      'nice work',
      'perfect',
    ],
    responses: [
      `You're very welcome! 😊 Happy to help. If you want, I can take this further — refine it, expand it, or move on to the next step. Just say the word.`,
      `Anytime! Glad that was useful. Want me to **summarize the key takeaways** or keep going on the next part?`,
      `My pleasure! 🎉 I'm here whenever you need another pass, a different angle, or something brand new.`,
    ],
  },
  {
    id: 'javascript',
    keywords: [
      'javascript',
      ' js ',
      'es6',
      'promise',
      'async',
      'await',
      'array method',
      'closure',
      'event loop',
    ],
    responses: [
      `## Async/await in JavaScript\n\nThink of \`async/await\` as syntactic sugar over Promises that lets asynchronous code read top-to-bottom.\n\n\`\`\`javascript\nasync function loadUser(id) {\n  try {\n    const res = await fetch(\`/api/users/\${id}\`);\n    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);\n    const user = await res.json();\n    return user;\n  } catch (err) {\n    console.error('Failed to load user:', err);\n    return null;\n  }\n}\n\`\`\`\n\n**Key rules**\n\n- \`await\` only works inside an \`async\` function (or a top-level module).\n- An \`async\` function *always* returns a Promise.\n- Use \`try/catch\` for error handling, or \`.catch()\` on the returned promise.\n\n> Tip: to run independent requests in parallel, don't \`await\` them one by one — use \`await Promise.all([...])\`.`,
      `## The array methods you'll actually use\n\n| Method | Returns | Use it when… |\n| --- | --- | --- |\n| \`map\` | new array | transforming every item |\n| \`filter\` | new array | keeping a subset |\n| \`reduce\` | single value | folding into a total/object |\n| \`find\` | first match | locating one item |\n| \`some\`/\`every\` | boolean | testing a condition |\n\n\`\`\`javascript\nconst orders = [\n  { id: 1, total: 40, paid: true },\n  { id: 2, total: 15, paid: false },\n  { id: 3, total: 90, paid: true },\n];\n\nconst paidRevenue = orders\n  .filter((o) => o.paid)\n  .reduce((sum, o) => sum + o.total, 0); // 130\n\`\`\`\n\nThese are **immutable** — they return new arrays instead of mutating the original, which keeps your state predictable.`,
      `## Closures, briefly\n\nA **closure** is a function that remembers the variables from where it was *created*, even after that outer scope has finished running.\n\n\`\`\`javascript\nfunction makeCounter() {\n  let count = 0;\n  return () => ++count; // remembers \`count\`\n}\n\nconst next = makeCounter();\nnext(); // 1\nnext(); // 2\n\`\`\`\n\nWhy it matters:\n\n- Powers **data privacy** (no one can touch \`count\` directly).\n- It's the mechanism behind React hooks, event handlers, and memoization.\n- The classic gotcha: \`var\` in a loop shares one binding — use \`let\` so each iteration gets its own.`,
    ],
  },
  {
    id: 'react',
    keywords: [
      'react',
      'usestate',
      'useeffect',
      'hook',
      'component',
      'jsx',
      'props',
      'rerender',
      're-render',
      'context api',
    ],
    responses: [
      `## When to reach for \`useEffect\` (and when not to)\n\nA surprising amount of \`useEffect\` code shouldn't be an effect at all.\n\n**You probably *don't* need an effect to:**\n\n- Transform data for rendering → just compute it during render.\n- Handle a user event → put the logic in the event handler.\n- Reset state when a prop changes → use a \`key\` instead.\n\n**You *do* need one to synchronize with something external:**\n\n\`\`\`jsx\nuseEffect(() => {\n  const id = setInterval(() => setNow(Date.now()), 1000);\n  return () => clearInterval(id); // always clean up\n}, []); // empty deps = run once on mount\n\`\`\`\n\n> Rule of thumb: if the code talks to the network, the DOM, a timer, or a subscription, it's an effect. Otherwise, it's just rendering.`,
      `## Why your component re-renders too much\n\nThe three usual suspects:\n\n1. **New object/array/function identities** passed as props each render.\n2. **State lifted too high**, so a change re-renders a big subtree.\n3. **Context** where the value object is recreated every render.\n\nA practical fix:\n\n\`\`\`jsx\nconst handleSelect = useCallback((id) => {\n  setSelected(id);\n}, []);\n\nconst columns = useMemo(() => buildColumns(data), [data]);\n\nexport default React.memo(Row); // skip re-render if props are shallow-equal\n\`\`\`\n\nMeasure first with the **React DevTools Profiler** — don't memoize blindly. Most apps are fast enough until a list gets large or a render does real work.`,
      `## Controlled vs. uncontrolled inputs\n\n**Controlled** — React state is the single source of truth:\n\n\`\`\`jsx\nconst [email, setEmail] = useState('');\n\n<input value={email} onChange={(e) => setEmail(e.target.value)} />\n\`\`\`\n\n**Uncontrolled** — the DOM holds the value, you read it with a ref:\n\n\`\`\`jsx\nconst ref = useRef(null);\n<input ref={ref} defaultValue=\"\" />\n// later: ref.current.value\n\`\`\`\n\n| | Controlled | Uncontrolled |\n| --- | --- | --- |\n| Validation as you type | ✅ easy | ❌ awkward |\n| Performance on huge forms | ⚠️ re-renders | ✅ none |\n| Recommended default | **Yes** | for simple/native forms |`,
      `## Lifting state up\n\nWhen two components need the same data, move that state to their **closest common parent** and pass it down as props.\n\n\`\`\`jsx\nfunction Parent() {\n  const [query, setQuery] = useState('');\n  return (\n    <>\n      <SearchBar value={query} onChange={setQuery} />\n      <Results query={query} />\n    </>\n  );\n}\n\`\`\`\n\nThis keeps a **single source of truth**. If the prop-passing gets deep and painful (\"prop drilling\"), that's your signal to reach for **Context** or a state library — but not before.`,
    ],
  },
  {
    id: 'nextjs',
    keywords: [
      'next.js',
      'nextjs',
      'next js',
      'app router',
      'server component',
      'server action',
      'getserversideprops',
      'rsc',
      'route handler',
    ],
    responses: [
      `## Server vs. Client Components (App Router)\n\nIn the \`app/\` directory, **components are Server Components by default**. They run on the server, can be \`async\`, and can touch your database directly — none of their code ships to the browser.\n\nAdd \`'use client'\` only when you need interactivity:\n\n\`\`\`tsx\n// app/dashboard/page.tsx  (Server Component)\nexport default async function Page() {\n  const stats = await db.stats.findMany(); // runs on the server\n  return <StatsChart data={stats} />;       // pass data to a client child\n}\n\`\`\`\n\n**Push \`'use client'\` to the leaves.** Keep data-fetching and layout on the server; make only the small interactive pieces (buttons, inputs, charts) client components.`,
      `## Server Actions in a nutshell\n\nServer Actions let you mutate data without hand-writing an API route.\n\n\`\`\`tsx\n'use server';\n\nexport async function createTask(formData: FormData) {\n  const title = String(formData.get('title'));\n  await db.task.create({ data: { title } });\n  revalidatePath('/tasks'); // refresh the cached page\n}\n\`\`\`\n\n\`\`\`tsx\n<form action={createTask}>\n  <input name=\"title\" />\n  <button type=\"submit\">Add</button>\n</form>\n\`\`\`\n\nBenefits: progressive enhancement (works without JS), no client/server type drift, and built-in revalidation. For optimistic UI, pair it with \`useOptimistic\`.`,
      `## Caching & rendering, decoded\n\nNext.js App Router has a few layers worth knowing:\n\n- **Static (default)** — rendered at build time, served from cache.\n- **Dynamic** — opt in with \`export const dynamic = 'force-dynamic'\` or by reading \`cookies()\`/\`headers()\`.\n- **Revalidation** — \`export const revalidate = 60\` (ISR), or call \`revalidatePath()\` / \`revalidateTag()\` after a mutation.\n\n> If data looks stale after an update, you almost always need a \`revalidatePath\` (or \`tag\`) call in the mutating Server Action.`,
    ],
  },
  {
    id: 'typescript',
    keywords: [
      'typescript',
      ' ts ',
      'type error',
      'interface',
      'generic',
      'enum',
      'tsconfig',
      'union type',
      'utility type',
    ],
    responses: [
      `## \`type\` vs \`interface\` — which to use?\n\nFor most app code they're interchangeable. My defaults:\n\n- **\`interface\`** for object shapes and public APIs (they merge & extend cleanly).\n- **\`type\`** for unions, tuples, and mapped/conditional types.\n\n\`\`\`typescript\ninterface User {\n  id: string;\n  role: 'admin' | 'member';\n}\n\ntype Result<T> = { ok: true; data: T } | { ok: false; error: string };\n\`\`\`\n\nThe \`Result<T>\` **discriminated union** above is a powerhouse — TypeScript narrows the type once you check \`result.ok\`, so you get autocomplete on exactly the right branch.`,
      `## Utility types you'll use weekly\n\n| Utility | What it does |\n| --- | --- |\n| \`Partial<T>\` | makes all props optional |\n| \`Pick<T, K>\` | keeps only keys \`K\` |\n| \`Omit<T, K>\` | drops keys \`K\` |\n| \`Record<K, V>\` | object with keys \`K\`, values \`V\` |\n| \`ReturnType<F>\` | the return type of a function |\n\n\`\`\`typescript\ntype User = { id: string; name: string; email: string };\n\ntype PublicUser = Omit<User, 'email'>;       // { id; name }\ntype UserDraft = Partial<User>;              // all optional\ntype UsersById = Record<string, User>;       // lookup map\n\`\`\`\n\nComposing these beats writing new interfaces by hand — your types stay in sync with the source of truth automatically.`,
      `## Generics without the headache\n\nA generic is just a *type parameter* — a placeholder you fill in at the call site.\n\n\`\`\`typescript\nfunction first<T>(arr: T[]): T | undefined {\n  return arr[0];\n}\n\nfirst([1, 2, 3]);       // T = number\nfirst(['a', 'b']);      // T = string\n\`\`\`\n\nAdd **constraints** when you need to access properties:\n\n\`\`\`typescript\nfunction prop<T, K extends keyof T>(obj: T, key: K): T[K] {\n  return obj[key];\n}\n\`\`\`\n\nNow \`prop\` only accepts real keys of the object, and returns the *exact* value type — fully type-safe.`,
    ],
  },
  {
    id: 'python',
    keywords: [
      'python',
      'pandas',
      'numpy',
      'django',
      'flask',
      'pip',
      'virtualenv',
      'list comprehension',
      '.py',
    ],
    responses: [
      `## Pythonic data wrangling with comprehensions\n\nComprehensions are the idiomatic way to build lists/dicts/sets in one readable line.\n\n\`\`\`python\nstudents = [\n    {\"name\": \"Ada\", \"score\": 92},\n    {\"name\": \"Linus\", \"score\": 67},\n    {\"name\": \"Grace\", \"score\": 85},\n]\n\n# names of students who passed (>= 70)\npassed = [s[\"name\"] for s in students if s[\"score\"] >= 70]\n\n# name -> grade lookup\ngrades = {s[\"name\"]: s[\"score\"] for s in students}\n\`\`\`\n\n**Readability tip:** if a comprehension needs more than one \`if\` and a transform, it's usually clearer as a plain \`for\` loop. Don't sacrifice clarity for a one-liner.`,
      `## A clean pandas starter\n\n\`\`\`python\nimport pandas as pd\n\ndf = pd.read_csv(\"grades.csv\")\n\n# quick health check\nprint(df.shape)\nprint(df.describe())\n\n# average score per course, highest first\nsummary = (\n    df.groupby(\"course\")[\"score\"]\n      .mean()\n      .sort_values(ascending=False)\n      .round(1)\n)\nprint(summary)\n\`\`\`\n\n**Workflow that scales:**\n\n1. \`df.info()\` / \`df.isna().sum()\` — understand shape & missing data first.\n2. Clean **before** you analyze (types, duplicates, nulls).\n3. \`groupby\` + an aggregation answers most "per category" questions.`,
      `## Virtual environments — the 30-second setup\n\nNever install packages globally. Per-project isolation avoids version hell.\n\n\`\`\`bash\npython -m venv .venv\nsource .venv/bin/activate      # Windows: .venv\\Scripts\\activate\npip install -r requirements.txt\npip freeze > requirements.txt  # lock what you installed\n\`\`\`\n\nAdd \`.venv/\` to your \`.gitignore\`. When a teammate clones the repo, they recreate the exact environment from \`requirements.txt\` — reproducible every time.`,
    ],
  },
  {
    id: 'node-api',
    keywords: [
      'node',
      'express',
      'api',
      'endpoint',
      'rest',
      'backend',
      'middleware',
      'server',
      'fetch',
      'http',
      'webhook',
    ],
    responses: [
      `## A minimal, production-shaped Express API\n\n\`\`\`javascript\nimport express from 'express';\n\nconst app = express();\napp.use(express.json());\n\napp.get('/api/health', (_req, res) => res.json({ ok: true }));\n\napp.post('/api/tasks', async (req, res, next) => {\n  try {\n    const task = await createTask(req.body);\n    res.status(201).json(task);\n  } catch (err) {\n    next(err); // hand off to the error middleware\n  }\n});\n\n// centralized error handler — must have 4 args\napp.use((err, _req, res, _next) => {\n  console.error(err);\n  res.status(err.status ?? 500).json({ error: err.message });\n});\n\napp.listen(3000);\n\`\`\`\n\n**Always** wrap async handlers in \`try/catch\` and forward to one error middleware — it keeps responses consistent and stops the process from crashing on a rejected promise.`,
      `## Designing a clean REST resource\n\nKeep URLs noun-based and let HTTP verbs do the talking:\n\n| Method | Path | Action |\n| --- | --- | --- |\n| GET | \`/tasks\` | list |\n| GET | \`/tasks/:id\` | read one |\n| POST | \`/tasks\` | create |\n| PATCH | \`/tasks/:id\` | partial update |\n| DELETE | \`/tasks/:id\` | remove |\n\n**Status codes that matter:** \`200\` OK, \`201\` Created, \`400\` bad input, \`401\` not logged in, \`403\` not allowed, \`404\` missing, \`409\` conflict, \`500\` server error.\n\n> Validate the request body at the edge (e.g. with **Zod**) so bad data never reaches your business logic.`,
      `## Don't block the event loop\n\nNode is single-threaded for *your* JavaScript. One slow synchronous operation freezes every request.\n\n\`\`\`javascript\n// ❌ blocks everyone while it reads\nconst data = fs.readFileSync('big.json');\n\n// ✅ yields to the event loop\nconst data = await fs.promises.readFile('big.json');\n\`\`\`\n\nFor genuinely CPU-heavy work (image processing, crypto, parsing huge files), offload to a **Worker Thread** or a separate queue/worker service so the main thread stays responsive.`,
    ],
  },
  {
    id: 'database',
    keywords: [
      'database',
      'postgres',
      'mongodb',
      'mysql',
      'index',
      'schema',
      'orm',
      'prisma',
      'migration',
      'normaliz',
      'foreign key',
    ],
    responses: [
      `## Indexing — the single biggest perf lever\n\nAn index is a sorted lookup structure. The right one turns a full-table scan into an instant seek.\n\n**Index the columns you filter, join, and sort on:**\n\n\`\`\`sql\n-- speeds up: WHERE workspace_id = ? ORDER BY created_at DESC\nCREATE INDEX idx_tasks_ws_created\n  ON tasks (workspace_id, created_at DESC);\n\`\`\`\n\n**But don't over-index** — every index slows down writes and uses disk. Rules of thumb:\n\n- Foreign keys → almost always index them.\n- Columns only ever \`SELECT\`ed (never filtered) → don't.\n- Use \`EXPLAIN ANALYZE\` to confirm the planner actually uses your index.`,
      `## Normalize, then denormalize on purpose\n\nStart **normalized** (no duplicated data) — it prevents update anomalies:\n\n\`\`\`\nusers (id, name, email)\ntasks (id, title, user_id → users.id)\n\`\`\`\n\nDenormalize *only* when a real read bottleneck forces it (e.g. caching a \`comment_count\` on a post). Treat duplicated data as a performance optimization with a maintenance cost, not a default.\n\n> A clean schema you can reason about beats a clever one you can't.`,
      `## SQL vs. NoSQL — pick for the access pattern\n\n| | Relational (Postgres) | Document (MongoDB) |\n| --- | --- | --- |\n| Data shape | structured, related | nested, flexible |\n| Joins | first-class | manual / avoided |\n| Transactions | strong (ACID) | per-document mostly |\n| Best for | most apps | rapidly changing/blob-like docs |\n\nHonest take: **start with Postgres.** It handles JSON columns when you need flexibility, gives you real transactions, and scales further than most teams ever need.`,
    ],
  },
  {
    id: 'sql',
    weight: 1.2,
    keywords: [
      'sql',
      'query',
      'select ',
      'join',
      'group by',
      'where',
      'aggregate',
      'inner join',
      'left join',
      'sql query',
    ],
    responses: [
      `## SQL query: top students per course\n\nHere's a query that ranks students within each course and returns the top 3:\n\n\`\`\`sql\nSELECT course, student_name, score\nFROM (\n  SELECT\n    c.name              AS course,\n    s.name              AS student_name,\n    e.score,\n    RANK() OVER (\n      PARTITION BY c.id\n      ORDER BY e.score DESC\n    ) AS rnk\n  FROM enrollments e\n  JOIN students s ON s.id = e.student_id\n  JOIN courses  c ON c.id = e.course_id\n) ranked\nWHERE rnk <= 3\nORDER BY course, score DESC;\n\`\`\`\n\n**How it works:** \`RANK() OVER (PARTITION BY …)\` ranks rows *within* each course; the outer query then keeps only the top 3. Swap \`RANK()\` for \`DENSE_RANK()\` if you don't want gaps after ties.`,
      `## SQL query: monthly revenue trend\n\n\`\`\`sql\nSELECT\n  DATE_TRUNC('month', created_at) AS month,\n  COUNT(*)                        AS orders,\n  SUM(total_cents) / 100.0        AS revenue\nFROM orders\nWHERE status = 'paid'\n  AND created_at >= NOW() - INTERVAL '12 months'\nGROUP BY 1\nORDER BY 1;\n\`\`\`\n\nNotes:\n\n- \`DATE_TRUNC\` buckets timestamps into months cleanly.\n- \`GROUP BY 1\` references the first select expression — handy, but spell it out if the query gets long.\n- Filtering in \`WHERE\` (not \`HAVING\`) lets the index do the work before aggregation.`,
      `## SQL query: find duplicate emails\n\n\`\`\`sql\nSELECT email, COUNT(*) AS copies\nFROM users\nGROUP BY email\nHAVING COUNT(*) > 1\nORDER BY copies DESC;\n\`\`\`\n\nTo actually **delete** the duplicates while keeping the earliest row:\n\n\`\`\`sql\nDELETE FROM users a\nUSING users b\nWHERE a.email = b.email\n  AND a.id > b.id;   -- keep the lowest id\n\`\`\`\n\n> Always run the \`SELECT\` version first and eyeball the results before any \`DELETE\`. Wrap destructive changes in a transaction so you can \`ROLLBACK\`.`,
      `## SQL query: customers with no orders\n\nA classic anti-join — find rows in one table with no match in another:\n\n\`\`\`sql\nSELECT c.id, c.name, c.email\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.id IS NULL;\n\`\`\`\n\nThe \`LEFT JOIN\` keeps every customer; rows where \`o.id IS NULL\` are the ones with zero orders. It's usually faster and clearer than a \`NOT IN (SELECT …)\` subquery, and it handles \`NULL\`s correctly.`,
    ],
  },
  {
    id: 'code-explain',
    keywords: [
      'explain this code',
      'what does this code',
      'explain the code',
      'how does this code',
      'walk me through',
      'code review',
      'refactor',
      'this function',
    ],
    responses: [
      `## Reading code, line by line\n\nDrop the snippet in and I'll annotate it — but here's the lens I use for *any* function:\n\n1. **Inputs & outputs** — what goes in, what comes out, what types?\n2. **Side effects** — does it touch state, the network, the DOM, or just compute?\n3. **Control flow** — loops, branches, early returns.\n4. **Edge cases** — empty input, nulls, errors.\n\n> Paste the code and tell me which language. I'll give you a plain-English walkthrough plus any bugs or smells I spot.`,
      `## Refactoring checklist\n\nWhen I clean up a function I look for:\n\n- **Naming** — does each name say what it *is* / *does*?\n- **Single responsibility** — is it doing two jobs that should split?\n- **Nesting** — can I flatten with early returns / guard clauses?\n- **Duplication** — repeated logic that wants a helper.\n- **Magic values** — numbers/strings that should be named constants.\n\n\`\`\`javascript\n// before: nested + unclear\nfunction f(u){ if(u){ if(u.active){ return u.name } } return 'guest' }\n\n// after: guard clauses + intent\nfunction displayName(user) {\n  if (!user?.active) return 'guest';\n  return user.name;\n}\n\`\`\`\n\nSame behavior, half the cognitive load. Share your snippet and I'll do this for it.`,
      `## How I'd explain a tricky snippet\n\nThe fastest way to understand unfamiliar code is to **narrate it in data terms**: what shape does the data have at each step?\n\nFor example, a chained array pipeline:\n\n\`\`\`javascript\nitems\n  .filter((x) => x.active)   // array → smaller array\n  .map((x) => x.price)       // array of objects → array of numbers\n  .reduce((a, b) => a + b, 0) // array of numbers → one number\n\`\`\`\n\nEach line transforms the value flowing through it. Track that flowing value and even dense code becomes obvious. Send yours over and I'll trace it for you.`,
    ],
  },
  {
    id: 'debug',
    keywords: [
      'error',
      'bug',
      'not working',
      "doesn't work",
      'undefined',
      'null',
      'exception',
      'stack trace',
      'fix this',
      'crash',
      'failing',
    ],
    responses: [
      `## Let's debug it methodically\n\nThe fastest path isn't more code — it's a tighter loop:\n\n1. **Read the actual error**, top line and the *first* file in your code in the stack trace (ignore node_modules frames).\n2. **Reproduce reliably** — same steps, every time.\n3. **Isolate** — comment out half; does it still happen? Binary-search the cause.\n4. **Inspect state** at the failure point (\`console.log\` the variables, or a breakpoint).\n5. **Change one thing**, re-test.\n\nPaste the **full error message** and the relevant code and I'll pinpoint it. The classic JS one — *"Cannot read properties of undefined"* — almost always means you accessed \`.x\` on something that hadn't loaded yet. Optional chaining (\`obj?.x\`) plus a loading guard usually fixes it.`,
      `## "Cannot read properties of undefined"\n\nThis means you reached into something that isn't there *yet*. Three common causes:\n\n- **Async data** used before it loads → guard with \`if (!data) return <Spinner />\`.\n- **A typo** in a property name → \`user.naem\`.\n- **An array index** that doesn't exist → \`list[5]\` on a 3-item list.\n\n\`\`\`javascript\n// defensive access\nconst city = user?.address?.city ?? 'Unknown';\n\`\`\`\n\nShare the line it points to and I'll tell you exactly which value is undefined and why.`,
      `## Reproduce, then reduce\n\nThe single most useful debugging skill is building a **minimal reproduction** — strip everything until only the bug remains. Nine times out of ten, you find the cause *while* reducing.\n\nWhen you report it (to me, a teammate, or a GitHub issue), include:\n\n- What you **expected** to happen\n- What **actually** happened\n- The **exact error** + stack trace\n- A **minimal snippet** that triggers it\n\nThat structure alone solves a huge share of bugs before anyone else even reads it. Send me those four things.`,
    ],
  },
  {
    id: 'landing-page',
    weight: 1.1,
    keywords: [
      'landing page',
      'hero section',
      'website',
      'web page',
      'homepage',
      'cta',
      'above the fold',
      'build a landing',
    ],
    responses: [
      `## Landing page that converts\n\nHere's the structure top SaaS sites use, in order:\n\n1. **Hero** — one outcome-focused headline + subhead + single primary CTA.\n2. **Social proof** — logos, a metric, or a one-line testimonial.\n3. **3 benefit blocks** — outcomes, not features.\n4. **How it works** — 3 steps.\n5. **Pricing** — clear, with a recommended tier.\n6. **FAQ + final CTA**.\n\nStarter hero markup:\n\n\`\`\`html\n<section class=\"hero\">\n  <h1>Ship your side project this weekend</h1>\n  <p>The starter kit that handles auth, payments, and email\n     so you can focus on what's unique.</p>\n  <a class=\"btn-primary\" href=\"/signup\">Start free</a>\n  <span class=\"trust\">No credit card · 2-minute setup</span>\n</section>\n\`\`\`\n\n**Headline formula:** *\\[Achieve outcome] without \\[the usual pain].* Keep one primary CTA above the fold — competing buttons kill conversion.`,
      `## Copy that sells (hero edition)\n\nGreat landing copy talks about the **reader's outcome**, not your product's features.\n\n| ❌ Feature-speak | ✅ Outcome-speak |\n| --- | --- |\n| "AI-powered analytics" | "Know which campaign made you money by Monday" |\n| "Cloud-based platform" | "Your whole team, one source of truth" |\n| "Robust API" | "Connect the tools you already use in minutes" |\n\n**The 5-second test:** show the hero to someone for 5 seconds. Can they tell you *what it is*, *who it's for*, and *what to do next*? If not, simplify until they can.`,
      `## A responsive hero in Tailwind\n\n\`\`\`html\n<section class=\"mx-auto max-w-3xl px-6 py-24 text-center\">\n  <span class=\"rounded-full bg-blue-50 px-3 py-1 text-sm\n               font-medium text-blue-700\">New · v2.0</span>\n  <h1 class=\"mt-6 text-4xl font-bold tracking-tight\n             sm:text-6xl\">Study smarter, not harder</h1>\n  <p class=\"mt-4 text-lg text-gray-600\">\n    Turn lecture notes into flashcards, summaries, and a\n    study plan — automatically.\n  </p>\n  <div class=\"mt-8 flex justify-center gap-3\">\n    <a class=\"rounded-lg bg-blue-600 px-6 py-3 font-medium\n              text-white hover:bg-blue-700\" href=\"#\">Get started</a>\n    <a class=\"rounded-lg border px-6 py-3 font-medium\" href=\"#\">See demo</a>\n  </div>\n</section>\n\`\`\`\n\nResponsive by default: text scales at \`sm:\`, the container caps width, and the CTAs stack naturally on small screens.`,
    ],
  },
  {
    id: 'startup',
    keywords: [
      'startup',
      'business plan',
      'mvp',
      'founder',
      'pitch',
      'venture',
      'co-founder',
      'bootstrap',
      'business idea',
      'company',
    ],
    responses: [
      `## A one-page business plan\n\nForget the 40-page document. Fill in these eight boxes and you have a real plan:\n\n| Block | Your answer |\n| --- | --- |\n| **Problem** | the painful, frequent problem |\n| **Customer** | who has it most acutely |\n| **Solution** | your 1-sentence approach |\n| **Unique value** | why you, why now |\n| **Channels** | how they'll find you |\n| **Revenue** | how you make money |\n| **Costs** | your top 3 expenses |\n| **Metric** | the one number you watch |\n\n**Next step:** validate the *Problem* and *Customer* rows with 10 real conversations before building anything. If those two are wrong, nothing else matters.`,
      `## Scoping an MVP that ships\n\nThe goal of an MVP is to **learn**, not to impress. Cut until it hurts, then cut once more.\n\n1. Write the **one** core action a user must complete to get value.\n2. List every feature. Mark each *Must / Nice / Later*.\n3. Build only the **Musts** — fake the rest manually if you can ("do things that don't scale").\n4. Get 5–10 people using it within 2 weeks.\n\n> If you're not slightly embarrassed by your first version, you launched too late. Speed of learning is the only metric that matters early.`,
      `## What investors actually look for\n\nAt the earliest stage it's mostly **team, market, and traction** — in that order:\n\n- **Team** — why are *you* the people to win this?\n- **Market** — is it big enough to matter, and growing?\n- **Traction** — any signal that people want this (users, revenue, waitlist, retention).\n\nA tight narrative beats a flashy deck:\n\n> "We help \\[customer] achieve \\[outcome]. We've grown to \\[traction] in \\[time] because \\[unfair advantage]. We're raising \\[amount] to \\[specific milestone]."\n\nClarity signals that you understand your own business. Vagueness signals the opposite.`,
      `## Pricing your product\n\nMost founders price too low. A simple framework:\n\n1. **Value-based, not cost-based** — price against the outcome you create, not your costs.\n2. **3 tiers** — anchor high, make the middle the obvious choice.\n3. **Charge for the value metric** — seats, usage, or projects — whatever scales with the customer's success.\n\n| Tier | Who | Lever |\n| --- | --- | --- |\n| Starter | individuals | low friction, self-serve |\n| Pro | power users / small teams | the money-maker |\n| Enterprise | orgs | "Contact us", custom |\n\nRaise prices as you add value — early customers can be grandfathered. Under-pricing is far more common (and more dangerous) than over-pricing.`,
      `## Validate before you build\n\nThe cheapest code is the code you never write. Before building, run a **smoke test**:\n\n- A simple landing page describing the outcome + an email capture.\n- Drive 100–200 visitors (a relevant community, a small ad, your network).\n- Measure: do people sign up? Will any **pre-pay** or book a call?\n\nConversations + a landing page can validate demand in a week for almost nothing. Building first and *then* looking for customers is the most expensive way to learn you were wrong.`,
    ],
  },
  {
    id: 'marketing',
    keywords: [
      'marketing',
      'growth',
      'audience',
      'social media',
      'campaign',
      'brand',
      'content marketing',
      'seo',
      'ads',
      'funnel',
      'engagement',
    ],
    responses: [
      `## 10 marketing ideas you can run this month\n\n1. **Founder's story** post — why you built this (people buy the *why*).\n2. **Customer spotlight** — a real before/after.\n3. **Free tool/template** that solves a slice of the problem.\n4. **Comparison guide** — "X vs Y" (great for SEO).\n5. **Behind-the-scenes** build-in-public thread.\n6. **Mini case study** with one concrete number.\n7. **Weekly tip series** — same format, repeatable.\n8. **Partner cross-promo** with a complementary product.\n9. **Answer 5 real questions** from forums/Reddit in depth.\n10. **Referral nudge** — give existing users a reason to share.\n\n**Pick two, do them consistently for 30 days.** Consistency beats variety — one channel done well outperforms five done occasionally.`,
      `## A content engine that compounds\n\nThink in a funnel and match content to each stage:\n\n| Stage | Goal | Content |\n| --- | --- | --- |\n| **Top** | get discovered | SEO posts, social, video |\n| **Middle** | build trust | guides, case studies, email |\n| **Bottom** | convert | demos, comparisons, free trial |\n\n**The repurposing loop:** write one substantial piece → slice it into 5 social posts → 1 email → 1 short video. One idea, five touchpoints, a fraction of the effort.`,
      `## SEO that actually moves the needle\n\nSkip the tricks. Modern SEO is three things done well:\n\n1. **Intent** — write the page that fully answers the search, better than what ranks now.\n2. **Structure** — clear \`<h1>\`, descriptive headings, fast load, mobile-friendly.\n3. **Authority** — earn links by being genuinely link-worthy (data, tools, depth).\n\n> Target *specific* long-tail queries first ("best note app for medical students") before chasing broad, brutal terms ("notes app"). You'll rank faster and attract people who actually convert.`,
      `## Your first 100 customers\n\nEarly growth is **un-scalable on purpose**:\n\n- **Go where they already are** — the 2–3 communities/subreddits/Discords your users hang out in. Be helpful, not spammy.\n- **DM 1:1** — personal outreach converts far better than broadcasts at this stage.\n- **Turn users into advocates** — a delighted user telling a friend beats any ad.\n\nDon't optimize ad spend at 10 customers. Talk to humans, fix what they hate, and the channel that works will reveal itself.`,
      `## A campaign brief template\n\nBefore launching anything, fill this out — it forces clarity:\n\n- **Objective:** the one measurable goal (e.g. "300 trial signups").\n- **Audience:** who specifically, and where they pay attention.\n- **Message:** the single idea they should remember.\n- **Offer/CTA:** the exact action you want.\n- **Channels:** where it runs.\n- **Success metric:** how you'll know it worked.\n\n> One objective per campaign. Trying to drive awareness *and* signups *and* engagement at once usually achieves none of them.`,
    ],
  },
  {
    id: 'sales',
    keywords: [
      'sales',
      'sell',
      'cold email',
      'lead',
      'pipeline',
      'closing',
      'prospect',
      'outreach',
      'crm',
      'deal',
      'objection',
    ],
    responses: [
      `## A cold email that gets replies\n\nKeep it short, specific, and about *them*:\n\n\`\`\`text\nSubject: quick question about \\[their team]'s onboarding\n\nHi \\[Name],\n\nNoticed \\[specific, true observation about their company].\nTeams like yours usually struggle with \\[specific pain].\n\nWe helped \\[similar company] cut that by \\[concrete result].\nWorth a 15-min call next week to see if it fits?\n\n\\[Your name]\n\`\`\`\n\n**Why it works:** one relevant observation, one pain, one proof point, one easy ask. No "I hope this finds you well," no paragraph about your features. Personalize the first line for real — that's the part that earns the reply.`,
      `## Handling the "it's too expensive" objection\n\nPrice objections are usually **value** objections in disguise. Don't discount reflexively — re-anchor on value:\n\n1. **Acknowledge:** "Totally fair to weigh the cost."\n2. **Reframe:** "Compared to \\[the cost of the problem / status quo]…"\n3. **Quantify:** tie it to time saved or revenue gained.\n4. **Confirm fit:** "If we solved \\[outcome], would the price make sense?"\n\n> If they still balk after you've shown real value, they may not be your customer — and that's fine. Chasing the wrong fit at a discount costs you more later.`,
      `## A simple, honest sales pipeline\n\nFive stages, clear exit criteria for each:\n\n| Stage | Exit criteria |\n| --- | --- |\n| **Lead** | matches your ICP |\n| **Contacted** | replied / booked |\n| **Qualified** | has need, budget, timeline |\n| **Proposal** | sent + reviewed |\n| **Closed** | won or lost (mark *why*) |\n\nReview weekly and **always log why deals are lost** — those reasons are your roadmap and your sharpest messaging insights.`,
    ],
  },
  {
    id: 'product',
    keywords: [
      'product',
      'feature',
      'roadmap',
      'user research',
      'prioritize',
      'backlog',
      'user story',
      'ux',
      'product manager',
      'retention',
    ],
    responses: [
      `## Prioritizing with RICE\n\nWhen everything feels urgent, score it:\n\n**RICE = (Reach × Impact × Confidence) ÷ Effort**\n\n| Feature | Reach | Impact | Conf. | Effort | Score |\n| --- | --- | --- | --- | --- | --- |\n| Onboarding revamp | 800 | 2 | 0.8 | 3 | **427** |\n| Dark mode | 1200 | 0.5 | 0.9 | 2 | 270 |\n| New export format | 200 | 1 | 0.7 | 1 | 140 |\n\nThe math isn't sacred — its real value is forcing an honest debate about *reach* and *effort*. The highest-scoring item is rarely the loudest one in the room.`,
      `## Writing a user story that's actually useful\n\nUse the classic format, but earn its keep with **acceptance criteria**:\n\n> **As a** student, **I want to** turn a PDF into flashcards **so that** I can study without manual data entry.\n\n**Acceptance criteria**\n\n- Upload accepts PDF/DOCX up to 20 MB.\n- Cards are editable before saving.\n- A 10-page doc processes in under 30s.\n\nThe story captures the *why*; the criteria make it **testable**. Without criteria, "done" is an argument waiting to happen.`,
      `## Talk to users without leading them\n\nGood discovery interviews dig into the **past**, not hypotheticals:\n\n- ❌ "Would you use a feature that…?" (everyone says yes)\n- ✅ "Tell me about the last time you faced \\[problem]."\n- ✅ "What did you do? What was annoying about it?"\n- ✅ "What would have to be true for you to switch?"\n\n> Past behavior predicts future behavior; opinions about the future don't. Listen 80% of the time and your roadmap writes itself.`,
    ],
  },
  {
    id: 'investment',
    keywords: [
      'invest',
      'investment',
      'stock',
      'portfolio',
      'compound',
      'savings',
      'finance',
      'budget',
      'retirement',
      'index fund',
      'money',
    ],
    responses: [
      `## The boring strategy that usually wins\n\n> ⚠️ Educational only — not financial advice. For real decisions, talk to a licensed professional.\n\nThe evidence-backed basics most people benefit from:\n\n1. **Emergency fund first** — 3–6 months of expenses in cash.\n2. **Pay off high-interest debt** — a 20% APR is a guaranteed 20% "return."\n3. **Invest regularly** — automatic monthly contributions into low-cost, broad index funds.\n4. **Diversify** — don't concentrate in one stock or sector.\n5. **Time *in* the market** beats *timing* the market.\n\nThe magic is **compounding** — the longer your money grows, the more the growth itself grows. Boring and consistent beats clever and sporadic.`,
      `## The power of compounding\n\nA small amount invested early can beat a large amount invested late.\n\n\`\`\`text\n$200/month at 7% annual return:\n\n10 years  →  ~$34,600\n20 years  →  ~$104,000\n30 years  →  ~$244,000\n\`\`\`\n\nYou contributed $72,000 over 30 years — the other ~$172,000 is growth on growth. The lesson: **start now, even small.** Time is the variable you can't get back later.`,
      `## A simple budget that sticks: 50/30/20\n\n| Bucket | Share | What goes here |\n| --- | --- | --- |\n| **Needs** | 50% | rent, food, utilities, minimum debt |\n| **Wants** | 30% | dining out, subscriptions, hobbies |\n| **Savings** | 20% | emergency fund, investing, extra debt |\n\nAutomate the 20% **first** (pay yourself before you can spend it). If 50/30 don't fit your reality, adjust the ratios — the discipline of *automating savings first* matters more than the exact split.`,
    ],
  },
  {
    id: 'strategy',
    keywords: [
      'strategy',
      'competitive',
      'swot',
      'positioning',
      'differentiat',
      'moat',
      'okr',
      'goals',
      'planning',
      'vision',
      'roadmap',
    ],
    responses: [
      `## A SWOT that's actually useful\n\nMost SWOTs are useless lists. Make yours **decision-driving**:\n\n| | Helpful | Harmful |\n| --- | --- | --- |\n| **Internal** | Strengths | Weaknesses |\n| **External** | Opportunities | Threats |\n\nThe value is in the **pairings**, not the boxes:\n\n- Strength × Opportunity → *where do we double down?*\n- Weakness × Threat → *what could sink us?*\n\nEnd every SWOT with **three concrete actions**, or you've just made a list.`,
      `## Setting OKRs that focus a team\n\n**Objective** = a qualitative, inspiring direction. **Key Results** = 3 measurable outcomes that prove you got there.\n\n> **Objective:** Make onboarding effortless\n> **KR1:** Increase activation rate 40% → 60%\n> **KR2:** Cut time-to-first-value from 12 min → 4 min\n> **KR3:** Lift week-1 retention 25% → 40%\n\n**Pitfalls:** KRs that measure *activity* ("ship 5 features") instead of *outcomes*. Keep it to one Objective and ~3 KRs per quarter — more than that and nothing is truly a priority.`,
      `## Positioning: own one word\n\nStrong products are **the [X] for [Y]** — the obvious choice for a specific someone.\n\nFill in this statement until it's sharp:\n\n> For **\\[target customer]** who **\\[need]**, **\\[product]** is the **\\[category]** that **\\[key benefit]** — unlike **\\[alternative]**, we **\\[key difference]**.\n\nIf you can't name the alternative and your difference, you don't have positioning yet — you have a feature list. Specific beats broad every time; "for everyone" reaches no one.`,
    ],
  },
  {
    id: 'email',
    weight: 1.1,
    keywords: [
      'email',
      'write an email',
      'draft an email',
      'reply to',
      'reach out',
      'follow up',
      'message to',
      'compose',
      'professor',
      'extension',
    ],
    responses: [
      `## Email: requesting a deadline extension\n\nKeep it brief, accountable, and specific:\n\n> **Subject:** Extension request — \\[Assignment], \\[Course code]\n>\n> Dear Professor \\[Name],\n>\n> I'm writing to request a short extension on \\[assignment], currently due \\[date]. \\[One honest sentence on why — e.g. overlapping deadlines / illness].\n>\n> I've completed \\[what's done] and would be grateful for an extension to **\\[specific new date]** to submit my best work. I'm happy to share my current draft if helpful.\n>\n> Thank you for considering this.\n>\n> Best regards,\n> \\[Your name] · \\[Student ID]\n\n**Why it lands:** it proposes a *specific* date, shows progress, and stays accountable instead of making excuses. Send it **before** the deadline, not after.`,
      `## Email: professional follow-up\n\nWhen you haven't heard back, a short nudge beats silence:\n\n> **Subject:** Following up — \\[topic]\n>\n> Hi \\[Name],\n>\n> Just floating this back to the top of your inbox. \\[One sentence restating the ask + the value to them.]\n>\n> Would \\[specific day/time] work for a quick call? Happy to adjust.\n>\n> Thanks,\n> \\[Your name]\n\n**Rules of thumb:** wait 3–5 business days, add one new piece of value, keep it under 5 sentences, and always include a clear, easy next step.`,
      `## Email: saying no, gracefully\n\nDeclining well preserves the relationship:\n\n> Hi \\[Name],\n>\n> Thank you for thinking of me for \\[request] — it genuinely means a lot.\n>\n> I'm not able to take this on right now because \\[brief, honest reason]. I want to be upfront rather than overcommit and let you down.\n>\n> \\[Optional: a useful alternative — a referral, a later date, a smaller scope.]\n>\n> Wishing you the best with it,\n> \\[Your name]\n\n**Structure:** appreciate → decline clearly → (optional) offer a path. No long apologies — a clean, kind "no" is more respectful than a vague maybe.`,
      `## Email: a warm cold intro\n\nReaching out to someone new? Lead with relevance, not your ask:\n\n> **Subject:** \\[Specific, genuine reason you're writing]\n>\n> Hi \\[Name],\n>\n> I really admired \\[specific thing they did — be real and specific]. \\[One sentence connecting it to you.]\n>\n> I'd love \\[small, specific ask — 15 minutes, one question, a pointer]. No worries at all if the timing's off.\n>\n> Thanks for reading,\n> \\[Your name]\n\nThe magic is in the **specific** first line — it proves you're a real person who did their homework, not a mail-merge.`,
    ],
  },
  {
    id: 'article',
    keywords: [
      'article',
      'blog',
      'blog post',
      'essay',
      'write about',
      'outline',
      'paragraph',
      'introduction',
      'thesis',
      'newsletter',
    ],
    responses: [
      `## Blog post outline: \"How to Study Smarter, Not Harder\"\n\n**Hook:** open with the myth — *more hours ≠ better grades.*\n\n1. **The cramming trap** — why re-reading feels productive but isn't.\n2. **Active recall** — testing yourself beats reviewing (with the science in one line).\n3. **Spaced repetition** — the forgetting curve, and how to beat it.\n4. **Interleaving** — mixing topics > blocking one subject.\n5. **The environment** — sleep, breaks, and the myth of multitasking.\n6. **A weekly system** — put it together into a simple routine.\n\n**Close:** one concrete action to try tonight + a question to drive comments.\n\n> Each section = one idea + one example + one takeaway. That rhythm keeps readers moving and makes the post skimmable.`,
      `## A reliable structure for any article\n\nThe shape great non-fiction tends to follow:\n\n1. **Hook** — a surprising fact, question, or tension (first 2 sentences earn the rest).\n2. **Promise** — what the reader will get.\n3. **Body** — 3–5 points, each: claim → evidence → example.\n4. **Turn** — a nuance, counterpoint, or "but here's the catch."\n5. **Takeaway** — one thing to remember or do.\n\n**Write the body first, the intro last.** You can't hook readers into a piece you haven't written yet — you won't know the best angle until it's done.`,
      `## Make your writing clearer, instantly\n\nFive edits that sharpen almost any draft:\n\n- **Cut throat-clearing** — delete "I think that," "in order to," "it is important to note."\n- **Verbs over nouns** — "we decided" beats "we made a decision."\n- **One idea per sentence** — if you need two commas to breathe, split it.\n- **Concrete over abstract** — "saved 3 hours" beats "improved efficiency."\n- **Read it aloud** — your ear catches what your eye skips.\n\n> Brackets test: if a sentence still makes sense after you delete a phrase, delete it. Most first drafts are 20% longer than they need to be.`,
    ],
  },
  {
    id: 'rewrite',
    weight: 1.1,
    keywords: [
      'rewrite',
      'improve my writing',
      'make it better',
      'paraphrase',
      'reword',
      'polish',
      'make this sound',
      'professional tone',
      'edit this',
      'improve this',
    ],
    responses: [
      `## Improving your writing — paste it in\n\nDrop the text and tell me the goal (clearer? shorter? more formal? warmer?) and I'll return a polished version plus a note on *what* I changed and *why*.\n\nWhile you grab it, here's the lens I apply:\n\n- **Tighten** — cut filler, merge redundant sentences.\n- **Strengthen verbs** — replace "make/do/get" with precise ones.\n- **Fix rhythm** — vary sentence length so it doesn't drone.\n- **Match the tone** — formal, friendly, or persuasive, on purpose.\n\n> Example: *"We are in the process of making improvements to the system"* → **"We're improving the system."** Same meaning, half the words, twice the energy.`,
      `## Three tones, same message\n\nHere's how one sentence shifts by register — tell me which fits:\n\n**Original:** "I wanted to reach out to see if you got my last message."\n\n- **Formal:** "I'm following up to confirm whether my previous message reached you."\n- **Friendly:** "Just checking my last note made it to you!"\n- **Direct:** "Did my last message come through?"\n\nSame intent, three feels. Paste your text and name the tone you want — I'll rewrite it to match and keep your voice intact.`,
      `## Plain-language rewrite\n\nDense, jargon-heavy writing hides good ideas. The fix is mechanical:\n\n1. Replace jargon with the plainest accurate word.\n2. Break long sentences at the conjunctions.\n3. Put the **subject and verb early** — don't bury the action.\n4. Prefer active voice ("the team shipped it" > "it was shipped").\n\n**Before:** "Utilization of the aforementioned methodology facilitates optimization."\n**After:** "This method makes things faster."\n\nSend me your paragraph and I'll do this pass on it, preserving any meaning you can't lose.`,
    ],
  },
  {
    id: 'grammar',
    keywords: [
      'grammar',
      'spelling',
      'punctuation',
      'proofread',
      'typo',
      'correct this',
      'is this correct',
      'comma',
      'tense',
    ],
    responses: [
      `## Proofreading — send it over\n\nPaste your text and I'll fix grammar, spelling, and punctuation, then briefly flag anything stylistic.\n\nWhile you do, the mistakes I see most often:\n\n- **its vs. it's** — *its* = possessive, *it's* = "it is."\n- **their / there / they're** — possessive / place / "they are."\n- **Comma splices** — two full sentences joined by only a comma. Use a period, semicolon, or conjunction.\n- **Subject–verb agreement** — "the list of items **is** long" (the subject is *list*, not *items*).\n\nDrop the text in and I'll return a clean version.`,
      `## The comma rules that cover 90% of cases\n\n1. **Before a coordinating conjunction** joining two full sentences: *"It rained, so we stayed in."*\n2. **After an introductory phrase:** *"After lunch, we left."*\n3. **Around non-essential info:** *"My brother, who lives in Berlin, called."*\n4. **Between list items:** *"pens, paper, and tape"* (the last comma is the Oxford comma — keep it for clarity).\n\n> If removing the clause doesn't change the core meaning, wrap it in commas. If it's essential, don't.`,
      `## "Affect" vs "Effect" (and other classics)\n\n- **Affect** = verb, to influence. *"The noise affected my focus."*\n- **Effect** = noun, the result. *"The effect was immediate."*\n- **Then** = time. **Than** = comparison.\n- **Fewer** = countable. **Less** = uncountable. *"Fewer emails, less stress."*\n\nQuick trick for affect/effect: if you can put "the" in front, it's **effect** (the effect). Send me a sentence you're unsure about and I'll explain the call.`,
    ],
  },
  {
    id: 'summarize',
    weight: 1.1,
    keywords: [
      'summarize',
      'summary',
      'tldr',
      'key points',
      'condense',
      'shorten',
      'bullet points',
      'gist',
      'main idea',
      'recap',
    ],
    responses: [
      `## Summarizing — paste the text (or drop a file)\n\nGive me the content and your preferred format and I'll condense it. I can return:\n\n- **TL;DR** — one or two sentences.\n- **Key points** — 3–7 bullets.\n- **Structured** — sections with headings.\n- **ELI5** — plain-language version.\n\nHere's the method I use so nothing important gets lost:\n\n1. Identify the **main claim** (the one sentence everything supports).\n2. Pull the **supporting points** (the load-bearing arguments).\n3. Drop examples, repetition, and asides.\n4. Reassemble in *your* requested length.\n\nUpload a document above or paste the text and tell me the length you want.`,
      `## How to write a summary that's actually faithful\n\nThe trap is summarizing the *words* instead of the *meaning*. A good summary:\n\n- Leads with the **conclusion**, not the build-up.\n- Keeps the author's **emphasis** (what they spent the most ink on).\n- Drops examples but keeps the **point** the examples made.\n- Stays **neutral** — it reports, it doesn't argue.\n\n> A test: could someone act correctly on your summary *without* reading the original? If yes, it's faithful. If they'd be surprised by the full text, you cut the wrong things.`,
      `## Three summary lengths, on demand\n\nTell me which depth you need and I'll match it:\n\n| Length | Use it for |\n| --- | --- |\n| **One line** | a Slack ping, a subject line |\n| **5 bullets** | skimming before a meeting |\n| **Half page** | a briefing you'll act on |\n\nPaste the source text or upload a PDF/DOCX above. I'll also surface any **action items** or open questions I spot, so the summary is something you can *do* something with — not just read.`,
    ],
  },
  {
    id: 'data',
    keywords: [
      'data',
      'analyze',
      'analysis',
      'dataset',
      'chart',
      'metric',
      'statistics',
      'trend',
      'spreadsheet',
      'csv',
      'excel',
      'visualize',
    ],
    responses: [
      `## Analyzing data — a repeatable framework\n\nDrop a CSV/spreadsheet above, or describe the dataset, and I'll work through it. The framework I follow:\n\n1. **Understand** — what's one row? what are the columns and types?\n2. **Clean** — nulls, duplicates, wrong types, outliers.\n3. **Describe** — counts, averages, distributions per key dimension.\n4. **Compare** — segment by category/time to find what differs.\n5. **Conclude** — the 2–3 findings that change a decision.\n\n> The goal isn't a pile of charts — it's the *one insight* someone can act on. Always end with "so what?"`,
      `## Picking the right chart\n\nThe chart should match the *question*, not your mood:\n\n| Question | Chart |\n| --- | --- |\n| How did it change over time? | **line** |\n| How do categories compare? | **bar** |\n| What's the composition of a whole? | **stacked bar** (avoid pie > 4 slices) |\n| Is there a relationship? | **scatter** |\n| How is one variable distributed? | **histogram** |\n\n**Rules:** start bar charts at zero, label axes, and never use a 3-D chart. If a table communicates it more clearly, use a table.`,
      `## From numbers to a narrative\n\nRaw stats don't persuade — **comparison and context** do. Turn a metric into a story:\n\n- ❌ "Conversion is 3.2%."\n- ✅ "Conversion rose from 2.1% to 3.2% after the new onboarding — a **52% lift**, worth ~\\[X] in monthly revenue."\n\nThree moves that make data land:\n\n1. **Compare** to a baseline or benchmark.\n2. **Quantify the impact** in money or time.\n3. **Recommend** the next action.\n\nSend me your numbers and I'll frame them this way.`,
      `## Spotting what's misleading\n\nBefore you trust a chart or stat, run these checks:\n\n- **Truncated axis** — a bar chart not starting at zero exaggerates differences.\n- **Cherry-picked range** — "up 40%!" from a hand-picked low point.\n- **Correlation ≠ causation** — two lines moving together isn't proof.\n- **Small samples** — "80% preferred it" (n = 5).\n- **Survivorship bias** — only counting what's left.\n\n> Always ask: *compared to what, over what period, out of how many?* Those three questions defuse most misleading data.`,
    ],
  },
  {
    id: 'ideas',
    keywords: [
      'idea',
      'ideas',
      'brainstorm',
      'suggestions',
      'creative',
      'name for',
      'come up with',
      'inspiration',
      'concepts',
      'think of',
    ],
    responses: [
      `## Let's brainstorm — here's a quick batch\n\nTo make these useful, tell me the **goal**, **audience**, and any **constraints**. In the meantime, a way to generate ideas that don't all look alike:\n\n- **Combine** two unrelated things ("\\[your thing] meets \\[other domain]").\n- **Invert** the problem — what would make it *worse*? Now flip each.\n- **Constrain** hard — "what if it had to be free?" / "done in a day?"\n- **Steal patterns** from another industry that solved something similar.\n\n> The first 10 ideas are obvious; the good ones usually show up around #15. Quantity first, judge later — don't filter while you generate.`,
      `## Naming things (products, projects, features)\n\nA few angles that produce names worth keeping:\n\n1. **Descriptive** — says what it does (*Mailchimp, Dropbox*).\n2. **Evocative** — a feeling/metaphor (*Amazon, Stripe*).\n3. **Invented** — coined, ownable (*Spotify, Twilio*).\n4. **Mashup** — two words fused (*Pinterest, Snapchat*).\n\n**Checklist before you commit:** easy to say out loud, easy to spell after hearing it, \`.com\` or a clean handle available, no awkward meaning in other languages. Give me the product and a vibe and I'll generate a batch.`,
      `## Beating a blank page\n\nStuck? Don't try to think *harder* — change the prompt:\n\n- **The "bad idea" round** — deliberately list terrible ideas. It breaks the pressure, and bad ideas often hide a good one.\n- **The analogy** — "this is like \\[familiar thing], so what's the equivalent of \\[its best part]?"\n- **The constraint** — add an absurd limit (one button, ten words, no screen).\n- **The user's day** — walk through their hour-by-hour and spot friction.\n\nTell me what you're stuck on and I'll run one of these with you.`,
      `## 8 project ideas to build & learn\n\nGreat for a portfolio — each teaches something different:\n\n1. **Habit tracker** with streaks (state + local storage).\n2. **Markdown notes app** (parsing + editor UX).\n3. **Expense splitter** for roommates (logic + auth).\n4. **Flashcard study tool** with spaced repetition.\n5. **Personal finance dashboard** (charts + data).\n6. **URL shortener** (backend + DB + redirects).\n7. **Recipe finder** by ingredients you have.\n8. **Pomodoro + analytics** to track focus.\n\n> Pick one you'd actually *use*. You'll push through the boring 20% only if you care about the result.`,
    ],
  },
  {
    id: 'productivity',
    keywords: [
      'productivity',
      'focus',
      'time management',
      'procrastinat',
      'schedule',
      'habit',
      'distraction',
      'overwhelmed',
      'organize',
      'study plan',
      'pomodoro',
    ],
    responses: [
      `## Beating procrastination (the mechanical way)\n\nProcrastination is rarely laziness — it's usually a task that's **too big, too vague, or a little scary**. Shrink it:\n\n1. **Make it tiny** — "write the intro paragraph," not "write the essay."\n2. **The 2-minute start** — commit to just 2 minutes. Starting is the hard part; momentum does the rest.\n3. **Remove friction** — close the tabs, phone in another room.\n4. **Body-double** — work alongside someone (even on a call).\n\n> Don't wait to *feel* motivated. Action creates motivation, not the other way around. Start ugly, fix later.`,
      `## A study plan that actually works\n\nBuild backward from the exam:\n\n1. **List every topic**, rate each 🔴 weak / 🟡 okay / 🟢 strong.\n2. **Spend most time on 🔴** — not on re-reading what you already know (that just feels productive).\n3. **Active recall** — close the book and quiz yourself; struggling to remember *is* the learning.\n4. **Space it out** — short daily sessions beat one marathon.\n5. **Mock conditions** — at least one timed practice run.\n\n> CampusForge tip: turn your notes into flashcards and review a few each day. Spacing + testing is the most evidence-backed combo there is.`,
      `## Time-blocking your week\n\nA to-do list tells you *what*; a calendar tells you *when* — and only the second one is honest about your limited hours.\n\n- **Theme your days** if you can (deep work mornings, meetings afternoons).\n- **Block deep work** in 60–90 min chunks; protect them like meetings.\n- **Batch shallow tasks** (email, admin) into one or two windows.\n- **Leave 20% empty** — things always run over; a packed calendar guarantees failure.\n\n> Schedule the **hard, important** thing first, when your energy is highest. Everything else fits around it.`,
      `## The Pomodoro technique, properly\n\nDead simple, surprisingly effective for focus:\n\n1. Pick **one** task.\n2. Work **25 minutes**, no switching, no checking anything.\n3. Break **5 minutes** (stand, stretch, look away from the screen).\n4. Every 4 rounds, take a **longer 15–30 min** break.\n\n**Why it works:** 25 minutes is small enough to start without dread, and the timer turns "focus" into a game you can win. Adjust the interval to your attention span — the structure matters more than the exact number.`,
    ],
  },
  {
    id: 'weather',
    weight: 0.7,
    keywords: [
      'weather',
      'temperature outside',
      'forecast',
      'is it going to rain',
      'how hot',
      'how cold',
      'sunny',
      'raining',
    ],
    responses: [
      `I don't have live weather access right now, so I can't pull real-time conditions — but I can help you *plan around* the forecast.\n\nTell me your city and what you're planning, and I'll suggest what to wear, whether to bring a backup plan, or how to schedule around likely conditions. For the exact numbers, your weather app will be spot-on.`,
      `I'm not connected to a live weather service, so I can't quote current conditions — but I can still help you make the call.\n\nIf you tell me the season and roughly where you are, I'll give you sensible packing or planning advice. For precise, up-to-the-minute forecasts, a dedicated weather app is your best bet.`,
      `I can't fetch live weather data, but I'm happy to help you decide what to do *given* a forecast. Share what you've got — "rainy, 12°C, all day" — and I'll suggest the move: indoor study session, what to wear, or how to reschedule that outdoor plan.`,
    ],
  },
  {
    id: 'campusforge',
    weight: 0.9,
    keywords: [
      'campusforge',
      'this app',
      'flashcard',
      'workspace',
      'note',
      'lecture',
      'exam',
      'assignment',
      'course',
      'class',
      'semester',
    ],
    responses: [
      `## Making the most of CampusForge\n\nSince you're already in here, a workflow students love:\n\n1. **Upload** your lecture slides or readings to **Documents**.\n2. Let the summary turn them into **Notes** you can skim.\n3. Generate **Flashcards** from those notes for active recall.\n4. Drop deadlines into **Tasks** so nothing sneaks up.\n5. Use **me** to quiz you, explain hard bits, or draft that email to your professor.\n\nWant me to turn a topic into a set of practice questions right now? Just name the subject.`,
      `## From lecture to mastery\n\nThe loop that actually moves grades:\n\n- **Capture** — notes & documents in your workspace (don't rely on memory).\n- **Condense** — summarize into the 20% that carries 80% of the marks.\n- **Test** — flashcards + me quizzing you (recall beats re-reading every time).\n- **Space** — review a little, often, across days.\n\nTell me the subject and your exam date and I'll sketch a week-by-week plan you can drop straight into Tasks.`,
      `## Quick exam-prep helpers\n\nI can do any of these right now — just ask:\n\n- **Generate practice questions** on a topic (with answers).\n- **Explain a concept** at whatever level you need ("like I'm five" → "exam-ready").\n- **Make a mnemonic** for something you keep forgetting.\n- **Turn messy notes into clean ones** — paste them in.\n- **Draft a study schedule** backward from your exam date.\n\nWhich one would help most?`,
    ],
  },
];

/* Fallback when nothing matches strongly enough. */
const GENERIC: string[] = [
  `Great question. Let me give you a clear, useful answer.\n\nHere's how I'd approach it:\n\n1. **Clarify the goal** — what does a good outcome actually look like here?\n2. **Break it down** — split it into the 2–3 pieces that matter most.\n3. **Start with the highest-leverage piece** — the one that unblocks the rest.\n4. **Iterate** — do a rough version, then improve it.\n\nIf you give me a bit more detail — the context, the constraints, and what you've tried — I can get much more specific and actually do the work with you. What's the situation?`,
  `Happy to help with this. To give you something genuinely useful rather than generic, a couple of quick questions:\n\n- What's the **end result** you're aiming for?\n- Are there any **constraints** (time, tools, audience, format)?\n- What have you **already tried** or considered?\n\nEven a sentence on each lets me tailor the answer precisely. In the meantime, here's a solid starting point: break the problem into "what I know," "what I need to find out," and "the first concrete step" — that framing alone usually reveals the path forward.`,
  `Let me think this through with you.\n\nMost problems like this come down to a few moving parts. Here's a framework that adapts to almost anything:\n\n| Step | Question to answer |\n| --- | --- |\n| **Define** | What exactly am I solving? |\n| **Decompose** | What are the sub-parts? |\n| **Decide** | What's the first move? |\n| **Do** | Build a rough version |\n| **Review** | What did I learn? |\n\nTell me more about your specific situation and I'll fill this in with real, concrete steps for *your* case.`,
  `That's a solid thing to dig into. Here's my take, and then tell me where you want to go deeper.\n\nThe key is usually to separate the **outcome** you want from the **method** you reach for. People often jump to a method ("I need a spreadsheet / an app / a meeting") before they're clear on the outcome. Lock the outcome first, and the right method often becomes obvious.\n\nGive me the specifics — what you're trying to achieve and the context around it — and I'll turn this into concrete, actionable steps you can use today.`,
  `Good one — let's get you a real answer.\n\nI work best when I can see the specifics, so the more context you share, the sharper I can be. That said, here's a dependable starting move: write down, in one sentence, *what would make this a success.* Then list the obstacles between you and that sentence. Tackling the biggest obstacle first is almost always the right call.\n\nWhat's the full picture? I'll take it from there.`,
];

/* ------------------------------------------------------------------ *
 * Selection + dedup
 * ------------------------------------------------------------------ */

const usedByCategory: Record<string, Set<number>> = {};

function pickUnused(categoryId: string, pool: string[]): string {
  if (pool.length === 0) return GENERIC[0];
  let used = usedByCategory[categoryId];
  if (!used) {
    used = new Set<number>();
    usedByCategory[categoryId] = used;
  }
  if (used.size >= pool.length) used.clear(); // exhausted → reset

  const available: number[] = [];
  for (let i = 0; i < pool.length; i++) if (!used.has(i)) available.push(i);

  const idx = available[Math.floor(Math.random() * available.length)];
  used.add(idx);
  return pool[idx];
}

function detectCategory(message: string): Category | null {
  const text = ` ${message.toLowerCase()} `;
  let best: Category | null = null;
  let bestScore = 0;

  for (const cat of CATEGORIES) {
    let hits = 0;
    for (const kw of cat.keywords) {
      if (text.includes(kw)) hits += 1;
    }
    if (hits === 0) continue;
    const score = hits * (cat.weight ?? 1);
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Model personalities + length shaping
 *
 * Switching models meaningfully changes tone, length and framing:
 *   GPT-4.1        → professional, balanced, structured (clean, no fluff)
 *   Claude 4       → thoughtful, long-form, friendly (warm opener + follow-up)
 *   Gemini 2.5 Pro → creative, visual, fast (energetic opener + visual offer)
 *   DeepSeek       → technical, code-first, detailed (reasoning lead-in)
 *   Mistral Large  → short, concise, direct (trimmed to the essentials)
 * ------------------------------------------------------------------ */

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

const PERSONA = {
  'claude-4-sonnet': {
    openers: [
      'Happy to think this through with you.',
      "Great question — let's unpack it properly.",
      "Here's how I'd approach it, step by step.",
      "Let's take this one carefully.",
    ],
    closers: [
      'Want me to go deeper on any part of this?',
      'Happy to tailor this to your exact situation — just say the word.',
      'If you share a bit more context, I can make this even more specific.',
      'Let me know which direction you’d like to take it.',
    ],
  },
  'gemini-2.5-pro': {
    openers: [
      '✨ Here’s a fresh angle on it:',
      '💡 Let’s make this clear and visual:',
      '🚀 Quick take, then the details:',
      '🎯 Here’s the sharp version:',
    ],
    closers: [
      'Want this as a diagram or a step-by-step walkthrough?',
      'I can turn this into a visual or a checklist if that helps.',
      'Happy to remix this into something more visual.',
      'Want me to sketch this out differently?',
    ],
  },
  deepseek: {
    openers: [
      'Let me reason through this step by step.',
      'Breaking this down technically:',
      'Here’s the precise, technical view.',
      'Let’s work through the details methodically.',
    ],
    closers: [
      'I can go deeper into the implementation details if useful.',
      'Want the edge cases and trade-offs spelled out too?',
      'Happy to expand any step into full detail.',
      'I can include a complexity/perf breakdown if you need it.',
    ],
  },
} as const;

/** Count fenced code-block delimiters to avoid trimming inside one. */
function fenceCount(text: string): number {
  return (text.match(/```/g) ?? []).length;
}

/** Keep whole blocks until a soft budget is hit, never splitting a code fence. */
function keepBlocks(text: string, minBlocks: number, charBudget: number): string {
  const blocks = text.split(/\n\n+/);
  const kept: string[] = [];
  let chars = 0;
  let open = 0;
  for (const b of blocks) {
    kept.push(b);
    chars += b.length;
    open += fenceCount(b);
    if (kept.length >= minBlocks && chars > charBudget && open % 2 === 0) break;
  }
  return kept.join('\n\n');
}

function trimToLength(text: string, length: ResponseLength): string {
  if (length === 'detailed') return text;
  const blocks = text.split(/\n\n+/);
  if (length === 'balanced') {
    if (blocks.length <= 6) return text;
    return keepBlocks(text, 5, 0);
  }
  return keepBlocks(text, 2, 280); // concise
}

/** Prepend a lead-in line as its own paragraph (markdown-safe before any block). */
function lead(line: string, body: string): string {
  return `${line}\n\n${body}`;
}

/** Append a closing line, keeping a blank line so markdown stays valid. */
function tail(body: string, line: string): string {
  return `${body}\n\n${line}`;
}

/**
 * Apply the selected model's personality. The effective response length is
 * derived from both the user's setting and the model (Mistral is always tight,
 * DeepSeek leans detailed).
 */
function applyPersonality(base: string, ctx: EngineContext): string {
  const model = ctx.model;

  // Mistral — short, concise, direct. Always trim hard, no openers/closers.
  if (model === 'mistral-large') {
    return keepBlocks(base, 1, 200);
  }

  // Effective length for the rest.
  const effLength: ResponseLength = model === 'deepseek' ? 'detailed' : ctx.responseLength;
  let out = trimToLength(base, effLength);

  if (model === 'claude-4-sonnet') {
    out = lead(pick(PERSONA['claude-4-sonnet'].openers), out);
    out = tail(out, `*${pick(PERSONA['claude-4-sonnet'].closers)}*`);
    return out;
  }

  if (model === 'gemini-2.5-pro') {
    out = lead(pick(PERSONA['gemini-2.5-pro'].openers), out);
    out = tail(out, `*${pick(PERSONA['gemini-2.5-pro'].closers)}*`);
    return out;
  }

  if (model === 'deepseek') {
    out = lead(pick(PERSONA.deepseek.openers), out);
    out = tail(out, `> ${pick(PERSONA.deepseek.closers)}`);
    return out;
  }

  // GPT-4.1 — professional, balanced, structured. Clean, as-is.
  return out;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Produce a markdown response for the user's message. Pure + synchronous —
 * the UI adds the artificial "thinking" delay and word-by-word streaming.
 */
export function generateResponse(message: string, ctx: EngineContext): string {
  const category = detectCategory(message);
  const pool = category ? category.responses : GENERIC;
  const base = pickUnused(category ? category.id : 'generic', pool);
  return applyPersonality(base, ctx);
}

/**
 * Produce a realistic "document analysis" summary for uploaded files.
 */
export function generateFileAnalysis(attachments: Attachment[], ctx: EngineContext): string {
  const file = attachments[0];
  if (!file) return generateResponse('summarize', ctx);

  const isImage = file.kind === 'image';

  if (isImage) {
    const pools = [
      `## Image analysis — \`${file.name}\`\n\nI've taken a look at your image. Here's what I can tell:\n\n- **Format:** ${file.ext.toUpperCase()} · **Size:** ${file.size}\n- **Composition:** clear subject with good contrast — readable at a glance.\n- **Likely use:** works well as a figure, slide visual, or reference.\n\n**Suggestions**\n\n1. If it's going in a report, add a one-line caption describing the takeaway.\n2. For slides, crop to the focal area so it reads from the back of the room.\n3. Export at 2× resolution if it'll be projected.\n\nWant me to draft a caption or alt-text for it?`,
      `## What I see in \`${file.name}\`\n\nThanks for the upload (${file.ext.toUpperCase()}, ${file.size}). Based on the image:\n\n> The visual is well-framed and the key element is easy to identify.\n\n**If this is a chart or diagram,** I'd recommend:\n\n- A descriptive title stating the *insight*, not just the topic.\n- Labeled axes / legend so it stands alone without explanation.\n- Removing any clutter that doesn't support the main point.\n\nTell me the context and I'll help you turn it into something presentation-ready.`,
    ];
    return applyPersonality(pick(pools), ctx);
  }

  const docPools = [
    `## Summary of \`${file.name}\`\n\nI've analyzed your ${file.ext.toUpperCase()} (${file.size}). Here's the breakdown:\n\n**TL;DR**\n\nThe document lays out a clear topic with supporting detail, organized into a few main sections. It's well-structured and suitable for review or study.\n\n**Key points**\n\n1. A central thesis is established early and revisited at the end.\n2. Supporting evidence is grouped into logical sections.\n3. There are several terms/definitions worth turning into flashcards.\n4. The conclusion restates the main takeaways and next steps.\n\n**Suggested actions**\n\n| Action | Why |\n| --- | --- |\n| Make flashcards from the key terms | active recall for retention |\n| Summarize each section in one line | faster revision later |\n| Note any open questions | focus your follow-up reading |\n\nWant me to generate **flashcards** or a **one-page study sheet** from this?`,
    `## Document breakdown — \`${file.name}\`\n\nProcessed your ${file.ext.toUpperCase()} (${file.size}). Here's a structured read:\n\n**What it covers**\n\nThe material walks through its topic methodically, building from foundational ideas toward a practical conclusion. The tone is informative and the structure is easy to follow.\n\n**Main sections**\n\n- **Introduction** — frames the problem and why it matters.\n- **Body** — the core arguments/concepts, with examples.\n- **Conclusion** — synthesis and implications.\n\n**Study recommendations**\n\n1. Convert the bolded terms into Q&A flashcards.\n2. Write a one-sentence summary per section.\n3. Test yourself on the body before re-reading it.\n\n> Tip: upload this into a CampusForge workspace and I can keep referencing it as we study. Want a set of practice questions from it?`,
    `## Analysis complete — \`${file.name}\`\n\nYour ${file.ext.toUpperCase()} (${file.size}) is well-organized and content-rich. Summary below.\n\n**Overview**\n\nThe document presents a focused topic with a logical flow from context → detail → takeaway. Nothing looks missing or out of order.\n\n**Highlights**\n\n- Clear central argument, stated up front.\n- 3–5 supporting points, each with backing detail.\n- A handful of key terms ideal for memorization.\n\n**Next steps I can take for you**\n\n- ✅ Turn it into **5 flashcards**\n- ✅ Write a **one-paragraph abstract**\n- ✅ Extract an **action/checklist** from it\n\nJust tell me which one you'd like.`,
  ];
  return applyPersonality(pick(docPools), ctx);
}

/** Suggested prompt chips for the welcome screen. */
export const SUGGESTED_PROMPTS = [
  {
    icon: 'FileText',
    title: 'Summarize this document',
    subtitle: 'Turn long readings into key points',
  },
  {
    icon: 'Lightbulb',
    title: 'Generate marketing ideas',
    subtitle: '10 campaigns you can run this month',
  },
  { icon: 'Code', title: 'Explain this code', subtitle: 'Plain-English walkthrough + fixes' },
  { icon: 'Briefcase', title: 'Create a business plan', subtitle: 'A focused one-page plan' },
  { icon: 'PenLine', title: 'Improve my writing', subtitle: 'Clearer, sharper, on-tone' },
  { icon: 'BarChart3', title: 'Analyze data', subtitle: 'Find the insight that matters' },
  {
    icon: 'LayoutTemplate',
    title: 'Build a landing page',
    subtitle: 'Structure + copy that converts',
  },
  { icon: 'Database', title: 'Generate SQL query', subtitle: 'From plain English to SQL' },
] as const;
