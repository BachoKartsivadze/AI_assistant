import { supabase } from "@/lib/supabase/browser-client"
import { TablesInsert, TablesUpdate } from "@/supabase/types"

export const getHomeWorkspaceByUserId = async (userId: string) => {
  try {
    const { data: homeWorkspace, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("user_id", userId)
      .eq("is_home", true)
      .single()

    if (error) {
      console.error("Database error in getHomeWorkspaceByUserId:", error)
      throw new Error(error.message || "Failed to get home workspace")
    }

    if (!homeWorkspace) {
      throw new Error("Home workspace not found")
    }

    return homeWorkspace.id
  } catch (error) {
    console.error("Error in getHomeWorkspaceByUserId:", error)
    throw error
  }
}

export const getWorkspaceById = async (workspaceId: string) => {
  try {
    const { data: workspace, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single()

    if (error) {
      console.error("Database error in getWorkspaceById:", error)
      throw new Error(error.message || "Failed to get workspace")
    }

    if (!workspace) {
      throw new Error("Workspace not found")
    }

    return workspace
  } catch (error) {
    console.error("Error in getWorkspaceById:", error)
    throw error
  }
}

export const getWorkspacesByUserId = async (userId: string) => {
  try {
    const { data: workspaces, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Database error in getWorkspacesByUserId:", error)
      throw new Error(error.message || "Failed to get workspaces")
    }

    if (!workspaces) {
      throw new Error("No workspaces found")
    }

    return workspaces
  } catch (error) {
    console.error("Error in getWorkspacesByUserId:", error)
    throw error
  }
}

export const createWorkspace = async (
  workspace: TablesInsert<"workspaces">
) => {
  const { data: createdWorkspace, error } = await supabase
    .from("workspaces")
    .insert([workspace])
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return createdWorkspace
}

export const updateWorkspace = async (
  workspaceId: string,
  workspace: TablesUpdate<"workspaces">
) => {
  const { data: updatedWorkspace, error } = await supabase
    .from("workspaces")
    .update(workspace)
    .eq("id", workspaceId)
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return updatedWorkspace
}

export const deleteWorkspace = async (workspaceId: string) => {
  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", workspaceId)

  if (error) {
    throw new Error(error.message)
  }

  return true
}
