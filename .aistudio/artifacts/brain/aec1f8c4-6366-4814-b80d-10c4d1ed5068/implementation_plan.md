# Implementasi Petak Tanah Tanam Cangkul, Animasi Angin Dinamis, & Starter Kit Three.js WebGL

Menambahkan model petak tanah cangkul modular dengan tahapan interaktif (kering, basah, bertunas, panen), sistem simulasi hembusan angin prosedural pada dedaunan pohon dan rumput dengan slider pengatur, serta paket starter kit Three.js WebGL mandiri (`index.html` + `app.js`) di dalam file ZIP ekspor.

## User Review & Critical Decisions

> [!IMPORTANT]
> Hasil konfirmasi dari tanya-jawab interaktif:
> - **Petak Tanah Cangkul**: Dibuat sebagai objek modular dengan visual alur gundukan cangkul dan memiliki 4 tahapan status: Kering (*dry*), Basah (*hydrated/watered*), Bertunas (*sprout*), dan Siap Panen (*mature crop*), yang dapat diubah statusnya secara langsung di kanvas.
> - **Animasi Hembusan Angin**: Sistem animasi dinamis berbasis per-instance phase offset pada pohon dan rumput, dikendalikan oleh slider kecepatan angin (*wind speed*) dan intensitas goyangan (*wind strength*) di antarmuka.
> - **Paket Ekspor Three.js**: Menambahkan folder `threejs-starter/` di dalam ZIP lengkap berisi file `index.html` dan `app.js` siap jalan yang dapat langsung di-double click atau diintegrasikan ke proyek game WebGL pengguna.

- **Keputusan Terkonfirmasi 1**: Objek petak tanah dimasukkan ke dalam palet objek dan memiliki *state switcher* di inspector objek saat dipilih di kanvas.
- **Keputusan Terkonfirmasi 2**: Animasi angin dihitung pada *render loop* tanpa membebani CPU, dengan opsi mematikan atau mengatur kecepatan hembusan secara bebas.
- **Keputusan Terkonfirmasi 3**: Starter kit Three.js menggunakan impor ESM CDN modern (`three@0.160` + `OrbitControls` + `GLTFLoader`) sehingga bekerja *out-of-the-box* tanpa perlu install node_modules.

---

## 1. Overview & Core Concept

- **Apa yang Dilakukan**:
  1. **Objek Petak Cangkul Pertanian**: Menghadirkan model petak tanah galian cangkul dengan gundukan alur realistis (furrowed tilled dirt), lengkap dengan 4 tahap pertanian (kering, disiram air, bertunas, dan panen gandum/tanaman).
  2. **Simulasi Angin Alami (Foliage Wind Sway)**: Daun pohon dan helai rumput bergoyang secara harmonis mengikuti arah angin, dengan kontrol slider di antarmuka.
  3. **Starter Kit Game WebGL Three.js di ZIP**: Folder siap pakai yang memuat kode template viewer dan game logic interaksi petak tanah untuk mempermudah developer membuat game pertanian berbasis WebGL.
- **Nilai Utama**: Memungkinkan pengguna membangun visual perkebunan/desa pertanian yang hidup dan langsung membawa asetnya ke dalam game WebGL Three.js mereka dengan panduan dan kode siap pakai.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Menempatkan Petak Cangkul**:
   - Pengguna membuka tab **Place** > kategori **Foliage / Pertanian**.
   - Memilih item **Petak Cangkul (Tilled Plot)** dan meletakkannya di permukaan tanah pulau.
   - Saat petak diklik di kanvas, muncul *Inspector Bar* yang memungkinkan pengguna mengubah status:
     - 🟤 **Kering (Tilled Dry)**: Tanah gembur bergaris alur cangkul.
     - 💧 **Basah (Hydrated)**: Tanah cokelat pekat lembab setelah disiram.
     - 🌱 **Bertunas (Sprouts)**: Tumbuh tunas bibit hijau muda.
     - 🌾 **Panen (Harvest Ready)**: Tanaman siap panen berwarna emas/hijau lebat.
2. **Mengatur Animasi Angin**:
   - Di tab **Atmosphere / Waktu & Cuaca** (atau dock kontrol), terdapat modul **Simulasi Angin**:
     - Slider **Kecepatan Angin** (0.0x – 3.0x, default 1.0x).
     - Slider **Kekuatan Goyang** (0% – 100%, default 65%).
     - Tombol toggle **Tenang / Berangin**.
   - Pohon dan rumput di kanvas langsung merespons secara *real-time* dengan gerakan yang luwes.
