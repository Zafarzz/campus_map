import type { Room, RoomKind } from '../../domain/campus/types';
import type { RoomGeometry, Vec2, Vec3 } from '../../domain/geometry/types';
import { buildingFootprintsPx, type PxRect } from '../reference-footprints';
import { mapConfig } from '../../config/mapConfig';

export type PlanRoomDef = {
  id: string;
  number: string;
  name?: string;
  kind: RoomKind;
  capacity?: number;
  /** Normalized long-axis span [u0, u1] within [0, 1] */
  uSpan: [number, number];
  /** Normalized short-axis span [v0, v1] within [0, 1] */
  vSpan: [number, number];
  legacyId?: string;
  /**
   * Index into `buildingFootprintsPx[buildingId]` that uSpan/vSpan are relative to.
   * Omitted → the largest part (historical behaviour).
   */
  part?: number;
  /**
   * 'confirmed' (default) = traced from the CAD/PDF sheet → precision 'surveyed'.
   * 'demo' = from a rough sketch, no drawing → precision 'approximate'.
   */
  provenance?: 'confirmed' | 'demo';
};

export type FloorPlanDef = {
  buildingId: string;
  level: number;
  rooms: PlanRoomDef[];
};

const [imgW, imgH] = mapConfig.reference.imageSizePx;
const mpp = mapConfig.reference.metersPerPixel;
const floorHeight = mapConfig.building.floorHeight;
const slabThickness = mapConfig.building.slabThickness;
const roomHeight = mapConfig.roomLayout.roomHeight;
const gap = 0.2; // 20cm visual wall gap between rooms

function pxRectToRect([l, t, r, b]: PxRect): { center: Vec2; size: Vec2 } {
  return {
    center: [((l + r) / 2 - imgW / 2) * mpp, ((t + b) / 2 - imgH / 2) * mpp],
    size: [(r - l) * mpp, (b - t) * mpp],
  };
}

/**
 * Floor plans extracted and calibrated from CAD sheets in "Campus map (3).pdf".
 */
