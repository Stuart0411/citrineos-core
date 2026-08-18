// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type {
  EmsApplyChargingPlanResponse,
  EmsChargingPlanReconciliationResponse,
  EmsChargingPlanRequest,
  BootstrapConfig,
  CallAction,
  ChargingLimitSourceEnumType,
  ICache,
  IMessage,
  IMessageConfirmation,
  IMessageHandler,
  IMessageSender,
  OCPP2_common_types,
  OCPP2_request_types,
  OCPP2_response_types,
  SystemConfig,
} from '@citrineos/base';
import {
  AbstractModule,
  AsHandler,
  ChargingLimitSourceEnum,
  ChargingProfileStatusEnum,
  ChargingStationSequenceTypeEnum,
  EventGroup,
  OCPPValidator,
  OCPP_2_VER_LIST,
} from '@citrineos/base';
import { OCPP2_0_1, OCPP2_1, OCPP_CallAction, OCPPVersion } from '@citrineos/base';
import type {
  IChargingProfileRepository,
  IDeviceModelRepository,
  IEmsDecisionRepository,
  IEmsSiteIntentRepository,
  IStationEnergyTransferPolicyRepository,
} from '@dal/interfaces/repositories.js';
import type { ILocationRepository } from '@dal/interfaces/repositories.js';
import * as OCPP2_0_1_Mapper from '@dal/layers/sequelize/mapper/2.0.1/index.js';
import {
  SequelizeChargingProfileRepository,
  SequelizeChargingStationSequenceRepository,
  SequelizeDeviceModelRepository,
  SequelizeEmsDecisionRepository,
  SequelizeEmsSiteIntentRepository,
  SequelizeLocationRepository,
} from '@dal/layers/sequelize/index.js';
import { IdGenerator } from '@util/util/idGenerator.js';
import type { ILogObj } from 'tslog';
import { Logger } from 'tslog';
import { EmsMqttBridge } from './MqttBridge.js';
import { EmsPolicyEngine } from './PolicyEngine.js';

export class EmsModule extends AbstractModule {
  _requests: CallAction[] = [];
  _responses: CallAction[] = [];
  protected _emsSiteIntentRepository: IEmsSiteIntentRepository;
  protected _emsDecisionRepository: IEmsDecisionRepository;
  protected _locationRepository: ILocationRepository;
  protected _chargingProfileRepository: IChargingProfileRepository;
  protected _deviceModelRepository: IDeviceModelRepository;
  protected _stationEnergyTransferPolicyRepository?: IStationEnergyTransferPolicyRepository;
  protected _mqttBridge: EmsMqttBridge;
  protected _policyEngine: EmsPolicyEngine;
  protected _idGenerator: IdGenerator;

  private static _createNoopDeviceModelRepository(): IDeviceModelRepository {
    return {
      readAllByQuerystring: async () => [],
    } as unknown as IDeviceModelRepository;
  }

  constructor(
    config: BootstrapConfig & SystemConfig,
    cache: ICache,
    sender: IMessageSender,
    handler: IMessageHandler,
    logger?: Logger<ILogObj>,
    ocppValidator?: OCPPValidator,
    emsSiteIntentRepository?: IEmsSiteIntentRepository,
    emsDecisionRepository?: IEmsDecisionRepository,
    locationRepository?: ILocationRepository,
    chargingProfileRepository?: IChargingProfileRepository,
    idGenerator?: IdGenerator,
    deviceModelRepository?: IDeviceModelRepository,
    stationEnergyTransferPolicyRepository?: IStationEnergyTransferPolicyRepository,
  ) {
    super(config, cache, handler, sender, EventGroup.Ems, logger, ocppValidator);
    this._requests = Array.from(
      new Set([...(config.modules.ems?.requests ?? []), OCPP_CallAction.ReportChargingProfiles]),
    );
    this._responses = Array.from(
      new Set([...(config.modules.ems?.responses ?? []), OCPP_CallAction.SetChargingProfile]),
    );
    this._emsSiteIntentRepository =
      emsSiteIntentRepository || new SequelizeEmsSiteIntentRepository(config, logger);
    this._emsDecisionRepository =
      emsDecisionRepository || new SequelizeEmsDecisionRepository(config, logger);
    this._locationRepository =
      locationRepository || new SequelizeLocationRepository(config, logger);
    this._chargingProfileRepository =
      chargingProfileRepository || new SequelizeChargingProfileRepository(config, logger);
    this._deviceModelRepository =
      deviceModelRepository ||
      ((config as { database?: unknown }).database
        ? new SequelizeDeviceModelRepository(config, logger)
        : EmsModule._createNoopDeviceModelRepository());
    this._stationEnergyTransferPolicyRepository = stationEnergyTransferPolicyRepository;
    this._mqttBridge = new EmsMqttBridge(
      config,
      this._emsSiteIntentRepository,
      this._logger,
      undefined,
      this._emsDecisionRepository,
    );
    this._policyEngine = new EmsPolicyEngine(
      this._emsSiteIntentRepository,
      this._locationRepository,
      this._deviceModelRepository,
      this._stationEnergyTransferPolicyRepository,
    );
    this._idGenerator =
      idGenerator ||
      new IdGenerator(new SequelizeChargingStationSequenceRepository(config, this._logger));
  }

