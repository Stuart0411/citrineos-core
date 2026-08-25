// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

import { DataTypes, QueryInterface } from 'sequelize';

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn('ChargingProfiles', 'dynUpdateInterval', {
      type: DataTypes.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('ChargingProfiles', 'dynUpdateTime', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn('ChargingProfiles', 'dynUpdateInterval');
    await queryInterface.removeColumn('ChargingProfiles', 'dynUpdateTime');
  },
};