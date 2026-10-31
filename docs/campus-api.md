# Parking occupancy: map integration and future API

## Current application behavior

The `/explore` map and signed-in `/dashboard` start at Pasadena City College and automatically display parking in the initial area. The compact **Parking nearby** sidebar replaces the earlier hero and PCC summary card; revealing nearby lots does not require selecting the college first. Initial locations include seven tracked lots and nearby OpenStreetMap parking seed records.

Colored occupancy markers replace the existing Student/Staff parking icons at the seven tracked features, modeling a school sharing an occupancy feed. Selecting a lot marker opens its levels in the left panel. Each level row places the level number on the left and parked-car count on the right. Selecting a level reveals its individual spaces. Colored badges have a 20-pixel upward display offset, reduced to 12 pixels in the compact overview, so they sit more centrally within the map's lot shapes. The offset does not change the stored lot coordinates or counts.

Other parking locations use black markers with a white **P** and show unknown availability. They have no simulated or real occupancy connection, so a black marker is distinct from a tracked lot whose observations have become stale.

Panning or zooming changes the area ready to be searched, while the current location results remain until **Refresh this area** is pressed. Refresh loads parking for the visible map area and updates the sidebar. Selecting a destination from search moves the map and automatically loads that area. The area-discovery implementation lives in `src/services/mapParking.ts`; its location queries are independent of the tracked occupancy polling described below.

The inventory uses these OpenStreetMap names and parking-feature positions:

| Lot | Stable ID |
| --- | --- |
| Student Parking Lot No. 3 | `pcc-student-3` |
| Student Parking Lot No. 5 | `pcc-student-5` |
| Staff Parking Lot No. 4 | `pcc-staff-4` |
| Staff Parking Lot No. 1 | `pcc-staff-1` |
| Staff Parking Lot No. 7 | `pcc-staff-7` |
| Student Parking Lot No. 10 | `pcc-student-10` |
| Student Parking Lot No. 11 | `pcc-student-11` |

Each lot has three illustrative levels with 24 spaces per level: 72 per lot and 504 total. These levels and capacities are simulated, not the real lots' floor plans. Lot and floor colors share this scale:

| Occupied proportion | Color | Interpretation |
| --- | --- | --- |
| Below 50% | Green | More capacity available |
| 50% to below 75% | Yellow | Filling up |
| 75% to below 95% | Orange | Limited capacity |
| 95% to 100% | Red | Almost full; **Full** only at exactly 100% |
| No current observation | Neutral/unknown | Availability cannot be established |
| No occupancy connection | Black with white **P** | Parking location only; availability is unknown |

Counts and text accompany color. Do not round a non-full percentage up to 100% or label a lot Full while any space is free or unknown.

The provider is asynchronous but runs in the browser. The UI polls it every five seconds and shows simulated arrivals and departures. After 15 seconds without a current snapshot, spaces become **Unknown** rather than continuing to advertise old availability. Unknown spaces never count as free. A fresh snapshot restores known simulated occupancy. A lot or level with any unknown spaces has an unknown occupancy band. The provider pauses successful refreshes while the browser reports offline and resumes when it reports online.

