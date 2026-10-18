import { mapConfig } from '../../config/mapConfig';
import { computeSemanticChanges } from '../changeTracking/changeTracker';
import { editorDocToCampusAndGeom } from '../domain/adapter';
import type {
  EditorBuilding,
  EditorDocument,
  EditorFloor,
  ExportReferenceScope,
  PhotoAttachment,
  SemanticChange,
  ValidationIssue,
} from '../domain/types';
import {
  extensionFromMimeOrName,
  getAttachmentBlobSync,
} from '../storage/attachmentStorage';
import { validateDocument } from '../validation/validator';
import { buildZipArchive, crc32, type ZipEntryInput } from './zipWriter';

export const EXPORT_SCHEMA_VERSION = '1.0.0';

export interface ExportedReferencePhotoEntry {
  attachmentId: string;
  fileId: string;
  fileName: string;
  originalFileName: string;
  /** Path relative to `campus-edit/` root, e.g. `references/block-a/floor-1/main-hall/photo-01.jpg` */
  relativePath: string;
  /** Full path inside the ZIP archive, e.g. `campus-edit/references/block-a/floor-1/main-hall/photo-01.jpg` */
  archivePath: string;
  mimeType: string;
  byteSize: number;
  title?: string;
  caption?: string;
  aiInstruction?: string;
  direction?: string;
  order: number;
}

export interface ExportedObjectReferencesMetadata {
  targetId: string;
  targetType: 'campus' | 'building' | 'floor' | 'room' | 'outdoor';
  objectName: string;
  semanticType: string;
  buildingId?: string;
  buildingName?: string;
  floorId?: string;
  floorLevel?: number;
  locationLabel: string;
  aiComment?: string;
  metadataPath: string;
  photos: ExportedReferencePhotoEntry[];
}

export interface ExportOptions {
  referenceScope?: ExportReferenceScope;
}

