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

    async deleteSection(id, courseDurum) {
        const isDraft = courseDurum === 'taslak';
        const message = isDraft
            ? "Bu bölümü ve içindeki tüm dersleri KALICI olarak silmek istediğinize emin misiniz?"
            : "Bu bölüm onaylı/yayında olduğu için kalıcı silinmeyecek; öğrencilerden GİZLENECEK. Devam edilsin mi?";
        if (!confirm(message)) return false;
        await ApiService.delete(`/curriculum/sections/${id}`);
        return true;
    },

    async deleteLesson(id, courseDurum) {
        const isDraft = courseDurum === 'taslak';
        const message = isDraft
            ? "Bu dersi KALICI olarak silmek istediğinize emin misiniz?"
            : "Bu kurs onaylı/yayında olduğu için ders kalıcı silinmeyecek; öğrencilerden GİZLENECEK ve ilerleme hesabından çıkarılacak. Devam edilsin mi?";
        if (!confirm(message)) return false;
        await ApiService.delete(`/curriculum/lessons/${id}`);
        return true;
    },

    async restoreSection(id) {
        await ApiService.post(`/curriculum/sections/${id}/restore`, {});
        return true;
    },

    async restoreLesson(id) {
        await ApiService.post(`/curriculum/lessons/${id}/restore`, {});
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