import { supabase } from "@/lib/supabase/browser-client"
import { TablesInsert, TablesUpdate } from "@/supabase/types"
import mammoth from "mammoth"
import { toast } from "sonner"
import { uploadFile } from "./storage/files"

export const getFileById = async (fileId: string) => {
  const { data: file, error } = await supabase
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single()

  if (!file) {
    throw new Error(error.message)
  }

  return file
}

export const getFileWorkspacesByWorkspaceId = async (workspaceId: string) => {
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select(
      `
      id,
      name,
      files (*)
    `
    )
    .eq("id", workspaceId)
    .single()

  if (!workspace) {
    throw new Error(error.message)
  }

  return workspace
}

export const getFileWorkspacesByFileId = async (fileId: string) => {
  const { data: file, error } = await supabase
    .from("files")
    .select(
      `
      id, 
      name, 
      workspaces (*)
    `
    )
    .eq("id", fileId)
    .single()

  if (!file) {
    throw new Error(error.message)
  }

  return file
}

export const createFileBasedOnExtension = async (
  file: File,
  fileRecord: TablesInsert<"files">,
  workspace_id: string,
  embeddingsProvider: "openai" | "local"
) => {
  const fileExtension = file.name.split(".").pop()

  if (fileExtension === "docx") {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({
      arrayBuffer
    })

    return createDocXFile(
      result.value,
      file,
      fileRecord,
      workspace_id,
      embeddingsProvider
    )
  } else {
    return createFile(file, fileRecord, workspace_id, embeddingsProvider)
  }
}

// For non-docx files
export const createFile = async (
  file: File,
  fileRecord: TablesInsert<"files">,
  workspace_id: string,
  embeddingsProvider: "openai" | "local",
  onUploadProgress?: (progress: number) => void
) => {
  let validFilename = fileRecord.name.replace(/[^a-z0-9.]/gi, "_").toLowerCase()
  const extension = file.name.split(".").pop()
  const extensionIndex = validFilename.lastIndexOf(".")
  const baseName = validFilename.substring(
    0,
    extensionIndex < 0 ? undefined : extensionIndex
  )
  const maxBaseNameLength = 100 - (extension?.length || 0) - 1
  if (baseName.length > maxBaseNameLength) {
    fileRecord.name = baseName.substring(0, maxBaseNameLength) + "." + extension
  } else {
    fileRecord.name = baseName + "." + extension
  }
  const { data: createdFile, error } = await supabase
    .from("files")
    .insert([fileRecord])
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  await createFileWorkspace({
    user_id: createdFile.user_id,
    file_id: createdFile.id,
    workspace_id
  })

  // Upload file first with progress tracking
  const filePath = await uploadFile(
    file,
    {
      name: createdFile.name,
      user_id: createdFile.user_id,
      file_id: createdFile.name
    },
    onUploadProgress
  )

  // Update file with path immediately
  await updateFile(createdFile.id, {
    file_path: filePath
  })

  // Start background processing without waiting for it
  const processFileInBackground = async (retryCount = 0) => {
    const maxRetries = 3
    const baseDelay = 2000 // 2 seconds base delay

    try {
      console.log(
        `Starting background processing for file: ${createdFile.id} (attempt ${retryCount + 1}/${maxRetries + 1})`
      )

      const formData = new FormData()
      formData.append("file_id", createdFile.id)
      formData.append("embeddingsProvider", embeddingsProvider)

      // Add timeout handling for processing (reduce timeout on retries)
      const timeoutDuration = retryCount === 0 ? 10 * 60 * 1000 : 5 * 60 * 1000 // 10min first try, 5min retries
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        console.error(
          `Processing timeout for file: ${createdFile.id} (attempt ${retryCount + 1})`
        )
      }, timeoutDuration)

      const response = await fetch("/api/retrieval/process", {
        method: "POST",
        body: formData,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const jsonText = await response.text()
        const json = JSON.parse(jsonText)
        console.error(
          `Background processing error for file:${createdFile.id}, status:${response.status}, response:${json.message}`
        )
        toast.error(
          "File uploaded but processing failed. Reason:" + json.message,
          {
            duration: 10000
          }
        )
        // Don't delete file - user might want to retry processing
      } else {
        console.log(
          `Background processing completed for file: ${createdFile.id}`
        )
        // Update UI to show processing is complete
        toast.success(
          "File processing completed! You can now ask questions about this file.",
          {
            duration: 4000
          }
        )
      }
    } catch (error: any) {
      console.error(
        `Background processing error (attempt ${retryCount + 1}):`,
        error
      )

      // Check if we should retry
      const shouldRetry =
        retryCount < maxRetries &&
        (error.name === "AbortError" || // Timeout - retry with shorter timeout
          error.message?.includes("network") ||
          error.message?.includes("fetch") ||
          error.message?.includes("ECONNRESET") ||
          error.message?.includes("ETIMEDOUT"))

      if (shouldRetry) {
        const delay = baseDelay * Math.pow(2, retryCount) // Exponential backoff
        console.log(
          `Retrying file processing in ${delay}ms (attempt ${retryCount + 2}/${maxRetries + 1})`
        )

        toast.error(
          `Processing failed, retrying in ${Math.round(delay / 1000)} seconds... (${retryCount + 1}/${maxRetries})`,
          {
            duration: delay
          }
        )

        setTimeout(() => {
          processFileInBackground(retryCount + 1)
        }, delay)

        return // Don't show final error yet
      }

      // Final error handling after all retries failed
      if (error.name === "AbortError") {
        toast.error(
          "File processing timed out after multiple attempts. The file is too large or complex. Please try a smaller file.",
          {
            duration: 15000
          }
        )
      } else if (
        error.message?.includes("network") ||
        error.message?.includes("fetch")
      ) {
        toast.error(
          "Network error during processing after multiple attempts. Please check your connection and try again later.",
          {
            duration: 10000
          }
        )
      } else if (
        error.message?.includes("token") ||
        error.message?.includes("limit")
      ) {
        toast.error(
          "File is too large for processing. Please try a smaller file or split it into parts.",
          {
            duration: 12000
          }
        )
      } else {
        toast.error(
          "File processing failed after multiple attempts. The file may be corrupted or in an unsupported format.",
          {
            duration: 12000
          }
        )
      }
    }
  }

  // Start background processing after a short delay
  setTimeout(processFileInBackground, 100)

  // Return file immediately after upload (processing happens in background)
  const fetchedFile = await getFileById(createdFile.id)
  console.log(
    `File uploaded successfully: ${createdFile.name}, processing in background`
  )

  return fetchedFile
}

