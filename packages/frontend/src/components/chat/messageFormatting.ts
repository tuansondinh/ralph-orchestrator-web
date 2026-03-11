interface ProjectListItem {
  id?: string
  name?: string
  path?: string
  type?: string
  ralphConfig?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toReadableJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseJson(content: string) {
  try {
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

function toProjectListItem(value: unknown): ProjectListItem | null {
  if (!isRecord(value)) {
    return null
  }

  const name = typeof value.name === 'string' ? value.name : undefined
  const path = typeof value.path === 'string' ? value.path : undefined
  const type = typeof value.type === 'string' ? value.type : undefined
  const ralphConfig = typeof value.ralphConfig === 'string' ? value.ralphConfig : undefined
  const id = typeof value.id === 'string' ? value.id : undefined

  if (!name && !path && !type && !ralphConfig && !id) {
    return null
  }

  return {
    id,
    name,
    path,
    type,
    ralphConfig
  }
}

function formatListProjectsResult(content: string) {
  const parsed = parseJson(content)
  if (!Array.isArray(parsed)) {
    return null
  }

  const projects = parsed.map(toProjectListItem).filter((value): value is ProjectListItem => value !== null)

  if (projects.length === 0) {
    return 'Tool `list_projects`\n\nNo projects found.'
  }

  const lines = [`Tool \`list_projects\``, '', `Found ${projects.length} project${projects.length === 1 ? '' : 's'}:`, '']

  for (const [index, project] of projects.entries()) {
    lines.push(`${index + 1}. **${project.name ?? 'Unnamed project'}**`)

    if (project.path) {
      lines.push(`Path: \`${project.path}\``)
    }

    if (project.type) {
      lines.push(`Type: \`${project.type}\``)
    }

    if (project.ralphConfig) {
      lines.push(`Config: \`${project.ralphConfig}\``)
    }

    if (project.id) {
      lines.push(`ID: \`${project.id}\``)
    }

    if (index < projects.length - 1) {
      lines.push('')
    }
  }

  return lines.join('\n')
}

function formatToolResult(toolName: string, content: string) {
  if (toolName === 'list_projects') {
    const formatted = formatListProjectsResult(content)
    if (formatted) {
      return formatted
    }
  }

  const parsed = parseJson(content)
  const readable = parsed === undefined ? content : toReadableJson(parsed)
  return `Tool \`${toolName}\`\n\n\`\`\`json\n${readable}\n\`\`\``
}

export function formatMessageContent(content: string, toolName?: string) {
  if (!toolName) {
    return content
  }

  return formatToolResult(toolName, content)
}
