import { Tables } from "@/supabase/types"
import { ChatbotUIContext } from "@/context/context"
import { IconRobotFace, IconChevronDown } from "@tabler/icons-react"
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
  const {
    assistants,
    assistantImages,
    selectedAssistant,
    setSelectedAssistant
  } = useContext(ChatbotUIContext)

  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const handleAssistantSelect = (assistant: Tables<"assistants">) => {
    setSelectedAssistant(assistant)
    setIsOpen(false)
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
