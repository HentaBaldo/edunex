const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Profil = sequelize.define('Profil', {
    id: {
        type: DataTypes.STRING(36),
        primaryKey: true
    },
    ad: {
        type: DataTypes.STRING,
        allowNull: false
    },
    soyad: {
        type: DataTypes.STRING,
        allowNull: false
    },
    eposta: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    sifre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    rol: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'ogrenci'
    },
    sehir: {
        type: DataTypes.STRING,
        allowNull: true
    },
    profil_fotografi: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'profiller',
    timestamps: false
});

module.exports = Profil;