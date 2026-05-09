module.exports = (sequelize, DataTypes) => {
  const InstructorFollower = sequelize.define(
    'InstructorFollower',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      ogrenci_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      egitmen_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      tableName: 'egitmen_takipcileri',
      indexes: [
        { unique: true, fields: ['ogrenci_id', 'egitmen_id'] },
        { fields: ['egitmen_id'] },
      ],
    }
  );

  return InstructorFollower;
};
