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

export type EmsAutoApplyConfig = {
  siteId: string;
  stationIds: string[];
  evseId: number;
  strategy: EmsChargingPlanRequest['strategy'];
  chargingProfilePurpose: EmsChargingPlanRequest['chargingProfilePurpose'];
  operationMode: EmsChargingPlanRequest['operationMode'];
  enabled: boolean;
};

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
  private _autoApplyConfigs: Map<string, EmsAutoApplyConfig> = new Map();
  // Prevent concurrent applications and debounce rapid MQTT intent bursts per site key.
  private _autoApplyInFlight: Set<string> = new Set();
  private _autoApplyDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  // Last-applied fingerprint per "tenantId:stationId:evseId" to skip unchanged limits.
  private _lastAppliedFingerprints: Map<string, string> = new Map();
  // Active OCPP 2.1 Dynamic profile ID per "tenantId:stationId:evseId:purpose" for UpdateDynamicSchedule.
  private _activeEmsProfileIds: Map<string, number> = new Map();

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
      new Set([
        ...(config.modules.ems?.responses ?? []),
        OCPP_CallAction.SetChargingProfile,
        OCPP_CallAction.ClearChargingProfile,
      ]),
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
      (tenantId: number, siteId: string) => void this.maybeAutoApply(tenantId, siteId),
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

  setAutoApplyConfig(tenantId: number, config: EmsAutoApplyConfig): void {
    this._autoApplyConfigs.set(`${tenantId}:${config.siteId}`, config);
  }

  getAutoApplyConfig(tenantId: number, siteId: string): EmsAutoApplyConfig | undefined {
    return this._autoApplyConfigs.get(`${tenantId}:${siteId}`);
  }

  getAllAutoApplyConfigs(tenantId: number): EmsAutoApplyConfig[] {
    return Array.from(this._autoApplyConfigs.entries())
      .filter(([key]) => key.startsWith(`${tenantId}:`))
      .map(([, value]) => value);
  }

  removeAutoApplyConfig(tenantId: number, siteId: string): void {
    this._autoApplyConfigs.delete(`${tenantId}:${siteId}`);
  }

  async maybeAutoApply(tenantId: number, siteId: string): Promise<void> {
    const config = this._autoApplyConfigs.get(`${tenantId}:${siteId}`);
    if (!config || !config.enabled || config.stationIds.length === 0) {
      return;
    }
    const key = `${tenantId}:${siteId}`;
    // Debounce: cancel any pending call for this site and schedule a fresh one.
    const existing = this._autoApplyDebounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const debounceMs = (this.config as any).modules?.ems?.autoApplyDebounceMs ?? 2000;
    const timer = setTimeout(() => {
      this._autoApplyDebounceTimers.delete(key);
      void this._runAutoApply(tenantId, siteId, config);
    }, debounceMs);
    this._autoApplyDebounceTimers.set(key, timer);
  }

  private async _runAutoApply(
    tenantId: number,
    siteId: string,
    config: EmsAutoApplyConfig,
  ): Promise<void> {
    const key = `${tenantId}:${siteId}`;
    if (this._autoApplyInFlight.has(key)) {
      this._logger.debug(`EMS auto-apply already in flight for ${key}, skipping.`);
      return;
    }
    this._autoApplyInFlight.add(key);
    try {
      await this.applyChargingPlan(tenantId, {
        siteId: config.siteId,
        stationIds: config.stationIds,
        evseId: config.evseId,
        strategy: config.strategy,
        chargingProfilePurpose: config.chargingProfilePurpose,
        operationMode: config.operationMode,
      });
      this._logger.debug(
        `EMS auto-apply triggered for site ${siteId} → ${config.stationIds.join(',')}`,
      );
    } catch (err) {
      this._logger.warn(
        `EMS auto-apply failed for site ${siteId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this._autoApplyInFlight.delete(key);
    }
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

      // Skip the application if the effective limits are unchanged from the last apply.
      const fingerprintKey = `${tenantId}:${recommendation.stationId}:${recommendation.evseId}`;
      const newFingerprint = JSON.stringify({
        limitW: recommendation.limitW,
        dischargeLimitW: recommendation.dischargeLimitW ?? null,
        operationMode: recommendation.operationMode ?? null,
        purpose: recommendation.chargingProfilePurpose,
        evseId: recommendation.evseId,
      });
      if (this._lastAppliedFingerprints.get(fingerprintKey) === newFingerprint) {
        this._logger.debug(
          `EMS skipping unchanged profile for ${recommendation.stationId} evse=${recommendation.evseId}`,
        );
        results.push({
          stationId: recommendation.stationId,
          applied: false,
          reason: 'No change from last applied profile',
          success: true,
        });
        await this._persistEmsDecision(tenantId, {
          siteId: plan.siteId,
          stationId: recommendation.stationId,
          evseId: recommendation.evseId,
          intentMessageId: plan.sourceIntentMessageId,
          decisionType: 'apply_skipped',
          decisionJson: { reason: 'No change from last applied profile', recommendation },
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
      // EMS always uses stack level 0 so SetChargingProfile replaces the previous EMS profile in-place.
      const stackLevel = 0;

      // Clear any previously stale EMS profiles on the EVSE for this purpose before applying the new one.
      // OCPP 2.1: station-level profiles (MaxProfile, ExternalConstraints) must use evseId 0.
      const stationLevelPurposes = [
        OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationMaxProfile as string,
        OCPP2_1.ChargingProfilePurposeEnumType.ChargingStationExternalConstraints as string,
      ];
      const ocppEvseId = stationLevelPurposes.includes(recommendation.chargingProfilePurpose)
        ? 0
        : recommendation.evseId;

      // OCPP 2.1 Dynamic profiles: use UpdateDynamicSchedule after the first install.
      const profileKey = `${tenantId}:${recommendation.stationId}:${recommendation.evseId}:${recommendation.chargingProfilePurpose}`;
      const wouldBeDynamic =
        recommendation.protocol === OCPPVersion.OCPP2_1 &&
        !stationLevelPurposes.includes(recommendation.chargingProfilePurpose);
      const existingProfileId = this._activeEmsProfileIds.get(profileKey);

      if (wouldBeDynamic && existingProfileId !== undefined) {
        const scheduleUpdate: OCPP2_1.ChargingScheduleUpdateType = {
          limit: recommendation.limitW,
          ...(typeof recommendation.dischargeLimitW === 'number'
            ? { dischargeLimit: -Math.abs(recommendation.dischargeLimitW) }
            : {}),
        };
        const updateConf = await this.sendCall(
          recommendation.stationId,
          tenantId,
          recommendation.protocol as OCPPVersion,
          OCPP_CallAction.UpdateDynamicSchedule,
          {
            chargingProfileId: existingProfileId,
            scheduleUpdate,
          } as OCPP2_1.UpdateDynamicScheduleRequest,
        );
        const updateApplied =
          updateConf.success &&
          (updateConf.payload as { status?: string } | undefined)?.status === 'Accepted';
        if (updateApplied) {
          this._lastAppliedFingerprints.set(fingerprintKey, newFingerprint);
          results.push({
            stationId: recommendation.stationId,
            applied: true,
            profileId: existingProfileId,
            success: true,
            payload: updateConf.payload,
            reason: null,
          });
          await this._persistEmsDecision(tenantId, {
            siteId: plan.siteId,
            stationId: recommendation.stationId,
            evseId: recommendation.evseId,
            intentMessageId: plan.sourceIntentMessageId,
            decisionType: 'apply_result',
            decisionJson: {
              profileId: existingProfileId,
              updateDynamic: true,
              updateConf,
              recommendation,
            },
          });
          continue;
        }
        // Station rejected UpdateDynamicSchedule — clear the cached ID and fall through to Clear+Set.
        this._activeEmsProfileIds.delete(profileKey);
        this._logger.warn(
          `UpdateDynamicSchedule rejected for ${recommendation.stationId} (profileId=${existingProfileId}); falling back to SetChargingProfile`,
        );
      }

      try {
        await this.sendCall(
          recommendation.stationId,
          tenantId,
          recommendation.protocol as OCPPVersion,
          OCPP_CallAction.ClearChargingProfile,
          {
            // ClearChargingProfileRequest has no top-level evseId; criteria covers all EVSEs for this purpose.
            chargingProfileCriteria: {
              chargingProfilePurpose: recommendation.chargingProfilePurpose,
              stackLevel: 0,
            },
          } as OCPP2_request_types.ClearChargingProfileRequest,
        );
      } catch {
        // Ignore ClearChargingProfile failures — proceed with SetChargingProfile.
      }

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
      const ocpp21ChargingProfileKind = stationLevelPurposes.includes(
        recommendation.chargingProfilePurpose,
      )
        ? OCPP2_1.ChargingProfileKindEnumType.Absolute
        : OCPP2_1.ChargingProfileKindEnumType.Dynamic;
      let chargingProfile: OCPP2_1.ChargingProfileType | OCPP2_0_1.ChargingProfileType =
        protocol === OCPPVersion.OCPP2_1
          ? {
              id: profileId,
              stackLevel,
              chargingProfilePurpose:
                recommendation.chargingProfilePurpose as OCPP2_1.ChargingProfilePurposeEnumType,
              chargingProfileKind: ocpp21ChargingProfileKind,
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
                      ...(typeof recommendation.dischargeLimitW === 'number'
                        ? { dischargeLimit: -Math.abs(recommendation.dischargeLimitW) }
                        : {}),
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

      let confirmation: IMessageConfirmation = await this.sendCall(
        recommendation.stationId,
        tenantId,
        protocol,
        OCPP_CallAction.SetChargingProfile,
        {
          evseId: ocppEvseId,
          chargingProfile,
        } as OCPP2_request_types.SetChargingProfileRequest,
      );

      const responseStatus = (payload: unknown): string | undefined =>
        (payload as { status?: string } | undefined)?.status;
      const responseReasonCode = (payload: unknown): string | undefined =>
        (payload as { statusInfo?: { reasonCode?: string } } | undefined)?.statusInfo?.reasonCode;
      const isAcceptedResponse = (payload: unknown): boolean =>
        responseStatus(payload) === 'Accepted';
      const isInvalidProfileResponse = (payload: unknown): boolean =>
        responseStatus(payload) === 'Rejected' && responseReasonCode(payload) === 'InvalidProfile';

      if (
        protocol === OCPPVersion.OCPP2_1 &&
        isInvalidProfileResponse(confirmation.payload) &&
        chargingProfile.chargingProfileKind === OCPP2_1.ChargingProfileKindEnumType.Dynamic
      ) {
        // Some stations reject Dynamic for ExternalConstraints; retry with Absolute.
        chargingProfile = {
          ...(chargingProfile as OCPP2_1.ChargingProfileType),
          chargingProfileKind: OCPP2_1.ChargingProfileKindEnumType.Absolute,
        };

        confirmation = await this.sendCall(
          recommendation.stationId,
          tenantId,
          protocol,
          OCPP_CallAction.SetChargingProfile,
          {
            evseId: ocppEvseId,
            chargingProfile,
          } as OCPP2_request_types.SetChargingProfileRequest,
        );
      }

      const applied = confirmation.success && isAcceptedResponse(confirmation.payload);

      // Record the fingerprint only on a successful apply so unchanged limits are detected next time.
      if (applied) {
        this._lastAppliedFingerprints.set(fingerprintKey, newFingerprint);
        // Track the profile ID so subsequent updates can use UpdateDynamicSchedule instead of Clear+Set.
        if (
          protocol === OCPPVersion.OCPP2_1 &&
          (chargingProfile as OCPP2_1.ChargingProfileType).chargingProfileKind ===
            OCPP2_1.ChargingProfileKindEnumType.Dynamic
        ) {
          this._activeEmsProfileIds.set(profileKey, profileId);
        }
      }

      await this._chargingProfileRepository.createOrUpdateChargingProfile(
        tenantId,
        OCPP2_0_1_Mapper.ChargingProfileMapper.fromChargingProfileType(chargingProfile),
        recommendation.stationId,
        recommendation.evseId,
        ChargingLimitSourceEnum.EMS as ChargingLimitSourceEnumType,
      );

      results.push({
        stationId: recommendation.stationId,
        applied,
        profileId,
        scheduleId,
        success: applied,
        payload: confirmation.payload,
        reason: applied
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