export interface ExportManifest {
  schemaVersion: string;
  packageFormat: 'campus-edit-package';
  exportedAt: string;
  campusId: string;
  campusName: string;
  referenceScope: ExportReferenceScope;
  coordinateSystem: {
    units: 'm';
    axes: 'X=east, Y=up, Z=south (north is -Z)';
    datum: string;
    referenceImageSizePx: [number, number];
    metersPerPixel: number;
    floorHeightMeters: number;
    slabThicknessMeters: number;
  };
  stats: {
    buildingCount: number;
    floorCount: number;
    indoorElementCount: number;
    outdoorElementCount: number;
    totalChanges: number;
    addedCount: number;
    modifiedCount: number;
    movedCount: number;
    resizedCount: number;
    renamedCount: number;
    deletedCount: number;
    aiCommentCount: number;
    referencePhotoCount: number;
  };
  references: ExportedObjectReferencesMetadata[];
  files: string[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugifySegment(raw: string, fallback: string = 'item'): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function slugifyBuilding(bld: EditorBuilding): string {
  const raw = bld.shortName ? `block-${bld.shortName}` : bld.name || bld.id;
  return slugifySegment(raw, bld.id);
}

function makeSafeUniquePhotoFileName(
  photo: PhotoAttachment,
  index: number,
  usedInFolder: Set<string>,
): string {
  const ext = extensionFromMimeOrName(photo.mimeType, photo.fileName);
  const rawBase = (photo.fileName || '')
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const base = rawBase || `photo-${String(index + 1).padStart(2, '0')}`;
  let candidate = `${base}.${ext}`;
  let counter = 2;
  while (usedInFolder.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}.${ext}`;
    counter++;
  }
  usedInFolder.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Generates a standalone SVG floor plan for a specific building and floor.
 */
export function generateFloorPlanSvg(building: EditorBuilding, floor: EditorFloor): string {
  const [bw, bd] = building.footprint.size;
  const pad = 6;
  const viewMinX = -bw / 2 - pad;
  const viewMinZ = -bd / 2 - pad;
  const viewW = bw + pad * 2;
  const viewH = bd + pad * 2;
  const scale = 16; // px per meter
  const svgW = Math.round(viewW * scale);
  const svgH = Math.round(viewH * scale) + 60;

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">`,
  );
  lines.push(`<rect width="100%" height="100%" fill="#ffffff" />`);

  // Header title
  lines.push(
    `<text x="20" y="28" font-size="16" font-weight="700" fill="#0f172a">${escapeXml(building.name)} (${escapeXml(building.shortName)}) — ${escapeXml(floor.name)} (Level ${floor.level})</text>`,
  );
  lines.push(
    `<text x="20" y="46" font-size="11" fill="#64748b">Building ID: ${escapeXml(building.id)} | Floor ID: ${escapeXml(floor.id)} | Footprint: ${bw.toFixed(1)}m × ${bd.toFixed(1)}m | World Center: [${building.footprint.center[0].toFixed(1)}, ${building.footprint.center[1].toFixed(1)}]m</text>`,
  );

  const toSx = (lx: number) => ((lx - viewMinX) * scale).toFixed(1);
  const toSy = (lz: number) => (60 + (lz - viewMinZ) * scale).toFixed(1);

  // Building shell outline
  const shellX = toSx(-bw / 2);
  const shellY = toSy(-bd / 2);
  const shellW = (bw * scale).toFixed(1);
  const shellH = (bd * scale).toFixed(1);
  lines.push(
    `<rect x="${shellX}" y="${shellY}" width="${shellW}" height="${shellH}" fill="#f8fafc" stroke="#334155" stroke-width="2.5" rx="3" />`,
  );

  // Indoor elements / rooms
  for (const rm of floor.rooms) {
    const [lx, lz] = rm.localCenter;
    const [rw, rd] = rm.size;
    const rx = toSx(lx - rw / 2);
    const ry = toSy(lz - rd / 2);
    const rWidth = (rw * scale).toFixed(1);
    const rHeight = (rd * scale).toFixed(1);

    const elType = rm.elementType || rm.kind;
    let fill = '#eff6ff';
    let stroke = '#2563eb';
    if (elType === 'corridor') {
      fill = '#f1f5f9';
      stroke = '#64748b';
    } else if (elType === 'hall' || elType === 'lobby') {
      fill = '#eef2ff';
      stroke = '#4f46e5';
    } else if (elType === 'stairs' || elType === 'elevator') {
      fill = '#fef3c7';
      stroke = '#d97706';
    } else if (elType === 'door' || elType === 'entrance' || elType === 'exit') {
      fill = '#dcfce7';
      stroke = '#16a34a';
    } else if (elType === 'window') {
      fill = '#e0f2fe';
      stroke = '#0284c7';
    } else if (elType === 'wall' || elType === 'partition') {
      fill = '#cbd5e1';
      stroke = '#1e293b';
    } else if (rm.kind === 'lab') {
      fill = '#ecfdf5';
      stroke = '#059669';
    } else if (rm.kind === 'office') {
      fill = '#fffbeb';
      stroke = '#d97706';
    }

    if (rm.polygon && rm.polygon.length >= 3) {
      const pts = rm.polygon.map(([px, pz]) => `${toSx(px)},${toSy(pz)}`).join(' ');
      lines.push(
        `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`,
      );
    } else {
      lines.push(
        `<rect x="${rx}" y="${ry}" width="${rWidth}" height="${rHeight}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" rx="2" />`,
      );
    }

    const cx = toSx(lx);
    const cy = toSy(lz);
    lines.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="#0f172a">${escapeXml(rm.number)}</text>`,
    );
    if (rm.name) {
      lines.push(
        `<text x="${cx}" y="${Number(cy) + 12}" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="#475569">${escapeXml(rm.name)}</text>`,
      );
    }
    if (rm.aiComment) {
      lines.push(
        `<text x="${cx}" y="${Number(cy) - 12}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="600" fill="#7c3aed">[AI Note]</text>`,
      );
    }
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}

/**
 * Generates a top-down SVG overview of the entire campus.
 */