export const confirmedFloorPlans: FloorPlanDef[] = [
  // ==========================================
  // BUILDING A (bld-h) - Main Academic Block
  // ==========================================
  {
    buildingId: 'bld-h',
    level: 1,
    rooms: [
      // North wing (vSpan: [0.04, 0.45])
      { id: 'bld-h-f1-a107', number: 'A-107', name: 'Library (Archive & Media)', kind: 'hall', capacity: 20, uSpan: [0.08, 0.23], vSpan: [0.04, 0.45], legacyId: 'bld-h-f1-r5' },
      { id: 'bld-h-f1-a105', number: 'A-105', name: 'Library (Reading Hall)', kind: 'hall', capacity: 40, uSpan: [0.23, 0.42], vSpan: [0.04, 0.45], legacyId: 'bld-h-f1-r6' },
      { id: 'bld-h-f1-a103', number: 'A-103', name: 'Classroom / Lab', kind: 'classroom', capacity: 30, uSpan: [0.42, 0.61], vSpan: [0.04, 0.45], legacyId: 'bld-h-f1-r7' },
      { id: 'bld-h-f1-a101', number: 'A-101', name: 'Classroom / Lab', kind: 'classroom', capacity: 30, uSpan: [0.66, 0.85], vSpan: [0.04, 0.45], legacyId: 'bld-h-f1-r8' },
      // South wing (vSpan: [0.56, 0.96])
      { id: 'bld-h-f1-a110', number: 'A-110', name: 'Specimen Room', kind: 'lab', capacity: 15, uSpan: [0.02, 0.14], vSpan: [0.56, 0.96], legacyId: 'bld-h-f1-r9' },
      { id: 'bld-h-f1-a108', number: 'A-108', name: 'Classroom', kind: 'classroom', capacity: 36, uSpan: [0.14, 0.33], vSpan: [0.56, 0.96], legacyId: 'bld-h-f1-r4' },
      { id: 'bld-h-f1-a106', number: 'A-106', name: 'Classroom', kind: 'classroom', capacity: 36, uSpan: [0.33, 0.52], vSpan: [0.56, 0.96], legacyId: 'bld-h-f1-r3' },
      { id: 'bld-h-f1-a104', number: 'A-104', name: 'Classroom', kind: 'classroom', capacity: 36, uSpan: [0.52, 0.71], vSpan: [0.56, 0.96], legacyId: 'bld-h-f1-r2' },
      { id: 'bld-h-f1-a102', number: 'A-102', name: 'Classroom', kind: 'classroom', capacity: 36, uSpan: [0.71, 0.90], vSpan: [0.56, 0.96], legacyId: 'bld-h-f1-r1' },
    ],
  },
  {
    buildingId: 'bld-h',
    level: 2,
    rooms: [
      // North wing - Seminar / Faculty rooms (vSpan: [0.04, 0.45])
      { id: 'bld-h-f2-a211', number: 'A-211', name: 'Faculty / Seminar', kind: 'classroom', capacity: 20, uSpan: [0.08, 0.19], vSpan: [0.04, 0.45], legacyId: 'bld-h-f2-r10' },
      { id: 'bld-h-f2-a210', number: 'A-210', name: 'Faculty / Seminar', kind: 'classroom', capacity: 20, uSpan: [0.19, 0.30], vSpan: [0.04, 0.45], legacyId: 'bld-h-f2-r9' },
      { id: 'bld-h-f2-a209', number: 'A-209', name: 'Faculty / Seminar', kind: 'classroom', capacity: 20, uSpan: [0.30, 0.41], vSpan: [0.04, 0.45], legacyId: 'bld-h-f2-r8' },
      { id: 'bld-h-f2-a207', number: 'A-207', name: 'Faculty / Seminar', kind: 'classroom', capacity: 20, uSpan: [0.41, 0.52], vSpan: [0.04, 0.45], legacyId: 'bld-h-f2-r7' },
      { id: 'bld-h-f2-a205', number: 'A-205', name: 'Faculty / Seminar', kind: 'classroom', capacity: 20, uSpan: [0.52, 0.63], vSpan: [0.04, 0.45], legacyId: 'bld-h-f2-r6' },
      { id: 'bld-h-f2-a203', number: 'A-203', name: 'Faculty / Seminar', kind: 'classroom', capacity: 20, uSpan: [0.63, 0.74], vSpan: [0.04, 0.45], legacyId: 'bld-h-f2-r3' },
      { id: 'bld-h-f2-a201', number: 'A-201', name: 'Faculty / Seminar', kind: 'classroom', capacity: 20, uSpan: [0.74, 0.85], vSpan: [0.04, 0.45], legacyId: 'bld-h-f2-r1' },
      // South wing (vSpan: [0.56, 0.96])
      { id: 'bld-h-f2-a208', number: 'A-208', name: 'Computer Lab / Large Classroom', kind: 'lab', capacity: 48, uSpan: [0.04, 0.30], vSpan: [0.56, 0.96], legacyId: 'bld-h-f2-r7' },
      { id: 'bld-h-f2-a206', number: 'A-206', name: 'Classroom', kind: 'classroom', capacity: 36, uSpan: [0.30, 0.50], vSpan: [0.56, 0.96], legacyId: 'bld-h-f2-r5' },
      { id: 'bld-h-f2-a204', number: 'A-204', name: 'Classroom', kind: 'classroom', capacity: 36, uSpan: [0.50, 0.70], vSpan: [0.56, 0.96], legacyId: 'bld-h-f2-r4' },
      { id: 'bld-h-f2-a202', number: 'A-202', name: 'Classroom', kind: 'classroom', capacity: 36, uSpan: [0.70, 0.90], vSpan: [0.56, 0.96], legacyId: 'bld-h-f2-r2' },
    ],
  },
  // ==========================================
  // BUILDING B (bld-g) - Academic & Exhibition Block
  // ==========================================
  {
    buildingId: 'bld-g',
    level: 1,
    rooms: [
      // North wing (vSpan: [0.05, 0.45]) per blueprint media_1793538203924.png
      { id: 'bld-g-f1-b105', number: 'B-105', name: 'Classroom (105-B)', kind: 'classroom', capacity: 36, uSpan: [0.03, 0.17], vSpan: [0.05, 0.45], legacyId: 'bld-g-f1-r6' },
      { id: 'bld-g-f1-wc-m', number: 'Toilet-M', name: 'Restroom (Men)', kind: 'other', capacity: 6, uSpan: [0.18, 0.23], vSpan: [0.05, 0.45] },
      { id: 'bld-g-f1-b104', number: 'B-104', name: 'Classroom (104-B)', kind: 'classroom', capacity: 36, uSpan: [0.24, 0.48], vSpan: [0.05, 0.45], legacyId: 'bld-g-f1-r4' },
      { id: 'bld-g-f1-b103', number: 'B-103', name: 'Classroom (103-B)', kind: 'classroom', capacity: 36, uSpan: [0.52, 0.76], vSpan: [0.05, 0.45], legacyId: 'bld-g-f1-r3' },
      { id: 'bld-g-f1-wc-f', number: 'Toilet-F', name: 'Restroom (Women)', kind: 'other', capacity: 6, uSpan: [0.77, 0.82], vSpan: [0.05, 0.45] },
      { id: 'bld-g-f1-b102', number: 'B-102', name: 'Classroom (102-B)', kind: 'classroom', capacity: 36, uSpan: [0.83, 0.97], vSpan: [0.05, 0.45], legacyId: 'bld-g-f1-r2' },
      // South wing (vSpan: [0.55, 0.95])
      { id: 'bld-g-f1-b106', number: 'B-106', name: 'Classroom (106-B)', kind: 'classroom', capacity: 36, uSpan: [0.03, 0.19], vSpan: [0.55, 0.95], legacyId: 'bld-g-f1-r5' },
      { id: 'bld-g-f1-lobby', number: 'B-Lobby', name: 'Lobby & Exhibition Hall', kind: 'hall', capacity: 100, uSpan: [0.22, 0.78], vSpan: [0.55, 0.95], legacyId: 'bld-g-f1-r7' },
      { id: 'bld-g-f1-b101', number: 'B-101', name: 'Classroom (101-B)', kind: 'classroom', capacity: 36, uSpan: [0.81, 0.97], vSpan: [0.55, 0.95], legacyId: 'bld-g-f1-r1' },
    ],
  },
  {
    buildingId: 'bld-g',
    level: 2,
    rooms: [
      // North wing (vSpan: [0.05, 0.45]) per blueprint media_1793538203924.png
      { id: 'bld-g-f2-b205', number: 'B-205', name: 'Classroom (205-B)', kind: 'classroom', capacity: 36, uSpan: [0.03, 0.17], vSpan: [0.05, 0.45], legacyId: 'bld-g-f2-r5' },
      { id: 'bld-g-f2-wc-m', number: 'Toilet-M', name: 'Restroom (Men)', kind: 'other', capacity: 6, uSpan: [0.18, 0.23], vSpan: [0.05, 0.45] },
      { id: 'bld-g-f2-b204', number: 'B-204', name: 'Classroom (204-B)', kind: 'classroom', capacity: 36, uSpan: [0.24, 0.48], vSpan: [0.05, 0.45], legacyId: 'bld-g-f2-r4' },
      { id: 'bld-g-f2-b203', number: 'B-203', name: 'Classroom (203-B)', kind: 'classroom', capacity: 36, uSpan: [0.52, 0.76], vSpan: [0.05, 0.45], legacyId: 'bld-g-f2-r3' },
      { id: 'bld-g-f2-wc-f', number: 'Toilet-F', name: 'Restroom (Women)', kind: 'other', capacity: 6, uSpan: [0.77, 0.82], vSpan: [0.05, 0.45] },
      { id: 'bld-g-f2-b202', number: 'B-202', name: 'Classroom (202-B)', kind: 'classroom', capacity: 36, uSpan: [0.83, 0.97], vSpan: [0.05, 0.45], legacyId: 'bld-g-f2-r2' },
      // South wing (vSpan: [0.55, 0.95])
      { id: 'bld-g-f2-b206', number: 'B-206', name: 'Classroom (206-B)', kind: 'classroom', capacity: 36, uSpan: [0.03, 0.19], vSpan: [0.55, 0.95], legacyId: 'bld-g-f2-r6' },
      { id: 'bld-g-f2-lobby', number: 'B-Lobby', name: 'Lobby & Exhibition Hall', kind: 'hall', capacity: 100, uSpan: [0.22, 0.78], vSpan: [0.55, 0.95] },
      { id: 'bld-g-f2-b201', number: 'B-201', name: 'Classroom (201-B)', kind: 'classroom', capacity: 36, uSpan: [0.81, 0.97], vSpan: [0.55, 0.95], legacyId: 'bld-g-f2-r1' },
    ],
  },
  // ==========================================
  // BUILDING D (bld-c) - Engineering Labs Block
  // ==========================================
  {
    buildingId: 'bld-c',
    level: 1,
    rooms: [
      // North wing (vSpan: [0.04, 0.44])
      { id: 'bld-c-f1-d105', number: 'D-105', name: 'Seminar Room', kind: 'classroom', capacity: 25, uSpan: [0.07, 0.18], vSpan: [0.04, 0.44], legacyId: 'bld-c-f1-r4' },
      { id: 'bld-c-f1-d103', number: 'D-103', name: 'Lecture Room (70p)', kind: 'classroom', capacity: 70, uSpan: [0.18, 0.39], vSpan: [0.04, 0.44], legacyId: 'bld-c-f1-r2' },
      { id: 'bld-c-f1-d101', number: 'D-101', name: 'Lecture Room (70p)', kind: 'classroom', capacity: 70, uSpan: [0.39, 0.81], vSpan: [0.04, 0.44], legacyId: 'bld-c-f1-r1' },
      // South wing - Civil Laboratories (vSpan: [0.56, 0.96])
      { id: 'bld-c-f1-d107', number: 'D-107', name: 'Civil-Laboratory 1', kind: 'lab', capacity: 35, uSpan: [0.02, 0.28], vSpan: [0.56, 0.96], legacyId: 'bld-c-f1-r3' },
      { id: 'bld-c-f1-d106', number: 'D-106', name: 'Civil-Laboratory 2', kind: 'lab', capacity: 35, uSpan: [0.28, 0.49], vSpan: [0.56, 0.96], legacyId: 'bld-c-f1-r5' },
      { id: 'bld-c-f1-d104', number: 'D-104', name: 'Civil-Laboratory 3', kind: 'lab', capacity: 35, uSpan: [0.49, 0.70], vSpan: [0.56, 0.96], legacyId: 'bld-c-f1-r6' },
      { id: 'bld-c-f1-d102', number: 'D-102', name: 'Civil-Laboratory 4', kind: 'lab', capacity: 35, uSpan: [0.70, 0.91], vSpan: [0.56, 0.96], legacyId: 'bld-c-f1-r7' },
    ],
  },
  {
    buildingId: 'bld-c',
    level: 2,
    rooms: [
      // North wing (vSpan: [0.04, 0.44])
      { id: 'bld-c-f2-d206', number: 'D-206', name: 'Seminar Room', kind: 'classroom', capacity: 25, uSpan: [0.07, 0.18], vSpan: [0.04, 0.44], legacyId: 'bld-c-f2-r5' },
      { id: 'bld-c-f2-d205', number: 'D-205', name: 'Lecture Room (70p)', kind: 'classroom', capacity: 70, uSpan: [0.18, 0.39], vSpan: [0.04, 0.44], legacyId: 'bld-c-f2-r6' },
      { id: 'bld-c-f2-d203', number: 'D-203', name: 'Lecture Room (70p)', kind: 'classroom', capacity: 70, uSpan: [0.39, 0.60], vSpan: [0.04, 0.44], legacyId: 'bld-c-f2-r3' },
      { id: 'bld-c-f2-d201', number: 'D-201', name: 'Lecture Room (70p)', kind: 'classroom', capacity: 70, uSpan: [0.60, 0.81], vSpan: [0.04, 0.44], legacyId: 'bld-c-f2-r1' },
      // South wing (vSpan: [0.56, 0.96])
      { id: 'bld-c-f2-d207', number: 'D-207', name: 'Classroom (70p)', kind: 'classroom', capacity: 70, uSpan: [0.02, 0.28], vSpan: [0.56, 0.96], legacyId: 'bld-c-f2-r7' },
      { id: 'bld-c-f2-d204', number: 'D-204', name: 'Electrical Lab 1 & 2', kind: 'lab', capacity: 50, uSpan: [0.28, 0.70], vSpan: [0.56, 0.96], legacyId: 'bld-c-f2-r4' },
      { id: 'bld-c-f2-d202', number: 'D-202', name: 'Electrical Lab 3', kind: 'lab', capacity: 35, uSpan: [0.70, 0.91], vSpan: [0.56, 0.96], legacyId: 'bld-c-f2-r2' },
    ],
  },
  // ==========================================
  // BUILDING E (bld-b) - Architecture & Design Block
  // ==========================================
  {
    buildingId: 'bld-b',
    level: 1,
    rooms: [
      // North wing - Design Studios (vSpan: [0.07, 0.47])
      { id: 'bld-b-f1-e102', number: 'E-102', name: 'Design Studio 1-A', kind: 'classroom', capacity: 50, uSpan: [0.02, 0.25], vSpan: [0.07, 0.47], legacyId: 'bld-b-f1-r2' },
      { id: 'bld-b-f1-e101', number: 'E-101', name: 'Design Studio 1-B/1-C (166 Seats)', kind: 'hall', capacity: 166, uSpan: [0.31, 0.74], vSpan: [0.07, 0.47], legacyId: 'bld-b-f1-r1' },
      { id: 'bld-b-f1-e103', number: 'E-103', name: 'Design Studio 1-D', kind: 'classroom', capacity: 50, uSpan: [0.80, 0.98], vSpan: [0.07, 0.47], legacyId: 'bld-b-f1-r3' },
      // South wing (vSpan: [0.62, 0.95])
      { id: 'bld-b-f1-e104', number: 'E-104', name: 'Plotter Room', kind: 'lab', capacity: 20, uSpan: [0.02, 0.26], vSpan: [0.62, 0.95], legacyId: 'bld-b-f1-r4' },
      { id: 'bld-b-f1-e105', number: 'E-105', name: 'Digital Design Room', kind: 'lab', capacity: 40, uSpan: [0.35, 0.65], vSpan: [0.62, 0.95], legacyId: 'bld-b-f1-r5' },
      { id: 'bld-b-f1-e106', number: 'E-106', name: 'Model Room', kind: 'lab', capacity: 25, uSpan: [0.74, 0.98], vSpan: [0.62, 0.95], legacyId: 'bld-b-f1-r6' },
    ],
  },
  {
    buildingId: 'bld-b',
    level: 2,
    rooms: [
      // North wing - Lecture Rooms & Studios
      { id: 'bld-b-f2-e201', number: 'E-201', name: 'Lecture Room (70p)', kind: 'classroom', capacity: 70, uSpan: [0.02, 0.35], vSpan: [0.07, 0.47], legacyId: 'bld-b-f2-r1' },
      { id: 'bld-b-f2-e202', number: 'E-202', name: 'Design Studio 2-A', kind: 'classroom', capacity: 50, uSpan: [0.38, 0.68], vSpan: [0.07, 0.47], legacyId: 'bld-b-f2-r2' },
      { id: 'bld-b-f2-e203', number: 'E-203', name: 'Design Studio 2-B', kind: 'classroom', capacity: 40, uSpan: [0.72, 0.98], vSpan: [0.07, 0.47], legacyId: 'bld-b-f2-r3' },
      // South wing
      { id: 'bld-b-f2-e204', number: 'E-204', name: 'Computer Lab 2-A', kind: 'lab', capacity: 35, uSpan: [0.02, 0.30], vSpan: [0.62, 0.95], legacyId: 'bld-b-f2-r4' },
      { id: 'bld-b-f2-e205', number: 'E-205', name: 'Classroom', kind: 'classroom', capacity: 35, uSpan: [0.35, 0.65], vSpan: [0.62, 0.95], legacyId: 'bld-b-f2-r5' },
      { id: 'bld-b-f2-e206', number: 'E-206', name: 'Classroom', kind: 'classroom', capacity: 30, uSpan: [0.70, 0.98], vSpan: [0.62, 0.95], legacyId: 'bld-b-f2-r6' },
    ],
  },
  {
    buildingId: 'bld-b',
    level: 4,
    rooms: [
      // Academic Office & Faculty
      { id: 'bld-b-f4-office', number: 'E-Academic', name: 'Academic Affairs & Dean Office', kind: 'office', capacity: 30, uSpan: [0.78, 0.98], vSpan: [0.07, 0.85], legacyId: 'bld-b-f4-r1' },
      { id: 'bld-b-f4-e401', number: 'E-401', name: 'Faculty Office', kind: 'office', capacity: 6, uSpan: [0.04, 0.25], vSpan: [0.07, 0.47], legacyId: 'bld-b-f4-r2' },
      { id: 'bld-b-f4-e402', number: 'E-402', name: 'Faculty Office', kind: 'office', capacity: 6, uSpan: [0.30, 0.50], vSpan: [0.07, 0.47], legacyId: 'bld-b-f4-r3' },
      { id: 'bld-b-f4-e403', number: 'E-403', name: 'Faculty Office', kind: 'office', capacity: 6, uSpan: [0.54, 0.74], vSpan: [0.07, 0.47], legacyId: 'bld-b-f4-r4' },
    ],
  },
  // ==========================================
  // BUILDING F (bld-d) - Library, Amphitheatres & Large Studios
  // ==========================================
  {
    buildingId: 'bld-d',
    level: 1,
    rooms: [
      // Studios & Ground Floor Campus Library (F-101)
      { id: 'bld-d-f1-f102', number: 'F-102', name: 'Design Studio 3-C', kind: 'classroom', capacity: 45, uSpan: [0.10, 0.50], vSpan: [0.04, 0.35], legacyId: 'bld-d-f1-r2' },
      { id: 'bld-d-f1-f103', number: 'F-103', name: 'Design Studio 3-D', kind: 'classroom', capacity: 45, uSpan: [0.50, 0.90], vSpan: [0.04, 0.35], legacyId: 'bld-d-f1-r3' },
      { id: 'bld-d-f1-f101', number: 'F-101', name: 'Campus Library & Reading Hall (F101)', kind: 'hall', capacity: 120, uSpan: [0.04, 0.96], vSpan: [0.42, 0.96], legacyId: 'bld-d-f1-r1' },
    ],
  },
  {
    buildingId: 'bld-d',
    level: 2,
    rooms: [
      // Two Large Semicircular Tiered Amphitheatres on south (north area is open corridor/walkway)
      { id: 'bld-d-f2-f201', number: 'F-201', name: 'Tiered Lecture Hall (Amphitheatre West)', kind: 'hall', capacity: 120, uSpan: [0.03, 0.44], vSpan: [0.40, 0.96], legacyId: 'bld-d-f2-r1' },
      { id: 'bld-d-f2-f202', number: 'F-202', name: 'Tiered Lecture Hall (Amphitheatre East)', kind: 'hall', capacity: 120, uSpan: [0.56, 0.97], vSpan: [0.40, 0.96], legacyId: 'bld-d-f2-r2' },
    ],
  },
  // ==========================================
  // BUILDING C (bld-i) - Conference Hall & Canteen
  // ==========================================
  {
    buildingId: 'bld-i',
    level: 1,
    rooms: [
      // North entrance hall (aligned directly with the 8.4m entrance pavilion on the east facade: uSpan [0.03, 0.28])
      { id: 'room-c-conf', number: 'C-conF', name: 'Conference Hall & Main Lobby', kind: 'hall', capacity: 100, uSpan: [0.03, 0.28], vSpan: [0.05, 0.95] },
      // South section (Canteen & Dining Hall)
      { id: 'room-canteen', number: 'Canteen', name: 'Canteen & Dining Hall', kind: 'other', capacity: 120, uSpan: [0.32, 0.97], vSpan: [0.05, 0.95] },
    ],
  },
];

