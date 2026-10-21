# Optimasi Performa Grafis 3D & Kelancaran Navigasi Kamera HP Mobile

Rencana komprehensif untuk meningkatkan performa rendering 3D Three.js pada perangkat HP (mobile), mengatasi lag saat rotasi/geser/zoom kamera, menerapkan instancing terpadu untuk vegetasi dan dekorasi tepian jalan, membersihkan artefak kotak hitam pada tanah, serta menerapkan batas resolusi layar dan bayangan adaptif yang hemat daya dan baterai.

## User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan jawaban klarifikasi yang telah Anda konfirmasi:
> 1. **Fokus Kendala**: Pergerakan kamera 3D di perangkat HP mobile (rotasi, panning, dan zooming).
> 2. **Strategi Grafis**: Instanced mesh untuk vegetasi, penyatuan geometri pembatas jalan, dan batas resolusi layar HP (DPR ceiling).
> 3. **Kualitas Bayangan**: Menggunakan resolusi bayangan dinamis ringan adaptif (512×512 pada mobile) dengan penyesuaian bias untuk mencegah artefak kotak hitam (seperti yang terlihat pada tangkapan layar di tepian jalan).

- **Batas Device Pixel Ratio (DPR) Mobile**: Pada layar HP dengan kepadatan tinggi (DPR 2.5–3.5), renderer saat ini memproses jutaan piksel berlebih. Kami membatasi DPR mobile di angka `1.0` (opsi hingga `1.25` pada preset High) sehingga fillrate GPU meningkat hingga 300% lebih cepat tanpa mengurangi ketajaman visual UI.
- **Pembersihan Artefak Kotak Hitam**: Menghapus `createContactShadowDisc` dari objek mikro/dekorasi tepian jalan (`path_curb_stones` dan `path_curb_with_foliage`) yang di mobile WebGL menyebabkan kotak hitam pekat di atas tanah karena konflik `polygonOffset` dan depth buffer.
- **Penyatuan Geometri Vegetasi & Pembatas**: Menggabungkan bagian-bagian kecil (bunga, tangkai, kelopak, batu) menjadi geometri gabungan per-material sehingga draw call instanced mesh turun drastis dari puluhan menjadi hanya 1-2 call per tipe.
- **Zero-GC Render Loop**: Menghilangkan operasi `filter` dan `sort` array `placedObjects` di setiap frame animasi (16ms) pada pencahayaan lampu, menggantikannya dengan sistem throttle/dirty-flag saat posisi kamera atau objek berubah signifikan.

---

## 1. Overview & Core Concept

- **Apa yang Dihadirkan**: Pengalaman navigasi 3D yang mulus 60 FPS di layar sentuh ponsel tanpa lag, panas berlebih, atau patah-patah saat memutar dan menjelajahi pulau buatan.
- **Target Pengguna**: Pengguna smartphone Android dan iOS yang ingin membangun kontur, jalan paving, dan menata pulau TerraForge secara nyaman dengan satu jari (mode Putar, Geser, Zoom).
- **Nilai Utama**: Penurunan beban GPU & CPU ponsel hingga 60%, pergerakan kamera instan responsif, dan tampilan pulau yang bersih dari cacat visual (glitch hitam).

---

## 2. User Experience & Visual Design

- **Kelancaran Interaksi Layar Sentuh**:
  - Damping kamera (`controls.dampingFactor`) disesuaikan agar terasa berbobot namun responsif seketika saat jari menyentuh dan menggeser layar.
  - Tiga tombol mode kamera di TopBar (**Putar**, **Geser**, **Zoom**) merespons instan tanpa input delay.
- **Tampilan Visual yang Tetap Indah & Bersih**:
  - Bayangan matahari tetap lembut dan dramatis, namun diproses dengan tekstur 512×512 berbobot ringan di HP, menghindari render pass berat 2048px desktop.
  - Rumput padang dan bunga liar di tepi jalan tampil padat dan alami tanpa cacat bayangan gelap kotak-kotak.
  - UI dock bawah dan kontrol tetap tajam di resolusi native DOM, sementara canvas 3D disesuaikan skalanya secara cerdas.
- **Indikator Skala & Opsi Grafis**:
  - Menu resolusi (`ResolutionScaleMenu`) otomatis mendeteksi profil perangkat mobile dan menetapkan rekomendasi default seimbang (Biasa / Seimbang).

---

## 3. Key Product Decisions & Trade-Offs

