# Integrasi Kontrol Waktu & Cahaya ke Menu Bawah serta Peningkatan Kecerahan Objek

Penyatuan kontrol waktu 24 jam dan efek lampu ke dalam tab baru "Waktu & Cahaya" pada dock menu bawah yang dapat digeser, perapihan tata letak layar dari floating panel yang menghalangi pandangan, serta optimalisasi pencahayaan *ambient* dan *hemisphere shadow fill* agar seluruh objek 3D tampil cerah, jelas, dan hidup.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan jawaban klarifikasi yang telah dikonfirmasi:
> - **Penyatuan Menu**: Seluruh pengatur waktu (slider 24 jam, tombol play/pause, kecepatan siklus, preset jam) dan pengatur efek area cahaya lampu dipindahkan sepenuhnya ke dalam **menu dock bawah yang dapat digeser**. Floating bar di tengah layar dihilangkan agar *viewport* 3D bersih dan lega.
> - **Penempatan di Menu Bawah**: Dibuatkan tab khusus baru bernama **"Waktu & Cahaya"** (ikon jam/matahari) di samping tab Terrain, Sculpt, Objek, dan Aset. Tombol indikator jam di TopBar tetap tersedia sebagai shortcut cepat yang membuka tab ini di dock bawah.
> - **Penyesuaian Kecerahan Objek**: Peningkatan signifikan pada intensitas *ambient light* dan *hemisphere ground fill* pada siklus 24 jam untuk menghilangkan bayangan hitam pekat (*pitch-black shadows*), plus penambahan slider pengatur **Kecerahan Bayangan & Objek (*Shadow Fill & Ambient Light*)** agar pengguna dapat menyesuaikan kecerahan sesuai preferensi.

---

## 1. Overview & Core Concept

1. **Viewport Bersih & Terorganisir**: Menghilangkan panel mengambang (*floating overlay*) di tengah atas layar dan mengintegrasikan seluruh kontrol ke dalam panel menu bawah (*ControlDock*). Pengguna dapat melihat pemandangan pulau 3D secara penuh tanpa terhalang tombol.
2. **Tab "Waktu & Cahaya" Lengkap**:
   - Digital Clock & Phase Badge (`17:30 - Golden Hour`).
   - Tombol Play/Pause siklus waktu dan pemilih kecepatan (`1x`, `2x`, `5x`, `10x`, `30x`).
   - Slider 24 jam presisi tinggi.
   - Tombol lompat cepat preset waktu (Fajar, Siang, Golden Hour, Senja, Malam, Tengah Malam).
   - Pengaturan efek area cahaya tanah lampu (Otomatis, Selalu On, Off, Intensitas, Radius, Pendaran Dinamis).
   - Slider Kecerahan Bayangan & Objek (*Ambient Lighting Fill*).
3. **Pencahayaan Seimbang & Terang**:
   - Menaikkan batas bawah pencahayaan ambient pada malam, senja, dan siang hari sehingga sisi bayangan pohon, rumah, bebatuan, dan struktur tetap memiliki detail warna yang jelas dan estetik (gaya low-poly diorama cerah).

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Mengakses Kontrol Waktu & Cahaya**:
   - Pengguna mengklik tab **Waktu & Cahaya** pada dock menu bawah yang dapat digeser (*scrollable tabs bar*).
   - Atau pengguna mengklik tombol status jam di TopBar (`Jam: 17:30`), yang secara otomatis membuka dock bawah langsung pada tab Waktu & Cahaya.
2. **Mengatur Jam dan Menjalankan Siklus**:
   - Di dalam tab, pengguna dapat menggeser slider 24 jam, menekan Play (▶) untuk menjalankan animasi siang-malam, atau menekan tombol lompat cepat (Fajar, Siang, Senja, Malam).
3. **Menyesuaikan Kecerahan Objek & Efek Lampu**:
   - Pengguna dapat menggeser slider **Kecerahan Bayangan (*Shadow Fill*)** jika pemandangan dirasa terlalu gelap atau kontras.
   - Pengguna dapat mengatur intensitas dan radius lingkaran pendaran lampu di tanah.

