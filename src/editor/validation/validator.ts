import type { EditorDocument, ValidationIssue } from '../domain/types';

export function validateDocument(doc: EditorDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenBuildingIds = new Set<string>();
  const seenRoomIds = new Set<string>();

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
            message: `Помещение "${rm.id}" не имеет номера`,
            severity: 'error',
          });
        }

        const [rw, rd] = rm.size;
        if (isNaN(rw) || isNaN(rd) || rw < 0.5 || rd < 0.5) {
          issues.push({
            id: `rm_dim_${rm.id}`,
            targetId: rm.id,
            targetType: 'room',
            message: `Некорректный размер помещения "${rm.number}": ${rw}м × ${rd}м`,
            severity: 'error',
          });
        }

        // Room containment warning (relative to building footprint bounds)
        const [lx, lz] = rm.localCenter;
        const halfBw = bw / 2;
        const halfBd = bd / 2;
        const halfRw = rw / 2;
        const halfRd = rd / 2;

        const left = lx - halfRw;
        const right = lx + halfRw;
        const top = lz - halfRd;
        const bottom = lz + halfRd;

        // Allow slight tolerance of 0.5m for perimeter walls
        const tolerance = 0.5;
        if (
          left < -halfBw - tolerance ||
          right > halfBw + tolerance ||
          top < -halfBd - tolerance ||
          bottom > halfBd + tolerance
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

  return issues;
}
