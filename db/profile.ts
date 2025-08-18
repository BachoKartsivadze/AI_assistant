import { supabase } from "@/lib/supabase/browser-client"
import { TablesInsert, TablesUpdate } from "@/supabase/types"

export const getProfileByUserId = async (userId: string) => {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single()

    if (error) {
      console.error("Database error in getProfileByUserId:", error)
      throw new Error(error.message || "Failed to get profile")
    }

    if (!profile) {
      throw new Error("Profile not found")
    }

    return profile
  } catch (error) {
    console.error("Error in getProfileByUserId:", error)
    throw error
  }
}

export const checkProfileExists = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .limit(1)

    if (error) {
      console.error("Error checking if profile exists:", error)
      return false
    }

    return data && data.length > 0
  } catch (error) {
    console.error("Error in checkProfileExists:", error)
    return false
  }
}

export const debugAuthenticationStatus = async (requestedUserId: string) => {
  console.log(
    `debugAuthenticationStatus: Checking auth for requested userId: ${requestedUserId}`
  )

  try {
    // Check current authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError) {
      console.error("debugAuthenticationStatus: Auth error:", authError)
      return { authenticated: false, error: authError.message }
    }

    if (!user) {
      console.log("debugAuthenticationStatus: No authenticated user")
      return { authenticated: false, error: "No authenticated user" }
    }

    console.log(`debugAuthenticationStatus: Authenticated as user: ${user.id}`)
    console.log(`debugAuthenticationStatus: User email: ${user.email}`)
    console.log(`debugAuthenticationStatus: User metadata:`, user.user_metadata)

    // Check if the requested user ID matches the authenticated user ID
    if (user.id !== requestedUserId) {
      console.error(
        `debugAuthenticationStatus: USER ID MISMATCH! Requested: ${requestedUserId}, Authenticated: ${user.id}`
      )
      return {
        authenticated: true,
        userId: user.id,
        requestedUserId: requestedUserId,
        mismatch: true
      }
    }

    console.log(`debugAuthenticationStatus: User ID match confirmed`)
    return {
      authenticated: true,
      userId: user.id,
      requestedUserId: requestedUserId,
      mismatch: false
    }
  } catch (error) {
    console.error("debugAuthenticationStatus: Unexpected error:", error)
    return {
      authenticated: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export const getOrCreateProfileByUserId = async (userId: string) => {
  console.log(`getOrCreateProfileByUserId called with userId: ${userId}`)

  // First, check authentication status to identify any mismatches
  const authStatus = await debugAuthenticationStatus(userId)
  if (authStatus.mismatch) {
    console.error(
      `CRITICAL: User ID mismatch detected! Requested: ${userId}, Authenticated: ${authStatus.userId}`
    )
    throw new Error(
      `Authentication mismatch: You are authenticated as user ${authStatus.userId} but trying to access profile for user ${userId}. This suggests a session or authentication issue.`
    )
  }

  if (!authStatus.authenticated) {
    throw new Error(`Authentication failed: ${authStatus.error}`)
  }

  console.log(`Authentication confirmed for user ${userId}`)

  // Since there's a database trigger that automatically creates profiles,
  // we just need to wait for it to complete and retry a few times
  const maxRetries = 3
  const retryDelay = 1000 // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `Attempt ${attempt}: Checking if profile exists for user ${userId}`
      )

      // First check if profile exists without using .single()
      const profileExists = await checkProfileExists(userId)

      if (!profileExists) {
        if (attempt < maxRetries) {
          console.log(
            `Profile not found for user ${userId}, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`
          )
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          continue
        } else {
          console.error(
            `Profile not found for user ${userId} after ${maxRetries} retries. The database trigger may have failed.`
          )

          // Let's check what users actually exist in the database
          console.log(`Checking what users exist in the database...`)
          const { data: allProfiles, error: listError } = await supabase
            .from("profiles")
            .select("user_id, username, created_at")
            .limit(10)

          if (listError) {
            console.error("Error listing profiles:", listError)
          } else {
            console.log("Existing profiles in database:", allProfiles)
          }

          // Also check what workspaces exist
          const { data: allWorkspaces, error: workspaceListError } =
            await supabase
              .from("workspaces")
              .select("user_id, name, is_home, created_at")
              .limit(10)

          if (workspaceListError) {
            console.error("Error listing workspaces:", workspaceListError)
          } else {
            console.log("Existing workspaces in database:", allWorkspaces)
          }

          // Try to manually create the profile since the trigger failed
          console.log(
            `Attempting to manually create profile for user ${userId}`
          )
          try {
            const manualProfile = await createProfileManually(userId)
            return manualProfile
          } catch (createError) {
            console.error("Failed to manually create profile:", createError)
            throw new Error(
              `Profile not found for user ${userId}. The database trigger failed and manual creation also failed. Please try logging in again or contact support if the problem persists.`
            )
          }
        }
      }

      // Now get the full profile
      console.log(
        `Profile exists for user ${userId}, retrieving full profile...`
      )
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single()

      if (error) {
        console.error("Database error in getOrCreateProfileByUserId:", error)
        throw new Error(error.message || "Failed to get profile")
      }

      if (!profile) {
        throw new Error("Profile not found")
      }

      console.log(`Successfully retrieved profile for user ${userId}:`, profile)
      return profile
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(
          "Error in getOrCreateProfileByUserId after all retries:",
          error
        )
        throw error
      }
      // For other errors, wait and retry
      await new Promise(resolve => setTimeout(resolve, retryDelay))
    }
  }

  throw new Error("Unexpected error in getOrCreateProfileByUserId")
}