### Visual Architecture & Dock Tabs Hierarchy
```
┌────────────────────────────────────────────────────────────────────────┐
│                        TERRAFORGE 3D VIEWPORT                          │
│                (Lega, 100% Unobstructed Clean View)                    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        SLIDING BOTTOM DOCK                             │
│  [Medan] [Pahat] [Objek] ★ [Waktu & Cahaya] ★ [Aset 3D] [Ekspor]       │
├────────────────────────────────────────────────────────────────────────┤
│  TAB WAKTU & CAHAYA:                                                   │
│  ┌─ Jam & Siklus ────────────────┐ ┌─ Efek Area Cahaya Lampu ────────┐ │
│  │ 17:30 [▶ Play] [1x 2x 5x 10x] │ │ Mode: [Otomatis 🌙] [On] [Off] │ │
│  │ Slider 24 Jam (00:00 - 24:00) │ │ Intensitas Pendaran: [===== ]  │ │
│  │ Preset: [Fajar][Siang][Senja] │ │ Radius Area Tanah:   [===   ]  │ │
│  └───────────────────────────────┘ └─────────────────────────────────┘ │
│  ┌─ Kecerahan Objek & Bayangan ──────────────────────────────────────┐ │
│  │ Intensitas Cahaya Sekitar (Ambient Fill): [======     ] 1.3x      │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Product Decisions & Trade-Offs

1. **Penyatuan ke Dock Bawah vs Floating Panel**:
   - *Keputusan*: Menghapus `TimeControlBar` dari overlay atas dan memindahkannya ke dalam `ControlDock`.
   - *Alasan*: Menjawab keluhan pengguna bahwa tombol-tombol bertumpuk dan menutupi tampilan 3D. Menyatukan semua kontrol ke menu geser bawah memberikan ergonomi sentuh yang konsisten pada desktop maupun mobile.
2. **Peningkatan Pencahayaan Sekitar (*Ambient & Hemisphere Fill*)**:
   - *Keputusan*: Meningkatkan intensitas dasar ambient light dari 0.12–0.18 menjadi 0.35–0.48 pada malam hari dan 0.40–0.55 pada siang hari, serta mencerahkan warna hemisphere ground fill.
   - *Alasan*: Menghilangkan bayangan hitam pekat (*crushed blacks*) pada objek 3D non-terpapar matahari langsung, sekaligus menjaga nuansa malam tetap kontras dan atmosferik.
3. **Shortcut Interaktif di TopBar**:
   - *Keputusan*: Tombol jam di TopBar tidak menampilkan panel melayang terpisah, melainkan berfungsi sebagai pemicu untuk membuka dock bawah dan mengaktifkan tab Waktu & Cahaya.

---

## 4. Technical Architecture & Data Strategy

### Component & State Plan
- **`src/types/index.ts`**:
  - Tambah properti `ambientBrightness?: number` (0.6x - 2.0x, default 1.0x) pada `LampSettings` atau state pencahayaan.
  - Perbarui tipe `TabType` di `ControlDock.tsx` untuk menyertakan `'lighting'`.
- **`src/core/timeLighting.ts`**:
  - Naikkan nilai dasar `ambientIntensity`, `hemiIntensity`, dan `hemiGroundColor` pada seluruh `KEYFRAMES`.
  - Dukung pengali `ambientMultiplier` untuk penyesuaian kecerahan bayangan secara dinamis.
- **`src/components/ControlDock.tsx`**:
  - Tambahkan tab `lighting` dengan icon `SunMedium` / `Clock`.
  - Implementasikan panel kontrol waktu, siklus hari-malam, efek area cahaya lampu, dan slider kecerahan bayangan.
- **`src/components/TopBar.tsx` & `src/App.tsx`**:
  - Hapus komponen overlay melayang `TimeControlBar`.
  - Hubungkan tombol jam di TopBar agar memanggil aksi `onOpenLightingTab()`.
