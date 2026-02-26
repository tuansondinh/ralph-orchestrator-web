interface SaveSettingsActionProps {
  isSaving: boolean
  onSave: () => void | Promise<void>
  saveMessage: string | null
  errorMessage: string | null
}

export function SaveSettingsAction({
  isSaving,
  onSave,
  saveMessage,
  errorMessage
}: SaveSettingsActionProps) {
  return (
    <>
      <button
        className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        onClick={() => void onSave()}
        type="button"
      >
        Save settings
      </button>
      {saveMessage ? <p className="text-sm text-emerald-300">{saveMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
    </>
  )
}
