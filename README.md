# 🏢 Envanter ve Süreç Takip Sistemi — Doğu AŞ  
### Dokuz Eylül Üniversitesi | 3. Sınıf Dönem Projesi  

Bu proje, **Doğu AŞ** için geliştirilen modern, modüler ve genişletilebilir bir **envanter ve süreç takip sistemi prototipidir**.  
Tamamen **HTML5, CSS3 ve Vanilla JavaScript** ile yazılmıştır — herhangi bir framework kullanılmamıştır.  

Sistem, kullanıcı rolleri (Admin / Yönetici / Personel) üzerinden farklı erişim yetkileri sunar ve stok yönetimi, geçmiş kayıtlar, planlanan işler, kullanıcı onay sistemi gibi özellikler içerir.  

---

## 🚀 Özellikler

- 👥 **Rol tabanlı erişim sistemi:**  
  Admin, Yönetici ve Personel rollerine göre yetkilendirme  
- 📝 **Kayıt onay sistemi:**  
  Yeni kullanıcılar `pending_users` tablosuna eklenir, yönetici onayıyla aktif hale gelir  
- 📦 **Stok durumu ve kritik stok uyarıları**  
- 🗓️ **Planlanan / Aktif işler yönetimi**  
- 🕓 **Geçmiş filtreleme & sıralama:**  
  Tarih, ürün, fiyat ve firma bazlı arama  
- ⚠️ **Bildirim sistemi:**  
  Belirli süre işlem yapmayan firmalar için renkli uyarılar (30/60/90/120/150+ gün)  
- 💾 **LocalStorage prototip veritabanı:**  
  Backend olmadan oturum ve veri saklama  
- 💡 **Modern, responsive ve sade UI**

---

## 🧠 Kullanılan Teknolojiler

| Katman | Teknoloji | Açıklama |
|--------|------------|----------|
| Frontend | HTML5, CSS3, JavaScript | Frameworksüz, hafif yapı |
| Veri / Oturum | LocalStorage | Prototip aşamasında geçici veri saklama |
| Backend (planlanan) | Node.js + Express + PostgreSQL | Kalıcı veritabanı ve API bağlantısı |
