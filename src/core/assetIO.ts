import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import JSZip from 'jszip';
import { CustomAssetRecord, PlacedObject, TerrainConfig } from '../types';

// In-memory cache for parsed custom user assets
const customAssetsCache = new Map<string, THREE.Group>();

/**
 * Register a custom asset model in memory
 */
export function registerCustomModel(id: string, group: THREE.Group): void {
  customAssetsCache.set(id, group);
}

/**
 * Retrieve a cloned instance of a custom registered model
 */
export function getCustomModelClone(id: string): THREE.Group | null {
  const template = customAssetsCache.get(id);
  if (!template) return null;
  return template.clone(true);
}

/**
 * Normalize and center imported 3D mesh at bottom-center (Y=0)
 */
function normalizeImportedModel(object: THREE.Object3D, targetHeight = 5.0): THREE.Group {
  const container = new THREE.Group();
  container.add(object);

  // Compute bounding box
  const box = new THREE.Box3().setFromObject(container);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Scale so max vertical height is targetHeight
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? targetHeight / maxDim : 1.0;
  object.scale.setScalar(scale);

  // Recompute box after scaling
  box.setFromObject(container);
  box.getCenter(center);

  // Shift so bottom is exactly at Y=0 and centered on X/Z
  object.position.x = -center.x;
  object.position.z = -center.z;
  object.position.y = -box.min.y;

  // Ensure shadows and materials are PBR ready
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => {
            if ('roughness' in m) (m as THREE.MeshStandardMaterial).roughness = 0.5;
          });
        } else if ('roughness' in mesh.material) {
          (mesh.material as THREE.MeshStandardMaterial).roughness = 0.5;
        }
      }
    }
  });

  return container;
}

/**
 * Parse an uploaded 3D file (GLB, GLTF, OBJ)
 */
export async function parseUploaded3DFile(file: File): Promise<CustomAssetRecord> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();

  return new Promise((resolve, reject) => {
    if (extension === 'glb' || extension === 'gltf') {
      const loader = new GLTFLoader();
      loader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          const group = normalizeImportedModel(gltf.scene);
          const id = 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
          group.name = id;
          registerCustomModel(id, group);

          let vertCount = 0;
          gltf.scene.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) {
              const m = c as THREE.Mesh;
              if (m.geometry) vertCount += m.geometry.attributes.position?.count || 0;
            }
          });

          resolve({
            id,
            name: file.name.replace(/\.[^/.]+$/, ''),
            format: extension === 'glb' ? 'glb' : 'gltf',
            fileSize: file.size,
            dataBuffer: arrayBuffer,
            vertexCount: vertCount,
          });
        },
        (error) => {
          reject(new Error('Failed to parse GLTF/GLB: ' + error.message));
        }
      );
    } else if (extension === 'obj') {
      const textDecoder = new TextDecoder();
      const objText = textDecoder.decode(arrayBuffer);
      const loader = new OBJLoader();
      try {
        const obj = loader.parse(objText);
        const group = normalizeImportedModel(obj);
        const id = 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        group.name = id;
        registerCustomModel(id, group);

        let vertCount = 0;
        obj.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            const m = c as THREE.Mesh;
            if (m.geometry) vertCount += m.geometry.attributes.position?.count || 0;
          }
        });

        resolve({
          id,
          name: file.name.replace(/\.[^/.]+$/, ''),
          format: 'obj',
          fileSize: file.size,
          dataBuffer: arrayBuffer,
          vertexCount: vertCount,
        });
      } catch (e: any) {
        reject(new Error('Failed to parse OBJ file: ' + e?.message));
      }
    } else {
      reject(new Error(`Unsupported file format .${extension}. Please use .glb, .gltf, or .obj`));
    }
  });
}

/**
 * Helper to download file blob in browser
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate human-readable README for exported ZIP packages
 */
