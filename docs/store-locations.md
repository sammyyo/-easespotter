# Store locations and nearby discovery

Implemented locally on 2026-10-19. No production data was changed or deployment performed.

## Website setup

Open **Store Profile → Store location in the app**:

1. Enter the complete customer-facing street address.
2. Enter latitude and longitude, or select **Use current location** while physically at the store.
3. Enable **Show this location in the app**.
4. Save the store profile.

This public address is separate from the business contact address in Vendor Settings. Addresses are not automatically geocoded. Both valid coordinates and an address are required before publication. Zero coordinates are valid; missing coordinates are not converted to zero.

Locations use the existing Neon `store_profiles.integration_settings.publicLocation` JSON field. No database schema migration or Firebase rules deployment is required. Unpublishing retains the vendor's saved fields but removes the location from public location APIs. Legacy stores need to configure and publish a location before appearing in distance searches.

The existing authenticated profile endpoint saves this setting for the session's vendor ID. Public output contains only store identity, logo, address, coordinates and distance; it does not expose integration settings or private vendor contact details.

## Public API

- `GET /api/stores/:storeId/addresses`: existing route, now returns published coordinates and customer-facing address. The ID is the **vendor ID**, not the store-profile row ID. Slug lookup is retained.
- `GET /api/stores/nearby?latitude=52.52&longitude=13.405&radiusKm=50&limit=10`: searches active stores, filters published locations by straight-line distance and sorts nearest first.

Both return `{success: true, data: [...]}`. Each location includes `storeId`, `vendorId`, `storeName`, `label`, `address`, `formattedAddress`, `latitude`, `longitude` and `logoUrl`. Nearby results additionally include `distanceMeters`; the response includes `radiusKm`.

Latitude must be -90 to 90; longitude -180 to 180. Radius defaults to 50 km, with a range of 0.1–500 km. Limit defaults to 10, with a range of 1–50. Invalid or repeated parameters return 400. Backend failure returns 503 rather than an empty result. Responses use `Cache-Control: no-store`.

Nearby lookup uses the position for the request and does not save it to the database. Standard hosting access-log policies still apply. Distance is currently calculated on the server after loading active store profiles; a spatial index can be added if the directory grows large.

## App behavior

- Discover requests the ten nearest published stores within 50 km in one request. It no longer depends on the first 80 Firestore store documents.
- Results display distance and address. Opening a store uses its stable vendor ID.
- Store profiles display the address and **Get directions**, which opens an external maps page. Nearby distance is straight-line distance, not travel distance.
- The visited-store map uses the same published address API, resolving at most five stores concurrently.
- Permission errors have retry/settings actions. GPS and network lookups have 15-second limits.
- API futures are retained in widget state, avoiding repeated requests during rebuilds.
- Existing Android and iOS location permissions are used; no background location collection was added.

The default API host remains `https://easespotter-production.up.railway.app`. Override it for another deployment with `--dart-define=STORE_API_BASE_URL=https://your-api-host`.

## Validation and rollout

- 8 website tests cover publication privacy, coordinate validation, distance, candidates beyond the former first-80 limit, query constraints, errors, and saving a location with a blank optional contact email.
- 15 Flutter tests pass: 6 location tests and 9 existing collaboration/profile regressions.
- Android debug, unsigned iOS release, and website production builds pass. Isolated TypeScript checks for new location modules pass.
- Full website TypeScript checking has 294 errors. An isolated committed-baseline comparison found the same 294 diagnostics by file and error code. Some printed type-property ordering differs; no new diagnostic categories were introduced.
- Flutter analysis reports no errors in the changed app files; existing lints remain.

Deploy the website to the Railway service used by the app before distributing the updated app. Configure and publish a real store location, then test Discover and directions on physical Android and iOS devices. Verify that unpublishing removes it from fresh API requests and app reloads. Already-rendered public locations remain visible until the view reloads.

No production location, Neon migration, Firebase deployment or visibility change was made during development.
