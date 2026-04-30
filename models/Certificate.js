module.exports = (sequelize, DataTypes) => {
  const Certificate = sequelize.define(
    'Certificate',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      kayit_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      sertifika_kodu: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      verilis_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      pdf_yolu: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: 'sertifikalar'
    }
  );

  return Certificate;
};

