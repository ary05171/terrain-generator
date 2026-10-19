# Implementasi Navigasi Pin A-B Berbasis Algoritma A* & Peningkatan Kontrol UI/UX

Rencana implementasi algoritma pencarian jalur A* (*A-Star Search*) pada utilitas `core/terrainGen` untuk menghitung rute optimal antara bangunan di TerraForge 3D. Algoritma ini secara ketat menghindari tabrakan bangunan, memperhitungkan elevasi lereng terjal dan perairan pulau, serta menghasilkan urutan node navigasi yang dihaluskan menjadi kurva spline bergradasi mulus. Dilengkapi dengan kontrol visualisasi node kisi A* dan penambahan titik singgah perantara (*intermediate waypoint* Pin C).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan jawaban klarifikasi yang telah dikonfirmasi oleh pengguna:
> 1. **Resolusi Grid & Penghalusan Node**: Menggunakan grid adaptif seimbang (cell size ~1.5–2.0 unit) dengan smoothing pasca-pencarian (*path pruning / string pulling*) dan interpolasi kurva spline *Catmull-Rom* untuk menjaga performa real-time 60 FPS di perangkat sentuh.
> 2. **Perhitungan Bobot Biaya Medan (Cost Function)**:
>    - Biaya dasar = jarak Euclidean antar node (g-score).
>    - Bangunan/rintangan solid = *Infinite cost* (zona tidak dapat dilalui / clearance radius).
>    - Air / laut = *High penalty cost* (hanya dapat dilewati jika ada jembatan kayu atau saat perakitan jembatan aktif).
>    - Kemiringan lereng (slope steepness) = *Slope penalty* (menghindari tebing curam kecuali ada tangga kayu).
> 3. **Peningkatan UI/UX Kontrol**:
>    - **Visualisasi Node Kisi A***: Sakelar toggle untuk menampilkan titik-titik kisi pencarian A* (open/closed set atau waypoint nodes) yang berpendar di atas permukaan tanah.
>    - **Titik Singgah Perantara (Pin C Waypoint)**: Kemampuan menambahkan waypoint ketiga (Pin C) untuk membelokkan atau mengarahkan rute melalui area tertentu sebelum tiba di Pin B.

---

## 1. Overview & Core Concept

### What It Does
- **A* Search Engine di `core/terrainGen`**: Modul pencarian rute terstruktur yang memetakan pulau menjadi kisi graf bernavigasi. Algoritma mengevaluasi $f(n) = g(n) + h(n)$ dengan heuristik jarak Euclidean terarah, menghasilkan lintasan terpendek yang aman melewati sela-sela bangunan, jurang, dan danau.
- **Node Smoothing & Spline Interpolation**: Titik-titik node hasil kisi A* disederhanakan (*string pulling*) untuk membuang zigzag ortogonal yang kaku, lalu diinterpolasikan menjadi pita pita jalan 3D yang melengkung alami mengikuti kontur pulau.
- **Dukungan Titik Singgah Perantara (Waypoint Pin C)**: Pengguna dapat menyisipkan Pin C di antara Pin A dan Pin B, sehingga rute A* dihitung berantai: $A \rightarrow C \rightarrow B$.
- **HUD Kontrol & Visualisasi Node**: Panel mengambang dengan tombol sakelar *Tampilkan Node A\**, opsi *Tambah Titik Singgah*, serta status rute terperinci (jumlah node, elevasi tanjakan, dan rintangan yang dielakkan).

### Target Persona
Pengguna perangkat mobile layar sentuh dan desktop yang mendesain lanskap pulau 3D, menginginkan jalur jalan yang logis melintasi perkampungan tanpa menembus dinding bangunan atau menuruni tebing tegak yang mustahil dilewati pejalan kaki.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Perhitungan Rute Otomatis A***:
   - Saat pengguna menggeser Pin A, Pin B, atau Pin C di layar sentuh, fungsi A* di `core/terrainGen` secara instan menghitung lintasan node terbebas dari tabrakan.
   - Jika terdapat bangunan rapat (misal kincir angin dan pondok chalet yang berdekatan), algoritma menemukan celah koridor jalan terbaik di antara kedua bangunan tersebut.

