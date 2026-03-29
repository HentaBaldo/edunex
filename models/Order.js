module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define(
    'Order',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      kullanici_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      toplam_tutar: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      para_birimi: {
        type: DataTypes.STRING(3),
        allowNull: true,
        defaultValue: 'TRY',
      },
      durum: {
        type: DataTypes.ENUM(
          'beklemede',
          'tamamlandi',
          'basarisiz',
          'iade_edildi'
        ),
        allowNull: true,
        defaultValue: 'beklemede',
      },
      islem_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'siparisler',
      indexes: [{ fields: ['kullanici_id'] }],
    }
  );

  return Order;
};

