# Phase 2 — Config Listener Elapsed-Time Issue

## Problem

When the user changes `checkInterval` mid-session (e.g., from 30 to 25 days), the config listener calls `scheduleNextCheck()` with the new full interval from **now**, ignoring the time already elapsed since the last check.

**Example:** Last check was 5 days ago. User changes 30 → 25. The next check is scheduled 25 days from the change, not 20 days from the change.

## Required Fix

1. Read `lastCheckTimestamp` from `globalState`
2. Compute `elapsed = Date.now() - lastCheckTimestamp`
3. Compute `remaining = newIntervalMs - elapsed`
4. If `remaining <= 0`: do immediate check, then schedule full new interval
5. If `remaining > 0`: schedule after `remaining`

## Status

NOT IMPLEMENTED
