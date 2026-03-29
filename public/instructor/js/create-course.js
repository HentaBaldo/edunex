/**
 * EduNex Instructor - Course Creation Logic
 * Standardized for API version 1.0
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Session and Role Verification
    if (!checkInstructorAccess()) return;

    // 2. Initial Data Loading
    await loadCategories();
});

/**
 * Verifies if the user is logged in and has the 'egitmen' role
 */
function checkInstructorAccess() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');

    if (!token || !userJson) {
        window.location.href = '/auth/index.html';
        return false;
    }

    try {
        const user = JSON.parse(userJson);
        if (user.rol !== 'egitmen') {
            alert('Access denied. This area is for instructors only.');
            window.location.href = '/main/index.html';
            return false;
        }
        return true;
    } catch (error) {
        console.error('[AUTH ERROR] Invalid user data.');
        localStorage.clear();
        window.location.href = '/auth/index.html';
        return false;
    }
}

/**
 * Fetches categories from the API and populates the select dropdown
 */
async function loadCategories() {
    const categorySelect = document.getElementById('kategori_id');
    const messageDiv = document.getElementById('courseMessage');

    try {
        // Backend returns: { status: 'success', message: '...', data: [...] }
        const result = await ApiService.get('/categories');
        const categories = result.data || [];

        if (categories.length === 0) {
            console.warn('[INFO] No categories found on the server.');
        }

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.ad;
            categorySelect.appendChild(option);
        });

    } catch (error) {
        console.error("[FETCH ERROR] Could not load categories:", error.message);
        messageDiv.textContent = "Warning: Failed to load categories from the server.";
        messageDiv.className = "message-box error active";
    }
}

/**
 * Handles the course creation form submission
 */
document.getElementById('createCourseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const messageDiv = document.getElementById('courseMessage');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    // UI Feedback: Start processing
    messageDiv.textContent = "Saving course, please wait...";
    messageDiv.className = "message-box active";
    submitBtn.disabled = true;

    // Data Preparation
    const payload = {
        baslik: document.getElementById('baslik').value,
        alt_baslik: document.getElementById('alt_baslik').value,
        kategori_id: document.getElementById('kategori_id').value,
        dil: document.getElementById('dil').value,
        seviye: document.getElementById('seviye').value,
        fiyat: parseFloat(document.getElementById('fiyat').value) || 0,
        gereksinimler: document.getElementById('gereksinimler').value,
        kazanimlar: document.getElementById('kazanimlar').value
    };

    try {
        // API Call
        const result = await ApiService.post('/courses', payload);
        
        // Success Handling
        messageDiv.textContent = result.message || "Course created successfully! Redirecting...";
        messageDiv.className = "message-box success active";
        
        setTimeout(() => {
            window.location.href = '/instructor/dashboard.html';
        }, 1500);

    } catch (error) {
        // Error Handling
        console.error("[POST ERROR] Course creation failed:", error.message);
        messageDiv.textContent = `Error: ${error.message}`;
        messageDiv.className = "message-box error active";
        submitBtn.disabled = false;
    }
});