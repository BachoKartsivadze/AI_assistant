import { ChatbotUIContext } from "@/context/context"
import { createFile } from "@/db/files"
import { createAssistantFile } from "@/db/assistant-files"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import { useContext, useEffect, useState } from "react"
import { toast } from "sonner"

export const ACCEPTED_FILE_TYPES = [
  "text/csv",
  "application/json",
  "text/markdown",
  "application/pdf",
  "text/plain"
].join(",")

export const useSelectFileHandler = () => {
  const {
    selectedWorkspace,
    profile,
    chatSettings,
    selectedAssistant,
    setNewMessageImages,
    setNewMessageFiles,
    setShowFilesDisplay,
    setFiles,
    setUseRetrieval
  } = useContext(ChatbotUIContext)

  const [filesToAccept, setFilesToAccept] = useState(ACCEPTED_FILE_TYPES)

  useEffect(() => {
    handleFilesToAccept()
  }, [chatSettings?.model])

  const handleFilesToAccept = () => {
    const model = chatSettings?.model
    const FULL_MODEL = LLM_LIST.find(llm => llm.modelId === model)

    if (!FULL_MODEL) return

    setFilesToAccept(
      FULL_MODEL.imageInput
        ? `${ACCEPTED_FILE_TYPES},image/*`
        : ACCEPTED_FILE_TYPES
    )
  }

  const handleSelectDeviceFile = async (file: File) => {
    if (!profile || !selectedWorkspace || !chatSettings) return

    setShowFilesDisplay(true)
    setUseRetrieval(true)

    if (file.type.includes("image")) {
      // Handle image files
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onloadend = async function () {
        try {
          const imageUrl = URL.createObjectURL(file)
          setNewMessageImages(prev => [
            ...prev,
            {
              messageId: "temp",
              path: "",
              base64: reader.result,
              url: imageUrl,
              file
            }
          ])
        } catch (error: any) {
          toast.error("Failed to upload image. " + error?.message, {
            duration: 10000
          })
        }
      }
    } else if (ACCEPTED_FILE_TYPES.split(",").includes(file.type)) {
      // Handle document files
      setNewMessageFiles(prev => [
        ...prev,
        {
          id: "loading",
          name: file.name,
          type: file.type.split("/")[1],
          file: file
        }
      ])

      try {
        const createdFile = await createFile(
          file,
          {
            user_id: profile.user_id,
            description: "",
            file_path: "",
            name: file.name,
            size: file.size,
            tokens: 0,
            type: file.type.split("/")[1]
          },
          selectedWorkspace.id,
          chatSettings.embeddingsProvider
        )

        // Automatically associate the uploaded file with the current assistant
        if (selectedAssistant) {
          try {
            await createAssistantFile({
              user_id: profile.user_id,
              assistant_id: selectedAssistant.id,
              file_id: createdFile.id
            })

            // Upload file to OpenAI for the assistant to use
            try {
              const response = await fetch(
                "/api/assistants/openai/upload-file",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    fileId: createdFile.id
                  })
                }
              )

              if (response.ok) {
                const uploadResult = await response.json()
                console.log(
                  "File uploaded to OpenAI successfully:",
                  uploadResult.openaiFileId
                )(
                  // Store the OpenAI file ID in the file object for later use
                  createdFile as any
                ).openai_file_id = uploadResult.openaiFileId
              } else {
                console.warn(
                  "Failed to upload file to OpenAI:",
                  await response.text()
                )
              }
            } catch (error) {
              console.warn("Failed to upload file to OpenAI:", error)
            }
          } catch (error) {
            console.warn("Failed to associate file with assistant:", error)
          }
        }

        setFiles(prev => [...prev, createdFile])

        setNewMessageFiles(prev =>
          prev.map(item =>
            item.id === "loading"
              ? {
                  id: createdFile.id,
                  name: createdFile.name,
                  type: createdFile.type,
                  file: file
                }
              : item
          )
        )
      } catch (error: any) {
        toast.error("Failed to upload. " + error?.message, {
          duration: 10000
        })
        setNewMessageFiles(prev => prev.filter(file => file.id !== "loading"))
      }
    } else {
      toast.error("Unsupported file type")
    }
  }

  return {
    handleSelectDeviceFile,
    filesToAccept
  }
}
