-- Add assetOwners column to Project (idempotent)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "assetOwners" TEXT NOT NULL DEFAULT '[]';
