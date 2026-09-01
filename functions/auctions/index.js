/**
 * Decodes base64-encoded and gzip-compressed NBT data
 * @param {string} nbtData - Base64 encoded (possibly gzip-compressed) NBT data
 * @returns {Object} Decoded NBT data object
 */
function decodeNBT(nbtData) {
  if (!nbtData || typeof nbtData !== 'string') {
    return null;
  }

  try {
    // Decode base64
    const binaryString = atob(nbtData);
    let bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Check if data is gzip compressed (magic bytes: 0x1f 0x8b)
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      console.log('[NBT] Detected gzip-compressed data, decompressing...');
      bytes = decompressGzip(bytes);
      if (!bytes) {
        return {
          raw: nbtData,
          decoded: null,
          error: 'Failed to decompress gzip data'
        };
      }
    }

    // Parse NBT after decompression
    return {
      raw: nbtData,
      decoded: parseNBTBytes(bytes)
    };
  } catch (error) {
    console.error('Error decoding NBT data:', error);
    return {
      raw: nbtData,
      decoded: null,
      error: error.message
    };
  }
}

/**
 * Decompresses gzip data using simple raw deflate decompression
 * This handles the gzip format and extracts the raw deflate stream
 * @param {Uint8Array} bytes - Gzip compressed bytes
 * @returns {Uint8Array|null} Decompressed bytes or null if failed
 */
function decompressGzip(bytes) {
  try {
    // Gzip format: 1f 8b [compression method] [flags] [MTIME:4] [extra flags] [OS]
    // We need to skip the header and decompress the deflate stream
    
    // Check magic number
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
      return null;
    }

    const compressionMethod = bytes[2];
    if (compressionMethod !== 0x08) {
      // Only deflate (0x08) is commonly used
      console.warn('[NBT] Unsupported gzip compression method:', compressionMethod);
      return null;
    }

    const flags = bytes[3];
    let offset = 10; // Skip fixed header

    // Skip optional header fields based on flags
    if (flags & 0x04) {
      // FEXTRA - skip extra field
      const len = bytes[offset] | (bytes[offset + 1] << 8);
      offset += 2 + len;
    }
    if (flags & 0x08) {
      // FNAME - skip original filename
      while (bytes[offset] !== 0) offset++;
      offset++;
    }
    if (flags & 0x10) {
      // FCOMMENT - skip file comment
      while (bytes[offset] !== 0) offset++;
      offset++;
    }
    if (flags & 0x02) {
      // FHCRC - skip header CRC
      offset += 2;
    }

    // Extract the deflate data (everything except last 8 bytes which are CRC32 and ISIZE)
    const deflateData = bytes.slice(offset, bytes.length - 8);

    // Simple deflate decompression
    const decompressed = inflateDeflate(deflateData);
    return decompressed;
  } catch (error) {
    console.error('[NBT] Error decompressing gzip:', error);
    return null;
  }
}

/**
 * Simple deflate decompression (handles uncompressed blocks)
 * This is a minimal implementation that handles common cases
 * @param {Uint8Array} data - Deflate compressed data
 * @returns {Uint8Array} Decompressed data
 */
function inflateDeflate(data) {
  // For now, use a simple approach: handle uncompressed blocks
  // Full deflate decompression is complex, so we'll try a basic approach
  
  // If you need full deflate support, consider using a library
  // For minimal deflate (many Minecraft NBT uses no compression), we can handle it:
  
  const result = [];
  let bitPos = 0;
  let bytePos = 0;

  function readBits(n) {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const byteOffset = Math.floor(bitPos / 8);
      const bitOffset = bitPos % 8;
      value |= ((data[byteOffset] >> bitOffset) & 1) << i;
      bitPos++;
    }
    return value;
  }

  function readBytes(n) {
    const bytes = data.slice(bytePos, bytePos + n);
    bytePos += n;
    return bytes;
  }

  try {
    while (bytePos < data.length) {
      const bfinal = readBits(1);
      const btype = readBits(2);

      if (btype === 0) {
        // Uncompressed block
        bitPos = Math.ceil(bitPos / 8) * 8; // Align to byte boundary
        bytePos = Math.ceil(bitPos / 8);
        
        const len = data[bytePos] | (data[bytePos + 1] << 8);
        bytePos += 4; // Skip len and nlen

        for (let i = 0; i < len; i++) {
          result.push(data[bytePos++]);
        }
      } else if (btype === 1 || btype === 2) {
        // Compressed block - simplified handling
        // This is complex; for now we'll return partial result
        console.warn('[NBT] Compressed deflate blocks not fully supported');
        break;
      } else {
        console.warn('[NBT] Invalid deflate block type:', btype);
        break;
      }

      if (bfinal) break;
    }
  } catch (e) {
    console.error('[NBT] Error during deflate decompression:', e);
  }

  return new Uint8Array(result);
}