function generateReadmeText(formatName: string, primaryFilename: string, islandBiome = 'archipelago'): string {
  return `===================================================================
TerraForge 3D - Paket Ekspor Dunia Pulau (${formatName})
===================================================================
Bioma       : ${islandBiome.toUpperCase()}
Diekspor Pada : ${new Date().toLocaleString()}
Aplikasi    : TerraForge 3D (Procedural World & City Builder)

ISI ARSIP ZIP:
-------------------------------------------------------------------
1. ${primaryFilename}
   Aset utama model 3D / heightmap pulau hasil kreasi Anda.
2. metadata.json
   Data terstruktur berisi konfigurasi elevasi pulau, seed acak,
   daftar koordinat objek bangunan & vegetasi, serta versi software.
3. README.txt
   Panduan teknis ini.

PANDUAN IMPOR KE SOFTWARE 3D:
-------------------------------------------------------------------
* BLENDER (3.x / 4.x):
  - Buka Blender baru, hapus default cube (X).
  - Pilih menu: File > Import > glTF 2.0 (.glb) atau Wavefront (.obj).
  - Arahkan ke file yang telah diekstrak dari ZIP ini.
  - Tekan tombol Z pada keyboard lalu pilih 'Material Preview' untuk
    melihat pencahayaan dan warna bioma secara utuh.

* UNITY ENGINE:
  - Ekstrak isi ZIP ke dalam folder 'Assets/Models' pada proyek Unity Anda.
  - Drag prefab/model ke dalam Hierarchy atau Scene View.
  - Jika menggunakan Heightmap PNG: buat Terrain baru > Terrain Settings >
    Import Raw Heightmap.

* UNREAL ENGINE 5:
  - Buka Content Drawer, klik tombol 'Import' lalu pilih file .glb atau .obj.
  - Centang opsi 'Generate Missing Collision' dan 'Import Materials'.

* THREE.JS / WEBGL:
  - Gunakan GLTFLoader() atau OBJLoader() dari three/addons untuk
    me-render langsung ke dalam canvas WebGL Anda.
===================================================================
`;
}

/**
 * Build metadata JSON structure
 */