- **Keputusan 1: Pembatasan DPR Mobile (1.0x vs Native 3.0x)**
  - *Pendekatan*: Membatasi `renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.15 : 2.0) * renderScale)`.
  - *Alasan*: Layar HP modern memiliki kerapatan 400+ PPI. Rendering 3D pada 1.0x atau 1.15x hampir tidak terlihat bedanya bagi mata manusia, tetapi menghemat beban komputasi shader hingga 4 kali lipat.
  - *Alternatif Ditinggalkan*: Membiarkan DPR native yang membebani GPU Mali/Adreno hingga throttle suhu dan FPS drop ke <20 FPS.

- **Keputusan 2: Pemusnahan Kotak Hitam Tepian Jalan (Eliminasi Contact Shadow pada Mikro-Objek)**
  - *Pendekatan*: Menghapus quad bayangan kontak planar pada model `path_curb_stones` dan `path_curb_with_foliage`, serta menyederhanakan blade rumput.
  - *Alasan*: Bayangan kontak planar berukuran kecil saling tumpuk pada kemiringan kontur pulau menyebabkan Z-fighting dan artefak kotak hitam transparan pada WebGL mobile.
  - *Alternatif Ditinggalkan*: Mengatur bias material secara manual yang tetap rentan glitch di berbagai vendor GPU mobile.

- **Keputusan 3: Penggabungan Geometri (Merged BufferGeometries) untuk Foliage & Curb**
  - *Pendekatan*: Menggabungkan bagian geometri batu dan tangkai bunga menjadi 1 BufferGeometry per material dalam template model, sehingga `InstancedMesh` hanya memerlukan 1-2 instance draw call per kategori.
  - *Alasan*: Mengurangi jumlah draw calls dari ratusan menjadi di bawah 20 saat ribuan batu pembatas dan rumput menghiasi rute jalan.

- **Keputusan 4: Optimasi Garbage Collection pada Loop Animasi**
  - *Pendekatan*: Cache alokasi lampu sorot (`lightSources`) dan hitung ulang jarak kamera hanya saat kamera berpindah lebih dari 3 unit atau setiap 500ms, bukan setiap 16ms (60 kali per detik).
  - *Alasan*: Menghentikan freeze mikro (*jank*) yang disebabkan oleh JavaScript GC saat melakukan sort array ribuan elemen setiap frame.

---

## 4. Technical Architecture & Data Strategy

### Diagram Alur Rendering & Optimasi Mobile

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Device & Viewport Detection                     │
│               (isMobile = Touch Device / Screen Width < 768px)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Adaptive Three.js Renderer Pipeline                   │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ Mobile DPR Cap: 1.0–1.15│  │ ShadowMap Res: 512px (Mobile) / 1024│  │
│  │ PCFShadowMap (Fast Filter│  │ NormalBias: 0.04 (No Shadow Acne)   │  │
│  └─────────────────────────┘  └─────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Scene & Geometry Optimizations                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 1. Unified InstancedMesh: Merged curb stones & foliage geometries│  │
│  │ 2. Remove Plane Contact Shadows from micro path props            │  │
│  │ 3. Throttle light sorting in animation loop (No GC churn)       │  │
│  │ 4. Frustum culling enabled on all instance buffers               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             Silky 60 FPS OrbitControls on Touch Screen                 │
│         (Responsive Rotation, Pan, and Zoom without Thermal Lag)       │
└────────────────────────────────────────────────────────────────────────┘
```

### Pemetaan Komponen & Perubahan File

1. **`src/components/Viewport3D.tsx`**:
   - Deteksi platform mobile untuk mengatur DPR ceiling (`max 1.15` di mobile vs `2.0` di desktop).
   - Pengaturan resolusi bayangan directional light adaptif: `512` pada preset medium/mobile, `1024` pada desktop high.
   - Perbaikan render loop: throttle penghitungan sumber lampu sorot terdekat (menghindari GC allocations per-frame).
   - Penyesuaian `controls.dampingFactor` untuk sentuhan layar sentuh mobile.
2. **`src/core/modelFactory.ts`**:
   - Pembersihan `createContactShadowDisc` dari `path_curb_stones` dan `path_curb_with_foliage` untuk menghilangkan kotak hitam di tangkapan layar.
   - Penggabungan multi-part geometries untuk rumput dan bunga liar menjadi geometri komposit per-material yang ringan.
3. **`src/core/navigationRoute.ts`**:
   - Optimasi interval pasang batu pembatas paving (`curbStride`) agar menghasilkan tata letak proporsional yang rapi dengan jumlah instans yang efisien.
4. **`src/components/GraphicsSettingsModal.tsx` & `ResolutionScaleMenu.tsx`**:
   - Menyesuaikan label dan skala default agar ramah terhadap baterai dan performa ponsel.
