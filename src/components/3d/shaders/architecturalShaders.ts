import * as THREE from 'three';

/**
 * Shared global water animation time uniform updated once per frame by CampusFountain.
 */
export const sharedWaterUniforms = {
  uTime: { value: 0 },
};

/**
 * Common GLSL hash & 2D value noise helpers injected into custom architectural shaders.
 */
const GLSL_NOISE_HELPERS = /* glsl */ `
  varying vec3 vArchWorldPos;
  varying vec3 vArchWorldNormal;

  float archHash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float archNoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = archHash21(i);
    float b = archHash21(i + vec2(1.0, 0.0));
    float c = archHash21(i + vec2(0.0, 1.0));
    float d = archHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
`;

const VERTEX_WORLD_POS_HEADER = /* glsl */ `
  varying vec3 vArchWorldPos;
  varying vec3 vArchWorldNormal;
`;

const VERTEX_WORLD_POS_BODY = /* glsl */ `
  #include <begin_vertex>
  vec4 archWp = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    archWp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  vArchWorldPos = archWp.xyz;
  vArchWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

export interface TravertineShaderOptions {
  /** Block width and height in meters (default [1.2, 0.6]) */
  blockSize?: [number, number];
  /** Ground-contact weathering height in meters (default 1.6) */
  weatheringHeight?: number;
  /** Subtle per-block tone variation strength (default 0.055) */
  variationStrength?: number;
}

/**
 * Extends a MeshStandardMaterial with world-space triplanar travertine/limestone ashlar block
 * variation, hairline mortar grooves, micro-porous roughness variation, and subtle ground-contact
 * ambient occlusion / weathering.
 */
export function applyTravertineWeatheringShader(
  material: THREE.MeshStandardMaterial,
  options: TravertineShaderOptions = {},
): THREE.MeshStandardMaterial {
  const [bw, bh] = options.blockSize ?? [1.2, 0.6];
  const weatheringH = options.weatheringHeight ?? 1.6;
  const varStrength = options.variationStrength ?? 0.055;

  material.customProgramCacheKey = () =>
    `arch_travertine_${bw.toFixed(2)}_${bh.toFixed(2)}_${weatheringH.toFixed(1)}_${varStrength.toFixed(3)}`;

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_WORLD_POS_HEADER}`)
      .replace('#include <begin_vertex>', VERTEX_WORLD_POS_BODY);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE_HELPERS}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          // Triplanar world-space projection along dominant horizontal axis
          vec3 wn = abs(normalize(vArchWorldNormal));
          vec2 wallUV = (wn.x > wn.z) ? vArchWorldPos.zy : vArchWorldPos.xy;

          // Running-bond ashlar grid in meters
          float row = floor(wallUV.y / ${bh.toFixed(3)});
          float col = floor((wallUV.x + mod(row, 2.0) * ${(bw * 0.5).toFixed(3)}) / ${bw.toFixed(3)});
          float blockSeed = archHash21(vec2(col, row));

          // Subtle natural travertine veining & per-slab warm/cool variation
          float macroCloud = archNoise2D(wallUV * 0.35);
          float vein = archNoise2D(vec2(wallUV.x * 1.8, wallUV.y * 6.5 + macroCloud * 1.5));
          float toneDelta = ((blockSeed - 0.5) * 1.4 + (vein - 0.5) * 0.7) * ${varStrength.toFixed(4)};

          // Hairline mortar joint darkening
          vec2 localUV = fract(vec2((wallUV.x + mod(row, 2.0) * ${(bw * 0.5).toFixed(3)}) / ${bw.toFixed(3)}, wallUV.y / ${bh.toFixed(3)}));
          float jointX = smoothstep(0.0, 0.022, localUV.x) * smoothstep(1.0, 0.978, localUV.x);
          float jointY = smoothstep(0.0, 0.038, localUV.y) * smoothstep(1.0, 0.962, localUV.y);
          float mortarMask = jointX * jointY;

          diffuseColor.rgb += vec3(toneDelta, toneDelta * 0.94, toneDelta * 0.82);
          diffuseColor.rgb *= mix(0.91, 1.0, mortarMask);

          // Ground-contact ambient occlusion & plinth weathering near grade (y = 0..weatheringH)
          float groundAO = clamp(vArchWorldPos.y / ${weatheringH.toFixed(2)}, 0.0, 1.0);
          float dirtNoise = archNoise2D(wallUV * 1.4) * 0.35 + 0.65;
          float aoFactor = mix(1.0 - 0.14 * dirtNoise, 1.0, smoothstep(0.0, 1.0, groundAO));
          diffuseColor.rgb *= aoFactor;
        }
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        {
          vec3 wn = abs(normalize(vArchWorldNormal));
          vec2 wallUV = (wn.x > wn.z) ? vArchWorldPos.zy : vArchWorldPos.xy;
          float microPore = archNoise2D(wallUV * 4.5);
          roughnessFactor = clamp(roughnessFactor + (microPore - 0.5) * 0.12, 0.45, 0.96);
        }
        `,
      );
  };

  return material;
}

export interface ArchitecturalGlassShaderOptions {
  /** Base tint at normal incidence (default '#16283e') */
  tintColor?: string;
  /** Grazing Fresnel sky reflection color (default '#bae6fd') */
  fresnelColor?: string;
  /** Fresnel intensity multiplier (default 0.72) */
  fresnelStrength?: number;
}

/**
 * Extends a MeshStandardMaterial with a realistic architectural Low-E glazing shader:
 * - Schlick Fresnel reflectance curve (transparent/dark interior depth at normal view, crisp sky reflection at grazing angles)
 * - Subtle interior floor-slab & Venetian blind depth bands in world space
 * - Solar specular highlight boost without screen-space reflection cost
 */
export function applyArchitecturalGlassShader(
  material: THREE.MeshStandardMaterial,
  options: ArchitecturalGlassShaderOptions = {},
): THREE.MeshStandardMaterial {
  const fresnelCol = new THREE.Color(options.fresnelColor ?? '#bae6fd');
  const strength = options.fresnelStrength ?? 0.72;

  material.customProgramCacheKey = () =>
    `arch_glass_${fresnelCol.getHexString()}_${strength.toFixed(2)}`;

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_WORLD_POS_HEADER}`)
      .replace('#include <begin_vertex>', VERTEX_WORLD_POS_BODY);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE_HELPERS}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          vec3 viewDir = normalize(cameraPosition - vArchWorldPos);
          vec3 worldN = normalize(vArchWorldNormal);
          float NdotV = clamp(abs(dot(worldN, viewDir)), 0.0, 1.0);

          // Schlick Fresnel for architectural glass (F0 = 0.04)
          float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 3.8);

          // Vertical sky-to-plaza reflection gradient based on reflection vector Y
          vec3 reflDir = reflect(-viewDir, worldN);
          float skyGrad = clamp(reflDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 skyRefl = mix(vec3(0.82, 0.80, 0.75), vec3(${fresnelCol.r.toFixed(3)}, ${fresnelCol.g.toFixed(3)}, ${fresnelCol.b.toFixed(3)}), smoothstep(0.35, 0.85, skyGrad));

          // Subtle interior ceiling slab & warm room depth every 3.6m vertically (clean gradient without high-frequency aliasing)
          float floorPhase = fract(vArchWorldPos.y / 3.6);
          float ceilingBand = smoothstep(0.78, 0.95, floorPhase);
          float blindStripe = 0.5;
          vec3 interiorDepth = mix(diffuseColor.rgb * 0.75, vec3(0.18, 0.24, 0.32), ceilingBand * (0.4 + 0.1 * blindStripe));

          diffuseColor.rgb = mix(interiorDepth, skyRefl, clamp(fresnel * ${strength.toFixed(3)}, 0.0, 0.88));
        }
        `,
      );
  };

  return material;
}

export type TerrainSurfaceKind = 'grass' | 'asphalt' | 'paving';

/**
 * Eliminates visible texture tiling on large terrain surfaces (lawns, roads, plazas)
 * by blending multi-scale world-space botanical / aggregate macro variation and micro-roughness.
 */
export function applyTerrainMacroVariationShader(
  material: THREE.MeshStandardMaterial,
  surface: TerrainSurfaceKind,
): THREE.MeshStandardMaterial {
  material.customProgramCacheKey = () => `arch_terrain_${surface}`;

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_WORLD_POS_HEADER}`)
      .replace('#include <begin_vertex>', VERTEX_WORLD_POS_BODY);

    const colorFragmentCode =
      surface === 'grass'
        ? /* glsl */ `
        #include <color_fragment>
        {
          vec2 wp = vArchWorldPos.xz;
          float macro1 = archNoise2D(wp * 0.035);
          float macro2 = archNoise2D(wp * 0.14 + vec2(17.3, 9.1));
          float micro = archNoise2D(wp * 0.85);

          // Blend between lush emerald turf and warm sunlit golden-olive grass patches
          vec3 warmOlive = diffuseColor.rgb * vec3(1.08, 1.06, 0.88);
          vec3 deepClover = diffuseColor.rgb * vec3(0.86, 0.95, 0.84);
          diffuseColor.rgb = mix(deepClover, warmOlive, smoothstep(0.25, 0.75, macro1 * 0.65 + macro2 * 0.35));
          diffuseColor.rgb *= (0.94 + 0.12 * micro);
        }
        `
        : surface === 'asphalt'
        ? /* glsl */ `
        #include <color_fragment>
        {
          vec2 wp = vArchWorldPos.xz;
          float wear = archNoise2D(wp * 0.06);
          float grain = archNoise2D(wp * 1.6);
          diffuseColor.rgb *= (0.91 + 0.16 * wear) * (0.95 + 0.10 * grain);
        }
        `
        : /* glsl */ `
        #include <color_fragment>
        {
          vec2 wp = vArchWorldPos.xz;
          float macroStone = archNoise2D(wp * 0.05);
          float slabNoise = archNoise2D(floor(wp * 2.0) * 0.37);
          diffuseColor.rgb *= (0.95 + 0.08 * macroStone + (slabNoise - 0.5) * 0.05);
        }
        `;

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE_HELPERS}`)
      .replace('#include <color_fragment>', colorFragmentCode)
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        {
          float rNoise = archNoise2D(vArchWorldPos.xz * 0.12);
          roughnessFactor = clamp(roughnessFactor + (rNoise - 0.5) * 0.10, 0.55, 0.98);
        }
        `,
      );
  };

  return material;
}

