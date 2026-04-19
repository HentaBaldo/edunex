module.exports = (sequelize, DataTypes) => {
  const CartItem = sequelize.define(
    'CartItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      sepet_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      kurs_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      eklenme_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'sepet_kalemleri',
      indexes: [
        { unique: true, fields: ['sepet_id', 'kurs_id'] },
        { fields: ['kurs_id'] },
      ],
    }
  );

  return CartItem;
};
