// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { IEmsAllocationStrategy } from '../interfaces/i-ems-allocation-strategy.js';
import type {
  EmsControlPlan,
  EmsStationControlTarget,
  EmsStationSnapshot,
} from '../contracts/ems-control-plan.js';
import type { EmsSiteIntent } from '../contracts/ems-site-intent.js';

export class EqualShareAllocationStrategy implements IEmsAllocationStrategy {
  allocate(intent: EmsSiteIntent, stations: EmsStationSnapshot[]): EmsStationControlTarget[] {
    const onlineStations = stations.filter((station) => station.online);
    if (onlineStations.length === 0) {
      return [];
    }

    const chargeBudget = Math.max(0, intent.constraints.evChargeBudgetW ?? 0);
    const dischargeBudget = Math.max(0, intent.constraints.evDischargeBudgetW ?? 0);

    const perStationCharge = chargeBudget > 0 ? chargeBudget / onlineStations.length : 0;
    const perStationDischarge = dischargeBudget > 0 ? dischargeBudget / onlineStations.length : 0;

    return onlineStations.map((station) => {
      const chargeLimitW =
        perStationCharge > 0
          ? Math.min(perStationCharge, station.maxChargeW ?? perStationCharge)
          : undefined;
      const dischargeLimitW =
        perStationDischarge > 0 && station.supportsV2x
          ? Math.min(perStationDischarge, station.maxDischargeW ?? perStationDischarge)
          : undefined;

      return {
        stationId: station.stationId,
        evseId: 0,
        operationMode: intent.operationMode,
        chargeLimitW,
        dischargeLimitW,
      };
    });
  }

  buildPlan(intent: EmsSiteIntent, stationTargets: EmsStationControlTarget[]): EmsControlPlan {
    return {
      siteId: intent.siteId,
      tenantId: intent.tenantId,
      createdAt: new Date().toISOString(),
      intentTimestamp: intent.timestamp,
      stationTargets,
      derActions: [],
    };
  }
}
