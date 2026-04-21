module.exports = (sequelize, DataTypes) => {
  const PaymentTransaction = sequelize.define(
    'PaymentTransaction',
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
      saglayici: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'iyzico',
      },
      islem_tipi: {
        type: DataTypes.ENUM('initialize', 'retrieve', 'callback', 'refund'),
        allowNull: false,
      },
      conversation_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      payment_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      odeme_token: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      durum: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      hata_kodu: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      hata_mesaji: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      ham_yanit: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'odeme_islemleri',
      indexes: [
        { fields: ['siparis_id'] },
        { fields: ['conversation_id'] },
        { fields: ['payment_id'] },
      ],
    }
  );

  return PaymentTransaction;
};