export function generateCampusOverviewSvg(doc: EditorDocument, changes: SemanticChange[]): string {
  const svgW = 1000;
  const svgH = 800;
  const scale = 3.2;
  const cxOffset = svgW / 2;
  const czOffset = svgH / 2;

  const toSx = (wx: number) => (cxOffset + wx * scale).toFixed(1);
  const toSy = (wz: number) => (czOffset + wz * scale).toFixed(1);

  const changeByTarget = new Map<string, SemanticChange>();
  for (const chg of changes) {
    changeByTarget.set(chg.targetId, chg);
  }

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">`,
  );
  lines.push(`<rect width="100%" height="100%" fill="#f8fafc" />`);
  lines.push(
    `<text x="24" y="32" font-size="18" font-weight="700" fill="#0f172a">${escapeXml(doc.name)} — Campus 2D Overview</text>`,
  );
  lines.push(
    `<text x="24" y="52" font-size="12" fill="#475569">Buildings: ${doc.buildings.length} | Outdoor Elements: ${(doc.outdoorElements ?? []).length} | Tracked Changes: ${changes.length}</text>`,
  );

  // Outdoor elements
  for (const out of doc.outdoorElements ?? []) {
    const [wx, wz] = out.center;
    const [w, d] = out.size;
    const rx = toSx(wx - w / 2);
    const ry = toSy(wz - d / 2);
    const rw = (w * scale).toFixed(1);
    const rh = (d * scale).toFixed(1);

    let fill = '#e2e8f0';
    let stroke = '#94a3b8';
    if (out.type === 'lawn' || out.type === 'tree') {
      fill = '#dcfce7';
      stroke = '#22c55e';
    } else if (out.type === 'fountain') {
      fill = '#e0f2fe';
      stroke = '#0284c7';
    } else if (out.type === 'road' || out.type === 'path' || out.type === 'walkway') {
      fill = '#cbd5e1';
      stroke = '#475569';
    }

    if (out.shape === 'polyline' && out.points && out.points.length >= 2) {
      const pts = out.points.map(([px, pz]) => `${toSx(px)},${toSy(pz)}`).join(' ');
      const strokeW = Math.max(2, (out.width ?? 3) * scale).toFixed(1);
      lines.push(
        `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" />`,
      );
    } else {
      lines.push(
        `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" stroke="${stroke}" stroke-width="1" rx="3" />`,
      );
    }
  }

  // Buildings
  for (const bld of doc.buildings) {
    const chg = changeByTarget.get(bld.id);
    const stroke = chg ? '#d97706' : '#1e293b';
    const strokeWidth = chg ? '2.5' : '1.5';
    const fill = chg ? '#fef3c7' : '#ffffff';

    const partsToDraw = bld.parts && bld.parts.length > 0 ? bld.parts : [bld.footprint];
    for (const part of partsToDraw) {
      const [px, pz] = part.center;
      const [pw, pd] = part.size;
      const rx = toSx(px - pw / 2);
      const ry = toSy(pz - pd / 2);
      lines.push(
        `<rect x="${rx}" y="${ry}" width="${(pw * scale).toFixed(1)}" height="${(pd * scale).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" rx="3" />`,
      );
    }

    const [cx, cz] = bld.footprint.center;
    lines.push(
      `<text x="${toSx(cx)}" y="${toSy(cz)}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="#0f172a">${escapeXml(bld.shortName || bld.name)}</text>`,
    );
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}

/**
 * Generates a valid PNG binary preview of the campus.
 * Uses HTMLCanvasElement in the browser and falls back to a valid minimal PNG in headless test environments.
 */
export function generatePreviewPngBytes(doc: EditorDocument, changes: SemanticChange[]): Uint8Array {
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const scale = 2.4;
        const ox = canvas.width / 2;
        const oz = canvas.height / 2;

        // Draw outdoor elements
        for (const out of doc.outdoorElements ?? []) {
          ctx.fillStyle =
            out.type === 'lawn' || out.type === 'tree'
              ? '#dcfce7'
              : out.type === 'fountain'
                ? '#bae6fd'
                : '#e2e8f0';
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          const [wx, wz] = out.center;
          const [w, d] = out.size;
          ctx.fillRect(ox + (wx - w / 2) * scale, oz + (wz - d / 2) * scale, w * scale, d * scale);
        }

        // Draw buildings
        const changedIds = new Set(changes.map((c) => c.targetId));
        for (const bld of doc.buildings) {
          const isChanged = changedIds.has(bld.id);
          ctx.fillStyle = isChanged ? '#fef3c7' : '#ffffff';
          ctx.strokeStyle = isChanged ? '#d97706' : '#334155';
          ctx.lineWidth = isChanged ? 2 : 1.5;

          const parts = bld.parts && bld.parts.length > 0 ? bld.parts : [bld.footprint];
          for (const p of parts) {
            const sx = ox + (p.center[0] - p.size[0] / 2) * scale;
            const sy = oz + (p.center[1] - p.size[1] / 2) * scale;
            ctx.fillRect(sx, sy, p.size[0] * scale, p.size[1] * scale);
            ctx.strokeRect(sx, sy, p.size[0] * scale, p.size[1] * scale);
          }

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
            bld.shortName || bld.name,
            ox + bld.footprint.center[0] * scale,
            oz + bld.footprint.center[1] * scale + 4,
          );
        }

        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
          const b64 = dataUrl.slice('data:image/png;base64,'.length);
          const binStr = atob(b64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) {
            bytes[i] = binStr.charCodeAt(i);
          }
          if (bytes.length > 32) {
            return bytes;
          }
        }
      }
    } catch {
      // Fallback below
    }
  }

  // Standard valid 1x1 white PNG fallback for Node / Vitest environments without Canvas2D
  // PNG signature + IHDR + IDAT + IEND
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
    0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

