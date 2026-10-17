# Rencana Implementasi Tekstur Jalan Bergradasi & Dekorasi Tepian Jalan

Berdasarkan preferensi yang Anda pilih, berikut adalah rencana teknis komprehensif untuk meningkatkan kualitas visual jalan setapak pulau:
1. **Tekstur Paving Solid Bergradasi Tegas dengan Nat Gelap Jelas**: Permukaan jalan dilengkapi pola kisi interlocking paving modular dengan alur nat (mortar joint) gelap yang tegas serta gradasi cembung halus pada setiap ubin batu untuk kedalaman 3D yang jelas dan rapi.
2. **Dekorasi Tepian Jalan (Batu Pembatas Paving & Rumput Bunga Alami)**: Sepanjang sisi kiri dan kanan jalan dihiasi batu pembatas curb solid yang tertata rapi serta sembulan rumput padang dan bunga liar alami yang melembutkan transisi antara jalan dan alam terbuka.

---

## 1. Peningkatan Tekstur Permukaan Jalan (`src/core/terrainGen.ts`)

- **Kalkulasi Nat Gelap Interlocking Paving Modular**:
  - Di dalam fungsi `getPathMaterialColor()` dan `applyPathBrush()`, tambahkan perhitungan alur nat (mortar grid calculation) berbasis koordinat dunia `(x, z)` yang telah dinormalisasi.
  - Membentuk pola interlocking cobblestone / paver berdimensi proporsional terhadap lebar jalan.
  - Alur garis nat (`mortar seams`) memiliki kontras gelap tajam (`multiplier ~0.65 - 0.72`) sehingga alur ubin tampak tegas dari kejauhan maupun saat didekati.
- **Gradasi Permukaan Ubin (Crowned Paver Gradient)**:
  - Setiap ubin batu memiliki gradasi halus: lebih terang di bagian puncak ubin (center crown) dan meredup menuju batas sambungan nat, memberikan kedalaman relief tanpa noise kasar/speckle.
- **Garis Pembatas Bahu Jalan (Bevel Shoulder Accent)**:
  - Pada batas tepi jalur (`normDist 0.72 - 0.88`), buat garis batas paving yang tegas untuk memisahkan area ubin solid dengan tanah atau kerikil bahu jalan.

---

## 2. Dekorasi Tepian Jalan: Batu Pembatas Paving & Rumput Bunga (`src/core/modelFactory.ts`)

- **Model 3D Batu Pembatas Paving (`path_curb_stones`)**:
  - Dibuat dari blok batu andesit/granit modular bergaya low-poly modern dengan bevel sudut rapi dan contact shadow lembut di bagian bawah.
  - Memiliki orientasi rotasi otomatis yang mengikuti arah lekukan jalur jalan.
- **Model 3D Tepian Kombinasi (`path_curb_with_foliage`)**:
  - Menggabungkan batu pembatas paving dengan rumpun rumput padang hijau asri serta bunga liar kecil warna-warni (merah muda, kuning, putih) di sampingnya.
- **Registrasi ke `STANDARD_PALETTE`**:
  - Memasukkan kedua aset ini ke dalam daftar palet objek kategori `path` & `foliage`, sehingga Anda juga dapat menaruhnya secara manual di mana saja pada pulau diorama.

---

## 3. Penataan Otomatis di Jalur Wisata (`src/core/terrainGen.ts` & `src/App.tsx`)

- **Penempatan Otomatis Sepanjang Jalur (`generateProceduralTrails`)**:
  - Saat tombol *Bangun Jalan Setapak Otomatis* ditekan, algoritma akan menghitung offset tegak lurus (kiri dan kanan) terhadap garis spline jalur.
  - Menempatkan batu pembatas paving dan rumpun bunga secara selang-seling di tepian luar jalan (pada radius tepi jalan `~1.0x - 1.2x`).
  - Memastikan ketinggian vertikal (sumbu Y) diposisikan persis menempel pada kontur permukaan tanah menggunakan `getSampledHeightAt()` agar tidak melayang atau tenggelam.
- **Dukungan Tombol "Rapikan & Solidkan ✨"**:
  - Tombol rapikan akan otomatis mengecek dan menyelaraskan posisi semua batu pembatas dan bunga tepian agar selalu menempel rapat dengan kontur pulau.

---

## 4. Antarmuka Pengontrol di ControlDock (`src/components/ControlDock.tsx`)

- **Toggle Opsi Dekorasi Tepian Jalan**:
  - Di dalam tab *Sculpt / Jalan*, sediakan opsi saklar checkbox: **"Dekorasi Tepian Jalan (Batu Pembatas & Rumput Bunga)"** (aktif secara default).
  - Badge indikator visual: `"Tekstur Paving Solid & Nat Gelap: Aktif ✨"`.
- **Dukungan Pemilihan Gaya**:
  - Memberikan opsi kustomisasi cepat untuk mengatur kerapatan dekorasi tepian atau membersihkan tepian jika ingin jalan polos.

---

## 5. Rencana Verifikasi & Uji Kualitas

1. **Uji Tekstur Permukaan**:
   - Memeriksa tampilan jalan saat kuas dioleskan maupun saat jalan otomatis dibuat; pastikan motif interlocking paving dengan alur nat gelap terlihat tegas dan bebas dari artefak visual.
2. **Uji Tepian Jalan**:
   - Memeriksa bahwa batu pembatas dan bunga-bunga liar tertata rapi di samping jalur tanpa menghalangi tengah jalan dan tidak melayang di udara.
3. **Uji Performa & Build**:
   - Menjalankan `compile_applet` dan `lint_applet` untuk menjamin tidak ada error TypeScript maupun degradasi FPS pada perangkat seluler/desktop.
