import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyAnimatedWaterShader,
  applyArchitecturalGlassShader,
  applyTerrainMacroVariationShader,
  applyTravertineWeatheringShader,
  sharedWaterUniforms,
} from '../components/3d/shaders/architecturalShaders';
import {
  createArchitecturalGlassMaterial,
  createTravertineWallMaterial,
} from '../components/3d/materials/pbrMaterials';
import { BUILDING_APPEARANCE_REGISTRY } from '../domain/appearance/presets';

function createMockShader() {
  return {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: `
      #include <common>
      void main() {
        #include <begin_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      void main() {
        vec4 diffuseColor = vec4(1.0);
        float roughnessFactor = 0.5;
        vec3 outgoingLight = vec3(0.5);
        #include <color_fragment>
        #include <roughnessmap_fragment>
        #include <opaque_fragment>
      }
    `,
  };
}

describe('Phase 9 — Custom GLSL Shaders & PBR Material Pipeline', () => {
  it('injects world-space travertine ashlar and weathering GLSL hooks with deterministic program cache keys', () => {
    const mat = new THREE.MeshStandardMaterial({ color: '#ede4d5', roughness: 0.72, metalness: 0.0 });
    applyTravertineWeatheringShader(mat, {
      blockSize: [1.2, 0.6],
      weatheringHeight: 1.6,
      variationStrength: 0.055,
    });

    expect(mat.customProgramCacheKey()).toBe('arch_travertine_1.20_0.60_1.6_0.055');

    const shader = createMockShader();
    mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);

    expect(shader.vertexShader).toContain('varying vec3 vArchWorldPos;');
    expect(shader.vertexShader).toContain('varying vec3 vArchWorldNormal;');
    expect(shader.fragmentShader).toContain('archNoise2D');
    expect(shader.fragmentShader).toContain('groundAO');
    expect(shader.fragmentShader).toContain('roughnessFactor = clamp(roughnessFactor +');
  });

  it('injects architectural glass Schlick Fresnel and interior blind depth bands into glazing material', () => {
    const glassMat = createArchitecturalGlassMaterial({
      color: '#4e82aa',
      transparent: true,
      opacity: 0.78,
      fresnelStrength: 0.72,
    });

    expect(glassMat).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(glassMat.transparent).toBe(true);
    expect(glassMat.depthWrite).toBe(false);
    expect(glassMat.customProgramCacheKey()).toBe('arch_glass_bae6fd_0.72');

    const shader = createMockShader();
    glassMat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);

    expect(shader.fragmentShader).toContain('fresnel');
    expect(shader.fragmentShader).toContain('skyRefl');
    expect(shader.fragmentShader).toContain('blindStripe');
  });

  it('injects terrain macro anti-tiling variation for grass, asphalt, and paving surfaces', () => {
    const grassMat = new THREE.MeshStandardMaterial();
    const asphaltMat = new THREE.MeshStandardMaterial();
    const pavingMat = new THREE.MeshStandardMaterial();

    applyTerrainMacroVariationShader(grassMat, 'grass');
    applyTerrainMacroVariationShader(asphaltMat, 'asphalt');
    applyTerrainMacroVariationShader(pavingMat, 'paving');

    expect(grassMat.customProgramCacheKey()).toBe('arch_terrain_grass');
    expect(asphaltMat.customProgramCacheKey()).toBe('arch_terrain_asphalt');
    expect(pavingMat.customProgramCacheKey()).toBe('arch_terrain_paving');

    const shader = createMockShader();
    grassMat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('warmOlive');
    expect(shader.fragmentShader).toContain('deepClover');
  });

  it('injects animated water caustics and binds sharedWaterUniforms.uTime', () => {
    const waterMat = new THREE.MeshStandardMaterial();
    applyAnimatedWaterShader(waterMat, false);

    expect(waterMat.customProgramCacheKey()).toBe('arch_water_basin');

    const shader = createMockShader();
    waterMat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);

    expect(shader.uniforms.uTime).toBe(sharedWaterUniforms.uTime);
    expect(shader.fragmentShader).toContain('caustic');
    expect(shader.fragmentShader).toContain('deepAzure');
  });

  it('enforces physically accurate dielectric metalness (0.0) across all stone/travertine appearance presets', () => {
    for (const [presetId, preset] of Object.entries(BUILDING_APPEARANCE_REGISTRY)) {
      expect(preset.wallMetalness, `Preset ${presetId} should have dielectric wallMetalness = 0.0`).toBe(0.0);
      expect(preset.wallRoughness).toBeGreaterThanOrEqual(0.5);
      expect(preset.wallRoughness).toBeLessThanOrEqual(0.95);
    }

    const wallMat = createTravertineWallMaterial({ color: '#ede4d5', roughness: 0.72 });
    expect(wallMat.metalness).toBe(0.0);
  });
});
