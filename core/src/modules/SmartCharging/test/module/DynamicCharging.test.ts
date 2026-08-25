// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChargingProfileKindEnum,
  ChargingProfilePurposeEnum,
  ChargingProfileStatusEnum,
  ChargingRateUnitEnumType,
  DEFAULT_TENANT_ID,
  ICache,
  IMessageHandler,
  IMessageSender,
  MessageOrigin,
  MessageState,
  OCPP2_0_1,
  OCPP2_1,
  OCPPVersion,
  OCPP_CallAction,
  SystemConfig,
} from '@citrineos/base';
import type { IMessage } from '@citrineos/base';
import { SmartChargingModule } from '../../src/module/module.js';
import type {
  IChargingProfileRepository,
  IDeviceModelRepository,
  IOCPPMessageRepository,
  ITransactionEventRepository,
} from '@dal/interfaces/repositories.js';

describe('SmartCharging Module - Dynamic Charging (OCPP 2.1)', () => {
  const MOCK_STATION_ID = 'TEST_STATION_001';
  const MOCK_TENANT_ID = DEFAULT_TENANT_ID;
  const MOCK_PROFILE_ID = 123;
  const MOCK_EVSE_ID = 1;

  let module: SmartChargingModule;
  let mockChargingProfileRepo: IChargingProfileRepository;
  let mockDeviceModelRepo: IDeviceModelRepository;
  let mockTransactionEventRepo: ITransactionEventRepository;
  let mockOcppMessageRepo: IOCPPMessageRepository;
  let mockCache: ICache;
  let mockMessageSender: IMessageSender;
  let mockMessageHandler: IMessageHandler;

  beforeEach(() => {
    // Mock repositories
    mockChargingProfileRepo = {
      readChargingProfileById: vi.fn(),
      updateChargingProfile: vi.fn(),
      createChargingProfile: vi.fn(),
      deleteChargingProfile: vi.fn(),
    } as any;

    mockDeviceModelRepo = {
      findEvseByIdAndConnectorId: vi.fn(),
      findVariableCharacteristicsByVariableNameAndVariableInstance: vi.fn(),
    } as any;

    mockTransactionEventRepo = {
      readTransactionByStationIdAndTransactionId: vi.fn(),
      getActiveTransactionByStationIdAndEvseId: vi.fn(),
    } as any;

    mockOcppMessageRepo = {} as any;
    mockCache = { set: vi.fn(), get: vi.fn() } as any;
    mockMessageSender = { send: vi.fn() } as any;
    mockMessageHandler = { handle: vi.fn() } as any;

    const config: SystemConfig = {
      util: { cache: { redis: { host: 'localhost', port: 6379 } } },
      logLevel: 2,
      modules: {},
    } as any;

    module = new SmartChargingModule(
      config,
      mockCache,
      mockMessageSender,
      mockMessageHandler,
      mockDeviceModelRepo,
      mockChargingProfileRepo,
      mockTransactionEventRepo,
      mockOcppMessageRepo,
    );

    vi.spyOn(module, 'sendCallResultWithMessage').mockResolvedValue({ success: true } as any);
    vi.spyOn(module, 'sendToMessageSender').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Dynamic Charging Profile Creation', () => {
    it('should accept SetChargingProfile with Dynamic profile kind (2.1)', async () => {
      const request: OCPP2_1.SetChargingProfileRequest = {
        evseId: MOCK_EVSE_ID,
        chargingProfile: {
          id: MOCK_PROFILE_ID,
          stackLevel: 0,
          chargingProfilePurpose: OCPP2_1.ChargingProfilePurposeEnumType.TxDefaultProfile,
          chargingProfileKind: OCPP2_1.ChargingProfileKindEnumType.Dynamic,
          chargingSchedule: [
            {
              id: 1,
              chargingRateUnit: OCPP2_1.ChargingRateUnitEnumType.W,
              chargingSchedulePeriod: [
                {
                  startPeriod: 0,
                  limit: 11000, // 11kW
                  operationMode: OCPP2_1.OperationModeEnumType.CentralSetpoint,
                },
              ],
            },
          ],
          dynamicUpdateInterval: 300, // Request update every 5 minutes
        },
      };

      const message: IMessage<OCPP2_1.SetChargingProfileRequest> = {
        context: {
          stationId: MOCK_STATION_ID,
          tenantId: MOCK_TENANT_ID,
          correlationId: 'test-correlation-id',
          sessionIndex: 'test-session',
        },
        payload: request,
        action: OCPP_CallAction.SetChargingProfile,
        origin: MessageOrigin.ChargingStationManagementSystem,
        state: MessageState.Request,
      };

      // Mock the repository responses
      vi.mocked(mockDeviceModelRepo.findEvseByIdAndConnectorId).mockResolvedValue({
        id: MOCK_EVSE_ID,
        connectorId: null,
      } as any);

      vi.mocked(mockChargingProfileRepo.createChargingProfile).mockResolvedValue({
        id: MOCK_PROFILE_ID,
        ...request.chargingProfile,
      } as any);

      // Call the handler
      await (module as any)._handleSetChargingProfile(message);

      // Verify success response
      expect(module.sendCallResultWithMessage).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          status: ChargingProfileStatusEnum.Accepted,
        }),
      );
    });

    it('should include operationMode in charging schedule periods', async () => {
      const request: OCPP2_1.SetChargingProfileRequest = {
        evseId: MOCK_EVSE_ID,
        chargingProfile: {
          id: MOCK_PROFILE_ID,
          stackLevel: 0,
          chargingProfilePurpose: OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile,
          chargingProfileKind: OCPP2_1.ChargingProfileKindEnumType.Dynamic,
          chargingSchedule: [
            {
              id: 1,
              chargingRateUnit: OCPP2_1.ChargingRateUnitEnumType.A,
              chargingSchedulePeriod: [
                {
                  startPeriod: 0,
                  limit: 32, // 32A
                  operationMode: OCPP2_1.OperationModeEnumType.ExternalLimits,
                },
              ],
              operationMode: OCPP2_1.OperationModeEnumType.ExternalLimits,
            },
          ],
        },
      };

      const message: IMessage<OCPP2_1.SetChargingProfileRequest> = {
        context: {
          stationId: MOCK_STATION_ID,
          tenantId: MOCK_TENANT_ID,
          correlationId: 'test-correlation-id',
          sessionIndex: 'test-session',
        },
        payload: request,
        action: OCPP_CallAction.SetChargingProfile,
        origin: MessageOrigin.ChargingStationManagementSystem,
        state: MessageState.Request,
      };

      vi.mocked(mockDeviceModelRepo.findEvseByIdAndConnectorId).mockResolvedValue({
        id: MOCK_EVSE_ID,
      } as any);

      vi.mocked(mockChargingProfileRepo.createChargingProfile).mockResolvedValue({
        id: MOCK_PROFILE_ID,
        ...request.chargingProfile,
      } as any);

      await (module as any)._handleSetChargingProfile(message);

      expect(module.sendCallResultWithMessage).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          status: ChargingProfileStatusEnum.Accepted,
        }),
      );
    });
  });

  describe('UpdateDynamicSchedule Handler', () => {
    it('should accept UpdateDynamicSchedule for Dynamic profile', async () => {
      const request: OCPP2_1.UpdateDynamicScheduleRequest = {
        chargingProfileId: MOCK_PROFILE_ID,
        scheduleUpdate: {
          limit: 15000, // Update to 15kW
          operationMode: OCPP2_1.OperationModeEnumType.CentralSetpoint,
        },
      };

      const message: IMessage<OCPP2_1.UpdateDynamicScheduleRequest> = {
        context: {
          stationId: MOCK_STATION_ID,
          tenantId: MOCK_TENANT_ID,
          correlationId: 'test-update-correlation',
          sessionIndex: 'test-session',
        },
        payload: request,
        action: OCPP_CallAction.UpdateDynamicSchedule,
        origin: MessageOrigin.ChargingStationManagementSystem,
        state: MessageState.Request,
      };

      // Mock the profile exists and is Dynamic
      vi.mocked(mockChargingProfileRepo.readChargingProfileById).mockResolvedValue({
        id: MOCK_PROFILE_ID,
        chargingProfileKind: ChargingProfileKindEnum.Dynamic,
        stackLevel: 0,
      } as any);

      vi.mocked(mockChargingProfileRepo.updateChargingProfile).mockResolvedValue(undefined);

      await (module as any)._handleUpdateDynamicSchedule(message);

      // Verify profile was looked up
      expect(mockChargingProfileRepo.readChargingProfileById).toHaveBeenCalledWith(
        MOCK_TENANT_ID,
        MOCK_PROFILE_ID,
      );

      // Verify lastUpdated was set
      expect(mockChargingProfileRepo.updateChargingProfile).toHaveBeenCalledWith(
        MOCK_TENANT_ID,
        MOCK_PROFILE_ID,
        expect.objectContaining({
          lastUpdated: expect.any(Date),
        }),
      );

      // Verify event was sent
      expect(module.sendToMessageSender).toHaveBeenCalled();

      // Verify accepted response
      expect(module.sendCallResultWithMessage).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          status: ChargingProfileStatusEnum.Accepted,
        }),
      );
    });

    it('should reject UpdateDynamicSchedule for non-existent profile', async () => {
      const request: OCPP2_1.UpdateDynamicScheduleRequest = {
        chargingProfileId: 999,
        scheduleUpdate: {
          limit: 10000,
        },
      };

      const message: IMessage<OCPP2_1.UpdateDynamicScheduleRequest> = {
        context: {
          stationId: MOCK_STATION_ID,
          tenantId: MOCK_TENANT_ID,
          correlationId: 'test-update-correlation',
          sessionIndex: 'test-session',
        },
        payload: request,
        action: OCPP_CallAction.UpdateDynamicSchedule,
        origin: MessageOrigin.ChargingStationManagementSystem,
        state: MessageState.Request,
      };

      vi.mocked(mockChargingProfileRepo.readChargingProfileById).mockResolvedValue(null);

      await (module as any)._handleUpdateDynamicSchedule(message);

      expect(module.sendCallResultWithMessage).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          status: ChargingProfileStatusEnum.Rejected,
          statusInfo: expect.objectContaining({
            reasonCode: 'ChargingProfileNotFound',
          }),
        }),
      );
    });

    it('should reject UpdateDynamicSchedule for non-Dynamic profile', async () => {
      const request: OCPP2_1.UpdateDynamicScheduleRequest = {
        chargingProfileId: MOCK_PROFILE_ID,
        scheduleUpdate: {
          limit: 10000,
        },
      };

      const message: IMessage<OCPP2_1.UpdateDynamicScheduleRequest> = {
        context: {
          stationId: MOCK_STATION_ID,
          tenantId: MOCK_TENANT_ID,
          correlationId: 'test-update-correlation',
          sessionIndex: 'test-session',
        },
        payload: request,
        action: OCPP_CallAction.UpdateDynamicSchedule,
        origin: MessageOrigin.ChargingStationManagementSystem,
        state: MessageState.Request,
      };

      // Profile exists but is Absolute kind
      vi.mocked(mockChargingProfileRepo.readChargingProfileById).mockResolvedValue({
        id: MOCK_PROFILE_ID,
        chargingProfileKind: ChargingProfileKindEnum.Absolute,
        stackLevel: 0,
      } as any);

      await (module as any)._handleUpdateDynamicSchedule(message);

      expect(module.sendCallResultWithMessage).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          status: ChargingProfileStatusEnum.Rejected,
          statusInfo: expect.objectContaining({
            reasonCode: 'InvalidProfileKind',
          }),
        }),
      );
    });

    it('should support per-phase limits in UpdateDynamicSchedule', async () => {
      const request: OCPP2_1.UpdateDynamicScheduleRequest = {
        chargingProfileId: MOCK_PROFILE_ID,
        scheduleUpdate: {
          limit: 10000, // L1: 10kW
          limit_L2: 8000, // L2: 8kW
          limit_L3: 7000, // L3: 7kW
          operationMode: OCPP2_1.OperationModeEnumType.ExternalLimits,
        },
      };

      const message: IMessage<OCPP2_1.UpdateDynamicScheduleRequest> = {
        context: {
          stationId: MOCK_STATION_ID,
          tenantId: MOCK_TENANT_ID,
          correlationId: 'test-update-correlation',
          sessionIndex: 'test-session',
        },
        payload: request,
        action: OCPP_CallAction.UpdateDynamicSchedule,
        origin: MessageOrigin.ChargingStationManagementSystem,
        state: MessageState.Request,
      };

      vi.mocked(mockChargingProfileRepo.readChargingProfileById).mockResolvedValue({
        id: MOCK_PROFILE_ID,
        chargingProfileKind: ChargingProfileKindEnum.Dynamic,
        stackLevel: 0,
      } as any);

      vi.mocked(mockChargingProfileRepo.updateChargingProfile).mockResolvedValue(undefined);

      await (module as any)._handleUpdateDynamicSchedule(message);

      expect(module.sendCallResultWithMessage).toHaveBeenCalledWith(
        message,
        expect.objectContaining({
          status: ChargingProfileStatusEnum.Accepted,
        }),
      );

      // Verify event includes all phase limits
      expect(module.sendToMessageSender).toHaveBeenCalledWith(
        expect.objectContaining({
          state: expect.objectContaining({
            scheduleUpdate: expect.objectContaining({
              limit: 10000,
              limit_L2: 8000,
              limit_L3: 7000,
            }),
          }),
        }),
      );
    });
  });

  describe('Operation Modes', () => {
    const operationModes = [
      OCPP2_1.OperationModeEnumType.Idle,
      OCPP2_1.OperationModeEnumType.ChargingOnly,
      OCPP2_1.OperationModeEnumType.CentralSetpoint,
      OCPP2_1.OperationModeEnumType.ExternalSetpoint,
      OCPP2_1.OperationModeEnumType.ExternalLimits,
      OCPP2_1.OperationModeEnumType.CentralFrequency,
      OCPP2_1.OperationModeEnumType.LocalFrequency,
      OCPP2_1.OperationModeEnumType.LocalLoadBalancing,
    ];

    operationModes.forEach((operationMode) => {
      it(`should support ${operationMode} operation mode in Dynamic profile`, async () => {
        const request: OCPP2_1.SetChargingProfileRequest = {
          evseId: MOCK_EVSE_ID,
          chargingProfile: {
            id: MOCK_PROFILE_ID,
            stackLevel: 0,
            chargingProfilePurpose: OCPP2_1.ChargingProfilePurposeEnumType.TxDefaultProfile,
            chargingProfileKind: OCPP2_1.ChargingProfileKindEnumType.Dynamic,
            chargingSchedule: [
              {
                id: 1,
                chargingRateUnit: OCPP2_1.ChargingRateUnitEnumType.W,
                operationMode,
                chargingSchedulePeriod: [
                  {
                    startPeriod: 0,
                    limit: 11000,
                    operationMode,
                  },
                ],
              },
            ],
          },
        };

        const message: IMessage<OCPP2_1.SetChargingProfileRequest> = {
          context: {
            stationId: MOCK_STATION_ID,
            tenantId: MOCK_TENANT_ID,
            correlationId: `test-${operationMode}`,
            sessionIndex: 'test-session',
          },
          payload: request,
          action: OCPP_CallAction.SetChargingProfile,
          origin: MessageOrigin.ChargingStationManagementSystem,
          state: MessageState.Request,
        };

        vi.mocked(mockDeviceModelRepo.findEvseByIdAndConnectorId).mockResolvedValue({
          id: MOCK_EVSE_ID,
        } as any);

        vi.mocked(mockChargingProfileRepo.createChargingProfile).mockResolvedValue({
          id: MOCK_PROFILE_ID,
          ...request.chargingProfile,
        } as any);

        await (module as any)._handleSetChargingProfile(message);

        expect(module.sendCallResultWithMessage).toHaveBeenCalledWith(
          message,
          expect.objectContaining({
            status: ChargingProfileStatusEnum.Accepted,
          }),
        );
      });
    });
  });
});