  get emsSiteIntentRepository(): IEmsSiteIntentRepository {
    return this._emsSiteIntentRepository;
  }

  get emsDecisionRepository(): IEmsDecisionRepository {
    return this._emsDecisionRepository;
  }

  async deriveChargingPlan(tenantId: number, request: EmsChargingPlanRequest) {
    return this._policyEngine.deriveChargingPlan(tenantId, request);
  }

  async applyChargingPlan(
    tenantId: number,
    request: EmsChargingPlanRequest,
  ): Promise<EmsApplyChargingPlanResponse | null> {
    const plan = await this.deriveChargingPlan(tenantId, request);
    if (!plan) {
      return null;
    }

    const results = [] as EmsApplyChargingPlanResponse['results'];

    for (const recommendation of plan.recommendations) {
      if (!recommendation.eligible) {
        const reason =
          recommendation.eligibilityReason ??
          'Station not eligible for current allocation strategy';
        results.push({
          stationId: recommendation.stationId,
          applied: false,
          reason,
          success: false,
        });
        await this._persistEmsDecision(tenantId, {
          siteId: plan.siteId,
          stationId: recommendation.stationId,
          evseId: recommendation.evseId,
          intentMessageId: plan.sourceIntentMessageId,
          decisionType: 'apply_skipped',
          decisionJson: {
            reason,
            protocol: recommendation.protocol,
            recommendation,
          },
        });
        continue;
      }

      if (
        recommendation.protocol !== OCPPVersion.OCPP2_1 &&
        recommendation.protocol !== OCPPVersion.OCPP2_0_1
      ) {
        results.push({
          stationId: recommendation.stationId,
          applied: false,
          reason: `Station protocol ${recommendation.protocol ?? 'unknown'} is not compatible with EMS charging-profile fallback`,
          success: false,
        });
        await this._persistEmsDecision(tenantId, {
          siteId: plan.siteId,
          stationId: recommendation.stationId,
          evseId: recommendation.evseId,
          intentMessageId: plan.sourceIntentMessageId,
          decisionType: 'apply_skipped',
          decisionJson: {
            reason: `Station protocol ${recommendation.protocol ?? 'unknown'} is not compatible with EMS charging-profile fallback`,
            protocol: recommendation.protocol,
            recommendation,
          },
        });
        continue;
      }

      const profileId = await this._chargingProfileRepository.getNextChargingProfileId(
        tenantId,
        recommendation.stationId,
      );
      const scheduleId = await this._chargingProfileRepository.getNextChargingScheduleId(
        tenantId,
        recommendation.stationId,
      );
      const stackLevel = await this._chargingProfileRepository.getNextStackLevel(
        tenantId,
        recommendation.stationId,
        null,
        recommendation.chargingProfilePurpose,
      );

      const validFrom = new Date().toISOString();
      const startSchedule = new Date().toISOString();
      const fallbackPurpose =
        recommendation.chargingProfilePurpose ===
          OCPP2_0_1.ChargingProfilePurposeEnumType.TxProfile ||
        recommendation.chargingProfilePurpose ===
          OCPP2_0_1.ChargingProfilePurposeEnumType.TxDefaultProfile ||
        recommendation.chargingProfilePurpose ===
          OCPP2_0_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile
          ? (recommendation.chargingProfilePurpose as OCPP2_0_1.ChargingProfilePurposeEnumType)
          : OCPP2_0_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile;

      const protocol = recommendation.protocol as OCPPVersion;
      const chargingProfile: OCPP2_1.ChargingProfileType | OCPP2_0_1.ChargingProfileType =
        protocol === OCPPVersion.OCPP2_1
          ? {
              id: profileId,
              stackLevel,
              chargingProfilePurpose:
                recommendation.chargingProfilePurpose as OCPP2_1.ChargingProfilePurposeEnumType,
              chargingProfileKind: OCPP2_1.ChargingProfileKindEnumType.Dynamic,
              validFrom,
              chargingSchedule: [
                {
                  id: scheduleId,
                  chargingRateUnit: OCPP2_1.ChargingRateUnitEnumType.W,
                  startSchedule,
                  chargingSchedulePeriod: [
                    {
                      startPeriod: 0,
                      limit: recommendation.limitW,
                      operationMode: recommendation.operationMode as OCPP2_1.OperationModeEnumType,
                    },
                  ],
                },
              ],
            }
          : {
              id: profileId,
              stackLevel,
              chargingProfilePurpose: fallbackPurpose,
              chargingProfileKind: OCPP2_0_1.ChargingProfileKindEnumType.Absolute,
              validFrom,
              chargingSchedule: [
                {
                  id: scheduleId,
                  chargingRateUnit: OCPP2_0_1.ChargingRateUnitEnumType.W,
                  startSchedule,
                  chargingSchedulePeriod: [
                    {
                      startPeriod: 0,
                      limit: recommendation.limitW,
                    },
                  ],
                },
              ],
            };

      await this._chargingProfileRepository.createOrUpdateChargingProfile(
        tenantId,
        OCPP2_0_1_Mapper.ChargingProfileMapper.fromChargingProfileType(chargingProfile),
        recommendation.stationId,
        recommendation.evseId,
        ChargingLimitSourceEnum.EMS as ChargingLimitSourceEnumType,
      );

      const confirmation: IMessageConfirmation = await this.sendCall(
        recommendation.stationId,
        tenantId,
        protocol,
        OCPP_CallAction.SetChargingProfile,
        {
          evseId: recommendation.evseId,
          chargingProfile,
        } as OCPP2_request_types.SetChargingProfileRequest,
      );

      results.push({
        stationId: recommendation.stationId,
        applied: confirmation.success,
        profileId,
        scheduleId,
        success: confirmation.success,
        payload: confirmation.payload,
        reason: confirmation.success
          ? protocol === OCPPVersion.OCPP2_0_1
            ? 'Applied OCPP 2.0.1 Absolute-profile fallback'
            : null
          : String(confirmation.payload),
      });

      await this._persistEmsDecision(tenantId, {
        siteId: plan.siteId,
        stationId: recommendation.stationId,
        evseId: recommendation.evseId,
        intentMessageId: plan.sourceIntentMessageId,
        decisionType: 'apply_result',
        decisionJson: {
          profileId,
          scheduleId,
          protocol,
          confirmation,
          recommendation,
        },
      });
    }

    return {
      siteId: plan.siteId,
      sourceIntentMessageId: plan.sourceIntentMessageId,
      appliedCount: results.filter((result) => result.applied).length,
      results,
    };
  }

