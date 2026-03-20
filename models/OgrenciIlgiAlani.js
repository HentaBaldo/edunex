const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const OgrenciIlgiAlani = sequelize.define('OgrenciIlgiAlani', {
    
    ogrenci_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        references: {
            model: 'profiller',
            key: 'id'
        }
    },
    kategori_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'kategoriler',
            key: 'id'
        }
    }
}, {
    tableName: 'ogrenci_ilgi_alanlari',
    timestamps: false
});

module.exports = OgrenciIlgiAlani;
