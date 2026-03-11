export const uploadImageToCloudinary = async (file) => {
    const cloudinaryUrl = import.meta.env.VITE_CLOUDINARY_URL;
    if (!cloudinaryUrl) throw new Error("VITE_CLOUDINARY_URL not found in environment variables");

    const regex = /cloudinary:\/\/([^:]+):([^@]+)@(.+)/;
    const match = cloudinaryUrl.match(regex);
    if (!match) throw new Error("Invalid Cloudinary URL format");

    const [, apiKey, apiSecret, cloudName] = match;

    const timestamp = Math.floor(Date.now() / 1000);
    const stringToSign = `timestamp=${timestamp}${apiSecret}`;

    const encoder = new TextEncoder();
    const data = encoder.encode(stringToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
    });

    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error?.message || "Error uploading image to Cloudinary");
    }

    return result.secure_url;
};
