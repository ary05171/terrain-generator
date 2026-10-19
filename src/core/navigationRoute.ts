import * as THREE from 'three';
import { PlacedObject, TerrainConfig } from '../types';
import {
  getSampledHeightAt,
  applyPathBrush,
  findAStarPath,
  NavigationObstacle,
} from './terrainGen';

export interface DoorwayInfo {
  entrancePos: [number, number, number];
  doorForwardAngle: number; // world yaw in radians (direction pointing OUT of door)
  boundingRadius: number;
  building: PlacedObject;
}

/**
 * Returns architectural doorway coordinate, front-facing direction, and obstacle radius
 * for any given building model in TerraForge 3D.
 */
export function getBuildingDoorwayInfo(building: PlacedObject): DoorwayInfo | null {
  const isBuilding =
    building.category === 'building' ||
    building.category === 'cyber' ||
    building.type === 'alpine_cottage' ||
    building.type === 'stone_windmill' ||
    building.type === 'island_lighthouse' ||
    building.type === 'cyber_skyscraper' ||
    building.type === 'cyber_apartment' ||
    building.type === 'scifi_dome' ||
    building.type === 'desert_monolith';

  if (!isBuilding) return null;

  const yaw = building.rotation[1] || 0;
  const scale = building.scale[0] || 1;

  // Local door offset relative to model center [dx, dy, dz]
  let localDoorOffset: [number, number, number] = [0, 0, 2.2];
  let radius = 3.5;

  switch (building.type) {
    case 'alpine_cottage':
      localDoorOffset = [0, 0.2, 2.0];
      radius = 3.2;
      break;
    case 'stone_windmill':
      localDoorOffset = [0, 0.2, 2.7];
      radius = 3.5;
      break;
    case 'island_lighthouse':
      localDoorOffset = [0, 0.2, 2.7];
      radius = 3.8;
      break;
    case 'cyber_skyscraper':
      localDoorOffset = [0, 0.2, 3.4];
      radius = 5.2;
      break;
    case 'cyber_apartment':
      localDoorOffset = [0, 0.2, 2.9];
      radius = 4.6;
      break;
    case 'scifi_dome':
      localDoorOffset = [0, 0.2, 4.0];
      radius = 4.8;
      break;
    case 'desert_monolith':
      localDoorOffset = [0, 0.2, 2.4];
      radius = 3.8;
      break;
    default:
      localDoorOffset = [0, 0.2, 2.2];
      radius = 3.5;
      break;
  }

  // Rotate local door offset around Y axis by building yaw
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  const worldDx = (localDoorOffset[0] * cosY + localDoorOffset[2] * sinY) * scale;
  const worldDz = (-localDoorOffset[0] * sinY + localDoorOffset[2] * cosY) * scale;

  const entranceX = building.position[0] + worldDx;
  const entranceZ = building.position[2] + worldDz;
  const entranceY = building.position[1] + localDoorOffset[1] * scale;

  return {
    entrancePos: [entranceX, entranceY, entranceZ],
    doorForwardAngle: yaw,
    boundingRadius: radius * scale,
    building,
  };
}

/**
 * Find nearest building within detection range (for "Bind ke Bangunan / Sambung Pintu" button)
 */
export function findNearbyBuilding(
  pos: [number, number, number],
  objects: PlacedObject[],
  maxDistance = 7.5
): PlacedObject | null {
  let closest: PlacedObject | null = null;
  let minDist = maxDistance;

  for (const obj of objects) {
    const isBuilding =
      obj.category === 'building' ||
      obj.category === 'cyber' ||
      obj.type === 'alpine_cottage' ||
      obj.type === 'stone_windmill' ||
      obj.type === 'island_lighthouse' ||
      obj.type === 'cyber_skyscraper' ||
      obj.type === 'cyber_apartment' ||
      obj.type === 'scifi_dome' ||
      obj.type === 'desert_monolith';

    if (!isBuilding) continue;

    const dx = obj.position[0] - pos[0];
    const dz = obj.position[2] - pos[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < minDist) {
      minDist = dist;
      closest = obj;
    }
  }

  return closest;
}

/**
 * Checks distance from point (px, pz) to line segment (x1, z1)-(x2, z2)
 */
function distancePointToSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): { distance: number; projX: number; projZ: number; t: number } {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;

  if (lenSq === 0) {
    const d = Math.hypot(px - x1, pz - z1);
    return { distance: d, projX: x1, projZ: z1, t: 0 };
  }

  let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  const distance = Math.hypot(px - projX, pz - projZ);

  return { distance, projX, projZ, t };
}