/**
 * Animated procedural water shader for the Grand Campus Fountain basin and stepped cascade.
 * Produces dual-scrolling wave ripples, turquoise-azure depth caustics, and Fresnel sky reflection.
 */
export function applyAnimatedWaterShader(
  material: THREE.MeshStandardMaterial,
  isCascade: boolean = false,
): THREE.MeshStandardMaterial {
  material.customProgramCacheKey = () => `arch_water_${isCascade ? 'cascade' : 'basin'}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedWaterUniforms.uTime;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_WORLD_POS_HEADER}`)
      .replace('#include <begin_vertex>', VERTEX_WORLD_POS_BODY);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uTime;\n${GLSL_NOISE_HELPERS}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          vec2 wp = vArchWorldPos.xz;
          float t = uTime * ${isCascade ? '2.4' : '0.85'};

          // Dual-scrolling wave interference for caustics & ripples
          float w1 = archNoise2D(wp * 2.2 + vec2(t * 0.7, t * 0.45));
          float w2 = archNoise2D(wp * 3.8 - vec2(t * 0.55, -t * 0.65));
          float caustic = smoothstep(0.42, 0.88, (w1 + w2) * 0.5);

          vec3 viewDir = normalize(cameraPosition - vArchWorldPos);
          float NdotV = clamp(abs(dot(normalize(vArchWorldNormal), viewDir)), 0.0, 1.0);
          float fresnel = pow(1.0 - NdotV, 3.0);

          vec3 deepAzure = vec3(0.02, 0.42, 0.68);
          vec3 shallowTurquoise = vec3(0.14, 0.72, 0.92);
          vec3 causticGlow = vec3(0.78, 0.95, 1.0);
          vec3 skyReflect = vec3(0.82, 0.92, 1.0);

          vec3 waterCol = mix(deepAzure, shallowTurquoise, w1 * 0.6 + 0.2);
          waterCol = mix(waterCol, causticGlow, caustic * ${isCascade ? '0.48' : '0.28'});
          diffuseColor.rgb = mix(waterCol, skyReflect, fresnel * 0.55);
        }
        `,
      );
  };

  return material;
}
