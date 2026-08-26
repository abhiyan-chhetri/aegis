-- Burp Bridge v3 — pins can reference checklist items (drag-to-findings).

ALTER TABLE "BurpPin" ADD COLUMN IF NOT EXISTS "checklistItemId" TEXT REFERENCES "BurpChecklistItem"(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "BurpPin_checklistItemId_idx" ON "BurpPin"("checklistItemId");
