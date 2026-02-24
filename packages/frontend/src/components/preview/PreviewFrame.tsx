interface PreviewFrameProps {
  url: string
  onLoad?: () => void
  onError?: () => void
}

export function PreviewFrame({ url, onLoad, onError }: PreviewFrameProps) {
  return (
    <iframe
      className="h-[68vh] w-full rounded-lg border border-zinc-800 bg-zinc-950"
      data-testid="preview-frame"
      onError={onError}
      onLoad={onLoad}
      src={url}
      title="Live preview"
    />
  )
}
