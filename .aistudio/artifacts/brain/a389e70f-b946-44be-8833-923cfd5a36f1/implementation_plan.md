# Rencana Pemindahan & Kontekstualisasi Kontrol Build Jalan TerraForge 3D

Menyembunyikan secara total HUD kontrol navigasi rute, pin penanda 3D (Pin A, B, C), serta garis pita rute saat pengguna sedang tidak dalam aktivitas pembuatan jalan, dan hanya memunculkannya secara kontekstual saat pengguna memilih kategori objek jalan setapak atau kuas jalan.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Keputusan yang telah dikonfirmasi oleh pengguna:
> - **Pemicu Penampilan Kontrol**: Kontrol navigasi rute dan build jalan hanya akan muncul di layar saat pengguna aktif memilih kategori atau kuas **Jalan Setapak** (misalnya saat memilih palet jalan, kuas paving, atau menekan tombol rute jalan di dock).
> - **Visibilitas Objek 3D Rute**: Ketika bukan mode jalan, seluruh elemen rute (Pin A, Pin B, Waypoint C, garis pita navigasi gradien, dan node kisi A*) **disembunyikan secara total** dari layar 3D, menjadikan kanvas bersih 100%.

---

### 1. Overview & Core Concept

- **Tujuan**: Menghilangkan polusi visual dari layar 3D. Selama ini Pin A, Pin B, dan panel navigasi selalu melayang di layar meskipun pengguna sedang melakukan aktivitas lain seperti sculpting gunung, menanam hutan, mengatur tata kota, atau mengubah pencahayaan sore/malam.
- **Hasil Pengalaman Pengguna (UX)**:
  - **Mode Umum (Bersih & Imersif)**: Layar 3D bersih tanpa ada pin oranye/cyan atau panel navigasi yang menghalangi pandangan pulau.
  - **Mode Jalan (Fokus & Responsif)**: Begitu pengguna mengklik kategori **"Jalan"** di palet objek atau mengaktifkan kuas jalan, sistem secara elegan memunculkan Pin A-B dan kontrol pembuatan jalan. Saat jalan selesai diterapkan (*baked*) atau pengguna beralih ke alat lain (pohon/bangunan/sculpt), pin dan kontrol otomatis menghilang kembali.

---

### 2. User Experience & Visual Design

#### A. Alur Kerja Kontekstual (Contextual Workflow)
1. **Kondisi Awal (Zero-State)**:
   - Aplikasi terbuka dengan kanvas 3D bersih tanpa ada Pin 3D atau HUD rute di sudut layar.
2. **Aktivasi Mode Jalan**:
   - Pengguna membuka tab **Place** lalu memilih kategori **"Jalan"** (atau item paving/jembatan), atau memilih alat jalan setapak di dock.
   - Pin 3D (A & B) dan garis rute lembut muncul di atas permukaan terrain.
   - Panel HUD rute (atau kapsul mini di mobile) tampil dengan informasi jarak dan tombol *"Terapkan Jalan"*.
3. **Penyelesaian / Deaktivasi**:
   - Setelah menekan tombol *"Terapkan Jalan"* atau saat pengguna beralih memilih pohon, rumah, atau tab lain (Terrain / Lighting / Export), Pin 3D dan HUD langsung disembunyikan kembali secara otomatis.
   - Ditambahkan tombol toggle eksplisit *"Tampilkan/Sembunyikan Rute Jalan"* di dalam palet kategori jalan pada dock untuk kontrol manual kapan saja.

#### B. Visual Restraint & Mobile Presence
- Memenuhi aturan ergonomi mobile: ketika mode jalan tidak aktif, **100% viewport bebas dari overlay floating** selain TopBar ringkas di atas dan dock di bawah.
- Di layar smartphone, saat mode jalan aktif, panel rute tetap dalam mode kapsul mini yang ramah jempol.

---

### 3. Key Product Decisions & Trade-Offs

- **Keputusan 1: Otomasi Berbasis Kategori Aktif vs Toggle Manual Murni**
  - *Pilihan*: Menggabungkan otomatisasi cerdas (aktif saat `activePaletteItem.category === 'path'` atau kuas jalan aktif) dengan tombol toggle manual di tab Place.
  - *Alasan*: Pengguna tidak perlu mengingat tombol khusus untuk memunculkan jalan; cukup memilih batu paving atau jalan setapak di palet maka alat rute langsung siap pakai. Begitu beralih menaruh pohon, layar langsung bersih kembali.
- **Keputusan 2: Sembunyikan Total Mesh 3D Pin & Rute Ribbon**
  - *Pilihan*: Mengatur `navGroupRef.current.visible = isRoadModeActive` dan menyembunyikan ribbon rute secara total.
  - *Alasan*: Menghilangkan rasa terganggu akibat adanya garis warna-warni melintasi pulau saat pengguna ingin menikmati pemandangan alam atau mengekspor 3D.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                      App State & Mode Flow                      │
├─────────────────────────────────────────────────────────────────┤
│ activePaletteItem / brushSettings / activeTab                   │
│                                                                 │
│ isRoadMode = (                                                  │
│   activePaletteItem?.category === 'path' ||                     │
│   brushSettings.mode === 'path' ||                              │
│   isRoadNavForced                                               │
│ )                                                               │
├───────────────────────────────┬─────────────────────────────────┤
│       isRoadMode = false      │        isRoadMode = true        │
├───────────────────────────────┼─────────────────────────────────┤
│ • Pin A, B, C meshes HIDDEN   │ • Pin A, B, C meshes VISIBLE    │
│ • Route ribbon mesh HIDDEN    │ • Route ribbon mesh VISIBLE     │
│ • A* exploration nodes HIDDEN │ • A* exploration nodes VISIBLE  │
│ • Floating Pin HUD HIDDEN     │ • Floating Pin HUD VISIBLE      │
│ • Kanvas 3D 100% bersih       │ • Tombol "Terapkan Jalan" aktif │
└───────────────────────────────┴─────────────────────────────────┘
```

#### File yang Dimodifikasi:
1. **`src/components/Viewport3D.tsx`**:
   - Sinkronisasi visibilitas `isPinNavVisible` dengan status apakah pengguna sedang dalam mode jalan (`isRoadModeActive`).
   - Menyembunyikan seluruh `navGroupRef`, ribbon rute, dan HUD ketika `isRoadModeActive === false`.
2. **`src/components/ControlDock.tsx`**:
   - Menambahkan tombol toggle cepat status rute jalan di sub-kategori "Jalan" pada tab Place.
3. **`src/App.tsx`**:
   - Menghubungkan deteksi kategori aktif jalan antara `ControlDock` dan `Viewport3D`.
