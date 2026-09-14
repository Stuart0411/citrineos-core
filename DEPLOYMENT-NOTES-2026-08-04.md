# UpdateDynamicSchedule Deployment - August 4, 2026

## Summary

Successfully deployed OCPP 2.1 `UpdateDynamicSchedule` functionality to CitrineOS Docker environment.

## Deployment Status

✅ **DEPLOYED AND WORKING**

- Server: Running and healthy
- Endpoint: Registered at `/ocpp/2.1/smartcharging/updateDynamicSchedule`
- Schema: Properly loaded without AJV conflicts
- Date: August 4, 2026 06:24 AM

## Changes Applied

### 1. Schema Conflict Resolution

**Problem:** Both `UpdateDynamicScheduleRequest.json` and `PullDynamicScheduleUpdateResponse.json` define `ChargingScheduleUpdateType`, causing AJV error: "reference 'ChargingScheduleUpdateType' resolves to more than one schema."

**Solution:** Commented out `PullDynamicScheduleUpdateResponseSchema` export in [base/src/ocpp/model/2.1/index.ts](base/src/ocpp/model/2.1/index.ts):

```typescript
export type { PullDynamicScheduleUpdateResponse } from './types/PullDynamicScheduleUpdateResponse.js';
// PullDynamicScheduleUpdateResponseSchema commented out to avoid AJV conflict with UpdateDynamicScheduleRequest
// Both define ChargingScheduleUpdateType. The type export above is sufficient for TypeScript.
// export { default as PullDynamicScheduleUpdateResponseSchema } from './schemas/PullDynamicScheduleUpdateResponse.json' with { type: 'json' };
```

**Rationale:** `PullDynamicScheduleUpdate` is a Station→CSMS message (station sends response to CSMS). CitrineOS acts as CSMS, so it doesn't need to validate the response schema - it only needs to send `UpdateDynamicSchedule` requests.

### 2. Schema Registration

**Problem:** `UpdateDynamicSchedule` was not registered in the global OCPP schema mapping.

**Solution:** Enabled schema registration in [base/src/interfaces/schema/MappingSchema.ts](base/src/interfaces/schema/MappingSchema.ts):

```typescript
// OCPP2_1_CALL_SCHEMA_RECORD
[OCPP_CallAction.UpdateDynamicSchedule]: OCPP2_1.UpdateDynamicScheduleRequestSchema,

// OCPP2_1_CALL_RESULT_SCHEMA_RECORD
[OCPP_CallAction.UpdateDynamicSchedule]: OCPP2_1.UpdateDynamicScheduleResponseSchema,
```

### 3. Fastify Schema Provider

**Problem:** API endpoint decorator was using `undefined as any` for bodySchema, causing route to be skipped.

**Solution:** Updated decorator in [core/src/modules/SmartCharging/src/module/2/MessageApi.ts](core/src/modules/SmartCharging/src/module/2/MessageApi.ts):

```typescript
@AsMessageEndpoint(OCPP_CallAction.UpdateDynamicSchedule, (instance: SmartChargingOcpp2Api) =>
  getOcpp2Schema(
    (instance._ocppVersion ?? DEFAULT_VERSION) as Exclude<OCPPVersion, OCPPVersion.OCPP1_6>,
    'UpdateDynamicScheduleRequestSchema',
  ),
)
async updateDynamicSchedule(...)
```

### 4. Schema Registry Addition

**Problem:** `UpdateDynamicScheduleRequestSchema` was not in the `getOcpp2Schema` lookup table.

**Solution:** Added to [base/src/ocpp/rpc/2/schemas.ts](base/src/ocpp/rpc/2/schemas.ts):

```typescript
const ocpp2_1_schemas: Record<string, AnySchemaObject> = {
  // ... existing schemas ...
  UpdateDynamicScheduleRequestSchema: OCPP2_1.UpdateDynamicScheduleRequestSchema,
};
```

## Files Modified

