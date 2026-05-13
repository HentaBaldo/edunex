module.exports = (sequelize, DataTypes) => {
  const InstructorDetail = sequelize.define(
    'InstructorDetail',
    {
      kullanici_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      unvan: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      deneyim_yili: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      iban_no: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      baslik: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      biyografi: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      submerchant_key: {
        // iyzico Pazaryeri (Marketplace) modelinde eğitmenin Alt Üye İşyeri kimliği.
        // Ödeme sırasında basket item üzerinde gönderilir; havuzdaki para bu key ile eğitmene yansıtılır.
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: 'egitmen_detaylari',
      timestamps: false
    }
  );

  return InstructorDetail;
};

