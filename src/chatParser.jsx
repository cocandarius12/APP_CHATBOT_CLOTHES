export function buildOrderStateFromConversation(conversationSlice) {
  const order = { products: [] };
  for (const message of conversationSlice) {
    if (message.role === 'assistant') {
      try {
        const parsed = JSON.parse(message.content);
        if (Array.isArray(parsed.products)) {
          order.products.push(...parsed.products);
        }
      } catch (e) {
        // ignore non-json assistant messages
      }
    }
  }
  return order;
}
