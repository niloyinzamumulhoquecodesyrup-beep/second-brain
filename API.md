# Mobile API reference

Endpoints the Android app calls directly (as opposed to the web app's cookie-session
pages). All of these live under `pages/api/` and are plain Next.js API routes.

## Auth

`POST /api/auth/mobile` — `{ email, password }` → `{ email, token }`. `token` is a JWT
(14-day expiry, see `lib/auth.js`). Send it on every subsequent request as:

```
Authorization: Bearer <token>
```

(The web app uses an `sb_session` cookie instead; `getSessionFromReq` in `lib/auth.js`
accepts either, cookie takes precedence when both are present.)

Single-account app — there's no signup endpoint, the one account is created via
`npm run seed:user`.

---

## `POST /api/voice/classify`

Turns a voice-capture transcript into a task or a PARA capture and saves it in one call.

**Where the transcript comes from:** the app runs speech-to-text on-device (Android's
`SpeechRecognizer`) and sends only the resulting text here — no audio ever reaches this
backend. Classification is done server-side by Groq (`llama-3.1-8b-instant`); see
`lib/groq.js`.

### Auth

Required. `Authorization: Bearer <token>` from `/api/auth/mobile`.

### Request

```json
{ "transcript": "Add a task to call the plumber tomorrow at 6pm" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `transcript` | string | yes | Trimmed server-side. Max 500 characters — longer requests are rejected with 400. |

### Response — `201 Created`

```json
{
  "transcript": "Add a task to call the plumber tomorrow at 6pm",
  "classification": {
    "type": "task",
    "title": "Call the plumber",
    "description": null,
    "due_date": "2026-08-09",
    "start_min": 1080,
    "duration_min": 15,
    "para": "inbox",
    "para_confidence": "estimated",
    "project_hint": null
  },
  "record": { "...": "the created row from the tasks or notes table" }
}
```

`classification` is Groq's structured read of the transcript, before any server-side
adjustment. `record` is what actually got saved — the two can differ (see `start_min`
below).

#### `classification` fields

| Field | Type | Meaning |
|---|---|---|
| `type` | `"task"` \| `"capture"` | `task` for an action/reminder/to-do. `capture` for information, an idea, or an explicit "create a project/area/resource/note" request. |
| `title` | string | Short label, ≤12 words. |
| `description` | string \| `null` | **Always set when `type` is `capture`** (every PARA item needs one) — always `null` for tasks. If the transcript already contains real descriptive detail, Groq rewrites it into clean, grammatically-correct, passive-voice prose rather than saving the raw rambling transcript. If the transcript is just a bare label, Groq writes a short description itself from context. |
| `due_date` | `"YYYY-MM-DD"` \| `null` | Only set if the user named or implied a specific day; resolved against the server's current date. |
| `start_min` | integer 0–1439 \| `null` | Minutes since midnight. Set from an explicit clock time or a vague time-of-day word (morning=540, afternoon=840, evening=1080, night=1260). `null` if no time was implied at all. |
| `duration_min` | integer 5–480 \| `null` | **Always set when `type` is `task`** — always `null` for captures. Taken from an explicit duration in the transcript ("15 minutes"), or estimated by Groq from what the task involves when the user didn't say. Rounded to the nearest 5 minutes. |
| `para` | `"inbox"` \| `"project"` \| `"area"` \| `"resource"` \| `"archive"` | Which PARA bucket a capture (or a task's linked note) belongs in. |
| `para_confidence` | `"explicit"` \| `"estimated"` | `explicit` when the user named a bucket or a specific project/area/resource by name; `estimated` when Groq inferred it from context. |
| `project_hint` | string \| `null` | The specific project/area/resource name the user mentioned, when `para_confidence` is `explicit`. Informational only — not currently used to link to an existing note. |

#### Server-side adjustments before saving (task path only)

- **Timing conflicts**: if the resolved `due_date` + `start_min` overlaps another of the
  user's undone tasks that day (using each task's `duration_min`, defaulting to 30 min
  if unset), the new task's `start_min` is pushed to right after the conflicting task
  ends. This is why `record.start_min` can differ from `classification.start_min` — see
  `resolveTaskStartConflict` in `lib/reminders.js`.
- **Reminder**: if the saved task has a `due_date`, a row is created in `reminders`
  (`kind: 'task'`, `origin: 'system'`), same as `POST /api/tasks`.

#### What gets saved

- `type: "task"` → inserted into `tasks` (`title`, `due_date`, `start_min` after
  conflict resolution, `duration_min`). `record` is the created task row.
- `type: "capture"` → inserted into `notes` (`title`, `content` = `description`,
  `para`). `record` is the created note row.

### Errors

| Status | Body | Cause |
|---|---|---|
| 400 | `{ "error": "transcript is required" }` | Missing/empty `transcript`. |
| 400 | `{ "error": "transcript must be 500 characters or fewer" }` | Too long. |
| 401 | `{ "error": "Not authenticated" }` | Missing/invalid/expired token. |
| 500 | `{ "error": "Classification failed" }` | Groq request failed, returned malformed JSON, or a DB error. Check server logs for the underlying cause. |

No request-rate limiting on this endpoint currently (only the 500-char size cap above)
— Groq's free tier is generous enough that this hasn't been needed yet, unlike
`/api/tasks/breakdown`'s 5/day quota against Gemini's stricter free tier.

### Setup

Requires `GROQ_API_KEY` in the environment (get one at
https://console.groq.com/keys). See `.env.example`.
