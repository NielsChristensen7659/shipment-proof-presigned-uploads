import assert from "node:assert/strict";
import test from "node:test";
import { eventStatus, uploadRequestSchema } from "../src/shipment_assets";

test("a received delivery proof closes the shipment event", () => {
  assert.equal(eventStatus("proof_of_delivery", true), "delivered");
  assert.equal(eventStatus("proof_of_delivery", false), "asset_pending");
  assert.equal(eventStatus("exception_photo", true), "exception_documented");
});

test("an oversized browser upload is rejected at the request boundary", () => {
  const result = uploadRequestSchema.safeParse({
    shipmentId: "SHP-1042",
    eventId: "DELIVERY-7",
    uploadId: "743884f0-8f9d-4f64-942d-8c05f68e9177",
    kind: "proof_of_delivery",
    contentType: "image/jpeg",
    sizeBytes: 10_000_001,
  });
  assert.equal(result.success, false);
});
