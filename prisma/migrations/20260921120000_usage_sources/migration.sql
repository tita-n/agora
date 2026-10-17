-- UsageRecord per-field provenance (null on hand-inserted rows; the UI treats
-- null as "manual entry"). Additive nullable column — safe against any DB
-- state, including one where 20260920120000 was applied mid-test.
ALTER TABLE "UsageRecord" ADD COLUMN "sources" JSONB;
