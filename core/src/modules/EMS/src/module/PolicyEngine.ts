// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type {
  EmsChargingPlanRequest,
  EmsChargingPlanResponse,
  ChargingStationDto,
  OCPPVersion,
} from '@citrineos/base';
import type {
  IDeviceModelRepository,
  IEmsSiteIntentRepository,
  ILocationRepository,
  IStationEnergyTransferPolicyRepository,
} from '@dal/interfaces/repositories.js';
import { OCPPVersion as OCPPVersionEnum } from '@citrineos/base';

export class EmsPolicyEngine {
  constructor(
    private readonly emsSiteIntentRepository: IEmsSiteIntentRepository,
    private readonly locationRepository: ILocationRepository,
    private readonly deviceModelRepository?: IDeviceModelRepository,
    private readonly stationEnergyTransferPolicyRepository?: IStationEnergyTransferPolicyRepository,
  ) {}

  async deriveChargingPlan(
    tenantId: number,
    request: EmsChargingPlanRequest,
  ): Promise<EmsChargingPlanResponse | null> {
    const currentIntent = await this.emsSiteIntentRepository.readLatestActiveBySiteId(
      tenantId,
      request.siteId,
    );

    if (!currentIntent) {
      return null;
    }

    const requestedStationIds = Array.from(new Set(request.stationIds));
    const stations = await this.locationRepository.getChargingStationsByIds(
      tenantId,
      requestedStationIds,
    );
    const stationsById = new Map<string, ChargingStationDto>(
      stations.map((station) => [station.id, station as unknown as ChargingStationDto]),
    );

    const budgetRaw =
      Number((currentIntent.constraints as any)?.evChargeBudgetW ?? NaN) ||
      Number((currentIntent.constraints as any)?.maxImportW ?? 0);
    const totalBudgetW = Math.max(0, budgetRaw);
    const dischargeBudgetRaw = Number((currentIntent.constraints as any)?.evDischargeBudgetW ?? 0);
    const totalDischargeBudgetW = Math.max(0, dischargeBudgetRaw);

    const eligibilityByStation = new Map<string, { eligible: boolean; reason: string | null }>();

    for (const stationId of requestedStationIds) {
      const station = stationsById.get(stationId);
      const reason = await this._getEligibilityReason(
        station ?? null,
        request.strategy,
        request.operationMode,
        request.evseId,
        stationId,
        tenantId,
      );
      eligibilityByStation.set(stationId, {
        eligible: reason === null,
        reason,
      });
    }

    const eligibleStationIds = requestedStationIds.filter(
      (stationId) => eligibilityByStation.get(stationId)?.eligible === true,
    );

    const perStationLimitW =
      eligibleStationIds.length > 0 ? totalBudgetW / eligibleStationIds.length : 0;
    // opModExport: always compute per-station discharge limit from intent budget; no flag gate.
    const perStationDischargeLimitW =
      eligibleStationIds.length > 0 && totalDischargeBudgetW > 0
        ? totalDischargeBudgetW / eligibleStationIds.length
        : 0;

    const energyTransferPolicyByStation = new Map<
      string,
      { exportAllowed: boolean; dischargeLimitW: number | null }
    >();

    for (const stationId of requestedStationIds) {
      const policy = await this._readLatestEnergyTransferPolicy(tenantId, stationId);
      energyTransferPolicyByStation.set(stationId, {
        exportAllowed: policy?.exportEnabled === true,
        dischargeLimitW:
          typeof policy?.dischargeLimitW === 'number' ? policy.dischargeLimitW : null,
      });
    }

    return {
      siteId: request.siteId,
      sourceIntentMessageId: currentIntent.messageId,
      totalBudgetW,
      eligibleStationCount: eligibleStationIds.length,
      strategy: request.strategy,
      recommendations: requestedStationIds.map((stationId) => {
        const station = stationsById.get(stationId);
        const eligibility = eligibilityByStation.get(stationId) ?? {
          eligible: false,
          reason: 'Station not eligible for current allocation strategy',
        };
        const eligible = eligibility.eligible;
        const energyTransferPolicy = energyTransferPolicyByStation.get(stationId) ?? {
          exportAllowed: false,
          dischargeLimitW: null,
        };
        const exportAllowed = energyTransferPolicy.exportAllowed;
        // Apply opModExport: use min(stationCap, intentAllocation) when both are set.
        const dischargeLimitW = (() => {
          const cap = energyTransferPolicy.dischargeLimitW;
          const alloc = perStationDischargeLimitW;
          if (alloc > 0 && cap != null) return Math.min(cap, alloc);
          if (alloc > 0) return alloc;
          return cap ?? null;
        })();

        return {
          stationId,
          isOnline: station?.isOnline ?? null,
          protocol: station?.protocol ?? null,
          eligible,
          eligibilityReason: eligible ? null : eligibility.reason,
          evseId: request.evseId,
          chargingProfilePurpose: request.chargingProfilePurpose,
          chargingProfileKind: 'Dynamic',
          chargingRateUnit: 'W',
          operationMode: request.operationMode,
          limitW: eligible ? perStationLimitW : 0,
          exportAllowed,
          dischargeLimitW,
          sourceIntentMessageId: currentIntent.messageId,
        };
      }),
    };
  }

