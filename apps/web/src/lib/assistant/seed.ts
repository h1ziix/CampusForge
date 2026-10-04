/**
 * Seed conversation history shown in the sidebar on first visit, so the
 * assistant looks lived-in rather than empty. These are static demo threads;
 * opening one shows a short, realistic exchange.
 */
import type { Conversation, Message } from './types';

let idCounter = 0;
const uid = (prefix: string) => `${prefix}-seed-${++idCounter}`;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();

function pair(
  userText: string,
  assistantText: string,
  at: number,
  model: Conversation['model'],
): Message[] {
  return [
    { id: uid('m'), role: 'user', content: userText, createdAt: at },
    { id: uid('m'), role: 'assistant', content: assistantText, model, createdAt: at + 4000 },
  ];
}

export function seedConversations(): Conversation[] {
  idCounter = 0;
  const list: Array<Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'> & { ago: number }> = [
    {
      title: 'Marketing Strategy',
      model: 'gpt-4.1',
      seeded: true,
      ago: 2 * HOUR,
      messages: pair(
        'Give me a few marketing ideas for a student note-taking app.',
        `## Marketing ideas for a student note app\n\n1. **Campus ambassadors** — students who get perks for referrals.\n2. **Free exam-week templates** as a lead magnet.\n3. **Before/after study stories** from real users.\n4. **TikTok study-with-me** clips featuring the app.\n5. **Subreddit AMAs** in study/college communities.\n\nStart with two and run them consistently for a month before judging results.`,
        now - 2 * HOUR,
        'gpt-4.1',
      ),
    },
    {
      title: 'React Dashboard',
      model: 'claude-4-sonnet',
      seeded: true,
      ago: 6 * HOUR,
      messages: pair(
        'How should I structure a React dashboard with lots of widgets?',
        `## Structuring a React dashboard\n\nKeep data-fetching at the page level and pass data down to **dumb** widget components:\n\n\`\`\`tsx\n<DashboardGrid>\n  <Widget title=\"Revenue\"><RevenueChart data={revenue} /></Widget>\n  <Widget title=\"Active Users\"><UsersStat value={users} /></Widget>\n</DashboardGrid>\n\`\`\`\n\n- One layout component owns the grid.\n- Each widget is independent and reusable.\n- Memoize heavy charts with \`React.memo\`.`,
        now - 6 * HOUR,
        'claude-4-sonnet',
      ),
    },
    {
      title: 'Business Plan',
      model: 'gpt-4.1',
      seeded: true,
      ago: DAY,
      messages: pair(
        'Help me outline a business plan for a tutoring marketplace.',
        `## One-page plan: tutoring marketplace\n\n| Block | Answer |\n| --- | --- |\n| Problem | finding a trustworthy tutor is slow |\n| Customer | uni students before exams |\n| Solution | vetted tutors, instant booking |\n| Revenue | 15% take rate per session |\n| Metric | weekly booked sessions |\n\nValidate the *problem* with 10 student interviews before building anything.`,
        now - DAY,
        'gpt-4.1',
      ),
    },
    {
      title: 'SQL Generator',
      model: 'deepseek',
      seeded: true,
      ago: DAY + 3 * HOUR,
      messages: pair(
        'Write a SQL query to find the top 3 students per course.',
        `## Top 3 students per course\n\n\`\`\`sql\nSELECT course, student_name, score\nFROM (\n  SELECT c.name AS course, s.name AS student_name, e.score,\n         RANK() OVER (PARTITION BY c.id ORDER BY e.score DESC) AS rnk\n  FROM enrollments e\n  JOIN students s ON s.id = e.student_id\n  JOIN courses  c ON c.id = e.course_id\n) ranked\nWHERE rnk <= 3;\n\`\`\`\n\nUses a window function to rank within each course, then keeps the top 3.`,
        now - DAY - 3 * HOUR,
        'deepseek',
      ),
    },
    {
      title: 'Landing Page Copy',
      model: 'claude-4-sonnet',
      seeded: true,
      ago: 2 * DAY,
      messages: pair(
        'Write a hero headline for a study planner app.',
        `## Hero options\n\n1. **Study smarter, not harder.** Turn notes into a plan that actually fits your week.\n2. **Your semester, finally under control.** Deadlines, notes, and flashcards in one place.\n3. **Ace it without the all-nighters.** A study system that does the planning for you.\n\nPair any of these with a single CTA: *"Start free — no card needed."*`,
        now - 2 * DAY,
        'claude-4-sonnet',
      ),
    },
    {
      title: 'Research Notes',
      model: 'gemini-2.5-pro',
      seeded: true,
      ago: 3 * DAY,
      messages: pair(
        'Summarize the key idea of spaced repetition for my notes.',
        `## Spaced repetition — the core idea\n\nWe forget on a predictable curve. Reviewing material **just before** you'd forget it flattens that curve, so each review buys longer retention than the last.\n\n**In practice:** review new material after 1 day, then 3, then 7, then 14. Tools (and CampusForge flashcards) schedule this for you automatically.`,
        now - 3 * DAY,
        'gemini-2.5-pro',
      ),
    },
  ];

  return list.map(({ ago, ...rest }) => {
    const at = now - ago;
    return {
      ...rest,
      id: uid('c'),
      createdAt: at,
      updatedAt: at,
    };
  });
}
