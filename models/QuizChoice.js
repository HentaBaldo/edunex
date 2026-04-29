module.exports = (sequelize, DataTypes) => {
  const QuizChoice = sequelize.define(
    'QuizChoice',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      soru_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      secenek_metni: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      dogru_mu: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Öğrenciye asla gönderilmez; sadece backend grading için.',
      },
      sira: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
    },
    {
      tableName: 'quiz_secenekleri',
      indexes: [{ fields: ['soru_id'] }],
    }
  );
  return QuizChoice;
};
