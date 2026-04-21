module.exports = (sequelize, DataTypes) => {
  const LiveSession = sequelize.define(
    'LiveSession',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      kurs_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      egitmen_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      baslik: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      aciklama: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      baslangic_tarihi: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      sure_dakika: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
      },
      jitsi_oda_adi: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      durum: {
        type: DataTypes.ENUM('planlandi', 'devam_ediyor', 'tamamlandi', 'iptal'),
        allowNull: false,
        defaultValue: 'planlandi',
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'canli_oturumlar',
      indexes: [
        { fields: ['kurs_id'] },
        { fields: ['egitmen_id'] },
        { fields: ['baslangic_tarihi'] },
      ],
    }
  );

  return LiveSession;
};