2. **Visualisasi Node Kisi A* (A* Debug & Inspection Mode)**:
   - Pengguna menekan tombol sakelar `[ 👁️ Visual Node A* ]` di panel HUD.
   - Di atas pulau muncul titik-titik node navigasi bercahaya lembut (cyan/emerald markers) yang menunjukkan simpul-simpul jalur yang dipilih oleh algoritma A*.
   - Memberikan transparansi visual kepada pengguna mengapa rute memilih belokan tertentu.

3. **Menambahkan Titik Singgah Perantara (Pin C Waypoint)**:
   - Pengguna menekan tombol `[ ➕ Tambah Titik Singgah (Pin C) ]`.
   - Muncul Pin C (berwarna ungu/violet `#a855f7`) di tengah pulau.
   - Rute terbelah menjadi dua segmen mulus: dari Pin Mulai (A) menuju Titik Singgah (C), lalu berakhir di Pin Tujuan (B).
   - Pengguna dapat menyeret Pin C secara bebas dengan sentuhan layar. Menekan tombol `[ ✕ Hapus Pin C ]` mengembalikan rute ke format langsung A-B.

4. **Pencetakan Rute Jalan (Bake Trail)**:
   - Menekan `[ 🚶‍♂️ Terapkan Jalan ]` mengubah seluruh rangkaian node A* menjadi jalan paving batu permanen dan memasang jembatan di atas titik air yang dilintasi.

### Visual Identity & Theme
- **Pin Markers**:
  - Pin A: Tiang logam + lentera oranye kemerahan (`#f97316`).
  - Pin B: Tiang logam + lentera biru toska (`#06b6d4`).
  - Pin C (Waypoint): Tiang logam + lentera ungu elektrik (`#a855f7`) dengan cincin denyut (*pulsing beacon ring*).
- **Node Visualizer**:
  - Titik node navigasi A*: Bola-bola cahaya minimalis berdiameter 0.35 unit yang melayang 0.15 unit di atas tanah dengan warna pendar neon.
- **HUD Layout**:
  - Panel kaca gelap elegan (`bg-slate-950/90 backdrop-blur-xl border border-slate-800/90 rounded-2xl`) di pojok kiri atas.
  - Tab seleksi 3 pin yang responsif (A, B, C) serta ringkasan metrik A* (panjang meter, jumlah node simpul, dan status kelayakan lereng).

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Penempatan Algoritma A* di `core/terrainGen.ts`
- **Pendekatan Terpilih**: Mengimplementasikan fungsi pencarian A* utama (`findAStarPath` / `calculateAStarNavigationPath`) langsung di dalam `src/core/terrainGen.ts` dengan ekspor publik, memanfaatkan fungsi pembantu `getSampledHeightAt`, konfigurasi terrain, dan array rintangan yang sudah ada.
- **Alasan**: Sesuai dengan instruksi eksplisit pengguna (*"in the core/terrainGen utility"*), menyatukan logika komputasi geometri terrain dan graf navigasi dalam satu pustaka inti yang independen dari siklus render React.
- **Integrasi**: `src/core/navigationRoute.ts` dan `src/components/Viewport3D.tsx` mengonsumsi utilitas ini untuk rendering 3D dan kontrol interaktif.

### Decision 2: Resolusi Grid & Skalabilitas Heuristik
- **Pendekatan Terpilih**: Grid spasial beresolusi adaptif (~1.5–2.0 unit per langkah) yang dibatasi pada area *bounding box* antara titik awal dan tujuan (dengan padding margin aman).
- **Alasan**: Mencegah overhead komputasi O(N) yang berlebihan pada perangkat ponsel saat pin digeser terus-menerus (60 FPS), sementara tetap memberikan akurasi tinggi saat mengitari sudut bangunan.
- **String Pulling / Smoothing**: Garis lurus yang tidak menabrak rintangan disederhanakan sebelum dikirim ke `THREE.CatmullRomCurve3`.