/**
 * Computes exact world-space RoomGeometry for each room in confirmed floor plans.
 * Mapped to both the canonical ID and legacy index-based ID.
 */
export function buildAccurateRoomOverrides(): Record<string, RoomGeometry> {
  const overrides: Record<string, RoomGeometry> = {};

  for (const plan of confirmedFloorPlans) {
    const pxRects = buildingFootprintsPx[plan.buildingId];
    if (!pxRects?.length) continue;

    const rects = pxRects.map(pxRectToRect);
    // Find primary rectangle of the building
    const primary = rects.reduce((a, b) => (b.size[0] * b.size[1] > a.size[0] * a.size[1] ? b : a));

    const elevation = (plan.level - 1) * floorHeight;
    const y = elevation + slabThickness + roomHeight / 2;

    for (const roomDef of plan.rooms) {
      // Spans are relative to the explicitly chosen part, or to the largest part by default.
      const host = roomDef.part !== undefined ? rects[roomDef.part] : primary;
      if (!host) {
        console.warn(`[floor-plans] Room "${roomDef.id}" references missing part ${roomDef.part} of "${plan.buildingId}"`);
        continue;
      }
      const [w, d] = host.size;
      const [cx, cz] = host.center;
      const isXLong = w >= d;
      const len = isXLong ? w : d;
      const short = isXLong ? d : w;

      const [u0, u1] = roomDef.uSpan;
      const [v0, v1] = roomDef.vSpan;

      const uMid = -len / 2 + ((u0 + u1) / 2) * len;
      const uSize = Math.max(0.5, (u1 - u0) * len - gap);

      const vMid = -short / 2 + ((v0 + v1) / 2) * short;
      const vSize = Math.max(0.5, (v1 - v0) * short - gap);

      const position: Vec3 = isXLong
        ? [cx + uMid, y, cz + vMid]
        : [cx + vMid, y, cz + uMid];

      const size: Vec3 = isXLong
        ? [uSize, roomHeight, vSize]
        : [vSize, roomHeight, uSize];

      const geometry: RoomGeometry = {
        type: 'box',
        position,
        size,
        precision: roomDef.provenance === 'demo' ? 'approximate' : 'surveyed',
      };

      overrides[roomDef.id] = geometry;
      if (roomDef.legacyId) {
        overrides[roomDef.legacyId] = geometry;
      }
    }
  }

  return overrides;
}

export const accurateRoomOverrides = buildAccurateRoomOverrides();
