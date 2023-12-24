import { createParser } from 'eventsource-parser';

const API_URL = 'https://api.openai.com/v1';
const decoder = new TextDecoder('utf-8');

// Acknowledgement:
// The function is ported from https://github.com/transitive-bullshit/chatgpt-api/blob/main/src/stream-async-iterable.ts
async function* streamAsyncIterable(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function API_requestCompletionStream(apiKey, messages, onDeltaArrival) {
  const body = {
    //model: "gpt-3.5-turbo",
    // use gpt4 turbo for more accurate results
    model: "gpt-4-1106-preview",

    messages,
    stream: true
  };

  const res = await fetch(`${API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Error fetching message: ${res.status} ${res.statusText}`);
  }

  const parser = createParser((event) => {
    if (event.type === 'event') {
      if (event.data === '[DONE]') {
        onDeltaArrival(event.data);
      } else {
        let delta = JSON.parse(event.data).choices[0].delta;

        if (delta.content) {
          onDeltaArrival(delta.content);
        }
      }
    }
  })

  for await (const chunk of streamAsyncIterable(res.body)) {
    const msg = decoder.decode(chunk);
    parser.feed(msg);
  }
}