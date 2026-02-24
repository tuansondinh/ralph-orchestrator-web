export type DiffStatus = 'M' | 'A' | 'D' | 'R'

export interface DiffFile {
  path: string
  status: DiffStatus
  diff: string
  additions: number
  deletions: number
}

function extractPath(headerLine: string) {
  const plainMatch = headerLine.match(/^a\/(.+?) b\/(.+)$/)
  if (plainMatch) {
    return plainMatch[2]?.trim()
  }

  const quotedMatch = headerLine.match(/^"a\/(.+?)" "b\/(.+)"$/)
  if (quotedMatch) {
    return quotedMatch[2]?.replace(/\\"/g, '"').trim()
  }

  return undefined
}

function detectStatus(block: string): DiffStatus {
  if (/^new file mode /m.test(block)) {
    return 'A'
  }
  if (/^deleted file mode /m.test(block)) {
    return 'D'
  }
  if (/^rename from /m.test(block) || /^rename to /m.test(block)) {
    return 'R'
  }
  return 'M'
}

function countChanges(block: string) {
  let additions = 0
  let deletions = 0

  for (const line of block.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1
    }
  }

  return { additions, deletions }
}

export function parseDiff(raw: string): DiffFile[] {
  if (!raw.trim()) {
    return []
  }

  const files: DiffFile[] = []
  const blocks = raw.split(/^diff --git /m).filter(Boolean)

  for (const block of blocks) {
    const [headerLine] = block.split('\n', 1)
    const path = extractPath(headerLine ?? '')
    if (!path) {
      continue
    }

    const { additions, deletions } = countChanges(block)

    files.push({
      path,
      status: detectStatus(block),
      diff: `diff --git ${block}`.trimEnd(),
      additions,
      deletions
    })
  }

  return files
}
