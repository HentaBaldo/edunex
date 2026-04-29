module.exports = (sequelize, DataTypes) => {
  const QuizAnswer = sequelize.define(
    'QuizAnswer',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      deneme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      soru_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      secilen_secenek_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'NULL = soru atlandı.',
      },
    },
    {
      tableName: 'quiz_cevaplari',
      timestamps: false,
      indexes: [{ fields: ['deneme_id'] }],
    }
  );
  return QuizAnswer;
};