  async reconcileChargingPlan(
    tenantId: number,
    request: EmsChargingPlanRequest,
  ): Promise<EmsChargingPlanReconciliationResponse | null> {
    const plan = await this.deriveChargingPlan(tenantId, request);
    if (!plan) {
      return null;
    }

    const results = [] as EmsChargingPlanReconciliationResponse['results'];

    for (const recommendation of plan.recommendations) {
      const activeProfiles = await this._chargingProfileRepository.readAllByQuery(tenantId, {
        where: {
          stationId: recommendation.stationId,
          chargingLimitSource: ChargingLimitSourceEnum.EMS,
          isActive: true,
        },
        order: [['updatedAt', 'DESC']],
        limit: 1,
      });

      const activeProfile = activeProfiles[0];
      const activeSchedule = activeProfile?.chargingSchedule?.[0] as
        | { chargingSchedulePeriod?: Array<Record<string, unknown>> }
        | undefined;
      const activePeriod = activeSchedule?.chargingSchedulePeriod?.[0];

      const actualLimitW =
        typeof activePeriod?.limit === 'number' ? (activePeriod.limit as number) : null;
      const actualOperationMode =
        typeof activePeriod?.operationMode === 'string'
          ? (activePeriod.operationMode as
              | 'ChargingOnly'
              | 'ExternalLimits'
              | 'CentralSetpoint'
              | 'ExternalSetpoint'
              | 'LocalFrequency'
              | 'LocalLoadBalancing'
              | 'Idle')
          : null;

      const hasActiveProfile = Boolean(activeProfile);
      const drifted =
        !hasActiveProfile ||
        actualLimitW !== recommendation.limitW ||
        actualOperationMode !== recommendation.operationMode;

      const reason = !recommendation.eligible
        ? recommendation.eligibilityReason ?? 'Station not eligible for current allocation strategy'
        : !hasActiveProfile
          ? 'No active EMS charging profile found'
          : actualLimitW !== recommendation.limitW
            ? 'Charging limit differs from planned value'
            : actualOperationMode !== recommendation.operationMode
              ? 'Operation mode differs from planned value'
              : null;

      results.push({
        stationId: recommendation.stationId,
        eligible: recommendation.eligible,
        protocol: recommendation.protocol ?? null,
        hasActiveProfile,
        drifted,
        reason,
        activeProfileId: activeProfile?.id ?? null,
        plannedLimitW: recommendation.limitW,
        actualLimitW,
        plannedOperationMode: recommendation.operationMode,
        actualOperationMode,
      });

      await this._persistEmsDecision(tenantId, {
        siteId: plan.siteId,
        stationId: recommendation.stationId,
        evseId: recommendation.evseId,
        intentMessageId: plan.sourceIntentMessageId,
        decisionType: 'reconcile_result',
        decisionJson: {
          protocol: recommendation.protocol,
          hasActiveProfile,
          drifted,
          reason,
          plannedLimitW: recommendation.limitW,
          actualLimitW,
          plannedOperationMode: recommendation.operationMode,
          actualOperationMode,
          activeProfileId: activeProfile?.id ?? null,
        },
      });
    }

    return {
      siteId: plan.siteId,
      sourceIntentMessageId: plan.sourceIntentMessageId,
      comparedCount: results.length,
      driftedCount: results.filter((result) => result.drifted).length,
      results,
    };
  }