/**
 * A* Search-based Smart Obstacle Avoidance & Doorway Loop Pathfinding.
 * Calculates optimal paths between buildings, avoids solid obstacles with clearance buffers,
 * handles front doorway alignments with loop-arounds if arriving from behind,
 * supports intermediate waypoint C, and generates smooth sequences of 3D navigation nodes.
 */
export function calculateSmartDetourPath(
  start: [number, number, number],
  end: [number, number, number],
  allObjects: PlacedObject[],
  terrainHeights: Float32Array,
  terrainSize: number,
  terrainRes: number,
  waterLevel: number,
  startBoundBuildingId?: string | null,
  endBoundBuildingId?: string | null,
  waypointC?: [number, number, number] | null
): {
  points: [number, number, number][];
  nodes: [number, number, number][];
  exploredNodes: [number, number, number][];
  isDetoured: boolean;
  avoidedCount: number;
  lengthMeters: number;
  hasSteepSlope: boolean;
  crossesWater: boolean;
} {
  // Collect solid obstacles (buildings, monoliths, towers, windmills)
  const solidObstacles = allObjects.filter((o) => {
    return (
      o.category === 'building' ||
      o.category === 'cyber' ||
      o.type === 'stone_windmill' ||
      o.type === 'island_lighthouse' ||
      o.type === 'alpine_cottage' ||
      o.type === 'scifi_dome' ||
      o.type === 'desert_monolith' ||
      o.type === 'cyber_skyscraper' ||
      o.type === 'cyber_apartment'
    );
  });

  const obstacles: NavigationObstacle[] = solidObstacles.map((obs) => {
    const info = getBuildingDoorwayInfo(obs);
    return {
      x: obs.position[0],
      z: obs.position[2],
      radius: info ? info.boundingRadius : 3.5 * (obs.scale[0] || 1),
      id: obs.id,
    };
  });

  const bridges = allObjects
    .filter((o) => o.type === 'wooden_bridge')
    .map((o) => ({ x: o.position[0], z: o.position[2], radius: 3.5 }));

  // Helper to compute a single A* leg between two points with doorway orientation handling
  const computeLeg = (
    legStart: [number, number, number],
    legEnd: [number, number, number],
    legStartBoundId?: string | null,
    legEndBoundId?: string | null
  ) => {
    const startBuilding = legStartBoundId
      ? solidObstacles.find((o) => o.id === legStartBoundId)
      : null;
    const endBuilding = legEndBoundId
      ? solidObstacles.find((o) => o.id === legEndBoundId)
      : null;

    // 1. Check if START pin is bound to a building and leaves toward behind
    const startDoorInfo = startBuilding ? getBuildingDoorwayInfo(startBuilding) : null;
    let startExitWaypoints: [number, number, number][] = [];

    if (startDoorInfo) {
      const bPos = startDoorInfo.building.position;
      const doorForwardX = Math.sin(startDoorInfo.doorForwardAngle);
      const doorForwardZ = Math.cos(startDoorInfo.doorForwardAngle);

      const toEndX = legEnd[0] - bPos[0];
      const toEndZ = legEnd[2] - bPos[2];
      const toEndLen = Math.hypot(toEndX, toEndZ) || 1;
      const normEndX = toEndX / toEndLen;
      const normEndZ = toEndZ / toEndLen;

      const dotFacing = normEndX * doorForwardX + normEndZ * doorForwardZ;
      if (dotFacing < 0.25) {
        const flankSide = normEndX * -doorForwardZ + normEndZ * doorForwardX >= 0 ? 1 : -1;
        const flankRadius = startDoorInfo.boundingRadius + 1.8;

        const angle1 = startDoorInfo.doorForwardAngle + flankSide * (Math.PI / 4);
        const wp1X = bPos[0] + Math.sin(angle1) * (flankRadius * 0.95);
        const wp1Z = bPos[2] + Math.cos(angle1) * (flankRadius * 0.95);
        const wp1Y = getSampledHeightAt(wp1X, wp1Z, terrainHeights, terrainSize, terrainRes);

        const angle2 = startDoorInfo.doorForwardAngle + Math.PI + flankSide * (Math.PI / 3);
        const wp2X = bPos[0] + Math.sin(angle2) * flankRadius;
        const wp2Z = bPos[2] + Math.cos(angle2) * flankRadius;
        const wp2Y = getSampledHeightAt(wp2X, wp2Z, terrainHeights, terrainSize, terrainRes);

        startExitWaypoints = [
          [wp1X, wp1Y, wp1Z],
          [wp2X, wp2Y, wp2Z],
        ];
      }
    }

    // 2. Check if END pin is bound to a building and arrives from behind
    const endDoorInfo = endBuilding ? getBuildingDoorwayInfo(endBuilding) : null;
    let endApproachWaypoints: [number, number, number][] = [];

    if (endDoorInfo) {
      const ebPos = endDoorInfo.building.position;
      const doorForwardX = Math.sin(endDoorInfo.doorForwardAngle);
      const doorForwardZ = Math.cos(endDoorInfo.doorForwardAngle);

      const toStartX = legStart[0] - ebPos[0];
      const toStartZ = legStart[2] - ebPos[2];
      const toStartLen = Math.hypot(toStartX, toStartZ) || 1;
      const normStartX = toStartX / toStartLen;
      const normStartZ = toStartZ / toStartLen;

      const dotFacing = normStartX * doorForwardX + normStartZ * doorForwardZ;
      if (dotFacing < 0.25) {
        const flankSide = normStartX * -doorForwardZ + normStartZ * doorForwardX >= 0 ? 1 : -1;
        const flankRadius = endDoorInfo.boundingRadius + 1.8;

        const angle1 = endDoorInfo.doorForwardAngle + Math.PI + flankSide * (Math.PI / 3);
        const wp1X = ebPos[0] + Math.sin(angle1) * flankRadius;
        const wp1Z = ebPos[2] + Math.cos(angle1) * flankRadius;
        const wp1Y = getSampledHeightAt(wp1X, wp1Z, terrainHeights, terrainSize, terrainRes);

        const angle2 = endDoorInfo.doorForwardAngle + flankSide * (Math.PI / 4);
        const wp2X = ebPos[0] + Math.sin(angle2) * (flankRadius * 0.95);
        const wp2Z = ebPos[2] + Math.cos(angle2) * (flankRadius * 0.95);
        const wp2Y = getSampledHeightAt(wp2X, wp2Z, terrainHeights, terrainSize, terrainRes);

        endApproachWaypoints = [
          [wp1X, wp1Y, wp1Z],
          [wp2X, wp2Y, wp2Z],
        ];
      }
    }

    const corridorStart =
      startExitWaypoints.length > 0 ? startExitWaypoints[startExitWaypoints.length - 1] : legStart;
    const corridorEnd =
      endApproachWaypoints.length > 0 ? endApproachWaypoints[0] : legEnd;

    // Run A* search
    const aStarResult = findAStarPath(
      corridorStart,
      corridorEnd,
      terrainHeights,
      terrainSize,
      terrainRes,
      waterLevel,
      obstacles,
      {
        gridStep: 1.8,
        bridges,
        ignoreObstacleIds: [legStartBoundId, legEndBoundId],
      }
    );

    // Assemble combined key nodes for this leg
    const legNodes: [number, number, number][] = [];
    legNodes.push([...legStart]);
    for (const wp of startExitWaypoints) legNodes.push(wp);
    for (const n of aStarResult.nodes) {
      if (
        Math.hypot(n[0] - legStart[0], n[2] - legStart[2]) > 0.8 &&
        Math.hypot(n[0] - legEnd[0], n[2] - legEnd[2]) > 0.8
      ) {
        legNodes.push(n);
      }
    }
    for (const wp of endApproachWaypoints) legNodes.push(wp);
    legNodes.push([...legEnd]);

    return {
      nodes: legNodes,
      aStarResult,
      isDoorDetoured: startExitWaypoints.length > 0 || endApproachWaypoints.length > 0,
    };
  };

  const combinedNodes: [number, number, number][] = [];
  const allExploredNodes: [number, number, number][] = [];
  let isDetoured = false;
  let totalAvoided = 0;
  let hasSteepSlope = false;
  let crossesWater = false;

  if (waypointC) {
    // Leg 1: Start -> Waypoint C
    const leg1 = computeLeg(start, waypointC, startBoundBuildingId, null);
    // Leg 2: Waypoint C -> End
    const leg2 = computeLeg(waypointC, end, null, endBoundBuildingId);

    combinedNodes.push(...leg1.nodes);
    // Skip duplicate waypoint C node at start of leg 2
    for (let i = 1; i < leg2.nodes.length; i++) {
      combinedNodes.push(leg2.nodes[i]);
    }

    if (leg1.aStarResult.exploredNodes) allExploredNodes.push(...leg1.aStarResult.exploredNodes);
    if (leg2.aStarResult.exploredNodes) allExploredNodes.push(...leg2.aStarResult.exploredNodes);

    isDetoured =
      leg1.aStarResult.isDetoured ||
      leg2.aStarResult.isDetoured ||
      leg1.isDoorDetoured ||
      leg2.isDoorDetoured;
    totalAvoided = leg1.aStarResult.avoidedCount + leg2.aStarResult.avoidedCount;
    hasSteepSlope = leg1.aStarResult.hasSteepSlope || leg2.aStarResult.hasSteepSlope;
    crossesWater = leg1.aStarResult.crossesWater || leg2.aStarResult.crossesWater;
  } else {
    // Single Leg: Start -> End
    const single = computeLeg(start, end, startBoundBuildingId, endBoundBuildingId);
    combinedNodes.push(...single.nodes);
    if (single.aStarResult.exploredNodes) allExploredNodes.push(...single.aStarResult.exploredNodes);

    isDetoured = single.aStarResult.isDetoured || single.isDoorDetoured;
    totalAvoided = single.aStarResult.avoidedCount;
    hasSteepSlope = single.aStarResult.hasSteepSlope;
    crossesWater = single.aStarResult.crossesWater;
  }

  // Multi-waypoint Catmull-Rom Spline for silky smooth continuous ribbon
  const points: [number, number, number][] = [];
  const threePoints = combinedNodes.map((p) => new THREE.Vector3(p[0], p[1], p[2]));

  if (threePoints.length <= 2) {
    const steps = 36;
    for (let i = 0; i <= steps; i++) {
      const alpha = i / steps;
      const x = start[0] + (end[0] - start[0]) * alpha;
      const z = start[2] + (end[2] - start[2]) * alpha;
      const groundY = getSampledHeightAt(x, z, terrainHeights, terrainSize, terrainRes);
      points.push([x, Math.max(groundY + 0.08, waterLevel + 0.28), z]);
    }
  } else {
    const curve = new THREE.CatmullRomCurve3(threePoints, false, 'centripetal', 0.5);
    const steps = Math.max(48, combinedNodes.length * 12);
    const curvePoints = curve.getPoints(steps);

    for (let i = 0; i < curvePoints.length; i++) {
      const pt = curvePoints[i];
      const groundY = getSampledHeightAt(pt.x, pt.z, terrainHeights, terrainSize, terrainRes);
      points.push([pt.x, Math.max(groundY + 0.08, waterLevel + 0.28), pt.z]);
    }
  }

  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
      points[i][2] - points[i - 1][2]
    );
  }

  return {
    points,
    nodes: combinedNodes,
    exploredNodes: allExploredNodes,
    isDetoured,
    avoidedCount: totalAvoided,
    lengthMeters: Math.round(totalLength),
    hasSteepSlope,
    crossesWater,
  };
}