3. **Ekspor & Menjalankan Game Three.js**:
   - Pengguna mengeklik tombol **Ekspor Paket Lengkap (.ZIP)**.
   - Mengekstrak ZIP dan membuka folder `threejs-starter/index.html`.
   - Browser langsung membuka pulau 3D dengan model GLB yang dimuat, animasi angin yang aktif, dan petak cangkul yang bisa diklik untuk mengubah tahapan tanam!

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Model Komposit Petak Cangkul Berbasis Sub-Mesh Hierarki**
  - *Pendekatan*: Membangun model petak cangkul berukuran 3x3 meter dengan alur gundukan melengkung menggunakan geometri prosedural Three.js (`BoxGeometry` & `CylinderGeometry` bersegmen alur), dilengkapi layer vegetasi bibit yang visibilitasnya dapat di-toggle (`cropMesh.visible`).
  - *Alasan*: Kompatibel penuh dengan GLTFExporter, menghasilkan file GLB yang rapi dengan material PBR terpisah untuk tanah kering, tanah basah, dan tanaman.

- **Decision 2: Animasi Angin Berbasis Hierarki Group & Mesh Rotation vs Vertex Shader**
  - *Pendekatan*: Menerapkan rotasi sinusoidal tertimbang per-bagian tajuk pohon (`canopyMesh.rotation.z` & `x`) dan rumput dengan *spatial phase offset* berbasis koordinat dunia `(x * 0.1 + z * 0.1)`.
  - *Alasan*: Bekerja mulus di Three.js canvas tanpa memerlukan shader kustom yang rumit saat diimpor kembali ke engine lain, sekaligus sangat hemat daya GPU di perangkat mobile.

- **Decision 3: Starter Kit Standalone Zero-Build (ESM CDN)**
  - *Pendekatan*: File `index.html` menggunakan `importmap` resmi Three.js dari CDN (cdnjs/unpkg), sehingga pengguna dapat langsung mengujinya menggunakan Live Server atau `python -m http.server` tanpa instalasi npm yang rumit.

---

## 4. Technical Architecture & System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       TerraForge 3D App                         │
│  - Palette: 'tilled_plot' (dry, wet, sprout, mature)            │
│  - Wind State: { speed: 1.0, strength: 0.65, enabled: true }     │
└───────────────┬─────────────────────────────────┬───────────────┘
                │                                 │
                ▼                                 ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│     Viewport3D (Canvas)      │  │      AssetIO (ZIP Bundle)    │
│  - Render Loop Wind Sway:    │  │  - models/island.glb         │
│    canopy.rotation.z = ...   │  │  - threejs-starter/          │
│  - Object Click Inspector:   │  │    ├── index.html            │
│    Ubah Stage Petak Cangkul  │  │    ├── app.js (Raycast & anim│
└──────────────────────────────┘  │    └── README_STARTER.md     │
                                  └──────────────────────────────┘
```

### Rencana File yang Dimodifikasi:
1. **`src/types/index.ts`**:
   - Menambahkan tipe status petak cangkul (`FarmPlotStage`: 'dry' | 'wet' | 'sprout' | 'mature').
   - Menambahkan tipe pengaturan angin (`WindSettings`: `{ speed: number; strength: number; enabled: boolean }`).
2. **`src/core/modelFactory.ts`**:
   - Membuat fungsi pembuat model 3D `createFarmPlotModel(stage)` dengan alur cangkul teratur, tanah gundukan, serta varian basah dan tanaman.
   - Mendaftarkan item baru pada `STANDARD_PALETTE`: "Petak Tanah Cangkul".
3. **`src/components/Viewport3D.tsx`**:
   - Menambahkan perhitungan goyangan angin pada loop animasi untuk objek berlabel pohon dan rumput.
   - Menambahkan handler interaksi stage petak tanah saat dipilih.
4. **`src/components/ControlDock.tsx`**:
   - Menambahkan kontrol slider Kecepatan Angin & Kekuatan Goyang di tab Atmosphere / Waktu & Tab Terrain.
   - Menambahkan tombol pengubah status petak di Inspector Bar saat petak cangkul dipilih.
5. **`src/core/assetIO.ts`**:
   - Menambahkan generasi folder `threejs-starter/` (dengan `index.html`, `app.js`, dan `README_STARTER.md`) ke dalam paket ZIP `exportFullProjectBundleZip`.
