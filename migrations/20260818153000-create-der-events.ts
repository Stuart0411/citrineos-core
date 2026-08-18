// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

import { DataTypes, QueryInterface } from 'sequelize';

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('DerEvents', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      stationId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      eventType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      controlId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      payloadJson: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      occurredAt: {
        type: DataTypes.DATE,
        allowNull: false,
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

    await queryInterface.addIndex('DerEvents', ['stationId'], {
      name: 'DerEvents_stationId',
    });

    await queryInterface.addIndex('DerEvents', ['eventType'], {
      name: 'DerEvents_eventType',
    });

    await queryInterface.addIndex('DerEvents', ['controlId'], {
      name: 'DerEvents_controlId',
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('DerEvents');
  },
};