function createExportMetadata(
  config?: TerrainConfig,
  placedObjects?: PlacedObject[],
  extra?: Record<string, any>
) {
  return {
    generator: 'TerraForge 3D',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    terrain: config
      ? {
          seed: config.seed,
          biome: config.biome,
          size: config.size,
          resolution: config.resolution,
          heightScale: config.heightScale,
          waterLevel: config.waterLevel,
          islandCoverage: config.islandCoverage,
          smoothShading: config.smoothShading,
          pathStyle: config.pathStyle,
          soilBrightness: config.soilBrightness ?? 1.15,
          soilWarmth: config.soilWarmth ?? 1.10,
          soilTextureGrain: config.soilTextureGrain ?? 0.65,
          shadingModel: config.smoothShading ? 'Smooth PBR Interpolated' : 'Faceted Low-Poly FlatShading',
          textureType: 'Procedural Multi-Octave Simplex Noise Baked Vertex Colors (COLOR_0)',
        }
      : null,
    placedObjectsCount: placedObjects?.length || 0,
    placedObjectsSummary: placedObjects
      ? placedObjects.reduce((acc, obj) => {
          acc[obj.type] = (acc[obj.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      : {},
    ...extra,
  };
}

/**
 * Export 3D scene / objects as Wavefront OBJ (.obj) packaged into a ZIP
 */
export async function exportSceneAsOBJ(
  sceneOrGroup: THREE.Object3D,
  filename = 'terraforge_world.obj',
  config?: TerrainConfig,
  placedObjects?: PlacedObject[]
): Promise<void> {
  const exporter = new OBJExporter();
  const objText = exporter.parse(sceneOrGroup);

  const zip = new JSZip();
  const baseName = filename.replace(/\.obj$/i, '');
  const objFileName = `${baseName}.obj`;

  zip.file(objFileName, objText);
  zip.file(
    'metadata.json',
    JSON.stringify(createExportMetadata(config, placedObjects, { format: 'Wavefront OBJ' }), null, 2)
  );
  zip.file('README.txt', generateReadmeText('Wavefront OBJ', objFileName, config?.biome));

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownload(zipBlob, `${baseName}_obj.zip`);
}

/**
 * Export 3D scene / objects as GLTF (.gltf) or Binary GLB (.glb) packaged into a ZIP
 */
export function exportSceneAsGLTF(
  sceneOrGroup: THREE.Object3D,
  binary = true,
  filename = 'terraforge_world.glb',
  config?: TerrainConfig,
  placedObjects?: PlacedObject[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      sceneOrGroup,
      async (gltf) => {
        try {
          const zip = new JSZip();
          const baseName = filename.replace(/\.(glb|gltf)$/i, '');
          const modelFileName = binary ? `${baseName}.glb` : `${baseName}.gltf`;

          if (gltf instanceof ArrayBuffer) {
            zip.file(modelFileName, gltf);
          } else {
            zip.file(modelFileName, JSON.stringify(gltf, null, 2));
          }

          zip.file(
            'metadata.json',
            JSON.stringify(
              createExportMetadata(config, placedObjects, {
                format: binary ? 'glTF 2.0 Binary (GLB)' : 'glTF 2.0 JSON (GLTF)',
              }),
              null,
              2
            )
          );
          zip.file(
            'README.txt',
            generateReadmeText(binary ? 'Binary GLB' : 'GLTF 2.0', modelFileName, config?.biome)
          );

          const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
          triggerDownload(zipBlob, `${baseName}_${binary ? 'glb' : 'gltf'}.zip`);
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      (error) => {
        reject(error);
      },
      { binary, embedImages: true }
    );
  });
}

/**
 * Export Three.js native JSON format packaged into a ZIP
 */
export async function exportSceneAsThreeJSON(
  sceneOrGroup: THREE.Object3D,
  filename = 'terraforge_scene.json',
  config?: TerrainConfig,
  placedObjects?: PlacedObject[]
): Promise<void> {
  const json = sceneOrGroup.toJSON();
  const output = JSON.stringify(json, null, 2);

  const zip = new JSZip();
  const baseName = filename.replace(/\.json$/i, '');
  const jsonFileName = `${baseName}.json`;

  zip.file(jsonFileName, output);
  zip.file(
    'metadata.json',
    JSON.stringify(createExportMetadata(config, placedObjects, { format: 'Three.js Scene JSON' }), null, 2)
  );
  zip.file('README.txt', generateReadmeText('Three.js Scene JSON', jsonFileName, config?.biome));

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownload(zipBlob, `${baseName}_threejs.zip`);
}

/**
 * Export heightmap array as 8-bit grayscale PNG canvas download packaged into a ZIP
 */
export function exportHeightmapPNG(
  heights: Float32Array,
  resolution: number,
  minH: number,
  maxH: number,
  filename = 'terraforge_heightmap.png',
  config?: TerrainConfig
): Promise<void> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(resolution, resolution);
    const range = Math.max(0.0001, maxH - minH);

    for (let i = 0; i < heights.length; i++) {
      const norm = Math.max(0, Math.min(1, (heights[i] - minH) / range));
      const val = Math.floor(norm * 255);
      const pIdx = i * 4;
      imgData.data[pIdx] = val;
      imgData.data[pIdx + 1] = val;
      imgData.data[pIdx + 2] = val;
      imgData.data[pIdx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve();
        return;
      }

      const zip = new JSZip();
      const baseName = filename.replace(/\.png$/i, '');
      const pngFileName = `${baseName}.png`;

      zip.file(pngFileName, blob);
      zip.file(
        'metadata.json',
        JSON.stringify(
          createExportMetadata(config, undefined, {
            format: 'Heightmap Grayscale PNG',
            resolution: `${resolution}x${resolution}`,
            minHeight: minH,
            maxHeight: maxH,
            elevationRangeMeters: (maxH - minH).toFixed(2),
          }),
          null,
          2
        )
      );
      zip.file('README.txt', generateReadmeText('Heightmap Grayscale PNG', pngFileName, config?.biome));

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      triggerDownload(zipBlob, `${baseName}_heightmap.zip`);
      resolve();
    }, 'image/png');
  });
}

