'use strict';

const { ORDER_ITEM_TABLE } = require('../models/order_items.model');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn(ORDER_ITEM_TABLE, 'unit_price', {
      allowNull: false,
      type: Sequelize.DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn(ORDER_ITEM_TABLE, 'unit_price');
  }
};
