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
    },
    {
      tableName: 'egitmen_detaylari',
    }
  );

  return InstructorDetail;
};

