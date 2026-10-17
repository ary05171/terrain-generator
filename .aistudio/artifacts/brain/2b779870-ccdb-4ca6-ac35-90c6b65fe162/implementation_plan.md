# Perapihan & Penyempurnaan Adaptive Smartpath Artificial

Rencana arsitektur dan algoritma untuk menyempurnakan sistem jalur pintar (*adaptive smartpath*), mengeliminasi tabrakan jembatan tumpang-tindih pada aliran air, merapikan jarak dekorasi batu pembatas agar tidak bertumpuk rapat, serta menerapkan zona aman pelataran (*clearance plaza*) di sekeliling bangunan.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Ringkasan keputusan penting yang telah dikonfirmasi oleh pengguna untuk perapihan smartpath:

- **Jembatan Air Tunggal & Tegak Lurus**: Ketika rute menyeberangi badan air, sistem mendeteksi titik masuk dan keluar tepi sungai (*bank-to-bank crossing*) dan hanya menempatkan **satu jembatan kayu lurus** yang membentang tegak lurus melintasi sungai. Jembatan ganda, jembatan zig-zag di dalam air, dan tumpang-tindih dieliminasi sepenuhnya.
- **Batu Pembatas Renggang & Rapi**: Menghilangkan tumpukan rapat tiang/batu hitam di jalan. Batu pembatas (*curb stones*) diletakkan dengan interval jarak berkala yang teratur (`stride ~3.5 - 4.5 unit`), rotasi sejajar kurva tangen jalan, dan offset tegak lurus yang konsisten di sisi luar bahu jalan.
- **Zona Bebas Tabrakan Bangunan (*Building Clearance Buffer & Plaza*)**: Jalur jalan mendeteksi posisi semua bangunan (kincir angin, mercusuar, pondok, gedung). Titik waypoints dan kurva jalan otomatis dialihkan (*repulsion / offset*) sejauh radius aman minimal 4.0 unit, serta membentuk pelataran terbuka di depan pintu masuk bangunan.

---

## 1. Overview & Core Concept

- **Apa yang Dihasilkan**: Algoritma pembuatan jalur otomatis (*procedural smartpath*) yang cerdas secara spasial (*geometrically aware*). Menghasilkan tata letak jalan setapak diorama 3D yang bersih, tertata rapi seperti rancangan arsitek lanskap, tanpa objek saling menembus (*no clipping/intersecting*).
- **Target Pengguna**: Pembuat diorama dan perancang pulau 3D yang menginginkan infrastruktur jalan setapak, jembatan, dan pencahayaan otomatis yang terlihat proporsional, mulus, dan estetik secara instan.
- **Nilai Utama**: Menghilangkan kekacauan visual seperti tumpukan jembatan di dalam air dan tiang pembatas bertumpuk, sehingga pengguna memperoleh pengalaman *"One-Click Perfect Diorama Path"*.

---

## 2. User Experience & Visual Design

### Alur Kerja Pengguna
1. Pengguna menekan tombol **"Bangun Jalan Setapak Otomatis 🚶‍♂️"** atau mengoleskan kuas jalan di pulau.
2. Sistem secara adaptif menganalisis kontur elevasi, batas garis air (*waterline*), dan lokasi semua bangunan yang telah diletakkan.
3. Jalur digambar dengan lekukan spline halus:
   - Menjaga jarak aman dari dinding kincir angin dan bangunan lainnya.
   - Saat melewati air, hanya 1 jembatan kayu kokoh dengan dek lurus terbentang dari tepian ke tepian.
   - Sisi kiri dan kanan jalan dihiasi batu pembatas berjarak elegan berselang-seling dengan rumpun bunga liar.
4. Pengguna dapat menekan tombol **"Rapikan & Solidkan ✨"** kapan saja untuk menyelaraskan ulang seluruh objek ke kontur pulau yang telah diperbarui.

### Desain Visual & Komposisi
- **Jembatan Kayu (Single Crossing Span)**: Memiliki ketinggian dek yang pas di atas permukaan air (`waterLevel + 0.35`), pilar penyangga yang menancap ke dasar air, serta orientasi yang tegak lurus terhadap arah aliran sungai.
- **Tepian Jalan Teratur**: Batu pembatas andesit/granit memiliki proporsi rendah yang menempel rapat ke tanah, tanpa tiang tegak yang mengambang. Jarak antar batu dibuat konsisten untuk kesan diorama buatan tangan yang rapi.
- **Pelataran Bangunan**: Sekitar kincir angin dan pondok diberi tekstur pelataran melingkar (*apron plaza*) sehingga jalan setapak mengalir anggun menuju pekarangan bangunan.

---

## 3. Key Product Decisions & Trade-Offs

