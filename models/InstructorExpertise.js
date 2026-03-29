module.exports = (sequelize, DataTypes) => {
  const InstructorExpertise = sequelize.define(
    'InstructorExpertise',
    {
      egitmen_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      kategori_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
    },
    {
      tableName: 'egitmen_uzmanliklari',
      indexes: [{ fields: ['kategori_id'] }],
    }
  );

  return InstructorExpertise;
};

