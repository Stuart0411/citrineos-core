// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { Sequelize } from 'sequelize-typescript';
import type { BootstrapConfig } from '@citrineos/base';
import { DEFAULT_TENANT_ID, OCPP2_1 } from '@citrineos/base';
import {
  ChargingStation,
  Component,
  DefaultSequelizeInstance,
  SequelizeVariableMonitoringRepository,
  Tenant,
  Variable,
} from '@dal/index.js';

const TENANT_ID = DEFAULT_TENANT_ID;
const STATION_ID = 'CS-001';

let pgContainer: StartedTestContainer;
let sequelizeInstance: Sequelize;

beforeAll(async () => {
  pgContainer = await new GenericContainer('postgis/postgis:16-3.4-alpine')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'citrineos_test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
    .start();

  const dbConfig = {
    database: {
      host: pgContainer.getHost(),
      port: pgContainer.getMappedPort(5432),
      database: 'citrineos_test',
      dialect: 'postgres',
      username: 'test',
      password: 'test',
      sync: false,
      alter: false,
      force: false,
      maxRetries: 1,
      retryDelay: 100,
    },
  } as unknown as BootstrapConfig;

  sequelizeInstance = DefaultSequelizeInstance.getInstance(dbConfig);
  await sequelizeInstance.query('CREATE EXTENSION IF NOT EXISTS citext;');
  await sequelizeInstance.sync({ force: true });
}, 90_000);

afterAll(async () => {
  await sequelizeInstance.close();
  await pgContainer.stop();
});

beforeEach(async () => {
  await sequelizeInstance.truncate({ cascade: true, restartIdentity: true });
});

function makeRepository(): SequelizeVariableMonitoringRepository {
  return new SequelizeVariableMonitoringRepository(
    {} as BootstrapConfig,
    undefined,
    sequelizeInstance,
  );
}

async function seedBase(): Promise<{ component: Component; variable: Variable }> {
  await Tenant.create({ id: TENANT_ID as any });
  await ChargingStation.create({ id: STATION_ID, isOnline: false, tenantId: TENANT_ID });

  const component = await Component.create({
    name: 'Connector',
    instance: '1',
    tenantId: TENANT_ID,
  });
  const variable = await Variable.create({
    name: 'Current.Import',
    instance: null,
    tenantId: TENANT_ID,
  });

  return { component, variable };
}

describe('SequelizeVariableMonitoringRepository EventData idempotency', () => {
  it('updates an existing event row when the same station and eventId arrive twice', async () => {
    const repository = makeRepository();
    const { component, variable } = await seedBase();

    const firstEvent: OCPP2_1.EventDataType = {
      eventId: 42,
      timestamp: '2026-08-18T01:00:00.000Z',
      trigger: OCPP2_1.EventTriggerEnumType.Alerting,
      actualValue: '16',
      component: { name: 'Connector', instance: '1' },
      variable: { name: 'Current.Import' },
      eventNotificationType: OCPP2_1.EventNotificationEnumType.HardWiredMonitor,
    };

    const secondEvent: OCPP2_1.EventDataType = {
      ...firstEvent,
      timestamp: '2026-08-18T01:00:05.000Z',
      actualValue: '24',
      techInfo: 'updated-value',
      cleared: true,
    };

    const created = await repository.createEventDatumByComponentIdAndVariableIdAndStationId(
      TENANT_ID,
      firstEvent,
      component.id.toString(),
      variable.id.toString(),
      STATION_ID,
    );

    const updated = await repository.createEventDatumByComponentIdAndVariableIdAndStationId(
      TENANT_ID,
      secondEvent,
      component.id.toString(),
      variable.id.toString(),
      STATION_ID,
    );

    const rows = (await sequelizeInstance.models.EventData.findAll({
      where: {
        tenantId: TENANT_ID,
        stationId: STATION_ID,
        eventId: firstEvent.eventId,
      },
    })) as unknown as Array<{
      id: number;
      actualValue: string;
      techInfo?: string;
      cleared: boolean;
      timestamp: string;
    }>;

    expect(rows).toHaveLength(1);
    expect(updated.id).toBe(created.id);
    expect(rows[0].actualValue).toBe('24');
    expect(rows[0].techInfo).toBe('updated-value');
    expect(rows[0].cleared).toBe(true);
    expect(rows[0].timestamp).toBe('2026-08-18T01:00:05.000Z');
  });
});
