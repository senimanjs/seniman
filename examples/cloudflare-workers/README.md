# Seniman on Cloudflare Workers

```js
import { createRoot } from 'seniman';
import { createEntrypoint } from 'seniman-cloudflare';

export default createEntrypoint(createRoot(App));
```
