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
    },
    {
      tableName: 'egitmen_hakedisleri',
      indexes: [{ fields: ['egitmen_id'] }, { fields: ['siparis_kalemi_id'] }],
    }
  );

  return InstructorEarning;
};

