-- Clinic custom body-chart anatomy overlays (SVG)
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "bodyChartConfig" JSONB;
