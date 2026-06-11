import type { NoteImageFileData } from "@/lib/notes/types";

const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;

export async function uploadImageToDataUrl(file: File): Promise<NoteImageFileData> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are supported.");
  }

  if (file.size > MAX_INLINE_IMAGE_BYTES) {
    throw new Error(
      "Images larger than 2 MB are not supported by the temporary inline uploader.",
    );
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not convert image to a data URL."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Could not read the image file."));
    };

    reader.readAsDataURL(file);
  });

  return {
    url: dataUrl,
    name: file.name,
    size: file.size,
    type: file.type,
  };
}