/**
 * Generates human- and AI-readable Markdown instructions summarizing all edits,
 * AI annotations, and attached visual reference photographs.
 */
export function generateInstructionsMarkdown(
  doc: EditorDocument,
  changes: SemanticChange[],
  exportedReferences: ExportedObjectReferencesMetadata[] = [],
  referenceScope: ExportReferenceScope = 'all',
): string {
  const lines: string[] = [];

  lines.push(`# Campus Edit Session — Instructions for AI & Human Review`);
  lines.push(``);
  lines.push(`- **Campus**: ${doc.name} (\`${doc.campusId}\`)`);
  lines.push(`- **Export Schema Version**: \`${EXPORT_SCHEMA_VERSION}\``);
  lines.push(`- **Reference Export Scope**: \`${referenceScope}\``);
  lines.push(`- **Generated At**: \`${new Date().toISOString()}\``);
  lines.push(
    `- **Coordinate System**: Meters (\`m\`), World Axes: \`X\` = East, \`Y\` = Up, \`Z\` = South (North is \`-Z\`). Room coordinates \`localCenter: [lx, lz]\` are relative to their parent building's \`footprint.center: [wx, wz]\`.`,
  );
  lines.push(``);

  if (doc.aiComment) {
    lines.push(`## Global Campus Instructions for AI`);
    lines.push(``);
    lines.push(`> ${doc.aiComment}`);
    lines.push(``);
  }

  // Collect all objects that have an explicit AI comment
  const aiNotes: {
    scope: string;
    id: string;
    name: string;
    type: string;
    coords: string;
    comment: string;
  }[] = [];

  for (const bld of doc.buildings) {
    if (bld.aiComment && bld.aiComment.trim()) {
      aiNotes.push({
        scope: 'Building',
        id: bld.id,
        name: `${bld.name} (${bld.shortName})`,
        type: 'building',
        coords: `World Center [${bld.footprint.center[0]}m, ${bld.footprint.center[1]}m], Size ${bld.footprint.size[0]}m × ${bld.footprint.size[1]}m`,
        comment: bld.aiComment.trim(),
      });
    }
    for (const fl of bld.floors) {
      if (fl.aiComment && fl.aiComment.trim()) {
        aiNotes.push({
          scope: `${bld.shortName || bld.name} · Floor ${fl.level}`,
          id: fl.id,
          name: fl.name,
          type: 'floor',
          coords: `Level ${fl.level}`,
          comment: fl.aiComment.trim(),
        });
      }
      for (const rm of fl.rooms) {
        if (rm.aiComment && rm.aiComment.trim()) {
          aiNotes.push({
            scope: `${bld.shortName || bld.name} · Floor ${fl.level}`,
            id: rm.id,
            name: rm.name ? `${rm.number} (${rm.name})` : rm.number,
            type: rm.elementType || rm.kind,
            coords: `Local [${rm.localCenter[0]}m, ${rm.localCenter[1]}m], Size ${rm.size[0]}m × ${rm.size[1]}m`,
            comment: rm.aiComment.trim(),
          });
        }
      }
    }
  }

  for (const out of doc.outdoorElements ?? []) {
    if (out.aiComment && out.aiComment.trim()) {
      aiNotes.push({
        scope: `Outdoor (${out.layer})`,
        id: out.id,
        name: out.name,
        type: out.type,
        coords: `World Center [${out.center[0]}m, ${out.center[1]}m], Size ${out.size[0]}m × ${out.size[1]}m`,
        comment: out.aiComment.trim(),
      });
    }
  }

  lines.push(`## 1. User-Authored Instructions for AI (${aiNotes.length})`);
  lines.push(``);
  if (aiNotes.length === 0) {
    lines.push(`_No object-specific AI instructions were attached in this session._`);
    lines.push(``);
  } else {
    for (const note of aiNotes) {
      lines.push(`### ${note.name} (\`${note.id}\`)`);
      lines.push(`- **Location / Scope**: ${note.scope}`);
      lines.push(`- **Semantic Type**: \`${note.type}\``);
      lines.push(`- **Geometry**: ${note.coords}`);
      lines.push(`- **Instruction for AI**:`);
      lines.push(`  > "${note.comment}"`);
      lines.push(``);
    }
  }

  const totalPhotos = exportedReferences.reduce((acc, r) => acc + r.photos.length, 0);
  lines.push(`## 2. Visual Reference Photographs & AI Interpretation Guide (${totalPhotos} photos)`);
  lines.push(``);
  lines.push(
    `Each attached reference photograph is stored in its original binary format under \`references/\` and mapped to its exact campus object ID (\`targetId\`), building, floor, caption, viewpoint direction, and AI instruction.`,
  );
  lines.push(
    `**How the AI should interpret these references:** Examine the linked image file at \`relativePath\`, use the **Caption / Description** to identify real-world architectural features, use the **Direction / Viewpoint** to orient the photo relative to the 2D/3D coordinate axes, and follow the **AI Instruction** for layout, proportions, materials, and preservation constraints.`,
  );
  lines.push(``);

  if (exportedReferences.length === 0) {
    lines.push(`_No reference photographs were included in this export (scope: \`${referenceScope}\`)._`);
    lines.push(``);
  } else {
    for (const refGroup of exportedReferences) {
      lines.push(
        `### Object: ${refGroup.locationLabel} — ${refGroup.objectName} (\`${refGroup.targetId}\`, type: \`${refGroup.semanticType}\`)`,
      );
      lines.push(`- **Metadata File**: \`${refGroup.metadataPath}\``);
      if (refGroup.buildingId) {
        lines.push(`- **Building**: ${refGroup.buildingName || refGroup.buildingId} (\`${refGroup.buildingId}\`)`);
      }
      if (refGroup.floorId) {
        lines.push(`- **Floor**: Level ${refGroup.floorLevel} (\`${refGroup.floorId}\`)`);
      }
      if (refGroup.aiComment) {
        lines.push(`- **Object AI Note**: "${refGroup.aiComment}"`);
      }
      lines.push(`- **Attached Reference Photos (${refGroup.photos.length})**:`);
      for (const p of refGroup.photos) {
        lines.push(`  1. **File**: \`${p.relativePath}\` (original: \`${p.originalFileName}\`, ${p.mimeType}, ${p.byteSize} bytes)`);
        if (p.title) {
          lines.push(`     - **Title**: ${p.title}`);
        }
        if (p.direction) {
          lines.push(`     - **Photographed Direction / Viewpoint**: ${p.direction}`);
        }
        if (p.caption) {
          lines.push(`     - **Caption (What it shows)**: "${p.caption}"`);
        }
        if (p.aiInstruction) {
          lines.push(`     - **AI Instruction**: "${p.aiInstruction}"`);
        }
      }
      lines.push(``);
    }
  }

  lines.push(`## 3. Summary of Tracked Changes (${changes.length})`);
  lines.push(``);
  if (changes.length === 0) {
    lines.push(`_No geometric or property changes relative to the baseline campus state._`);
    lines.push(``);
  } else {
    const grouped: Record<string, SemanticChange[]> = {
      added: [],
      moved: [],
      resized: [],
      renamed: [],
      modified: [],
      deleted: [],
    };
    for (const chg of changes) {
      grouped[chg.primaryCategory]?.push(chg);
    }

    for (const [cat, list] of Object.entries(grouped)) {
      if (list.length === 0) continue;
      lines.push(`### ${cat.toUpperCase()} (${list.length})`);
      for (const item of list) {
        lines.push(
          `- **${item.name}** (\`${item.targetId}\`, \`${item.semanticLabel}\` in ${item.locationLabel}): ${item.summary}${
            item.aiComment ? ` — *AI Note: "${item.aiComment}"*` : ''
          }`,
        );
      }
      lines.push(``);
    }
  }

  lines.push(`## 4. Package Structure & How to Reconstruct`);
  lines.push(``);
  lines.push(`- \`manifest.json\`: Versioned metadata, coordinate datum, change statistics, and reference photo index.`);
  lines.push(`- \`instructions.md\`: Human- and AI-readable guide linking edits, AI instructions, and reference photographs.`);
  lines.push(`- \`changes.json\`: Complete semantic diff (Added, Moved, Resized, Renamed, Modified, Deleted) with \`before\` and \`after\` states.`);
  lines.push(`- \`geometry.json\`: Full source-of-truth document (\`EditorDocument\`) plus computed 3D world-space geometry.`);
  lines.push(`- \`references/**/metadata.json\` & image files: Original reference photographs organized by building, floor, and object.`);
  lines.push(`- \`preview.png\` & \`campus-overview.svg\`: Visual overview of the campus exterior.`);
  lines.push(`- \`floor-plans/*.svg\`: Top-down 2D vector floor plans for each building floor.`);

  return lines.join('\n');
}