/**
 * Export Complete All-In-One Project Bundle as a single organized ZIP
 */
export async function exportFullProjectBundleZip(
  sceneOrGroup: THREE.Object3D,
  heights: Float32Array,
  minH: number,
  maxH: number,
  config: TerrainConfig,
  placedObjects: PlacedObject[],
  baseFilename = 'terraforge_complete_project'
): Promise<void> {
  const zip = new JSZip();

  // 1. Export OBJ
  const objExporter = new OBJExporter();
  const objText = objExporter.parse(sceneOrGroup);
  zip.file(`models/${baseFilename}.obj`, objText);

  // 2. Export Three.js Scene JSON
  const sceneJson = JSON.stringify(sceneOrGroup.toJSON(), null, 2);
  zip.file(`scene/${baseFilename}_scene.json`, sceneJson);

  // 3. Export Heightmap PNG
  const canvas = document.createElement('canvas');
  canvas.width = config.resolution;
  canvas.height = config.resolution;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(config.resolution, config.resolution);
  const range = Math.max(0.0001, maxH - minH);

  for (let i = 0; i < heights.length; i++) {
    const norm = Math.max(0, Math.min(1, (heights[i] - minH) / range));
    const val = Math.floor(norm * 255);
    const pIdx = i * 4;
    imgData.data[pIdx] = val;
    imgData.data[pIdx + 1] = val;
    imgData.data[pIdx + 2] = val;
    imgData.data[pIdx + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  const pngBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (pngBlob) {
    zip.file(`heightmaps/${baseFilename}_heightmap.png`, pngBlob);
  }

  // 4. Export GLTF/GLB Binary
  await new Promise<void>((resolveGLB) => {
    const gltfExporter = new GLTFExporter();
    gltfExporter.parse(
      sceneOrGroup,
      (gltf) => {
        if (gltf instanceof ArrayBuffer) {
          zip.file(`models/${baseFilename}.glb`, gltf);
        } else {
          zip.file(`models/${baseFilename}.gltf`, JSON.stringify(gltf, null, 2));
        }
        resolveGLB();
      },
      () => resolveGLB(),
      { binary: true, embedImages: true }
    );
  });

    // 5. Shader Reference & GLSL Material Guide
    const shaderReferenceText = `// ===================================================================
// TerraForge 3D - Terrain Shader & PBR Material Reference
// ===================================================================
// Biome: ${config.biome.toUpperCase()}
// Shading Model: ${config.smoothShading ? 'Smooth Organic PBR' : 'Faceted Low-Poly (Patah-patah)'}
// Vertex Color Attribute: COLOR_0 (RGB float 0.0 - 1.0)
//
// KONSEP PEWARNAAN & TEKSTUR TERBAKAR (BAKED):
// Seluruh kecerahan tanah (${Math.round((config.soilBrightness ?? 1.15) * 100)}%), kehangatan (${Math.round(
      (config.soilWarmth ?? 1.10) * 100
    )}%),
// dan mikro-noise tekstur butiran (${Math.round(
      (config.soilTextureGrain ?? 0.65) * 100
    )}%) telah tertanam (baked)
// langsung ke dalam atribut COLOR_0 geometri di file .glb dan .obj.
//
// CONTOH KODE SHADER GLSL / THREE.JS / UNITY:
//
// [Vertex Shader]
// attribute vec3 position;
// attribute vec3 normal;
// attribute vec3 color; // Mengandung warna bioma + mikro-noise tanah
// varying vec3 vColor;
// varying vec3 vNormal;
//
// void main() {
//     vColor = color;
//     vNormal = normalize(normalMatrix * normal);
//     gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
// }
//
// [Fragment Shader]
// varying vec3 vColor;
// varying vec3 vNormal;
// uniform vec3 uSunDirection; // default: normalize(vec3(58.0, 58.0, 48.0))
// uniform vec3 uSunColor;     // default: vec3(1.0, 0.95, 0.88)
// uniform vec3 uAmbientColor; // default: vec3(0.88, 0.91, 0.94)
//
// void main() {
//     float diff = max(dot(vNormal, uSunDirection), 0.0);
//     vec3 lighting = uAmbientColor * 0.45 + uSunColor * diff * 0.85;
//     vec3 finalColor = vColor * lighting;
//     gl_FragColor = vec4(finalColor, 1.0);
// }
// ===================================================================
`;
    zip.file('shaders/terrain_shader_reference.glsl', shaderReferenceText);

    // 6. Metadata and Master README
    zip.file(
      'metadata.json',
      JSON.stringify(
        createExportMetadata(config, placedObjects, {
          bundle: 'Complete All-in-One Island Project',
          minHeight: minH,
          maxHeight: maxH,
          shaderIncluded: true,
          shadingType: config.smoothShading ? 'Smooth PBR' : 'Faceted Low-Poly',
          soilBrightnessPercent: Math.round((config.soilBrightness ?? 1.15) * 100),
          soilTextureGrainPercent: Math.round((config.soilTextureGrain ?? 0.65) * 100),
          soilWarmthPercent: Math.round((config.soilWarmth ?? 1.10) * 100),
        }),
        null,
        2
      )
    );

    zip.file(
      'README.txt',
      `===================================================================
TerraForge 3D - Paket Lengkap Proyek Dunia Pulau (All-In-One ZIP)
===================================================================
Bioma       : ${config.biome.toUpperCase()}
Seed        : ${config.seed}
Dimensi     : ${config.size} x ${config.size} meter
Kecerahan   : ${Math.round((config.soilBrightness ?? 1.15) * 100)}% (Warmth: ${Math.round((config.soilWarmth ?? 1.10) * 100)}%)
Tekstur     : Mikro-noise butiran alami (${Math.round((config.soilTextureGrain ?? 0.65) * 100)}%)
Shading     : ${config.smoothShading ? 'Smooth Organic PBR' : 'Faceted Low-Poly (Patah-patah)'}
Objek       : ${placedObjects.length} objek terpasang
Waktu Buat  : ${new Date().toLocaleString()}

STRUKTUR DIREKTORI DALAM PAKET:
-------------------------------------------------------------------
/models/
  - ${baseFilename}.glb    : Model 3D biner PBR siap pakai (Blender / Unity / Godot / UE5)
                             Sudah memuat warna tanah cerah, kontras hangat,
                             dan tekstur mikro-noise tertanam di vertex color (COLOR_0).
  - ${baseFilename}.obj    : Model polygon Wavefront universal
/heightmaps/
  - ${baseFilename}_heightmap.png : Citra grayscale elevasi pulau
/scene/
  - ${baseFilename}_scene.json    : Hierarki Three.js Scene JSON
/shaders/
  - terrain_shader_reference.glsl : Contoh kode GLSL shader vertex & fragment
                                   beserta formula pencahayaan Three.js/Unity.
metadata.json : Konfigurasi lengkap matematis pulau, parameter tanah, & objek
README.txt    : Panduan ini

PANDUAN IMPOR MODEL & MATERIAL:
-------------------------------------------------------------------
* BLENDER (3.x / 4.x):
  - File > Import > glTF 2.0 (.glb).
  - Tekan Z > Material Preview.
  - Warna tanah cerah, kontras, dan mikro-noise butiran langsung muncul otomatis
    karena telah tersemat pada atribut 'Color' (COLOR_0) mesh.

* UNITY ENGINE:
  - Drag file .glb ke folder Assets proyek Unity Anda.
  - Material Unity secara default membaca Vertex Color model.

* UNREAL ENGINE 5:
  - Import file .glb. Pada Material, pastikan node 'Vertex Color' dihubungkan
    ke input Base Color material PBR.

Selamat berkreasi dengan pulau TerraForge 3D Anda!
===================================================================`
    );

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownload(zipBlob, `${baseFilename}_bundle.zip`);
}
