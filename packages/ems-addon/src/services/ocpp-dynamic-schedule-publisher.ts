// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type {
  EmsControlPlan,
  EmsDerControlAction,
  EmsStationControlTarget,
} from '../contracts/ems-control-plan.js';
import type { ICitrineControlPublisher } from '../interfaces/i-citrine-control-publisher.js';

export interface OcppDynamicSchedulePublisherOptions {
  baseUrl: string;
  tenantId: number;
  dynamicScheduleEndpointPath?: string;
  derEndpointPaths?: Partial<Record<EmsDerControlAction['action'], string[]>>;
  derFallbackStatusCodes?: number[];
  authToken?: string;
  dryRun?: boolean;
  defaultChargingProfileId?: number;
  resolveChargingProfileId?: (stationId: string) => number;
}

export type OcppDynamicSchedulePublisherRuntimeOptions = Partial<
  Pick<OcppDynamicSchedulePublisherOptions, 'dryRun' | 'defaultChargingProfileId' | 'authToken'>
>;

interface UpdateDynamicSchedulePayload {
  identifier: string[];
  request: {
    chargingProfileId: number;
    scheduleUpdate: {
      operationMode: EmsStationControlTarget['operationMode'];
      limit?: number;
      dischargeLimit?: number;
    };
  };
}

export class OcppDynamicSchedulePublisher implements ICitrineControlPublisher {
  private readonly dynamicScheduleEndpointPath: string;
  private readonly defaultChargingProfileId: number;
  private readonly derEndpointPaths: Record<EmsDerControlAction['action'], string[]>;
  private readonly derFallbackStatusCodes: Set<number>;
  private runtimeOptions: OcppDynamicSchedulePublisherRuntimeOptions;

  private static readonly defaultDerEndpointPaths: Record<EmsDerControlAction['action'], string[]> = {
    SetDefaultControl: ['/ocpp/2.1/der/setDefaultControl', '/commands/der/setDefaultControl'],
    SetTargetPower: ['/ocpp/2.1/der/setDERControl', '/commands/der/setTargetPower'],
    ApplyGridCodePolicy: ['/ocpp/2.1/der/setDERControl', '/commands/der/applyGridCodePolicy'],
  };

  constructor(private readonly options: OcppDynamicSchedulePublisherOptions) {
    this.dynamicScheduleEndpointPath =
      options.dynamicScheduleEndpointPath ?? '/ocpp/2.1/smartcharging/updateDynamicSchedule';
    this.defaultChargingProfileId = options.defaultChargingProfileId ?? 1001;
    this.derEndpointPaths = {
      SetDefaultControl:
        options.derEndpointPaths?.SetDefaultControl ??
        OcppDynamicSchedulePublisher.defaultDerEndpointPaths.SetDefaultControl,
      SetTargetPower:
        options.derEndpointPaths?.SetTargetPower ??
        OcppDynamicSchedulePublisher.defaultDerEndpointPaths.SetTargetPower,
      ApplyGridCodePolicy:
        options.derEndpointPaths?.ApplyGridCodePolicy ??
        OcppDynamicSchedulePublisher.defaultDerEndpointPaths.ApplyGridCodePolicy,
    };
    this.derFallbackStatusCodes = new Set(options.derFallbackStatusCodes ?? [404, 405, 501]);
    this.runtimeOptions = {
      dryRun: options.dryRun,
      defaultChargingProfileId: options.defaultChargingProfileId,
      authToken: options.authToken,
    };
  }

  updateRuntimeOptions(options: OcppDynamicSchedulePublisherRuntimeOptions): void {
    this.runtimeOptions = {
      ...this.runtimeOptions,
      ...options,
    };
  }

  async publish(plan: EmsControlPlan): Promise<void> {
    for (const target of plan.stationTargets) {
      if (!this.hasScheduleContent(target)) {
        continue;
      }

      if (this.isDryRun()) {
        continue;
      }

      const payload = this.buildSchedulePayload(target);
      const response = await this.postJson(this.dynamicScheduleEndpointPath, payload);

      if (!response.ok) {
        const details = await response.text();
        throw new Error(
          `Failed to publish schedule update for station ${target.stationId}: ${response.status} ${details}`,
        );
      }
    }

    for (const action of plan.derActions) {
      if (this.isDryRun()) {
        continue;
      }

      await this.publishDerAction(action);
    }
  }

  private urlWithTenant(endpointPath: string): string {
    const base = this.options.baseUrl.replace(/\/$/, '');
    return `${base}${endpointPath}?tenantId=${this.options.tenantId}`;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    const authToken = this.runtimeOptions.authToken ?? this.options.authToken;
    if (authToken) {
      headers.authorization = `Bearer ${authToken}`;
    }

    return headers;
  }

  private buildSchedulePayload(target: EmsStationControlTarget): UpdateDynamicSchedulePayload {
    const chargingProfileId = this.options.resolveChargingProfileId
      ? this.options.resolveChargingProfileId(target.stationId)
      : this.runtimeOptions.defaultChargingProfileId ?? this.defaultChargingProfileId;

    return {
      identifier: [target.stationId],
      request: {
        chargingProfileId,
        scheduleUpdate: {
          operationMode: target.operationMode,
          limit: target.chargeLimitW,
          dischargeLimit: target.dischargeLimitW,
        },
      },
    };
  }

  private hasScheduleContent(target: EmsStationControlTarget): boolean {
    return (
      typeof target.chargeLimitW === 'number' ||
      typeof target.dischargeLimitW === 'number' ||
      target.operationMode === 'Idle'
    );
  }

  private async publishDerAction(action: EmsDerControlAction): Promise<void> {
    const candidatePaths = this.derEndpointPaths[action.action];
    let lastError: string | undefined;

    for (const endpointPath of candidatePaths) {
      const payload = {
        identifier: [action.stationId],
        request: action.parameters,
      };

      const response = await this.postJson(endpointPath, payload);
      if (response.ok) {
        return;
      }

      const details = await response.text();
      lastError = `${response.status} ${details}`;
      if (!this.derFallbackStatusCodes.has(response.status)) {
        throw new Error(
          `Failed to publish DER action ${action.action} for station ${action.stationId}: ${lastError}`,
        );
      }
    }

    throw new Error(
      `No DER endpoint accepted action ${action.action} for station ${action.stationId}: ${lastError ?? 'unknown error'}`,
    );
  }

  private postJson(endpointPath: string, payload: unknown): Promise<Response> {
    return fetch(this.urlWithTenant(endpointPath), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  private isDryRun(): boolean {
    return this.runtimeOptions.dryRun ?? this.options.dryRun ?? false;
  }
}
