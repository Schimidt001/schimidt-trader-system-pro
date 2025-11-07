-- Migration: Add M60 (1 hour) timeframe support
-- This migration doesn't require schema changes as the timeframe column already accepts any integer
-- This file serves as documentation that M60 (3600 seconds) is now a valid timeframe option

-- Valid timeframe values:
-- 900 = M15 (15 minutes)
-- 1800 = M30 (30 minutes)
-- 3600 = M60 (1 hour)

-- No SQL changes needed, validation is handled in application layer
