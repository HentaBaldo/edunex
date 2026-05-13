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
      iyzico_item_transaction_id: {
        // iyzico'nun her basket item icin urettigi takip numarasi.
        // Iade (refund) ve hakedis onay (approval) cagrilarinda kullanilir.
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      hakedis_durumu: {
        // Pazaryeri (marketplace) modelinde her kalemin yasam dongusu durumu.
        // beklemede: iade penceresi acik, para iyzico havuzunda
        // onaylandi: hakedis egitmene aktarildi (approval API)
        // iade_edildi: musteri iade aldi (refund API)
        type: DataTypes.ENUM('beklemede', 'onaylandi', 'iade_edildi'),
        allowNull: false,
        defaultValue: 'beklemede',
      },
    },
    {
      tableName: 'siparis_kalemleri',
      indexes: [
        { fields: ['siparis_id'] },
        { fields: ['kurs_id'] },
        { fields: ['hakedis_durumu'] },
      ],
    }
  );

  return OrderItem;
};

