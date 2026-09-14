// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

import { DataTypes, QueryInterface } from 'sequelize';

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('StationEnergyTransferPolicies', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      stationId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      transactionId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      allowedModesJson: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      exportEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      dischargeLimitW: {
        type: DataTypes.INTEGER,
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

    await queryInterface.addConstraint('StationEnergyTransferPolicies', {
      fields: ['tenantId', 'stationId', 'transactionId'],
      type: 'unique',
      name: 'StationEnergyTransferPolicies_tenantId_stationId_transactionId',
    });

    await queryInterface.addIndex('StationEnergyTransferPolicies', ['stationId'], {
      name: 'StationEnergyTransferPolicies_stationId',
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('StationEnergyTransferPolicies');
  },
};
