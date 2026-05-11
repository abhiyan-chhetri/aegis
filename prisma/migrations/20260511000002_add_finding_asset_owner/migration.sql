-- Add assetOwner column to Finding (idempotent)
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "assetOwner" TEXT NOT NULL DEFAULT '';
