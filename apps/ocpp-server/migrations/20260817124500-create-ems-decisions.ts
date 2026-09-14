// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

import { DataTypes, QueryInterface } from 'sequelize';

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('EmsDecisions', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      siteId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stationId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      evseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      intentMessageId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      decisionType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      decisionJson: {
        type: DataTypes.JSONB,
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

    await queryInterface.addIndex('EmsDecisions', ['siteId'], {
      name: 'EmsDecisions_siteId',
    });

    await queryInterface.addIndex('EmsDecisions', ['stationId'], {
      name: 'EmsDecisions_stationId',
    });

    await queryInterface.addIndex('EmsDecisions', ['intentMessageId'], {
      name: 'EmsDecisions_intentMessageId',
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('EmsDecisions');
  },
};
