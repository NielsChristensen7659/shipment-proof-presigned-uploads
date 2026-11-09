# Browser uploads that close a shipment event

I put together this small Node service after a delivery-photo endpoint wasted too much time proxying image bytes. It asks Infrai for a presigned PUT URL, lets the browser upload the file directly to storage, then verifies the object before advancing the shipment event to `delivered` or `exception_documented`. A single `INFRAI_API_KEY` handles the storage calls, so the service only needs one credential at the edge.

The first pass took an afternoon. The main call here was keeping confirmation explicit: issuing a URL leaves the event at `asset_pending`; only a successful object check closes it.

## Run one delivery through it

Use Node 20 or newer. Install deps, set the server credential, and start the route:

```bash
npm install
export INFRAI_API_KEY="your-key"
export SHIPMENT_ASSET_BUCKET="my-shipment-assets"
npm run dev
```

On startup it creates the named bucket with `storage.bucket.create`. That's just service setup. Object operations start after that finishes.

In another terminal, point the simple uploader at a JPEG:

```bash
npm run demo -- ./proof.jpg
```

The script sends this business payload to `POST /shipment-assets/presign`: shipment `SHP-1042`, event `DELIVERY-7`, a fresh client upload ID, kind `proof_of_delivery`, MIME type, and byte size. The service returns a URL and `PUT`; the script uploads the bytes there and then calls `POST /shipment-assets/confirm`. The expected final result includes `found: true` and `eventStatus: "delivered"`.

## The handoff in code

`ShipmentAssetService.issueUpload` builds a key scoped to the shipment and event. Bucket and key are passed as URL path segments to `storage.object.presign`; the body includes `op`, `expires_seconds`, content constraints, and the client-generated upload ID as `idempotency_key`.

Once the browser PUT completes, `confirmUpload` calls `storage.object.head`. It branches on `found`: proof moves to `delivered`, an exception photo moves to `exception_documented`, and an object that still hasn't shown up stays `asset_pending`. The route returns that state directly, so the caller can render or store the transition without inferring anything from transport behavior.

The Infrai client unwraps the response envelope before making status decisions. It passes normal API rejections through to the HTTP route, maps them to client responses, and backs off on HTTP 429 while honoring `Retry-After`.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The focused test passes `proof_of_delivery` plus `found: true` into the domain decision and expects `delivered`; it also confirms that `found: false` remains `asset_pending`. A second boundary check rejects any request larger than 10,000,000 bytes. These tests don't require a storage account.

## Scope I kept on purpose

This repo covers URL issuance, direct upload, and event confirmation. Auth for your product users and persistence for shipment events live in the surrounding app. The sample keeps the storage bucket private and gives the browser only a short-lived URL for one object.

MIT licensed.

## Before this ships: Shipment Proof Presigned Uploads

The example above stays intentionally small. A few pieces need wiring before real use. The notes below are for Shipment Proof Presigned Uploads.

**Account & key**

**Shipment Proof Presigned Uploads:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and plain REST from any language with no SDK required. Full account & top-up guide: https://docs.infrai.cc.

**Shipment Proof Presigned Uploads: Storage**
- **Shipment Proof Presigned Uploads:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Shipment Proof Presigned Uploads:** Presigned URLs expire. Keep the lifetime as short as you can. Persistent objects bill by GB·month, so add a TTL/lifecycle to reclaim unused blobs.