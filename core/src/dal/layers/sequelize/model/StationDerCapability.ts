// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import type { TenantDto } from '@citrineos/base';
import { DEFAULT_TENANT_ID, Namespace } from '@citrineos/base';
import {
  AutoIncrement,
  BeforeCreate,
  BeforeUpdate,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Index,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Tenant } from './Tenant.js';

@Table
export class StationDerCapability extends Model {
  static readonly MODEL_NAME: string = Namespace.StationDerCapability;

  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Index
  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: 'tenantId_stationId',
  })
  declare stationId: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: [] })
  declare supportedControlTypesJson: string[];

  @Column({ type: DataType.JSONB, allowNull: false })
  declare snapshotJson: Record<string, unknown>;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare requestId: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare tbc: boolean;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare deviceModelSnapshotJson?: Record<string, unknown> | null;

  @ForeignKey(() => Tenant)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
    unique: 'tenantId_stationId',
  })
  declare tenantId: number;

  @BelongsTo(() => Tenant, 'tenantId')
  declare tenant?: TenantDto;

  @BeforeUpdate
  @BeforeCreate
  static setDefaultTenant(instance: StationDerCapability) {
    if (instance.tenantId == null) {
      instance.tenantId = DEFAULT_TENANT_ID;
    }
  }

  constructor(...args: any[]) {
    super(...args);
    if (this.tenantId == null) {
      this.tenantId = DEFAULT_TENANT_ID;
    }
  }
}
