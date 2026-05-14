module.exports = (sequelize, DataTypes) => {
  const SupportTicket = sequelize.define(
    'SupportTicket',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Talebi acan kullanici (egitmen veya ogrenci). Profile.id.
      kullanici_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      konu: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      // kurs_onay: egitmen tarafindan kurs redleri sonrasi acilan itiraz/aciklama talepleri icin.
      kategori: {
        type: DataTypes.ENUM('finans', 'teknik', 'kurs_onay', 'diger'),
        allowNull: false,
        defaultValue: 'diger',
      },
      // acik: yeni talep / kullanici son mesaji yazdi
      // cevaplandi: admin son mesaji yazdi, kullanici cevabi bekleniyor
      // kapali: admin talebi kapatti
      durum: {
        type: DataTypes.ENUM('acik', 'cevaplandi', 'kapali'),
        allowNull: false,
        defaultValue: 'acik',
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'destek_talepleri',
      timestamps: false,
      indexes: [
        { fields: ['kullanici_id'] },
        { fields: ['durum'] },
        { fields: ['kategori'] },
        { fields: ['olusturulma_tarihi'] },
      ],
    }
  );

  return SupportTicket;
};
