/**
 * Lightweight, zero-dependency standard PKZIP archive builder.
 * Supports UTF-8 file paths, text and binary files, CRC-32 checksums,
 * and produces standard-compliant .zip archives in both browser and Node/Vitest.
 */

export interface ZipEntryInput {
  path: string;
  content: string | Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeUTF8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Builds a standard ZIP archive as a Uint8Array.
 */
export function buildZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const prepared = entries.map((e) => {
    const nameBytes = encodeUTF8(e.path);
    const dataBytes = typeof e.content === 'string' ? encodeUTF8(e.content) : e.content;
    const crc = crc32(dataBytes);
    return {
      nameBytes,
      dataBytes,
      crc,
    };
  });

  // Calculate total size
  let localAreaSize = 0;
  let centralDirSize = 0;
  for (const item of prepared) {
    localAreaSize += 30 + item.nameBytes.length + item.dataBytes.length;
    centralDirSize += 46 + item.nameBytes.length;
  }
  const endRecordSize = 22;
  const totalSize = localAreaSize + centralDirSize + endRecordSize;

  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  let offset = 0;
  const localOffsets: number[] = [];

  // Write Local File Headers + File Data
  for (const item of prepared) {
    localOffsets.push(offset);
    // Local file header signature (0x04034b50)
    view.setUint32(offset, 0x04034b50, true);
    // Version needed to extract (20 = 2.0)
    view.setUint16(offset + 4, 20, true);
    // General purpose bit flag (0x0800 = UTF-8 filename)
    view.setUint16(offset + 6, 0x0800, true);
    // Compression method (0 = STORE)
    view.setUint16(offset + 8, 0, true);
    // Last mod file time & date
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 0x5521, true);
    // CRC-32
    view.setUint32(offset + 14, item.crc, true);
    // Compressed size
    view.setUint32(offset + 18, item.dataBytes.length, true);
    // Uncompressed size
    view.setUint32(offset + 22, item.dataBytes.length, true);
    // File name length
    view.setUint16(offset + 26, item.nameBytes.length, true);
    // Extra field length
    view.setUint16(offset + 28, 0, true);

    out.set(item.nameBytes, offset + 30);
    out.set(item.dataBytes, offset + 30 + item.nameBytes.length);
    offset += 30 + item.nameBytes.length + item.dataBytes.length;
  }

  const centralDirOffset = offset;

  // Write Central Directory Headers
  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    // Central directory file header signature (0x02014b50)
    view.setUint32(offset, 0x02014b50, true);
    // Version made by (20)
    view.setUint16(offset + 4, 20, true);
    // Version needed to extract (20)
    view.setUint16(offset + 6, 20, true);
    // General purpose bit flag (UTF-8)
    view.setUint16(offset + 8, 0x0800, true);
    // Compression method (0 = STORE)
    view.setUint16(offset + 10, 0, true);
    // Last mod time & date
    view.setUint16(offset + 12, 0, true);
    view.setUint16(offset + 14, 0x5521, true);
    // CRC-32
    view.setUint32(offset + 16, item.crc, true);
    // Compressed size
    view.setUint32(offset + 20, item.dataBytes.length, true);
    // Uncompressed size
    view.setUint32(offset + 24, item.dataBytes.length, true);
    // File name length
    view.setUint16(offset + 28, item.nameBytes.length, true);
    // Extra field length
    view.setUint16(offset + 30, 0, true);
    // File comment length
    view.setUint16(offset + 32, 0, true);
    // Disk number start
    view.setUint16(offset + 34, 0, true);
    // Internal file attributes
    view.setUint16(offset + 36, 0, true);
    // External file attributes
    view.setUint32(offset + 38, 0, true);
    // Relative offset of local header
    view.setUint32(offset + 42, localOffsets[i], true);

    out.set(item.nameBytes, offset + 46);
    offset += 46 + item.nameBytes.length;
  }

  // End of central directory record (0x06054b50)
  view.setUint32(offset, 0x06054b50, true);
  // Number of this disk
  view.setUint16(offset + 4, 0, true);
  // Disk where central directory starts
  view.setUint16(offset + 6, 0, true);
  // Number of central directory records on this disk
  view.setUint16(offset + 8, prepared.length, true);
  // Total number of central directory records
  view.setUint16(offset + 10, prepared.length, true);
  // Size of central directory
  view.setUint32(offset + 12, centralDirSize, true);
  // Offset of start of central directory
  view.setUint32(offset + 16, centralDirOffset, true);
  // Comment length
  view.setUint16(offset + 20, 0, true);

  return out;
}

/**
 * Extracts entries from a STORE-compressed ZIP archive (useful for verification & tests).
 */
export function readZipArchive(zipBytes: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const decoder = new TextDecoder();
  const result: Record<string, Uint8Array> = {};

  let offset = 0;
  while (offset + 30 <= zipBytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;

    const compressedSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    const nameBytes = zipBytes.subarray(offset + 30, offset + 30 + nameLen);
    const fileName = decoder.decode(nameBytes);
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    result[fileName] = zipBytes.subarray(dataStart, dataEnd);

    offset = dataEnd;
  }

  return result;
}