  async startMqttBridge(): Promise<void> {
    await this._mqttBridge.start();
  }

  async stopMqttBridge(): Promise<void> {
    await this._mqttBridge.shutdown();
  }

  isMqttBridgeStarted(): boolean {
    return this._mqttBridge.isStarted();
  }

  getMqttBridgeStatus(): {
    enabled: boolean;
    started: boolean;
    startupMode: 'non_fatal' | 'required' | null;
    siteIntentsTopic: string | null;
  } {
    return {
      enabled: this._mqttBridge.isEnabled(),
      started: this._mqttBridge.isStarted(),
      startupMode: this.config.modules.ems?.mqtt?.startupMode ?? null,
      siteIntentsTopic: this.config.modules.ems?.mqtt?.siteIntentsTopic ?? null,
    };
  }

  override async shutdown(): Promise<void> {
    await this._mqttBridge.shutdown();
    await super.shutdown();
  }

  @AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.ReportChargingProfiles)
  protected async _handleReportChargingProfiles(
    message: IMessage<OCPP2_request_types.ReportChargingProfilesRequest>,
  ): Promise<void> {
    const chargingProfiles = message.payload
      .chargingProfile as OCPP2_common_types.ChargingProfileType[];
    const tenantId = message.context.tenantId;

    for (const chargingProfile of chargingProfiles) {
      await this._chargingProfileRepository.createOrUpdateChargingProfile(
        tenantId,
        OCPP2_0_1_Mapper.ChargingProfileMapper.fromChargingProfileType(chargingProfile),
        message.context.stationId,
        message.payload.evseId,
        message.payload.chargingLimitSource,
        true,
      );
    }

    await this.sendCallResultWithMessage(
      message,
      {} as OCPP2_response_types.ReportChargingProfilesResponse,
    );
  }

  @AsHandler(OCPP_2_VER_LIST, OCPP_CallAction.SetChargingProfile)
  protected async _handleSetChargingProfile(
    message: IMessage<OCPP2_response_types.SetChargingProfileResponse>,
  ): Promise<void> {
    const tenantId = message.context.tenantId;
    const response = message.payload;

    if (response.status === ChargingProfileStatusEnum.Rejected) {
      this._logger.error(`EMS SetChargingProfile rejected: ${JSON.stringify(response)}`);
      return;
    }

    await this._chargingProfileRepository.updateAllByQuery(
      tenantId,
      {
        isActive: false,
      },
      {
        where: {
          tenantId,
          stationId: message.context.stationId,
          isActive: true,
          chargingLimitSource: ChargingLimitSourceEnum.EMS,
        },
        returning: false,
      },
    );

    await this.sendCall(
      message.context.stationId,
      tenantId,
      message.protocol,
      OCPP_CallAction.GetChargingProfiles,
      {
        requestId: await this._idGenerator.generateRequestId(
          tenantId,
          message.context.stationId,
          ChargingStationSequenceTypeEnum.getChargingProfiles,
        ),
        chargingProfile: {
          chargingLimitSource: [ChargingLimitSourceEnum.EMS],
        } as OCPP2_common_types.ChargingProfileCriterionType,
      } as OCPP2_request_types.GetChargingProfilesRequest,
    );
  }

  protected async _persistEmsDecision(
    tenantId: number,
    value: Parameters<IEmsDecisionRepository['createDecision']>[1],
  ): Promise<void> {
    try {
      await this._emsDecisionRepository.createDecision(tenantId, value);
    } catch (error) {
      this._logger.warn(
        `Failed to persist EMS decision ${value.decisionType} for station ${value.stationId}: ${String(error)}`,
      );
    }
  }
}
