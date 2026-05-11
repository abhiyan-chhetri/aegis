-- Add notes column to Project (idempotent)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
