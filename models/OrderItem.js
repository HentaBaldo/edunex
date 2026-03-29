module.exports = (sequelize, DataTypes) => {
  const OrderItem = sequelize.define(
    'OrderItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      siparis_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      kurs_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      odenen_fiyat: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
    },
    {
      tableName: 'siparis_kalemleri',
      indexes: [{ fields: ['siparis_id'] }, { fields: ['kurs_id'] }],
    }
  );

  return OrderItem;
};

