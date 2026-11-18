# ScholarSetu

ScholarSetu is an Indian scholarship discovery guide. This repository keeps the supplied single-page website as the frontend and adds a lightweight Node.js HTTP API.

## What's included

- `public/index.html` — the supplied ScholarSetu frontend, preserved as provided.
- `server.js` — Node.js backend and static website server (no third-party runtime packages).
- `data/scholarships.json` — 6 scholarship records extracted from the supplied website.
- `data/portals.json` — 36 State/UT portal records extracted from the supplied website.
- `GET /api/health` — health check.
- `GET /api/scholarships` — list schemes; optional `category` and `level` filters.
- `GET /api/portals?q=Punjab` — search State/UT portals.
- `POST /api/feedback` — save feedback as JSON on the server's persistent disk.
- `GET /api/admin/feedback` — protected feedback listing; requires `Authorization: Bearer <ADMIN_TOKEN>`.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000. Check http://localhost:3000/api/health.

## Test the API

```bash
curl http://localhost:3000/api/scholarships
curl "http://localhost:3000/api/portals?q=Punjab"
curl -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"type":"suggestion","message":"Please add more state scholarships."}'
```

## Deploy on Render

1. Push this repository to GitHub.
2. In Render, choose **New + → Blueprint** and select this repository.
3. Render reads `render.yaml`; review the service and create it.
4. Wait for deployment, then open `/api/health` on the deployed domain.
5. Keep the generated `ADMIN_TOKEN` secret. Do not publish it in frontend code or commit `.env`.

The configured persistent disk is important because feedback is written to `data/feedback.json`. Hosting plans and persistent-disk availability/pricing can change; check the current Render dashboard before deploying.

## Important scope and data notes

- The supplied frontend currently performs its eligibility matching in the browser. This backend exposes the same source scholarship and portal records through API endpoints, but the existing frontend has **not yet been modified to call these APIs**.
- The current dataset contains 6 central-scheme entries and 36 State/UT portal links, matching the supplied HTML. It is not a complete catalogue of every scholarship in India.
- Scholarship details are informational and should be checked against the official scheme guidelines and portal before applying. The app does not submit applications or verify documents.
- Feedback is stored on the server. Do not collect or submit Aadhaar numbers, bank details, passwords, OTPs, or other sensitive personal information through feedback.
- This first backend version does not include student accounts, login, document uploads, or a student-profile database.

## API examples

### `GET /api/scholarships?category=sc&level=ug`
Returns a JSON object containing matching scheme records.

### `GET /api/portals?q=Punjab`
Returns State/UT portal records whose state or portal name matches the search.

### `POST /api/feedback`
Body: `{ "type": "suggestion", "message": "Your feedback here" }`

### `GET /api/admin/feedback`
Requires `Authorization: Bearer <ADMIN_TOKEN>`. Set `ADMIN_TOKEN` in the hosting environment before using this endpoint.
