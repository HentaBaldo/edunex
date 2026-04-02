// public/instructor/js/modules/curriculum-actions.js

export const CurriculumActions = {
    async addSection(payload) {
        return await ApiService.post('/curriculum/sections', payload);
    },

    async uploadVideo(formData) {
        const response = await fetch('/api/instructor/upload', { 
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${localStorage.getItem('edunex_token')}` 
            },
            body: formData
        });
        return await response.json();
    },

    async deleteSection(id) {
        if (!confirm("Bu bölümü ve içindeki tüm dersleri silmek istediğinize emin misiniz?")) return false;
        await ApiService.delete(`/curriculum/sections/${id}`);
        return true;
    },

    async deleteLesson(id) {
        if (!confirm("Bu dersi silmek istediğinize emin misiniz?")) return false;
        await ApiService.delete(`/curriculum/lessons/${id}`);
        return true;
    },

    async sendForApproval(courseId) {
        if (!confirm("Kursu yönetici onayına göndermek istediğinize emin misiniz?")) return false;
        
        try {
            const result = await ApiService.put(`/courses/${courseId}/status`, { 
                durum: 'onay_bekliyor' 
            });
            
            if (result.status === 'success') {
                alert('✓ Kursu başarıyla onaya gönderdininiz. Lütfen yönetici onayını bekleyiniz.');
                return true;
            }
        } catch (error) {
            alert('✗ Hata: ' + error.message);
            return false;
        }
    }
};