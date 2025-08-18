"use client"

import { ChatbotUIContext } from "@/context/context"
import { getOrCreateProfileByUserId, updateProfile } from "@/db/profile"
import {
  getHomeWorkspaceByUserId,
  getWorkspacesByUserId
} from "@/db/workspaces"
import {
  fetchHostedModels,
  fetchOpenRouterModels
} from "@/lib/models/fetch-models"
import { supabase } from "@/lib/supabase/browser-client"
import { TablesUpdate } from "@/supabase/types"
import { useRouter } from "next/navigation"
import { useContext, useEffect, useState } from "react"
import { APIStep } from "../../../components/setup/api-step"
import { FinishStep } from "../../../components/setup/finish-step"
import { ProfileStep } from "../../../components/setup/profile-step"
import {
  SETUP_STEP_COUNT,
  StepContainer
} from "../../../components/setup/step-container"
import { toast } from "sonner"

export default function SetupPage() {
  const {
    profile,
    setProfile,
    setWorkspaces,
    setSelectedWorkspace,
    setEnvKeyMap,
    setAvailableHostedModels,
    setAvailableOpenRouterModels
  } = useContext(ChatbotUIContext)

  const router = useRouter()

  const [loading, setLoading] = useState(true)

  const [currentStep, setCurrentStep] = useState(1)

  // Profile Step
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState(profile?.username || "")
  const [usernameAvailable, setUsernameAvailable] = useState(true)

  // API Step
  const [useAzureOpenai, setUseAzureOpenai] = useState(false)
  const [openaiAPIKey, setOpenaiAPIKey] = useState("")
  const [openaiOrgID, setOpenaiOrgID] = useState("")
  const [azureOpenaiAPIKey, setAzureOpenaiAPIKey] = useState("")
  const [azureOpenaiEndpoint, setAzureOpenaiEndpoint] = useState("")
  const [azureOpenai35TurboID, setAzureOpenai35TurboID] = useState("")
  const [azureOpenai45TurboID, setAzureOpenai45TurboID] = useState("")
  const [azureOpenai45VisionID, setAzureOpenai45VisionID] = useState("")
  const [azureOpenaiEmbeddingsID, setAzureOpenaiEmbeddingsID] = useState("")
  const [anthropicAPIKey, setAnthropicAPIKey] = useState("")
  const [googleGeminiAPIKey, setGoogleGeminiAPIKey] = useState("")
  const [mistralAPIKey, setMistralAPIKey] = useState("")
  const [groqAPIKey, setGroqAPIKey] = useState("")
  const [perplexityAPIKey, setPerplexityAPIKey] = useState("")
  const [openrouterAPIKey, setOpenrouterAPIKey] = useState("")

  // Add fallback for when profile doesn't exist yet
  const [profileExists, setProfileExists] = useState(false)
  const [userIdMismatch, setUserIdMismatch] = useState(false)

  const forceSessionRefresh = async () => {
    try {
      console.log("Force refreshing session...")

      // Sign out to clear stale session
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error("Error signing out:", error)
      } else {
        console.log("Successfully signed out, redirecting to login")
        router.push("/login")
      }
    } catch (error) {
      console.error("Error in forceSessionRefresh:", error)
      // Fallback: just redirect to login
      router.push("/login")
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        console.log("Setup page: useEffect starting...")
        const session = (await supabase.auth.getSession()).data.session

        if (!session) {
          console.log("Setup page: No session found, redirecting to login")
          return router.push("/login")
        } else {
          const user = session.user
          console.log(`Setup page: User ${user.id} is authenticated`)
          console.log(`Setup page: User email: ${user.email}`)
          console.log(`Setup page: User metadata:`, user.user_metadata)

          // Check if user already has a profile
          try {
            console.log(
              `Setup page: Attempting to get/create profile for user ${user.id}`
            )
            const profile = await getOrCreateProfileByUserId(user.id)
            console.log(`Setup page: Got profile for user ${user.id}`)
            setProfile(profile)
            setUsername(profile.username)

            if (!profile.has_onboarded) {
              console.log(`Setup page: User ${user.id} needs onboarding`)
              setLoading(false)
            } else {
              console.log(
                `Setup page: User ${user.id} already onboarded, redirecting to chat`
              )
              const data = await fetchHostedModels(profile)

              if (!data) return

              setEnvKeyMap(data.envKeyMap)
              setAvailableHostedModels(data.hostedModels)

              if (
                profile["openrouter_api_key"] ||
                data.envKeyMap["openrouter"]
              ) {
                const openRouterModels = await fetchOpenRouterModels()
                if (!openRouterModels) return
                setAvailableOpenRouterModels(openRouterModels)
              }

              const homeWorkspaceId = await getHomeWorkspaceByUserId(
                session.user.id
              )
              return router.push(`/${homeWorkspaceId}/chat`)
            }
          } catch (profileError) {
            console.error(
              `Setup page: Error getting/creating profile for user ${user.id}:`,
              profileError
            )

            // Check if it's a user ID mismatch error
            if (
              profileError instanceof Error &&
              profileError.message &&
              profileError.message.includes("Authentication mismatch")
            ) {
              console.error(
                "Setup page: User ID mismatch detected - user needs to refresh session"
              )
              setLoading(false)
              setUserIdMismatch(true)
              // Don't set profileExists to true - let the fallback UI handle this
              return
            }

            // If profile creation fails, we still want to show the setup page
            // The user can manually create their profile through the UI
            setLoading(false)

            // Don't redirect to login - let them stay on setup page
            // They can try to create their profile manually
          }
        }
      } catch (error) {
        console.error("Setup page: Unexpected error:", error)
        setLoading(false)
        // Don't redirect on error - let them stay on setup page
      }
    })()
  }, [])

  const handleShouldProceed = (proceed: boolean) => {
    if (proceed) {
      if (currentStep === SETUP_STEP_COUNT) {
        handleSaveSetupSetting()
      } else {
        setCurrentStep(currentStep + 1)
      }
    } else {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSaveSetupSetting = async () => {
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) {
        return router.push("/login")
      }

      const user = session.user
      console.log(
        `handleSaveSetupSetting: Processing setup for user ${user.id}`
      )

      let profile
      try {
        profile = await getOrCreateProfileByUserId(user.id)
        console.log(`handleSaveSetupSetting: Got profile for user ${user.id}`)
      } catch (profileError) {
        console.error(
          `handleSaveSetupSetting: Error getting/creating profile for user ${user.id}:`,
          profileError
        )
        toast.error("Failed to create profile. Please try again.")
        return
      }

      if (!profile) {
        console.error(
          `handleSaveSetupSetting: No profile returned for user ${user.id}`
        )
        toast.error("No profile found. Please try again.")
        return
      }

      const updateProfilePayload: TablesUpdate<"profiles"> = {
        ...profile,
        has_onboarded: true,
        display_name: displayName,
        username,
        openai_api_key: openaiAPIKey,
        openai_organization_id: openaiOrgID,
        anthropic_api_key: anthropicAPIKey,
        google_gemini_api_key: googleGeminiAPIKey,
        mistral_api_key: mistralAPIKey,
        groq_api_key: groqAPIKey,
        perplexity_api_key: perplexityAPIKey,
        openrouter_api_key: openrouterAPIKey,
        use_azure_openai: useAzureOpenai,
        azure_openai_api_key: azureOpenaiAPIKey,
        azure_openai_endpoint: azureOpenaiEndpoint,
        azure_openai_35_turbo_id: azureOpenai35TurboID,
        azure_openai_45_turbo_id: azureOpenai45TurboID,
        azure_openai_45_vision_id: azureOpenai45VisionID,
        azure_openai_embeddings_id: azureOpenaiEmbeddingsID
      }

      console.log(
        `handleSaveSetupSetting: Updating profile for user ${user.id}`
      )
      const updatedProfile = await updateProfile(
        profile.id,
        updateProfilePayload
      )
      setProfile(updatedProfile)

      console.log(
        `handleSaveSetupSetting: Getting workspaces for user ${user.id}`
      )
      const workspaces = await getWorkspacesByUserId(profile.user_id)
      const homeWorkspace = workspaces.find(w => w.is_home)

      if (!homeWorkspace) {
        console.error(
          `handleSaveSetupSetting: No home workspace found for user ${user.id}`
        )
        toast.error("No home workspace found. Please try again.")
        return
      }

      // There will always be a home workspace
      setSelectedWorkspace(homeWorkspace)
      setWorkspaces(workspaces)

      console.log(`handleSaveSetupSetting: Redirecting user ${user.id} to chat`)
      return router.push(`/${homeWorkspace?.id}/chat`)
    } catch (error) {
      console.error("handleSaveSetupSetting: Unexpected error:", error)
      toast.error("An unexpected error occurred. Please try again.")
    }
  }

  const renderStep = (stepNum: number) => {
    switch (stepNum) {
      // Profile Step
      case 1:
        return (
          <StepContainer
            stepDescription="Let's create your profile."
            stepNum={currentStep}
            stepTitle="Welcome to Chatbot UI"
            onShouldProceed={handleShouldProceed}
            showNextButton={!!(username && usernameAvailable)}
            showBackButton={false}
          >
            <ProfileStep
              username={username}
              usernameAvailable={usernameAvailable}
              displayName={displayName}
              onUsernameAvailableChange={setUsernameAvailable}
              onUsernameChange={setUsername}
              onDisplayNameChange={setDisplayName}
            />
          </StepContainer>
        )

      // API Step
      case 2:
        return (
          <StepContainer
            stepDescription="Enter API keys for each service you'd like to use."
            stepNum={currentStep}
            stepTitle="Set API Keys (optional)"
            onShouldProceed={handleShouldProceed}
            showNextButton={true}
            showBackButton={true}
          >
            <APIStep
              openaiAPIKey={openaiAPIKey}
              openaiOrgID={openaiOrgID}
              azureOpenaiAPIKey={azureOpenaiAPIKey}
              azureOpenaiEndpoint={azureOpenaiEndpoint}
              azureOpenai35TurboID={azureOpenai35TurboID}
              azureOpenai45TurboID={azureOpenai45TurboID}
              azureOpenai45VisionID={azureOpenai45VisionID}
              azureOpenaiEmbeddingsID={azureOpenaiEmbeddingsID}
              anthropicAPIKey={anthropicAPIKey}
              googleGeminiAPIKey={googleGeminiAPIKey}
              mistralAPIKey={mistralAPIKey}
              groqAPIKey={groqAPIKey}
              perplexityAPIKey={perplexityAPIKey}
              useAzureOpenai={useAzureOpenai}
              onOpenaiAPIKeyChange={setOpenaiAPIKey}
              onOpenaiOrgIDChange={setOpenaiOrgID}
              onAzureOpenaiAPIKeyChange={setAzureOpenaiAPIKey}
              onAzureOpenaiEndpointChange={setAzureOpenaiEndpoint}
              onAzureOpenai35TurboIDChange={setAzureOpenai35TurboID}
              onAzureOpenai45TurboIDChange={setAzureOpenai45TurboID}
              onAzureOpenai45VisionIDChange={setAzureOpenai45VisionID}
              onAzureOpenaiEmbeddingsIDChange={setAzureOpenaiEmbeddingsID}
              onAnthropicAPIKeyChange={setAnthropicAPIKey}
              onGoogleGeminiAPIKeyChange={setGoogleGeminiAPIKey}
              onMistralAPIKeyChange={setMistralAPIKey}
              onGroqAPIKeyChange={setGroqAPIKey}
              onPerplexityAPIKeyChange={setPerplexityAPIKey}
              onUseAzureOpenaiChange={setUseAzureOpenai}
              openrouterAPIKey={openrouterAPIKey}
              onOpenrouterAPIKeyChange={setOpenrouterAPIKey}
            />
          </StepContainer>
        )

      // Finish Step
      case 3:
        return (
          <StepContainer
            stepDescription="You are all set up!"
            stepNum={currentStep}
            stepTitle="Setup Complete"
            onShouldProceed={handleShouldProceed}
            showNextButton={true}
            showBackButton={true}
          >
            <FinishStep displayName={displayName} />
          </StepContainer>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto size-32 animate-spin rounded-full border-b-2 border-gray-900"></div>
          <p className="mt-4 text-lg">Loading setup...</p>
        </div>
      </div>
    )
  }

  // If no profile exists yet, show a message and let the user proceed
  if (!profileExists && !profile) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="mx-auto max-w-md p-6 text-center">
          <h2 className="mb-4 text-2xl font-bold">Welcome to Chatbot UI</h2>

          {userIdMismatch ? (
            <>
              <div className="mb-4 rounded border border-yellow-400 bg-yellow-100 px-4 py-3 text-yellow-700">
                <strong>Session Issue Detected</strong>
                <p className="mt-1 text-sm">
                  Your browser has a session for a different account that no
                  longer exists. This commonly happens when you delete an
                  account and create a new one.
                </p>
              </div>
              <p className="mb-6 text-gray-600">
                To fix this, please refresh your session by signing out and
                signing back in.
              </p>
              <button
                onClick={forceSessionRefresh}
                className="w-full rounded-lg bg-yellow-600 px-6 py-3 text-white transition-colors hover:bg-yellow-700"
              >
                Refresh Session & Sign In Again
              </button>
            </>
          ) : (
            <>
              <p className="mb-6 text-gray-600">
                It looks like your profile hasn&apos;t been created yet. This
                can happen if there was an issue during account creation.
              </p>
              <p className="mb-6 text-gray-600">
                Don&apos;t worry! You can still complete your setup. Click the
                button below to continue.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => setProfileExists(true)}
                  className="w-full rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
                >
                  Continue Setup
                </button>
                <button
                  onClick={forceSessionRefresh}
                  className="w-full rounded-lg bg-gray-600 px-6 py-3 text-white transition-colors hover:bg-gray-700"
                >
                  Refresh Session (if you recently changed accounts)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      {renderStep(currentStep)}
    </div>
  )
}
