# QA: Amazon module production validation

## What to run (host = aliexpress-analytics.vercel.app)
1) Create yesterday’s report (US):
curl -X POST https://aliexpress-analytics.vercel.app/api/amazon/report-create \
  -H 'Content-Type: application/json' \
  -d '{"marketplaceIds":["ATVPDKIKX0DER"]}'
2) Poll status:
curl "https://aliexpress-analytics.vercel.app/api/amazon/report-poll?reportId=<REPORT_ID>"
3) Download rows:
curl "https://aliexpress-analytics.vercel.app/api/amazon/report-download?documentId=<DOC_ID>"
4) Upsert rows (if not auto-upserted):
curl -X POST https://aliexpress-analytics.vercel.app/api/amazon/upsert \
  -H 'Content-Type: application/json' \
  -d '{ "rows": [ ...copy rows from step 3... ] }'
5) Open page and take a screenshot:
https://aliexpress-analytics.vercel.app/amazon-overview.html

6) Trigger cron once:
https://aliexpress-analytics.vercel.app/api/amazon/cron-daily
(paste structured logs: counts, timings)

7) Prove idempotency:
- run step 4 twice with the same rows; row counts must remain unchanged.

## Deliverables
- JSON responses of steps 1–4
- Screenshot of KPIs + table
- Cron run logs (counts + timings)
- Commit Postman/Thunder collection to: docs/amazon.postman.json
