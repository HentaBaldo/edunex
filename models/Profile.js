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
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: 'ogrenci',
      },
      sehir: {
        type: DataTypes.STRING(255),
        allowNull: true,
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
    },
    {
      tableName: 'profiller',
      indexes: [{ unique: true, fields: ['eposta'] }],
    }
  );

  return Profile;
};

