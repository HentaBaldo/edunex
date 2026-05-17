module.exports = (sequelize, DataTypes) => {
  const InstructorEarning = sequelize.define(
    'InstructorEarning',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      egitmen_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      siparis_kalemi_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      brut_tutar: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      komisyon_orani: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
      },
      platform_kesintisi: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      net_tutar: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      para_birimi: {
        type: DataTypes.STRING(3),
        allowNull: true,
        defaultValue: 'TRY',
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      // --- Odeme yasam dongusu (T+14 iade kurali ile) ---
      // pending     : yeni olustu, 14 gunluk iade penceresi devam ediyor
      // available   : iade penceresi kapandi, odemeye uygun
      // processing  : admin toplu odeme akisina aldi, bankaya transfer bekleniyor
      // paid        : transfer tamamlandi, dekont no kaydedildi
      // cancelled   : iptal (iade vb. nedenle hakedis dustu)
      durum: {
        type: DataTypes.ENUM('pending', 'available', 'processing', 'paid', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      odeme_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Banka transferi tamamlandi olarak isaretlendigi an.',
      },
      islem_dekont_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Banka dekont / referans numarasi (manuel girilir).',
      },
      // 'paid' durumundaki bir kaydin nasil odendi:
      //   otomatik -> cron T+14 sonrasi VEYA admin'in standart available onayi
      //               (her ikisinde de iyzico approval normal akisi)
      //   manuel   -> admin 'Simdi Onayla' (T+14 oncesi pending override)
      //               VEYA admin 'manuel banka transferi' modu (iyzico bypass).
      // 'pending'/'available'/'processing'/'cancelled' kayitlar icin default
      // 'otomatik' tutulur; bilgisel olarak yalnizca 'paid' uzerinde anlamlidir.
      // 'cancelled' icin de mantiken degisken degil — sadece etiket icin tutuluyor.
      odeme_tipi: {
        type: DataTypes.ENUM('otomatik', 'manuel'),
        allowNull: false,
        defaultValue: 'otomatik',
        comment: 'paid durumunun nasil olustugunu belirler (otomatik=iyzico approval normal akis, manuel=admin override/banka transferi).',
      },
    },
    {
      tableName: 'egitmen_hakedisleri',
      indexes: [
        { fields: ['egitmen_id'] },
        { fields: ['siparis_kalemi_id'] },
        { fields: ['durum'] },
        { fields: ['durum', 'egitmen_id'] },
      ],
    }
  );

  return InstructorEarning;
};

