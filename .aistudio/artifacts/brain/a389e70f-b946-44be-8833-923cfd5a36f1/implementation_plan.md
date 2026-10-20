# Solusi Elevasi Jalan, Penggantian Tekstur PNG, Penghapus Townsmen, & Reorganisasi HUD/Kamera

Rencana komprehensif untuk mengatasi jalan dan pembatas yang terangkat/melayang di lereng, menyediakan sistem pemilihan tekstur PNG jalan (5 tekstur bawaan + upload file gambar kustom) dengan tekstur independen per segmen jalan, menghadirkan alat hapus jalan ala Townsmen dengan sorotan merah eksklusif pada jalan, merapikan seluruh pengaturan sculpt ke dalam tab Sculpt tanpa konflik, serta membersihkan bilah atas dengan 3 tombol mode kamera (Putar, Geser, Zoom).

## User Review & Critical Decisions

> [!IMPORTANT]
> Ringkasan keputusan yang telah dikonfirmasi bersama pengguna:
> - **Mode Kamera Bilah Atas**: Menggunakan 3 tombol sakelar kontrol: **Putar (Orbit)**, **Geser (Pan Layar 1-Jari)**, dan **Zoom (Perbesar/Perkecil)**, menggantikan tombol duplikat di sisi kanan atas.
> - **Alat Hapus Jalan Townsmen**: Menggunakan kuas sorotan merah eksklusif yang hanya bisa menargetkan segmen jalan dan pembatasnya; objek lain, bangunan, dan kontur tanah diproteksi 100% dari salah klik.
> - **Sistem Tekstur PNG Jalan**: Menyediakan galeri tekstur PNG bawaan (Cobblestone Klasik, Paving Persegi Modern, Bata Merah, Kerikil Pedesaan, Batu Lempeng Flagstone) disertai tombol upload PNG custom, menampilkan tekstur aktif saat ini, serta menetapkan tekstur berbeda secara independen untuk tiap jalan yang telah dipasang.

---

## 1. Overview & Core Concept

- **Apa yang Dibangun**:
  1. **Solusi Jalan Menempel Sempurna (Anti-Terangkat)**: Menghitung ketinggian vertex kiri dan kanan jalan setapak secara terpisah mengikuti kontur tanah riil di setiap titik koordinat (bukan hanya titik tengah), serta menenggelamkan pondasi pembatas agar tidak miring atau melayang di lereng bukit.
  2. **Manajemen Tekstur PNG Jalan Dinamis**: Antarmuka pemilih tekstur jalan dengan thumbnail visual, menampilkan tekstur aktif saat ini, mendukung unggah PNG langsung dari galeri/file pengguna, dan menyimpan tekstur unik per segmen jalan.
  3. **Alat Hapus Jalan ala Townsmen (Sorot Merah)**: Mode penghancur jalan di mana jalan yang disorot kursor/sentuhan menyala merah terang. Saat diketuk, jalan dan pembatasnya terhapus bersih dan warna bioma alami pulau dipulihkan kembali tanpa risiko menghapus bangunan atau pohon di sekitarnya.
  4. **Reorganisasi Tab Sculpt Bersih & Rapi**: Memindahkan dan menyusun seluruh pengaturan sculpt (Mode Kuas: Naik, Turun, Ratakan, Haluskan, Cat Jalan; Radius; Intensitas; Tinggi Ratakan) secara rapi dan bebas konflik di dalam tab Sculpt dock bawah.
  5. **HUD Bilah Atas Ramping & 3-Mode Sakelar Kamera**: Menghilangkan tombol duplikat di sisi kanan atas, memadatkan status bar menjadi 1 bilah ramping dengan sakelar 3 mode kamera sentuh (Putar 360°, Geser Layar/Pan 1-Jari, dan Zoom).

---

## 2. User Experience & Visual Design

### Alur Pengguna (User Flows)
1. **Navigasi Kamera yang Mulus (3 Mode)**:
   - Pengguna cukup menyentuh sakelar di bilah atas:
     - `[ 🔄 Putar ]`: Sentuhan 1 jari memutar pulau bebas 360° (Orbit).
     - `[ ✋ Geser ]`: Sentuhan 1 jari menggeser posisi pulau (Pan) dengan sangat mudah di HP/tablet tanpa perlu gestur 2 jari yang kaku.
     - `[ 🔍 Zoom ]`: Sentuhan 1 jari menggeser atas/bawah untuk zoom in/out halus.
2. **Membangun Jalan dengan Tekstur Pilihan**:
   - Di panel mode jalan, pengguna melihat thumbnail dan nama tekstur yang aktif (misal: *Cobblestone Klasik*).
   - Pengguna dapat mengetuk pilihan tekstur lain (misal: *Bata Merah* atau *Paving Modern*) atau mengunggah file PNG sendiri.
   - Saat tombol **Bangun Jalan** ditekan, jalan akan tercetak menempel sempurna di lereng kontur tanpa celah melayang, dan retaining wall/curb tertanam solid.
   - Jalan-jalan sebelumnya tetap mempertahankan tekstur PNG yang sudah ditetapkan sebelumnya.
3. **Menghapus Jalan ala Townsmen**:
   - Pengguna mengaktifkan mode **Hapus Jalan** (ikon Bulldozer / Hapus).
   - Kursor atau jari mengarah ke segmen jalan: segmen jalan tersebut langsung berubah warna menjadi **Merah Terang Glowing** (`#ef4444`).
   - Objek non-jalan (bangunan, pohon, tanah) tidak akan bereaksi merah dan tidak dapat terhapus.
   - Ketukan pada jalan merah menghapus jalan tersebut seketika dan mengembalikan rumput/tanah aslinya.