### Keputusan 1: Logika Penyeberangan Air (Bank-to-Bank Water Crossing Detection)
- **Pendekatan Terpilih**: Alih-alih mengevaluasi setiap sampel titik langkah demi langkah yang dapat memicu pembuatan jembatan berulang kali di dalam air, algoritma mengidentifikasi segmen diskret penyeberangan air: titik masuk daratan ke air (*entry bank*) dan titik keluar air ke daratan (*exit bank*). Satu jembatan tunggal yang dipanjangkan atau diposisikan tepat di antara kedua titik tersebut dibuat secara terpusat.
- **Alasan**: Mencegah penumpukan 3 hingga 5 jembatan kayu yang saling menabrak dan membelok di dalam air seperti yang terlihat pada tangkapan layar.
- **Opsi Lain yang Ditolak**: Mengandalkan ambang batas jarak sederhana (`distance > 7.0`) yang terbukti gagal jika jalan berkelok-kelok di sepanjang bantaran air.

### Keputusan 2: Pemfilteran Jarak Minimum & Rotasi Batu Pembatas (*Poisson-disk Curb Spacing*)
- **Pendekatan Terpilih**: Menggunakan pelacakan jarak tempuh kurva (*arc-length parameterization*) dengan interval minimal 3.8 unit antar dekorasi tepian. Orientasi rotasi dihitung dari vektor tangen kurva `(dx, dz)` ditambah offset normal `±90°`, dengan pengecekan jarak terhadap semua objek yang sudah ada.
- **Alasan**: Mencegah penggandaan batu pembatas pada kurva tajam atau di dekat jembatan dan tangga.

### Keputusan 3: Vektor Tolakan Bangunan (*Building Obstacle Repulsion*)
- **Pendekatan Terpilih**: Setiap titik kontrol spline menghitung gaya tolakan (*repulsion field*) dari pusat setiap bangunan dalam radius 4.5 unit, menggeser titik jalur ke sisi luar bangunan yang terbuka.
- **Alasan**: Menghilangkan kasus jembatan atau jalan setapak memotong tepat ke dalam model 3D kincir angin.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TERRAFORGE 3D APP ENGINE                        │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
             ┌───────────────────────┴───────────────────────┐
             ▼                                               ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│     TERRAIN & HEIGHTMAP      │              │      PLACED OBJECTS LIST     │
│   (Simplex Noise / Sculpt)   │              │ (Windmills, Cottages, Lamps) │
└────────────┬─────────────────┘              └──────────────┬───────────────┘
             │                                               │
             └───────────────────────┬───────────────────────┘
                                     ▼
      ┌─────────────────────────────────────────────────────────────┐
      │          ADAPTIVE SMARTPATH GENERATOR (terrainGen.ts)       │
      │                                                             │
      │  1. Scenic Waypoints Discovery (Building Plaza Anchors)     │
      │  2. Obstacle Repulsion Field (Avoid Building Collisions)    │
      │  3. Catmull-Rom Spline Smoothing (Meander Normalization)    │
      │  4. Water Crossing Segmenter (Bank-to-Bank Single Span)     │
      │  5. Slope Analyzer (Single Wooden Staircase on Cliffs)      │
      │  6. Spaced Curb Stone & Wildflower Placer (Arc-Length Stride)│
      └──────────────────────────────┬──────────────────────────────┘
                                     ▼
      ┌─────────────────────────────────────────────────────────────┐
      │                   THREE.JS SCENE RENDERING                  │
      │   - Ground Texture Paving & Mortar Blend Shading            │
      │   - Single Clean Bridges Spanning Rivers                    │
      │   - Neatly Spaced Curb Stones Aligned with Path Tangents    │
      │   - Open Building Plazas Free of Structural Clipping        │
      └─────────────────────────────────────────────────────────────┘
```

### Rencana Alur Implementasi Kode
1. **Penyempurnaan `findScenicLandWaypoints` (`src/core/terrainGen.ts`)**:
   - Menghitung arah menghadap pintu depan bangunan dan menempatkan titik singgah jalur di pelataran depan bangunan dengan jarak aman minimal 3.5 unit dari bounding box bangunan.
2. **Penyempurnaan Spline & Obstacle Repulsion**:
   - Menambahkan koreksi posisi titik kurva agar selalu berjarak minimal 3.0 unit dari posisi bangunan mana pun.
3. **Penyempurnaan Penempatan Jembatan Air (`Water Crossing Logic`)**:
   - Mengelompokkan langkah-langkah di atas air menjadi satu *Water Crossing Span*.
   - Menempatkan **hanya satu jembatan kayu** per penyeberangan air, diarahkan persis dari tepi sungai awal ke tepi sungai tujuan.
4. **Penyempurnaan Penataan Batu Pembatas & Bunga (`Curb Placement`)**:
   - Mengganti penempatan berbasis modulo langkah (`s % 5`) menjadi berbasis akumulasi jarak meter kurva (*arc distance accumulator*).
   - Memastikan tidak ada batu pembatas yang ditaruh dalam jarak 3.0 unit dari jembatan, tangga, atau bangunan.
5. **Penyempurnaan Pembersihan Tombol "Rapikan & Solidkan ✨" (`App.tsx`)**:
   - Menambahkan deteksi dan pembersihan otomatis objek-objek jembatan liar atau batu pembatas yang bertumpuk berdekatan (< 2.0 unit).
