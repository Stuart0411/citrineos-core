// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import { OCPPVersion } from '@citrineos/base';
import { EmsPolicyEngine } from '../../src/module/PolicyEngine.js';

describe('EmsPolicyEngine', () => {
  it('excludes unknown and unsupported stations from equal-share allocation', async () => {
    const emsSiteIntentRepository = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-1',
        constraints: {
          evChargeBudgetW: 12000,
        },
      }),
    } as any;

    const locationRepository = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        {
          id: 'cs-online',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_1,
          capabilities: ['ChargingProfileCapable'],
          evses: [{ id: 1 }],
        },
        { id: 'cs-unsupported', isOnline: true, protocol: 'ocpp1.6' },
        {
          id: 'cs-offline',
          isOnline: false,
          protocol: OCPPVersion.OCPP2_0_1,
          capabilities: ['ChargingProfileCapable'],
          evses: [{ id: 1 }],
        },
        {
          id: 'cs-no-profile-capability',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_1,
          capabilities: ['RemoteStartStopCapable'],
          evses: [{ id: 1 }],
        },
        {
          id: 'cs-wrong-evse',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_0_1,
          capabilities: ['ChargingProfileCapable'],
          evses: [{ id: 2 }],
        },
      ]),
    } as any;

    const engine = new EmsPolicyEngine(emsSiteIntentRepository, locationRepository, {
      readAllByQuerystring: vi
        .fn()
        .mockImplementation(async (_tenantId: number, query: { stationId?: string }) => {
          if (query.stationId === 'cs-online') {
            return [{ value: 'true' }];
          }
          if (query.stationId === 'cs-offline') {
            return [{ value: 'true' }];
          }
          if (query.stationId === 'cs-no-profile-capability') {
            return [{ value: 'true' }];
          }
          if (query.stationId === 'cs-wrong-evse') {
            return [{ value: 'true' }];
          }
          return [];
        }),
    } as any);

    const plan = await engine.deriveChargingPlan(1, {
      siteId: 'site-1',
      stationIds: [
        'cs-online',
        'cs-unsupported',
        'cs-offline',
        'cs-no-profile-capability',
        'cs-wrong-evse',
        'cs-missing',
      ],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(plan).not.toBeNull();
    expect(plan?.eligibleStationCount).toBe(2);
    expect(plan?.recommendations).toEqual([
      expect.objectContaining({
        stationId: 'cs-online',
        eligible: true,
        eligibilityReason: null,
        limitW: 6000,
      }),
      expect.objectContaining({
        stationId: 'cs-unsupported',
        eligible: false,
        eligibilityReason:
          'Station protocol ocpp1.6 is not compatible with EMS charging-profile fallback',
        limitW: 0,
      }),
      expect.objectContaining({
        stationId: 'cs-offline',
        eligible: false,
        eligibilityReason: 'Station is offline',
        limitW: 0,
      }),
      expect.objectContaining({
        stationId: 'cs-no-profile-capability',
        eligible: true,
        eligibilityReason: null,
        limitW: 6000,
      }),
      expect.objectContaining({
        stationId: 'cs-wrong-evse',
        eligible: false,
        eligibilityReason: 'Requested EVSE is not present on station',
        limitW: 0,
      }),
      expect.objectContaining({
        stationId: 'cs-missing',
        eligible: false,
        eligibilityReason: 'Station not found',
        limitW: 0,
      }),
    ]);
  });

  it('allows offline supported stations only for equal_share_all', async () => {
    const emsSiteIntentRepository = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-2',
        constraints: {
          maxImportW: 9000,
        },
      }),
    } as any;

    const locationRepository = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        { id: 'cs-a', isOnline: true, protocol: OCPPVersion.OCPP2_1 },
        {
          id: 'cs-b',
          isOnline: false,
          protocol: OCPPVersion.OCPP2_0_1,
          capabilities: ['ChargingProfileCapable'],
        },
      ]),
    } as any;

    const engine = new EmsPolicyEngine(emsSiteIntentRepository, locationRepository, {
      readAllByQuerystring: vi.fn().mockResolvedValue([{ value: 'true' }]),
    } as any);

    const plan = await engine.deriveChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['cs-a', 'cs-b'],
      evseId: 1,
      strategy: 'equal_share_all',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(plan).not.toBeNull();
    expect(plan?.eligibleStationCount).toBe(2);
    expect(plan?.recommendations).toEqual([
      expect.objectContaining({
        stationId: 'cs-a',
        eligible: true,
        eligibilityReason: null,
        limitW: 4500,
      }),
      expect.objectContaining({
        stationId: 'cs-b',
        eligible: true,
        eligibilityReason: null,
        limitW: 4500,
      }),
    ]);
  });

  it('keeps stations eligible when capabilities are absent but protocol is supported', async () => {
    const emsSiteIntentRepository = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-3',
        constraints: {
          evChargeBudgetW: 6000,
        },
      }),
    } as any;

    const locationRepository = {
      getChargingStationsByIds: vi
        .fn()
        .mockResolvedValue([
          { id: 'cs-legacy-metadata', isOnline: true, protocol: OCPPVersion.OCPP2_1 },
        ]),
    } as any;

    const engine = new EmsPolicyEngine(emsSiteIntentRepository, locationRepository, {
      readAllByQuerystring: vi.fn().mockResolvedValue([]),
    } as any);

    const plan = await engine.deriveChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['cs-legacy-metadata'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(plan?.eligibleStationCount).toBe(1);
    expect(plan?.recommendations).toEqual([
      expect.objectContaining({
        stationId: 'cs-legacy-metadata',
        eligible: true,
        eligibilityReason: null,
        limitW: 6000,
      }),
    ]);
  });

  it('keeps stations eligible when EVSE metadata is absent but protocol is supported', async () => {
    const emsSiteIntentRepository = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-4',
        constraints: {
          evChargeBudgetW: 4000,
        },
      }),
    } as any;

    const locationRepository = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        {
          id: 'cs-no-evse-metadata',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_1,
          capabilities: ['ChargingProfileCapable'],
        },
      ]),
    } as any;

    const engine = new EmsPolicyEngine(emsSiteIntentRepository, locationRepository, {
      readAllByQuerystring: vi.fn().mockResolvedValue([]),
    } as any);

    const plan = await engine.deriveChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['cs-no-evse-metadata'],
      evseId: 9,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(plan?.eligibleStationCount).toBe(1);
    expect(plan?.recommendations).toEqual([
      expect.objectContaining({
        stationId: 'cs-no-evse-metadata',
        eligible: true,
        eligibilityReason: null,
        limitW: 4000,
      }),
    ]);
  });

  it('excludes stations when SmartChargingCtrlr.Enabled is explicitly false', async () => {
    const emsSiteIntentRepository = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-5',
        constraints: {
          evChargeBudgetW: 5000,
        },
      }),
    } as any;

    const locationRepository = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        {
          id: 'cs-disabled-smartcharging',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_1,
          capabilities: ['ChargingProfileCapable'],
          evses: [{ id: 1 }],
        },
      ]),
    } as any;

    const deviceModelRepository = {
      readAllByQuerystring: vi.fn().mockResolvedValue([{ value: 'false' }]),
    } as any;

    const engine = new EmsPolicyEngine(
      emsSiteIntentRepository,
      locationRepository,
      deviceModelRepository,
    );

    const plan = await engine.deriveChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['cs-disabled-smartcharging'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(plan?.eligibleStationCount).toBe(0);
    expect(plan?.recommendations).toEqual([
      expect.objectContaining({
        stationId: 'cs-disabled-smartcharging',
        eligible: false,
        eligibilityReason: 'SmartChargingCtrlr.Enabled is false in device model',
        limitW: 0,
      }),
    ]);
  });

  it('excludes OCPP 2.0.1 stations when the requested operation mode requires dynamic semantics', async () => {
    const emsSiteIntentRepository = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-6',
        constraints: {
          evChargeBudgetW: 8000,
        },
      }),
    } as any;

    const locationRepository = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        {
          id: 'cs-201-central-setpoint',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_0_1,
          capabilities: ['ChargingProfileCapable'],
          evses: [{ id: 1 }],
        },
      ]),
    } as any;

    const deviceModelRepository = {
      readAllByQuerystring: vi.fn().mockResolvedValue([{ value: 'true' }]),
    } as any;

    const engine = new EmsPolicyEngine(
      emsSiteIntentRepository,
      locationRepository,
      deviceModelRepository,
    );

    const plan = await engine.deriveChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['cs-201-central-setpoint'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'CentralSetpoint',
    });

    expect(plan?.eligibleStationCount).toBe(0);
    expect(plan?.recommendations).toEqual([
      expect.objectContaining({
        stationId: 'cs-201-central-setpoint',
        eligible: false,
        eligibilityReason:
          'Station protocol ocpp2.0.1 is not compatible with requested operation mode',
        limitW: 0,
      }),
    ]);
  });

  it('keeps OCPP 2.0.1 capability gate strict when ChargingProfileCapable is missing', async () => {
    const emsSiteIntentRepository = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-7',
        constraints: {
          evChargeBudgetW: 5000,
        },
      }),
    } as any;

    const locationRepository = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        {
          id: 'cs-201-no-capability',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_0_1,
          capabilities: ['RemoteStartStopCapable'],
          evses: [{ id: 1 }],
        },
      ]),
    } as any;

    const deviceModelRepository = {
      readAllByQuerystring: vi.fn().mockResolvedValue([{ value: 'true' }]),
    } as any;

    const engine = new EmsPolicyEngine(
      emsSiteIntentRepository,
      locationRepository,
      deviceModelRepository,
    );

    const plan = await engine.deriveChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['cs-201-no-capability'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(plan?.eligibleStationCount).toBe(0);
    expect(plan?.recommendations).toEqual([
      expect.objectContaining({
        stationId: 'cs-201-no-capability',
        eligible: false,
        eligibilityReason: 'Station does not advertise ChargingProfileCapable capability',
        limitW: 0,
      }),
    ]);
  });

  it('adds export permission and discharge limit from latest station V2X policy when intent allows discharge', async () => {
    const emsSiteIntentRepository = {
      readLatestActiveBySiteId: vi.fn().mockResolvedValue({
        messageId: 'intent-7',
        constraints: {
          evChargeBudgetW: 10000,
          evDischargeBudgetW: 6000,
        },
        flags: {
          allowDischarge: true,
        },
      }),
    } as any;

    const locationRepository = {
      getChargingStationsByIds: vi.fn().mockResolvedValue([
        {
          id: 'cs-v2x-enabled',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_1,
          capabilities: ['ChargingProfileCapable'],
          evses: [{ id: 1 }],
        },
        {
          id: 'cs-v2x-disabled',
          isOnline: true,
          protocol: OCPPVersion.OCPP2_1,
          capabilities: ['ChargingProfileCapable'],
          evses: [{ id: 1 }],
        },
      ]),
    } as any;

    const deviceModelRepository = {
      readAllByQuerystring: vi.fn().mockResolvedValue([{ value: 'true' }]),
    } as any;

    const stationEnergyTransferPolicyRepository = {
      readOnlyOneByQuery: vi.fn().mockImplementation(async (_tenantId: number, query: any) => {
        if (query.where.stationId === 'cs-v2x-enabled') {
          return {
            exportEnabled: true,
            dischargeLimitW: 4000,
          };
        }

        return {
          exportEnabled: false,
          dischargeLimitW: null,
        };
      }),
    } as any;

    const engine = new EmsPolicyEngine(
      emsSiteIntentRepository,
      locationRepository,
      deviceModelRepository,
      stationEnergyTransferPolicyRepository,
    );

    const plan = await engine.deriveChargingPlan(1, {
      siteId: 'site-1',
      stationIds: ['cs-v2x-enabled', 'cs-v2x-disabled'],
      evseId: 1,
      strategy: 'equal_share_online',
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      operationMode: 'ExternalLimits',
    });

    expect(plan?.recommendations).toEqual([
      expect.objectContaining({
        stationId: 'cs-v2x-enabled',
        exportAllowed: true,
        dischargeLimitW: 4000,
      }),
      expect.objectContaining({
        stationId: 'cs-v2x-disabled',
        exportAllowed: false,
        dischargeLimitW: null,
      }),
    ]);
  });
});