/**
 * Parses NBT bytes into a readable object
 * @param {Uint8Array} bytes - NBT data bytes
 * @returns {Object} Parsed NBT object
 */
function parseNBTBytes(bytes) {
  const result = {};
  let offset = 0;

  try {
    // Skip compound tag header (0x0a) and string length if present
    if (bytes[0] === 0x0a) {
      offset = 1;
      const nameLen = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      offset += nameLen;
    }

    // Parse individual tags
    while (offset < bytes.length) {
      const tagType = bytes[offset];
      if (tagType === 0x00) break;

      offset++;

      const keyLen = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      const keyBytes = bytes.slice(offset, offset + keyLen);
      const key = new TextDecoder().decode(keyBytes);
      offset += keyLen;

      const { value, newOffset } = parseNBTTag(tagType, bytes, offset);
      result[key] = value;
      offset = newOffset;
    }
  } catch (error) {
    console.error('Error parsing NBT bytes:', error);
    result.error = error.message;
  }

  return result;
}

/**
 * Parses a single NBT tag value
 */
function parseNBTTag(tagType, bytes, offset) {
  switch (tagType) {
    case 0x01:
      return { value: bytes[offset], newOffset: offset + 1 };
    case 0x02: {
      const val = (bytes[offset] << 8) | bytes[offset + 1];
      return { value: val, newOffset: offset + 2 };
    }
    case 0x03: {
      const val = (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
                  (bytes[offset + 2] << 8) | bytes[offset + 3];
      return { value: val, newOffset: offset + 4 };
    }
    case 0x04: {
      const high = (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
                   (bytes[offset + 2] << 8) | bytes[offset + 3];
      const low = (bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) |
                  (bytes[offset + 6] << 8) | bytes[offset + 7];
      return { value: high * 0x100000000 + low, newOffset: offset + 8 };
    }
    case 0x08: {
      const len = (bytes[offset] << 8) | bytes[offset + 1];
      const strBytes = bytes.slice(offset + 2, offset + 2 + len);
      const str = new TextDecoder().decode(strBytes);
      return { value: str, newOffset: offset + 2 + len };
    }
    default:
      return { value: null, newOffset: offset + 1 };
  }
}

/**
 * Processes auction data and decrypts NBT information
 */
function processAuctions(auctions) {
  if (!Array.isArray(auctions)) {
    return auctions;
  }

  return auctions.map(auction => {
    const processed = { ...auction };

    // Map field names if they use different formats in the API
    // UUID/ID handling
    if (!processed.uuid && processed.id) {
      processed.uuid = processed.id;
    }
    if (!processed.uuid && processed.auction_id) {
      processed.uuid = processed.auction_id;
    }
    
    // Tier/Rarity handling
    if (!processed.tier && processed.rarity) {
      processed.tier = processed.rarity;
    }
    
    // Bid amount handling
    if (!processed.highest_bid_amount && processed.highest_bid) {
      processed.highest_bid_amount = processed.highest_bid;
    }
    if (!processed.highest_bid_amount && processed.highestBid) {
      processed.highest_bid_amount = processed.highestBid;
    }
    
    // Starting bid handling
    if (!processed.starting_bid && processed.startBid) {
      processed.starting_bid = processed.startBid;
    }
    
    // BIN price handling
    if (!processed.bin_price && processed.binPrice) {
      processed.bin_price = processed.binPrice;
    }
    
    // End time handling
    if (!processed.end_time && processed.endTime) {
      processed.end_time = processed.endTime;
    }
    if (!processed.end_time && processed.ends) {
      processed.end_time = processed.ends;
    }
    
    // Auctioneer/Seller handling
    if (!processed.auctioneer && processed.seller) {
      processed.auctioneer = processed.seller;
    }
    
    // Bid count handling
    if (!processed.bid_count && processed.bids) {
      processed.bid_count = processed.bids;
    }

    // Decode item NBT data if present
    // Try itemData first (new API), then item_bytes (fallback)
    const nbtData = auction.itemData || auction.item_bytes;
    if (nbtData) {
      processed.item_nbt_decoded = decodeNBT(nbtData);
      
      // Extract item name from decoded NBT data
      if (processed.item_nbt_decoded?.decoded) {
        const decoded = processed.item_nbt_decoded.decoded;
        let itemName = extractItemName(decoded);
        
        if (itemName) {
          processed.item_name = itemName;
          console.log(`[NBT] Extracted item name from NBT: ${itemName}`);
        } else {
          console.log(`[NBT] Could not extract item name from NBT, trying itemId`);
          // Fallback to itemId if NBT parsing failed
          if (auction.itemId) {
            itemName = processItemId(auction.itemId);
            if (itemName) {
              processed.item_name = itemName;
              console.log(`[NBT] Extracted item name from itemId: ${itemName}`);
            }
          }
        }
      } else if (auction.itemId) {
        // If NBT decoding completely failed, use itemId
        const itemName = processItemId(auction.itemId);
        if (itemName) {
          processed.item_name = itemName;
          console.log(`[NBT] Extracted item name from itemId (NBT failed): ${itemName}`);
        }
      }
    } else if (auction.itemId) {
      // No NBT data at all, use itemId
      const itemName = processItemId(auction.itemId);
      if (itemName) {
        processed.item_name = itemName;
        console.log(`[NBT] Extracted item name from itemId (no NBT): ${itemName}`);
      }
    }

    if (auction.extra) {
      processed.extra_nbt_decoded = decodeNBT(auction.extra);
    }

    return processed;
  });
}

/**
 * Extract item name from decoded NBT data
 */
function extractItemName(decoded) {
  if (!decoded) return null;
  
  // Try tag.display.Name (Minecraft standard)
  let itemName = decoded?.tag?.display?.Name;
  
  // Try direct display.Name
  if (!itemName) {
    itemName = decoded?.display?.Name;
  }
  
  // Try Name field
  if (!itemName) {
    itemName = decoded?.Name;
  }
  
  // Try id field as fallback
  if (!itemName) {
    itemName = decoded?.id;
  }
  
  // Parse JSON if it's a text component string
  if (itemName && typeof itemName === 'string') {
    // Remove color codes and formatting
    itemName = cleanMCText(itemName);
  }
  
  return itemName || null;
}

/**

/**
 * Convert itemId format to readable name
 * Example: "trpixel:plumber_sponge" -> "Plumber Sponge"
 */
function processItemId(itemId) {
  if (!itemId || typeof itemId !== 'string') return null;
  
  // Extract the item name part (after the colon)
  const parts = itemId.split(':');
  const name = parts[parts.length - 1];
  
  if (!name) return null;
  
  // Convert snake_case to Title Case
  // e.g., "plumber_sponge" -> "Plumber Sponge"
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Clean Minecraft text component/formatting
 */
function cleanMCText(text) {
  if (!text || typeof text !== 'string') return null;
  
  let cleaned = text;
  
  // Try to parse as JSON text component
  if (cleaned.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned);
      // Extract text from various formats
      if (parsed.text) {
        cleaned = parsed.text;
      } else if (parsed.extra) {
        // Concatenate extra text components
        cleaned = (parsed.extra || [])
          .map(e => e.text || '')
          .join('');
      }
    } catch (e) {
      // Not valid JSON, keep original
    }
  }
  
  // Remove Minecraft color codes (§c, §6, etc.)
  cleaned = cleaned.replace(/§./g, '');
  
  return cleaned || null;
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  const page = params.get('page') || '0';
  const type = params.get('type') || '';
  const auctionId = params.get('id') || '';
  const apiKey = env?.CMC_API_KEY || env?.CRAFTERS_API_KEY || env?.CMC_API_KEY_BAZAAR || '';

  try {
    let targetUrl = `https://api.craftersmc.net/v1/skyblock/auctions?page=${page}`;
    if (auctionId) {
      targetUrl = `https://api.craftersmc.net/v1/skyblock/auction/${auctionId}`;
    } else if (type === 'ended') {
      targetUrl = 'https://api.craftersmc.net/v1/skyblock/auctions/ended';
    }

    const headers = {
      'User-Agent': 'Auctions-Tracker/1.0',
      'Accept': 'application/json'
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(targetUrl, { headers });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch auctions',
          status: response.status,
          statusText: response.statusText
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    const data = await response.json();

    if (auctionId) {
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        }
      });
    }

    if (data.auctions && Array.isArray(data.auctions)) {
      data.auctions = processAuctions(data.auctions);
    }

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      }
    });
  } catch (error) {
    console.error('Error in auctions handler:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}
