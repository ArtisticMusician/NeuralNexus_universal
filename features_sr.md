# Neural Nexus Features

## What Neural Nexus Is
Neural Nexus is a long-term memory plugin for OpenClaw. It helps an AI remember useful information across conversations by storing and retrieving meaning-based memories.

---

## 1) Semantic Memory Storage
Neural Nexus converts text into vectors (numeric representations of meaning) and stores them in Qdrant.

Why this matters:
- It can find related ideas even when wording is different.
- Retrieval is smarter than plain keyword matching.

---

## 2) Automatic Memory Capture
After successful agent interactions, the plugin can automatically decide what to save.

Key points:
- Controlled by `autoCapture` (default: on).
- Runs on `agent_end` events.
- Ignores failed or invalid events.

---

## 3) Built-in Recall Tool (`memory_recall`)
Neural Nexus registers a tool the AI can call to search long-term memory.

Inputs:
- `query` (required)
- `limit` (optional, 1-20, default 5)

Output:
- Matching memories with adjusted scores.

---

## 4) Memory Categories
Each memory is categorized as:
- `preference`
- `fact`
- `entity`
- `decision`
- `other`

Why this matters:
- Different categories are handled differently for decay and reinforcement.

---

## 5) Category-Based Decay
Memories fade at different rates depending on category (`lambda`).

Current behavior:
- `preference`: `lambda = 0` (no decay)
- `fact`: slow decay
- `entity`: medium-slow decay
- `decision`: faster decay
- `other`: fastest decay

---

## 6) Time-Adjusted Memory Ranking
Recall scores are adjusted using:
- similarity score
- last access time
- decay rate (`lambda`)
- memory strength

Result:
- More relevant and recently reinforced memories rank higher.

---

## 7) Preference Overwrite Logic
Preferences are treated as stable memory.

Behavior:
- If a new preference is very similar to an existing one (high threshold around `0.92`), it overwrites the old memory instead of adding a duplicate.
- Stored preferences have `lambda = 0` and do not decay.

---

## 8) Duplicate Prevention for Non-Preferences
For non-preference memories, Neural Nexus avoids storing near-duplicates.

Result:
- Cleaner memory set with less repetition.

---

## 9) Reinforcement on Recall
When a memory is recalled:
- `last_accessed` is updated.
- For reinforce-enabled categories, `strength` increases (`+0.05`).
- If `lambda` exists, it is slightly reduced (`* 0.98`), making future decay slower.

Note:
- Preferences are excluded from reinforcement because they are already non-decaying.

---

## 10) Conversation Consolidation
For longer conversations, the plugin can combine recent user messages into one memory candidate.

Controls:
- `consolidation` (default: on)
- `consolidationThreshold` (default: 4 user messages)

Benefits:
- Captures meaningful context without storing too many small fragments.

---

## 11) Candidate Quality Filtering
Neural Nexus filters memory candidates to reduce noise.

It does things like:
- Focus on user-role messages.
- Ignore very short/low-value content.
- Normalize whitespace.
- Limit candidate length (~1200 chars).

---

## 12) Rule-Based Category Detection
Category detection uses simple language cues.

Examples:
- "prefer/like/dislike" -> `preference`
- "decided/chose/instead of" -> `decision`
- "is a/called" -> `entity`
- Otherwise -> `fact`

---

## 13) Initialization Safety Checks
Before capture/recall, the plugin verifies that:
- Embedding model is initialized.
- Qdrant collection exists and matches vector dimensions.

If setup fails, it logs errors and avoids unsafe operations.

---

## 14) Config Normalization + Defaults
If config values are missing, Neural Nexus applies defaults.

Important defaults:
- Model: `Xenova/bge-small-en-v1.5`
- Device: `cuda` (or `cpu` if configured)
- Qdrant URL: `http://localhost:6333`
- Collection: `openclaw_memories`
- Auto-capture/recall/consolidation: enabled
- Consolidation threshold: `4`

Also supports `${ENV_VAR}` substitution in config strings.

---

## 15) E5 Model Compatibility
If the embedding model name includes `e5`, text is prefixed with `query: ` to match E5 retrieval conventions.

Why this matters:
- Better search quality for E5-style models.

---

## 16) Service Registration
The plugin registers itself as memory service ID `neural_nexus` and logs when active.

---

## 17) Automatic Qdrant Collection Setup
At startup, it checks whether the target collection exists.
If not, it creates one with cosine distance and the correct vector size.

---

## Bottom Line
Neural Nexus gives an AI practical long-term memory:
- smart semantic search
- automatic capture and recall
- category-aware forgetting
- stable preference tracking
- duplicate control
- reinforcement for frequently used memories
