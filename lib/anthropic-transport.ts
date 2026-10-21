/** Translate the shared room-analysis request to Anthropic's Messages API. */
export function anthropicTransport(fetcher: typeof fetch, key: string, model: string): typeof fetch {
  return async (_url, init) => {
    const input = JSON.parse(String(init?.body));
    const response = await fetcher('https://api.anthropic.com/v1/messages', {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: input.max_output_tokens, system: input.instructions,
        messages: [{ role: 'user', content: input.input[0].content.map((part: { type: string; text?: string; image_url?: string }) => part.type === 'input_image'
          ? { type: 'image', source: { type: 'base64', media_type: part.image_url!.split(';')[0].slice(5), data: part.image_url!.split(',')[1] } }
          : { type: 'text', text: part.text }) }],
        output_config: { format: { type: 'json_schema', schema: input.text.format.schema } },
      }),
    });
    return response;
  };
}
