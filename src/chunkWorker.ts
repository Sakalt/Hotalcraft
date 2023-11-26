/// <reference lib="webworker" />
import * as THREE from "three";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";

import { BlockID, oreConfig } from "./Block";
import { RNG } from "./RNG";
import { WorldParams, WorldSize } from "./WorldChunk";

declare const self: DedicatedWorkerGlobalScope;

export const generateChunk = async (
  chunkSize: WorldSize,
  params: WorldParams,
  x: number,
  z: number
) => {
  const chunkPos = new THREE.Vector3(x, 0, z);
  let data = initEmptyChunk(chunkSize);
  const rng = new RNG(params.seed);
  data = generateResources(rng, data, chunkSize, chunkPos);
  data = generateTerrain(rng, data, chunkSize, params, chunkPos);
  data = generateTrees(rng, data, chunkSize, params, chunkPos);

  return data;
};

const initEmptyChunk = (chunkSize: WorldSize) => {
  const data = new Array(chunkSize.width);
  for (let x = 0; x < chunkSize.width; x++) {
    data[x] = new Array(chunkSize.height);
    for (let y = 0; y < chunkSize.height; y++) {
      data[x][y] = new Array(chunkSize.width);
      for (let z = 0; z < chunkSize.width; z++) {
        data[x][y][z] = BlockID.Air;
      }
    }
  }
  return data;
};

/**
 * Generates the resources (coal, stone, etc.) for the world
 */
export const generateResources = (
  rng: RNG,
  input: BlockID[][][],
  size: WorldSize,
  chunkPos: THREE.Vector3
): BlockID[][][] => {
  const simplex = new SimplexNoise(rng);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [_, config] of Object.entries(oreConfig)) {
    for (let x = 0; x < size.width; x++) {
      for (let y = 0; y < size.height; y++) {
        for (let z = 0; z < size.width; z++) {
          const value = simplex.noise3d(
            (chunkPos.x + x) / config.scale.x,
            (chunkPos.y + y) / config.scale.y,
            (chunkPos.z + z) / config.scale.z
          );

          if (value > config.scarcity) {
            input[x][y][z] = config.id;
          }
        }
      }
    }
  }

  return input;
};

/**
 * Generates the terrain data
 */
export const generateTerrain = (
  rng: RNG,
  input: BlockID[][][],
  size: WorldSize,
  params: WorldParams,
  chunkPos: THREE.Vector3
): BlockID[][][] => {
  const simplex = new SimplexNoise(rng);
  for (let x = 0; x < size.width; x++) {
    for (let z = 0; z < size.width; z++) {
      const value = simplex.noise(
        (chunkPos.x + x) / params.terrain.scale,
        (chunkPos.z + z) / params.terrain.scale
      );

      const scaledNoise =
        params.terrain.offset + params.terrain.magnitude * value;

      let height = Math.floor(size.height * scaledNoise);
      height = Math.max(0, Math.min(height, size.height - 1));

      const numSurfaceBlocks =
        params.surface.offset +
        Math.abs(simplex.noise(x, z) * params.surface.magnitude);

      const numBedrockBlocks =
        params.bedrock.offset +
        Math.abs(simplex.noise(x, z) * params.bedrock.magnitude);

      for (let y = 0; y < size.height; y++) {
        if (y < height) {
          if (y < numBedrockBlocks) {
            input[x][y][z] = BlockID.Bedrock;
          } else if (y < height - numSurfaceBlocks) {
            if (input[x][y][z] === BlockID.Air) {
              input[x][y][z] = BlockID.Stone;
            }
          } else {
            input[x][y][z] = BlockID.Dirt;
          }
        } else if (y === height) {
          input[x][y][z] = BlockID.Grass;
        } else if (y > height) {
          input[x][y][z] = BlockID.Air;
        }
      }
    }
  }

  return input;
};

/**
 * Generates trees
 */
export const generateTrees = (
  rng: RNG,
  input: BlockID[][][],
  size: WorldSize,
  params: WorldParams,
  chunkPos: THREE.Vector3
): BlockID[][][] => {
  const simplex = new SimplexNoise(rng);
  const canopySize = params.trees.canopy.size.max;
  for (let baseX = canopySize; baseX < size.width - canopySize; baseX++) {
    for (let baseZ = canopySize; baseZ < size.width - canopySize; baseZ++) {
      const n =
        simplex.noise(chunkPos.x + baseX, chunkPos.z + baseZ) * 0.5 + 0.5;
      if (n < 1 - params.trees.frequency) {
        continue;
      }

      // Find the grass tile
      for (let y = size.height - 1; y >= 0; y--) {
        if (input[baseX][y][baseZ] !== BlockID.Grass) {
          continue;
        }

        // Found grass, move one time up
        const baseY = y + 1;

        const minH = params.trees.trunkHeight.min;
        const maxH = params.trees.trunkHeight.max;
        const trunkHeight = Math.round(rng.random() * (maxH - minH)) + minH;
        const topY = baseY + trunkHeight;

        // Fill in blocks for the trunk
        for (let i = baseY; i < topY; i++) {
          input[baseX][i][baseZ] = BlockID.OakLog;
        }

        // Generate the canopy
        const minR = params.trees.canopy.size.min;
        const maxR = params.trees.canopy.size.max;
        const R = Math.round(rng.random() * (maxR - minR)) + minR;

        for (let x = -R; x <= R; x++) {
          for (let y = -R; y <= R; y++) {
            for (let z = -R; z <= R; z++) {
              // don't create leaves outside canopy radius
              if (x * x + y * y + z * z > R * R) {
                continue;
              }

              // don't overwrite existing blocks
              if (input[baseX + x][topY + y][baseZ + z] !== BlockID.Air) {
                continue;
              }

              // Add some randomness to the canopy
              if (rng.random() > params.trees.canopy.density) {
                input[baseX + x][topY + y][baseZ + z] = BlockID.Leaves;
              }
            }
          }
        }
      }
    }
  }

  return input;
};