export const createProfileManually = async (userId: string) => {
  try {
    console.log(`Starting manual profile creation for user ${userId}`)

    // First, check if the user is authenticated
    console.log(`Checking authentication for user ${userId}...`)
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError) {
      console.error("Authentication error:", authError)
      throw new Error(`Authentication failed: ${authError.message}`)
    }

    if (!user) {
      throw new Error("No authenticated user found")
    }

    if (user.id !== userId) {
      throw new Error(
        `User ID mismatch: authenticated as ${user.id}, trying to create profile for ${userId}`
      )
    }

    console.log(`User ${userId} is properly authenticated`)

    // Generate a unique username that meets the requirements (3-25 characters)
    let username = `user_${userId.slice(0, 8)}`
    let attempt = 0
    const maxAttempts = 10

    // Check if username already exists and generate a new one if needed
    while (attempt < maxAttempts) {
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .limit(1)

      if (checkError) {
        console.error("Error checking username availability:", checkError)
        break
      }

      if (!existingUser || existingUser.length === 0) {
        // Username is available
        break
      }

      // Username exists, generate a new one
      attempt++
      username = `user_${userId.slice(0, 8)}_${attempt}`

      // Ensure username doesn't exceed 25 characters
      if (username.length > 25) {
        username = `u_${userId.slice(0, 6)}_${attempt}`
      }
    }

    console.log(`Generated username: ${username}`)

    // Create a profile with all required fields, including newer ones that might be missing from the trigger
    const defaultProfile: TablesInsert<"profiles"> = {
      user_id: userId,
      username: username,
      display_name: "New User",
      bio: "Welcome! I'm a new user.",
      image_url: "",
      image_path: "",
      profile_context: "New user profile",
      use_azure_openai: false,
      has_onboarded: false,
      // Include all the newer fields that might be missing from the trigger
      groq_api_key: null,
      azure_openai_embeddings_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    console.log(
      `Attempting to insert profile with data:`,
      JSON.stringify(defaultProfile, null, 2)
    )

    // First, let's check if we can even query the profiles table
    console.log(`Checking if we can query the profiles table...`)
    const { data: testQuery, error: testError } = await supabase
      .from("profiles")
      .select("id")
      .limit(1)

    if (testError) {
      console.error("Cannot even query profiles table:", testError)
      throw new Error(`Database permission error: ${testError.message}`)
    }
    console.log("Successfully queried profiles table")

    // Now try to insert the profile
    const { data: newProfile, error: createError } = await supabase
      .from("profiles")
      .insert([defaultProfile])
      .select("*")
      .single()

    if (createError) {
      console.error("Error manually creating profile:", createError)
      console.error("Error details:", {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint
      })

      // Check if it's a permission issue
      if (createError.code === "42501") {
        throw new Error(
          `Permission denied: You don't have permission to create profiles. This might be a Row Level Security (RLS) issue.`
        )
      }

      // Check if it's a constraint violation
      if (createError.code === "23514") {
        throw new Error(
          `Constraint violation: ${createError.message}. This might be due to missing required fields.`
        )
      }

      // Check if it's a unique constraint violation
      if (createError.code === "23505") {
        throw new Error(
          `Unique constraint violation: ${createError.message}. This might be due to duplicate username.`
        )
      }

      throw new Error(
        `Failed to manually create profile: ${createError.message}`
      )
    }

    console.log(
      `Successfully manually created profile for user ${userId}:`,
      newProfile
    )

    // Also create a home workspace since the trigger failed
    try {
      console.log(`Attempting to create home workspace for user ${userId}`)

      const workspaceData = {
        user_id: userId,
        is_home: true,
        name: "Home",
        default_context_length: 4096,
        default_model: "gpt-4-turbo-preview",
        default_prompt: "You are a friendly, helpful AI assistant.",
        default_temperature: 0.5,
        description: "My home workspace.",
        embeddings_provider: "openai",
        include_profile_context: true,
        include_workspace_instructions: true,
        instructions: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      console.log(`Workspace data:`, JSON.stringify(workspaceData, null, 2))

      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .insert([workspaceData])
        .select("*")
        .single()

      if (workspaceError) {
        console.error("Error creating home workspace:", workspaceError)
        console.error("Workspace error details:", {
          code: workspaceError.code,
          message: workspaceError.message,
          details: workspaceError.details,
          hint: workspaceError.hint
        })
        // Don't fail the profile creation if workspace creation fails
        console.log(
          "Profile created but workspace creation failed - user can still proceed"
        )
      } else {
        console.log(`Successfully created home workspace for user ${userId}`)
      }
    } catch (workspaceError) {
      console.error("Error in workspace creation:", workspaceError)
      // Don't fail the profile creation if workspace creation fails
      console.log(
        "Profile created but workspace creation failed - user can still proceed"
      )
    }

    return newProfile
  } catch (error) {
    console.error("Error in createProfileManually:", error)
    throw error
  }
}

export const getProfilesByUserId = async (userId: string) => {
  try {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)

    if (error) {
      console.error("Database error in getProfilesByUserId:", error)
      throw new Error(error.message || "Failed to get profiles")
    }

    if (!profiles) {
      throw new Error("No profiles found")
    }

    return profiles
  } catch (error) {
    console.error("Error in getProfilesByUserId:", error)
    throw error
  }
}

export const createProfile = async (profile: TablesInsert<"profiles">) => {
  const { data: createdProfile, error } = await supabase
    .from("profiles")
    .insert([profile])
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return createdProfile
}

export const updateProfile = async (
  profileId: string,
  profile: TablesUpdate<"profiles">
) => {
  const { data: updatedProfile, error } = await supabase
    .from("profiles")
    .update(profile)
    .eq("id", profileId)
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return updatedProfile
}

export const deleteProfile = async (profileId: string) => {
  const { error } = await supabase.from("profiles").delete().eq("id", profileId)

  if (error) {
    throw new Error(error.message)
  }

  return true
}
