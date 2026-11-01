# OpenAI Agent Cloud Harness & Dashboard

A scalable Next.js & TypeScript UI wrapper around OpenAI's Agents and Assistants API with cloud-managed thread isolation and automated scheduled reporting.

## 🚀 Architecture & Features

### 1. 3-Panel Agent Operations Interface
- **Left Panel (AI Marketing Team / Threads):**
  - Manages active agent threads (`Ad Manager`, `Ad Creator`, `Ad Strategist`, etc.).
  - Each thread binds to a dedicated, isolated OpenAI Cloud Thread (`thread_...`).
  - Supports spinning up new specialized agent threads dynamically on demand.
  - Displays business profile & Meta ad account connection status.

- **Center Panel (Interactive Agent Workspace):**
  - Live chat and execution interface bound to the active OpenAI thread.
  - Rich interactive card rendering:
    - Search mode switcher (Specific vs. Phrase search).
    - Query tag chips.
    - Competition Snapshot 3-column table (Angles, Formats, Market gaps to own).
    - Audiences to test.
    - Quick action bar: "Open brief" and "Send to Ad Creator" (thread-to-thread handoff).
  - Quick-prompt suggestion chips.
  - Attachment support for uploading datasets or media to the sandbox.

- **Right Panel (Daily Reports & Research Briefs):**
  - Displays daily reports generated on timers, grouped by `THIS WEEK` and `LAST WEEK`.
  - Date badges (e.g. `Tue 20`, `Mon 19`), `NEW` tags, and executive summaries.
  - Clickable reports to inspect full sandbox intelligence outputs.
  - "Briefs & research" tab to view saved strategy documents and competitor intel.
  - Manual "Run Now" button to simulate or trigger immediate scheduled execution.

### 2. Autonomous Daily Job / Timer Scheduling
- Users can prompt the AI in natural language, for example:
  > *"Setup a daily job of fetching reports every 9 am"*
- The system automatically detects the schedule intent, updates the thread's configuration, and binds a recurring daily trigger.
- The schedule runs in an isolated cloud container sandbox, generating fresh intelligence and logging it directly to the Daily Reports column.

### 3. OpenAI Cloud Harness & Sandboxing
- **Separate Sandbox per Thread:** Every thread is bound to an OpenAI cloud thread. When tools like Code Interpreter or FFmpeg run, OpenAI provisions an isolated container sandbox.
- **Graceful Live/Mock Engine:** Works out-of-the-box immediately with high-fidelity mock data when testing locally, and switches seamlessly to live OpenAI Assistants and Runs when `OPENAI_API_KEY` is provided in `.env.local`.

---

## 🛠️ Quick Start

```bash
# 1. Navigate to the project
cd /Users/hruthikm/programming/openai-harness

# 2. (Optional) Configure OpenAI API key
cp .env.example .env.local
# Edit .env.local and set your OPENAI_API_KEY

# 3. Start development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to open the dashboard.
