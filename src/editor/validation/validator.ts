import type { EditorDocument, PhotoAttachment, ValidationIssue } from '../domain/types';
import { hasAttachmentBlob } from '../storage/attachmentStorage';

function validatePhotoAttachments(
  photos: PhotoAttachment[] | undefined,
  targetId: string,
  targetType: ValidationIssue['targetType'],
  objectLabel: string,
  issues: ValidationIssue[],
): void {
  if (!photos || photos.length === 0) return;
  for (const photo of photos) {
    if (!photo.fileId || !hasAttachmentBlob(photo.fileId)) {
      issues.push({
        id: `photo_missing_${targetId}_${photo.id}`,
        targetId,
        targetType,
        message: `Missing image file "${photo.fileName || photo.id}" attached to ${objectLabel}`,
        severity: 'error',
      });
    }
  }
}

export function validateDocument(doc: EditorDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenBuildingIds = new Set<string>();
  const seenRoomIds = new Set<string>();
  const seenOutdoorIds = new Set<string>();

  validatePhotoAttachments(doc.photos, doc.campusId, 'campus', `Campus "${doc.name}"`, issues);

  for (const bld of doc.buildings) {
    if (!bld.id) {
      issues.push({
        id: `bld_no_id_${Math.random()}`,
        targetId: 'unknown',
        targetType: 'building',
        message: 'Здание не имеет идентификатора (id)',
        severity: 'error',
      });
    } else if (seenBuildingIds.has(bld.id)) {
      issues.push({
        id: `bld_dup_${bld.id}`,
        targetId: bld.id,
        targetType: 'building',
        message: `Дублирующийся ID здания: "${bld.id}"`,
        severity: 'error',
      });
    } else {
      seenBuildingIds.add(bld.id);
    }

    if (!bld.name || bld.name.trim() === '') {
      issues.push({
        id: `bld_name_${bld.id}`,
        targetId: bld.id,
        targetType: 'building',
        message: `У здания "${bld.id}" не указано название`,
        severity: 'error',
      });
    }

    const [bw, bd] = bld.footprint.size;
    if (isNaN(bw) || isNaN(bd) || bw < 1 || bd < 1) {
      issues.push({
        id: `bld_dim_${bld.id}`,
        targetId: bld.id,
        targetType: 'building',
        message: `Некорректные размеры здания "${bld.name || bld.id}": ${bw}м × ${bd}м (минимум 1м × 1м)`,
        severity: 'error',
      });
    }

    validatePhotoAttachments(
      bld.photos,
      bld.id,
      'building',
      `Building "${bld.name || bld.id}"`,
      issues,
    );

    const seenFloorLevels = new Set<number>();
    for (const fl of bld.floors) {
      if (seenFloorLevels.has(fl.level)) {
        issues.push({
          id: `fl_dup_${bld.id}_${fl.id}`,
          targetId: fl.id,
          targetType: 'floor',
          message: `В здании "${bld.name}" обнаружен дублирующийся уровень этажа: ${fl.level}`,
          severity: 'error',
        });
      } else {
        seenFloorLevels.add(fl.level);
      }

      validatePhotoAttachments(
        fl.photos,
        fl.id,
        'floor',
        `${bld.shortName || bld.name} · Floor ${fl.level}`,
        issues,
      );

      for (const rm of fl.rooms) {
        if (!rm.id) {
          issues.push({
            id: `rm_no_id_${Math.random()}`,
            targetId: 'unknown',
            targetType: 'room',
            message: 'Помещение не имеет идентификатора (id)',
            severity: 'error',
          });
        } else if (seenRoomIds.has(rm.id)) {
          issues.push({
            id: `rm_dup_${rm.id}`,
            targetId: rm.id,
            targetType: 'room',
            message: `Дублирующийся ID помещения: "${rm.id}"`,
            severity: 'error',
          });
        } else {
          seenRoomIds.add(rm.id);
        }

        if (!rm.number || rm.number.trim() === '') {
          issues.push({
            id: `rm_num_${rm.id}`,
            targetId: rm.id,
            targetType: 'room',
            message: `Помещение "${rm.id}" не имеет номера или обозначения`,
            severity: 'error',
          });
        }

        validatePhotoAttachments(
          rm.photos,
          rm.id,
          'room',
          `${bld.shortName || bld.name} · Floor ${fl.level} · "${rm.name || rm.number}"`,
          issues,
        );

        const isThinElement =
          rm.elementType === 'wall' ||
          rm.elementType === 'partition' ||
          rm.elementType === 'door' ||
          rm.elementType === 'window';
        const minAllowedDim = isThinElement ? 0.15 : 0.5;

        const [rw, rd] = rm.size;
        if (isNaN(rw) || isNaN(rd) || rw < minAllowedDim || rd < minAllowedDim) {
          issues.push({
            id: `rm_dim_${rm.id}`,
            targetId: rm.id,
            targetType: 'room',
            message: `Некорректный размер элемента "${rm.number}": ${rw}м × ${rd}м`,
            severity: 'error',
          });
        }

        // Room containment warning (relative to building footprint bounds, considering multi-wing bbox if present)
        let minBoundX = -bw / 2;
        let maxBoundX = bw / 2;
        let minBoundZ = -bd / 2;
        let maxBoundZ = bd / 2;

        if (bld.parts && bld.parts.length > 1) {
          for (const part of bld.parts) {
            const relCx = part.center[0] - bld.footprint.center[0];
            const relCz = part.center[1] - bld.footprint.center[1];
            minBoundX = Math.min(minBoundX, relCx - part.size[0] / 2);
            maxBoundX = Math.max(maxBoundX, relCx + part.size[0] / 2);
            minBoundZ = Math.min(minBoundZ, relCz - part.size[1] / 2);
            maxBoundZ = Math.max(maxBoundZ, relCz + part.size[1] / 2);
          }
        }

        const [lx, lz] = rm.localCenter;
        const halfRw = rw / 2;
        const halfRd = rd / 2;

        const left = lx - halfRw;
        const right = lx + halfRw;
        const top = lz - halfRd;
        const bottom = lz + halfRd;

        const tolerance = 0.75;
        if (
          left < minBoundX - tolerance ||
          right > maxBoundX + tolerance ||
          top < minBoundZ - tolerance ||
          bottom > maxBoundZ + tolerance
        ) {
          issues.push({
            id: `rm_bounds_${rm.id}`,
            targetId: rm.id,
            targetType: 'room',
            message: `Помещение "${rm.number}" выходит за границы здания "${bld.shortName || bld.name}"`,
            severity: 'warning',
          });
        }
      }
    }
  }

  for (const out of doc.outdoorElements ?? []) {
    if (!out.id) {
      issues.push({
        id: `out_no_id_${Math.random()}`,
        targetId: 'unknown',
        targetType: 'outdoor',
        message: 'Внешний объект не имеет идентификатора (id)',
        severity: 'error',
      });
    } else if (seenOutdoorIds.has(out.id)) {
      issues.push({
        id: `out_dup_${out.id}`,
        targetId: out.id,
        targetType: 'outdoor',
        message: `Дублирующийся ID внешнего объекта: "${out.id}"`,
        severity: 'error',
      });
    } else {
      seenOutdoorIds.add(out.id);
    }

    if (!out.name || out.name.trim() === '') {
      issues.push({
        id: `out_name_${out.id}`,
        targetId: out.id,
        targetType: 'outdoor',
        message: `Внешний объект "${out.id}" не имеет названия`,
        severity: 'error',
      });
    }

    validatePhotoAttachments(
      out.photos,
      out.id,
      'outdoor',
      `Outdoor "${out.name || out.id}"`,
      issues,
    );

    if (out.shape === 'polygon' && (!out.points || out.points.length < 3)) {
      issues.push({
        id: `out_poly_${out.id}`,
        targetId: out.id,
        targetType: 'outdoor',
        message: `Полигон "${out.name}" должен содержать минимум 3 вершины`,
        severity: 'error',
      });
    }

    if (out.shape === 'polyline' && (!out.points || out.points.length < 2)) {
      issues.push({
        id: `out_line_${out.id}`,
        targetId: out.id,
        targetType: 'outdoor',
        message: `Дорожка / линия "${out.name}" должна содержать минимум 2 точки`,
        severity: 'error',
      });
    }
  }

  return issues;
}


