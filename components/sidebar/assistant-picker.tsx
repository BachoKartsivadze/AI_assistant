import { Tables } from "@/supabase/types"
import { ChatbotUIContext } from "@/context/context"
import { createChat } from "@/db/chats"
import { IconRobotFace, IconChevronDown } from "@tabler/icons-react"
import { useRouter } from "next/navigation"
import { FC, useContext, useState, useRef, useEffect } from "react"
import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../ui/dropdown-menu"
import Image from "next/image"

interface SidebarAssistantPickerProps {}

export const SidebarAssistantPicker: FC<SidebarAssistantPickerProps> = ({}) => {
  const router = useRouter()

  const {
    assistants,
    assistantImages,
    selectedAssistant,
    selectedWorkspace,
    setSelectedAssistant,
    setChats
  } = useContext(ChatbotUIContext)

  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const handleAssistantSelect = async (assistant: Tables<"assistants">) => {
    if (!selectedWorkspace) return

    setSelectedAssistant(assistant)
    setIsOpen(false)

    // Create a new chat with the selected assistant
    const createdChat = await createChat({
      user_id: assistant.user_id,
      workspace_id: selectedWorkspace.id,
      assistant_id: assistant.id,
      context_length: assistant.context_length,
      include_profile_context: assistant.include_profile_context,
      include_workspace_instructions: assistant.include_workspace_instructions,
      model: assistant.model,
      name: `Chat with ${assistant.name}`,
      prompt: assistant.prompt,
      temperature: assistant.temperature,
      embeddings_provider: assistant.embeddings_provider
    })

    setChats(prevState => [createdChat, ...prevState])

    // Navigate to the new chat (fetchChat will handle loading files and settings)
    return router.push(`/${selectedWorkspace.id}/chat/${createdChat.id}`)
  }

  const getAssistantImage = (assistant: Tables<"assistants">) => {
    if (assistant.image_path) {
      const assistantImage = assistantImages.find(
        image => image.path === assistant.image_path
      )
      return assistantImage?.base64 || assistantImage?.url
    }
    return null
  }

  if (!assistants || assistants.length === 0) {
    return null
  }

  return (
    <div className="mb-4">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="outline"
            className="w-full justify-between"
          >
            <div className="flex items-center space-x-2">
              {selectedAssistant ? (
                <>
                  {getAssistantImage(selectedAssistant) ? (
                    <Image
                      src={getAssistantImage(selectedAssistant)!}
                      alt={selectedAssistant.name}
                      width={20}
                      height={20}
                      className="rounded"
                    />
                  ) : (
                    <IconRobotFace size={20} />
                  )}
                  <span className="truncate">{selectedAssistant.name}</span>
                </>
              ) : (
                <>
                  <IconRobotFace size={20} />
                  <span>Select Assistant</span>
                </>
              )}
            </div>
            <IconChevronDown size={16} />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-full min-w-[200px]">
          {selectedAssistant && (
            <DropdownMenuItem
              onClick={() => {
                setSelectedAssistant(null)
                setIsOpen(false)
              }}
              className="text-muted-foreground flex cursor-pointer items-center space-x-2"
            >
              <div className="flex size-6 items-center justify-center">
                <span className="text-xs">×</span>
              </div>
              <span>Clear Selection</span>
            </DropdownMenuItem>
          )}
          {assistants.map(assistant => (
            <DropdownMenuItem
              key={assistant.id}
              onClick={() => handleAssistantSelect(assistant)}
              className="flex cursor-pointer items-center space-x-2"
            >
              {getAssistantImage(assistant) ? (
                <Image
                  src={getAssistantImage(assistant)!}
                  alt={assistant.name}
                  width={24}
                  height={24}
                  className="rounded"
                />
              ) : (
                <IconRobotFace size={24} />
              )}
              <div className="flex flex-col">
                <span className="font-medium">{assistant.name}</span>
                {assistant.description && (
                  <span className="text-muted-foreground truncate text-xs">
                    {assistant.description}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
