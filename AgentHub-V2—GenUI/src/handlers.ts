/**
 * Submit a user's GenUI interaction back to the server.
 */
export async function submitUiInput(
  conversationId: string,
  componentId: string,
  value: unknown,
): Promise<void> {
  try {
    const response = await fetch('/api/agents/ui-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, componentId, value }),
    });
    if (!response.ok) {
      console.warn(
        `submitUiInput failed: ${response.status} ${response.statusText}`,
      );
    }
  } catch (err) {
    console.warn('submitUiInput network error:', err);
  }
}

/**
 * Optional React hook — returns a stable submitUiInput reference.
 * Does not manage any local state; simply wraps the raw function
 * for convenience in component context.
 */
export function useGenUiSubmit() {
  return { submitUiInput };
}
