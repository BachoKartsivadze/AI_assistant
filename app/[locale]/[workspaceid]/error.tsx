"use client"

import { useEffect } from "react"

export default function WorkspaceError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center">
        <h2 className="mb-4 text-2xl font-bold">Workspace Error</h2>
        <p className="mb-4 text-gray-600">
          {error.message || "An error occurred while loading the workspace"}
        </p>
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => reset()}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
