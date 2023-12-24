# GPT UI

In this example, we'll show a simple chatbot UI that uses the OpenAI API to generate chatbot responses.

## Prerequisites
- Node.js 16+

## Installation

Run the following command to install the dependencies:

```bash
npm install
```

## Development

Run the following command to compile the app:
```bash
npx babel src --out-dir dist
```

And then the following command to start the server:

```bash
OPENAI_API_KEY=<...> npx nodemon dist/index.js
```

Get your OpenAI API key here: https://platform.openai.com/account/api-keys

# Performance
Compared to OpenAI's native chat.openai.com's frontend, showing the message as shown on the video:

OpenAI
- Downloads 1.6MB of JS upfront
- ~450KB of data per message (3 code blocks + text)

Seniman
- Downloads 3KB of JS upfront & 5KB of websocket messages to set up initial UI
- ~10KB of WS data per message of same size (3 code blocks + text)
