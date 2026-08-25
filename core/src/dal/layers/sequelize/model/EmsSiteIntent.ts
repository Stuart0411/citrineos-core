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
export class EmsSiteIntent extends Model {
  static readonly MODEL_NAME: string = Namespace.EmsSiteIntent;

  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({
    type: DataType.STRING,
    unique: 'tenantId_messageId',
  })
  declare messageId: string;

  @Index
  @Column(DataType.STRING)
  declare siteId: string;

  @Column(DataType.JSONB)
  declare source: Record<string, unknown>;

  @Column({
    type: DataType.DATE,
    get() {
      const intentCreatedAt: Date = this.getDataValue('intentCreatedAt');
      return intentCreatedAt ? intentCreatedAt.toISOString() : null;
    },
  })
  declare intentCreatedAt: string;

  @Column({
    type: DataType.DATE,
    get() {
      const expiresAt: Date = this.getDataValue('expiresAt');
      return expiresAt ? expiresAt.toISOString() : null;
    },
  })
  declare expiresAt: string;

  @Column(DataType.STRING)
  declare mode: string;

  @Column(DataType.JSONB)
  declare constraints: Record<string, unknown>;

  @Column(DataType.JSONB)
  declare flags: Record<string, unknown>;

  @Column(DataType.STRING)
  declare reason: string;

  @Column(DataType.JSONB)
  declare metadata?: Record<string, unknown> | null;

  @ForeignKey(() => Tenant)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onUpdate: 'CASCADE',
    onDelete: 'RESTRICT',
    unique: 'tenantId_messageId',
  })
  declare tenantId: number;

  @BelongsTo(() => Tenant, 'tenantId')
  declare tenant?: TenantDto;

  @BeforeUpdate
  @BeforeCreate
  static setDefaultTenant(instance: EmsSiteIntent) {
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