4. **Tab Sculpt Bersih**:
   - Tab *Sculpt* di dock bawah tampil teratur dengan kartu pengaturan berjenjang, slider radius & intensitas yang responsif, dan indikator tinggi ratakan yang jelas.

---

## 3. Key Product Decisions & Trade-Offs

- **Elevasi Per-Vertex vs Elevasi Garis Tengah**:
  - *Keputusan*: Ketinggian vertex sisi kiri (`idxL`) dan sisi kanan (`idxR`) dihitung dari `getSampledHeightAt(x, z, heights)` koordinat masing-masing ditambah offset mikro `+0.02` unit.
  - *Alasan*: Menghilangkan 100% masalah jalan melayang atau tenggelam miring di lereng bukit.
- **Penyimpanan Tekstur Per-Jalan**:
  - *Keputusan*: Setiap mesh jalan di `PersistentRoadGroup` memiliki materi dan `userData.textureId` tersendiri.
  - *Alasan*: Pengguna dapat membuat jalan utama batu andesit, jalan samping bata merah, dan jalan setapak kerikil di pulau yang sama.
- **Raycasting Eksklusif pada Penghapus Jalan**:
  - *Keputusan*: Filter raycaster hanya menargetkan anak objek dari `persistentRoadGroupRef` dan `props` bertipe pembatas/jembatan jalan.
  - *Alasan*: Menjamin perlindungan 100% agar bangunan kota, pohon, atau kontur pulau tidak sengaja terhapus.

---

## 4. Technical Architecture & Component Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TopBar (Bilah Atas Baru)                        │
│ ┌───────────────────────────┐ ┌───────────────┐ ┌────────────────────┐ │
│ │ TerraForge 3D • Biome Seed│ │ [↩] [↪] Undo  │ │ [🔄 Putar][✋ Geser]│ │
│ │                           │ │               │ │ [🔍 Zoom]  [Fullscreen]│
│ └───────────────────────────┘ └───────────────┘ └────────────────────┘ │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Mengubah Mode Kontrol Sentuh Kamera
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Viewport3D & OrbitControls                        │
│  - Mode Putar: controls.touches.ONE = ROTATE, mouse = ROTATE          │
│  - Mode Geser: controls.touches.ONE = PAN, mouse = PAN                │
│  - Mode Zoom: controls.touches.ONE = DOLLY, mouse = DOLLY             │
│                                                                        │
│  ┌───────────────────────┐          ┌───────────────────────────────┐  │
│  │ Glowing Preview Line  │          │    Persistent Road Group      │  │
│  │ (Dashed & Chevrons)   │          │  - Mesh Jalan A (Cobblestone) │  │
│  └───────────────────────┘          │  - Mesh Jalan B (Bata Merah)  │  │
│                                     │  - Mesh Jalan C (PNG Kustom)  │  │
│                                     └───────────────┬───────────────┘  │
│                                                     │                  │
│                                                     ▼                  │
│                                        Townsmen Demolish Tool          │
│                                        - Raycast hanya ke Mesh Jalan  │
│                                        - Sorot Merah (#ef4444)         │
│                                        - Hapus & Restore Bioma        │
└────────────────────────────────────▲───────────────────────────────────┘
                                     │
┌────────────────────────────────────┴───────────────────────────────────┐
│                    ControlDock (Tab Sculpt Rapi)                       │
│  - Mode Kuas: [Naik][Turun][Ratakan][Haluskan][Jalan Setapak]          │
│  - Slider: Radius Kuas (m), Intensitas Kuas, Tinggi Target Ratakan     │
│  - Pilihan Tekstur Jalan PNG & Tombol Unggah File Kustom               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Rencana Langkah Eksekusi (Implementation Steps)

1. **Ketinggian Jalan Anti-Terangkat**:
   - Memodifikasi `updateRouteRibbonGeometry` di `Viewport3D.tsx` untuk menghitung `leftY` dan `rightY` dari koordinat vertex asli.
   - Memodifikasi `bakeNavigationRouteToTerrain` di `navigationRoute.ts` untuk menanamkan pondasi pembatas secara solid pada kontur tanah tanpa tilt ekstrim.
2. **Katalog Tekstur PNG Jalan & Upload Kustom**:
   - Memperluas `roadTextures.ts` dengan 5 preset tekstur PNG berkualitas tinggi (Cobblestone Klasik, Paving Persegi Modern, Bata Merah, Kerikil Pedesaan, Batu Lempeng) dan fungsi pembuat materi dari file PNG kustom (FileReader/DataURL).
   - Menambahkan status `currentRoadTextureId` dan thumbnail tampilan tekstur aktif saat ini.
3. **Alat Hapus Jalan ala Townsmen**:
   - Membuat mode alat penghancur jalan di `Viewport3D.tsx`.
   - Mengimplementasikan pointer hover raycaster khusus ke mesh jalan dengan efek sorotan material merah terang (`0xef4444`).
   - Logika tap untuk menghapus mesh jalan, batu pembatas terkait, serta memulihkan warna tanah.
4. **Perapihan Tab Sculpt**:
   - Merapikan tata letak `activeTab === 'sculpt'` di `ControlDock.tsx`.
   - Mengelompokkan pengaturan sculpt menjadi blok rapi tanpa elemen yang bertumpuk.
5. **Pembersihan Bilah Atas & Sakelar 3 Mode Kamera**:
   - Menghapus tombol duplikat jalan di sisi kanan atas `TopBar.tsx`.
   - Menambahkan 3 tombol sakelar kamera: **Putar (Orbit)**, **Geser (Pan)**, dan **Zoom**.
   - Menghubungkan sakelar ke pengaturan `OrbitControls` di `Viewport3D.tsx`.
6. **Verifikasi & Pengujian Build**:
   - Memastikan tidak ada regresi dan memeriksa kelancaran build via `compile_applet`.