/**
 * Bake the interactive Pin route into the terrain's permanent paving and trail structures
 */
export function bakeNavigationRouteToTerrain(
  routePoints: [number, number, number][],
  currentHeights: Float32Array,
  currentColors: Float32Array,
  terrainConfig: TerrainConfig,
  existingPlacedObjects: PlacedObject[]
): {
  newHeights: Float32Array;
  newColors: Float32Array;
  newProps: PlacedObject[];
} {
  const newHeights = new Float32Array(currentHeights);
  const newColors = new Float32Array(currentColors);
  const newProps: PlacedObject[] = [];

  const size = terrainConfig.size;
  const res = terrainConfig.resolution;
  const pathStyle = terrainConfig.pathStyle || 'blend_natural';
  const blendRatios = terrainConfig.pathBlendRatios;
  const trailWidth = terrainConfig.trailWidth ?? 2.2;
  const waterLevel = terrainConfig.waterLevel;

  // Stride over points to apply paving brush
  for (let i = 0; i < routePoints.length; i += 2) {
    const pt = routePoints[i];
    applyPathBrush(
      pt[0],
      pt[2],
      newHeights,
      newColors,
      size,
      res,
      pathStyle,
      trailWidth * 2.8,
      0.85,
      blendRatios
    );

    // Install wooden bridge over water if needed
    if (pt[1] <= waterLevel + 0.45 && i % 6 === 0) {
      const nearBridge = [...existingPlacedObjects, ...newProps].some(
        (o) => o.type === 'wooden_bridge' && Math.hypot(o.position[0] - pt[0], o.position[2] - pt[2]) < 6.0
      );
      if (!nearBridge) {
        // Calculate heading to next point
        const nextPt = routePoints[Math.min(i + 1, routePoints.length - 1)];
        const rotY = Math.atan2(nextPt[0] - pt[0], nextPt[2] - pt[2]);
        newProps.push({
          id: `pin_bridge_${Date.now()}_${i}`,
          name: 'Jembatan Kayu Air',
          type: 'wooden_bridge',
          category: 'path',
          position: [pt[0], waterLevel + 0.40, pt[2]],
          rotation: [0, rotY, 0],
          scale: [1, 1, 1],
        });
      }
    }
  }

  return {
    newHeights,
    newColors,
    newProps,
  };
}
