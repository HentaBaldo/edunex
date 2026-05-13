module.exports = (sequelize, DataTypes) => {
  const Profile = sequelize.define(
    'Profile',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      ad: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      soyad: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      eposta: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      sifre: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      rol: {
        type: DataTypes.ENUM('ogrenci', 'egitmen', 'admin'),
        allowNull: false,
        defaultValue: 'ogrenci',
      },
      sehir: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: '+905000000000',
      },
      identity_number: {
        type: DataTypes.STRING(11),
        allowNull: true,
        defaultValue: '11111111111',
      },
      profil_fotografi: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      website: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      facebook: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      instagram: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      linkedin: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      tiktok: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      x_twitter: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      youtube: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      profil_herkese_acik_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      alinan_kurslari_goster: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      // --- Komuta Merkezi (Dashboard) icin yeni kayit / online takip kolonlari ---
      // sequelize.sync({ alter: true }) bunlari otomatik ALTER TABLE ile ekler.
      // Mevcut kayitlar icin NULL kalir; backfill icin app baslangicinda kontrol edilir.
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
        comment: 'Kullanici kayit tarihi (dashboard yeni-kayit feed icin).',
      },
      son_aktivite_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Son authenticate olunan istek zamani (dashboard online sayci icin, ~1 dk throttle).',
      },
      // --- Finans / Hakedis modulu icin ek yetkilendirme ---
      // rol='admin' olan herkes admin paneline erisir ama
      // Hakedis & Odemeler sayfasi sadece finans_yetkili=true olan adminlere acilir.
      // UPDATE profiller SET finans_yetkili=true WHERE id='<sizin id>' ile elle aktive edilir.
      finans_yetkili: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Sadece rol=admin + finans_yetkili=true olanlar payout sayfasina erisebilir.',
      },
    },
    {
      tableName: 'profiller',
    }
  );

  return Profile;
};