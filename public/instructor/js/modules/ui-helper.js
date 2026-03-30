// public/instructor/js/modules/ui-helper.js

export const UIHelper = {
    checkInstructorAccess() {
        const token = localStorage.getItem('edunex_token');
        const userJson = localStorage.getItem('edunex_user');
        
        if (!token || !userJson) {
            window.location.href = '/auth/index.html'; 
            return false;
        }
        
        try {
            const user = JSON.parse(userJson);
            if (user.rol !== 'egitmen') {
                alert('Bu alan sadece eğitmenlerin erişimine açıktır.');
                window.location.href = '/main/index.html'; 
                return false;
            }
            return true;
        } catch (error) {
            console.error('[AUTH ERROR] Yetki kontrolü başarısız:', error.message);
            localStorage.clear();
            window.location.href = '/auth/index.html';
            return false;
        }
    },

    switchTab(tabId) {
        document.querySelectorAll('.sidebar-menu button').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
        });
        
        const selectedTab = document.getElementById(tabId);
        if (selectedTab) {
            selectedTab.style.display = 'block';
            selectedTab.classList.add('active');
        }
    },

    toggleModal(modalId, display = 'none') {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = display;
    },

    resetForm(formId) {
        const form = document.getElementById(formId);
        if (form) form.reset();
    }
};