1. **[base/src/ocpp/model/2.1/index.ts](base/src/ocpp/model/2.1/index.ts)** - Commented out PullDynamicScheduleUpdateResponseSchema export
2. **[base/src/interfaces/schema/MappingSchema.ts](base/src/interfaces/schema/MappingSchema.ts)** - Enabled UpdateDynamicSchedule registration
3. **[core/src/modules/SmartCharging/src/module/2/MessageApi.ts](core/src/modules/SmartCharging/src/module/2/MessageApi.ts)** - Fixed decorator with proper schema provider
4. **[base/src/ocpp/rpc/2/schemas.ts](base/src/ocpp/rpc/2/schemas.ts)** - Added UpdateDynamicScheduleRequestSchema to registry

## Deployment Process

### Docker Volume Issue

The docker-compose configuration uses anonymous volumes for `dist/` directories, which prevent local changes from appearing in the container:

```yaml
volumes:
  - /usr/local/apps/citrineos/dist/
  - /usr/local/apps/citrineos/Server/dist/
  - /usr/local/apps/citrineos/base/dist/
  - /usr/local/apps/citrineos/core/dist/
```

**Solution Applied:**

1. Rebuilt inside the container:

   ```bash
   docker compose exec -T citrine sh -c "rm -f /usr/local/apps/citrineos/base/dist/tsconfig.tsbuildinfo && cd /usr/local/apps/citrineos && npm run build"
   ```

2. Restarted container:
   ```bash
   docker compose restart citrine
   ```

## Verification

```bash
# Check logs
docker compose logs citrine | grep "Adding message route for UpdateDynamicSchedule"

# Output:
citrine-1  | 2026-08-04 06:24:52.835    DEBUG
CitrineOS Logger:SmartChargingOcpp2Api  Adding message route for
UpdateDynamicSchedule /ocpp/2.1/smartcharging/updateDynamicSchedule
```

## Testing

REST API endpoint is now available:

```bash
curl -X POST http://localhost:8080/ocpp/2.1/smartcharging/updateDynamicSchedule \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": ["STATION_ID"],
    "request": {
      "chargingProfileId": 101,
      "scheduleUpdate": {
        "limit": 7000,
        "operationMode": "CentralSetpoint"
      }
    }
  }'
```

## Documentation

- **Implementation Guide:** [TESTING-DYNAMIC-CHARGING.md](TESTING-DYNAMIC-CHARGING.md)
- **Feature Summary:** [DYNAMIC-CHARGING-SUMMARY.md](DYNAMIC-CHARGING-SUMMARY.md)
- **Test Suite:** [core/src/modules/SmartCharging/test/module/DynamicCharging.test.ts](core/src/modules/SmartCharging/test/module/DynamicCharging.test.ts)

## Known Limitations

1. **OCPP 2.0.1 Not Supported:** UpdateDynamicSchedule is OCPP 2.1 only (as per spec).
2. **Database Model:** ChargingProfile model uses OCPP 2.0.1 enums - requires string casting for 'Dynamic' kind.
3. **Schema Conflict:** PullDynamicScheduleUpdateResponseSchema disabled to prevent AJV duplicate type definition error.

## Next Steps

1. Test with actual OCPP 2.1 charging station
2. Verify all 8 operation modes (Idle, ChargingOnly, CentralSetpoint, ExternalSetpoint, ExternalLimits, CentralFrequency, LocalFrequency, LocalLoadBalancing)
3. Test per-phase limits (limit_L2, limit_L3)
4. Test setpoint fields and discharge limits

## Troubleshooting

If UpdateDynamicSchedule endpoint is not registering after code changes:

1. Rebuild inside container: `docker compose exec -T citrine sh -c "cd /usr/local/apps/citrineos && npm run build"`
2. Restart: `docker compose restart citrine`
3. Check logs: `docker compose logs citrine | grep UpdateDynamicSchedule`

## References

- OCPP 2.1 Edition 1 Specification
- CitrineOS Documentation
- [citrine-end-user-ui.html](../citrine-end-user-ui.html) - Test UI with full OCPP 2.1 support
