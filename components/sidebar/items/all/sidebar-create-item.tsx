import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet"
import { ChatbotUIContext } from "@/context/context"
import { createAssistantCollections } from "@/db/assistant-collections"
import { createAssistantFiles } from "@/db/assistant-files"
import { createAssistantTools } from "@/db/assistant-tools"
import { createAssistant, updateAssistant } from "@/db/assistants"
import { createChat } from "@/db/chats"
import { createCollectionFiles } from "@/db/collection-files"
import { createCollection } from "@/db/collections"
import { createFileBasedOnExtension } from "@/db/files"
import { createModel } from "@/db/models"
import { createPreset } from "@/db/presets"
import { createPrompt } from "@/db/prompts"
import {
  getAssistantImageFromStorage,
  uploadAssistantImage
} from "@/db/storage/assistant-images"
import { createTool } from "@/db/tools"
import { convertBlobToBase64 } from "@/lib/blob-to-b64"
import { Tables, TablesInsert } from "@/supabase/types"
import { ContentType } from "@/types"
import { FC, useContext, useRef, useState } from "react"
import { toast } from "sonner"

interface SidebarCreateItemProps {
  isOpen: boolean
  isTyping: boolean
  onOpenChange: (isOpen: boolean) => void
  contentType: ContentType
  renderInputs: () => JSX.Element
  createState: any
}

export const SidebarCreateItem: FC<SidebarCreateItemProps> = ({
  isOpen,
  onOpenChange,
  contentType,
  renderInputs,
  createState,
  isTyping
}) => {
  const {
    selectedWorkspace,
    selectedAssistant,
    setChats,
    setPresets,
    setPrompts,
    setFiles,
    setCollections,
    setAssistants,
    setAssistantImages,
    setTools,
    setModels
  } = useContext(ChatbotUIContext)

  const buttonRef = useRef<HTMLButtonElement>(null)

  const [creating, setCreating] = useState(false)

  const createFunctions = {
    chats: createChat,
    presets: createPreset,
    prompts: createPrompt,
    files: async (
      createState: { file: File } & TablesInsert<"files">,
      workspaceId: string
    ) => {
      if (!selectedWorkspace) return

      const { file, ...rest } = createState

      const createdFile = await createFileBasedOnExtension(
        file,
        rest,
        workspaceId,
        selectedWorkspace.embeddings_provider as "openai" | "local"
      )

      return createdFile
    },
    collections: async (
      createState: {
        image: File
        collectionFiles: TablesInsert<"collection_files">[]
      } & Tables<"collections">,
      workspaceId: string
    ) => {
      const { collectionFiles, ...rest } = createState

      const createdCollection = await createCollection(rest, workspaceId)

      const finalCollectionFiles = collectionFiles.map(collectionFile => ({
        ...collectionFile,
        collection_id: createdCollection.id
      }))

      await createCollectionFiles(finalCollectionFiles)

      return createdCollection
    },
    assistants: async (
      createState: {
        image: File
        files: Tables<"files">[]
        collections: Tables<"collections">[]
        tools: Tables<"tools">[]
      } & Tables<"assistants">,
      workspaceId: string
    ) => {
      const { image, files, collections, tools, ...rest } = createState

      const createdAssistant = await createAssistant(rest, workspaceId)

      let updatedAssistant = createdAssistant

      if (image) {
        const filePath = await uploadAssistantImage(createdAssistant, image)

        updatedAssistant = await updateAssistant(createdAssistant.id, {
          image_path: filePath
        })

        const url = (await getAssistantImageFromStorage(filePath)) || ""

        if (url) {
          const response = await fetch(url)
          const blob = await response.blob()
          const base64 = await convertBlobToBase64(blob)

          setAssistantImages(prev => [
            ...prev,
            {
              assistantId: updatedAssistant.id,
              path: filePath,
              base64,
              url
            }
          ])
        }
      }

      const assistantFiles = files.map(file => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        file_id: file.id
      }))

      const assistantCollections = collections.map(collection => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        collection_id: collection.id
      }))

      const assistantTools = tools.map(tool => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        tool_id: tool.id
      }))

      await createAssistantFiles(assistantFiles)
      await createAssistantCollections(assistantCollections)
      await createAssistantTools(assistantTools)

      return updatedAssistant
    },
    tools: createTool,
    models: createModel
  }

  const stateUpdateFunctions = {
    chats: setChats,
    presets: setPresets,
    prompts: setPrompts,
    files: setFiles,
    collections: setCollections,
    assistants: setAssistants,
    tools: setTools,
    models: setModels
  }

  const handleCreate = async () => {
    try {
      if (!selectedWorkspace) return
      if (isTyping) return // Prevent creation while typing

      const createFunction = createFunctions[contentType]
      const setStateFunction = stateUpdateFunctions[contentType]

      if (!createFunction || !setStateFunction) return

      setCreating(true)

      const newItem = await createFunction(createState, selectedWorkspace.id)

      // If this is a file and we have a selected assistant, also upload to OpenAI
      if (contentType === "files" && selectedAssistant && newItem) {
        console.log("🚀 Starting OpenAI integration for file:", newItem.name)
        console.log("📁 File ID:", newItem.id)
        console.log("🤖 Assistant ID:", selectedAssistant.id)

        try {
          // Associate file with assistant
          console.log("🔗 Associating file with assistant...")
          await createAssistantFiles([
            {
              user_id: newItem.user_id,
              assistant_id: selectedAssistant.id,
              file_id: newItem.id
            }
          ])
          console.log("✅ File associated with assistant successfully")

          // Upload file to OpenAI
          console.log("📤 Uploading file to OpenAI...")
          const response = await fetch("/api/assistants/openai/upload-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: newItem.id })
          })

          if (response.ok) {
            const uploadResult = await response.json()
            console.log(
              "🎉 File uploaded to OpenAI successfully:",
              uploadResult.openaiFileId
            )
            toast.success(
              "File uploaded to OpenAI and associated with assistant"
            )
          } else {
            const errorText = await response.text()
            console.warn(
              "❌ Failed to upload file to OpenAI:",
              response.status,
              errorText
            )
            toast.warning("File created but OpenAI upload failed")
          }
        } catch (error) {
          console.error("💥 Failed to integrate file with OpenAI:", error)
          toast.warning("File created but OpenAI integration failed")
        }
      } else {
        console.log("ℹ️ OpenAI integration skipped:", {
          contentType,
          hasSelectedAssistant: !!selectedAssistant,
          hasNewItem: !!newItem
        })
      }

      setStateFunction((prevItems: any) => [...prevItems, newItem])

      onOpenChange(false)
      setCreating(false)
    } catch (error) {
      toast.error(`Error creating ${contentType.slice(0, -1)}. ${error}.`)
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isTyping && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      buttonRef.current?.click()
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex min-w-[450px] flex-col justify-between overflow-auto"
        side="left"
        onKeyDown={handleKeyDown}
      >
        <div className="grow overflow-auto">
          <SheetHeader>
            <SheetTitle className="text-2xl font-bold">
              Create{" "}
              {contentType.charAt(0).toUpperCase() + contentType.slice(1, -1)}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">{renderInputs()}</div>
        </div>

        <SheetFooter className="mt-2 flex justify-between">
          <div className="flex grow justify-end space-x-2">
            <Button
              disabled={creating}
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            <Button disabled={creating} ref={buttonRef} onClick={handleCreate}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