This is not a live campus API or a shared parking database. Lot names and marker positions follow OpenStreetMap parking features; floor layouts, capacities, occupancy, and space types are invented. PCC's actual street address provides geographic context only; see [the college's directions page](https://pasadena.edu/about/directions.php). Parkly has no claimed PCC affiliation or data-sharing agreement. No camera or AI model is used. Different tabs do not share a server-side occupancy state. The current browser snapshot uses `source: "demonstration"` and numeric epoch-millisecond timestamps; its simulated response latency is 200 milliseconds.

The separate campus page has been removed. `/campus` redirects to `/explore`. The latter does not require a Parkly account, but the hosted Sites preview remains owner-private through its independent access gate.

## Proposed snapshot contract

The following abbreviated JSON illustrates a future backend endpoint, for example `GET /api/parking/occupancy`. **This endpoint is not implemented or deployed.** A real adapter would return all configured lots, levels, and spaces; the shortened example is not a full inventory.

```json
{
  "source": "campus-api",
  "receivedAt": "2026-10-30T18:00:00.000Z",
  "lots": [
    {
      "id": "pcc-student-3",
      "name": "Student Parking Lot No. 3",
      "levels": [
        {
          "id": "pcc-student-3-level-1",
          "number": 1,
          "spots": [
            {
              "id": "pcc-student-3-level-1-space-01",
              "number": 1,
              "kind": "standard",
              "status": "free",
              "updatedAt": "2026-10-30T17:59:59.000Z"
            },
            {
              "id": "pcc-student-3-level-1-space-02",
              "number": 2,
              "kind": "accessible",
              "status": "occupied",
              "updatedAt": "2026-10-30T17:59:58.000Z"
            }
          ]
        }
      ]
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `source` | Use `campus-api` only for a real authorized adapter. Simulated observations must keep a distinct simulation source. |
| `receivedAt` | UTC ISO 8601 timestamp when the backend received and validated the upstream snapshot. |
| `lots[].id` | Stable lot identifier matching the configured inventory. |
| `lots[].name` | Display name; identity does not depend on this text. |
| `levels[].id` | Stable floor identifier, unique within the inventory. |
| `levels[].number` | Display level number, separate from its stable identifier. |
| `spots[].id` | Stable space identifier, unique across the inventory. |
| `spots[].number` | Human-readable space number within its floor. |
| `spots[].kind` | `standard`, `accessible`, or `ev`; availability does not establish parking eligibility. |
| `spots[].status` | `free`, `occupied`, or `unknown`. |
| `spots[].updatedAt` | UTC ISO 8601 time of the latest observation, even when the observed state has not changed. |

Lot coordinates and floor inventories should come from approved configuration or validated metadata. The API should not need personal or vehicle-identifying information. Counts are derived from validated spaces: capacity is inventory length, parked is the number occupied, free is the number free, and unknown is counted separately. Derive lot totals by summing levels. Never infer free capacity by subtracting parked from total when unknown spaces exist. An incomplete inventory or unknown observations must not produce a reassuring green availability state.

The adapter should parse timestamps with `Date.parse`, reject invalid or unreasonable future values, and convert them to epoch milliseconds before passing them into numeric freshness calculations. If a provider separates observation time from last-change time, freshness must use observation time.

## Future backend responsibilities

1. **Read an authorized feed.** Keep provider credentials on the server, outside `VITE_*` variables and browser bundles. Poll the provider, or receive authenticated callbacks with signature verification and replay protection where supported.
2. **Validate the inventory and schema.** Reject duplicate or unknown identifiers, unsupported status values, invalid timestamps, and inconsistent level membership. Normalize third-party fields into one internal representation.
3. **Preserve observation ordering.** Ignore observations older than the state already stored. Prefer source sequence numbers when available. Serving a cached response must preserve its original receipt and observation timestamps rather than marking it newly observed.
4. **Make gaps explicit.** Return a complete snapshot; missing or unobservable spaces become Unknown. If the provider emits deltas, merge them into the backend's inventory before publishing a full snapshot. A missing floor cannot be treated as empty.
5. **Publish read-only occupancy.** The browser receives only the required lot, floor, space, occupancy, and freshness fields. Camera frames, faces, license plates, driver identities, and private provider credentials are outside this contract. Visitors cannot write real occupancy.
6. **Use one color policy.** Compute lot and floor bands from the same validated data and thresholds. Represent stale or incomplete observations explicitly. Red may indicate almost full; the Full label requires every configured space to be currently known and occupied.

The five-second polling interval and 15-second stale threshold are illustrative settings. For a real integration, agree on observation frequency and acceptable age with the provider. Track both backend receipt age and individual observation age: a responsive endpoint can still be returning old sensor data.

## Shared delivery options

A future service would publish one validated state to all visitors. Browsers could poll the backend endpoint, or the backend could write normalized observations to Supabase and distribute changes with Realtime. Realtime transports observations; it does not detect vehicles or make stale observations fresh.

If Supabase is used, create occupancy tables with public read access limited to the intended fields, and restrict writes to the trusted ingestion service. Load a full snapshot on connection and reconnect, apply only newer updates, and retain the stale-data fallback if a subscription stops. This shared ingestion, storage, and subscription infrastructure is not part of the current browser simulation.

## Walkthrough and verification

1. Open `/explore` and confirm parking appears immediately in the initial area. The sidebar starts with **Parking nearby**, without the earlier hero or PCC summary card. Identify the simulated-source label on tracked lots and black markers for other lots with unknown availability.
2. Pan and zoom, and confirm moving the map does not automatically replace the queried area. Press **Refresh this area** and verify the sidebar and location markers update for the visible area. Select a search destination and confirm its area loads automatically.
3. Select each colored lot marker. Compare its parked and available totals with its three level rows.
4. Select a level and inspect its 24 spaces. Verify its parked count, free count, and color agree with the space states.
5. Observe updates across polling cycles. Confirm the map marker and open panel describe the same snapshot independently of area refreshes.
6. Check the color thresholds at 50%, 75%, and 95%, and the Full label at 100%. Check that unknown capacity is never presented as free.
7. Exercise provider error/staleness behavior with tests or controlled failure injection. After 15 seconds without observations, the UI must show Unknown; fresh data must restore the state.
8. Test mobile sizing, keyboard interaction, and direct `/campus` navigation redirecting to `/explore`.

Before a real pilot, test delayed and out-of-order observations, missing spaces or floors, duplicate events, expired credentials, upstream outages, and reconnects. Compare the provider's observations with an agreed ground truth before presenting the feed as live parking availability.

### Access and parking fees

Lot cards and details share `ParkingTerms`. The seven connected demo lots show Staff only or Students only. Student lots No.3 and No.5 show Student parking permit required; their detail panels link to PCC's LancerPoint portal, where students sign in and choose Buy Parking Permit. Their hourly price is null because a permit has no quoted hourly rate. The other demo lots show an illustrative tariff: Free for 90 min · then $2/hour, with an hourly price of 2 so the introductory free period is not treated as unlimited free parking. Demo access & pricing remains visible; the per-lot assignments are illustrative, not verified PCC policies. Purchase links appear in details only to avoid nesting links inside list-card buttons. Unconnected OSM listings show recognized access tags and explicit fee=yes/no information; missing rates or access remain Unknown.

The map cannot zoom out beyond its initial overview for the current screen size. Parking-marker selection updates the details without scrolling the mobile page or automatically panning the map.
