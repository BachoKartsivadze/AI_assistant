import { supabase } from "@/lib/supabase/browser-client"
import { toast } from "sonner"

export const uploadFile = async (
  file: File,
  payload: {
    name: string
    user_id: string
    file_id: string
  },
  onProgress?: (progress: number) => void
) => {
  const SIZE_LIMIT = parseInt(
    process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT || "200000000" // Set to 200MB default
  )

  if (file.size > SIZE_LIMIT) {
    throw new Error(
      `File must be less than ${Math.floor(SIZE_LIMIT / 1000000)}MB`
    )
  }

  const filePath = `${payload.user_id}/${Buffer.from(payload.file_id).toString("base64")}`

  // Simulate progress for better UX (Supabase doesn't provide native progress tracking)
  if (onProgress) {
    // Show initial progress
    onProgress(10)

    // Simulate progress during upload
    const progressInterval = setInterval(() => {
      onProgress(Math.min(90, Math.floor(Math.random() * 40 + 30))) // Random progress between 30-90% (natural numbers only)
    }, 200)

    try {
      const { error } = await supabase.storage
        .from("files")
        .upload(filePath, file, {
          upsert: true,
          cacheControl: "3600", // Cache for 1 hour
          contentType: file.type, // Set proper content type
          duplex: "half", // Enable streaming for better performance
          compress: file.size > 1024 * 1024 // Compress files larger than 1MB
        })

      clearInterval(progressInterval)

      if (error) {
        throw new Error("Error uploading file")
      }

      // Complete progress
      onProgress(100)
      return filePath
    } catch (error) {
      clearInterval(progressInterval)
      throw error
    }
  } else {
    // No progress tracking - use optimized upload
    const { error } = await supabase.storage
      .from("files")
      .upload(filePath, file, {
        upsert: true,
        cacheControl: "3600", // Cache for 1 hour
        contentType: file.type, // Set proper content type
        duplex: "half", // Enable streaming for better performance
        compress: file.size > 1024 * 1024 // Compress files larger than 1MB
      })

    if (error) {
      throw new Error("Error uploading file")
    }

    return filePath
  }
}

export const deleteFileFromStorage = async (filePath: string) => {
  const { error } = await supabase.storage.from("files").remove([filePath])

  if (error) {
    toast.error("Failed to remove file!")
    return
  }
}

export const getFileFromStorage = async (filePath: string) => {
  const { data, error } = await supabase.storage
    .from("files")
    .createSignedUrl(filePath, 60 * 60 * 24) // 24hrs

  if (error) {
    console.error(`Error uploading file with path: ${filePath}`, error)
    throw new Error("Error downloading file")
  }

  return data.signedUrl
}
