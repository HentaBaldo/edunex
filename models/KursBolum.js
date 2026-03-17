const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const KursBolum = sequelize.define('KursBolum', {
    id: {
        type: DataTypes.STRING(36),
        primaryKey: true
    },
    kurs_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        references: {
            model: 'kurslar',
            key: 'id'
        }
    },
    baslik: {
        type: DataTypes.STRING,
        allowNull: false
    },
    sira_numarasi: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    }
}, {
    tableName: 'kurs_bolumleri',
    timestamps: false
});

module.exports = KursBolum;
