const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Profile = require('./Profile')(sequelize, DataTypes);
const StudentDetail = require('./StudentDetail')(sequelize, DataTypes);
const InstructorDetail = require('./InstructorDetail')(sequelize, DataTypes);
const Category = require('./Category')(sequelize, DataTypes);
const Course = require('./Course')(sequelize, DataTypes);
const CourseSection = require('./CourseSection')(sequelize, DataTypes);
const Lesson = require('./Lesson')(sequelize, DataTypes);
const LessonProgress = require('./LessonProgress')(sequelize, DataTypes);
const Order = require('./Order')(sequelize, DataTypes);
const OrderItem = require('./OrderItem')(sequelize, DataTypes);
const CourseEnrollment = require('./CourseEnrollment')(sequelize, DataTypes);
const Certificate = require('./Certificate')(sequelize, DataTypes);
const Review = require('./Review')(sequelize, DataTypes);
const InstructorEarning = require('./InstructorEarning')(sequelize, DataTypes);
const InstructorExpertise = require('./InstructorExpertise')(sequelize, DataTypes);
const StudentInterest = require('./StudentInterest')(sequelize, DataTypes);
const Cart = require('./Cart')(sequelize, DataTypes);
const CartItem = require('./CartItem')(sequelize, DataTypes);
const PaymentTransaction = require('./PaymentTransaction')(sequelize, DataTypes);

// --- PROFİL İLİŞKİLERİ ---
Profile.hasOne(StudentDetail, { foreignKey: 'kullanici_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
StudentDetail.belongsTo(Profile, { foreignKey: 'kullanici_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

Profile.hasOne(InstructorDetail, { foreignKey: 'kullanici_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
InstructorDetail.belongsTo(Profile, { foreignKey: 'kullanici_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

// --- KATEGORİ İLİŞKİLERİ ---
Category.belongsTo(Category, { as: 'parent', foreignKey: 'ust_kategori_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
Category.hasMany(Category, { as: 'children', foreignKey: 'ust_kategori_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' });

// --- KURS & EĞİTMEN İLİŞKİLERİ ---
InstructorDetail.hasMany(Course, { foreignKey: 'egitmen_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Course.belongsTo(InstructorDetail, { foreignKey: 'egitmen_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

// BURASI KRİTİK: Controller'da "as: 'Egitmen'" dediğimiz için buraya ekledik
Course.belongsTo(Profile, { 
  as: 'Egitmen', 
  foreignKey: 'egitmen_id', 
  constraints: false 
});

Category.hasMany(Course, { foreignKey: 'kategori_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Course.belongsTo(Category, { foreignKey: 'kategori_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

// --- MÜFREDAT İLİŞKİLERİ (EN ÖNEMLİ KISIM) ---

// Kurs -> Bölüm (as: 'Sections' eklendi)
Course.hasMany(CourseSection, { 
  as: 'Sections', 
  foreignKey: 'kurs_id', 
  onDelete: 'CASCADE', 
  onUpdate: 'CASCADE' 
});
CourseSection.belongsTo(Course, { foreignKey: 'kurs_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

// Bölüm -> Ders (as: 'Lessons' eklendi)
CourseSection.hasMany(Lesson, { 
  as: 'Lessons', 
  foreignKey: 'bolum_id', 
  onDelete: 'CASCADE', 
  onUpdate: 'CASCADE' 
});
Lesson.belongsTo(CourseSection, { foreignKey: 'bolum_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

// --- DİĞER İLİŞKİLER (Aynen Kalıyor) ---
StudentDetail.hasMany(LessonProgress, { foreignKey: 'ogrenci_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
LessonProgress.belongsTo(StudentDetail, { foreignKey: 'ogrenci_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

Lesson.hasMany(LessonProgress, { foreignKey: 'ders_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
LessonProgress.belongsTo(Lesson, { foreignKey: 'ders_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

Profile.hasMany(Order, { foreignKey: 'kullanici_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
Order.belongsTo(Profile, { foreignKey: 'kullanici_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' });

Order.hasMany(OrderItem, { foreignKey: 'siparis_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
OrderItem.belongsTo(Order, { foreignKey: 'siparis_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

Course.hasMany(OrderItem, { foreignKey: 'kurs_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
OrderItem.belongsTo(Course, { foreignKey: 'kurs_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' });

StudentDetail.hasMany(CourseEnrollment, { foreignKey: 'ogrenci_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CourseEnrollment.belongsTo(StudentDetail, { foreignKey: 'ogrenci_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

Course.hasMany(CourseEnrollment, { foreignKey: 'kurs_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CourseEnrollment.belongsTo(Course, { foreignKey: 'kurs_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

OrderItem.hasMany(CourseEnrollment, { foreignKey: 'siparis_kalemi_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' });
CourseEnrollment.belongsTo(OrderItem, { foreignKey: 'siparis_kalemi_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' });

CourseEnrollment.hasOne(Certificate, { foreignKey: 'kayit_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Certificate.belongsTo(CourseEnrollment, { foreignKey: 'kayit_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

Course.hasMany(Review, { foreignKey: 'kurs_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Review.belongsTo(Course, { foreignKey: 'kurs_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

StudentDetail.hasMany(Review, { foreignKey: 'ogrenci_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Review.belongsTo(StudentDetail, { foreignKey: 'ogrenci_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

InstructorDetail.hasMany(InstructorEarning, { foreignKey: 'egitmen_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
InstructorEarning.belongsTo(InstructorDetail, { foreignKey: 'egitmen_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

OrderItem.hasOne(InstructorEarning, { foreignKey: 'siparis_kalemi_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
InstructorEarning.belongsTo(OrderItem, { foreignKey: 'siparis_kalemi_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

InstructorDetail.belongsToMany(Category, { through: InstructorExpertise, foreignKey: 'egitmen_id', otherKey: 'kategori_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Category.belongsToMany(InstructorDetail, { through: InstructorExpertise, foreignKey: 'kategori_id', otherKey: 'egitmen_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

StudentDetail.belongsToMany(Category, { through: StudentInterest, foreignKey: 'ogrenci_id', otherKey: 'kategori_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Category.belongsToMany(StudentDetail, { through: StudentInterest, foreignKey: 'kategori_id', otherKey: 'ogrenci_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

// --- SEPET İLİŞKİLERİ ---
Profile.hasOne(Cart, { foreignKey: 'kullanici_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Cart.belongsTo(Profile, { foreignKey: 'kullanici_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

Cart.hasMany(CartItem, { as: 'Items', foreignKey: 'sepet_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CartItem.belongsTo(Cart, { foreignKey: 'sepet_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

Course.hasMany(CartItem, { foreignKey: 'kurs_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
CartItem.belongsTo(Course, { foreignKey: 'kurs_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

// --- ÖDEME İŞLEMLERİ İLİŞKİLERİ ---
Order.hasMany(PaymentTransaction, { foreignKey: 'siparis_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
PaymentTransaction.belongsTo(Order, { foreignKey: 'siparis_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });

module.exports = {
  sequelize,
  Profile,
  StudentDetail,
  InstructorDetail,
  Category,
  Course,
  CourseSection,
  Lesson,
  LessonProgress,
  Order,
  OrderItem,
  CourseEnrollment,
  Certificate,
  Review,
  InstructorEarning,
  InstructorExpertise,
  StudentInterest,
  Cart,
  CartItem,
  PaymentTransaction,
};