#!/bin/bash
# Log a completed task to the agent's personal calendar

set -e

# Usage: log_task.sh "task description" [agent_name] [start_time_epoch]
TASK_DESC="$1"
AGENT_NAME="${2:-main}"
START_EPOCH="${3:-}"

# Map agent names to calendar names
case "$AGENT_NAME" in
  main|leopoldo|Leopoldo)
    CALENDAR="Leopoldo"
    ;;
  new_siri|NewSiri|newsiri)
    CALENDAR="NewSiri"
    ;;
  linus|Linus)
    CALENDAR="Linus"
    ;;
  *)
    echo "Unknown agent: $AGENT_NAME. Using 'Leopoldo' as default." >&2
    CALENDAR="Leopoldo"
    ;;
esac

# Split description into title (max 6 words) and notes (max 50 words)
WORDS=($TASK_DESC)
TITLE_WORDS=("${WORDS[@]:0:6}")
TITLE="${TITLE_WORDS[*]}"

# Rest goes to notes (max 50 words total)
NOTES_WORDS=("${WORDS[@]:0:50}")
NOTES="${NOTES_WORDS[*]}"

# Calculate timestamps
# End time = now
END_EPOCH=$(date +%s)

# Start time = provided or default to 5 min ago
if [ -z "$START_EPOCH" ]; then
  START_EPOCH=$((END_EPOCH - 300))  # 5 min ago
fi

# Enforce minimum 5 minute duration
DURATION=$((END_EPOCH - START_EPOCH))
if [ "$DURATION" -lt 300 ]; then
  START_EPOCH=$((END_EPOCH - 300))
  DURATION=300
fi

# Convert to date format for AppleScript
START_DATE=$(date -r "$START_EPOCH" "+%m/%d/%Y %I:%M:%S %p")
END_DATE=$(date -r "$END_EPOCH" "+%m/%d/%Y %I:%M:%S %p")

# Escape quotes for AppleScript
TITLE_ESC="${TITLE//\"/\\\"}"
NOTES_ESC="${NOTES//\"/\\\"}"

# Add event using AppleScript
osascript <<EOF
tell application "Calendar"
    tell calendar "$CALENDAR"
        set newEvent to make new event with properties {summary:"$TITLE_ESC", start date:date "$START_DATE", end date:date "$END_DATE", description:"$NOTES_ESC"}
    end tell
end tell
EOF

DURATION_MIN=$((DURATION / 60))
echo "✓ Logged to $CALENDAR calendar: $TITLE ($DURATION_MIN min)"
