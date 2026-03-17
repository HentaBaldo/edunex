const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const EgitmenDetay = sequelize.define('EgitmenDetay', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    kullanici_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true,
        references: {
            model: 'profiller',
            key: 'id'
        }
    },
    baslik: {
        type: DataTypes.STRING,
        allowNull: true
    },
    biyografi: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    unvan: {
        type: DataTypes.STRING,
        allowNull: true
    },
    deneyim_yili: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
    },
    iban_no: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'egitmen_detaylari',
    timestamps: false
});

module.exports = EgitmenDetay;
