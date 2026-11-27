// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { EmsStationSnapshot } from '../contracts/ems-control-plan.js';

export interface EmsAddonRuntimeConfig {
  httpHost: string;
  httpPort: number;
  enableRestartEndpoint: boolean;
  enableRestIngress: boolean;
  enableMqttIngress: boolean;
  mqttBrokerUrl: string;
  mqttTopicPrefix: string;
  defaultSiteId: string;
  defaultTenantId: number;
  stationSnapshots: EmsStationSnapshot[];
  dryRun: boolean;
  citrineBaseUrl: string;
  citrineTenantId: number;
  citrineAuthToken?: string;
  defaultChargingProfileId: number;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): EmsAddonRuntimeConfig {
  const defaultSiteId = env.EMS_ADDON_DEFAULT_SITE_ID ?? 'site-default';
  const defaultTenantId = parseIntWithDefault(env.EMS_ADDON_DEFAULT_TENANT_ID, 1);

  return {
    httpHost: env.EMS_ADDON_HTTP_HOST ?? '0.0.0.0',
    httpPort: parseIntWithDefault(env.EMS_ADDON_HTTP_PORT, 8095),
    enableRestartEndpoint: parseBooleanWithDefault(env.EMS_ADDON_ENABLE_RESTART_ENDPOINT, false),
    enableRestIngress: parseBooleanWithDefault(env.EMS_ADDON_ENABLE_REST_INGRESS, true),
    enableMqttIngress: parseBooleanWithDefault(env.EMS_ADDON_ENABLE_MQTT_INGRESS, false),
    mqttBrokerUrl: env.EMS_ADDON_MQTT_BROKER_URL ?? 'mqtt://localhost:1883',
    mqttTopicPrefix: env.EMS_ADDON_MQTT_TOPIC_PREFIX ?? 'ems/site',
    defaultSiteId,
    defaultTenantId,
    stationSnapshots: parseStationSnapshots(env, defaultTenantId),
    dryRun: parseBooleanWithDefault(env.EMS_ADDON_DRY_RUN, true),
    citrineBaseUrl: env.EMS_ADDON_CITRINE_BASE_URL ?? 'http://localhost:8080',
    citrineTenantId: parseIntWithDefault(env.EMS_ADDON_CITRINE_TENANT_ID, defaultTenantId),
    citrineAuthToken: parseOptionalString(env.EMS_ADDON_CITRINE_AUTH_TOKEN),
    defaultChargingProfileId: parseIntWithDefault(env.EMS_ADDON_DEFAULT_CHARGING_PROFILE_ID, 1001),
  };
}

function parseStationSnapshots(
  env: NodeJS.ProcessEnv,
  _defaultTenantId: number,
): EmsStationSnapshot[] {
  const fromJson = parseStationSnapshotsJson(env.EMS_ADDON_STATION_SNAPSHOTS_JSON);
  if (fromJson.length > 0) {
    return fromJson;
  }

  const stationIds = (env.EMS_ADDON_DEFAULT_STATION_IDS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (stationIds.length === 0) {
    return [];
  }

  const supportsV2x = parseBooleanWithDefault(env.EMS_ADDON_DEFAULT_STATION_SUPPORTS_V2X, false);
  const maxChargeW = parseOptionalNumber(env.EMS_ADDON_DEFAULT_MAX_CHARGE_W);
  const maxDischargeW = parseOptionalNumber(env.EMS_ADDON_DEFAULT_MAX_DISCHARGE_W);

  return stationIds.map((stationId) => ({
    stationId,
    online: true,
    supportsV2x,
    maxChargeW,
    maxDischargeW,
  }));
}

function parseStationSnapshotsJson(value?: string): EmsStationSnapshot[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is EmsStationSnapshot => {
        return (
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { stationId?: unknown }).stationId === 'string' &&
          typeof (item as { online?: unknown }).online === 'boolean' &&
          typeof (item as { supportsV2x?: unknown }).supportsV2x === 'boolean'
        );
      })
      .map((item) => ({
        stationId: item.stationId,
        online: item.online,
        supportsV2x: item.supportsV2x,
        maxChargeW: item.maxChargeW,
        maxDischargeW: item.maxDischargeW,
      }));
  } catch {
    return [];
  }
}

function parseIntWithDefault(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanWithDefault(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseOptionalNumber(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalString(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
