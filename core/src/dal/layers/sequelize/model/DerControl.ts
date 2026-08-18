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
export class DerControl extends Model {
  static readonly MODEL_NAME: string = Namespace.DerControl;

  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Index
  @Column({ type: DataType.STRING, allowNull: false })
  declare stationId: string;

  @Index
  @Column({ type: DataType.STRING, allowNull: false })
  declare controlId: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare controlType: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isDefault: boolean;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare priority?: number | null;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare payloadJson: Record<string, unknown>;

  @Column({ type: DataType.DATE, allowNull: true })
  declare startTime?: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare durationSeconds?: number | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare status?: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isSuperseded: boolean;

  @Column({ type: DataType.STRING, allowNull: true })
  declare supersededByControlId?: string | null;

  @ForeignKey(() => Tenant)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
  })
  declare tenantId: number;

  @BelongsTo(() => Tenant, 'tenantId')
  declare tenant?: TenantDto;

  @BeforeUpdate
  @BeforeCreate
  static setDefaultTenant(instance: DerControl) {
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
