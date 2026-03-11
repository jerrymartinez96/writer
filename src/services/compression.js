import LZString from 'lz-string';

/**
 * Utility to compress and decompress data for storage optimization.
 */

export const compressData = (data) => {
    if (!data) return '';
    try {
        // We use base64 encoding for Firestore compatibility if needed, 
        // though lz-string's compressToUTF16 is also good for storage.
        // For broad compatibility, compressToEncodedURIComponent is very safe.
        const compressed = LZString.compressToEncodedURIComponent(data);
        return compressed;
    } catch (e) {
        return data;
    }
};

export const decompressData = (compressedData) => {
    if (!compressedData) return '';
    
    // Safety check: usually compressed data with lz-string EncodedURIComponent 
    // doesn't look like HTML. If it starts with '<', it's likely already plain text.
    if (compressedData.trim().startsWith('<')) return compressedData;

    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(compressedData);
        return decompressed || compressedData;
    } catch (e) {
        console.error("Decompression failed", e);
        return compressedData;
    }
};

/**
 * Check if a string is likely compressed.
 */
export const isCompressed = (str) => {
    if (!str || typeof str !== 'string') return false;
    // Compressed lz-string EncodedURIComponent strings are usually alphanumeric + '-' + '_'
    // and don't contain HTML tags.
    return !str.includes('<') && !str.includes(' ');
};
