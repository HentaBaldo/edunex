const API_URL = '/api/admin/users';
// Eğer JWT kullanıyorsanız, login olan adminin token'ını buradan çekiyoruz.
// Session kullanıyorsanız bu header'a gerek kalmayabilir.
const token = localStorage.getItem('token'); 

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
};

let currentPage = 1;

// Sayfa yüklendiğinde kullanıcıları getir
document.addEventListener('DOMContentLoaded', () => {
    fetchUsers(currentPage);
});

// Backend'den kullanıcıları çeken fonksiyon
async function fetchUsers(page = 1) {
    try {
        const response = await fetch(`${API_URL}?page=${page}&limit=10`, { headers });
        const result = await response.json();

        if (result.success) {
            renderTable(result.data);
            renderPagination(result.totalPages, result.currentPage);
        } else {
            alert('Hata: ' + result.message);
        }
    } catch (error) {
        console.error('Veriler çekilirken hata oluştu:', error);
    }
}

// Gelen verileri HTML tablosuna basan fonksiyon
function renderTable(users) {
    const tbody = document.getElementById('usersList');
    tbody.innerHTML = '';

    users.forEach(user => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>${user.ad} ${user.soyad}</td>
            <td>${user.eposta}</td>
            <td>
                <select class="role-select" onchange="updateRole('${user.id}', this.value)">
                    <option value="ogrenci" ${user.rol === 'ogrenci' ? 'selected' : ''}>Öğrenci</option>
                    <option value="egitmen" ${user.rol === 'egitmen' ? 'selected' : ''}>Eğitmen</option>
                    <option value="admin" ${user.rol === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </td>
            <td>
                <button class="btn-delete" onclick="deleteUser('${user.id}')">Sil</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Rol Güncelleme Fonksiyonu
async function updateRole(id, newRole) {
    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({ rol: newRole })
        });
        const result = await response.json();

        if (result.success) {
            alert('Kullanıcı rolü başarıyla güncellendi.');
        } else {
            alert('Hata: ' + result.message);
            fetchUsers(currentPage); // Hata olursa dropdown'ı eski haline getirmek için listeyi yenile
        }
    } catch (error) {
        console.error('Güncelleme hatası:', error);
    }
}

// Kullanıcı Silme Fonksiyonu
async function deleteUser(id) {
    if (!confirm('Bu kullanıcıyı tamamen silmek istediğinize emin misiniz?')) return;

    try {
        const response = await fetch(`${API_URL}/${id}`, { 
            method: 'DELETE', 
            headers: headers 
        });
        const result = await response.json();

        if (result.success) {
            alert('Kullanıcı sistemden silindi.');
            fetchUsers(currentPage); // Silme sonrası listeyi güncelle
        } else {
            alert('Hata: ' + result.message);
        }
    } catch (error) {
        console.error('Silme hatası:', error);
    }
}

// Sayfalama (Pagination) Butonlarını Oluşturan Fonksiyon
function renderPagination(totalPages, page) {
    currentPage = page;
    const paginationDiv = document.getElementById('paginationControls');
    paginationDiv.innerHTML = '';

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        btn.className = (i === page) ? 'active' : '';
        btn.onclick = () => fetchUsers(i);
        paginationDiv.appendChild(btn);
    }
}