### Decision 3: Titik Singgah Perantara (Pin C Waypoint)
- **Pendekatan Terpilih**: Struktur state `NavigationRouteState` mendukung array dinamis `waypoints` atau pin perantara opsional `pinC?: NavigationPin`.
- **Alasan**: Pengguna mendapatkan kontrol desain rute yang jauh lebih leluasa untuk membentuk jalur melingkar, jalan setapak panorama pesisir, atau rute wisata pulau.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TerraForge 3D - Navigation                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Touch Drag Events (Pin A, B, C) ──► Viewport3D                       │
│                                           │                            │
│                                           ▼                            │
│                  src/core/terrainGen.ts :: findAStarPath               │
│                  ├─ Spatial Grid Mapping (Step ~1.8m)                  │
│                  ├─ Cost Function Evaluation:                          │
│                  │  ├─ Distance (Euclidean)                            │
│                  │  ├─ Building Collision (Infinite Cost)             │
│                  │  ├─ Slope Steepness Cost Penalty                    │
│                  │  └─ Deep Water Cost Penalty                         │
│                  ├─ Priority Queue / Min-Heap A* Search                │
│                  ├─ String Pulling / Raycast Shortcut Optimizer        │
│                  └─ Catmull-Rom Spline Curve Interpolation             │
│                                           │                            │
│                                           ▼                            │
│                  3D Scene Viewport Presentation                        │
│                  ├─ Route Ribbon Mesh (Color Gradient A-C-B)           │
│                  ├─ A* Node Visualization Points (Toggleable)          │
│                  ├─ Building Doorway Snapping & Loop Logic             │
│                  └─ Interactive HUD (Pin Tabs, Add C, Bake Trail)      │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model Extension (`src/types/index.ts`)

```typescript
export interface NavigationPin {
  id: 'A' | 'B' | 'C';
  position: [number, number, number];
  boundBuildingId?: string | null;
  isSnappedToDoor?: boolean;
}

export interface AStarNavigationResult {
  path: [number, number, number][];      // Kurva halus terinterpolasi
  nodes: [number, number, number][];     // Titik-titik node simpul hasil A*
  totalCost: number;
  lengthMeters: number;
  hasSteepSlope: boolean;
  crossesWater: boolean;
  exploredNodeCount: number;
}
```

### Signature Fungsi di `src/core/terrainGen.ts`

```typescript
export function findAStarPath(
  startPos: [number, number, number],
  endPos: [number, number, number],
  heights: Float32Array,
  terrainSize: number,
  resolution: number,
  waterLevel: number,
  obstacles: { x: number; z: number; radius: number }[],
  options?: {
    gridStep?: number;
    allowWater?: boolean;
    maxSlope?: number;
  }
): AStarNavigationResult;
```

---

## 5. Verification Plan

1. **Pengujian Algoritma A* di `src/core/terrainGen.ts`**:
   - Tambahkan unit test di `src/core/terrainGen.test.ts` untuk memverifikasi `findAStarPath` mampu menemukan jalan memutar mengitari rintangan lingkaran tanpa menabrak radius aman.
   - Uji penalti lereng curam dan penalti air.
2. **Pengujian Visualisasi Node**:
   - Aktifkan toggle *Node A\** di HUD dan pastikan simpul-simpul A* dirender di atas tanah sebagai bola pendar kecil.
3. **Pengujian Pin C (Titik Singgah)**:
   - Tambahkan Pin C, seret ke sudut pulau, dan verifikasi bahwa jalur menghubungkan $A \rightarrow C \rightarrow B$ dengan mulus.
4. **Verifikasi Build & Lint**:
   - Jalankan `npm test`, `npm run lint`, dan `compile_applet` untuk menjamin tidak ada kesalahan tipe data TypeScript atau regresi build.
