// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

import { DataTypes, QueryInterface } from 'sequelize';

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('EmsSiteIntents', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      messageId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      siteId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      source: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      intentCreatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      mode: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      constraints: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      flags: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      reason: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      metadata: {
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

    await queryInterface.addConstraint('EmsSiteIntents', {
      fields: ['tenantId', 'messageId'],
      type: 'unique',
      name: 'EmsSiteIntents_tenantId_messageId',
    });

    await queryInterface.addIndex('EmsSiteIntents', ['siteId'], {
      name: 'EmsSiteIntents_siteId',
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('EmsSiteIntents');
  },
};