import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { CustomAssetRecord } from '../types';

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
 * Export 3D scene / objects as Wavefront OBJ (.obj)
 */
export function exportSceneAsOBJ(sceneOrGroup: THREE.Object3D, filename = 'terraforge_world.obj'): void {
  const exporter = new OBJExporter();
  const result = exporter.parse(sceneOrGroup);
  const blob = new Blob([result], { type: 'text/plain' });
  triggerDownload(blob, filename);
}

/**
 * Export 3D scene / objects as GLTF (.gltf) or Binary GLB (.glb)
 */
export function exportSceneAsGLTF(
  sceneOrGroup: THREE.Object3D,
  binary = true,
  filename = 'terraforge_world.glb'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      sceneOrGroup,
      (gltf) => {
        if (gltf instanceof ArrayBuffer) {
          const blob = new Blob([gltf], { type: 'model/gltf-binary' });
          triggerDownload(blob, filename);
        } else {
          const output = JSON.stringify(gltf, null, 2);
          const blob = new Blob([output], { type: 'application/json' });
          triggerDownload(blob, filename.replace('.glb', '.gltf'));
        }
        resolve();
      },
      (error) => {
        reject(error);
      },
      { binary: binary, embedImages: true }
    );
  });
}

/**
 * Export Three.js native JSON format
 */
export function exportSceneAsThreeJSON(sceneOrGroup: THREE.Object3D, filename = 'terraforge_scene.json'): void {
  const json = sceneOrGroup.toJSON();
  const output = JSON.stringify(json, null, 2);
  const blob = new Blob([output], { type: 'application/json' });
  triggerDownload(blob, filename);
}

/**
 * Export heightmap array as 8-bit grayscale PNG canvas download
 */
export function exportHeightmapPNG(
  heights: Float32Array,
  resolution: number,
  minH: number,
  maxH: number,
  filename = 'terraforge_heightmap.png'
): void {
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
  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, filename);
  }, 'image/png');
}