// // Handle docx files
export const createDocXFile = async (
  text: string,
  file: File,
  fileRecord: TablesInsert<"files">,
  workspace_id: string,
  embeddingsProvider: "openai" | "local"
) => {
  const { data: createdFile, error } = await supabase
    .from("files")
    .insert([fileRecord])
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  await createFileWorkspace({
    user_id: createdFile.user_id,
    file_id: createdFile.id,
    workspace_id
  })

  const filePath = await uploadFile(file, {
    name: createdFile.name,
    user_id: createdFile.user_id,
    file_id: createdFile.name
  })

  await updateFile(createdFile.id, {
    file_path: filePath
  })

  const response = await fetch("/api/retrieval/process/docx", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: text,
      fileId: createdFile.id,
      embeddingsProvider,
      fileExtension: "docx"
    })
  })

  if (!response.ok) {
    const jsonText = await response.text()
    const json = JSON.parse(jsonText)
    console.error(
      `Error processing file:${createdFile.id}, status:${response.status}, response:${json.message}`
    )
    toast.error("Failed to process file. Reason:" + json.message, {
      duration: 10000
    })
    await deleteFile(createdFile.id)
  }

  const fetchedFile = await getFileById(createdFile.id)

  return fetchedFile
}

export const createFiles = async (
  files: TablesInsert<"files">[],
  workspace_id: string
) => {
  const { data: createdFiles, error } = await supabase
    .from("files")
    .insert(files)
    .select("*")

  if (error) {
    throw new Error(error.message)
  }

  await createFileWorkspaces(
    createdFiles.map(file => ({
      user_id: file.user_id,
      file_id: file.id,
      workspace_id
    }))
  )

  return createdFiles
}

export const createFileWorkspace = async (item: {
  user_id: string
  file_id: string
  workspace_id: string
}) => {
  const { data: createdFileWorkspace, error } = await supabase
    .from("file_workspaces")
    .insert([item])
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return createdFileWorkspace
}

export const createFileWorkspaces = async (
  items: { user_id: string; file_id: string; workspace_id: string }[]
) => {
  const { data: createdFileWorkspaces, error } = await supabase
    .from("file_workspaces")
    .insert(items)
    .select("*")

  if (error) throw new Error(error.message)

  return createdFileWorkspaces
}

export const updateFile = async (
  fileId: string,
  file: TablesUpdate<"files">
) => {
  const { data: updatedFile, error } = await supabase
    .from("files")
    .update(file)
    .eq("id", fileId)
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return updatedFile
}

export const deleteFile = async (fileId: string) => {
  const { error } = await supabase.from("files").delete().eq("id", fileId)

  if (error) {
    throw new Error(error.message)
  }

  return true
}

export const deleteFileWorkspace = async (
  fileId: string,
  workspaceId: string
) => {
  const { error } = await supabase
    .from("file_workspaces")
    .delete()
    .eq("file_id", fileId)
    .eq("workspace_id", workspaceId)

  if (error) throw new Error(error.message)

  return true
}
