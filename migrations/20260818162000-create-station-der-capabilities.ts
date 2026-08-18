// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

import { DataTypes, QueryInterface } from 'sequelize';

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

    await queryInterface.addConstraint('StationDerCapabilities', {
      fields: ['tenantId', 'stationId'],
      type: 'unique',
      name: 'StationDerCapabilities_tenantId_stationId',
    });

    await queryInterface.addIndex('StationDerCapabilities', ['stationId'], {
      name: 'StationDerCapabilities_stationId',
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('StationDerCapabilities');
  },
};
