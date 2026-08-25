// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

import { DataTypes, QueryInterface } from 'sequelize';

const isAlreadyExistsError = (error: unknown): boolean => {
  const candidate = error as
    | {
        message?: unknown;
        original?: { message?: unknown; code?: unknown };
        parent?: { message?: unknown; code?: unknown };
      }
    | undefined;

  const messages = [candidate?.message, candidate?.original?.message, candidate?.parent?.message]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
  const codes = [candidate?.original?.code, candidate?.parent?.code]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toUpperCase());

  return (
    codes.includes('42P07') ||
    codes.includes('42710') ||
    messages.some((message) =>
      message.includes('already exists') ||
      message.includes('duplicate') ||
      message.includes('relation "stationdercapabilities_tenantid_stationid"'),
    )
  );
};

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('StationDerCapabilities', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      stationId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      supportedControlTypesJson: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      snapshotJson: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      requestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      tbc: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      deviceModelSnapshotJson: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      tenantId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Tenants',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    });

    try {
      await queryInterface.addConstraint('StationDerCapabilities', {
        fields: ['tenantId', 'stationId'],
        type: 'unique',
        name: 'StationDerCapabilities_tenantId_stationId',
      });
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }

    try {
      await queryInterface.addIndex('StationDerCapabilities', ['stationId'], {
        name: 'StationDerCapabilities_stationId',
      });
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('StationDerCapabilities');
  },
};
