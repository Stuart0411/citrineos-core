// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

import { DataTypes, QueryInterface } from 'sequelize';

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('DerControls', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      stationId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      controlId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      controlType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      payloadJson: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      durationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      isSuperseded: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      supersededByControlId: {
        type: DataTypes.STRING,
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

    await queryInterface.addIndex('DerControls', ['stationId'], {
      name: 'DerControls_stationId',
    });

    await queryInterface.addIndex('DerControls', ['controlId'], {
      name: 'DerControls_controlId',
    });

    await queryInterface.addIndex('DerControls', ['tenantId', 'stationId', 'controlId'], {
      unique: true,
      name: 'DerControls_tenant_station_control_unique',
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('DerControls');
  },
};
