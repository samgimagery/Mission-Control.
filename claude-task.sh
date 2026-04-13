#!/bin/bash
# Claude Code CLI wrapper — runs a task and updates Mission Control on completion
#
# Usage: ./claude-task.sh <job_id> "<task_prompt>"
# Example: ./claude-task.sh job_1712937600000_1234 "Build the Logs panel"

set -e

JOB_ID="$1"
TASK="$2"
MC_URL="http://127.0.0.1:8787"

if [ -z "$JOB_ID" ] || [ -z "$TASK" ]; then
  echo "Usage: $0 <job_id> \"<task_prompt>\""
  exit 1
fi

echo "[claude-task] Starting Claude for job $JOB_ID"
echo "[claude-task] Task: $TASK"

# Mark job as working
curl -s -X POST "${MC_URL}/api/mission-control-jobs/${JOB_ID}/transition" \
  -H 'Content-Type: application/json' \
  -d '{"phase": "working"}' > /dev/null 2>&1 || true

# Update Alfred status
curl -s -X POST "${MC_URL}/api/alfred-status" \
  -H 'Content-Type: application/json' \
  -d "{\"status\": \"working\", \"task\": \"Claude working on ${JOB_ID}\"}" > /dev/null 2>&1 || true

# Run Claude Code CLI
export ANTHROPIC_API_KEY=ollama
export ANTHROPIC_BASE_URL=http://localhost:11434
EXIT_CODE=0
claude --model glm-5.1:cloud --print --permission-mode bypassPermissions -p "$TASK" || EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "[claude-task] Claude completed successfully for job $JOB_ID"
  # Transition job to QC (waiting for review)
  curl -s -X POST "${MC_URL}/api/mission-control-jobs/${JOB_ID}/transition" \
    -H 'Content-Type: application/json' \
    -d '{"phase": "qc"}' > /dev/null 2>&1 || true
  # Mark all subtasks as done
  curl -s -X PATCH "${MC_URL}/api/mission-control-jobs/${JOB_ID}" \
    -H 'Content-Type: application/json' \
    -d '{"subtasks": [{"status": "done", "completedBy": "Claude"}]}' > /dev/null 2>&1 || true
else
  echo "[claude-task] Claude exited with code $EXIT_CODE for job $JOB_ID"
fi

# Log completion message to MC Comms
MSG="Claude finished job ${JOB_ID} (exit ${EXIT_CODE}). Ready for review."
curl -s -X POST "${MC_URL}/api/mission-control-message" \
  -H 'Content-Type: application/json' \
  -d "{\"from\": \"Claude\", \"to\": \"Alfred\", \"message\": \"${MSG}\", \"timestamp\": $(date +%s000)}" > /dev/null 2>&1 || true

# Update Alfred status back to available
curl -s -X POST "${MC_URL}/api/alfred-status" \
  -H 'Content-Type: application/json' \
  -d '{"status": "available", "task": ""}' > /dev/null 2>&1 || true

echo "[claude-task] Done. Exit code: $EXIT_CODE"
exit $EXIT_CODE