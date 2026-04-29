module.exports = (sequelize, DataTypes) => {
  const QuizQuestion = sequelize.define(
    'QuizQuestion',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      quiz_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      soru_metni: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      sira: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      soru_tipi: {
        type: DataTypes.ENUM('coktan_secmeli', 'dogru_yanlis'),
        allowNull: false,
        defaultValue: 'coktan_secmeli',
      },
    },
    {
      tableName: 'quiz_sorulari',
      timestamps: false,
      indexes: [{ fields: ['quiz_id'] }],
    }
  );
  return QuizQuestion;
};