  private async _readLatestEnergyTransferPolicy(
    tenantId: number,
    stationId: string,
  ): Promise<
    | {
        exportEnabled?: boolean;
        dischargeLimitW?: number | null;
      }
    | undefined
  > {
    if (!this.stationEnergyTransferPolicyRepository) {
      return undefined;
    }

    const rows = await this.stationEnergyTransferPolicyRepository.readAllByQuery(tenantId, {
      where: {
        stationId,
      },
      order: [['updatedAt', 'DESC']],
      limit: 20,
    });
    // Skip the V2X diagnostic pseudo-row written by the AFRR dispatch path
    const policy = rows.find((r) => (r as any).transactionId !== '__diag_afrrsignal__');
    return policy ?? undefined;
  }

  private _isSupportedProtocol(protocol: OCPPVersion | null): boolean {
    return protocol === OCPPVersionEnum.OCPP2_1 || protocol === OCPPVersionEnum.OCPP2_0_1;
  }

  private _supportsChargingProfiles(station: ChargingStationDto): boolean {
    if (station.protocol === OCPPVersionEnum.OCPP2_1) {
      return true;
    }

    return !station.capabilities || station.capabilities.includes('ChargingProfileCapable');
  }

  private _supportsRequestedEvse(station: ChargingStationDto, evseId: number): boolean {
    if (station.protocol === OCPPVersionEnum.OCPP2_1) {
      return true;
    }

    if (!station.evses || station.evses.length === 0) {
      return true;
    }

    return station.evses.some((evse) => evse?.id === evseId);
  }

  private _supportsRequestedOperationMode(
    protocol: OCPPVersion | null,
    operationMode: EmsChargingPlanRequest['operationMode'],
  ): boolean {
    if (protocol === OCPPVersionEnum.OCPP2_1) {
      return true;
    }

    return operationMode === 'ExternalLimits' || operationMode === 'ChargingOnly';
  }

  private async _getEligibilityReason(
    station: ChargingStationDto | null,
    strategy: EmsChargingPlanRequest['strategy'],
    operationMode: EmsChargingPlanRequest['operationMode'],
    evseId: number,
    stationId: string,
    tenantId: number,
  ): Promise<string | null> {
    if (!station) {
      return 'Station not found';
    }

    if (!this._isSupportedProtocol(station.protocol ?? null)) {
      return `Station protocol ${station.protocol ?? 'unknown'} is not compatible with EMS charging-profile fallback`;
    }

    if (!this._supportsRequestedOperationMode(station.protocol ?? null, operationMode)) {
      return `Station protocol ${station.protocol ?? 'unknown'} is not compatible with requested operation mode`;
    }

    if (!this._supportsChargingProfiles(station)) {
      return 'Station does not advertise ChargingProfileCapable capability';
    }

    if (!this._supportsRequestedEvse(station, evseId)) {
      return 'Requested EVSE is not present on station';
    }

    if (!(await this._isSmartChargingEnabled(tenantId, stationId))) {
      return 'SmartChargingCtrlr.Enabled is false in device model';
    }

    if (strategy !== 'equal_share_all' && station.isOnline !== true) {
      return 'Station is offline';
    }

    return null;
  }

  private async _isSmartChargingEnabled(tenantId: number, stationId: string): Promise<boolean> {
    if (!this.deviceModelRepository) {
      return true;
    }

    const enabled = await this.deviceModelRepository.readAllByQuerystring(tenantId, {
      tenantId,
      stationId,
      component_name: 'SmartChargingCtrlr',
      variable_name: 'Enabled',
    });

    if (enabled.length === 0) {
      return true;
    }

    return enabled[0].value !== 'false';
  }
}