export interface BuiltExportPackage {
  zipBytes: Uint8Array;
  manifest: ExportManifest;
  changes: SemanticChange[];
  validationIssues: ValidationIssue[];
  references: ExportedObjectReferencesMetadata[];
  files: Record<string, string | Uint8Array>;
}

/**
 * Validates and builds the complete AI-friendly ZIP package for the current editing session.
 * Throws an actionable error if validation fails with severity === 'error' or if any referenced
 * image file is missing from storage.
 */
export function buildCampusEditZipPackage(
  currentDoc: EditorDocument,
  baselineDoc: EditorDocument,
  options: ExportOptions = {},
): BuiltExportPackage {
  const referenceScope: ExportReferenceScope = options.referenceScope ?? 'all';
  const validationIssues = validateDocument(currentDoc);
  const blockingErrors = validationIssues.filter((i) => i.severity === 'error');
  if (blockingErrors.length > 0) {
    const msg = blockingErrors.map((e) => `• ${e.message}`).join('\n');
    throw new Error(`Export blocked due to validation errors:\n${msg}`);
  }

  const changes = computeSemanticChanges(baselineDoc, currentDoc);
  const changedTargetIds = new Set<string>(changes.map((c) => c.targetId));

  const shouldIncludeObjectReferences = (targetId: string): boolean => {
    if (referenceScope === 'all') return true;
    return changedTargetIds.has(targetId);
  };

  const { campus, buildingFootprintsPx, roomOverrides, contextFeaturesPx } =
    editorDocToCampusAndGeom(currentDoc);

  const floorPlanEntries: ZipEntryInput[] = [];
  const referenceEntries: ZipEntryInput[] = [];
  const exportedReferences: ExportedObjectReferencesMetadata[] = [];

  const fileNames: string[] = [
    'campus-edit/manifest.json',
    'campus-edit/instructions.md',
    'campus-edit/changes.json',
    'campus-edit/geometry.json',
    'campus-edit/preview.png',
    'campus-edit/campus-overview.svg',
  ];

  // Helper to package an object's photos into a folder + metadata.json
  const packageObjectPhotos = (params: {
    photos?: PhotoAttachment[];
    targetId: string;
    targetType: ExportedObjectReferencesMetadata['targetType'];
    objectName: string;
    semanticType: string;
    buildingId?: string;
    buildingName?: string;
    floorId?: string;
    floorLevel?: number;
    locationLabel: string;
    aiComment?: string;
    folderRelPath: string; // e.g. "references/block-a/floor-1/main-hall"
  }) => {
    const list = params.photos ? [...params.photos].sort((a, b) => a.order - b.order) : [];
    if (list.length === 0) return;
    if (!shouldIncludeObjectReferences(params.targetId)) return;

    const usedNames = new Set<string>(['metadata.json', 'index.json']);
    const exportedPhotos: ExportedReferencePhotoEntry[] = [];

    for (let i = 0; i < list.length; i++) {
      const photo = list[i];
      const blobRecord = getAttachmentBlobSync(photo.fileId);
      if (!blobRecord || !blobRecord.bytes || blobRecord.bytes.byteLength === 0) {
        throw new Error(
          `Missing binary image file for attachment "${photo.fileName}" (${photo.id}) on ${params.locationLabel} — ${params.objectName}.`,
        );
      }

      const safeFileName = makeSafeUniquePhotoFileName(photo, i, usedNames);
      const relativePath = `${params.folderRelPath}/${safeFileName}`;
      const archivePath = `campus-edit/${relativePath}`;

      fileNames.push(archivePath);
      referenceEntries.push({
        path: archivePath,
        content: blobRecord.bytes,
      });

      exportedPhotos.push({
        attachmentId: photo.id,
        fileId: photo.fileId,
        fileName: safeFileName,
        originalFileName: photo.fileName,
        relativePath,
        archivePath,
        mimeType: photo.mimeType || blobRecord.mimeType,
        byteSize: blobRecord.bytes.byteLength,
        title: photo.title,
        caption: photo.caption,
        aiInstruction: photo.aiInstruction,
        direction: photo.direction,
        order: i,
      });
    }

    const metadataRelPath = `${params.folderRelPath}/metadata.json`;
    const metadataArchivePath = `campus-edit/${metadataRelPath}`;
    const objMeta: ExportedObjectReferencesMetadata = {
      targetId: params.targetId,
      targetType: params.targetType,
      objectName: params.objectName,
      semanticType: params.semanticType,
      buildingId: params.buildingId,
      buildingName: params.buildingName,
      floorId: params.floorId,
      floorLevel: params.floorLevel,
      locationLabel: params.locationLabel,
      aiComment: params.aiComment,
      metadataPath: metadataRelPath,
      photos: exportedPhotos,
    };

    fileNames.push(metadataArchivePath);
    referenceEntries.push({
      path: metadataArchivePath,
      content: JSON.stringify(objMeta, null, 2),
    });

    exportedReferences.push(objMeta);
  };

  // 1. Campus-level photos
  packageObjectPhotos({
    photos: currentDoc.photos,
    targetId: currentDoc.campusId,
    targetType: 'campus',
    objectName: currentDoc.name,
    semanticType: 'campus',
    locationLabel: 'Overall Campus',
    aiComment: currentDoc.aiComment,
    folderRelPath: 'references/campus',
  });

  let totalFloors = 0;
  let totalIndoor = 0;
  let aiCommentCount = currentDoc.aiComment ? 1 : 0;

  // 2. Buildings, Floors, and Indoor Objects
  const usedBuildingFolders = new Set<string>(['campus', 'outdoor']);
  for (const bld of currentDoc.buildings) {
    if (bld.aiComment?.trim()) aiCommentCount++;
    let bldSlug = slugifyBuilding(bld);
    if (usedBuildingFolders.has(bldSlug)) {
      bldSlug = `${bldSlug}-${slugifySegment(bld.id)}`;
    }
    usedBuildingFolders.add(bldSlug);

    packageObjectPhotos({
      photos: bld.photos,
      targetId: bld.id,
      targetType: 'building',
      objectName: bld.name,
      semanticType: 'building',
      buildingId: bld.id,
      buildingName: bld.name,
      locationLabel: `${bld.name} (${bld.shortName || bld.id})`,
      aiComment: bld.aiComment,
      folderRelPath: `references/${bldSlug}`,
    });

    for (const fl of bld.floors) {
      totalFloors++;
      if (fl.aiComment?.trim()) aiCommentCount++;
      totalIndoor += fl.rooms.length;

      const floorSlug = `floor-${fl.level}`;
      packageObjectPhotos({
        photos: fl.photos,
        targetId: fl.id,
        targetType: 'floor',
        objectName: fl.name,
        semanticType: 'floor',
        buildingId: bld.id,
        buildingName: bld.name,
        floorId: fl.id,
        floorLevel: fl.level,
        locationLabel: `${bld.name} (${bld.shortName || bld.id}), Floor ${fl.level}`,
        aiComment: fl.aiComment,
        folderRelPath: `references/${bldSlug}/${floorSlug}`,
      });

      const usedRoomFolders = new Set<string>();
      for (const rm of fl.rooms) {
        if (rm.aiComment?.trim()) aiCommentCount++;
        let rmSlug = slugifySegment(rm.name || rm.number || rm.id, rm.id);
        if (usedRoomFolders.has(rmSlug)) {
          rmSlug = `${rmSlug}-${slugifySegment(rm.id)}`;
        }
        usedRoomFolders.add(rmSlug);

        packageObjectPhotos({
          photos: rm.photos,
          targetId: rm.id,
          targetType: 'room',
          objectName: rm.name ? `${rm.name} (${rm.number})` : rm.number,
          semanticType: rm.elementType || rm.kind,
          buildingId: bld.id,
          buildingName: bld.name,
          floorId: fl.id,
          floorLevel: fl.level,
          locationLabel: `${bld.name} (${bld.shortName || bld.id}), Floor ${fl.level}`,
          aiComment: rm.aiComment,
          folderRelPath: `references/${bldSlug}/${floorSlug}/${rmSlug}`,
        });
      }

      const svgPath = `campus-edit/floor-plans/${bldSlug}-floor-${fl.level}.svg`;
      fileNames.push(svgPath);
      floorPlanEntries.push({
        path: svgPath,
        content: generateFloorPlanSvg(bld, fl),
      });
    }
  }

  // 3. Outdoor Elements
  const usedOutdoorFolders = new Set<string>();
  for (const out of currentDoc.outdoorElements ?? []) {
    if (out.aiComment?.trim()) aiCommentCount++;
    let outSlug = slugifySegment(out.name || out.id, out.id);
    if (usedOutdoorFolders.has(outSlug)) {
      outSlug = `${outSlug}-${slugifySegment(out.id)}`;
    }
    usedOutdoorFolders.add(outSlug);

    packageObjectPhotos({
      photos: out.photos,
      targetId: out.id,
      targetType: 'outdoor',
      objectName: out.name,
      semanticType: out.type,
      locationLabel: `Campus Outdoor (${out.layer})`,
      aiComment: out.aiComment,
      folderRelPath: `references/outdoor/${outSlug}`,
    });
  }

  if (exportedReferences.length > 0) {
    const refIndexPath = 'campus-edit/references/index.json';
    fileNames.push(refIndexPath);
    referenceEntries.push({
      path: refIndexPath,
      content: JSON.stringify(
        {
          schemaVersion: EXPORT_SCHEMA_VERSION,
          referenceScope,
          totalObjectsWithReferences: exportedReferences.length,
          totalReferencePhotos: exportedReferences.reduce((acc, r) => acc + r.photos.length, 0),
          objects: exportedReferences,
        },
        null,
        2,
      ),
    });
  }

  const totalReferencePhotoCount = exportedReferences.reduce(
    (acc, r) => acc + r.photos.length,
    0,
  );

  const manifest: ExportManifest = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    packageFormat: 'campus-edit-package',
    exportedAt: new Date().toISOString(),
    campusId: currentDoc.campusId,
    campusName: currentDoc.name,
    referenceScope,
    coordinateSystem: {
      units: 'm',
      axes: 'X=east, Y=up, Z=south (north is -Z)',
      datum: 'Center of reference image public/reference/campus.jpg (703x1024 px at 0.3 m/px)',
      referenceImageSizePx: mapConfig.reference.imageSizePx,
      metersPerPixel: mapConfig.reference.metersPerPixel,
      floorHeightMeters: mapConfig.building.floorHeight,
      slabThicknessMeters: mapConfig.building.slabThickness,
    },
    stats: {
      buildingCount: currentDoc.buildings.length,
      floorCount: totalFloors,
      indoorElementCount: totalIndoor,
      outdoorElementCount: (currentDoc.outdoorElements ?? []).length,
      totalChanges: changes.length,
      addedCount: changes.filter((c) => c.categories.includes('added')).length,
      modifiedCount: changes.filter((c) => c.categories.includes('modified')).length,
      movedCount: changes.filter((c) => c.categories.includes('moved')).length,
      resizedCount: changes.filter((c) => c.categories.includes('resized')).length,
      renamedCount: changes.filter((c) => c.categories.includes('renamed')).length,
      deletedCount: changes.filter((c) => c.categories.includes('deleted')).length,
      aiCommentCount,
      referencePhotoCount: totalReferencePhotoCount,
    },
    references: exportedReferences,
    files: fileNames,
  };

  const instructionsMd = generateInstructionsMarkdown(
    currentDoc,
    changes,
    exportedReferences,
    referenceScope,
  );

  const changesPayload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    campusId: currentDoc.campusId,
    exportedAt: manifest.exportedAt,
    summary: manifest.stats,
    changes,
  };

  const geometryPayload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    coordinateSystem: manifest.coordinateSystem,
    document: currentDoc,
    derivedWorldGeometry: {
      campus,
      buildingFootprintsPx,
      roomOverrides,
      contextFeaturesPx,
    },
  };

  const previewPng = generatePreviewPngBytes(currentDoc, changes);
  const overviewSvg = generateCampusOverviewSvg(currentDoc, changes);

  const zipInputs: ZipEntryInput[] = [
    { path: 'campus-edit/manifest.json', content: JSON.stringify(manifest, null, 2) },
    { path: 'campus-edit/instructions.md', content: instructionsMd },
    { path: 'campus-edit/changes.json', content: JSON.stringify(changesPayload, null, 2) },
    { path: 'campus-edit/geometry.json', content: JSON.stringify(geometryPayload, null, 2) },
    { path: 'campus-edit/preview.png', content: previewPng },
    { path: 'campus-edit/campus-overview.svg', content: overviewSvg },
    ...floorPlanEntries,
    ...referenceEntries,
  ];

  const filesMap: Record<string, string | Uint8Array> = {};
  for (const entry of zipInputs) {
    filesMap[entry.path] = entry.content;
  }

  // Final verification that every referenced photo is present in filesMap
  for (const refObj of exportedReferences) {
    for (const p of refObj.photos) {
      if (!filesMap[p.archivePath]) {
        throw new Error(`Export archive verification failed: missing file "${p.archivePath}".`);
      }
    }
  }

  const zipBytes = buildZipArchive(zipInputs);

  // Ensure crc32 is referenced
  void crc32;

  return {
    zipBytes,
    manifest,
    changes,
    validationIssues,
    references: exportedReferences,
    files: filesMap,
  };
}

/**
 * Triggers a browser download of the generated ZIP archive.
 */
export function downloadCampusEditZip(
  currentDoc: EditorDocument,
  baselineDoc: EditorDocument,
  options: ExportOptions = {},
): BuiltExportPackage {
  const pkg = buildCampusEditZipPackage(currentDoc, baselineDoc, options);
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([pkg.zipBytes as unknown as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `campus-edit-${dateStamp}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  return pkg;
}

