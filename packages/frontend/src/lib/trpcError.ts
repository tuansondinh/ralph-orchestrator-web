interface TrpcErrorCandidate {
  data?: { httpStatus?: unknown }
  message?: unknown
  shape?: { message?: unknown }
}

function getTrpcErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return ''
  }

  const candidate = error as TrpcErrorCandidate
  if (typeof candidate.message === 'string') {
    return candidate.message
  }

  if (typeof candidate.shape?.message === 'string') {
    return candidate.shape.message
  }

  return ''
}

export function isMissingTrpcProcedure(error: unknown, procedurePattern?: RegExp) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as TrpcErrorCandidate
  if (candidate.data?.httpStatus === 404) {
    return true
  }

  const message = getTrpcErrorMessage(error)
  if (message.length === 0) {
    return false
  }

  if (procedurePattern?.test(message)) {
    return true
  }

  return /no "?query"?-?procedure/i.test(message) || /not found/i.test(message)
}
