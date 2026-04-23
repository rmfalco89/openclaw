---
name: task-logger
description: Automatically log completed tasks to the agent's personal macOS Calendar with start/end times. Use when an agent completes a significant task, answers a complex question, fixes an issue, or delivers output. Each agent writes to their own calendar (Leopoldo, NewSiri, Linus) - no cross-pollination.
---

# Task Logger

Automatically log completed tasks to your personal calendar with actual start/end times.

## Usage

After completing a task, run the log script:

```bash
scripts/log_task.sh "Task description" [agent_name] [start_time_epoch]
```

**Parameters:**

- `task description` (required): Brief summary of the completed task
- `agent_name` (optional): Agent identifier (defaults to "main")
- `start_time_epoch` (optional): Unix epoch timestamp when task started (defaults to 5 min before now)

**Agent-to-Calendar Mapping:**

- `main`, `leopoldo`, `Leopoldo` → **Leopoldo** calendar
- `new_siri`, `NewSiri`, `newsiri` → **NewSiri** calendar
- `linus`, `Linus` → **Linus** calendar
- Unknown agents default to **Leopoldo**

## Getting Start Time

The agent should capture the message timestamp when receiving a task request. In most contexts, you can get the current epoch time with:

```bash
TASK_START=$(date +%s)
# ... work on task ...
scripts/log_task.sh "Task completed" "main" "$TASK_START"
```

For message-triggered tasks, the message timestamp should be used as the start time.

## Title and Notes Handling

The script automatically splits your description:

- **Title**: First 6 words become the event title
- **Notes**: Full description (max 50 words) stored in event notes

Example: Input "Created new task-logger skill for automatic calendar tracking of completed tasks"

- Title: "Created new task-logger skill for automatic"
- Notes: "Created new task-logger skill for automatic calendar tracking of completed tasks"

## Duration Tracking

- **Start time** = provided epoch timestamp (when task began)
- **End time** = current time (when script runs / task completes)
- **Minimum duration** = 5 minutes (enforced even if actual duration was shorter)

## When to Log

Log tasks that are:

- Significant work (research, coding, analysis)
- Complex questions answered
- Issues fixed or problems solved
- Files created, edited, or organized
- System changes or configurations

**Do NOT log:**

- Simple acknowledgments
- Status checks
- Trivial operations
- HEARTBEAT_OK responses

## Examples

```bash
# Using current time as start (will default to 5 min ago)
scripts/log_task.sh "Fixed SSH configuration"

# With specific agent
scripts/log_task.sh "Researched API documentation" "linus"

# With actual start time (task took 15 minutes)
START_TIME=$(date -d "15 minutes ago" +%s)
scripts/log_task.sh "Debugged memory leak in Python service" "linus" "$START_TIME"

# Track from message receipt
TASK_START=$(date +%s)
# ... do work ...
scripts/log_task.sh "Analyzed log files and identified issue" "main" "$TASK_START"
```

## Technical Details

- Events created via AppleScript (macOS Calendar automation)
- Start time from provided epoch timestamp, end time = now
- Duration auto-calculated, minimum 5 minutes enforced
- Title limited to 6 words, full description (50 words max) in notes
- Calendar names are case-sensitive
- Works on macOS only

## Path Resolution

When calling from SKILL.md context, use relative paths:

```bash
./scripts/log_task.sh "description" "agent" "$START_TIME"
```

From workspace or other locations, use absolute paths:

```bash
/Users/rmarino/projects/openclaw/skills/task-logger/scripts/log_task.sh "description" "agent" "$START_TIME"
```
