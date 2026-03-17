const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Kategori = sequelize.define('Kategori', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    ad: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ust_kategori_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'kategoriler',
            key: 'id'
        }
    }
}, {
    tableName: 'kategoriler',
    timestamps: false
});

Kategori.hasMany(Kategori, { foreignKey: 'ust_kategori_id', as: 'altKategoriler' });
Kategori.belongsTo(Kategori, { foreignKey: 'ust_kategori_id', as: 'ustKategori' });

module.exports = Kategori;
