const { Profile, Course, CourseSection, Lesson } = require('../models');

exports.getDashboardStats = async (req, res) => {
    try {
        const [totalUsers, activeCourses, pendingCourses] = await Promise.all([
            Profile.count(),
            Course.count({ where: { durum: 'yayinda' } }),
            Course.count({ where: { durum: 'onay_bekliyor' } })
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalUsers,
                activeCourses,
                pendingCourses
            }
        });
    } catch (error) {
        console.error(`[AdminController] Error in getDashboardStats: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Istatistikler alinirken sunucu hatasi olustu.'
        });
    }
};

exports.getPendingCourses = async (req, res) => {
    try {
        const pendingCourses = await Course.findAll({
            where: { durum: 'onay_bekliyor' },
            include: [{
                model: Profile,
                as: 'Egitmen',
                attributes: ['ad', 'soyad']
            }]
        });

        return res.status(200).json({
            success: true,
            data: pendingCourses
        });
    } catch (error) {
        console.error(`[AdminController] Error in getPendingCourses: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Onay bekleyen kurslar listelenirken sunucu hatasi olustu.'
        });
    }
};

exports.getCourseDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const course = await Course.findByPk(id, {
            include: [
                { model: Profile, as: 'Egitmen' },
                {
                    model: CourseSection,
                    as: 'Sections',
                    include: [{ model: Lesson, as: 'Lessons' }]
                }
            ]
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Talep edilen kurs bulunamadi.'
            });
        }

        return res.status(200).json({
            success: true,
            data: course
        });
    } catch (error) {
        console.error(`[AdminController] Error in getCourseDetail: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Kurs detaylari alinirken sunucu hatasi olustu.'
        });
    }
};

exports.approveCourse = async (req, res) => {
    try {
        const { id } = req.params;

        const [updatedRows] = await Course.update(
            { durum: 'onaylandi' },
            { where: { id } }
        );

        if (updatedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Onaylanacak kurs bulunamadi veya zaten onayli durumunda.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Kurs basariyla onaylandi.'
        });
    } catch (error) {
        console.error(`[AdminController] Error in approveCourse: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Kurs onaylanirken sunucu hatasi olustu.'
        });
    }
};