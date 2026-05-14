module.exports = (sequelize, DataTypes) => {
  const SupportMessage = sequelize.define(
    'SupportMessage',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // Bagli oldugu ticket
      talep_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      // Mesaji yazan kullanici (admin veya talep sahibi). Profile.id.
      gonderen_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      mesaj: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      okundu_mu: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'destek_mesajlari',
      timestamps: false,
      indexes: [
        { fields: ['talep_id'] },
        { fields: ['gonderen_id'] },
        { fields: ['talep_id', 'okundu_mu'] },
      ],
    }
  );

  return SupportMessage;
};
