# cookinUp

DubHacks 2026

Every AI agent is a chef. Type an order; the Head Chef breaks it into stations, Line Cooks walk in and work them in parallel, and the Expediter plates the final dish. The kitchen is a pixel-art game view (in the spirit of [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents)): chefs walk to their stoves, cook with steam rising, run plates to the pass, and bubble when they are waiting or burnt a dish. Click any chef to step in: give them a note, hand the station to a different model, move ingredients (token budget) between stations, or pull them off. The bill runs in the toolbar.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: dev keys for the terminal cook
npm run dev                  # http://localhost:3000
```

In the app, paste your Anthropic and/or OpenAI API keys in the 🔑 dialog. They stay in your browser's local storage, are sent only when you place an order, and the server holds them in memory for that service and never logs or stores them. Subscriptions (ChatGPT Plus, Claude Pro) do not work: these are per-use API keys.

Cook from the terminal, no UI:

```bash
npm run cook -- "Build a landing page for a bakery"
```

## How it works

```
src/lib/brigade/
  models.ts     the chefs you can hire, with prices for the bill
  schemas.ts    zod schemas: menu, station output, plating; runtime state types
  prompts.ts    Head Chef, Line Cook, Expediter prompts
  engine.ts     plan() / runStation() / merge(), JSON-validated, usage counted
  service.ts    one order: scheduler, rerun (station + descendants), budget rebalance, stop, replate
  providers.ts  BYO keys, which models are hireable, per-provider effort knobs
  registry.ts   live services in memory
  client.ts     browser helpers: keys, order, SSE feed, station actions
src/app/api/service/              POST: order in
src/app/api/service/[id]/events   GET: SSE, the whole state on every change
src/app/api/service/[id]/station  POST: rerun / budget / stop / replate
src/pixel/
  sprites.ts    pixel art as text: chef frames, speech bubbles, palette, sprite baking
  draw.ts       furniture and floor drawn as pixel rectangles
  world.ts      the tile map: station slots, blocking tiles, BFS paths
  engine.ts     the game: chefs walk, cook, carry plates, bubble; drawn each frame
src/components/kitchen/
  PixelKitchen.tsx  the canvas (integer-scaled, crisp), hit testing, labels
  Kitchen.tsx       toolbar, kitchen, and the drawer for a picked station or the pass
  ChefCard.tsx      a station's details and every way to step in
  NeedsYou.tsx      red tickets, dishes sent back, the final plate
```

The pixel art is drawn in code (no third-party asset packs): a chef frame is sixteen strings of sixteen characters mapped to a palette, so a new pose is a few lines of text.
