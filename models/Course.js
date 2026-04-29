module.exports = (sequelize, DataTypes) => {
  const Course = sequelize.define(
    'Course',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      egitmen_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      kategori_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      baslik: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      alt_baslik: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: '',
      },
      dil: {
        type: DataTypes.ENUM('Turkce', 'Ingilizce'),
        allowNull: true,
        defaultValue: 'Turkce',
      },
      seviye: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: 'Baslangic',
      },
      aciklama: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      gereksinimler: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      fiyat: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      durum: {
        type: DataTypes.ENUM('taslak', 'onay_bekliyor', 'onaylandi', 'yayinda', 'arsiv'),
        allowNull: false,
        defaultValue: 'taslak',
        comment: 'Kurs durumu: taslak (taslak), onay_bekliyor (yönetici onayını bekliyor), onaylandi (onaylanmış), yayinda (yayında), arsiv (arşiv)'
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      kazanimlar: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      son_duzenleme_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Mufredat veya kurs meta verisi son ne zaman degistirildi.'
      },
      onaydan_sonra_duzenlendi_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Onay/yayin durumundayken duzenleme yapildi mi (admin paneline rozet basmak icin).'
      },
      // --- Soft-delete (admin tarafindan) ---
      silindi_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Admin tarafindan soft-delete edildi mi. Tum ogrenci/magaza endpointlerinde filtrelenir.'
      },
      silinme_tarihi: {
        type: DataTypes.DATE,
        allowNull: true
      },
      silen_admin_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      silme_sebebi: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // --- Yayindan kaldirilip taslaga iade (admin tarafindan) ---
      admin_tarafindan_iade_edildi: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Admin yayindan kaldirip taslaga geri yolladi mi. Egitmen UIda kirmizi banner ile gosterilir.'
      },
      iade_tarihi: {
        type: DataTypes.DATE,
        allowNull: true
      },
      iade_eden_admin_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      iade_sebebi: {
        type: DataTypes.TEXT,
        allowNull: true
      },
    },
    {
      tableName: 'kurslar',
      indexes: [
        { fields: ['egitmen_id'] },
        { fields: ['kategori_id'] },
        { fields: ['durum'] },
      ],
    }
  );

  return Course;
};