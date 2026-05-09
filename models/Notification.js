module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      kullanici_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      baslik: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      icerik: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      tip: {
        type: DataTypes.ENUM('yeni_kurs', 'canli_yayin', 'sistem'),
        allowNull: false,
        defaultValue: 'sistem',
      },
      okundu_mu: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      hedef_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      // Sequelize'in default createdAt'ini Turkce kolon adimiza map'liyoruz.
      // updatedAt kullanmiyoruz; bildirim icerigini retro-aktif degistirmiyoruz.
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'bildirimler',
      timestamps: true,
      createdAt: 'olusturulma_tarihi',
      updatedAt: false,
      indexes: [
        { fields: ['kullanici_id'] },
        { fields: ['kullanici_id', 'okundu_mu'] },
      ],
    }
  );

  return Notification;
};
